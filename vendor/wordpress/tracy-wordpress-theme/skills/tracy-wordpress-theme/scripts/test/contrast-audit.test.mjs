// review/contrast-audit.mjs in both modes. Gotcha 7: a floating nav class (`tracy-nav-overlay`) on a
// home whose hero has no cover painted the header's words in the page background colour — white on
// white in light, dark on dark in dark. The header sits outside `main`, where visual-qa's parity does
// not read, so the contrast audit has to read it in light as well as in dark.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'

const { withBrowser, withPage } = await import('../lib/browser.mjs')
const { scanContrast } = await import('../review/contrast-audit.mjs')

async function served(pages, fn) {
  const srv = createServer((req, res) => {
    const body = pages[req.url]
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
    res.end(body ?? '<h1>nope</h1>')
  })
  srv.listen(0, '127.0.0.1')
  await once(srv, 'listening')
  try {
    return await fn(`http://127.0.0.1:${srv.address().port}`)
  } finally {
    srv.close()
  }
}

const CSS =
  ':root{--bg:rgb(255,255,255);--fg:rgb(20,23,26)} html[data-theme="dark"]{--bg:rgb(18,18,18);--fg:rgb(241,243,246)}' +
  ' body{margin:0;background:var(--bg);color:var(--fg)} header{padding:16px} header a{color:var(--fg);padding:4px}' +
  ' .tracy-nav-overlay header{position:absolute;top:0;left:0;right:0} .tracy-nav-overlay header a{color:var(--bg)} main{padding-top:80px}'
const page = (navClass) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body class="home ${navClass}">` +
  '<header><a class="brand" href="/">Brand company</a> <a class="nav-link" href="/about/">About the team</a></header>' +
  `<main><section class="hero"><h1>Build faster together</h1></section>${'<p>Visible content of the page</p>'.repeat(25)}</main></body></html>`

const audit = (navClass, mode) => served({ '/': page(navClass) }, (at) => withBrowser((b) => withPage(b, {}, (p) => scanContrast(p, `${at}/`, '3.0', { mode }))))
const header = (r) => r.findings.filter((f) => /Brand company|About the team/.test(f.txt)).map((f) => f.txt)

test('contrast-audit: header words in the page background colour are a finding in light and in dark; a pinned nav class is clean in both', async () => {
  for (const mode of ['light', 'dark']) {
    const bad = await audit('tracy-nav-overlay', mode)
    assert.ok(bad.examined >= 20, `${mode}: examined ${bad.examined}`)
    assert.deepEqual(header(bad).sort(), ['About the team', 'Brand company'], `${mode}: ${JSON.stringify(bad.findings)}`)
    assert.ok(bad.findings.every((f) => f.cr < 1.1), `${mode}: the words are the page colour`)
    const good = await audit('tracy-nav-top-left', mode)
    assert.deepEqual(header(good), [], `${mode}: ${JSON.stringify(good.findings)}`)
  }
})

test('contrast-audit: a mode other than light or dark is refused; a dark source is never paired with a light read', async () => {
  await assert.rejects(
    withBrowser((b) => withPage(b, {}, (p) => scanContrast(p, 'http://127.0.0.1:9/', '3.0', { mode: 'dim' }))),
    /mode must be dark or light, got "dim"/
  )
  const source = { mode: 'dark', width: 1440, contrast: [], counts: {} }
  const r = await served({ '/': page('tracy-nav-overlay') }, (at) => withBrowser((b) => withPage(b, {}, (p) => scanContrast(p, `${at}/`, '3.0', { mode: 'light', source }))))
  assert.match(r.sourceRefused, /paired in dark mode only, the page was read in light/)
  assert.deepEqual(header(r).sort(), ['About the team', 'Brand company'])
})
