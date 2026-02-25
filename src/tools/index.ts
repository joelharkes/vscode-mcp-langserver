import type { ToolServer } from './register';
import { registerDiagnosticsTool } from './diagnostics';

/**
 * Register all MCP tools on the server.
 */
export function registerAllTools(server: ToolServer) {
  registerDiagnosticsTool(server);
  // Future tools will be registered here:
  // registerHoverTool(server);
  // registerDefinitionTool(server);
  // registerReferencesTool(server);
  // registerCompletionsTool(server);
  // registerSymbolsTool(server);
  // registerRenameTool(server);
}
