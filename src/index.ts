import type { Plugin } from "@opencode/plugin";
import { executeSearch } from "./chatgpt/client.ts";
import { parseOptions } from "./options.ts";

// Type-only SDK imports keep the installed plugin free of runtime dependencies.
export default {
  id: "opencode.chatgpt-websearch",
  async setup(ctx) {
    const options = parseOptions(ctx.options);
    await ctx.websearch.transform((editor) => {
      editor.add({
        id: "chatgpt",
        name: "ChatGPT",
        async execute({ query }, { signal }) {
          signal.throwIfAborted();
          // Resolve each query: OpenCode owns refresh and account switching.
          const credential = await resolveCredential(ctx, signal);
          if (
            credential?.type !== "oauth" ||
            !["chatgpt-browser", "chatgpt-headless"].includes(credential.methodID) ||
            !credential.access
          ) {
            throw new Error("Connect and select a ChatGPT account via /connect → OpenAI first");
          }
          return executeSearch({ credential, ...options, query, signal });
        },
      });
      if (options.selectDefault && editor.default.get() !== false) editor.default.set("chatgpt");
    });
  },
} satisfies Plugin.Plugin;

async function resolveCredential(ctx: Plugin.Context, signal: AbortSignal) {
  try {
    const connection = await ctx.integration.connection.active("openai");
    const credential = connection
      ? await ctx.integration.connection.resolve(connection)
      : undefined;
    signal.throwIfAborted();
    return credential;
  } catch {
    signal.throwIfAborted();
    // Never propagate credential-provider errors containing sensitive details.
    throw new Error("Could not resolve the ChatGPT login; reconnect through /connect → OpenAI");
  }
}
