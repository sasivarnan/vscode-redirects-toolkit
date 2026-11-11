const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("bundle loads with only the web host's vscode require shim", () => {
  const module = { exports: {} };
  const imports = [];
  const sandbox = {
    module,
    exports: module.exports,
    require(name) {
      imports.push(name);
      assert.equal(
        name,
        "vscode",
        "No file imports or Node modules are needed at runtime",
      );
      return {};
    },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../dist/extension.js"), "utf8"),
    sandbox,
  );
  assert.equal(typeof module.exports.activate, "function");
  assert.deepEqual(imports, ["vscode"]);
});
