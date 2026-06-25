import * as vscode from 'vscode';
import * as fs from 'fs';
import { LocatorEngine } from 'playwright-locator-lens-engine';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private engine = new LocatorEngine();
  private activePageId?: string;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      try {
        switch (data.type) {
          case 'connect-browser': {
            try {
              const pages = await this.engine.connect(data.cdpUrl);
              const activePageId = pages[0]?.id;
              this.activePageId = activePageId;
              webviewView.webview.postMessage({
                type: 'connect-status',
                connected: true,
                cdpUrl: data.cdpUrl,
                pages,
                activePageId
              });
            } catch (err: any) {
              webviewView.webview.postMessage({
                type: 'connect-status',
                connected: false,
                error: err.message
              });
            }
            break;
          }
          case 'disconnect-browser': {
            await this.engine.disconnect();
            this.activePageId = undefined;
            webviewView.webview.postMessage({
              type: 'connect-status',
              connected: false
            });
            break;
          }
          case 'select-page': {
            this.activePageId = data.pageId;
            break;
          }
          case 'evaluate-locator': {
            if (!this.activePageId) {
              webviewView.webview.postMessage({
                type: 'evaluation-result',
                result: {
                  success: false,
                  error: 'Please connect to a browser and select a tab/page first.'
                }
              });
              return;
            }
            const result = await this.engine.evaluate(this.activePageId, data.locatorStr);
            webviewView.webview.postMessage({
              type: 'evaluation-result',
              result
            });
            break;
          }
          case 'highlight-locator': {
            if (!this.activePageId) return;
            await this.engine.highlight(this.activePageId, data.locatorStr, data.scrollIndex);
            break;
          }
          case 'clear-highlight': {
            if (!this.activePageId) return;
            await this.engine.clearHighlight(this.activePageId);
            break;
          }
          case 'get-autocomplete-data': {
            if (!this.activePageId) return;
            try {
              const result = await this.engine.getAutocompleteData(this.activePageId);
              webviewView.webview.postMessage({
                type: 'autocomplete-data',
                data: result
              });
            } catch (err: any) {
              webviewView.webview.postMessage({
                type: 'autocomplete-data',
                data: { roles: [], testIds: [], placeholders: [], labels: [], texts: [] }
              });
            }
            break;
          }

          // Phase 3 — .or() Chain Tree Analyzer
          case 'analyze-chain': {
            if (!this.activePageId) return;
            try {
              const result = await this.engine.analyzeChain(this.activePageId, data.locatorStr);
              webviewView.webview.postMessage({ type: 'chain-analysis-result', result });
            } catch (err: any) {
              webviewView.webview.postMessage({
                type: 'chain-analysis-result',
                result: { success: false, error: err.message, branches: [], totalMatches: 0 }
              });
            }
            break;
          }

          // Phase 7 — Stability Testing
          case 'stability-test': {
            if (!this.activePageId) return;
            try {
              const result = await this.engine.stabilityTest(
                this.activePageId,
                data.locatorStr,
                data.runs || 5
              );
              webviewView.webview.postMessage({ type: 'stability-result', result });
            } catch (err: any) {
              webviewView.webview.postMessage({
                type: 'stability-result',
                result: { success: false, error: err.message, runs: [], score: 0, locatorStr: data.locatorStr }
              });
            }
            break;
          }

          // Phase 8 — Form Scanner
          case 'scan-forms': {
            if (!this.activePageId) return;
            try {
              const forms = await this.engine.scanForms(this.activePageId);
              webviewView.webview.postMessage({ type: 'form-scan-result', forms });
            } catch (err: any) {
              webviewView.webview.postMessage({
                type: 'form-scan-result',
                forms: [],
                error: err.message
              });
            }
            break;
          }

        }
      } catch (err: any) {
        console.error('Unhandled error in webview message handler:', err);
        if (data.type === 'evaluate-locator') {
          webviewView.webview.postMessage({
            type: 'evaluation-result',
            result: {
              success: false,
              error: `Internal Extension Error: ${err.message || err}`
            }
          });
        } else if (data.type === 'connect-browser') {
          webviewView.webview.postMessage({
            type: 'connect-status',
            connected: false,
            error: `Internal Connection Error: ${err.message || err}`
          });
        }
      }
    });

    webviewView.onDidDispose(() => {
      this.engine.disconnect();
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

    // Replace resource links with webview URIs
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'style.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js'));

    html = html.replace(/\$\{styleUri\}/g, styleUri.toString());
    html = html.replace(/\$\{scriptUri\}/g, scriptUri.toString());

    return html;
  }
}
