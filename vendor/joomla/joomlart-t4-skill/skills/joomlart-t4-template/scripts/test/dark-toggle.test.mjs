// dark-toggle.mjs must hold a template to the `?theme=dark|light` contract (darkmode-gotchas #54),
// not only to its toggle. The fixture re-creates the T4 standard (dark-light-mode-standard.md):
// an inline <head> resolver standing in for index.php's server-side one, a deferred darkmode.js
// with an OS-follow listener, a cookie, and the three hooks. `/good` follows the whole rule; every
// other path breaks exactly one part of it, and each break must turn the gate red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const COOKIE = 'fx-theme';

// The first-paint resolver. `honour` false = the pre-fix standard: cookie → OS only.
function headScript({ honour, hooks }) {
  return `(function(){
    var q = /[?&]theme=(dark|light)(?:&|#|$)/.exec(location.search);
    var c = /(?:^|;\\s*)${COOKIE}=(dark|light)\\b/.exec(document.cookie);
    var t = ${honour ? 'q ? q[1] : ' : ''}(c ? c[1] : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    var h = document.documentElement;
    h.setAttribute('data-theme', t);
    ${hooks === 2 ? '' : "h.setAttribute('data-bs-theme', t);"}
    h.classList.toggle('t4-dark', t === 'dark');
  })();`;
}

// darkmode.js. `asked` false = ignores the address; `osWins` = the OS listener forgets it;
// `saves` = writes the asked theme to the cookie on load.
function darkmodeJs({ asked = true, osWins = false, saves = false, hooks = 3 } = {}) {
  return `(function(){
    var root = document.documentElement;
    var m = /[?&]theme=(dark|light)(?:&|#|$)/.exec(location.search);
    var askedTheme = ${asked ? "m ? m[1] : ''" : "''"};
    function cookie(){ var c = /(?:^|;\\s*)${COOKIE}=(dark|light)\\b/.exec(document.cookie); return c ? c[1] : ''; }
    function apply(t){
      root.setAttribute('data-theme', t);
      ${hooks === 2 ? '' : "root.setAttribute('data-bs-theme', t);"}
      root.classList.toggle('t4-dark', t === 'dark');
    }
    function current(){ return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
    if (askedTheme) { apply(askedTheme); ${saves ? `document.cookie = '${COOKIE}=' + askedTheme + ';path=/';` : ''} }
    document.addEventListener('click', function(e){
      if (!e.target.closest('.t4-theme-toggle')) return;
      var next = current() === 'dark' ? 'light' : 'dark';
      apply(next); document.cookie = '${COOKIE}=' + next + ';path=/';
    });
    var mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', function(e){
      if (${osWins ? '' : 'askedTheme || '}cookie()) return;
      apply(e.matches ? 'dark' : 'light');
    });
  })();`;
}

const variants = {
  '/good': { head: { honour: true }, js: {} },
  '/ignores': { head: { honour: false }, js: { asked: false } }, // the pre-fix standard
  '/js-only': { head: { honour: false }, js: {} }, // right after load, wrong at first paint
  '/os-wins': { head: { honour: true }, js: { osWins: true } },
  '/saves': { head: { honour: true }, js: { saves: true } },
  '/two-hooks': { head: { honour: true, hooks: 2 }, js: { hooks: 2 } }, // data-bs-theme never moves
};

const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.endsWith('/darkmode.js')) {
    const v = variants[u.pathname.slice(0, -'/darkmode.js'.length)];
    res.writeHead(v ? 200 : 404, { 'content-type': 'text/javascript' });
    res.end(v ? darkmodeJs(v.js) : '');
    return;
  }
  const v = variants[u.pathname];
  if (!v) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><html><head>
  <script>${headScript(v.head)}</script>
  <style>
  body{margin:0;background:rgb(255,255,255);color:rgb(0,0,0)}
  html[data-theme=dark] body{background:rgb(20,20,20);color:rgb(240,240,240)}
  </style>
  <script src="${u.pathname}/darkmode.js" defer></script>
  </head><body><header><button type="button" class="t4-theme-toggle">Theme</button></header>
  <main>${'<p>Page</p>'.repeat(10)}</main></body></html>`);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const scratch = mkdtempSync(join(tmpdir(), 't4-dark-toggle-'));
const config = join(scratch, 'config.json');
writeFileSync(config, JSON.stringify({ hook: { type: 'class', name: 't4-dark' }, toggle: '.t4-theme-toggle', persistence: { type: 'cookie', key: COOKIE }, expectedSelectors: [] }));
test.after(async () => { server.close(); await once(server, 'close'); rmSync(scratch, { recursive: true, force: true }); });

async function run(path) {
  const child = spawn(process.execPath, [new URL('../review/dark-toggle.mjs', import.meta.url).pathname, base + path, '1366', '--config', config]);
  let output = ''; child.stdout.on('data', (d) => output += d); child.stderr.on('data', (d) => output += d);
  const [code] = await once(child, 'close'); return { code, output };
}

test('a template that follows the whole ?theme rule PASSES', async () => {
  const r = await run('/good');
  assert.equal(r.code, 0, r.output);
  assert.match(r.output, /^PASS .*\?theme=dark\|light wins for one load, never saved$/m);
});

test('the pre-fix standard (cookie then OS, no ?theme) FAILS at first paint', async () => {
  const r = await run('/ignores');
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /\?theme ✗ \?theme=dark \(OS light\): first paint wore data-theme=light/);
  assert.match(r.output, /^FAIL /m);
});

test('honouring ?theme only in the deferred darkmode.js still FAILS: the first paint flashes', async () => {
  const r = await run('/js-only');
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /first paint wore/);
  assert.doesNotMatch(r.output, /\(OS \w+\): after load/, 'after load the JS has applied it; only first paint is wrong');
});

test('an OS change that takes the asked theme back FAILS', async () => {
  const r = await run('/os-wins');
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /an OS change took it back/);
});

test('saving the asked theme FAILS, and so does overwriting a saved choice', async () => {
  const r = await run('/saves');
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /was saved: cookie fx-theme=/);
  assert.match(r.output, /overwrote the saved choice/);
});

test('moving two of the three T4 hooks FAILS', async () => {
  const r = await run('/two-hooks');
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /data-bs-theme=null/);
});
