// review/scan.mjs runs leak-scan, contrast-audit and editability over N routes on ONE browser,
// in parallel, and must print the same `<tool> <route> {…}` lines the standalone scripts print,
// in route order, with the same verdicts. A route that cannot be scanned is a `fail` line, not
// a missing line. A second run with --cache serves unchanged routes from the cache and says so.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const scratch = mkdtempSync(join(tmpdir(), 'review-scan-'))
const server = createServer((req, res) => {
  if (req.url.startsWith('/error')) {
    res.writeHead(404, { 'content-type': 'text/html' })
    return res.end('<h1>nope</h1>')
  }
  if (req.url.startsWith('/borders')) {
    // dark page: one border the design declares (brand orange, a custom property on :root) and one
    // it does not (a seam left over from the light theme)
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(`<!doctype html><html data-theme="dark"><head><style>
  :root{--brand-orange:#da5a2a;--surface:#191c1f}
  body{background:rgb(16,18,20);color:rgb(236,234,228)}
  .brand{border:2px solid var(--brand-orange);padding:20px;margin:10px}
  .seam{border:1px solid #e5e5e5;padding:20px;margin:10px}
  </style></head><body><header><p>Fixture header copy here</p></header><main>
  <div class="brand">A filled brand button in dark</div>
  <div class="seam">A seam left over from the light theme</div>
  ${'<p>Visible content of the page</p>'.repeat(25)}</main>
  <footer><p>Footer words baked in template</p></footer></body></html>`)
  }
  const dim = req.url.startsWith('/dim')
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><html data-theme="light"><head><style>
  body{background:#fff;color:#000}
  html[data-theme=dark] body{background:rgb(20,20,20);color:rgb(240,240,240)}
  html[data-theme=dark] .dim{color:rgb(40,40,40)}
  </style></head><body><header><p>Fixture header copy here</p></header><main>
  <h1>Welcome to the fixture page</h1>${'<p>Visible content of the page</p>'.repeat(25)}
  ${dim ? '<p class="dim">Barely visible dim text</p>' : ''}</main>
  <footer><p>Footer words baked in template</p></footer></body></html>`)
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
const config = join(scratch, 'config.json')
writeFileSync(
  config,
  JSON.stringify({
    hook: { type: 'attribute', name: 'data-theme' },
    toggle: '.toggle',
    persistence: { type: 'cookie', key: 'theme' },
    expectedSelectors: ['header', 'main']
  })
)
const theme = join(scratch, 'theme')
mkdirSync(join(theme, 'parts'), { recursive: true })
mkdirSync(join(theme, 'templates'), { recursive: true })
writeFileSync(join(theme, 'style.css'), '/* Theme Name: fixture */')
writeFileSync(join(theme, 'parts', 'header.html'), '<header>Fixture header copy here</header>')
writeFileSync(join(theme, 'templates', 'index.html'), '<footer>Footer words baked in template</footer>')
test.after(async () => {
  server.close()
  await once(server, 'close')
  rmSync(scratch, { recursive: true, force: true })
})

async function run(...args) {
  const child = spawn(process.execPath, [new URL('../review/scan.mjs', import.meta.url).pathname, base, ...args])
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => (stdout += d))
  child.stderr.on('data', (d) => (stderr += d))
  const [code] = await once(child, 'close')
  return { code, stdout, stderr }
}
const lines = (s) => s.split('\n').filter((l) => /^(leak-scan|contrast-audit|editability) /.test(l))

test('scan: one line per tool per route in route order, verdicts as the standalone tools give them', async () => {
  const out = join(scratch, 'scanners.json')
  const r = await run('--routes', '/,/dim/', '--config', config, '--tools', 'leak,contrast,editability', '--theme', theme, '--out', out, '--concurrency', '3')
  assert.equal(r.code, 1, r.stdout + r.stderr)
  const l = lines(r.stdout)
  assert.deepEqual(
    l.map((x) => x.split(' ').slice(0, 2).join(' ')),
    ['leak-scan /', 'contrast-audit /', 'editability /', 'leak-scan /dim/', 'contrast-audit /dim/', 'editability /dim/']
  )
  const verdict = (line) => JSON.parse(line.slice(line.indexOf('{')))
  assert.equal(verdict(l[0]).status, 'pass')
  assert.equal(verdict(l[1]).status, 'pass')
  assert.equal(verdict(l[2]).status, 'fail', 'footer copy is baked into a template')
  assert.equal(verdict(l[2]).baked[0].file, 'templates/index.html')
  assert.equal(verdict(l[2]).part[0].file, 'parts/header.html')
  assert.equal(verdict(l[4]).status, 'needs-review', 'dim text is a contrast finding')
  assert.equal(verdict(l[4]).findings[0].k, 'P.dim')
  assert.equal(verdict(l[0]).url, base + '/')
  const json = JSON.parse(readFileSync(out, 'utf8'))
  assert.equal(json.results.length, 6)
  assert.deepEqual(json.summary, { total: 6, pass: 3, needsReview: 1, fail: 2, cached: 0 })
  assert.match(r.stdout, /scan: 6 checks — 3 pass, 1 needs-review, 2 fail, cached 0\/6/)
})

test('scan: a route that does not answer as configured is a fail line, and exit 1', async () => {
  const r = await run('--routes', '/error/', '--config', config, '--tools', 'leak')
  assert.equal(r.code, 1)
  const l = lines(r.stdout)
  assert.equal(l.length, 1)
  const v = JSON.parse(l[0].slice(l[0].indexOf('{')))
  assert.equal(v.status, 'fail')
  assert.match(v.error, /HTTP 404 expected 200/)
})

test('scan: needs-review alone exits 0; --cache makes the second run cached with identical verdicts', async () => {
  const cache = join(scratch, 'cache')
  const first = await run('--routes', '/dim/', '--config', config, '--tools', 'leak,contrast', '--cache', cache)
  assert.equal(first.code, 0, first.stdout + first.stderr)
  assert.match(first.stdout, /cached 0\/2/)
  const second = await run('--routes', '/dim/', '--config', config, '--tools', 'leak,contrast', '--cache', cache)
  assert.equal(second.code, 0)
  assert.match(second.stdout, /cached 2\/2/)
  assert.deepEqual(lines(second.stdout), lines(first.stdout), 'cached lines are byte-identical')
  const third = await run('--routes', '/dim/', '--config', config, '--tools', 'leak,contrast', '--cache', cache, '--no-cache')
  assert.match(third.stdout, /cached 0\/2/)
})

test('scan: editability without --theme is refused, not silently skipped', async () => {
  const r = await run('--routes', '/', '--config', config, '--tools', 'editability')
  assert.equal(r.code, 2)
  assert.match(r.stderr, /--theme/)
})

test('scan: a --theme or --routes file that does not exist exits 2 before scanning', async () => {
  const r = await run('--routes', '/', '--config', config, '--tools', 'editability', '--theme', join(scratch, 'no-theme'))
  assert.equal(r.code, 2, r.stdout + r.stderr)
  assert.match(r.stderr, /--theme.*no-theme/)
  const r2 = await run('--routes', join(scratch, 'no-routes.json'), '--config', config, '--tools', 'editability', '--theme', theme)
  assert.equal(r2.code, 2, r2.stdout + r2.stderr)
  assert.match(r2.stderr, /--routes.*no-routes\.json/)
})

test('standalone editability.mjs prints the same verdict scan.mjs does, exit 1 on baked copy', async () => {
  const child = spawn(process.execPath, [new URL('../review/editability.mjs', import.meta.url).pathname, base + '/', '--theme', theme])
  let stdout = ''
  child.stdout.on('data', (d) => (stdout += d))
  const [code] = await once(child, 'close')
  assert.equal(code, 1, stdout)
  assert.match(stdout, /BAKED   templates\/index\.html  "Footer words baked in template"/)
  const v = JSON.parse(stdout.trim().split('\n').pop())
  assert.equal(v.status, 'fail')
  assert.equal(v.examined, 4)
  assert.deepEqual(v.part, [{ run: 'Fixture header copy here', file: 'parts/header.html' }])
})

// A bright border in dark is a defect only when the design never declared that colour: the brand
// button (border = a declared custom property) is not a finding, the leftover light-theme seam
// (#e5e5e5, declared nowhere) is. Measured 15/09: the old hard-coded "brand red family" exemption
// reported 71 findings on wp-tracy-business, every one of them the brand orange doing its job.
test('border-scan: a declared brand colour is design, an undeclared bright seam is a finding', async () => {
  const { withBrowser, withPage } = await import('../lib/browser.mjs')
  const { scanBorders } = await import('../review/border-scan.mjs')
  const found = await withBrowser((browser) => withPage(browser, {}, (page) => scanBorders(page, `${base}/borders/`)))
  const text = found.findings.join('\n')
  assert.match(text, /rgb\(229, 229, 229\)/, `the undeclared seam must be reported:\n${text}`)
  assert.doesNotMatch(text, /rgb\(218, 90, 42\)/, `the declared brand orange must not be:\n${text}`)
})

// JA Vega M4c (#19 item 7): the source's own Bootstrap 5.3 dark borders (`#997404` on a warning
// alert, …) came back as `scan:bright-border` on every dark run, because the scan never looked at the
// source. With the source read in the same mode, a border whose counterpart there is certain — the
// same words, every place of them drawing that side in that colour, width and style — is the
// source's design and is kept apart as `sourceMatched`. Classes differ on purpose: they are never
// what pairs. Everything short of certain stays a finding.
test('border-scan: a border the source draws on the same words is matched; another width, style, side, colour-elsewhere or ambiguous words stay findings', async () => {
  const { withBrowser, withPage } = await import('../lib/browser.mjs')
  const { scanBorders, inPageBorderRecords } = await import('../review/border-scan.mjs')
  const head = '<!doctype html><html data-theme="dark"><head><style>body{background:rgb(16,18,20);color:rgb(236,234,228)} div,button{padding:12px;margin:8px;display:block}</style></head><body><header><p>Fixture header copy here</p></header><main>'
  const tail = `${'<p>Visible content of the page</p>'.repeat(25)}</main></body></html>`
  const pages = {
    '/source/':
      head +
      '<div class="alert alert-warning" style="border:1px solid #997404">A simple warning alert</div>' +
      '<button class="btn btn-outline-info" style="border:1px solid rgb(13,202,240)">Info</button>' +
      '<div class="alert alert-info" style="border:1px solid #087990">An info alert</div>' +
      '<div class="card" style="border:1px solid rgb(200,200,200)">Shared words</div><div class="plain">Shared words</div>' +
      '<div class="note">Only elsewhere</div><div class="box" style="border:1px solid rgb(229,229,229)">Unrelated box</div>' +
      '<div class="edge" style="border-top:1px solid #997404">Left only box</div>' +
      tail,
    '/site/':
      head +
      '<div class="wp-alert is-warning" style="border:1px solid #997404">A simple warning alert</div>' +
      '<button class="wp-btn is-info" style="border:2px solid rgb(13,202,240)">Info</button>' +
      '<div class="wp-alert is-info" style="border:1px dashed #087990">An info alert</div>' +
      '<div class="wp-card" style="border:1px solid rgb(200,200,200)">Shared words</div>' +
      '<div class="wp-note" style="border:1px solid rgb(229,229,229)">Only elsewhere</div>' +
      '<div class="wp-edge" style="border-left:1px solid #997404">Left only box</div>' +
      tail
  }
  const srv = createServer((req, res) => {
    res.writeHead(pages[req.url] ? 200 : 404, { 'content-type': 'text/html' })
    res.end(pages[req.url] ?? '<h1>nope</h1>')
  })
  srv.listen(0, '127.0.0.1')
  await once(srv, 'listening')
  const at = `http://127.0.0.1:${srv.address().port}`
  try {
    const { plain, compared } = await withBrowser((browser) =>
      withPage(browser, {}, async (page) => {
        await page.goto(`${at}/source/`)
        const source = { ...(await page.evaluate(inPageBorderRecords, '80')), mode: 'dark' }
        const plain = await scanBorders(page, `${at}/site/`)
        const compared = await scanBorders(page, `${at}/site/`, '80', { source })
        return { plain, compared }
      })
    )
    const line = (list, cls) => list.find((l) => l.includes(cls))
    assert.ok(line(plain.findings, 'wp-alert is-warning'), `without the source the scan is what it was:\n${plain.findings.join('\n')}`)
    assert.equal(plain.sourceMatched, undefined)
    const text = compared.findings.join('\n')
    assert.ok(!line(compared.findings, 'wp-alert is-warning'), `the source's own warning border is not a finding:\n${text}`)
    assert.match(line(compared.sourceMatched, 'wp-alert is-warning') ?? '', /= source div\.alert\.alert-warning "A simple warning alert"/, compared.sourceMatched.join('\n'))
    for (const [cls, why] of [
      ['wp-btn is-info', 'another width'],
      ['wp-alert is-info', 'another style'],
      ['wp-card', 'the same words at two source places, one without the border'],
      ['wp-note', 'the colour exists on the source, on another element'],
      ['wp-edge', 'the colour on another side']
    ])
      assert.ok(line(compared.findings, cls), `${why} stays a finding:\n${text}`)
    assert.ok(compared.sourceMatched.every((l) => l.includes('wp-alert is-warning')), `only the warning is matched (one line a side):\n${compared.sourceMatched.join('\n')}`)
  } finally {
    srv.close()
  }
})

// Sol review of #19 item 7: the fold of one finding line per tag, class, side and colour ran before
// the source was consulted, so a sibling of a matched element — same class, other words or another
// width — vanished with it. And every border set apart stays in `sourceMatched`, past 40 as well.
test('border-scan: a sibling of a matched border with other words or another width is still a finding; every match is kept', async () => {
  const { withBrowser, withPage } = await import('../lib/browser.mjs')
  const { scanBorders, inPageBorderRecords } = await import('../review/border-scan.mjs')
  const head = '<!doctype html><html data-theme="dark"><head><style>body{background:rgb(16,18,20);color:rgb(236,234,228)} div{padding:12px;margin:8px;display:block}</style></head><body><main>'
  const tail = `${'<p>Visible content of the page</p>'.repeat(25)}</main></body></html>`
  const alerts = (cls) => Array.from({ length: 45 }, (_, i) => `<div class="${cls}" style="border:1px solid #997404">Warning number ${i + 1}</div>`).join('')
  const pages = {
    '/source/': head + alerts('alert alert-warning') + tail,
    '/site-words/': head + alerts('wp-alert twin') + '<div class="wp-alert twin" style="border:1px solid #997404">A warning the source never gives</div>' + tail,
    '/site-width/': head + alerts('wp-alert twin') + '<div class="wp-alert twin" style="border:3px solid #997404">Warning number 1</div>' + tail
  }
  const srv = createServer((req, res) => {
    res.writeHead(pages[req.url] ? 200 : 404, { 'content-type': 'text/html' })
    res.end(pages[req.url] ?? '<h1>nope</h1>')
  })
  srv.listen(0, '127.0.0.1')
  await once(srv, 'listening')
  const at = `http://127.0.0.1:${srv.address().port}`
  try {
    const r = await withBrowser((browser) =>
      withPage(browser, {}, async (page) => {
        await page.goto(`${at}/source/`)
        const source = { ...(await page.evaluate(inPageBorderRecords, '80')), mode: 'dark' }
        return { words: await scanBorders(page, `${at}/site-words/`, '80', { source }), width: await scanBorders(page, `${at}/site-width/`, '80', { source }) }
      })
    )
    for (const [name, why] of [['words', 'other words'], ['width', 'another width (3px)']]) {
      const twin = r[name].findings.filter((l) => l.includes('wp-alert twin'))
      assert.ok(twin.length, `a matched sibling with ${why} is a finding:\n${r[name].findings.join('\n')}`)
      assert.ok(twin.some((l) => l.includes('3px')) === (name === 'width'), `${name}: the finding is the element that differs:\n${twin.join('\n')}`)
    }
    const top = r.words.sourceMatched.filter((l) => /  T 1px  /.test(l))
    assert.equal(top.length, 45, `every matched element is kept for audit, past 40:\n${r.words.sourceMatched.slice(0, 3).join('\n')}`)
  } finally {
    srv.close()
  }
})

// Sol review of #19 item 7 (round 2): the audit lines were folded by their printed excerpt — the
// first 40 characters of the words — so two matched elements that share that prefix were one line.
test('border-scan: two matched borders whose words share their first 40 characters are two audit lines', async () => {
  const { withBrowser, withPage } = await import('../lib/browser.mjs')
  const { scanBorders, inPageBorderRecords } = await import('../review/border-scan.mjs')
  const head = '<!doctype html><html data-theme="dark"><head><style>body{background:rgb(16,18,20);color:rgb(236,234,228)} div{padding:12px;margin:8px;display:block}</style></head><body><main>'
  const tail = `${'<p>Visible content of the page</p>'.repeat(25)}</main></body></html>`
  const prefix = 'A shared warning heading that runs past forty characters:'
  const alerts = (cls) => ['first', 'second'].map((w) => `<div class="${cls}" style="border-top:1px solid #997404">${prefix} ${w}</div>`).join('')
  const pages = { '/source/': head + alerts('alert alert-warning') + tail, '/site/': head + alerts('wp-alert') + tail }
  const srv = createServer((req, res) => {
    res.writeHead(pages[req.url] ? 200 : 404, { 'content-type': 'text/html' })
    res.end(pages[req.url] ?? '<h1>nope</h1>')
  })
  srv.listen(0, '127.0.0.1')
  await once(srv, 'listening')
  const at = `http://127.0.0.1:${srv.address().port}`
  try {
    const r = await withBrowser((browser) =>
      withPage(browser, {}, async (page) => {
        await page.goto(`${at}/source/`)
        const source = { ...(await page.evaluate(inPageBorderRecords, '80')), mode: 'dark' }
        return scanBorders(page, `${at}/site/`, '80', { source })
      })
    )
    assert.deepEqual(r.findings.filter((l) => l.includes('wp-alert')), [], r.findings.join('\n'))
    assert.equal(r.sourceMatched.filter((l) => l.includes('wp-alert')).length, 2, r.sourceMatched.join('\n'))
  } finally {
    srv.close()
  }
})

// Sol review of #19 item 7 (round 3): the words were cut at 300 characters before pairing, so a site
// element whose first 300 characters are the source's — and whose ending is not — took the source's
// border as its own. Pairing reads every word.
test('border-scan: words that match the source only in their first 300 characters are not a counterpart', async () => {
  const { withBrowser, withPage } = await import('../lib/browser.mjs')
  const { scanBorders, inPageBorderRecords } = await import('../review/border-scan.mjs')
  const head = '<!doctype html><html data-theme="dark"><head><style>body{background:rgb(16,18,20);color:rgb(236,234,228)} div{padding:12px;margin:8px;display:block}</style></head><body><main>'
  const tail = `${'<p>Visible content of the page</p>'.repeat(25)}</main></body></html>`
  const prefix = 'A long notice that says the same thing on both sides. '.repeat(7)
  const box = (cls, end) => `<div class="${cls}" style="border:1px solid #997404">${prefix}${end}</div>`
  const pages = { '/source/': head + box('alert alert-warning', 'The source ends here.') + tail, '/site/': head + box('wp-alert', 'The site ends otherwise.') + tail }
  const srv = createServer((req, res) => {
    res.writeHead(pages[req.url] ? 200 : 404, { 'content-type': 'text/html' })
    res.end(pages[req.url] ?? '<h1>nope</h1>')
  })
  srv.listen(0, '127.0.0.1')
  await once(srv, 'listening')
  const at = `http://127.0.0.1:${srv.address().port}`
  try {
    assert.ok(prefix.length > 300)
    const r = await withBrowser((browser) =>
      withPage(browser, {}, async (page) => {
        await page.goto(`${at}/source/`)
        const source = { ...(await page.evaluate(inPageBorderRecords, '80')), mode: 'dark' }
        return scanBorders(page, `${at}/site/`, '80', { source })
      })
    )
    assert.ok(r.findings.some((l) => l.includes('wp-alert')), `other words past 300 characters stay a finding:\n${r.findings.join('\n')}`)
    assert.deepEqual((r.sourceMatched ?? []).filter((l) => l.includes('wp-alert')), [], (r.sourceMatched ?? []).join('\n'))
  } finally {
    srv.close()
  }
})
