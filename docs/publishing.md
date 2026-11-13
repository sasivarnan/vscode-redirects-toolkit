# Publish the extension

Use the **Publish extension** workflow in GitHub Actions.
The workflow file is `.github/workflows/publish.yml`.
It uses trusted publishing. You do not need a Personal Access Token.

## Marketplace policy

Use these values in the trusted publishing policy for publisher `sasivarnan`:

| Field            | Value                      |
| ---------------- | -------------------------- |
| Repository owner | `sasivarnan`               |
| Repository       | `vscode-redirects-toolkit` |
| Workflow         | `publish.yml`              |
| Environment      | Leave empty.               |

The workflow does not select a GitHub Environment.
The policy and workflow must use the same values.

## Check a package

1. Open the repository on GitHub.
2. Select **Actions**.
3. Select **Publish extension**.
4. Select **Run workflow**.
5. Select the `main` branch.
6. Leave **Publish the checked package to Visual Studio Marketplace** clear.
7. Run the workflow.

The workflow installs the locked dependencies with pnpm.
It runs source checks, unit tests, package file checks, and VS Code editor tests.
It then builds and saves the VSIX package as a workflow artifact.
It does not publish when the publish option is clear.

## Publish a version

1. Update the version in `package.json`.
2. Update `CHANGELOG.md`.
3. Run `pnpm install --lockfile-only` to update the lockfile when needed.
4. Run `pnpm check`, `pnpm test:editor`, and `pnpm package` locally.
5. Commit and push the checked changes to `main`.
6. Run **Publish extension** on `main`.
7. Select **Publish the checked package to Visual Studio Marketplace**.

The first release uses version `0.1.0`. Use a new version for each later release.
The package command gets the filename from the package name and version.
You do not need to edit the scripts when the version changes.

The check job has no publishing permission.
The publish job requests a short-lived Marketplace credential through GitHub Actions.
It uploads the exact VSIX artifact from the check job.
It does not rebuild the artifact or use a saved publishing token.

After a successful publish job, check the Marketplace page and install the published version in VS Code.
A successful build does not confirm that the Marketplace accepted the release.
Marketplace processing can continue after the upload.

## If publishing fails

- Confirm that the policy uses `publish.yml` and leaves Environment empty.
- Confirm that the workflow ran from `main`.
- Check that the package uses publisher ID `sasivarnan`.
- Check whether the version is already published.
- Read the failed job log. Do not change the package to correct an account permission error.

See [Microsoft's publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing).
