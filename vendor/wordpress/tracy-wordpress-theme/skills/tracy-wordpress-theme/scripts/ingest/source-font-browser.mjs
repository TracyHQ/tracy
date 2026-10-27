#!/usr/bin/env node
// source-font-browser.mjs — read what the running SOURCE draws its text with (Phase 2).
//
// For the home page, one page per distinct used template style and one nested SEF URL, at 1440 and 390: the
// family each of body text, h1–h3 and navigation text asks for (computed font-family), the font that drew it
// (CDP CSS.getPlatformFontsForNode, the reader Visual QA uses: lib/platform-fonts.mjs), the faces document.fonts
// holds, and the font requests that failed. The page is only read: nothing is clicked except a menu toggle that
// reveals the navigation at the narrow width. The judgement (what counts as a fallback) is source-font.mjs's.
//
// Usage: node scripts/ingest/source-font-browser.mjs --site <origin> --static <inventory.json | static-report.json> --out <file>
//          [--quickstart <id>] [--route /a,/b] [--nested <path>] [--widths 1440,390] [--decisions DECISIONS.md] [--timeout <s>]
//        exit 0: complete coverage and no unresolved source-font finding; 1: a finding or incomplete coverage; 2: usage.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UsageError, parseStrict } from '../lib/cli-args.mjs'
import { browserIdentity, mapLimit, withBrowser, withPage } from '../lib/browser.mjs'
import { platformFonts } from '../lib/platform-fonts.mjs'
import { readSmallFile, parseDecisions } from '../lib/parity-acceptance.mjs'
import { PROFILES } from '../lib/framework-selectors.mjs'
import { defaultFetchPage, pageHrefs, resolveSourceRoute } from '../lib/source-routes.mjs'
import { BROWSER_ROLES, BROWSER_SCHEMA, DESKTOP_WIDTH, MOBILE_WIDTH, STATIC_SCHEMA, browserCoverage, decisionFor, judgeBrowser, staticFingerprint } from './source-font.mjs'

const GOTO_MS = 60000
const SETTLE_MS = 400
const MAX_FACES = 80
const MAX_REQUESTS = 40
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'inherit', 'initial', 'unset'])

// Elements that may carry a role. Body text is the first visible paragraph-like block with real prose.
const PROBES = {
  body: ['main p', '.t3-mainbody p', '#t4-main-body p', '.t4-section p', 'article p', '.item-page p', '.blog p', 'p', 'li', 'div'],
  h1: ['h1'],
  h2: ['h2'],
  h3: ['h3'],
  nav: [] // the main navigation only: MAIN_NAV
}
// The template's MAIN navigation, nothing else: only the frameworks' own menu containers (T4 megamenu, T3 megamenu / main nav)
// and, for the collapsed state, the links of the off-canvas menu list. A generic `header nav` is not the main menu — it can be a
// utility, language or account menu — so a template whose main menu is none of these has its nav reading declared absent.
const MAIN_NAV = ['.t4-megamenu', '.t3-megamenu', '#t3-mainnav', '.t3-mainnav', '.t4-offcanvas .navbar-nav', '.t4-off-canvas .navbar-nav', '#t3-off-canvas .nav', '.t3-off-canvas .nav']
const NOT_MAIN_NAV = 'footer, aside, [class*="footer"], [class*="breadcrumb"], .navbar-brand, .logo, .brand, [class*="logo"], .site-title'
const TOGGLE_HOME = 'header, .t4-header, #t4-header, .t3-header, #t3-header, .t3-mainnav, #t3-mainnav, .navbar, nav'
const NOT_BODY = 'nav, header, footer, button, a, h1, h2, h3, h4, h5, h6, [class*="icon"], [class*="btn"], [class*="breadcrumb"], script, style'
const TOGGLES = [...new Set([...PROFILES.T4.menu.toggles, ...PROFILES.T3.menu.toggles].map((t) => t.selector))].concat(['.navbar-toggler', '.navbar-toggle', '.btn-navbar', '.t4-offcanvas-toggle']).join(', ')
const DOM_TOGGLES = `${TOGGLES}, button[aria-expanded="false"], [aria-controls][aria-expanded="false"], [class*="menu-toggle"], [aria-label*="menu" i], [title*="menu" i]`

/** Share the mobile-menu interaction across Joomla and DOM-backed probes. */
export async function openCollapsedMenu(page, width, marks, { probe = markProbes, args = { probes: PROBES, notBody: NOT_BODY, mainNav: MAIN_NAV, notMainNav: NOT_MAIN_NAV }, toggles = TOGGLES, home = TOGGLE_HOME, prioritizeNavigation = false } = {}) {
  if (marks.nav || !marks._navPresent || width >= 992) return marks
  const tagged = await page.evaluate(({ toggles, home, prioritizeNavigation }) => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' }
    const candidates = [...document.querySelectorAll(toggles)].filter((el) => visible(el) && el.closest(home))
    if (prioritizeNavigation) {
      const score = (el) => {
        const controls = (el.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean)
        if (controls.some((id) => {
          const target = document.getElementById(id)
          return target && (target.matches('nav, [role="navigation"], [class*="menu" i], [id*="menu" i], [class*="nav" i], [id*="nav" i]'))
        })) return 0
        if (el.matches('.navbar-toggler, .navbar-toggle, .btn-navbar, .t4-offcanvas-toggle, [data-offcanvas-trigger], [data-bs-toggle="offcanvas"], [data-toggle="offcanvas"]')) return 1
        const label = [el.className, el.id, el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].join(' ')
        if (/menu|hamburger|navigation/i.test(label)) return 2
        return 3
      }
      candidates.sort((a, b) => score(a) - score(b))
    }
    const el = candidates[0]
    if (el) return (el.setAttribute('data-sftoggle', '1'), true)
    return false
  }, { toggles, home, prioritizeNavigation })
  if (!tagged) return marks
  await page.locator('[data-sftoggle="1"]').first().click({ timeout: 3000 }).catch(() => null)
  await page.waitForTimeout(600)
  return page.evaluate(probe, args)
}

/** Observe an already loaded DOM-source page, allowing the render adapter to reuse its navigation. */
export async function measureDomPage(page, { file, route, url, width, failedRequests = [] }) {
  const roles = {}
  const absent = []
  const markDomProbes = () => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 }
    for (const el of document.querySelectorAll('[data-sfprobe]')) el.removeAttribute('data-sfprobe')
    const body = [...document.querySelectorAll('main p, article p, main li, article li, p, li')].find((el) => visible(el) && (el.innerText ?? '').trim().length > 0 && !el.closest('nav,header,footer,button,a,h1,h2,h3,h4,h5,h6,script,style'))
    if (body) body.setAttribute('data-sfprobe', 'body')
    for (const role of ['h1', 'h2', 'h3']) {
      const el = [...document.querySelectorAll(role)].find((node) => visible(node) && (node.textContent ?? '').trim())
      if (el) el.setAttribute('data-sfprobe', role)
    }
    const navCandidates = [...document.querySelectorAll('nav a, header nav a, header a')].filter((node) => (node.textContent ?? '').trim() && !node.closest('footer,[class*="logo"],[class*="brand"]'))
    const nav = navCandidates.find(visible)
    if (nav) nav.setAttribute('data-sfprobe', 'nav')
    return { nav: Boolean(nav), _navPresent: navCandidates.length > 0 }
  }
  let markState = await page.evaluate(markDomProbes)
  markState = await openCollapsedMenu(page, width, markState, { probe: markDomProbes, args: undefined, toggles: DOM_TOGGLES, home: 'header, nav, [role="banner"]', prioritizeNavigation: true })
  const marks = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-sfprobe]')].map((el) => { const text = (el.innerText ?? el.textContent ?? '').trim(); return [el.getAttribute('data-sfprobe'), { requested: getComputedStyle(el).fontFamily, size: getComputedStyle(el).fontSize, chars: text.length, text: text.slice(0, 60) }] })))
  const readings = await platformFonts(page, Object.keys(marks).map((r) => `[data-sfprobe="${r}"]`))
  for (const [role, mark] of Object.entries(marks)) {
    const reading = readings.find((r) => r.selector === `[data-sfprobe="${role}"]`)
    roles[role] = { ...mark, drawn: reading?.fonts ?? [] }
    const requested = (mark.requested ?? '').split(',').map((name) => name.replace(/["']/g, '').trim()).find((name) => name && !GENERIC_FAMILIES.has(name.toLowerCase()))
    if (requested && roles[role].drawn.length) {
      await page.evaluate(({ role, family }) => document.querySelector(`[data-sfprobe="${role}"]`)?.style.setProperty('font-family', `"${family}"`, 'important'), { role, family: requested })
      const forced = await platformFonts(page, [`[data-sfprobe="${role}"]`]).catch(() => [])
      await page.evaluate((role) => document.querySelector(`[data-sfprobe="${role}"]`)?.style.removeProperty('font-family'), role)
      const top = [...(forced[0]?.fonts ?? [])].sort((a, b) => b.glyphs - a.glyphs)[0]
      roles[role].forced = { family: requested, name: top?.name ?? null, custom: Boolean(top?.custom) }
    }
  }
  for (const role of BROWSER_ROLES) if (!roles[role]) absent.push(role)
  const faces = await page.evaluate((max) => [...document.fonts].slice(0, max).map((f) => ({ family: f.family.replace(/["']/g, ''), weight: f.weight, style: f.style, status: f.status })), MAX_FACES)
  return { file, route, kind: route === '/' ? 'home' : 'extra', styleId: null, template: null, width, url, finalUrl: page.url(), status: 200, roles, absent, faces, failedRequests }
}

/** In the page: mark the element of each role with data-sfprobe and read its size and text length. */
function markProbes({ probes, notBody, mainNav, notMainNav }) {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0
  }
  const out = {}
  for (const el of document.querySelectorAll('[data-sfprobe]')) el.removeAttribute('data-sfprobe')
  out._navPresent = false
  for (const [role, selectors] of Object.entries(probes)) {
    let found = null
    if (role === 'nav') {
      for (const container of mainNav.flatMap((sel) => [...document.querySelectorAll(sel)])) {
        if (container.closest(notMainNav)) continue
        for (const el of container.querySelectorAll('a')) {
          if (el.closest(notMainNav)) continue
          out._navPresent = true
          const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
          if (!text || !visible(el)) continue
          found = { el, text }
          break
        }
        if (found) break
      }
      if (found) {
        found.el.setAttribute('data-sfprobe', role)
        out[role] = { size: getComputedStyle(found.el).fontSize, chars: found.text.length, text: found.text.slice(0, 60) }
      }
      continue
    }
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim()
        const text = role === 'body' ? own : (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (role === 'body' && (own.length < 40 || el.closest(notBody))) continue
        if (role !== 'body' && !text) continue
        found = { el, text }
        break
      }
      if (found) break
    }
    if (!found) continue
    found.el.setAttribute('data-sfprobe', role)
    out[role] = { size: getComputedStyle(found.el).fontSize, chars: found.text.length, text: found.text.slice(0, 60) }
  }
  return out
}

async function measureOne(browser, { url, route, kind, styleId, template, width }) {
  return withPage(browser, { viewport: { width, height: 900 } }, async (page) => {
    const failed = []
    const note = (r, why) => {
      const u = r.url()
      if (failed.length < MAX_REQUESTS && (r.resourceType() === 'font' || /fonts\.(googleapis|gstatic|bunny)|\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u))) failed.push({ url: u.slice(0, 300), resourceType: r.resourceType(), ...why })
    }
    page.on('requestfailed', (r) => note(r, { error: r.failure()?.errorText ?? 'failed' }))
    page.on('response', (r) => {
      if (r.status() >= 400) note(r.request(), { status: r.status() })
    })
    const base = { route, kind, styleId: styleId ?? null, template: template ?? null, width, url, finalUrl: null }
    let status = 0
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: GOTO_MS })
      status = res?.status() ?? 0
    } catch (e) {
      return { ...base, finalUrl: page.url(), status, error: String(e.message).split('\n')[0].slice(0, 200), roles: {}, absent: [], faces: null, failedRequests: failed }
    }
    try {
      await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => null)
      await page.waitForTimeout(SETTLE_MS)
      const args = { probes: PROBES, notBody: NOT_BODY, mainNav: MAIN_NAV, notMainNav: NOT_MAIN_NAV }
      const marks = await openCollapsedMenu(page, width, await page.evaluate(markProbes, args), { args })
      const samples = await platformFonts(page, BROWSER_ROLES.filter((r) => marks[r]).map((r) => `[data-sfprobe="${r}"]`)).catch((e) => {
        throw new Error(`${route} at ${width}px: the platform font reader failed (${e.message})`)
      })
      const roles = {}
      for (const role of BROWSER_ROLES) {
        const sample = samples.find((s) => s.selector === `[data-sfprobe="${role}"]`)
        if (!marks[role]) continue
        roles[role] = { requested: sample?.requested ?? null, drawn: sample?.fonts ?? [], size: marks[role].size, chars: marks[role].chars, text: marks[role].text }
        // Which face does the requested web family resolve to ON THIS NODE? The node is read again with its font-family forced to
        // that family alone: the same dominant font as the sample ties an internal font name to the family (an alias of this node's
        // drawn face); a different one means the family did not draw it.
        const web = (sample?.requested ?? '').split(',').map((x) => x.replace(/["']/g, '').trim()).find((x) => x && !GENERIC_FAMILIES.has(x.toLowerCase()))
        if (web && sample?.fonts?.length) {
          await page.evaluate(({ role, family }) => document.querySelector(`[data-sfprobe="${role}"]`)?.style.setProperty('font-family', `"${family}"`, 'important'), { role, family: web })
          const forced = await platformFonts(page, [`[data-sfprobe="${role}"]`]).catch(() => [])
          await page.evaluate((role) => document.querySelector(`[data-sfprobe="${role}"]`)?.style.removeProperty('font-family'), role)
          const top = [...(forced[0]?.fonts ?? [])].sort((a, b) => b.glyphs - a.glyphs)[0]
          roles[role].forced = { family: web, name: top?.name ?? null, custom: Boolean(top?.custom) }
        }
      }
      const faces = await page.evaluate((max) => [...document.fonts].slice(0, max).map((f) => ({ family: f.family.replace(/["']/g, ''), weight: f.weight, style: f.style, status: f.status })), MAX_FACES)
      // where the browser ended up once the page settled and was measured (script redirects included), not the address asked for
      base.finalUrl = page.url()
      return { ...base, status, roles, absent: BROWSER_ROLES.filter((r) => !marks[r]), faces, failedRequests: failed }
    } catch (e) {
      // the page navigated away while it was read (a script redirect): nothing measured on it is the page asked for
      if (!/Execution context was destroyed|navigation|Target (page|closed)/i.test(String(e.message))) throw e
      return { ...base, finalUrl: page.url(), status, error: 'the page navigated while it was being measured', roles: {}, absent: [], faces: null, failedRequests: failed }
    }
  })
}

/** The routes to read: home, one per used style, one nested; `static` is the source-font static report. */
export function planRoutes(staticReport, { extra = [], nested = null } = {}) {
  const plan = [{ route: '/', kind: 'home', styleId: null, template: null }]
  const menu = staticReport?.menuRoutes ?? []
  const seen = new Set(['/'])
  const defaultStyle = (staticReport?.usedStyles ?? []).find((s) => s.default)
  if (defaultStyle) plan[0] = { route: '/', kind: 'home', styleId: defaultStyle.id, template: defaultStyle.template }
  for (const st of (staticReport?.usedStyles ?? []).filter((x) => !x.aliasOnly)) {
    if (plan.some((p) => String(p.styleId) === String(st.id))) continue
    const item = menu.find((m) => String(m.styleId) === String(st.id) && m.path && !seen.has(`/${m.path}`))
    if (item) {
      plan.push({ route: `/${item.path}`, kind: 'style', styleId: st.id, template: st.template })
      seen.add(`/${item.path}`)
    } else plan.push({ route: null, kind: 'style', styleId: st.id, template: st.template, missing: `no published menu item renders style #${st.id}` })
  }
  const nestedItem = nested ? { path: nested.replace(/^\//, ''), styleId: null } : menu.find((m) => m.path?.includes('/'))
  if (nestedItem) plan.push({ route: `/${nestedItem.path}`, kind: 'nested', styleId: nestedItem.styleId ?? null, template: null })
  else plan.push({ route: null, kind: 'nested', styleId: null, template: null, missing: 'no nested SEF menu path is known' })
  for (const r of extra) {
    // an extra page that is a menu route carries the style its menu item says; any other claims none
    const item = menu.find((m) => m.path && `/${m.path}` === r)
    const st = item ? (staticReport?.usedStyles ?? []).find((x) => String(x.id) === String(item.styleId)) : null
    plan.push({ route: r, kind: 'extra', styleId: item ? item.styleId : null, template: st?.template ?? null })
  }
  return plan
}

export async function measureSource({ origin, staticReport, widths = [DESKTOP_WIDTH, MOBILE_WIDTH], extra = [], nested = null, fetchPage = defaultFetchPage, launch }) {
  const plan = planRoutes(staticReport, { extra, nested })
  const homePage = await fetchPage(new URL('/', `${origin}/`).href)
  const hrefs = homePage.status === 200 ? pageHrefs(homePage.html, origin) : []
  // a nested route the static report did not give: the deepest real link of the home page
  const needsNested = plan.find((p) => p.kind === 'nested' && !p.route)
  if (needsNested) {
    const deep = hrefs.map((h) => h.split('?')[0]).find((h) => h.replace(/^\/index\.php/, '').split('/').filter(Boolean).length >= 2)
    if (deep) Object.assign(needsNested, { route: deep, missing: undefined })
  }
  const pages = []
  const unresolved = []
  const targets = []
  for (const p of plan) {
    if (!p.route) {
      unresolved.push({ kind: p.kind, styleId: p.styleId, why: p.missing })
      continue
    }
    const resolved = await resolveSourceRoute(origin, p.route, { hrefs })
    if (!resolved.url) {
      unresolved.push({ kind: p.kind, route: p.route, styleId: p.styleId, why: `no URL of the source answered 200 (${resolved.tried.slice(0, 3).join('; ')})` })
      continue
    }
    // the page asked for must be the page that answered: a route that redirects (to another path, or to the same path with a query such
    // as ?option=com_users&view=login) is not that route's page, whatever the redirect target answers
    let got = null
    try {
      got = new URL(resolved.url)
    } catch {}
    const trim = (v) => String(v).replace(/^\/index\.php(?=\/|$)/, '').replace(/\/+$/, '')
    if (!got || got.origin !== origin || got.search || trim(got.pathname) !== trim(p.route)) {
      unresolved.push({ kind: p.kind, route: p.route, styleId: p.styleId, why: `the route answered at ${resolved.url}, which is not the route itself (it redirects)` })
      continue
    }
    for (const width of widths) targets.push({ ...p, url: resolved.url, width })
  }
  let identity = null
  const result = await withBrowser(
    async (browser) => {
      identity = browserIdentity(browser)
      return mapLimit(targets, 2, (t) => measureOne(browser, t))
    },
    launch ? { launch } : {}
  )
  pages.push(...result)
  return { schema: BROWSER_SCHEMA, site: origin, static: { fingerprint: staticReport ? staticFingerprint(staticReport) : null }, widths, measuredAt: new Date().toISOString(), browser: identity, plan: plan.map(({ route, kind, styleId, template }) => ({ route, kind, styleId, template })), unresolved, pages }
}

// ------------------------------------------------------------------ CLI
const USAGE = 'usage: source-font-browser.mjs --site <origin> (--static <inventory.json|report.json> | --dump <j6-dir>) --out <file> [--quickstart <id>] [--route /a,/b] [--nested <path>] [--widths 1440,390] [--decisions DECISIONS.md]'

/** The static report out of an inventory.json (one quickstart, one site) or a report file. */
export function staticReportOf(json, quickstart) {
  if (json?.schema === STATIC_SCHEMA) return json
  const qs = (json?.quickstarts ?? []).filter((q) => !quickstart || q.id === quickstart)
  if (qs.length !== 1 || (qs[0].sites ?? []).length !== 1) throw new UsageError(`--static: expected exactly one quickstart with one site${quickstart ? '' : ' (give --quickstart)'}`)
  const r = qs[0].sites[0].sourceFonts
  if (!r) throw new UsageError('--static: the inventory carries no sourceFonts report')
  return r
}

async function main(argv) {
  // --route is repeatable in the usage line; parseStrict rejects repeats, so extra routes are comma-separated
  const o = parseStrict(argv, { values: ['--site', '--static', '--dump', '--out', '--quickstart', '--route', '--nested', '--widths', '--decisions'] })
  for (const need of ['--site', '--out']) if (!o.has(need)) throw new UsageError(`${need} is required\n${USAGE}`)
  if (o.has('--static') === o.has('--dump')) throw new UsageError(`give exactly one of --static (a quickstart inventory) and --dump (the joomla-dump directory from-joomla.mjs reads)\n${USAGE}`)
  const origin = new URL(o.opt('--site')).origin
  const widths = (o.opt('--widths') ?? `${DESKTOP_WIDTH},${MOBILE_WIDTH}`).split(',').map(Number)
  if (widths.some((w) => !Number.isInteger(w) || w < 200 || w > 4000)) throw new UsageError('--widths: comma-separated pixel widths')
  // --dump measures against the very static report from-joomla.mjs computes from that directory, so the artifact binds to the pack
  const staticReport = o.has('--dump') ? (await import('./from-joomla.mjs')).sourceFontsOfDump(o.opt('--dump')) : staticReportOf(JSON.parse(readFileSync(o.opt('--static'), 'utf8')), o.opt('--quickstart') ?? undefined)
  const extra = (o.opt('--route') ?? '').split(',').filter(Boolean)
  const measurement = await measureSource({ origin, staticReport, widths, extra, nested: o.opt('--nested') })
  writeFileSync(o.opt('--out'), JSON.stringify(measurement, null, 2) + '\n')
  const problems = [...browserCoverage(measurement, staticReport), ...measurement.unresolved.map((u) => `${u.kind}${u.route ? ' ' + u.route : ''}${u.styleId ? ' style #' + u.styleId : ''}: ${u.why}`)]
  const parsed = o.has('--decisions') ? parseDecisions(readSmallFile(o.opt('--decisions'), 'DECISIONS.md')) : null
  const findings = judgeBrowser(measurement)
  const open = findings.filter((f) => !decisionFor(f.key, parsed).decision)
  console.log(`measured ${measurement.pages.length} page reading(s) from ${origin}: ${measurement.pages.map((p) => `${p.route}@${p.width}`).join(', ')}`)
  for (const p of problems) console.log(`INCOMPLETE ${p}`)
  for (const f of open) console.log(`FINDING ${f.key}: ${f.message} — a fault of the SOURCE template; fix it in the source repository before porting, or record a decision that names ${f.key}`)
  console.log(problems.length || open.length ? 'FAIL' : 'PASS')
  return problems.length || open.length ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof UsageError ? `${e.message}` : `source-font-browser: ${e.message}`)
      process.exit(e instanceof UsageError ? 2 : 1)
    }
  )
}
