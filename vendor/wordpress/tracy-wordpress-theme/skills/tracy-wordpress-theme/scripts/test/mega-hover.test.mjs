// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/test/mega-hover.test.mjs — WordPress changes: the fixture is navigation-block markup (.has-child + .wp-block-navigation__submenu-container) opened with the hover contract of the block, not T4 megamenu.js classes.
// mega-hover.mjs must FAIL on the geometric hover gap (gotchas #80) and PASS once the strip is
// bridged. The fixture re-creates the navigation block's hover contract — the submenu container
// is painted while the pointer is over the `.has-child` item and hidden the moment it leaves —
// with a full-width panel hung 26px below the nav row, exactly the Northgate shape.
// `?bridge=1` adds the pseudo-element bridge.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'

const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const bridge = u.searchParams.get('bridge') === '1'
  const noMenu = u.pathname === '/plain'
  // `card=1`: a full-width block link where the old fixed "outside" spot (centre, y=850) lands
  const card = u.searchParams.get('card') === '1'
  // `self=1`: the panel's first link is the page itself, marked aria-current="page" the way the
  // theme marks it; a second link leads away
  const self = u.searchParams.get('self') === '1'
  // `here=1`: the same, WITHOUT aria-current (JA Vega's mega marks nothing: on
  // /services/managed-services the Our Services panel's first link is that page)
  const here = u.searchParams.get('here') === '1'
  // `flaky=1`: the bridged panel drops ONCE on the first pointer step into the strip — the shape
  // of a close grace lost to a slow walk — and a pointer back over the trigger reopens it
  const flaky = u.searchParams.get('flaky') === '1'
  // `lb=1`: the "link + button" item (JA Vega's `.jv-mega`, the navigation block's own submenu
  // shape): the label is a LINK to a page, the button beside it opens the panel. Escape starts a
  // 300 ms close (the panel is still painted at 150 ms), and the theme does not reopen the panel
  // for a pointer that never left the item. `plain=1`: the panel carries only the theme's own class.
  if (u.searchParams.get('lb') === '1') {
    const plain = u.searchParams.get('plain') === '1'
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html><head><style>
  body{margin:0;font:14px sans-serif}
  header{height:85px;background:#eee;display:flex;gap:24px;padding:26px 40px 0;box-sizing:border-box}
  .jv-mega{position:relative;display:flex;align-items:flex-start;height:59px}
  .jv-mega__link{display:inline-block;padding:6px 0;height:20px}
  .jv-mega__trigger{height:32px;width:24px}
  .jv-mega__panel{display:none;position:absolute;left:0;top:100%;width:320px;background:#fff;border:1px solid #ccc;padding:30px}
  .jv-mega.is-open > .jv-mega__panel{display:block}
  main{height:1200px}
  </style></head><body>
  <header><a href="/plain">Home</a>
  <div class="jv-mega has-child"><a class="jv-mega__link" href="/plain?from=label">Our Services</a><button type="button" class="jv-mega__trigger" aria-expanded="false">v</button>
    <div class="jv-mega__panel${plain ? '' : ' wp-block-navigation__submenu-container'}"><a href="/plain?from=panel">Consulting</a></div></div>
  </header><main>page</main>
  <script>
  const m = document.querySelector('.jv-mega');
  let closing = null;
  const open = () => { clearTimeout(closing); m.classList.add('is-open'); };
  m.addEventListener('mouseenter', open);
  m.addEventListener('mouseleave', () => { clearTimeout(closing); m.classList.remove('is-open'); });
  m.querySelector('button').addEventListener('click', () => { if (m.classList.contains('is-open')) m.classList.remove('is-open'); else open(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closing = setTimeout(() => m.classList.remove('is-open'), 300); });
  document.addEventListener('click', (e) => { if (!m.contains(e.target)) m.classList.remove('is-open'); });
  </script></body></html>`)
    return
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><html><head><style>
  body{margin:0;font:14px sans-serif}
  header{position:relative;height:85px;background:#eee}
  .wp-block-navigation,.wp-block-navigation__container{position:static;margin:0;padding:0;list-style:none}
  .wp-block-navigation__container{display:flex;gap:24px;padding:26px 40px 0}
  .wp-block-navigation-item{position:static}
  .wp-block-navigation-item__content{display:inline-flex;position:relative;padding:6px 0;height:20px}
  .wp-block-navigation__submenu-container{display:none;position:absolute;left:0;right:0;top:100%;background:#fff;border-top:1px solid #ccc;padding:40px}
  .has-child.is-open > .wp-block-navigation__submenu-container{display:block}
  ${
    bridge
      ? `.has-child.is-open > .wp-block-navigation-item__content::after{content:'';display:block;position:absolute;left:0;right:0;top:100%;height:32px}
  .has-child.is-open > .wp-block-navigation__submenu-container::before{content:'';display:block;position:absolute;left:0;right:0;bottom:100%;height:26px}`
      : ''
  }
  main{height:1200px}
  </style></head><body>
  ${
    noMenu
      ? '<header>no menu</header>'
      : `<header><nav class="wp-block-navigation"><ul class="wp-block-navigation__container">
    <li class="wp-block-navigation-item"><a class="wp-block-navigation-item__content" href="/plain">Home</a></li>
    <li class="wp-block-navigation-item has-child"><a class="wp-block-navigation-item__content" href="#">Resources</a>
      <ul class="wp-block-navigation__submenu-container">${here ? '<li class="wp-block-navigation-item"><a class="wp-block-navigation-item__content" href="/?bridge=1&here=1">This page</a></li>' : ''}${self ? '<li class="wp-block-navigation-item"><a class="wp-block-navigation-item__content" aria-current="page" href="/?bridge=1&self=1">This page</a></li>' : ''}<li class="wp-block-navigation-item"><a class="wp-block-navigation-item__content" href="/plain?from=panel">Newsletter</a></li></ul></li>
  </ul></nav></header>`
  }
  <main>page${card ? '<a href="/plain?from=card" style="display:block;position:absolute;left:0;top:700px;width:100%;height:200px;background:#ddd">featured card</a>' : ''}</main>
  <script>
  document.querySelectorAll('.has-child').forEach(li => {
    li.addEventListener('mouseenter', () => li.classList.add('is-open'));
    li.addEventListener('mouseleave', () => li.classList.remove('is-open'));
    ${
      flaky
        ? `let flaked = false;
    li.addEventListener('mousemove', (e) => {
      const t = li.querySelector('.wp-block-navigation-item__content').getBoundingClientRect();
      if (e.clientY <= t.bottom) { li.classList.add('is-open'); return; }
      if (!flaked) { flaked = true; li.classList.remove('is-open'); }
    });`
        : ''
    }
  });
  const closeAll = () => document.querySelectorAll('.has-child.is-open').forEach(el => el.classList.remove('is-open'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
  document.addEventListener('click', e => { if (!e.target.closest('.wp-block-navigation')) closeAll(); });
  </script></body></html>`)
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
test.after(async () => {
  server.close()
  await once(server, 'close')
})

async function run(path, ...args) {
  const child = spawn(process.execPath, [
    new URL('../review/mega-hover.mjs', import.meta.url).pathname,
    base + path,
    ...args
  ])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  return { code, output }
}

test('a full-width panel hung below the nav row FAILS: the pointer path closes it', async () => {
  const r = await run('/')
  assert.equal(r.code, 1, r.output)
  assert.match(r.output, /"gapPx":2[5-9]/)
  assert.match(r.output, /"survivesDrop":false,"closedAtY":\d+/)
  assert.match(r.output, /1 FAIL/)
})

test('the same panel with the pseudo-element bridge PASSES end to end', async () => {
  const r = await run('/?bridge=1')
  assert.equal(r.code, 0, r.output)
  assert.match(r.output, /"survivesDrop":true/)
  assert.match(r.output, /"clickNavigates":true,"landed":"[^"]*from=panel"/)
  assert.match(r.output, /"escapeCloses":true,"outsideClickCloses":true/)
})

// On /newsletter/ the Resources panel's first link IS /newsletter/: the click lands where it
// started and "did the URL change" read a working menu as one that does not navigate (full-1).
test('the panel link to the current page (aria-current) is not the one clicked', async () => {
  const r = await run('/?bridge=1&self=1')
  assert.equal(r.code, 0, r.output)
  assert.match(r.output, /"clickNavigates":true,"landed":"[^"]*from=panel"/)
})

// The theme's mega closes on pointerleave after a 220 ms grace, and the walk across its 12 px
// strip ran past that grace under the visual-qa harness's load (en-project-detail 1440-dark,
// full-3: closedAtY 122, the first step inside the panel; 0 of 6 reruns alone). A close on the
// way down is walked again before it counts; a geometric gap still closes twice (the test above).
test('a panel that dropped once on the way down is walked again and passes, and says so', async () => {
  const r = await run('/?bridge=1&flaky=1')
  assert.equal(r.code, 0, r.output)
  assert.match(r.output, /"dropRetried":true,"survivesDrop":true/)
})

test('a page with no panel-owning item is reported as untested, not clean', async () => {
  const r = await run('/plain')
  assert.equal(r.code, 1, r.output)
  assert.match(r.output, /NO ITEMS/)
})

// The "outside" click closes the panel; it must not also OPEN A LINK. On the news page of
// wp-tracy-business the fixed spot (centre, y=850) sat on the featured card, the click navigated,
// and the evaluate after it died with "Execution context was destroyed" — a broken tool read as a
// broken menu (15/09). The spot is now searched for off any link.
test('the outside click lands off any link — a card under the old fixed spot does not navigate', async () => {
  const r = await run('/?bridge=1&card=1')
  assert.equal(r.code, 0, r.output)
  assert.doesNotMatch(r.output, /Execution context was destroyed|from=card/)
  assert.match(r.output, /"outsideClickCloses":true/)
})

// JA Vega M4 (26/09): `--items .jv-mega` on a "link + button" item. The trigger was the first of
// `:scope > a, …, :scope > button` — the LABEL LINK. Step 5 reopened the panel by clicking it after
// Escape (the theme does not reopen for a pointer that never left), the page navigated, and the
// next evaluate died with "Execution context was destroyed", uncaught: visual-qa read `output: ""`
// on 31 of 31 pages. The button is the trigger; nothing but the panel link navigates; Escape is
// given the time its close transition takes.
test('a "link + button" item is driven by its button: PASS, and the label link is never followed', async () => {
  const r = await run('/?lb=1', '--items', '.jv-mega')
  assert.equal(r.code, 0, r.output)
  assert.doesNotMatch(r.output, /Execution context was destroyed|from=label/)
  assert.match(r.output, /PASS\s+Our Services/)
  assert.match(r.output, /"clickNavigates":true,"landed":"[^"]*from=panel"/)
  assert.match(r.output, /"escapeCloses":true/)
  assert.match(r.output, /"outsideClickCloses":true/)
})

// The contract names the theme's own trigger and panel (visual.contract.json interactions.mega);
// the walk measures those, not the navigation block's classes.
test('--trigger and --panel name the item\'s parts when the theme does not use the navigation block classes', async () => {
  const r = await run('/?lb=1&plain=1', '--items', '.jv-mega', '--trigger', '.jv-mega__trigger', '--panel', '.jv-mega__panel')
  assert.equal(r.code, 0, r.output)
  assert.match(r.output, /1 item\(s\) tested/)
})

// A trigger the contract names is the trigger: an item it does not match fails by name. Falling back
// to the item's own button would walk a part the contract did not declare and pass a wrong contract.
test('a declared --trigger that matches nothing in the item FAILS; the walk does not fall back to a guess', async () => {
  const r = await run('/?lb=1', '--items', '.jv-mega', '--trigger', '.no-such-trigger')
  assert.equal(r.code, 1, r.output)
  assert.match(r.output, /--trigger "\.no-such-trigger" matches nothing in the item/)
  assert.doesNotMatch(r.output, /PASS/)
})

// A flag with no value read as not given: `--trigger` at the end of the line ran on the fallback
// triggers and could PASS. A named flag with no value is a usage error.
test('a declared --trigger or --panel with no value is exit 2, not a walk on the defaults', async () => {
  const bare = await run('/?lb=1', '--items', '.jv-mega', '--trigger')
  assert.equal(bare.code, 2, bare.output)
  assert.match(bare.output, /--trigger needs a value/)
  const swallowed = await run('/?lb=1', '--trigger', '--panel', '.jv-mega__panel')
  assert.equal(swallowed.code, 2, swallowed.output)
  assert.match(swallowed.output, /--trigger needs a value/)
  assert.doesNotMatch(bare.output + swallowed.output, /PASS/)
})

// JA Vega (26/09, live after the trigger fix): on /services/managed-services the first panel link is
// the page itself with no aria-current, the click landed where it started, and a working menu read
// `clickNavigates: false`. A link to the page the walk is on is not the one clicked, marked or not.
test('the panel link to the current page is skipped even when nothing marks it aria-current', async () => {
  const r = await run('/?bridge=1&here=1')
  assert.equal(r.code, 0, r.output)
  assert.match(r.output, /"clickNavigates":true,"landed":"[^"]*from=panel"/)
})
