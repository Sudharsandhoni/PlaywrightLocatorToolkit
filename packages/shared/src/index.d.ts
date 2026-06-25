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
