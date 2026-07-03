export interface LocatorStep {
  name: string;
  args: any[];
}

type TokenType =
  | 'IDENTIFIER'
  | 'DOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACE'
  | 'RBRACE'
  | 'COLON'
  | 'COMMA'
  | 'STRING'
  | 'REGEX'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

export function tokenize(str: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < str.length) {
    const char = str[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Check symbols
    if (char === '.') {
      tokens.push({ type: 'DOT', value: '.' });
      i++;
      continue;
    }
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }
    if (char === '{') {
      tokens.push({ type: 'LBRACE', value: '{' });
      i++;
      continue;
    }
    if (char === '}') {
      tokens.push({ type: 'RBRACE', value: '}' });
      i++;
      continue;
    }
    if (char === ':') {
      tokens.push({ type: 'COLON', value: ':' });
      i++;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'COMMA', value: ',' });
      i++;
      continue;
    }

    // String literals
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      let val = '';
      i++; // skip quote
      while (i < str.length && str[i] !== quote) {
        if (str[i] === '\\' && i + 1 < str.length) {
          val += str[i + 1];
          i += 2;
        } else {
          val += str[i];
          i++;
        }
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: val });
      continue;
    }

    // Comments or Regex literals
    if (char === '/') {
      if (i + 1 < str.length && str[i + 1] === '/') {
        // Single-line comment
        i += 2;
        while (i < str.length && str[i] !== '\n' && str[i] !== '\r') {
          i++;
        }
        continue;
      }
      if (i + 1 < str.length && str[i + 1] === '*') {
        // Multi-line comment
        i += 2;
        while (i < str.length) {
          if (str[i] === '*' && i + 1 < str.length && str[i + 1] === '/') {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }

      // Regex literals
      let val = '';
      i++; // skip leading '/'
      let isEscape = false;
      while (i < str.length) {
        const c = str[i];
        if (isEscape) {
          val += c;
          isEscape = false;
          i++;
        } else if (c === '\\') {
          val += c;
          isEscape = true;
          i++;
        } else if (c === '/') {
          break; // end of regex
        } else {
          val += c;
          i++;
        }
      }
      i++; // skip trailing '/'
      let flags = '';
      while (i < str.length && /[gimsuy]/.test(str[i])) {
        flags += str[i];
        i++;
      }
      tokens.push({ type: 'REGEX', value: JSON.stringify({ pattern: val, flags }) });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(char)) {
      let val = '';
      while (i < str.length && /[0-9\.]/.test(str[i])) {
        val += str[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: val });
      continue;
    }

    // Identifiers & Booleans
    if (/[a-zA-Z\$_]/.test(char)) {
      let val = '';
      while (i < str.length && /[a-zA-Z0-9\$_]/.test(str[i])) {
        val += str[i];
        i++;
      }
      if (val === 'true' || val === 'false') {
        tokens.push({ type: 'BOOLEAN', value: val });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: val });
      }
      continue;
    }

    throw new Error(`Unexpected character at position ${i}: ${char}`);
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

class Parser {
  private tokens: Token[];
  private current = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private consume(type?: TokenType): Token {
    const token = this.peek();
    if (type && token.type !== type) {
      throw new Error(`Expected token ${type}, but got ${token.type} (${token.value})`);
    }
    this.current++;
    return token;
  }

  parse(): LocatorStep[] {
    const steps: LocatorStep[] = [];

    // If it starts with 'page', consume it.
    if (this.peek().type === 'IDENTIFIER') {
      const id = this.peek().value;
      if (id === 'page') {
        this.consume();
        if (this.peek().type === 'DOT') {
          this.consume(); // consume '.'
        }
      }
    }

    while (this.peek().type !== 'EOF') {
      const step = this.parseMethodCall();
      steps.push(step);

      if (this.peek().type === 'DOT') {
        this.consume(); // consume '.'
      } else if (this.peek().type !== 'EOF') {
        throw new Error(`Expected '.' or EOF, got ${this.peek().type}`);
      }
    }

    return steps;
  }

  private parseMethodCall(): LocatorStep {
    const nameToken = this.consume('IDENTIFIER');
    const name = nameToken.value;

    this.consume('LPAREN');
    const args: any[] = [];

    if (this.peek().type !== 'RPAREN') {
      args.push(this.parseExpression());
      while (this.peek().type === 'COMMA') {
        this.consume(); // consume ','
        args.push(this.parseExpression());
      }
    }

    this.consume('RPAREN');
    return { name, args };
  }

  private parseExpression(): any {
    const token = this.peek();
    if (token.type === 'STRING') {
      this.consume();
      return token.value;
    }
    if (token.type === 'NUMBER') {
      this.consume();
      return Number(token.value);
    }
    if (token.type === 'BOOLEAN') {
      this.consume();
      return token.value === 'true';
    }
    if (token.type === 'REGEX') {
      this.consume();
      const parsed = JSON.parse(token.value);
      return new RegExp(parsed.pattern, parsed.flags);
    }
    if (token.type === 'LBRACE') {
      return this.parseObject();
    }
    if (token.type === 'IDENTIFIER') {
      return this.parseNestedLocator();
    }

    throw new Error(`Unsupported expression type: ${token.type}`);
  }

  private parseNestedLocator(): any {
    let hasPagePrefix = false;
    const steps: LocatorStep[] = [];

    if (this.peek().type === 'IDENTIFIER' && this.peek().value === 'page') {
      this.consume(); // consume 'page'
      hasPagePrefix = true;
      if (this.peek().type === 'DOT') {
        this.consume(); // consume '.'
      }
    }

    while (this.peek().type === 'IDENTIFIER') {
      const step = this.parseMethodCall();
      steps.push(step);

      if (this.peek().type === 'DOT') {
        this.consume(); // consume '.'
      } else {
        break;
      }
    }

    return { type: 'nested_locator', steps, hasPagePrefix };
  }

  private parseObject(): any {
    this.consume('LBRACE');
    const obj: any = {};

    if (this.peek().type !== 'RBRACE') {
      this.parseObjectProperty(obj);
      while (this.peek().type === 'COMMA') {
        this.consume(); // consume ','
        if (this.peek().type === 'RBRACE') {
          break; // trailing comma
        }
        this.parseObjectProperty(obj);
      }
    }

    this.consume('RBRACE');
    return obj;
  }

  private parseObjectProperty(obj: any) {
    const keyToken = this.consume('IDENTIFIER');
    const key = keyToken.value;
    this.consume('COLON');
    const val = this.parseExpression();
    obj[key] = val;
  }
}

export function parseLocator(locatorStr: string): LocatorStep[] {
  const tokens = tokenize(locatorStr);
  const parser = new Parser(tokens);
  return parser.parse();
}

export function stringifyLocator(steps: LocatorStep[], includePagePrefix = true): string {
  const parts = includePagePrefix ? ['page'] : [];
  for (const step of steps) {
    const argsStr = step.args.map(arg => stringifyArgument(arg)).join(', ');
    parts.push(`${step.name}(${argsStr})`);
  }
  return parts.join('.');
}

function stringifyArgument(arg: any): string {
  if (typeof arg === 'string') {
    return `'${arg.replace(/'/g, "\\'")}'`;
  }
  if (typeof arg === 'number' || typeof arg === 'boolean') {
    return String(arg);
  }
  if (arg instanceof RegExp) {
    return arg.toString();
  }
  if (arg && typeof arg === 'object') {
    if (arg.type === 'nested_locator') {
      return stringifyLocator(arg.steps, arg.hasPagePrefix);
    }
    if (arg.source !== undefined && arg.flags !== undefined) {
      // Reconstructed RegExp object
      return `/${arg.source}/${arg.flags}`;
    }
    const pairs = Object.entries(arg).map(([k, v]) => `${k}: ${stringifyArgument(v)}`);
    return `{ ${pairs.join(', ')} }`;
  }
  return 'undefined';
}
