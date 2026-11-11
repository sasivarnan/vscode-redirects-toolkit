const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseLine, parseDocument, resolveHost } = require("../dist/parser");
const { formatDocument } = require("../dist/formatter");
const { validateDocument } = require("../dist/validation");
const { tokenHelp } = require("../dist/help");

const codes = (text, host = "generic") =>
  validateDocument(text, host).map((issue) => issue.code);
const signature = (text) =>
  parseDocument(text).map((rule) => rule.tokens.map((token) => token.value));

test("parses query filters, a forced status, conditions, and trailing comment spans", () => {
  const rule = parseLine(
    " /shop id=:id tag=:tag /posts/:tag/:id 301! Country=au,nz # note",
    7,
  );
  assert.equal(rule.line, 7);
  assert.deepEqual(
    rule.query.map((token) => token.value),
    ["id=:id", "tag=:tag"],
  );
  assert.equal(rule.destination.value, "/posts/:tag/:id");
  assert.equal(rule.status.value, "301!");
  assert.equal(rule.options[0].value, "Country=au,nz");
  assert.equal(rule.comment.value, "# note");
  for (const token of rule.tokens)
    assert.equal(rule.raw.slice(token.start, token.end), token.value);
});

test("keeps URL fragments distinct from comments", () => {
  const rule = parseLine("/old https://example.com/new#section 301 # comment");
  assert.equal(rule.destination.value, "https://example.com/new#section");
  assert.equal(rule.comment.value, "# comment");
  assert.equal(parseLine("  # comment"), undefined);
  assert.equal(parseLine("  "), undefined);
});

test("formats standard columns exactly", () => {
  assert.equal(
    formatDocument("/old /new 301\n/blog/* /articles/:splat 302\n"),
    "/old     /new              301\n/blog/*  /articles/:splat  302\n",
  );
});

test("preserves rule tokens, order, mixed line endings, comments, and missing status", () => {
  const input =
    "# first\r\n/a\t/b\r\n/long /c 301 # keep this\n\n# query\n/shop   id=:id  /post/:id  301! Country=au,nz\r";
  const formatted = formatDocument(input);
  assert.deepEqual(signature(formatted), signature(input));
  assert.deepEqual(formatted.match(/\r\n|\n|\r/g), input.match(/\r\n|\n|\r/g));
  assert.ok(formatted.includes("# keep this"));
  assert.equal(formatted.split(/\r\n|\n|\r/)[1].trim(), "/a     /b");
  assert.equal(formatDocument(formatted), formatted);
});

test("leaves incomplete and ambiguous lines byte-for-byte unchanged", () => {
  for (const input of [
    "  /missing  ",
    "/a /b nope",
    "/a /b 301 odd",
    "/a status=301",
    "something unknown",
    "/a //example.com 301",
  ]) {
    assert.equal(formatDocument(input), input);
  }
});

test("blank lines, comments, and invalid lines bound alignment groups", () => {
  assert.equal(
    formatDocument("/a /b\n\n/longer /c\n# boundary\n/x /y\ninvalid\n/z /q"),
    "/a  /b\n\n/longer  /c\n# boundary\n/x  /y\ninvalid\n/z  /q",
  );
});

test("limits padding and permits alignment to be disabled", () => {
  const text = `/a /b 301\n/${"long".repeat(40)} /c 302`;
  assert.equal(formatDocument(text).split("\n")[0], "/a  /b  301");
  assert.equal(
    formatDocument("/a /b\n/longer /c", { columnGap: 1, maxPadding: 0 }),
    "/a /b\n/longer /c",
  );
});

test("preserves implicit status when conditions are present", () => {
  const input = "/ /en Language=en\n/ /au 302 Country=au";
  assert.deepEqual(signature(formatDocument(input)), signature(input));
});

test("formatting is stable across generated rule sets", () => {
  for (let count = 1; count <= 60; count++) {
    const text = Array.from(
      { length: count },
      (_, i) =>
        `/source-${i}\t${i % 2 ? "id=:id " : ""}/dest${i % 2 ? "/:id" : ""}${i % 3 ? " 301" : ""}${i % 4 ? "" : " # note"}`,
    ).join(count % 2 ? "\r\n" : "\n");
    const formatted = formatDocument(text);
    assert.deepEqual(signature(formatted), signature(text));
    assert.equal(formatDocument(formatted), formatted);
  }
});

test("uses common checks for absent or conflicting host configuration", () => {
  assert.equal(resolveHost("auto", false, false), "generic");
  assert.equal(resolveHost("auto", true, true), "generic");
  assert.equal(resolveHost("auto", true, false), "netlify");
  assert.equal(resolveHost("auto", false, true), "cloudflare");
  assert.equal(resolveHost("cloudflare", true, false), "cloudflare");
});

test("reports syntax errors with exact token ranges", () => {
  assert.ok(codes("/alone").includes("missing-destination"));
  const input = "/a /b 999";
  const issue = validateDocument(input, "generic")[0];
  assert.equal(issue.code, "invalid-status");
  assert.equal(input.slice(issue.start, issue.end), "999");
  assert.ok(codes("/a /b 301 Country=").includes("invalid-option"));
  assert.ok(codes("old /new").includes("invalid-source"));
});

test("warns about unknown references but accepts query captures and splats", () => {
  assert.deepEqual(codes("/a/* /b/:splat 301"), []);
  assert.deepEqual(codes("/store id=:id /blog/:id 301", "netlify"), []);
  assert.deepEqual(codes("/a/:id /b/:id?x=:id 301", "netlify"), []);
  assert.ok(codes("/a /b/:missing").includes("unknown-placeholder"));
  assert.deepEqual(codes("/a https://example.com:8080/b 301"), []);
});

test("Cloudflare checks status, force suffix, query filters, and external rewrites", () => {
  assert.deepEqual(codes("/a /b 307", "cloudflare"), []);
  assert.deepEqual(codes("/a /b", "cloudflare"), []);
  assert.ok(codes("/a /b 301!", "cloudflare").includes("cloudflare-force"));
  assert.ok(codes("/a /b 404", "cloudflare").includes("cloudflare-status"));
  assert.ok(
    codes("/a /b 302 Country=us", "cloudflare").includes(
      "cloudflare-condition",
    ),
  );
  assert.ok(
    codes("/a id=:id /b/:id 301", "cloudflare").includes(
      "cloudflare-condition",
    ),
  );
  assert.ok(
    codes("/a https://example.com 200", "cloudflare").includes(
      "cloudflare-proxy",
    ),
  );
  assert.ok(
    codes("https://example.com/a /b", "cloudflare").includes(
      "cloudflare-source",
    ),
  );
});

test("host checks do not leak into generic mode", () => {
  assert.deepEqual(codes("/a /b 307! Country=us"), []);
  assert.ok(codes("/a /b 307", "netlify").includes("netlify-307"));
  assert.deepEqual(codes("/a /b 200! Cookie=preview", "netlify"), []);
  assert.ok(codes("/a /b 308", "netlify").includes("netlify-status"));
});

test("checks host wildcard and placeholder restrictions", () => {
  assert.ok(codes("/a/*.html /b/:splat", "netlify").includes("netlify-splat"));
  assert.deepEqual(codes("/a/*.html /b/:splat", "cloudflare"), []);
  assert.ok(codes("/a/*/* /b", "cloudflare").includes("cloudflare-splat"));
  assert.ok(
    codes("/:id/:id /b/:id", "cloudflare").includes("cloudflare-placeholder"),
  );
  assert.ok(
    codes("/:id /b/:id/:id", "cloudflare").includes(
      "cloudflare-placeholder-reference",
    ),
  );
});

test("Cloudflare file limits count static and dynamic rules separately", () => {
  const staticRules = Array.from(
    { length: 2000 },
    (_, i) => `/a${i} /b${i}`,
  ).join("\n");
  assert.ok(
    !codes(staticRules, "cloudflare").includes("cloudflare-rule-limit"),
  );
  assert.ok(
    codes(staticRules + "\n/extra /target", "cloudflare").includes(
      "cloudflare-rule-limit",
    ),
  );
  const dynamicRules = Array.from(
    { length: 100 },
    (_, i) => `/a${i}/* /b/:splat`,
  ).join("\n");
  assert.ok(
    !codes(dynamicRules, "cloudflare").includes("cloudflare-rule-limit"),
  );
  assert.ok(
    codes(dynamicRules + "\n/extra/:id /b/:id", "cloudflare").includes(
      "cloudflare-rule-limit",
    ),
  );
  assert.ok(
    codes(`/a /${"b".repeat(1000)}`, "cloudflare").includes(
      "cloudflare-line-limit",
    ),
  );
});

test("duplicate checks respect conditions and Netlify slash normalization", () => {
  assert.ok(codes("/a /b\n/a /c").includes("duplicate-source"));
  assert.ok(
    !codes("/ /en 302 Language=en\n/ /fr 302 Language=fr", "netlify").includes(
      "duplicate-source",
    ),
  );
  assert.ok(codes("/a/ /b\n/a /c", "netlify").includes("duplicate-source"));
  assert.ok(!codes("/a/ /b\n/a /c", "cloudflare").includes("duplicate-source"));
});

test("self-redirect checks distinguish redirects from rewrites", () => {
  assert.ok(codes("/a /a", "cloudflare").includes("self-redirect"));
  assert.ok(codes("/a/ /a 301!", "netlify").includes("self-redirect"));
  assert.ok(!codes("/a /a 200", "cloudflare").includes("self-redirect"));
  assert.ok(!codes("/a /a", "generic").includes("self-redirect"));
});

test("hover help uses each host's default and handles unknown hosts", () => {
  const rule = parseLine("/a /b");
  assert.match(tokenHelp(rule, rule.destination, "cloudflare"), /302/);
  assert.match(tokenHelp(rule, rule.destination, "netlify"), /301/);
  assert.match(tokenHelp(rule, rule.destination, "generic"), /Select Host/);
});
