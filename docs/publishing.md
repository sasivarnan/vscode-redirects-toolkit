# Publish the extension

Use the **Publish extension** workflow in GitHub Actions.
The workflow file is `.github/workflows/publish.yml`.
It uses Node.js 24 and trusted publishing.
You do not need a Personal Access Token.

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
A check run does not change the version, create a tag, or publish the package.

## Publish a new version

1. Add the release notes under `## Unreleased` in `CHANGELOG.md`.
2. Run `pnpm check`, `pnpm test:editor`, and `pnpm package` locally.
3. Commit and push the checked source changes to `main`.
4. Run **Publish extension** on `main`.
5. Select **Publish the checked package to Visual Studio Marketplace**.
6. Select the version change.

| Version change | Example               | Use                                                           |
| -------------- | --------------------- | ------------------------------------------------------------- |
| `patch`        | `0.1.0` to `0.1.1`    | Small fixes and compatible improvements. This is the default. |
| `minor`        | `0.1.0` to `0.2.0`    | A new feature set.                                            |
| `major`        | `0.1.0` to `1.0.0`    | A release that you choose to mark as a new major version.     |
| `current`      | `0.1.0` stays `0.1.0` | A version that you already prepared by hand.                  |

For `current`, the changelog must already have the version heading.
It must not have an Unreleased section.
Use a version that is not already uploaded to Marketplace.

For patch, minor, and major, the workflow changes the version before the checks and package build.
It also changes the Unreleased heading to the new version.
You do not need to edit `package.json` or a package filename by hand.
The package command gets the filename from the name and version in `package.json`.

## Release sequence

1. The check job prepares the version, tests the source, and builds the VSIX.
2. It saves the VSIX and release metadata in one workflow artifact.
3. The publish job checks that `main` and the release metadata still match.
4. It uploads the saved VSIX with a short-lived Marketplace credential.
5. After a successful upload, the record job commits the version and changelog.
6. It creates an annotated tag, such as `v0.1.1`, on that release commit.
7. It pushes the release commit and tag together with an atomic Git push.

The check job has read access only.
Only the publish job can request a Marketplace credential.
Only the record job can write the release commit and tag to the repository.
The record job requires branch rules that permit this update.
It does not force-push or bypass branch protection.

If `main` changes during a release, the workflow stops the next release step.
It does not replace newer source changes with an older version record.
Keep `main` unchanged while a release runs.

The upload and verification are separate steps.
A tag records a successful upload. It does not confirm that Marketplace verification is complete.
After upload, check the Marketplace page and install the published version in VS Code.

## If a release fails

- If the checks fail, correct the source and run the workflow again.
- If upload fails, check the trusted publishing policy and the job log.
- If upload succeeds but the record job fails, do not upload that version again.
- If branch permissions caused the record failure, correct them and rerun the failed job.
- If `main` changed, recover the version record from the saved metadata before the next release.
- Keep the release tag on the checked source. Do not force-push `main`.

Use a new version for each later Marketplace upload.
Do not use `current` to overwrite an existing version.

See [Microsoft's publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing).
