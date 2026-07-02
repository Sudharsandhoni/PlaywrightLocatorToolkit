export interface PageInfo {
    id: string;
    title: string;
    url: string;
}
export interface BrowserConnectionState {
    connected: boolean;
    cdpUrl?: string;
    pages: PageInfo[];
    activePageId?: string;
}
export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface ElementDetails {
    role: string;
    accessibleName: string;
    tagName: string;
    id: string;
    className: string;
    visible: boolean;
    enabled: boolean;
    editable: boolean;
    boundingBox?: BoundingBox;
}
export interface AlternativeLocator {
    selector: string;
    type: 'getByRole' | 'getByLabel' | 'getByPlaceholder' | 'getByText' | 'getByAltText' | 'getByTitle' | 'getByTestId' | 'locator';
    confidence: number;
    reason?: string;
}
export interface FailureStepAnalysis {
    stepText: string;
    success: boolean;
    matchCount: number;
    reason?: string;
    foundElementsInfo?: {
        role?: string;
        accessibleName?: string;
        tagName?: string;
    }[];
}
export interface FailureAnalysisResult {
    message: string;
    steps: FailureStepAnalysis[];
    suggestedAlternatives: AlternativeLocator[];
}
export interface EvaluationResult {
    success: boolean;
    error?: string;
    count: number;
    elements: ElementDetails[];
    confidence: number;
    confidenceFactors: {
        text: string;
        positive: boolean;
    }[];
    alternatives: AlternativeLocator[];
    failureAnalysis?: FailureAnalysisResult;
}
export interface ChainBranch {
    locatorStr: string;
    matchCount: number;
    error?: string;
    isWinner: boolean;
}
export interface ChainAnalysisResult {
    success: boolean;
    error?: string;
    branches: ChainBranch[];
    totalMatches: number;
}
export interface StabilityRun {
    run: number;
    found: boolean;
    matchCount: number;
    error?: string;
}
export interface StabilityResult {
    success: boolean;
    error?: string;
    runs: StabilityRun[];
    score: number;
    locatorStr: string;
}
export interface FormField {
    label: string;
    tagName: string;
    role: string;
    inputType?: string;
    id?: string;
    name?: string;
    placeholder?: string;
    required: boolean;
    suggestedLocator: string;
}
export interface FormSection {
    title: string;
    fields: FormField[];
}
export interface FormStructure {
    formIndex: number;
    formId?: string;
    formName?: string;
    action?: string;
    sections: FormSection[];
    ungroupedFields: FormField[];
}
export interface UiNode {
    id: string;
    type: 'page' | 'section' | 'subsection' | 'field' | 'table' | 'grid' | 'dialog' | 'popup' | 'tab' | 'window' | 'image' | 'svg' | 'canvas' | 'rte' | 'menu' | 'toolbar' | 'navigation';
    name: string;
    tagName: string;
    role?: string;
    locator: string;
    boundingBox?: BoundingBox;
    meta?: Record<string, any>;
    parentSectionName?: string;
    children: UiNode[];
}
export interface AccessibilityIssue {
    elementId?: string;
    tagName: string;
    role?: string;
    description: string;
    severity: 'warning' | 'error';
    type: 'duplicate-label' | 'missing-label' | 'missing-role' | 'invalid-aria' | 'hidden-interactive';
    suggestedLocator?: string;
}
export interface LocatorHealthReport {
    totalLocators: number;
    stableLocators: number;
    fragileLocators: number;
    dynamicIdsFound: number;
    duplicateLabels: number;
}
export interface AutomationReadinessScore {
    score: number;
    factors: {
        text: string;
        positive: boolean;
    }[];
}
export interface UiScannerResult {
    tree: UiNode[];
    accessibilityIssues: AccessibilityIssue[];
    healthReport: LocatorHealthReport;
    readinessScore: AutomationReadinessScore;
}
