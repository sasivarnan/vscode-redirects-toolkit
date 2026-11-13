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
      "media/icon.png",
      "package.json",
      "syntaxes/redirects.tmLanguage.json",
    ].sort(),
  );
});

test("the Marketplace icon is a square PNG of at least 128 pixels", () => {
  const fs = require("node:fs");
  const manifest = require("../package.json");
  assert.equal(manifest.icon, "media/icon.png");
  const png = fs.readFileSync(path.resolve(__dirname, "..", manifest.icon));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), png.readUInt32BE(20));
  assert.ok(png.readUInt32BE(16) >= 128);
});
