import { Page } from 'playwright-core';
import { EvaluationResult, PageInfo, ChainAnalysisResult, StabilityResult, FormStructure, UiNode, UiScannerResult } from 'playwright-locator-toolkit-shared';
export declare class LocatorEngine {
    private browser;
    private pages;
    private cdpUrl;
    connect(cdpUrl: string): Promise<PageInfo[]>;
    disconnect(): Promise<void>;
    /** Soft disconnect — drops internal state but leaves Chrome running. */
    softDisconnect(): void;
    /** Re-list all open tabs from the currently connected browser. */
    getPages(): Promise<PageInfo[]>;
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
    simulateFill(pageId: string, locatorStr: string, value: string): Promise<boolean>;
    simulateClick(pageId: string, locatorStr: string, x?: number, y?: number): Promise<boolean>;
    simulateHover(pageId: string, locatorStr: string): Promise<boolean>;
    bulkStabilityTest(pageId: string, locatorStrs: string[], runs?: number): Promise<{
        [locatorStr: string]: StabilityResult;
    }>;
    scanForms(pageId: string): Promise<FormStructure[]>;
    scanUI(pageId: string): Promise<UiScannerResult>;
    generatePOMExport(tree: UiNode[], customClassName?: string, sectionNaming?: string): string;
    generateSDKExport(tree: UiNode[]): string;
    generateTSInterfacesExport(tree: UiNode[], sectionNaming?: string): string;
    generateJSONSchemaExport(tree: UiNode[]): string;
    generateYAMLExport(tree: UiNode[]): string;
    private calculateConfidence;
    private hasFragileNameFilter;
    private performFailureAnalysis;
    performAction(pageId: string, locatorStr: string, action: string, args: any[], timeoutMs?: number): Promise<{
        success: boolean;
        error?: string;
    }>;
    executeExtensionSandbox(pageId: string, locatorStr: string, userCode: string, timeoutMs?: number): Promise<{
        success: boolean;
        log: string[];
        error?: string;
    }>;
    prepareWorkspaceScript(workspaceRoot: string, userCode: string, cdpUrl: string, targetUrl: string, isPlaywrightTest: boolean, attachCdp: boolean, activeFilePath?: string, customTempDir?: string): {
        filePath: string;
        cleanup: () => void;
    };
}
export declare function generateWorkspaceScriptContent(userCode: string, mode: 'playwright-test' | 'standalone', attachCdp: boolean, cdpUrl?: string, targetUrl?: string, isTypeScript?: boolean): string;
export declare function prepareWorkspaceScript(userCode: string, mode: 'playwright-test' | 'standalone', attachCdp: boolean, cdpUrl?: string, targetUrl?: string, isTypeScript?: boolean): string;
