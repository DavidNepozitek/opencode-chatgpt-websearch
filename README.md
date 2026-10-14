# ChatGPT web search for OpenCode V2

[![Tests](https://github.com/DavidNepozitek/opencode-chatgpt-websearch/actions/workflows/test.yml/badge.svg)](https://github.com/DavidNepozitek/opencode-chatgpt-websearch/actions/workflows/test.yml)

Search the web in OpenCode using your existing **ChatGPT subscription**—no
additional API key or search service. Registers ChatGPT in V2's native search
provider picker and uses the built-in `websearch` tool, not a replacement tool
or an MCP server.

Dependency-free. Tested against **OpenCode 2.0.28**. **V1 is not supported.**

## Install

Add the GitHub package to your global `~/.config/opencode/opencode.jsonc` (or a
project's `opencode.jsonc`), preserving your other settings:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:DavidNepozitek/opencode-chatgpt-websearch#v1.0.0"],
  "websearch": { "provider": "chatgpt" }
}
```

OpenCode installs GitHub packages automatically. Alternatively, install globally
using the CLI, then choose **ChatGPT** in the normal search provider picker:

```sh
opencode plugin add 'github:DavidNepozitek/opencode-chatgpt-websearch#v1.0.0'
```

Connect and select a ChatGPT subscription using **`/connect` → OpenAI** if you
haven't already. Ask OpenCode to search, for example:

```text
Search official Zephyr documentation for the next RTOS LTS release and its planned date.
```

The package is distributed through GitHub; it is not currently published to npm.
The `v1.0.0` tag pins a release; use `#main` only if you want development updates.
If a newly installed plugin hasn't appeared, run `opencode service restart`.

## Configuration

Search defaults to **`gpt-5.6-luna`**, independently of the conversation model.
V2's search provider interface receives a query and cancellation signal, not the
session's selected model. You can choose another backend model your subscription
supports:

```jsonc
{
  "plugins": [{
    "package": "github:DavidNepozitek/opencode-chatgpt-websearch#v1.0.0",
    "options": {
      "model": "gpt-5.6-luna",
      "timeout": 120000
    }
  }],
  "websearch": { "provider": "chatgpt" }
}
```

| Option | Default | Description |
| --- | --- | --- |
| `model` | `gpt-5.6-luna` | Backend model ID, without a provider prefix. |
| `timeout` | `120000` | HTTP request/stream timeout in milliseconds (1–300000). |
| `default` | `false` | Select ChatGPT unless search is explicitly disabled. Prefer `websearch.provider` for normal selection. |

Omit `websearch.provider` to use the native picker instead. The plugin does not
override your selection or saved consent unless explicitly configured to do so.
OpenCode's usual search permissions still apply. Set `websearch: false` to disable
search, or remove the plugin entry to uninstall it.

## How it works

- Registers through `ctx.websearch.transform` with provider ID `chatgpt` and
  plugin ID `opencode.chatgpt-websearch`.
- Resolves the active OpenAI ChatGPT OAuth credential on every query. OpenCode
  manages token refresh and account switching; the plugin never reads token files
  or the database and never stores credentials itself.
- Sends the query to `https://chatgpt.com/backend-api/codex/responses` with the
  native `web_search` tool enabled. The endpoint is fixed and redirects are
  rejected to protect subscription tokens.
- Returns a clearly labeled synthesized summary linked to ChatGPT, followed by
  deduplicated source URLs and titles. The ChatGPT link is **not an evidence
  source**; cite the actual source links.
- Handles streamed UTF-8/SSE, citations, cancellation, bounded response size,
  timeouts, and terminal failures. Rejects answers without a web-search invocation
  or successful completion rather than presenting model knowledge as search.

## Limitations and troubleshooting

This is an **unofficial integration**, unaffiliated with OpenAI or OpenCode. It
uses the same ChatGPT/Codex backend as the upstream provider; backend changes or
account restrictions may break it. Search uses your subscription allowance and
depends on your account's model and web-search access.

- **Authentication error:** select a ChatGPT OAuth login under OpenAI, not an API
  key. Reconnect through `/connect` if needed. Only V2's `chatgpt-browser` and
  `chatgpt-headless` methods are supported.
- **Model/tool unavailable:** set `options.model` to a model supported by your
  subscription and the Codex backend. Access varies by account.
- **HTTP 429:** wait for your subscription rate limit to reset; this plugin does
  not implement its own retry or automatic provider fallback.
- **Plugin not listed:** check `opencode plugin list` and the service logs; verify
  you're running V2. Restart the service if configuration watching didn't pick up
  the installation.

Do not paste OAuth tokens, authorization headers, or unredacted logs into issues.
See [SECURITY.md](SECURITY.md).

## Local development

```sh
git clone https://github.com/DavidNepozitek/opencode-chatgpt-websearch.git
cd opencode-chatgpt-websearch
npm test
```

Tests require Node.js 22+ and run offline with synthetic credentials. There are no
dependencies, no build step, and no `npm install` requirement for development.
To test in OpenCode, configure the repository's absolute path in `plugins`.
V2 also discovers package directories under `~/.config/opencode/plugins/` and
`.opencode/plugins/` automatically.

## Credits and license

The ChatGPT provider was adapted from
[emilsvennesson/opencode-websearch](https://github.com/emilsvennesson/opencode-websearch),
by Nils Emil Svensson. This version integrates with the OpenCode V2 search API.
MIT licensed; the upstream copyright notice is preserved in [LICENSE.md](LICENSE.md).
