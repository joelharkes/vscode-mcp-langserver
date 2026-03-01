import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveUri, toRelativePath } from '../utils/vscode-bridge';
import { positionParams } from '../utils/position';
import { type ToolServer, registerTool } from '../utils/register';

function formatRenamePreview(edit: vscode.WorkspaceEdit, newName: string): string {
  const entries = edit.entries();
  let totalChanges = 0;
  let fileCount = 0;
  const fileLines: string[] = [];

  for (const [uri, textEdits] of entries) {
    const realEdits = textEdits.filter((e): e is vscode.TextEdit => e instanceof vscode.TextEdit);
    if (realEdits.length === 0) continue;
    fileCount++;
    totalChanges += realEdits.length;
    fileLines.push(toRelativePath(uri));
    for (const e of realEdits) {
      const startLine = e.range.start.line + 1;
      const startCol = e.range.start.character + 1;
      const endLine = e.range.end.line + 1;
      const endCol = e.range.end.character + 1;
      fileLines.push(`  ${startLine}:${startCol}-${endLine}:${endCol}  →  ${newName}`);
    }
    fileLines.push('');
  }

  if (totalChanges === 0) {
    return 'No changes found. The symbol may not support renaming at this position.';
  }

  const summary = `Rename preview: ${totalChanges} ${totalChanges === 1 ? 'change' : 'changes'} in ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;
  return [summary, 'To apply, call rename_symbol again with apply: true.', '', ...fileLines].join('\n').trimEnd();
}

export function registerRenameTool(server: ToolServer) {
  registerTool(
    server,
    'rename_symbol',
    'Rename a symbol at a position across the entire workspace. By default previews changes; set apply: true to apply them.',
    {
      ...positionParams,
      newName: z.string().describe('New name for the symbol'),
      apply: z.boolean().optional().describe('If true, apply the rename immediately. Default: false (preview only)'),
    },
    async ({ file, line, character, newName, apply = false }: {
      file: string;
      line: number;
      character: number;
      newName: string;
      apply?: boolean;
    }) => {
      const uri = resolveUri(file);
      const pos = new vscode.Position(line - 1, character - 1);

      const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeRenameProvider',
        uri,
        pos,
        newName
      );

      if (!edit) {
        return {
          content: [{ type: 'text' as const, text: 'No rename result. The symbol may not support renaming at this position.' }],
        };
      }

      if (!apply) {
        return { content: [{ type: 'text' as const, text: formatRenamePreview(edit, newName) }] };
      }

      const success = await vscode.workspace.applyEdit(edit);
      if (!success) {
        return {
          content: [{ type: 'text' as const, text: 'Failed to apply rename. There may be unsaved conflicts.' }],
        };
      }

      const entries = edit.entries();
      let total = 0;
      let fileCount = 0;
      for (const [, textEdits] of entries) {
        const realEdits = textEdits.filter((e): e is vscode.TextEdit => e instanceof vscode.TextEdit);
        if (realEdits.length > 0) {
          fileCount++;
          total += realEdits.length;
        }
      }

      return {
        content: [{ type: 'text' as const, text: `Renamed: ${total} ${total === 1 ? 'change' : 'changes'} applied across ${fileCount} ${fileCount === 1 ? 'file' : 'files'}.` }],
      };
    }
  );
}
