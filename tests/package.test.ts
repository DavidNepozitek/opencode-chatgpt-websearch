import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Host } from "@opencode/plugin/host";
import plugin from "../server.ts";

test("local-directory discovery resolves the root compatibility entrypoint", () => {
  const directory = fileURLToPath(new URL("../", import.meta.url));
  assert.equal(Host.resolve({ directory }).server, new URL("../server.ts", import.meta.url).href);
  assert.equal(plugin.id, "opencode.chatgpt-websearch");
});

test("distribution has no runtime dependencies or installation lifecycle scripts", async () => {
  const manifest: unknown = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.ok(manifest !== null && typeof manifest === "object" && !Array.isArray(manifest));
  assert.equal("dependencies" in manifest, false);
  assert.equal("optionalDependencies" in manifest, false);
  assert.ok(
    "scripts" in manifest && manifest.scripts !== null && typeof manifest.scripts === "object",
  );
  // npm's Git fetcher also treats `build` as a preparation trigger.
  for (const script of ["build", "preinstall", "install", "postinstall", "prepare", "prepack"]) {
    assert.equal(script in manifest.scripts, false);
  }
});
