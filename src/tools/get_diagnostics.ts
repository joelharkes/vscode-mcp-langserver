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
  severity: z
    .enum(['error', 'warning', 'information', 'hint'])
    .optional()
    .describe('Minimum severity level — returns this level and above (e.g. "warning" returns warnings and errors). Default: all severities.'),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Max diagnostics to return. Default: no limit for single-file, 200 for workspace-wide.'
    ),
};

const severityMap: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

export function registerDiagnosticsTool(server: ToolServer) {
  registerTool(
    server,
    'get_diagnostics',
    'Get diagnostics (errors, warnings) for a file or the entire workspace.',
    schema,
    async ({ file, severity, limit }: { file?: string; severity?: string; limit?: number }) => {
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

      // Filter by minimum severity (DiagnosticSeverity: Error=0, Warning=1, Info=2, Hint=3 — lower = more severe)
      if (severity) {
        const threshold = severityMap[severity];
        diagnostics = diagnostics
          .map(([uri, diags]) => [uri, diags.filter(d => d.severity <= threshold)] as [vscode.Uri, vscode.Diagnostic[]])
          .filter(([, diags]) => diags.length > 0);
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
          const totalFiles = diagnostics.filter(([, d]) => d.length > 0).length;
          let errors = 0, warnings = 0, infos = 0, hints = 0;
          for (const [, diags] of diagnostics) {
            for (const d of diags) {
              switch (d.severity) {
                case vscode.DiagnosticSeverity.Error: errors++; break;
                case vscode.DiagnosticSeverity.Warning: warnings++; break;
                case vscode.DiagnosticSeverity.Information: infos++; break;
                case vscode.DiagnosticSeverity.Hint: hints++; break;
              }
            }
          }

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
          // Replace summary with full counts from the untruncated set
          const summaryLine = text.split('\n')[0];
          text = text.replace(
            summaryLine,
            `${[
              errors ? `${errors.toLocaleString()} errors` : '',
              warnings ? `${warnings.toLocaleString()} warnings` : '',
              infos ? `${infos.toLocaleString()} info` : '',
              hints ? `${hints.toLocaleString()} hints` : '',
            ].filter(Boolean).join(', ')} in ${totalFiles.toLocaleString()} files — showing first ${maxDiags}`
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
