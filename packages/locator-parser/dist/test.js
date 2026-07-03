"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const assert = __importStar(require("assert"));
console.log('Running Playwright Locator Parser Unit Tests...');
try {
    // Test Case 1: Simple Locator
    console.log('Test Case 1: Simple locator...');
    const steps1 = (0, index_1.parseLocator)("page.locator('button')");
    assert.strictEqual(steps1.length, 1);
    assert.strictEqual(steps1[0].name, 'locator');
    assert.strictEqual(steps1[0].args[0], 'button');
    assert.strictEqual((0, index_1.stringifyLocator)(steps1), "page.locator('button')");
    // Test Case 2: Chaining with filter
    console.log('Test Case 2: Chaining with filter...');
    const steps2 = (0, index_1.parseLocator)("page.locator('div').filter({ hasText: 'Submit' })");
    assert.strictEqual(steps2.length, 2);
    assert.strictEqual(steps2[0].name, 'locator');
    assert.strictEqual(steps2[1].name, 'filter');
    assert.deepStrictEqual(steps2[1].args[0], { hasText: 'Submit' });
    assert.strictEqual((0, index_1.stringifyLocator)(steps2), "page.locator('div').filter({ hasText: 'Submit' })");
    // Test Case 3: Chaining with or() containing nested locator
    console.log('Test Case 3: Chaining with or()...');
    const steps3 = (0, index_1.parseLocator)("page.locator('div').or(locator('span'))");
    assert.strictEqual(steps3.length, 2);
    assert.strictEqual(steps3[0].name, 'locator');
    assert.strictEqual(steps3[1].name, 'or');
    assert.strictEqual(steps3[1].args[0].type, 'nested_locator');
    assert.strictEqual(steps3[1].args[0].steps.length, 1);
    assert.strictEqual(steps3[1].args[0].steps[0].name, 'locator');
    assert.strictEqual(steps3[1].args[0].steps[0].args[0], 'span');
    assert.strictEqual((0, index_1.stringifyLocator)(steps3), "page.locator('div').or(locator('span'))");
    // Test Case 4: Chaining with and() containing nested locator with page prefix
    console.log('Test Case 4: Chaining with and()...');
    const steps4 = (0, index_1.parseLocator)("page.locator('.input').and(page.locator('[required]'))");
    assert.strictEqual(steps4.length, 2);
    assert.strictEqual(steps4[0].name, 'locator');
    assert.strictEqual(steps4[1].name, 'and');
    assert.strictEqual(steps4[1].args[0].type, 'nested_locator');
    assert.strictEqual(steps4[1].args[0].hasPagePrefix, true);
    assert.strictEqual(steps4[1].args[0].steps[0].name, 'locator');
    assert.strictEqual(steps4[1].args[0].steps[0].args[0], '[required]');
    assert.strictEqual((0, index_1.stringifyLocator)(steps4), "page.locator('.input').and(page.locator('[required]'))");
    // Test Case 5: Complex arguments (numbers, booleans, regexes, options objects)
    console.log('Test Case 5: Complex arguments...');
    const steps5 = (0, index_1.parseLocator)("getByRole('button', { name: /submit/i, checked: true, level: 3 })");
    assert.strictEqual(steps5.length, 1);
    assert.strictEqual(steps5[0].name, 'getByRole');
    assert.strictEqual(steps5[0].args[0], 'button');
    assert.strictEqual(steps5[0].args[1].checked, true);
    assert.strictEqual(steps5[0].args[1].level, 3);
    assert.ok(steps5[0].args[1].name instanceof RegExp);
    assert.strictEqual(steps5[0].args[1].name.source, 'submit');
    assert.strictEqual(steps5[0].args[1].name.flags, 'i');
    // Check stringification
    assert.strictEqual((0, index_1.stringifyLocator)(steps5), "page.getByRole('button', { name: /submit/i, checked: true, level: 3 })");
    // Test Case 6: Nested locator inside options (e.g. filter has)
    console.log('Test Case 6: Nested locator inside options...');
    const steps6 = (0, index_1.parseLocator)("locator('div').filter({ has: locator('span').first() })");
    assert.strictEqual(steps6.length, 2);
    assert.strictEqual(steps6[0].name, 'locator');
    assert.strictEqual(steps6[1].name, 'filter');
    const hasOpt = steps6[1].args[0].has;
    assert.strictEqual(hasOpt.type, 'nested_locator');
    assert.strictEqual(hasOpt.steps.length, 2);
    assert.strictEqual(hasOpt.steps[0].name, 'locator');
    assert.strictEqual(hasOpt.steps[0].args[0], 'span');
    assert.strictEqual(hasOpt.steps[1].name, 'first');
    assert.strictEqual((0, index_1.stringifyLocator)(steps6), "page.locator('div').filter({ has: locator('span').first() })");
    // Test Case 7: Quote escapes
    console.log('Test Case 7: Quote escapes...');
    const steps7 = (0, index_1.parseLocator)("locator('a[href=\\'http://test.com\\']')");
    assert.strictEqual(steps7.length, 1);
    assert.strictEqual(steps7[0].args[0], "a[href='http://test.com']");
    assert.strictEqual((0, index_1.stringifyLocator)(steps7), "page.locator('a[href=\\'http://test.com\\']')");
    // Test Case 8: Syntax error check
    console.log('Test Case 8: Syntax error check...');
    assert.throws(() => {
        (0, index_1.parseLocator)("locator('div').or.locator('span')");
    }, /Expected token LPAREN/);
    // Test Case 9: Comments
    console.log('Test Case 9: Comments...');
    const steps9 = (0, index_1.parseLocator)("page.locator('div') // single-line comment\n.locator('span') /* multi-line\ncomment */.first()");
    assert.strictEqual(steps9.length, 3);
    assert.strictEqual(steps9[0].name, 'locator');
    assert.strictEqual(steps9[0].args[0], 'div');
    assert.strictEqual(steps9[1].name, 'locator');
    assert.strictEqual(steps9[1].args[0], 'span');
    assert.strictEqual(steps9[2].name, 'first');
    console.log('All Unit Tests Passed Successfully!');
}
catch (error) {
    console.error('Test Failed:', error);
    process.exit(1);
}
//# sourceMappingURL=test.js.map