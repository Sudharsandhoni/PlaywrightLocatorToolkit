(function () {
  const vscode = acquireVsCodeApi();

  // Elements
  const cdpUrlInput = document.getElementById('cdp-url');
  const connectBtn = document.getElementById('connect-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const connectionIndicator = document.getElementById('connection-status');
  const connectionInputsGroup = document.getElementById('connection-inputs-group');
  const connectedInfo = document.getElementById('connected-info');
  const tabSelect = document.getElementById('tab-select');

  const locatorInput = document.getElementById('locator-input');
  const evaluateBtn = document.getElementById('evaluate-btn');
  const clearHlBtn = document.getElementById('clear-hl-btn');

  const loader = document.getElementById('loader');
  const errorCard = document.getElementById('error-card');
  const errorMessage = document.getElementById('error-message');

  const resultsPanel = document.getElementById('results-panel');
  const matchBanner = document.getElementById('match-banner');
  const matchCount = document.getElementById('res-match-count');
  const matchText = document.getElementById('res-match-text');

  // Match navigation elements
  const matchNavigation = document.getElementById('match-navigation');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const navIndex = document.getElementById('nav-index');

  // Failure elements
  const failureAnalysisCard = document.getElementById('failure-analysis-card');
  const failureMsg = document.getElementById('failure-msg');
  const failureStepsList = document.getElementById('failure-steps-list');
  const failureSuggestionsList = document.getElementById('failure-suggestions-list');

  // Confidence elements
  const scoreBadge = document.getElementById('res-score-badge');
  const gaugeFill = document.getElementById('res-gauge-fill');
  const factorsList = document.getElementById('res-factors-list');

  // Playground
  const elementsListContainer = document.getElementById('elements-list-container');
  const alternativesList = document.getElementById('res-alternatives-list');

  // Controls & Dropdowns
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  const copyPlaygroundBtn = document.getElementById('copy-playground-btn');
  const historyBtn = document.getElementById('history-btn');
  const historyDropdown = document.getElementById('history-dropdown');
  const autocompleteList = document.getElementById('autocomplete-list');

  // Main Tab Elements
  const locatorTabContent = document.getElementById('tab-locator');
  const pageScriptTabContent = document.getElementById('tab-page-script');
  const workspaceSyncTabContent = document.getElementById('tab-workspace-sync');
  
  const locatorConnectionOverlay = document.getElementById('locator-connection-overlay');
  const pageScriptConnectionOverlay = document.getElementById('page-script-connection-overlay');

  // Interaction elements
  const interactionCard = document.getElementById('interaction-card');
  const interactionStatusBadge = document.getElementById('interaction-status-badge');
  const interactToggleBtn = document.getElementById('interact-toggle-btn');
  const interactionErrorDisplay = document.getElementById('interaction-error-display');
  const interactionErrorMessage = document.getElementById('interaction-error-message');

  // Quick Action Buttons/Inputs
  const btnClick = document.getElementById('int-btn-click');
  const btnHover = document.getElementById('int-btn-hover');
  const btnFocus = document.getElementById('int-btn-focus');
  const btnCheck = document.getElementById('int-btn-check');
  const btnUncheck = document.getElementById('int-btn-uncheck');
  const btnClear = document.getElementById('int-btn-clear');
  const btnScroll = document.getElementById('int-btn-scroll');

  const inputFill = document.getElementById('int-input-fill');
  const btnFill = document.getElementById('int-btn-fill');
  const inputSelect = document.getElementById('int-input-select');
  const btnSelect = document.getElementById('int-btn-select');
  const inputPress = document.getElementById('int-input-press');
  const btnPress = document.getElementById('int-btn-press');

  // Page Scripting elements
  const pageTextareaScript = document.getElementById('page-textarea-script');
  const intTextareaScript = document.getElementById('int-textarea-script');
  const pageInputTimeout = document.getElementById('page-input-timeout');
  const pageBtnRun = document.getElementById('page-btn-run');
  const pageBtnClearConsole = document.getElementById('page-btn-clear-console');
  const pageConsoleOutput = document.getElementById('page-console-output');
  const pageScriptStatusBadge = document.getElementById('page-script-status-badge');

  // Workspace elements
  const workspaceSyncToggle = document.getElementById('workspace-sync-toggle');
  const workspaceConsentCard = document.getElementById('workspace-consent-card');
  const workspaceRunnerCard = document.getElementById('workspace-runner-card');
  const workspaceTextareaScript = document.getElementById('workspace-textarea-script');
  const workspaceSelectMode = document.getElementById('workspace-select-mode');
  const workspaceInputRunner = document.getElementById('workspace-input-runner');
  const workspaceAttachCdp = document.getElementById('workspace-attach-cdp');
  const workspaceAttachLabel = document.getElementById('workspace-attach-label');
  const workspaceInputTimeout = document.getElementById('workspace-input-timeout');
  const workspaceBtnRun = document.getElementById('workspace-btn-run');
  const workspaceBtnClearConsole = document.getElementById('workspace-btn-clear-console');
  const workspaceConsoleOutput = document.getElementById('workspace-console-output');
  const workspaceStatusBadge = document.getElementById('workspace-status-badge');
  const workspaceInsertBaseBtn = document.getElementById('workspace-insert-base-btn');
  const workspaceRunnerDescription = document.getElementById('workspace-runner-description');

  // Editor Bridge Elements
  const intScriptOpenEditorBtn = document.getElementById('int-script-open-editor-btn');
  const elementScriptEditorBadge = document.getElementById('element-script-editor-badge');
  const pageScriptOpenEditorBtn = document.getElementById('page-script-open-editor-btn');
  const browserScriptEditorBadge = document.getElementById('browser-script-editor-badge');
  const workspaceScriptOpenEditorBtn = document.getElementById('workspace-script-open-editor-btn');
  const workspaceScriptEditorBadge = document.getElementById('workspace-script-editor-badge');

  // Settings
  const inputTimeout = { value: "5000" }; // fallback timeout for quick actions


  let isConnected = false;
  let activePageId = '';
  let currentMatchIndex = 0;
  let totalMatchCount = 0;
  let originalReadinessScore = null;
  let originalHealthReport = null;
  let activeSimulationStatus = null;
  let betaFeaturesEnabled = false;
  let currentMatchedElements = [];
  let activeScriptTarget = 'page'; // 'page' or 'element'

  // Undo/Redo stack variables
  let undoStack = [];
  let redoStack = [];
  const maxStackSize = 50;
  
  // History variables
  const maxHistoryItems = 10;
  let locatorHistory = JSON.parse(localStorage.getItem('locator_lens_history') || '[]');

  // Autocomplete variables
  let autocompleteData = { roles: [], testIds: [], placeholders: [], labels: [], texts: [] };
  let activeSuggestionIndex = -1;
  let currentSuggestions = [];

  // Initialize stacks
  undoStack.push(locatorInput.value);
  updateUndoRedoButtons();
  updateEvaluateButtonState();

  // Helper to update Undo/Redo button disabled states
  function updateUndoRedoButtons() {
    undoBtn.disabled = undoStack.length <= 1;
    redoBtn.disabled = redoStack.length === 0;
  }

  // Helper to save current input value to Undo stack
  function saveState(val) {
    if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== val) {
      undoStack.push(val);
      if (undoStack.length > maxStackSize) {
        undoStack.shift();
      }
      redoStack = []; // Clear redo stack on new action
      updateUndoRedoButtons();
    }
  }

  // Trigger live highlighting on target page
  function triggerLiveHighlight(locatorStr, scrollIndex) {
    if (isConnected && activePageId) {
      const hasValue = locatorStr.trim().length > 0;
      if (hasValue) {
        vscode.postMessage({
          type: 'highlight-locator',
          pageId: activePageId,
          locatorStr: locatorStr.trim(),
          scrollIndex: typeof scrollIndex === 'number' ? scrollIndex : 0
        });
      } else {
        vscode.postMessage({
          type: 'clear-highlight',
          pageId: activePageId
        });
      }
    }
  }

  function updateEvaluateButtonState() {
    const hasValue = locatorInput.value.trim().length > 0;
    if (!isConnected) {
      evaluateBtn.disabled = true;
      evaluateBtn.title = 'Connect to browser';
    } else {
      evaluateBtn.disabled = !hasValue;
      evaluateBtn.removeAttribute('title');
    }
    updateClearButtonState();
  }

  function updateClearButtonState() {
    const hasValue = locatorInput.value.trim().length > 0;
    clearHlBtn.disabled = !hasValue;
  }

  // Load locator into playground
  function loadLocator(val) {
    locatorInput.value = val;
    saveState(val);
    triggerLiveHighlight(val);
    updateEvaluateButtonState();
  }

  // Add locator to history
  function addToHistory(locatorStr) {
    if (!locatorStr) return;
    locatorHistory = locatorHistory.filter(item => item !== locatorStr);
    locatorHistory.unshift(locatorStr);
    if (locatorHistory.length > maxHistoryItems) {
      locatorHistory = locatorHistory.slice(0, maxHistoryItems);
    }
    localStorage.setItem('locator_lens_history', JSON.stringify(locatorHistory));
    renderHistoryDropdown();
  }

  // Render recent locator history list
  function renderHistoryDropdown() {
    historyDropdown.innerHTML = '';
    if (locatorHistory.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'No recent history';
      historyDropdown.appendChild(empty);
      return;
    }
    locatorHistory.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.title = item;
      div.textContent = item;
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        loadLocator(item);
        historyDropdown.classList.add('hidden');
      });
      historyDropdown.appendChild(div);
    });
  }

  // Request fresh autocomplete page metadata
  function requestAutocompleteData() {
    if (isConnected && activePageId) {
      vscode.postMessage({
        type: 'get-autocomplete-data',
        pageId: activePageId
      });
    }
  }

  // Evaluate autocomplete matching options based on caret position
  function showAutocomplete() {
    const text = locatorInput.value;
    const caretPos = locatorInput.selectionStart;
    const beforeCaret = text.substring(0, caretPos);

    currentSuggestions = [];
    activeSuggestionIndex = -1;

    if (!isConnected || beforeCaret.trim() === '') {
      autocompleteList.classList.add('hidden');
      return;
    }

    const getByRoleRegex = /getByRole\(['"]([^'"]*)$/;
    const getByPlaceholderRegex = /getByPlaceholder\(['"]([^'"]*)$/;
    const getByLabelRegex = /getByLabel\(['"]([^'"]*)$/;
    const getByTextRegex = /getByText\(['"]([^'"]*)$/;
    const getByTestIdRegex = /getByTestId\(['"]([^'"]*)$/;
    const getByAltTextRegex = /getByAltText\(['"]([^'"]*)$/;
    const getByTitleRegex = /getByTitle\(['"]([^'"]*)$/;
    const locatorRegex = /locator\(['"]([^'"]*)$/;
    const methodRegex = /(?:^|\.)(g[eE]?[tT]?[B]?[y]?[a-zA-Z]*|l[oO]?[c][a-zA-Z]*)$/;

    let match;
    // Full static ARIA role list — always available as fallback
    const ARIA_ROLES = [
      'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote',
      'button', 'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox',
      'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory',
      'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell',
      'group', 'heading', 'img', 'insertion', 'link', 'list', 'listbox', 'listitem',
      'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox',
      'menuitemradio', 'meter', 'navigation', 'none', 'note', 'option', 'paragraph',
      'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup',
      'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton',
      'status', 'strong', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist',
      'tabpanel', 'term', 'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree',
      'treegrid', 'treeitem'
    ];

    if ((match = beforeCaret.match(getByRoleRegex))) {
      const typed = match[1].toLowerCase();
      // Merge live page roles + static ARIA roles, deduplicated
      const liveRoles = autocompleteData.roles || [];
      const merged = [...new Set([...liveRoles, ...ARIA_ROLES])];
      currentSuggestions = merged
        .filter(r => r.toLowerCase().includes(typed))
        .map(r => ({ label: `'${r}'`, value: `'${r}'`, type: 'role' }));
    } else if ((match = beforeCaret.match(getByPlaceholderRegex))) {
      const typed = match[1].toLowerCase();
      const placeholders = autocompleteData.placeholders || [];
      currentSuggestions = placeholders
        .filter(p => p.toLowerCase().includes(typed))
        .map(p => ({ label: `'${p}'`, value: `'${p}'`, type: 'placeholder' }));
    } else if ((match = beforeCaret.match(getByLabelRegex))) {
      const typed = match[1].toLowerCase();
      const labels = autocompleteData.labels || [];
      currentSuggestions = labels
        .filter(l => l.toLowerCase().includes(typed))
        .map(l => ({ label: `'${l}'`, value: `'${l}'`, type: 'label' }));
    } else if ((match = beforeCaret.match(getByTextRegex))) {
      const typed = match[1].toLowerCase();
      const texts = autocompleteData.texts || [];
      currentSuggestions = texts
        .filter(t => t.toLowerCase().includes(typed))
        .map(t => ({ label: `'${t}'`, value: `'${t}'`, type: 'text' }));
    } else if ((match = beforeCaret.match(getByTestIdRegex))) {
      const typed = match[1].toLowerCase();
      const testIds = autocompleteData.testIds || [];
      currentSuggestions = testIds
        .filter(t => t.toLowerCase().includes(typed))
        .map(t => ({ label: `'${t}'`, value: `'${t}'`, type: 'test-id' }));
    } else if ((match = beforeCaret.match(getByAltTextRegex))) {
      const typed = match[1].toLowerCase();
      const altTexts = autocompleteData.placeholders || [];
      currentSuggestions = altTexts
        .filter(t => t.toLowerCase().includes(typed))
        .map(t => ({ label: `'${t}'`, value: `'${t}'`, type: 'alt-text' }));
    } else if ((match = beforeCaret.match(getByTitleRegex))) {
      const typed = match[1].toLowerCase();
      const titles = autocompleteData.labels || [];
      currentSuggestions = titles
        .filter(t => t.toLowerCase().includes(typed))
        .map(t => ({ label: `'${t}'`, value: `'${t}'`, type: 'title' }));
    } else if ((match = beforeCaret.match(locatorRegex))) {
      const typed = match[1].toLowerCase();
      const ids = autocompleteData.testIds || [];
      currentSuggestions = ids
        .filter(id => id.toLowerCase().includes(typed))
        .map(id => ({ label: `'[data-testid="${id}"]'`, value: `'[data-testid="${id}"]'`, type: 'selector' }));
    } else if ((match = beforeCaret.match(methodRegex))) {
      const typed = match[1].toLowerCase();
      const methods = [
        { label: 'getByRole()', value: "getByRole('')", type: 'method' },
        { label: 'getByText()', value: "getByText('')", type: 'method' },
        { label: 'getByLabel()', value: "getByLabel('')", type: 'method' },
        { label: 'getByPlaceholder()', value: "getByPlaceholder('')", type: 'method' },
        { label: 'getByTestId()', value: "getByTestId('')", type: 'method' },
        { label: 'getByAltText()', value: "getByAltText('')", type: 'method' },
        { label: 'getByTitle()', value: "getByTitle('')", type: 'method' },
        { label: 'locator()', value: "locator('')", type: 'method' }
      ];
      currentSuggestions = methods.filter(m => m.label.toLowerCase().includes(typed));
    }

    if (currentSuggestions.length > 0) {
      renderAutocompleteList();
    } else {
      autocompleteList.classList.add('hidden');
    }
  }

  // Render suggestion popup items
  function renderAutocompleteList() {
    autocompleteList.innerHTML = '';
    autocompleteList.classList.remove('hidden');
    
    currentSuggestions.forEach((s, idx) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      if (idx === activeSuggestionIndex) {
        item.classList.add('active');
      }
      
      const label = document.createElement('span');
      label.className = 'autocomplete-label';
      label.textContent = s.label;
      
      const type = document.createElement('span');
      type.className = 'autocomplete-type';
      type.textContent = s.type;
      
      item.appendChild(label);
      item.appendChild(type);
      
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        acceptSuggestion(s);
      });
      
      autocompleteList.appendChild(item);
    });

    if (activeSuggestionIndex >= 0) {
      const activeItem = autocompleteList.childNodes[activeSuggestionIndex];
      if (activeItem instanceof HTMLElement) {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  // Insert suggestion in place of typed prefix
  function acceptSuggestion(s) {
    const text = locatorInput.value;
    const caretPos = locatorInput.selectionStart;
    const beforeCaret = text.substring(0, caretPos);
    const afterCaret = text.substring(caretPos);
    
    const methodRegex = /(g[eE]?[tT]?[B]?[y]?[a-zA-Z]*|l[oO]?[c][a-zA-Z]*)$/;
    const quoteRegex = /(['"])[^'"]*$/;
    
    let newBeforeCaret = beforeCaret;
    let newAfterCaret = afterCaret;
    let cursorOffset = 0;
    if (s.type === 'method') {
      newBeforeCaret = beforeCaret.replace(methodRegex, s.value);
      if (s.value.endsWith("('')")) {
        cursorOffset = -2; // Put cursor inside single quotes
      }
    } else {
      const match = beforeCaret.match(quoteRegex);
      if (match) {
        const quoteChar = match[1];
        const lastQuoteIndex = beforeCaret.lastIndexOf(quoteChar);
        newBeforeCaret = beforeCaret.substring(0, lastQuoteIndex) + s.value;
        if (newAfterCaret.startsWith(quoteChar)) {
          newAfterCaret = newAfterCaret.substring(1);
        }
      }
    }
    
    locatorInput.value = newBeforeCaret + newAfterCaret;
    const newCaretPos = newBeforeCaret.length + cursorOffset;
    locatorInput.setSelectionRange(newCaretPos, newCaretPos);
    locatorInput.focus();
    
    autocompleteList.classList.add('hidden');
    currentSuggestions = [];
    activeSuggestionIndex = -1;
    
    triggerLiveHighlight(locatorInput.value);
    saveState(locatorInput.value);
    updateEvaluateButtonState();
  }

  // Event Listeners
  connectBtn.addEventListener('click', () => {
    const cdpUrl = cdpUrlInput.value.trim();
    if (!cdpUrl) return;
    
    setConnectionLoading(true, 'Connecting to browser CDP...');
    
    vscode.postMessage({
      type: 'connect-browser',
      cdpUrl: cdpUrl
    });
  });

  const launchBtn = document.getElementById('launch-btn');
  if (launchBtn) {
    launchBtn.addEventListener('click', () => {
      const cdpUrl = cdpUrlInput.value.trim();
      if (!cdpUrl) return;

      setConnectionLoading(true, 'Launching Google Chrome & connecting...');

      vscode.postMessage({
        type: 'launch-browser',
        cdpUrl: cdpUrl
      });
    });
  }

  disconnectBtn.addEventListener('click', () => {
    vscode.postMessage({
      type: 'disconnect-browser'
    });
  });

  const refreshTabsBtn = document.getElementById('refresh-tabs-btn');
  if (refreshTabsBtn) {
    refreshTabsBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh-pages' });
    });
  }

  // Helper: populate the tab dropdown, filtering out DevTools pages
  function populateTabSelect(pages, currentPageId) {
    tabSelect.innerHTML = '';
    const visiblePages = pages.filter(page => {
      const url = page.url || '';
      const title = (page.title || '').toLowerCase();
      return !url.startsWith('chrome-devtools://') &&
             !url.startsWith('devtools://') &&
             !title.includes('developer tools') &&
             !title.includes('devtools');
    });
    visiblePages.forEach(page => {
      const opt = document.createElement('option');
      opt.value = page.id;
      const rawTitle = page.title || 'Untitled';
      const rawUrl = page.url || '';
      const title = rawTitle.length > 22 ? rawTitle.substring(0, 20) + '…' : rawTitle;
      const url = rawUrl.length > 22 ? rawUrl.substring(0, 20) + '…' : rawUrl;
      opt.textContent = `${title} — ${url}`;
      opt.title = `${rawTitle}\n${rawUrl}`;
      if (page.id === currentPageId) {
        opt.selected = true;
      }
      tabSelect.appendChild(opt);
    });
    // If active page was a DevTools page or not found, select first visible
    if (visiblePages.length > 0 && !visiblePages.find(p => p.id === currentPageId)) {
      activePageId = visiblePages[0].id;
      tabSelect.value = activePageId;
      vscode.postMessage({ type: 'select-page', pageId: activePageId });
    }
  }

  // Helper: detect CDP page-closed errors and guide user to reconnect
  function isCdpClosedError(msg) {
    return msg && (
      msg.includes('Target page, context or browser has been closed') ||
      msg.includes('Browser has been closed') ||
      msg.includes('context or browser has been closed') ||
      msg.includes('Target closed') ||
      msg.includes('Session closed')
    );
  }

  tabSelect.addEventListener('change', () => {
    activePageId = tabSelect.value;
    vscode.postMessage({
      type: 'select-page',
      pageId: activePageId
    });
    // Fetch new autocomplete page metadata and trigger evaluation on tab select
    requestAutocompleteData();
    triggerEvaluation();
  });

  evaluateBtn.addEventListener('click', () => {
    triggerEvaluation();
  });

  clearHlBtn.addEventListener('click', () => {
    // Clear the locator input textarea and reset results/error panels
    locatorInput.value = '';
    saveState('');
    updateEvaluateButtonState();
    resultsPanel.classList.add('hidden');
    errorCard.classList.add('hidden');
    failureAnalysisCard.classList.add('hidden');
    // Also clear highlights on the target page
    if (activePageId) {
      vscode.postMessage({
        type: 'clear-highlight',
        pageId: activePageId
      });
    }
    locatorInput.focus();
  });

  prevBtn.addEventListener('click', () => {
    if (totalMatchCount > 1) {
      if (currentMatchIndex > 0) {
        currentMatchIndex--;
      } else {
        currentMatchIndex = totalMatchCount - 1;
      }
      navIndex.textContent = `${currentMatchIndex + 1}/${totalMatchCount}`;
      prevBtn.disabled = false;
      nextBtn.disabled = false;
      triggerLiveHighlight(locatorInput.value, currentMatchIndex);
      renderActiveElementDetails();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (totalMatchCount > 1) {
      if (currentMatchIndex < totalMatchCount - 1) {
        currentMatchIndex++;
      } else {
        currentMatchIndex = 0;
      }
      navIndex.textContent = `${currentMatchIndex + 1}/${totalMatchCount}`;
      prevBtn.disabled = false;
      nextBtn.disabled = false;
      triggerLiveHighlight(locatorInput.value, currentMatchIndex);
      renderActiveElementDetails();
    }
  });

  let saveStateTimeout;
  locatorInput.addEventListener('input', () => {
    const hasValue = locatorInput.value.trim().length > 0;
    updateEvaluateButtonState();
    
    // Show eager autocomplete popup
    showAutocomplete();

    // Debounce saveState for Undo/Redo tracking
    clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
      saveState(locatorInput.value);
    }, 400);

    triggerLiveHighlight(locatorInput.value);
  });

  locatorInput.addEventListener('click', () => {
    showAutocomplete();
  });

  locatorInput.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      showAutocomplete();
    }
  });

  locatorInput.addEventListener('keydown', (e) => {
    const isOpen = !autocompleteList.classList.contains('hidden');
    if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length;
        renderAutocompleteList();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
        renderAutocompleteList();
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const idx = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
        const suggestion = currentSuggestions[idx];
        if (suggestion) {
          acceptSuggestion(suggestion);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        autocompleteList.classList.add('hidden');
        currentSuggestions = [];
        activeSuggestionIndex = -1;
      }
    } else {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerEvaluation();
      }
    }
  });

  undoBtn.addEventListener('click', () => {
    if (undoStack.length > 1) {
      const current = undoStack.pop();
      redoStack.push(current);
      const previous = undoStack[undoStack.length - 1];
      locatorInput.value = previous;
      updateUndoRedoButtons();
      triggerLiveHighlight(previous);
      updateEvaluateButtonState();
    }
  });

  redoBtn.addEventListener('click', () => {
    if (redoStack.length > 0) {
      const next = redoStack.pop();
      undoStack.push(next);
      locatorInput.value = next;
      updateUndoRedoButtons();
      triggerLiveHighlight(next);
      updateEvaluateButtonState();
    }
  });

  historyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    historyDropdown.classList.toggle('hidden');
    renderHistoryDropdown();
  });

  if (copyPlaygroundBtn) {
    copyPlaygroundBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = locatorInput.value.trim();
      if (!val) return;
      navigator.clipboard.writeText(val).then(() => {
        const originalTitle = copyPlaygroundBtn.title;
        copyPlaygroundBtn.title = '✓ Copied!';
        const originalText = copyPlaygroundBtn.textContent;
        copyPlaygroundBtn.textContent = '✓';
        setTimeout(() => {
          copyPlaygroundBtn.title = originalTitle;
          copyPlaygroundBtn.textContent = originalText;
        }, 1000);
      });
    });
  }

  // Close popups when clicking outside
  document.addEventListener('click', (e) => {
    if (historyDropdown && !historyDropdown.contains(e.target) && e.target !== historyBtn) {
      historyDropdown.classList.add('hidden');
    }
    if (autocompleteList && !autocompleteList.contains(e.target) && e.target !== locatorInput) {
      autocompleteList.classList.add('hidden');
    }
  });

  function triggerEvaluation() {
    const locatorStr = locatorInput.value.trim();
    if (!locatorStr || !activePageId) return;

    showLoader('Analyzing locator...');
    hideError();
    resultsPanel.classList.add('hidden');

    vscode.postMessage({
      type: 'evaluate-locator',
      pageId: activePageId,
      locatorStr: locatorStr
    });

    triggerLiveHighlight(locatorStr);
  }

  window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.type) {
      case 'beta-config': {
        betaFeaturesEnabled = message.enabled;
        toggleBetaFeatures(betaFeaturesEnabled);
        break;
      }
      case 'connect-status': {
        setConnectionLoading(false);
        if (message.connected) {
          isConnected = true;
          activePageId = message.activePageId;
          
          connectionIndicator.textContent = 'Connected';
          connectionIndicator.className = 'status-indicator connected';
          
          connectionInputsGroup.classList.add('hidden');
          connectedInfo.classList.remove('hidden');
          
          // Populate tab select dropdown (exclude DevTools pages)
          populateTabSelect(message.pages, activePageId);

          updateEvaluateButtonState();
          updateConnectionOverlays();
          
          // Fetch autocomplete metadata from page
          requestAutocompleteData();

          // Show Phase 7 & 8 cards now that we're connected
          updateStabilityCardVisibility();
          updateUiScannerVisibility();
        } else {
          isConnected = false;
          activePageId = '';
          
          connectionIndicator.textContent = 'Disconnected';
          connectionIndicator.className = 'status-indicator disconnected';
          
          connectionInputsGroup.classList.remove('hidden');
          connectedInfo.classList.add('hidden');
          
          updateEvaluateButtonState();
          updateConnectionOverlays();
          resultsPanel.classList.add('hidden');

          // Hide Phase 7 & 8 cards on disconnect
          updateStabilityCardVisibility();
          updateUiScannerVisibility();

          if (message.error) {
            showError('Connection Failed', 'Could not connect to browser CDP. Make sure Chrome/Chromium is running with --remote-debugging-port=9222. Details: ' + message.error);
          }
        }
        break;
      }

      case 'pages-refreshed': {
        if (message.pages && message.pages.length > 0) {
          populateTabSelect(message.pages, activePageId);
        } else if (message.error) {
          showError('Refresh Failed', 'Could not refresh tab list: ' + message.error);
        }
        break;
      }

      case 'evaluation-result': {
        hideLoader();
        const res = message.result;

        if (!res.success) {
          const errMsg = res.error || 'Unknown evaluation failure.';
          if (isCdpClosedError(errMsg)) {
            showError(
              'Browser Connection Lost',
              '⚠ The browser page or context was closed. Please click "Disconnect" and reconnect to the browser CDP to continue.'
            );
          } else {
            showError('Evaluation Error', errMsg);
          }
          resultsPanel.classList.add('hidden');
          
          if (activePageId) {
            vscode.postMessage({
              type: 'clear-highlight',
              pageId: activePageId
            });
          }
          return;
        }

        renderResults(res);

        // Phase 3: trigger chain analysis if locator has .or(
        const currentLocStr = locatorInput.value.trim();
        if (hasOrChain && hasOrChain(currentLocStr)) {
          requestChainAnalysis(currentLocStr);
        }

        // Add successful evaluator text to history
        if (res.count > 0) {
          addToHistory(locatorInput.value.trim());
        }

        // Fetch new autocomplete page metadata
        requestAutocompleteData();
        break;
      }

      case 'autocomplete-data': {
        autocompleteData = message.data || { roles: [], testIds: [], placeholders: [], labels: [], texts: [] };
        break;
      }
      case 'action-result': {
        setInteractionStatus(message.success ? 'Success' : 'Error', message.success ? 'success' : 'error');
        if (interactionErrorDisplay && interactionErrorMessage) {
          if (message.success) {
            interactionErrorDisplay.classList.add('hidden');
            interactionErrorMessage.textContent = '';
          } else {
            interactionErrorDisplay.classList.remove('hidden');
            interactionErrorMessage.textContent = message.error || 'Quick Action execution failed.';
          }
        }
        break;
      }
      case 'sandbox-result': {
        if (message.log && message.log.length > 0) {
          message.log.forEach(line => {
            let type = 'stdout';
            if (line.startsWith('[ERROR]')) type = 'error';
            else if (line.startsWith('[WARN]')) type = 'warn';
            writePageConsole(line + '\n', type);
          });
        }
        if (message.success) {
          writePageConsole(`[SUCCESS] Sandbox execution completed.\n`, 'success');
          if (activeScriptTarget === 'element') {
            setInteractionStatus('Success', 'success');
            if (interactionErrorDisplay) {
              interactionErrorDisplay.classList.add('hidden');
            }
          } else {
            setPageScriptStatus('Success', 'success');
          }
        } else {
          writePageConsole(`[ERROR] Sandbox execution failed: ${message.error}\n`, 'error');
          if (activeScriptTarget === 'element') {
            setInteractionStatus('Error', 'error');
            if (interactionErrorDisplay && interactionErrorMessage) {
              interactionErrorDisplay.classList.remove('hidden');
              interactionErrorMessage.textContent = message.error || 'Element Sandbox Script execution failed.';
            }
          } else {
            setPageScriptStatus('Failed', 'error');
          }
        }
        break;
      }
      case 'sandbox-log': {
        writeWorkspaceConsole(message.log, message.stream);
        break;
      }
      case 'workspace-script-finished': {
        if (message.success) {
          writeWorkspaceConsole(`\n[SUCCESS] Script execution completed successfully (exit code ${message.code || 0}).\n`, 'success');
          setWorkspaceStatus('Success', 'success');
        } else {
          writeWorkspaceConsole(`\n[ERROR] Script execution failed${message.error ? ': ' + message.error : ''} (exit code ${message.code || 1}).\n`, 'error');
          setWorkspaceStatus('Failed', 'error');
        }
        break;
      }
      case 'editor-opened': {
        const editorId = message.editorId;
        if (editorId === 'element-script') {
          if (elementScriptEditorBadge) elementScriptEditorBadge.classList.remove('hidden');
          if (intTextareaScript) intTextareaScript.readOnly = true;
        } else if (editorId === 'browser-script') {
          if (browserScriptEditorBadge) browserScriptEditorBadge.classList.remove('hidden');
          if (pageTextareaScript) pageTextareaScript.readOnly = true;
        } else if (editorId === 'workspace-script') {
          if (workspaceScriptEditorBadge) workspaceScriptEditorBadge.classList.remove('hidden');
          if (workspaceTextareaScript) workspaceTextareaScript.readOnly = true;
        }
        break;
      }
      case 'editor-closed': {
        const editorId = message.editorId;
        if (editorId === 'element-script') {
          if (elementScriptEditorBadge) elementScriptEditorBadge.classList.add('hidden');
          if (intTextareaScript) intTextareaScript.readOnly = false;
        } else if (editorId === 'browser-script') {
          if (browserScriptEditorBadge) browserScriptEditorBadge.classList.add('hidden');
          if (pageTextareaScript) pageTextareaScript.readOnly = false;
        } else if (editorId === 'workspace-script') {
          if (workspaceScriptEditorBadge) workspaceScriptEditorBadge.classList.add('hidden');
          if (workspaceTextareaScript) workspaceTextareaScript.readOnly = false;
        }
        break;
      }
      case 'editor-content-synced': {
        const editorId = message.editorId;
        if (editorId === 'element-script') {
          if (intTextareaScript) intTextareaScript.value = message.content;
        } else if (editorId === 'browser-script') {
          if (pageTextareaScript) pageTextareaScript.value = message.content;
        } else if (editorId === 'workspace-script') {
          if (workspaceTextareaScript) workspaceTextareaScript.value = message.content;
        }
        break;
      }
    }
  });

  function renderResults(res) {
    resultsPanel.classList.remove('hidden');
    if (interactionCard) {
      interactionCard.classList.add('hidden');
    }
    if (interactionErrorDisplay) {
      interactionErrorDisplay.classList.add('hidden');
    }
    if (interactToggleBtn) {
      interactToggleBtn.classList.toggle('hidden', res.count === 0);
      interactToggleBtn.classList.remove('active');
      interactToggleBtn.textContent = 'Interact';
    }
    const firstTab = document.querySelector('.interaction-tab-btn[data-tab="int-tab-quick"]');
    if (firstTab) {
      const allTabs = document.querySelectorAll('.interaction-tab-btn');
      const allContents = document.querySelectorAll('.interaction-tab-content');
      allTabs.forEach(b => b.classList.remove('active'));
      allContents.forEach(c => c.classList.remove('active'));
      firstTab.classList.add('active');
      const targetContent = document.getElementById('int-tab-quick');
      if (targetContent) targetContent.classList.add('active');
    }
    
    // 1. Match count banner
    matchCount.textContent = res.count;
    matchBanner.className = 'match-banner';
    
    totalMatchCount = res.count;
    currentMatchIndex = 0;

    if (res.count === 1) {
      matchBanner.classList.add('success');
      matchText.textContent = 'unique match found';
      matchNavigation.classList.add('hidden');
    } else if (res.count > 1) {
      matchBanner.classList.add('warning');
      matchText.textContent = 'matches found (multiple)';
      matchNavigation.classList.remove('hidden');
      navIndex.textContent = `1/${totalMatchCount}`;
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    } else {
      matchBanner.classList.add('failure');
      matchText.textContent = 'matches found';
      matchNavigation.classList.add('hidden');
    }

    // 2. Failure Analysis
    if (res.count === 0 && res.failureAnalysis) {
      failureAnalysisCard.classList.remove('hidden');
      const fa = res.failureAnalysis;
      failureMsg.textContent = fa.message;

      failureStepsList.innerHTML = '';
      fa.steps.forEach(step => {
        const div = document.createElement('div');
        div.className = 'failure-step ' + (step.success ? 'success' : 'failed');
        
        const title = document.createElement('span');
        title.className = 'step-title';
        title.textContent = step.stepText;
        
        const details = document.createElement('span');
        details.className = 'step-details';
        if (step.success) {
          details.textContent = `✓ Passed (${step.matchCount} matched)`;
        } else {
          details.textContent = `✗ Failed (${step.reason || 'resolved to 0'})`;
        }
        
        div.appendChild(title);
        div.appendChild(details);
        failureStepsList.appendChild(div);
      });

      // Render failure suggestions
      failureSuggestionsList.innerHTML = '';
      if (fa.suggestedAlternatives && fa.suggestedAlternatives.length > 0) {
        document.getElementById('failure-suggestions-section').classList.remove('hidden');
        fa.suggestedAlternatives.forEach(alt => {
          failureSuggestionsList.appendChild(createAlternativeItem(alt));
        });
      } else {
        document.getElementById('failure-suggestions-section').classList.add('hidden');
      }
    } else {
      failureAnalysisCard.classList.add('hidden');
    }

    // 3. Confidence Card
    scoreBadge.textContent = res.confidence + '/100';
    gaugeFill.style.width = res.confidence + '%';
    
    factorsList.innerHTML = '';
    res.confidenceFactors.forEach(factor => {
      const div = document.createElement('div');
      div.className = 'factor-item ' + (factor.positive ? 'positive' : 'negative');
      
      const icon = document.createElement('span');
      icon.className = 'factor-icon';
      icon.textContent = factor.positive ? '✓' : '✗';
      
      const text = document.createElement('span');
      text.className = 'factor-text';
      text.textContent = factor.text;
      
      div.appendChild(icon);
      div.appendChild(text);
      factorsList.appendChild(div);
    });

    // 4. Element Details
    currentMatchedElements = res.elements || [];
    renderActiveElementDetails();

    // 5. Alternatives Card — filter out the evaluated locator itself
    alternativesList.innerHTML = '';
    const normalizeLocator = s => (s || '').replace(/\s+/g, ' ').trim()
      .replace(/"/g, "'");  // normalize double→single quotes for comparison
    const currentNorm = normalizeLocator(locatorInput.value);

    const filteredAlternatives = (res.alternatives || []).filter(alt => {
      return normalizeLocator(alt.selector) !== currentNorm;
    });

    if (filteredAlternatives.length > 0) {
      document.getElementById('alternatives-card').classList.remove('hidden');
      filteredAlternatives.forEach(alt => {
        alternativesList.appendChild(createAlternativeItem(alt));
      });
    } else {
      document.getElementById('alternatives-card').classList.add('hidden');
    }
  }

  function renderActiveElementDetails() {
    elementsListContainer.innerHTML = '';
    if (currentMatchedElements.length === 0) {
      document.getElementById('details-card').classList.add('hidden');
      return;
    }
    
    document.getElementById('details-card').classList.remove('hidden');
    const el = currentMatchedElements[currentMatchIndex];
    if (!el) return;

    const item = document.createElement('div');
    item.className = 'element-meta-item';
    
    const header = document.createElement('div');
    header.className = 'meta-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    const titleText = document.createElement('span');
    titleText.textContent = `Match #${currentMatchIndex + 1} of ${currentMatchedElements.length} <${el.tagName.toLowerCase()}>`;
    header.appendChild(titleText);
    item.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'meta-grid';

    const fields = [
      { label: 'Role', val: el.role || 'none' },
      { label: 'ID', val: el.id || 'none' },
      { label: 'Visible', val: el.visible ? 'Yes' : 'No' },
      { label: 'Editable', val: el.editable ? 'Yes' : 'No' },
      { label: 'Name', val: el.accessibleName || 'none', fullWidth: true },
      { label: 'Classes', val: el.className || 'none', fullWidth: true }
    ];

    fields.forEach(f => {
      const field = document.createElement('div');
      field.className = 'meta-field';
      if (f.fullWidth) {
        field.classList.add('full-width');
      }
      
      const lbl = document.createElement('span');
      lbl.className = 'meta-label';
      lbl.textContent = f.label;
      
      const val = document.createElement('span');
      val.className = 'meta-value';
      
      if (f.val && f.val.length > 120) {
        const truncatedText = f.val.substring(0, 100) + '...';
        
        const truncatedSpan = document.createElement('span');
        truncatedSpan.className = 'val-truncated';
        truncatedSpan.textContent = truncatedText;
        
        const fullSpan = document.createElement('span');
        fullSpan.className = 'val-full';
        fullSpan.style.display = 'none';
        fullSpan.textContent = f.val;
        
        const toggleBtn = document.createElement('span');
        toggleBtn.className = 'toggle-link';
        toggleBtn.style.color = 'var(--accent-start)';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.fontWeight = '600';
        toggleBtn.style.marginLeft = '6px';
        toggleBtn.textContent = 'more';
        
        let expanded = false;
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          expanded = !expanded;
          if (expanded) {
            fullSpan.style.display = 'inline';
            truncatedSpan.style.display = 'none';
            toggleBtn.textContent = 'less';
          } else {
            fullSpan.style.display = 'none';
            truncatedSpan.style.display = 'inline';
            toggleBtn.textContent = 'more';
          }
        });
        
        val.appendChild(truncatedSpan);
        val.appendChild(fullSpan);
        val.appendChild(toggleBtn);
      } else {
        val.textContent = f.val;
      }
      
      field.appendChild(lbl);
      field.appendChild(val);
      grid.appendChild(field);
    });

    item.appendChild(grid);
    elementsListContainer.appendChild(item);
  }

  function createAlternativeItem(alt) {
    const div = document.createElement('div');
    div.className = 'alternative-item';

    const header = document.createElement('div');
    header.className = 'alt-header';
    
    const badge = document.createElement('span');
    badge.className = 'alt-badge';
    badge.textContent = alt.type;
    
    const score = document.createElement('span');
    score.className = 'alt-score';
    if (alt.confidence >= 90) {
      score.classList.add('high');
    } else if (alt.confidence >= 70) {
      score.classList.add('med');
    } else {
      score.classList.add('low');
    }
    score.textContent = alt.confidence + '%';
    
    header.appendChild(badge);
    header.appendChild(score);

    const selectorContainer = document.createElement('div');
    selectorContainer.className = 'alt-selector-container';

    const sel = document.createElement('span');
    sel.className = 'alt-selector';
    sel.textContent = alt.selector;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-icon-copy';
    copyBtn.title = 'Copy and load into input';
    copyBtn.innerHTML = '📋';
    
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Copy to clipboard
      navigator.clipboard.writeText(alt.selector);
      
      // Update playground and evaluate
      locatorInput.value = alt.selector;
      updateEvaluateButtonState();
      triggerEvaluation();
    });

    selectorContainer.appendChild(sel);
    selectorContainer.appendChild(copyBtn);

    const reason = document.createElement('p');
    reason.className = 'alt-reason';
    reason.textContent = alt.reason || 'Recommended selector candidate.';

    div.appendChild(header);
    div.appendChild(selectorContainer);
    div.appendChild(reason);

    // Make the entire card clickable to load the selector
    div.addEventListener('click', () => {
      locatorInput.value = alt.selector;
      updateEvaluateButtonState();
      triggerEvaluation();
    });

    return div;
  }

  // Loader helpers
  function showLoader(text) {
    loader.classList.remove('hidden');
    loader.querySelector('span').textContent = text;
  }

  function hideLoader() {
    loader.classList.add('hidden');
  }

  function setConnectionLoading(loading, msg) {
    if (loading) {
      showLoader(msg);
      hideError();
      connectBtn.disabled = true;
      cdpUrlInput.disabled = true;
      if (launchBtn) {
        launchBtn.disabled = true;
      }
    } else {
      hideLoader();
      connectBtn.disabled = false;
      cdpUrlInput.disabled = false;
      if (launchBtn) {
        launchBtn.disabled = false;
      }
    }
  }

  // Error helpers
  function showError(title, msg) {
    errorCard.classList.remove('hidden');
    document.getElementById('error-title').textContent = title;
    errorMessage.textContent = msg;
  }

  function hideError() {
    errorCard.classList.add('hidden');
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 3 — OR Chain Tree Visualization
  // ─────────────────────────────────────────────────────────────
  const chainAnalysisCard = document.getElementById('chain-analysis-card');
  const chainTree = document.getElementById('chain-tree');
  const chainTotalBadge = document.getElementById('chain-total-badge');

  function hasOrChain(locatorStr) {
    return locatorStr && locatorStr.includes('.or(');
  }

  function requestChainAnalysis(locatorStr) {
    if (!isConnected || !activePageId || !hasOrChain(locatorStr)) return;
    vscode.postMessage({
      type: 'analyze-chain',
      pageId: activePageId,
      locatorStr: locatorStr.trim()
    });
  }

  function renderChainTree(result) {
    chainTree.innerHTML = '';

    if (!result || !result.success || result.branches.length <= 1) {
      chainAnalysisCard.classList.add('hidden');
      return;
    }

    chainAnalysisCard.classList.remove('hidden');
    chainTotalBadge.textContent = result.totalMatches + ' total match' + (result.totalMatches !== 1 ? 'es' : '');

    // Root label
    const rootLabel = document.createElement('div');
    rootLabel.className = 'chain-root-label';
    rootLabel.textContent = ' chain';
    chainTree.appendChild(rootLabel);

    result.branches.forEach(branch => {
      const div = document.createElement('div');
      div.className = 'chain-branch';
      if (branch.error) {
        div.classList.add('error');
      } else if (branch.isWinner) {
        div.classList.add('winner');
      } else {
        div.classList.add('failed');
      }

      // Dot
      const connector = document.createElement('div');
      connector.className = 'chain-connector';
      const dot = document.createElement('div');
      dot.className = 'chain-dot';
      connector.appendChild(dot);

      // Body
      const body = document.createElement('div');
      body.className = 'chain-branch-body';

      const expr = document.createElement('div');
      expr.className = 'chain-branch-expr';
      expr.textContent = branch.locatorStr;

      const status = document.createElement('div');
      status.className = 'chain-branch-status';

      if (branch.error) {
        status.textContent = '⚠ Error: ' + branch.error;
      } else if (branch.isWinner) {
        const icon = document.createElement('span');
        icon.textContent = '✓ ' + branch.matchCount + ' match' + (branch.matchCount !== 1 ? 'es' : '');
        const badge = document.createElement('span');
        badge.className = 'chain-winner-badge';
        badge.textContent = 'WINNER';
        status.appendChild(icon);
        status.appendChild(badge);
      } else {
        status.textContent = '✗ 0 matches';
      }

      body.appendChild(expr);
      body.appendChild(status);
      div.appendChild(connector);
      div.appendChild(body);
      chainTree.appendChild(div);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 7 — Stability Testing
  // ─────────────────────────────────────────────────────────────
  const stabilityCard = document.getElementById('stability-card');
  const stabilityTestBtn = document.getElementById('stability-test-btn');
  const stabilityRunsSelect = document.getElementById('stability-runs');
  const stabilityLoader = document.getElementById('stability-loader');
  const stabilityResults = document.getElementById('stability-results');
  const stabilityScoreBadge = document.getElementById('stability-score-badge');
  const stabilityRunsList = document.getElementById('stability-runs-list');

  function updateStabilityCardVisibility() {
    if (isConnected && betaFeaturesEnabled) {
      stabilityCard.classList.remove('hidden');
      stabilityTestBtn.disabled = locatorInput.value.trim().length === 0;
    } else {
      stabilityCard.classList.add('hidden');
    }
  }

  stabilityTestBtn.addEventListener('click', () => {
    const locatorStr = locatorInput.value.trim();
    if (!locatorStr || !activePageId) return;

    stabilityLoader.classList.remove('hidden');
    stabilityResults.classList.add('hidden');
    stabilityTestBtn.disabled = true;

    vscode.postMessage({
      type: 'stability-test',
      pageId: activePageId,
      locatorStr,
      runs: parseInt(stabilityRunsSelect.value, 10)
    });
  });

  function renderStabilityResult(result) {
    stabilityLoader.classList.add('hidden');
    stabilityTestBtn.disabled = !isConnected || locatorInput.value.trim().length === 0;
    stabilityResults.classList.remove('hidden');
    stabilityRunsList.innerHTML = '';

    if (!result.success) {
      stabilityScoreBadge.textContent = 'Error';
      stabilityScoreBadge.className = 'stability-score-badge low';
      const errRow = document.createElement('div');
      errRow.className = 'stability-run-row errored';
      errRow.textContent = result.error || 'Unknown error.';
      stabilityRunsList.appendChild(errRow);
      return;
    }

    const score = result.score;
    stabilityScoreBadge.textContent = score + '%';
    stabilityScoreBadge.className = 'stability-score-badge ' + (score >= 80 ? 'high' : score >= 50 ? 'med' : 'low');

    // Render mini visual progress bar for overall score
    const existingBar = stabilityResults.querySelector('.stability-mini-bar-wrap');
    if (existingBar) existingBar.remove();
    const barWrap = document.createElement('div');
    barWrap.className = 'stability-mini-bar-wrap';
    const barTrack = document.createElement('div');
    barTrack.className = 'stability-mini-bar-track';
    const barFill = document.createElement('div');
    barFill.className = 'stability-mini-bar-fill ' + (score >= 80 ? 'high' : score >= 50 ? 'med' : 'low');
    barFill.style.width = score + '%';
    barTrack.appendChild(barFill);
    barWrap.appendChild(barTrack);
    stabilityResults.insertBefore(barWrap, stabilityRunsList);

    result.runs.forEach(run => {
      const row = document.createElement('div');
      row.className = 'stability-run-row ' + (run.found ? 'found' : run.error ? 'errored' : 'not-found');

      const label = document.createElement('span');
      label.className = 'stability-run-label';
      label.textContent = 'Run ' + run.run;

      const res = document.createElement('span');
      res.className = 'stability-run-result';

      if (run.error) {
        res.textContent = '⚠ Error';
        res.title = run.error;
      } else if (run.found) {
        res.textContent = '✓ Found (' + run.matchCount + ')';
      } else {
        res.textContent = '✗ Not Found';
      }

      // Mini dot indicator per run
      const dot = document.createElement('span');
      dot.className = 'stability-run-dot ' + (run.found ? 'found' : run.error ? 'errored' : 'not-found');

      row.appendChild(label);
      row.appendChild(dot);
      row.appendChild(res);
      stabilityRunsList.appendChild(row);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 8 — UI Scanner Intelligence Platform
  // ─────────────────────────────────────────────────────────────
  const uiScannerCard = document.getElementById('ui-scanner-card');
  const scanUiBtn = document.getElementById('scan-ui-btn');
  const uiScanLoader = document.getElementById('ui-scan-loader');
  const uiScanResultsContainer = document.getElementById('ui-scan-results-container');
  const uiReadinessBadge = document.getElementById('ui-readiness-badge');
  const uiTreeContainer = document.getElementById('ui-tree-container');
  const uiNodeDetailPanel = document.getElementById('ui-node-detail-panel');
  const uiNodeDetailContent = document.getElementById('ui-node-detail-content');
  const accessibilitySummaryText = document.getElementById('accessibility-summary-text');
  const accessibilityIssuesList = document.getElementById('accessibility-issues-list');
  const readinessScoreText = document.getElementById('readiness-score-text');
  const readinessFactorsList = document.getElementById('readiness-factors-list');
  const metricTotalLocators = document.getElementById('metric-total-locators');
  const metricStableLocators = document.getElementById('metric-stable-locators');
  const metricFragileLocators = document.getElementById('metric-fragile-locators');
  const metricDynamicIds = document.getElementById('metric-dynamic-ids');
  
  // Tree Toolbar elements
  const treeExpandAllBtn = document.getElementById('tree-expand-all-btn');
  const treeCollapseAllBtn = document.getElementById('tree-collapse-all-btn');
  const treeStabilityTestBtn = document.getElementById('tree-stability-test-btn');

  // Exporter Configurator elements
  const exportFormatSelect = document.getElementById('export-format-select');
  const copyExportBtn = document.getElementById('copy-export-btn');
  const exportCodePreview = document.getElementById('export-code-preview');
  const exportClassNameInput = document.getElementById('export-class-name');
  const exportSectionNamingSelect = document.getElementById('export-section-naming');
  const exportSelectAllBtn = document.getElementById('export-select-all-btn');
  const exportClearAllBtn = document.getElementById('export-clear-all-btn');
  const exportTreeSelector = document.getElementById('export-tree-selector');

  // View Mode Elements
  const viewModeTree = document.getElementById('view-mode-tree');
  const viewModeLocator = document.getElementById('view-mode-locator');

  let scannedUiTree = [];
  let selectedTreeNode = null;
  let exportNodeSelections = {};
  let activeExportViewMode = 'tree';

  // Show/Hide UI Scanner Card on Connection
  function updateUiScannerVisibility() {
    if (isConnected && betaFeaturesEnabled) {
      uiScannerCard.classList.remove('hidden');
      scanUiBtn.disabled = false;
    } else {
      uiScannerCard.classList.add('hidden');
    }
  }

  // Bind Tab Click Handlers
  document.querySelectorAll('.ui-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.ui-scanner-card');
      parent.querySelectorAll('.ui-tab-btn').forEach(b => b.classList.remove('active'));
      parent.querySelectorAll('.ui-tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Tree Expand/Collapse Toolbar triggers
  if (treeExpandAllBtn) {
    treeExpandAllBtn.addEventListener('click', () => {
      const arrows = uiTreeContainer.querySelectorAll('.ui-tree-node-arrow');
      const childContainers = uiTreeContainer.querySelectorAll('.ui-tree-node-children');
      arrows.forEach(arrow => arrow.classList.add('expanded'));
      childContainers.forEach(container => container.classList.remove('hidden'));
    });
  }

  if (treeCollapseAllBtn) {
    treeCollapseAllBtn.addEventListener('click', () => {
      const arrows = uiTreeContainer.querySelectorAll('.ui-tree-node-arrow');
      const childContainers = uiTreeContainer.querySelectorAll('.ui-tree-node-children');
      arrows.forEach(arrow => arrow.classList.remove('expanded'));
      childContainers.forEach(container => container.classList.add('hidden'));
    });
  }

  // Tree Stability Test Trigger
  if (treeStabilityTestBtn) {
    treeStabilityTestBtn.addEventListener('click', () => {
      if (!isConnected || !activePageId || !scannedUiTree || scannedUiTree.length === 0) return;
      
      const flatNodes = flattenUiTree(scannedUiTree);
      const testableLocators = [...new Set(flatNodes
        .filter(n => n.locator && (n.type === 'field' || n.type === 'button' || n.type === 'table' || n.type === 'grid' || n.type === 'dialog' || n.type === 'svg' || n.type === 'canvas'))
        .map(n => n.locator)
      )];

      if (testableLocators.length === 0) {
        showError('Stability Test Failed', 'No interactive elements found in the scanned tree.');
        return;
      }

      uiTreeContainer.innerHTML = `
        <div class="loader-container" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:10px;">
          <div class="spinner"></div>
          <span style="font-size:11px;color:var(--text-muted);">Running stability checks on ${testableLocators.length} locators...</span>
        </div>
      `;
      treeStabilityTestBtn.disabled = true;
      scanUiBtn.disabled = true;

      vscode.postMessage({
        type: 'bulk-stability-test',
        locatorStrs: testableLocators,
        runs: 3
      });
    });
  }

  // Scan UI Action Trigger
  scanUiBtn.addEventListener('click', () => {
    if (!activePageId) return;
    uiScanLoader.classList.remove('hidden');
    uiScanResultsContainer.classList.add('hidden');
    scanUiBtn.disabled = true;
    vscode.postMessage({ type: 'scan-ui', pageId: activePageId });
  });

  // Copy Scanned Code Target
  copyExportBtn.addEventListener('click', () => {
    const codeText = exportCodePreview.textContent;
    if (!codeText) return;
    navigator.clipboard.writeText(codeText).then(() => {
      const originalText = copyExportBtn.textContent;
      copyExportBtn.textContent = '✓ Copied!';
      setTimeout(() => {
        copyExportBtn.textContent = originalText;
      }, 1500);
    });
  });

  // Wire exporter configurator triggers to auto-update preview
  if (exportFormatSelect) {
    exportFormatSelect.addEventListener('change', () => {
      triggerCodeExport();
    });
  }

  if (exportClassNameInput) {
    exportClassNameInput.addEventListener('input', () => {
      triggerCodeExport();
    });
  }

  if (exportSectionNamingSelect) {
    exportSectionNamingSelect.addEventListener('change', () => {
      triggerCodeExport();
    });
  }

  // Compile check states and custom class names to query sidebarProvider generate-export
  function triggerCodeExport() {
    if (!scannedUiTree || scannedUiTree.length === 0) return;
    
    const format = exportFormatSelect.value;
    const className = exportClassNameInput.value.trim() || 'ScannedPage';
    const sectionNaming = exportSectionNamingSelect ? exportSectionNamingSelect.value : 'none';
    const filteredTree = getFilteredExportTree(scannedUiTree);

    vscode.postMessage({
      type: 'generate-export',
      format,
      className,
      tree: filteredTree,
      sectionNaming
    });
  }

  function matchesTypeFilter(node, filter) {
    if (filter === 'all') return true;
    if (filter === 'field') {
      return node.type === 'field';
    }
    if (filter === 'table_grid') {
      return node.type === 'table' || node.type === 'grid';
    }
    if (filter === 'dialog') {
      return node.type === 'dialog' || node.type === 'popup';
    }
    if (filter === 'section') {
      return node.type === 'section' || node.type === 'subsection';
    }
    if (filter === 'rte') {
      return node.type === 'rte';
    }
    if (filter === 'graphics') {
      return node.type === 'svg' || node.type === 'canvas' || node.type === 'image';
    }
    return node.type === filter;
  }

  function getLocatorStrategy(locatorStr) {
    if (!locatorStr) return 'other';
    if (locatorStr.includes('getByRole')) return 'role';
    if (locatorStr.includes('getByLabel')) return 'label';
    if (locatorStr.includes('getByPlaceholder')) return 'placeholder';
    if (locatorStr.includes('getByTestId') || locatorStr.includes('testid')) return 'testid';
    if (locatorStr.includes('getByText')) return 'text';
    return 'other';
  }

  function flattenUiTree(tree) {
    let flat = [];
    function traverse(node) {
      flat.push(node);
      if (node.children) {
        node.children.forEach(traverse);
      }
    }
    tree.forEach(traverse);
    return flat;
  }

  function isNodeTypeAllowed(node) {
    const type = (node.type || '').toLowerCase();
    const tagName = (node.tagName || '').toLowerCase();
    const role = (node.role || '').toLowerCase();

    const inputChk = document.getElementById('filter-node-input')?.checked ?? true;
    const textareaChk = document.getElementById('filter-node-textarea')?.checked ?? true;
    const checkboxChk = document.getElementById('filter-node-checkbox')?.checked ?? true;
    const selectChk = document.getElementById('filter-node-select')?.checked ?? true;
    const buttonChk = document.getElementById('filter-node-button')?.checked ?? true;
    const tableChk = document.getElementById('filter-node-table')?.checked ?? true;
    const dialogChk = document.getElementById('filter-node-dialog')?.checked ?? true;
    const sectionChk = document.getElementById('filter-node-section')?.checked ?? true;
    const labelChk = document.getElementById('filter-node-label')?.checked ?? true;
    const svgChk = document.getElementById('filter-node-svg')?.checked ?? true;
    const imageChk = document.getElementById('filter-node-image')?.checked ?? true;

    if (type === 'table' || type === 'grid') {
      return tableChk;
    }
    if (type === 'dialog' || type === 'popup') {
      return dialogChk;
    }
    if (type === 'section' || type === 'subsection') {
      return sectionChk;
    }
    if (type === 'svg' || type === 'canvas') {
      return svgChk;
    }
    if (type === 'image') {
      return imageChk;
    }
    if (tagName === 'label' || /^h[1-6]$/.test(tagName)) {
      return labelChk;
    }
    if (tagName === 'textarea') {
      return textareaChk;
    }
    if (tagName === 'select' || role === 'combobox') {
      return selectChk;
    }
    if (role === 'checkbox' || role === 'radio') {
      return checkboxChk;
    }
    if (role === 'button' || role === 'link' || tagName === 'button' || tagName === 'a') {
      return buttonChk;
    }
    if (tagName === 'input') {
      const inputType = (node.meta && node.meta.inputType || '').toLowerCase();
      if (inputType === 'checkbox' || inputType === 'radio') {
        return checkboxChk;
      }
      return inputChk;
    }
    if (type === 'field') {
      return inputChk;
    }

    return true;
  }

  function getFilteredExportTree(tree) {
    function filterNodeList(nodes) {
      let result = [];
      for (const node of nodes) {
        const isAllowed = isNodeTypeAllowed(node);
        if (isAllowed && exportNodeSelections[node.id] === false) {
          continue;
        }

        const filteredChildren = filterNodeList(node.children || []);

        if (isAllowed) {
          const clone = { ...node, children: filteredChildren };
          result.push(clone);
        } else {
          const containerName = node.name;
          const containerType = node.type;
          const isSectionLike = containerType === 'section' || containerType === 'subsection' || containerType === 'dialog';
          
          const updatedChildren = filteredChildren.map(c => {
            if (isSectionLike) {
              return { ...c, parentSectionName: c.parentSectionName || containerName };
            }
            return c;
          });
          result.push(...updatedChildren);
        }
      }
      return result;
    }

    return filterNodeList(tree);
  }

  // Render Checkable Tree Selector
  function renderExportTreeSelector(tree) {
    exportTreeSelector.innerHTML = '';

    if (!tree || tree.length === 0) {
      exportTreeSelector.innerHTML = '<div class="form-empty-state">No elements to export.</div>';
      return;
    }

    if (activeExportViewMode === 'tree') {
      renderExportTreeSelectorHierarchical(tree);
    } else {
      renderExportTreeSelectorGrouped(tree);
    }
  }

  function renderExportTreeSelectorHierarchical(tree) {
    function getCheckboxState(container) {
      const childrenWrapper = container.querySelector(':scope > .export-selector-children');
      if (!childrenWrapper) {
        const chk = container.querySelector(':scope > .export-selector-item > input[type="checkbox"]');
        return {
          checked: chk ? chk.checked : false,
          indeterminate: chk ? chk.indeterminate : false,
          hasEnabled: chk ? !chk.disabled : false
        };
      }

      const childContainers = Array.from(childrenWrapper.querySelectorAll(':scope > .export-selector-node'));
      let totalEnabled = 0;
      let checkedCount = 0;
      let indeterminateCount = 0;

      childContainers.forEach(cc => {
        const chk = cc.querySelector(':scope > .export-selector-item > input[type="checkbox"]');
        if (chk && !chk.disabled) {
          totalEnabled++;
          if (chk.checked) checkedCount++;
          if (chk.indeterminate) indeterminateCount++;
        } else {
          const childState = getCheckboxState(cc);
          if (childState.hasEnabled) {
            totalEnabled++;
            if (childState.checked) checkedCount++;
            else if (childState.indeterminate) indeterminateCount++;
          }
        }
      });

      if (totalEnabled === 0) {
        return { checked: false, indeterminate: false, hasEnabled: false };
      }

      if (checkedCount === totalEnabled) {
        return { checked: true, indeterminate: false, hasEnabled: true };
      } else if (checkedCount === 0 && indeterminateCount === 0) {
        return { checked: false, indeterminate: false, hasEnabled: true };
      } else {
        return { checked: false, indeterminate: true, hasEnabled: true };
      }
    }

    function updateAncestors(chkElement) {
      let currentContainer = chkElement.closest('.export-selector-node');
      if (!currentContainer) return;

      let parentWrapper = currentContainer.parentElement;
      while (parentWrapper && parentWrapper.classList.contains('export-selector-children')) {
        const parentContainer = parentWrapper.parentElement;
        if (!parentContainer) break;

        const parentItem = parentContainer.querySelector(':scope > .export-selector-item');
        const parentChk = parentItem ? parentItem.querySelector('input[type="checkbox"]') : null;

        if (parentChk) {
          const parentId = parentChk.id.replace('chk-export-', '');
          if (parentChk.disabled) {
            parentChk.checked = false;
            parentChk.indeterminate = false;
            exportNodeSelections[parentId] = false;
          } else {
            const state = getCheckboxState(parentContainer);
            parentChk.checked = state.checked;
            parentChk.indeterminate = state.indeterminate;
            exportNodeSelections[parentId] = state.checked || state.indeterminate;
          }
        }

        currentContainer = parentContainer;
        parentWrapper = currentContainer.parentElement;
      }
    }

    function createSelectorNode(node) {
      const isMatch = isNodeTypeAllowed(node);

      function hasMatchingDescendant(n) {
        if (isNodeTypeAllowed(n)) return true;
        if (n.children) {
          for (let i = 0; i < n.children.length; i++) {
            if (hasMatchingDescendant(n.children[i])) return true;
          }
        }
        return false;
      }

      if (!hasMatchingDescendant(node)) {
        return null;
      }

      const container = document.createElement('div');
      container.className = 'export-selector-node';

      const item = document.createElement('div');
      item.className = 'export-selector-item';
      if (!isMatch) {
        item.style.opacity = '0.5';
      }

      // Collapse/expand toggle
      const toggle = document.createElement('span');
      toggle.className = 'export-node-toggle';
      const hasChildren = node.children && node.children.length > 0;
      if (hasChildren) {
        toggle.textContent = '▶';
      } else {
        toggle.textContent = '◽';
        toggle.style.opacity = '0.3';
      }
      item.appendChild(toggle);

      // Checkbox
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = 'chk-export-' + node.id;
      if (exportNodeSelections[node.id] === undefined) {
        exportNodeSelections[node.id] = true;
      }
      chk.checked = isMatch ? exportNodeSelections[node.id] : false;
      chk.disabled = !isMatch;
      item.appendChild(chk);

      // Label
      const label = document.createElement('label');
      label.setAttribute('for', chk.id);
      label.style.cursor = 'pointer';
      label.style.userSelect = 'none';
      label.style.flexGrow = '1';
      
      const typeIcons = {
        page: '📄',
        section: '📁',
        subsection: '📂',
        field: '⚙️',
        table: '📊',
        grid: '🔢',
        dialog: '💬',
        popup: '🔔',
        tab: '🏷️',
        window: '💻',
        image: '🖼️',
        svg: '🎨',
        canvas: '🖌️',
        rte: '📝',
        menu: '🍔',
        toolbar: '🛠️',
        navigation: '🧭'
      };
      const emoji = typeIcons[node.type] || '◽';
      label.textContent = emoji + ' ' + node.name + ' (' + node.type + ')';
      item.appendChild(label);

      container.appendChild(item);

      // Children container
      const childrenWrapper = document.createElement('div');
      childrenWrapper.className = 'export-selector-children hidden'; // Collapsed by default

      if (hasChildren) {
        node.children.forEach(child => {
          const childEl = createSelectorNode(child);
          if (childEl) {
            childrenWrapper.appendChild(childEl);
          }
        });
        container.appendChild(childrenWrapper);
      }

      // Hook collapse/expand click
      if (hasChildren) {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const isCollapsed = childrenWrapper.classList.contains('hidden');
          if (isCollapsed) {
            childrenWrapper.classList.remove('hidden');
            toggle.classList.add('expanded');
          } else {
            childrenWrapper.classList.add('hidden');
            toggle.classList.remove('expanded');
          }
        });
      }

      // Checkbox change listener
      chk.addEventListener('change', () => {
        const checked = chk.checked;
        chk.indeterminate = false;
        exportNodeSelections[node.id] = checked;

        function setChildrenChecked(n, val) {
          if (n.children) {
            n.children.forEach(c => {
              exportNodeSelections[c.id] = val;
              const childChk = document.getElementById('chk-export-' + c.id);
              if (childChk) {
                childChk.checked = isNodeTypeAllowed(c) ? val : false;
                childChk.indeterminate = false;
              }
              setChildrenChecked(c, val);
            });
          }
        }
        setChildrenChecked(node, checked);
        updateAncestors(chk);
        triggerCodeExport();
      });

      return container;
    }

    tree.forEach(n => {
      const nodeEl = createSelectorNode(n);
      if (nodeEl) {
        exportTreeSelector.appendChild(nodeEl);
      }
    });

    // Initialize indeterminate states from bottom up
    const leafNodes = exportTreeSelector.querySelectorAll('.export-selector-node');
    leafNodes.forEach(nodeContainer => {
      const childrenWrapper = nodeContainer.querySelector(':scope > .export-selector-children');
      const hasChildren = childrenWrapper && childrenWrapper.children.length > 0;
      if (!hasChildren) {
        const leafChk = nodeContainer.querySelector(':scope > .export-selector-item > input[type="checkbox"]');
        if (leafChk && !leafChk.disabled) {
          updateAncestors(leafChk);
        }
      }
    });
  }

  function renderExportTreeSelectorGrouped(tree) {
    const flatNodes = flattenUiTree(tree).filter(isNodeTypeAllowed);

    const groups = {
      role: { name: 'Role Locators (getByRole)', items: [] },
      label: { name: 'Label Locators (getByLabel)', items: [] },
      placeholder: { name: 'Placeholder Locators (getByPlaceholder)', items: [] },
      testid: { name: 'Test ID Locators (getByTestId)', items: [] },
      text: { name: 'Text Locators (getByText)', items: [] },
      other: { name: 'Fragile / Structural Locators (locator)', items: [] }
    };

    flatNodes.forEach(node => {
      if (node.locator) {
        const strategy = getLocatorStrategy(node.locator);
        groups[strategy].items.push(node);
      }
    });

    Object.keys(groups).forEach(key => {
      const group = groups[key];
      if (group.items.length === 0) return;

      const groupContainer = document.createElement('div');
      groupContainer.className = 'export-selector-node';

      const groupItem = document.createElement('div');
      groupItem.className = 'export-selector-item';
      groupItem.style.fontWeight = 'bold';
      groupItem.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

      const toggle = document.createElement('span');
      toggle.className = 'export-node-toggle';
      toggle.textContent = '▶';
      groupItem.appendChild(toggle);

      // Checkbox for the group
      const groupChk = document.createElement('input');
      groupChk.type = 'checkbox';
      groupChk.id = 'chk-group-' + key;
      
      const allChecked = group.items.every(item => exportNodeSelections[item.id] !== false);
      const noneChecked = group.items.every(item => exportNodeSelections[item.id] === false);
      groupChk.checked = allChecked;
      groupChk.indeterminate = !allChecked && !noneChecked;
      groupItem.appendChild(groupChk);

      const label = document.createElement('label');
      label.setAttribute('for', groupChk.id);
      label.style.cursor = 'pointer';
      label.textContent = '📁 ' + group.name + ' (' + group.items.length + ')';
      groupItem.appendChild(label);

      groupContainer.appendChild(groupItem);

      const childrenWrapper = document.createElement('div');
      childrenWrapper.className = 'export-selector-children hidden'; // Collapsed by default

      group.items.forEach(node => {
        const itemEl = document.createElement('div');
        itemEl.className = 'export-selector-node';

        const row = document.createElement('div');
        row.className = 'export-selector-item';

        const dot = document.createElement('span');
        dot.className = 'export-node-toggle';
        dot.textContent = '◽';
        dot.style.opacity = '0.3';
        row.appendChild(dot);

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = 'chk-export-' + node.id;
        if (exportNodeSelections[node.id] === undefined) {
          exportNodeSelections[node.id] = true;
        }
        chk.checked = exportNodeSelections[node.id];
        row.appendChild(chk);

        const label = document.createElement('label');
        label.setAttribute('for', chk.id);
        label.style.cursor = 'pointer';
        label.style.flexGrow = '1';
        label.style.fontFamily = 'SFMono-Regular, Consolas, monospace';
        label.style.fontSize = '10px';
        label.textContent = node.name + ' ➔ ' + node.locator;
        row.appendChild(label);

        itemEl.appendChild(row);
        childrenWrapper.appendChild(itemEl);

        // Individual change listener
        chk.addEventListener('change', () => {
          exportNodeSelections[node.id] = chk.checked;
          
          const activeChks = Array.from(childrenWrapper.querySelectorAll('input[type="checkbox"]'));
          const checkedCount = activeChks.filter(c => c.checked).length;
          groupChk.checked = checkedCount === activeChks.length;
          groupChk.indeterminate = checkedCount > 0 && checkedCount < activeChks.length;

          triggerCodeExport();
        });
      });

      groupContainer.appendChild(childrenWrapper);

      // Hook collapse/expand click
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = childrenWrapper.classList.contains('hidden');
        if (isCollapsed) {
          childrenWrapper.classList.remove('hidden');
          toggle.classList.add('expanded');
        } else {
          childrenWrapper.classList.add('hidden');
          toggle.classList.remove('expanded');
        }
      });

      // Group change listener
      groupChk.addEventListener('change', () => {
        const val = groupChk.checked;
        groupChk.indeterminate = false;
        group.items.forEach(node => {
          exportNodeSelections[node.id] = val;
          const childChk = document.getElementById('chk-export-' + node.id);
          if (childChk) childChk.checked = val;
        });
        triggerCodeExport();
      });

      exportTreeSelector.appendChild(groupContainer);
    });
  }

  // Hook View Mode Buttons
  if (viewModeTree && viewModeLocator) {
    viewModeTree.addEventListener('click', () => {
      viewModeTree.classList.add('active');
      viewModeLocator.classList.remove('active');
      activeExportViewMode = 'tree';
      renderExportTreeSelector(scannedUiTree);
    });

    viewModeLocator.addEventListener('click', () => {
      viewModeLocator.classList.add('active');
      viewModeTree.classList.remove('active');
      activeExportViewMode = 'locator';
      renderExportTreeSelector(scannedUiTree);
    });
  }

  // Hook Select All / Clear All Buttons
  if (exportSelectAllBtn) {
    exportSelectAllBtn.addEventListener('click', () => {
      const allNodes = flattenUiTree(scannedUiTree);
      allNodes.forEach(node => {
        exportNodeSelections[node.id] = true;
      });
      const checkboxes = exportTreeSelector.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(chk => {
        chk.checked = true;
        chk.indeterminate = false;
      });
      triggerCodeExport();
    });
  }

  if (exportClearAllBtn) {
    exportClearAllBtn.addEventListener('click', () => {
      const allNodes = flattenUiTree(scannedUiTree);
      allNodes.forEach(node => {
        exportNodeSelections[node.id] = false;
      });
      const checkboxes = exportTreeSelector.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(chk => {
        chk.checked = false;
        chk.indeterminate = false;
      });
      triggerCodeExport();
    });
  }

  // Hook filter checkboxes listeners
  const filterInputs = [
    'filter-node-input',
    'filter-node-textarea',
    'filter-node-checkbox',
    'filter-node-select',
    'filter-node-button',
    'filter-node-table',
    'filter-node-dialog',
    'filter-node-section',
    'filter-node-label',
    'filter-node-svg',
    'filter-node-image'
  ];

  filterInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        renderExportTreeSelector(scannedUiTree);
        triggerCodeExport();
      });
    }
  });

  const filterSelectAllBtn = document.getElementById('filter-select-all-btn');
  const filterClearAllBtn = document.getElementById('filter-clear-all-btn');

  if (filterSelectAllBtn) {
    filterSelectAllBtn.addEventListener('click', () => {
      filterInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
      });
      renderExportTreeSelector(scannedUiTree);
      triggerCodeExport();
    });
  }

  if (filterClearAllBtn) {
    filterClearAllBtn.addEventListener('click', () => {
      filterInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
      });
      renderExportTreeSelector(scannedUiTree);
      triggerCodeExport();
    });
  }

  // Render Interactive Collapsible UI Tree
  function renderUiTree(tree) {
    uiTreeContainer.innerHTML = '';
    uiNodeDetailPanel.classList.add('hidden');
    selectedTreeNode = null;

    if (!tree || tree.length === 0) {
      uiTreeContainer.innerHTML = '<div class="form-empty-state">No structures classified.</div>';
      return;
    }

    const rootList = document.createElement('div');
    rootList.className = 'ui-tree-root';

    tree.forEach(node => {
      rootList.appendChild(createTreeNodeElement(node));
    });

    uiTreeContainer.appendChild(rootList);
  }

  // Create Individual Node Element (Recursive)
  function createTreeNodeElement(node) {
    const container = document.createElement('div');
    container.className = 'ui-tree-node';

    const header = document.createElement('div');
    header.className = 'ui-tree-node-header';
    header.setAttribute('data-type', node.type);
    header.setAttribute('data-node-id', node.id);

    // Expand/Collapse arrow for nodes with children
    const arrow = document.createElement('span');
    arrow.className = 'ui-tree-node-arrow';
    if (node.children && node.children.length > 0) {
      arrow.textContent = '▶';
      arrow.classList.add('expanded');
    }
    header.appendChild(arrow);

    // Emoji icons representing node type
    const icon = document.createElement('span');
    icon.className = 'ui-tree-node-icon';
    const typeIcons = {
      page: '📄',
      section: '📁',
      subsection: '📂',
      field: '⚙️',
      table: '📊',
      grid: '🔢',
      dialog: '💬',
      popup: '🔔',
      tab: '🏷️',
      window: '💻',
      image: '🖼️',
      svg: '🎨',
      canvas: '🖌️',
      rte: '📝',
      menu: '🍔',
      toolbar: '🛠️',
      navigation: '🧭'
    };
    icon.textContent = typeIcons[node.type] || '◽';
    header.appendChild(icon);

    // Node readable label
    const label = document.createElement('span');
    label.className = 'ui-tree-node-label';
    label.textContent = node.name;
    header.appendChild(label);

    // Tag name badge
    const typeBadge = document.createElement('span');
    typeBadge.className = 'ui-tree-node-type';
    typeBadge.textContent = node.type;
    header.appendChild(typeBadge);

    if (node.stabilityScore !== undefined) {
      const badge = document.createElement('span');
      badge.className = 'stability-badge ' + (node.stabilityScore >= 80 ? 'high' : node.stabilityScore >= 50 ? 'med' : 'low');
      badge.textContent = `${node.stabilityScore}% stable`;
      header.appendChild(badge);
    }

    container.appendChild(header);

    // Children wrapper
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'ui-tree-node-children';

    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        childrenContainer.appendChild(createTreeNodeElement(child));
      });
      container.appendChild(childrenContainer);
    }

    // Toggle collapse on arrow click
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = arrow.classList.contains('expanded');
      if (isExpanded) {
        arrow.classList.remove('expanded');
        childrenContainer.classList.add('hidden');
      } else {
        arrow.classList.add('expanded');
        childrenContainer.classList.remove('hidden');
      }
    });

    // Select node on header click
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Clear previous tree highlights
      document.querySelectorAll('.ui-tree-node-header').forEach(h => h.classList.remove('selected'));
      header.classList.add('selected');

      // Set active selection and show detail panel
      selectedTreeNode = node;
      showNodeDetails(node);

      // Trigger live element highlighting in page connection context
      if (node.locator && isConnected && activePageId) {
        triggerLiveHighlight(node.locator);
      }
    });

    return container;
  }

  // Display Node Information inside Preview Panel
  function showNodeDetails(node) {
    uiNodeDetailPanel.classList.remove('hidden');
    uiNodeDetailContent.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'node-meta-grid';

    const fields = [
      { label: 'Name', val: node.name, fullWidth: true },
      { label: 'Type', val: node.type },
      { label: 'Tag Name', val: node.tagName },
      { label: 'Role', val: node.role || 'none' },
      { label: 'Playwright Locator', val: node.locator, fullWidth: true }
    ];

    // Meta additions based on node types
    if (node.type === 'field' && node.meta) {
      if (node.meta.required !== undefined) fields.push({ label: 'Required', val: node.meta.required ? 'Yes' : 'No' });
      if (node.meta.readOnly !== undefined) fields.push({ label: 'Read-only', val: node.meta.readOnly ? 'Yes' : 'No' });
      if (node.meta.placeholder) fields.push({ label: 'Placeholder', val: node.meta.placeholder, fullWidth: true });
    } else if ((node.type === 'table' || node.type === 'grid') && node.meta) {
      if (node.meta.rowCount !== undefined) fields.push({ label: 'Rows', val: String(node.meta.rowCount) });
      if (node.meta.columnCount !== undefined) fields.push({ label: 'Columns', val: String(node.meta.columnCount) });
      if (node.meta.headers && node.meta.headers.length > 0) {
        fields.push({ label: 'Headers', val: node.meta.headers.join(', '), fullWidth: true });
      }
    } else if (node.type === 'rte' && node.meta) {
      if (node.meta.editorType) fields.push({ label: 'Framework', val: node.meta.editorType });
    } else if (node.type === 'dialog' && node.meta) {
      if (node.meta.isOpen !== undefined) fields.push({ label: 'Open', val: node.meta.isOpen ? 'Yes' : 'No' });
    } else if ((node.type === 'svg' || node.type === 'canvas') && node.meta) {
      if (node.meta.centerClickPoint) {
        fields.push({ label: 'Center Click (Page)', val: `X: ${node.meta.centerClickPoint.x}, Y: ${node.meta.centerClickPoint.y}`, fullWidth: true });
      }
      if (node.meta.boundingOffsets) {
        fields.push({
          label: 'Bounding Offsets',
          val: `Top: ${node.meta.boundingOffsets.top}px, Left: ${node.meta.boundingOffsets.left}px, Width: ${node.meta.boundingOffsets.width}px, Height: ${node.meta.boundingOffsets.height}px`,
          fullWidth: true
        });
      }
      if (node.meta.subElements && node.meta.subElements.length > 0) {
        const subStr = node.meta.subElements
          .map(s => {
            const idStr = s.id ? ` #${s.id}` : '';
            const clsStr = s.className ? ` .${s.className}` : '';
            return `<${s.tagName}${idStr}${clsStr}> -> [x:${s.relativeBox.x}, y:${s.relativeBox.y}, w:${s.relativeBox.width}, h:${s.relativeBox.height}]`;
          })
          .join('\n');
        fields.push({ label: 'Sub-Elements Coordinate Map', val: subStr, fullWidth: true });
      }
    }

    fields.forEach(f => {
      const item = document.createElement('div');
      item.className = 'node-meta-item';
      if (f.fullWidth) item.classList.add('full-width');

      const label = document.createElement('span');
      label.className = 'node-meta-label';
      label.textContent = f.label;

      const val = document.createElement('span');
      val.className = 'node-meta-val';
      val.textContent = f.val;

      item.appendChild(label);
      item.appendChild(val);
      grid.appendChild(item);
    });

    uiNodeDetailContent.appendChild(grid);

    // Render Simulation Controls
    const hasSimulateFill = node.type === 'field' || node.tagName?.toLowerCase() === 'input' || node.tagName?.toLowerCase() === 'textarea' || node.tagName?.toLowerCase() === 'select' || (node.role && ['textbox', 'combobox', 'checkbox', 'radio'].includes(node.role));
    const hasSimulateClick = node.type === 'svg' || node.type === 'canvas';

    if (betaFeaturesEnabled && (hasSimulateFill || hasSimulateClick)) {
      const simSection = document.createElement('div');
      simSection.className = 'simulation-section';

      const simTitle = document.createElement('div');
      simTitle.className = 'simulation-section-title';
      simTitle.textContent = '⚡ Interactive Simulation';
      simSection.appendChild(simTitle);

      const simInputs = document.createElement('div');
      simInputs.className = 'simulation-inputs';

      const statusSpan = document.createElement('span');
      statusSpan.style.fontSize = '10px';
      statusSpan.style.marginLeft = '8px';
      statusSpan.style.alignSelf = 'center';
      activeSimulationStatus = statusSpan;

      if (hasSimulateFill) {
        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.id = 'sim-fill-value';
        valInput.placeholder = node.tagName?.toLowerCase() === 'select' ? 'Option value/text...' : 'Enter test value...';
        simInputs.appendChild(valInput);

        const fillBtn = document.createElement('button');
        fillBtn.className = 'btn btn-primary';
        fillBtn.textContent = 'Fill';
        fillBtn.style.padding = '4px 10px';
        fillBtn.style.fontSize = '11px';
        fillBtn.addEventListener('click', () => {
          const val = valInput.value;
          if (node.locator) {
            statusSpan.textContent = 'Simulating...';
            statusSpan.style.color = 'var(--text-muted)';
            vscode.postMessage({
              type: 'simulate-fill',
              locatorStr: node.locator,
              value: val
            });
          }
        });
        simInputs.appendChild(fillBtn);
      } else if (hasSimulateClick) {
        const xInput = document.createElement('input');
        xInput.type = 'number';
        xInput.id = 'sim-click-x';
        xInput.placeholder = 'X';
        xInput.title = 'X coordinate relative to element top-left';
        simInputs.appendChild(xInput);

        const yInput = document.createElement('input');
        yInput.type = 'number';
        yInput.id = 'sim-click-y';
        yInput.placeholder = 'Y';
        yInput.title = 'Y coordinate relative to element top-left';
        simInputs.appendChild(yInput);

        const clickBtn = document.createElement('button');
        clickBtn.className = 'btn btn-primary';
        clickBtn.textContent = 'Click';
        clickBtn.style.padding = '4px 10px';
        clickBtn.style.fontSize = '11px';
        clickBtn.addEventListener('click', () => {
          const x = xInput.value ? Number(xInput.value) : undefined;
          const y = yInput.value ? Number(yInput.value) : undefined;
          if (node.locator) {
            statusSpan.textContent = 'Clicking...';
            statusSpan.style.color = 'var(--text-muted)';
            vscode.postMessage({
              type: 'simulate-click',
              locatorStr: node.locator,
              x,
              y
            });
          }
        });
        simInputs.appendChild(clickBtn);
      }

      simInputs.appendChild(statusSpan);
      simSection.appendChild(simInputs);
      uiNodeDetailContent.appendChild(simSection);
    }

    // Detail Action buttons
    const actions = document.createElement('div');
    actions.className = 'node-detail-actions';

    const useBtn = document.createElement('button');
    useBtn.className = 'btn btn-secondary btn-full';
    useBtn.textContent = '▶ Load to Playground';
    useBtn.title = 'Loads this element selector into locator playground input';
    useBtn.addEventListener('click', () => {
      if (node.locator) {
        locatorInput.value = node.locator;
        updateEvaluateButtonState();
        saveState(node.locator);
        triggerEvaluation();
      }
    });

    const copyLocatorBtn = document.createElement('button');
    copyLocatorBtn.className = 'btn btn-secondary';
    copyLocatorBtn.textContent = '📋 Copy';
    copyLocatorBtn.addEventListener('click', () => {
      if (node.locator) {
        navigator.clipboard.writeText(node.locator).then(() => {
          const original = copyLocatorBtn.textContent;
          copyLocatorBtn.textContent = '✓';
          setTimeout(() => { copyLocatorBtn.textContent = original; }, 1000);
        });
      }
    });

    actions.appendChild(useBtn);
    actions.appendChild(copyLocatorBtn);
    uiNodeDetailContent.appendChild(actions);

    // Section/Container Child Inventory
    if (node.children && node.children.length > 0) {
      const descendants = [];
      function collectDescendants(n) {
        if (n.children) {
          n.children.forEach(child => {
            descendants.push(child);
            collectDescendants(child);
          });
        }
      }
      collectDescendants(node);

      if (descendants.length > 0) {
        const title = document.createElement('div');
        title.className = 'inventory-title';
        title.textContent = 'Section Inventory (' + descendants.length + ' elements)';
        uiNodeDetailContent.appendChild(title);

        // Counts
        let inputCount = 0;
        let textareaCount = 0;
        let checkboxCount = 0;
        let buttonCount = 0;
        let tableCount = 0;
        let selectCount = 0;
        let rteCount = 0;

        descendants.forEach(desc => {
          const type = (desc.type || '').toLowerCase();
          const tagName = (desc.tagName || '').toLowerCase();
          const role = (desc.role || '').toLowerCase();

          if (type === 'table' || type === 'grid') {
            tableCount++;
          } else if (type === 'rte') {
            rteCount++;
          } else if (tagName === 'textarea') {
            textareaCount++;
          } else if (tagName === 'select' || role === 'combobox') {
            selectCount++;
          } else if (role === 'checkbox' || role === 'radio') {
            checkboxCount++;
          } else if (role === 'button' || role === 'link' || tagName === 'button' || tagName === 'a') {
            buttonCount++;
          } else if (tagName === 'input') {
            if (desc.locator.includes('checkbox') || desc.locator.includes('radio')) {
              checkboxCount++;
            } else {
              inputCount++;
            }
          } else if (type === 'field') {
            inputCount++;
          }
        });

        const summary = document.createElement('div');
        summary.className = 'inventory-badges';

        const addBadge = (lbl, count, emoji) => {
          if (count > 0) {
            const badge = document.createElement('div');
            badge.className = 'inventory-badge';
            badge.textContent = emoji + ' ' + count + ' ' + lbl + (count > 1 ? 's' : '');
            summary.appendChild(badge);
          }
        };

        addBadge('Input', inputCount, '⚙️');
        addBadge('Textarea', textareaCount, '📝');
        addBadge('Checkbox/Radio', checkboxCount, '☑️');
        addBadge('Dropdown', selectCount, '🏷️');
        addBadge('Button/Link', buttonCount, '🍔');
        addBadge('Table/Grid', tableCount, '📊');
        addBadge('RTE', rteCount, '📝');

        uiNodeDetailContent.appendChild(summary);

        // List
        const list = document.createElement('div');
        list.className = 'inventory-list';

        descendants.forEach(desc => {
          const item = document.createElement('div');
          item.className = 'inventory-item';

          const details = document.createElement('div');
          details.className = 'inventory-item-details';

          // Tag/Type badge
          const tagSpan = document.createElement('span');
          tagSpan.className = 'inventory-item-tag';
          
          let displayTag = (desc.tagName || desc.type || '').toUpperCase();
          const descRole = (desc.role || '').toLowerCase();
          if (descRole === 'checkbox') displayTag = 'CHECKBOX';
          else if (descRole === 'radio') displayTag = 'RADIO';
          tagSpan.textContent = displayTag;
          details.appendChild(tagSpan);

          // Name
          const nameSpan = document.createElement('span');
          nameSpan.className = 'inventory-item-name';
          nameSpan.textContent = desc.name || 'Unnamed';
          details.appendChild(nameSpan);

          // Locator (inside details as sibling)
          const locSpan = document.createElement('span');
          locSpan.className = 'inventory-item-locator';
          locSpan.textContent = desc.locator || '';
          locSpan.title = 'Click to load locator to playground';
          locSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            if (desc.locator) {
              locatorInput.value = desc.locator;
              updateEvaluateButtonState();
              saveState(desc.locator);
              triggerEvaluation();
            }
          });
          details.appendChild(locSpan);

          item.appendChild(details);

          // Actions
          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'node-inventory-item-actions';

          // Copy Button
          if (desc.locator) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn-mini';
            copyBtn.textContent = '📋';
            copyBtn.title = 'Copy Locator';
            copyBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(desc.locator).then(() => {
                copyBtn.textContent = '✓';
                setTimeout(() => { copyBtn.textContent = '📋'; }, 1000);
              });
            });
            actionsDiv.appendChild(copyBtn);
          }

          item.appendChild(actionsDiv);

          // Click on row to navigate to tree node
          item.addEventListener('click', () => {
            const targetHeader = uiTreeContainer.querySelector('[data-node-id="' + desc.id + '"]');
            if (targetHeader) {
              let parent = targetHeader.parentElement;
              while (parent && parent !== uiTreeContainer) {
                if (parent.classList.contains('ui-tree-node-children')) {
                  parent.classList.remove('hidden');
                  const parentNode = parent.parentElement;
                  if (parentNode) {
                    const arrow = parentNode.querySelector(':scope > .ui-tree-node-header > .ui-tree-node-arrow');
                    if (arrow) arrow.classList.add('expanded');
                  }
                }
                parent = parent.parentElement;
              }
              targetHeader.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              targetHeader.click();
            }
          });

          list.appendChild(item);
        });

        uiNodeDetailContent.appendChild(list);
      }
    }
  }

  // Render Accessibility Audit Issues list
  function renderAccessibilityIssues(issues) {
    accessibilityIssuesList.innerHTML = '';

    if (!issues || issues.length === 0) {
      accessibilitySummaryText.textContent = '✓ No accessibility violations detected!';
      accessibilitySummaryText.style.color = 'var(--color-success)';
      return;
    }

    const errorsCount = issues.filter(i => i.severity === 'error').length;
    const warningsCount = issues.filter(i => i.severity === 'warning').length;
    accessibilitySummaryText.textContent = `Found ${errorsCount} errors and ${warningsCount} warnings.`;
    accessibilitySummaryText.style.color = errorsCount > 0 ? 'var(--color-danger)' : 'var(--color-warning)';

    issues.forEach(issue => {
      const item = document.createElement('div');
      item.className = 'accessibility-item ' + (issue.severity === 'error' ? 'error' : '');

      const icon = document.createElement('span');
      icon.className = 'accessibility-item-icon';
      icon.textContent = issue.severity === 'error' ? '❌' : '⚠️';
      item.appendChild(icon);

      const body = document.createElement('div');
      body.className = 'accessibility-item-body';

      const desc = document.createElement('span');
      desc.className = 'accessibility-item-desc';
      desc.textContent = issue.description;
      body.appendChild(desc);

      if (issue.suggestedLocator) {
        const locator = document.createElement('span');
        locator.className = 'accessibility-item-locator';
        locator.textContent = issue.suggestedLocator;
        locator.title = 'Click to load locator representing element';
        locator.addEventListener('click', (e) => {
          e.stopPropagation();
          locatorInput.value = issue.suggestedLocator;
          updateEvaluateButtonState();
          saveState(issue.suggestedLocator);
          triggerEvaluation();
        });
        body.appendChild(locator);
      }

      item.appendChild(body);
      accessibilityIssuesList.appendChild(item);
    });
  }

  // Render Metrics and Score Gauge
  function renderReadinessMetrics(readiness, health) {
    // Score Badge & Gauge
    uiReadinessBadge.textContent = readiness.score + '% Readiness';
    readinessScoreText.textContent = readiness.score + '%';

    // Update gauge radial color based on score
    const radial = document.querySelector('.readiness-radial');
    if (radial) {
      const color = readiness.score >= 80 ? 'var(--color-success)' : readiness.score >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
      radial.style.borderColor = color;
      radial.style.boxShadow = `0 0 12px ${color}33`;
    }

    // Factors list
    readinessFactorsList.innerHTML = '';
    readiness.factors.forEach(factor => {
      const div = document.createElement('div');
      div.className = 'factor-item ' + (factor.positive ? 'positive' : 'negative');
      
      const icon = document.createElement('span');
      icon.className = 'factor-icon';
      icon.textContent = factor.positive ? '✓' : '✗';
      
      const text = document.createElement('span');
      text.className = 'factor-text';
      text.textContent = factor.text;
      
      div.appendChild(icon);
      div.appendChild(text);
      readinessFactorsList.appendChild(div);
    });

    // Counts metrics
    metricTotalLocators.textContent = health.totalLocators;
    metricStableLocators.textContent = health.stableLocators;
    metricFragileLocators.textContent = health.fragileLocators;
    metricDynamicIds.textContent = health.dynamicIdsFound;
  }


  // ─────────────────────────────────────────────────────────────
  // Patch existing message receiver to handle new message types
  // and update visibility of new cards
  // ─────────────────────────────────────────────────────────────

  // Extend window.addEventListener for new message types
  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
      case 'chain-analysis-result':
        renderChainTree(message.result);
        break;

      case 'stability-result':
        renderStabilityResult(message.result);
        break;

      case 'ui-scan-result':
        uiScanLoader.classList.add('hidden');
        scanUiBtn.disabled = false;
        if (treeStabilityTestBtn) treeStabilityTestBtn.disabled = false;
        if (message.error) {
          showError('UI Scan Failed', message.error);
          uiScanResultsContainer.classList.add('hidden');
        } else {
          hideError();
          uiScanResultsContainer.classList.remove('hidden');
          scannedUiTree = message.result.tree || [];
          originalReadinessScore = message.result.readinessScore;
          originalHealthReport = message.result.healthReport;
          
          // Reset selections
          exportNodeSelections = {};
          
          // Set default page class name based on Page node name
          const pageNode = scannedUiTree.find(n => n.type === 'page') || scannedUiTree[0];
          const rawName = pageNode ? pageNode.name : 'Scanned';
          const defaultClassName = rawName.replace(/[^a-zA-Z0-9]/g, '') + 'Page';
          exportClassNameInput.value = defaultClassName;

          renderUiTree(scannedUiTree);
          renderExportTreeSelector(scannedUiTree);
          renderAccessibilityIssues(message.result.accessibilityIssues || []);
          renderReadinessMetrics(message.result.readinessScore, message.result.healthReport);
          triggerCodeExport(); // Trigger active export representation
        }
        break;

      case 'export-result':
        if (message.error) {
          exportCodePreview.textContent = '// Export failed: ' + message.error;
        } else {
          exportCodePreview.textContent = message.code || '';
          
          const format = message.format;
          exportCodePreview.className = '';
          if (format === 'json') exportCodePreview.classList.add('language-json');
          else if (format === 'yaml') exportCodePreview.classList.add('language-yaml');
          else exportCodePreview.classList.add('language-typescript');
        }
        break;

      case 'bulk-stability-result':
        if (treeStabilityTestBtn) treeStabilityTestBtn.disabled = false;
        scanUiBtn.disabled = false;
        
        renderUiTree(scannedUiTree);
        
        if (message.error) {
          showError('Stability Test Failed', message.error);
        } else {
          hideError();
          const bulkResults = message.results || {};
          
          Object.keys(bulkResults).forEach(loc => {
            const res = bulkResults[loc];
            const nodes = findNodesByLocator(scannedUiTree, loc);
            nodes.forEach(node => {
              node.stabilityScore = res.score;
              const header = uiTreeContainer.querySelector(`[data-node-id="${node.id}"]`);
              if (header) {
                const oldBadge = header.querySelector('.stability-badge');
                if (oldBadge) oldBadge.remove();
                
                const badge = document.createElement('span');
                badge.className = 'stability-badge ' + (res.score >= 80 ? 'high' : res.score >= 50 ? 'med' : 'low');
                badge.textContent = `${res.score}% stable`;
                header.appendChild(badge);
              }
            });
          });

          updateMetricsWithStability(bulkResults);
        }
        break;

      case 'simulate-fill-result':
      case 'simulate-click-result':
        if (activeSimulationStatus) {
          if (message.success) {
            activeSimulationStatus.textContent = '✓ Success';
            activeSimulationStatus.style.color = 'var(--color-success)';
          } else {
            activeSimulationStatus.textContent = '✗ Failed: ' + (message.error || 'unknown');
            activeSimulationStatus.style.color = 'var(--color-danger)';
          }
          setTimeout(() => {
            if (activeSimulationStatus) activeSimulationStatus.textContent = '';
          }, 2000);
        }
        break;
    }
  });

  function findNodesByLocator(tree, locator) {
    const matches = [];
    function traverse(node) {
      if (node.locator === locator) {
        matches.push(node);
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    }
    tree.forEach(traverse);
    return matches;
  }

  function updateMetricsWithStability(bulkResults) {
    let totalTested = 0;
    let stableTested = 0;
    let fragileTested = 0;
    
    Object.keys(bulkResults).forEach(loc => {
      const res = bulkResults[loc];
      totalTested++;
      if (res.score >= 80) {
        stableTested++;
      } else {
        fragileTested++;
      }
    });

    if (!originalReadinessScore) return;

    let newScore = originalReadinessScore.score;
    const newFactors = [...originalReadinessScore.factors];

    const idx = newFactors.findIndex(f => f.text.includes('stability') || f.text.includes('stable'));
    if (idx !== -1) {
      newFactors.splice(idx, 1);
    }

    if (fragileTested > 0) {
      const penalty = Math.min(30, fragileTested * 5);
      newScore -= penalty;
      newFactors.push({
        text: `${fragileTested} locator(s) failed stability checks with <80% success (-${penalty} pts)`,
        positive: false
      });
    } else if (stableTested > 0) {
      newScore += 15;
      newFactors.push({
        text: `All tested locators passed stability checks (+15 pts)`,
        positive: true
      });
    }

    newScore = Math.max(10, Math.min(100, newScore));

    uiReadinessBadge.textContent = newScore + '% Readiness';
    readinessScoreText.textContent = newScore + '%';
    const radial = document.querySelector('.readiness-radial');
    if (radial) {
      const color = newScore >= 80 ? 'var(--color-success)' : newScore >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
      radial.style.borderColor = color;
      radial.style.boxShadow = `0 0 12px ${color}33`;
    }

    readinessFactorsList.innerHTML = '';
    newFactors.forEach(factor => {
      const div = document.createElement('div');
      div.className = 'factor-item ' + (factor.positive ? 'positive' : 'negative');
      
      const icon = document.createElement('span');
      icon.className = 'factor-icon';
      icon.textContent = factor.positive ? '✓' : '✗';
      
      const text = document.createElement('span');
      text.className = 'factor-text';
      text.textContent = factor.text;
      
      div.appendChild(icon);
      div.appendChild(text);
      readinessFactorsList.appendChild(div);
    });

    if (fragileTested > 0) {
      const fragileEl = document.getElementById('metric-fragile-locators');
      if (fragileEl) {
        const baseFragile = originalHealthReport ? originalHealthReport.fragileLocators : 0;
        fragileEl.textContent = baseFragile + fragileTested;
      }
    }
  }

  // Patch connect-status receiver: show/hide new cards on connect/disconnect
  // We do this by observing the isConnected variable changes indirectly
  // via a MutationObserver on the connection status indicator
  const connectionObserver = new MutationObserver(() => {
    updateStabilityCardVisibility();
    updateUiScannerVisibility();
  });
  connectionObserver.observe(connectionIndicator, { childList: true, characterData: true, subtree: true, attributes: true });

  // Also call on load in case already connected
  updateStabilityCardVisibility();
  updateUiScannerVisibility();

  // Update stability test button enable state when locator changes
  locatorInput.addEventListener('input', () => {
    stabilityTestBtn.disabled = !isConnected || locatorInput.value.trim().length === 0;
  });

  // After evaluation results come in, trigger chain analysis if .or() detected
  // (Chain analysis is triggered inline in the evaluation-result handler)

  function toggleBetaFeatures(enabled) {
    const stabilityCard = document.getElementById('stability-card');
    const exportTabBtn = document.querySelector('.ui-tab-btn[data-tab="ui-tab-export"]');

    if (stabilityCard) {
      if (enabled && isConnected) {
        stabilityCard.classList.remove('hidden');
      } else {
        stabilityCard.classList.add('hidden');
      }
    }

    updateUiScannerVisibility();

    if (exportTabBtn) {
      if (enabled) {
        exportTabBtn.classList.remove('hidden');
      } else {
        exportTabBtn.classList.add('hidden');
        if (exportTabBtn.classList.contains('active')) {
          const treeTabBtn = document.querySelector('.ui-tab-btn[data-tab="ui-tab-tree"]');
          if (treeTabBtn) {
            treeTabBtn.click();
          }
        }
      }
    }
  }

  // ==========================================
  // PLAYWRIGHT PLAYGROUND TABBED INTERACTION LOGIC
  // ==========================================

  // Primary Tab switching behavior
  const mainTabButtons = document.querySelectorAll('.main-tab-btn');
  const mainTabContents = document.querySelectorAll('.main-tab-content');

  if (mainTabButtons.length > 0) {
    mainTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        mainTabButtons.forEach(b => b.classList.remove('active'));
        mainTabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
          targetContent.classList.add('active');
        }
      });
    });
  }

  // Connection overlay updater
  function updateConnectionOverlays() {
    if (isConnected) {
      if (locatorConnectionOverlay) locatorConnectionOverlay.classList.add('hidden');
      if (pageScriptConnectionOverlay) pageScriptConnectionOverlay.classList.add('hidden');
      if (workspaceAttachCdp) {
        workspaceAttachCdp.disabled = false;
        if (workspaceAttachLabel) workspaceAttachLabel.style.opacity = '1';
      }
    } else {
      if (locatorConnectionOverlay) locatorConnectionOverlay.classList.remove('hidden');
      if (pageScriptConnectionOverlay) pageScriptConnectionOverlay.classList.remove('hidden');
      if (workspaceAttachCdp) {
        workspaceAttachCdp.checked = false;
        workspaceAttachCdp.disabled = true;
        if (workspaceAttachLabel) workspaceAttachLabel.style.opacity = '0.5';
      }
    }
  }

  // Load initial workspace sync toggle state
  const savedSyncState = localStorage.getItem('workspace_sync_enabled') === 'true';
  if (workspaceSyncToggle) {
    workspaceSyncToggle.checked = savedSyncState;
    toggleWorkspaceRunnerVisibility(savedSyncState);

    workspaceSyncToggle.addEventListener('change', () => {
      const enabled = workspaceSyncToggle.checked;
      localStorage.setItem('workspace_sync_enabled', enabled);
      toggleWorkspaceRunnerVisibility(enabled);
    });
  }

  function toggleWorkspaceRunnerVisibility(enabled) {
    if (workspaceConsentCard && workspaceRunnerCard) {
      if (enabled) {
        workspaceConsentCard.classList.add('hidden');
        workspaceRunnerCard.classList.remove('hidden');
      } else {
        workspaceConsentCard.classList.remove('hidden');
        workspaceRunnerCard.classList.add('hidden');
      }
    }
  }

  // Mode changes in workspace mode
  if (workspaceSelectMode) {
    workspaceSelectMode.addEventListener('change', () => {
      const val = workspaceSelectMode.value;
      if (val === 'workspace-standalone') {
        workspaceInputRunner.placeholder = 'e.g. npx tsx';
        if (!workspaceInputRunner.value.trim() || workspaceInputRunner.value === 'npx playwright test') {
          workspaceInputRunner.value = 'npx tsx';
        }
      } else if (val === 'playwright-test') {
        workspaceInputRunner.placeholder = 'e.g. npx playwright test';
        if (!workspaceInputRunner.value.trim() || workspaceInputRunner.value === 'npx tsx') {
          workspaceInputRunner.value = 'npx playwright test';
        }
      }
    });
  }

  // Console logging helpers for Page Scripting
  function writePageConsole(text, type = 'info') {
    if (!pageConsoleOutput) return;
    const placeholder = pageConsoleOutput.querySelector('.console-placeholder');
    if (placeholder) {
      pageConsoleOutput.innerHTML = '';
    }
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = text;
    pageConsoleOutput.appendChild(line);
    pageConsoleOutput.scrollTop = pageConsoleOutput.scrollHeight;
  }

  function clearPageConsole() {
    if (pageConsoleOutput) {
      pageConsoleOutput.innerHTML = '<div class="console-placeholder">Console prints and evaluation outputs will appear here...</div>';
    }
  }

  function setPageScriptStatus(text, type = 'info') {
    if (!pageScriptStatusBadge) return;
    pageScriptStatusBadge.textContent = text;
    pageScriptStatusBadge.className = 'badge';
    if (type === 'success') {
      pageScriptStatusBadge.style.backgroundColor = 'var(--color-success)';
    } else if (type === 'error') {
      pageScriptStatusBadge.style.backgroundColor = 'var(--color-danger)';
    } else if (type === 'running') {
      pageScriptStatusBadge.style.backgroundColor = 'var(--color-warning)';
    } else {
      pageScriptStatusBadge.style.backgroundColor = 'var(--accent-start)';
    }
  }

  if (pageBtnClearConsole) {
    pageBtnClearConsole.addEventListener('click', clearPageConsole);
  }

  // Console logging helpers for Workspace Sync
  function writeWorkspaceConsole(text, type = 'info') {
    if (!workspaceConsoleOutput) return;
    const placeholder = workspaceConsoleOutput.querySelector('.console-placeholder');
    if (placeholder) {
      workspaceConsoleOutput.innerHTML = '';
    }
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = text;
    workspaceConsoleOutput.appendChild(line);
    workspaceConsoleOutput.scrollTop = workspaceConsoleOutput.scrollHeight;
  }

  function clearWorkspaceConsole() {
    if (workspaceConsoleOutput) {
      workspaceConsoleOutput.innerHTML = '<div class="console-placeholder">Terminal logs and process streams will appear here...</div>';
    }
  }

  function setWorkspaceStatus(text, type = 'info') {
    if (!workspaceStatusBadge) return;
    workspaceStatusBadge.textContent = text;
    workspaceStatusBadge.className = 'badge';
    if (type === 'success') {
      workspaceStatusBadge.style.backgroundColor = 'var(--color-success)';
    } else if (type === 'error') {
      workspaceStatusBadge.style.backgroundColor = 'var(--color-danger)';
    } else if (type === 'running') {
      workspaceStatusBadge.style.backgroundColor = 'var(--color-warning)';
    } else {
      workspaceStatusBadge.style.backgroundColor = 'var(--accent-start)';
    }
  }

  if (workspaceBtnClearConsole) {
    workspaceBtnClearConsole.addEventListener('click', clearWorkspaceConsole);
  }

  function setInteractionStatus(text, type = 'info') {
    if (!interactionStatusBadge) return;
    interactionStatusBadge.textContent = text;
    interactionStatusBadge.className = 'badge';
    if (type === 'success') {
      interactionStatusBadge.style.backgroundColor = 'var(--color-success)';
    } else if (type === 'error') {
      interactionStatusBadge.style.backgroundColor = 'var(--color-danger)';
    } else if (type === 'running') {
      interactionStatusBadge.style.backgroundColor = 'var(--color-warning)';
    } else {
      interactionStatusBadge.style.backgroundColor = 'var(--accent-start)';
    }
  }

  // Helper to send quick actions
  function sendQuickAction(action, args = []) {
    const locatorStr = locatorInput.value.trim();
    if (!locatorStr || !activePageId) return;

    setInteractionStatus('Running', 'running');

    const timeout = 5000; // fallback timeout for quick actions

    vscode.postMessage({
      type: 'perform-action',
      locatorStr,
      action,
      args,
      timeout
    });
  }

  // Quick Action Buttons event listeners
  if (btnClick) btnClick.addEventListener('click', () => sendQuickAction('click'));
  if (btnHover) btnHover.addEventListener('click', () => sendQuickAction('hover'));
  if (btnFocus) btnFocus.addEventListener('click', () => sendQuickAction('focus'));
  if (btnCheck) btnCheck.addEventListener('click', () => sendQuickAction('check'));
  if (btnUncheck) btnUncheck.addEventListener('click', () => sendQuickAction('uncheck'));
  if (btnClear) btnClear.addEventListener('click', () => sendQuickAction('clear'));
  if (btnScroll) btnScroll.addEventListener('click', () => sendQuickAction('scrollIntoView'));

  if (btnFill) {
    btnFill.addEventListener('click', () => {
      const val = inputFill.value;
      sendQuickAction('fill', [val]);
    });
  }

  if (btnSelect) {
    btnSelect.addEventListener('click', () => {
      const val = inputSelect.value;
      sendQuickAction('selectOption', [val]);
    });
  }

  if (btnPress) {
    btnPress.addEventListener('click', () => {
      const val = inputPress.value.trim();
      if (!val) {
        return;
      }
      sendQuickAction('press', [val]);
    });
  }

  // Run custom script against page (Sandbox)
  if (pageBtnRun) {
    pageBtnRun.addEventListener('click', () => {
      const userCode = pageTextareaScript.value.trim();
      if (!userCode) {
        writePageConsole(`[WARN] Script body is empty.\n`, 'warn');
        return;
      }
      if (!isConnected || !activePageId) {
        writePageConsole(`[ERROR] Browser is disconnected.\n`, 'error');
        return;
      }

      activeScriptTarget = 'page';
      const timeout = parseInt(pageInputTimeout.value, 10) || 5000;
      setPageScriptStatus('Running', 'running');
      clearPageConsole();
      writePageConsole(`[INFO] Starting execution in Extension Sandbox...\n`, 'info');

      vscode.postMessage({
        type: 'execute-sandbox-code',
        locatorStr: '', // Empty, as it targets page globally
        userCode,
        timeout
      });
    });
  }

  // Run custom script in workspace context
  if (workspaceBtnRun) {
    workspaceBtnRun.addEventListener('click', () => {
      const userCode = workspaceTextareaScript.value.trim();
      if (!userCode) {
        writeWorkspaceConsole(`[WARN] Script body is empty.\n`, 'warn');
        return;
      }

      const mode = workspaceSelectMode.value;
      const runnerCommand = workspaceInputRunner.value.trim();
      const attachCdp = workspaceAttachCdp.checked;
      const timeout = parseInt(workspaceInputTimeout.value, 10) || 30000;

      setWorkspaceStatus('Running', 'running');
      clearWorkspaceConsole();
      writeWorkspaceConsole(`[INFO] Preparing file and compiling in Workspace Context...\n`, 'info');

      const cdpUrl = cdpUrlInput.value.trim();
      vscode.postMessage({
        type: 'execute-workspace-script',
        userCode,
        mode,
        runnerCommand,
        attachCdp,
        cdpUrl,
        timeout
      });
    });
  }

  // Element Interaction card toggle listener
  if (interactToggleBtn) {
    interactToggleBtn.addEventListener('click', () => {
      if (interactionCard) {
        const isHidden = interactionCard.classList.contains('hidden');
        if (isHidden) {
          interactionCard.classList.remove('hidden');
          interactToggleBtn.classList.add('active');
          interactToggleBtn.textContent = 'Close';
        } else {
          interactionCard.classList.add('hidden');
          interactToggleBtn.classList.remove('active');
          interactToggleBtn.textContent = 'Interact';
        }
      }
    });
  }

  // Interaction tab switching logic
  const interactionTabButtons = document.querySelectorAll('.interaction-tab-btn');
  const interactionTabContents = document.querySelectorAll('.interaction-tab-content');

  if (interactionTabButtons.length > 0) {
    interactionTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        interactionTabButtons.forEach(b => b.classList.remove('active'));
        interactionTabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
          targetContent.classList.add('active');
        }
      });
    });
  }

  // Run Element Script execution listener
  const runIntScriptBtn = document.getElementById('int-btn-run-script');

  if (runIntScriptBtn && intTextareaScript) {
    runIntScriptBtn.addEventListener('click', () => {
      const userCode = intTextareaScript.value.trim();
      if (!userCode) {
        setInteractionStatus('Empty Script', 'error');
        return;
      }
      if (!isConnected || !activePageId) {
        setInteractionStatus('Disconnected', 'error');
        return;
      }

      activeScriptTarget = 'element';
      setInteractionStatus('Running', 'running');
      clearPageConsole();
      writePageConsole(`[INFO] Starting element script execution in sandbox...\n`, 'info');

      const locatorStr = locatorInput.value.trim();
      vscode.postMessage({
        type: 'execute-sandbox-code',
        locatorStr,
        userCode,
        timeout: 5000
      });
    });
  }

  // Link to Page Scripting tab navigation listener
  const linkToPageScripting = document.getElementById('link-to-page-scripting');
  if (linkToPageScripting) {
    linkToPageScripting.addEventListener('click', (e) => {
      e.preventDefault();
      const pageScriptTabBtn = document.querySelector('.main-tab-btn[data-tab="tab-page-script"]');
      if (pageScriptTabBtn) {
        pageScriptTabBtn.click();
      }
    });
  }

  // Workspace runner description and placeholder helper function
  function updateWorkspaceRunnerHelp() {
    if (!workspaceSelectMode || !workspaceRunnerDescription || !workspaceTextareaScript) return;
    const isPlaywright = workspaceSelectMode.value === 'playwright-test';
    const attachCdp = workspaceAttachCdp ? workspaceAttachCdp.checked : false;

    if (isPlaywright) {
      if (workspaceInsertBaseBtn) {
        workspaceInsertBaseBtn.textContent = 'Insert Test Spec';
      }
      if (attachCdp) {
        workspaceRunnerDescription.innerHTML = 'Runs inside the Playwright Test framework. The <code>page</code> fixture is automatically connected to your live tab (no launch boilerplate needed!). Supports imports, test fixtures, configuration, and assertions.';
      } else {
        workspaceRunnerDescription.innerHTML = 'Runs inside the Playwright Test framework in a clean browser session. Supports imports, test fixtures, configuration, and assertions.';
      }
      workspaceTextareaScript.placeholder = "import { test, expect } from '@playwright/test';\n\ntest('Run spec', async ({ page }) => {\n  await page.goto('https://github.com/');\n  console.log('Running test in workspace spec!');\n});";
    } else {
      if (workspaceInsertBaseBtn) {
        workspaceInsertBaseBtn.textContent = 'Insert TS Script';
      }
      if (attachCdp) {
        workspaceRunnerDescription.innerHTML = 'Runs as a plain Node/TypeScript script. Best for utility scripts. Exposes a global <code>page</code> variable automatically connected to your live browser tab. Imports of local modules and framework objects are fully supported.';
      } else {
        workspaceRunnerDescription.innerHTML = 'Runs as a plain Node/TypeScript script. <strong style="color: var(--color-warning);">Warning:</strong> Because "Attach to active browser (CDP)" is unchecked, the global <code>page</code> variable will <strong>not</strong> be defined. You must import and launch your own browser instance in your script. Local imports are supported.';
      }
      workspaceTextareaScript.placeholder = "// Plain Standalone TypeScript Script\n// Exposes global 'page' variable automatically when CDP is attached\nawait page.goto('https://github.com/');\nconsole.log('Page Title:', await page.title());";
    }
  }

  if (workspaceSelectMode) {
    workspaceSelectMode.addEventListener('change', updateWorkspaceRunnerHelp);
  }
  if (workspaceAttachCdp) {
    workspaceAttachCdp.addEventListener('change', updateWorkspaceRunnerHelp);
  }
  
  // Call initially to set correct state
  updateWorkspaceRunnerHelp();

  if (workspaceInsertBaseBtn && workspaceTextareaScript) {
    workspaceInsertBaseBtn.addEventListener('click', () => {
      if (workspaceSelectMode.value === 'playwright-test') {
        workspaceTextareaScript.value = `import { test, expect } from '@playwright/test';\n\ntest('Run spec', async ({ page }) => {\n  await page.goto('https://github.com/');\n  console.log('Running test in workspace spec!');\n});`;
      } else {
        workspaceTextareaScript.value = `// Plain Standalone TypeScript Script\n// Exposes global 'page' variable automatically when CDP is attached\nawait page.goto('https://github.com/');\nconsole.log('Page Title:', await page.title());`;
      }
    });
  }
  // Editor Bridge button listeners
  if (intScriptOpenEditorBtn && intTextareaScript) {
    intScriptOpenEditorBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'open-in-editor',
        editorId: 'element-script',
        content: intTextareaScript.value,
        mode: 'typescript'
      });
    });
  }

  if (pageScriptOpenEditorBtn && pageTextareaScript) {
    pageScriptOpenEditorBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'open-in-editor',
        editorId: 'browser-script',
        content: pageTextareaScript.value,
        mode: 'typescript'
      });
    });
  }

  if (workspaceScriptOpenEditorBtn && workspaceTextareaScript) {
    workspaceScriptOpenEditorBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'open-in-editor',
        editorId: 'workspace-script',
        content: workspaceTextareaScript.value,
        mode: workspaceSelectMode.value // 'playwright-test' or 'workspace-standalone'
      });
    });
  }

  // Expand/Collapse console output panels
  document.querySelectorAll('.console-expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const target = document.getElementById(targetId);
      if (target) {
        target.classList.toggle('expanded');
        btn.classList.toggle('expanded');
        btn.textContent = target.classList.contains('expanded') ? '⤡' : '⤢';
        // Scroll to bottom when expanding
        if (target.classList.contains('expanded')) {
          target.scrollTop = target.scrollHeight;
        }
      }
    });
  });

  // Request configuration upon initialization
  vscode.postMessage({ type: 'get-config' });
  updateConnectionOverlays();

})();

