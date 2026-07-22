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
var path = __toESM(require("path"));
var os = __toESM(require("os"));
var child_process = __toESM(require("child_process"));
var http = __toESM(require("http"));

// ../engine/src/index.ts
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
      if (i + 1 < str.length && str[i + 1] === "/") {
        i += 2;
        while (i < str.length && str[i] !== "\n" && str[i] !== "\r") {
          i++;
        }
        continue;
      }
      if (i + 1 < str.length && str[i + 1] === "*") {
        i += 2;
        while (i < str.length) {
          if (str[i] === "*" && i + 1 < str.length && str[i + 1] === "/") {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }
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
    if (token.type === "IDENTIFIER") {
      return this.parseNestedLocator();
    }
    throw new Error(`Unsupported expression type: ${token.type}`);
  }
  parseNestedLocator() {
    let hasPagePrefix = false;
    const steps = [];
    if (this.peek().type === "IDENTIFIER" && this.peek().value === "page") {
      this.consume();
      hasPagePrefix = true;
      if (this.peek().type === "DOT") {
        this.consume();
      }
    }
    while (this.peek().type === "IDENTIFIER") {
      const step = this.parseMethodCall();
      steps.push(step);
      if (this.peek().type === "DOT") {
        this.consume();
      } else {
        break;
      }
    }
    return { type: "nested_locator", steps, hasPagePrefix };
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
    if (arg.type === "nested_locator") {
      return stringifyLocator(arg.steps, arg.hasPagePrefix);
    }
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

    simulateHover(el) {
      if (!el) return false;
      try {
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        
        el.dispatchEvent(new MouseEvent('mouseenter', { clientX, clientY, bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseover', { clientX, clientY, bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true, cancelable: true }));
        return true;
      } catch (e) {
        return false;
      }
    },

    // Phase 8 \u2014 Form-Aware Analysis
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

        // Build the best suggested locator \u2014 prefer semantic, human-readable selectors
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
            // Role without name \u2014 add type context for inputs
            if (tag === 'input' && inputType && inputType !== 'text') {
              suggestedLocator = "locator('input[type=\\"" + inputType + "\\"]')";
            } else {
              suggestedLocator = "getByRole('" + role + "')";
            }
          }
        } else if (id && !isDynamicId(id)) {
          // Stable ID
          suggestedLocator = "locator('#" + id + "')";
        } else if (name && !isDynamicId(name)) {
          // Use name attribute as a reliable selector
          suggestedLocator = "locator('[name=\\"" + name + "\\"]')";
        } else if (tag === 'input' && inputType) {
          // Input with type
          suggestedLocator = "locator('input[type=\\"" + inputType + "\\"]')";
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
          const classes = el.className.split(/s+/).filter(c => c && !c.startsWith('_') && !c.includes('style'));
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

// ../engine/src/index.ts
var ALLOWED_LOCATOR_METHODS = /* @__PURE__ */ new Set([
  "locator",
  "getByRole",
  "getByText",
  "getByLabel",
  "getByPlaceholder",
  "getByAltText",
  "getByTitle",
  "getByTestId",
  "first",
  "last",
  "nth",
  "filter",
  "or",
  "and"
]);
function resolveArg(arg, page) {
  if (arg && typeof arg === "object") {
    if (arg.type === "nested_locator") {
      return constructLocator(page, arg.steps);
    }
    if (arg.source !== void 0 && arg.flags !== void 0) {
      return new RegExp(arg.source, arg.flags);
    }
    if (arg instanceof RegExp) {
      return arg;
    }
    const resolvedObj = {};
    for (const [k, v] of Object.entries(arg)) {
      resolvedObj[k] = resolveArg(v, page);
    }
    return resolvedObj;
  }
  return arg;
}
function constructLocator(page, steps) {
  let current = page;
  for (const step of steps) {
    if (!ALLOWED_LOCATOR_METHODS.has(step.name)) {
      throw new Error(`Forbidden or unsupported locator method: ${step.name}`);
    }
    const method = current[step.name];
    if (typeof method !== "function") {
      throw new Error(`Method ${step.name} is not available on current locator target.`);
    }
    const resolvedArgs = step.args.map((arg) => resolveArg(arg, page));
    current = method.apply(current, resolvedArgs);
  }
  return current;
}
function toCamelCase(str) {
  const parts = str.split(/[^a-zA-Z0-9]+|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map((p, idx) => {
    const cleaned = p.replace(/[^a-zA-Z0-9]/g, "");
    if (idx === 0) {
      return cleaned.toLowerCase();
    }
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  }).join("");
}
function toPascalCase(str) {
  const parts = str.split(/[^a-zA-Z0-9]+|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map((p) => {
    const cleaned = p.replace(/[^a-zA-Z0-9]/g, "");
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  }).join("");
}
function cleanNodeName(name) {
  let cleaned = name;
  cleaned = cleaned.replace(/(Defaults|Default|Section|Form|Card|Panel|Group|Container|Wrapper|Box)$/i, "");
  cleaned = cleaned.replace(/\s+[A-Z]$/, "");
  cleaned = cleaned.replace(/([a-z])([A-Z])$/, "$1");
  return cleaned.trim() || name;
}
var LocatorEngine = class {
  browser = null;
  pages = /* @__PURE__ */ new Map();
  cdpUrl = "";
  async connect(cdpUrl) {
    this.cdpUrl = cdpUrl;
    if (this.browser) {
      await this.disconnect();
    }
    this.browser = await import_playwright_core.chromium.connectOverCDP(cdpUrl, { timeout: 3e4 });
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
  /** Soft disconnect — drops internal state but leaves Chrome running. */
  softDisconnect() {
    this.browser = null;
    this.pages.clear();
  }
  /** Re-list all open tabs from the currently connected browser. */
  async getPages() {
    if (!this.browser) {
      throw new Error("Not connected to a browser.");
    }
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
  getPage(id) {
    return this.pages.get(id);
  }
  async ensureAgentInjected(page) {
    try {
      const isInjected = await page.evaluate(() => typeof window.__locatorLensAgent !== "undefined");
      if (!isInjected) {
        await page.evaluate(AGENT_SCRIPT);
      }
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
      let parseErrMsg = err.message;
      if (parseErrMsg.includes("Expected token LPAREN, but got DOT") || parseErrMsg.includes("Expected token LPAREN")) {
        if (/\.or\s*\./.test(locatorStr) || /\.or\s*$/.test(locatorStr)) {
          parseErrMsg = `Syntax Error: ".or" must be called as a method with an argument, e.g.:
.or(locator('...'))

Incorrect: .or.locator('...')  \u2190  missing parentheses and argument
Correct:   .or(locator('...'))  \u2190  pass the alternative locator as argument`;
        }
      }
      return {
        success: false,
        error: `Syntax Parsing Error: ${parseErrMsg}`,
        count: 0,
        elements: [],
        confidence: 0,
        confidenceFactors: [{ text: "Invalid Syntax", positive: false }],
        alternatives: []
      };
    }
    let locatorInstance;
    try {
      if (parsedSteps.length === 0) {
        throw new Error("Locator expression contains no steps.");
      }
      locatorInstance = constructLocator(page, parsedSteps);
      if (!locatorInstance || typeof locatorInstance.count !== "function") {
        throw new Error("Expression did not evaluate to a Playwright Locator instance.");
      }
    } catch (err) {
      let evalErrMsg = err.message;
      if (evalErrMsg.includes("reading '_frame'") || evalErrMsg.includes("reading '_selector'") || parsedSteps.some((s) => s.name === "or" && s.args.length === 0)) {
        evalErrMsg = `.or() requires another locator as an argument, e.g. .or(locator('...'))`;
      }
      return {
        success: false,
        error: `Evaluation Error: ${evalErrMsg}`,
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
      const parsedSteps = parseLocator(locatorStr);
      if (parsedSteps.length === 0) return false;
      const locatorInstance = constructLocator(page, parsedSteps);
      const count = await locatorInstance.count();
      if (count === 0) {
        return false;
      }
      const type = count === 1 ? "success" : "warning";
      await locatorInstance.evaluateAll((elems, [hlType, scrollIdx]) => {
        if (window.__locatorLensAgent) {
          window.__locatorLensAgent.highlight(elems, hlType, scrollIdx);
        }
      }, [type, scrollIndex]);
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
        const parsedSteps = parseLocator(branchExpr);
        if (parsedSteps.length === 0) {
          throw new Error("Branch expression contains no steps.");
        }
        const locatorInstance = constructLocator(page, parsedSteps);
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
    let i = 0;
    let current = "";
    let parenDepth = 0;
    let inQuote = null;
    let isEscaped = false;
    let insideOr = false;
    while (i < normalized.length) {
      const char = normalized[i];
      if (isEscaped) {
        current += char;
        isEscaped = false;
        i++;
        continue;
      }
      if (char === "\\") {
        current += char;
        isEscaped = true;
        i++;
        continue;
      }
      if (inQuote) {
        if (char === inQuote) {
          inQuote = null;
        }
        current += char;
        i++;
        continue;
      }
      if (char === "'" || char === '"' || char === "`") {
        inQuote = char;
        current += char;
        i++;
        continue;
      }
      if (!insideOr && parenDepth === 0 && char === "." && normalized.slice(i, i + 4) === ".or(") {
        if (current.trim()) {
          branches.push(current.trim());
        }
        current = "";
        i += 4;
        insideOr = true;
        parenDepth = 1;
        continue;
      }
      if (char === "(") {
        parenDepth++;
      } else if (char === ")") {
        if (insideOr && parenDepth === 1) {
          insideOr = false;
          parenDepth = 0;
          if (current.trim()) {
            branches.push(current.trim());
          }
          current = "";
          i++;
          continue;
        }
        parenDepth = Math.max(0, parenDepth - 1);
      }
      current += char;
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
        const parsedSteps = parseLocator(locatorStr);
        if (parsedSteps.length === 0) {
          throw new Error("Locator expression contains no steps.");
        }
        const locatorInstance = constructLocator(page, parsedSteps);
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
  // Phase 5 — Field Simulation Engine
  // ─────────────────────────────────────────────────────────────
  async simulateFill(pageId, locatorStr, value) {
    const page = this.getPage(pageId);
    if (!page) return false;
    try {
      await this.ensureAgentInjected(page);
      const parsedSteps = parseLocator(locatorStr);
      if (parsedSteps.length === 0) return false;
      const locatorInstance = constructLocator(page, parsedSteps);
      const handle = await locatorInstance.elementHandle();
      if (!handle) return false;
      return await page.evaluate(([el, val]) => {
        return window.__locatorLensAgent.simulateFill(el, val);
      }, [handle, value]);
    } catch (err) {
      console.error("Failed to simulate fill:", err);
      return false;
    }
  }
  async simulateClick(pageId, locatorStr, x, y) {
    const page = this.getPage(pageId);
    if (!page) return false;
    try {
      await this.ensureAgentInjected(page);
      const parsedSteps = parseLocator(locatorStr);
      if (parsedSteps.length === 0) return false;
      const locatorInstance = constructLocator(page, parsedSteps);
      const handle = await locatorInstance.elementHandle();
      if (!handle) return false;
      return await page.evaluate(([el, clickX, clickY]) => {
        return window.__locatorLensAgent.simulateClick(el, clickX, clickY);
      }, [handle, x, y]);
    } catch (err) {
      console.error("Failed to simulate click:", err);
      return false;
    }
  }
  async simulateHover(pageId, locatorStr) {
    const page = this.getPage(pageId);
    if (!page) return false;
    try {
      await this.ensureAgentInjected(page);
      const parsedSteps = parseLocator(locatorStr);
      if (parsedSteps.length === 0) return false;
      const locatorInstance = constructLocator(page, parsedSteps);
      const handle = await locatorInstance.elementHandle();
      if (!handle) return false;
      return await page.evaluate((el) => {
        return window.__locatorLensAgent.simulateHover(el);
      }, handle);
    } catch (err) {
      console.error("Failed to simulate hover:", err);
      return false;
    }
  }
  // ─────────────────────────────────────────────────────────────
  // Phase 6 — Bulk Stability Testing
  // ─────────────────────────────────────────────────────────────
  async bulkStabilityTest(pageId, locatorStrs, runs = 3) {
    const page = this.getPage(pageId);
    if (!page) {
      throw new Error("Page not found.");
    }
    const results = {};
    const foundCounts = {};
    locatorStrs.forEach((loc) => {
      results[loc] = [];
      foundCounts[loc] = 0;
    });
    for (let r = 0; r < runs; r++) {
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 3e4 });
        try {
          await this.ensureAgentInjected(page);
        } catch {
        }
        for (const locatorStr of locatorStrs) {
          try {
            const parsedSteps = parseLocator(locatorStr);
            if (parsedSteps.length === 0) {
              throw new Error("Locator expression contains no steps.");
            }
            const locatorInstance = constructLocator(page, parsedSteps);
            const count = await locatorInstance.count();
            const found = count > 0;
            if (found) {
              foundCounts[locatorStr]++;
            }
            results[locatorStr].push({ run: r + 1, found, matchCount: count });
          } catch (err) {
            results[locatorStr].push({ run: r + 1, found: false, matchCount: 0, error: err.message });
          }
        }
      } catch (err) {
        locatorStrs.forEach((locatorStr) => {
          results[locatorStr].push({ run: r + 1, found: false, matchCount: 0, error: `Reload failed: ${err.message}` });
        });
      }
    }
    const finalResults = {};
    locatorStrs.forEach((locatorStr) => {
      const score = Math.round(foundCounts[locatorStr] / runs * 100);
      finalResults[locatorStr] = {
        success: true,
        runs: results[locatorStr],
        score,
        locatorStr
      };
    });
    return finalResults;
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
  // ─────────────────────────────────────────────────────────────
  // UI Intelligence Scanner
  // ─────────────────────────────────────────────────────────────
  async scanUI(pageId) {
    const page = this.getPage(pageId);
    if (!page) {
      throw new Error("Page not found.");
    }
    await this.ensureAgentInjected(page);
    const scanResult = await page.evaluate(() => {
      return window.__locatorLensAgent.scanUI();
    });
    return scanResult;
  }
  generatePOMExport(tree, customClassName, sectionNaming) {
    const lines = [];
    lines.push("import { Page, Locator } from '@playwright/test';\n");
    const pageNode = tree.find((n) => n.type === "page") || tree[0];
    const rawClassName = customClassName || (pageNode ? pageNode.name : "ScannedPage");
    const className = toPascalCase(rawClassName) + (rawClassName.endsWith("Page") ? "" : "Page");
    lines.push(`export class ${className} {`);
    lines.push(`  readonly page: Page;`);
    const declarations = [];
    const initializers = [];
    const seenProperties = /* @__PURE__ */ new Set();
    function getUniquePropName(node, parentNode) {
      let baseName = node.name;
      if (node.parentSectionName) {
        const sectionClean = cleanNodeName(node.parentSectionName);
        if (sectionNaming === "prefix") {
          baseName = sectionClean + " " + baseName;
        } else if (sectionNaming === "suffix") {
          baseName = baseName + " " + sectionClean;
        }
      }
      let name = toCamelCase(cleanNodeName(baseName));
      if (!name) name = "element";
      if (seenProperties.has(name) && (parentNode == null ? void 0 : parentNode.name)) {
        const parentClean = toPascalCase(cleanNodeName(parentNode.name));
        name = toCamelCase(parentClean + toPascalCase(name));
      }
      let finalName = name;
      let counter = 2;
      while (seenProperties.has(finalName)) {
        finalName = `${name}${counter}`;
        counter++;
      }
      seenProperties.add(finalName);
      return finalName;
    }
    function traverse(node, parentVar = "page", parentNode) {
      const type = node.type;
      if (type === "section" || type === "subsection" || type === "dialog" || type === "table" || type === "grid") {
        const varName = getUniquePropName(node, parentNode);
        declarations.push(`  readonly ${varName}: Locator;`);
        initializers.push(`    this.${varName} = ${parentVar}.${node.locator};`);
        node.children.forEach((c) => traverse(c, `this.${varName}`, node));
        return;
      } else if (type === "field" || type === "image" || type === "svg" || type === "canvas" || type === "rte") {
        const varName = getUniquePropName(node, parentNode);
        declarations.push(`  readonly ${varName}: Locator;`);
        initializers.push(`    this.${varName} = ${parentVar}.${node.locator};`);
      }
      node.children.forEach((c) => traverse(c, parentVar, parentNode));
    }
    tree.forEach((n) => traverse(n));
    lines.push(declarations.join("\n"));
    lines.push("\n  constructor(page: Page) {");
    lines.push("    this.page = page;");
    lines.push(initializers.join("\n"));
    lines.push("  }");
    lines.push("}");
    return lines.join("\n");
  }
  generateSDKExport(tree) {
    const code = `import { Page, Locator } from '@playwright/test';

export class UIAutomationSDK {
  constructor(public readonly page: Page) {}

  /**
   * Scoped section finder
   */
  getSection(name: string): Locator {
    return this.page.locator('fieldset, section, [role="region"], [role="group"], .card, .panel')
      .filter({ has: this.page.locator('legend, h1, h2, h3, h4, h5, h6, [aria-label]').filter({ hasText: name }) })
      .first();
  }

  /**
   * Generic API to interact with any field by its section and label
   */
  async fillField(options: { section?: string; label: string; value: string }) {
    let scope = options.section ? this.getSection(options.section) : this.page;
    const field = scope.getByLabel(options.label)
      .or(scope.getByPlaceholder(options.label))
      .or(scope.getByRole('textbox', { name: options.label }))
      .or(scope.locator('input, textarea, select').filter({ hasText: options.label }));
    await field.first().fill(options.value);
  }

  /**
   * Generic API to click a button in a section
   */
  async clickButton(options: { section?: string; label: string }) {
    let scope = options.section ? this.getSection(options.section) : this.page;
    const btn = scope.getByRole('button', { name: options.label })
      .or(scope.getByText(options.label))
      .or(scope.locator('button, a, [role="button"]').filter({ hasText: options.label }));
    await btn.first().click();
  }

  /**
   * Generic API to read table cells
   */
  async getTableCell(options: { tableSection: string; rowIndex: number; columnName: string }): Promise<string> {
    const tableScope = this.getSection(options.tableSection);
    const headers = await tableScope.locator('th, [role="columnheader"]').allTextContents();
    const colIndex = headers.indexOf(options.columnName);
    if (colIndex === -1) {
      throw new Error(\`Column "\${options.columnName}" not found in table "\${options.tableSection}". Available columns: \${headers.join(', ')}\`);
    }
    const cell = tableScope.locator('tr, [role="row"]').nth(options.rowIndex + 1).locator('td, [role="gridcell"]').nth(colIndex);
    return (await cell.innerText()).trim();
  }
}
`;
    return code;
  }
  generateTSInterfacesExport(tree, sectionNaming) {
    const lines = [];
    const seenInterfaces = /* @__PURE__ */ new Set();
    function getFieldName(f) {
      let baseName = f.name;
      if (f.parentSectionName) {
        const sectionClean = cleanNodeName(f.parentSectionName);
        if (sectionNaming === "prefix") {
          baseName = sectionClean + " " + baseName;
        } else if (sectionNaming === "suffix") {
          baseName = baseName + " " + sectionClean;
        }
      }
      return toCamelCase(cleanNodeName(baseName));
    }
    function traverse(node) {
      const fields = node.children.filter((c) => c.type === "field");
      if (fields.length > 0) {
        const cleanName = toPascalCase(cleanNodeName(node.name));
        let interfaceName = cleanName + "Data";
        let finalName = interfaceName;
        let counter = 2;
        while (seenInterfaces.has(finalName)) {
          finalName = `${cleanName}${counter}Data`;
          counter++;
        }
        seenInterfaces.add(finalName);
        lines.push(`export interface ${finalName} {`);
        fields.forEach((f) => {
          const cleanFieldName = getFieldName(f);
          if (cleanFieldName) {
            lines.push(`  ${cleanFieldName}?: string;`);
          }
        });
        lines.push("}\n");
      }
      node.children.forEach((c) => {
        if (c.type !== "field") {
          traverse(c);
        }
      });
    }
    tree.forEach((n) => traverse(n));
    if (lines.length === 0) {
      lines.push("export interface PageData {\n  [key: string]: any;\n}");
    }
    return lines.join("\n");
  }
  generateJSONSchemaExport(tree) {
    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {},
      required: []
    };
    function traverse(node, currentProps) {
      if (node.type === "section" || node.type === "subsection" || node.type === "dialog") {
        const sectionProps = {
          type: "object",
          properties: {},
          required: []
        };
        const fields = node.children.filter((c) => c.type === "field");
        fields.forEach((f) => {
          var _a;
          sectionProps.properties[f.name] = {
            type: "string",
            description: `Field: ${f.name}, Locator: ${f.locator}`
          };
          if ((_a = f.meta) == null ? void 0 : _a.required) {
            sectionProps.required.push(f.name);
          }
        });
        if (fields.length > 0) {
          currentProps[node.name] = sectionProps;
        }
        node.children.forEach((c) => traverse(c, sectionProps.properties));
      } else {
        node.children.forEach((c) => traverse(c, currentProps));
      }
    }
    tree.forEach((n) => traverse(n, schema.properties));
    if (Object.keys(schema.properties).length === 0) {
      schema.properties.fields = {
        type: "object",
        additionalProperties: { type: "string" }
      };
    }
    return JSON.stringify(schema, null, 2);
  }
  generateYAMLExport(tree) {
    const lines = [];
    function traverse(node, indent = 0) {
      const pad = " ".repeat(indent);
      lines.push(`${pad}- name: "${node.name.replace(/"/g, '\\"')}"`);
      lines.push(`${pad}  type: "${node.type}"`);
      lines.push(`${pad}  locator: "${node.locator.replace(/"/g, '\\"')}"`);
      if (node.children.length > 0) {
        lines.push(`${pad}  children:`);
        node.children.forEach((c) => traverse(c, indent + 4));
      }
    }
    lines.push("page_structure:");
    tree.forEach((n) => traverse(n, 2));
    return lines.join("\n");
  }
  calculateConfidence(locatorStr, count, el, steps) {
    const factors = [];
    let score = 50;
    if (locatorStr.includes("getByTestId")) {
      score = 98;
      factors.push({ text: "Uses stable data-testid locator", positive: true });
    } else if (locatorStr.includes("getByLabel")) {
      score = 95;
      factors.push({ text: "Uses getByLabel standard form query", positive: true });
    } else if (locatorStr.includes("getByRole") && (locatorStr.includes("name:") || locatorStr.includes("name :"))) {
      score = 92;
      factors.push({ text: "Uses getByRole with accessible name filter", positive: true });
    } else if (locatorStr.includes("getByPlaceholder") || locatorStr.includes("getByAltText") || locatorStr.includes("getByTitle")) {
      score = 85;
      factors.push({ text: "Uses accessible attribute locator", positive: true });
    } else if (locatorStr.includes("getByText")) {
      score = 80;
      factors.push({ text: "Uses getByText content match", positive: true });
    } else if (locatorStr.includes("getByRole")) {
      score = 75;
      factors.push({ text: "Uses getByRole without name filter", positive: true });
    } else if (locatorStr.includes("locator(")) {
      const cssMatch = locatorStr.match(/locator\(\s*['"`](.*?)['"`]\s*\)/);
      if (cssMatch) {
        const selector = cssMatch[1];
        if (selector.startsWith("#") && !selector.includes(" ") && !selector.includes(">")) {
          score = 85;
          factors.push({ text: "Uses CSS ID locator", positive: true });
        } else if (selector.startsWith("//") || selector.startsWith("xpath=")) {
          score = 40;
          factors.push({ text: "Uses XPath locator (fragile to structure)", positive: false });
        } else {
          score = 55;
          factors.push({ text: "Uses CSS path selector", positive: false });
        }
      }
    }
    if (count === 1) {
      factors.push({ text: "Single unique match", positive: true });
    } else if (count > 1) {
      score = Math.max(0, score - 15);
      factors.push({ text: `Multiple matches found (${count}) \u2014 not unique`, positive: false });
    } else {
      score = 0;
      factors.push({ text: "No matching elements found", positive: false });
    }
    if (el == null ? void 0 : el.visible) {
      factors.push({ text: "Element is visible on screen", positive: true });
    } else if (el) {
      score = Math.max(0, score - 8);
      factors.push({ text: "Element is hidden/invisible", positive: false });
    }
    if (el == null ? void 0 : el.id) {
      const isDynamic = /(mui|ag-|grid-|ng-|val-|id-|ember|k-|dx-)/i.test(el.id) || /^[0-9]+$/.test(el.id) || /[0-9]{4,}/.test(el.id);
      if (isDynamic && locatorStr.includes(`#${el.id}`)) {
        score = Math.max(0, score - 20);
        factors.push({ text: "Uses generated/dynamic element ID", positive: false });
      }
    }
    if (/\.(nth|first|last)\(/.test(locatorStr) || locatorStr.includes(":nth-child") || locatorStr.includes(":nth-of-type")) {
      score = Math.max(0, score - 12);
      factors.push({ text: "Uses index filters (fragile to page list changes)", positive: false });
    }
    const fragileCheck = this.hasFragileNameFilter(steps);
    if (fragileCheck.fragile) {
      score = Math.max(0, score - 40);
      factors.push({ text: fragileCheck.reason, positive: false });
    }
    const confidence = Math.max(0, Math.min(100, Math.round(score)));
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
    var _a;
    const analysisSteps = [];
    let currentLocatorStr = "page";
    let lastValidLocator = null;
    let failedStepIndex = -1;
    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];
      const nextLocatorStr = `${currentLocatorStr}.${stringifyLocator([step], false)}`;
      try {
        const parsedSteps = parseLocator(nextLocatorStr);
        if (parsedSteps.length === 0) {
          throw new Error("Locator expression contains no steps.");
        }
        const currentLocator = constructLocator(page, parsedSteps);
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
    let message = failedStepIndex !== -1 ? "Locator execution broke at step: " + ((_a = steps[failedStepIndex]) == null ? void 0 : _a.name) : "Locator returned 0 elements.";
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
                var _a2, _b;
                const role = ((_a2 = window.__locatorLensAgent.getElementInfo(child)) == null ? void 0 : _a2.role) || "";
                const accName = ((_b = window.__locatorLensAgent.getElementInfo(child)) == null ? void 0 : _b.accessibleName) || "";
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
                  if (cleanedActual.includes(cleanedExpected) && cleanedActual !== cleanedExpected) {
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
                  confidence: 85,
                  reason: `Regex partial match suggestion for "${lbl}".`
                });
              }
            });
            message = `Text/Label mismatch. Expected "${expectedText}" but found: [${labelsFound.slice(0, 3).join(", ")}]`;
          }
        } catch {
        }
      }
      if (failedStep.name === "getByTestId") {
        const expectedId = String(failedStep.args[0] || "");
        try {
          const handles = await lastValidLocator.elementHandles();
          const foundTestIds = [];
          for (const handle of handles) {
            const ids = await handle.evaluate((el) => {
              const testIdAttrs = ["data-testid", "data-test-id", "data-test", "data-cy", "data-qa"];
              const all = Array.from(el.querySelectorAll("*"));
              const result = [];
              all.forEach((child) => {
                testIdAttrs.forEach((attr) => {
                  const val = child.getAttribute(attr);
                  if (val) result.push(val);
                });
              });
              return result;
            });
            foundTestIds.push(...ids);
          }
          const uniqueIds = [...new Set(foundTestIds)];
          if (uniqueIds.length > 0) {
            const closeMatches = uniqueIds.filter(
              (id) => id.toLowerCase().includes(expectedId.toLowerCase()) || expectedId.toLowerCase().includes(id.toLowerCase())
            );
            const candidates = closeMatches.length > 0 ? closeMatches : uniqueIds.slice(0, 5);
            message = closeMatches.length > 0 ? `Test ID "${expectedId}" not found \u2014 close matches exist in container.` : `Test ID "${expectedId}" not found. Available test IDs in container: [${uniqueIds.slice(0, 3).join(", ")}]`;
            candidates.forEach((id) => {
              suggestions.push({
                selector: `${currentLocatorStr}.getByTestId('${id}')`,
                type: "getByTestId",
                confidence: closeMatches.includes(id) ? 88 : 70,
                reason: `Test ID "${id}" found in container.`
              });
            });
          } else {
            message = `No elements with test ID attributes found inside the container.`;
          }
          analysisSteps[analysisSteps.length - 1].foundElementsInfo = uniqueIds.map((id) => ({ role: "testid", accessibleName: id }));
        } catch {
        }
      }
      if (failedStep.name === "getByAltText") {
        const expectedAlt = String(failedStep.args[0] || "");
        try {
          const handles = await lastValidLocator.elementHandles();
          const foundAlts = [];
          for (const handle of handles) {
            const alts = await handle.evaluate((el) => {
              const all = Array.from(el.querySelectorAll("[alt]"));
              return all.map((child) => child.getAttribute("alt") || "").filter(Boolean);
            });
            foundAlts.push(...alts);
          }
          const uniqueAlts = [...new Set(foundAlts)];
          if (uniqueAlts.length > 0) {
            message = `Alt text "${expectedAlt}" not found. Available alt texts: [${uniqueAlts.slice(0, 3).join(", ")}]`;
            const closeAlts = uniqueAlts.filter(
              (a) => a.toLowerCase().includes(expectedAlt.toLowerCase()) || expectedAlt.toLowerCase().includes(a.toLowerCase())
            );
            (closeAlts.length > 0 ? closeAlts : uniqueAlts.slice(0, 3)).forEach((alt) => {
              suggestions.push({
                selector: `${currentLocatorStr}.getByAltText('${alt}')`,
                type: "getByAltText",
                confidence: closeAlts.includes(alt) ? 88 : 70,
                reason: `Image with alt text "${alt}" found in container.`
              });
              suggestions.push({
                selector: `${currentLocatorStr}.getByAltText(/${alt}/i)`,
                type: "getByAltText",
                confidence: closeAlts.includes(alt) ? 85 : 65,
                reason: `Case-insensitive partial match for alt text "${alt}".`
              });
            });
          } else {
            message = `No elements with alt attributes found inside the container.`;
          }
        } catch {
        }
      }
      if (failedStep.name === "getByTitle") {
        const expectedTitle = String(failedStep.args[0] || "");
        try {
          const handles = await lastValidLocator.elementHandles();
          const foundTitles = [];
          for (const handle of handles) {
            const titles = await handle.evaluate((el) => {
              const all = Array.from(el.querySelectorAll("[title]"));
              return all.map((child) => child.getAttribute("title") || "").filter(Boolean);
            });
            foundTitles.push(...titles);
          }
          const uniqueTitles = [...new Set(foundTitles)];
          if (uniqueTitles.length > 0) {
            message = `Title "${expectedTitle}" not found. Available titles: [${uniqueTitles.slice(0, 3).join(", ")}]`;
            const closeTitles = uniqueTitles.filter(
              (t) => t.toLowerCase().includes(expectedTitle.toLowerCase()) || expectedTitle.toLowerCase().includes(t.toLowerCase())
            );
            (closeTitles.length > 0 ? closeTitles : uniqueTitles.slice(0, 3)).forEach((title) => {
              suggestions.push({
                selector: `${currentLocatorStr}.getByTitle('${title}')`,
                type: "getByTitle",
                confidence: closeTitles.includes(title) ? 88 : 70,
                reason: `Element with title "${title}" found in container.`
              });
              suggestions.push({
                selector: `${currentLocatorStr}.getByTitle(/${title}/i)`,
                type: "getByTitle",
                confidence: closeTitles.includes(title) ? 82 : 62,
                reason: `Case-insensitive partial match for title "${title}".`
              });
            });
          } else {
            message = `No elements with title attributes found inside the container.`;
          }
        } catch {
        }
      }
    } else {
      const rootStep = steps[0];
      message = `Root locator step failed: ${rootStep == null ? void 0 : rootStep.name}`;
      try {
        if ((rootStep == null ? void 0 : rootStep.name) === "locator" && typeof rootStep.args[0] === "string") {
          const selector = rootStep.args[0];
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
        } else if ((rootStep == null ? void 0 : rootStep.name) === "getByTestId") {
          const expectedId = String(rootStep.args[0] || "");
          const allIds = await page.evaluate(() => {
            const testIdAttrs = ["data-testid", "data-test-id", "data-test", "data-cy", "data-qa"];
            const found = [];
            document.querySelectorAll("*").forEach((el) => {
              testIdAttrs.forEach((attr) => {
                const val = el.getAttribute(attr);
                if (val) found.push(val);
              });
            });
            return [...new Set(found)];
          });
          if (allIds.length > 0) {
            message = `Test ID "${expectedId}" not found on page. Available test IDs: [${allIds.slice(0, 5).join(", ")}]`;
            const close = allIds.filter((id) => id.toLowerCase().includes(expectedId.toLowerCase()));
            (close.length > 0 ? close : allIds).slice(0, 3).forEach((id) => {
              suggestions.push({
                selector: `getByTestId('${id}')`,
                type: "getByTestId",
                confidence: close.includes(id) ? 85 : 60,
                reason: `Test ID "${id}" found on page.`
              });
            });
          } else {
            message = `No test ID attributes found anywhere on the page.`;
          }
        } else if ((rootStep == null ? void 0 : rootStep.name) === "getByAltText") {
          const expectedAlt = String(rootStep.args[0] || "");
          const allAlts = await page.evaluate(() => {
            const found = [];
            document.querySelectorAll("[alt]").forEach((el) => {
              const val = el.getAttribute("alt");
              if (val) found.push(val);
            });
            return [...new Set(found)];
          });
          if (allAlts.length > 0) {
            message = `Alt text "${expectedAlt}" not found on page. Available: [${allAlts.slice(0, 3).join(", ")}]`;
            const close = allAlts.filter((a) => a.toLowerCase().includes(expectedAlt.toLowerCase()));
            (close.length > 0 ? close : allAlts).slice(0, 3).forEach((alt) => {
              suggestions.push({
                selector: `getByAltText('${alt}')`,
                type: "getByAltText",
                confidence: close.includes(alt) ? 85 : 60,
                reason: `Image with alt text "${alt}" found on page.`
              });
            });
          } else {
            message = `No elements with alt attributes found on the page.`;
          }
        } else if ((rootStep == null ? void 0 : rootStep.name) === "getByTitle") {
          const expectedTitle = String(rootStep.args[0] || "");
          const allTitles = await page.evaluate(() => {
            const found = [];
            document.querySelectorAll("[title]").forEach((el) => {
              const val = el.getAttribute("title");
              if (val) found.push(val);
            });
            return [...new Set(found)];
          });
          if (allTitles.length > 0) {
            message = `Title "${expectedTitle}" not found on page. Available: [${allTitles.slice(0, 3).join(", ")}]`;
            const close = allTitles.filter((t) => t.toLowerCase().includes(expectedTitle.toLowerCase()));
            (close.length > 0 ? close : allTitles).slice(0, 3).forEach((title) => {
              suggestions.push({
                selector: `getByTitle('${title}')`,
                type: "getByTitle",
                confidence: close.includes(title) ? 85 : 60,
                reason: `Element with title "${title}" found on page.`
              });
            });
          } else {
            message = `No elements with title attributes found on the page.`;
          }
        } else if ((rootStep == null ? void 0 : rootStep.name) === "getByRole") {
          const expectedRole = String(rootStep.args[0] || "");
          const options = rootStep.args[1] || {};
          const allRoleElements = await page.evaluate((role) => {
            const all = Array.from(document.querySelectorAll("*"));
            const results = [];
            all.forEach((el) => {
              const info = window.__locatorLensAgent.getElementInfo(el);
              if ((info == null ? void 0 : info.role) === role) {
                results.push({ role: info.role, accessibleName: info.accessibleName });
              }
            });
            return results.slice(0, 5);
          }, expectedRole);
          if (allRoleElements.length > 0) {
            message = `Role "${expectedRole}" exists, but accessible name did not match.`;
            allRoleElements.forEach((item) => {
              if (item.accessibleName) {
                suggestions.push({
                  selector: `getByRole('${item.role}', { name: '${item.accessibleName}' })`,
                  type: "getByRole",
                  confidence: 80,
                  reason: `Element with role "${item.role}" and name "${item.accessibleName}" found on page.`
                });
              }
            });
          } else {
            message = `No elements with role "${expectedRole}" found on the page at all.`;
          }
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
  async performAction(pageId, locatorStr, action, args, timeoutMs = 5e3) {
    const page = this.getPage(pageId);
    if (!page) {
      return { success: false, error: "Page not found." };
    }
    try {
      const parsedSteps = parseLocator(locatorStr);
      if (parsedSteps.length === 0) {
        return { success: false, error: "Empty locator expression." };
      }
      const locatorInstance = constructLocator(page, parsedSteps);
      if (!locatorInstance) {
        return { success: false, error: "Failed to construct locator." };
      }
      const options = { timeout: timeoutMs };
      switch (action) {
        case "click":
          await locatorInstance.click(options);
          break;
        case "hover":
          await locatorInstance.hover(options);
          break;
        case "fill":
          if (args.length === 0 || typeof args[0] !== "string") {
            return { success: false, error: "Fill action requires a string value." };
          }
          await locatorInstance.fill(args[0], options);
          break;
        case "clear":
          await locatorInstance.clear(options);
          break;
        case "check":
          await locatorInstance.check(options);
          break;
        case "uncheck":
          await locatorInstance.uncheck(options);
          break;
        case "selectOption":
          await locatorInstance.selectOption(args[0], options);
          break;
        case "press":
          if (args.length === 0 || typeof args[0] !== "string") {
            return { success: false, error: "Press action requires a key string." };
          }
          await locatorInstance.press(args[0], options);
          break;
        case "focus":
          await locatorInstance.focus(options);
          break;
        case "scrollIntoView":
          await locatorInstance.scrollIntoViewIfNeeded(options);
          break;
        default:
          return { success: false, error: `Unsupported action: ${action}` };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }
  async executeExtensionSandbox(pageId, locatorStr, userCode, timeoutMs = 5e3) {
    const page = this.getPage(pageId);
    if (!page) {
      return { success: false, log: [], error: "Page not found." };
    }
    const logs = [];
    const customConsole = {
      log: (...args) => logs.push(args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")),
      error: (...args) => logs.push("[ERROR] " + args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")),
      warn: (...args) => logs.push("[WARN] " + args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "))
    };
    try {
      let locatorInstance = void 0;
      if (locatorStr && locatorStr.trim()) {
        const parsedSteps = parseLocator(locatorStr);
        if (parsedSteps.length > 0) {
          locatorInstance = constructLocator(page, parsedSteps);
        }
      }
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const fn = new Function(
        "locator",
        "e",
        "page",
        "console",
        "sleep",
        `return (async () => {
          ${userCode}
        })()`
      );
      await Promise.race([
        fn(locatorInstance, locatorInstance, page, customConsole, sleep),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Custom code execution timed out after ${timeoutMs}ms.`)), timeoutMs))
      ]);
      return { success: true, log: logs };
    } catch (err) {
      return { success: false, log: logs, error: err.message || String(err) };
    }
  }
  prepareWorkspaceScript(workspaceRoot, userCode, cdpUrl, targetUrl, isPlaywrightTest, attachCdp, activeFilePath, customTempDir) {
    const fs2 = require("fs");
    const path2 = require("path");
    let isTypeScript = true;
    if (activeFilePath) {
      if (activeFilePath.endsWith(".js") || activeFilePath.endsWith(".jsx") || activeFilePath.endsWith(".mjs")) {
        isTypeScript = false;
      } else if (activeFilePath.endsWith(".ts") || activeFilePath.endsWith(".tsx") || activeFilePath.endsWith(".mts")) {
        isTypeScript = true;
      }
    } else {
      const hasTsConfig = fs2.existsSync(path2.join(workspaceRoot, "tsconfig.json"));
      const hasPlaywrightTs = fs2.existsSync(path2.join(workspaceRoot, "playwright.config.ts"));
      isTypeScript = hasTsConfig || hasPlaywrightTs;
    }
    const ext = isTypeScript ? "ts" : "js";
    const fileContent = generateWorkspaceScriptContent(
      userCode,
      isPlaywrightTest ? "playwright-test" : "standalone",
      attachCdp,
      cdpUrl,
      targetUrl,
      isTypeScript
    );
    const fileName = isPlaywrightTest ? `locator-lens-sandbox.spec.${ext}` : `locator-lens-sandbox.${ext}`;
    let targetDir = workspaceRoot;
    if (customTempDir) {
      targetDir = path2.isAbsolute(customTempDir) ? customTempDir : path2.resolve(workspaceRoot, customTempDir);
    } else if (isPlaywrightTest) {
      let resolvedSpecDir = null;
      if (activeFilePath && activeFilePath.startsWith(workspaceRoot) && (activeFilePath.endsWith(".spec.ts") || activeFilePath.endsWith(".spec.js") || activeFilePath.endsWith(".test.ts") || activeFilePath.endsWith(".test.js"))) {
        resolvedSpecDir = path2.dirname(activeFilePath);
      }
      if (!resolvedSpecDir) {
        let configTestDir = void 0;
        const configFiles = ["playwright.config.ts", "playwright.config.js"];
        for (const configFile of configFiles) {
          const configPath = path2.join(workspaceRoot, configFile);
          if (fs2.existsSync(configPath)) {
            try {
              const content = fs2.readFileSync(configPath, "utf8");
              const match = content.match(/testDir\s*:\s*['"`]([^'"`]+)['"`]/);
              if (match && match[1]) {
                configTestDir = match[1].trim();
                break;
              }
            } catch (e) {
              console.error("Failed to read playwright config:", e);
            }
          }
        }
        if (configTestDir) {
          const resolvedTestDir = path2.resolve(workspaceRoot, configTestDir);
          if (fs2.existsSync(resolvedTestDir) && fs2.statSync(resolvedTestDir).isDirectory()) {
            resolvedSpecDir = resolvedTestDir;
          }
        }
      }
      if (!resolvedSpecDir) {
        const commonDirs = ["tests", "e2e", "specs", "test"];
        for (const dirName of commonDirs) {
          const fullDir = path2.join(workspaceRoot, dirName);
          if (fs2.existsSync(fullDir) && fs2.statSync(fullDir).isDirectory()) {
            resolvedSpecDir = fullDir;
            break;
          }
        }
      }
      if (!resolvedSpecDir) {
        const findFirstSpecDir = (dir) => {
          try {
            const files = fs2.readdirSync(dir);
            const dirsToSearch = [];
            for (const file of files) {
              if (file === "node_modules" || file === ".git" || file === ".vscode" || file === "dist" || file === "build" || file === "packages") {
                continue;
              }
              const fullPath = path2.join(dir, file);
              try {
                const stat = fs2.statSync(fullPath);
                if (stat.isDirectory()) {
                  dirsToSearch.push(fullPath);
                } else if ((file.endsWith(".spec.ts") || file.endsWith(".spec.js") || file.endsWith(".test.ts") || file.endsWith(".test.js")) && !file.includes("locator-lens-sandbox")) {
                  return dir;
                }
              } catch {
              }
            }
            for (const subDir of dirsToSearch) {
              const found = findFirstSpecDir(subDir);
              if (found) return found;
            }
          } catch {
          }
          return null;
        };
        resolvedSpecDir = findFirstSpecDir(workspaceRoot);
      }
      if (resolvedSpecDir) {
        targetDir = resolvedSpecDir;
      }
    }
    const filePath = path2.join(targetDir, fileName);
    fs2.writeFileSync(filePath, fileContent, "utf8");
    return {
      filePath,
      cleanup: () => {
        try {
          if (fs2.existsSync(filePath)) {
            fs2.unlinkSync(filePath);
          }
        } catch {
        }
      }
    };
  }
};
function generateWorkspaceScriptContent(userCode, mode, attachCdp, cdpUrl, targetUrl, isTypeScript = true) {
  const lines = userCode.split("\n");
  const importLines = [];
  const bodyLines = [];
  let inMultiLineImport = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("import ") || trimmed.startsWith("import{")) {
      importLines.push(line);
      if (trimmed.includes("{") && !trimmed.includes("}")) {
        inMultiLineImport = true;
      }
    } else if (inMultiLineImport) {
      importLines.push(line);
      if (trimmed.includes("}")) {
        inMultiLineImport = false;
      }
    } else {
      bodyLines.push(line);
    }
  }
  const userImports = importLines.join("\n");
  const userBody = bodyLines.join("\n");
  let fileContent = "";
  const isPlaywrightTest = mode === "playwright-test";
  if (isPlaywrightTest) {
    let extendTarget = "base";
    let modifiedImports = userImports;
    const testImportRegex = /import\s+\{\s*([^}]*?\btest\b[^}]*?)\s*\}\s+from\s+['"]([^'"]+)['"]/g;
    if (testImportRegex.test(userImports)) {
      modifiedImports = userImports.replace(testImportRegex, (match, importsStr, path2) => {
        const newImports = importsStr.replace(/\btest\b/g, "test as importedTest");
        extendTarget = "importedTest";
        return `import { ${newImports} } from '${path2}'`;
      });
    }
    if (attachCdp) {
      const headerSymbols = ["expect"];
      modifiedImports = modifiedImports.split("\n").map((line) => {
        if (!/from\s+['"](@playwright\/test|playwright(?:-core)?)['"]/.test(line)) {
          return line;
        }
        let result = line;
        for (const sym of headerSymbols) {
          result = result.replace(new RegExp(`\\b${sym}\\b\\s*,\\s*`, "g"), "").replace(new RegExp(`,\\s*\\b${sym}\\b`, "g"), "").replace(new RegExp(`\\b${sym}\\b`, "g"), "");
        }
        if (/import\s*\{\s*\}\s+from/.test(result)) {
          return "";
        }
        return result;
      }).filter((line) => line.trim() !== "").join("\n");
    }
    const hasTestDeclaration = /\btest\s*\(\s*['"`]/.test(userBody) || /\btest\.(only|skip|describe)\b/.test(userBody);
    let testBodyContent = "";
    if (hasTestDeclaration) {
      testBodyContent = userBody;
    } else {
      testBodyContent = `test('Interactive Sandbox Test', async ({ page }) => {
  ${userBody}
});`;
    }
    if (attachCdp) {
      fileContent = `// Playwright Live Playground Generated Spec
import { test as base, expect } from '@playwright/test';
${modifiedImports}

const sleep = ${isTypeScript ? "(ms: number)" : "(ms)"} => new Promise(resolve => setTimeout(resolve, ms));

const test = ${extendTarget}.extend({
  page: async ({}, use) => {
    let playChromium;
    try { playChromium = require('@playwright/test').chromium; } catch {
      try { playChromium = require('playwright').chromium; } catch {
        try { playChromium = require('playwright-core').chromium; } catch {
          throw new Error("Could not find Playwright package ('@playwright/test', 'playwright', or 'playwright-core') in your project dependencies.");
        }
      }
    }
    const browser = await playChromium.connectOverCDP('${cdpUrl || ""}');
    try {
      const contexts = browser.contexts();
      let ${isTypeScript ? "page: any" : "page"};
      const targetUrl = '${targetUrl || ""}';
      for (const context of contexts) {
        const pages = context.pages();
        page = pages.find((p: any) => p.url() === targetUrl);
        if (page) break;
      }
      if (!page) {
        page = contexts[0]?.pages()[0];
      }
      if (!page) {
        throw new Error("No active page found in browser session.");
      }
      await use(page);
    } finally {
      await browser.close();
    }
  }
});

${testBodyContent}
`;
    } else {
      const hasTestImport = /\bimport\s+[^;]*?\btest\b/.test(userImports);
      const importPrepend = hasTestImport ? "" : `import { test, expect } from '@playwright/test';
`;
      fileContent = `// Playwright Live Playground Generated Spec (Standard Runner)
${importPrepend}${userImports}

const sleep = ${isTypeScript ? "(ms: number)" : "(ms)"} => new Promise(resolve => setTimeout(resolve, ms));

${testBodyContent}
`;
    }
  } else {
    if (attachCdp) {
      fileContent = `// Playwright Live Playground Generated Standalone Script
${userImports}

async function main() {
  let playChromium;
  try { playChromium = require('@playwright/test').chromium; } catch {
    try { playChromium = require('playwright').chromium; } catch {
      try { playChromium = require('playwright-core').chromium; } catch {
        throw new Error("Could not find Playwright package ('@playwright/test', 'playwright', or 'playwright-core') in your project dependencies.");
      }
    }
  }
  const browser = await playChromium.connectOverCDP('${cdpUrl || ""}');
  try {
    const contexts = browser.contexts();
    let ${isTypeScript ? "page: any" : "page"};
    const targetUrl = '${targetUrl || ""}';
    for (const context of contexts) {
      const pages = context.pages();
      page = pages.find((p: any) => p.url() === targetUrl);
      if (page) break;
    }
    if (!page) {
      page = contexts[0]?.pages()[0];
    }
    if (!page) {
      throw new Error("No active page found in browser session.");
    }
    
    const sleep = ${isTypeScript ? "(ms: number)" : "(ms)"} => new Promise(resolve => setTimeout(resolve, ms));
    
    // User script body
    ${userBody}
    
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;
    } else {
      fileContent = `// Playwright Live Playground Generated Standalone Script (Standard Node)
${userImports}

const sleep = ${isTypeScript ? "(ms: number)" : "(ms)"} => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  // User script body
  ${userBody}
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;
    }
  }
  return fileContent;
}

// src/sidebarProvider.ts
function findChrome() {
  const platform = process.platform;
  if (platform === "win32") {
    const paths = [
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe") : "",
      process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe") : "",
      process.env.LocalAppData ? path.join(process.env.LocalAppData, "Google/Chrome/Application/chrome.exe") : ""
    ].filter(Boolean);
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } else if (platform === "darwin") {
    const p = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (fs.existsSync(p)) {
      return p;
    }
  } else {
    const paths = [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser"
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }
  throw new Error("Google Chrome was not found. Please install Google Chrome or configure a custom path in settings.");
}
function checkCDPReady(port) {
  return new Promise((resolve2) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 1e3 }, (res) => {
      resolve2(res.statusCode === 200);
    });
    req.on("error", () => {
      resolve2(false);
    });
    req.end();
  });
}
async function waitForCDP(port, timeoutMs = 15e3) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkCDPReady(port)) {
      return;
    }
    await new Promise((resolve2) => setTimeout(resolve2, 300));
  }
  throw new Error(`CDP server did not start on port ${port} within ${timeoutMs}ms.`);
}
async function rmWithRetry(dirPath, maxAttempts = 3, delayMs = 200) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        throw err;
      }
      await new Promise((resolve2) => setTimeout(resolve2, delayMs));
    }
  }
}
var SidebarProvider = class {
  // editorId -> fsPath
  constructor(_extensionUri) {
    this._extensionUri = _extensionUri;
  }
  _extensionUri;
  _view;
  engine = new LocatorEngine();
  activePageId;
  spawnedBrowser;
  tempProfileDir;
  editorDocs = /* @__PURE__ */ new Map();
  // fsPath -> editorId
  activeEditorFiles = /* @__PURE__ */ new Map();
  resolveWebviewView(webviewView, context, _token) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (data) => {
      var _a, _b;
      try {
        switch (data.type) {
          case "launch-browser": {
            try {
              const config = vscode.workspace.getConfiguration("playwright-locator-toolkit");
              const port = config.get("debuggingPort", 9222);
              const customPath = config.get("browserPath", "");
              const cleanProfile = config.get("cleanBrowserProfile", false);
              if (typeof port !== "number" || isNaN(port) || port < 1024 || port > 65535) {
                throw new Error(`Invalid debugging port: ${port}. Must be a number between 1024 and 65535.`);
              }
              const executablePath = customPath || findChrome();
              if (!fs.existsSync(executablePath)) {
                throw new Error(`Browser executable not found at: ${executablePath}`);
              }
              let baseDir = "";
              if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                baseDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
              } else {
                baseDir = os.tmpdir();
              }
              const profileDir = path.join(baseDir, ".vscode", "playwright-locator-profile");
              this.tempProfileDir = profileDir;
              vscode.window.showInformationMessage(
                `Launching Google Chrome with debugging port ${port}. Profile persisted at: ${profileDir}. To delete on exit, toggle 'cleanBrowserProfile' in settings.`
              );
              const args = [
                `--remote-debugging-port=${port}`,
                `--user-data-dir=${profileDir}`,
                "--no-first-run",
                "--no-default-browser-check",
                "about:blank"
              ];
              if (this.spawnedBrowser) {
                try {
                  this.spawnedBrowser.kill();
                } catch {
                }
              }
              this.spawnedBrowser = child_process.spawn(executablePath, args, {
                detached: true,
                stdio: "ignore"
              });
              this.spawnedBrowser.unref();
              this.spawnedBrowser.on("exit", async () => {
                this.spawnedBrowser = void 0;
                if (cleanProfile && this.tempProfileDir && fs.existsSync(this.tempProfileDir)) {
                  try {
                    await rmWithRetry(this.tempProfileDir);
                  } catch (e) {
                    console.error("Failed to clean browser profile:", e);
                  }
                }
                try {
                  webviewView.webview.postMessage({
                    type: "connect-status",
                    connected: false
                  });
                } catch {
                }
              });
              await waitForCDP(port);
              const cdpUrl = `http://127.0.0.1:${port}`;
              const pages = await this.engine.connect(cdpUrl);
              const firstVisible = pages.find((p) => {
                const url = p.url || "";
                const title = (p.title || "").toLowerCase();
                return !url.startsWith("chrome-devtools://") && !url.startsWith("devtools://") && !title.includes("developer tools") && !title.includes("devtools");
              });
              const activePageId = firstVisible ? firstVisible.id : (_a = pages[0]) == null ? void 0 : _a.id;
              this.activePageId = activePageId;
              webviewView.webview.postMessage({
                type: "connect-status",
                connected: true,
                cdpUrl,
                pages,
                activePageId
              });
            } catch (err) {
              webviewView.webview.postMessage({
                type: "connect-status",
                connected: false,
                error: err.message || String(err)
              });
            }
            break;
          }
          case "connect-browser": {
            try {
              if (!data.cdpUrl || typeof data.cdpUrl !== "string") {
                throw new Error("CDP Connection URL is required.");
              }
              const parsedUrl = new URL(data.cdpUrl);
              if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
                throw new Error("CDP Connection URL protocol must be http or https.");
              }
              const hostPort = parsedUrl.port;
              if (hostPort) {
                const portNum = parseInt(hostPort, 10);
                if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
                  throw new Error(`Invalid port in CDP URL: ${hostPort}. Must be between 1024 and 65535.`);
                }
              }
              const pages = await this.engine.connect(data.cdpUrl);
              const firstVisible = pages.find((p) => {
                const url = p.url || "";
                const title = (p.title || "").toLowerCase();
                return !url.startsWith("chrome-devtools://") && !url.startsWith("devtools://") && !title.includes("developer tools") && !title.includes("devtools");
              });
              const activePageId = firstVisible ? firstVisible.id : (_b = pages[0]) == null ? void 0 : _b.id;
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
                error: err.message || String(err)
              });
            }
            break;
          }
          case "disconnect-browser": {
            this.engine.softDisconnect();
            this.activePageId = void 0;
            webviewView.webview.postMessage({
              type: "connect-status",
              connected: false
            });
            break;
          }
          case "close-browser": {
            if (this.spawnedBrowser) {
              try {
                this.spawnedBrowser.kill();
              } catch {
              }
              this.spawnedBrowser = void 0;
            }
            await this.engine.disconnect();
            this.activePageId = void 0;
            const config = vscode.workspace.getConfiguration("playwright-locator-toolkit");
            const cleanProfile = config.get("cleanBrowserProfile", false);
            if (cleanProfile && this.tempProfileDir && fs.existsSync(this.tempProfileDir)) {
              try {
                await rmWithRetry(this.tempProfileDir);
              } catch {
              }
            }
            webviewView.webview.postMessage({
              type: "connect-status",
              connected: false
            });
            break;
          }
          case "refresh-pages": {
            try {
              const pages = await this.engine.getPages();
              webviewView.webview.postMessage({
                type: "pages-refreshed",
                pages
              });
            } catch (err) {
              webviewView.webview.postMessage({
                type: "pages-refreshed",
                pages: [],
                error: err.message
              });
            }
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
          // Phase 6 — Bulk Stability Testing
          case "bulk-stability-test": {
            if (!this.activePageId) return;
            try {
              const results = await this.engine.bulkStabilityTest(
                this.activePageId,
                data.locatorStrs,
                data.runs || 3
              );
              webviewView.webview.postMessage({ type: "bulk-stability-result", results });
            } catch (err) {
              webviewView.webview.postMessage({
                type: "bulk-stability-result",
                results: {},
                error: err.message
              });
            }
            break;
          }
          // Phase 5 — Field Simulation Engine
          case "simulate-fill": {
            if (!this.activePageId) return;
            try {
              const success = await this.engine.simulateFill(
                this.activePageId,
                data.locatorStr,
                data.value
              );
              webviewView.webview.postMessage({ type: "simulate-fill-result", success });
            } catch (err) {
              webviewView.webview.postMessage({ type: "simulate-fill-result", success: false, error: err.message });
            }
            break;
          }
          case "simulate-click": {
            if (!this.activePageId) return;
            try {
              const success = await this.engine.simulateClick(
                this.activePageId,
                data.locatorStr,
                data.x,
                data.y
              );
              webviewView.webview.postMessage({ type: "simulate-click-result", success });
            } catch (err) {
              webviewView.webview.postMessage({ type: "simulate-click-result", success: false, error: err.message });
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
          // UI Scanner Intelligence Platform
          case "scan-ui": {
            if (!this.activePageId) return;
            try {
              const result = await this.engine.scanUI(this.activePageId);
              webviewView.webview.postMessage({ type: "ui-scan-result", result });
            } catch (err) {
              webviewView.webview.postMessage({
                type: "ui-scan-result",
                error: err.message
              });
            }
            break;
          }
          case "generate-export": {
            try {
              let code = "";
              const format = data.format;
              const tree = data.tree;
              const sectionNaming = data.sectionNaming;
              if (format === "pom") {
                code = this.engine.generatePOMExport(tree, data.className, sectionNaming);
              } else if (format === "sdk") {
                code = this.engine.generateSDKExport(tree);
              } else if (format === "ts") {
                code = this.engine.generateTSInterfacesExport(tree, sectionNaming);
              } else if (format === "json") {
                code = this.engine.generateJSONSchemaExport(tree);
              } else if (format === "yaml") {
                code = this.engine.generateYAMLExport(tree);
              }
              webviewView.webview.postMessage({ type: "export-result", format, code });
            } catch (err) {
              webviewView.webview.postMessage({ type: "export-result", error: err.message });
            }
            break;
          }
          case "get-config": {
            const config = vscode.workspace.getConfiguration("playwright-locator-toolkit");
            const enableBeta = config.get("enableBetaFeatures", false);
            webviewView.webview.postMessage({
              type: "beta-config",
              enabled: enableBeta
            });
            break;
          }
          case "perform-action": {
            if (!this.activePageId) return;
            const res = await this.engine.performAction(
              this.activePageId,
              data.locatorStr,
              data.action,
              data.args || [],
              data.timeout || 5e3
            );
            webviewView.webview.postMessage({
              type: "action-result",
              action: data.action,
              success: res.success,
              error: res.error
            });
            break;
          }
          case "open-in-editor": {
            try {
              const editorId = data.editorId;
              const content = data.content || "";
              const mode = data.mode || "typescript";
              let workspaceRoot = "";
              if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
              } else {
                workspaceRoot = os.tmpdir();
              }
              const activeEditor = vscode.window.activeTextEditor;
              const activeFilePath = activeEditor ? activeEditor.document.uri.fsPath : void 0;
              let isTypeScript = true;
              if (activeFilePath) {
                if (activeFilePath.endsWith(".js") || activeFilePath.endsWith(".jsx") || activeFilePath.endsWith(".mjs")) {
                  isTypeScript = false;
                } else if (activeFilePath.endsWith(".ts") || activeFilePath.endsWith(".tsx") || activeFilePath.endsWith(".mts")) {
                  isTypeScript = true;
                }
              } else {
                const hasTsConfig = fs.existsSync(path.join(workspaceRoot, "tsconfig.json"));
                const hasPlaywrightTs = fs.existsSync(path.join(workspaceRoot, "playwright.config.ts"));
                isTypeScript = hasTsConfig || hasPlaywrightTs;
              }
              const ext = isTypeScript ? "ts" : "js";
              const targetDir = this.getSandboxTargetDir(workspaceRoot, activeFilePath);
              const defaultName = `playground-${editorId}.${ext}`;
              const defaultUri = vscode.Uri.file(path.join(targetDir, defaultName));
              const saveUri = await vscode.window.showSaveDialog({
                defaultUri,
                title: "Save Playground Script",
                filters: {
                  "Script Files": [ext]
                }
              });
              if (!saveUri) {
                return;
              }
              const filePath = saveUri.fsPath;
              const parentDir = path.dirname(filePath);
              if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
              }
              if (filePath.startsWith(workspaceRoot)) {
                const rootGitIgnore = path.join(workspaceRoot, ".gitignore");
                const relativePathForGitignore = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
                if (fs.existsSync(rootGitIgnore)) {
                  try {
                    const gitIgnoreContent = fs.readFileSync(rootGitIgnore, "utf8");
                    if (!gitIgnoreContent.includes(relativePathForGitignore)) {
                      fs.writeFileSync(rootGitIgnore, gitIgnoreContent.trim() + "\n\n# Playwright Live Playground Temp File\n/" + relativePathForGitignore + "\n", "utf8");
                    }
                  } catch {
                  }
                }
              }
              let finalContent = content;
              if (!content.includes("/// <reference types=")) {
                if (editorId === "element-script") {
                  finalContent = `/// <reference types="@playwright/test" />
// Variable 'e' is the matched Locator, and 'page' is the active Page.

` + content;
                } else if (editorId === "browser-script") {
                  finalContent = `/// <reference types="@playwright/test" />
// Variable 'page' is the active Page.

` + content;
                } else {
                  finalContent = `/// <reference types="@playwright/test" />

` + content;
                }
              }
              fs.writeFileSync(filePath, finalContent, "utf8");
              const uri = vscode.Uri.file(filePath);
              this.editorDocs.set(filePath, editorId);
              this.activeEditorFiles.set(editorId, filePath);
              const doc = await vscode.workspace.openTextDocument(uri);
              await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false,
                preview: false
              });
              webviewView.webview.postMessage({
                type: "editor-opened",
                editorId,
                filePath,
                fileName: path.basename(filePath)
              });
            } catch (err) {
              vscode.window.showErrorMessage(`Failed to open editor: ${err.message}`);
            }
            break;
          }
          case "execute-sandbox-code": {
            if (!this.activePageId) return;
            let userCode = data.userCode || "";
            const editorId = data.locatorStr ? "element-script" : "browser-script";
            const activeFilePath = this.activeEditorFiles.get(editorId);
            if (activeFilePath) {
              const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === activeFilePath);
              if (doc) {
                userCode = doc.getText();
              }
            }
            const res = await this.engine.executeExtensionSandbox(
              this.activePageId,
              data.locatorStr,
              userCode,
              data.timeout || 5e3
            );
            webviewView.webview.postMessage({
              type: "sandbox-result",
              success: res.success,
              log: res.log,
              error: res.error
            });
            break;
          }
          case "stop-editor-sync": {
            const editorId = data.editorId;
            this.activeEditorFiles.delete(editorId);
            for (const [filePath, eid] of this.editorDocs.entries()) {
              if (eid === editorId) {
                this.editorDocs.delete(filePath);
              }
            }
            webviewView.webview.postMessage({
              type: "editor-closed",
              editorId
            });
            break;
          }
          case "restart-extension": {
            await this.restart();
            break;
          }
          case "execute-workspace-script": {
            const attachCdp = !!data.attachCdp;
            let targetUrl = "";
            let defaultPort = 9222;
            let cdpUrl = "";
            if (attachCdp) {
              if (!this.activePageId) {
                webviewView.webview.postMessage({
                  type: "workspace-script-finished",
                  success: false,
                  error: "Please connect to a browser page/tab first to attach CDP execution."
                });
                return;
              }
              const page = this.engine.getPage(this.activePageId);
              if (!page) {
                webviewView.webview.postMessage({
                  type: "workspace-script-finished",
                  success: false,
                  error: "Active page connection not found."
                });
                return;
              }
              targetUrl = page.url();
              const config = vscode.workspace.getConfiguration("playwright-locator-toolkit");
              defaultPort = config.get("debuggingPort", 9222);
              cdpUrl = data.cdpUrl || `http://127.0.0.1:${defaultPort}`;
            }
            let workspaceRoot = "";
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
              workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            } else {
              webviewView.webview.postMessage({
                type: "workspace-script-finished",
                success: false,
                error: "Workspace is required to run workspace scripts."
              });
              return;
            }
            let userCode = data.userCode || "";
            const activeFilePath = this.activeEditorFiles.get("workspace-script");
            if (activeFilePath) {
              const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === activeFilePath);
              if (doc) {
                userCode = doc.getText();
              }
            }
            const activeEditor = vscode.window.activeTextEditor;
            const activeFilePathForResolving = activeEditor ? activeEditor.document.uri.fsPath : void 0;
            const isPlaywrightTest = data.mode === "playwright-test";
            const customTempDir = this.getSandboxTargetDir(workspaceRoot, activeFilePathForResolving);
            const { filePath, cleanup } = this.engine.prepareWorkspaceScript(
              workspaceRoot,
              userCode,
              cdpUrl,
              targetUrl,
              isPlaywrightTest,
              attachCdp,
              activeFilePathForResolving,
              customTempDir
            );
            let runCmd = (data.runnerCommand || "").trim();
            if (!runCmd) {
              if (isPlaywrightTest) {
                runCmd = "npx playwright test";
              } else {
                runCmd = filePath.endsWith(".ts") ? "npx tsx" : "node";
              }
            }
            const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
            let fullCmd = "";
            if (isPlaywrightTest) {
              fullCmd = `${runCmd} "${relativePath}" --reporter=line`;
            } else {
              fullCmd = `${runCmd} "${relativePath}"`;
            }
            webviewView.webview.postMessage({
              type: "sandbox-log",
              log: `[INFO] Launching script runner: ${fullCmd}
`,
              stream: "info"
            });
            const cp = child_process.spawn(fullCmd, {
              cwd: workspaceRoot,
              shell: true,
              env: {
                ...process.env,
                PLAYWRIGHT_CHROMIUM_ATTACH_TO_PORT: String(defaultPort)
              }
            });
            let processKilled = false;
            const timeoutMs = data.timeout || 15e3;
            const timer = setTimeout(() => {
              processKilled = true;
              cp.kill();
              webviewView.webview.postMessage({
                type: "sandbox-log",
                log: `[ERROR] Execution timed out after ${timeoutMs}ms.
`,
                stream: "stderr"
              });
            }, timeoutMs);
            cp.stdout.on("data", (chunk) => {
              if (processKilled) return;
              webviewView.webview.postMessage({
                type: "sandbox-log",
                log: chunk.toString(),
                stream: "stdout"
              });
            });
            cp.stderr.on("data", (chunk) => {
              if (processKilled) return;
              webviewView.webview.postMessage({
                type: "sandbox-log",
                log: chunk.toString(),
                stream: "stderr"
              });
            });
            cp.on("error", (err) => {
              clearTimeout(timer);
              cleanup();
              webviewView.webview.postMessage({
                type: "sandbox-log",
                log: `[ERROR] Failed to start process: ${err.message}
`,
                stream: "stderr"
              });
              webviewView.webview.postMessage({
                type: "workspace-script-finished",
                success: false,
                code: 1,
                error: err.message
              });
            });
            cp.on("close", (code) => {
              clearTimeout(timer);
              cleanup();
              if (processKilled) return;
              webviewView.webview.postMessage({
                type: "workspace-script-finished",
                success: code === 0,
                code
              });
            });
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
    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
      const editorId = this.editorDocs.get(e.document.uri.fsPath);
      if (editorId) {
        this.activeEditorFiles.set(editorId, e.document.uri.fsPath);
        try {
          webviewView.webview.postMessage({
            type: "editor-content-synced",
            editorId,
            content: e.document.getText(),
            filePath: e.document.uri.fsPath,
            fileName: path.basename(e.document.uri.fsPath)
          });
        } catch {
        }
      }
    });
    const docCloseDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
      const editorId = this.editorDocs.get(doc.uri.fsPath);
      if (editorId) {
        this.editorDocs.delete(doc.uri.fsPath);
        const activeFile = this.activeEditorFiles.get(editorId);
        if (activeFile === doc.uri.fsPath) {
          this.activeEditorFiles.delete(editorId);
        }
        try {
          webviewView.webview.postMessage({
            type: "editor-closed",
            editorId,
            filePath: doc.uri.fsPath
          });
        } catch {
        }
      }
    });
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("playwright-locator-toolkit.enableBetaFeatures")) {
        const config = vscode.workspace.getConfiguration("playwright-locator-toolkit");
        const enableBeta = config.get("enableBetaFeatures", false);
        webviewView.webview.postMessage({
          type: "beta-config",
          enabled: enableBeta
        });
      }
    });
    webviewView.onDidDispose(() => {
      configChangeDisposable.dispose();
      docChangeDisposable.dispose();
      docCloseDisposable.dispose();
      this.engine.softDisconnect();
    });
  }
  _getHtmlForWebview(webview) {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, "webview", "index.html");
    let html = fs.readFileSync(htmlPath.fsPath, "utf8");
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "webview", "style.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "webview", "main.js"));
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "icon.png"));
    const cspSource = webview.cspSource;
    html = html.replace(/\$\{styleUri\}/g, styleUri.toString());
    html = html.replace(/\$\{scriptUri\}/g, scriptUri.toString());
    html = html.replace(/\$\{logoUri\}/g, logoUri.toString());
    html = html.replace(/\$\{cspSource\}/g, cspSource);
    return html;
  }
  async restart() {
    try {
      await this.engine.disconnect();
    } catch {
    }
    try {
      if (this.spawnedBrowser) {
        this.spawnedBrowser.kill();
      }
    } catch {
    }
    this.editorDocs.clear();
    this.activeEditorFiles.clear();
    this.engine = new LocatorEngine();
    this.activePageId = void 0;
    if (this._view) {
      this._view.webview.postMessage({
        type: "extension-restarted"
      });
    }
    vscode.window.showInformationMessage("Playwright Live Playground extension restarted.");
  }
  getSandboxTargetDir(workspaceRoot, activeFilePath) {
    var _a;
    const config = vscode.workspace.getConfiguration("playwright-locator-toolkit");
    const customTempDir = (_a = config.get("tempDir")) == null ? void 0 : _a.trim();
    if (customTempDir) {
      return path.isAbsolute(customTempDir) ? customTempDir : path.resolve(workspaceRoot, customTempDir);
    }
    if (activeFilePath && activeFilePath.startsWith(workspaceRoot)) {
      if (activeFilePath.endsWith(".spec.ts") || activeFilePath.endsWith(".spec.js") || activeFilePath.endsWith(".test.ts") || activeFilePath.endsWith(".test.js")) {
        try {
          const dir = path.dirname(activeFilePath);
          if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            return dir;
          }
        } catch {
        }
      }
    }
    let configTestDir = void 0;
    const configFiles = ["playwright.config.ts", "playwright.config.js"];
    for (const configFile of configFiles) {
      const configPath = path.join(workspaceRoot, configFile);
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, "utf8");
          const match = content.match(/testDir\s*:\s*['"`]([^'"`]+)['"`]/);
          if (match && match[1]) {
            configTestDir = match[1].trim();
            break;
          }
        } catch {
        }
      }
    }
    if (configTestDir) {
      const resolvedTestDir = path.resolve(workspaceRoot, configTestDir);
      if (fs.existsSync(resolvedTestDir) && fs.statSync(resolvedTestDir).isDirectory()) {
        return resolvedTestDir;
      }
    }
    const commonDirs = ["tests", "e2e", "specs", "test"];
    for (const dirName of commonDirs) {
      const fullDir = path.join(workspaceRoot, dirName);
      if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
        return fullDir;
      }
    }
    const findFirstSpecDir = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        const dirsToSearch = [];
        for (const file of files) {
          if (file === "node_modules" || file === ".git" || file === ".vscode" || file === "dist" || file === "build" || file === "packages") {
            continue;
          }
          const fullPath = path.join(dir, file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              dirsToSearch.push(fullPath);
            } else if ((file.endsWith(".spec.ts") || file.endsWith(".spec.js") || file.endsWith(".test.ts") || file.endsWith(".test.js")) && !file.includes("locator-lens-sandbox")) {
              return dir;
            }
          } catch {
          }
        }
        for (const subDir of dirsToSearch) {
          const found = findFirstSpecDir(subDir);
          if (found) return found;
        }
      } catch {
      }
      return null;
    };
    const resolvedSpecDir = findFirstSpecDir(workspaceRoot);
    if (resolvedSpecDir) {
      return resolvedSpecDir;
    }
    return workspaceRoot;
  }
};

// src/extension.ts
function activate(context) {
  const sidebarProvider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode2.window.registerWebviewViewProvider(
      "playwright-locator-toolkit-sidebar",
      sidebarProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );
  context.subscriptions.push(
    vscode2.commands.registerCommand("playwright-locator-toolkit.focusSidebar", () => {
      vscode2.commands.executeCommand("workbench.view.extension.playwright-locator-toolkit-container");
    })
  );
  context.subscriptions.push(
    vscode2.commands.registerCommand("playwright-locator-toolkit.restart", () => {
      sidebarProvider.restart();
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
