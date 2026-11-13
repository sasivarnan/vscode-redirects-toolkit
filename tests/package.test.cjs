const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { listFiles, PackageManager } = require("@vscode/vsce");

test("the VSIX includes only runtime files and public documentation", async () => {
  const files = await listFiles({
    cwd: path.resolve(__dirname, ".."),
    packageManager: PackageManager.None,
  });
  assert.deepEqual(
    files.sort(),
    [
      "CHANGELOG.md",
      "LICENSE",
      "README.md",
      "dist/extension.js",
      "language-configuration.json",
      "media/formatting-after.png",
      "media/formatting-before.png",
      "package.json",
      "syntaxes/redirects.tmLanguage.json",
    ].sort(),
  );
});
