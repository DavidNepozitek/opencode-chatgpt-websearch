// Adapted from emilsvennesson/opencode-websearch; see LICENSE.md.
import type { WebSearch } from "@opencode/plugin";
import { readServerSentEvents } from "./sse.ts";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ChatGPT search returned malformed stream data");
  }
  return value as JsonObject;
}

function objects(value: unknown): JsonObject[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("ChatGPT search returned malformed stream data");
  return value.map(object);
}

function sourceURL(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch {
    return;
  }
}

export async function readSearchStream(
  response: Response,
  signal: AbortSignal,
): Promise<readonly WebSearch.Result[]> {
  const hits = new Map<string, WebSearch.Result>();
  let text = "";
  let completed = false;
  let searched = false;

  function addSource(source: JsonObject): void {
    const url = sourceURL(source.url);
    if (!url) return;
    const existing = hits.get(url);
    const title =
      typeof source.title === "string" && source.title.trim()
        ? source.title
        : (existing?.title ?? url);
    hits.set(url, { url, title, time: {} });
  }

  function outputItem(item: JsonObject): void {
    if (item.type === "web_search_call") {
      if (item.status === "failed" || item.status === "incomplete")
        throw new Error("ChatGPT web search did not succeed");
      searched = true;
      if (item.action !== undefined) {
        for (const source of objects(object(item.action).sources)) addSource(source);
      }
    }
    if (item.type === "message") {
      for (const part of objects(item.content)) {
        for (const annotation of objects(part.annotations)) {
          if (annotation.type === "url_citation") addSource(annotation);
        }
      }
    }
  }

  for await (const event of readServerSentEvents(response, signal)) {
    if (event.data === "[DONE]") continue;
    let payload: JsonObject;
    try {
      const parsed: unknown = JSON.parse(event.data);
      payload = object(parsed);
    } catch {
      throw new Error("ChatGPT search returned malformed stream data");
    }
    const type = event.type || payload.type;
    if (type === "error" || type === "response.failed" || type === "response.incomplete") {
      throw new Error(`ChatGPT search failed (${type})`);
    }
    if (completed) throw new Error("ChatGPT search emitted data after completion");
    if (type === "response.output_text.delta") {
      if (typeof payload.delta !== "string")
        throw new Error("ChatGPT search returned malformed stream data");
      text += payload.delta;
    }
    if (type === "response.output_item.done") outputItem(object(payload.item));
    if (type === "response.output_text.annotation.added") {
      const annotation = object(payload.annotation);
      if (annotation.type === "url_citation") addSource(annotation);
    }
    if (type === "response.completed") {
      const final = object(payload.response);
      if (final.status !== "completed")
        throw new Error("ChatGPT search did not complete successfully");
      completed = true;
      const output = objects(final.output);
      output.forEach(outputItem);
      const finalText = output
        .filter((item) => item.type === "message")
        .flatMap((item) => objects(item.content))
        .filter((part) => part.type === "output_text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n");
      if (finalText) text = finalText;
    }
  }
  if (!completed) throw new Error("ChatGPT search stream ended before completion");
  if (!searched) throw new Error("ChatGPT did not perform a web search");
  const results = [...hits.values()];
  if (text.trim()) {
    results.unshift({
      url: "https://chatgpt.com/",
      title: "ChatGPT search summary (synthesized)",
      content: text.trim(),
      time: {},
    });
  }
  return results;
}
