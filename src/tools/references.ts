import * as vscode from 'vscode';
import { resolveUri, formatLocationsGrouped } from '../utils/vscode-bridge';
import { positionParams } from '../utils/position';
import { type ToolServer, registerTool } from './register';

export function registerReferencesTool(server: ToolServer) {
  registerTool(
    server,
    'find_references',
    'Find all references to a symbol at a position in a file.',
    positionParams,
    async ({ file, line, character }: { file: string; line: number; character: number }) => {
      const uri = resolveUri(file);
      const pos = new vscode.Position(line - 1, character - 1);

      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        uri,
        pos
      );

      const text = formatLocationsGrouped(locations || [], 'references');

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
