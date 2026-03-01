import * as vscode from 'vscode';
import { z } from 'zod';
import { toRelativePath, formatImportsReport } from '../utils/vscode-bridge';
import { parseImports, supportedLanguages } from '../utils/import-parser';
import { fileParam } from '../utils/position';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  file: fileParam.optional().describe('Single file path (relative to workspace root or absolute)'),
  glob: z
    .string()
    .optional()
    .describe('Glob pattern to match multiple files (e.g. "src/useCases/**/*.ts")'),
  limit: z.number().int().min(1).optional().describe('Max files to process (default 100)'),
};

export function registerFindImportsTool(server: ToolServer) {
  registerTool(
    server,
    'find_imports',
    'Extract import/require statements from one or more files. Regex-based, supports JS/TS, Python, Go, Rust, Java/Kotlin, C/C++. Provide either a file path or a glob pattern (or both).',
    schema,
    async ({ file, glob, limit }: { file?: string; glob?: string; limit?: number }) => {
      if (!file && !glob) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: provide at least one of "file" or "glob" parameters.',
            },
          ],
        };
      }

      const maxFiles = limit ?? 100;
      const uris: vscode.Uri[] = [];

      // Collect URIs from file param
      if (file) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          return {
            content: [{ type: 'text' as const, text: 'Error: no workspace folder open.' }],
          };
        }
        const uri = file.startsWith('/')
          ? vscode.Uri.file(file)
          : vscode.Uri.joinPath(workspaceFolder.uri, file);
        uris.push(uri);
      }

      // Collect URIs from glob param
      if (glob) {
        const found = await vscode.workspace.findFiles(glob, '**/node_modules/**', maxFiles);
        uris.push(...found);
      }

      // Deduplicate by fsPath
      const seen = new Set<string>();
      const uniqueUris = uris.filter((uri) => {
        if (seen.has(uri.fsPath)) return false;
        seen.add(uri.fsPath);
        return true;
      });

      // Truncate
      const truncated = uniqueUris.length > maxFiles;
      const toProcess = uniqueUris.slice(0, maxFiles);

      // Process files in batches of 20
      const results: Array<{
        file: string;
        imports: Array<{ source: string; line: number; isRelative: boolean }>;
      }> = [];

      const batchSize = 20;
      for (let i = 0; i < toProcess.length; i += batchSize) {
        const batch = toProcess.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (uri) => {
            try {
              const doc = await vscode.workspace.openTextDocument(uri);
              if (!supportedLanguages.has(doc.languageId)) {
                return null;
              }
              const imports = parseImports(doc.getText(), doc.languageId);
              if (imports.length === 0) return null;
              return {
                file: toRelativePath(uri),
                imports,
              };
            } catch {
              return null;
            }
          })
        );
        for (const r of batchResults) {
          if (r) results.push(r);
        }
      }

      // Sort by file path
      results.sort((a, b) => a.file.localeCompare(b.file));

      let text = formatImportsReport(results);
      if (truncated) {
        text += `\n\n(truncated to ${maxFiles} files — increase limit or narrow your glob)`;
      }

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
