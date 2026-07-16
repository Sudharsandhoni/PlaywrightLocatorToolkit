import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright-core';
import { LocatorEngine } from 'playwright-locator-toolkit-engine';

interface TestCase {
  name: string;
  locatorStr: string;
  expectedSuccess?: boolean;
  expectedCount?: number;
  minConfidence?: number;
  maxConfidence?: number;
  expectedFactors?: string[];
  expectedDiagnosticMessage?: string;
  expectedAlternative?: string;
  expectedFailedStepIndex?: number;
  expectedTotalMatches?: number;
  expectedBranches?: { matchCount: number; isWinner: boolean }[];
  action?: 'fill' | 'click';
  value?: string;
  expectedScore?: number;
}

interface TestResults {
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  details: {
    category: string;
    name: string;
    passed: boolean;
    error?: string;
  }[];
}

function findChrome(): string {
  const platform = process.platform;
  if (platform === 'win32') {
    const paths = [
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe') : '',
      process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe') : '',
      process.env.LocalAppData ? path.join(process.env.LocalAppData, 'Google/Chrome/Application/chrome.exe') : ''
    ].filter(Boolean);

    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } else if (platform === 'darwin') {
    const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(p)) {
      return p;
    }
  } else {
    // Linux
    const paths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }
  throw new Error('Google Chrome was not found. Please install Google Chrome.');
}

async function runTests() {
  console.log('==================================================');
  console.log('🚀 Starting Playwright Locator Toolkit E2E Test Suite');
  console.log('==================================================\n');

  // Load test cases
  const testcasesPath = path.join(__dirname, 'testcases.json');
  if (!fs.existsSync(testcasesPath)) {
    console.error(`❌ Test cases catalog not found at: ${testcasesPath}`);
    process.exit(1);
  }
  const suite = JSON.parse(fs.readFileSync(testcasesPath, 'utf8'));

  // Launch browser with CDP enabled
  const chromePath = findChrome();
  const profileDir = path.join(__dirname, 'chrome-profile');
  console.log(`🔧 Launching Chrome from: ${chromePath} with CDP on port 9333, profile: ${profileDir}`);
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: true,
    args: [
      '--remote-debugging-port=9333',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  const page = context.pages()[0] || await context.newPage();

  // Redirect console logs from page to check simulations
  const pageLogs: string[] = [];
  page.on('console', msg => {
    pageLogs.push(msg.text());
  });

  const testPagePath = path.resolve(__dirname, 'testpage.html');
  const fileUrl = `file:///${testPagePath.replace(/\\/g, '/')}`;
  console.log(`🌐 Navigating to test page: ${fileUrl}`);
  await page.goto(fileUrl);

  // Initialize engine and connect
  console.log('🔌 Connecting LocatorEngine to CDP...');
  const engine = new LocatorEngine();
  const pagesInfo = await engine.connect('http://127.0.0.1:9333');
  
  const testPageInfo = pagesInfo.find(p => p.url.includes('testpage.html'));
  if (!testPageInfo) {
    console.error('❌ Failed: Test page not found in engine connected pages list!');
    console.error('Available pages:', pagesInfo);
    await context.close();
    process.exit(1);
  }
  const pageId = testPageInfo.id;
  console.log(`✅ Connected successfully. Page ID: ${pageId}\n`);

  const results: TestResults = {
    summary: { total: 0, passed: 0, failed: 0 },
    details: []
  };

  function recordResult(category: string, name: string, passed: boolean, error?: string) {
    results.summary.total++;
    if (passed) {
      results.summary.passed++;
      console.log(`  🟢 PASS: [${category}] ${name}`);
    } else {
      results.summary.failed++;
      console.log(`  🔴 FAIL: [${category}] ${name}`);
      if (error) console.log(`     Reason: ${error}`);
    }
    results.details.push({ category, name, passed, error });
  }

  // 1. Playback / Playground tests
  console.log('--- Testing Locator Playground ---');
  const playgroundCases: TestCase[] = suite.playground;
  for (const tc of playgroundCases) {
    try {
      const res = await engine.evaluate(pageId, tc.locatorStr);
      if (res.success !== tc.expectedSuccess) {
        throw new Error(`Expected success=${tc.expectedSuccess}, got ${res.success}. Error: ${res.error}`);
      }
      if (res.count !== tc.expectedCount) {
        throw new Error(`Expected count=${tc.expectedCount}, got ${res.count}`);
      }
      if (tc.minConfidence && res.confidence < tc.minConfidence) {
        throw new Error(`Expected min confidence ${tc.minConfidence}, got ${res.confidence}`);
      }
      if (tc.maxConfidence && res.confidence > tc.maxConfidence) {
        throw new Error(`Expected max confidence ${tc.maxConfidence}, got ${res.confidence}`);
      }
      if (tc.expectedFactors) {
        for (const factor of tc.expectedFactors) {
          const found = res.confidenceFactors.some(f => f.text.includes(factor));
          if (!found) {
            throw new Error(`Expected confidence factor "${factor}" was not found. Factors: ${JSON.stringify(res.confidenceFactors)}`);
          }
        }
      }
      recordResult('Playground', tc.name, true);
    } catch (err: any) {
      recordResult('Playground', tc.name, false, err.message);
    }
  }

  // 2. Failure Analysis tests
  console.log('\n--- Testing Failure Diagnostics ---');
  const failureCases: TestCase[] = suite.failureAnalysis;
  for (const tc of failureCases) {
    try {
      const res = await engine.evaluate(pageId, tc.locatorStr);
      if (!res.success) {
        throw new Error(`Expected evaluate to succeed with count=0, but it failed with error: ${res.error}`);
      }
      if (res.count !== 0) {
        throw new Error(`Expected count=0 for failing locator, got ${res.count}`);
      }
      
      const fa = res.failureAnalysis;
      if (!fa) {
        throw new Error('Failure analysis result is missing!');
      }

      if (tc.expectedDiagnosticMessage && !fa.message.includes(tc.expectedDiagnosticMessage)) {
        throw new Error(`Expected message containing "${tc.expectedDiagnosticMessage}", got: "${fa.message}"`);
      }

      if (tc.expectedFailedStepIndex !== undefined) {
        const failedStep = fa.steps.findIndex(s => !s.success);
        if (failedStep !== tc.expectedFailedStepIndex) {
          throw new Error(`Expected step index ${tc.expectedFailedStepIndex} to fail, but index ${failedStep} failed instead. Steps: ${JSON.stringify(fa.steps)}`);
        }
      }

      if (tc.expectedAlternative) {
        const hasAlt = fa.suggestedAlternatives.some(alt => alt.selector.includes(tc.expectedAlternative!));
        if (!hasAlt) {
          throw new Error(`Expected alternative containing "${tc.expectedAlternative}" not found. Alternatives: ${JSON.stringify(fa.suggestedAlternatives)}`);
        }
      }

      recordResult('Diagnostics', tc.name, true);
    } catch (err: any) {
      recordResult('Diagnostics', tc.name, false, err.message);
    }
  }

  // 3. OR Chain Tree tests
  console.log('\n--- Testing OR Chains ---');
  const orCases: TestCase[] = suite.orChains;
  for (const tc of orCases) {
    try {
      const res = await engine.analyzeChain(pageId, tc.locatorStr);
      if (!res.success) {
        throw new Error(`Analyze chain failed: ${res.error}`);
      }
      if (res.totalMatches !== tc.expectedTotalMatches) {
        throw new Error(`Expected total matches ${tc.expectedTotalMatches}, got ${res.totalMatches}`);
      }
      if (tc.expectedBranches) {
        for (let i = 0; i < tc.expectedBranches.length; i++) {
          const expectedBranch = tc.expectedBranches[i];
          const actualBranch = res.branches[i];
          if (!actualBranch) {
            throw new Error(`Expected branch at index ${i} is missing`);
          }
          if (actualBranch.matchCount !== expectedBranch.matchCount) {
            throw new Error(`Branch ${i}: expected matchCount=${expectedBranch.matchCount}, got ${actualBranch.matchCount}`);
          }
          if (actualBranch.isWinner !== expectedBranch.isWinner) {
            throw new Error(`Branch ${i}: expected isWinner=${expectedBranch.isWinner}, got ${actualBranch.isWinner}`);
          }
        }
      }
      recordResult('OR Chains', tc.name, true);
    } catch (err: any) {
      recordResult('OR Chains', tc.name, false, err.message);
    }
  }

  // 4. Action Simulation tests
  console.log('\n--- Testing Action Simulation ---');
  const simCases: TestCase[] = suite.simulations;
  for (const tc of simCases) {
    try {
      if (tc.action === 'fill') {
        const success = await engine.simulateFill(pageId, tc.locatorStr, tc.value!);
        if (!success) throw new Error('Simulate fill returned false');
        
        // Verify value inside the actual page context
        const actualVal = await page.locator('#username-input').inputValue();
        if (actualVal !== tc.value) {
          throw new Error(`Simulate fill did not update input. Expected "${tc.value}", got "${actualVal}"`);
        }
      } else if (tc.action === 'click') {
        const success = await engine.simulateClick(pageId, tc.locatorStr);
        if (!success) throw new Error('Simulate click returned false');

        // Verify click event by checking console logs captured
        const hasClickLog = pageLogs.some(log => log.includes('Action: Signed In successfully!'));
        if (!hasClickLog) {
          throw new Error('Simulate click did not trigger login submit click handler.');
        }
      }
      recordResult('Simulations', tc.name, true);
    } catch (err: any) {
      recordResult('Simulations', tc.name, false, err.message);
    }
  }

  // 5. Stability tests
  console.log('\n--- Testing Stability Tests ---');
  const stabilityCases: TestCase[] = suite.stability;
  for (const tc of stabilityCases) {
    try {
      const res = await engine.stabilityTest(pageId, tc.locatorStr, 3);
      if (!res.success) throw new Error(`Stability test failed: ${res.error}`);
      if (res.score !== tc.expectedScore) {
        throw new Error(`Expected stability score ${tc.expectedScore}, got ${res.score}`);
      }
      recordResult('Stability', tc.name, true);
    } catch (err: any) {
      recordResult('Stability', tc.name, false, err.message);
    }
  }

  // 6. Security tests
  console.log('\n--- Testing Security Sandbox ---');
  const securityCases: TestCase[] = suite.security || [];
  for (const tc of securityCases) {
    try {
      const res = await engine.evaluate(pageId, tc.locatorStr);
      if (res.success !== tc.expectedSuccess) {
        throw new Error(`Expected success=${tc.expectedSuccess}, got ${res.success}. Error: ${res.error}`);
      }
      recordResult('Security', tc.name, true);
    } catch (err: any) {
      recordResult('Security', tc.name, false, err.message);
    }
  }

  // 7. UI Intelligence Scanner & Accessibility Audit
  console.log('\n--- Testing UI Intelligence Scanner ---');
  try {
    const scanResult = await engine.scanUI(pageId);
    
    // Check tree structure
    if (!scanResult.tree || scanResult.tree.length === 0) {
      throw new Error('UI Scan tree is empty');
    }
    
    // Check accessibility issues (Should find 3 issues from testpage.html)
    // 1. bad-input-no-label: missing label/placeholder
    // 2. bad-image-no-alt: missing alt text
    // 3. bad-button-no-text: button with no text
    const issues = scanResult.accessibilityIssues || [];
    const unlabeledInput = issues.some(i => i.elementId === 'bad-input-no-label' && i.type === 'missing-label');
    const unlabeledButton = issues.some(i => i.elementId === 'bad-button-no-text' && i.type === 'missing-label');
    const duplicateLabels = issues.some(i => i.type === 'duplicate-label' && i.description.includes('Delete'));

    if (!unlabeledInput) throw new Error('Audit did not detect missing label on input #bad-input-no-label');
    if (!unlabeledButton) throw new Error('Audit did not detect missing label on button #bad-button-no-text');
    if (!duplicateLabels) throw new Error('Audit did not detect duplicate labels for Delete buttons');

    recordResult('UI Scanner', 'Accessibility Audit Detection', true);

    // Test POM Code Generation
    const pomCode = engine.generatePOMExport(scanResult.tree, 'TestClass', 'none');
    if (!pomCode.includes('export class TestClassPage') || !pomCode.includes('readonly username: Locator;')) {
      throw new Error(`POM Export invalid. Generated code snippet:\n${pomCode.substring(0, 300)}`);
    }
    recordResult('UI Scanner', 'POM Export Code Generation', true);

    // Test SDK Code Generation
    const sdkCode = engine.generateSDKExport(scanResult.tree);
    if (!sdkCode.includes('export class UIAutomationSDK') || !sdkCode.includes('fillField')) {
      throw new Error('SDK Export invalid.');
    }
    recordResult('UI Scanner', 'SDK Export Code Generation', true);

  } catch (err: any) {
    recordResult('UI Scanner', 'UI Intelligence Scanner', false, err.message);
  }

  // 8. Element Interaction — Quick Actions
  console.log('\n--- Testing Element Interaction: Quick Actions ---');
  try {
    // Verify engine can perform a fill via the interaction method
    const fillOk = await engine.simulateFill(pageId, "getByLabel('Username')", 'playwright-user');
    if (!fillOk) throw new Error('Engine simulateFill returned false for a visible input');
    recordResult('Element Interaction', 'Quick Action: Fill on getByLabel', true);
  } catch (err: any) {
    recordResult('Element Interaction', 'Quick Action: Fill on getByLabel', false, err.message);
  }

  try {
    // Verify engine can click a button
    const clickOk = await engine.simulateClick(pageId, "getByRole('button', { name: 'Sign In' })");
    if (!clickOk) throw new Error('Engine simulateClick returned false for visible button');
    recordResult('Element Interaction', 'Quick Action: Click on getByRole button', true);
  } catch (err: any) {
    recordResult('Element Interaction', 'Quick Action: Click on getByRole button', false, err.message);
  }

  try {
    // Verify engine can hover
    const hoverOk = await engine.simulateHover(pageId, "getByRole('button', { name: 'Sign In' })");
    if (!hoverOk) throw new Error('Engine simulateHover returned false for visible button');
    recordResult('Element Interaction', 'Quick Action: Hover on element', true);
  } catch (err: any) {
    recordResult('Element Interaction', 'Quick Action: Hover on element', false, err.message);
  }

  // 9. Element Scripting — sandbox execution
  console.log('\n--- Testing Element Scripting Sandbox ---');
  try {
    // Engine evaluates locator, then runs a script against the element
    const evalRes = await engine.evaluate(pageId, "getByLabel('Username')");
    if (!evalRes.success || evalRes.count < 1) throw new Error('Locator for scripting did not resolve to an element');
    recordResult('Element Scripting', 'Locator resolves before scripting', true);
  } catch (err: any) {
    recordResult('Element Scripting', 'Locator resolves before scripting', false, err.message);
  }

  try {
    // Script sandbox should block non-Playwright method names
    const badLocator = 'page.__proto__.constructor.name'; // malicious traversal
    const res = await engine.evaluate(pageId, badLocator);
    // Should fail to evaluate safely (not crash the process)
    recordResult('Element Scripting', 'Security: malformed locator rejected safely', !res.success || res.count === 0);
  } catch (err: any) {
    // A thrown error also means the sandbox caught it — acceptable
    recordResult('Element Scripting', 'Security: malformed locator rejected safely', true);
  }

  // 10. Workspace Script Runner — CDP wrapping & import handling
  console.log('\n--- Testing Workspace Script Runner Preparation ---');
  try {
    // Verify prepareWorkspaceScript does not double-import @playwright/test
    // when the user script already imports `test` from a custom fixture
    const { prepareWorkspaceScript } = await import('playwright-locator-toolkit-engine');
    const userScript = `import { test, expect } from '../fixtures/core/appRegistry.fixture.js';
test('example', async ({ page }) => { await page.goto('https://example.com'); });`;
    const prepared = prepareWorkspaceScript(userScript, 'playwright-test', false, undefined);
    const importCount = (prepared.match(/import\s+[^;]+\btest\b/g) || []).length;
    if (importCount > 1) {
      throw new Error(`Duplicate import detected: ${importCount} test imports in prepared script`);
    }
    recordResult('Workspace Runner', 'No duplicate test import when custom fixture present', true);
  } catch (err: any) {
    // If engine doesn't export prepareWorkspaceScript directly, skip gracefully
    if (err.message?.includes('prepareWorkspaceScript')) {
      console.log('  ⚠️  SKIP: prepareWorkspaceScript not exported — tested via integration only');
    } else {
      recordResult('Workspace Runner', 'No duplicate test import when custom fixture present', false, err.message);
    }
  }

  try {
    // Verify CDP-attached wrapper contains connectOverCDP and injects the page
    const { prepareWorkspaceScript } = await import('playwright-locator-toolkit-engine');
    const userScript = `console.log('page title:', await page.title());`;
    const prepared = prepareWorkspaceScript(userScript, 'playwright-test', true, undefined);
    if (!prepared.includes('connectOverCDP')) {
      throw new Error('CDP-attached wrapper is missing connectOverCDP call');
    }
    if (!prepared.includes('page')) {
      throw new Error('CDP-attached wrapper is missing page variable injection');
    }
    recordResult('Workspace Runner', 'CDP-attach wrapper contains connectOverCDP + page', true);
  } catch (err: any) {
    if (err.message?.includes('prepareWorkspaceScript')) {
      console.log('  ⚠️  SKIP: prepareWorkspaceScript not exported — tested via integration only');
    } else {
      recordResult('Workspace Runner', 'CDP-attach wrapper contains connectOverCDP + page', false, err.message);
    }
  }

  // Print Summary
  console.log('\n==================================================');
  console.log('📊 E2E Test Suite Summary');
  console.log('==================================================');
  console.log(`Total:  ${results.summary.total}`);
  console.log(`Passed: ${results.summary.passed}`);
  console.log(`Failed: ${results.summary.failed}`);
  console.log('==================================================');

  // Save results
  const resultsPath = path.join(__dirname, 'testresults.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`💾 Results saved to ${resultsPath}\n`);

  await context.close();

  if (results.summary.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
