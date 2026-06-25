"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode2 = __toESM(require("vscode"));

// src/sidebarProvider.ts
var vscode = __toESM(require("vscode"));
var fs = __toESM(require("fs"));

// ../engine/src/index.ts
var vm = __toESM(require("vm"));
var import_playwright_core = require("playwright-core");

// ../locator-parser/src/index.ts
function tokenize(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === ".") {
      tokens.push({ type: "DOT", value: "." });
      i++;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "LBRACE", value: "{" });
      i++;
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "RBRACE", value: "}" });
      i++;
      continue;
    }
    if (char === ":") {
      tokens.push({ type: "COLON", value: ":" });
      i++;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "COMMA", value: "," });
      i++;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      let val = "";
      i++;
      while (i < str.length && str[i] !== quote) {
        if (str[i] === "\\" && i + 1 < str.length) {
          val += str[i + 1];
          i += 2;
        } else {
          val += str[i];
          i++;
        }
      }
      i++;
      tokens.push({ type: "STRING", value: val });
      continue;
    }
    if (char === "/") {
      let val = "";
      i++;
      let isEscape = false;
      while (i < str.length) {
        const c = str[i];
        if (isEscape) {
          val += c;
          isEscape = false;
          i++;
        } else if (c === "\\") {
          val += c;
          isEscape = true;
          i++;
        } else if (c === "/") {
          break;
        } else {
          val += c;
          i++;
        }
      }
      i++;
      let flags = "";
      while (i < str.length && /[gimsuy]/.test(str[i])) {
        flags += str[i];
        i++;
      }
      tokens.push({ type: "REGEX", value: JSON.stringify({ pattern: val, flags }) });
      continue;
    }
    if (/[0-9]/.test(char)) {
      let val = "";
      while (i < str.length && /[0-9\.]/.test(str[i])) {
        val += str[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value: val });
      continue;
    }
    if (/[a-zA-Z\$_]/.test(char)) {
      let val = "";
      while (i < str.length && /[a-zA-Z0-9\$_]/.test(str[i])) {
        val += str[i];
        i++;
      }
      if (val === "true" || val === "false") {
        tokens.push({ type: "BOOLEAN", value: val });
      } else {
        tokens.push({ type: "IDENTIFIER", value: val });
      }
      continue;
    }
    throw new Error(`Unexpected character at position ${i}: ${char}`);
  }
  tokens.push({ type: "EOF", value: "" });
  return tokens;
}
var Parser = class {
  tokens;
  current = 0;
  constructor(tokens) {
    this.tokens = tokens;
  }
  peek() {
    return this.tokens[this.current];
  }
  consume(type) {
    const token = this.peek();
    if (type && token.type !== type) {
      throw new Error(`Expected token ${type}, but got ${token.type} (${token.value})`);
    }
    this.current++;
    return token;
  }
  parse() {
    const steps = [];
    if (this.peek().type === "IDENTIFIER") {
      const id = this.peek().value;
      if (id === "page") {
        this.consume();
        if (this.peek().type === "DOT") {
          this.consume();
        }
      }
    }
    while (this.peek().type !== "EOF") {
      const step = this.parseMethodCall();
      steps.push(step);
      if (this.peek().type === "DOT") {
        this.consume();
      } else if (this.peek().type !== "EOF") {
        throw new Error(`Expected '.' or EOF, got ${this.peek().type}`);
      }
    }
    return steps;
  }
  parseMethodCall() {
    const nameToken = this.consume("IDENTIFIER");
    const name = nameToken.value;
    this.consume("LPAREN");
    const args = [];
    if (this.peek().type !== "RPAREN") {
      args.push(this.parseExpression());
      while (this.peek().type === "COMMA") {
        this.consume();
        args.push(this.parseExpression());
      }
    }
    this.consume("RPAREN");
    return { name, args };
  }
  parseExpression() {
    const token = this.peek();
    if (token.type === "STRING") {
      this.consume();
      return token.value;
    }
    if (token.type === "NUMBER") {
      this.consume();
      return Number(token.value);
    }
    if (token.type === "BOOLEAN") {
      this.consume();
      return token.value === "true";
    }
    if (token.type === "REGEX") {
      this.consume();
      const parsed = JSON.parse(token.value);
      return new RegExp(parsed.pattern, parsed.flags);
    }
    if (token.type === "LBRACE") {
      return this.parseObject();
    }
    throw new Error(`Unsupported expression type: ${token.type}`);
  }
  parseObject() {
    this.consume("LBRACE");
    const obj = {};
    if (this.peek().type !== "RBRACE") {
      this.parseObjectProperty(obj);
      while (this.peek().type === "COMMA") {
        this.consume();
        if (this.peek().type === "RBRACE") {
          break;
        }
        this.parseObjectProperty(obj);
      }
    }
    this.consume("RBRACE");
    return obj;
  }
  parseObjectProperty(obj) {
    const keyToken = this.consume("IDENTIFIER");
    const key = keyToken.value;
    this.consume("COLON");
    const val = this.parseExpression();
    obj[key] = val;
  }
};
function parseLocator(locatorStr) {
  const tokens = tokenize(locatorStr);
  const parser = new Parser(tokens);
  return parser.parse();
}
function stringifyLocator(steps, includePagePrefix = true) {
  const parts = includePagePrefix ? ["page"] : [];
  for (const step of steps) {
    const argsStr = step.args.map((arg) => stringifyArgument(arg)).join(", ");
    parts.push(`${step.name}(${argsStr})`);
  }
  return parts.join(".");
}
function stringifyArgument(arg) {
  if (typeof arg === "string") {
    return `'${arg.replace(/'/g, "\\'")}'`;
  }
  if (typeof arg === "number" || typeof arg === "boolean") {
    return String(arg);
  }
  if (arg instanceof RegExp) {
    return arg.toString();
  }
  if (arg && typeof arg === "object") {
    if (arg.source !== void 0 && arg.flags !== void 0) {
      return `/${arg.source}/${arg.flags}`;
    }
    const pairs = Object.entries(arg).map(([k, v]) => `${k}: ${stringifyArgument(v)}`);
    return `{ ${pairs.join(", ")} }`;
  }
  return "undefined";
}

// ../browser-agent/src/index.ts
var AGENT_SCRIPT = `
(function() {
  if (window.__locatorLensAgent) {
    try {
      window.__locatorLensAgent.clear();
    } catch (e) {}
  }

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
      /{/,
      /}/,
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
    return cleaned.replace(/[s,;]+$/, '');
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
    getCleanText,
    highlight(elements, type, scrollIndex) {
      clearOverlays();
      trackedElements = elements;

      let borderColor = '#22c55e';
      let bgColor = 'rgba(34, 197, 94, 0.1)';
      let labelPrefix = '\u2713';

      if (type === 'warning') {
        borderColor = '#eab308';
        bgColor = 'rgba(234, 179, 8, 0.1)';
        labelPrefix = '\u26A0';
      } else if (type === 'failure') {
        borderColor = '#ef4444';
        bgColor = 'rgba(239, 68, 68, 0.1)';
        labelPrefix = '\u2717';
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
          if (isFragileName(name)) {
            const cleaned = cleanAccessibleName(name);
            if (cleaned && !isFragileName(cleaned)) {
              alternatives.push({
                selector: "getByRole('" + role + "', { name: /" + cleaned.replace(/[-/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&') + "/i })",
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
              selector: "getByRole('" + role + "', { name: '" + name.replace(/'/g, "\\'") + "' })",
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

      // 5. getByText (Buttons, Headings, Links)
      if (name && ['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(el.tagName.toLowerCase()) && name.length < 40 && !isFragileName(name)) {
        alternatives.push({
          selector: "getByText('" + name.replace(/'/g, "\\'") + "')",
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

    // Phase 8 \u2014 Form-Aware Analysis
    scanForms() {
      const FIELD_TAGS = ['input', 'select', 'textarea'];
      const SKIP_INPUT_TYPES = ['hidden', 'submit', 'reset', 'button', 'image'];

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

        // Build the best suggested locator
        let suggestedLocator = '';
        if (label && !isFragileName(label)) {
          suggestedLocator = "getByLabel('" + label.replace(/'/g, "\\'") + "')";
        } else if (placeholder) {
          suggestedLocator = "getByPlaceholder('" + placeholder.replace(/'/g, "\\'") + "')";
        } else if (role && role !== 'generic' && label) {
          suggestedLocator = "getByRole('" + role + "', { name: '" + label.replace(/'/g, "\\'") + "' })";
        } else if (id && !isDynamicId(id)) {
          suggestedLocator = "locator('#" + id + "')";
        } else {
          suggestedLocator = "locator('" + tag + "')";
        }

        return { label, tagName: tag, role, inputType, id, name, placeholder, required, suggestedLocator };
      }

      function buildSection(container, title) {
        const fields = [];
        const fieldEls = Array.from(container.querySelectorAll(FIELD_TAGS.join(',')));
        fieldEls.forEach(el => {
          const f = buildField(el);
          if (f) fields.push(f);
        });
        return { title, fields };
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
          // Section title: <legend> for fieldset, aria-label/aria-labelledby for groups
          let title = '';
          if (sectionEl.tagName.toLowerCase() === 'fieldset') {
            const legend = sectionEl.querySelector('legend');
            title = legend ? getCleanText(legend).trim() : 'Fieldset';
          } else {
            title = getAccessibleName(sectionEl) || sectionEl.getAttribute('aria-label') || 'Group';
          }

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
    }
  };
})();
`;

// ../engine/src/index.ts
var LocatorEngine = class {
  browser = null;
  pages = /* @__PURE__ */ new Map();
  cdpUrl = "";
  async connect(cdpUrl) {
    this.cdpUrl = cdpUrl;
    if (this.browser) {
      await this.disconnect();
    }
    this.browser = await import_playwright_core.chromium.connectOverCDP(cdpUrl);
    this.pages.clear();
    const contexts = this.browser.contexts();
    const allPages = [];
    for (const context of contexts) {
      const contextPages = context.pages();
      for (let idx = 0; idx < contextPages.length; idx++) {
        const page = contextPages[idx];
        const id = `page-${Date.now()}-${idx}-${Math.floor(Math.random() * 1e3)}`;
        this.pages.set(id, page);
        let title = "Untitled";
        try {
          title = await page.title();
        } catch {
        }
        let url = "about:blank";
        try {
          url = page.url();
        } catch {
        }
        allPages.push({ id, title, url });
      }
    }
    return allPages;
  }
  async disconnect() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
      }
      this.browser = null;
    }
    this.pages.clear();
  }
  getPage(id) {
    return this.pages.get(id);
  }
  async ensureAgentInjected(page) {
    try {
      await page.evaluate(AGENT_SCRIPT);
    } catch (err) {
      throw new Error(`Failed to inject locator lens browser agent: ${err.message}`);
    }
  }
  async getAutocompleteData(pageId) {
    const page = this.getPage(pageId);
    if (!page) {
      throw new Error("Target page/tab not found or has been closed.");
    }
    try {
      await this.ensureAgentInjected(page);
      const data = await page.evaluate(() => {
        return window.__locatorLensAgent.getAutocompleteData();
      });
      return data;
    } catch (err) {
      throw new Error(`Failed to retrieve autocomplete data from page: ${err.message}`);
    }
  }
  async evaluate(pageId, locatorStr) {
    const page = this.getPage(pageId);
    if (!page) {
      return {
        success: false,
        error: "Target page/tab not found or has been closed.",
        count: 0,
        elements: [],
        confidence: 0,
        confidenceFactors: [],
        alternatives: []
      };
    }
    try {
      await this.ensureAgentInjected(page);
    } catch (err) {
      return {
        success: false,
        error: `Failed to inject browser agent: ${err.message}`,
        count: 0,
        elements: [],
        confidence: 0,
        confidenceFactors: [{ text: "Injection Failed", positive: false }],
        alternatives: []
      };
    }
    let parsedSteps = [];
    try {
      parsedSteps = parseLocator(locatorStr);
    } catch (err) {
      return {
        success: false,
        error: `Syntax Parsing Error: ${err.message}`,
        count: 0,
        elements: [],
        confidence: 0,
        confidenceFactors: [{ text: "Invalid Syntax", positive: false }],
        alternatives: []
      };
    }
    const sandbox = {
      page,
      locator: page.locator.bind(page),
      getByRole: page.getByRole.bind(page),
      getByText: page.getByText.bind(page),
      getByLabel: page.getByLabel.bind(page),
      getByPlaceholder: page.getByPlaceholder.bind(page),
      getByAltText: page.getByAltText.bind(page),
      getByTitle: page.getByTitle.bind(page),
      getByTestId: page.getByTestId.bind(page)
    };
    let locatorInstance;
    try {
      const context = vm.createContext(sandbox);
      locatorInstance = vm.runInContext(locatorStr, context);
      if (!locatorInstance || typeof locatorInstance.count !== "function") {
        throw new Error("Expression did not evaluate to a Playwright Locator instance.");
      }
    } catch (err) {
      return {
        success: false,
        error: `Evaluation Error: ${err.message}`,
        count: 0,
        elements: [],
        confidence: 0,
        confidenceFactors: [{ text: "Evaluation Failed", positive: false }],
        alternatives: []
      };
    }
    try {
      const count = await locatorInstance.count();
      if (count === 0) {
        const failureAnalysis = await this.performFailureAnalysis(page, parsedSteps);
        return {
          success: true,
          count: 0,
          elements: [],
          confidence: 0,
          confidenceFactors: [{ text: "No matching elements found", positive: false }],
          alternatives: failureAnalysis.suggestedAlternatives,
          failureAnalysis
        };
      }
      const elements = await locatorInstance.evaluateAll((elems) => {
        return elems.map((el) => window.__locatorLensAgent.getElementInfo(el)).filter(Boolean);
      });
      const primaryElement = elements[0];
      const { confidence, factors } = this.calculateConfidence(locatorStr, count, primaryElement, parsedSteps);
      const alternatives = await locatorInstance.evaluateAll((elems) => {
        const list = [];
        const seen = /* @__PURE__ */ new Set();
        elems.forEach((el) => {
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
    } catch (err) {
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
    if (!page) return false;
    try {
      await this.ensureAgentInjected(page);
      await page.evaluate(() => {
        var _a;
        (_a = window.__locatorLensAgent) == null ? void 0 : _a.clear();
      });
      if (!locatorStr.trim()) return true;
      const sandbox = {
        page,
        locator: page.locator.bind(page),
        getByRole: page.getByRole.bind(page),
        getByText: page.getByText.bind(page),
        getByLabel: page.getByLabel.bind(page),
        getByPlaceholder: page.getByPlaceholder.bind(page),
        getByAltText: page.getByAltText.bind(page),
        getByTitle: page.getByTitle.bind(page),
        getByTestId: page.getByTestId.bind(page)
      };
      const context = vm.createContext(sandbox);
      const locatorInstance = vm.runInContext(locatorStr, context);
      const count = await locatorInstance.count();
      if (count === 0) {
        return false;
      }
      const type = count === 1 ? "success" : "warning";
      const elementHandles = await locatorInstance.elementHandles();
      await page.evaluate(([elements, hlType, scrollIdx]) => {
        if (window.__locatorLensAgent) {
          window.__locatorLensAgent.highlight(elements, hlType, scrollIdx);
        }
      }, [elementHandles, type, scrollIndex]);
      return true;
    } catch {
      return false;
    }
  }
  async clearHighlight(pageId) {
    const page = this.getPage(pageId);
    if (!page) return;
    try {
      await page.evaluate(() => {
        var _a;
        (_a = window.__locatorLensAgent) == null ? void 0 : _a.clear();
      });
    } catch {
    }
  }
  // ─────────────────────────────────────────────────────────────
  // Phase 3 — .or() Chain Tree Analyzer
  // ─────────────────────────────────────────────────────────────
  async analyzeChain(pageId, locatorStr) {
    const page = this.getPage(pageId);
    if (!page) {
      return { success: false, error: "Page not found.", branches: [], totalMatches: 0 };
    }
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
          getByTestId: page.getByTestId.bind(page)
        };
        const ctx = vm.createContext(sandbox);
        const locatorInstance = vm.runInContext(branchExpr, ctx);
        const count = await locatorInstance.count();
        totalMatches += count;
        branches.push({ locatorStr: branchExpr, matchCount: count, isWinner: false });
      } catch (err) {
        branches.push({ locatorStr: branchExpr, matchCount: 0, error: err.message, isWinner: false });
      }
    }
    const hasWinner = branches.some((b) => b.matchCount > 0);
    if (hasWinner) {
      branches.forEach((b) => {
        if (b.matchCount > 0) b.isWinner = true;
      });
    }
    return { success: true, branches, totalMatches };
  }
  /**
   * Split "a.or(b).or(c)" into ["a", "b", "c"] handling nested parentheses.
   */
  splitOrChain(locatorStr) {
    const normalized = locatorStr.replace(/^\s*page\s*\.\s*/, "");
    const branches = [];
    let depth = 0;
    let current = "";
    let i = 0;
    while (i < normalized.length) {
      if (depth === 0 && normalized[i] === "." && normalized.slice(i, i + 4) === ".or(") {
        if (current.trim()) {
          branches.push(current.trim());
        }
        current = "";
        i += 4;
        depth = 1;
        continue;
      }
      if (normalized[i] === "(") depth++;
      else if (normalized[i] === ")") {
        if (depth === 1 && current !== "") {
          depth = 0;
          branches.push(current.trim());
          current = "";
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
        error: "Page not found.",
        runs: [],
        score: 0,
        locatorStr
      };
    }
    const runResults = [];
    let foundCount = 0;
    for (let i = 0; i < runs; i++) {
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 3e4 });
        try {
          await this.ensureAgentInjected(page);
        } catch {
        }
        const sandbox = {
          page,
          locator: page.locator.bind(page),
          getByRole: page.getByRole.bind(page),
          getByText: page.getByText.bind(page),
          getByLabel: page.getByLabel.bind(page),
          getByPlaceholder: page.getByPlaceholder.bind(page),
          getByAltText: page.getByAltText.bind(page),
          getByTitle: page.getByTitle.bind(page),
          getByTestId: page.getByTestId.bind(page)
        };
        const ctx = vm.createContext(sandbox);
        const locatorInstance = vm.runInContext(locatorStr, ctx);
        const count = await locatorInstance.count();
        const found = count > 0;
        if (found) foundCount++;
        runResults.push({ run: i + 1, found, matchCount: count });
      } catch (err) {
        runResults.push({ run: i + 1, found: false, matchCount: 0, error: err.message });
      }
    }
    const score = Math.round(foundCount / runs * 100);
    return { success: true, runs: runResults, score, locatorStr };
  }
  // ─────────────────────────────────────────────────────────────
  // Phase 8 — Form-Aware Analysis
  // ─────────────────────────────────────────────────────────────
  async scanForms(pageId) {
    const page = this.getPage(pageId);
    if (!page) {
      throw new Error("Page not found.");
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
    if (count === 1) {
      score += 40;
      factors.push({ text: "Single unique match", positive: true });
    } else {
      score -= 20;
      factors.push({ text: `Multiple matches found (${count})`, positive: false });
    }
    if (el == null ? void 0 : el.visible) {
      score += 15;
      factors.push({ text: "Element is visible on screen", positive: true });
    } else if (el) {
      score -= 10;
      factors.push({ text: "Element is hidden/invisible", positive: false });
    }
    if (locatorStr.includes("getByTestId")) {
      score += 25;
      factors.push({ text: "Uses semantic data-testid locator", positive: true });
    } else if (locatorStr.includes("getByRole") && locatorStr.includes("name:")) {
      score += 20;
      factors.push({ text: "Uses getByRole with accessible name filter", positive: true });
    } else if (locatorStr.includes("getByLabel")) {
      score += 20;
      factors.push({ text: "Uses getByLabel standard form query", positive: true });
    } else if (locatorStr.includes("getByPlaceholder") || locatorStr.includes("getByTitle") || locatorStr.includes("getByAltText")) {
      score += 15;
      factors.push({ text: "Uses accessible placeholder/title/alt text", positive: true });
    } else if (locatorStr.includes("getByText")) {
      score += 12;
      factors.push({ text: "Uses getByText search", positive: true });
    } else if (locatorStr.includes("locator(")) {
      const cssMatch = locatorStr.match(/locator\(\s*['"`](.*?)['"`]\s*\)/);
      if (cssMatch) {
        const selector = cssMatch[1];
        if (selector.startsWith("#") && !selector.includes(" ") && !selector.includes(">")) {
          score += 15;
          factors.push({ text: "Uses CSS ID locator", positive: true });
        } else if (selector.startsWith("//") || selector.startsWith("xpath=")) {
          score -= 15;
          factors.push({ text: "Uses XPath locator (fragile to structure)", positive: false });
        } else {
          score += 5;
          factors.push({ text: "Uses CSS path selector", positive: false });
        }
      }
    }
    if (el == null ? void 0 : el.id) {
      const isDynamic = /(mui|ag-|grid-|ng-|val-|id-|ember|k-|dx-)/i.test(el.id) || /^[0-9]+$/.test(el.id) || /[0-9]{4,}/.test(el.id);
      if (isDynamic && locatorStr.includes(`#${el.id}`)) {
        score -= 25;
        factors.push({ text: "Uses generated/dynamic element ID", positive: false });
      }
    }
    if (/\.(nth|first|last)\(/.test(locatorStr) || locatorStr.includes(":nth-child") || locatorStr.includes(":nth-of-type")) {
      score -= 15;
      factors.push({ text: "Uses index filters (fragile to page list changes)", positive: false });
    }
    const fragileCheck = this.hasFragileNameFilter(steps);
    if (fragileCheck.fragile) {
      score -= 60;
      factors.push({ text: fragileCheck.reason, positive: false });
    }
    const confidence = Math.max(0, Math.min(100, score));
    return { confidence, factors };
  }
  hasFragileNameFilter(steps) {
    if (!steps) return { fragile: false, reason: "" };
    const cssPatterns = [
      /:where\(/i,
      /--[a-zA-Z0-9_-]/,
      // CSS variables e.g. --ag-
      /\{/,
      /\}/,
      /var\(/i,
      /calc\(/i,
      /rgba?\(/i,
      /color-mix\(/i,
      /;/
    ];
    for (const step of steps) {
      for (const arg of step.args) {
        if (typeof arg === "string") {
          if (arg.length > 60) {
            return { fragile: true, reason: "Text filter is excessively long (> 60 characters)" };
          }
          for (const pattern of cssPatterns) {
            if (pattern.test(arg)) {
              return { fragile: true, reason: "Text filter contains CSS styling patterns or variables" };
            }
          }
        } else if (arg instanceof RegExp) {
          const source = arg.source;
          if (source.length > 60) {
            return { fragile: true, reason: "RegExp filter is excessively long (> 60 characters)" };
          }
          for (const pattern of cssPatterns) {
            if (pattern.test(source)) {
              return { fragile: true, reason: "RegExp filter contains CSS styling patterns or variables" };
            }
          }
        } else if (arg && typeof arg === "object") {
          for (const key of Object.keys(arg)) {
            const val = arg[key];
            if (typeof val === "string") {
              if (val.length > 60) {
                return { fragile: true, reason: `Filter option "${key}" is excessively long (> 60 characters)` };
              }
              for (const pattern of cssPatterns) {
                if (pattern.test(val)) {
                  return { fragile: true, reason: `Filter option "${key}" contains CSS styling patterns or variables` };
                }
              }
            } else if (val instanceof RegExp) {
              const source = val.source;
              if (source.length > 60) {
                return { fragile: true, reason: `Filter option "${key}" RegExp is excessively long (> 60 characters)` };
              }
              for (const pattern of cssPatterns) {
                if (pattern.test(source)) {
                  return { fragile: true, reason: `Filter option "${key}" RegExp contains CSS styling patterns or variables` };
                }
              }
            } else if (val && typeof val === "object" && val.source !== void 0) {
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
    return { fragile: false, reason: "" };
  }
  async performFailureAnalysis(page, steps) {
    var _a, _b;
    const analysisSteps = [];
    let currentLocatorStr = "page";
    let lastValidLocator = null;
    let failedStepIndex = -1;
    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];
      const nextLocatorStr = `${currentLocatorStr}.${stringifyLocator([step], false)}`;
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
          getByTestId: page.getByTestId.bind(page)
        };
        const context = vm.createContext(sandbox);
        const currentLocator = vm.runInContext(nextLocatorStr, context);
        const count = await currentLocator.count();
        if (count > 0) {
          analysisSteps.push({
            stepText: stringifyLocator([step], false),
            success: true,
            matchCount: count
          });
          lastValidLocator = currentLocator;
          currentLocatorStr = nextLocatorStr;
        } else {
          failedStepIndex = idx;
          analysisSteps.push({
            stepText: stringifyLocator([step], false),
            success: false,
            matchCount: 0,
            reason: `Locator resolved to 0 elements at step: ${stringifyLocator([step], false)}`
          });
          break;
        }
      } catch (err) {
        failedStepIndex = idx;
        analysisSteps.push({
          stepText: stringifyLocator([step], false),
          success: false,
          matchCount: 0,
          reason: `Evaluation failed: ${err.message}`
        });
        break;
      }
    }
    const suggestions = [];
    let message = "Locator execution broke at step: " + ((_a = steps[failedStepIndex]) == null ? void 0 : _a.name);
    if (failedStepIndex !== -1 && lastValidLocator) {
      const failedStep = steps[failedStepIndex];
      if (failedStep.name === "getByRole") {
        const expectedRole = failedStep.args[0];
        const options = failedStep.args[1] || {};
        const expectedName = options.name;
        try {
          const handles = await lastValidLocator.elementHandles();
          const foundElementsInfo = [];
          for (const handle of handles) {
            const childInfo = await handle.evaluate((el) => {
              const children = Array.from(el.querySelectorAll("*"));
              return children.map((child) => {
                var _a2, _b2;
                const role = ((_a2 = window.__locatorLensAgent.getElementInfo(child)) == null ? void 0 : _a2.role) || "";
                const accName = ((_b2 = window.__locatorLensAgent.getElementInfo(child)) == null ? void 0 : _b2.accessibleName) || "";
                return { role, accessibleName: accName, tagName: child.tagName.toLowerCase() };
              }).filter((c) => c.role && c.role !== "generic");
            });
            foundElementsInfo.push(...childInfo);
          }
          const sameRoleElements = foundElementsInfo.filter((c) => c.role === expectedRole);
          if (sameRoleElements.length > 0) {
            message = `Role "${expectedRole}" exists, but accessible name did not match.`;
            sameRoleElements.forEach((item) => {
              if (item.accessibleName) {
                suggestions.push({
                  selector: `${currentLocatorStr}.getByRole('${expectedRole}', { name: '${item.accessibleName}' })`,
                  type: "getByRole",
                  confidence: 90,
                  reason: `Matches role "${expectedRole}" with actual name "${item.accessibleName}".`
                });
                if (expectedName && typeof expectedName === "string") {
                  const cleanedExpected = expectedName.trim().toLowerCase();
                  const cleanedActual = item.accessibleName.trim().toLowerCase();
                  if (cleanedActual.includes(cleanedExpected)) {
                    suggestions.push({
                      selector: `${currentLocatorStr}.getByRole('${expectedRole}', { name: /${expectedName}/i })`,
                      type: "getByRole",
                      confidence: 92,
                      reason: `Partial regex match for "${expectedName}".`
                    });
                  }
                }
              }
            });
          } else {
            message = `No elements with role "${expectedRole}" exist inside the container.`;
            foundElementsInfo.slice(0, 5).forEach((item) => {
              suggestions.push({
                selector: `${currentLocatorStr}.getByRole('${item.role}', { name: '${item.accessibleName}' })`,
                type: "getByRole",
                confidence: 70,
                reason: `Alternative child element found: role "${item.role}" name "${item.accessibleName}".`
              });
            });
          }
          analysisSteps[analysisSteps.length - 1].foundElementsInfo = foundElementsInfo;
        } catch {
        }
      }
      if (failedStep.name === "getByLabel" || failedStep.name === "getByPlaceholder" || failedStep.name === "getByText") {
        const expectedText = failedStep.args[0];
        try {
          const handles = await lastValidLocator.elementHandles();
          const labelsFound = [];
          for (const handle of handles) {
            const list = await handle.evaluate((el) => {
              const all = Array.from(el.querySelectorAll("*"));
              return all.map((child) => {
                var _a2;
                const info = window.__locatorLensAgent.getElementInfo(child);
                const agent = window.__locatorLensAgent;
                return {
                  label: (info == null ? void 0 : info.accessibleName) || "",
                  placeholder: child.getAttribute("placeholder") || "",
                  text: agent && agent.getCleanText ? agent.getCleanText(child).trim() : ((_a2 = child.textContent) == null ? void 0 : _a2.trim()) || "",
                  tagName: child.tagName.toLowerCase()
                };
              });
            });
            list.forEach((item) => {
              if (failedStep.name === "getByLabel" && item.label) labelsFound.push(item.label);
              if (failedStep.name === "getByPlaceholder" && item.placeholder) labelsFound.push(item.placeholder);
              if (failedStep.name === "getByText" && item.text) labelsFound.push(item.text);
            });
          }
          if (labelsFound.length > 0 && typeof expectedText === "string") {
            const query = expectedText.trim().toLowerCase();
            labelsFound.forEach((lbl) => {
              if (lbl.toLowerCase().includes(query)) {
                suggestions.push({
                  selector: `${currentLocatorStr}.${failedStep.name}(/${expectedText}/i)`,
                  type: "locator",
                  // fallback type
                  confidence: 85,
                  reason: `Regex partial match suggestion for "${lbl}".`
                });
              }
            });
            message = `Text/Label mismatch. Expected label like "${expectedText}" but found: [${labelsFound.slice(0, 3).join(", ")}]`;
          }
        } catch {
        }
      }
    } else {
      message = `Root locator step failed: ${(_b = steps[0]) == null ? void 0 : _b.name}`;
      try {
        const selector = steps[0].args[0];
        if (steps[0].name === "locator" && typeof selector === "string") {
          const allTextMatches = await page.evaluate((s) => {
            const results = [];
            const tags = Array.from(document.querySelectorAll("*"));
            for (const t of tags) {
              const info = window.__locatorLensAgent.getElementInfo(t);
              if ((info == null ? void 0 : info.id) === s || (info == null ? void 0 : info.className) === s) {
                results.push(t);
              }
            }
            return results.map((r) => window.__locatorLensAgent.generateAlternatives(r)[0]).filter(Boolean);
          }, selector);
          allTextMatches.slice(0, 3).forEach((alt) => {
            suggestions.push({
              selector: alt.selector,
              type: alt.type,
              confidence: 80,
              reason: `Found element matching "${selector}" as an ID/class directly.`
            });
          });
        }
      } catch {
      }
    }
    return {
      message,
      steps: analysisSteps,
      suggestedAlternatives: suggestions
    };
  }
};

// src/sidebarProvider.ts
var SidebarProvider = class {
  constructor(_extensionUri) {
    this._extensionUri = _extensionUri;
  }
  _extensionUri;
  _view;
  engine = new LocatorEngine();
  activePageId;
  resolveWebviewView(webviewView, context, _token) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (data) => {
      var _a;
      try {
        switch (data.type) {
          case "connect-browser": {
            try {
              const pages = await this.engine.connect(data.cdpUrl);
              const activePageId = (_a = pages[0]) == null ? void 0 : _a.id;
              this.activePageId = activePageId;
              webviewView.webview.postMessage({
                type: "connect-status",
                connected: true,
                cdpUrl: data.cdpUrl,
                pages,
                activePageId
              });
            } catch (err) {
              webviewView.webview.postMessage({
                type: "connect-status",
                connected: false,
                error: err.message
              });
            }
            break;
          }
          case "disconnect-browser": {
            await this.engine.disconnect();
            this.activePageId = void 0;
            webviewView.webview.postMessage({
              type: "connect-status",
              connected: false
            });
            break;
          }
          case "select-page": {
            this.activePageId = data.pageId;
            break;
          }
          case "evaluate-locator": {
            if (!this.activePageId) {
              webviewView.webview.postMessage({
                type: "evaluation-result",
                result: {
                  success: false,
                  error: "Please connect to a browser and select a tab/page first."
                }
              });
              return;
            }
            const result = await this.engine.evaluate(this.activePageId, data.locatorStr);
            webviewView.webview.postMessage({
              type: "evaluation-result",
              result
            });
            break;
          }
          case "highlight-locator": {
            if (!this.activePageId) return;
            await this.engine.highlight(this.activePageId, data.locatorStr, data.scrollIndex);
            break;
          }
          case "clear-highlight": {
            if (!this.activePageId) return;
            await this.engine.clearHighlight(this.activePageId);
            break;
          }
          case "get-autocomplete-data": {
            if (!this.activePageId) return;
            try {
              const result = await this.engine.getAutocompleteData(this.activePageId);
              webviewView.webview.postMessage({
                type: "autocomplete-data",
                data: result
              });
            } catch (err) {
              webviewView.webview.postMessage({
                type: "autocomplete-data",
                data: { roles: [], testIds: [], placeholders: [], labels: [], texts: [] }
              });
            }
            break;
          }
          // Phase 3 — .or() Chain Tree Analyzer
          case "analyze-chain": {
            if (!this.activePageId) return;
            try {
              const result = await this.engine.analyzeChain(this.activePageId, data.locatorStr);
              webviewView.webview.postMessage({ type: "chain-analysis-result", result });
            } catch (err) {
              webviewView.webview.postMessage({
                type: "chain-analysis-result",
                result: { success: false, error: err.message, branches: [], totalMatches: 0 }
              });
            }
            break;
          }
          // Phase 7 — Stability Testing
          case "stability-test": {
            if (!this.activePageId) return;
            try {
              const result = await this.engine.stabilityTest(
                this.activePageId,
                data.locatorStr,
                data.runs || 5
              );
              webviewView.webview.postMessage({ type: "stability-result", result });
            } catch (err) {
              webviewView.webview.postMessage({
                type: "stability-result",
                result: { success: false, error: err.message, runs: [], score: 0, locatorStr: data.locatorStr }
              });
            }
            break;
          }
          // Phase 8 — Form Scanner
          case "scan-forms": {
            if (!this.activePageId) return;
            try {
              const forms = await this.engine.scanForms(this.activePageId);
              webviewView.webview.postMessage({ type: "form-scan-result", forms });
            } catch (err) {
              webviewView.webview.postMessage({
                type: "form-scan-result",
                forms: [],
                error: err.message
              });
            }
            break;
          }
        }
      } catch (err) {
        console.error("Unhandled error in webview message handler:", err);
        if (data.type === "evaluate-locator") {
          webviewView.webview.postMessage({
            type: "evaluation-result",
            result: {
              success: false,
              error: `Internal Extension Error: ${err.message || err}`
            }
          });
        } else if (data.type === "connect-browser") {
          webviewView.webview.postMessage({
            type: "connect-status",
            connected: false,
            error: `Internal Connection Error: ${err.message || err}`
          });
        }
      }
    });
    webviewView.onDidDispose(() => {
      this.engine.disconnect();
    });
  }
  _getHtmlForWebview(webview) {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, "webview", "index.html");
    let html = fs.readFileSync(htmlPath.fsPath, "utf8");
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "webview", "style.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "webview", "main.js"));
    html = html.replace(/\$\{styleUri\}/g, styleUri.toString());
    html = html.replace(/\$\{scriptUri\}/g, scriptUri.toString());
    return html;
  }
};

// src/extension.ts
function activate(context) {
  const sidebarProvider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode2.window.registerWebviewViewProvider(
      "playwright-locator-lens-sidebar",
      sidebarProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );
  context.subscriptions.push(
    vscode2.commands.registerCommand("playwright-locator-lens.focusSidebar", () => {
      vscode2.commands.executeCommand("workbench.view.extension.playwright-locator-lens-container");
    })
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
