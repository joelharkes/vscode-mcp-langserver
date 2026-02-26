import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveUri, hoverToStrings } from '../utils/vscode-bridge';
import { positionParams } from '../utils/position';
import { type ToolServer, registerTool } from './register';

export function registerHoverTool(server: ToolServer) {
  registerTool(
    server,
    'get_hover',
    'Get hover information (type info, documentation) at a position in a file.',
    positionParams,
    async ({ file, line, character }: { file: string; line: number; character: number }) => {
      const uri = resolveUri(file);
      const pos = new vscode.Position(line - 1, character - 1);

      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        uri,
        pos
      );

      if (!hovers || hovers.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No hover information at this position.' }],
        };
      }

      const parts = hovers.flatMap((h) => hoverToStrings(h));
      const text = parts.join('\n---\n');

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
