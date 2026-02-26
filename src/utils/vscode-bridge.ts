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

const severityMap: Record<number, string> = {
  [vscode.DiagnosticSeverity.Error]: 'error',
  [vscode.DiagnosticSeverity.Warning]: 'warning',
  [vscode.DiagnosticSeverity.Information]: 'info',
  [vscode.DiagnosticSeverity.Hint]: 'hint',
};

/**
 * Format a single diagnostic as a compiler-style line (1-based line numbers).
 */
function formatDiagnosticLine(diag: vscode.Diagnostic): string {
  const line = diag.range.start.line + 1;
  const col = diag.range.start.character + 1;
  const severity = severityMap[diag.severity] ?? 'unknown';
  const source = diag.source ?? '';
  const code = typeof diag.code === 'object' ? String(diag.code.value) : diag.code !== undefined ? String(diag.code) : '';
  const prefix = source && code ? `${source}(${code})` : source || code || '';
  const tag = prefix ? `${severity} ${prefix}` : severity;

  let result = `  ${line}:${col}  ${tag}: ${diag.message}`;

  if (diag.relatedInformation && diag.relatedInformation.length > 0) {
    for (const related of diag.relatedInformation) {
      const relFile = toRelativePath(related.location.uri);
      const relLine = related.location.range.start.line + 1;
      const relCol = related.location.range.start.character + 1;
      result += `\n    → ${relFile}:${relLine}:${relCol}: ${related.message}`;
    }
  }

  return result;
}

/**
 * Format grouped diagnostics into a compiler-style text report.
 * Groups by file, uses 1-based line numbers, includes summary.
 */
export function formatDiagnosticsReport(
  diagnostics: Array<[vscode.Uri, readonly vscode.Diagnostic[]]>
): string {
  const filtered = diagnostics.filter(([, diags]) => diags.length > 0);

  if (filtered.length === 0) {
    return 'No diagnostics found.';
  }

  // Count by severity
  const counts: Record<string, number> = {};
  let total = 0;
  for (const [, diags] of filtered) {
    for (const d of diags) {
      const sev = severityMap[d.severity] ?? 'unknown';
      counts[sev] = (counts[sev] || 0) + 1;
      total++;
    }
  }

  // Summary line
  const parts: string[] = [];
  for (const sev of ['error', 'warning', 'info', 'hint']) {
    if (counts[sev]) {
      parts.push(`${counts[sev]} ${counts[sev] === 1 ? sev : sev + 's'}`);
    }
  }
  const summary = `${parts.join(', ')} in ${filtered.length} ${filtered.length === 1 ? 'file' : 'files'}`;

  // Build report
  const lines: string[] = [summary, ''];
  for (const [uri, diags] of filtered) {
    lines.push(toRelativePath(uri));
    for (const d of diags) {
      lines.push(formatDiagnosticLine(d));
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
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
