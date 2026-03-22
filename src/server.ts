import * as vscode from 'vscode';
import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerAllTools } from './tools';

let httpServer: http.Server | undefined;
let mcpServer: McpServer | undefined;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function patchAcceptHeader(req: http.IncomingMessage): void {
  // Ensure Accept header includes text/event-stream for MCP SDK compatibility.
  // The SDK validates this before checking enableJsonResponse, and @hono/node-server
  // reads from rawHeaders, so we must patch both.
  const accept = req.headers['accept'] || '';
  if (!accept.includes('text/event-stream')) {
    const newAccept = accept ? `${accept}, text/event-stream` : 'application/json, text/event-stream';
    req.headers['accept'] = newAccept;
    const idx = req.rawHeaders.findIndex((h) => h.toLowerCase() === 'accept');
    if (idx !== -1 && idx + 1 < req.rawHeaders.length) {
      req.rawHeaders[idx + 1] = newAccept;
    } else {
      req.rawHeaders.push('Accept', newAccept);
    }
  }
}

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

  // Create HTTP server
  httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    // Health check
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', name: 'vscode-mcp-langserver' }));
      return;
    }

    // MCP endpoint
    if (url.pathname === '/mcp' && req.method === 'POST') {
      patchAcceptHeader(req);

      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true,
      });

      res.on('close', () => {
        transport.close();
      });

      await mcpServer!.server.connect(transport);
      await transport.handleRequest(req, res, parsed);
      return;
    }

    // Not found
    res.writeHead(404);
    res.end();
  });

  // Start HTTP server
  return new Promise((resolve, reject) => {
    httpServer!.listen(port, () => {
      vscode.window.showInformationMessage(`MCP Language Server running on port ${port}`);
      resolve();
    });

    httpServer!.on('error', (err: NodeJS.ErrnoException) => {
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
