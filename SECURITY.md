# Security

Never include ChatGPT OAuth tokens, refresh tokens, account identifiers,
authorization headers, or private queries in public issues or pull requests.
The tests use synthetic credentials; no real credential is needed to contribute.

## Runtime protections

The plugin resolves credentials through OpenCode's integration API and sends
access tokens only to the fixed ChatGPT Codex endpoint. It does not store tokens,
read authentication files, or follow HTTP redirects. Request errors intentionally
omit backend response bodies and raw transport errors. Header values and queries
are validated before network calls. Incoming JSON is validated at runtime;
response/event sizes, completion state, UTF-8 decoding, and cancellation are
checked before results are returned.

## Supply-chain and repository protections

The package has no runtime dependencies and no install/build lifecycle scripts.
Development dependencies and pnpm are pinned; the lockfile includes registry
integrities. pnpm disables lifecycle scripts, rejects exotic transitive sources,
enforces a one-day release-age floor, and checks provenance downgrades without
exceptions.

CI uses SHA-pinned actions, read-only tokens by default, no persisted checkout
credentials, frozen installs, oxlint, strict TypeScript, offline tests, and a
dependency audit. Only the CodeQL job receives `security-events: write`.
Dependabot proposes reviewed updates; it does not auto-merge them.

GitHub secret scanning/push protection and private vulnerability reporting are
enabled. Main-branch protections require checks and restrict history rewriting;
maintainers review changes through pull requests. No controls guarantee the
absence of vulnerabilities, and OpenAI backend behavior is outside this project's
control.

Search queries are sent to ChatGPT and may contain private information. Review
OpenCode's `websearch` permission rules and avoid searching for secrets. Retrieved
content and model summaries are untrusted; verify consequential claims against
the linked sources.

Report vulnerabilities privately through the repository's **Security → Report a
vulnerability** interface. Please do not disclose credentials or exploitable
security details in public issues.
