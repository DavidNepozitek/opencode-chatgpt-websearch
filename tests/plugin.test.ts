import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plugin } from "@opencode/plugin";
import type { WebSearchDefinition, WebSearchEditor } from "@opencode/plugin/promise/websearch";
import plugin from "../src/index.ts";
import { credential, fixture, streamed } from "./helpers/fixtures.ts";

async function setup(options: Record<string, unknown> = {}, selected?: string | false) {
  let provider: WebSearchDefinition | undefined;
  let current = selected;
  let active: unknown = credential;
  let resolutions = 0;
  let credentialError: Error | undefined;
  const ctx = {
    options,
    websearch: {
      async transform(fn: (editor: WebSearchEditor) => void) {
        fn({
          add(value) {
            provider = value;
          },
          default: {
            get: () => current,
            set(value) {
              current = value;
            },
          },
        });
      },
    },
    integration: {
      connection: {
        active: async () => (active ? { id: "test-credential" } : undefined),
        resolve: async () => {
          if (credentialError) throw credentialError;
          resolutions++;
          return active;
        },
      },
    },
  };
  // Deliberately partial host double; unrelated OpenCode domains are never used.
  await plugin.setup(ctx as unknown as Plugin.Context);
  assert.ok(provider);
  return {
    provider,
    selected: current,
    resolutions: () => resolutions,
    setCredential(value: unknown) {
      active = value;
    },
    failCredentialResolution(error: Error) {
      credentialError = error;
    },
  };
}

test("registers through native search without overriding provider selection", async () => {
  for (const selected of [undefined, false, "tavily", "random"] as const) {
    const state = await setup({}, selected);
    assert.equal(state.provider.id, "chatgpt");
    assert.equal(state.provider.name, "ChatGPT");
    assert.equal(state.selected, selected);
    assert.equal(state.resolutions(), 0);
  }
  assert.equal((await setup({ default: true })).selected, "chatgpt");
  assert.equal((await setup({ default: true }, false)).selected, false);
});

test("resolves current OAuth credentials per query, including account switching", async () => {
  const original = globalThis.fetch;
  const tokens: unknown[][] = [];
  try {
    globalThis.fetch = async (_, init) => {
      const headers = new Headers(init?.headers);
      tokens.push([headers.get("Authorization"), headers.get("chatgpt-account-id")]);
      assert.ok(typeof init?.body === "string" && init.body.includes('"model":"custom-model"'));
      return streamed(fixture());
    };
    const state = await setup({ model: "custom-model" });
    const query = () =>
      state.provider.execute({ query: "test" }, { signal: new AbortController().signal });
    await query();
    state.setCredential({
      ...credential,
      methodID: "chatgpt-headless",
      access: "rotated",
      metadata: { accountID: "second-account" },
    });
    await query();
    assert.equal(state.resolutions(), 2);
    assert.deepEqual(tokens, [
      ["Bearer test-access-token", "test-account"],
      ["Bearer rotated", "second-account"],
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

test("native search requests use GPT-6 Luna when no model override is configured", async () => {
  const original = globalThis.fetch;
  let requested = false;
  try {
    globalThis.fetch = async (_, init) => {
      requested = true;
      assert.ok(typeof init?.body === "string" && init.body.includes('"model":"gpt-6-luna"'));
      return streamed(fixture());
    };
    const state = await setup();
    await state.provider.execute({ query: "test" }, { signal: new AbortController().signal });
    assert.equal(requested, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("requires ChatGPT OAuth, not an API key or arbitrary OAuth provider", async () => {
  for (const value of [
    undefined,
    { type: "key", key: "PRIVATE" },
    { ...credential, methodID: "other" },
  ]) {
    const state = await setup();
    state.setCredential(value);
    await assert.rejects(
      state.provider.execute({ query: "test" }, { signal: new AbortController().signal }),
      /ChatGPT account/,
    );
  }
});

test("validates model, timeout, and default options before registration", async () => {
  for (const model of ["", " ", 42, null, "x".repeat(129), "model\nPRIVATE"])
    await assert.rejects(setup({ model }), /model/);
  for (const timeout of [0, -1, 300001, "1000", 1.5, null])
    await assert.rejects(setup({ timeout }), /timeout/);
  await assert.rejects(setup({ default: "true" }), /boolean/);
});

test("does not resolve credentials for an aborted query", async () => {
  const state = await setup();
  await assert.rejects(state.provider.execute({ query: "test" }, { signal: AbortSignal.abort() }), {
    name: "AbortError",
  });
  assert.equal(state.resolutions(), 0);
});

test("sanitizes credential-resolution errors", async () => {
  const state = await setup();
  state.failCredentialResolution(new Error("PRIVATE refresh token"));
  await assert.rejects(
    state.provider.execute({ query: "test" }, { signal: new AbortController().signal }),
    {
      message: "Could not resolve the ChatGPT login; reconnect through /connect → OpenAI",
    },
  );
});
