import * as vm from 'vm';
import { chromium, Browser, Page, Locator } from 'playwright-core';
import { parseLocator, stringifyLocator, LocatorStep } from 'playwright-locator-lens-parser';
import { AGENT_SCRIPT } from 'playwright-locator-lens-agent';
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
  FormStructure
} from 'playwright-locator-lens-shared';



export class LocatorEngine {
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private cdpUrl: string = '';

  async connect(cdpUrl: string): Promise<PageInfo[]> {
    this.cdpUrl = cdpUrl;
    if (this.browser) {
      await this.disconnect();
    }

    this.browser = await chromium.connectOverCDP(cdpUrl);
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

  getPage(id: string): Page | undefined {
    return this.pages.get(id);
  }

  private async ensureAgentInjected(page: Page): Promise<void> {
    try {
      await page.evaluate(AGENT_SCRIPT);
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

    // Bind locator utility functions inside a VM sandbox
    const sandbox: any = {
      page,
      locator: page.locator.bind(page),
      getByRole: page.getByRole.bind(page),
      getByText: page.getByText.bind(page),
      getByLabel: page.getByLabel.bind(page),
      getByPlaceholder: page.getByPlaceholder.bind(page),
      getByAltText: page.getByAltText.bind(page),
      getByTitle: page.getByTitle.bind(page),
      getByTestId: page.getByTestId.bind(page),
    };

    let locatorInstance: Locator;
    try {
      const context = vm.createContext(sandbox);
      locatorInstance = vm.runInContext(locatorStr, context);
      
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

      // Evaluate the locator
      const sandbox = {
        page,
        locator: page.locator.bind(page),
        getByRole: page.getByRole.bind(page),
        getByText: page.getByText.bind(page),
        getByLabel: page.getByLabel.bind(page),
        getByPlaceholder: page.getByPlaceholder.bind(page),
        getByAltText: page.getByAltText.bind(page),
        getByTitle: page.getByTitle.bind(page),
        getByTestId: page.getByTestId.bind(page),
      };

      const context = vm.createContext(sandbox);
      const locatorInstance = vm.runInContext(locatorStr, context);
      const count = await locatorInstance.count();

      if (count === 0) {
        return false;
      }

      const type = count === 1 ? 'success' : 'warning';

      // Get element handles to evaluate them in the main page context (like in Phase 1)
      const elementHandles = await locatorInstance.elementHandles();
      await page.evaluate(([elements, hlType, scrollIdx]: any) => {
        if ((window as any).__locatorLensAgent) {
          (window as any).__locatorLensAgent.highlight(elements, hlType, scrollIdx);
        }
      }, [elementHandles, type, scrollIndex] as const);

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
        const sandbox = {
          page,
          locator: page.locator.bind(page),
          getByRole: page.getByRole.bind(page),
          getByText: page.getByText.bind(page),
          getByLabel: page.getByLabel.bind(page),
          getByPlaceholder: page.getByPlaceholder.bind(page),
          getByAltText: page.getByAltText.bind(page),
          getByTitle: page.getByTitle.bind(page),
          getByTestId: page.getByTestId.bind(page),
        };
        const ctx = vm.createContext(sandbox);
        const locatorInstance = vm.runInContext(branchExpr, ctx) as Locator;
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
    let depth = 0;
    let current = '';
    let i = 0;

    while (i < normalized.length) {
      // Check for ".or(" pattern at depth 0
      if (
        depth === 0 &&
        normalized[i] === '.' &&
        normalized.slice(i, i + 4) === '.or('
      ) {
        if (current.trim()) {
          branches.push(current.trim());
        }
        current = '';
        i += 4; // skip ".or("
        depth = 1; // we are now inside the or( ... )
        continue;
      }

      if (normalized[i] === '(') depth++;
      else if (normalized[i] === ')') {
        if (depth === 1 && current !== '') {
          // closing the top-level or(
          depth = 0;
          branches.push(current.trim());
          current = '';
          i++;
          continue;
        }
        depth--;
      }

      current += normalized[i];
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

        const sandbox = {
          page,
          locator: page.locator.bind(page),
          getByRole: page.getByRole.bind(page),
          getByText: page.getByText.bind(page),
          getByLabel: page.getByLabel.bind(page),
          getByPlaceholder: page.getByPlaceholder.bind(page),
          getByAltText: page.getByAltText.bind(page),
          getByTitle: page.getByTitle.bind(page),
          getByTestId: page.getByTestId.bind(page),
        };
        const ctx = vm.createContext(sandbox);
        const locatorInstance = vm.runInContext(locatorStr, ctx) as Locator;
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



  private calculateConfidence(
    locatorStr: string,
    count: number,
    el?: ElementDetails,
    steps?: LocatorStep[]
  ): { confidence: number; factors: { text: string; positive: boolean }[] } {
    let score = 0;
    const factors: { text: string; positive: boolean }[] = [];

    // 1. Match Count
    if (count === 1) {
      score += 40;
      factors.push({ text: 'Single unique match', positive: true });
    } else {
      score -= 20;
      factors.push({ text: `Multiple matches found (${count})`, positive: false });
    }

    // 2. Visibility
    if (el?.visible) {
      score += 15;
      factors.push({ text: 'Element is visible on screen', positive: true });
    } else if (el) {
      score -= 10;
      factors.push({ text: 'Element is hidden/invisible', positive: false });
    }

    // 3. Locator API Semantic Quality
    if (locatorStr.includes('getByTestId')) {
      score += 25;
      factors.push({ text: 'Uses semantic data-testid locator', positive: true });
    } else if (locatorStr.includes('getByRole') && locatorStr.includes('name:')) {
      score += 20;
      factors.push({ text: 'Uses getByRole with accessible name filter', positive: true });
    } else if (locatorStr.includes('getByLabel')) {
      score += 20;
      factors.push({ text: 'Uses getByLabel standard form query', positive: true });
    } else if (locatorStr.includes('getByPlaceholder') || locatorStr.includes('getByTitle') || locatorStr.includes('getByAltText')) {
      score += 15;
      factors.push({ text: 'Uses accessible placeholder/title/alt text', positive: true });
    } else if (locatorStr.includes('getByText')) {
      score += 12;
      factors.push({ text: 'Uses getByText search', positive: true });
    } else if (locatorStr.includes('locator(')) {
      // Check if it is a CSS ID or CSS selector or XPath
      const cssMatch = locatorStr.match(/locator\(\s*['"`](.*?)['"`]\s*\)/);
      if (cssMatch) {
        const selector = cssMatch[1];
        if (selector.startsWith('#') && !selector.includes(' ') && !selector.includes('>')) {
          score += 15;
          factors.push({ text: 'Uses CSS ID locator', positive: true });
        } else if (selector.startsWith('//') || selector.startsWith('xpath=')) {
          score -= 15;
          factors.push({ text: 'Uses XPath locator (fragile to structure)', positive: false });
        } else {
          score += 5;
          factors.push({ text: 'Uses CSS path selector', positive: false });
        }
      }
    }

    // 4. Stability Check (Dynamic ID penalty)
    if (el?.id) {
      const isDynamic = /(mui|ag-|grid-|ng-|val-|id-|ember|k-|dx-)/i.test(el.id) || 
                        /^[0-9]+$/.test(el.id) || 
                        /[0-9]{4,}/.test(el.id);
      if (isDynamic && locatorStr.includes(`#${el.id}`)) {
        score -= 25;
        factors.push({ text: 'Uses generated/dynamic element ID', positive: false });
      }
    }

    // 5. Index-based fragilities (nth, first, last, nth-child)
    if (/\.(nth|first|last)\(/.test(locatorStr) || locatorStr.includes(':nth-child') || locatorStr.includes(':nth-of-type')) {
      score -= 15;
      factors.push({ text: 'Uses index filters (fragile to page list changes)', positive: false });
    }

    // 6. Fragile / Excessively long text/CSS patterns check
    const fragileCheck = this.hasFragileNameFilter(steps);
    if (fragileCheck.fragile) {
      score -= 60;
      factors.push({ text: fragileCheck.reason, positive: false });
    }

    // Normalize final score to [0, 100]
    const confidence = Math.max(0, Math.min(100, score));
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
        const sandbox = {
          page,
          locator: page.locator.bind(page),
          getByRole: page.getByRole.bind(page),
          getByText: page.getByText.bind(page),
          getByLabel: page.getByLabel.bind(page),
          getByPlaceholder: page.getByPlaceholder.bind(page),
          getByAltText: page.getByAltText.bind(page),
          getByTitle: page.getByTitle.bind(page),
          getByTestId: page.getByTestId.bind(page),
        };

        const context = vm.createContext(sandbox);
        const currentLocator = vm.runInContext(nextLocatorStr, context) as Locator;
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
                  if (cleanedActual.includes(cleanedExpected)) {
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
            message = `No elements with role "${expectedRole}" found — but similar elements exist.`;
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
