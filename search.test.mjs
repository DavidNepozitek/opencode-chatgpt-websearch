import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "./index.js";
import { executeSearch, readSearchStream } from "./search.js";

const credential = {
  type: "oauth",
  methodID: "chatgpt-browser",
  access: "test-access-token",
  metadata: { accountID: "test-account" },
};
const sources = {
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
const message = {
  type: "message",
  content: [{
    type: "output_text",
    text: "A sourced answer with café 🌍.",
    annotations: [{ type: "url_citation", url: "https://example.com/doc", title: "Documentation" }],
  }],
};

function event(type, payload, eol = "\n", withEvent = true) {
  return `${withEvent ? `event: ${type}${eol}` : ""}data: ${JSON.stringify({ type, ...payload })}${eol}${eol}`;
}

function fixture(eol = "\n", withEvent = true) {
  return [
    event("response.output_text.delta", { delta: "A partial answer" }, eol, withEvent),
    event("response.output_item.done", { item: sources }, eol, withEvent),
    event("response.output_item.done", { item: message }, eol, withEvent),
    event("response.completed", { response: { status: "completed", output: [sources, message] } }, eol, withEvent),
    `data: [DONE]${eol}${eol}`,
  ].join("");
}

function streamed(text, chunkSize = 7, status = 200) {
  const bytes = new TextEncoder().encode(text);
  let position = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (position === bytes.length) return controller.close();
      controller.enqueue(bytes.slice(position, position + chunkSize));
      position = Math.min(position + chunkSize, bytes.length);
    },
  }), { status });
}

const parse = (text, chunkSize) => readSearchStream(streamed(text, chunkSize), new AbortController().signal);

for (const eol of ["\n", "\r\n", "\r"]) {
  test(`SSE handles ${JSON.stringify(eol)}, byte-split UTF-8, sources, and final text`, async () => {
    const results = await parse(fixture(eol), 1);
    assert.deepEqual(results, [
      {
        url: "https://chatgpt.com/",
        title: "ChatGPT search summary (synthesized)",
        content: message.content[0].text,
        time: {},
      },
      { url: "https://example.com/doc", title: "Documentation", time: {} },
      { url: "https://example.org/second", title: "Second source", time: {} },
    ]);
  });
}

test("data-only events, heartbeat comments, and final event without newline", async () => {
  const text = `: heartbeat\n\n${fixture("\n", false).replace(/data: \[DONE\]\n\n$/, "").trimEnd()}`;
  assert.equal((await parse(text))[0].content, message.content[0].text);
});

test("multiline data uses SSE newline semantics", async () => {
  const text = `event: response.completed\ndata: {"response":\ndata: {"status":"completed","output":${JSON.stringify([sources, message])}}}\n\n`;
  assert.equal((await parse(text))[1].title, "Documentation");
});

test("completed output alone supplies text and citations", async () => {
  const results = await parse(event("response.completed", { response: { output: [sources, message] } }));
  assert.equal(results[0].content, message.content[0].text);
  assert.equal(results.length, 3);
});

test("incremental annotations and text survive a completion without output", async () => {
  const results = await parse(
    event("response.output_item.done", { item: { type: "web_search_call" } }) +
    event("response.output_text.delta", { delta: "Summary" }) +
    event("response.output_text.annotation.added", { annotation: message.content[0].annotations[0] }) +
    event("response.completed", {}),
  );
  assert.equal(results[0].content, "Summary");
  assert.equal(results[1].title, "Documentation");
});

test("search with no text returns only actual sources", async () => {
  const results = await parse(event("response.completed", { response: { output: [sources] } }));
  assert.equal(results.length, 2);
  assert.equal(results[0].url, "https://example.com/doc");
  assert.equal(results[0].content, undefined);
});

test("rejects unsearched model answers", async () => {
  await assert.rejects(parse(event("response.completed", { response: { output: [message] } })), /did not perform/);
});

test("rejects truncated and malformed streams", async () => {
  await assert.rejects(parse(event("response.output_item.done", { item: sources })), /before completion/);
  await assert.rejects(parse("event: response.completed\ndata: not JSON\n\n"), /malformed/);
  await assert.rejects(readSearchStream(new Response(null), new AbortController().signal), /empty response/);
});

for (const type of ["error", "response.failed", "response.incomplete"]) {
  test(`rejects ${type} without exposing backend errors or partial results`, async () => {
    await assert.rejects(
      parse(event("response.output_item.done", { item: sources }) + event(type, { error: { message: "PRIVATE" } })),
      (error) => error.message.includes(type) && !error.message.includes("PRIVATE"),
    );
  });
}

test("rejects non-success terminal response status", async () => {
  await assert.rejects(parse(event("response.completed", { response: { status: "incomplete" } })), /successfully/);
});

test("enforces a response size budget", async () => {
  await assert.rejects(parse("a".repeat(8 * 1024 * 1024 + 1), 1024 * 1024), /exceeded/);
});

test("cancels a blocked stream when the session is aborted", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  const pending = readSearchStream(response, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancelled, true);
});

const request = (fetcher, overrides = {}) => executeSearch({
  credential,
  model: "test-model",
  query: "Zephyr next LTS",
  signal: new AbortController().signal,
  timeout: 1000,
  ...overrides,
}, fetcher);

test("uses the subscription endpoint, safe headers, and native search request", async () => {
  const results = await request(async (url, init) => {
    assert.equal(url, "https://chatgpt.com/backend-api/codex/responses");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, "Bearer test-access-token");
    assert.equal(init.headers["chatgpt-account-id"], "test-account");
    assert.equal(init.method, "POST");
    assert.ok(init.signal instanceof AbortSignal);
    const body = JSON.parse(init.body);
    assert.equal(body.model, "test-model");
    assert.equal(body.input[0].content[0].text, "Zephyr next LTS");
    assert.deepEqual(body.tools, [{ type: "web_search" }]);
    assert.deepEqual(body.include, ["web_search_call.action.sources"]);
    assert.equal(body.stream, true);
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, undefined);
    return streamed(fixture());
  });
  assert.equal(results.length, 3);
});

test("omits absent account metadata", async () => {
  await request(async (_, init) => {
    assert.equal(init.headers["chatgpt-account-id"], undefined);
    return streamed(fixture());
  }, { credential: { ...credential, metadata: {} } });
});

for (const status of [401, 429, 503]) {
  test(`HTTP ${status} errors expose status but not backend bodies`, async () => {
    await assert.rejects(request(async () => new Response("PRIVATE", { status })), {
      message: `ChatGPT search request failed (HTTP ${status})`,
    });
  });
}

test("request timeout cancels a stalled response stream", async () => {
  // Keep Node alive while its unref'ed AbortSignal timeout runs.
  const timer = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(request(async () => new Response(new ReadableStream()), { timeout: 5 }), { name: "TimeoutError" });
  } finally {
    clearTimeout(timer);
  }
});

test("pre-aborted requests do not reach fetch", async () => {
  await assert.rejects(request(() => { throw new Error("must not fetch"); }, { signal: AbortSignal.abort() }), { name: "AbortError" });
});

async function setup(options = {}, selected) {
  let provider;
  let current = selected;
  let active = credential;
  let resolutions = 0;
  const ctx = {
    options,
    websearch: {
      async transform(fn) {
        fn({
          add(value) { provider = value; },
          default: { get: () => current, set(value) { current = value; } },
        });
      },
    },
    integration: { connection: {
      active: async () => active ? { id: "test-credential" } : undefined,
      resolve: async () => { resolutions++; return active; },
    } },
  };
  await plugin.setup(ctx);
  return {
    provider,
    selected: current,
    resolutions: () => resolutions,
    setCredential(value) { active = value; },
  };
}

test("registers through native search without overriding provider selection", async () => {
  for (const selected of [undefined, false, "tavily", "random"]) {
    const state = await setup({}, selected);
    assert.equal(state.provider.id, "chatgpt");
    assert.equal(state.provider.name, "ChatGPT");
    assert.equal(state.selected, selected);
    assert.equal(state.resolutions(), 0);
  }
  assert.equal((await setup({ default: true })).selected, "chatgpt");
  assert.equal((await setup({ default: true }, false)).selected, false);
});

test("resolves current OAuth credentials on each query, including account switching", async () => {
  const original = globalThis.fetch;
  const tokens = [];
  try {
    globalThis.fetch = async (_, init) => {
      tokens.push([init.headers.Authorization, init.headers["chatgpt-account-id"], JSON.parse(init.body).model]);
      return streamed(fixture());
    };
    const state = await setup({ model: "custom-model" });
    const query = () => state.provider.execute({ query: "test" }, { signal: new AbortController().signal });
    await query();
    state.setCredential({ ...credential, methodID: "chatgpt-headless", access: "rotated", metadata: { accountID: "second-account" } });
    await query();
    assert.equal(state.resolutions(), 2);
    assert.deepEqual(tokens, [
      ["Bearer test-access-token", "test-account", "custom-model"],
      ["Bearer rotated", "second-account", "custom-model"],
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

test("requires a ChatGPT OAuth login, not an API key or arbitrary OAuth provider", async () => {
  for (const value of [undefined, { type: "key", key: "PRIVATE" }, { ...credential, methodID: "other" }]) {
    const state = await setup();
    state.setCredential(value);
    await assert.rejects(state.provider.execute({ query: "test" }, { signal: new AbortController().signal }), /ChatGPT account/);
  }
});

test("validates plugin options before registration", async () => {
  for (const model of ["", " ", 42]) await assert.rejects(setup({ model }), /model/);
  for (const timeout of [0, -1, 300001, "1000", 1.5]) await assert.rejects(setup({ timeout }), /timeout/);
});
