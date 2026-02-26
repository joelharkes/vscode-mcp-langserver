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
 * Format a Location as a 1-based "file:line:col" string.
 */
export function formatLocation(loc: vscode.Location): string {
  return `${toRelativePath(loc.uri)}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`;
}

/**
 * Normalize a Location or LocationLink to a Location.
 */
export function normalizeLocation(item: vscode.Location | vscode.LocationLink): vscode.Location {
  if ('targetUri' in item) {
    return new vscode.Location(item.targetUri, item.targetRange);
  }
  return item;
}

/**
 * Format a list of locations grouped by file (1-based lines).
 */
export function formatLocationsGrouped(locations: vscode.Location[], label: string): string {
  if (locations.length === 0) {
    return `No ${label} found.`;
  }

  // Group by file
  const byFile = new Map<string, Array<{ line: number; col: number }>>();
  for (const loc of locations) {
    const file = toRelativePath(loc.uri);
    if (!byFile.has(file)) {
      byFile.set(file, []);
    }
    byFile.get(file)!.push({
      line: loc.range.start.line + 1,
      col: loc.range.start.character + 1,
    });
  }

  const fileCount = byFile.size;
  const summary = `${locations.length} ${label} in ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;

  const lines: string[] = [summary, ''];
  for (const [file, positions] of byFile) {
    lines.push(file);
    for (const pos of positions) {
      lines.push(`  ${pos.line}:${pos.col}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
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
 * Map SymbolKind enum to readable string.
 */
export function symbolKindName(kind: vscode.SymbolKind): string {
  const names: Record<number, string> = {
    [vscode.SymbolKind.File]: 'File',
    [vscode.SymbolKind.Module]: 'Module',
    [vscode.SymbolKind.Namespace]: 'Namespace',
    [vscode.SymbolKind.Package]: 'Package',
    [vscode.SymbolKind.Class]: 'Class',
    [vscode.SymbolKind.Method]: 'Method',
    [vscode.SymbolKind.Property]: 'Property',
    [vscode.SymbolKind.Field]: 'Field',
    [vscode.SymbolKind.Constructor]: 'Constructor',
    [vscode.SymbolKind.Enum]: 'Enum',
    [vscode.SymbolKind.Interface]: 'Interface',
    [vscode.SymbolKind.Function]: 'Function',
    [vscode.SymbolKind.Variable]: 'Variable',
    [vscode.SymbolKind.Constant]: 'Constant',
    [vscode.SymbolKind.String]: 'String',
    [vscode.SymbolKind.Number]: 'Number',
    [vscode.SymbolKind.Boolean]: 'Boolean',
    [vscode.SymbolKind.Array]: 'Array',
    [vscode.SymbolKind.Object]: 'Object',
    [vscode.SymbolKind.Key]: 'Key',
    [vscode.SymbolKind.Null]: 'Null',
    [vscode.SymbolKind.EnumMember]: 'EnumMember',
    [vscode.SymbolKind.Struct]: 'Struct',
    [vscode.SymbolKind.Event]: 'Event',
    [vscode.SymbolKind.Operator]: 'Operator',
    [vscode.SymbolKind.TypeParameter]: 'TypeParameter',
  };
  return names[kind] ?? 'Unknown';
}

/**
 * Map CompletionItemKind enum to readable string.
 */
export function completionKindName(kind: vscode.CompletionItemKind | undefined): string {
  if (kind === undefined) return '';
  const names: Record<number, string> = {
    [vscode.CompletionItemKind.Text]: 'Text',
    [vscode.CompletionItemKind.Method]: 'Method',
    [vscode.CompletionItemKind.Function]: 'Function',
    [vscode.CompletionItemKind.Constructor]: 'Constructor',
    [vscode.CompletionItemKind.Field]: 'Field',
    [vscode.CompletionItemKind.Variable]: 'Variable',
    [vscode.CompletionItemKind.Class]: 'Class',
    [vscode.CompletionItemKind.Interface]: 'Interface',
    [vscode.CompletionItemKind.Module]: 'Module',
    [vscode.CompletionItemKind.Property]: 'Property',
    [vscode.CompletionItemKind.Unit]: 'Unit',
    [vscode.CompletionItemKind.Value]: 'Value',
    [vscode.CompletionItemKind.Enum]: 'Enum',
    [vscode.CompletionItemKind.Keyword]: 'Keyword',
    [vscode.CompletionItemKind.Snippet]: 'Snippet',
    [vscode.CompletionItemKind.Color]: 'Color',
    [vscode.CompletionItemKind.File]: 'File',
    [vscode.CompletionItemKind.Reference]: 'Reference',
    [vscode.CompletionItemKind.Folder]: 'Folder',
    [vscode.CompletionItemKind.EnumMember]: 'EnumMember',
    [vscode.CompletionItemKind.Constant]: 'Constant',
    [vscode.CompletionItemKind.Struct]: 'Struct',
    [vscode.CompletionItemKind.Event]: 'Event',
    [vscode.CompletionItemKind.Operator]: 'Operator',
    [vscode.CompletionItemKind.TypeParameter]: 'TypeParameter',
  };
  return names[kind] ?? '';
}

/**
 * Format a DocumentSymbol tree as indented text (1-based lines).
 */
export function formatSymbolTree(symbols: vscode.DocumentSymbol[], indent: number = 0): string[] {
  const lines: string[] = [];
  const pad = '  '.repeat(indent);
  for (const sym of symbols) {
    const kind = symbolKindName(sym.kind);
    const startLine = sym.range.start.line + 1;
    const startCol = sym.range.start.character + 1;
    const endLine = sym.range.end.line + 1;
    const endCol = sym.range.end.character + 1;
    lines.push(`${pad}${sym.name}  ${kind}  ${startLine}:${startCol}-${endLine}:${endCol}`);
    if (sym.children && sym.children.length > 0) {
      lines.push(...formatSymbolTree(sym.children, indent + 1));
    }
  }
  return lines;
}

/**
 * Count all symbols including nested children.
 */
export function countSymbols(symbols: vscode.DocumentSymbol[]): number {
  let count = 0;
  for (const sym of symbols) {
    count++;
    if (sym.children) {
      count += countSymbols(sym.children);
    }
  }
  return count;
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
