import { canFormat, parseLine, type Rule } from "./parser";

export interface FormatOptions {
  columnGap?: number;
  maxPadding?: number;
}

function columns(rule: Rule): string[] {
  return [
    [rule.source, ...rule.query].map((token) => token.value).join(" "),
    rule.destination!.value,
    rule.status?.value ?? "",
    rule.options.map((token) => token.value).join(" "),
  ];
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  return Number.isInteger(value)
    ? Math.max(min, Math.min(max, value!))
    : fallback;
}

export function formatDocument(
  text: string,
  options: FormatOptions = {},
): string {
  const gap = boundedInteger(options.columnGap, 2, 1, 8);
  const maxPadding = boundedInteger(options.maxPadding, 40, 0, 120);
  const lines = text.split(/(\r\n|\n|\r)/);
  let group: { index: number; rule: Rule; columns: string[] }[] = [];
  const flush = () => {
    if (!group.length) return;
    const widths = [0, 0, 0, 0];
    for (const row of group) {
      row.columns.forEach((value, index) => {
        widths[index] = Math.max(widths[index], value.length);
      });
    }
    for (const row of group) {
      const last = row.columns.findLastIndex((value) => value !== "");
      let result = "";
      row.columns.forEach((value, index) => {
        if (!value) return;
        result += value;
        if (index < last) {
          const padding = widths[index] - value.length;
          result += " ".repeat(gap + (padding <= maxPadding ? padding : 0));
        }
      });
      if (row.rule.comment) result += " ".repeat(gap) + row.rule.comment.value;
      lines[row.index] = result;
    }
    group = [];
  };
  for (let index = 0; index < lines.length; index += 2) {
    const rule = parseLine(lines[index]);
    if (!rule || !canFormat(rule)) {
      flush();
      continue;
    }
    group.push({ index, rule, columns: columns(rule) });
  }
  flush();
  return lines.join("");
}
