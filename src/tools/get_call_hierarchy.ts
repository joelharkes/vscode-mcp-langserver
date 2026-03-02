import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveUri, formatCallHierarchy } from '../utils/vscode-bridge';
import { positionParams } from '../utils/position';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  ...positionParams,
  direction: z
    .enum(['incoming', 'outgoing', 'both'])
    .describe('Direction: "incoming" (who calls this), "outgoing" (what this calls), or "both"'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe('Max depth of transitive calls to follow (default 1, max 3)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Max entries to return (default 200, max 1000)'),
};

interface CallEntry {
  name: string;
  kind: string;
  file: string;
  line: number;
  col: number;
  depth: number;
}

export function registerCallHierarchyTool(server: ToolServer) {
  registerTool(
    server,
    'get_call_hierarchy',
    'Get incoming callers or outgoing callees of a function/method. Resolves through method dispatch, overrides, and aliasing — things find_references cannot show structurally.',
    schema,
    async ({
      file,
      line,
      character,
      direction,
      depth,
      limit,
    }: {
      file: string;
      line: number;
      character: number;
      direction: 'incoming' | 'outgoing' | 'both';
      depth?: number;
      limit?: number;
    }) => {
      const uri = resolveUri(file);
      const pos = new vscode.Position(line - 1, character - 1);
      const maxDepth = depth ?? 1;
      const maxEntries = limit ?? 200;

      // Prepare the call hierarchy item at the given position
      const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
        'vscode.prepareCallHierarchy',
        uri,
        pos
      );

      if (!items || items.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Call hierarchy not available at this position. Ensure the cursor is on a function or method name.' }],
        };
      }

      const rootItem = items[0];
      const sections: string[] = [];

      if (direction === 'incoming' || direction === 'both') {
        const { entries, countsByDepth } = await collectCalls(rootItem, 'incoming', maxDepth, maxEntries);
        sections.push(formatCallHierarchy('incoming', entries, countsByDepth, maxEntries));
      }

      if (direction === 'outgoing' || direction === 'both') {
        const { entries, countsByDepth } = await collectCalls(rootItem, 'outgoing', maxDepth, maxEntries);
        sections.push(formatCallHierarchy('outgoing', entries, countsByDepth, maxEntries));
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n\n') }],
      };
    }
  );
}

async function collectCalls(
  rootItem: vscode.CallHierarchyItem,
  direction: 'incoming' | 'outgoing',
  maxDepth: number,
  maxEntries: number
): Promise<{ entries: CallEntry[]; countsByDepth: number[] }> {
  const entries: CallEntry[] = [];
  const countsByDepth: number[] = [];

  // BFS by depth level
  let currentItems: vscode.CallHierarchyItem[] = [rootItem];

  for (let d = 1; d <= maxDepth; d++) {
    const nextItems: vscode.CallHierarchyItem[] = [];
    let depthCount = 0;

    for (const item of currentItems) {
      if (direction === 'incoming') {
        const calls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
          'vscode.provideIncomingCalls',
          item
        );
        if (calls) {
          for (const call of calls) {
            depthCount++;
            if (entries.length < maxEntries) {
              entries.push(itemToEntry(call.from, d));
            }
            nextItems.push(call.from);
          }
        }
      } else {
        const calls = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
          'vscode.provideOutgoingCalls',
          item
        );
        if (calls) {
          for (const call of calls) {
            depthCount++;
            if (entries.length < maxEntries) {
              entries.push(itemToEntry(call.to, d));
            }
            nextItems.push(call.to);
          }
        }
      }
    }

    countsByDepth.push(depthCount);
    currentItems = nextItems;

    if (currentItems.length === 0) break;
  }

  return { entries, countsByDepth };
}

function itemToEntry(item: vscode.CallHierarchyItem, depth: number): CallEntry {
  return {
    name: item.name,
    kind: symbolKindStr(item.kind),
    file: item.uri.fsPath,
    line: item.range.start.line + 1,
    col: item.range.start.character + 1,
    depth,
  };
}

function symbolKindStr(kind: vscode.SymbolKind): string {
  // Reuse the same names as vscode-bridge symbolKindName
  const names: Record<number, string> = {
    [vscode.SymbolKind.Function]: 'Function',
    [vscode.SymbolKind.Method]: 'Method',
    [vscode.SymbolKind.Constructor]: 'Constructor',
    [vscode.SymbolKind.Class]: 'Class',
    [vscode.SymbolKind.Interface]: 'Interface',
    [vscode.SymbolKind.Module]: 'Module',
    [vscode.SymbolKind.Property]: 'Property',
    [vscode.SymbolKind.Field]: 'Field',
    [vscode.SymbolKind.Variable]: 'Variable',
    [vscode.SymbolKind.Enum]: 'Enum',
    [vscode.SymbolKind.Struct]: 'Struct',
  };
  return names[kind] ?? 'Symbol';
}
