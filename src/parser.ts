export type Host = "generic" | "cloudflare" | "netlify";
export type HostSetting = Host | "auto";

export interface Token {
  value: string;
  start: number;
  end: number;
}

export interface Rule {
  line: number;
  raw: string;
  source: Token;
  query: Token[];
  destination?: Token;
  status?: Token;
  options: Token[];
  comment?: Token;
  tokens: Token[];
}

export const conditionNames = ["Country", "Language", "Role", "Cookie"];

export function isAssignment(value: string): boolean {
  return /^[^/=?#\s]+=[^\s]*$/.test(value);
}

export function parseLine(raw: string, line = 0): Rule | undefined {
  const all = Array.from(raw.matchAll(/\S+/g), (match) => ({
    value: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
  const commentIndex = all.findIndex((token) => token.value.startsWith("#"));
  const tokens = commentIndex < 0 ? all : all.slice(0, commentIndex);
  if (!tokens.length) return undefined;
  const commentStart = all[commentIndex]?.start;
  const comment =
    commentStart === undefined
      ? undefined
      : {
          value: raw.slice(commentStart),
          start: commentStart,
          end: raw.length,
        };
  const source = tokens[0];
  let cursor = 1;
  const query: Token[] = [];
  while (tokens[cursor] && isAssignment(tokens[cursor].value)) {
    query.push(tokens[cursor++]);
  }
  const destination = tokens[cursor++];
  const candidate = tokens[cursor];
  const status =
    candidate && !isAssignment(candidate.value) ? tokens[cursor++] : undefined;
  return {
    line,
    raw,
    source,
    query,
    destination,
    status,
    options: tokens.slice(cursor),
    comment,
    tokens,
  };
}

export function parseDocument(text: string): Rule[] {
  return text.split(/\r\n|\n|\r/).flatMap((line, index) => {
    const rule = parseLine(line, index);
    return rule ? [rule] : [];
  });
}

export function isLocation(value: string): boolean {
  return (
    /^\/(?!\/)/.test(value) || /^https?:\/\/[^/\s?#]+(?:[/?#]|$)/i.test(value)
  );
}

export function canFormat(rule: Rule): boolean {
  return (
    isLocation(rule.source.value) &&
    !!rule.destination &&
    isLocation(rule.destination.value) &&
    (!rule.status || /^[1-5]\d{2}!?$/.test(rule.status.value)) &&
    [...rule.query, ...rule.options].every(
      (option) => isAssignment(option.value) && !option.value.endsWith("="),
    )
  );
}

export function placeholders(value: string): string[] {
  return Array.from(
    value.matchAll(/(?:^|[/.=?&#-]):([A-Za-z]\w*)/g),
    (match) => match[1],
  );
}

export function resolveHost(
  setting: HostSetting,
  hasNetlify: boolean,
  hasCloudflare: boolean,
): Host {
  if (setting !== "auto") return setting;
  if (hasNetlify === hasCloudflare) return "generic";
  return hasNetlify ? "netlify" : "cloudflare";
}

export function defaultStatus(host: Host): string {
  return host === "cloudflare"
    ? "302"
    : host === "netlify"
      ? "301"
      : "host default";
}
