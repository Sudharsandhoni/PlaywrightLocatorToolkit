import * as vscode from 'vscode';
import { SidebarProvider } from './sidebarProvider';

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'playwright-locator-toolkit-sidebar',
      sidebarProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // Command to focus sidebar
  context.subscriptions.push(
    vscode.commands.registerCommand('playwright-locator-toolkit.focusSidebar', () => {
      vscode.commands.executeCommand('workbench.view.extension.playwright-locator-toolkit-container');
    })
  );

  // Command to restart extension
  context.subscriptions.push(
    vscode.commands.registerCommand('playwright-locator-toolkit.restart', () => {
      sidebarProvider.restart();
    })
  );
}

export function deactivate() {}
