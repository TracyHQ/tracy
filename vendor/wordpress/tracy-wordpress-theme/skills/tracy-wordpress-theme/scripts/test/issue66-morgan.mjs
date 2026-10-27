#!/usr/bin/env node
// Issue #66 — a read-only census of a source and its port with the production selector-profile code:
// what each side shows to the visual tools under the source framework's profile, beside what the T4
// lists (the tools before #66) read on the same page. Written for the JA Morgan pilot (T3 source on
// :8281, the WordPress port on :8282); it reads pages and writes one JSON report, nothing else.
//
//   node scripts/test/issue66-morgan.mjs --source <origin> --site <origin> --provenance <spec>/provenance.json
//        --routes /,/home/home-style-1 --widths 1440,390 --timeout-ms 180000 --out <report.json>
//
// For each route × width and side, from ONE loaded page: the headings layout-boxes measures
// (measureInPage with measureOf(profile)), the page identity the design contract probes (design-probe
// captureDesign `identityMatches`), the chrome elements the profile names and the text runs content
// parity keeps (extractRuns with the profile's chrome), and the header triggers the open-state axis
// finds (inPageMenuTriggers with the profile's toggles) — each with its T4 reading (`legacy`). Then each
// side's triggers are opened for real (menu-open captureSide: hover, else a click; pictures go to a
// temporary directory removed at the end) and counted opened / not opened.
//
// A trigger with no words that is not the side's sole drawer (T3's icon-only Bootstrap 3 burger) has no
// key to be found again by; the census then names it by the attribute its panel reference is read from
// (`[data-target=".t3-navbar-collapse"]`), a declared selector as the contract would write it. Every
// trigger the census finds is opened or is a problem: a trigger left out is never a clean cell.
//
// `--timeout-ms` bounds each route × width side; a side past it is cancelled — its captures aborted,
// its page closed — and awaited before the next one starts, so nothing it began writes after it; a
// side that does not stop ends the run. The run ends after the last cell. The report is written whole (a temporary file renamed into place); an `--out` that is a
// symlink, a directory, a FIFO or in a directory that does not exist is refused before anything is
// measured. EXIT 0 when every cell loaded on both sides and the source shows headings, an identity and
// triggers the profile reads, and the site headings; 1 otherwise (the report names each problem); 2 on
// a usage error or an input it cannot read.
import { lstatSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withBrowser, withPage } from '../lib/browser.mjs'
import { freezeMotion } from '../lib/motion.mjs'
import { PROFILES, readProvenanceFile, selectorsRecord } from '../lib/framework-selectors.mjs'
import { CHROME, extractRuns } from '../lib/parity-extract.mjs'
import { MEASURE, measureInPage, measureOf } from '../visual/layout-boxes.mjs'
import { MENU_TRIGGER_CAP, captureSide, inPageMenuTriggers, menuGroups } from '../visual/menu-open.mjs'
import { RUN_LAUNCH_ARGS, settle } from '../visual/visual-qa.mjs'
import { captureDesign } from '../design-probe.mjs'

/** A side that did not stop once cancelled: the run cannot go on beside it. */
export class CellStuck extends Error {}

/**
 * Run `work(signal, track)` for at most `ms`. Past it, the work is cancelled — `signal` aborted, every
 * page it `track`ed closed — and AWAITED before the timeout is thrown, so a capture it began cannot
 * write after the caller moved on; a work that has not stopped `graceMs` later is `CellStuck`.
 */
export async function runCell(work, ms, what, { graceMs = 30000 } = {}) {
  const ac = new AbortController()
  const pages = new Set()
  const task = Promise.resolve().then(() => work(ac.signal, (p) => pages.add(p)))
  let timer
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} ran past ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([task, late])
  } catch (e) {
    ac.abort()
    await Promise.all([...pages].map((p) => Promise.resolve().then(() => p.close()).catch(() => {})))
    let grace
    const stopped = await Promise.race([task.then(() => true, () => true), new Promise((r) => (grace = setTimeout(() => r(false), graceMs)))])
    clearTimeout(grace)
    if (!stopped) throw new CellStuck(`${what} did not stop within ${graceMs} ms of being cancelled`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** The declared selector naming a trigger by its panel reference attribute (`kind`), or null. */
export const refSelector = (kind, value) => (/^(aria-controls|href|data-[a-z0-9-]+)$/.test(kind ?? '') && typeof value === 'string' && value ? `[${kind}=${JSON.stringify(value)}]` : null)

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) await main()

async function main() {
  const USAGE = 'usage: issue66-morgan.mjs --source <origin> --site <origin> --provenance <provenance.json> --routes /a,/b --widths 1440,390 --timeout-ms <ms per route × width> --out <report.json>'
  const fail = (why) => {
    console.error(`issue66-morgan: ${why}`)
    console.error(USAGE)
    process.exit(2)
  }
  const argv = process.argv.slice(2)
  const opt = (name) => {
    const i = argv.indexOf(name)
    if (i < 0) return fail(`${name} is required`)
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) return fail(`${name} needs a value`)
    return v
  }
  const origin = (name) => {
    const v = opt(name)
    let u
    try {
      u = new URL(v)
    } catch {
      return fail(`${name} ${v} is not an http(s) origin`)
    }
    if (!/^https?:$/.test(u.protocol) || u.search || u.hash) fail(`${name} ${v} is not an http(s) origin`)
    return v.replace(/\/+$/, '')
  }
  const source = origin('--source')
  const site = origin('--site')
  const routes = opt('--routes').split(',')
  for (const r of routes) if (!r.startsWith('/') || r.startsWith('//') || /[\s?#\\]/.test(r)) fail(`--routes: route ${JSON.stringify(r)} does not start with / or is not a plain path`)
  const widths = opt('--widths').split(',').map((w) => (/^\d+$/.test(w) ? Number(w) : NaN))
  if (!widths.length || widths.some((w) => !(w >= 200 && w <= 4000))) fail(`--widths ${opt('--widths')}: widths are whole px from 200 to 4000, comma-separated`)
  const timeoutMs = /^\d+$/.test(opt('--timeout-ms')) ? Number(opt('--timeout-ms')) : NaN
  if (!(timeoutMs >= 1000 && timeoutMs <= 3600000)) fail(`--timeout-ms ${opt('--timeout-ms')}: a whole number of ms from 1000 to 3600000`)
  const provFile = opt('--provenance')
  let profiled
  try {
    profiled = readProvenanceFile(provFile)
  } catch (e) {
    fail(`--provenance ${e.message}`)
  }
  const out = path.resolve(opt('--out'))
  /** The report's destination may be a new file or a regular file, never a link, a directory or a FIFO. */
  const checkOut = () => {
    let st = null
    try {
      st = lstatSync(out)
    } catch (e) {
      if (e.code !== 'ENOENT') fail(`--out ${out}: ${e.message}`)
    }
    if (st?.isSymbolicLink()) fail(`--out ${out} is a symlink; the report is never written through one`)
    if (st && !st.isFile()) fail(`--out ${out} exists and is not a regular file`)
    let dir = null
    try {
      dir = statSync(path.dirname(out))
    } catch {}
    if (!dir?.isDirectory()) fail(`--out ${out}: its directory does not exist`)
  }
  checkOut()

  const profile = profiled.profile
  const identityRequest = (identity) => ({ contractId: 'issue66-census', contractHash: 'none', page: 'census', variant: 'census', identity, theme: { selector: 'html', attribute: 'data-theme', darkValue: 'dark', lightValue: 'light' }, tokens: [], rules: [], coverage: [] })
  const shots = mkdtempSync(path.join(tmpdir(), 'issue66-census-'))
  const problems = []
  const cells = []
  const first = (e) => String(e?.message ?? e).split('\n')[0].slice(0, 200)

  /** One side of one cell, from one loaded page; then its triggers opened for real. */
  async function side(browser, url, width, name, signal, track) {
    return withPage(browser, { viewport: { width, height: width < 768 ? 844 : 900 } }, async (page) => {
      track(page)
      const load = async () => {
        signal.throwIfAborted()
        const res = await page.goto(url, { waitUntil: 'networkidle', timeout: Math.min(90000, timeoutMs) })
        const status = res?.status() ?? 0
        if (status < 200 || status > 299) throw new Error(`${url} answered ${status || 'nothing'}`)
        await settle(page)
        await page.evaluate(() => scrollTo(0, 0))
        return status
      }
      let status
      try {
        status = await load()
      } catch (e) {
        throw new Error(`did not load (${first(e)})`)
      }
      await freezeMotion(page)
      const heads = await page.evaluate(measureInPage, measureOf(profile))
      const legacyHeads = await page.evaluate(measureInPage, MEASURE)
      const identity = (await page.evaluate(captureDesign, identityRequest(profile.identity))).identityMatches
      const legacyIdentity = (await page.evaluate(captureDesign, identityRequest(PROFILES.T4.identity))).identityMatches
      const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel)
      const html = await page.content()
      const runs = extractRuns(html, { chrome: profile.chrome }).runs.length
      const legacyRuns = extractRuns(html, { chrome: CHROME }).runs.length
      const chrome = { profile: await count(profile.chrome), legacy: await count(CHROME) }
      const legacyTriggers = await page.evaluate(inPageMenuTriggers, MENU_TRIGGER_CAP)
      signal.throwIfAborted()
      // A trigger no key finds again (no words, not the sole drawer) is named by its panel reference.
      const found = await page.evaluate(inPageMenuTriggers, [MENU_TRIGGER_CAP, [], profile.menu.toggles])
      const keyed = new Set([...menuGroups(found, { structural: true }).groups].filter(([k, l]) => k && l.length === 1).map(([, l]) => l[0]))
      const selectors = []
      for (const t of found.triggers) {
        if (keyed.has(t) || t.problem) continue
        const value = await page.evaluate(([i, a]) => document.querySelector(`[data-vqa-menu="${i}"]`)?.getAttribute(a) ?? null, [t.i, t.kind])
        const sel = refSelector(t.kind, value)
        if (sel) selectors.push(sel)
      }
      // the profile's census last: its tags are the ones the captures below act on
      const take = () => page.evaluate(inPageMenuTriggers, [MENU_TRIGGER_CAP, selectors, profile.menu.toggles])
      const census = await take()
      const groups = menuGroups(census, { declared: selectors.length, structural: true }).groups
      const wanted = new Map([...groups].filter(([k, l]) => k && l.length === 1 && !l[0].problem).map(([k, l]) => [k, l[0]]))
      const caps = await captureSide(page, wanted, {
        reload: async () => {
          await load()
          return take()
        },
        out: shots,
        relOf: (k) => `${name}-${width}-${Buffer.from(k).toString('hex').slice(0, 40)}.png`,
        props: ['font-size', 'color'],
        budgetMs: Math.max(5000, Math.floor(timeoutMs / 4)),
        declared: selectors.length,
        signal
      })
      signal.throwIfAborted()
      const opened = [...caps].filter(([, c]) => c.opened)
      const taken = new Set(wanted.values())
      // 🔒 every trigger found is opened or named: one no capture was asked for is never omitted
      const omitted = census.triggers.filter((t) => !taken.has(t)).map((t) => `${t.label || `(no words, ${t.kind})`}: ${t.problem ?? 'no key or selector finds it again; not opened'}`)
      return {
        url,
        status,
        headings: heads.length,
        headingWords: heads.map((h) => `${h.tag} ${h.words.slice(0, 60)}`),
        identity,
        chrome,
        runs: { profile: runs, legacy: legacyRuns },
        triggers: { headers: census.headers, count: census.triggers.length, kinds: census.triggers.map((t) => t.kind), labels: census.triggers.map((t) => t.label), drawers: census.triggers.filter((t) => t.drawer).length, problems: census.triggers.filter((t) => t.problem).map((t) => `${t.label || t.tag}: ${t.problem}`), openAtRest: census.openAtRest, ...(selectors.length ? { namedBy: selectors } : {}) },
        opened: { count: opened.length, keys: opened.map(([k, c]) => `${k} (${c.via})`), notOpened: [...caps].filter(([, c]) => !c.opened).map(([k, c]) => `${k}: ${c.reason}`), omitted },
        legacy: { headings: legacyHeads.length, identity: legacyIdentity, triggers: { count: legacyTriggers.triggers.length, kinds: legacyTriggers.triggers.map((t) => t.kind) } }
      }
    })
  }

  let exit = 0
  try {
    await withBrowser(
      async (browser) => {
        for (const route of routes)
          for (const width of widths) {
            const cell = { route, width }
            for (const [name, base] of [['source', source], ['site', site]]) {
              try {
                cell[name] = await runCell((signal, track) => side(browser, `${base}${route}`, width, name, signal, track), timeoutMs, `${name} ${route} at ${width}`)
              } catch (e) {
                cell[name] = { error: first(e) }
                problems.push(`${name} ${route} at ${width}: ${first(e)}`)
                // a side that would not stop may still write: the run ends here, the browser with it
                if (e instanceof CellStuck) {
                  cells.push(cell)
                  throw e
                }
              }
            }
            const s = cell.source
            const t = cell.site
            if (s && !s.error) {
              if (!s.headings) problems.push(`source ${route} at ${width}: no heading the ${profile.id} profile reads`)
              if (!s.identity) problems.push(`source ${route} at ${width}: no element matches the page identity ${profile.identity}`)
              if (!s.triggers.count) problems.push(`source ${route} at ${width}: no header trigger the ${profile.id} profile reads`)
            }
            if (t && !t.error && !t.headings) problems.push(`site ${route} at ${width}: no heading the ${profile.id} profile reads`)
            for (const [name, x] of [['source', s], ['site', t]]) {
              if (!x || x.error) continue
              // a header the census does not read is no header without menus (menu-open measureMenus)
              if (!x.triggers.headers) problems.push(`${name} ${route} at ${width}: no header the menu census reads`)
              for (const why of [...x.opened.notOpened, ...x.opened.omitted]) problems.push(`${name} ${route} at ${width}: trigger not opened — ${why}`)
            }
            cell.legacy = { source: s?.legacy ?? null, site: t?.legacy ?? null }
            cell.menus = { source: s?.opened ? { triggers: s.triggers.count, opened: s.opened.count, notOpened: s.opened.notOpened.length + s.opened.omitted.length } : null, site: t?.opened ? { triggers: t.triggers.count, opened: t.opened.count, notOpened: t.opened.notOpened.length + t.opened.omitted.length } : null }
            cells.push(cell)
            console.log(`${route} @${width}: source ${s?.error ? `ERROR ${s.error}` : `headings ${s.headings} (T4 ${s.legacy.headings}) · identity ${s.identity} (main ${s.legacy.identity}) · chrome ${s.chrome.profile} (T4 ${s.chrome.legacy}) · runs ${s.runs.profile} (T4 ${s.runs.legacy}) · triggers ${s.triggers.count} [${s.triggers.kinds.join(', ')}] (T4 ${s.legacy.triggers.count}) · opened ${s.opened.count}/${s.triggers.count}`} | site ${t?.error ? `ERROR ${t.error}` : `headings ${t.headings} · triggers ${t.triggers.count} · opened ${t.opened.count}/${t.triggers.count}`}`)
          }
      },
      { launchOptions: { args: [...RUN_LAUNCH_ARGS] } }
    )
  } catch (e) {
    if (!(e instanceof CellStuck)) problems.push(`the browser: ${first(e)}`)
  } finally {
    rmSync(shots, { recursive: true, force: true })
  }
  if (problems.length) exit = 1
  const report = { at: new Date().toISOString(), tool: 'scripts/test/issue66-morgan.mjs', source, site, provenance: provFile, selectors: selectorsRecord(profiled), widths, timeoutMs, ok: !problems.length, problems, routes: cells }
  checkOut()
  const tmp = `${out}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
    renameSync(tmp, out)
  } catch (e) {
    rmSync(tmp, { force: true })
    console.error(`issue66-morgan: the report could not be written: ${first(e)}`)
    exit = 1
  }
  for (const p of problems) console.error(`issue66-morgan: ${p}`)
  console.log(`issue66-morgan: ${report.ok ? 'ok' : `${problems.length} problem(s)`} — profile ${report.selectors.profile} — ${out}`)
  process.exit(exit)
}
