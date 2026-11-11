import {
  canFormat,
  conditionNames,
  defaultStatus,
  isAssignment,
  isLocation,
  parseDocument,
  placeholders,
  type Host,
  type Rule,
  type Token,
} from "./parser";

export interface Issue {
  line: number;
  start: number;
  end: number;
  severity: "error" | "warning";
  code: string;
  message: string;
}

export const cloudflareCodes = [200, 301, 302, 303, 307, 308];
export const netlifyCommonCodes = [200, 301, 302, 404];

export function validateDocument(text: string, host: Host): Issue[] {
  const issues: Issue[] = [];
  const rules = parseDocument(text);
  const seen = new Map<string, Rule>();
  let staticCount = 0;
  let dynamicCount = 0;
  const report = (
    rule: Rule,
    token: Token,
    code: string,
    message: string,
    severity: Issue["severity"] = "error",
  ) => {
    issues.push({
      line: rule.line,
      start: token.start,
      end: token.end,
      severity,
      code,
      message,
    });
  };

  for (const rule of rules) {
    const { source, destination, status } = rule;
    if (!destination) {
      report(
        rule,
        source,
        "missing-destination",
        "Add a destination path or URL after the source and any query filters.",
      );
      continue;
    }
    if (!isLocation(source.value))
      report(
        rule,
        source,
        "invalid-source",
        "Start the source with / or an http:// or https:// URL.",
      );
    if (!isLocation(destination.value))
      report(
        rule,
        destination,
        "invalid-destination",
        "Use a destination path starting with / or an http:// or https:// URL.",
      );
    if (status && !/^[1-5]\d{2}!?$/.test(status.value))
      report(
        rule,
        status,
        "invalid-status",
        "Use a three-digit HTTP status code, with an optional Netlify ! suffix.",
      );
    for (const option of [...rule.query, ...rule.options]) {
      if (!isAssignment(option.value) || option.value.endsWith("="))
        report(
          rule,
          option,
          "invalid-option",
          "Use a non-empty key=value pair without spaces around =.",
        );
    }
    if (source.value.includes("#"))
      report(
        rule,
        source,
        "source-fragment",
        "URL fragments do not reach the server. This source fragment cannot match a request.",
        "warning",
      );
    if (!canFormat(rule)) continue;

    const captures = new Set(placeholders(source.value));
    for (const query of rule.query)
      placeholders(query.value).forEach((name) => captures.add(name));
    if (source.value.includes("*")) captures.add("splat");
    for (const name of new Set(placeholders(destination.value))) {
      if (!captures.has(name))
        report(
          rule,
          destination,
          "unknown-placeholder",
          `:${name} has no matching source or query placeholder. If it is literal text, URL-encode the colon.`,
          "warning",
        );
    }

    const code = Number(status?.value.replace("!", "") ?? defaultStatus(host));
    if (host === "cloudflare") {
      if (!source.value.startsWith("/"))
        report(
          rule,
          source,
          "cloudflare-source",
          "Cloudflare Pages requires a source path. Domain-level source URLs are not supported.",
        );
      if (status?.value.endsWith("!"))
        report(
          rule,
          status,
          "cloudflare-force",
          "Cloudflare Pages does not support Netlify's ! suffix. Its redirects already take priority over matching assets.",
        );
      if (!cloudflareCodes.includes(code))
        report(
          rule,
          status ?? source,
          "cloudflare-status",
          "Cloudflare Pages supports 200, 301, 302, 303, 307, and 308 in _redirects.",
        );
      if (rule.query.length || rule.options.length)
        report(
          rule,
          rule.query[0] ?? rule.options[0],
          "cloudflare-condition",
          "Cloudflare Pages does not support query matching or Netlify conditions in _redirects.",
        );
      if (code === 200 && !destination.value.startsWith("/"))
        report(
          rule,
          destination,
          "cloudflare-proxy",
          "Cloudflare Pages 200 rewrites must use a local destination path.",
        );
      if ((source.value.match(/\*/g) ?? []).length > 1)
        report(
          rule,
          source,
          "cloudflare-splat",
          "Cloudflare Pages allows only one * in a source.",
        );
      const sourceNames = placeholders(source.value);
      if (sourceNames.length !== new Set(sourceNames).size)
        report(
          rule,
          source,
          "cloudflare-placeholder",
          "Use each named source placeholder only once.",
        );
      const destinationNames = placeholders(destination.value);
      if (destinationNames.length !== new Set(destinationNames).size)
        report(
          rule,
          destination,
          "cloudflare-placeholder-reference",
          "Reference each destination placeholder only once on Cloudflare Pages.",
        );
      if (rule.raw.length > 1000)
        report(
          rule,
          source,
          "cloudflare-line-limit",
          "This rule exceeds Cloudflare Pages' 1,000-character line limit.",
        );
      const dynamic = source.value.includes("*") || sourceNames.length > 0;
      if (dynamic) dynamicCount++;
      else staticCount++;
      if ((dynamic && dynamicCount > 100) || (!dynamic && staticCount > 2000))
        report(
          rule,
          source,
          "cloudflare-rule-limit",
          `Cloudflare Pages allows 2,000 static rules and 100 dynamic rules. This ${dynamic ? "dynamic" : "static"} rule exceeds the limit.`,
        );
    }

    if (host === "netlify") {
      if (code === 307)
        report(
          rule,
          status ?? source,
          "netlify-307",
          "Netlify documents 307 as unsupported. Use 302 for a temporary redirect.",
        );
      else if (!netlifyCommonCodes.includes(code))
        report(
          rule,
          status ?? source,
          "netlify-status",
          "This code is outside the common documented Netlify codes (200, 301, 302, 404). Check Netlify support before deployment.",
          "warning",
        );
      if (
        source.value.includes("*") &&
        (!source.value.endsWith("*") ||
          (source.value.match(/\*/g) ?? []).length > 1)
      )
        report(
          rule,
          source,
          "netlify-splat",
          "Use one * at the end of the Netlify source path.",
        );
      for (const option of rule.options) {
        const key = option.value.split("=")[0];
        if (!conditionNames.includes(key))
          report(
            rule,
            option,
            "netlify-option",
            `Unknown condition ${key}. Supported suggestions are Country, Language, Role, and Cookie. Check the host documentation.`,
            "warning",
          );
      }
    }

    if (!rule.query.length && !rule.options.length) {
      const key =
        host === "netlify" ? source.value.replace(/\/$/, "") : source.value;
      const previous = seen.get(key);
      if (previous)
        report(
          rule,
          source,
          "duplicate-source",
          `An unconditional rule for this source already appears on line ${previous.line + 1}. Check which rule should apply.`,
          "warning",
        );
      else seen.set(key, rule);
      const destinationKey =
        host === "netlify"
          ? destination.value.replace(/\/$/, "")
          : destination.value;
      if (
        host !== "generic" &&
        code >= 300 &&
        code < 400 &&
        key === destinationKey &&
        !source.value.includes("*") &&
        !placeholders(source.value).length
      )
        report(
          rule,
          destination,
          "self-redirect",
          "This redirect points to the same URL and can cause a loop. Check asset and host behavior.",
          "warning",
        );
    }
  }
  return issues;
}
