import * as vscode from 'vscode';
import { z } from 'zod';
import { formatWorkspaceSymbols, symbolKindName } from '../utils/vscode-bridge';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  query: z.string().min(1).describe('Search query for symbol names (required, non-empty)'),
  kind: z
    .string()
    .optional()
    .describe('Filter by symbol kind: Function, Class, Interface, Variable, Method, etc.'),
  limit: z.number().int().min(1).optional().describe('Max results to return (default 50)'),
};

export function registerWorkspaceSymbolsTool(server: ToolServer) {
  registerTool(
    server,
    'query_workspace_symbols',
    'Search across the entire workspace for symbols matching a query. Like get_document_symbols but workspace-wide. Query semantics depend on the language server (typically fuzzy or substring match).',
    schema,
    async ({ query, kind, limit }: { query: string; kind?: string; limit?: number }) => {
      const maxResults = limit ?? 50;

      let symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        query
      );

      if (!symbols || symbols.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No symbols found.' }],
        };
      }

      // Filter by kind if specified
      if (kind) {
        const kindLower = kind.toLowerCase();
        symbols = symbols.filter(
          (sym) => symbolKindName(sym.kind).toLowerCase() === kindLower
        );
      }

      // Sort by file path then line number
      symbols.sort((a, b) => {
        const fileCompare = a.location.uri.fsPath.localeCompare(b.location.uri.fsPath);
        if (fileCompare !== 0) return fileCompare;
        return a.location.range.start.line - b.location.range.start.line;
      });

      const truncated = symbols.length > maxResults;
      symbols = symbols.slice(0, maxResults);

      let text = formatWorkspaceSymbols(symbols);
      if (truncated) {
        text += `\n\n(truncated to ${maxResults} results — increase limit or narrow your query)`;
      }

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
