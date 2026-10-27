/**
 * REG-PR-1427-demo-qa-gate: the demo QA gate catches the two failures people found by eye on demos
 * handed to an agent — a template stylesheet recompiled into raw SCSS (marigoldhoian, 18/10/2026: the
 * browser read 2,223 of 3,701 rules) and a third-party demo widget that holds the page (ja-restaurant's
 * OpenTable script) — and passes the same site once both are undone.
 *
 * A fixture site is served from this process; the REAL browser half (`apps/tracy-host/src/
 * demo-qa-browser.js`) reads it in the watched Chrome (chrome-watch, CDP — never `chromium.launch()`, and
 * the page is left open), and the REAL judge (`demo-qa.js`) decides. Three states of one site:
 * as handed over (the baseline), broken by the agent, repaired.
 */
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, ROOT } from './lib.mjs'

const host = join(ROOT, 'apps/tracy-host')
const { chromium } = createRequire(join(host, 'package.json'))('playwright')
const { readDemoPage } = await import(pathToFileURL(join(host, 'src/demo-qa-browser.js')).href)
const { demoQaBody, runDemoQa } = await import(pathToFileURL(join(host, 'src/demo-qa.js')).href)

const RULES = 300
const goodCss = `${Array.from({ length: RULES }, (_, i) => `.r${i}{color:#00${i % 10}}`).join('\n')}\n.footer-end{margin:0}\n`
// The marigoldhoian shape: SCSS source pasted into the compiled file, a block never closed.
const brokenCss = goodCss.replace(
  `.r100{`,
  '$brand: #c00;\n.btn { @include button-variant($brand); &:hover { color: darken($brand, 10%); }\n.r100{'
)
const OPENTABLE = '<script src="//secure.opentable.com/frontdoor/default.aspx?rid=1&restref=1"></script>'

let state = 'handed-over'
const pageHtml = (title) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<link rel="stylesheet" href="/templates/ja_impact/css/template.css?v=1">
<link rel="stylesheet" href="/templates/ja_impact/css/custom.css">
${state === 'broken' ? OPENTABLE : ''}
</head><body><header><nav><ul><li><a href="/">Home</a></li><li><a href="/menu">Menu</a></li></ul></nav></header>
<h1>${title}</h1><p>Noodle soup on Tran Phu street every morning.</p>
<a class="btn" href="tel:+842355550199">Call us</a></body></html>`

const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname
  if (path === '/templates/ja_impact/css/template.css') {
    res.writeHead(200, { 'content-type': 'text/css' })
    return res.end(state === 'broken' ? brokenCss : goodCss)
  }
  if (path === '/templates/ja_impact/css/custom.css') {
    res.writeHead(200, { 'content-type': 'text/css' })
    return res.end(state === 'repaired' ? '.brand{color:#a33}\n' : '')
  }
  if (path === '/' || path === '/menu') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(pageHtml(path === '/' ? 'Pho Ba' : 'Menu'))
  }
  res.writeHead(404)
  res.end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}/`

let browser
try {
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
} catch {
  server.close()
  cannotRun('no Chrome answers on 127.0.0.1:9222 (start it with chrome-watch)')
}
const page = await browser.contexts()[0].newPage()
const briefText = 'Pho Ba. Noodle soup on Tran Phu street every morning. Menu. Phone +84 235 555 0199.'
const run = (baseline) =>
  runDemoQa({
    asked: demoQaBody({ label: 'fixture', platform: 'joomla', discover: true, baseline, briefText }),
    base,
    read: (url, path, options) => readDemoPage(page, url, path, options)
  })
const byId = (result) => Object.fromEntries(result.checks.map((c) => [c.id, c]))

const c = checks()
try {
  const handed = await run(null)
  const template = handed.baseline.cssRules['templates/ja_impact/css/template.css']
  c.eq('baseline: pages read (home, then its nav)', handed.pages.join(' '), '/ /menu')
  c.eq('baseline: template.css rules', template?.rules, RULES + 1)
  c.check(
    'baseline: template.css sentinel is its last rule',
    /footer-end/.test(template?.sentinel ?? ''),
    template?.sentinel
  )

  state = 'broken'
  const broken = byId(await run(handed.baseline))
  console.log(`measured broken: css-intact ${JSON.stringify(broken['css-intact'].detail.slice(0, 4))}`)
  console.log(`measured broken: pages-load ${JSON.stringify(broken['pages-load'].detail)}`)
  c.eq('broken: css-intact passes', broken['css-intact'].pass, false)
  c.check(
    'broken: css-intact says the browser reads fewer rules of template.css',
    broken['css-intact'].detail.some(
      (d) => d.file === 'templates/ja_impact/css/template.css' && d.after < d.before
    ),
    broken['css-intact'].detail
  )
  c.check(
    'broken: css-intact names the SCSS left in template.css',
    broken['css-intact'].detail.some((d) => /SCSS|never closed/.test(d.problem)),
    broken['css-intact'].detail
  )
  c.eq('broken: pages-load passes', broken['pages-load'].pass, false)
  c.check(
    'broken: pages-load names the OpenTable request',
    broken['pages-load'].detail.some((d) => (d.blocked ?? []).some((u) => u.includes('opentable.com'))),
    broken['pages-load'].detail
  )
  c.eq('broken: no-third-party-demo passes', broken['no-third-party-demo'].pass, false)

  state = 'repaired'
  const repaired = byId(await run(handed.baseline))
  console.log(
    `measured repaired: css-intact ${repaired['css-intact'].measured}, pages-load ${repaired['pages-load'].measured}`
  )
  console.log(
    `measured repaired: other checks failing ${JSON.stringify(
      Object.values(repaired)
        .filter((x) => !x.pass)
        .map((x) => [x.id, x.detail.slice(0, 3)])
    )}`
  )
  c.eq('repaired: css-intact passes', repaired['css-intact'].pass, true)
  c.eq('repaired: pages-load passes', repaired['pages-load'].pass, true)
  c.eq('repaired: no-third-party-demo passes', repaired['no-third-party-demo'].pass, true)
} finally {
  server.close()
}
c.done()
