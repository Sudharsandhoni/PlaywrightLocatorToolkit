const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensurePlaywrightCore() {
  try {
    const srcPkgJson = require.resolve('playwright-core/package.json');
    const srcDir = path.dirname(srcPkgJson);
    const destDir = path.join(__dirname, 'node_modules', 'playwright-core');

    const normSrc = path.normalize(srcDir);
    const normDest = path.normalize(destDir);

    if (normSrc === normDest) {
      console.log('playwright-core is already in packages/extension/node_modules.');
      return;
    }

    console.log(`Copying playwright-core from ${normSrc} to ${normDest}...`);
    if (fs.existsSync(normDest)) {
      fs.rmSync(normDest, { recursive: true, force: true });
    }
    copyDir(normSrc, normDest);
    console.log('playwright-core copied successfully.');
  } catch (err) {
    console.error('Failed to ensure playwright-core is in local node_modules:', err);
    process.exit(1);
  }
}

async function main() {
  ensurePlaywrightCore();
  const ctx = await esbuild.context({
    entryPoints: [path.join(__dirname, 'src', 'extension.ts')],
    bundle: true,
    outfile: path.join(__dirname, 'dist', 'extension.js'),
    external: ['vscode', 'playwright-core'],
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    sourcemap: true,
    minify: false,
    alias: {
      'playwright-locator-toolkit-shared': path.resolve(__dirname, '../shared/src/index.ts'),
      'playwright-locator-toolkit-parser': path.resolve(__dirname, '../locator-parser/src/index.ts'),
      'playwright-locator-toolkit-agent': path.resolve(__dirname, '../browser-agent/src/index.ts'),
      'playwright-locator-toolkit-engine': path.resolve(__dirname, '../engine/src/index.ts')
    },
  });

  if (isWatch) {
    console.log('Watching for changes...');
    await ctx.watch();
  } else {
    await ctx.rebuild();
    console.log('Build completed successfully.');
    await ctx.dispose();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
