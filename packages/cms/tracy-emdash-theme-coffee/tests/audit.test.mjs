// F7: the audit must be able to FAIL. A tiny in-process site is served in two shapes: a correct
// one (audit exits 0, crawl complete) and a broken one seeded with the exact defects the gate
// claims to catch (missing hreflang, canonical to the wrong page, indexable page marked noindex,
// search without noindex, /404 answering 200, a dead link, an unknown URL answering 200, and a
// crawl that hits --max with URLs left). Each defect must appear as a finding and the exit be 1.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { after, before, describe, it } from 'node:test'
const execFileP = promisify(execFile)
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const LOCALES = ['de', 'fr']
const config = {
  locales: LOCALES,
  defaultLocale: 'de',
  audit: {
    indexable: ['^/(?!suche)(?!404$).*'],
    noindex: ['^/suche'],
    notFound: ['^/404$'],
    canonicalQuery: ['page']
  }
}
const cfgFile = path.join(mkdtempSync(path.join(tmpdir(), 'audit-')), 'config.json')
writeFileSync(cfgFile, JSON.stringify(config))

function page({
  origin,
  locale,
  pathname,
  title,
  links = [],
  canonical,
  hreflang = true,
  noindex = false,
  bodyLang,
  page: pageNo
}) {
  const other = locale === 'de' ? 'fr' : 'de'
  const strip = (p) => p.replace(/^\/fr(?=\/|$)/, '') || '/'
  const base = strip(pathname)
  const forLocale = (l) =>
    `${origin}${l === 'de' ? base : `/fr${base === '/' ? '' : base}`}${pageNo ? `?page=${pageNo}` : ''}`
  const alts = hreflang
    ? [
        ...LOCALES.map((l) => `<link rel="alternate" hreflang="${l}" href="${forLocale(l)}">`),
        `<link rel="alternate" hreflang="x-default" href="${forLocale('de')}">`
      ].join('')
    : ''
  return `<!doctype html><html lang="${bodyLang ?? locale}"><head><title>${title}</title><link rel="canonical" href="${canonical ?? forLocale(locale)}">${noindex ? '<meta name="robots" content="noindex, follow">' : ''}${alts}</head><body><h1>${title}</h1><nav>${links.map((l) => `<a href="${l}">${l}</a>`).join('')}</nav><p>${other}</p></body></html>`
}
function serve(broken, extra = {}) {
  return new Promise((res) => {
    const srv = http.createServer((req, r) => {
      const url = new URL(req.url, 'http://x')
      const p = url.pathname
      const origin = `http://127.0.0.1:${srv.address().port}`
      const send = (code, html) => {
        r.writeHead(code, { 'content-type': 'text/html; charset=utf-8' })
        r.end(html)
      }
      const nav = [
        '/',
        '/ueber',
        '/kontakt',
        '/news',
        '/news?page=2',
        '/suche?q=holz',
        '/fr',
        '/fr/ueber',
        '/fr/kontakt',
        '/fr/news',
        ...(extra.links ?? [])
      ]
      const locale = /^\/fr(\/|$)/.test(p) ? 'fr' : 'de'
      const common = { origin, locale, pathname: p, links: nav }
      if (extra.fanout && /^\/many\/\d+$/.test(p))
        return send(
          200,
          page({ ...common, title: `Many ${p}`, links: Array.from({ length: 30 }, (_, i) => `/many/${i}`) })
        )
      if (p === '/' || p === '/fr')
        return send(
          200,
          page({
            ...common,
            title: 'Home',
            links: [...nav, ...(extra.fanout ? ['/many/0'] : []), ...(broken ? ['/dead-link'] : [])]
          })
        )
      if (p === '/ueber' || p === '/fr/ueber')
        return send(200, page({ ...common, title: 'About', hreflang: !broken }))
      if (p === '/kontakt' || p === '/fr/kontakt')
        return send(
          200,
          page({
            ...common,
            title: 'Contact',
            canonical: broken ? `${origin}/` : undefined,
            noindex: broken && locale === 'fr'
          })
        )
      if (p === '/news' || p === '/fr/news') {
        const pg = url.searchParams.get('page')
        return send(
          200,
          page({
            ...common,
            title: `News ${pg ?? 1}`,
            page: pg && pg !== '1' ? pg : undefined,
            canonical: broken && pg === '2' ? `${origin}/news` : undefined
          })
        )
      }
      if (p === '/suche' || p === '/fr/suche')
        return send(200, page({ ...common, title: 'Search', noindex: !broken, hreflang: false }))
      if (p === '/404' || p === '/fr/404')
        return send(broken ? 200 : 404, page({ ...common, title: 'Not found', hreflang: false }))
      if (broken && p === '/does-not-exist')
        return send(200, page({ ...common, title: 'Soft 404', hreflang: false }))
      return send(404, page({ ...common, title: 'Not found', hreflang: false }))
    })
    srv.listen(0, '127.0.0.1', () => res({ srv, origin: `http://127.0.0.1:${srv.address().port}` }))
  })
}
async function audit(origin, args = []) {
  const out = mkdtempSync(path.join(tmpdir(), 'audit-out-'))
  let code = 0,
    stdout = ''
  try {
    ;({ stdout } = await execFileP(
      process.execPath,
      ['tools/audit.mjs', origin, out, '--config', cfgFile, '--viewports', '1280', ...args],
      { cwd: ROOT, maxBuffer: 1 << 24 }
    ))
  } catch (e) {
    code = e.code
    stdout = e.stdout ?? ''
    if (!e.stdout) throw e
  }
  const report = JSON.parse(readFileSync(path.join(out, 'audit.json'), 'utf8'))
  return { code, stdout, report, issues: report.findings.map((f) => `${f.path} — ${f.issue}`) }
}

describe('F7 — the audit fails on a broken site and passes on a correct one', () => {
  let good, bad, fan
  before(async () => {
    good = await serve(false)
    bad = await serve(true)
    fan = await serve(false, { fanout: true })
  })
  after(() => {
    good.srv.close()
    bad.srv.close()
    fan.srv.close()
  })
  it('correct site: exit 0, crawl complete, every indexable page has canonical + hreflang for both locales + x-default', {
    timeout: 120000
  }, async () => {
    const r = await audit(good.origin)
    assert.equal(r.code, 0, r.issues.join('\n'))
    assert.equal(r.report.summary.complete, true)
    assert.equal(r.report.summary.findings, 0)
    assert.ok(r.report.summary.pages >= 10)
    assert.equal(
      r.report.pages.find((p) => p.path === '/news?page=2').canonical,
      `${good.origin}/news?page=2`
    )
  })
  it('broken site: exit 1 with one finding per seeded defect', { timeout: 120000 }, async () => {
    const r = await audit(bad.origin)
    assert.equal(r.code, 1)
    const has = (rx) =>
      assert.ok(
        r.issues.some((i) => rx.test(i)),
        `expected finding ${rx}\n${r.issues.join('\n')}`
      )
    has(/^\/ueber — missing hreflang fr/)
    has(/^\/ueber — missing hreflang x-default/)
    has(/^\/kontakt — canonical .* != expected/)
    has(/^\/fr\/kontakt — indexable page marked noindex/)
    has(/^\/suche\?q=holz — noindex page without robots noindex/)
    has(/^\/404 — expected 404, got 200/)
    has(/^\/dead-link — status 404/)
    has(/^\/does-not-exist — unknown url answered 200/)
    has(/^\/news\?page=2 — canonical .*\/news != expected .*\/news\?page=2/)
  })
  it('a crawl that hits --max with URLs still queued is reported incomplete and fails', {
    timeout: 120000
  }, async () => {
    const r = await audit(fan.origin, ['--max', '8'])
    assert.equal(r.code, 1)
    assert.equal(r.report.summary.complete, false)
    assert.ok(
      r.issues.some((i) => /^\(crawl\) — incomplete: hit --max 8 with \d+ URL/.test(i)),
      r.issues.join('\n')
    )
  })
})
