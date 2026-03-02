import * as vscode from 'vscode';
import { resolveUri, normalizeLocation, formatLocationsGrouped } from '../utils/vscode-bridge';
import { positionParams } from '../utils/position';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  ...positionParams,
};

export function registerImplementationsTool(server: ToolServer) {
  registerTool(
    server,
    'find_implementations',
    'Find concrete implementations of an interface, abstract class, or method. Resolves through implicit interfaces (Go), structural typing (TypeScript), and multi-level inheritance — things text search cannot do.',
    schema,
    async ({ file, line, character }: { file: string; line: number; character: number }) => {
      const uri = resolveUri(file);
      const pos = new vscode.Position(line - 1, character - 1);

      const results = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
        'vscode.executeImplementationProvider',
        uri,
        pos
      );

      if (!results || results.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No implementations found.' }],
        };
      }

      const locations = results.map(normalizeLocation);
      const text = formatLocationsGrouped(locations, 'implementations');

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
