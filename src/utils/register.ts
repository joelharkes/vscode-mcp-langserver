import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Type alias for McpServer to avoid repeating the import path.
 */
export type ToolServer = McpServer;

/**
 * Wrapper around server.tool() that bypasses deep Zod generic inference (TS2589).
 * The MCP SDK's tool() generics + Zod v3/v4 compat types cause "excessively deep" errors.
 * This wrapper uses `any` to break the type chain while keeping our tool code fully typed.
 */
export function registerTool(
  server: ToolServer,
  name: string,
  description: string,
  schema: Record<string, unknown>,
  handler: (args: any) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
): void {
  (server as any).tool(name, description, schema, handler);
}
