import type { ToolServer } from './register';
import { registerDiagnosticsTool } from './diagnostics';
import { registerHoverTool } from './hover';
import { registerDefinitionTool } from './definition';
import { registerReferencesTool } from './references';
import { registerCompletionsTool } from './completions';
import { registerSymbolsTool } from './symbols';
import { registerRenameTool, registerMoveFileTool } from './rename';

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
