import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveUri, formatDiagnosticsReport } from '../utils/vscode-bridge';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  file: z
    .string()
    .optional()
    .describe(
      'File path (relative to workspace root or absolute). If omitted, returns diagnostics for all files.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Max diagnostics to return. Default: no limit for single-file, 200 for workspace-wide.'
    ),
};

export function registerDiagnosticsTool(server: ToolServer) {
  registerTool(
    server,
    'get_diagnostics',
    'Get diagnostics (errors, warnings) for a file or the entire workspace.',
    schema,
    async ({ file, limit }: { file?: string; limit?: number }) => {
      let diagnostics: Array<[vscode.Uri, readonly vscode.Diagnostic[]]>;

      if (file) {
        const uri = resolveUri(file);
        const fileDiags = vscode.languages.getDiagnostics(uri);
        diagnostics = [[uri, fileDiags]];
      } else {
        diagnostics = vscode.languages.getDiagnostics() as Array<
          [vscode.Uri, readonly vscode.Diagnostic[]]
        >;
      }

      // Apply limit (default: no limit for single-file, 200 for workspace-wide)
      const maxDiags = limit ?? (file ? undefined : 200);

      if (maxDiags !== undefined) {
        // Count total diagnostics
        let totalCount = 0;
        for (const [, diags] of diagnostics) {
          totalCount += diags.length;
        }

        if (totalCount > maxDiags) {
          // Truncate: keep diagnostics up to the limit, preserving file grouping
          const truncated: Array<[vscode.Uri, vscode.Diagnostic[]]> = [];
          let remaining = maxDiags;

          for (const [uri, diags] of diagnostics) {
            if (remaining <= 0) break;
            if (diags.length <= remaining) {
              truncated.push([uri, [...diags]]);
              remaining -= diags.length;
            } else {
              truncated.push([uri, [...diags].slice(0, remaining)]);
              remaining = 0;
            }
          }

          let text = formatDiagnosticsReport(truncated);
          // Replace summary with full count
          const summaryLine = text.split('\n')[0];
          text = text.replace(
            summaryLine,
            `${summaryLine} (${totalCount} total — showing first ${maxDiags})`
          );

          return {
            content: [{ type: 'text' as const, text }],
          };
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: formatDiagnosticsReport(diagnostics),
          },
        ],
      };
    }
  );
}
