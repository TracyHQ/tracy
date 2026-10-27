#!/usr/bin/env node
// issue67-73-pilot.mjs — replay the Joomla adapter on the two pilot dumps (JA Morgan, T3 · JA Nova, T4) READ-ONLY and
// reconcile the result with the items of issues #67 and #73.
//
//   node scripts/test/issue67-73-pilot.mjs [--morgan <j6-dir>] [--nova <j6-dir>] --out <dir> [--timeout-ms N]
//
// What it does, per pilot: hashes every input file (a link is recorded, never followed); runs from-joomla.mjs twice into
// <out>/<pilot>/pack-1 and pack-2 (each bounded by --timeout-ms); hashes the inputs again (a changed byte is a failure);
// compares the two packs (deterministic: the same JSON but for the wall-clock fields `generatedAt` and `capturedAt`); runs `spec-pack.mjs --validate` on pack-1;
// then checks the pack against a ledger of the issue items: each item is `verified`, `failed`, `gap` (the pilot's dump
// lacks what the item needs — named, with what to re-dump) or `not-exercised` (the pilot has no case of it).
//
// The verdict is FAIL (exit 1) when a pilot is missing or unreadable, a replay fails or times out, an input changed,
// the packs differ, an item failed, or no item was verified at all. It is PARTIAL (exit 0) when everything checked holds but
// gaps remain — an invalid spec-pack (its problems are named), a dump that lacks a table or a capture, an item no route
// exercises. It is never PASS while any of those stands. Nothing is written outside --out/<pilot>/.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { articles, parseJsonColumn } from '../lib/joomla-inventory.mjs'
import { expandAcmNested, AUTHOR_PROFILE_FIELDS, isFeaturedListed, menuShown } from '../ingest/joomla-normalize.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SKILL = join(here, '..', '..')
// PILOT_FROM_JOOMLA_SCRIPT replaces the adapter under test with a stand-in: the test of this harness uses it to make a
// replay hang or touch its input. A real run leaves it unset.
const FROM_JOOMLA = process.env.PILOT_FROM_JOOMLA_SCRIPT || join(SKILL, 'scripts', 'ingest', 'from-joomla.mjs')
const SPEC_PACK = join(SKILL, 'scripts', 'ingest', 'spec-pack.mjs')
const MARKER = '.pilot-replay'
const MAX_FILES = 100000

// ── arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const die = (msg) => {
  console.error(`issue67-73-pilot: ${msg}`)
  process.exit(2)
}
const KNOWN = ['--morgan', '--nova', '--out', '--timeout-ms']
const opts = {}
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i]
  if (!KNOWN.includes(k)) die(`${JSON.stringify(String(k).slice(0, 40))} is not an argument (${KNOWN.join(', ')})`)
  if (Object.hasOwn(opts, k)) die(`${k} is given twice`)
  if (i + 1 >= argv.length || KNOWN.includes(argv[i + 1])) die(`${k} needs a value`)
  opts[k] = argv[i + 1]
}
if (!opts['--out']) die('--out <dir> is required')
if (!opts['--morgan'] && !opts['--nova']) die('name at least one pilot: --morgan <j6-dir> and/or --nova <j6-dir>')
const timeoutMs = opts['--timeout-ms'] === undefined ? 300000 : Number(opts['--timeout-ms'])
if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3600000) die(`--timeout-ms ${JSON.stringify(opts['--timeout-ms'])}: expected a whole number of milliseconds between 1000 and 3600000`)
const OUT = opts['--out']

// ── helpers ──────────────────────────────────────────────────────────────────
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

/** `{ digest, files, bytes, links }` of every regular file below `dir` (paths sorted; a symbolic link is listed, not followed). */
function hashTree(dir) {
  const entries = []
  let bytes = 0
  const links = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name)
      const st = lstatSync(p)
      if (st.isSymbolicLink()) links.push(relative(dir, p))
      else if (st.isDirectory()) walk(p)
      else if (st.isFile()) {
        if (entries.length >= MAX_FILES) throw new Error(`more than ${MAX_FILES} files below ${dir}`)
        entries.push([relative(dir, p), createHash('sha256').update(readFileSync(p)).digest('hex')])
        bytes += st.size
      }
    }
  }
  walk(dir)
  const digest = createHash('sha256').update(JSON.stringify(entries) + JSON.stringify(links)).digest('hex')
  return { digest, files: entries.length, bytes, links, entries: new Map(entries) }
}

/** Run a node script bounded; `{ status, timedOut, stdout, stderr }`. */
function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 256 * 1024 * 1024 })
  return { status: r.status, timedOut: r.error?.code === 'ETIMEDOUT', stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error && r.error.code !== 'ETIMEDOUT' ? r.error.message : null }
}

/** The fields that hold the time of the run: every other byte of a pack is a function of the inputs. */
const WALL_CLOCK = ['generatedAt', 'capturedAt']
/** A pack directory as `Map(relative path → normalised text)`: JSON without the wall-clock fields, other files as they are. */
function packDigest(dir) {
  const out = new Map()
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) {
        const rel = relative(dir, p)
        if (rel === MARKER) continue
        const text = readFileSync(p, 'utf8')
        out.set(rel, rel.endsWith('.json') ? JSON.stringify(JSON.parse(text), (k, v) => (WALL_CLOCK.includes(k) ? undefined : v)) : text)
      }
    }
  }
  walk(dir)
  return out
}

/** A directory this script may write into: absent, or holding its own marker (an earlier replay), which is then removed. */
function freshDir(dir) {
  if (existsSync(dir)) {
    if (!existsSync(join(dir, MARKER))) throw new Error(`${dir} exists and is not an earlier replay of this script; refusing to reuse it`)
    rmSync(dir, { recursive: true, force: true })
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, MARKER), 'replay of issue67-73-pilot.mjs\n')
}

// ── the ledger ───────────────────────────────────────────────────────────────
const ledger = []
const note = (pilot, item, status, detail) => ledger.push({ pilot, item, status, detail })

function pilotChecks(name, dir, pack) {
  const inv = readJson(join(dir, 'inventory.json'))
  const routes = readJson(join(dir, 'render-routes.json'))
  const pm = readJson(join(pack, 'page-map.json'))
  const content = readJson(join(pack, 'content.json'))
  const sections = readJson(join(pack, 'sections.json'))
  const cov = readJson(join(pack, 'adapter-coverage.json'))
  const menus = readJson(join(pack, 'menus.json'))
  const prov = readJson(join(pack, 'provenance.json'))
  const arts = articles(inv)
  const styles = new Map((inv.template_styles ?? []).filter((s) => String(s.client_id) === '0').map((s) => [String(s.id), { row: s, params: parseJsonColumn(s.params) }]))
  const menuById = new Map((inv.menu ?? []).map((m) => [String(m.id), m]))
  const pageOfMenu = (id) => pm.pages.find((p) => String(p.source?.menuId) === String(id))
  const hasT3 = [...styles.values()].some((s) => typeof s.params.mainlayout === 'string' && s.params.mainlayout)
  const item = (id) => cov.items.find((i) => i.id === id)
  const flatMenu = menus.menus.flatMap(function walk(m) { return (m.items ?? m.children ?? []).flatMap((i) => [i, ...walk(i)]) })

  if (hasT3) {
    // #67 — layout INI, mainlayout, component suppression
    const layoutRows = cov.items.filter((i) => i.kind === 'layout')
    const missing = cov.items.filter((i) => i.kind === 'route' && /is not in the capture/.test(i.reason ?? ''))
    const layoutNames = [...new Set(pm.pages.filter((p) => p.source?.menuId != null).map((p) => p.layout))]
    note(name, '#67 layout INI', layoutNames.length > 1 && layoutRows.length && !missing.length ? 'verified' : 'failed', `layouts drawn by the routes: ${layoutNames.join(', ')}; ${layoutRows.length} layout coverage row(s); ${missing.length} route(s) with a layout not in the capture`)
    const perStyle = [...styles].filter(([, s]) => s.params.mainlayout)
    const bad = []
    let checked = 0
    for (const m of inv.menu ?? []) {
      const sid = String(m.template_style_id ?? '0')
      const st = styles.get(sid === '0' ? [...styles].find(([, s]) => String(s.row.home) === '1')?.[0] : sid)
      const p = pageOfMenu(m.id)
      if (!st || !p || !st.params.mainlayout) continue
      checked++
      if (p.layout !== st.params.mainlayout) bad.push(`${m.id}: ${p.layout} ≠ ${st.params.mainlayout}`)
    }
    note(name, '#67 style mainlayout', checked && !bad.length ? 'verified' : checked ? 'failed' : 'not-exercised', checked ? `${checked} route(s) checked against ${perStyle.length} style(s)${bad.length ? `; wrong: ${bad.slice(0, 5).join('; ')}` : ''}` : 'no route')
    const skipCases = []
    for (const m of inv.menu ?? []) {
      const p = pageOfMenu(m.id)
      const sid = String(m.template_style_id ?? '0')
      const st = styles.get(sid === '0' ? [...styles].find(([, s]) => String(s.row.home) === '1')?.[0] : sid)
      if (!p || !st || !Array.isArray(st.params.skip_component_content) || !st.params.skip_component_content.map(String).includes(String(m.id))) continue
      const cp = content.pages.find((x) => x.file === p.file)
      if (cp?.joomla?.articleId) skipCases.push({ id: m.id, ok: (cp.notes ?? []).some((n) => /skip_component_content/.test(n)) && cp.droppedContent != null })
    }
    note(name, '#67 skip_component_content', skipCases.length ? (skipCases.every((c) => c.ok) ? 'verified' : 'failed') : 'not-exercised', skipCases.length ? `${skipCases.length} article route(s) in a style's list; wrong: ${skipCases.filter((c) => !c.ok).map((c) => c.id).join(', ') || 'none'}` : 'no article route is in a skip_component_content list, so no article body is suppressed here')
    let pairs = 0
    const misordered = []
    for (const p of pm.pages) {
      const order = (p.sections ?? []).map((s) => s.position)
      if (order.includes('hero') && order.includes('section-top')) {
        pairs++
        if (order.indexOf('hero') > order.indexOf('section-top')) misordered.push(p.file)
      }
    }
    note(name, '#67 hero before section-top', pairs ? (misordered.length ? 'failed' : 'verified') : 'not-exercised', pairs ? `${pairs} page(s) with both; misordered: ${misordered.join(', ') || 'none'}` : 'no page carries both a hero and a section-top module')
    // #67 — "all pages except" assignments
    const negative = new Map()
    for (const r of inv.modules_menu ?? []) if (Number(r.menuid) < 0) negative.set(String(r.moduleid), [...(negative.get(String(r.moduleid)) ?? []), String(-Number(r.menuid))])
    const violations = []
    let excludedPairs = 0
    for (const [mid, ids] of negative)
      for (const id of ids) {
        const p = pageOfMenu(id)
        if (!p) continue
        excludedPairs++
        if ((p.sections ?? []).some((s) => (s.modules ?? []).map(String).includes(mid))) violations.push(`module ${mid} on menu ${id}`)
      }
    note(name, '#67 negative module assignments', negative.size ? (violations.length ? 'failed' : 'verified') : 'not-exercised', negative.size ? `${negative.size} module(s) with "all except" rows, ${excludedPairs} excluded page(s) checked; placed where excluded: ${violations.join('; ') || 'none'}` : 'no negative modules_menu row')
    // #67 — CSS per route, imports, LESS
    const styleRows = prov.source.template.css.styles ?? []
    const withRules = styleRows.filter((s) => s.rules.length)
    const importGaps = [...new Set(styleRows.flatMap((s) => s.gaps).filter((g) => /@import .* is not followed/.test(g)).map((g) => g.replace(/^.*@import (\S+) is not followed.*$/, '$1')))]
    const grouped = styleRows.filter((s) => s.routeGroups?.length > 1)
    // Verified only when every style the routes use publishes rules and leaves nothing unresolved: a style that publishes none, or
    // only some (a sheet, an import or a page it is served not read; a token or a route group without a value), is named.
    const bare = styleRows.filter((s) => !s.rules.length)
    const partial = styleRows.filter((s) => s.rules.length && (s.gaps.length || s.unresolvedPages?.length || s.unresolvedTokens?.length))
    if (styleRows.length && !bare.length && !partial.length) note(name, '#67 compiled CSS per route', 'verified', `all ${styleRows.length} style(s) publish rules with nothing unresolved; ${grouped.length} style(s) resolved per route group`)
    else note(name, '#67 compiled CSS per route', 'gap', `${bare.length}/${styleRows.length} style(s) publish no design value (${bare.map((s) => `#${s.id}`).join(', ') || 'none'}); ${partial.length} publish some with gaps left (${partial.map((s) => `#${s.id}`).join(', ') || 'none'})${importGaps.length ? `; the compiled sheets @import ${importGaps.join(', ')}, which the capture does not hold — re-dump with joomla-dump.mjs --capture (it fetches imports the copy lacks)` : '; see provenance.json source.template.css gaps'}; ${grouped.length} style(s) have several route groups (values are published only where every group agrees)`)
    const lessNotes = (prov.notes ?? []).filter((n) => /palette from LESS/.test(n))
    const pal = pm.theme.palette.light
    const complete = pal.primary && pal.secondary && pal.body_bg && pal.text
    const lessCaptured = Boolean(prov.source.template.css.less)
    note(name, '#67 LESS palette', complete ? 'verified' : lessCaptured ? 'failed' : 'gap', `palette ${JSON.stringify(pal)}${lessNotes.length ? `; ${lessNotes[0].slice(0, 160)}` : '; from resolved CSS'}${complete || lessCaptured ? '' : '; the capture holds no less/variables.less and the CSS resolves none'}`)
    // #67 — frame params, nested ACM, links, slug, single address
    const framed = [...sections.custom, ...sections.acm].filter((m) => m.frame)
    note(name, '#67 T3Section frame params', framed.length ? (framed.every((m) => m.frame.classes.startsWith('t3-section section')) ? 'verified' : 'failed') : 'not-exercised', `${framed.length} module(s) at a T3Section position carry frame`)
    const nested = (inv.modules ?? []).filter((m) => m.module === 'mod_ja_acm' && expandAcmNested(m.params))
    const empty = nested.filter((m) => !(sections.acm.find((a) => a.id === String(m.id))?.items ?? []).length)
    note(name, '#67 nested ACM groups', nested.length ? (empty.length || JSON.stringify(sections).includes('[object Object]') ? 'failed' : 'verified') : 'not-exercised', `${nested.length} ACM module(s) with a nested group; without items after the read: ${empty.map((m) => m.id).join(', ') || 'none'}; "[object Object]" in sections.json: ${JSON.stringify(sections).includes('[object Object]')}`)
    const sef = JSON.stringify(sections.acm).match(/"index\.php\/[^"]*"/g) ?? []
    note(name, '#67 index.php/ links', sef.length ? 'failed' : 'verified', sef.length ? `left unresolved in ACM fields: ${sef.slice(0, 3).join(', ')}` : 'no index.php/ address is left in the ACM fields')
    const nestedHome = pm.pages.some((p) => /^\/home\//.test(p.path ?? ''))
    const homePage = content.pages.find((p) => p.path === '/' && p.file)
    note(name, '#67 front-page slug', nestedHome ? (homePage?.slug === 'front-page' ? 'verified' : 'failed') : 'not-exercised', nestedHome ? `front page slug ${homePage?.slug}` : 'no /home/… route')
    const single = pm.pages.find((p) => p.file === 'single.html')
    const removeIds = (prov.notes ?? []).some((n) => /sef_ids removes IDs from URLs/.test(n))
    note(name, '#67 article address', single ? (/\/\d+-[^/]+$/.test(single.source.joomlaPath) || removeIds ? 'verified' : 'failed') : 'not-exercised', single ? `single.html reference ${single.source.joomlaPath}` : 'no synthetic single page')
  }

  // dump completeness: what the routes were measured to answer (both pilots)
  const withSheets = routes.filter((r) => Array.isArray(r.stylesheets)).length
  const withStatus = routes.filter((r) => r.status !== undefined).length
  if (hasT3) {
    const noSheets = routes.filter((r) => !Array.isArray(r.stylesheets))
    const hasCapture = existsSync(join(dir, 'capture'))
    note(name, '#67 dump: capture and route stylesheets', hasCapture && !noSheets.length ? 'verified' : 'gap', `capture/ ${hasCapture ? 'present' : 'absent'}; ${withSheets}/${routes.length} route(s) record stylesheets${noSheets.length ? `; none recorded for ${noSheets.slice(0, 6).map((r) => r.path ?? r.id).join(', ')}${noSheets.length > 6 ? ` and ${noSheets.length - 6} more` : ''} — re-dump with --capture` : ''}`)
  }

  if (!hasT3) {
    // #73 — S-22 {loadmoduleid}
    const loaders = arts.filter((a) => /\{loadmoduleid\s/.test(a.introtext + a.fulltext))
    const printed = [...content.pages, ...content.posts].filter((p) => /\{loadmoduleid/.test(typeof p.content === 'string' ? p.content : JSON.stringify(p.content)))
    // A marker that stays on a page (no such module, no position) must be reported: its article's coverage row is critical.
    const unreported = printed.filter((p) => !item(`article:${p.joomla?.articleId}`)?.critical)
    // Each marker's emitted placement: an ACM module a slot at its position (a page names it in its sections, a post has the slot block), a custom module its content, an unpublished one nothing.
    const modById = new Map((inv.modules ?? []).map((m) => [String(m.id), m]))
    const targetOf = (id) => content.pages.find((p) => String(p.joomla?.articleId) === String(id)) ?? content.posts.find((p) => String(p.joomla?.articleId) === String(id))
    const placement = { checked: 0, wrong: [], noTarget: [], dropped: [], seeder: [] }
    for (const a of loaders) {
      const target = targetOf(a.id)
      const pmPage = target?.file ? pm.pages.find((p) => p.file === target.file) : null
      if (!target || (target.file && !pmPage)) {
        placement.noTarget.push(a.id)
        continue
      }
      const text = typeof target.content === 'string' ? target.content : JSON.stringify(target.content)
      // The body around every marker must itself be emitted: each whole piece of visible text between the markers is looked for in the
      // target's content (or its sections' html); a piece that is not found there whole is dropped, so a body cut in the middle is a gap.
      const plain = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
      const probes = (a.introtext + ' ' + a.fulltext).split(/\{[^}]*\}/).map(plain).filter(Boolean)
      const pieces = (c) => (typeof c === 'string' ? [c] : Array.isArray(c) ? c.flatMap((x) => [x?.markup, x?.html].filter((y) => typeof y === 'string')) : [])
      const emitted = plain([...pieces(target.content), ...pieces(target.contentMarkup), ...(pmPage?.sections ?? []).flatMap((x) => pieces([x]))].join(' '))
      if (probes.some((x) => !emitted.includes(x))) {
        placement.dropped.push(a.id)
        continue
      }
      for (const [, raw] of (a.introtext + a.fulltext).matchAll(/\{loadmoduleid\s+([^}]*)\}/g)) {
        const id = raw.trim()
        const m = /^\d+$/.test(id) ? modById.get(id) : null
        const tag = `article ${a.id} module ${id}`
        placement.checked++
        if (!m) {
          if (!text.includes(`{loadmoduleid ${raw}}`)) placement.wrong.push(`${tag}: an unknown module's marker is gone`)
        } else if (String(m.published) !== '1') {
          if (text.includes(`{loadmoduleid ${raw}}`)) placement.wrong.push(`${tag}: unpublished, marker still printed`)
        } else if (m.module === 'mod_custom') {
          const words = String(m.content ?? '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).slice(0, 3).join(' ')
          if (words && !text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').includes(words)) placement.wrong.push(`${tag}: custom content not inline`)
        } else if (m.position) {
          const slotted = target.file ? (pmPage?.sections ?? []).some((s) => s.via === 'loadmoduleid' && (s.modules ?? []).map(String).includes(id)) : text.includes(`"position":"${m.position}","modules":["${id}"]`)
          if (!slotted) placement.wrong.push(`${tag}: no slot at "${m.position}"`)
          // A post's body goes through seed.mjs as it is: the slot block is not expanded there, so the module is not shown to be drawn until the rendered post is checked.
          else if (!target.file) placement.seeder.push(tag)
        } else if (!text.includes(`{loadmoduleid ${raw}}`)) placement.wrong.push(`${tag}: no position, marker gone`)
      }
    }
    const s22 = !loaders.length ? 'not-exercised' : unreported.length || placement.wrong.length ? 'failed' : placement.checked && !placement.noTarget.length && !placement.dropped.length && !placement.seeder.length ? 'verified' : 'gap'
    note(name, '#73 S-22 {loadmoduleid}', s22, loaders.length ? `${loaders.length} article(s) hold the marker; ${printed.length} page(s) still print one (${printed.length - unreported.length} of them reported critical in the coverage); not reported: ${unreported.map((p) => p.file ?? p.path).join(', ') || 'none'}; placement checked for ${placement.checked} marker(s)${placement.noTarget.length ? `; no emitted page or post to check for article(s) ${placement.noTarget.join(', ')}` : ''}${placement.dropped.length ? `; the body around the marker is not emitted for article(s) ${placement.dropped.join(', ')}` : ''}${placement.seeder.length ? `; ${placement.seeder.length} post slot(s) (${placement.seeder.slice(0, 3).join(', ')}) depend on seed.mjs, which does not expand a slot block in a post body: gap until the rendered post shows the module` : ''}; wrong: ${placement.wrong.slice(0, 5).join('; ') || 'none'}` : 'no article holds the marker')
    // S-24
    const both = arts.filter((a) => a.images.intro && a.images.full)
    const postByArticle = new Map(content.posts.map((p) => [p.joomla.articleId, p]))
    const pageByArticle = new Map(content.pages.filter((p) => p.joomla?.articleId).map((p) => [p.joomla.articleId, p]))
    const wrong = both.filter((a) => (postByArticle.get(a.id) ?? pageByArticle.get(a.id))?.featuredImage !== a.images.full && (postByArticle.has(a.id) || pageByArticle.has(a.id)))
    note(name, '#73 S-24 image_fulltext', both.length ? (wrong.length ? 'failed' : 'verified') : 'not-exercised', `${both.length} article(s) with both images; featured image is not the full-text one for: ${wrong.map((a) => a.id).join(', ') || 'none'}`)
    // S-25
    const featuredRoutes = pm.pages.filter((p) => p.source?.option === 'com_content' && p.source?.view === 'featured' && p.path !== '/')
    const expected = arts.filter((a) => isFeaturedListed({ featured: a.featured, state: a.state })).length
    const featuredBad = featuredRoutes.filter((p) => content.pages.find((x) => x.file === p.file)?.featured?.count !== expected)
    note(name, '#73 S-25 featured view', featuredRoutes.length ? (featuredBad.length ? 'failed' : 'verified') : 'not-exercised', featuredRoutes.length ? `${featuredRoutes.length} route(s); ${expected} featured article(s); wrong: ${featuredBad.map((p) => p.file).join(', ') || 'none'}` : 'no featured view outside the front page')
    // S-30
    const hidden = (inv.menu ?? []).filter((m) => String(m.published) === '1' && String(m.client_id) === '0' && !menuShown(parseJsonColumn(m.params)))
    const shown = hidden.filter((m) => flatMenu.find((i) => String(i.id) === String(m.id))?.published !== false)
    note(name, '#73 S-30 menu_show 0', hidden.length ? (shown.length ? 'failed' : 'verified') : 'not-exercised', hidden.length ? `${hidden.length} hidden item(s); still published in menus.json: ${shown.map((m) => m.id).join(', ') || 'none'}` : 'no menu_show 0 item')
    // S-33
    const profileRows = (inv.user_profiles ?? []).filter((r) => Object.values(AUTHOR_PROFILE_FIELDS).includes(r.profile_key))
    if (!profileRows.length) note(name, '#73 S-33 author profiles', 'gap', `inventory.json user_profiles holds ${(inv.user_profiles ?? []).length} row(s) and none of ${Object.values(AUTHOR_PROFILE_FIELDS).join(', ')}: the dump predates those keys — re-dump with the current joomla-dump.mjs`)
    else {
      const wantJob = new Set(profileRows.filter((r) => r.profile_key === AUTHOR_PROFILE_FIELDS.jobTitle).map((r) => String(r.user_id)))
      const got = content.authors.filter((a) => a.jobTitle).map((a) => a.joomlaUserId)
      const lacking = content.authors.filter((a) => wantJob.has(a.joomlaUserId) && !a.jobTitle)
      note(name, '#73 S-33 author profiles', lacking.length ? 'failed' : 'verified', `${profileRows.length} profile row(s); authors with a job title ${got.length}; lacking: ${lacking.map((a) => a.joomlaUserId).join(', ') || 'none'}`)
    }
    // S-35
    if (!Array.isArray(inv.contact_details)) note(name, '#73 S-35 contact details', 'gap', 'inventory.json has no contact_details table: the dump predates it — re-dump with the current joomla-dump.mjs')
    else {
      const contactPages = content.pages.filter((p) => p.view === 'page-contact')
      note(name, '#73 S-35 contact details', contactPages.length && contactPages.every((p) => p.contact) ? 'verified' : 'failed', `${inv.contact_details.length} contact row(s); contact page(s) with the record: ${contactPages.filter((p) => p.contact).length}/${contactPages.length}`)
    }
    // S-41
    if (!withStatus) note(name, '#73 S-41 route status', 'gap', `render-routes.json records no status/location for its ${routes.length} route(s): the dump was made without --capture — the source's 303 for /user-profile is not declared`)
    else {
      const bad = routes.filter((r) => r.status !== undefined && r.status !== 200 && pm.pages.find((p) => String(p.source?.menuId) === String(r.id))?.status !== r.status)
      note(name, '#73 S-41 route status', bad.length ? 'failed' : 'verified', `${withStatus} route(s) answer other than 200; not declared by the page-map: ${bad.map((r) => r.path).join(', ') || 'none'}`)
    }
    // S-45
    const headed = (inv.menu ?? []).filter((m) => {
      const p = parseJsonColumn(m.params)
      return String(p.show_page_heading) === '1' && typeof p.page_heading === 'string' && p.page_heading.trim() && pageOfMenu(m.id) && !/view=article/.test(m.link ?? '')
    })
    const headBad = headed.filter((m) => pageOfMenu(m.id).title !== parseJsonColumn(m.params).page_heading.trim())
    note(name, '#73 S-45 page heading', headed.length ? (headBad.length ? 'failed' : 'verified') : 'not-exercised', headed.length ? `${headed.length} listing/page route(s) with a page_heading; title differs for: ${headBad.map((m) => m.id).join(', ') || 'none'}` : 'no menu item with show_page_heading and a page_heading')
    note(name, '#73 S-11 template-computed values', 'gap', 'the spec-pack has no place to declare counters, image side, slide direction or a video link (content-contract.mjs belongs to the visual branch); the adapter cannot state them')
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
const failures = []
const gaps = []
const summary = []
mkdirSync(OUT, { recursive: true })

for (const [flag, name] of [['--morgan', 'morgan'], ['--nova', 'nova']]) {
  const dir = opts[flag]
  if (!dir) continue
  const base = join(OUT, name)
  try {
    for (const f of ['inventory.json', 'render-routes.json']) {
      if (!existsSync(join(dir, f))) throw new Error(`${join(dir, f)} is missing`)
      readJson(join(dir, f))
    }
    const before = hashTree(dir)
    const dump = existsSync(join(dir, 'dump.json')) ? readJson(join(dir, 'dump.json')) : {}
    const siteUrl = typeof dump.siteUrl === 'string' ? dump.siteUrl : 'http://127.0.0.1:8217'
    mkdirSync(base, { recursive: true })
    const packs = []
    for (const n of [1, 2]) {
      const out = join(base, `pack-${n}`)
      freshDir(out)
      const r = run(FROM_JOOMLA, [dir, '--out', join(out, 'pack'), '--site-url', siteUrl])
      writeFileSync(join(base, `replay-${n}.log`), `${r.stdout.split('\n').slice(-40).join('\n')}\n${r.stderr.slice(-2000)}\nexit ${r.status}${r.timedOut ? ' (timed out)' : ''}\n`)
      if (r.timedOut) throw new Error(`replay ${n} did not finish within ${timeoutMs} ms`)
      if (r.error) throw new Error(`replay ${n}: ${r.error}`)
      // from-joomla exits 1 when the spec-pack does not validate; the files are written all the same, and the gate is reported below
      if (!existsSync(join(out, 'pack', 'page-map.json'))) throw new Error(`replay ${n} produced no pack (exit ${r.status}): ${r.stderr.split('\n').find(Boolean) ?? r.stdout.split('\n').find(Boolean) ?? ''}`)
      packs.push(join(out, 'pack'))
    }
    const after = hashTree(dir)
    if (after.digest !== before.digest) {
      const changed = [...new Set([...before.entries.keys(), ...after.entries.keys()])].filter((k) => before.entries.get(k) !== after.entries.get(k))
      throw new Error(`the pilot's input changed during the replay (${changed.length} file(s), first: ${changed[0]})`)
    }
    const [a, b] = packs.map(packDigest)
    const differ = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k))
    if (differ.length) throw new Error(`the two replays differ in ${differ.length} file(s): ${differ.slice(0, 5).join(', ')}`)
    const v = run(SPEC_PACK, ['--validate', packs[0]])
    const problems = `${v.stdout}\n${v.stderr}`.split('\n').filter((l) => /^\s*-\s/.test(l)).map((l) => l.trim())
    writeFileSync(join(base, 'validate.log'), `${v.stdout}\n${v.stderr}\nexit ${v.status}\n`)
    if (v.timedOut) throw new Error('spec-pack --validate timed out')
    if (v.status !== 0) note(name, 'spec-pack validation', 'gap', `INVALID — ${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}; a pack that does not validate is not a pass`)
    else note(name, 'spec-pack validation', 'verified', 'valid')
    pilotChecks(name, dir, packs[0])
    summary.push({ pilot: name, input: { files: before.files, bytes: before.bytes, digest: before.digest, links: before.links.length }, deterministic: true, unchanged: true })
  } catch (e) {
    failures.push(`${name}: ${e.message}`)
    summary.push({ pilot: name, error: e.message })
  }
}

const failed = ledger.filter((l) => l.status === 'failed')
const verified = ledger.filter((l) => l.status === 'verified')
for (const l of ledger.filter((x) => x.status === 'gap' || x.status === 'not-exercised')) gaps.push(l)
if (!failures.length && !verified.length) failures.push('no ledger item was verified: nothing was checked')
for (const l of failed) failures.push(`${l.pilot}: ${l.item}: ${l.detail}`)
const verdict = failures.length ? 'FAIL' : gaps.length ? 'PARTIAL' : 'PASS'

writeFileSync(join(OUT, 'ledger.json'), `${JSON.stringify({ verdict, summary, ledger, failures }, null, 2)}\n`)
const lines = [`# issue #67 / #73 pilot replay — ${verdict}`, '', '| pilot | item | status | detail |', '|---|---|---|---|', ...ledger.map((l) => `| ${l.pilot} | ${l.item} | ${l.status} | ${String(l.detail).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 400)} |`), '']
if (failures.length) lines.push('## failures', '', ...failures.map((f) => `- ${f}`), '')
writeFileSync(join(OUT, 'REPORT.md'), lines.join('\n'))
console.log(lines.join('\n'))
console.log(`verdict ${verdict}: ${verified.length} verified, ${failed.length} failed, ${gaps.length} gap/not-exercised${failures.length ? `, ${failures.length} failure(s)` : ''}`)
process.exit(failures.length ? 1 : 0)
