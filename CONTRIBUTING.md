# Contributing

Use Node.js 22.18+ and **pnpm 11.27.0** (pinned in `package.json`). Run:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm audit:dependencies
```

`pnpm check` runs strict TypeScript checking, oxlint, oxfmt's format check, offline
tests, and a declaration/JavaScript build. Use `pnpm format` to format changes.
Tests use synthetic credentials and never require a real ChatGPT login.

## Layout

- `server.ts`: thin compatibility entrypoint for OpenCode's local-directory discovery.
- `src/index.ts`: OpenCode V2 plugin registration and credential resolution.
- `src/options.ts`: runtime validation of plugin options.
- `src/chatgpt/client.ts`: authenticated request and sanitized transport errors.
- `src/chatgpt/sse.ts`: bounded UTF-8/SSE framing and cancellation.
- `src/chatgpt/stream.ts`: runtime validation and search-result assembly.
- `tests/`: client, stream, and host-integration tests with shared synthetic fixtures.
- `.github/`: SHA-pinned CI, CodeQL, and Dependabot configuration.

The installed package exports TypeScript directly, which OpenCode loads natively.
SDK imports are **type-only**; there are no production dependencies or installation
lifecycle scripts. `pnpm compile` emits an optional `dist/` directory for development,
but package installation does not need to build anything.

Do not add a root `build`, `prepare`, or installation lifecycle script: npm's Git
fetcher uses these names as triggers for dependency preparation, which breaks
direct GitHub installation in OpenCode. The regression tests enforce this.

Treat every parsed backend value as `unknown` until validated. Keep the endpoint
fixed, reject redirects, bound untrusted input, and do not attach raw errors as
`cause` when they can contain secrets. Add regression tests for security changes.

Keep dependencies exact and commit `pnpm-lock.yaml`. Installation scripts are
disabled and fresh dependencies have a one-day release-age floor. Provenance
downgrade checks have no exceptions. Node types track the current release, while
CI retains Node 22, 24, and 26 to verify the supported runtime baseline.

Open pull requests against `main`; CI and CodeQL must pass. Main requires a review;
repository administrators can bypass review **through a pull request only** for
solo maintenance, not by directly pushing to main. Release tags cannot be updated
or deleted. Do not auto-merge
dependency updates without review. Report security issues privately as described
in [SECURITY.md](SECURITY.md).
