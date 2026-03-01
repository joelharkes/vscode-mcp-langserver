import * as vscode from 'vscode';
import { resolveUri, normalizeLocation, formatLocationsGrouped } from '../utils/vscode-bridge';
import { positionParams } from '../utils/position';
import { type ToolServer, registerTool } from '../utils/register';

export function registerDefinitionTool(server: ToolServer) {
  registerTool(
    server,
    'go_to_definition',
    'Go to the definition of a symbol at a position in a file.',
    positionParams,
    async ({ file, line, character }: { file: string; line: number; character: number }) => {
      const uri = resolveUri(file);
      const pos = new vscode.Position(line - 1, character - 1);

      const results = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        uri,
        pos
      );

      const locations = (results || []).map(normalizeLocation);
      const text = formatLocationsGrouped(locations, 'definitions');

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
