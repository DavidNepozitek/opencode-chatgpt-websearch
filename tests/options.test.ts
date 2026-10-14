import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOptions } from "../src/options.ts";

test("defaults to GPT-6 Luna with the existing timeout and selection policy", () => {
  assert.deepEqual(parseOptions({}), {
    model: "gpt-6-luna",
    timeout: 120_000,
    selectDefault: false,
  });
});

test("explicit model overrides still take precedence over GPT-6 Luna", () => {
  assert.equal(parseOptions({ model: "gpt-5.6-luna" }).model, "gpt-5.6-luna");
  assert.equal(parseOptions({ model: "gpt-6.1-sol" }).model, "gpt-6.1-sol");
});
