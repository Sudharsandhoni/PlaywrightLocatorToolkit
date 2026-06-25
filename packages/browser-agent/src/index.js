"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_SCRIPT = void 0;
exports.AGENT_SCRIPT = `
(function() {
  if (window.__locatorLensAgent) return;

  const styleId = '__locator_lens_styles';
  if (!document.getElementById(styleId)) {
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
    document.head.appendChild(style);
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

  function getAccessibleName(el) {
    let name = '';
    if (el.hasAttribute('aria-label')) {
      name = el.getAttribute('aria-label') || '';
    } else if (el.hasAttribute('aria-labelledby')) {
      const ids = (el.getAttribute('aria-labelledby') || '').split(/\\s+/);
      const labels = ids.map(id => document.getElementById(id)?.textContent || '').filter(Boolean);
      name = labels.join(' ');
    } else {
      if (el.id) {
        const labels = document.querySelectorAll('label[for="' + el.id + '"]');
        if (labels.length > 0) {
          name = Array.from(labels).map(l => l.textContent || '').join(' ');
        }
      }
      if (!name.trim()) {
        const parentLabel = el.closest('label');
        if (parentLabel) {
          name = parentLabel.textContent || '';
        }
      }
      if (!name.trim()) {
        name = el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('title') || '';
      }
      if (!name.trim() && ['button', 'a', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(el.tagName.toLowerCase())) {
        name = el.textContent || '';
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

  window.__locatorLensAgent = {
    highlight(elements, type) {
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
        div.style.border = '2px solid ' + borderColor;
        div.style.backgroundColor = bgColor;

        const tooltip = document.createElement('div');
        tooltip.className = '__locator_lens_tooltip';
        
        const role = getElementRole(el);
        const name = getAccessibleName(el);
        let label = labelPrefix + ' [' + (index + 1) + '] ' + el.tagName.toLowerCase();
        if (role && role !== 'generic') label += ' [role=' + role + ']';
        if (name) label += ' "' + (name.length > 20 ? name.slice(0, 17) + '...' : name) + '"';
        
        tooltip.textContent = label;
        div.appendChild(tooltip);

        document.body.appendChild(div);
        overlays.push({ div, element: el });
      });

      startTracking();
    },

    clear() {
      clearOverlays();
    },

    getElementInfo(el) {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
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
        }
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
          alternatives.push({
            selector: "getByRole('" + role + "', { name: '" + name + "' })",
            type: 'getByRole',
            confidence: 92,
            reason: 'Semantic query matching role and accessible name.'
          });
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

      // 5. getByText (Buttons, Headings, Links)
      if (name && ['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(el.tagName.toLowerCase()) && name.length < 40) {
        alternatives.push({
          selector: "getByText('" + name + "')",
          type: 'getByText',
          confidence: 80,
          reason: 'Matches text content for interactive/heading elements.'
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
    }
  };
})();
`;
//# sourceMappingURL=index.js.map