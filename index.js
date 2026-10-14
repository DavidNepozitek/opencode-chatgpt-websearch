import { executeSearch } from "./search.js";

// Plugin.define is an identity helper; using its plain definition shape keeps
// this V2 plugin dependency-free (including when loaded from the Nix store).
export default {
  id: "opencode.chatgpt-websearch",
  async setup(ctx) {
    const model = ctx.options.model ?? "gpt-5.6-luna";
    const timeout = ctx.options.timeout ?? 120_000;
    if (typeof model !== "string" || !model.trim()) {
      throw new Error("ChatGPT websearch: model must be a non-empty string");
    }
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) {
      throw new Error("ChatGPT websearch: timeout must be 1–300000 milliseconds");
    }

    await ctx.websearch.transform((editor) => {
      editor.add({
        id: "chatgpt",
        name: "ChatGPT",
        async execute({ query }, { signal }) {
          signal.throwIfAborted();
          // Resolve on every query: V2 owns refresh and active-account changes.
          const connection = await ctx.integration.connection.active("openai");
          const credential = connection
            ? await ctx.integration.connection.resolve(connection)
            : undefined;
          signal.throwIfAborted();
          if (
            credential?.type !== "oauth" ||
            !["chatgpt-browser", "chatgpt-headless"].includes(credential.methodID) ||
            !credential.access
          ) {
            throw new Error("Connect and select a ChatGPT account via /connect → OpenAI first");
          }
          return executeSearch({ credential, model, query, signal, timeout });
        },
      });
      // Register in the native picker without overriding configuration or saved
      // consent. An explicit plugin option can select it as the default.
      if (ctx.options.default === true && editor.default.get() !== false) {
        editor.default.set("chatgpt");
      }
    });
  },
};
