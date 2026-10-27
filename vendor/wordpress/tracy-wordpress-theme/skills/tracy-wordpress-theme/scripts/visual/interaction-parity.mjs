// Interaction parity (#audit): what a person DOES with the header and the page — open the drawer and its
// submenus, tap a submenu on a tablet, press the dark toggle, step a carousel, read the header band — measured
// on the source and on the site with the same real pointer, at the same widths, and compared.
//
// Two ports passed every gate that measured a page at rest or a panel opened once, and an audit of the live demo
// then found: a drawer submenu painted over its siblings; a dark panel with 2:1 text; a tablet where a submenu could not
// be opened by tap (a 14 px target under a link); a theme toggle that did nothing on its first click; a carousel
// replaced by stacked images; a header 12 px taller than the source's with the button 40 px off. Each is a CLASS,
// and each has a check here:
//
//   drawer-overlap / drawer-model   390 px: every submenu to the third level opened for real; an opened child must
//                                   not intersect a sibling row that is shown with it, and the interaction model
//                                   (drill-down with a back row, or accordion) must be the source's.
//   menu-contrast                   dark: text of every opened panel (drawer states, desktop submenus) against the
//                                   background it is really painted on — ancestors' colours composited — ≥ 4.5:1.
//   touch-not-opened / touch-target-small / touch-target-obstructed
//                                   1024 and 1180, hasTouch, real taps, no hover: each submenu the source opens by
//                                   tap opens on the site; the control is ≥ 24×24 px and is what a tap at its centre hits.
//   toggle-first-click / toggle-missing
//                                   fresh context, light OS, empty storage: the same clicks on both; the first click
//                                   must change the effective theme on the site if it does on the source.
//   carousel-missing / carousel-controls-missing / carousel-unreachable
//                                   a source carousel with controls: the site has a carousel with controls, and the
//                                   controls (not autoplay, not a script) reach every item.
//   header-height / header-control-position / header-control-missing / header-control-extra / nav-current-missing
//                                   390, 768, 1024, 1440: header height and the centre of logo, primary button, toggle,
//                                   search and hamburger within GEOMETRY_PX; on desktop the current section is marked.
//
// Bounds: a state, a control, a carousel or a page that cannot be measured is `notMeasured` with its reason, never
// counted clean; `examined` counts what was read, and a run that read nothing is not a pass. Nothing is forced:
// navigation away from the page is blocked (the request is aborted, the page stays), nothing is submitted, and no
// CSS or attribute is changed to make a panel open. A panel that does not open for a pointer is a finding.
import { withPage } from '../lib/browser.mjs'
import { HELPERS } from './interaction-page.mjs'
import { counterpartOf } from '../lib/control-pairing.mjs'
import { groupInteractionFindings } from './interaction-report.mjs'

import { CHECKS, TIERS, DESKTOP_WIDTH, DRAWER_DEPTH, DRAWER_THEMES, DRAWER_WIDTH, DRAWER_WIDTHS, GEOMETRY_PX, HEADER_WIDTHS, INTERACTION_KINDS, INTERACTION_TOOL, MIN_CONTRAST, MIN_TARGET_PX, TABLET_WIDTHS } from './interaction-page-contract.mjs'
import { checkApplicability, noReferenceReason } from './applicability.mjs'
export { CHECKS, DESKTOP_WIDTH, DRAWER_DEPTH, DRAWER_THEMES, DRAWER_WIDTH, DRAWER_WIDTHS, GEOMETRY_PX, HEADER_WIDTHS, INTERACTION_KINDS, INTERACTION_TOOL, MIN_CONTRAST, MIN_TARGET_PX, TABLET_WIDTHS }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const keyOf = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()

// ─────────────────────────────────────────────── a page, safely
/** One fresh context on one side. Navigation after the first load is aborted: a tap on a link must not leave the page. */
async function onSide(browser, side, { width, height = 900, theme = 'light', hasTouch = false, hooks = true, preload = null }, fn) {
  const opts = { viewport: { width, height }, theme, hasTouch }
  if (hooks && theme === 'dark' && side.darkHook) Object.assign(opts, { darkHook: side.darkHook, hookUrl: side.url })
  if (hooks && theme === 'dark' && side.darkRequestHook) Object.assign(opts, { darkRequestHook: side.darkRequestHook, hookUrl: side.url })
  if (hooks && theme === 'light' && side.lightHook) Object.assign(opts, { lightHook: side.lightHook, hookUrl: side.url })
  return withPage(browser, opts, async (page, context) => {
    const guard = { armed: false, blocked: 0, blockedUrls: [], mutations: 0, log: [], navigations: () => page.evaluate(() => window.__iaNav || 0).catch(() => 0) }
    await page.route('**/*', (route) => {
      const req = route.request()
      // nothing is submitted and nothing is written: a request that is not a read is aborted and counted
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
        guard.mutations++
        if (guard.log.length < 200) guard.log.push({ method: req.method(), url: req.url(), type: req.headers()['content-type'] ?? '', body: req.postDataBuffer() ?? Buffer.alloc(0), nav: req.isNavigationRequest() && req.frame() === page.mainFrame() })
        return route.abort()
      }
      if (guard.armed && req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        guard.blocked++
        guard.blockedUrls.push(req.url())
        return route.abort()
      }
      return route.continue()
    })
    if (preload) await page.addInitScript(preload)
    const load = async () => {
      guard.armed = false
      const res = await page.goto(side.url, { waitUntil: 'load', timeout: 45000 })
      // a page the contract declares with an error status (the 404 page) is read only at exactly that status; any other page
      // that answers an error is no page
      if (res && (side.status != null ? res.status() !== side.status : res.status() >= 400)) throw new Error(`${side.url} answered ${res.status()}${side.status != null ? `, not the ${side.status} the contract declares` : ''}`)
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
      await page.evaluate(HELPERS)
      // A tap on a link must not leave the page: its activation is cancelled in the capture phase and counted
      // (the request abort above is the backstop for a script that navigates).
      await page.evaluate(() => {
        // a submit is counted when it reaches the page's own handlers and cancelled AFTER them (window, bubbling): the page's client-side
        // validation runs as it would; `__iaSubmitOk` counts the ones no handler stopped. The request it would send is aborted by the route guard.
        document.addEventListener('submit', () => { window.__iaSubmit = (window.__iaSubmit || 0) + 1 }, true)
        // per form: the element each submit event was fired on, and whether any handler stopped it (the proof of a submission is THIS form's own event)
        window.addEventListener('submit', (e) => { (window.__iaSubmits = window.__iaSubmits || []).push({ form: e.target, ok: !e.defaultPrevented }); e.preventDefault() }, false)
        window.__iaNav = 0
        document.addEventListener('click', (e) => {
          const a = e.target instanceof Element ? e.target.closest('a[href]') : null
          if (a && !/^(#|javascript:)/i.test(a.getAttribute('href'))) { e.preventDefault(); window.__iaNav++ }
        }, true)
      })
      await sleep(250)
      guard.armed = true
    }
    await load()
    return fn({ page, context, guard, load })
  })
}


/**
 * The fields of a blocked write, read with the platform's own parsers (URLSearchParams, multipart through Response.formData):
 * name → [values]. `null` when the body is neither of those or does not parse — nothing is guessed from the text.
 */
export async function bodyFields(write) {
  try {
    const type = String(write.type ?? '').toLowerCase()
    const out = new Map()
    const add = (k, v) => { if (typeof v === 'string') out.set(k, [...(out.get(k) ?? []), v]) }
    if (type.startsWith('application/x-www-form-urlencoded')) for (const [k, v] of new URLSearchParams(write.body.toString('utf8'))) add(k, v)
    else if (type.startsWith('multipart/form-data')) for (const [k, v] of await new Response(write.body, { headers: { 'content-type': write.type } }).formData()) add(k, v)
    else return null
    return out
  } catch {
    return null
  }
}

/**
 * Whether the writes blocked during one press are THIS form's submission. Only an explicit per-form marker says so: a Contact Form 7
 * request to the form's own feedback endpoint whose body carries the form's own `_wpcf7_unit_tag` (once) and `_wpcf7` id; an AcyMailing
 * request to its `frontusers` endpoint whose body carries the form's own `acyformname` (once) — its submit is a script on a button, so
 * it fires no submit event (ja-restaurant S-29: every page with the source's Subscribe form was left not measured). An endpoint, a
 * plugin id shared by other embeds, sample text or timing proves nothing. Anything else is `fired: null` (not measured).
 * @param {{method: string, url: string, type: string, body: Buffer}[]} writes  the writes blocked since the press
 * @param {{kind: string, id: string|null, unit: string|null, why?: string|null}|null} plugin  the form's own marker (page.lifecycle)
 * @param {number} events  the submit events fired on THIS form since the press
 * @param {boolean} staleSuspect  the form's previous press ended with a submit event and no request: a request now may belong to it
 */
export async function attributeWrites(writes, plugin, events, staleSuspect = false) {
  if (!writes.length) return null
  const unknown = (reason) => ({ fired: null, reason })
  const first = `${writes[0].method} ${new URL(writes[0].url).pathname}`
  if (plugin?.kind === 'acym') return attributeAcym(writes, plugin, staleSuspect, { first, unknown })
  if (plugin?.kind !== 'cf7') return unknown(`a write request (${first}) was blocked and this form carries no supported per-form marker: whether it submitted is unknown`)
  if (!plugin.unit) return unknown(`a write request (${first}) was blocked and ${plugin.why ?? 'the form has no per-form marker'}: whether it submitted is unknown`)
  if (!events) return unknown(`a write request (${first}) was blocked but this form fired no submit event: it is not this form's submission`)
  if (staleSuspect) return unknown(`a write request (${first}) was blocked after an earlier press of this form that ended with a submit event and no request: it may belong to that press`)
  const own = []
  for (const w of writes) {
    const fields = await bodyFields(w)
    if (!fields) continue
    const unit = fields.get('_wpcf7_unit_tag') ?? []
    if (unit.length === 1 && unit[0] === plugin.unit) own.push({ w, fields })
    else if (unit.includes(plugin.unit)) return unknown('a request carried this form\'s marker more than once: the attribution is ambiguous')
  }
  if (own.length !== 1) return unknown(own.length ? `${own.length} requests carry this form's marker: the attribution is ambiguous` : `a write request (${first}) was blocked and none of the blocked requests carries this form's own _wpcf7_unit_tag: whether it submitted is unknown`)
  const { w, fields } = own[0]
  const idOk = (fields.get('_wpcf7') ?? []).length === 1 && fields.get('_wpcf7')[0] === plugin.id
  let path
  try { path = new URL(w.url).pathname } catch { path = '' }
  const endpoint = path.endsWith(`/contact-form-7/v1/contact-forms/${plugin.id}/feedback`)
  if (!idOk || !endpoint) return unknown('the request carrying this form\'s marker is not a Contact Form 7 feedback request for the form\'s own id: not attributed')
  return { fired: true, lifecycle: 'cf7' }
}

/**
 * attributeWrites for an AcyMailing form: the one blocked request whose body carries this form's acyformname once and is
 * AcyMailing's subscribe request — what its module posts (media/com_acym/js/module.min.js `submitAcymForm('subscribe', …)`,
 * the form's hidden ctrl=frontusers and option=com_acym): `task` exactly `subscribe`, and the frontusers controller, by its path
 * (`…/component/acym/frontusers`) or by option=com_acym with ctrl=frontusers (query or body). Any other AcyMailing task
 * (unsubscribe, a delete) carrying the marker is not a subscription.
 */
async function attributeAcym(writes, plugin, staleSuspect, { first, unknown }) {
  if (!plugin.unit) return unknown(`a write request (${first}) was blocked and ${plugin.why ?? 'the form has no per-form marker'}: whether it submitted is unknown`)
  if (staleSuspect) return unknown(`a write request (${first}) was blocked after an earlier press of this form that ended with a submit event and no request: it may belong to that press`)
  const own = []
  for (const w of writes) {
    const fields = await bodyFields(w)
    if (!fields) continue
    const marker = fields.get('acyformname') ?? []
    if (marker.length === 1 && marker[0] === plugin.unit) own.push({ w, fields })
    else if (marker.includes(plugin.unit)) return unknown('a request carried this form\'s marker more than once: the attribution is ambiguous')
  }
  if (own.length !== 1) return unknown(own.length ? `${own.length} requests carry this form's marker: the attribution is ambiguous` : `a write request (${first}) was blocked and none of the blocked requests carries this form's own acyformname: whether it submitted is unknown`)
  const { w, fields } = own[0]
  let url = null
  try { url = new URL(w.url) } catch { /* not an address */ }
  const one = (k) => {
    const v = [...(fields.get(k) ?? []), ...(url ? url.searchParams.getAll(k) : [])]
    return new Set(v).size === 1 ? v[0] : null
  }
  const frontusers = Boolean(url) && (url.pathname.endsWith('/component/acym/frontusers') || (one('option') === 'com_acym' && one('ctrl') === 'frontusers'))
  const task = fields.get('task') ?? []
  if (!frontusers || task.length !== 1 || task[0] !== 'subscribe') return unknown('the request carrying this form\'s marker is not an AcyMailing subscribe request (frontusers, task=subscribe): not attributed')
  return { fired: true, lifecycle: 'acym' }
}

const click = async (page, b, { touch = false } = {}) => {
  if (touch) await page.touchscreen.tap(b.cx, b.cy)
  else await page.mouse.click(b.cx, b.cy)
}

// ─────────────────────────────────────────────── drawer
/**
 * Every submenu of the drawer to DRAWER_DEPTH levels, each opened for real from a freshly loaded page. A state is
 * the drawer with one chain of submenus open: rows shown, sibling overlaps, back row, interaction model, and (when
 * asked) the contrast of the panel.
 */
export async function measureDrawer(browser, side, { width = DRAWER_WIDTH, theme = 'light', withContrast = false, maxStates = 14, deadline = Infinity } = {}) {
  const out = { width, theme, measured: false, burger: null, states: [], truncated: null }
  const queue = [[]]
  const seen = new Set()
  while (queue.length) {
    const path = queue.shift()
    if (out.states.length >= maxStates || Date.now() > deadline) {
      out.truncated = { reason: out.states.length >= maxStates ? `state cap ${maxStates}` : 'time budget', remaining: queue.length + 1 }
      break
    }
    const state = await onSide(browser, side, { width, theme }, async ({ page, guard }) => {
      const b = await page.evaluate(() => {
        const el = window.__ia.burger()
        if (!el) return null
        return { ...window.__ia.box(el), label: window.__ia.label(el) }
      })
      if (!b) return { noBurger: true }
      await click(page, b)
      await sleep(700)
      let before = []
      for (let i = 0; i < path.length; i++) {
        const step = await page.evaluate(
          ({ path, i }) => {
            const p = window.__ia.panel(window.__ia.burger())
            if (!p) return { panel: false }
            const scope = window.__ia.resolve(p, path.slice(0, i))
            if (!scope) return { missing: true }
            const siblings = window.__ia.lisOf(scope).filter((li) => window.__ia.vis(window.__ia.rowOf(li))).map((li) => window.__ia.key(window.__ia.label(window.__ia.rowOf(li))))
            const li = window.__ia.lisOf(scope).filter(window.__ia.expandable)[path[i]]
            if (!li) return { missing: true }
            const ctl = window.__ia.ctlOf(li)
            ctl.scrollIntoView({ block: 'center' })
            return { siblings, box: window.__ia.box(ctl) }
          },
          { path, i }
        )
        if (step.panel === false || step.missing) return { lost: `step ${i + 1} of ${path.join('>')} could not be found again` }
        before = step.siblings
        await click(page, step.box)
        await sleep(650)
      }
      return page.evaluate(
        ({ path, before, withContrast }) => {
          const p = window.__ia.panel(window.__ia.burger())
          if (!p) return { panel: false }
          const scope = window.__ia.resolve(p, path)
          if (!scope) return { missing: true }
          const all = window.__ia.rows(p)
          const parentScope = path.length ? window.__ia.resolve(p, path.slice(0, -1)) : null
          const sibNow = (parentScope || p) && window.__ia.lisOf(parentScope || p).filter((li) => window.__ia.vis(window.__ia.rowOf(li)) && !(path.length && window.__ia.backControl(p) && window.__ia.covered(window.__ia.rowOf(li), p))).map((li) => window.__ia.key(window.__ia.label(window.__ia.rowOf(li))))
          const childRows = path.length ? window.__ia.lisOf(scope).filter((li) => window.__ia.vis(window.__ia.rowOf(li)) && !window.__ia.isBackLi(li)) : [] // a back row is navigation, not one of the branch's children
          const kids = window.__ia.lisOf(scope).filter(window.__ia.expandable).map((li, index) => ({ index, label: window.__ia.label(window.__ia.rowOf(li)), shown: window.__ia.vis(window.__ia.rowOf(li)), leaves: window.__ia.leavesOf(li) }))
          const back = window.__ia.backControl(p)
          // what the opened parent really shows: its child rows (shown), all its children (declared), and what it claims
          const declared = path.length ? window.__ia.childLis(scope).filter((li) => !window.__ia.isBackLi(li)).map((li) => window.__ia.label(window.__ia.rowOf(li))) : []
          const ctl = path.length ? window.__ia.ctlOf(scope) : null
          const claims = ctl ? (ctl.getAttribute('aria-expanded') ?? scope.getAttribute('aria-expanded')) : null
          const children = childRows.map((li) => window.__ia.label(window.__ia.rowOf(li)))
          let model = 'root'
          if (path.length) model = childRows.length === 0 ? 'none' : before.some((k) => !sibNow.includes(k)) ? 'drill-down' : 'accordion'
          return {
            panel: true,
            model,
            rows: all.length,
            back: Boolean(back),
            overlaps: window.__ia.overlaps(all, { scope: path.length ? scope : null, root: p, drilled: path.length > 0 && Boolean(back) }).slice(0, 10),
            backRows: window.__ia.backControls(p).length,
            kids,
            children,
            declared,
            claims,
            contrast: withContrast ? window.__ia.contrast(p) : null
          }
        },
        { path, before, withContrast }
      ).then(async (s) => {
        // a back row must take the panel back up: pressed for real, the open level's own children are gone afterwards
        if (s.panel && path.length && s.back) {
          const back = await page.evaluate(() => { const c = window.__ia.backControls(window.__ia.panel(window.__ia.burger()))[0]; return c ? window.__ia.box(c) : null })
          if (back) {
            await click(page, back)
            await sleep(600)
            s.backWorks = await page.evaluate((path) => {
              const p = window.__ia.panel(window.__ia.burger())
              if (!p) return null
              const scope = window.__ia.resolve(p, path)
              return !scope || !window.__ia.childLis(scope).some((li) => window.__ia.vis(window.__ia.rowOf(li)))
            }, path)
          }
        }
        return { ...s, burger: b.label }
      })
    }).catch((e) => ({ error: String(e.message).split('\n')[0].slice(0, 200) }))
    if (state.noBurger) {
      if (!path.length) out.reason = 'no visible menu button'
      break
    }
    if (state.error || state.lost || state.panel === false || state.missing) {
      out.states.push({ path: path.map(String), labels: [], error: state.error ?? state.lost ?? (state.panel === false ? 'the drawer did not open' : 'the submenu could not be found') })
      if (!path.length) break
      continue
    }
    out.measured = true
    out.burger = state.burger
    const labels = path.map((_, i) => out.states.find((s) => s.path.join('>') === path.slice(0, i + 1).join('>'))?.label ?? '?')
    const parent = out.states.find((s) => s.path.join('>') === path.slice(0, -1).join('>'))
    const label = path.length ? parent?.kids?.find((k) => k.index === path[path.length - 1])?.label ?? '?' : ''
    out.states.push({ path: path.map(String), label, labels: [...labels.slice(0, -1), label].filter(Boolean), depth: path.length, model: state.model, rows: state.rows, back: state.back, overlaps: state.overlaps, backRows: state.backRows, backWorks: state.backWorks ?? null, kids: state.kids, children: state.children, declared: state.declared, claims: state.claims, contrast: state.contrast })
    if (path.length < DRAWER_DEPTH) for (const k of state.kids) if (k.shown) {
      const next = [...path, k.index]
      const tag = `${next.join('>')}|${keyOf(k.label)}`
      if (!seen.has(tag)) { seen.add(tag); queue.push(next) }
    }
  }
  return out
}

const pathKey = (s) => (s.path ?? []).join('>')

/**
 * Which site parent is which source parent. By meaning, never by sibling index: a parent pairs with the one that has the
 * same name, else the one that holds the same rows underneath (a menu the site renamed keeps its children); a parent
 * left with several candidates and no evidence is ambiguous — not measured, not guessed.
 * @returns {{pairs: Map<string, object>, reverse: Map<string, object>, missing: object[], ambiguous: object[]}}
 */
export function pairDrawerStates(source, site) {
  const out = { pairs: new Map(), reverse: new Map(), missing: [], ambiguous: [] }
  const byPath = (side) => new Map((side?.states ?? []).filter((s) => !s.error).map((s) => [pathKey(s), s]))
  const src = byPath(source)
  const mine = byPath(site)
  const visit = (sp, tp) => {
    const sk = (sp.kids ?? []).filter((k) => k.shown)
    const tk = (tp.kids ?? []).filter((k) => k.shown)
    const taken = new Set()
    const pairedKids = []
    const uniq = (list, k) => list.filter((x) => keyOf(x.label) === keyOf(k.label))
    for (const k of sk) {
      const m = uniq(tk, k)
      if (m.length === 1 && uniq(sk, k).length === 1 && !taken.has(m[0].index)) { taken.add(m[0].index); pairedKids.push([k, m[0]]) }
    }
    const left = sk.filter((k) => !pairedKids.some(([a]) => a === k))
    const free = tk.filter((k) => !taken.has(k.index))
    const overlap = (a, b) => {
      const A = new Set((a.leaves ?? []).map(keyOf))
      const B = new Set((b.leaves ?? []).map(keyOf))
      if (!A.size || !B.size) return 0
      let n = 0
      for (const x of A) if (B.has(x)) n++
      return n / (A.size + B.size - n)
    }
    const scored = left.map((k) => free.map((f) => ({ k, f, score: overlap(k, f) })).sort((a, b) => b.score - a.score))
    for (const row of scored) {
      const [best, next] = row
      const mutual = best && best.score >= 0.5 && (!next || next.score < best.score) && !scored.some((o) => o !== row && o[0]?.f === best.f && o[0].score >= best.score)
      if (mutual && !taken.has(best.f.index)) { taken.add(best.f.index); pairedKids.push([best.k, best.f]) }
    }
    // one parent left on each side, at the same level: by elimination it is the same parent, whatever either is called
    const srcRest = sk.filter((k) => !pairedKids.some(([a]) => a === k))
    const siteRest = tk.filter((f) => !taken.has(f.index))
    if (srcRest.length === 1 && siteRest.length === 1) { taken.add(siteRest[0].index); pairedKids.push([srcRest[0], siteRest[0]]) }
    for (const k of sk) {
      if (pairedKids.some(([a]) => a === k)) continue
      const label = [...(sp.labels ?? []), k.label].filter(Boolean)
      const rest = tk.filter((f) => !taken.has(f.index))
      const at = { path: [...sp.path, String(k.index)], labels: label }
      if (rest.length) out.ambiguous.push({ ...at, reason: `${rest.length} site parent(s) at this level and none shares its name or the rows beneath it` })
      else out.missing.push(at)
    }
    for (const [a, b] of pairedKids) {
      const s2 = src.get([...sp.path, String(a.index)].join('>'))
      const t2 = mine.get([...tp.path, String(b.index)].join('>'))
      if (!s2 || !t2) continue
      out.pairs.set(pathKey(s2), t2)
      out.reverse.set(pathKey(t2), s2)
      visit(s2, t2)
    }
  }
  const sr = src.get('')
  const tr = mine.get('')
  if (sr && tr) {
    out.pairs.set('', tr)
    out.reverse.set('', sr)
    visit(sr, tr)
  }
  return out
}

/** Findings of one width/theme: the site's states against the source's. */
function drawerComparison({ route, site, source, theme = 'light' }) {
  const findings = []
  const notMeasured = []
  const at = { route, width: site.width ?? DRAWER_WIDTH, theme }
  if (!site.measured) {
    if (source?.measured) {
      const parents = (source.states ?? []).flatMap((state) => (state.kids ?? []).filter((kid) => kid.shown).map((kid) => ({ path: [...(state.path ?? []), kid.index] })))
      const rootError = (site.states ?? []).find((state) => !(state.path ?? []).length && state.error)
      if (rootError) for (const parent of parents) notMeasured.push({ ...at, check: 'drawer', obligationId: `drawer:${encodeURIComponent(route)}:${at.width}:${theme}:${encodeURIComponent(parent.path.join('>'))}`, reason: `site root state: ${rootError.error}` })
      else if (parents.length) for (const parent of parents) findings.push({ kind: 'drawer-missing', ...at, obligationId: `drawer:${encodeURIComponent(route)}:${at.width}:${theme}:${encodeURIComponent(parent.path.join('>'))}`, detail: site.reason ?? 'the drawer did not open on the site while the source has one' })
      else findings.push({ kind: 'drawer-missing', ...at, detail: site.reason ?? 'the drawer did not open on the site while the source has one' })
    }
    // no menu button on either side: there is no drawer to compare — a page was read, nothing was left out
    else if (site.reason === 'no visible menu button' && (!source || source.reason === 'no visible menu button')) return { findings, notMeasured, examined: 1 }
    else notMeasured.push({ ...at, check: 'drawer', reason: site.reason ?? 'the drawer could not be opened on either side' })
    return { findings, notMeasured, examined: 0 }
  }
  const pairing = pairDrawerStates(source, site)
  let examined = 0
  // every parent the source opens must be a parent the site opens, with its children shown (not just aria-expanded)
  const broken = new Set() // a parent that did not open hides its descendants: one finding, not a cascade (source paths)
  const under = (peer) => [...broken].some((b) => pathKey(peer).startsWith(`${b}>`))
  const sourceStates = (source?.states ?? []).filter((s) => !s.error)
  const obligationIdForPath = (path) => path?.length ? `drawer:${encodeURIComponent(route)}:${at.width}:${theme}:${encodeURIComponent(path.join('>'))}` : null
  for (const s of source?.states ?? []) if (s.error) { notMeasured.push({ ...at, check: 'drawer', obligationId: obligationIdForPath(s.path), reason: `source ${(s.labels ?? []).join(' > ') || s.path?.join('>') || 'drawer'}: ${s.error}` }) }
  for (const peer of sourceStates) {
    if (!peer.depth || !(peer.children?.length > 0)) continue
    const obligationId = obligationIdForPath(peer.path)
    const findingStart = findings.length
    const notMeasuredStart = notMeasured.length
    const annotate = () => {
      for (const row of findings.slice(findingStart)) row.obligationId ??= obligationId
      for (const row of notMeasured.slice(notMeasuredStart)) row.obligationId ??= obligationId
    }
    const label = (peer.labels ?? []).join(' > ')
    if (under(peer)) {
      notMeasured.push({ ...at, check: 'drawer', obligationId, reason: `${label}: a source ancestor could not be opened on the site` })
      annotate()
      continue
    }
    const mine = pairing.pairs.get(pathKey(peer))
    if (!mine) {
      const amb = pairing.ambiguous.find((a) => a.path.join('>') === pathKey(peer))
      if (amb) { notMeasured.push({ ...at, check: 'drawer', obligationId, reason: `${label}: ${amb.reason}` }); broken.add(pathKey(peer)); annotate(); continue }
      if (!site.truncated && pairing.missing.some((m) => m.path.join('>') === pathKey(peer))) {
        broken.add(pathKey(peer))
        findings.push({ kind: 'drawer-submenu-missing', ...at, state: label, children: peer.children.length, detail: 'the source opens this parent in the drawer; the site has no such parent or none that opens' })
        annotate()
        continue
      }
      // the site's side of it errored, was cut short or was never reached: said, never dropped
      const siteError = (site.states ?? []).find((x) => x.error && x.path?.join('>') === pathKey(peer))
      const why = siteError ? `the site's state could not be opened (${siteError.error})` : site.truncated ? `the site traversal stopped (${site.truncated.reason}) before this parent` : 'the site state paired with this parent was not measured'
      notMeasured.push({ ...at, check: 'drawer', obligationId, reason: `${label}: ${why}` })
      broken.add(pathKey(peer))
      annotate()
      continue
    }
    if (keyOf(mine.label) !== keyOf(peer.label)) findings.push({ kind: 'drawer-labels-differ', ...at, state: label, source: peer.label, site: mine.label, detail: 'the site opens this parent (the same rows beneath it) under another name' })
    const shown = new Set((mine.children ?? []).map(keyOf))
    if (!shown.size) broken.add(pathKey(peer))
    if (!shown.size) findings.push({ kind: 'drawer-submenu-not-opened', ...at, state: label, claims: mine.claims, declared: mine.declared?.length ?? 0, sourceChildren: peer.children.length, detail: `after a real click the site's children are not shown${mine.claims === 'true' ? ' (aria-expanded=true, but the list stays hidden or 0×0)' : ''}` })
    else {
      const absent = peer.children.filter((c) => !shown.has(keyOf(c)))
      if (absent.length && shown.size >= peer.children.length) findings.push({ kind: 'drawer-labels-differ', ...at, state: label, source: peer.children.slice(0, 8), site: (mine.children ?? []).slice(0, 8), detail: 'the site shows as many children as the source, under other names' })
      else if (absent.length) findings.push({ kind: 'drawer-submenu-children-missing', ...at, state: label, missing: absent.slice(0, 8), sourceChildren: peer.children.length, siteChildren: shown.size })
    }
    annotate()
  }
  const seenFail = new Map()
  const failKey = (f) => `${f.text}|${f.color}|${f.background}`
  for (const s of site.states) {
    // The source-parent walk below maps errors to source-derived obligation ids. With no source,
    // the site's own traversal is the obligation list and every opened parent must show children.
    if (s.error) {
      if (!source) notMeasured.push({ ...at, check: 'drawer', reason: `site ${(s.labels ?? []).join(' > ') || s.path?.join('>') || 'drawer'}: ${s.error}` })
      continue
    }
    examined += s.rows ?? 0
    const peer = pairing.reverse.get(pathKey(s))
    if (!source && s.depth > 0 && (s.model === 'none' || !(s.children ?? []).length))
      findings.push({ kind: 'drawer-submenu-not-opened', ...at, state: (s.labels ?? []).join(' > ') || s.path?.join('>'), detail: 'after a real click the target submenu shows no children' })
    const obligationId = obligationIdForPath(peer?.path)
    const findingStart = findings.length
    const notMeasuredStart = notMeasured.length
    const real = (s.overlaps ?? []).filter((o) => !(peer?.overlaps ?? []).some((p) => keyOf(p.a) === keyOf(o.a) && keyOf(p.b) === keyOf(o.b)))
    if (theme === 'light' || theme === 'dark')
      for (const o of real) findings.push({ kind: 'drawer-overlap', ...at, state: s.labels.join(' > ') || 'root', rows: [o.a, o.b], area: o.area })
    if (s.depth > 0 && s.backWorks === false && peer?.backWorks !== false) findings.push({ kind: 'drawer-back-inert', ...at, state: s.labels.join(' > '), detail: 'the back row is shown, and pressing it for real leaves the open level open' })
    if (s.depth > 0 && s.backRows > 1 && (peer?.backRows ?? 1) <= 1) findings.push({ kind: 'drawer-back-duplicate', ...at, state: s.labels.join(' > '), rows: s.backRows, source: peer?.backRows ?? 1, detail: 'more back rows are shown than the source shows' })
    if (peer && s.depth > 0 && peer.model !== s.model && ['accordion', 'drill-down', 'none'].includes(peer.model) && ['accordion', 'drill-down', 'none'].includes(s.model))
      findings.push({ kind: 'drawer-model', ...at, state: s.labels.join(' > '), source: peer.model, site: s.model })
    if (theme === 'dark' && s.contrast) {
      // a text that sits in every state of the panel (its title bar) is ONE defect: report it where it first fails, with how many states show it
      const fresh = s.contrast.failing.filter((f) => !seenFail.has(failKey(f)))
      for (const f of s.contrast.failing) seenFail.set(failKey(f), true)
      if (s.contrast.failingCount > 0 && (fresh.length || !s.contrast.failing.length)) findings.push({ kind: 'menu-contrast', ...at, state: s.labels.join(' > ') || 'root', min: s.contrast.min, failing: fresh.slice(0, 5), failingCount: fresh.length || s.contrast.failingCount })
      if (s.contrast.unmeasuredCount > 0) notMeasured.push({ ...at, check: 'contrast', reason: `${s.labels.join(' > ') || 'root'}: ${s.contrast.unmeasuredCount} text(s) sit on an image or gradient` })
      examined += s.contrast.examined
    }
    for (const row of findings.slice(findingStart)) row.obligationId ??= obligationId
    for (const row of notMeasured.slice(notMeasuredStart)) row.obligationId ??= obligationId
  }
  if (site.truncated) notMeasured.push({ ...at, check: 'drawer', reason: `site: ${site.truncated.reason}, ${site.truncated.remaining} state(s) left` })
  if (source?.truncated) notMeasured.push({ ...at, check: 'drawer', reason: `source: ${source.truncated.reason}, ${source.truncated.remaining} state(s) left` })
  return { findings, notMeasured, examined }
}

/** Findings of one width/theme: the site's states against the source's. */
export const drawerFindings = drawerComparison

// ─────────────────────────────────────────────── desktop panels in dark
/** The submenus of the header nav opened with the pointer at desktop width, and their text contrast. */
export async function measureDesktopPanels(browser, side, { width = DESKTOP_WIDTH, theme = 'dark', cap = 10 } = {}) {
  return onSide(browser, side, { width, theme }, async ({ page }) => {
    const items = await page.evaluate(() => {
      const h = window.__ia.headerEl() || document.body
      return window.__ia.topItems(h).filter((li) => window.__ia.expandable(li) && window.__ia.vis(window.__ia.rowOf(li))).map((li, index) => ({ index, label: window.__ia.label(window.__ia.rowOf(li)).slice(0, 40) }))
    })
    const panels = []
    for (const it of items.slice(0, cap)) {
      const b = await page.evaluate((index) => {
        const h = window.__ia.headerEl() || document.body
        const li = window.__ia.topItems(h).filter((x) => window.__ia.expandable(x) && window.__ia.vis(window.__ia.rowOf(x)))[index]
        return li ? { row: window.__ia.box(window.__ia.rowOf(li)), ctl: window.__ia.box(window.__ia.ctlOf(li)) } : null
      }, it.index)
      if (!b) continue
      await page.mouse.move(b.row.cx, b.row.cy)
      await sleep(600)
      let r = await measureOpenSub(page, it.index)
      if (!r.shown) {
        await click(page, b.ctl)
        await sleep(600)
        r = await measureOpenSub(page, it.index)
      }
      panels.push({ label: it.label, shown: r.shown, contrast: r.contrast })
      await page.mouse.move(2, 2)
      await sleep(250)
    }
    return { width, theme, panels, tried: items.length }
  })
}
const measureOpenSub = (page, index) =>
  page.evaluate((index) => {
    const h = window.__ia.headerEl() || document.body
    const li = window.__ia.topItems(h).filter((x) => window.__ia.expandable(x) && window.__ia.vis(window.__ia.rowOf(x)))[index]
    const kid = li && window.__ia.childLis(li)[0]
    const sub = kid && kid.parentElement
    if (!sub || !window.__ia.vis(sub)) return { shown: false, contrast: null }
    return { shown: true, contrast: window.__ia.contrast(sub) }
  }, index)

export function desktopPanelFindings({ route, site }) {
  const findings = []
  const notMeasured = []
  let examined = 0
  const at = { route, width: site.width, theme: site.theme }
  for (const p of site.panels) {
    if (!p.shown) { notMeasured.push({ ...at, check: 'contrast', reason: `${p.label}: the submenu did not open for hover or click` }); continue }
    examined += p.contrast.examined
    if (p.contrast.failingCount > 0) findings.push({ kind: 'menu-contrast', ...at, state: p.label, min: p.contrast.min, failing: p.contrast.failing.slice(0, 5), failingCount: p.contrast.failingCount })
    if (p.contrast.unmeasuredCount > 0) notMeasured.push({ ...at, check: 'contrast', reason: `${p.label}: ${p.contrast.unmeasuredCount} text(s) sit on an image or gradient` })
  }
  if (!site.panels.length) examined = 1 // no desktop submenu panel: the page was read, nothing to measure
  return { findings, notMeasured, examined }
}

// ─────────────────────────────────────────────── touch
/** Each submenu control of the primary nav (or the drawer when the nav is collapsed) tapped for real on a hasTouch context. */
export async function measureTouch(browser, side, { width, cap = 12, deadline = Infinity }) {
  const list = await onSide(browser, side, { width, hasTouch: true }, async ({ page }) => {
    const nav = await page.evaluate(() => {
      const h = window.__ia.headerEl() || document.body
      return window.__ia.topItems(h).filter((li) => window.__ia.expandable(li) && window.__ia.vis(window.__ia.rowOf(li))).map((li, index) => ({ index, label: window.__ia.label(window.__ia.rowOf(li)).slice(0, 40) }))
    })
    return nav.length ? { context: 'nav', items: nav } : { context: 'drawer', items: [] }
  }).catch((e) => ({ error: String(e.message).split('\n')[0].slice(0, 200) }))
  if (list.error) return { width, measured: false, reason: list.error, controls: [] }
  let context = list.context
  let items = list.items
  if (!items.length) {
    // collapsed nav: the controls live in the drawer, opened by a tap
    const drawer = await onSide(browser, side, { width, hasTouch: true }, async ({ page }) => {
      const b = await page.evaluate(() => { const el = window.__ia.burger(); return el ? window.__ia.box(el) : null })
      if (!b) return { items: [] }
      await click(page, b, { touch: true })
      await sleep(700)
      return page.evaluate(() => {
        const p = window.__ia.panel(window.__ia.burger())
        return { items: p ? window.__ia.lisOf(p).filter(window.__ia.expandable).map((li, index) => ({ index, label: window.__ia.label(window.__ia.rowOf(li)).slice(0, 40) })) : [] }
      })
    }).catch(() => ({ items: [] }))
    context = 'drawer'
    items = drawer.items
  }
  const controls = []
  for (const it of items.slice(0, cap)) {
    if (Date.now() > deadline) return { width, measured: true, context, controls, truncated: { reason: 'time budget', remaining: items.length - controls.length } }
    const r = await onSide(browser, side, { width, hasTouch: true }, async ({ page, guard }) => {
      if (context === 'drawer') {
        const b = await page.evaluate(() => { const el = window.__ia.burger(); return el ? window.__ia.box(el) : null })
        if (!b) return { error: 'no menu button' }
        await click(page, b, { touch: true })
        await sleep(700)
      }
      const t = await page.evaluate(({ index, context }) => {
        const root = context === 'drawer' ? window.__ia.panel(window.__ia.burger()) : window.__ia.headerEl() || document.body
        if (!root) return null
        const li = (context === 'drawer' ? window.__ia.lisOf(root) : window.__ia.topItems(root)).filter(window.__ia.expandable).filter((x) => context === 'drawer' || window.__ia.vis(window.__ia.rowOf(x)))[index]
        if (!li) return null
        const ctl = window.__ia.ctlOf(li)
        ctl.scrollIntoView({ block: 'center' })
        const b = window.__ia.box(ctl)
        const hit = document.elementFromPoint(b.cx, b.cy)
        return { box: b, hitOk: Boolean(hit) && (hit === ctl || ctl.contains(hit)), hitTag: hit ? hit.tagName.toLowerCase() + (hit.className && typeof hit.className === 'string' ? '.' + hit.className.split(' ')[0] : '') : null }
      }, { index: it.index, context })
      if (!t) return { error: 'the control could not be found again' }
      await page.touchscreen.tap(t.box.cx, t.box.cy)
      await sleep(600)
      const opened = await page.evaluate(({ index, context }) => {
        const root = context === 'drawer' ? window.__ia.panel(window.__ia.burger()) : window.__ia.headerEl() || document.body
        if (!root) return false
        const li = (context === 'drawer' ? window.__ia.lisOf(root) : window.__ia.topItems(root)).filter(window.__ia.expandable).filter((x) => context === 'drawer' || window.__ia.vis(window.__ia.rowOf(x)) || true)[index]
        return Boolean(li) && window.__ia.childLis(li).some((c) => window.__ia.vis(window.__ia.rowOf(c)))
      }, { index: it.index, context })
      return { ...t, opened, navigated: (await guard.navigations()) + guard.blocked > 0 }
    }).catch((e) => ({ error: String(e.message).split('\n')[0].slice(0, 200) }))
    controls.push({ label: it.label, key: keyOf(it.label), ...(r.error ? { error: r.error } : { w: r.box.w, h: r.box.h, hitOk: r.hitOk, hitTag: r.hitTag, opened: r.opened, navigated: r.navigated }) })
  }
  return { width, measured: true, context, controls }
}

export function touchFindings({ route, site, source, compare = true }) {
  const findings = []
  const notMeasured = []
  const at = { route, width: site.width }
  if (!site.measured) { notMeasured.push({ ...at, check: 'touch', reason: `site: ${site.reason}` }); return { findings, notMeasured, examined: 0 } }
  if (compare && !source?.measured) notMeasured.push({ ...at, check: 'touch', reason: `source: ${source?.reason ?? 'not measured'}` })
  for (const side of compare ? [site, source] : [site]) if (side?.truncated) notMeasured.push({ ...at, check: 'touch', reason: `${side === site ? 'site' : 'source'}: ${side.truncated.reason}, ${side.truncated.remaining} control(s) left` })
  const siteBy = new Map(site.controls.filter((c) => !c.error).map((c) => [c.key, c]))
  for (const c of site.controls) if (c.error) notMeasured.push({ ...at, check: 'touch', control: c.label, reason: c.error })
  for (const c of siteBy.values()) {
    if (c.w < MIN_TARGET_PX || c.h < MIN_TARGET_PX) findings.push({ kind: 'touch-target-small', ...at, control: c.label, w: c.w, h: c.h, min: MIN_TARGET_PX })
    if (!c.hitOk) findings.push({ kind: 'touch-target-obstructed', ...at, control: c.label, hit: c.hitTag })
    if (!compare && !c.opened) findings.push({ kind: 'touch-not-opened', ...at, control: c.label, reason: c.navigated ? 'the tap followed a link instead of opening the submenu' : 'a tap did not open the submenu' })
  }
  // by what a visitor meets: a control the site names differently is the same control when it is the same place in the same row of controls
  // (the n-th submenu control of the nav is the n-th), once the names that agree are paired
  const named = new Set((source?.controls ?? []).filter((c) => !c.error && siteBy.has(c.key)).map((c) => c.key))
  const srcLeft = (source?.controls ?? []).filter((c) => !c.error && !named.has(c.key))
  const siteLeft = [...siteBy.values()].filter((c) => !named.has(c.key))
  const byOrder = new Map(srcLeft.length === siteLeft.length ? srcLeft.map((c, i) => [c, siteLeft[i]]) : [])
  for (const s of compare ? source?.controls ?? [] : []) {
    if (s.error || !s.opened) continue
    const mine = siteBy.get(s.key) ?? byOrder.get(s)
    if (!mine) findings.push({ kind: 'touch-not-opened', ...at, control: s.label, reason: 'the site has no such submenu control' })
    else if (!mine.opened) findings.push({ kind: 'touch-not-opened', ...at, control: s.label, reason: mine.navigated ? 'the tap followed a link instead of opening the submenu' : 'a tap did not open the submenu' })
  }
  return { findings, notMeasured, examined: siteBy.size + (source?.controls?.length ?? 0) || 1 } // no submenu control on either side: nothing to tap
}

// ─────────────────────────────────────────────── dark toggle
export async function measureToggle(browser, side, { width = DESKTOP_WIDTH, clicks = 3 } = {}) {
  return onSide(browser, side, { width, theme: 'light', hooks: false }, async ({ page }) => {
    const initial = await page.evaluate(() => window.__ia.theme())
    const seq = []
    for (let i = 0; i < clicks; i++) {
      const b = await page.evaluate(() => { const t = window.__ia.toggle(); return t ? window.__ia.box(t) : null })
      if (!b) return i === 0 ? { measured: true, found: false, initial } : { measured: true, found: true, initial, seq, lost: `the toggle was gone after click ${i}` }
      await click(page, b)
      await sleep(900)
      seq.push(await page.evaluate(() => window.__ia.theme()))
    }
    return { measured: true, found: true, initial, seq }
  })
}

export function toggleFindings({ route, site, source }) {
  const findings = []
  const notMeasured = []
  const at = { route, width: DESKTOP_WIDTH }
  if (!source?.found) {
    if (!source?.measured) notMeasured.push({ ...at, check: 'toggle', reason: 'source: not measured' })
    return { findings, notMeasured, examined: 1 } // no toggle on the source: nothing to match
  }
  if (!site.found) { findings.push({ kind: 'toggle-missing', ...at, detail: 'the source has a dark toggle; the site shows none' }); return { findings, notMeasured, examined: 1 } }
  const s1 = source.seq[0]?.theme
  const t1 = site.seq[0]?.theme
  if ([s1, source.initial.theme, t1, site.initial.theme].includes('unknown')) { notMeasured.push({ ...at, check: 'toggle', reason: 'the effective theme could not be read (no opaque background)' }); return { findings, notMeasured, examined: 2 } }
  const sourceChanged = s1 !== source.initial.theme
  const siteChanged = t1 !== site.initial.theme
  if (sourceChanged && !siteChanged) findings.push({ kind: 'toggle-first-click', ...at, source: `${source.initial.theme} → ${s1}`, site: `${site.initial.theme} → ${t1} (unchanged)`, flags: site.seq[0]?.flags })
  return { findings, notMeasured, examined: 2 }
}

/** Target-side theme toggle contract for an authored page with no source to pair against. */
function targetToggleFindings({ route, site }) {
  const at = { route, width: DESKTOP_WIDTH }
  if (!site?.measured) return { findings: [], notMeasured: [{ ...at, check: 'toggle', reason: site?.reason ?? 'site: not measured' }], examined: 0 }
  if (!site.found) return { findings: [{ kind: 'toggle-missing', ...at, detail: 'the target has no usable theme toggle' }], notMeasured: [], examined: 1 }
  const findings = []
  const notMeasured = []
  const seq = site.seq ?? []
  if (site.initial?.theme === 'unknown' || seq.some((s) => s?.theme === 'unknown')) notMeasured.push({ ...at, check: 'toggle', reason: 'the effective theme could not be read (no opaque background)' })
  else if (!seq.length || seq[0]?.theme === site.initial?.theme) findings.push({ kind: 'toggle-first-click', ...at, site: `${site.initial?.theme ?? 'unknown'} → ${seq[0]?.theme ?? 'unknown'} (unchanged)` })
  return { findings, notMeasured, examined: 1 + seq.length }
}

// ─────────────────────────────────────────────── carousels
/**
 * Carousels with their controls pressed for real. `reached` is what the controls revealed beyond what autoplay showed
 * in the same time with nobody pressing anything.
 */
/**
 * Runs before any script of the page and changes NOTHING about it: it only records the timers of 0.8 s or more that the page's own scripts
 * schedule (an autoplay interval is one; animations and initialisation are shorter or run as they always do). A page whose timers are all left to
 * run is the page as a visitor gets it; what the record says is whether an autoplay COULD be moving the items while a control is pressed.
 */
const RECORD_TIMERS = () => {
  window.__iaTimers = []
  let inSlow = false
  const user = (fn) => typeof fn === 'function' && !/\[native code\]/.test(Function.prototype.toString.call(fn))
  const origInterval = window.setInterval.bind(window)
  const origTimeout = window.setTimeout.bind(window)
  // a repeating timer of 0.8 s or more is an autoplay candidate; so is a slow timeout set from inside a slow timeout (a self-rescheduling loop). A one-shot
  // timeout (an initialisation) is neither.
  window.setInterval = (fn, ms, ...a) => {
    if (Number(ms) >= 800 && user(fn)) window.__iaTimers.push({ kind: 'setInterval', ms: Number(ms), due: performance.now() + Number(ms) })
    return origInterval(fn, ms, ...a)
  }
  window.setTimeout = (fn, ms, ...a) => {
    if (Number(ms) >= 800 && user(fn)) {
      window.__iaTimers.push({ kind: inSlow ? 'setTimeout-chain' : 'setTimeout', ms: Number(ms), due: performance.now() + Number(ms) })
      return origTimeout((...x) => { const prev = inSlow; inSlow = true; try { return fn(...x) } finally { inSlow = prev } }, ms, ...a)
    }
    return origTimeout(fn, ms, ...a)
  }
}

export async function measureCarousels(browser, side, { width = DESKTOP_WIDTH, cap = 4 } = {}) {
  return onSide(browser, side, { width, preload: RECORD_TIMERS }, async ({ page }) => {
    // a carousel that initialises or fills itself late is read once it has stopped changing: its items, controls and (for a known library) its initialised
    // marker are the same on four reads half a second apart — or the run says it never settled
    let list = []
    let settled = false
    let last = ''
    let still = 0
    for (let i = 0; i < 16 && !settled; i++) {
      list = await page.evaluate(() => window.__ia.carousels())
      const now = JSON.stringify(list.map((c) => [c.items, c.dots, c.arrows, c.thumbs, c.ready]))
      still = i > 0 && now === last ? still + 1 : 0
      settled = still >= 4 && list.every((c) => c.ready)
      last = now
      if (!settled) await sleep(500)
    }
    const unsettled = !settled && list.length > 0
    // A page's delayed initialisation or delayed autoplay is a one-shot timer: the page is let run until every one scheduled so far has fired (later ones are
    // recorded when they are set), so an autoplay that starts late is on the record before anything is pressed. One further than 8 s away leaves the carousel
    // uncertain, never "no timer".
    let lateTimer = false
    for (let round = 0; round < 3; round++) {
      const t = await page.evaluate(() => { const now = performance.now(); const due = Math.max(0, ...(window.__iaTimers || []).filter((x) => x.kind === 'setTimeout').map((x) => x.due)); return { wait: Math.max(0, due - now) } })
      if (t.wait > 8000) { lateTimer = true; break }
      if (t.wait <= 0) break
      await sleep(t.wait + 300)
      list = await page.evaluate(() => window.__ia.carousels()) // what a late timer built is read, with the same ids
    }
    const out = []
    for (const c of list.slice(0, cap)) {
      const hasControls = c.dots + c.arrows + c.thumbs > 0
      // the carousel and each control are read and pressed by the id they were given when first read, never by their position in a later list
      const shown = () => page.evaluate((id) => window.__ia.shownIn(id), c.id)
      const controlBoxes = () => page.evaluate((id) => window.__ia.controlBoxesOf(id), c.id)
      const box = c.box
      await page.mouse.move(box.x + box.w / 2, Math.max(1, box.y - (await page.evaluate(() => scrollY)) + box.h / 2))
      const initial = (await shown()) ?? []
      // Isolating autoplay: this carousel's own supported pause (Bootstrap, Swiper, Slick, Owl — instance-scoped, nothing global) is applied before anything is
      // pressed and again after every press; the items are then watched with nobody pressing anything. Without a supported pause the page's autoplay cannot be
      // told from the control's effect when the page schedules a repeating timer: that carousel is unmeasured, never credited to a control. A quiet period, a
      // focus that seems to hold the items, or an unrelated timer proves nothing about which of the two moved them.
      const pause = () => page.evaluate((id) => window.__ia.pauseCarousel(id), c.id)
      const mechanism = await pause()
      const differs = (now) => now.length !== initial.length || now.some((k) => !initial.includes(k))
      let drift = false
      for (let i = 0; i < 3 && !drift; i++) {
        await sleep(600)
        if (differs((await shown()) ?? [])) drift = true
      }
      const reached = new Set()
      let pressed = 0
      // a control is pressed for real and what it brought into view is read right after: autoplay is never credited
      const press = async (b) => {
        const before = new Set((await shown()) ?? [])
        await page.mouse.click(b.cx, b.cy)
        pressed++
        await pause()
        await sleep(550)
        const after = (await shown()) ?? []
        for (const k of after) if (!before.has(k)) reached.add(k)
      }
      let boxes = await controlBoxes()
      for (const b of boxes.filter((x) => x.kind !== 'arrow')) await press(b)
      // arrows: the next-looking ones first, then every other arrow by its own identity — never a guess that the last one is "next". The order is fixed from
      // one read; every later press finds its arrow again by the id it had then, so a re-ordered or re-rendered control list cannot change which one is pressed.
      const NEXT = /next|right|forward|›|»|→|chevron-right/i
      const arrows = boxes.filter((b) => b.kind === 'arrow')
      const arrowIds = [...arrows.filter((b) => NEXT.test(b.label ?? '')), ...arrows.filter((b) => !NEXT.test(b.label ?? ''))].map((b) => b.id)
      const total = new Set(c.keys).size
      const seen = () => new Set([...initial, ...reached]).size
      // each arrow, in that order, is pressed until every item has been shown or it has been pressed once per item; the next arrow starts where the last left off
      for (const id of arrowIds) {
        for (let n = 0; n <= c.items && seen() < total; n++) {
          const again = (await controlBoxes()).find((b) => b.id === id)
          if (!again) break
          await press(again)
        }
      }
      const everyItem = [...new Set(c.keys)]
      const viaControls = everyItem.filter((k) => initial.includes(k) || reached.has(k))
      // a repeating or self-rescheduling timer is an autoplay candidate; a one-shot slow timer is not, but one still pending could start one later
      const timers = (await page.evaluate(() => window.__iaTimers || [])).filter((t) => t.kind !== 'setTimeout')
      // a CSS animation that loops forever can move items with no timer at all: it is an autoplay the timer record cannot see
      const looping = await page.evaluate(() => (document.getAnimations ? document.getAnimations() : []).some((a) => a.effect?.getComputedTiming?.().iterations === Infinity && a.playState === 'running')).catch(() => false)
      const causality = mechanism && !drift ? `paused:${mechanism}` : !drift && !timers.length && !looping && !lateTimer ? 'no-timer' : 'uncertain'
      out.push({ index: c.index, kind: c.kind, items: everyItem.length, dots: c.dots, arrows: c.arrows, thumbs: c.thumbs, pressed, causality, settled: !unsettled, autoplay: causality === 'uncertain', unreached: everyItem.length - viaControls.length, unreachedKeys: everyItem.filter((k) => !viaControls.includes(k)).slice(0, 5).map((k) => k.split('|')[0]) })
    }
    return { width, measured: true, carousels: out }
  })
}

export function carouselFindings({ route, site, source }) {
  const findings = []
  const notMeasured = []
  const at = { route, width: site.width }
  if (!source?.measured) return { findings, notMeasured: [{ ...at, check: 'carousel', reason: 'source: not measured' }], examined: 0 }
  const withControls = source.carousels.filter((c) => c.dots + c.arrows + c.thumbs > 0 && c.items >= 2)
  let examined = site.carousels.reduce((n, c) => n + c.items, 0) + source.carousels.reduce((n, c) => n + c.items, 0)
  withControls.forEach((s, n) => {
    const mine = site.carousels[n]
    if (!mine) findings.push({ kind: 'carousel-missing', ...at, carousel: n + 1, sourceItems: s.items, detail: 'the source has a carousel with controls; the site has none at that place' })
    else if (mine.dots + mine.arrows + mine.thumbs === 0) findings.push({ kind: 'carousel-controls-missing', ...at, carousel: n + 1, sourceControls: { dots: s.dots, arrows: s.arrows, thumbs: s.thumbs }, items: mine.items })
  })
  for (const c of site.carousels) if (c.autoplay && c.dots + c.arrows + c.thumbs > 0) notMeasured.push({ ...at, check: 'carousel', control: `carousel ${c.index + 1}`, reason: 'the page schedules timers or the items move by themselves and this carousel has no supported pause (Bootstrap, Swiper, Slick, Owl): what a control revealed cannot be told from the autoplay, so reachability is not isolated' })
  for (const c of site.carousels) if (c.settled === false) notMeasured.push({ ...at, check: 'carousel', control: `carousel ${c.index + 1}`, reason: 'the carousel kept changing (or never reported itself initialised) for 8 s: it was not read as a settled carousel' })
  for (const c of site.carousels) if (c.unreached > 0 && !c.autoplay && c.settled !== false && (c.dots + c.arrows + c.thumbs > 0 || withControls.length > 0)) findings.push({ kind: 'carousel-unreachable', ...at, carousel: c.index + 1, items: c.items, unreached: c.unreached, items_not_reached: c.unreachedKeys })
  if (!examined && !withControls.length) examined = 1 // no carousel on either side: nothing to compare
  return { findings, notMeasured, examined }
}

// ─────────────────────────────────────────────── header band
export async function measureHeader(browser, side, { width }) {
  return onSide(browser, side, { width }, async ({ page }) => {
    const header = await page.evaluate(() => window.__ia.header())
    const nav = width >= 1024 ? await page.evaluate(() => window.__ia.navCurrent()) : null
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {})
    const inventory = await page.evaluate(() => window.__ia.inventory())
    return { width, measured: true, header, nav, inventory }
  })
}

/**
 * The current section of the header, one side against the other. Each side marked its own current item(s) (aria-current, the menu system's class, or a look
 * its siblings do not share — read in the page, nav.entries); here they are compared by what a visitor meets: the same words, the same page, or the same
 * place in the row. A finding only when one side marks a current item and the other does not, or they mark different ones.
 * @returns {object|null} a finding without its position, or null
 */
export function navCurrentVerdict(sourceNav, siteNav) {
  const entriesOf = (nav) => (nav.entries?.length ? nav.entries : (nav.current ?? []).map((label) => ({ label, path: null, explicit: true, styled: false })))
  const se = entriesOf(sourceNav)
  const te = entriesOf(siteNav)
  const on = (list) => list.map((e, i) => ({ ...e, i })).filter((e) => e.explicit || e.styled)
  const s = on(se)
  const t = on(te)
  const same = (x, y) => keyOf(x.label) === keyOf(y.label) || (x.path && y.path && x.path === y.path) || (se.length === te.length && x.i === y.i && sourceNav.entries?.length > 0)
  const names = (l) => l.map((e) => e.label)
  if (s.length && !t.length) return { kind: 'nav-current-missing', source: names(s), site: [], marked: siteNav.marked }
  if (!s.length && t.length) return { kind: 'nav-current-extra', source: [], site: names(t), extra: names(t), detail: 'the site marks a current section; the source marks none' }
  if (!s.length) return null
  if (!s.some((x) => t.some((y) => same(x, y)))) return { kind: 'nav-current-wrong', source: names(s), site: names(t) }
  const extra = t.filter((y) => !s.some((x) => same(x, y)))
  if (extra.length) return { kind: 'nav-current-extra', source: names(s), site: names(t), extra: names(extra), detail: 'the site lights more sections than the source (a double highlight)' }
  return null
}

export function headerFindings({ route, site, source, geometry = GEOMETRY_PX }) {
  const findings = []
  const notMeasured = []
  const at = { route, width: site.width }
  if (!site.header && !source.header) return { findings, notMeasured, examined: 1 } // no header on either side: nothing to compare
  if (!site.header || !source.header) {
    notMeasured.push({ ...at, check: 'header', reason: `${!site.header ? 'site' : 'source'}: no header found` })
    return { findings, notMeasured, examined: 0 }
  }
  let examined = 1
  // taller only if taller however it is measured: the header element's box (a wrapper may keep spacing the other port keeps elsewhere)
  // AND what the header paints (a port may paint a band the other leaves to the page background)
  const dBox = Math.abs(site.header.box.h - source.header.box.h)
  const dPaint = Math.abs((site.header.content?.h ?? site.header.box.h) - (source.header.content?.h ?? source.header.box.h))
  const dh = Math.min(dBox, dPaint)
  if (dh > geometry) findings.push({ kind: 'header-height', ...at, source: source.header.box.h, site: site.header.box.h, painted: { source: source.header.content?.h ?? null, site: site.header.content?.h ?? null }, delta: Math.round(dh * 10) / 10 })
  // by what a visitor meets: the control of a role on one side is the control of that role on the other. A role only one side was found to have may be a control
  // whose markup the probe did not recognise (an unnamed icon button, a boxed link): it is the counterpart when it is the only one of the same shape on the same edge.
  const counterpart = (have, lack) => counterpartOf(have, lack.header.unroled, { haveWidth: at.width, lackWidth: at.width })
  for (const name of ['logo', 'primary', 'toggle', 'search', 'hamburger']) {
    const a = source.header.controls[name] ?? (site.header.controls[name] && name !== 'logo' ? counterpart(site.header.controls[name], source) : null)
    const b = site.header.controls[name] ?? (source.header.controls[name] && name !== 'logo' ? counterpart(source.header.controls[name], site) : null)
    if (a && !b) findings.push({ kind: 'header-control-missing', ...at, control: name, source: a.label })
    else if (!a && b && name === 'toggle') examined++ // the dark/light toggle is the port's own contract (Phase 6): a source that has none is not a defect
    else if (!a && b) findings.push({ kind: 'header-control-extra', ...at, control: name, site: b.label })
    else if (a && b) {
      examined++
      const dx = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2))
      const dy = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2))
      if (dx > geometry || dy > geometry) findings.push({ kind: 'header-control-position', ...at, control: name, dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10, source: { x: Math.round(a.x + a.w / 2), y: Math.round(a.y + a.h / 2) }, site: { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) } })
    }
  }
  // responsive visibility and label wrap: a label the source hides at this width and the site shows; a label on more lines
  const srcInv = new Map((source.inventory ?? []).map((r) => [r.key, r]))
  for (const r of site.inventory ?? []) {
    const peer = srcInv.get(r.key)
    if (!peer) continue
    examined++
    if (r.shown && !peer.shown) findings.push({ kind: 'responsive-visibility', ...at, control: r.label, source: 'hidden', site: 'shown', box: { w: r.w, h: r.h } })
    else if (!r.shown && peer.shown) findings.push({ kind: 'responsive-visibility', ...at, control: r.label, source: 'shown', site: 'hidden' })
    else if (r.shown && peer.shown && r.lines > peer.lines && peer.lines > 0) findings.push({ kind: 'label-wrap', ...at, control: r.label, source: peer.lines, site: r.lines, box: { w: r.w, h: r.h } })
  }
  if (!(site.inventory ?? []).length && (source.inventory ?? []).length) notMeasured.push({ ...at, check: 'header', reason: 'site: no button or link was inventoried' })
  if (source.nav && site.nav) {
    const sn = source.nav.links >= 2
    const tn = site.nav.links >= 2
    if (sn && tn) {
      examined += site.nav.links
      const verdict = navCurrentVerdict(source.nav, site.nav)
      if (verdict) findings.push({ ...verdict, ...at })
    } else if (sn && !tn && source.nav.entries?.some((e) => e.explicit || e.styled)) findings.push({ kind: 'nav-current-missing', ...at, source: source.nav.current, site: [], detail: 'the site has no row of menu links in the header at this width' })
    else if (sn !== tn && !sn) notMeasured.push({ ...at, check: 'header', reason: 'source: no row of menu links was found in the header, so the current section could not be compared' })
  }
  return { findings, notMeasured, examined }
}

// ─────────────────────────────────────────────── forms
const TEXT_LIKE = new Set(['text', 'email', 'tel', 'url', 'number', 'password', 'textarea'])
const sampleFor = (f) => (f.type === 'email' ? 'audit@example.com' : f.type === 'tel' ? '5551234567' : f.type === 'url' ? 'https://example.com' : f.type === 'number' ? '3' : f.type === 'password' ? 'Audit-pass-1' : 'Audit text')

/**
 * Every form, read as a person meets it and filled with valid text — NEVER submitted (the submit event is cancelled in
 * the page and a request that writes is aborted). State 1: every text field valid, only the checkboxes the form itself
 * requires ticked; is the submit usable? When it is not, the other checkboxes are ticked one at a time to find what
 * unlocks it, and the submit's look is read both ways.
 */
export async function measureForms(browser, side, { width = DESKTOP_WIDTH, cap = 4 } = {}) {
  return onSide(browser, side, { width }, async ({ page, guard, load }) => {
    const initial = await page.evaluate(() => window.__ia.forms())
    const out = []
    let pageLost = false
    for (const form of initial.slice(0, cap)) {
      const rec = { index: form.index, region: form.region ?? null, method: form.method ?? null, action: form.action, fields: form.fields, submit: form.submit, dupKeys: [], state1: null, unlockedBy: null, disabledStyle: null, enabledStyle: null, notes: [] }
      // a form the tool does not understand (a script submits it, the page leaves or reloads while it is filled) is NOT MEASURED with the reason — never a crash
      try {
      const keys = form.fields.filter((f) => f.shown).map((f) => controlKey(f.key)).filter(Boolean) // a field nobody sees (a honeypot) shares its label with the real one
      rec.dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i)
      if (!form.submit) { rec.notes.push('no submit control'); out.push(rec); continue }
      const act = async (f, fn) => {
        const b = await page.evaluate(({ i, x }) => window.__ia.formField(x, i), { i: f.i, x: form.index })
        if (b) await fn(b)
        await sleep(150)
      }
      const fill = async (f) => {
        if (TEXT_LIKE.has(f.type)) await act(f, async (b) => { await click(page, b); await page.keyboard.type(sampleFor(f)) })
        else if (f.type === 'select') await page.evaluate(({ i, x }) => window.__ia.fillSelect(x, i), { i: f.i, x: form.index })
        else if ((f.type === 'checkbox' || f.type === 'radio') && f.required) await act(f, async (b) => { if (!b.checked) await click(page, b) })
      }
      // A real press of the submit, observed for THIS form only; nothing is ever sent (a write is aborted, a navigation is blocked).
      //   native      the form's own submit event reached the page's handlers and none stopped it → the submission goes through
      //   cf7         a supported plugin lifecycle: Contact Form 7 stops the event and sends the form to its feedback endpoint; the request is THIS form's only when
      //               its body carries this form's own _wpcf7_unit_tag (attributeWrites) — the endpoint or the plugin id alone is shared by other embeds
      //   acym        AcyMailing: a button script posts the form to frontusers with no submit event; THIS form's only when the body carries its own acyformname
      //   a handler stopped the event and nothing was sent → the submission was rejected (a finding)
      //   anything else — a write that no supported lifecycle attributes to this form (analytics, a validation or nonce request to the same
      //   action, another form's request), or a submit that gave no event — says nothing about a submission and is unmeasured, never usable
      let pendingReject = false // an earlier press ended with a submit event and no request attributed to it: its own request may still arrive, late, in any later press
      const attempt = async () => {
        const b = await page.evaluate((x) => window.__ia.submitBox(x), form.index)
        if (!b) return { fired: null, reason: 'no visible, clickable submit control: pressing it was not possible' }
        const before = await page.evaluate((x) => window.__ia.submitsOf(x), form.index)
        const log0 = guard.log.length
        const m0 = guard.mutations
        const nav0 = guard.blockedUrls.length
        await click(page, b)
        await sleep(1500)
        // a form whose script navigates the page itself (form.submit(), a GET search): the request the guard aborted left THIS page for the form's own address
        const gone = !(await page.evaluate(() => Boolean(window.__ia)).catch(() => false))
        if (gone) {
          // a GET leaves through the navigation guard; a POST form.submit() (no submit event) is a main-frame write with this form's method
          const asked = [...guard.blockedUrls.slice(nav0), ...guard.log.slice(log0).filter((w) => w.nav && w.method.toLowerCase() === String(form.method || 'get').toLowerCase()).map((w) => w.url)]
          let target = null
          try { target = new URL(form.action || '.', side.url) } catch { /* no address */ }
          if (target && asked.some((u) => { try { const v = new URL(u); return v.origin === target.origin && v.pathname === target.pathname } catch { return false } })) return { fired: true, invalid: [], lifecycle: 'navigation', navigated: true }
          return { fired: null, reason: 'the page left while the submit was pressed and the address it went to is not this form\'s own: whether it submitted is unknown', navigated: true }
        }
        const after = await page.evaluate((x) => window.__ia.submitsOf(x), form.index)
        const state = await page.evaluate((x) => window.__ia.formState(x), form.index)
        const writes = guard.log.slice(log0)
        if (guard.mutations - m0 !== writes.length) return { fired: null, reason: 'more write requests were blocked than the log keeps: which of them belongs to this form is unknown' }
        const invalid = state?.invalid ?? []
        const events = after.events - before.events
        const ok = after.ok - before.ok
        if (ok > 0) return { fired: true, invalid, lifecycle: 'native' }
        // a script that calls form.submit() (a Joomla filter form's icon button) fires no submit event: the one write of the press is the page
        // itself leaving, in the main frame, with this form's method, for this form's own address — the same proof as a GET form that navigates
        if (!events && writes.length === 1 && writes[0].nav && writes[0].method.toLowerCase() === String(form.method || 'get').toLowerCase()) {
          let target = null
          try { target = new URL(form.action || '.', side.url) } catch { /* no address */ }
          let sent = null
          try { sent = new URL(writes[0].url) } catch { /* no address */ }
          if (target && sent && sent.origin === target.origin && sent.pathname === target.pathname) return { fired: true, invalid, lifecycle: 'navigation' }
        }
        const plugin = await page.evaluate((x) => window.__ia.lifecycle(x), form.index)
        const verdict = await attributeWrites(writes, plugin, events, pendingReject)
        // unresolved stays unresolved: an unrelated write beside the event does not settle the press, and a later press is not attributed while one may still be in flight
        pendingReject = pendingReject || (events > 0 && verdict?.fired !== true)
        if (verdict) return { ...verdict, invalid }
        if (events === 0 && state?.submit && !state.submit.disabled && plugin) return { fired: null, reason: `the form is a ${plugin.kind} form whose press gave no submit event and no request: its outcome is unknown`, invalid }
        return { fired: false, invalid, ...(events ? { rejected: true } : {}) }
      }
      // state A: ONLY what the form itself requires is set (optional text stays empty), then the submit is pressed
      for (const f of form.fields) if (f.shown && f.required) await fill(f)
      await sleep(400)
      const required = await page.evaluate((x) => window.__ia.formState(x), form.index)
      rec.required = { disabled: required?.submit?.disabled ?? null, invalid: required?.invalid ?? [] }
      rec.attempt = await attempt()
      if (rec.attempt.navigated) {
        // the press took the page away: the rest of this form (optional checkboxes, optional text) is read on no page, so it is not walked
        rec.notes.push('the submit navigates away: the optional controls were not walked')
        out.push(rec)
        await load()
        continue
      }
      // every optional checkbox alone on top of state A: does the submit change (enabled / disabled, how it looks, whether it goes through)?
      rec.optionals = []
      for (const f of form.fields.filter((x) => x.shown && x.type === 'checkbox' && !x.required).slice(0, 3)) {
        await act(f, async (b) => { if (!b.checked) await click(page, b) })
        await sleep(300)
        const st = await page.evaluate((x) => window.__ia.formState(x), form.index)
        const at = await attempt()
        rec.optionals.push({ key: controlKey(f.key), label: f.label, disabled: st?.submit?.disabled ?? null, style: st?.submit?.style ?? null, fired: at.fired, ...(at.reason ? { reason: at.reason } : {}) })
        await act(f, async (b) => { const cur = await page.evaluate(({ i, x }) => window.__ia.formField(x, i), { i: f.i, x: form.index }); if (cur?.checked) await click(page, b) })
        await sleep(200)
      }
      // blocked with only the required set: what lets it through? an optional checkbox ticked alone, or an optional text field filled
      if (rec.attempt.fired === false) {
        const free = rec.optionals.find((o) => o.fired === true)
        if (free && !rec.unlockedBy) rec.unlockedBy = free.label
        for (const f of form.fields.filter((x) => x.shown && !x.required && TEXT_LIKE.has(x.type)).slice(0, 3)) {
          await fill(f)
          await sleep(200)
          if ((await attempt()).fired) { rec.unlockedByText = { key: controlKey(f.key), label: f.label }; break }
        }
      }
      // state 1: every text field valid (the optional ones too) with only the required checkboxes set
      for (const f of form.fields) if (f.shown && !f.required && TEXT_LIKE.has(f.type)) await fill(f)
      await sleep(400)
      const now = await page.evaluate((x) => window.__ia.formState(x), form.index)
      rec.state1 = { disabled: now.submit?.disabled ?? null, invalid: now.invalid }
      if (now.submit?.disabled) {
        rec.disabledStyle = now.submit.style
        const free = rec.optionals.find((o) => o.disabled === false)
        if (free) { rec.unlockedBy = free.label; rec.enabledStyle = free.style }
      }
      out.push(rec)
      } catch (e) {
        rec.error = `${/Execution context|Target (page|closed)|__ia|undefined/i.test(String(e.message)) ? 'the page left or reloaded while the form was filled or pressed (a script submitted it or navigated), ' : 'the form could not be driven, '}so its outcome is not measured (${String(e.message).split('\n')[0].slice(0, 120)})`
        out.push(rec)
        // the next form is read on a fresh load of the page: what this one did to the page does not reach it
        await load().catch(() => { pageLost = true })
      }
      if (pageLost) break
    }
    return { width, measured: true, forms: out, discovered: initial.map((form) => ({ index: form.index, selector: `form-${form.index}` })), total: initial.length, mutationsBlocked: guard.mutations, submitsBlocked: await page.evaluate(() => window.__iaSubmit || 0).catch(() => 0) }
  })
}

/** A control's identity across ports: the label without the possessive a port adds ("Your name" is "name"). */
/** The control of `list` that is `f`: the same label, or (same type) one label that holds the other ("Privacy Note * By submitting…" holds "By submitting…"). */
export function peerOf(list, f) {
  const k = controlKey(f.key)
  const exact = list.find((x) => controlKey(x.key) === k)
  if (exact) return exact
  const words = (x) => controlKey(x).split(' ').filter(Boolean)
  const holds = (long, short) => words(short).length >= 3 && ` ${words(long).join(' ')} `.includes(` ${words(short).join(' ')} `)
  const near = list.filter((x) => x.type === f.type && (holds(x.key, f.key) || holds(f.key, x.key)))
  return near.length === 1 ? near[0] : undefined
}
export const controlKey = (k) => String(k ?? '').replace(/^(your|the|a|an)\s+/, '').trim()
const styleDiffers = (a, b) => Math.abs(a.opacity - b.opacity) >= 0.1 || a.color !== b.color || a.background !== b.background || a.border !== b.border || a.filter !== b.filter

/** The purpose a form has for a visitor: the kinds of field a person sees in it (hidden and honeypot fields do not count). */
const purposeOf = (f) => f.fields.filter((x) => x.shown && !['hidden', 'submit', 'button', 'image', 'reset'].includes(x.type)).map((x) => x.type).sort().join(',')

/**
 * Which site form is a source form: the one that shares its controls (by label), else the one with the same purpose — the same kinds of field — and
 * among several of the same purpose the one in the same landmark (footer, main…), then in the same order among the forms of that purpose. A form is
 * never missing because its field names differ; it is missing when no form on the site has what a visitor would fill in.
 * @param {object} src
 * @param {{cand: object, i: number}[]} candidates  the site's forms not yet paired
 * @param {object[]} sourceForms  every source form (to read the rank of `src` among those of its purpose)
 * @returns {{best: {i: number, cand: object, overlap: number}|null, tie: boolean}}
 */
export function pairForm(src, candidates, sourceForms = []) {
  let best = null
  let tie = false
  for (const { cand, i } of candidates) {
    const matched = src.fields.filter((f) => peerOf(cand.fields, f)).length
    const overlap = matched / Math.max(1, src.fields.length + cand.fields.length - matched)
    if (!best || overlap > best.overlap) { best = { i, overlap, cand }; tie = false } else if (overlap === best.overlap) tie = true
  }
  if (best && best.overlap >= 0.4) return { best, tie }
  const purpose = purposeOf(src)
  const same = purpose ? candidates.filter(({ cand }) => purposeOf(cand) === purpose) : []
  if (!same.length) return { best: null, tie: false }
  const there = same.filter(({ cand }) => cand.region && cand.region === src.region)
  const pool = there.length ? there : same
  if (pool.length === 1) return { best: { ...pool[0], overlap: 0 }, tie: false }
  // several of the same purpose and place: the n-th source form of this purpose is the n-th site form of it
  const rank = sourceForms.filter((x) => purposeOf(x) === purpose && (!there.length || x.region === src.region)).indexOf(src)
  const pick = rank >= 0 && sourceForms.filter((x) => purposeOf(x) === purpose && (!there.length || x.region === src.region)).length === pool.length ? pool[rank] : null
  return pick ? { best: { ...pick, overlap: 0 }, tie: false } : { best: { ...pool[0], overlap: 0 }, tie: true }
}

/**
 * Whether the controls that share a label still pair one to one: every repeated label repeats as often on both sides, each run of it has
 * the same field types in the same order, and none is a checkbox or radio (an optional box ticked alone is found by its label). Then the
 * n-th "Selects" is the n-th "Selects" (ja-restaurant S-30: a typography sample form with a single and a multiple select, both labelled
 * "Selects", on the source and the port alike, left its page not measured).
 */
export function orderedDuplicates(src, site) {
  const run = (form, k) => form.fields.filter((f) => f.shown && controlKey(f.key) === k)
  return [...new Set([...src.dupKeys, ...site.dupKeys])].every((k) => {
    const a = run(src, k)
    const b = run(site, k)
    return a.length > 1 && a.length === b.length && a.every((f, i) => f.type === b[i].type && !['checkbox', 'radio'].includes(f.type))
  })
}

/** Field → its counterpart: by label first (controls that share a label in order), then by kind of field where the same number of the kind is left on both sides (the n-th email is the n-th email). */
export function pairFields(srcFields, siteFields) {
  const out = new Map()
  const taken = new Set()
  for (const f of srcFields) {
    const p = siteFields.find((x) => !taken.has(x) && controlKey(x.key) === controlKey(f.key)) ?? peerOf(siteFields, f)
    if (p && !taken.has(p)) { out.set(f, p); out.set(p, f); taken.add(p) }
  }
  const left = (list) => list.filter((f) => f.shown && !out.has(f))
  for (const type of new Set([...left(srcFields), ...left(siteFields)].map((f) => f.type))) {
    const a = left(srcFields).filter((f) => f.type === type)
    const b = left(siteFields).filter((f) => f.type === type)
    if (a.length && a.length === b.length) a.forEach((f, i) => { out.set(f, b[i]); out.set(b[i], f) })
  }
  return out
}

export function formFindings({ route, site, source }) {
  const findings = []
  const notMeasured = []
  let examined = 0
  const at = { route, width: site.width ?? DESKTOP_WIDTH }
  if (!source) {
    if (!site?.measured) return { findings, notMeasured: [{ ...at, check: 'form', reason: `site: ${site?.reason ?? 'not measured'}` }], examined: 0 }
    const forms = site.forms ?? []
    for (const form of forms) {
      const name = form.submit?.label || form.action || `form ${form.index}`
      if (form.error) { notMeasured.push({ ...at, check: 'form', control: name, reason: `site: ${form.error}` }); continue }
      if (form.attempt?.fired === null || form.attempt === undefined) {
        notMeasured.push({ ...at, check: 'form', control: name, reason: 'site: valid form submission was not measured' })
        continue
      }
      examined += (form.fields?.length ?? 0) + 1
      if (form.attempt.fired === false)
        findings.push({ kind: 'form-submit-blocked', ...at, form: name, unlockedBy: form.unlockedBy ?? null, detail: 'with every field valid and only the required controls set, the target form submit does not go through' })
      if (form.state1?.disabled && form.disabledStyle && form.enabledStyle && !styleDiffers(form.disabledStyle, form.enabledStyle))
        findings.push({ kind: 'form-disabled-indistinct', ...at, form: name, opacity: form.disabledStyle.opacity, cursor: { disabled: form.disabledStyle.cursor, enabled: form.enabledStyle.cursor }, detail: 'the disabled submit looks like the enabled one (opacity, colour, background and border are the same)' })
    }
    if (site.total > forms.length) notMeasured.push({ ...at, check: 'form', reason: `site: form read stopped at the cap (${forms.length} of ${site.total})` })
    return { findings, notMeasured, examined: examined || 1 }
  }
  if (!source.measured) return { findings, notMeasured: [{ ...at, check: 'form', reason: 'source: not measured' }], examined: 0 }
  const discoveredForms = source.discovered ?? source.forms ?? []
  const formId = (form) => `form:${encodeURIComponent(route)}:${at.width}::${encodeURIComponent(String(form.selector ?? `form-${form.index}`))}`
  const readSource = new Set(source.forms.map((form) => form.index))
  if (source.total > source.forms.length) for (const form of discoveredForms.filter((row) => !readSource.has(row.index)))
    notMeasured.push({ ...at, check: 'form', obligationId: formId(form), reason: `source: form ${form.index} was discovered but not read` })
  if (site.total > site.forms.length && !site.forms.some((form) => form.error)) for (const form of discoveredForms)
    notMeasured.push({ ...at, check: 'form', obligationId: formId(form), reason: 'site: forms beyond the cap may change the source-form mapping' })
  const used = new Set()
  for (const src of source.forms) {
    const discovered = discoveredForms.find((row) => row.index === src.index) ?? { index: src.index, selector: `form-${src.index}` }
    const obligationId = formId(discovered)
    const formAt = { ...at, obligationId }
    if (src.error) { notMeasured.push({ ...formAt, check: 'form', control: src.submit?.label || src.action, reason: `source: ${src.error}` }); continue }
    const { best, tie } = pairForm(src, site.forms.map((cand, i) => ({ cand, i })).filter((x) => !used.has(x.i) && !x.cand.error), source.forms)
    const name = src.submit?.label || src.fields.map((f) => f.label).slice(0, 2).join(', ')
    if (!best) {
      const lost = site.forms.find((c) => c.error && c.index === src.index)
      if (lost) { notMeasured.push({ ...formAt, check: 'form', control: name, reason: `site: ${lost.error}` }); continue }
      if (site.forms.some((form) => form.error)) { notMeasured.push({ ...formAt, check: 'form', control: name, reason: 'site: a form error prevents mapping this source form' }); continue }
      findings.push({ kind: 'form-missing', ...formAt, form: name, sourceFields: src.fields.length, detail: 'the source form has no counterpart on the site (no form shares its controls, and none has the same purpose: the same kinds of field in the same place)' })
      continue
    }
    if (tie) { notMeasured.push({ ...formAt, check: 'form', control: name, reason: 'two site forms fit this source form equally: the mapping is ambiguous' }); continue }
    used.add(best.i)
    const mine = best.cand
    if ((src.dupKeys.length || mine.dupKeys.length) && !orderedDuplicates(src, mine)) {
      notMeasured.push({ ...formAt, check: 'form', control: name, reason: `controls with the same label (${[...src.dupKeys, ...mine.dupKeys].slice(0, 3).join(', ')}): the mapping is ambiguous` })
      continue
    }
    if (!mine.submit || !src.submit) { notMeasured.push({ ...formAt, check: 'form', control: name, reason: `${!mine.submit ? 'site' : 'source'}: no submit control found` }); continue }
    examined += src.fields.length + mine.fields.length + 1
    const peers = pairFields(src.fields, mine.fields)
    for (const f of mine.fields) {
      const peer = peers.get(f)
      if (f.required && !(peer?.required)) findings.push({ kind: 'form-extra-required', ...formAt, form: name, control: f.label, type: f.type, source: peer ? 'optional' : 'no such control', site: 'required' })
    }
    for (const f of src.fields) {
      const peer = peers.get(f)
      if (!f.required && !peer && f.shown) findings.push({ kind: 'form-control-missing', ...formAt, form: name, control: f.label, type: f.type, source: 'optional', site: 'no such control' })
      if (f.required && !(peer?.required)) findings.push({ kind: 'form-missing-required', ...formAt, form: name, control: f.label, type: f.type, source: 'required', site: peer ? 'optional' : 'no such control' })
    }
    // the submit, pressed for real with only what the form requires set: the source goes through and the site does not
    for (const [which, a] of [['source', src.attempt], ['site', mine.attempt]]) if (a && a.fired === null) notMeasured.push({ ...formAt, check: 'form', control: name, reason: `${which}: ${a.reason}` })
    for (const o of src.optionals ?? []) if (o.fired === null) notMeasured.push({ ...formAt, check: 'form', control: name, reason: `source: "${o.label}" ticked alone, the submit's outcome is unknown` })
    for (const o of mine.optionals ?? []) if (o.fired === null) notMeasured.push({ ...formAt, check: 'form', control: name, reason: `site: "${o.label}" ticked alone, the submit's outcome is unknown` })
    const srcFires = src.attempt?.fired === true
    const siteBlocked = mine.attempt?.fired === false
    const extraInvalid = (mine.attempt?.invalid ?? []).filter((k) => !(src.attempt?.invalid ?? []).includes(k))
    const mandatory = mine.unlockedByText && src.fields.find((f) => controlKey(f.key) === mine.unlockedByText.key && !f.required)
    if (srcFires && siteBlocked && mandatory) findings.push({ kind: 'form-extra-required', ...formAt, form: name, control: mine.unlockedByText.label, type: 'text', source: 'optional', site: 'required by a script (no required attribute): the submit does not go through while it is empty' })
    else if ((srcFires && siteBlocked) || (mine.state1?.disabled && !src.state1?.disabled)) {
      const by = mine.unlockedBy ? `; ticking "${mine.unlockedBy}" enables it` : ''
      findings.push({ kind: 'form-submit-blocked', ...formAt, form: name, unlockedBy: mine.unlockedBy ?? null, ...(extraInvalid.length ? { invalid: extraInvalid } : {}), detail: `with every field valid and only the required controls set, the site's submit ${mine.state1?.disabled ? 'is disabled' : 'does not go through'}${extraInvalid.length ? ` (the browser flags ${extraInvalid.join(', ')})` : ''}${by}; the source's goes through` })
    }
    // an optional checkbox of the source, ticked alone: if it lets the source submit and not the site, the site made it a prerequisite
    for (const o of src.optionals ?? []) {
      const sf = src.fields.find((f) => controlKey(f.key) === o.key)
      const peer = sf && peers.get(sf)
      const mo = peer && (mine.optionals ?? []).find((x) => x.key === controlKey(peer.key))
      if (!mo) continue // unmapped: unresolved, never a pass or a finding
      if (o.fired === true && mo.fired === false && !(srcFires && siteBlocked)) findings.push({ kind: 'form-submit-blocked', ...formAt, form: name, unlockedBy: null, detail: `with "${o.label}" ticked alone the source's submit goes through and the site's does not` })
    }
    if (mine.state1?.disabled) {
      if (!mine.enabledStyle) notMeasured.push({ ...formAt, check: 'form', control: name, reason: 'the submit stayed disabled whatever was ticked: its enabled look could not be read' })
      else if (!styleDiffers(mine.disabledStyle, mine.enabledStyle)) findings.push({ kind: 'form-disabled-indistinct', ...formAt, form: name, opacity: mine.disabledStyle.opacity, cursor: { disabled: mine.disabledStyle.cursor, enabled: mine.enabledStyle.cursor }, detail: 'the disabled submit looks like the enabled one (opacity, colour, background and border are the same)' })
    }
  }
  if (!source.forms.length) examined = Math.max(examined, 1) // the source page has no form: the page was read, nothing to compare
  return { findings, notMeasured, examined }
}

const interactionCase = (check, route, width, theme = null) => ({ check, route, width, theme })
const sourceObligations = ({ check, route, width, theme, rows }) => rows.map((row, order) => {
  const selector = row.selector ?? `${check}-${row.index ?? order}`
  return { ...interactionCase(check, route, width, theme), id: `${check}:${encodeURIComponent(route)}:${width}:${theme ?? ''}:${encodeURIComponent(String(selector))}`, selector }
})
const attestationFor = ({ check, route, width, theme = null, source, result, rows, complete, measuredIds = [] }) => {
  const obligations = sourceObligations({ check, route, width, theme, rows })
  const discoveredWithoutDrawer = check === 'drawer' && source?.reason === 'no visible menu button'
  const discoveryComplete = Boolean((source?.measured || discoveredWithoutDrawer) && complete)
  const outcomes = obligations.map(({ id }) => {
    const unresolved = !discoveryComplete || !measuredIds.includes(id) || result.notMeasured.some((row) => row.obligationId === id)
    const finding = result.findings.some((row) => row.obligationId === id)
    return { id, outcome: unresolved ? 'notMeasured' : finding ? 'finding' : 'ok' }
  })
  return { obligations, outcomes, discoveries: [{ ...interactionCase(check, route, width, theme), complete: discoveryComplete, count: obligations.length }] }
}

// ─────────────────────────────────────────────── the run
/**
 * @param {object} o
 * @param {import('playwright').Browser} o.browser
 * @param {{id: string, route: string, siteUrl: string, sourceUrl: string|null, status?: number}[]} o.pages  `status`: the error status the contract declares for the page (404)
 * @param {{darkHook?: string, darkRequestHook?: string, lightHook?: string}} [o.siteHooks]
 * @param {{darkHook?: string, darkRequestHook?: string, lightHook?: string}} [o.sourceHooks]
 * @param {string[]} [o.checks]  a subset of CHECKS (default all)
 * @param {number} [o.budgetMs]  one budget for the whole run; what it leaves out is `notMeasured`
 */
export async function measureInteractions({ browser, pages, siteHooks = {}, sourceHooks = {}, checks = CHECKS, budgetMs = 240000, geometry = GEOMETRY_PX, onProgress = null, chromePages = null, headerWidths = HEADER_WIDTHS }) {
  for (const c of checks) if (!CHECKS.includes(c)) throw new Error(`unknown interaction check ${c} (${CHECKS.join(', ')})`)
  if (!Array.isArray(pages) || !pages.length) throw new Error('interaction-parity: no page to measure')
  if (!Array.isArray(headerWidths) || !headerWidths.length || headerWidths.some((w) => !Number.isInteger(w) || w < 240 || w > 3840)) throw new Error('interaction-parity: headerWidths must be a non-empty list of integer widths between 240 and 3840')
  const deadline = Date.now() + budgetMs
  const findings = []
  const notMeasured = []
  let examined = 0
  const obligations = [], outcomes = [], discoveries = []
  const record = (r) => { findings.push(...r.findings); notMeasured.push(...r.notMeasured); examined += r.examined; obligations.push(...(r.obligations ?? [])); outcomes.push(...(r.outcomes ?? [])); discoveries.push(...(r.discoveries ?? [])) }
  // one row per case the run walks (check × route × width × theme): measured only when nothing in it was left unmeasured
  const coverage = []
  const origins = originsOf(pages)
  const guarded = async (route, check, tier, fn) => {
    const page = pages.find((p) => p.route === route)
    const paired = `${check}-comparison`
    const applicability = page?.referenceKind && check !== 'contrast' ? checkApplicability(page.referenceKind, `interaction-${paired}`) : 'applicable'
    const row = { check, route, width: tier.width ?? null, theme: tier.theme ?? null }
    if (Date.now() > deadline) {
      notMeasured.push({ route, check, reason: 'the run ran past its time budget' })
      if ((check === 'drawer' || check === 'form') && applicability !== 'not-applicable') discoveries.push({ ...row, complete: false, count: 0 })
      coverage.push({ ...row, measured: false })
      return
    }
    onProgress?.(`${route} ${check}`)
    if (applicability === 'not-applicable') {
      // A none page still owes its target measurements. The comparison outcome is recorded separately
      // from whether those target measurements ran, so N/A cannot hide an unmeasured target.
      try {
        const before = notMeasured.length
        const r = await fn()
        record(r)
        coverage.push({ ...row, measured: notMeasured.length === before, status: 'not-applicable', reason: noReferenceReason })
      } catch (e) {
        notMeasured.push({ route, check, reason: String(e.message).split('\n')[0].slice(0, 200) })
        coverage.push({ ...row, measured: false })
      }
      return
    }
    const before = notMeasured.length
    try {
      const r = await fn()
      if ((check === 'drawer' || check === 'form') && !r.discoveries && applicability !== 'not-applicable') r.discoveries = [{ ...row, complete: false, count: 0 }]
      record(r)
    } catch (e) {
      notMeasured.push({ route, check, reason: String(e.message).split('\n')[0].slice(0, 200) })
      if (check === 'drawer' || check === 'form') discoveries.push({ ...row, complete: false, count: 0 })
    }
    coverage.push({ ...row, measured: notMeasured.length === before })
  }
  for (const page of pages) {
    // a declared error status (the 404 page, ja-restaurant S-31) is the page as both sides serve it, not a page that failed to load
    const status = Number.isInteger(page.status) ? { status: page.status } : {}
    const site = { url: page.siteUrl, ...status, ...siteHooks }
    const source = page.sourceUrl ? { url: page.sourceUrl, ...status, ...sourceHooks } : null
    const route = page.route
    // the drawer, the tablet nav and the toggle belong to the shared header: read once (chromePages), not on every route
    const chrome = (c) => checks.includes(c) && (!chromePages || chromePages.includes(route))
    const needSource = (check) => {
      if (source) return true
      if (page.referenceKind === 'none' && checkApplicability('none', `interaction-${check}-comparison`) === 'not-applicable') return false
      notMeasured.push({ route, check, reason: 'the page declares no source to compare with' })
      return false
    }
    if (chrome('drawer'))
      for (const width of DRAWER_WIDTHS)
        for (const theme of DRAWER_THEMES)
          await guarded(route, 'drawer', { width, theme }, async () => {
            if (page.referenceKind === 'none') {
              const a = await measureDrawer(browser, site, { width, theme, deadline, withContrast: theme === 'dark' })
              if (!a.measured && a.reason === 'no visible menu button') return { findings: [{ kind: 'drawer-missing', route, width, theme, detail: 'the target has no visible mobile menu button' }], notMeasured: [], examined: 1 }
              return drawerFindings({ route, site: a, source: null, theme })
            }
            if (!needSource('drawer')) return { findings: [], notMeasured: [], examined: 0 }
            const [a, b] = await Promise.all([measureDrawer(browser, site, { width, theme, deadline }), measureDrawer(browser, source, { width, theme, deadline })])
            const result = drawerFindings({ route, site: a, source: b, theme })
            const rows = (b.states ?? []).flatMap((state) => (state.kids ?? []).filter((kid) => kid.shown).map((kid) => ({ index: kid.index, selector: [...(state.path ?? []), kid.index].join('>') })))
            const walked = new Set((b.states ?? []).map((state) => (state.path ?? []).join('>')))
            const beyondDepth = rows.filter((row) => !walked.has(row.selector))
            for (const row of beyondDepth) result.notMeasured.push({ route, width, theme, check: 'drawer', obligationId: `drawer:${encodeURIComponent(route)}:${width}:${theme}:${encodeURIComponent(row.selector)}`, reason: `source parent ${row.selector} is at the maximum drawer depth and was not opened` })
            const measuredIds = rows.filter((row) => walked.has(row.selector) && !(b.states ?? []).find((state) => (state.path ?? []).join('>') === row.selector)?.error).map((row) => `drawer:${encodeURIComponent(route)}:${width}:${theme}:${encodeURIComponent(row.selector)}`)
            const siteRootError = (a.states ?? []).some((state) => !(state.path ?? []).length && state.error)
            return { ...result, ...attestationFor({ check: 'drawer', route, width, theme, source: b, result, rows, measuredIds, complete: !siteRootError && !b.truncated && !beyondDepth.length && !(b.states ?? []).some((state) => state.error) }) }
          })
    if (chrome('contrast')) {
      for (const width of DRAWER_WIDTHS)
        await guarded(route, 'contrast', { width, theme: 'dark' }, async () => drawerFindings({ route, site: await measureDrawer(browser, site, { width, theme: 'dark', withContrast: true, deadline }), source: null, theme: 'dark' }))
      await guarded(route, 'contrast', { width: DESKTOP_WIDTH, theme: 'dark' }, async () => desktopPanelFindings({ route, site: await measureDesktopPanels(browser, site) }))
    }
    if (chrome('touch'))
      for (const width of TABLET_WIDTHS)
        await guarded(route, 'touch', { width }, async () => {
          if (page.referenceKind === 'none') {
            const a = await measureTouch(browser, site, { width, deadline })
            return touchFindings({ route, site: a, source: null, compare: false })
          }
          if (!needSource('touch')) return { findings: [], notMeasured: [], examined: 0 }
          const [a, b] = await Promise.all([measureTouch(browser, site, { width, deadline }), measureTouch(browser, source, { width, deadline })])
          return touchFindings({ route, site: a, source: b })
        })
    if (chrome('toggle'))
      await guarded(route, 'toggle', { width: DESKTOP_WIDTH }, async () => {
        if (page.referenceKind === 'none') return targetToggleFindings({ route, site: await measureToggle(browser, site) })
        if (!needSource('toggle')) return { findings: [], notMeasured: [], examined: 0 }
        const [a, b] = await Promise.all([measureToggle(browser, site), measureToggle(browser, source)])
        return toggleFindings({ route, site: a, source: b })
      })
    if (checks.includes('carousel'))
      await guarded(route, 'carousel', { width: DESKTOP_WIDTH }, async () => {
        if (page.referenceKind === 'none') {
          const siteReading = await measureCarousels(browser, site)
          return {
            findings: siteReading.carousels.flatMap((carousel, i) => [
              ...(carousel.items >= 2 && carousel.dots + carousel.arrows + carousel.thumbs === 0 ? [{ kind: 'carousel-controls-missing', route, width: DESKTOP_WIDTH, carousel: i + 1, items: carousel.items }] : []),
              ...(carousel.unreached > 0 ? [{ kind: 'carousel-unreachable', route, width: DESKTOP_WIDTH, carousel: i + 1, unreached: carousel.unreached, items: carousel.items, detail: 'site controls did not reveal every item' }] : [])
            ]),
            notMeasured: [
              ...(siteReading.measured === false ? [{ route, check: 'carousel', reason: siteReading.reason ?? 'site: carousel states were not measured' }] : []),
              ...siteReading.carousels.filter((c) => c.error).map((c) => ({ route, check: 'carousel', reason: c.error }))
            ],
            examined: siteReading.carousels.reduce((n, c) => n + c.items, 0) || 1
          }
        }
        if (!needSource('carousel')) return { findings: [], notMeasured: [], examined: 0 }
        const [a, b] = await Promise.all([measureCarousels(browser, site), measureCarousels(browser, source)])
        return carouselFindings({ route, site: a, source: b })
      })
    if (checks.includes('form'))
      await guarded(route, 'form', { width: DESKTOP_WIDTH }, async () => {
        if (page.referenceKind === 'none') {
          const siteForms = await measureForms(browser, site)
          return formFindings({ route, site: siteForms, source: null })
        }
        if (!needSource('form')) return { findings: [], notMeasured: [], examined: 0 }
        const [a, b] = await Promise.all([measureForms(browser, site), measureForms(browser, source)])
        const result = formFindings({ route, site: a, source: b })
        const rows = b.discovered ?? b.forms ?? []
        const measuredIds = b.forms.filter((form) => !form.error).map((form) => `form:${encodeURIComponent(route)}:${DESKTOP_WIDTH}::${encodeURIComponent(String(rows.find((row) => row.index === form.index)?.selector ?? `form-${form.index}`))}`)
        return { ...result, ...attestationFor({ check: 'form', route, width: DESKTOP_WIDTH, source: b, result, rows, measuredIds, complete: b.total <= rows.length }) }
      })
    if (checks.includes('header'))
      for (const width of headerWidths)
        await guarded(route, 'header', { width }, async () => {
          if (page.referenceKind === 'none') {
            const reading = await measureHeader(browser, site, { width })
            return reading.header
              ? { findings: [], notMeasured: [], examined: 1 }
              : { findings: [], notMeasured: [{ route, width, check: 'header', reason: 'site: no header found' }], examined: 0 }
          }
          if (!needSource('header')) return { findings: [], notMeasured: [], examined: 0 }
          const [a, b] = await Promise.all([measureHeader(browser, site, { width }), measureHeader(browser, source, { width })])
          return headerFindings({ route, site: a, source: b, geometry })
        })
  }
  return summarizeInteractions({
    pages: pages.map((p) => p.route), checks, findings, notMeasured, examined, coverage, origins, chromePages, headerWidths, obligations, outcomes, discoveries
  })
}

/** The origins a run measured: one site, and the one source its pages compare with (null when none declares a source). */
function originsOf(pages) {
  const origin = (u) => new URL(u).origin
  const sites = [...new Set(pages.map((p) => origin(p.siteUrl)))]
  const sources = [...new Set(pages.filter((p) => p.sourceUrl).map((p) => origin(p.sourceUrl)))]
  if (sites.length > 1 || sources.length > 1) throw new Error(`interaction-parity: the pages span more than one origin (site ${sites.join(', ')}; source ${sources.join(', ') || 'none'})`)
  return { site: sites[0], source: sources[0] ?? null }
}

/** The record visual-qa, the audit CLI and the verdicts read. `blocking`: anything not measured or nothing read; a finding is advisory (interaction-report.mjs). */
export function summarizeInteractions({ pages, checks, findings, notMeasured, examined, coverage = [], origins = { site: null, source: null }, chromePages = null, headerWidths = HEADER_WIDTHS, obligations = [], outcomes = [], discoveries = [] }) {
  const blocking = notMeasured.length > 0 || examined === 0 || coverage.some((c) => !c.measured)
  // `tiers` is what THIS run was configured with: a consumer holds it to the tool's own tiers (interaction-report.mjs)
  return { tool: INTERACTION_TOOL, status: 'run', thresholds: { geometryPx: GEOMETRY_PX, minTargetPx: MIN_TARGET_PX, minContrast: MIN_CONTRAST }, tiers: { ...TIERS, headerWidths: [...headerWidths] }, origins, chromePages, pages, checks, examined, coverage, obligations, outcomes, discoveries, findings, groups: groupInteractionFindings(findings), notMeasured, blocking }
}
