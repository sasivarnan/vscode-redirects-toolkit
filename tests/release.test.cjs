const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const {
  nextVersion,
  releaseChanges,
  prepareRelease,
  verifyRelease,
  recordRelease,
} = require("../scripts/release.cjs");

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fixture(context, increment = "patch") {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "redirects-release-"));
  context.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const root = path.join(folder, "source");
  const remote = path.join(folder, "remote.git");
  const artifacts = path.join(folder, "artifacts");
  fs.mkdirSync(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify(
      { name: "fixture-extension", version: "1.2.3", publisher: "fixture" },
      null,
      2,
    ) + "\n",
  );
  fs.writeFileSync(
    path.join(root, "CHANGELOG.md"),
    increment === "current"
      ? "# Changelog\n\n## 1.2.3\n\n- Test release.\n"
      : "# Changelog\n\n## Unreleased\n\n- Test release.\n\n## 1.2.3\n\n- Old release.\n",
  );
  fs.writeFileSync(path.join(root, ".gitignore"), "release-output/\n");
  git(root, ["init", "--initial-branch=main"]);
  git(root, ["config", "user.name", "Release test"]);
  git(root, ["config", "user.email", "release-test@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["config", "tag.gpgsign", "false"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "Initial test source"]);
  git(folder, ["init", "--bare", "--initial-branch=main", remote]);
  git(remote, ["fetch", root, "main:main"]);
  git(root, ["remote", "add", "origin", remote]);
  const original = git(root, ["rev-parse", "HEAD"]);
  const metadata = prepareRelease(root, increment);
  fs.mkdirSync(artifacts);
  fs.cpSync(
    path.join(root, "release-output"),
    path.join(artifacts, "release-output"),
    { recursive: true },
  );
  fs.writeFileSync(
    path.join(artifacts, `fixture-extension-${metadata.version}.vsix`),
    "checked archive fixture",
  );
  git(root, ["restore", "package.json", "CHANGELOG.md"]);
  return { folder, root, remote, artifacts, original, metadata };
}

test("release increments follow stable semantic versions", () => {
  assert.equal(nextVersion("0.1.0", "patch"), "0.1.1");
  assert.equal(nextVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(nextVersion("1.2.3", "major"), "2.0.0");
  assert.equal(nextVersion("1.2.3", "current"), "1.2.3");
  for (const version of ["1.2", "01.2.3", "1.2.3-beta.1", "v1.2.3"])
    assert.throws(() => nextVersion(version, "patch"));
  assert.throws(() => nextVersion("1.2.3", "latest"));
  assert.throws(() => nextVersion("9007199254740991.0.0", "major"));
});

test("release preparation keeps changelog spacing and validates release notes", () => {
  const source = { name: "example", version: "0.1.0" };
  const notes = "# Changelog\n\n## Unreleased\n\n- Change.\n";
  const result = releaseChanges(source, notes, "patch");
  assert.equal(result.changelog, "# Changelog\n\n## 0.1.1\n\n- Change.\n");
  assert.equal(source.version, "0.1.0");
  assert.throws(
    () => releaseChanges(source, "# Changelog\n", "patch"),
    /Unreleased/,
  );
  assert.throws(
    () => releaseChanges(source, notes + "\n## 0.1.1\n", "patch"),
    /already contains/,
  );
  assert.throws(
    () => releaseChanges(source, notes, "current"),
    /existing release heading/,
  );
});

test("checked release metadata matches source before publishing", (context) => {
  const { root, artifacts } = fixture(context);
  const release = verifyRelease(root, artifacts);
  assert.equal(release.version, "1.2.4");
  assert.equal(release.tag, "v1.2.4");
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "package.json"))).version,
    "1.2.3",
  );
});

test("release verification rejects unexpected manifest edits", (context) => {
  const { root, artifacts } = fixture(context);
  const file = path.join(artifacts, "release-output", "package.json");
  const manifest = JSON.parse(fs.readFileSync(file));
  manifest.publisher = "other-publisher";
  fs.writeFileSync(file, JSON.stringify(manifest));
  assert.throws(() => verifyRelease(root, artifacts), /unexpected changes/);
});

test("release verification rejects a changed remote main", (context) => {
  const { root, remote, artifacts, folder } = fixture(context);
  const other = path.join(folder, "other");
  git(folder, ["clone", "--branch", "main", remote, other]);
  fs.writeFileSync(path.join(other, "new-file.txt"), "New commit\n");
  git(other, ["add", "."]);
  git(other, [
    "-c",
    "user.name=Release test",
    "-c",
    "user.email=release-test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "Advance main",
  ]);
  git(remote, ["fetch", other, "main:main"]);
  assert.throws(() => verifyRelease(root, artifacts), /main changed/);
});

test("release verification rejects a previously created remote tag", (context) => {
  const { root, remote, artifacts } = fixture(context);
  git(remote, ["tag", "v1.2.4", "main"]);
  assert.throws(() => verifyRelease(root, artifacts), /already exists/);
});

test("release recording commits the version and tags the same source without a push", (context) => {
  const { root, remote, artifacts, original } = fixture(context);
  recordRelease(root, artifacts);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "package.json"))).version,
    "1.2.4",
  );
  assert.match(
    fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"),
    /## 1\.2\.4/,
  );
  assert.equal(
    git(root, ["rev-parse", "v1.2.4^{}"]),
    git(root, ["rev-parse", "HEAD"]),
  );
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "Release v1.2.4");
  assert.equal(git(remote, ["rev-parse", "main"]), original);
  assert.equal(git(root, ["status", "--porcelain"]), "");
});

test("current version can be tagged without an empty version commit", (context) => {
  const { root, artifacts, original } = fixture(context, "current");
  recordRelease(root, artifacts);
  assert.equal(git(root, ["rev-parse", "HEAD"]), original);
  assert.equal(git(root, ["rev-parse", "v1.2.3^{}"]), original);
});

test("the record command cannot run outside the main GitHub Actions workflow", () => {
  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../scripts/release.cjs"), "record", "/unused"],
    { env: { ...process.env, GITHUB_ACTIONS: "false" }, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /only in GitHub Actions on main/);
});
