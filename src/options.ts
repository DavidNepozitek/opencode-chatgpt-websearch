export interface SearchOptions {
  readonly model: string;
  readonly timeout: number;
  readonly selectDefault: boolean;
}

export function parseOptions(options: Readonly<Record<string, unknown>>): SearchOptions {
  const model = options.model === undefined ? "gpt-6-luna" : options.model;
  const timeout = options.timeout === undefined ? 120_000 : options.timeout;
  if (typeof model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(model)) {
    throw new Error("ChatGPT websearch: model must be a valid backend model ID");
  }
  if (
    typeof timeout !== "number" ||
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > 300_000
  ) {
    throw new Error("ChatGPT websearch: timeout must be 1–300000 milliseconds");
  }
  if (options.default !== undefined && typeof options.default !== "boolean") {
    throw new Error("ChatGPT websearch: default must be a boolean");
  }
  return { model, timeout, selectDefault: options.default === true };
}
