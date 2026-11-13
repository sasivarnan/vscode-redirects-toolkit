const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");

const increments = new Set(["patch", "minor", "major", "current"]);
const identity = [
  "-c",
  "user.name=github-actions[bot]",
  "-c",
  "user.email=41898282+github-actions[bot]@users.noreply.github.com",
];

function nextVersion(version, increment) {
  if (!increments.has(increment))
    throw new Error("Select patch, minor, major, or current.");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("Use a stable major.minor.patch version.");
  }
  const parts = version.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger))
    throw new Error("Version number is too large.");
  const index = ["major", "minor", "patch"].indexOf(increment);
  if (index !== -1) {
    parts[index]++;
    if (!Number.isSafeInteger(parts[index]))
      throw new Error("Version number is too large.");
    parts.fill(0, index + 1);
  }
  return parts.join(".");
}

function releaseChanges(manifest, changelog, increment) {
  const version = nextVersion(manifest.version, increment);
  const heading = new RegExp(
    `^## ${version.replaceAll(".", "\\.")}[ \\t]*\\r?$`,
    "m",
  );
  const unreleased = /^## Unreleased[ \t]*\r?$/m;
  if (increment === "current") {
    if (unreleased.test(changelog) || !heading.test(changelog)) {
      throw new Error(
        "Current version requires an existing release heading and no Unreleased section.",
      );
    }
  } else {
    if (!unreleased.test(changelog))
      throw new Error("Add an Unreleased section to CHANGELOG.md.");
    if (heading.test(changelog))
      throw new Error(`CHANGELOG.md already contains version ${version}.`);
    changelog = changelog.replace(unreleased, `## ${version}`);
  }
  return {
    manifest: { ...manifest, version },
    changelog,
    version,
    tag: `v${version}`,
  };
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function writeJson(filename, value) {
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
}

function prepareRelease(root, increment) {
  const original = readJson(path.join(root, "package.json"));
  const changelogPath = path.join(root, "CHANGELOG.md");
  const changes = releaseChanges(
    original,
    fs.readFileSync(changelogPath, "utf8"),
    increment,
  );
  const output = path.join(root, "release-output");
  fs.mkdirSync(output, { recursive: true });
  writeJson(path.join(root, "package.json"), changes.manifest);
  fs.writeFileSync(changelogPath, changes.changelog);
  writeJson(path.join(output, "package.json"), changes.manifest);
  fs.writeFileSync(path.join(output, "CHANGELOG.md"), changes.changelog);
  const metadata = {
    increment,
    previousVersion: original.version,
    version: changes.version,
    tag: changes.tag,
  };
  writeJson(path.join(output, "release.json"), metadata);
  return metadata;
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function verifyRelease(root, artifacts) {
  const metadataPath = path.join(artifacts, "release-output");
  const metadata = readJson(path.join(metadataPath, "release.json"));
  const source = readJson(path.join(root, "package.json"));
  if (source.version !== metadata.previousVersion)
    throw new Error("Release source version has changed.");
  const expected = releaseChanges(
    source,
    fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"),
    metadata.increment,
  );
  if (metadata.version !== expected.version || metadata.tag !== expected.tag)
    throw new Error("Release metadata does not match the source.");
  const packaged = readJson(path.join(metadataPath, "package.json"));
  if (!isDeepStrictEqual(packaged, expected.manifest))
    throw new Error("Release manifest has unexpected changes.");
  if (
    fs.readFileSync(path.join(metadataPath, "CHANGELOG.md"), "utf8") !==
    expected.changelog
  )
    throw new Error("Release changelog does not match the source.");
  const archive = path.join(
    artifacts,
    `${source.name}-${expected.version}.vsix`,
  );
  if (!fs.statSync(archive).isFile())
    throw new Error("The checked VSIX is missing.");
  if (git(root, ["status", "--porcelain", "--untracked-files=no"]))
    throw new Error("The release checkout must be clean.");
  git(root, ["fetch", "--no-tags", "origin", "main:refs/remotes/origin/main"]);
  if (
    git(root, ["rev-parse", "HEAD"]) !== git(root, ["rev-parse", "origin/main"])
  ) {
    throw new Error(
      "main changed during the release. Run the workflow again from the latest main.",
    );
  }
  if (
    git(root, ["tag", "--list", expected.tag]) ||
    git(root, ["ls-remote", "--tags", "origin", `refs/tags/${expected.tag}`])
  ) {
    throw new Error(
      `Tag ${expected.tag} already exists. Select a new version.`,
    );
  }
  return { ...expected, archive };
}

function recordRelease(root, artifacts) {
  const release = verifyRelease(root, artifacts);
  writeJson(path.join(root, "package.json"), release.manifest);
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), release.changelog);
  git(root, ["add", "--", "package.json", "CHANGELOG.md"]);
  const difference = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd: root,
  });
  if (difference.status === 1)
    git(root, [...identity, "commit", "-m", `Release ${release.tag}`]);
  else if (difference.status !== 0)
    throw new Error("Cannot check the release commit.");
  git(root, [
    ...identity,
    "tag",
    "-a",
    release.tag,
    "-m",
    `Release ${release.tag}`,
  ]);
  return release;
}

function main() {
  const [command, argument] = process.argv.slice(2);
  const root = process.cwd();
  let release;
  if (command === "prepare") release = prepareRelease(root, argument);
  else if (command === "verify")
    release = verifyRelease(root, path.resolve(argument));
  else if (command === "record") {
    if (
      process.env.GITHUB_ACTIONS !== "true" ||
      process.env.GITHUB_REF !== "refs/heads/main"
    ) {
      throw new Error("Record a release only in GitHub Actions on main.");
    }
    release = recordRelease(root, path.resolve(argument));
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${release.tag}\n`);
  } else
    throw new Error(
      "Use prepare <increment>, verify <artifact-folder>, or record <artifact-folder>.",
    );
  console.log(`${command}: ${release.tag}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  nextVersion,
  releaseChanges,
  prepareRelease,
  verifyRelease,
  recordRelease,
};
