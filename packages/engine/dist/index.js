"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocatorEngine = void 0;
const vm = __importStar(require("vm"));
const playwright_core_1 = require("playwright-core");
const playwright_locator_lens_parser_1 = require("playwright-locator-lens-parser");
const playwright_locator_lens_agent_1 = require("playwright-locator-lens-agent");
class LocatorEngine {
    browser = null;
    pages = new Map();
    cdpUrl = '';
    async connect(cdpUrl) {
        this.cdpUrl = cdpUrl;
        if (this.browser) {
            await this.disconnect();
        }
        this.browser = await playwright_core_1.chromium.connectOverCDP(cdpUrl);
        this.pages.clear();
        const contexts = this.browser.contexts();
        const allPages = [];
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
                }
                catch {
                    // page might be loading or closed
                }
                let url = 'about:blank';
                try {
                    url = page.url();
                }
                catch { }
                allPages.push({ id, title, url });
            }
        }
        return allPages;
    }
    async disconnect() {
        if (this.browser) {
            try {
                await this.browser.close();
            }
            catch { }
            this.browser = null;
        }
        this.pages.clear();
    }
    getPage(id) {
        return this.pages.get(id);
    }
    async ensureAgentInjected(page) {
        try {
            await page.evaluate(playwright_locator_lens_agent_1.AGENT_SCRIPT);
        }
        catch (err) {
            throw new Error(`Failed to inject locator lens browser agent: ${err.message}`);
        }
    }
    async getAutocompleteData(pageId) {
        const page = this.getPage(pageId);
        if (!page) {
            throw new Error('Target page/tab not found or has been closed.');
        }
        try {
            await this.ensureAgentInjected(page);
            const data = await page.evaluate(() => {
                return window.__locatorLensAgent.getAutocompleteData();
            });
            return data;
        }
        catch (err) {
            throw new Error(`Failed to retrieve autocomplete data from page: ${err.message}`);
        }
    }
    async evaluate(pageId, locatorStr) {
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
        }
        catch (err) {
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
        let parsedSteps = [];
        try {
            parsedSteps = (0, playwright_locator_lens_parser_1.parseLocator)(locatorStr);
        }
        catch (err) {
            // Provide a more helpful error for .or without parentheses
            let parseErrMsg = err.message;
            if (parseErrMsg.includes('Expected token LPAREN, but got DOT') ||
                parseErrMsg.includes('Expected token LPAREN')) {
                if (/\.or\s*\./.test(locatorStr) || /\.or\s*$/.test(locatorStr)) {
                    parseErrMsg = `Syntax Error: ".or" must be called as a method with an argument, e.g.:\n.or(locator('...'))\n\nIncorrect: .or.locator('...')  \u2190  missing parentheses and argument\nCorrect:   .or(locator('...'))  \u2190  pass the alternative locator as argument`;
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
        let locatorInstance;
        try {
            const context = vm.createContext(sandbox);
            locatorInstance = vm.runInContext(locatorStr, context);
            // Verify that the result is indeed a Playwright Locator
            if (!locatorInstance || typeof locatorInstance.count !== 'function') {
                throw new Error('Expression did not evaluate to a Playwright Locator instance.');
            }
        }
        catch (err) {
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
                return elems.map(el => window.__locatorLensAgent.getElementInfo(el)).filter(Boolean);
            });
            // Compute Confidence Score based on first matched element (or common elements)
            const primaryElement = elements[0];
            const { confidence, factors } = this.calculateConfidence(locatorStr, count, primaryElement, parsedSteps);
            const alternatives = await locatorInstance.evaluateAll((elems) => {
                const list = [];
                const seen = new Set();
                elems.forEach(el => {
                    const alts = window.__locatorLensAgent.generateAlternatives(el);
                    alts.forEach((alt) => {
                        if (!seen.has(alt.selector)) {
                            seen.add(alt.selector);
                            list.push(alt);
                        }
                    });
                });
                return list;
            });
            return {
                success: true,
                count,
                elements,
                confidence,
                confidenceFactors: factors,
                alternatives
            };
        }
        catch (err) {
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
    async highlight(pageId, locatorStr, scrollIndex) {
        const page = this.getPage(pageId);
        if (!page)
            return false;
        try {
            await this.ensureAgentInjected(page);
            // Clear previous overlays first
            await page.evaluate(() => {
                window.__locatorLensAgent?.clear();
            });
            if (!locatorStr.trim())
                return true;
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
            await page.evaluate(([elements, hlType, scrollIdx]) => {
                if (window.__locatorLensAgent) {
                    window.__locatorLensAgent.highlight(elements, hlType, scrollIdx);
                }
            }, [elementHandles, type, scrollIndex]);
            return true;
        }
        catch {
            return false;
        }
    }
    async clearHighlight(pageId) {
        const page = this.getPage(pageId);
        if (!page)
            return;
        try {
            await page.evaluate(() => {
                window.__locatorLensAgent?.clear();
            });
        }
        catch { }
    }
    // ─────────────────────────────────────────────────────────────
    // Phase 3 — .or() Chain Tree Analyzer
    // ─────────────────────────────────────────────────────────────
    async analyzeChain(pageId, locatorStr) {
        const page = this.getPage(pageId);
        if (!page) {
            return { success: false, error: 'Page not found.', branches: [], totalMatches: 0 };
        }
        // Extract individual branches split by .or(
        // e.g. "getByRole('spinbutton').or(getByRole('textbox')).or(getByRole('combobox'))"
        // Split on ".or(" boundaries to get each branch expression
        const branches = [];
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
                const locatorInstance = vm.runInContext(branchExpr, ctx);
                const count = await locatorInstance.count();
                totalMatches += count;
                branches.push({ locatorStr: branchExpr, matchCount: count, isWinner: false });
            }
            catch (err) {
                branches.push({ locatorStr: branchExpr, matchCount: 0, error: err.message, isWinner: false });
            }
        }
        // Mark branches that found at least 1 match as winners
        const hasWinner = branches.some(b => b.matchCount > 0);
        if (hasWinner) {
            branches.forEach(b => {
                if (b.matchCount > 0)
                    b.isWinner = true;
            });
        }
        return { success: true, branches, totalMatches };
    }
    /**
     * Split "a.or(b).or(c)" into ["a", "b", "c"] handling nested parentheses.
     */
    splitOrChain(locatorStr) {
        // Remove leading "page." prefix if present
        const normalized = locatorStr.replace(/^\s*page\s*\.\s*/, '');
        const branches = [];
        let depth = 0;
        let current = '';
        let i = 0;
        while (i < normalized.length) {
            // Check for ".or(" pattern at depth 0
            if (depth === 0 &&
                normalized[i] === '.' &&
                normalized.slice(i, i + 4) === '.or(') {
                if (current.trim()) {
                    branches.push(current.trim());
                }
                current = '';
                i += 4; // skip ".or("
                depth = 1; // we are now inside the or( ... )
                continue;
            }
            if (normalized[i] === '(')
                depth++;
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
    async stabilityTest(pageId, locatorStr, runs = 5) {
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
        const runResults = [];
        let foundCount = 0;
        for (let i = 0; i < runs; i++) {
            try {
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                // Re-inject agent after reload
                try {
                    await this.ensureAgentInjected(page);
                }
                catch { /* best effort */ }
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
                const locatorInstance = vm.runInContext(locatorStr, ctx);
                const count = await locatorInstance.count();
                const found = count > 0;
                if (found)
                    foundCount++;
                runResults.push({ run: i + 1, found, matchCount: count });
            }
            catch (err) {
                runResults.push({ run: i + 1, found: false, matchCount: 0, error: err.message });
            }
        }
        const score = Math.round((foundCount / runs) * 100);
        return { success: true, runs: runResults, score, locatorStr };
    }
    // ─────────────────────────────────────────────────────────────
    // Phase 8 — Form-Aware Analysis
    // ─────────────────────────────────────────────────────────────
    async scanForms(pageId) {
        const page = this.getPage(pageId);
        if (!page) {
            throw new Error('Page not found.');
        }
        await this.ensureAgentInjected(page);
        const forms = await page.evaluate(() => {
            return window.__locatorLensAgent.scanForms();
        });
        return forms;
    }
    calculateConfidence(locatorStr, count, el, steps) {
        let score = 0;
        const factors = [];
        // 1. Match Count
        if (count === 1) {
            score += 40;
            factors.push({ text: 'Single unique match', positive: true });
        }
        else {
            score -= 20;
            factors.push({ text: `Multiple matches found (${count})`, positive: false });
        }
        // 2. Visibility
        if (el?.visible) {
            score += 15;
            factors.push({ text: 'Element is visible on screen', positive: true });
        }
        else if (el) {
            score -= 10;
            factors.push({ text: 'Element is hidden/invisible', positive: false });
        }
        // 3. Locator API Semantic Quality
        if (locatorStr.includes('getByTestId')) {
            score += 25;
            factors.push({ text: 'Uses semantic data-testid locator', positive: true });
        }
        else if (locatorStr.includes('getByRole') && locatorStr.includes('name:')) {
            score += 20;
            factors.push({ text: 'Uses getByRole with accessible name filter', positive: true });
        }
        else if (locatorStr.includes('getByLabel')) {
            score += 20;
            factors.push({ text: 'Uses getByLabel standard form query', positive: true });
        }
        else if (locatorStr.includes('getByPlaceholder') || locatorStr.includes('getByTitle') || locatorStr.includes('getByAltText')) {
            score += 15;
            factors.push({ text: 'Uses accessible placeholder/title/alt text', positive: true });
        }
        else if (locatorStr.includes('getByText')) {
            score += 12;
            factors.push({ text: 'Uses getByText search', positive: true });
        }
        else if (locatorStr.includes('locator(')) {
            // Check if it is a CSS ID or CSS selector or XPath
            const cssMatch = locatorStr.match(/locator\(\s*['"`](.*?)['"`]\s*\)/);
            if (cssMatch) {
                const selector = cssMatch[1];
                if (selector.startsWith('#') && !selector.includes(' ') && !selector.includes('>')) {
                    score += 15;
                    factors.push({ text: 'Uses CSS ID locator', positive: true });
                }
                else if (selector.startsWith('//') || selector.startsWith('xpath=')) {
                    score -= 15;
                    factors.push({ text: 'Uses XPath locator (fragile to structure)', positive: false });
                }
                else {
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
    hasFragileNameFilter(steps) {
        if (!steps)
            return { fragile: false, reason: '' };
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
                }
                else if (arg instanceof RegExp) {
                    const source = arg.source;
                    if (source.length > 60) {
                        return { fragile: true, reason: 'RegExp filter is excessively long (> 60 characters)' };
                    }
                    for (const pattern of cssPatterns) {
                        if (pattern.test(source)) {
                            return { fragile: true, reason: 'RegExp filter contains CSS styling patterns or variables' };
                        }
                    }
                }
                else if (arg && typeof arg === 'object') {
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
                        }
                        else if (val instanceof RegExp) {
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
                        else if (val && typeof val === 'object' && val.source !== undefined) {
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
    async performFailureAnalysis(page, steps) {
        const analysisSteps = [];
        let currentLocatorStr = 'page';
        let lastValidLocator = null;
        let failedStepIndex = -1;
        // 1. Evaluate steps sequentially to find where it breaks
        for (let idx = 0; idx < steps.length; idx++) {
            const step = steps[idx];
            const nextLocatorStr = `${currentLocatorStr}.${(0, playwright_locator_lens_parser_1.stringifyLocator)([step], false)}`;
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
                const currentLocator = vm.runInContext(nextLocatorStr, context);
                const count = await currentLocator.count();
                if (count > 0) {
                    analysisSteps.push({
                        stepText: (0, playwright_locator_lens_parser_1.stringifyLocator)([step], false),
                        success: true,
                        matchCount: count
                    });
                    lastValidLocator = currentLocator;
                    currentLocatorStr = nextLocatorStr;
                }
                else {
                    failedStepIndex = idx;
                    analysisSteps.push({
                        stepText: (0, playwright_locator_lens_parser_1.stringifyLocator)([step], false),
                        success: false,
                        matchCount: 0,
                        reason: `Locator resolved to 0 elements at step: ${(0, playwright_locator_lens_parser_1.stringifyLocator)([step], false)}`
                    });
                    break;
                }
            }
            catch (err) {
                failedStepIndex = idx;
                analysisSteps.push({
                    stepText: (0, playwright_locator_lens_parser_1.stringifyLocator)([step], false),
                    success: false,
                    matchCount: 0,
                    reason: `Evaluation failed: ${err.message}`
                });
                break;
            }
        }
        // 2. Perform deep analysis on the failed step
        const suggestions = [];
        let message = 'Locator execution broke at step: ' + steps[failedStepIndex]?.name;
        if (failedStepIndex !== -1 && lastValidLocator) {
            const failedStep = steps[failedStepIndex];
            // A. If the failed step was a role selector (getByRole)
            if (failedStep.name === 'getByRole') {
                const expectedRole = failedStep.args[0];
                const options = failedStep.args[1] || {};
                const expectedName = options.name;
                // Query the container (last valid locator) to list role/names of children
                try {
                    const handles = await lastValidLocator.elementHandles();
                    const foundElementsInfo = [];
                    for (const handle of handles) {
                        // Find all child elements matching standard tags or roles
                        const childInfo = await handle.evaluate((el) => {
                            const children = Array.from(el.querySelectorAll('*'));
                            return children.map(child => {
                                const role = window.__locatorLensAgent.getElementInfo(child)?.role || '';
                                const accName = window.__locatorLensAgent.getElementInfo(child)?.accessibleName || '';
                                return { role, accessibleName: accName, tagName: child.tagName.toLowerCase() };
                            }).filter(c => c.role && c.role !== 'generic');
                        });
                        foundElementsInfo.push(...childInfo);
                    }
                    // Check if expected role exists in children
                    const sameRoleElements = foundElementsInfo.filter(c => c.role === expectedRole);
                    if (sameRoleElements.length > 0) {
                        message = `Role "${expectedRole}" exists, but accessible name did not match.`;
                        // Suggest correct names
                        sameRoleElements.forEach(item => {
                            if (item.accessibleName) {
                                suggestions.push({
                                    selector: `${currentLocatorStr}.getByRole('${expectedRole}', { name: '${item.accessibleName}' })`,
                                    type: 'getByRole',
                                    confidence: 90,
                                    reason: `Matches role "${expectedRole}" with actual name "${item.accessibleName}".`
                                });
                                // If expectedName is partial, suggest RegExp
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
                    }
                    else {
                        message = `No elements with role "${expectedRole}" exist inside the container.`;
                        // Suggest whatever children exist inside container
                        foundElementsInfo.slice(0, 5).forEach(item => {
                            suggestions.push({
                                selector: `${currentLocatorStr}.getByRole('${item.role}', { name: '${item.accessibleName}' })`,
                                type: 'getByRole',
                                confidence: 70,
                                reason: `Alternative child element found: role "${item.role}" name "${item.accessibleName}".`
                            });
                        });
                    }
                    // Attach details to the failed step
                    analysisSteps[analysisSteps.length - 1].foundElementsInfo = foundElementsInfo;
                }
                catch { }
            }
            // B. If the failed step was getByLabel or getByPlaceholder
            if (failedStep.name === 'getByLabel' || failedStep.name === 'getByPlaceholder' || failedStep.name === 'getByText') {
                const expectedText = failedStep.args[0];
                try {
                    const handles = await lastValidLocator.elementHandles();
                    const labelsFound = [];
                    for (const handle of handles) {
                        const list = await handle.evaluate((el) => {
                            const all = Array.from(el.querySelectorAll('*'));
                            return all.map(child => {
                                const info = window.__locatorLensAgent.getElementInfo(child);
                                const agent = window.__locatorLensAgent;
                                return {
                                    label: info?.accessibleName || '',
                                    placeholder: child.getAttribute('placeholder') || '',
                                    text: agent && agent.getCleanText ? agent.getCleanText(child).trim() : (child.textContent?.trim() || ''),
                                    tagName: child.tagName.toLowerCase()
                                };
                            });
                        });
                        list.forEach(item => {
                            if (failedStep.name === 'getByLabel' && item.label)
                                labelsFound.push(item.label);
                            if (failedStep.name === 'getByPlaceholder' && item.placeholder)
                                labelsFound.push(item.placeholder);
                            if (failedStep.name === 'getByText' && item.text)
                                labelsFound.push(item.text);
                        });
                    }
                    if (labelsFound.length > 0 && typeof expectedText === 'string') {
                        const query = expectedText.trim().toLowerCase();
                        labelsFound.forEach(lbl => {
                            if (lbl.toLowerCase().includes(query)) {
                                suggestions.push({
                                    selector: `${currentLocatorStr}.${failedStep.name}(/${expectedText}/i)`,
                                    type: 'locator', // fallback type
                                    confidence: 85,
                                    reason: `Regex partial match suggestion for "${lbl}".`
                                });
                            }
                        });
                        message = `Text/Label mismatch. Expected label like "${expectedText}" but found: [${labelsFound.slice(0, 3).join(', ')}]`;
                    }
                }
                catch { }
            }
        }
        else {
            // If the first step failed, search page-wide for elements matching the first step
            message = `Root locator step failed: ${steps[0]?.name}`;
            try {
                const selector = steps[0].args[0];
                if (steps[0].name === 'locator' && typeof selector === 'string') {
                    // Check if user made a typo (e.g. forgot class dot or id hash)
                    const allTextMatches = await page.evaluate((s) => {
                        // Find elements containing this text
                        const results = [];
                        const tags = Array.from(document.querySelectorAll('*'));
                        for (const t of tags) {
                            const info = window.__locatorLensAgent.getElementInfo(t);
                            if (info?.id === s || info?.className === s) {
                                results.push(t);
                            }
                        }
                        return results.map(r => window.__locatorLensAgent.generateAlternatives(r)[0]).filter(Boolean);
                    }, selector);
                    allTextMatches.slice(0, 3).forEach(alt => {
                        suggestions.push({
                            selector: alt.selector,
                            type: alt.type,
                            confidence: 80,
                            reason: `Found element matching "${selector}" as an ID/class directly.`
                        });
                    });
                }
            }
            catch { }
        }
        return {
            message,
            steps: analysisSteps,
            suggestedAlternatives: suggestions
        };
    }
}
exports.LocatorEngine = LocatorEngine;
//# sourceMappingURL=index.js.map