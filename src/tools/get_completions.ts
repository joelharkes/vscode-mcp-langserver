import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveUri, completionKindName } from '../utils/vscode-bridge';
import { positionParams } from '../utils/position';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  ...positionParams,
  limit: z.number().int().min(1).optional().describe('Max items to return (default 50)'),
};

export function registerCompletionsTool(server: ToolServer) {
  registerTool(
    server,
    'get_completions',
    'Get completion suggestions at a position in a file.',
    schema,
    async ({ file, line, character, limit }: { file: string; line: number; character: number; limit?: number }) => {
      const uri = resolveUri(file);
      const pos = new vscode.Position(line - 1, character - 1);
      const cap = limit ?? 50;

      const result = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        uri,
        pos
      );

      if (!result || result.items.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No completions at this position.' }],
        };
      }

      // Sort by sortText then label
      const sorted = [...result.items].sort((a, b) => {
        const sa = a.sortText ?? (typeof a.label === 'string' ? a.label : a.label.label);
        const sb = b.sortText ?? (typeof b.label === 'string' ? b.label : b.label.label);
        return sa.localeCompare(sb);
      });

      const items = sorted.slice(0, cap);
      const total = result.items.length;

      const lines: string[] = [];
      if (total > cap) {
        lines.push(`${items.length} completions (${total} available, showing ${cap})`);
      } else {
        lines.push(`${total} completions`);
      }
      lines.push('');

      for (const item of items) {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        const kind = completionKindName(item.kind);
        const detail = item.detail ?? '';
        const parts = [label, kind, detail].filter(Boolean);
        lines.push(parts.join('  '));
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    }
  );
}
