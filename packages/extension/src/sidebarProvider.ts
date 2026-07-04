import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import * as http from 'http';
import { LocatorEngine } from 'playwright-locator-toolkit-engine';

function findChrome(): string {
  const platform = process.platform;
  if (platform === 'win32') {
    const paths = [
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe') : '',
      process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe') : '',
      process.env.LocalAppData ? path.join(process.env.LocalAppData, 'Google/Chrome/Application/chrome.exe') : ''
    ].filter(Boolean);

    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } else if (platform === 'darwin') {
    const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(p)) {
      return p;
    }
  } else {
    // Linux
    const paths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }
  throw new Error('Google Chrome was not found. Please install Google Chrome or configure a custom path in settings.');
}

function checkCDPReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 1000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.end();
  });
}

async function waitForCDP(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkCDPReady(port)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`CDP server did not start on port ${port} within ${timeoutMs}ms.`);
}

async function rmWithRetry(dirPath: string, maxAttempts = 3, delayMs = 200): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private engine = new LocatorEngine();
  private activePageId?: string;
  private spawnedBrowser?: child_process.ChildProcess;
  private tempProfileDir?: string;

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
          case 'launch-browser': {
            try {
              const config = vscode.workspace.getConfiguration('playwright-locator-toolkit');
              const port = config.get<number>('debuggingPort', 9222);
              const customPath = config.get<string>('browserPath', '');
              const cleanProfile = config.get<boolean>('cleanBrowserProfile', false);

              if (typeof port !== 'number' || isNaN(port) || port < 1024 || port > 65535) {
                throw new Error(`Invalid debugging port: ${port}. Must be a number between 1024 and 65535.`);
              }

              const executablePath = customPath || findChrome();
              if (!fs.existsSync(executablePath)) {
                throw new Error(`Browser executable not found at: ${executablePath}`);
              }

              let baseDir = '';
              if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                baseDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
              } else {
                baseDir = os.tmpdir();
              }
              const profileDir = path.join(baseDir, '.vscode', 'playwright-locator-profile');
              this.tempProfileDir = profileDir;

              vscode.window.showInformationMessage(
                `Launching Google Chrome with debugging port ${port}. Profile persisted at: ${profileDir}. To delete on exit, toggle 'cleanBrowserProfile' in settings.`
              );

              const args = [
                `--remote-debugging-port=${port}`,
                `--user-data-dir=${profileDir}`,
                '--no-first-run',
                '--no-default-browser-check',
                'about:blank'
              ];

              if (this.spawnedBrowser) {
                try { this.spawnedBrowser.kill(); } catch {}
              }

              this.spawnedBrowser = child_process.spawn(executablePath, args, {
                detached: true,
                stdio: 'ignore'
              });
              this.spawnedBrowser.unref();

              this.spawnedBrowser.on('exit', async () => {
                this.spawnedBrowser = undefined;
                if (cleanProfile && this.tempProfileDir && fs.existsSync(this.tempProfileDir)) {
                  try {
                    await rmWithRetry(this.tempProfileDir);
                  } catch (e) {
                    console.error('Failed to clean browser profile:', e);
                  }
                }
                try {
                  webviewView.webview.postMessage({
                    type: 'connect-status',
                    connected: false
                  });
                } catch {}
              });

              await waitForCDP(port);

              const cdpUrl = `http://127.0.0.1:${port}`;
              const pages = await this.engine.connect(cdpUrl);
              const activePageId = pages[0]?.id;
              this.activePageId = activePageId;

              webviewView.webview.postMessage({
                type: 'connect-status',
                connected: true,
                cdpUrl,
                pages,
                activePageId
              });
            } catch (err: any) {
              webviewView.webview.postMessage({
                type: 'connect-status',
                connected: false,
                error: err.message || String(err)
              });
            }
            break;
          }
          case 'connect-browser': {
            try {
              if (!data.cdpUrl || typeof data.cdpUrl !== 'string') {
                throw new Error('CDP Connection URL is required.');
              }
              const parsedUrl = new URL(data.cdpUrl);
              if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                throw new Error('CDP Connection URL protocol must be http or https.');
              }
              const hostPort = parsedUrl.port;
              if (hostPort) {
                const portNum = parseInt(hostPort, 10);
                if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
                  throw new Error(`Invalid port in CDP URL: ${hostPort}. Must be between 1024 and 65535.`);
                }
              }
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
                error: err.message || String(err)
              });
            }
            break;
          }
          case 'disconnect-browser': {
            // Only drop the CDP connection; do NOT kill the spawned browser process
            this.engine.softDisconnect();
            this.activePageId = undefined;

            webviewView.webview.postMessage({
              type: 'connect-status',
              connected: false
            });
            break;
          }
          case 'close-browser': {
            // Explicitly close the spawned Chrome process
            if (this.spawnedBrowser) {
              try { this.spawnedBrowser.kill(); } catch {}
              this.spawnedBrowser = undefined;
            }
            await this.engine.disconnect();
            this.activePageId = undefined;

            const config = vscode.workspace.getConfiguration('playwright-locator-toolkit');
            const cleanProfile = config.get<boolean>('cleanBrowserProfile', false);
            if (cleanProfile && this.tempProfileDir && fs.existsSync(this.tempProfileDir)) {
              try {
                await rmWithRetry(this.tempProfileDir);
              } catch {}
            }

            webviewView.webview.postMessage({
              type: 'connect-status',
              connected: false
            });
            break;
          }
          case 'refresh-pages': {
            // Re-list open tabs without disconnecting — covers new tabs opened after initial connect
            try {
              const pages = await this.engine.getPages();
              webviewView.webview.postMessage({
                type: 'pages-refreshed',
                pages
              });
            } catch (err: any) {
              webviewView.webview.postMessage({
                type: 'pages-refreshed',
                pages: [],
                error: err.message
              });
            }
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

          // Phase 6 — Bulk Stability Testing
          case 'bulk-stability-test': {
            if (!this.activePageId) return;
            try {
              const results = await this.engine.bulkStabilityTest(
                this.activePageId,
                data.locatorStrs,
                data.runs || 3
              );
              webviewView.webview.postMessage({ type: 'bulk-stability-result', results });
            } catch (err: any) {
              webviewView.webview.postMessage({
                type: 'bulk-stability-result',
                results: {},
                error: err.message
              });
            }
            break;
          }

          // Phase 5 — Field Simulation Engine
          case 'simulate-fill': {
            if (!this.activePageId) return;
            try {
              const success = await this.engine.simulateFill(
                this.activePageId,
                data.locatorStr,
                data.value
              );
              webviewView.webview.postMessage({ type: 'simulate-fill-result', success });
            } catch (err: any) {
              webviewView.webview.postMessage({ type: 'simulate-fill-result', success: false, error: err.message });
            }
            break;
          }
          case 'simulate-click': {
            if (!this.activePageId) return;
            try {
              const success = await this.engine.simulateClick(
                this.activePageId,
                data.locatorStr,
                data.x,
                data.y
              );
              webviewView.webview.postMessage({ type: 'simulate-click-result', success });
            } catch (err: any) {
              webviewView.webview.postMessage({ type: 'simulate-click-result', success: false, error: err.message });
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

          // UI Scanner Intelligence Platform
          case 'scan-ui': {
            if (!this.activePageId) return;
            try {
              const result = await this.engine.scanUI(this.activePageId);
              webviewView.webview.postMessage({ type: 'ui-scan-result', result });
            } catch (err: any) {
              webviewView.webview.postMessage({
                type: 'ui-scan-result',
                error: err.message
              });
            }
            break;
          }

          case 'generate-export': {
            try {
              let code = '';
              const format = data.format;
              const tree = data.tree;
              const sectionNaming = data.sectionNaming;
              if (format === 'pom') {
                code = this.engine.generatePOMExport(tree, data.className, sectionNaming);
              } else if (format === 'sdk') {
                code = this.engine.generateSDKExport(tree);
              } else if (format === 'ts') {
                code = this.engine.generateTSInterfacesExport(tree, sectionNaming);
              } else if (format === 'json') {
                code = this.engine.generateJSONSchemaExport(tree);
              } else if (format === 'yaml') {
                code = this.engine.generateYAMLExport(tree);
              }
              webviewView.webview.postMessage({ type: 'export-result', format, code });
            } catch (err: any) {
              webviewView.webview.postMessage({ type: 'export-result', error: err.message });
            }
            break;
          }
          case 'get-config': {
            const config = vscode.workspace.getConfiguration('playwright-locator-toolkit');
            const enableBeta = config.get<boolean>('enableBetaFeatures', false);
            webviewView.webview.postMessage({
              type: 'beta-config',
              enabled: enableBeta
            });
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

    // Listen for configuration changes
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('playwright-locator-toolkit.enableBetaFeatures')) {
        const config = vscode.workspace.getConfiguration('playwright-locator-toolkit');
        const enableBeta = config.get<boolean>('enableBetaFeatures', false);
        webviewView.webview.postMessage({
          type: 'beta-config',
          enabled: enableBeta
        });
      }
    });

    webviewView.onDidDispose(() => {
      configChangeDisposable.dispose();
      // Drop the active CDP connection but leave the browser running and profile folder intact.
      this.engine.softDisconnect();
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

    // Replace resource links with webview URIs
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'style.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js'));
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'icon.png'));
    const cspSource = webview.cspSource;

    html = html.replace(/\$\{styleUri\}/g, styleUri.toString());
    html = html.replace(/\$\{scriptUri\}/g, scriptUri.toString());
    html = html.replace(/\$\{logoUri\}/g, logoUri.toString());
    html = html.replace(/\$\{cspSource\}/g, cspSource);

    return html;
  }
}
