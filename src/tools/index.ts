import type { ToolServer } from '../utils/register';
import { registerDiagnosticsTool } from './get_diagnostics';
import { registerHoverTool } from './get_hover';
import { registerDefinitionTool } from './go_to_definition';
import { registerReferencesTool } from './find_references';
import { registerCompletionsTool } from './get_completions';
import { registerSymbolsTool } from './get_document_symbols';
import { registerRenameTool } from './rename_symbol';
import { registerMoveFileTool } from './move_file';

/**
 * Register all MCP tools on the server.
 */
export function registerAllTools(server: ToolServer) {
  registerDiagnosticsTool(server);
  registerHoverTool(server);
  registerDefinitionTool(server);
  registerReferencesTool(server);
  registerCompletionsTool(server);
  registerSymbolsTool(server);
  registerRenameTool(server);
  registerMoveFileTool(server);
}
