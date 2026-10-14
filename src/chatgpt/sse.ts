const MAX_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_EVENT_CHARACTERS = 1024 * 1024;

interface ServerSentEvent {
  readonly type: string | undefined;
  readonly data: string;
}

function parseEvent(lines: readonly string[]): ServerSentEvent | undefined {
  const data: string[] = [];
  let type: string | undefined;
  for (const line of lines) {
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") type = value;
    if (field === "data") data.push(value);
  }
  return data.length ? { type, data: data.join("\n") } : undefined;
}

export async function* readServerSentEvents(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<ServerSentEvent> {
  if (!response.body) throw new Error("ChatGPT search returned an empty response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let scanPosition = 0;
  let lines: string[] = [];
  let eventCharacters = 0;
  let bytes = 0;

  function* consume(eof: boolean): Generator<ServerSentEvent> {
    const delimiter = /\r\n|\r|\n/g;
    while (buffer.length) {
      delimiter.lastIndex = scanPosition;
      const match = delimiter.exec(buffer);
      if (!match) {
        scanPosition = buffer.length;
        break;
      }
      if (!eof && match[0] === "\r" && match.index === buffer.length - 1) {
        scanPosition = match.index;
        break;
      }
      const line = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      scanPosition = 0;
      eventCharacters += line.length;
      if (eventCharacters > MAX_EVENT_CHARACTERS)
        throw new Error("ChatGPT search event exceeded 1 MiB");
      if (line) lines.push(line);
      else {
        const event = parseEvent(lines);
        lines = [];
        eventCharacters = 0;
        if (event) yield event;
      }
    }
    if (eventCharacters + buffer.length > MAX_EVENT_CHARACTERS)
      throw new Error("ChatGPT search event exceeded 1 MiB");
    if (eof) {
      if (buffer) lines.push(buffer);
      const event = parseEvent(lines);
      if (event) yield event;
    }
  }

  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_STREAM_BYTES) throw new Error("ChatGPT search response exceeded 8 MiB");
      buffer += decoder.decode(value, { stream: true });
      yield* consume(false);
    }
    buffer += decoder.decode();
    yield* consume(true);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
