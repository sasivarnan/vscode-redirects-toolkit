# Contribute

Use Node.js 22 or later and run `pnpm install --frozen-lockfile`.

Before you submit a change:

1. Add a small failing example for a behavior change.
2. Keep formatting separate from validation. Never sort rules automatically.
3. Cite the current official documentation for a host rule change.
4. Run `pnpm check` and `pnpm test:editor`.
5. Update the changelog and user documentation when needed.

Report a problem with the extension version, VS Code version, selected host, a short `_redirects` example, expected result, and actual result. Remove private domains, tokens, and personal data.

Keep code self-documenting. Add comments only when needed. Keep runtime code free of Node-only APIs so it can run in web extension hosts.

Useful future work includes a rule tester, command-line checks, more host fixtures, accessibility review, and web host integration tests. Discuss broad changes before implementation.
