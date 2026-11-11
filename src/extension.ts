import * as vscode from "vscode";
import { formatDocument } from "./formatter";
import { statusDescriptions, tokenHelp } from "./help";
import {
  conditionNames,
  parseLine,
  placeholders,
  resolveHost,
  type Host,
  type HostSetting,
} from "./parser";
import {
  cloudflareCodes,
  netlifyCommonCodes,
  validateDocument,
} from "./validation";

const selector: vscode.DocumentSelector = { language: "redirects" };
const hostLabels: Record<Host, string> = {
  generic: "Common syntax",
  cloudflare: "Cloudflare Pages",
  netlify: "Netlify",
};

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("redirects");
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    20,
  );
  statusBar.command = "redirects.selectHost";
  const hosts = new Map<string, { netlify: boolean; cloudflare: boolean }>();
  let refreshVersion = 0;
  const config = (uri: vscode.Uri) =>
    vscode.workspace.getConfiguration("redirects", uri);
  const hostFor = (uri: vscode.Uri): Host => {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const detected = folder ? hosts.get(folder.uri.toString()) : undefined;
    const setting = config(uri).get<HostSetting>("host", "auto");
    return resolveHost(
      setting,
      detected?.netlify ?? false,
      detected?.cloudflare ?? false,
    );
  };
  const updateStatus = () => {
    const document = vscode.window.activeTextEditor?.document;
    if (document?.languageId !== "redirects") {
      statusBar.hide();
      return;
    }
    const host = hostFor(document.uri);
    const auto = config(document.uri).get<string>("host", "auto") === "auto";
    statusBar.text = `$(arrow-right) Redirects: ${hostLabels[host]}`;
    statusBar.tooltip = `${auto ? "Auto: " : ""}${hostLabels[host]}. Select the host rules to check.`;
    statusBar.accessibilityInformation = {
      label: `Redirects host: ${hostLabels[host]}. Select host.`,
    };
    statusBar.show();
  };
  const validate = (document: vscode.TextDocument) => {
    if (document.languageId !== "redirects") {
      diagnostics.delete(document.uri);
      return;
    }
    if (!config(document.uri).get<boolean>("validation.enabled", true)) {
      diagnostics.delete(document.uri);
      return;
    }
    const results = validateDocument(
      document.getText(),
      hostFor(document.uri),
    ).map((issue) => {
      const range = new vscode.Range(
        issue.line,
        issue.start,
        issue.line,
        issue.end,
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        issue.message,
        issue.severity === "error"
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = "Redirects Toolkit";
      diagnostic.code = issue.code;
      return diagnostic;
    });
    diagnostics.set(document.uri, results);
  };
  const validateAll = () => {
    vscode.workspace.textDocuments.forEach(validate);
    updateStatus();
  };
  const exists = async (uri: vscode.Uri) => {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  };
  const refreshHosts = async () => {
    const version = ++refreshVersion;
    const entries = await Promise.all(
      (vscode.workspace.workspaceFolders ?? []).map(async (folder) => {
        const [netlify, ...cloudflare] = await Promise.all(
          [
            "netlify.toml",
            "wrangler.toml",
            "wrangler.json",
            "wrangler.jsonc",
          ].map((name) => exists(vscode.Uri.joinPath(folder.uri, name))),
        );
        return [
          folder.uri.toString(),
          { netlify, cloudflare: cloudflare.some(Boolean) },
        ] as const;
      }),
    );
    if (version !== refreshVersion) return;
    hosts.clear();
    for (const [uri, detected] of entries) hosts.set(uri, detected);
    validateAll();
  };

  context.subscriptions.push(
    diagnostics,
    statusBar,
    vscode.languages.registerDocumentFormattingEditProvider(selector, {
      provideDocumentFormattingEdits(document) {
        const settings = config(document.uri);
        const original = document.getText();
        const formatted = formatDocument(original, {
          columnGap: settings.get<number>("format.columnGap", 2),
          maxPadding: settings.get<number>("format.maxPadding", 40),
        });
        return formatted === original
          ? []
          : [
              vscode.TextEdit.replace(
                new vscode.Range(
                  document.positionAt(0),
                  document.positionAt(original.length),
                ),
                formatted,
              ),
            ];
      },
    }),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        const rule = parseLine(
          document.lineAt(position.line).text,
          position.line,
        );
        const token = rule?.tokens.find(
          (item) =>
            position.character >= item.start && position.character < item.end,
        );
        if (!rule || !token) return undefined;
        return new vscode.Hover(
          new vscode.MarkdownString(
            tokenHelp(rule, token, hostFor(document.uri)),
          ),
          new vscode.Range(
            position.line,
            token.start,
            position.line,
            token.end,
          ),
        );
      },
    }),
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        provideCompletionItems(document, position) {
          const text = document.lineAt(position.line).text;
          const rule = parseLine(text, position.line);
          if (
            !rule ||
            (rule.comment && position.character >= rule.comment.start)
          )
            return [];
          const prefix = text.slice(0, position.character);
          const start = prefix.search(/\S*$/);
          const current = text.slice(start).match(/^\S*/)?.[0] ?? "";
          const range = new vscode.Range(
            position.line,
            start,
            position.line,
            start + current.length,
          );
          if (prefix.endsWith(":")) {
            const names = new Set(placeholders(rule.source.value));
            rule.query.forEach((token) =>
              placeholders(token.value).forEach((name) => names.add(name)),
            );
            if (rule.source.value.includes("*")) names.add("splat");
            if (!rule.destination || position.character <= rule.source.end)
              return [];
            return [...names].map((name) => {
              const item = new vscode.CompletionItem(
                name,
                vscode.CompletionItemKind.Variable,
              );
              item.range = new vscode.Range(
                position.line,
                position.character,
                position.line,
                position.character,
              );
              item.detail = "Captured source or query value";
              return item;
            });
          }
          if (!rule.destination || position.character <= rule.destination.end)
            return [];
          const host = hostFor(document.uri);
          const items: vscode.CompletionItem[] = [];
          if (!rule.status || start === rule.status.start) {
            const codes =
              host === "cloudflare"
                ? cloudflareCodes
                : host === "netlify"
                  ? netlifyCommonCodes
                  : [...new Set([...cloudflareCodes, ...netlifyCommonCodes])];
            for (const code of codes) {
              const item = new vscode.CompletionItem(
                String(code),
                vscode.CompletionItemKind.Value,
              );
              item.detail = statusDescriptions[String(code)];
              item.range = range;
              items.push(item);
            }
          }
          if (host === "netlify") {
            for (const name of conditionNames) {
              const item = new vscode.CompletionItem(
                `${name}=`,
                vscode.CompletionItemKind.Property,
              );
              item.range = range;
              items.push(item);
            }
          }
          return items;
        },
      },
      ":",
      " ",
    ),
    vscode.commands.registerCommand("redirects.selectHost", async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (document?.languageId !== "redirects") return;
      const selections: (vscode.QuickPickItem & { host: HostSetting })[] = [
        {
          label: "Auto",
          description:
            "Detect root config files; use common checks if uncertain",
          host: "auto",
        },
        {
          label: "Cloudflare Pages",
          description: "Check Cloudflare Pages rules",
          host: "cloudflare",
        },
        {
          label: "Netlify",
          description: "Check Netlify rules",
          host: "netlify",
        },
        {
          label: "Common syntax",
          description: "Check syntax without host-specific limits",
          host: "generic",
        },
      ];
      const selection = await vscode.window.showQuickPick(selections, {
        title: "Redirects: Select Host",
        placeHolder:
          "Apply to this workspace folder (or user settings for a loose file)",
      });
      if (!selection) return;
      const target = vscode.workspace.getWorkspaceFolder(document.uri)
        ? vscode.ConfigurationTarget.WorkspaceFolder
        : vscode.ConfigurationTarget.Global;
      await config(document.uri).update("host", selection.host, target);
    }),
    vscode.workspace.onDidOpenTextDocument(validate),
    vscode.workspace.onDidChangeTextDocument((event) =>
      validate(event.document),
    ),
    vscode.workspace.onDidCloseTextDocument((document) =>
      diagnostics.delete(document.uri),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("redirects")) validateAll();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refreshHosts();
    }),
    vscode.window.onDidChangeActiveTextEditor(updateStatus),
  );
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/{netlify.toml,wrangler.toml,wrangler.json,wrangler.jsonc}",
  );
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(() => {
      void refreshHosts();
    }),
    watcher.onDidDelete(() => {
      void refreshHosts();
    }),
  );
  validateAll();
  void refreshHosts();
}
