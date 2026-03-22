import * as vscode from 'vscode';
import express from 'express';
import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerAllTools } from './tools';

let httpServer: http.Server | undefined;
let mcpServer: McpServer | undefined;

export async function startServer(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('mcpLangserver');
  const port = config.get<number>('port', 3333);

  // Create MCP server
  mcpServer = new McpServer({
    name: 'vscode-mcp-langserver',
    version: '1.0.0',
  });

  // Register all tools
  registerAllTools(mcpServer);

  // Create Express app
  const app = express();
  app.use(express.json());

  // Ensure Accept header includes text/event-stream for MCP SDK compatibility.
  // The SDK validates this before checking enableJsonResponse, and @hono/node-server
  // reads from rawHeaders, so we must patch both.
  app.use('/mcp', (req, _res, next) => {
    const accept = req.headers['accept'] || '';
    if (!accept.includes('text/event-stream')) {
      const newAccept = accept ? `${accept}, text/event-stream` : 'application/json, text/event-stream';
      req.headers['accept'] = newAccept;
      // Also patch rawHeaders (array of [name, value, name, value, ...])
      const idx = req.rawHeaders.findIndex((h) => h.toLowerCase() === 'accept');
      if (idx !== -1 && idx + 1 < req.rawHeaders.length) {
        req.rawHeaders[idx + 1] = newAccept;
      } else {
        req.rawHeaders.push('Accept', newAccept);
      }
    }
    next();
  });

  // Streamable HTTP endpoint (stateless)
  app.post('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true, // allow clients that only Accept application/json
    });

    res.on('close', () => {
      transport.close();
    });

    await mcpServer!.server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', name: 'vscode-mcp-langserver' });
  });

  // Start HTTP server
  return new Promise((resolve, reject) => {
    httpServer = app.listen(port, () => {
      vscode.window.showInformationMessage(`MCP Language Server running on port ${port}`);
      resolve();
    });

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        vscode.window.showErrorMessage(
          `MCP Language Server: Port ${port} is already in use. Change the port in settings (mcpLangserver.port).`
        );
      } else {
        vscode.window.showErrorMessage(`MCP Language Server failed to start: ${err.message}`);
      }
      reject(err);
    });

    // Register cleanup
    context.subscriptions.push({
      dispose: () => {
        stopServer();
      },
    });
  });
}

export function stopServer(): void {
  if (httpServer) {
    httpServer.close();
    httpServer = undefined;
  }
  if (mcpServer) {
    mcpServer = undefined;
  }
}

export function getPort(): number {
  const config = vscode.workspace.getConfiguration('mcpLangserver');
  return config.get<number>('port', 3333);
}

export function isRunning(): boolean {
  return httpServer !== undefined && httpServer.listening;
}
