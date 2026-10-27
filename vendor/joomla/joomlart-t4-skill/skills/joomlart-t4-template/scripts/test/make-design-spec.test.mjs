import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '..', 'make-design-spec.mjs');

const pageMap = JSON.stringify({
  template: { name: 'ja_acme', title: 'Acme', bootstrap: 'bs5' },
  theme: {
    palette: {
      light: { primary: '#2b6cb0', secondary: '#718096', body_bg: '#ffffff', text: '#1a202c' },
      dark: { primary: '#63b3ed', secondary: '#a0aec0', body_bg: '#1a202c', text: '#e2e8f0' },
    },
    fonts: { body: 'Inter', heading: 'Poppins' },
  },
  positions: ['menu', 'section-1', 'footer'],
  pages: [
    { file: 'index.html', view: 'com_content.featured', layout: 'home' },
    { file: 'single.html', view: 'com_content.article' },
  ],
});

function gen(input) {
  return execFileSync('node', [script, '-'], { input, encoding: 'utf8' });
}

test('design-spec carries identity + auto-filled palette/fonts', () => {
  const md = gen(pageMap);
  assert.match(md, /ja_acme/);
  assert.match(md, /#2b6cb0/);            // light primary auto-filled
  assert.match(md, /#63b3ed/);            // dark primary auto-filled
  assert.match(md, /`Inter`/);            // body font
  assert.match(md, /`ja_acme-<chrome>`/); // dash-format chrome naming with the real name
});

test('design-spec leaves TODO slots for Phase-6 values', () => {
  const md = gen(pageMap);
  assert.match(md, /TODO/);                 // has TODO markers
  assert.match(md, /`border` \| `TODO`/);   // border companion not auto-filled
  assert.match(md, /Dark hook.*`TODO`/);    // dark hook to pin in Phase 0
});

test('per-artifact source table lists the pages', () => {
  const md = gen(pageMap);
  assert.match(md, /index\.html/);
  assert.match(md, /single\.html/);
  assert.match(md, /com_content\.featured/);
});

test('degrades gracefully on a minimal page-map', () => {
  const md = gen(JSON.stringify({ template: { name: 'ja_x' } }));
  assert.match(md, /ja_x/);
  assert.match(md, /TODO/);
});
