export const AGENT_SCRIPT = `
(function() {
  if (window.__locatorLensAgent) return;

  const styleId = '__locator_lens_styles';
  if (!document.getElementById(styleId)) {
    try {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = \`
        .__locator_lens_overlay {
          position: fixed;
          pointer-events: none;
          z-index: 2147483647;
          box-sizing: border-box;
          border-radius: 4px;
          transition: all 0.15s ease-out;
          box-shadow: 0 0 8px rgba(0, 0, 0, 0.15);
        }
        .__locator_lens_tooltip {
          position: absolute;
          top: -24px;
          left: 0;
          background: #1e293b;
          color: #f8fafc;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 3px;
          white-space: nowrap;
          pointer-events: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .__locator_lens_pulse {
          animation: __locator_lens_pulse_anim 1.5s infinite ease-in-out;
        }
        @keyframes __locator_lens_pulse_anim {
          0% { opacity: 0.8; }
          50% { opacity: 0.4; }
          100% { opacity: 0.8; }
        }
      \`;
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {
      console.warn('Failed to inject style elements:', e);
    }
  }

  const overlays = [];
  let trackedElements = [];
  let trackingTimer = null;

  function clearOverlays() {
    overlays.forEach(o => o.div.remove());
    overlays.length = 0;
    trackedElements = [];
    if (trackingTimer) {
      clearInterval(trackingTimer);
      trackingTimer = null;
    }
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition);
  }

  function reposition() {
    overlays.forEach(o => {
      if (!o.element || !o.element.isConnected) {
        o.div.style.display = 'none';
        return;
      }
      const rect = o.element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        o.div.style.display = 'none';
        return;
      }
      o.div.style.display = 'block';
      o.div.style.left = rect.left + 'px';
      o.div.style.top = rect.top + 'px';
      o.div.style.width = rect.width + 'px';
      o.div.style.height = rect.height + 'px';
    });
  }

  function startTracking() {
    if (trackingTimer) return;
    trackingTimer = setInterval(reposition, 100);
    window.addEventListener('resize', reposition, { passive: true });
    window.addEventListener('scroll', reposition, { passive: true });
  }

  const tagToRoleMap = {
    'button': 'button',
    'a': 'link',
    'input': 'textbox',
    'textarea': 'textbox',
    'select': 'combobox',
    'h1': 'heading',
    'h2': 'heading',
    'h3': 'heading',
    'h4': 'heading',
    'h5': 'heading',
    'h6': 'heading',
    'img': 'img',
    'form': 'form',
    'table': 'table',
    'ul': 'list',
    'ol': 'list',
    'li': 'listitem'
  };

  function getElementRole(el) {
    if (el.getAttribute('role')) return el.getAttribute('role');
    const tagName = el.tagName.toLowerCase();
    if (tagName === 'input') {
      const type = el.getAttribute('type');
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'submit' || type === 'button') return 'button';
      if (type === 'number') return 'spinbutton';
    }
    return tagToRoleMap[tagName] || 'generic';
  }

  function getCleanText(el) {
    if (!el) return '';
    if (el.nodeType === 3) { // Node.TEXT_NODE
      return el.nodeValue || '';
    }
    if (el.nodeType === 1) { // Node.ELEMENT_NODE
      const tagName = el.tagName.toLowerCase();
      if (tagName === 'style' || tagName === 'script' || tagName === 'template') {
        return '';
      }
      let text = '';
      for (let i = 0; i < el.childNodes.length; i++) {
        text += getCleanText(el.childNodes[i]);
      }
      return text;
    }
    return '';
  }

  function getAccessibleName(el) {
    let name = '';
    if (el.hasAttribute('aria-label')) {
      name = el.getAttribute('aria-label') || '';
    } else if (el.hasAttribute('aria-labelledby')) {
      const ids = (el.getAttribute('aria-labelledby') || '').split(/\\s+/);
      const labels = ids.map(id => {
        const target = document.getElementById(id);
        return target ? getCleanText(target) : '';
      }).filter(Boolean);
      name = labels.join(' ');
    } else {
      if (el.id) {
        const labels = document.querySelectorAll('label[for="' + el.id + '"]');
        if (labels.length > 0) {
          name = Array.from(labels).map(l => getCleanText(l)).join(' ');
        }
      }
      if (!name.trim()) {
        const parentLabel = el.closest('label');
        if (parentLabel) {
          name = getCleanText(parentLabel);
        }
      }
      if (!name.trim()) {
        name = el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('title') || '';
      }
      if (!name.trim() && ['button', 'a', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(el.tagName.toLowerCase())) {
        name = getCleanText(el);
      }
    }
    return name.replace(/\\s+/g, ' ').trim();
  }

  function isDynamicId(id) {
    if (!id) return true;
    // Common generated ID patterns (e.g. mui-123, grid-a12, random numbers/hashes)
    if (/^[0-9]+$/.test(id)) return true;
    if (/(mui|ag-|grid-|ng-|val-|id-|ember|k-|dx-)/i.test(id)) return true;
    if (/[0-9]{4,}/.test(id)) return true; // Long numbers
    if (/[a-f0-9]{8}-[a-f0-9]{4}/i.test(id)) return true; // UUID-like
    return false;
  }

  function isFragileName(str) {
    if (!str) return false;
    if (str.length > 60) return true;
    const cssPatterns = [
      /:where\\(/i,
      /--[a-zA-Z0-9_-]/,
      /\{/,
      /\}/,
      /var\\(/i,
      /calc\\(/i,
      /rgba?\\(/i,
      /color-mix\\(/i,
      /;/,
    ];
    return cssPatterns.some(pattern => pattern.test(str));
  }

  function cleanAccessibleName(str) {
    if (!str) return '';
    let cleaned = str;
    const indexWhere = str.toLowerCase().indexOf(':where(');
    if (indexWhere !== -1) {
      cleaned = cleaned.slice(0, indexWhere);
    }
    const indexBrace = str.indexOf('{');
    if (indexBrace !== -1) {
      cleaned = cleaned.slice(0, indexBrace);
    }
    const indexVar = str.toLowerCase().indexOf('var(');
    if (indexVar !== -1) {
      cleaned = cleaned.slice(0, indexVar);
    }
    cleaned = cleaned.trim();
    return cleaned.replace(/[\\s,;]+$/, '');
  }

  function getCssPath(el) {
    if (!(el instanceof Element)) return '';
    const path = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();
      if (current.id && !isDynamicId(current.id)) {
        selector += '#' + current.id;
        path.unshift(selector);
        break; // Stop at stable ID
      } else {
        let sibling = current;
        let nth = 1;
        while (sibling = sibling.previousElementSibling) {
          if (sibling.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth > 1) {
          selector += ':nth-of-type(' + nth + ')';
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  function getGraphicsMeta(el) {
    if (!el) return null;
    const tagName = el.tagName.toLowerCase();
    if (tagName !== 'svg' && tagName !== 'canvas') return null;

    const rect = el.getBoundingClientRect();
    const parentRect = el.offsetParent ? el.offsetParent.getBoundingClientRect() : rect;
    const centerClickPoint = {
      x: Math.round(rect.left + window.scrollX + rect.width / 2),
      y: Math.round(rect.top + window.scrollY + rect.height / 2)
    };
    const boundingOffsets = {
      left: Math.round(rect.left - parentRect.left),
      top: Math.round(rect.top - parentRect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };

    let subElements = [];
    if (tagName === 'svg') {
      const shapes = Array.from(el.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon, text, g'));
      subElements = shapes.map(child => {
        const childRect = child.getBoundingClientRect();
        return {
          tagName: child.tagName,
          id: child.id || undefined,
          className: (child.className && typeof child.className === 'object') ? child.className.baseVal : (child.className || undefined),
          relativeBox: {
            x: Math.round(childRect.left - rect.left),
            y: Math.round(childRect.top - rect.top),
            width: Math.round(childRect.width),
            height: Math.round(childRect.height)
          }
        };
      }).filter(s => s.relativeBox.width > 0 && s.relativeBox.height > 0);
    }

    return {
      centerClickPoint,
      boundingOffsets,
      subElements: subElements.slice(0, 10)
    };
  }

  window.__locatorLensAgent = {
    getCleanText,
    highlight(elements, type, scrollIndex) {
      clearOverlays();
      trackedElements = elements;

      let borderColor = '#22c55e';
      let bgColor = 'rgba(34, 197, 94, 0.1)';
      let labelPrefix = '✓';

      if (type === 'warning') {
        borderColor = '#eab308';
        bgColor = 'rgba(234, 179, 8, 0.1)';
        labelPrefix = '⚠';
      } else if (type === 'failure') {
        borderColor = '#ef4444';
        bgColor = 'rgba(239, 68, 68, 0.1)';
        labelPrefix = '✗';
      }

      const indexToScroll = (typeof scrollIndex === 'number') ? scrollIndex : 0;

      elements.forEach((el, index) => {
        if (!(el instanceof Element)) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const div = document.createElement('div');
        div.className = '__locator_lens_overlay __locator_lens_pulse';
        div.style.left = rect.left + 'px';
        div.style.top = rect.top + 'px';
        div.style.width = rect.width + 'px';
        div.style.height = rect.height + 'px';
        div.style.border = (index === indexToScroll ? '4px' : '2px') + ' solid ' + borderColor;
        div.style.backgroundColor = bgColor;
        if (index === indexToScroll) {
          div.style.boxShadow = '0 0 16px ' + borderColor;
        }

        const tooltip = document.createElement('div');
        tooltip.className = '__locator_lens_tooltip';
        if (index === indexToScroll) {
          tooltip.style.transform = 'scale(1.1)';
          tooltip.style.transformOrigin = 'left bottom';
        }
        
        const role = getElementRole(el);
        const name = getAccessibleName(el);
        let label = labelPrefix + ' [' + (index + 1) + '] ' + el.tagName.toLowerCase();
        if (role && role !== 'generic') label += ' [role=' + role + ']';
        if (name) label += ' "' + (name.length > 20 ? name.slice(0, 17) + '...' : name) + '"';
        
        tooltip.textContent = label;
        div.appendChild(tooltip);

        (document.body || document.documentElement).appendChild(div);
        overlays.push({ div, element: el });
      });

      if (elements.length > 0) {
        const targetEl = elements[indexToScroll];
        if (targetEl && targetEl instanceof Element) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      startTracking();
    },

    clear() {
      clearOverlays();
    },

    getElementInfo(el) {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const tagName = el.tagName.toLowerCase();
      let meta = {};
      if (tagName === 'svg' || tagName === 'canvas') {
        meta = getGraphicsMeta(el) || {};
      }
      return {
        role: getElementRole(el),
        accessibleName: getAccessibleName(el),
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        visible: rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none',
        enabled: !el.disabled,
        editable: !el.readOnly,
        boundingBox: {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height
        },
        meta
      };
    },

    generateAlternatives(el) {
      if (!el) return [];
      const alternatives = [];
      const role = getElementRole(el);
      const name = getAccessibleName(el);

      // 1. Test ID (Highest priority/confidence)
      const testIdAttrs = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
      for (const attr of testIdAttrs) {
        if (el.hasAttribute(attr)) {
          alternatives.push({
            selector: "getByTestId('" + el.getAttribute(attr) + "')",
            type: 'getByTestId',
            confidence: 98,
            reason: 'Uses stable test ID attribute (' + attr + ').'
          });
        }
      }

      // 2. getByLabel (Form inputs)
      let labelText = '';
      if (el.id) {
        const label = document.querySelector('label[for="' + el.id + '"]');
        if (label) labelText = label.textContent?.trim();
      }
      if (!labelText) {
        const parentLabel = el.closest('label');
        if (parentLabel) labelText = parentLabel.textContent?.trim();
      }
      if (labelText) {
        alternatives.push({
          selector: "getByLabel('" + labelText.replace(/\\s+/g, ' ') + "')",
          type: 'getByLabel',
          confidence: 95,
          reason: 'Uses associated label text, standard form practice.'
        });
      }

      // 3. getByRole
      if (role && role !== 'generic') {
        if (name) {
          if (isFragileName(name)) {
            const cleaned = cleanAccessibleName(name);
            if (cleaned && !isFragileName(cleaned)) {
              const bs = String.fromCharCode(92);
              const dbs = String.fromCharCode(92, 92);
              let escaped = cleaned.split(bs).join(dbs);
              ['-', '/', '^', '$', '*', '+', '?', '.', '(', ')', '|', '[', ']', '{', '}'].forEach(c => {
                escaped = escaped.split(c).join(bs + c);
              });
              alternatives.push({
                selector: "getByRole('" + role + "', { name: /" + escaped + "/i })",
                type: 'getByRole',
                confidence: 80,
                reason: 'Semantic query matching role and cleaned partial accessible name.'
              });
            }
            alternatives.push({
              selector: "getByRole('" + role + "')",
              type: 'getByRole',
              confidence: 70,
              reason: 'Semantic query matching role (omitting fragile accessible name).'
            });
          } else {
            alternatives.push({
              selector: "getByRole('" + role + "', { name: '" + name.replace(/'/g, "\\\\'") + "' })",
              type: 'getByRole',
              confidence: 92,
              reason: 'Semantic query matching role and accessible name.'
            });
          }
        } else {
          alternatives.push({
            selector: "getByRole('" + role + "')",
            type: 'getByRole',
            confidence: 75,
            reason: 'Semantic query matching role without name filter.'
          });
        }
      }

      // 4. getByPlaceholder
      if (el.hasAttribute('placeholder')) {
        alternatives.push({
          selector: "getByPlaceholder('" + el.getAttribute('placeholder') + "')",
          type: 'getByPlaceholder',
          confidence: 85,
          reason: 'Direct match on placeholder text.'
        });
      }

      // 5. getByText (Buttons, Headings, Links, Labels)
      if (name && ['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label'].includes(el.tagName.toLowerCase()) && name.length < 40 && !isFragileName(name)) {
        alternatives.push({
          selector: "getByText('" + name.replace(/'/g, "\\\\'") + "')",
          type: 'getByText',
          confidence: 80,
          reason: 'Matches text content for interactive/heading/label elements.'
        });
      }

      // 6. getByAltText
      if (el.hasAttribute('alt')) {
        alternatives.push({
          selector: "getByAltText('" + el.getAttribute('alt') + "')",
          type: 'getByAltText',
          confidence: 85,
          reason: 'Image alternative text attribute.'
        });
      }

      // 7. Stable ID selector
      if (el.id && !isDynamicId(el.id)) {
        alternatives.push({
          selector: "locator('#" + el.id + "')",
          type: 'locator',
          confidence: 85,
          reason: 'Direct match on stable element ID.'
        });
      }

      // 8. Class/Structure path (Lowest confidence)
      const cssPath = getCssPath(el);
      if (cssPath) {
        alternatives.push({
          selector: "locator('" + cssPath + "')",
          type: 'locator',
          confidence: 40,
          reason: 'Structural CSS path (less stable across layouts).'
        });
      }

      return alternatives.sort((a, b) => b.confidence - a.confidence);
    },

    getAutocompleteData() {
      const roles = new Set();
      const testIds = new Set();
      const placeholders = new Set();
      const labels = new Set();
      const texts = new Set();

      const elements = document.querySelectorAll('*');
      elements.forEach(el => {
        const role = getElementRole(el);
        if (role && role !== 'generic') {
          roles.add(role);
        }

        const testIdAttrs = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
        testIdAttrs.forEach(attr => {
          if (el.hasAttribute(attr)) {
            const val = el.getAttribute(attr);
            if (val) testIds.add(val);
          }
        });

        if (el.hasAttribute('placeholder')) {
          const val = el.getAttribute('placeholder');
          if (val) placeholders.add(val);
        }

        if (el.tagName.toLowerCase() === 'label') {
          const val = getCleanText(el).trim();
          if (val && !isFragileName(val)) labels.add(val);
        }

        const tagName = el.tagName.toLowerCase();
        if (['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          const val = getCleanText(el).trim();
          if (val && val.length < 40 && !isFragileName(val)) {
            texts.add(val);
          }
        }
      });

      return {
        roles: Array.from(roles),
        testIds: Array.from(testIds),
        placeholders: Array.from(placeholders),
        labels: Array.from(labels),
        texts: Array.from(texts)
      };
    },

    simulateFill(el, value) {
      if (!el) return false;
      
      // Focus element
      el.focus();
      
      const tagName = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      
      // 1. Text Inputs / Textareas / contenteditable / textboxes
      if (tagName === 'input' || tagName === 'textarea' || el.hasAttribute('contenteditable') || role === 'textbox') {
        const isContentEditable = el.hasAttribute('contenteditable') || el.contentEditable === 'true';
        
        if (!isContentEditable) {
          el.value = '';
        } else {
          el.innerHTML = '';
        }
        
        for (let i = 0; i < value.length; i++) {
          const char = value[i];
          const keyOpts = { key: char, keyCode: char.charCodeAt(0), bubbles: true, cancelable: true };
          
          el.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
          el.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
          
          if (!isContentEditable) {
            el.value += char;
          } else {
            const textNode = document.createTextNode(char);
            el.appendChild(textNode);
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(el);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
          
          el.dispatchEvent(new InputEvent('input', { data: char, bubbles: true, cancelable: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
        }
        
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        return true;
      }
      
      // 2. Select lists
      if (tagName === 'select') {
        const options = Array.from(el.options);
        const match = options.find(o => o.value === value || o.text.trim().toLowerCase().includes(value.toLowerCase()));
        if (match) {
          el.value = match.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }
      
      // 3. Custom comboboxes / dropdowns
      if (role === 'combobox' || el.classList.contains('select2') || el.classList.contains('choices')) {
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        
        el.dispatchEvent(new MouseEvent('mousedown', { clientX, clientY, bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY, bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { clientX, clientY, bubbles: true, cancelable: true }));
        
        setTimeout(() => {
          const activeInput = document.activeElement;
          if (activeInput && activeInput !== el) {
            this.simulateFill(activeInput, value);
          }
        }, 50);
        return true;
      }
      
      // 4. General Fallback
      try {
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        
        el.dispatchEvent(new MouseEvent('mousedown', { clientX, clientY, bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY, bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { clientX, clientY, bubbles: true, cancelable: true }));
        
        if (value) {
          el.textContent = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    simulateClick(el, x, y) {
      if (!el) return false;
      try {
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + (x !== undefined && x !== null ? Number(x) : rect.width / 2);
        const clientY = rect.top + (y !== undefined && y !== null ? Number(y) : rect.height / 2);
        
        el.dispatchEvent(new MouseEvent('mouseenter', { clientX, clientY, bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { clientX, clientY, bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY, bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { clientX, clientY, bubbles: true, cancelable: true }));
        return true;
      } catch (e) {
        return false;
      }
    },

    // Phase 8 — Form-Aware Analysis
    scanForms() {
      const FIELD_TAGS = ['input', 'select', 'textarea'];
      const SKIP_INPUT_TYPES = ['hidden', 'submit', 'reset', 'button', 'image'];

      // Improved section title detection
      function getSectionTitle(sectionEl) {
        const tag = sectionEl.tagName.toLowerCase();

        // 1. <legend> inside <fieldset>
        if (tag === 'fieldset') {
          const legend = sectionEl.querySelector('legend');
          if (legend) {
            const t = getCleanText(legend).trim();
            if (t) return t;
          }
        }

        // 2. aria-labelledby
        const labelledBy = sectionEl.getAttribute('aria-labelledby');
        if (labelledBy) {
          const ids = labelledBy.split(/\\s+/);
          const parts = ids.map(id => {
            const target = document.getElementById(id);
            return target ? getCleanText(target).trim() : '';
          }).filter(Boolean);
          if (parts.length > 0) return parts.join(' ');
        }

        // 3. aria-label
        const ariaLabel = sectionEl.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

        // 4. data-label or data-title attribute
        const dataLabel = sectionEl.getAttribute('data-label') || sectionEl.getAttribute('data-title');
        if (dataLabel && dataLabel.trim()) return dataLabel.trim();

        // 5. First heading (h1-h6) inside the section
        const heading = sectionEl.querySelector('h1,h2,h3,h4,h5,h6');
        if (heading) {
          const t = getCleanText(heading).trim();
          if (t && t.length < 80) return t;
        }

        // 6. Preceding sibling heading (immediately before this section in the DOM)
        let prev = sectionEl.previousElementSibling;
        while (prev) {
          const prevTag = prev.tagName.toLowerCase();
          if (/^h[1-6]$/.test(prevTag)) {
            const t = getCleanText(prev).trim();
            if (t && t.length < 80) return t;
            break;
          }
          // Stop if prev sibling is another form element (it's not the heading for this section)
          if (['form', 'fieldset', 'section', 'div'].includes(prevTag)) {
            const innerHeading = prev.querySelector('h1,h2,h3,h4,h5,h6');
            if (!innerHeading) break; // no heading in sibling block, give up
            break;
          }
          prev = prev.previousElementSibling;
        }

        // 7. id-based fallback
        if (sectionEl.id) return sectionEl.id;

        // 8. Generic fallback
        return tag === 'fieldset' ? 'Fieldset' : '';
      }

      function buildField(el) {
        const tag = el.tagName.toLowerCase();
        const inputType = el.getAttribute('type') || undefined;
        if (tag === 'input' && SKIP_INPUT_TYPES.includes(inputType || '')) return null;

        const role = getElementRole(el);
        const rawLabel = getAccessibleName(el);
        const label = rawLabel ? cleanAccessibleName(rawLabel) : '';
        const id = el.id || undefined;
        const name = el.getAttribute('name') || undefined;
        const placeholder = el.getAttribute('placeholder') || undefined;
        const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
        const isReadOnly = el.hasAttribute('readonly') || el.getAttribute('aria-readonly') === 'true';

        // Build the best suggested locator — prefer semantic, human-readable selectors
        let suggestedLocator = '';

        if (label && !isFragileName(label)) {
          // Best: getByLabel (most stable for form fields)
          suggestedLocator = "getByLabel('" + label.replace(/'/g, "\\\\'") + "')";
        } else if (placeholder && !isFragileName(placeholder)) {
          // Good: getByPlaceholder
          suggestedLocator = "getByPlaceholder('" + placeholder.replace(/'/g, "\\\\'") + "')";
        } else if (role && role !== 'generic') {
          // Use getByRole with accessible name if available
          const accName = getAccessibleName(el);
          const cleanName = accName ? cleanAccessibleName(accName) : '';
          if (cleanName && !isFragileName(cleanName)) {
            suggestedLocator = "getByRole('" + role + "', { name: '" + cleanName.replace(/'/g, "\\\\'") + "' })";
          } else {
            // Role without name — add type context for inputs
            if (tag === 'input' && inputType && inputType !== 'text') {
              suggestedLocator = "locator('input[type=\\\"" + inputType + "\\\"]')";
            } else {
              suggestedLocator = "getByRole('" + role + "')";
            }
          }
        } else if (id && !isDynamicId(id)) {
          // Stable ID
          suggestedLocator = "locator('#" + id + "')";
        } else if (name && !isDynamicId(name)) {
          // Use name attribute as a reliable selector
          suggestedLocator = "locator('[name=\\\"" + name + "\\\"]')";
        } else if (tag === 'input' && inputType) {
          // Input with type
          suggestedLocator = "locator('input[type=\\\"" + inputType + "\\\"]')";
        } else {
          // Last resort: bare tag
          suggestedLocator = "locator('" + tag + "')";
        }

        return { label, tagName: tag, role, inputType, id, name, placeholder, required, isReadOnly, suggestedLocator };
      }

      const results = [];
      const allForms = Array.from(document.querySelectorAll('form'));

      // Also look for role="form" elements
      const roleForms = Array.from(document.querySelectorAll('[role="form"]'));
      roleForms.forEach(rf => {
        if (!allForms.includes(rf)) allForms.push(rf);
      });

      // If no forms found, treat the entire body as a single form
      const formsToScan = allForms.length > 0 ? allForms : [document.body];

      formsToScan.forEach((form, idx) => {
        const formId = form.id || undefined;
        const formName = form.getAttribute('name') || undefined;
        const action = form.getAttribute('action') || undefined;

        const sections = [];
        const fieldsetEls = Array.from(form.querySelectorAll('fieldset'));
        const ariaGroupEls = Array.from(form.querySelectorAll('[role="group"], [role="region"]'));
        const allSectionEls = [...fieldsetEls, ...ariaGroupEls];

        // Track which field elements are covered by a section
        const coveredFields = new Set();

        allSectionEls.forEach(sectionEl => {
          const title = getSectionTitle(sectionEl) || 'Section';

          const sectionFields = [];
          const fieldEls = Array.from(sectionEl.querySelectorAll(FIELD_TAGS.join(',')));
          fieldEls.forEach(el => {
            const f = buildField(el);
            if (f) {
              sectionFields.push(f);
              coveredFields.add(el);
            }
          });

          if (sectionFields.length > 0) {
            sections.push({ title, fields: sectionFields });
          }
        });

        // Ungrouped fields: direct children of form not inside any section
        const ungroupedFields = [];
        const allFormFields = Array.from(form.querySelectorAll(FIELD_TAGS.join(',')));
        allFormFields.forEach(el => {
          if (!coveredFields.has(el)) {
            const f = buildField(el);
            if (f) ungroupedFields.push(f);
          }
        });

        results.push({ formIndex: idx, formId, formName, action, sections, ungroupedFields });
      });

      return results;
    },

    // UI Scanner
    scanUI() {
      // Programmatically expand collapsible elements on the page before scanning
      try {
        document.querySelectorAll('details').forEach(d => {
          if (!d.open) d.open = true;
        });

        const toggles = Array.from(document.querySelectorAll('[aria-expanded="false"], [class*="collapse" i][role="button"], [class*="accordion" i][role="button"], .accordion-header, [class*="toggle" i]'));
        toggles.forEach(t => {
          const tag = t.tagName.toLowerCase();
          if (tag === 'a' && (t.getAttribute('href') || '').startsWith('http')) return;
          if (tag === 'input' || tag === 'form') return;
          try {
            t.click();
          } catch(e) {}
        });
      } catch (e) {
        console.warn('Failed to expand page sections:', e);
      }

      const allElements = Array.from(document.querySelectorAll('*'));

      function isFormWidget(el) {
        const classStr = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
        const idStr = (el.id && typeof el.id === 'string') ? el.id.toLowerCase() : '';
        if (classStr.includes('picker') || classStr.includes('date') || classStr.includes('time') || 
            classStr.includes('calendar') || classStr.includes('clock') || classStr.includes('datetime') ||
            idStr.includes('picker') || idStr.includes('date') || idStr.includes('time') || 
            idStr.includes('calendar') || idStr.includes('clock') || idStr.includes('datetime')) {
          return true;
        }
        if (el.getAttribute('aria-haspopup') === 'dialog' || el.getAttribute('aria-haspopup') === 'grid') {
          return true;
        }
        return false;
      }
      
      function getElementType(el) {
        const tagName = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || '';

        if (tagName === 'body') return 'page';
        if (role === 'dialog' || el.classList.contains('modal') || el.classList.contains('dialog')) return 'dialog';
        if (tagName === 'table') return 'table';
        if (role === 'grid' || role === 'treegrid' || el.classList.contains('ag-theme-alpine') || el.classList.contains('dx-datagrid')) return 'grid';
        if (role === 'tab' || role === 'tablist') return 'tab';
        if (tagName === 'svg') return 'svg';
        if (tagName === 'canvas') return 'canvas';
        if (tagName === 'img' || tagName === 'image' || role === 'img') return 'image';
        
        // Rich text editors
        if (el.classList.contains('ql-container') || el.classList.contains('ql-editor') ||
            el.classList.contains('mce-content-body') || el.classList.contains('ck-editor') ||
            el.classList.contains('draft-js') || el.classList.contains('ProseMirror')) {
          return 'rte';
        }

        if (tagName === 'label') {
          return 'field';
        }

        if (/^h[1-6]$/.test(tagName)) {
          if (el.textContent?.trim()) {
            return 'field';
          }
        }

        // Fields (interactive inputs)
        if (['input', 'select', 'textarea'].includes(tagName)) {
          const type = el.getAttribute('type');
          if (type === 'hidden' || type === 'submit' || type === 'reset' || type === 'button') {
            return null; // Skip buttons/hidden inputs in basic field detection, handled below
          }
          return 'field';
        }
        
        if (tagName === 'button' || role === 'button' || role === 'link' || tagName === 'a') {
          // Only if it has text or accessible name
          const name = getAccessibleName(el);
          if (name || el.textContent?.trim()) {
            return 'field';
          }
        }

        if (role === 'menu' || role === 'menubar' || role === 'menuitem') return 'menu';
        if (role === 'toolbar') return 'toolbar';
        if (tagName === 'nav' || role === 'navigation') return 'navigation';

        // Sections and subsections
        if (tagName === 'fieldset' || tagName === 'section' || role === 'region' || role === 'group') {
          if (isFormWidget(el)) return null;
          return 'section';
        }

        // DIVs/containers with headings or sectioning classes
        if (tagName === 'div' && (el.classList.contains('section') || el.classList.contains('panel') || el.classList.contains('card') || el.classList.contains('fieldset'))) {
          if (isFormWidget(el)) return null;
          return 'section';
        }

        // Check if DIV starts with a heading as first child
        if (tagName === 'div') {
          const firstChild = el.firstElementChild;
          if (firstChild && /^h[1-6]$/.test(firstChild.tagName.toLowerCase())) {
            if (isFormWidget(el)) return null;
            return 'section';
          }
        }

        return null;
      }

      function getNodeName(el, type) {
        if (type === 'page') return document.title || window.location.pathname || 'Page';
        
        let name = getAccessibleName(el);
        if (name) return name;
        
        if (type === 'section') {
          const legend = el.querySelector('legend');
          if (legend) {
            const text = getCleanText(legend).trim();
            if (text) return text;
          }
          const headings = Array.from(el.querySelectorAll('h1, h2, h3, h4, h5, h6'));
          const directHeading = headings.find(h => {
            let p = h.parentElement;
            while (p && p !== el) {
              const pType = getElementType(p);
              if (pType === 'section' || pType === 'dialog' || pType === 'table' || pType === 'grid') {
                return false; // Belongs to a nested container
              }
              if (p.querySelector('input, select, textarea, button')) {
                return false; // Heading is inside a field wrapper
              }
              p = p.parentElement;
            }
            return true;
          });
          if (directHeading) {
            const text = getCleanText(directHeading).trim();
            if (text) return text;
          }
        }
        
        if (el.id) return el.id;
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.split(/\s+/).filter(c => c && !c.startsWith('_') && !c.includes('style'));
          if (classes.length > 0) return classes[0];
        }

        return el.tagName.toLowerCase();
      }

      // Collect all classified nodes
      const nodesMap = new Map();
      const classifiedElements = [];

      allElements.forEach(el => {
        const type = getElementType(el);
        if (type) {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
          if (!isVisible && type !== 'page') return; // Skip hidden elements for structural tree (except page)

          const alternatives = window.__locatorLensAgent.generateAlternatives(el) || [];
          const bestLocator = alternatives[0]?.selector || ("locator('" + el.tagName.toLowerCase() + "')");
          const name = getNodeName(el, type);

          // Meta extraction
          let meta = {};
          if (type === 'table' || type === 'grid') {
            const headers = Array.from(el.querySelectorAll('th, [role="columnheader"]')).map(h => getCleanText(h).trim()).filter(Boolean);
            const rowCount = el.querySelectorAll('tr, [role="row"]').length;
            meta = { headers, rowCount, columnCount: headers.length };
          } else if (type === 'rte') {
            let editorType = 'unknown';
            if (el.classList.contains('ql-container') || el.classList.contains('ql-editor')) editorType = 'Quill';
            else if (el.classList.contains('mce-content-body')) editorType = 'TinyMCE';
            else if (el.classList.contains('ck-editor')) editorType = 'CKEditor';
            else if (el.classList.contains('draft-js')) editorType = 'DraftJS';
            else if (el.classList.contains('ProseMirror')) editorType = 'ProseMirror';
            meta = { editorType };
          } else if (type === 'field') {
            const isRequired = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
            const isReadOnly = el.hasAttribute('readonly') || el.getAttribute('aria-readonly') === 'true';
            const placeholder = el.getAttribute('placeholder') || undefined;
            const inputType = el.tagName.toLowerCase() === 'input' ? el.getAttribute('type') : undefined;
            meta = { required: isRequired, readOnly: isReadOnly, placeholder, inputType };
          } else if (type === 'dialog') {
            const isOpen = window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';
            meta = { isOpen };
          } else if (type === 'svg' || type === 'canvas') {
            meta = getGraphicsMeta(el) || {};
          }

          const node = {
            id: 'node-' + Math.random().toString(36).substr(2, 9),
            type,
            name,
            tagName: el.tagName,
            role: getElementRole(el),
            locator: bestLocator,
            boundingBox: {
              x: rect.left + window.scrollX,
              y: rect.top + window.scrollY,
              width: rect.width,
              height: rect.height
            },
            meta,
            children: [],
            _element: el // Keep local reference for tree building
          };

          nodesMap.set(el, node);
          classifiedElements.push(node);
        }
      });

      // Build hierarchical tree
      const rootNodes = [];
      classifiedElements.forEach(node => {
        let parentEl = node._element.parentElement;
        let parentNode = null;
        while (parentEl) {
          if (nodesMap.has(parentEl)) {
            parentNode = nodesMap.get(parentEl);
            break;
          }
          parentEl = parentEl.parentElement;
        }

        if (parentNode && parentNode.id !== node.id) {
          parentNode.children.push(node);
        } else {
          // If no parent found, add to root if it is a page, or if page is not in nodesMap
          if (node.type === 'page') {
            rootNodes.push(node);
          } else {
            // Find body node
            const bodyNode = nodesMap.get(document.body);
            if (bodyNode && bodyNode.id !== node.id) {
              bodyNode.children.push(node);
            } else {
              rootNodes.push(node);
            }
          }
        }
      });

      // Remove local element references before returning
      function sanitizeNode(n) {
        const copy = { ...n };
        delete copy._element;
        copy.children = n.children.map(sanitizeNode);
        return copy;
      }
      const tree = rootNodes.map(sanitizeNode);

      // Accessibility Scan
      const accessibilityIssues = [];
      const labelsCount = {};

      const interactiveEls = Array.from(document.querySelectorAll('input, select, textarea, button, a, [role="button"], [role="checkbox"], [role="radio"], [role="combobox"], [role="textbox"]'));

      interactiveEls.forEach(el => {
        const tagName = el.tagName.toLowerCase();
        const role = getElementRole(el);
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';

        // 1. Missing Label
        const label = getAccessibleName(el);
        if (!label) {
          accessibilityIssues.push({
            elementId: el.id || undefined,
            tagName,
            role,
            description: 'Interactive <' + tagName + '> is missing an accessible label or name.',
            severity: 'error',
            type: 'missing-label',
            suggestedLocator: getCssPath(el)
          });
        }

        // Keep track of labels for duplicate check
        if (label && isVisible) {
          const cleanLbl = label.trim();
          if (!labelsCount[cleanLbl]) {
            labelsCount[cleanLbl] = [];
          }
          labelsCount[cleanLbl].push(el);
        }

        // 2. Hidden interactive elements
        if (!isVisible && tagName !== 'input' && el.getAttribute('type') !== 'hidden') {
          const ariaHidden = el.getAttribute('aria-hidden');
          if (ariaHidden !== 'true') {
            accessibilityIssues.push({
              elementId: el.id || undefined,
              tagName,
              role,
              description: 'Interactive <' + tagName + '> is hidden but not marked aria-hidden="true".',
              severity: 'warning',
              type: 'hidden-interactive',
              suggestedLocator: getCssPath(el)
            });
          }
        }

        // 3. Missing Roles for custom click elements
        if (el.hasAttribute('onclick') && !el.hasAttribute('role') && !['button', 'a', 'input'].includes(tagName)) {
          accessibilityIssues.push({
            elementId: el.id || undefined,
            tagName,
            role,
            description: 'Element with onclick listener is missing an ARIA role.',
            severity: 'error',
            type: 'missing-role',
            suggestedLocator: getCssPath(el)
          });
        }
      });

      // Group duplicates
      let duplicateLabels = 0;
      Object.keys(labelsCount).forEach(lbl => {
        if (labelsCount[lbl].length > 1) {
          duplicateLabels += labelsCount[lbl].length;
          labelsCount[lbl].forEach(el => {
            accessibilityIssues.push({
              elementId: el.id || undefined,
              tagName: el.tagName.toLowerCase(),
              role: getElementRole(el),
              description: 'Duplicate label "' + lbl + '" found. Scoping context is needed to uniquely resolve.',
              severity: 'warning',
              type: 'duplicate-label',
              suggestedLocator: getCssPath(el)
            });
          });
        }
      });

      // Metrics & Readiness Score
      let totalLocators = classifiedElements.length;
      let stableLocators = 0;
      let fragileLocators = 0;
      let dynamicIdsFound = 0;

      classifiedElements.forEach(node => {
        const el = node._element;
        if (el && el.id && isDynamicId(el.id)) {
          dynamicIdsFound++;
        }

        if (node.locator.includes('xpath') || node.locator.includes(' > ') || node.locator.includes('nth-child') || node.locator.includes('nth-of-type')) {
          fragileLocators++;
        } else {
          stableLocators++;
        }
      });

      // Calculate score out of 100
      let scoreVal = 100;
      const scoreFactors = [];

      // 1. Accessibility issues penalties
      const missingLabelsCount = accessibilityIssues.filter(i => i.type === 'missing-label').length;
      const missingRolesCount = accessibilityIssues.filter(i => i.type === 'missing-role').length;
      const hiddenInteractiveCount = accessibilityIssues.filter(i => i.type === 'hidden-interactive').length;

      if (missingLabelsCount > 0) {
        const penalty = Math.min(25, missingLabelsCount * 5);
        scoreVal -= penalty;
        scoreFactors.push({ text: 'Missing accessible labels on ' + missingLabelsCount + ' fields (-' + penalty + ' pts)', positive: false });
      } else {
        scoreFactors.push({ text: 'All form fields have accessible labels (+10 pts)', positive: true });
        scoreVal += 10; // bonus
      }

      if (duplicateLabels > 0) {
        const penalty = Math.min(20, duplicateLabels * 4);
        scoreVal -= penalty;
        scoreFactors.push({ text: duplicateLabels + ' elements have duplicate labels (-' + penalty + ' pts)', positive: false });
      }

      if (missingRolesCount > 0) {
        const penalty = Math.min(15, missingRolesCount * 5);
        scoreVal -= penalty;
        scoreFactors.push({ text: 'Custom click listeners missing ARIA roles (-' + penalty + ' pts)', positive: false });
      }

      // 2. Locator Stability penalties
      if (fragileLocators > 0) {
        const pct = Math.round((fragileLocators / Math.max(1, totalLocators)) * 100);
        const penalty = Math.min(30, Math.round(pct * 0.3));
        scoreVal -= penalty;
        scoreFactors.push({ text: pct + '% of locators are fragile/structural (-' + penalty + ' pts)', positive: false });
      } else if (totalLocators > 0) {
        scoreFactors.push({ text: 'All locators use stable query strategies (+15 pts)', positive: true });
        scoreVal += 15; // bonus
      }

      if (dynamicIdsFound > 0) {
        const penalty = Math.min(10, dynamicIdsFound * 2);
        scoreVal -= penalty;
        scoreFactors.push({ text: 'Dynamic/auto-generated IDs detected in ' + dynamicIdsFound + ' nodes (-' + penalty + ' pts)', positive: false });
      }

      const readinessScoreVal = Math.max(10, Math.min(100, scoreVal));

      return {
        tree,
        accessibilityIssues,
        healthReport: {
          totalLocators,
          stableLocators,
          fragileLocators,
          dynamicIdsFound,
          duplicateLabels
        },
        readinessScore: {
          score: readinessScoreVal,
          factors: scoreFactors
        }
      };
    }
  };
})();
`;
