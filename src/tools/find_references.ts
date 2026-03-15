import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveUri, formatLocationsGrouped } from '../utils/vscode-bridge';
import { positionParams } from '../utils/position';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  ...positionParams,
  limit: z.number().int().min(1).optional().describe('Max references to return (default 200)'),
};

export function registerReferencesTool(server: ToolServer) {
  registerTool(
    server,
    'find_references',
    'Find all references to a symbol at a position in a file.',
    schema,
    async ({
      file,
      line,
      character,
      limit,
    }: {
      file: string;
      line: number;
      character: number;
      limit?: number;
    }) => {
      const uri = resolveUri(file);
      const pos = new vscode.Position(line - 1, character - 1);
      const maxResults = limit ?? 200;

      const allLocations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        uri,
        pos
      );

      const locations = allLocations || [];
      const totalCount = locations.length;
      const totalFiles = new Set(locations.map(l => l.uri.toString())).size;
      const truncated = totalCount > maxResults;
      const limited = truncated ? locations.slice(0, maxResults) : locations;

      let text = formatLocationsGrouped(limited, 'references');

      // Replace the summary line with full count if truncated
      if (truncated) {
        const summaryLine = text.split('\n')[0];
        text = text.replace(
          summaryLine,
          `${totalCount.toLocaleString()} references in ${totalFiles.toLocaleString()} files — showing first ${maxResults}`
        );
      }

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
