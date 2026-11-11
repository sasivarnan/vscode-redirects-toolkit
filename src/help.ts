import { defaultStatus, type Host, type Rule, type Token } from "./parser";

export const docs = {
  cloudflare:
    "https://developers.cloudflare.com/pages/configuration/redirects/",
  netlify:
    "https://docs.netlify.com/manage/routing/redirects/redirect-options/",
};

export const statusDescriptions: Record<string, string> = {
  "200": "Serve the destination without changing the browser URL (rewrite).",
  "301": "Permanent redirect. Browsers can cache this result.",
  "302": "Temporary redirect.",
  "303": "Redirect to the destination with a GET request.",
  "307":
    "Temporary redirect that preserves the request method. Not supported by Netlify.",
  "308":
    "Permanent redirect that preserves the request method. Check host support.",
  "404": "Serve a custom not-found page. Netlify only.",
};

export function tokenHelp(rule: Rule, token: Token, host: Host): string {
  let description: string;
  if (token === rule.source)
    description =
      "**Source** — The incoming path to match. `*` captures a splat; `:name` captures a named value. Rule order matters.";
  else if (token === rule.destination)
    description = `**Destination** — The local path or external URL to use. The omitted status uses **${defaultStatus(host)}**. A 200 rewrite keeps the browser URL.`;
  else if (token === rule.status) {
    const code = token.value.replace("!", "");
    description = `**${token.value}** — ${statusDescriptions[code] ?? "HTTP response status. Check host support."}`;
    if (token.value.endsWith("!"))
      description +=
        " The ! suffix forces a Netlify rule over matching assets.";
  } else if (rule.query.includes(token))
    description =
      "**Query filter** — Netlify matches this key=value pair before choosing the destination. Cloudflare Pages does not support query filters.";
  else
    description =
      "**Condition** — Netlify supports Country, Language, Role, and Cookie conditions. Separate values with commas and no spaces. Cloudflare Pages does not support these conditions.";
  if (host === "generic")
    return `${description}\n\nSelect a host with **Redirects: Select Host** for host-specific checks.\n\n[Cloudflare Pages rules](${docs.cloudflare}) · [Netlify rules](${docs.netlify})`;
  return `${description}\n\n[${host === "cloudflare" ? "Cloudflare Pages" : "Netlify"} rules](${docs[host]})`;
}
