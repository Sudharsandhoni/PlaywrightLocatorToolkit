const esbuild = require('esbuild');
const path = require('path');

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');

async function main() {
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
      'playwright-locator-lens-shared': path.resolve(__dirname, '../shared/src/index.ts'),
      'playwright-locator-lens-parser': path.resolve(__dirname, '../locator-parser/src/index.ts'),
      'playwright-locator-lens-agent': path.resolve(__dirname, '../browser-agent/src/index.ts'),
      'playwright-locator-lens-engine': path.resolve(__dirname, '../engine/src/index.ts')
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
