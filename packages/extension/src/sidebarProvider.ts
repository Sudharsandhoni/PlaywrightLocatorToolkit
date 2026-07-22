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
  private editorDocs = new Map<string, string>(); // fsPath -> editorId
  private activeEditorFiles = new Map<string, string>(); // editorId -> fsPath

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
              const firstVisible = pages.find((p: any) => {
                const url = p.url || '';
                const title = (p.title || '').toLowerCase();
                return !url.startsWith('chrome-devtools://') &&
                       !url.startsWith('devtools://') &&
                       !title.includes('developer tools') &&
                       !title.includes('devtools');
              });
              const activePageId = firstVisible ? firstVisible.id : pages[0]?.id;
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
              const firstVisible = pages.find((p: any) => {
                const url = p.url || '';
                const title = (p.title || '').toLowerCase();
                return !url.startsWith('chrome-devtools://') &&
                       !url.startsWith('devtools://') &&
                       !title.includes('developer tools') &&
                       !title.includes('devtools');
              });
              const activePageId = firstVisible ? firstVisible.id : pages[0]?.id;
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
          case 'perform-action': {
            if (!this.activePageId) return;
            const res = await this.engine.performAction(
              this.activePageId,
              data.locatorStr,
              data.action,
              data.args || [],
              data.timeout || 5000
            );
            webviewView.webview.postMessage({
              type: 'action-result',
              action: data.action,
              success: res.success,
              error: res.error
            });
            break;
          }
          case 'open-in-editor': {
            try {
              const editorId = data.editorId;
              const content = data.content || '';
              const mode = data.mode || 'typescript';

              let workspaceRoot = '';
              if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
              } else {
                workspaceRoot = os.tmpdir();
              }

              // Detect language preference (JS vs TS)
              const activeEditor = vscode.window.activeTextEditor;
              const activeFilePath = activeEditor ? activeEditor.document.uri.fsPath : undefined;
              
              let isTypeScript = true;
              if (activeFilePath) {
                if (activeFilePath.endsWith('.js') || activeFilePath.endsWith('.jsx') || activeFilePath.endsWith('.mjs')) {
                  isTypeScript = false;
                } else if (activeFilePath.endsWith('.ts') || activeFilePath.endsWith('.tsx') || activeFilePath.endsWith('.mts')) {
                  isTypeScript = true;
                }
              } else {
                const hasTsConfig = fs.existsSync(path.join(workspaceRoot, 'tsconfig.json'));
                const hasPlaywrightTs = fs.existsSync(path.join(workspaceRoot, 'playwright.config.ts'));
                isTypeScript = hasTsConfig || hasPlaywrightTs;
              }

              const ext = isTypeScript ? 'ts' : 'js';

              // Determine target directory (same directory as active file/tests or root)
              const targetDir = this.getSandboxTargetDir(workspaceRoot, activeFilePath);

              // Prompt user where to save the file
              const defaultName = `playground-${editorId}.${ext}`;
              const defaultUri = vscode.Uri.file(path.join(targetDir, defaultName));

              const saveUri = await vscode.window.showSaveDialog({
                defaultUri,
                title: 'Save Playground Script',
                filters: {
                  'Script Files': [ext]
                }
              });

              if (!saveUri) {
                return;
              }

              const filePath = saveUri.fsPath;

              // Ensure targetDir directory exists
              const parentDir = path.dirname(filePath);
              if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
              }

              // Add to workspace root .gitignore or fallback to .vscode/.gitignore if inside workspace
              if (filePath.startsWith(workspaceRoot)) {
                const rootGitIgnore = path.join(workspaceRoot, '.gitignore');
                const relativePathForGitignore = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
                if (fs.existsSync(rootGitIgnore)) {
                  try {
                    const gitIgnoreContent = fs.readFileSync(rootGitIgnore, 'utf8');
                    if (!gitIgnoreContent.includes(relativePathForGitignore)) {
                      fs.writeFileSync(rootGitIgnore, gitIgnoreContent.trim() + '\n\n# Playwright Live Playground Temp File\n/' + relativePathForGitignore + '\n', 'utf8');
                    }
                  } catch {}
                }
              }

              // Prepend typings reference for full autocomplete if it doesn't already have it
              let finalContent = content;
              if (!content.includes('/// <reference types=')) {
                if (editorId === 'element-script') {
                  finalContent = `/// <reference types="@playwright/test" />\n// Variable 'e' is the matched Locator, and 'page' is the active Page.\n\n` + content;
                } else if (editorId === 'browser-script') {
                  finalContent = `/// <reference types="@playwright/test" />\n// Variable 'page' is the active Page.\n\n` + content;
                } else {
                  finalContent = `/// <reference types="@playwright/test" />\n\n` + content;
                }
              }

              fs.writeFileSync(filePath, finalContent, 'utf8');

              const uri = vscode.Uri.file(filePath);
              this.editorDocs.set(filePath, editorId);
              this.activeEditorFiles.set(editorId, filePath);

              // Open document beside the webview
              const doc = await vscode.workspace.openTextDocument(uri);
              await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false,
                preview: false
              });

              webviewView.webview.postMessage({
                type: 'editor-opened',
                editorId,
                filePath,
                fileName: path.basename(filePath)
              });
            } catch (err: any) {
              vscode.window.showErrorMessage(`Failed to open editor: ${err.message}`);
            }
            break;
          }
          case 'execute-sandbox-code': {
            if (!this.activePageId) return;
            
            let userCode = data.userCode || '';
            const editorId = data.locatorStr ? 'element-script' : 'browser-script';
            const activeFilePath = this.activeEditorFiles.get(editorId);
            if (activeFilePath) {
              const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === activeFilePath);
              if (doc) {
                userCode = doc.getText();
              }
            }

            const res = await this.engine.executeExtensionSandbox(
              this.activePageId,
              data.locatorStr,
              userCode,
              data.timeout || 5000
            );
            webviewView.webview.postMessage({
              type: 'sandbox-result',
              success: res.success,
              log: res.log,
              error: res.error
            });
            break;
          }
          case 'stop-editor-sync': {
            const editorId = data.editorId;
            this.activeEditorFiles.delete(editorId);
            for (const [filePath, eid] of this.editorDocs.entries()) {
              if (eid === editorId) {
                this.editorDocs.delete(filePath);
              }
            }
            webviewView.webview.postMessage({
              type: 'editor-closed',
              editorId
            });
            break;
          }
          case 'restart-extension': {
            await this.restart();
            break;
          }
          case 'execute-workspace-script': {
            const attachCdp = !!data.attachCdp;
            let targetUrl = '';
            let defaultPort = 9222;
            let cdpUrl = '';

            if (attachCdp) {
              if (!this.activePageId) {
                webviewView.webview.postMessage({
                  type: 'workspace-script-finished',
                  success: false,
                  error: 'Please connect to a browser page/tab first to attach CDP execution.'
                });
                return;
              }

              const page = this.engine.getPage(this.activePageId);
              if (!page) {
                webviewView.webview.postMessage({
                  type: 'workspace-script-finished',
                  success: false,
                  error: 'Active page connection not found.'
                });
                return;
              }
              targetUrl = page.url();
              const config = vscode.workspace.getConfiguration('playwright-locator-toolkit');
              defaultPort = config.get<number>('debuggingPort', 9222);
              cdpUrl = data.cdpUrl || `http://127.0.0.1:${defaultPort}`;
            }

            let workspaceRoot = '';
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
              workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            } else {
              webviewView.webview.postMessage({
                type: 'workspace-script-finished',
                success: false,
                error: 'Workspace is required to run workspace scripts.'
              });
              return;
            }

            let userCode = data.userCode || '';
            const activeFilePath = this.activeEditorFiles.get('workspace-script');
            if (activeFilePath) {
              const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === activeFilePath);
              if (doc) {
                userCode = doc.getText();
              }
            }

            const activeEditor = vscode.window.activeTextEditor;
            const activeFilePathForResolving = activeEditor ? activeEditor.document.uri.fsPath : undefined;

            const isPlaywrightTest = data.mode === 'playwright-test';
            const customTempDir = this.getSandboxTargetDir(workspaceRoot, activeFilePathForResolving);
            const { filePath, cleanup } = this.engine.prepareWorkspaceScript(
              workspaceRoot,
              userCode,
              cdpUrl,
              targetUrl,
              isPlaywrightTest,
              attachCdp,
              activeFilePathForResolving,
              customTempDir
            );

            let runCmd = (data.runnerCommand || '').trim();
            if (!runCmd) {
              if (isPlaywrightTest) {
                runCmd = 'npx playwright test';
              } else {
                runCmd = filePath.endsWith('.ts') ? 'npx tsx' : 'node';
              }
            }

            const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
            let fullCmd = '';
            if (isPlaywrightTest) {
              fullCmd = `${runCmd} "${relativePath}" --reporter=line`;
            } else {
              fullCmd = `${runCmd} "${relativePath}"`;
            }

            webviewView.webview.postMessage({
              type: 'sandbox-log',
              log: `[INFO] Launching script runner: ${fullCmd}\n`,
              stream: 'info'
            });

            const cp = child_process.spawn(fullCmd, {
              cwd: workspaceRoot,
              shell: true,
              env: {
                ...process.env,
                PLAYWRIGHT_CHROMIUM_ATTACH_TO_PORT: String(defaultPort)
              }
            });

            let processKilled = false;
            const timeoutMs = data.timeout || 15000;
            const timer = setTimeout(() => {
              processKilled = true;
              cp.kill();
              webviewView.webview.postMessage({
                type: 'sandbox-log',
                log: `[ERROR] Execution timed out after ${timeoutMs}ms.\n`,
                stream: 'stderr'
              });
            }, timeoutMs);

            cp.stdout.on('data', (chunk) => {
              if (processKilled) return;
              webviewView.webview.postMessage({
                type: 'sandbox-log',
                log: chunk.toString(),
                stream: 'stdout'
              });
            });

            cp.stderr.on('data', (chunk) => {
              if (processKilled) return;
              webviewView.webview.postMessage({
                type: 'sandbox-log',
                log: chunk.toString(),
                stream: 'stderr'
              });
            });

            cp.on('error', (err) => {
              clearTimeout(timer);
              cleanup();
              webviewView.webview.postMessage({
                type: 'sandbox-log',
                log: `[ERROR] Failed to start process: ${err.message}\n`,
                stream: 'stderr'
              });
              webviewView.webview.postMessage({
                type: 'workspace-script-finished',
                success: false,
                code: 1,
                error: err.message
              });
            });

            cp.on('close', (code) => {
              clearTimeout(timer);
              cleanup();
              if (processKilled) return;
              
              webviewView.webview.postMessage({
                type: 'workspace-script-finished',
                success: code === 0,
                code
              });
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

    // Watch for document changes and sync content back to the webview
    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
      const editorId = this.editorDocs.get(e.document.uri.fsPath);
      if (editorId) {
        this.activeEditorFiles.set(editorId, e.document.uri.fsPath);
        try {
          webviewView.webview.postMessage({
            type: 'editor-content-synced',
            editorId,
            content: e.document.getText(),
            filePath: e.document.uri.fsPath,
            fileName: path.basename(e.document.uri.fsPath)
          });
        } catch {}
      }
    });

    // Watch for document closures, clean up mapping (DO NOT delete the user's file)
    const docCloseDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
      const editorId = this.editorDocs.get(doc.uri.fsPath);
      if (editorId) {
        this.editorDocs.delete(doc.uri.fsPath);
        const activeFile = this.activeEditorFiles.get(editorId);
        if (activeFile === doc.uri.fsPath) {
          this.activeEditorFiles.delete(editorId);
        }
        try {
          webviewView.webview.postMessage({
            type: 'editor-closed',
            editorId,
            filePath: doc.uri.fsPath
          });
        } catch {}
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
      docChangeDisposable.dispose();
      docCloseDisposable.dispose();
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

  public async restart() {
    try {
      await this.engine.disconnect();
    } catch {}
    try {
      if (this.spawnedBrowser) {
        this.spawnedBrowser.kill();
      }
    } catch {}
    this.editorDocs.clear();
    this.activeEditorFiles.clear();
    this.engine = new LocatorEngine();
    this.activePageId = undefined;

    if (this._view) {
      this._view.webview.postMessage({
        type: 'extension-restarted'
      });
    }
    vscode.window.showInformationMessage('Playwright Live Playground extension restarted.');
  }

  private getSandboxTargetDir(workspaceRoot: string, activeFilePath?: string): string {
    const config = vscode.workspace.getConfiguration('playwright-locator-toolkit');
    const customTempDir = config.get<string>('tempDir')?.trim();
    if (customTempDir) {
      return path.isAbsolute(customTempDir) ? customTempDir : path.resolve(workspaceRoot, customTempDir);
    }

    if (activeFilePath && activeFilePath.startsWith(workspaceRoot)) {
      if (
        activeFilePath.endsWith('.spec.ts') || activeFilePath.endsWith('.spec.js') ||
        activeFilePath.endsWith('.test.ts') || activeFilePath.endsWith('.test.js')
      ) {
        try {
          const dir = path.dirname(activeFilePath);
          if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            return dir;
          }
        } catch {}
      }
    }

    let configTestDir: string | undefined = undefined;
    const configFiles = ['playwright.config.ts', 'playwright.config.js'];
    for (const configFile of configFiles) {
      const configPath = path.join(workspaceRoot, configFile);
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf8');
          const match = content.match(/testDir\s*:\s*['"`]([^'"`]+)['"`]/);
          if (match && match[1]) {
            configTestDir = match[1].trim();
            break;
          }
        } catch {}
      }
    }
    if (configTestDir) {
      const resolvedTestDir = path.resolve(workspaceRoot, configTestDir);
      if (fs.existsSync(resolvedTestDir) && fs.statSync(resolvedTestDir).isDirectory()) {
        return resolvedTestDir;
      }
    }

    const commonDirs = ['tests', 'e2e', 'specs', 'test'];
    for (const dirName of commonDirs) {
      const fullDir = path.join(workspaceRoot, dirName);
      if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
        return fullDir;
      }
    }

    const findFirstSpecDir = (dir: string): string | null => {
      try {
        const files = fs.readdirSync(dir);
        const dirsToSearch: string[] = [];
        for (const file of files) {
          if (
            file === 'node_modules' || 
            file === '.git' || 
            file === '.vscode' || 
            file === 'dist' || 
            file === 'build' ||
            file === 'packages'
          ) {
            continue;
          }
          const fullPath = path.join(dir, file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              dirsToSearch.push(fullPath);
            } else if (
              (file.endsWith('.spec.ts') || file.endsWith('.spec.js') || 
               file.endsWith('.test.ts') || file.endsWith('.test.js')) &&
              !file.includes('locator-lens-sandbox')
            ) {
              return dir;
            }
          } catch {}
        }
        for (const subDir of dirsToSearch) {
          const found = findFirstSpecDir(subDir);
          if (found) return found;
        }
      } catch {}
      return null;
    };

    const resolvedSpecDir = findFirstSpecDir(workspaceRoot);
    if (resolvedSpecDir) {
      return resolvedSpecDir;
    }

    return workspaceRoot;
  }
}
