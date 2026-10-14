import assert from "node:assert/strict";
import { test } from "node:test";
import { readSearchStream } from "../src/chatgpt/stream.ts";
import {
  annotation,
  completed,
  event,
  fixture,
  message,
  resultAt,
  sources,
  streamed,
  summary,
} from "./helpers/fixtures.ts";

const parse = (text: string, chunkSize?: number) =>
  readSearchStream(streamed(text, chunkSize), new AbortController().signal);

for (const eol of ["\n", "\r\n", "\r"]) {
  test(`SSE handles ${JSON.stringify(eol)}, byte-split UTF-8, deduplication, and final text`, async () => {
    assert.deepEqual(await parse(fixture(eol), 1), [
      {
        url: "https://chatgpt.com/",
        title: "ChatGPT search summary (synthesized)",
        content: summary,
        time: {},
      },
      { url: "https://example.com/doc", title: "Documentation", time: {} },
      { url: "https://example.org/second", title: "Second source", time: {} },
    ]);
  });
}

test("data-only events, heartbeat comments, and EOF without a newline", async () => {
  const text = `: heartbeat\n\n${fixture("\n", false)
    .replace(/data: \[DONE\]\n\n$/, "")
    .trimEnd()}`;
  assert.equal(resultAt(await parse(text), 0).content, summary);
});

test("multiline data uses SSE newline semantics", async () => {
  const text = `event: response.completed\ndata: {"response":\ndata: {"status":"completed","output":${JSON.stringify([sources, message])}}}\n\n`;
  assert.equal(resultAt(await parse(text), 1).title, "Documentation");
});

test("completed output alone supplies text and citations", async () => {
  const results = await parse(completed([sources, message]));
  assert.equal(resultAt(results, 0).content, summary);
  assert.equal(results.length, 3);
});

test("incremental annotations and text survive completion without output items", async () => {
  const results = await parse(
    event("response.output_item.done", { item: { type: "web_search_call" } }) +
      event("response.output_text.delta", { delta: "Summary" }) +
      event("response.output_text.annotation.added", { annotation }) +
      completed(),
  );
  assert.equal(resultAt(results, 0).content, "Summary");
  assert.equal(resultAt(results, 1).title, "Documentation");
});

test("search with no text returns only actual sources", async () => {
  const results = await parse(completed([sources]));
  assert.equal(results.length, 2);
  assert.equal(resultAt(results, 0).url, "https://example.com/doc");
  assert.equal(resultAt(results, 0).content, undefined);
});

test("rejects unsearched model answers", async () => {
  await assert.rejects(parse(completed([message])), /did not perform/);
});

test("rejects truncated and malformed streams", async () => {
  await assert.rejects(
    parse(event("response.output_item.done", { item: sources })),
    /before completion/,
  );
  await assert.rejects(parse("event: response.completed\ndata: not JSON\n\n"), /malformed/);
  await assert.rejects(
    readSearchStream(new Response(null), new AbortController().signal),
    /empty response/,
  );
});

for (const type of ["error", "response.failed", "response.incomplete"]) {
  test(`rejects ${type} without exposing backend errors or partial results`, async () => {
    await assert.rejects(
      parse(
        event("response.output_item.done", { item: sources }) +
          event(type, { error: { message: "PRIVATE" } }),
      ),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(type) &&
        !error.message.includes("PRIVATE"),
    );
  });
}

test("requires an explicit successful terminal status", async () => {
  for (const status of ["incomplete", "failed", undefined, 42]) {
    await assert.rejects(
      parse(event("response.completed", { response: { status } })),
      /successfully/,
    );
  }
});

test("rejects failed web-search tool calls", async () => {
  await assert.rejects(
    parse(completed([{ type: "web_search_call", status: "failed" }, message])),
    /did not succeed/,
  );
});

test("validates untrusted JSON shapes rather than assuming TypeScript types", async () => {
  for (const payload of [null, [], "PRIVATE", 42]) {
    await assert.rejects(parse(`data: ${JSON.stringify(payload)}\n\n`), /malformed/);
  }
  for (const item of [
    null,
    { type: "web_search_call", action: { sources: "PRIVATE" } },
    { type: "message", content: {} },
  ]) {
    await assert.rejects(parse(event("response.output_item.done", { item })), /malformed/);
  }
  await assert.rejects(parse(event("response.output_text.delta", { delta: {} })), /malformed/);
});

test("rejects data after terminal completion", async () => {
  await assert.rejects(
    parse(completed([sources]) + event("response.output_text.delta", { delta: "PRIVATE" })),
    /after completion/,
  );
});

test("enforces per-event and total response budgets", async () => {
  await assert.rejects(parse("a".repeat(1024 * 1024 + 1), 1024 * 1024), /event exceeded/);
  const heartbeat = `${":".repeat(1000)}\n\n`;
  await assert.rejects(parse(heartbeat.repeat(8400), 1024 * 1024), /response exceeded/);
});

test("rejects malformed UTF-8 instead of silently corrupting source data", async () => {
  const body = new Uint8Array([0xff, 0xfe]);
  await assert.rejects(
    readSearchStream(new Response(body), new AbortController().signal),
    TypeError,
  );
});

test("cancels a blocked stream when the session is aborted", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const pending = readSearchStream(response, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancelled, true);
});
