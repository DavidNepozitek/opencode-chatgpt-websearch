# Security

Never include ChatGPT OAuth tokens, refresh tokens, account identifiers,
authorization headers, or private queries in public issues or pull requests.
The tests use synthetic credentials; no real credential is needed to contribute.

The plugin resolves credentials through OpenCode's integration API and sends
access tokens only to the fixed ChatGPT Codex endpoint. It does not store tokens,
read authentication files, or follow HTTP redirects. Request errors intentionally
omit backend response bodies.

Search queries are sent to ChatGPT and may contain private information. Review
OpenCode's `websearch` permission rules and avoid searching for secrets. Retrieved
content and model summaries are untrusted; verify consequential claims against
the linked sources.

Report vulnerabilities privately through the repository's **Security → Report a
vulnerability** interface. Please do not disclose credentials or exploitable
security details in public issues.
