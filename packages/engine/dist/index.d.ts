import { Page } from 'playwright-core';
import { EvaluationResult, PageInfo, ChainAnalysisResult, StabilityResult, FormStructure } from 'playwright-locator-lens-shared';
export declare class LocatorEngine {
    private browser;
    private pages;
    private cdpUrl;
    connect(cdpUrl: string): Promise<PageInfo[]>;
    disconnect(): Promise<void>;
    getPage(id: string): Page | undefined;
    private ensureAgentInjected;
    getAutocompleteData(pageId: string): Promise<any>;
    evaluate(pageId: string, locatorStr: string): Promise<EvaluationResult>;
    highlight(pageId: string, locatorStr: string, scrollIndex?: number): Promise<boolean>;
    clearHighlight(pageId: string): Promise<void>;
    analyzeChain(pageId: string, locatorStr: string): Promise<ChainAnalysisResult>;
    /**
     * Split "a.or(b).or(c)" into ["a", "b", "c"] handling nested parentheses.
     */
    private splitOrChain;
    stabilityTest(pageId: string, locatorStr: string, runs?: number): Promise<StabilityResult>;
    scanForms(pageId: string): Promise<FormStructure[]>;
    private calculateConfidence;
    private hasFragileNameFilter;
    private performFailureAnalysis;
}
