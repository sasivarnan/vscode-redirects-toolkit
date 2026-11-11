const assert = require("node:assert/strict");
const vscode = require("vscode");

async function diagnosticsWhen(uri, predicate) {
  const current = vscode.languages.getDiagnostics(uri);
  if (predicate(current)) return current;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error("Expected diagnostics did not arrive."));
    }, 5000);
    const subscription = vscode.languages.onDidChangeDiagnostics(() => {
      const diagnostics = vscode.languages.getDiagnostics(uri);
      if (predicate(diagnostics)) {
        clearTimeout(timer);
        subscription.dispose();
        resolve(diagnostics);
      }
    });
    const latest = vscode.languages.getDiagnostics(uri);
    if (predicate(latest)) {
      clearTimeout(timer);
      subscription.dispose();
      resolve(latest);
    }
  });
}

exports.run = async () => {
  const extension = vscode.extensions.getExtension(
    "sasivarnan.redirects-toolkit",
  );
  assert.ok(extension, "Extension is registered");
  await extension.activate();
  const folder = vscode.workspace.workspaceFolders[0].uri;
  const file = vscode.Uri.joinPath(folder, "_redirects");
  const document = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(document);
  assert.equal(
    document.languageId,
    "redirects",
    "Filename selects the language",
  );

  const settings = vscode.workspace.getConfiguration("redirects", document.uri);
  const previousHost = settings.inspect("host").workspaceFolderValue;
  const previousValidation =
    settings.inspect("validation.enabled").workspaceFolderValue;
  try {
    await settings.update(
      "host",
      "cloudflare",
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    const edits = await vscode.commands.executeCommand(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      { tabSize: 2, insertSpaces: true },
    );
    assert.ok(edits.length > 0, "Format Document is registered");
    const change = new vscode.WorkspaceEdit();
    change.set(document.uri, edits);
    assert.ok(await vscode.workspace.applyEdit(change));
    assert.ok(
      document.getText().includes("/old     /new"),
      "Formatting aligns columns",
    );

    const replace = async (text) => {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length),
        ),
        text,
      );
      assert.ok(await vscode.workspace.applyEdit(edit));
    };
    await replace("/a /b 301!\n/blog/* /posts/:splat 302\n");
    const problems = await diagnosticsWhen(document.uri, (items) =>
      items.some((item) => item.code === "cloudflare-force"),
    );
    assert.ok(problems.some((item) => item.range.start.line === 0));
    const hovers = await vscode.commands.executeCommand(
      "vscode.executeHoverProvider",
      document.uri,
      new vscode.Position(0, 7),
    );
    assert.ok(
      hovers.some((hover) =>
        hover.contents.some((content) => /301/.test(content.value)),
      ),
    );
    const commentHovers = await vscode.commands.executeCommand(
      "vscode.executeHoverProvider",
      document.uri,
      new vscode.Position(2, 0),
    );
    assert.equal(commentHovers.length, 0);

    await settings.update(
      "host",
      "netlify",
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await diagnosticsWhen(document.uri, (items) => items.length === 0);
    await replace("/a /b ");
    const completions = await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      document.uri,
      new vscode.Position(0, 6),
    );
    assert.ok(completions.items.some((item) => item.label === "301"));
    assert.ok(!completions.items.some((item) => item.label === "307"));
    await replace("/blog/* /posts/:");
    const captures = await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      document.uri,
      new vscode.Position(0, document.getText().length),
    );
    assert.ok(captures.items.some((item) => item.label === "splat"));

    await replace("/missing");
    await diagnosticsWhen(document.uri, (items) =>
      items.some((item) => item.code === "missing-destination"),
    );
    await settings.update(
      "validation.enabled",
      false,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await diagnosticsWhen(document.uri, (items) => items.length === 0);
    await settings.update(
      "validation.enabled",
      true,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await settings.update(
      "host",
      "auto",
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await replace("/a /b 307");
    await diagnosticsWhen(document.uri, (items) => items.length === 0);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(folder, "netlify.toml"),
      new TextEncoder().encode("[build]\n"),
    );
    await diagnosticsWhen(document.uri, (items) =>
      items.some((item) => item.code === "netlify-307"),
    );
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(folder, "wrangler.toml"),
      new TextEncoder().encode('name = "test"\n'),
    );
    await diagnosticsWhen(document.uri, (items) => items.length === 0);
    await vscode.workspace.fs.delete(
      vscode.Uri.joinPath(folder, "netlify.toml"),
    );
    await replace("/a /b 301!");
    await diagnosticsWhen(document.uri, (items) =>
      items.some((item) => item.code === "cloudflare-force"),
    );
    console.log(
      "Editor checks passed: activation, filename, formatting, diagnostics, host change, hover, completions, validation toggle, automatic host detection, config create/delete/conflict.",
    );
  } finally {
    await settings.update(
      "host",
      previousHost,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await settings.update(
      "validation.enabled",
      previousValidation,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await vscode.commands.executeCommand(
      "workbench.action.revertAndCloseActiveEditor",
    );
  }
};
