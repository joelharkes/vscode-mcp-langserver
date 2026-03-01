import * as vscode from 'vscode';
import { z } from 'zod';
import {
  resolveUri,
  toRelativePath,
  formatSymbolTree,
  countSymbols,
  filterSymbolsByKind,
  formatMultiFileSymbols,
} from '../utils/vscode-bridge';
import { fileParam } from '../utils/position';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  file: fileParam
    .optional()
    .describe('Single file path (relative to workspace root or absolute)'),
  glob: z
    .string()
    .optional()
    .describe('Glob pattern to match multiple files (e.g. "src/**/*.ts")'),
  kind: z
    .string()
    .optional()
    .describe('Filter by symbol kind: Function, Class, Interface, Variable, Method, etc.'),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Max files to process when using glob (default 50)'),
};

export function registerSymbolsTool(server: ToolServer) {
  registerTool(
    server,
    'get_document_symbols',
    'Get the symbol outline (functions, classes, variables, etc.) for one or more files. Provide a file path for a single file, or a glob pattern for multiple files. Optionally filter by symbol kind.',
    schema,
    async ({
      file,
      glob,
      kind,
      limit,
    }: {
      file?: string;
      glob?: string;
      kind?: string;
      limit?: number;
    }) => {
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

      // Single-file mode (backward compatible)
      if (file && !glob) {
        const uri = resolveUri(file);
        let symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          'vscode.executeDocumentSymbolProvider',
          uri
        );

        if (!symbols || symbols.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No symbols found.' }],
          };
        }

        if (kind) {
          symbols = filterSymbolsByKind(symbols, kind);
        }

        if (symbols.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No symbols matching kind "${kind}" found.` }],
          };
        }

        const total = countSymbols(symbols);
        const tree = formatSymbolTree(symbols);
        const lines = [`${total} symbols`, '', ...tree];

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      }

      // Multi-file mode (glob)
      const maxFiles = limit ?? 50;
      const uris: vscode.Uri[] = [];

      if (glob) {
        const found = await vscode.workspace.findFiles(glob, '**/node_modules/**', maxFiles + 1);
        uris.push(...found);
      }

      // Also include the single file if both are provided
      if (file) {
        const uri = resolveUri(file);
        if (!uris.some((u) => u.fsPath === uri.fsPath)) {
          uris.unshift(uri);
        }
      }

      const truncated = uris.length > maxFiles;
      const toProcess = uris.slice(0, maxFiles);

      // Process files in batches of 20
      const results: Array<{
        file: string;
        symbols: vscode.DocumentSymbol[];
        count: number;
      }> = [];

      const batchSize = 20;
      for (let i = 0; i < toProcess.length; i += batchSize) {
        const batch = toProcess.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (uri) => {
            try {
              let symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
              );
              if (!symbols || symbols.length === 0) return null;

              if (kind) {
                symbols = filterSymbolsByKind(symbols, kind);
              }
              if (symbols.length === 0) return null;

              return {
                file: toRelativePath(uri),
                symbols,
                count: countSymbols(symbols),
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

      let text = formatMultiFileSymbols(results);
      if (truncated) {
        text += `\n\n(truncated to ${maxFiles} files — increase limit or narrow your glob)`;
      }

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
