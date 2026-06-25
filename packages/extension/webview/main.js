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
  const historyBtn = document.getElementById('history-btn');
  const historyDropdown = document.getElementById('history-dropdown');
  const autocompleteList = document.getElementById('autocomplete-list');

  let isConnected = false;
  let activePageId = '';
  let currentMatchIndex = 0;
  let totalMatchCount = 0;

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

  // Load locator into playground
  function loadLocator(val) {
    locatorInput.value = val;
    saveState(val);
    triggerLiveHighlight(val);
    evaluateBtn.disabled = val.trim().length === 0;
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
    if ((match = beforeCaret.match(getByRoleRegex))) {
      const typed = match[1].toLowerCase();
      const roles = autocompleteData.roles || [];
      currentSuggestions = roles
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
    let cursorOffset = 0;
    if (s.type === 'method') {
      newBeforeCaret = beforeCaret.replace(methodRegex, s.value);
      if (s.value.endsWith("('')")) {
        cursorOffset = -2; // Put cursor inside single quotes
      }
    } else {
      const match = beforeCaret.match(quoteRegex);
      if (match) {
        const lastQuoteIndex = beforeCaret.lastIndexOf(match[1]);
        newBeforeCaret = beforeCaret.substring(0, lastQuoteIndex) + s.value;
      }
    }
    
    locatorInput.value = newBeforeCaret + afterCaret;
    const newCaretPos = newBeforeCaret.length + cursorOffset;
    locatorInput.setSelectionRange(newCaretPos, newCaretPos);
    locatorInput.focus();
    
    autocompleteList.classList.add('hidden');
    currentSuggestions = [];
    activeSuggestionIndex = -1;
    
    triggerLiveHighlight(locatorInput.value);
    saveState(locatorInput.value);
    evaluateBtn.disabled = locatorInput.value.trim().length === 0;
  }

  // Event Listeners
  connectBtn.addEventListener('click', () => {
    const cdpUrl = cdpUrlInput.value.trim();
    if (!cdpUrl) return;
    
    showLoader('Connecting to browser CDP...');
    hideError();
    
    vscode.postMessage({
      type: 'connect-browser',
      cdpUrl: cdpUrl
    });
  });

  disconnectBtn.addEventListener('click', () => {
    vscode.postMessage({
      type: 'disconnect-browser'
    });
  });

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
    evaluateBtn.disabled = true;
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
    if (currentMatchIndex > 0) {
      currentMatchIndex--;
      navIndex.textContent = `${currentMatchIndex + 1}/${totalMatchCount}`;
      prevBtn.disabled = currentMatchIndex === 0;
      nextBtn.disabled = currentMatchIndex === totalMatchCount - 1;
      triggerLiveHighlight(locatorInput.value, currentMatchIndex);
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentMatchIndex < totalMatchCount - 1) {
      currentMatchIndex++;
      navIndex.textContent = `${currentMatchIndex + 1}/${totalMatchCount}`;
      prevBtn.disabled = currentMatchIndex === 0;
      nextBtn.disabled = currentMatchIndex === totalMatchCount - 1;
      triggerLiveHighlight(locatorInput.value, currentMatchIndex);
    }
  });

  let saveStateTimeout;
  locatorInput.addEventListener('input', () => {
    const hasValue = locatorInput.value.trim().length > 0;
    evaluateBtn.disabled = !isConnected || !hasValue;
    
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
      evaluateBtn.disabled = previous.trim().length === 0;
    }
  });

  redoBtn.addEventListener('click', () => {
    if (redoStack.length > 0) {
      const next = redoStack.pop();
      undoStack.push(next);
      locatorInput.value = next;
      updateUndoRedoButtons();
      triggerLiveHighlight(next);
      evaluateBtn.disabled = next.trim().length === 0;
    }
  });

  historyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    historyDropdown.classList.toggle('hidden');
    renderHistoryDropdown();
  });

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
      case 'connect-status': {
        hideLoader();
        if (message.connected) {
          isConnected = true;
          activePageId = message.activePageId;
          
          connectionIndicator.textContent = 'Connected';
          connectionIndicator.className = 'status-indicator connected';
          
          connectionInputsGroup.classList.add('hidden');
          connectedInfo.classList.remove('hidden');
          
          // Populate tab select dropdown (exclude DevTools pages)
          tabSelect.innerHTML = '';
          const visiblePages = message.pages.filter(page => {
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
            const displayUrl = page.url.length > 35 ? page.url.substring(0, 32) + '...' : page.url;
            opt.textContent = (page.title || 'Untitled') + ' — ' + displayUrl;
            if (page.id === activePageId) {
              opt.selected = true;
            }
            tabSelect.appendChild(opt);
          });
          // If the active page was a devtools page, pick first visible page instead
          if (visiblePages.length > 0 && !visiblePages.find(p => p.id === activePageId)) {
            activePageId = visiblePages[0].id;
            tabSelect.value = activePageId;
            vscode.postMessage({ type: 'select-page', pageId: activePageId });
          }

          evaluateBtn.disabled = locatorInput.value.trim().length === 0;
          clearHlBtn.disabled = false;
          
          // Fetch autocomplete metadata from page
          requestAutocompleteData();

          // Show Phase 7 & 8 cards now that we're connected
          updateStabilityCardVisibility();
          updateFormScannerVisibility();
        } else {
          isConnected = false;
          activePageId = '';
          
          connectionIndicator.textContent = 'Disconnected';
          connectionIndicator.className = 'status-indicator disconnected';
          
          connectionInputsGroup.classList.remove('hidden');
          connectedInfo.classList.add('hidden');
          
          evaluateBtn.disabled = true;
          clearHlBtn.disabled = true;
          resultsPanel.classList.add('hidden');

          // Hide Phase 7 & 8 cards on disconnect
          updateStabilityCardVisibility();
          updateFormScannerVisibility();

          if (message.error) {
            showError('Connection Failed', 'Could not connect to browser CDP. Make sure Chrome/Chromium is running with --remote-debugging-port=9222. Details: ' + message.error);
          }
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
    }
  });

  function renderResults(res) {
    resultsPanel.classList.remove('hidden');
    
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
      prevBtn.disabled = true;
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
    elementsListContainer.innerHTML = '';
    if (res.elements && res.elements.length > 0) {
      document.getElementById('details-card').classList.remove('hidden');
      res.elements.forEach((el, index) => {
        const item = document.createElement('div');
        item.className = 'element-meta-item';
        
        const header = document.createElement('div');
        header.className = 'meta-header';
        header.textContent = `Element #${index + 1} <${el.tagName.toLowerCase()}>`;
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
      });
    } else {
      document.getElementById('details-card').classList.add('hidden');
    }

    // 5. Alternatives Card
    alternativesList.innerHTML = '';
    if (res.alternatives && res.alternatives.length > 0) {
      document.getElementById('alternatives-card').classList.remove('hidden');
      res.alternatives.forEach(alt => {
        alternativesList.appendChild(createAlternativeItem(alt));
      });
    } else {
      document.getElementById('alternatives-card').classList.add('hidden');
    }
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
      evaluateBtn.disabled = false;
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
      evaluateBtn.disabled = false;
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
    if (isConnected) {
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
  // Phase 8 — Form Scanner
  // ─────────────────────────────────────────────────────────────
  const formScannerCard = document.getElementById('form-scanner-card');
  const scanFormsBtn = document.getElementById('scan-forms-btn');
  const formScanLoader = document.getElementById('form-scan-loader');
  const formTreeContainer = document.getElementById('form-tree-container');
  const formCountBadge = document.getElementById('form-count-badge');
  const copyFormLocatorsBtn = document.getElementById('copy-form-locators-btn');

  // Track last scanned forms for Copy All
  let lastScannedForms = [];

  copyFormLocatorsBtn.addEventListener('click', () => {
    if (!lastScannedForms.length) return;
    const lines = [];
    lastScannedForms.forEach((form, i) => {
      const formLabel = form.formName || form.formId || ('Form #' + (i + 1));
      lines.push(`// ${formLabel}`);
      const allFields = [
        ...form.sections.flatMap(s => s.fields),
        ...form.ungroupedFields
      ];
      allFields.forEach(f => {
        if (f.suggestedLocator) {
          lines.push(`page.${f.suggestedLocator}  // ${f.label || f.placeholder || f.tagName}`);
        }
      });
      lines.push('');
    });
    const text = lines.join('\n').trim();
    navigator.clipboard.writeText(text).then(() => {
      const orig = copyFormLocatorsBtn.innerHTML;
      copyFormLocatorsBtn.innerHTML = '✓ Copied!';
      setTimeout(() => { copyFormLocatorsBtn.innerHTML = orig; }, 1800);
    });
  });

  function updateFormScannerVisibility() {
    if (isConnected) {
      formScannerCard.classList.remove('hidden');
      scanFormsBtn.disabled = false;
    } else {
      formScannerCard.classList.add('hidden');
    }
  }

  scanFormsBtn.addEventListener('click', () => {
    if (!activePageId) return;
    formScanLoader.classList.remove('hidden');
    formTreeContainer.classList.add('hidden');
    scanFormsBtn.disabled = true;
    vscode.postMessage({ type: 'scan-forms', pageId: activePageId });
  });

  // #7 — Suggest a common/shared locator across all form fields
  function suggestCommonLocator(forms) {
    if (!forms || forms.length === 0) return null;

    // Collect all suggestedLocators
    const allLocators = [];
    forms.forEach(form => {
      form.sections.forEach(s => s.fields.forEach(f => { if (f.suggestedLocator) allLocators.push(f.suggestedLocator); }));
      form.ungroupedFields.forEach(f => { if (f.suggestedLocator) allLocators.push(f.suggestedLocator); });
    });

    if (allLocators.length === 0) return null;

    // Count how many use each Playwright method type
    const methodCounts = {};
    allLocators.forEach(loc => {
      const match = loc.match(/^(getByLabel|getByPlaceholder|getByRole|locator|getByTestId)/);
      if (match) {
        methodCounts[match[1]] = (methodCounts[match[1]] || 0) + 1;
      }
    });

    const bestMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0];
    if (!bestMethod) return null;

    const [method, count] = bestMethod;
    const pct = Math.round((count / allLocators.length) * 100);
    return { method, count, total: allLocators.length, pct };
  }

  function renderFormTree(forms) {
    formScanLoader.classList.add('hidden');
    scanFormsBtn.disabled = false;
    formTreeContainer.innerHTML = '';
    formTreeContainer.classList.remove('hidden');
    lastScannedForms = forms || [];

    if (!forms || forms.length === 0) {
      formCountBadge.textContent = '0 forms';
      copyFormLocatorsBtn.classList.add('hidden');
      const empty = document.createElement('div');
      empty.className = 'form-empty-state';
      empty.textContent = 'No forms detected on this page.';
      formTreeContainer.appendChild(empty);
      return;
    }

    formCountBadge.textContent = forms.length + ' form' + (forms.length !== 1 ? 's' : '');

    // Render common locator suggestion banner
    const commonSuggestion = suggestCommonLocator(forms);
    if (commonSuggestion) {
      const banner = document.createElement('div');
      banner.className = 'form-common-locator-banner';
      banner.innerHTML = `
        <span class="form-common-icon">💡</span>
        <span class="form-common-text">
          Most fields (<strong>${commonSuggestion.count}/${commonSuggestion.total}</strong>, ${commonSuggestion.pct}%) can be located using
          <code>${commonSuggestion.method}()</code> — prioritize this method for robust selectors.
        </span>
      `;
      formTreeContainer.appendChild(banner);
    }

    // Show Copy All button if any fields exist
    const hasAnyFields = forms.some(f =>
      f.sections.some(s => s.fields.length > 0) || f.ungroupedFields.length > 0
    );
    copyFormLocatorsBtn.classList.toggle('hidden', !hasAnyFields);

    forms.forEach((form, idx) => {
      const block = document.createElement('div');
      block.className = 'form-block';

      // Header
      const header = document.createElement('div');
      header.className = 'form-block-header';

      const title = document.createElement('div');
      title.className = 'form-block-title';
      const formLabel = form.formName || form.formId || ('Form #' + (idx + 1));
      title.textContent = '📋 ' + formLabel;
      if (form.action) {
        const actionSpan = document.createElement('span');
        actionSpan.style.color = 'var(--text-muted)';
        actionSpan.style.fontWeight = '400';
        actionSpan.textContent = form.action.length > 30 ? form.action.slice(0, 28) + '…' : form.action;
        title.appendChild(actionSpan);
      }

      const toggle = document.createElement('span');
      toggle.className = 'form-block-toggle open';
      toggle.textContent = '▶';

      header.appendChild(title);
      header.appendChild(toggle);

      const body = document.createElement('div');
      body.className = 'form-block-body';

      // Render sections
      form.sections.forEach(section => {
        const sectionBlock = document.createElement('div');
        sectionBlock.className = 'form-section-block';

        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'form-section-title';
        sectionTitle.textContent = section.title;

        const fieldsList = document.createElement('div');
        fieldsList.className = 'form-fields-list';

        section.fields.forEach(field => {
          fieldsList.appendChild(createFormFieldRow(field));
        });

        sectionBlock.appendChild(sectionTitle);
        sectionBlock.appendChild(fieldsList);
        body.appendChild(sectionBlock);
      });

      // Ungrouped fields
      if (form.ungroupedFields.length > 0) {
        const ungroupedTitle = document.createElement('div');
        ungroupedTitle.className = 'form-section-title';
        ungroupedTitle.textContent = 'Fields';
        const fieldsList = document.createElement('div');
        fieldsList.className = 'form-fields-list';
        form.ungroupedFields.forEach(field => {
          fieldsList.appendChild(createFormFieldRow(field));
        });
        const wrapper = document.createElement('div');
        wrapper.className = 'form-section-block';
        wrapper.appendChild(ungroupedTitle);
        wrapper.appendChild(fieldsList);
        body.appendChild(wrapper);
      }

      if (form.sections.length === 0 && form.ungroupedFields.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'form-empty-state';
        empty.textContent = 'No visible fields detected.';
        body.appendChild(empty);
      }

      // Toggle collapse
      header.addEventListener('click', () => {
        const isOpen = !body.classList.contains('hidden');
        if (isOpen) {
          body.classList.add('hidden');
          toggle.classList.remove('open');
        } else {
          body.classList.remove('hidden');
          toggle.classList.add('open');
        }
      });

      block.appendChild(header);
      block.appendChild(body);
      formTreeContainer.appendChild(block);
    });
  }

  function createFormFieldRow(field) {
    const row = document.createElement('div');
    row.className = 'form-field-row';

    const info = document.createElement('div');
    info.className = 'form-field-info';

    const labelEl = document.createElement('div');
    labelEl.className = 'form-field-label' + (field.label ? '' : ' no-label');
    labelEl.textContent = field.label || '(no label)';
    labelEl.title = field.label || '';

    const meta = document.createElement('div');
    meta.className = 'form-field-meta';

    // Tag + type badge
    const tagSpan = document.createElement('span');
    tagSpan.textContent = '<' + field.tagName + (field.inputType && field.inputType !== 'text' ? ' type=' + field.inputType : '') + '>';
    meta.appendChild(tagSpan);

    if (field.role && field.role !== 'generic') {
      const roleSpan = document.createElement('span');
      roleSpan.textContent = field.role;
      meta.appendChild(roleSpan);
    }

    if (field.required) {
      const reqSpan = document.createElement('span');
      reqSpan.className = 'form-field-required';
      reqSpan.textContent = '* required';
      meta.appendChild(reqSpan);
    }

    if (field.isReadOnly) {
      const roSpan = document.createElement('span');
      roSpan.className = 'form-field-readonly';
      roSpan.textContent = '🔒 readonly';
      meta.appendChild(roSpan);
    }

    // Suggested locator preview
    const locatorPreview = document.createElement('div');
    locatorPreview.className = 'form-field-locator-preview';
    locatorPreview.textContent = field.suggestedLocator;
    locatorPreview.title = 'Click "Use" to load this locator into the playground';

    info.appendChild(labelEl);
    info.appendChild(meta);
    info.appendChild(locatorPreview);

    const useBtn = document.createElement('button');
    useBtn.className = 'form-field-use-btn';
    useBtn.title = 'Load ' + field.suggestedLocator + ' into Locator Playground';
    useBtn.innerHTML = '▶ Use';
    useBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      locatorInput.value = field.suggestedLocator;
      evaluateBtn.disabled = false;
      saveState(field.suggestedLocator);
      triggerEvaluation();
    });

    row.appendChild(info);
    row.appendChild(useBtn);
    return row;
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

      case 'form-scan-result':
        renderFormTree(message.forms || []);
        break;
    }
  });

  // Patch connect-status receiver: show/hide new cards on connect/disconnect
  // We do this by observing the isConnected variable changes indirectly
  // via a MutationObserver on the connection status indicator
  const connectionObserver = new MutationObserver(() => {
    updateStabilityCardVisibility();
    updateFormScannerVisibility();
  });
  connectionObserver.observe(connectionIndicator, { childList: true, characterData: true, subtree: true, attributes: true });

  // Also call on load in case already connected
  updateStabilityCardVisibility();
  updateFormScannerVisibility();

  // Update stability test button enable state when locator changes
  locatorInput.addEventListener('input', () => {
    stabilityTestBtn.disabled = !isConnected || locatorInput.value.trim().length === 0;
  });

  // After evaluation results come in, trigger chain analysis if .or() detected
  // (Chain analysis is triggered inline in the evaluation-result handler)

})();

