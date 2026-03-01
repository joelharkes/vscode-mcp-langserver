import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveUri, toRelativePath } from '../utils/vscode-bridge';
import { type ToolServer, registerTool } from '../utils/register';

const fileParam = z.string().describe('File path (relative to workspace root or absolute)');

export function registerMoveFileTool(server: ToolServer) {
  registerTool(
    server,
    'move_file',
    'Move or rename a file and update import paths. By default previews the operation; set apply: true to apply. Import path updates depend on the language server (TypeScript and Pylance support this).',
    {
      oldPath: fileParam,
      newPath: z.string().describe('New file path (relative to workspace root or absolute)'),
      apply: z.boolean().optional().describe('If true, move the file and update imports. Default: false (preview only)'),
    },
    async ({ oldPath, newPath, apply = false }: {
      oldPath: string;
      newPath: string;
      apply?: boolean;
    }) => {
      const oldUri = resolveUri(oldPath);
      const newUri = resolveUri(newPath);
      const oldRel = toRelativePath(oldUri);
      const newRel = toRelativePath(newUri);

      if (!apply) {
        return {
          content: [{
            type: 'text' as const,
            text: `Move file preview:\n  ${oldRel}  →  ${newRel}\n\nImport paths will be updated by the language server (TypeScript, Pylance, etc.) when applied.\nTo apply, call move_file again with apply: true.`,
          }],
        };
      }

      const edit = new vscode.WorkspaceEdit();
      edit.renameFile(oldUri, newUri);

      const success = await vscode.workspace.applyEdit(edit);
      if (!success) {
        return {
          content: [{ type: 'text' as const, text: 'Failed to move file. The destination may already exist or the source may not exist.' }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: `Moved: ${oldRel}  →  ${newRel}\nImport paths updated by language server.` }],
      };
    }
  );
}
