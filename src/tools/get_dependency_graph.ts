import * as vscode from 'vscode';
import { z } from 'zod';
import { toRelativePath, formatDependencyGraph } from '../utils/vscode-bridge';
import { parseImports, resolveImportPath, supportedLanguages } from '../utils/import-parser';
import { type ToolServer, registerTool } from '../utils/register';

const DEFAULT_GLOB = '**/*.{ts,tsx,js,jsx,py,go,rs,java,kt,c,cpp,h,hpp}';

const schema = {
  glob: z
    .string()
    .optional()
    .describe(
      `Glob pattern for files to analyze (default: "${DEFAULT_GLOB}")`
    ),
  depth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Max depth of transitive dependencies to follow (default 1, max 5)'),
  limit: z.number().int().min(1).optional().describe('Max files to analyze (default 200)'),
};

export function registerDependencyGraphTool(server: ToolServer) {
  registerTool(
    server,
    'get_dependency_graph',
    'Return which files depend on which, as an adjacency list. Shows internal (workspace file) and external (package) dependencies. Built on regex-based import parsing.',
    schema,
    async ({ glob, depth, limit }: { glob?: string; depth?: number; limit?: number }) => {
      const maxFiles = limit ?? 200;
      const maxDepth = depth ?? 1;
      const pattern = glob ?? DEFAULT_GLOB;

      // Find all files matching the pattern
      const allUris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', maxFiles + 1);
      const truncated = allUris.length > maxFiles;
      const uris = allUris.slice(0, maxFiles);

      // Build set of known workspace-relative paths
      const knownFiles = new Set<string>();
      const uriByPath = new Map<string, vscode.Uri>();
      for (const uri of uris) {
        const rel = toRelativePath(uri);
        knownFiles.add(rel);
        uriByPath.set(rel, uri);
      }

      // Parse imports for each file
      const fileImports = new Map<
        string,
        { languageId: string; imports: Array<{ source: string; isRelative: boolean }> }
      >();

      const batchSize = 20;
      for (let i = 0; i < uris.length; i += batchSize) {
        const batch = uris.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (uri) => {
            try {
              const doc = await vscode.workspace.openTextDocument(uri);
              if (!supportedLanguages.has(doc.languageId)) return;
              const imports = parseImports(doc.getText(), doc.languageId);
              if (imports.length > 0) {
                fileImports.set(toRelativePath(uri), {
                  languageId: doc.languageId,
                  imports: imports.map((imp) => ({
                    source: imp.source,
                    isRelative: imp.isRelative,
                  })),
                });
              }
            } catch {
              // Skip files that can't be opened
            }
          })
        );
      }

      // Build dependency graph
      const graph = new Map<string, { internal: string[]; external: string[] }>();

      // Seed: process all files at depth 1
      const processFile = (filePath: string) => {
        if (graph.has(filePath)) return;

        const data = fileImports.get(filePath);
        if (!data) {
          graph.set(filePath, { internal: [], external: [] });
          return;
        }

        const internal: string[] = [];
        const external: string[] = [];

        for (const imp of data.imports) {
          const resolved = resolveImportPath(imp.source, filePath, knownFiles, data.languageId);
          if (resolved) {
            internal.push(resolved);
          } else if (!imp.isRelative) {
            external.push(imp.source);
          } else {
            // Unresolved relative import — list as-is with marker
            internal.push(`[unresolved] ${imp.source}`);
          }
        }

        // Deduplicate
        graph.set(filePath, {
          internal: [...new Set(internal)],
          external: [...new Set(external)],
        });
      };

      // Process initial files
      for (const filePath of knownFiles) {
        processFile(filePath);
      }

      // Follow transitive dependencies up to maxDepth
      for (let d = 1; d < maxDepth; d++) {
        const newFiles: string[] = [];
        for (const { internal } of graph.values()) {
          for (const dep of internal) {
            if (!dep.startsWith('[unresolved]') && !graph.has(dep)) {
              newFiles.push(dep);
            }
          }
        }
        if (newFiles.length === 0) break;
        for (const f of newFiles) {
          processFile(f);
        }
      }

      let text = formatDependencyGraph(graph);
      if (truncated) {
        text += `\n\n(truncated to ${maxFiles} files — increase limit or narrow your glob)`;
      }

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
