// mega-hover.mjs must FAIL on the geometric hover gap (gotchas #80) and PASS once the strip is
// bridged. The fixture re-creates T4's megamenu.js contract — `.show` on the <li> and its
// `.dropdown-menu` on mouseenter, removed on mouseleave — with a full-width panel hung 26px
// below the nav row, exactly the Northgate shape. `?bridge=1` adds the pseudo-element bridge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const bridge = u.searchParams.get('bridge') === '1';
  const noMenu = u.pathname === '/plain';
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><html><head><style>
  body{margin:0;font:14px sans-serif}
  header{position:relative;height:85px;background:#eee}
  .t4-megamenu,.navbar-nav{position:static;margin:0;padding:0;list-style:none}
  .navbar-nav{display:flex;gap:24px;padding:26px 40px 0}
  .nav-item{position:static}
  .nav-link{display:inline-flex;position:relative;padding:6px 0;height:20px}
  .dropdown-menu{display:none;position:absolute;left:0;right:0;top:100%;background:#fff;border-top:1px solid #ccc;padding:40px}
  .dropdown-menu.show{display:block}
  ${bridge ? `.nav-item.show > .nav-link::after{content:'';display:block;position:absolute;left:0;right:0;top:100%;height:32px}
  .dropdown-menu.show::before{content:'';display:block;position:absolute;left:0;right:0;bottom:100%;height:26px}` : ''}
  main{height:1200px}
  </style></head><body>
  ${noMenu ? '<header>no menu</header>' : `<header><div class="t4-megamenu"><ul class="navbar-nav level0">
    <li class="nav-item"><a class="nav-link" href="/plain">Home</a></li>
    <li class="nav-item dropdown"><a class="nav-link dropdown-toggle" href="#">Resources</a>
      <div class="dropdown-menu"><a href="/plain?from=panel">Newsletter</a></div></li>
  </ul></div></header>`}
  <main>page</main>
  <script>
  document.querySelectorAll('.nav-item.dropdown').forEach(li => {
    const dd = li.querySelector('.dropdown-menu');
    li.addEventListener('mouseenter', () => { li.classList.add('show'); dd.classList.add('show'); });
    li.addEventListener('mouseleave', () => { li.classList.remove('show'); dd.classList.remove('show'); });
  });
  const closeAll = () => document.querySelectorAll('.nav-item.show,.dropdown-menu.show').forEach(el => el.classList.remove('show'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
  document.addEventListener('click', e => { if (!e.target.closest('.t4-megamenu')) closeAll(); });
  </script></body></html>`);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { server.close(); await once(server, 'close'); });

async function run(path) {
  const child = spawn(process.execPath, [new URL('../review/mega-hover.mjs', import.meta.url).pathname, base + path]);
  let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  const [code] = await once(child, 'close'); return { code, output };
}

test('a full-width panel hung below the nav row FAILS: the pointer path closes it', async () => {
  const r = await run('/');
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /"gapPx":2[5-9]/);
  assert.match(r.output, /"survivesDrop":false,"closedAtY":\d+/);
  assert.match(r.output, /1 FAIL/);
});

test('the same panel with the pseudo-element bridge PASSES end to end', async () => {
  const r = await run('/?bridge=1');
  assert.equal(r.code, 0, r.output);
  assert.match(r.output, /"survivesDrop":true/);
  assert.match(r.output, /"clickNavigates":true,"landed":"[^"]*from=panel"/);
  assert.match(r.output, /"escapeCloses":true,"outsideClickCloses":true/);
});

test('a page with no panel-owning item is reported as untested, not clean', async () => {
  const r = await run('/plain');
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /NO ITEMS/);
});
