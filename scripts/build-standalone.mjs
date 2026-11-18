// Builds standalone/yield-advisor.html: the whole app in one file that opens by double-click,
// with no Node, npm or local server needed. Used as the fallback on locked-down laptops.
// The OpenRouter key is never baked in: VITE_OPENROUTER_API_KEY is forced empty for this build,
// so model mode in the standalone file needs the key pasted into the demo panel.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const tmp = '.standalone-tmp';
rmSync(tmp, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--outDir', tmp, '--base', './', '--emptyOutDir'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_OPENROUTER_API_KEY: '' },
});

let html = readFileSync(join(tmp, 'index.html'), 'utf8');
const assets = join(tmp, 'assets');
for (const f of readdirSync(assets)) {
  const body = readFileSync(join(assets, f), 'utf8');
  if (f.endsWith('.js')) {
    const tag = new RegExp(`<script[^>]*src="\\./assets/${f.replace('.', '\\.')}"[^>]*></script>`);
    // Escape closing tags inside the bundle so the inline script isn't cut short.
    html = html.replace(tag, () => `<script type="module">${body.replace(/<\/script/gi, '<\\/script')}</script>`);
    html = html.replace(new RegExp(`<link[^>]*href="\\./assets/${f.replace('.', '\\.')}"[^>]*>`), '');
  } else if (f.endsWith('.css')) {
    const tag = new RegExp(`<link[^>]*href="\\./assets/${f.replace('.', '\\.')}"[^>]*>`);
    html = html.replace(tag, () => `<style>${body}</style>`);
  }
}
if (/\.\/assets\//.test(html)) throw new Error('An asset reference was not inlined');
if (/sk-or-/.test(html)) throw new Error('Refusing to write: output contains something that looks like an OpenRouter key');

mkdirSync('standalone', { recursive: true });
writeFileSync('standalone/yield-advisor.html', html);
rmSync(tmp, { recursive: true, force: true });
console.log(`Wrote standalone/yield-advisor.html (${Math.round(html.length / 1024)} KB)`);
