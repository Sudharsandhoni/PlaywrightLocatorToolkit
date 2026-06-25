import * as vscode from 'vscode';
import { SidebarProvider } from './sidebarProvider';

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'playwright-locator-lens-sidebar',
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
    vscode.commands.registerCommand('playwright-locator-lens.focusSidebar', () => {
      vscode.commands.executeCommand('workbench.view.extension.playwright-locator-lens-container');
    })
  );
}

export function deactivate() {}
