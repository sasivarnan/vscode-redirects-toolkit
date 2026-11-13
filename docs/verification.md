# Verification

Checked on 12 November 2026 (Asia/Kolkata).

## Completed

- TypeScript type checks, Oxlint, Prettier, and the bundled production build passed.
- All 21 automated core, grammar, and bundle tests passed.
- Generated formatting cases preserved tokens, rule order, mixed line endings, optional status, and formatting stability.
- TextMate tests checked source, destination, placeholder, status, condition, comment, and URL-fragment highlighting.
- The bundle loaded with only the web host's `vscode` import shim. This is a static compatibility check, not a web editor integration test.
- Integration tests passed in the installed macOS VS Code Extension Development Host: activation, `_redirects` filename detection, column formatting, diagnostic ranges, host switching, hover help, status completion, captured placeholder completion, validation toggle, and automatic config-file create/delete/conflict handling.
- `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities. The extension has no runtime dependencies.
- Local VSIX packaging passed. The 20 KB archive contains the manifest, runtime, grammar, language configuration, README, changelog, and license. Test fixtures and development dependencies are excluded.

The editor test uses its own user-data directory and temporary workspace. It does not edit the user's greeting project or normal VS Code settings.

## Open checks

- Full web extension host and remote-workspace integration tests.
- Windows and Linux editor checks, and the oldest declared VS Code version (1.96).
- Manual screen-reader output, keyboard review of host selection, and contrast review across themes.
- Installation of the VSIX in a normal VS Code profile.
- Real routing behavior in Netlify and Cloudflare preview deployments.

Validation covers static checks only. Asset shadowing, Functions, dashboard settings, condition values, all overlapping patterns, and multi-rule loops are outside this release's scope. Host documentation links and known limits are in the README.

The first build was local. No Marketplace publication or deployment was made.

## Naming and README update

- Renamed the project folder to `vscode-redirects-toolkit`.
- Updated the Marketplace display name, description, and search keywords.
- Kept the package name and extension ID unchanged.
- Rewrote the README with short instructions and defined technical terms, using ASD-STE100 Simplified Technical English as the writing standard. No formal compliance certification was performed.
- After the rename, type, lint, formatting, build, all 21 automated tests, and editor integration checks passed.
- Rebuilt the VSIX and confirmed that its display name and README match the source files.

## README questions and visual example

- Added three short answers about host support, rule order, and common syntax checks.
- Added real before-and-after screenshots from an isolated VS Code test window, with descriptive alt text.
- Used Format Document and confirmed that all rule tokens stayed unchanged. The Cloudflare Pages error stayed visible.
- Reviewed the images at 1200 by 760 pixels. The final images have no test notification over the content.
- The first local VSIX used relative image paths while the public repository was unavailable. GitHub setup replaces this with public image links.
- Public repository links and GitHub topics were pending at this stage. Marketplace publication remains a separate action.
- Type, lint, formatting, build, and all 21 automated tests passed after these changes.
- Rebuilt the local VSIX (about 164 KB). Confirmed that the README and both referenced PNG images match the source files.

## GitHub repository setup

- Connected the project to `https://github.com/sasivarnan/vscode-redirects-toolkit.git`.
- Added source, issue, contribution, license, and verification links.
- Added the repository, homepage, and issue URLs to the extension manifest.
- Enabled README link and image rewriting for the public `main` branch.
- Marketplace publication remains pending. No Marketplace URL is claimed.
- Added the GitHub description and eight relevant repository topics.
- Type, lint, formatting, build, all 21 automated tests, and VS Code editor integration tests passed before the first push.
- Rebuilt the VSIX and confirmed that image and contribution links use the public repository on `main`.

## Trusted publishing and cleanup

Checked on 13 November 2026 (Asia/Kolkata).

- Added `.github/workflows/publish.yml` for the existing Marketplace trusted publishing policy. The Environment field stays empty.
- The workflow checks and saves a package by default. Publication is an explicit workflow input and is restricted to `main`.
- The check job has read access. Only the publish job can request an OIDC token.
- The publish job uses the checked VSIX artifact. It does not rebuild it or use a Personal Access Token.
- Switched development, tests, documentation, and VS Code tasks to pnpm 12.18.0. Removed the npm lockfile.
- Updated `@vscode/vsce` from 3.9.2 to 4.1.1 because trusted publishing requires its OIDC support.
- Replaced `.vscodeignore` with an explicit package file list. Duplicate compiled modules and development files are excluded.
- Removed the fixed version from the package command and added a package-content regression test.
- The editor test runner removes its temporary workspace after each run.
- No runtime code refactor was needed for this release.
- A frozen pnpm install, type checks, lint, formatting, build, all 22 automated tests, and macOS editor tests passed.
- Actionlint 1.7.12 accepted the workflow. The validator download matched the upstream SHA-256 checksum.
- Inspected the VSIX: 11 files, one runtime module, and no workflow, lockfile, source, or test files.
- Confirmed that `vsce` 4.1.1 supports `--oidc`. No saved publisher credential is needed by the workflow.
