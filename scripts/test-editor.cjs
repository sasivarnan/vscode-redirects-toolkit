const path = require("node:path");
const fs = require("node:fs");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const root = path.resolve(__dirname, "..");
  fs.mkdirSync(path.join(root, ".vscode-test"), { recursive: true });
  const workspace = fs.mkdtempSync(
    path.join(root, ".vscode-test", "workspace-"),
  );
  fs.copyFileSync(
    path.join(root, "examples", "_redirects"),
    path.join(workspace, "_redirects"),
  );
  const macExecutable =
    "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
  const executable =
    process.env.VSCODE_EXECUTABLE_PATH ||
    (fs.existsSync(macExecutable) ? macExecutable : undefined);
  try {
    await runTests({
      vscodeExecutablePath: executable,
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(root, "tests", "editor", "index.cjs"),
      launchArgs: [
        workspace,
        "--disable-extensions",
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-workspace-trust",
        ...(process.env.CI
          ? ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
          : []),
        "--user-data-dir",
        path.join(root, ".vscode-test", "user-data"),
      ],
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
