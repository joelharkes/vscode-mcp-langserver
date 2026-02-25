import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveUri, diagnosticToJson } from '../utils/vscode-bridge';
import { type ToolServer, registerTool } from './register';

const schema = {
  file: z.string().optional().describe('File path (relative to workspace root or absolute). If omitted, returns diagnostics for all files.'),
};

export function registerDiagnosticsTool(server: ToolServer) {
  registerTool(
    server,
    'get_diagnostics',
    'Get diagnostics (errors, warnings) for a file or the entire workspace.',
    schema,
    async ({ file }: { file?: string }) => {
      let diagnostics: Array<[vscode.Uri, readonly vscode.Diagnostic[]]>;

      if (file) {
        const uri = resolveUri(file);
        const fileDiags = vscode.languages.getDiagnostics(uri);
        diagnostics = [[uri, fileDiags]];
      } else {
        diagnostics = vscode.languages.getDiagnostics() as Array<[vscode.Uri, readonly vscode.Diagnostic[]]>;
      }

      const result = diagnostics
        .filter(([, diags]) => diags.length > 0)
        .flatMap(([uri, diags]) =>
          diags.map((d) => diagnosticToJson(d, uri))
        );

      return {
        content: [
          {
            type: 'text' as const,
            text: result.length > 0
              ? JSON.stringify(result, null, 2)
              : 'No diagnostics found.',
          },
        ],
      };
    }
  );
}
