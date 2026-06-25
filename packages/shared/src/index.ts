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
  confidence: number; // 0 to 100
  confidenceFactors: { text: string; positive: boolean }[];
  alternatives: AlternativeLocator[];
  failureAnalysis?: FailureAnalysisResult;
}

// Phase 3 — .or() Chain Tree Visualization
export interface ChainBranch {
  locatorStr: string;  // the individual branch expression
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

// Phase 7 — Stability Testing
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
  score: number;  // 0–100 percentage
  locatorStr: string;
}

// Phase 8 — Form-Aware Analysis
export interface FormField {
  label: string;
  tagName: string;
  role: string;
  inputType?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  required: boolean;
  suggestedLocator: string;  // e.g. getByLabel('Age')
}

export interface FormSection {
  title: string;       // fieldset legend or aria-label
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
