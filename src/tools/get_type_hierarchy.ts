import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveUri, formatTypeHierarchy } from '../utils/vscode-bridge';
import { positionParams } from '../utils/position';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  ...positionParams,
  direction: z
    .enum(['supertypes', 'subtypes', 'both'])
    .describe('Direction: "supertypes" (parents/interfaces), "subtypes" (children/implementations), or "both"'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe('Max depth of transitive types to follow (default 1, max 3)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Max entries to return (default 200, max 1000)'),
};

interface TypeEntry {
  name: string;
  kind: string;
  file: string;
  line: number;
  col: number;
  depth: number;
}

export function registerTypeHierarchyTool(server: ToolServer) {
  registerTool(
    server,
    'get_type_hierarchy',
    'Get supertypes (parents/interfaces) or subtypes (children/implementations) of a type. Resolves multi-level inheritance, generic bounds, and mixin chains. LSP 3.17+ — returns a clear message if the language server does not support it.',
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
      direction: 'supertypes' | 'subtypes' | 'both';
      depth?: number;
      limit?: number;
    }) => {
      const uri = resolveUri(file);
      const pos = new vscode.Position(line - 1, character - 1);
      const maxDepth = depth ?? 1;
      const maxEntries = limit ?? 200;

      // Prepare the type hierarchy item at the given position
      let items: vscode.TypeHierarchyItem[] | undefined;
      try {
        items = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
          'vscode.prepareTypeHierarchy',
          uri,
          pos
        );
      } catch {
        return {
          content: [{ type: 'text' as const, text: 'Type hierarchy is not supported by the language server for this file.' }],
        };
      }

      if (!items || items.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Type hierarchy not available at this position. Ensure the cursor is on a type name (class, interface, etc.).' }],
        };
      }

      const rootItem = items[0];
      const sections: string[] = [];

      if (direction === 'supertypes' || direction === 'both') {
        const { entries, countsByDepth } = await collectTypes(rootItem, 'supertypes', maxDepth, maxEntries);
        sections.push(formatTypeHierarchy('supertypes', entries, countsByDepth, maxEntries));
      }

      if (direction === 'subtypes' || direction === 'both') {
        const { entries, countsByDepth } = await collectTypes(rootItem, 'subtypes', maxDepth, maxEntries);
        sections.push(formatTypeHierarchy('subtypes', entries, countsByDepth, maxEntries));
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n\n') }],
      };
    }
  );
}

async function collectTypes(
  rootItem: vscode.TypeHierarchyItem,
  direction: 'supertypes' | 'subtypes',
  maxDepth: number,
  maxEntries: number
): Promise<{ entries: TypeEntry[]; countsByDepth: number[] }> {
  const entries: TypeEntry[] = [];
  const countsByDepth: number[] = [];
  const command = direction === 'supertypes' ? 'vscode.provideTypeHierarchySupertypes' : 'vscode.provideTypeHierarchySubtypes';

  let currentItems: vscode.TypeHierarchyItem[] = [rootItem];

  for (let d = 1; d <= maxDepth; d++) {
    const nextItems: vscode.TypeHierarchyItem[] = [];
    let depthCount = 0;

    for (const item of currentItems) {
      const results = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(command, item);
      if (results) {
        for (const result of results) {
          depthCount++;
          if (entries.length < maxEntries) {
            entries.push({
              name: result.name,
              kind: symbolKindStr(result.kind),
              file: result.uri.fsPath,
              line: result.range.start.line + 1,
              col: result.range.start.character + 1,
              depth: d,
            });
          }
          nextItems.push(result);
        }
      }
    }

    countsByDepth.push(depthCount);
    currentItems = nextItems;

    if (currentItems.length === 0) break;
  }

  return { entries, countsByDepth };
}

function symbolKindStr(kind: vscode.SymbolKind): string {
  const names: Record<number, string> = {
    [vscode.SymbolKind.Class]: 'Class',
    [vscode.SymbolKind.Interface]: 'Interface',
    [vscode.SymbolKind.Enum]: 'Enum',
    [vscode.SymbolKind.Struct]: 'Struct',
    [vscode.SymbolKind.Module]: 'Module',
    [vscode.SymbolKind.Namespace]: 'Namespace',
    [vscode.SymbolKind.TypeParameter]: 'TypeParameter',
  };
  return names[kind] ?? 'Type';
}
