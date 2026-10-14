import assert from "node:assert/strict";
import type { WebSearch } from "@opencode/plugin";
import { executeSearch } from "../../src/chatgpt/client.ts";
import type { SearchFetch, SearchRequest } from "../../src/chatgpt/client.ts";

export const credential = {
  type: "oauth",
  methodID: "chatgpt-browser",
  access: "test-access-token",
  metadata: { accountID: "test-account" },
} as const;

export const summary = "A sourced answer with café 🌍.";
export const annotation = {
  type: "url_citation",
  url: "https://example.com/doc",
  title: "Documentation",
};
export const sources = {
  type: "web_search_call",
  action: {
    type: "search",
    sources: [
      { url: "https://example.com/doc" },
      { url: "https://example.com/doc" },
      { url: "https://example.org/second", title: "Second source" },
      { url: "javascript:alert(1)" },
      { url: "file:///etc/passwd" },
      { url: "https://private:password@example.com/" },
      { url: "not a URL" },
    ],
  },
};
export const message = {
  type: "message",
  content: [{ type: "output_text", text: summary, annotations: [annotation] }],
};

export function event(
  type: string,
  payload: Record<string, unknown>,
  eol = "\n",
  withEvent = true,
): string {
  return `${withEvent ? `event: ${type}${eol}` : ""}data: ${JSON.stringify({ type, ...payload })}${eol}${eol}`;
}

export function completed(output: readonly unknown[] = []): string {
  return event("response.completed", { response: { status: "completed", output } });
}

export function fixture(eol = "\n", withEvent = true): string {
  return [
    event("response.output_text.delta", { delta: "A partial answer" }, eol, withEvent),
    event("response.output_item.done", { item: sources }, eol, withEvent),
    event("response.output_item.done", { item: message }, eol, withEvent),
    event(
      "response.completed",
      { response: { status: "completed", output: [sources, message] } },
      eol,
      withEvent,
    ),
    `data: [DONE]${eol}${eol}`,
  ].join("");
}

export function streamed(text: string, chunkSize = 7, status = 200): Response {
  const bytes = new TextEncoder().encode(text);
  let position = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (position === bytes.length) return controller.close();
        controller.enqueue(bytes.slice(position, position + chunkSize));
        position = Math.min(position + chunkSize, bytes.length);
      },
    }),
    { status, headers: { "Content-Type": "text/event-stream" } },
  );
}

export function resultAt(results: readonly WebSearch.Result[], index: number): WebSearch.Result {
  const result = results[index];
  assert.ok(result);
  return result;
}

export function request(fetcher: SearchFetch, overrides: Partial<SearchRequest> = {}) {
  return executeSearch(
    {
      credential,
      model: "test-model",
      query: "Zephyr next LTS",
      signal: new AbortController().signal,
      timeout: 1000,
      ...overrides,
    },
    fetcher,
  );
}
