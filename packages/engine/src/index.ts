import { chromium, Browser, Page, Locator } from 'playwright-core';
import { parseLocator, stringifyLocator, LocatorStep } from 'playwright-locator-lens-parser';
import { AGENT_SCRIPT } from 'playwright-locator-lens-agent';

const ALLOWED_LOCATOR_METHODS = new Set([
  'locator',
  'getByRole',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'getByAltText',
  'getByTitle',
  'getByTestId',
  'first',
  'last',
  'nth',
  'filter',
  'or',
  'and'
]);

function resolveArg(arg: any, page: Page): any {
  if (arg && typeof arg === 'object') {
    if (arg.type === 'nested_locator') {
      return constructLocator(page, arg.steps);
    }
    if (arg.source !== undefined && arg.flags !== undefined) {
      return new RegExp(arg.source, arg.flags);
    }
    if (arg instanceof RegExp) {
      return arg;
    }
    const resolvedObj: any = {};
    for (const [k, v] of Object.entries(arg)) {
      resolvedObj[k] = resolveArg(v, page);
    }
    return resolvedObj;
  }
  return arg;
}

function constructLocator(page: Page, steps: LocatorStep[]): Locator {
  let current: any = page;
  for (const step of steps) {
    if (!ALLOWED_LOCATOR_METHODS.has(step.name)) {
      throw new Error(`Forbidden or unsupported locator method: ${step.name}`);
    }
    const method = current[step.name];
    if (typeof method !== 'function') {
      throw new Error(`Method ${step.name} is not available on current locator target.`);
    }
    const resolvedArgs = step.args.map(arg => resolveArg(arg, page));
    current = method.apply(current, resolvedArgs);
  }
  return current;
}
import {
  EvaluationResult,
  ElementDetails,
  AlternativeLocator,
  FailureAnalysisResult,
  FailureStepAnalysis,
  PageInfo,
  ChainAnalysisResult,
  ChainBranch,
  StabilityResult,
  StabilityRun,
  FormStructure,
  UiNode,
  UiScannerResult,
  AccessibilityIssue,
  LocatorHealthReport,
  AutomationReadinessScore
} from 'playwright-locator-lens-shared';

function toCamelCase(str: string): string {
  const parts = str.split(/[^a-zA-Z0-9]+|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map((p, idx) => {
    const cleaned = p.replace(/[^a-zA-Z0-9]/g, '');
    if (idx === 0) {
      return cleaned.toLowerCase();
    }
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  }).join('');
}

function toPascalCase(str: string): string {
  const parts = str.split(/[^a-zA-Z0-9]+|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map(p => {
    const cleaned = p.replace(/[^a-zA-Z0-9]/g, '');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  }).join('');
}

function cleanNodeName(name: string): string {
  let cleaned = name;
  // Strip trailing common containers
  cleaned = cleaned.replace(/(Defaults|Default|Section|Form|Card|Panel|Group|Container|Wrapper|Box)$/i, '');
  // Strip trailing single letter suffix (e.g. Fetus A -> Fetus)
  cleaned = cleaned.replace(/\s+[A-Z]$/, '');
  cleaned = cleaned.replace(/([a-z])([A-Z])$/, '$1');
  return cleaned.trim() || name;
}

export class LocatorEngine {
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private cdpUrl: string = '';

  async connect(cdpUrl: string): Promise<PageInfo[]> {
    this.cdpUrl = cdpUrl;
    if (this.browser) {
      await this.disconnect();
    }

    this.browser = await chromium.connectOverCDP(cdpUrl, { timeout: 5000 });
    this.pages.clear();

    const contexts = this.browser.contexts();
    const allPages: PageInfo[] = [];

    // Retrieve all pages across contexts
    for (const context of contexts) {
      const contextPages = context.pages();
      for (let idx = 0; idx < contextPages.length; idx++) {
        const page = contextPages[idx];
        const id = `page-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`;
        this.pages.set(id, page);
        
        let title = 'Untitled';
        try {
          title = await page.title();
        } catch {
          // page might be loading or closed
        }

        let url = 'about:blank';
        try {
          url = page.url();
        } catch {}

        allPages.push({ id, title, url });
      }
    }

    return allPages;
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
      this.browser = null;
    }
    this.pages.clear();
  }

  /** Soft disconnect — drops internal state but leaves Chrome running. */
  softDisconnect(): void {
    this.browser = null;
    this.pages.clear();
  }

  /** Re-list all open tabs from the currently connected browser. */
  async getPages(): Promise<PageInfo[]> {
    if (!this.browser) {
      throw new Error('Not connected to a browser.');
    }
    this.pages.clear();
    const contexts = this.browser.contexts();
    const allPages: PageInfo[] = [];
    for (const context of contexts) {
      const contextPages = context.pages();
      for (let idx = 0; idx < contextPages.length; idx++) {
        const page = contextPages[idx];
        const id = `page-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`;
        this.pages.set(id, page);
        let title = 'Untitled';
        try { title = await page.title(); } catch {}
        let url = 'about:blank';
        try { url = page.url(); } catch {}
        allPages.push({ id, title, url });
      }
    }
    return allPages;
  }

  getPage(id: string): Page | undefined {
    return this.pages.get(id);
  }

  private async ensureAgentInjected(page: Page): Promise<void> {
    try {
      const isInjected = await page.evaluate(() => typeof (window as any).__locatorLensAgent !== 'undefined');
      if (!isInjected) {
        await page.evaluate(AGENT_SCRIPT);
      }
    } catch (err: any) {
      throw new Error(`Failed to inject locator lens browser agent: ${err.message}`);
    }
  }

  async getAutocompleteData(pageId: string): Promise<any> {
    const page = this.getPage(pageId);
    if (!page) {
      throw new Error('Target page/tab not found or has been closed.');
    }

    try {
      await this.ensureAgentInjected(page);
      const data = await page.evaluate(() => {
        return (window as any).__locatorLensAgent.getAutocompleteData();
      });
      return data;
    } catch (err: any) {
      throw new Error(`Failed to retrieve autocomplete data from page: ${err.message}`);
    }
  }

  async evaluate(pageId: string, locatorStr: string): Promise<EvaluationResult> {
    const page = this.getPage(pageId);
    if (!page) {
      return {
        success: false,
        error: 'Target page/tab not found or has been closed.',
        count: 0,
        elements: [],
        confidence: 0,
        confidenceFactors: [],
        alternatives: []
      };
    }

    try {
      await this.ensureAgentInjected(page);
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to inject browser agent: ${err.message}`,
        count: 0,
        elements: [],
        confidence: 0,
        confidenceFactors: [{ text: 'Injection Failed', positive: false }],
        alternatives: []
      };
    }

    let parsedSteps: LocatorStep[] = [];
    try {
      parsedSteps = parseLocator(locatorStr);
    } catch (err: any) {
      // Provide a more helpful error for .or without parentheses
      let parseErrMsg = err.message;
      if (
        parseErrMsg.includes('Expected token LPAREN, but got DOT') ||
        parseErrMsg.includes('Expected token LPAREN')
      ) {
        // Check if the locator contains '.or.' (dot after or without parens)
        if (/\.or\s*\./.test(locatorStr) || /\.or\s*$/.test(locatorStr)) {
          parseErrMsg = `Syntax Error: ".or" must be called as a method with an argument, e.g.:\n.or(locator('...'))

Incorrect: .or.locator('...')  ←  missing parentheses and argument\nCorrect:   .or(locator('...'))  ←  pass the alternative locator as argument`;
        }
      }
      return {
        success: false,
        error: `Syntax Parsing Error: ${parseErrMsg}`,
        count: 0,
        elements: [],
        confidence: 0,
        confidenceFactors: [{ text: 'Invalid Syntax', positive: false }],
        alternatives: []
      };
    }

    let locatorInstance: Locator;
    try {
      if (parsedSteps.length === 0) {
        throw new Error('Locator expression contains no steps.');
      }
      locatorInstance = constructLocator(page, parsedSteps);
      
      // Verify that the result is indeed a Playwright Locator
      if (!locatorInstance || typeof locatorInstance.count !== 'function') {
        throw new Error('Expression did not evaluate to a Playwright Locator instance.');
      }
    } catch (err: any) {
      let evalErrMsg = err.message;
      if (evalErrMsg.includes("reading '_frame'") || evalErrMsg.includes("reading '_selector'") || parsedSteps.some(s => s.name === 'or' && s.args.length === 0)) {
        evalErrMsg = `.or() requires another locator as an argument, e.g. .or(locator('...'))`;
      }
      return {
        success: false,
        error: `Evaluation Error: ${evalErrMsg}`,
        count: 0,
        elements: [],
        confidence: 0,
        confidenceFactors: [{ text: 'Evaluation Failed', positive: false }],
        alternatives: []
      };
    }

    try {
      const count = await locatorInstance.count();

      if (count === 0) {
        // Run Failure Analysis
        const failureAnalysis = await this.performFailureAnalysis(page, parsedSteps);
        return {
          success: true,
          count: 0,
          elements: [],
          confidence: 0,
          confidenceFactors: [{ text: 'No matching elements found', positive: false }],
          alternatives: failureAnalysis.suggestedAlternatives,
          failureAnalysis
        };
      }

      const elements = await locatorInstance.evaluateAll((elems) => {
        return elems.map(el => (window as any).__locatorLensAgent.getElementInfo(el)).filter(Boolean);
      }) as ElementDetails[];

      // Compute Confidence Score based on first matched element (or common elements)
      const primaryElement = elements[0];
      const { confidence, factors } = this.calculateConfidence(locatorStr, count, primaryElement, parsedSteps);

      const alternatives = await locatorInstance.evaluateAll((elems) => {
        const list: any[] = [];
        const seen = new Set();
        elems.forEach(el => {
          const alts = (window as any).__locatorLensAgent.generateAlternatives(el);
          alts.forEach((alt: any) => {
            if (!seen.has(alt.selector)) {
              seen.add(alt.selector);
              list.push(alt);
            }
          });
        });
        return list;
      }) as AlternativeLocator[];

      return {
        success: true,
        count,
        elements,
        confidence,
        confidenceFactors: factors,
        alternatives
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Execution Error: ${err.message}`,
        count: 0,
        elements: [],
        confidence: 0,
        confidenceFactors: [],
        alternatives: []
      };
    }
  }

  async highlight(pageId: string, locatorStr: string, scrollIndex?: number): Promise<boolean> {
    const page = this.getPage(pageId);
    if (!page) return false;

    try {
      await this.ensureAgentInjected(page);

      // Clear previous overlays first
      await page.evaluate(() => {
        (window as any).__locatorLensAgent?.clear();
      });

      if (!locatorStr.trim()) return true;

      const parsedSteps = parseLocator(locatorStr);
      if (parsedSteps.length === 0) return false;
      const locatorInstance = constructLocator(page, parsedSteps);
      const count = await locatorInstance.count();

      if (count === 0) {
        return false;
      }

      const type = count === 1 ? 'success' : 'warning';

      // Highlight matching elements directly in the page context
      await locatorInstance.evaluateAll((elems: any, [hlType, scrollIdx]: any) => {
        if ((window as any).__locatorLensAgent) {
          (window as any).__locatorLensAgent.highlight(elems, hlType, scrollIdx);
        }
      }, [type, scrollIndex] as const);

      return true;
    } catch {
      return false;
    }
  }

  async clearHighlight(pageId: string): Promise<void> {
    const page = this.getPage(pageId);
    if (!page) return;
    try {
      await page.evaluate(() => {
        (window as any).__locatorLensAgent?.clear();
      });
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 3 — .or() Chain Tree Analyzer
  // ─────────────────────────────────────────────────────────────

  async analyzeChain(pageId: string, locatorStr: string): Promise<ChainAnalysisResult> {
    const page = this.getPage(pageId);
    if (!page) {
      return { success: false, error: 'Page not found.', branches: [], totalMatches: 0 };
    }

    // Extract individual branches split by .or(
    // e.g. "getByRole('spinbutton').or(getByRole('textbox')).or(getByRole('combobox'))"
    // Split on ".or(" boundaries to get each branch expression
    const branches: ChainBranch[] = [];
    const rawBranches = this.splitOrChain(locatorStr);

    let totalMatches = 0;

    for (const branchExpr of rawBranches) {
      try {
        const parsedSteps = parseLocator(branchExpr);
        if (parsedSteps.length === 0) {
          throw new Error('Branch expression contains no steps.');
        }
        const locatorInstance = constructLocator(page, parsedSteps);
        const count = await locatorInstance.count();
        totalMatches += count;
        branches.push({ locatorStr: branchExpr, matchCount: count, isWinner: false });
      } catch (err: any) {
        branches.push({ locatorStr: branchExpr, matchCount: 0, error: err.message, isWinner: false });
      }
    }

    // Mark branches that found at least 1 match as winners
    const hasWinner = branches.some(b => b.matchCount > 0);
    if (hasWinner) {
      branches.forEach(b => {
        if (b.matchCount > 0) b.isWinner = true;
      });
    }

    return { success: true, branches, totalMatches };
  }

  /**
   * Split "a.or(b).or(c)" into ["a", "b", "c"] handling nested parentheses.
   */
  private splitOrChain(locatorStr: string): string[] {
    // Remove leading "page." prefix if present
    const normalized = locatorStr.replace(/^\s*page\s*\.\s*/, '');

    const branches: string[] = [];
    let i = 0;
    let current = '';
    let parenDepth = 0;
    let inQuote: string | null = null;
    let isEscaped = false;
    let insideOr = false;

    while (i < normalized.length) {
      const char = normalized[i];

      if (isEscaped) {
        current += char;
        isEscaped = false;
        i++;
        continue;
      }

      if (char === '\\') {
        current += char;
        isEscaped = true;
        i++;
        continue;
      }

      // Handle quotes
      if (inQuote) {
        if (char === inQuote) {
          inQuote = null;
        }
        current += char;
        i++;
        continue;
      }

      if (char === "'" || char === '"' || char === '`') {
        inQuote = char;
        current += char;
        i++;
        continue;
      }

      // Check for ".or(" pattern
      if (
        !insideOr &&
        parenDepth === 0 &&
        char === '.' &&
        normalized.slice(i, i + 4) === '.or('
      ) {
        if (current.trim()) {
          branches.push(current.trim());
        }
        current = '';
        i += 4; // skip ".or("
        insideOr = true;
        parenDepth = 1; // we enter the .or( ... )
        continue;
      }

      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        if (insideOr && parenDepth === 1) {
          // This is the closing parenthesis of the top-level .or(...)
          insideOr = false;
          parenDepth = 0;
          if (current.trim()) {
            branches.push(current.trim());
          }
          current = '';
          i++;
          continue;
        }
        parenDepth = Math.max(0, parenDepth - 1);
      }

      current += char;
      i++;
    }

    if (current.trim()) {
      branches.push(current.trim());
    }

    return branches.length > 0 ? branches : [normalized];
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 7 — Stability Testing
  // ─────────────────────────────────────────────────────────────

  async stabilityTest(
    pageId: string,
    locatorStr: string,
    runs: number = 5
  ): Promise<StabilityResult> {
    const page = this.getPage(pageId);
    if (!page) {
      return {
        success: false,
        error: 'Page not found.',
        runs: [],
        score: 0,
        locatorStr
      };
    }

    const runResults: StabilityRun[] = [];
    let foundCount = 0;

    for (let i = 0; i < runs; i++) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });

        // Re-inject agent after reload
        try {
          await this.ensureAgentInjected(page);
        } catch { /* best effort */ }

        const parsedSteps = parseLocator(locatorStr);
        if (parsedSteps.length === 0) {
          throw new Error('Locator expression contains no steps.');
        }
        const locatorInstance = constructLocator(page, parsedSteps);
        const count = await locatorInstance.count();
        const found = count > 0;
        if (found) foundCount++;
        runResults.push({ run: i + 1, found, matchCount: count });
      } catch (err: any) {
        runResults.push({ run: i + 1, found: false, matchCount: 0, error: err.message });
      }
    }

    const score = Math.round((foundCount / runs) * 100);
    return { success: true, runs: runResults, score, locatorStr };
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 5 — Field Simulation Engine
  // ─────────────────────────────────────────────────────────────

  async simulateFill(pageId: string, locatorStr: string, value: string): Promise<boolean> {
    const page = this.getPage(pageId);
    if (!page) return false;
    try {
      await this.ensureAgentInjected(page);
      
      const parsedSteps = parseLocator(locatorStr);
      if (parsedSteps.length === 0) return false;
      const locatorInstance = constructLocator(page, parsedSteps);
      const handle = await locatorInstance.elementHandle();
      
      if (!handle) return false;
      
      return await page.evaluate(([el, val]: any) => {
        return (window as any).__locatorLensAgent.simulateFill(el, val);
      }, [handle, value] as const);
    } catch (err) {
      console.error('Failed to simulate fill:', err);
      return false;
    }
  }

  async simulateClick(pageId: string, locatorStr: string, x?: number, y?: number): Promise<boolean> {
    const page = this.getPage(pageId);
    if (!page) return false;
    try {
      await this.ensureAgentInjected(page);
      
      const parsedSteps = parseLocator(locatorStr);
      if (parsedSteps.length === 0) return false;
      const locatorInstance = constructLocator(page, parsedSteps);
      const handle = await locatorInstance.elementHandle();
      
      if (!handle) return false;
      
      return await page.evaluate(([el, clickX, clickY]: any) => {
        return (window as any).__locatorLensAgent.simulateClick(el, clickX, clickY);
      }, [handle, x, y] as const);
    } catch (err) {
      console.error('Failed to simulate click:', err);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 6 — Bulk Stability Testing
  // ─────────────────────────────────────────────────────────────

  async bulkStabilityTest(
    pageId: string,
    locatorStrs: string[],
    runs: number = 3
  ): Promise<{ [locatorStr: string]: StabilityResult }> {
    const page = this.getPage(pageId);
    if (!page) {
      throw new Error('Page not found.');
    }

    const results: { [locatorStr: string]: StabilityRun[] } = {};
    const foundCounts: { [locatorStr: string]: number } = {};
    locatorStrs.forEach(loc => {
      results[loc] = [];
      foundCounts[loc] = 0;
    });

    for (let r = 0; r < runs; r++) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        try {
          await this.ensureAgentInjected(page);
        } catch { /* best effort */ }

        for (const locatorStr of locatorStrs) {
          try {
            const parsedSteps = parseLocator(locatorStr);
            if (parsedSteps.length === 0) {
              throw new Error('Locator expression contains no steps.');
            }
            const locatorInstance = constructLocator(page, parsedSteps);
            const count = await locatorInstance.count();
            const found = count > 0;
            if (found) {
              foundCounts[locatorStr]++;
            }
            results[locatorStr].push({ run: r + 1, found, matchCount: count });
          } catch (err: any) {
            results[locatorStr].push({ run: r + 1, found: false, matchCount: 0, error: err.message });
          }
        }
      } catch (err: any) {
        locatorStrs.forEach(locatorStr => {
          results[locatorStr].push({ run: r + 1, found: false, matchCount: 0, error: `Reload failed: ${err.message}` });
        });
      }
    }

    const finalResults: { [locatorStr: string]: StabilityResult } = {};
    locatorStrs.forEach(locatorStr => {
      const score = Math.round((foundCounts[locatorStr] / runs) * 100);
      finalResults[locatorStr] = {
        success: true,
        runs: results[locatorStr],
        score,
        locatorStr
      };
    });

    return finalResults;
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 8 — Form-Aware Analysis
  // ─────────────────────────────────────────────────────────────

  async scanForms(pageId: string): Promise<FormStructure[]> {
    const page = this.getPage(pageId);
    if (!page) {
      throw new Error('Page not found.');
    }

    await this.ensureAgentInjected(page);

    const forms = await page.evaluate(() => {
      return (window as any).__locatorLensAgent.scanForms();
    }) as FormStructure[];

    return forms;
  }

  // ─────────────────────────────────────────────────────────────
  // UI Intelligence Scanner
  // ─────────────────────────────────────────────────────────────

  async scanUI(pageId: string): Promise<UiScannerResult> {
    const page = this.getPage(pageId);
    if (!page) {
      throw new Error('Page not found.');
    }

    await this.ensureAgentInjected(page);

    const scanResult = await page.evaluate(() => {
      return (window as any).__locatorLensAgent.scanUI();
    }) as UiScannerResult;

    return scanResult;
  }

  generatePOMExport(tree: UiNode[], customClassName?: string, sectionNaming?: string): string {
    const lines: string[] = [];
    lines.push("import { Page, Locator } from '@playwright/test';\n");
    
    const pageNode = tree.find(n => n.type === 'page') || tree[0];
    const rawClassName = customClassName || (pageNode ? pageNode.name : 'ScannedPage');
    const className = toPascalCase(rawClassName) + (rawClassName.endsWith('Page') ? '' : 'Page');
    
    lines.push(`export class ${className} {`);
    lines.push(`  readonly page: Page;`);
    
    const declarations: string[] = [];
    const initializers: string[] = [];
    const seenProperties = new Set<string>();
    
    function getUniquePropName(node: UiNode, parentNode?: UiNode): string {
      let baseName = node.name;
      if (node.parentSectionName) {
        const sectionClean = cleanNodeName(node.parentSectionName);
        if (sectionNaming === 'prefix') {
          baseName = sectionClean + ' ' + baseName;
        } else if (sectionNaming === 'suffix') {
          baseName = baseName + ' ' + sectionClean;
        }
      }

      let name = toCamelCase(cleanNodeName(baseName));
      if (!name) name = 'element';
      
      if (seenProperties.has(name) && parentNode?.name) {
        const parentClean = toPascalCase(cleanNodeName(parentNode.name));
        name = toCamelCase(parentClean + toPascalCase(name));
      }
      
      let finalName = name;
      let counter = 2;
      while (seenProperties.has(finalName)) {
        finalName = `${name}${counter}`;
        counter++;
      }
      seenProperties.add(finalName);
      return finalName;
    }
    
    function traverse(node: UiNode, parentVar: string = 'page', parentNode?: UiNode) {
      const type = node.type;
      if (type === 'section' || type === 'subsection' || type === 'dialog' || type === 'table' || type === 'grid') {
        const varName = getUniquePropName(node, parentNode);
        declarations.push(`  readonly ${varName}: Locator;`);
        initializers.push(`    this.${varName} = ${parentVar}.${node.locator};`);
        
        node.children.forEach(c => traverse(c, `this.${varName}`, node));
        return;
      } else if (type === 'field' || type === 'image' || type === 'svg' || type === 'canvas' || type === 'rte') {
        const varName = getUniquePropName(node, parentNode);
        declarations.push(`  readonly ${varName}: Locator;`);
        initializers.push(`    this.${varName} = ${parentVar}.${node.locator};`);
      }
      
      node.children.forEach(c => traverse(c, parentVar, parentNode));
    }
    
    tree.forEach(n => traverse(n));
    
    lines.push(declarations.join('\n'));
    lines.push('\n  constructor(page: Page) {');
    lines.push('    this.page = page;');
    lines.push(initializers.join('\n'));
    lines.push('  }');
    lines.push('}');
    
    return lines.join('\n');
  }

  generateSDKExport(tree: UiNode[]): string {
    const code = `import { Page, Locator } from '@playwright/test';

export class UIAutomationSDK {
  constructor(public readonly page: Page) {}

  /**
   * Scoped section finder
   */
  getSection(name: string): Locator {
    return this.page.locator('fieldset, section, [role="region"], [role="group"], .card, .panel')
      .filter({ has: this.page.locator('legend, h1, h2, h3, h4, h5, h6, [aria-label]').filter({ hasText: name }) })
      .first();
  }

  /**
   * Generic API to interact with any field by its section and label
   */
  async fillField(options: { section?: string; label: string; value: string }) {
    let scope = options.section ? this.getSection(options.section) : this.page;
    const field = scope.getByLabel(options.label)
      .or(scope.getByPlaceholder(options.label))
      .or(scope.getByRole('textbox', { name: options.label }))
      .or(scope.locator('input, textarea, select').filter({ hasText: options.label }));
    await field.first().fill(options.value);
  }

  /**
   * Generic API to click a button in a section
   */
  async clickButton(options: { section?: string; label: string }) {
    let scope = options.section ? this.getSection(options.section) : this.page;
    const btn = scope.getByRole('button', { name: options.label })
      .or(scope.getByText(options.label))
      .or(scope.locator('button, a, [role="button"]').filter({ hasText: options.label }));
    await btn.first().click();
  }

  /**
   * Generic API to read table cells
   */
  async getTableCell(options: { tableSection: string; rowIndex: number; columnName: string }): Promise<string> {
    const tableScope = this.getSection(options.tableSection);
    const headers = await tableScope.locator('th, [role="columnheader"]').allTextContents();
    const colIndex = headers.indexOf(options.columnName);
    if (colIndex === -1) {
      throw new Error(\`Column "\${options.columnName}" not found in table "\${options.tableSection}". Available columns: \${headers.join(', ')}\`);
    }
    const cell = tableScope.locator('tr, [role="row"]').nth(options.rowIndex + 1).locator('td, [role="gridcell"]').nth(colIndex);
    return (await cell.innerText()).trim();
  }
}
`;
    return code;
  }

  generateTSInterfacesExport(tree: UiNode[], sectionNaming?: string): string {
    const lines: string[] = [];
    const seenInterfaces = new Set<string>();
    
    function getFieldName(f: UiNode): string {
      let baseName = f.name;
      if (f.parentSectionName) {
        const sectionClean = cleanNodeName(f.parentSectionName);
        if (sectionNaming === 'prefix') {
          baseName = sectionClean + ' ' + baseName;
        } else if (sectionNaming === 'suffix') {
          baseName = baseName + ' ' + sectionClean;
        }
      }
      return toCamelCase(cleanNodeName(baseName));
    }

    function traverse(node: UiNode) {
      const fields = node.children.filter(c => c.type === 'field');
      if (fields.length > 0) {
        const cleanName = toPascalCase(cleanNodeName(node.name));
        let interfaceName = cleanName + 'Data';
        
        let finalName = interfaceName;
        let counter = 2;
        while (seenInterfaces.has(finalName)) {
          finalName = `${cleanName}${counter}Data`;
          counter++;
        }
        seenInterfaces.add(finalName);
        
        lines.push(`export interface ${finalName} {`);
        fields.forEach(f => {
          const cleanFieldName = getFieldName(f);
          if (cleanFieldName) {
            lines.push(`  ${cleanFieldName}?: string;`);
          }
        });
        lines.push('}\n');
      }
      node.children.forEach(c => {
        if (c.type !== 'field') {
          traverse(c);
        }
      });
    }
    
    tree.forEach(n => traverse(n));
    
    if (lines.length === 0) {
      lines.push('export interface PageData {\n  [key: string]: any;\n}');
    }
    
    return lines.join('\n');
  }

  generateJSONSchemaExport(tree: UiNode[]): string {
    const schema: any = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {},
      required: []
    };

    function traverse(node: UiNode, currentProps: any) {
      if (node.type === 'section' || node.type === 'subsection' || node.type === 'dialog') {
        const sectionProps: any = {
          type: 'object',
          properties: {},
          required: []
        };

        const fields = node.children.filter(c => c.type === 'field');
        fields.forEach(f => {
          sectionProps.properties[f.name] = {
            type: 'string',
            description: `Field: ${f.name}, Locator: ${f.locator}`
          };
          if (f.meta?.required) {
            sectionProps.required.push(f.name);
          }
        });

        if (fields.length > 0) {
          currentProps[node.name] = sectionProps;
        }

        node.children.forEach(c => traverse(c, sectionProps.properties));
      } else {
        node.children.forEach(c => traverse(c, currentProps));
      }
    }

    tree.forEach(n => traverse(n, schema.properties));

    if (Object.keys(schema.properties).length === 0) {
      schema.properties.fields = {
        type: 'object',
        additionalProperties: { type: 'string' }
      };
    }

    return JSON.stringify(schema, null, 2);
  }

  generateYAMLExport(tree: UiNode[]): string {
    const lines: string[] = [];
    
    function traverse(node: UiNode, indent: number = 0) {
      const pad = ' '.repeat(indent);
      lines.push(`${pad}- name: "${node.name.replace(/"/g, '\\"')}"`);
      lines.push(`${pad}  type: "${node.type}"`);
      lines.push(`${pad}  locator: "${node.locator.replace(/"/g, '\\"')}"`);
      if (node.children.length > 0) {
        lines.push(`${pad}  children:`);
        node.children.forEach(c => traverse(c, indent + 4));
      }
    }
    
    lines.push('page_structure:');
    tree.forEach(n => traverse(n, 2));
    
    return lines.join('\n');
  }



  private calculateConfidence(
    locatorStr: string,
    count: number,
    el?: ElementDetails,
    steps?: LocatorStep[]
  ): { confidence: number; factors: { text: string; positive: boolean }[] } {
    const factors: { text: string; positive: boolean }[] = [];

    // ── Step 1: Tier base score (matches browser-agent generateAlternatives tiers) ──
    let score = 50; // default for unknown patterns

    if (locatorStr.includes('getByTestId')) {
      score = 98;
      factors.push({ text: 'Uses stable data-testid locator', positive: true });
    } else if (locatorStr.includes('getByLabel')) {
      score = 95;
      factors.push({ text: 'Uses getByLabel standard form query', positive: true });
    } else if (locatorStr.includes('getByRole') && (locatorStr.includes('name:') || locatorStr.includes('name :'))) {
      score = 92;
      factors.push({ text: 'Uses getByRole with accessible name filter', positive: true });
    } else if (locatorStr.includes('getByPlaceholder') || locatorStr.includes('getByAltText') || locatorStr.includes('getByTitle')) {
      score = 85;
      factors.push({ text: 'Uses accessible attribute locator', positive: true });
    } else if (locatorStr.includes('getByText')) {
      score = 80;
      factors.push({ text: 'Uses getByText content match', positive: true });
    } else if (locatorStr.includes('getByRole')) {
      score = 75;
      factors.push({ text: 'Uses getByRole without name filter', positive: true });
    } else if (locatorStr.includes('locator(')) {
      const cssMatch = locatorStr.match(/locator\(\s*['"`](.*?)['"`]\s*\)/);
      if (cssMatch) {
        const selector = cssMatch[1];
        if (selector.startsWith('#') && !selector.includes(' ') && !selector.includes('>')) {
          score = 85;
          factors.push({ text: 'Uses CSS ID locator', positive: true });
        } else if (selector.startsWith('//') || selector.startsWith('xpath=')) {
          score = 40;
          factors.push({ text: 'Uses XPath locator (fragile to structure)', positive: false });
        } else {
          score = 55;
          factors.push({ text: 'Uses CSS path selector', positive: false });
        }
      }
    }

    // ── Step 2: Evaluation adjustments (±) ──

    // Match uniqueness: being unique is ideal; multiple matches = worse
    if (count === 1) {
      factors.push({ text: 'Single unique match', positive: true });
      // No penalty/bonus — uniqueness is expected at this tier
    } else if (count > 1) {
      score = Math.max(0, score - 15);
      factors.push({ text: `Multiple matches found (${count}) — not unique`, positive: false });
    } else {
      // count === 0 shouldn't reach here, but guard anyway
      score = 0;
      factors.push({ text: 'No matching elements found', positive: false });
    }

    // Visibility
    if (el?.visible) {
      factors.push({ text: 'Element is visible on screen', positive: true });
    } else if (el) {
      score = Math.max(0, score - 8);
      factors.push({ text: 'Element is hidden/invisible', positive: false });
    }

    // Dynamic/generated ID penalty (only if locator actually uses the ID)
    if (el?.id) {
      const isDynamic = /(mui|ag-|grid-|ng-|val-|id-|ember|k-|dx-)/i.test(el.id) ||
                        /^[0-9]+$/.test(el.id) ||
                        /[0-9]{4,}/.test(el.id);
      if (isDynamic && locatorStr.includes(`#${el.id}`)) {
        score = Math.max(0, score - 20);
        factors.push({ text: 'Uses generated/dynamic element ID', positive: false });
      }
    }

    // Index-based fragility
    if (/\.(nth|first|last)\(/.test(locatorStr) || locatorStr.includes(':nth-child') || locatorStr.includes(':nth-of-type')) {
      score = Math.max(0, score - 12);
      factors.push({ text: 'Uses index filters (fragile to page list changes)', positive: false });
    }

    // Excessively long or CSS-polluted text patterns
    const fragileCheck = this.hasFragileNameFilter(steps);
    if (fragileCheck.fragile) {
      score = Math.max(0, score - 40);
      factors.push({ text: fragileCheck.reason, positive: false });
    }

    const confidence = Math.max(0, Math.min(100, Math.round(score)));
    return { confidence, factors };
  }

  private hasFragileNameFilter(steps?: LocatorStep[]): { fragile: boolean; reason: string } {
    if (!steps) return { fragile: false, reason: '' };

    const cssPatterns = [
      /:where\(/i,
      /--[a-zA-Z0-9_-]/, // CSS variables e.g. --ag-
      /\{/,
      /\}/,
      /var\(/i,
      /calc\(/i,
      /rgba?\(/i,
      /color-mix\(/i,
      /;/,
    ];

    for (const step of steps) {
      for (const arg of step.args) {
        if (typeof arg === 'string') {
          if (arg.length > 60) {
            return { fragile: true, reason: 'Text filter is excessively long (> 60 characters)' };
          }
          for (const pattern of cssPatterns) {
            if (pattern.test(arg)) {
              return { fragile: true, reason: 'Text filter contains CSS styling patterns or variables' };
            }
          }
        } else if (arg instanceof RegExp) {
          const source = arg.source;
          if (source.length > 60) {
            return { fragile: true, reason: 'RegExp filter is excessively long (> 60 characters)' };
          }
          for (const pattern of cssPatterns) {
            if (pattern.test(source)) {
              return { fragile: true, reason: 'RegExp filter contains CSS styling patterns or variables' };
            }
          }
        } else if (arg && typeof arg === 'object') {
          // Check key-value pairs (e.g. { name: '...' })
          for (const key of Object.keys(arg)) {
            const val = arg[key];
            if (typeof val === 'string') {
              if (val.length > 60) {
                return { fragile: true, reason: `Filter option "${key}" is excessively long (> 60 characters)` };
              }
              for (const pattern of cssPatterns) {
                if (pattern.test(val)) {
                  return { fragile: true, reason: `Filter option "${key}" contains CSS styling patterns or variables` };
                }
              }
            } else if (val instanceof RegExp) {
              const source = val.source;
              if (source.length > 60) {
                return { fragile: true, reason: `Filter option "${key}" RegExp is excessively long (> 60 characters)` };
              }
              for (const pattern of cssPatterns) {
                if (pattern.test(source)) {
                  return { fragile: true, reason: `Filter option "${key}" RegExp contains CSS styling patterns or variables` };
                }
              }
            } else if (val && typeof val === 'object' && val.source !== undefined) {
              // Serialized RegExp
              const source = val.source;
              if (source.length > 60) {
                return { fragile: true, reason: `Filter option "${key}" RegExp is excessively long (> 60 characters)` };
              }
              for (const pattern of cssPatterns) {
                if (pattern.test(source)) {
                  return { fragile: true, reason: `Filter option "${key}" RegExp contains CSS styling patterns or variables` };
                }
              }
            }
          }
        }
      }
    }
    return { fragile: false, reason: '' };
  }

  private async performFailureAnalysis(
    page: Page,
    steps: LocatorStep[]
  ): Promise<FailureAnalysisResult> {
    const analysisSteps: FailureStepAnalysis[] = [];
    let currentLocatorStr = 'page';
    let lastValidLocator: Locator | null = null;
    let failedStepIndex = -1;

    // 1. Evaluate steps sequentially to find where it breaks
    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];
      const nextLocatorStr = `${currentLocatorStr}.${stringifyLocator([step], false)}`;

      try {
        const parsedSteps = parseLocator(nextLocatorStr);
        if (parsedSteps.length === 0) {
          throw new Error('Locator expression contains no steps.');
        }
        const currentLocator = constructLocator(page, parsedSteps);
        const count = await currentLocator.count();

        if (count > 0) {
          analysisSteps.push({
            stepText: stringifyLocator([step], false),
            success: true,
            matchCount: count
          });
          lastValidLocator = currentLocator;
          currentLocatorStr = nextLocatorStr;
        } else {
          failedStepIndex = idx;
          analysisSteps.push({
            stepText: stringifyLocator([step], false),
            success: false,
            matchCount: 0,
            reason: `Locator resolved to 0 elements at step: ${stringifyLocator([step], false)}`
          });
          break;
        }
      } catch (err: any) {
        failedStepIndex = idx;
        analysisSteps.push({
          stepText: stringifyLocator([step], false),
          success: false,
          matchCount: 0,
          reason: `Evaluation failed: ${err.message}`
        });
        break;
      }
    }

    // 2. Perform deep analysis on the failed step
    const suggestions: AlternativeLocator[] = [];
    let message = failedStepIndex !== -1
      ? 'Locator execution broke at step: ' + steps[failedStepIndex]?.name
      : 'Locator returned 0 elements.';

    if (failedStepIndex !== -1 && lastValidLocator) {
      const failedStep = steps[failedStepIndex];

      // A. getByRole — check if role exists but name mismatches
      if (failedStep.name === 'getByRole') {
        const expectedRole = failedStep.args[0];
        const options = failedStep.args[1] || {};
        const expectedName = options.name;

        try {
          const handles = await lastValidLocator.elementHandles();
          const foundElementsInfo: { role: string; accessibleName: string }[] = [];

          for (const handle of handles) {
            const childInfo = await handle.evaluate((el) => {
              const children = Array.from((el as Element).querySelectorAll('*'));
              return children.map(child => {
                const role = (window as any).__locatorLensAgent.getElementInfo(child)?.role || '';
                const accName = (window as any).__locatorLensAgent.getElementInfo(child)?.accessibleName || '';
                return { role, accessibleName: accName, tagName: child.tagName.toLowerCase() };
              }).filter(c => c.role && c.role !== 'generic');
            });
            foundElementsInfo.push(...childInfo);
          }

          const sameRoleElements = foundElementsInfo.filter(c => c.role === expectedRole);
          if (sameRoleElements.length > 0) {
            message = `Role "${expectedRole}" exists, but accessible name did not match.`;
            sameRoleElements.forEach(item => {
              if (item.accessibleName) {
                suggestions.push({
                  selector: `${currentLocatorStr}.getByRole('${expectedRole}', { name: '${item.accessibleName}' })`,
                  type: 'getByRole',
                  confidence: 90,
                  reason: `Matches role "${expectedRole}" with actual name "${item.accessibleName}".`
                });
                if (expectedName && typeof expectedName === 'string') {
                  const cleanedExpected = expectedName.trim().toLowerCase();
                  const cleanedActual = item.accessibleName.trim().toLowerCase();
                  if (cleanedActual.includes(cleanedExpected) && cleanedActual !== cleanedExpected) {
                    suggestions.push({
                      selector: `${currentLocatorStr}.getByRole('${expectedRole}', { name: /${expectedName}/i })`,
                      type: 'getByRole',
                      confidence: 92,
                      reason: `Partial regex match for "${expectedName}".`
                    });
                  }
                }
              }
            });
          } else {
            message = `No elements with role "${expectedRole}" exist inside the container.`;
            foundElementsInfo.slice(0, 5).forEach(item => {
              suggestions.push({
                selector: `${currentLocatorStr}.getByRole('${item.role}', { name: '${item.accessibleName}' })`,
                type: 'getByRole',
                confidence: 70,
                reason: `Alternative child element found: role "${item.role}" name "${item.accessibleName}".`
              });
            });
          }
          analysisSteps[analysisSteps.length - 1].foundElementsInfo = foundElementsInfo;
        } catch {}
      }

      // B. getByLabel / getByPlaceholder / getByText — text mismatch analysis
      if (failedStep.name === 'getByLabel' || failedStep.name === 'getByPlaceholder' || failedStep.name === 'getByText') {
        const expectedText = failedStep.args[0];
        try {
          const handles = await lastValidLocator.elementHandles();
          const labelsFound: string[] = [];

          for (const handle of handles) {
            const list = await handle.evaluate((el) => {
              const all = Array.from((el as Element).querySelectorAll('*'));
              return all.map(child => {
                const info = (window as any).__locatorLensAgent.getElementInfo(child);
                const agent = (window as any).__locatorLensAgent;
                return {
                  label: info?.accessibleName || '',
                  placeholder: child.getAttribute('placeholder') || '',
                  text: agent && agent.getCleanText ? agent.getCleanText(child).trim() : (child.textContent?.trim() || ''),
                  tagName: child.tagName.toLowerCase()
                };
              });
            });
            list.forEach(item => {
              if (failedStep.name === 'getByLabel' && item.label) labelsFound.push(item.label);
              if (failedStep.name === 'getByPlaceholder' && item.placeholder) labelsFound.push(item.placeholder);
              if (failedStep.name === 'getByText' && item.text) labelsFound.push(item.text);
            });
          }

          if (labelsFound.length > 0 && typeof expectedText === 'string') {
            const query = expectedText.trim().toLowerCase();
            labelsFound.forEach(lbl => {
              if (lbl.toLowerCase().includes(query)) {
                suggestions.push({
                  selector: `${currentLocatorStr}.${failedStep.name}(/${expectedText}/i)`,
                  type: 'locator' as any,
                  confidence: 85,
                  reason: `Regex partial match suggestion for "${lbl}".`
                });
              }
            });
            message = `Text/Label mismatch. Expected "${expectedText}" but found: [${labelsFound.slice(0, 3).join(', ')}]`;
          }
        } catch {}
      }

      // C. getByTestId — look for nearby test ID attributes in container
      if (failedStep.name === 'getByTestId') {
        const expectedId = String(failedStep.args[0] || '');
        try {
          const handles = await lastValidLocator.elementHandles();
          const foundTestIds: string[] = [];

          for (const handle of handles) {
            const ids = await handle.evaluate((el) => {
              const testIdAttrs = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
              const all = Array.from((el as Element).querySelectorAll('*'));
              const result: string[] = [];
              all.forEach(child => {
                testIdAttrs.forEach(attr => {
                  const val = child.getAttribute(attr);
                  if (val) result.push(val);
                });
              });
              return result;
            });
            foundTestIds.push(...ids);
          }

          const uniqueIds = [...new Set(foundTestIds)];
          if (uniqueIds.length > 0) {
            const closeMatches = uniqueIds.filter(id =>
              id.toLowerCase().includes(expectedId.toLowerCase()) ||
              expectedId.toLowerCase().includes(id.toLowerCase())
            );
            const candidates = closeMatches.length > 0 ? closeMatches : uniqueIds.slice(0, 5);
            message = closeMatches.length > 0
              ? `Test ID "${expectedId}" not found — close matches exist in container.`
              : `Test ID "${expectedId}" not found. Available test IDs in container: [${uniqueIds.slice(0, 3).join(', ')}]`;
            candidates.forEach(id => {
              suggestions.push({
                selector: `${currentLocatorStr}.getByTestId('${id}')`,
                type: 'getByTestId',
                confidence: closeMatches.includes(id) ? 88 : 70,
                reason: `Test ID "${id}" found in container.`
              });
            });
          } else {
            message = `No elements with test ID attributes found inside the container.`;
          }
          analysisSteps[analysisSteps.length - 1].foundElementsInfo =
            uniqueIds.map(id => ({ role: 'testid', accessibleName: id }));
        } catch {}
      }

      // D. getByAltText — look for elements with alt attributes in container
      if (failedStep.name === 'getByAltText') {
        const expectedAlt = String(failedStep.args[0] || '');
        try {
          const handles = await lastValidLocator.elementHandles();
          const foundAlts: string[] = [];

          for (const handle of handles) {
            const alts = await handle.evaluate((el) => {
              const all = Array.from((el as Element).querySelectorAll('[alt]'));
              return all.map(child => child.getAttribute('alt') || '').filter(Boolean);
            });
            foundAlts.push(...alts);
          }

          const uniqueAlts = [...new Set(foundAlts)];
          if (uniqueAlts.length > 0) {
            message = `Alt text "${expectedAlt}" not found. Available alt texts: [${uniqueAlts.slice(0, 3).join(', ')}]`;
            const closeAlts = uniqueAlts.filter(a =>
              a.toLowerCase().includes(expectedAlt.toLowerCase()) ||
              expectedAlt.toLowerCase().includes(a.toLowerCase())
            );
            (closeAlts.length > 0 ? closeAlts : uniqueAlts.slice(0, 3)).forEach(alt => {
              suggestions.push({
                selector: `${currentLocatorStr}.getByAltText('${alt}')`,
                type: 'getByAltText',
                confidence: closeAlts.includes(alt) ? 88 : 70,
                reason: `Image with alt text "${alt}" found in container.`
              });
              suggestions.push({
                selector: `${currentLocatorStr}.getByAltText(/${alt}/i)`,
                type: 'getByAltText',
                confidence: closeAlts.includes(alt) ? 85 : 65,
                reason: `Case-insensitive partial match for alt text "${alt}".`
              });
            });
          } else {
            message = `No elements with alt attributes found inside the container.`;
          }
        } catch {}
      }

      // E. getByTitle — look for elements with title attributes in container
      if (failedStep.name === 'getByTitle') {
        const expectedTitle = String(failedStep.args[0] || '');
        try {
          const handles = await lastValidLocator.elementHandles();
          const foundTitles: string[] = [];

          for (const handle of handles) {
            const titles = await handle.evaluate((el) => {
              const all = Array.from((el as Element).querySelectorAll('[title]'));
              return all.map(child => child.getAttribute('title') || '').filter(Boolean);
            });
            foundTitles.push(...titles);
          }

          const uniqueTitles = [...new Set(foundTitles)];
          if (uniqueTitles.length > 0) {
            message = `Title "${expectedTitle}" not found. Available titles: [${uniqueTitles.slice(0, 3).join(', ')}]`;
            const closeTitles = uniqueTitles.filter(t =>
              t.toLowerCase().includes(expectedTitle.toLowerCase()) ||
              expectedTitle.toLowerCase().includes(t.toLowerCase())
            );
            (closeTitles.length > 0 ? closeTitles : uniqueTitles.slice(0, 3)).forEach(title => {
              suggestions.push({
                selector: `${currentLocatorStr}.getByTitle('${title}')`,
                type: 'getByTitle',
                confidence: closeTitles.includes(title) ? 88 : 70,
                reason: `Element with title "${title}" found in container.`
              });
              suggestions.push({
                selector: `${currentLocatorStr}.getByTitle(/${title}/i)`,
                type: 'getByTitle',
                confidence: closeTitles.includes(title) ? 82 : 62,
                reason: `Case-insensitive partial match for title "${title}".`
              });
            });
          } else {
            message = `No elements with title attributes found inside the container.`;
          }
        } catch {}
      }

    } else {
      // Root-step failure: search page-wide for matching elements
      const rootStep = steps[0];
      message = `Root locator step failed: ${rootStep?.name}`;

      try {
        if (rootStep?.name === 'locator' && typeof rootStep.args[0] === 'string') {
          const selector = rootStep.args[0];
          const allTextMatches = await page.evaluate((s) => {
            const results: Element[] = [];
            const tags = Array.from(document.querySelectorAll('*'));
            for (const t of tags) {
              const info = (window as any).__locatorLensAgent.getElementInfo(t);
              if (info?.id === s || info?.className === s) {
                results.push(t);
              }
            }
            return results.map(r => (window as any).__locatorLensAgent.generateAlternatives(r)[0]).filter(Boolean);
          }, selector);
          allTextMatches.slice(0, 3).forEach((alt: AlternativeLocator) => {
            suggestions.push({
              selector: alt.selector,
              type: alt.type,
              confidence: 80,
              reason: `Found element matching "${selector}" as an ID/class directly.`
            });
          });
        } else if (rootStep?.name === 'getByTestId') {
          // Page-wide test ID search
          const expectedId = String(rootStep.args[0] || '');
          const allIds = await page.evaluate(() => {
            const testIdAttrs = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
            const found: string[] = [];
            document.querySelectorAll('*').forEach(el => {
              testIdAttrs.forEach(attr => {
                const val = el.getAttribute(attr);
                if (val) found.push(val);
              });
            });
            return [...new Set(found)];
          });
          if (allIds.length > 0) {
            message = `Test ID "${expectedId}" not found on page. Available test IDs: [${allIds.slice(0, 5).join(', ')}]`;
            const close = allIds.filter((id: string) => id.toLowerCase().includes(expectedId.toLowerCase()));
            (close.length > 0 ? close : allIds).slice(0, 3).forEach((id: string) => {
              suggestions.push({
                selector: `getByTestId('${id}')`,
                type: 'getByTestId',
                confidence: close.includes(id) ? 85 : 60,
                reason: `Test ID "${id}" found on page.`
              });
            });
          } else {
            message = `No test ID attributes found anywhere on the page.`;
          }
        } else if (rootStep?.name === 'getByAltText') {
          const expectedAlt = String(rootStep.args[0] || '');
          const allAlts = await page.evaluate(() => {
            const found: string[] = [];
            document.querySelectorAll('[alt]').forEach(el => {
              const val = el.getAttribute('alt');
              if (val) found.push(val);
            });
            return [...new Set(found)];
          });
          if (allAlts.length > 0) {
            message = `Alt text "${expectedAlt}" not found on page. Available: [${allAlts.slice(0, 3).join(', ')}]`;
            const close = allAlts.filter((a: string) => a.toLowerCase().includes(expectedAlt.toLowerCase()));
            (close.length > 0 ? close : allAlts).slice(0, 3).forEach((alt: string) => {
              suggestions.push({
                selector: `getByAltText('${alt}')`,
                type: 'getByAltText',
                confidence: close.includes(alt) ? 85 : 60,
                reason: `Image with alt text "${alt}" found on page.`
              });
            });
          } else {
            message = `No elements with alt attributes found on the page.`;
          }
        } else if (rootStep?.name === 'getByTitle') {
          const expectedTitle = String(rootStep.args[0] || '');
          const allTitles = await page.evaluate(() => {
            const found: string[] = [];
            document.querySelectorAll('[title]').forEach(el => {
              const val = el.getAttribute('title');
              if (val) found.push(val);
            });
            return [...new Set(found)];
          });
          if (allTitles.length > 0) {
            message = `Title "${expectedTitle}" not found on page. Available: [${allTitles.slice(0, 3).join(', ')}]`;
            const close = allTitles.filter((t: string) => t.toLowerCase().includes(expectedTitle.toLowerCase()));
            (close.length > 0 ? close : allTitles).slice(0, 3).forEach((title: string) => {
              suggestions.push({
                selector: `getByTitle('${title}')`,
                type: 'getByTitle',
                confidence: close.includes(title) ? 85 : 60,
                reason: `Element with title "${title}" found on page.`
              });
            });
          } else {
            message = `No elements with title attributes found on the page.`;
          }
        } else if (rootStep?.name === 'getByRole') {
          // Page-wide role search
          const expectedRole = String(rootStep.args[0] || '');
          const options = rootStep.args[1] || {};
          const allRoleElements = await page.evaluate((role) => {
            const all = Array.from(document.querySelectorAll('*'));
            const results: { role: string; accessibleName: string }[] = [];
            all.forEach(el => {
              const info = (window as any).__locatorLensAgent.getElementInfo(el);
              if (info?.role === role) {
                results.push({ role: info.role, accessibleName: info.accessibleName });
              }
            });
            return results.slice(0, 5);
          }, expectedRole);
          if (allRoleElements.length > 0) {
            message = `Role "${expectedRole}" exists, but accessible name did not match.`;
            allRoleElements.forEach((item: { role: string; accessibleName: string }) => {
              if (item.accessibleName) {
                suggestions.push({
                  selector: `getByRole('${item.role}', { name: '${item.accessibleName}' })`,
                  type: 'getByRole',
                  confidence: 80,
                  reason: `Element with role "${item.role}" and name "${item.accessibleName}" found on page.`
                });
              }
            });
          } else {
            message = `No elements with role "${expectedRole}" found on the page at all.`;
          }
        }
      } catch {}
    }

    return {
      message,
      steps: analysisSteps,
      suggestedAlternatives: suggestions
    };
  }
}
