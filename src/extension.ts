import * as vscode from 'vscode';
import { startServer, stopServer, getPort, isRunning } from './server';

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'mcp-langserver.showSetupInstructions';
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('mcp-langserver.showSetupInstructions', showSetupInstructions)
  );

  // Auto-start if configured
  const config = vscode.workspace.getConfiguration('mcpLangserver');
  if (config.get<boolean>('autoStart', true)) {
    try {
      await startServer(context);
      updateStatusBar(true);
    } catch {
      updateStatusBar(false);
    }
  } else {
    updateStatusBar(false);
  }
}

export function deactivate() {
  stopServer();
}

function updateStatusBar(running: boolean) {
  if (running) {
    const port = getPort();
    statusBarItem.text = `$(plug) MCP :${port}`;
    statusBarItem.tooltip = `MCP Language Server running on port ${port}. Click for setup instructions.`;
  } else {
    statusBarItem.text = `$(plug) MCP (stopped)`;
    statusBarItem.tooltip = 'MCP Language Server is not running.';
  }
  statusBarItem.show();
}

async function showSetupInstructions() {
  const port = getPort();
  const running = isRunning();
  const configSnippet = JSON.stringify(
    {
      mcpServers: {
        'vscode-langserver': {
          type: 'http',
          url: `http://localhost:${port}/mcp`,
        },
      },
    },
    null,
    2
  );

  const statusText = running ? 'running' : 'NOT running';

  const action = await vscode.window.showInformationMessage(
    `MCP Language Server is ${statusText} on port ${port}. Copy config to clipboard?`,
    'Copy Config',
    'Dismiss'
  );

  if (action === 'Copy Config') {
    await vscode.env.clipboard.writeText(configSnippet);
    vscode.window.showInformationMessage('MCP config copied to clipboard.');
  }
}
