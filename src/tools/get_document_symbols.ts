import * as vscode from 'vscode';
import { resolveUri, formatSymbolTree, countSymbols } from '../utils/vscode-bridge';
import { fileParam } from '../utils/position';
import { type ToolServer, registerTool } from '../utils/register';

const schema = {
  file: fileParam,
};

export function registerSymbolsTool(server: ToolServer) {
  registerTool(
    server,
    'get_document_symbols',
    'Get the symbol outline (functions, classes, variables, etc.) for a file.',
    schema,
    async ({ file }: { file: string }) => {
      const uri = resolveUri(file);

      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );

      if (!symbols || symbols.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No symbols found.' }],
        };
      }

      const total = countSymbols(symbols);
      const tree = formatSymbolTree(symbols);

      const lines = [`${total} symbols`, '', ...tree];

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    }
  );
}
