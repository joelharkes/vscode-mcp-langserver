import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveUri, toRelativePath, formatCodeActions, formatAppliedEdit } from '../utils/vscode-bridge';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  file: z.string().describe('File path (relative to workspace root or absolute)'),
  line: z.number().int().min(1).optional().describe('Line number (1-based). Omit for file-wide mode.'),
  character: z.number().int().min(1).optional().describe('Character offset (1-based). Omit for file-wide mode.'),
  endLine: z.number().int().min(1).optional().describe('End line (1-based) for a range selection'),
  endCharacter: z.number().int().min(1).optional().describe('End character (1-based) for a range selection'),
  kind: z.string().optional().describe('Filter by CodeActionKind prefix: "quickfix", "refactor", "source.organizeImports", etc.'),
  apply: z.string().optional().describe('Apply the first action whose title contains this substring (only actions with a WorkspaceEdit are applied)'),
};

export function registerCodeActionsTool(server: ToolServer) {
  registerTool(
    server,
    'get_code_actions',
    'Get available code actions (quick fixes, refactors) at a position or for all diagnostics in a file. Optionally apply an action by title match.',
    schema,
    async ({
      file,
      line,
      character,
      endLine,
      endCharacter,
      kind,
      apply,
    }: {
      file: string;
      line?: number;
      character?: number;
      endLine?: number;
      endCharacter?: number;
      kind?: string;
      apply?: string;
    }) => {
      const uri = resolveUri(file);

      // Collect ranges to query for code actions
      const ranges: vscode.Range[] = [];

      if (line !== undefined && character !== undefined) {
        // Position mode: single range (optionally with end)
        const start = new vscode.Position(line - 1, character - 1);
        const end = endLine !== undefined && endCharacter !== undefined
          ? new vscode.Position(endLine - 1, endCharacter - 1)
          : start;
        ranges.push(new vscode.Range(start, end));
      } else {
        // File-wide mode: collect ranges from all diagnostics in this file
        const diags = vscode.languages.getDiagnostics(uri);
        if (diags.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No diagnostics in this file — no file-wide code actions to show. Provide line and character for position-specific actions.' }],
          };
        }
        for (const diag of diags) {
          ranges.push(diag.range);
        }
      }

      // Query code actions for all ranges
      const allActions: vscode.CodeAction[] = [];
      const seen = new Set<string>();

      for (const range of ranges) {
        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
          'vscode.executeCodeActionProvider',
          uri,
          range
        );
        if (actions) {
          for (const action of actions) {
            // Deduplicate by title + kind
            const key = `${action.title}|${action.kind?.value ?? ''}`;
            if (!seen.has(key)) {
              seen.add(key);
              allActions.push(action);
            }
          }
        }
      }

      // Filter by kind prefix if specified
      let filtered = allActions;
      if (kind) {
        filtered = allActions.filter((a) => a.kind?.value?.startsWith(kind));
      }

      if (filtered.length === 0) {
        const kindNote = kind ? ` matching kind "${kind}"` : '';
        return {
          content: [{ type: 'text' as const, text: `No code actions${kindNote} available.` }],
        };
      }

      // Apply mode: find and apply the first matching action
      if (apply) {
        const applyLower = apply.toLowerCase();
        const match = filtered.find((a) => a.title.toLowerCase().includes(applyLower));

        if (!match) {
          const listing = formatCodeActions(filtered);
          return {
            content: [{ type: 'text' as const, text: `No action matching "${apply}" found. Available actions:\n\n${listing}` }],
          };
        }

        if (!match.edit) {
          // Action only has a command, not a WorkspaceEdit — too unpredictable to execute
          return {
            content: [{ type: 'text' as const, text: `Action "${match.title}" has no WorkspaceEdit (only a command). Cannot apply automatically — commands may trigger dialogs or other side effects.` }],
          };
        }

        const applied = await vscode.workspace.applyEdit(match.edit);
        if (!applied) {
          return {
            content: [{ type: 'text' as const, text: `Failed to apply action "${match.title}".` }],
          };
        }

        const summary = formatAppliedEdit(match.edit, match.title);
        return {
          content: [{ type: 'text' as const, text: summary }],
        };
      }

      // List mode: show all available actions
      const text = formatCodeActions(filtered);
      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
