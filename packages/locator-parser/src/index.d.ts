export interface LocatorStep {
    name: string;
    args: any[];
}
type TokenType = 'IDENTIFIER' | 'DOT' | 'LPAREN' | 'RPAREN' | 'LBRACE' | 'RBRACE' | 'COLON' | 'COMMA' | 'STRING' | 'REGEX' | 'NUMBER' | 'BOOLEAN' | 'EOF';
interface Token {
    type: TokenType;
    value: string;
}
export declare function tokenize(str: string): Token[];
export declare function parseLocator(locatorStr: string): LocatorStep[];
export declare function stringifyLocator(steps: LocatorStep[], includePagePrefix?: boolean): string;
export {};
