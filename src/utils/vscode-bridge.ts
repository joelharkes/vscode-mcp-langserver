import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Resolve a file path (relative or absolute) against the workspace root.
 */
export function resolveUri(file: string): vscode.Uri {
  if (path.isAbsolute(file)) {
    return vscode.Uri.file(file);
  }
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('No workspace folder open');
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, file);
}

/**
 * Get the workspace root path, or throw if no workspace is open.
 */
export function getWorkspaceRoot(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('No workspace folder open');
  }
  return workspaceFolder.uri.fsPath;
}

/**
 * Convert a file URI to a path relative to the workspace root.
 */
export function toRelativePath(uri: vscode.Uri): string {
  const root = getWorkspaceRoot();
  const filePath = uri.fsPath;
  if (filePath.startsWith(root)) {
    return path.relative(root, filePath);
  }
  return filePath;
}

/**
 * Convert a VSCode Location to a plain JSON object.
 */
export function locationToJson(loc: vscode.Location) {
  return {
    file: toRelativePath(loc.uri),
    line: loc.range.start.line,
    character: loc.range.start.character,
    endLine: loc.range.end.line,
    endCharacter: loc.range.end.character,
  };
}

/**
 * Convert a VSCode Diagnostic to a plain JSON object.
 */
export function diagnosticToJson(diag: vscode.Diagnostic, uri: vscode.Uri) {
  const severityMap: Record<number, string> = {
    [vscode.DiagnosticSeverity.Error]: 'Error',
    [vscode.DiagnosticSeverity.Warning]: 'Warning',
    [vscode.DiagnosticSeverity.Information]: 'Information',
    [vscode.DiagnosticSeverity.Hint]: 'Hint',
  };

  return {
    file: toRelativePath(uri),
    line: diag.range.start.line,
    character: diag.range.start.character,
    endLine: diag.range.end.line,
    endCharacter: diag.range.end.character,
    message: diag.message,
    severity: severityMap[diag.severity] ?? 'Unknown',
    source: diag.source ?? undefined,
    code: typeof diag.code === 'object' ? String(diag.code.value) : diag.code !== undefined ? String(diag.code) : undefined,
  };
}

/**
 * Extract text content from a Hover result.
 */
export function hoverToStrings(hover: vscode.Hover): string[] {
  return hover.contents.map((content) => {
    if (typeof content === 'string') {
      return content;
    }
    if (content instanceof vscode.MarkdownString) {
      return content.value;
    }
    // MarkedString with language
    return `\`\`\`${content.language}\n${content.value}\n\`\`\``;
  });
}

/**
 * Convert a WorkspaceEdit to a plain JSON object.
 */
export function workspaceEditToJson(edit: vscode.WorkspaceEdit) {
  const changes: Array<{ file: string; edits: Array<{ range: object; newText: string }> }> = [];

  for (const [uri, textEdits] of edit.entries()) {
    changes.push({
      file: toRelativePath(uri),
      edits: textEdits
        .filter((e): e is vscode.TextEdit => e instanceof vscode.TextEdit)
        .map((e) => ({
          range: {
            startLine: e.range.start.line,
            startCharacter: e.range.start.character,
            endLine: e.range.end.line,
            endCharacter: e.range.end.character,
          },
          newText: e.newText,
        })),
    });
  }

  return { changes };
}
