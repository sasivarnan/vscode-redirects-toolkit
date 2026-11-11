const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const tm = require("vscode-textmate");
const oniguruma = require("vscode-oniguruma");

test("grammar highlights sources, destinations, status, placeholders, and comments", async () => {
  await oniguruma.loadWASM(
    fs.readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")),
  );
  const registry = new tm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources) => new oniguruma.OnigScanner(sources),
      createOnigString: (text) => new oniguruma.OnigString(text),
    }),
    loadGrammar: async () =>
      tm.parseRawGrammar(
        fs.readFileSync(
          require.resolve("../syntaxes/redirects.tmLanguage.json"),
          "utf8",
        ),
        "redirects.json",
      ),
  });
  const grammar = await registry.loadGrammar("source.redirects");
  const line = "/blog/* /posts/:splat#part 301! Country=au,nz # note";
  const tokens = grammar.tokenizeLine(line).tokens;
  const scopesAt = (index) =>
    tokens.find((token) => index >= token.startIndex && index < token.endIndex)
      .scopes;
  assert.ok(scopesAt(1).includes("entity.name.tag.source.redirects"));
  assert.ok(
    scopesAt(line.indexOf("posts")).includes(
      "string.unquoted.destination.redirects",
    ),
  );
  assert.ok(
    scopesAt(line.indexOf(":splat")).includes("variable.parameter.redirects"),
  );
  assert.ok(
    !scopesAt(line.indexOf("#part")).some((scope) =>
      scope.startsWith("comment"),
    ),
  );
  assert.ok(
    scopesAt(line.indexOf("301")).includes("constant.numeric.status.redirects"),
  );
  assert.ok(
    scopesAt(line.indexOf("Country")).includes(
      "support.type.property-name.redirects",
    ),
  );
  assert.ok(
    scopesAt(line.indexOf("# note")).includes(
      "comment.line.number-sign.redirects",
    ),
  );
  const comment = grammar.tokenizeLine("  # comment").tokens;
  assert.ok(
    comment.some((token) =>
      token.scopes.includes("comment.line.number-sign.redirects"),
    ),
  );
  registry.dispose();
});
