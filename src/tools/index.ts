import type { ToolServer } from '../utils/register';
import { registerDiagnosticsTool } from './get_diagnostics';
import { registerHoverTool } from './get_hover';
import { registerDefinitionTool } from './go_to_definition';
import { registerReferencesTool } from './find_references';
import { registerCompletionsTool } from './get_completions';
import { registerSymbolsTool } from './get_document_symbols';
import { registerRenameTool } from './rename_symbol';
import { registerMoveFileTool } from './move_file';
import { registerWorkspaceSymbolsTool } from './query_workspace_symbols';
import { registerFindImportsTool } from './find_imports';
import { registerDependencyGraphTool } from './get_dependency_graph';
import { registerCodeActionsTool } from './get_code_actions';
import { registerCallHierarchyTool } from './get_call_hierarchy';
import { registerImplementationsTool } from './find_implementations';
import { registerTypeHierarchyTool } from './get_type_hierarchy';

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
  registerWorkspaceSymbolsTool(server);
  registerFindImportsTool(server);
  registerDependencyGraphTool(server);
  registerCodeActionsTool(server);
  registerCallHierarchyTool(server);
  registerImplementationsTool(server);
  registerTypeHierarchyTool(server);
}
