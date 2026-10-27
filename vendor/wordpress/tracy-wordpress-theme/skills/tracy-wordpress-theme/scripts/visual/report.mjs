// The evidence a visual-qa run leaves behind, in the EmDash shapes so the same lenses, merge and
// receipt logic read it: visual.json (the machine record), VISUAL.md (the per-component table a
// reviewer reads), index.json (every picture with who consumes it), notes/machine.{json,md} (the
// machine's findings as todos), clusters.{json,md} (the findings grouped by probable root cause,
// cluster.mjs — what the fixing agent reads first). Pure: the runner hands in data, this writes files.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { planMarkdown } from './fast-gate.mjs'
import { MACHINE, readEvidence, shotProjection } from './evidence.mjs'
import { intrinsicBlocking, summaryClaimOf } from './intrinsic-report.mjs'
import { advisoryMarkdown, interactionAdvisory, interactionAttestationProblems, interactionLine, interactionNotes, interactionSummaryOf } from './interaction-report.mjs'
import { clusterDigest, clusterFindings, writeClusters } from './cluster.mjs'
import { SOURCE_DEPENDENT_CHECKS, checkApplicability } from './applicability.mjs'

/** What to do about each machine finding, in WordPress terms. */
const HINT = Object.freeze({
  'rule-mismatch': "set the property on the rule's selector (assets/css of the overlay, theme.overlay.json, tokens.css)",
  'rule-no-visible-match': 'the page lost the component, or the selector rotted — check the template/pattern',
  'unclassified-element': 'add a design.rule or a parity pair for this role (pattern metadata.name + class)',
  'parity-mismatch': 'match the source value on the site side (pattern CSS / block-fill), or fix the pair if it compares wrong elements',
  'parity-not-measured': 'one side lacks the element: the pattern dropped it (coverage gate) or the source role did not resolve',
  'parity-body': "set the body's text rendering to the source's (-webkit-font-smoothing / text-rendering on body in the overlay CSS): it changes the weight of every line on every page",
  'parity-body-not-measured': 'a side did not report the body property: the page has no body, or the browser does not compute it — measure it before calling the pair equal',
  'container-width': "the container is not the source's width at this breakpoint: give the site container the source's max-width steps (overlay CSS), or accept with a cited decision",
  'container-not-measured': "the container probe read no width on one side: fix the selector in review.config.json \"containers\" (or the page it is measured on) — an unmeasured width is not a pass",
  'image-missing': 'the seeder did not import the picture: check --images / --images-local and the spec image table',
  'source-not-rendered':
    'the SOURCE was not showing these pictures, so the number the site is judged against is too low: re-render the reference, or check the picture is reachable from where the source is served',
  'source-theme-not-applied':
    "the source did not stay dark with its hook, so the axis has no dark source: check contract.source.darkHook / --source-dark-hook (or the request cookie) against the source's own theme script",
  'source-shot-missing':
    'the lenses of this stage have no source picture in its mode: re-run once the source answers, or fix the source reference / dark hook the contract names — never compare against the other mode',
  'image-placeholder': 'give the section its picture in the spec; placeholders are defects',
  'identity-mismatch': 'the route served another page: seed report path vs contract path, or Polylang served the wrong language',
  'scan:off-system': 'use a token from tokens.css (or extend the palette on purpose)',
  'scan:white-surface': 'give the surface a dark-mode preset (surface/surface-warm) — inline literals map by role in the seeder',
  'scan:dark-on-dark': 'text colour must come from a text-role preset (fg, muted, meta)',
  'scan:contrast': "raise the token's contrast, or accept with a cited decision (G-number)",
  'scan:bright-border': 'border colour from border/border-soft presets',
  'scan:doubled-seam': "drop the last row's border or the container's",
  'scan:hover-jump': 'hover must not change box size: keep border/padding constant across states',
  'mega-menu': 'pointer travel to the panel must keep it open; Escape returns focus (review/mega-hover.mjs)',
  'menu-open-layout':
    "the open header panel is not the source's box: give the panel (and its card) the source's width, position and height in the overlay CSS / the mega-menu block — compare the two pictures in index.json menuShots",
  'menu-open-parity':
    "a word or icon of the open header panel differs from the source's (missing, moved, another size or style): fix the panel's markup (parts/header.html, blocks/mega-menu) or its CSS",
  'menu-open-unmatched':
    'a header trigger says words the other side has nowhere: the label of the menu item / mega-menu block differs from the source, or the item is missing — or accept with a cited decision',
  'menu-open-not-measured':
    'the header panel was not captured open (a source page that cannot open it and no other page of the contract that does, no panel named, several triggers with these words, did not open for hover or click, did not hold still, or the picture failed): fix the trigger or the panel; an unmeasured panel is not a pass',
  'drawer-missing': 'the source opens a drawer at 390 px and the site shows none: ship the menu button and the drawer (parts/header.html, navigation block responsive container)',
  'drawer-overlap': 'an opened drawer submenu is painted over a sibling row: give the submenu its place in the flow (accordion) or slide the parent level out (drill-down), as the source does',
  'drawer-model': "the drawer opens its submenus differently from the source (drill-down with a back row vs accordion): build the source's model",
  'menu-contrast': 'text of an opened menu panel is under 4.5:1 against what it is painted on in dark mode: restate the panel surface and link colours with the dark presets',
  'touch-not-opened': 'a submenu the source opens by tap does not open by tap on the site at this tablet width: give it a real button the tap reaches (aria-expanded), not hover or a link that navigates',
  'touch-target-small': 'the submenu control is under 24×24 CSS px: enlarge its box (padding), not only the icon',
  'touch-target-obstructed': 'a tap at the control centre hits another element (a parent link, an overlay): raise the control or remove the cover',
  'toggle-missing': 'the source has a dark toggle and the site shows none on this page',
  'toggle-first-click': 'the first click on the toggle does not change the effective theme (light OS, empty storage), as the source does: initial state and click sequence must agree',
  'carousel-missing': 'the source has a carousel with controls and the site shows none: rebuild the carousel (or ask the owner, never stack the images)',
  'carousel-controls-missing': 'the carousel has no dots, arrows or thumbnails: the source has them',
  'carousel-unreachable': 'an item of the carousel cannot be reached with its controls: every item needs a dot, an arrow step or a thumbnail',
  'header-height': "the header band is not the source's height at this width: measure both and match",
  'header-control-position': "a header control is not where the source has it (logo, primary button, toggle, search, hamburger): match its centre",
  'header-control-missing': 'the source header has this control and the site header does not',
  'header-control-extra': 'the site header has a control the source header does not',
  'nav-current-missing': "the source marks the current section in the primary nav and the site does not: add the current-item style",
  'nav-current-wrong': 'the primary nav marks another link as current than the source does',
  'theme-toggle': 'the toggle must change the surface and persist (cookie tracy_theme) across reload',
  'horizontal-overflow': 'an element wider than the viewport at this width: fixed widths, images, tables without overflow-x',
  'theme-not-applied': 'the theme hook (data-theme / cookie) did not resolve on this page',
  'examined-too-few': 'the page rendered almost nothing: status, template, or a fatal in debug.log',
  'font-not-loaded': 'the family the CSS asks for did not draw the glyphs: ship the webfont (assets/fonts + @font-face, OFL) or declare the fallback as the design'
})

const MACHINE_WHAT_LIMIT = 300
const MEASURED_FIELDS = ['properties', 'deltas']
const IDENTITY_FIELDS = ['element', 'trigger', 'subject', 'selector', 'text']

function machineWhat(detail) {
  const original = JSON.stringify(detail)
  if (original.length <= MACHINE_WHAT_LIMIT) return original

  const ordered = {}
  const identity = new Set(IDENTITY_FIELDS)
  for (const key of MEASURED_FIELDS) if (key in detail) ordered[key] = detail[key]
  for (const [key, value] of Object.entries(detail))
    if (!MEASURED_FIELDS.includes(key) && !identity.has(key)) ordered[key] = value
  for (const key of IDENTITY_FIELDS) if (key in detail) ordered[key] = detail[key]

  const properties = Array.isArray(detail.properties) ? detail.properties : null
  const deltas = Array.isArray(detail.deltas) ? detail.deltas : null
  const row = { ...ordered }

  const visitStrings = (value, fn) => {
    if (typeof value === 'string') return fn(value)
    if (Array.isArray(value)) return value.map((entry) => visitStrings(entry, fn))
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visitStrings(entry, fn)]))
    return value
  }
  const shortenGroup = (keys, preserveShortest = false) => {
    const strings = []
    const collect = (value) => {
      if (typeof value === 'string') strings.push(value)
      else if (Array.isArray(value)) value.forEach(collect)
      else if (value && typeof value === 'object') Object.values(value).forEach(collect)
    }
    for (const key of keys) collect(row[key])
    const maxLength = Math.max(0, ...strings.map((value) => value.length))
    const minLength = Math.min(40, ...strings.map((value) => value.length))
    const candidateAt = (keep) => {
      const limit = preserveShortest ? Math.max(40, keep) : keep
      const candidate = { ...row }
      for (const key of keys) if (key in candidate)
        candidate[key] = visitStrings(candidate[key], (value) => value.length > limit ? `${value.slice(0, Math.max(0, limit - 1))}…` : value)
      return candidate
    }
    let low = preserveShortest ? minLength : 0
    let high = maxLength
    let best = candidateAt(low)
    while (low <= high) {
      const keep = Math.floor((low + high) / 2)
      const candidate = candidateAt(keep)
      if (JSON.stringify(candidate).length <= MACHINE_WHAT_LIMIT) {
        best = candidate
        low = keep + 1
      } else high = keep - 1
    }
    Object.assign(row, best)
  }

  shortenGroup(IDENTITY_FIELDS.filter((key) => key in row))
  if (JSON.stringify(row).length <= MACHINE_WHAT_LIMIT) return JSON.stringify(row)

  shortenGroup(Object.keys(row).filter((key) => !MEASURED_FIELDS.includes(key) && !IDENTITY_FIELDS.includes(key)), true)
  if (JSON.stringify(row).length <= MACHINE_WHAT_LIMIT) return JSON.stringify(row)

  const total = Math.max(properties?.length ?? 0, deltas?.length ?? 0)
  for (let keep = total; keep >= 0; keep--) {
    const candidate = { ...row }
    if (properties) candidate.properties = properties.slice(0, keep)
    if (deltas) candidate.deltas = deltas.slice(0, keep)
    const dropped = Math.max((properties?.length ?? 0) - keep, (deltas?.length ?? 0) - keep)
    if (dropped > 0) candidate.more = dropped
    if (JSON.stringify(candidate).length <= MACHINE_WHAT_LIMIT) return JSON.stringify(candidate)
  }
  return JSON.stringify(row)
}

/**
 * What a fix addresses: (kind, element, rule). The axis is deliberately excluded — the same defect
 * on light and dark is ONE thing to fix. This was written inline inside `summarize`; the triage
 * table below needs the same key, and two copies of a grouping rule drift without anything saying
 * so, which is how `summary.distinct` came to disagree with what a reader counted by hand.
 */
export const distinctKey = (f) => `${f.kind}|${f.element ?? ''}|${f.rule ?? ''}`

export function summarize(pages, stageReports) {
  const summary = { pages: pages.length, axes: 0, components: 0, findings: 0, distinct: 0, unclassified: 0, accepted: 0, sourceMatched: 0, reused: 0, retried: 0, retryRecovered: 0, retriedAxes: [], motionUnhandled: [], failedPages: [], notApplicable: Object.fromEntries(SOURCE_DEPENDENT_CHECKS.map((check) => [check, 0])) }
  // `findings` is a sum over axes and on its own misleads towards panic: one wrong header link is
  // pages × axes rows. `distinct` counts (kind, element, rule) triples — what a fix addresses; the axis
  // is deliberately excluded (the same defect on light and dark is one thing to fix).
  const distinct = new Set()
  for (const p of pages)
    for (const a of p.axes) {
      summary.axes++
      for (const row of a.notApplicable ?? []) if (checkApplicability(p.referenceKind, row.check) === row.status) summary.notApplicable[row.check] = (summary.notApplicable[row.check] ?? 0) + 1
      summary.components += a.components?.length ?? 0
      summary.findings += a.findings?.length ?? 0
      for (const f of a.findings ?? []) distinct.add(distinctKey(f))
      // Unclassified elements that survived the exceptions: `coverage.unclassified` is the raw list,
      // and an accepted one (a cited decision) is not a defect — counting the raw list kept the
      // exit code at 1 after every finding was accepted (15/09).
      summary.unclassified += (a.findings ?? []).filter((f) => f.kind === 'unclassified-element').length
      summary.accepted += a.accepted?.length ?? 0
      // Dark-scan rows the source draws itself in the same mode (SOURCE): no finding, never hidden.
      for (const sc of Object.values(a.scans ?? {})) summary.sourceMatched += Array.isArray(sc?.sourceShared) ? sc.sourceShared.length : Array.isArray(sc?.sourceMatched) ? sc.sourceMatched.length : 0
      if (a.measured === 'reused') summary.reused++
      // An axis measured again in this run after axis-error (visual-qa `--axis-retries`). Reused
      // axes are not counted: their retry happened in the run they came from.
      else if (a.retry) {
        summary.retried++
        if (a.retry.recovered) summary.retryRecovered++
        summary.retriedAxes.push(`${p.id} ${a.variant}`)
      }
      // A carousel settle() could not stop (lib/motion.mjs `unhandled`): its pictures may differ
      // between two runs of an unchanged page. Named, not a finding.
      for (const [side, m] of [['site', a.motion], ['source', a.sourceMotion]])
        if (m?.unhandled || m?.error) summary.motionUnhandled.push(`${p.id} ${a.variant} ${side}${m.error ? ` (freeze failed: ${m.error})` : ` (${m.unhandled} carousel(s))`}`)
    }
  summary.distinct = distinct.size
  // Header menus captured open (menu-open.mjs): what was paired and captured, what was not.
  const menus = { axes: 0, pairs: 0, captured: 0, unmatched: 0, notMeasured: 0, sourceStatic: 0, notApplicable: 0, unmeasuredAxes: [] }
  for (const p of pages)
    for (const a of p.axes) {
      if (!a.menus) continue
      if (a.menus.targetOnly === true && checkApplicability(p.referenceKind, 'menu-comparison') === 'not-applicable') {
        menus.notApplicable++
        if (a.menus.measured === true) menus.axes++
        else menus.unmeasuredAxes.push(`${p.id} ${a.variant}: ${a.menus.reason ?? 'target menu capture failed'}`)
        menus.notMeasured += a.findings?.filter((f) => f.kind === 'menu-open-not-measured').length ?? 0
        continue
      }
      if (a.menus.measured === false) {
        menus.unmeasuredAxes.push(`${p.id} ${a.variant}: ${a.menus.reason}`)
        continue
      }
      menus.axes++
      menus.pairs += a.menus.pairs ?? 0
      menus.captured += (a.menus.menus ?? []).filter((m) => m.site?.screenshot && m.source?.screenshot).length
      menus.unmatched += a.menus.unmatched?.length ?? 0
      menus.sourceStatic += a.menus.sourceStatic?.length ?? 0
      menus.notMeasured += (a.findings ?? []).filter((f) => f.kind === 'menu-open-not-measured').length
    }
  summary.menus = menus
  summary.failedPages = pages.filter((p) => p.axes.some((a) => a.findings?.length)).map((p) => p.id)
  // Exceptions taken by default while Lee has not answered: counted apart, never hidden in `accepted`.
  summary.pendingLee = pages.reduce((n, p) => n + p.axes.reduce((m, a) => m + (a.accepted ?? []).filter((f) => /\(default\)/.test(f.exception?.decision ?? '')).length, 0), 0)
  summary.stages = Object.fromEntries(stageReports.map((s) => [s.id, s.status]))
  return summary
}

/**
 * 🔒 TRIAGE FIRST — a finding list is one row per SIGHTING, not per problem. Measured 18/09 on the
 * sibling EmDash base template: 1,302 findings were 17 groups, and 9 of those 17 were the same root
 * cause (selectors named in the page's parity list that nothing measures). Collapsing them by hand
 * is work a reader should not be doing before they can decide anything.
 *
 * Accepted findings are grouped beside the open ones ON PURPOSE. They are the discrepancies a cited
 * exception is excusing, and a reader who never sees them cannot tell whether the citation still
 * excuses what it was written for.
 */
function triageSection(pages, summary) {
  const group = (rows) => {
    const g = new Map()
    for (const { page, axis, finding } of rows) {
      const k = distinctKey(finding)
      if (!g.has(k)) g.set(k, { finding, pages: new Set(), axes: new Set(), n: 0 })
      const e = g.get(k)
      e.n++
      e.pages.add(page)
      e.axes.add(axis)
    }
    return [...g.values()].sort((a, b) => b.n - a.n)
  }
  const rowsOf = (pick) =>
    pages.flatMap((p) => p.axes.flatMap((a) => (pick(a) ?? []).map((f) => ({ page: p.id, axis: a.variant, finding: f }))))
  const open = group(rowsOf((a) => a.findings))
  const accepted = group(rowsOf((a) => a.accepted))
  // 🔒 THE TAIL, AND THE SECOND HALF OF THE KEY. A CSS path differs at its END, so keeping the
  // first 60 characters printed two different elements as one identical-looking row (the component
  // table has always used `slice(-60)` for exactly this reason). And the row must carry whatever
  // `distinctKey` separates groups BY, or it prints rows a reader cannot tell apart — the same
  // failure as the corpus it replaced, in fewer bytes.
  //
  // ⚠ `distinctKey` here is (kind, element, rule) and does NOT include `property`, while the
  // EmDash sibling's does. On the EmDash base run of 18/09 that difference is 408 accepted
  // `parity-mismatch` records landing in FOUR groups (colour, background-colour, font-size,
  // letter-spacing) there and ONE here. To be exact about the cost of changing it: `summary.distinct`
  // is a number this gate REPORTS, not one it decides on — stage status and the exit code are
  // computed from findings, unclassified and staleness, so a different key would move a headline
  // number and no verdict. It is left alone anyway, because this producer keeps the differing
  // properties in `deltas[]` rather than in a top-level `property`, so copying the EmDash key here
  // would not reproduce EmDash semantics — it would need reading `deltas`, which is a change to what
  // the grouping MEANS. Recorded, not changed.
  // Truncating to 60 characters can make two DIFFERENT groups render as one identical row: a CSS
  // path usually differs at its tail, but two siblings can differ at an ancestor instead
  // (`.left > … > h2` and `.right > … > h2`). Neither end is safe on its own, so the truncation is
  // a default: where it would collide, the full element is printed. (kind, where, what) IS the
  // grouping key, so printing all three in full cannot leave two rows alike.
  //
  // ⚠ `what` is thin here on purpose. This producer puts the differing properties in `deltas[]`,
  // not in a top-level `property`, so a real parity mismatch prints `—`. Naming them would mean
  // reading `deltas` — worth doing, but it is a change to what this table MEANS, not to its
  // layout, so it is recorded here rather than slipped in beside a size fix.
  const whatOf = (f) => f.rule ?? f.property ?? f.reason ?? '—'
  const line = (e, where) =>
    `| ${e.finding.kind} | \`${where}\` | ${whatOf(e.finding)} | ${e.n} | ${e.pages.size} | ${[...e.axes].sort().join(', ')} |`
  const lines = (groups) => {
    const cells = groups.map((e) => ({ e, kind: e.finding.kind, full: String(e.finding.element ?? ''), what: whatOf(e.finding) }))
    const seen = new Set()
    const collisions = new Set()
    for (const c of cells) {
      const k = `${c.kind}|${c.full.slice(-60)}|${c.what}`
      if (seen.has(k)) collisions.add(k)
      seen.add(k)
    }
    return cells.map((c) => line(c.e, collisions.has(`${c.kind}|${c.full.slice(-60)}|${c.what}`) ? c.full : c.full.slice(-60)))
  }
  const table = (groups) => [
    '| Kind | Where | What | Sightings | Pages | Axes |',
    '|---|---|---|---:|---:|---|',
    ...(groups.length ? lines(groups) : ['| — | none | — | 0 | 0 | — |'])
  ]
  return [
    '',
    '## Triage — every finding grouped by element (the clusters above, row by row)',
    '',
    `${summary.findings} finding(s) in ${open.length} group(s); ${accepted.length} group(s) of accepted exception.`,
    '',
    ...table(open),
    '',
    '### Accepted by a cited exception (still discrepancies — check the citation still fits)',
    '',
    ...table(accepted)
  ]
}

const CLEAN_STATUS = new Set(['ok', 'PASS'])
const CLUSTERS_HEADING = '## Clusters — probable root causes; fix these first'

export function visualMarkdown({ site, at, summary, stageReports, pages, identity = null, scope = null, clusters = null, selectors = null }) {
  const md = [
    `# Visual QA — ${site} — ${at}`,
    '',
    ...(scope ? [`Scope: **${scope.kind}**${scope.kind === 'fast-gate' ? ' — see FAST-GATE-PLAN.md; a fast gate never passes the visual gate' : scope.kind === 'targeted-debug' ? ` — pages ${(scope.pages ?? []).join(', ')}; a subset never passes the visual gate` : ''}`, ''] : []),
    ...(identity
      ? [
          `Contract: \`${identity.contractPath}\` (${identity.canonical ? 'canonical' : 'NOT canonical'}) · contract ${identity.contractHash} · source ${identity.sourceHash ?? '—'} · artifact ${identity.artifactHash ?? '—'} · captured ${identity.capturedAt}${identity.stale?.length ? `\n\n**STALE** — ${identity.stale.join('; ')} — this run cannot pass a gate` : ''}`,
          ''
        ]
      : []),
    // the source framework's selector profile (lib/framework-selectors.mjs, #66), and its gap when the
    // framework has none of its own or was not declared
    ...(selectors ? [`Selector profile: **${selectors.profile}**${selectors.framework ? ` (source framework ${selectors.framework})` : ''}${selectors.gap ? ` — gap: ${selectors.gap}` : ''}`, ''] : []),
    `Pages ${summary.pages} · axes ${summary.axes} · components ${summary.components} · unclassified ${summary.unclassified} · findings ${summary.findings} (${summary.distinct ?? 0} distinct)${summary.pendingLee ? ` · **accepted by default — pending Lee: ${summary.pendingLee}**` : ''}`,
    ...(Object.values(summary.notApplicable ?? {}).some((n) => n > 0) ? ['', `Source checks not applicable: ${Object.entries(summary.notApplicable).filter(([, n]) => n > 0).map(([check, n]) => `${check} ${n}`).join(' · ')}`] : []),
    ...(summary.intrinsic ? ['', `Intrinsic mobile probe (#65): ${summary.intrinsic.status} · site-only ${summary.intrinsic.siteOnly} · shared with the source ${summary.intrinsic.shared} · unreadable ${summary.intrinsic.errors}${summary.intrinsic.blocking ? ' — **blocks the run** (notes/machine.md)' : ''}`] : []),
    ...(summary.interaction ? ['', interactionLine(summary.interaction)] : []),
    ...(summary.retried
      ? ['', `Retried in this run after axis-error: ${summary.retried} axis(es), ${summary.retryRecovered} recovered — ${summary.retriedAxes.join(', ')}`]
      : []),
    ...(summary.motionUnhandled?.length
      ? ['', `Motion not held still (a carousel no library API stops — pictures may differ between runs): ${summary.motionUnhandled.join(', ')}`]
      : []),
    // Clusters BEFORE triage: triage groups sightings by (kind, element, rule) and so keeps every
    // element's words apart — 140 card titles of one colour were 140 rows (JA Vega M4c dd-1). A
    // cluster is one probable fix; triage and the tables below stay for reading members.
    '',
    CLUSTERS_HEADING,
    '',
    ...clusterDigest(clusters ?? clusterFindings(pages)),
    ...triageSection(pages, summary),
    '',
    'Method: stages in order (light desktop → light responsive → dark desktop → dark responsive), a stage only after the previous one is clean; per axis A screenshot (site + source) · B interaction (hover jump, mega travel, Escape/focus, theme toggle) · C computed px (rules, coverage, two-sided parity with the rendered source). Pictures per layout (visual.shots, with consumers) are listed in index.json; each QA lens writes notes/<lens>.md, the machine writes notes/machine.md; `visual-review` passes on machine-checked conditions, not a signature.',
    '',
    '| Stage | Status | Pages | Axes | Reused | Findings |',
    '|---|---|---:|---:|---:|---:|',
    ...stageReports.map((s) => `| ${s.id} | ${s.status}${s.reason ? ` (${s.reason})` : ''} | ${s.pages} | ${s.axes} | ${s.reused} | ${s.findings} |`),
    '',
    '| Page | Axis | Component | Status | Deltas |',
    '|---|---|---|---|---|'
  ]
  let passRows = 0
  for (const p of pages)
    for (const a of p.axes)
      for (const c of a.components ?? [])
        {
          // 🔒 THE COMPONENT TABLE PRINTS EXCEPTIONS, NOT THE CORPUS. Measured 18/09 on the sibling
          // EmDash base template: all 12,898 rows were `PASS` with no deltas, and printing them made
          // that digest 1.79 MB — of which 85% said only "this was checked and it matched". A digest
          // that large is not read, and a digest nobody reads is the same failure as a gate nobody
          // can fail. The rows stay in visual.json, which is where --reuse and any run-to-run
          // comparison read them from; what changes is only what a READER is handed first.
          // ⚠ THIS PRODUCER WRITES `ok`, NOT `PASS` (visual-qa.mjs: `deltas.length ? 'FAIL' : 'ok'`).
          // The first version of this check matched `PASS` alone, so it filtered NOTHING here and
          // the digest reported "0 further component(s)" while printing its whole corpus — a filter
          // that quietly stops filtering. Both spellings are accepted; anything else is PRINTED, so
          // a status added later arrives in front of a reader instead of vanishing.
          if (CLEAN_STATUS.has(c.status) && !(c.deltas ?? []).length) passRows++
          else md.push(`| ${p.id} | ${a.variant} | ${c.rule} · \`${String(c.element ?? '').slice(-60)}\` | ${c.status} | ${(c.deltas ?? []).map((d) => `${d.property}: ${d.expected} → ${d.observed}`).join('; ') || '—'} |`)
        }
  // The count is kept so "0 exceptions of 12,898" cannot be mistaken for "nothing was measured".
  md.push('', `${passRows} further component(s) matched with no delta and are not printed here; every one of them is in \`visual.json\` under \`pages[].axes[].components\`.`)
  md.push('', '## Accepted exceptions (cited decisions)', '')
  let any = false
  for (const p of pages)
    for (const a of p.axes)
      for (const f of a.accepted ?? []) {
        any = true
        md.push(`- \`${p.id}\` ${a.variant} — ${f.kind} ${f.element ?? f.rule ?? ''}: ${f.exception.reason} (${f.exception.decision})`)
      }
  if (!any) md.push('none')
  // 🔒 WHAT THE SOURCE DRAWS ITSELF IS SHOWN, NOT DROPPED. A dark scan row whose counterpart on the
  // source — read in dark, at the same width — draws the same value is no finding of the port (#27
  // item 2), and it is a defect of the SOURCE if it is one at all: listed here with the source element
  // named, so a reader can still decide it with Lee. A source the scan refused to compare is named too.
  md.push('', `## Set apart as the source's own [SOURCE] (${summary.sourceMatched ?? 0})`, '')
  let own = false
  for (const p of pages)
    for (const a of p.axes)
      for (const [name, sc] of Object.entries(a.scans ?? {})) {
        if (Array.isArray(sc?.sourceShared)) {
          for (const row of sc.sourceShared) {
            own = true
            const site = row.site?.value ?? JSON.stringify(row.site ?? {})
            const source = row.source?.value ?? JSON.stringify(row.source ?? {})
            const pairing = row.siteComponent ? `${row.siteComponent} ↔ ${row.sourceComponent ?? row.component}` : row.component
            const extras = row.site?.contrast !== undefined || row.source?.contrast !== undefined
              ? ` (contrast ${row.site?.contrast ?? '?'} / ${row.source?.contrast ?? '?'})`
              : row.site?.width !== undefined || row.source?.width !== undefined
                ? ` (width ${row.site?.width ?? '?'}px / ${row.source?.width ?? '?'}px; style ${row.site?.style ?? '?'} / ${row.source?.style ?? '?'})`
                : ''
            md.push(`- \`${p.id}\` ${a.variant} — scan:${name} source-shared ${pairing}: site ${site}, source ${source}${extras} (${row.by})`)
          }
        } else {
          for (const line of Array.isArray(sc?.sourceMatched) ? sc.sourceMatched : []) {
            own = true
            md.push(`- \`${p.id}\` ${a.variant} — scan:${name} ${String(line).slice(0, 300)}`)
          }
        }
        if (sc?.sourceRefused) {
          own = true
          md.push(`- \`${p.id}\` ${a.variant} — scan:${name} source not compared: ${sc.sourceRefused}`)
        }
      }
  if (!own) md.push('none')
  md.push('', ...menusSection(pages, summary))
  md.push('', '## Findings', '')
  for (const p of pages)
    for (const a of p.axes)
      for (const f of a.findings ?? [])
        md.push(`- \`${p.id}\` ${a.variant} — **${f.kind}** ${JSON.stringify(Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'kind'))).slice(0, 300)}`)
  if (!summary.findings) md.push('none')
  return md.join('\n') + '\n'
}

/**
 * The header menus of each axis as captured open (menu-open.mjs): the census of both sides, and per
 * trigger how each side opened, its picture and the findings — or why it was not measured.
 */
function menusSection(pages, summary) {
  const m = summary.menus ?? {}
  const md = ['## Header menus captured open', '', `Axes ${m.axes ?? 0} · pairs ${m.pairs ?? 0} · captured on both sides ${m.captured ?? 0} · unmatched ${m.unmatched ?? 0} · not measured ${m.notMeasured ?? 0} · comparison not applicable ${m.notApplicable ?? 0} · source static ${m.sourceStatic ?? 0}`]
  let any = false
  for (const p of pages)
    for (const a of p.axes) {
      const r = a.menus
      if (!r) continue
      any = true
      md.push('')
      if (r.measured === false) {
        md.push(r.targetOnly
          ? `- \`${p.id}\` ${a.variant} — target menu capture not measured: ${r.reason}; source comparison not applicable (${r.comparison?.reason ?? 'missing reason'})`
          : `- \`${p.id}\` ${a.variant} — not measured: ${r.reason}`)
        continue
      }
      const census = (c) => (c ? `${c.headers} header(s), ${c.triggers} trigger(s)${c.overCap ? `, ${c.overCap} past the cap` : ''}${c.openAtRest ? `, ${c.openAtRest} open at rest` : ''}` : 'not read')
      md.push(r.targetOnly
        ? `- \`${p.id}\` ${a.variant} — target menus ${census(r.site)}; source comparison not applicable (${r.comparison?.reason ?? 'missing reason'})`
        : `- \`${p.id}\` ${a.variant} — site ${census(r.site)}; source ${census(r.source)}`)
      const side = (x) => (x?.static ? `static (${x.reason})` : x?.opened ? `${x.via}${x.screenshot ? ` \`${x.screenshot}\`` : ''}${x.clipped ? ' (clipped to the viewport)' : ''}` : `not opened: ${x?.reason ?? '—'}`)
      for (const row of r.menus ?? []) md.push(r.targetOnly
        ? `  - "${row.trigger}": target ${side(row.site)} · source comparison not applicable · findings ${row.findings}${row.truncated ? ` (+${row.truncated} not kept)` : ''}`
        : `  - "${row.trigger}": site ${side(row.site)} · source ${side(row.source)} · findings ${row.findings}${row.truncated ? ` (+${row.truncated} not kept)` : ''}`)
      for (const f of r.sourceStatic ?? []) md.push(`  - "${f.trigger}": source static — ${f.toggle}, hover ${f.outcome.hover}, click ${f.outcome.click}, ${f.scripts} script(s); ${f.covered ? `source opens on \`${f.covered.page}\` ${f.covered.variant}` : 'no other page opens it'}`)
      for (const u of r.unmatched ?? []) md.push(`  - ${u.label ? `"${u.label}"` : '(no words)'}: on the ${u.side} only — ${u.reason}`)
      for (const n of r.notMeasured ?? []) md.push(`  - ${n.label ? `"${n.label}"` : '(no words)'} on the ${n.side}: not measured — ${n.reason}`)
    }
  if (!any) md.push('', 'none — no axis of this run is a layout representative')
  return md
}

function shotIndex({ at, site, sourceSite, pages, out, stageOf }) {
  return { at, site, sourceSite: sourceSite ?? null, ...shotProjection({ pages, out, stageOf }) }
}

export function machineNotes(pages, stageOf) {
  const machine = []
  for (const p of pages)
    for (const a of p.axes)
      for (const f of a.findings ?? []) {
        const { kind, ...detail } = f
        machine.push({
          id: `M${machine.length + 1}`,
          lens: `machine:${kind}`,
          page: p.id,
          layout: a.layout ?? null,
          axis: a.variant,
          stage: a.stage ?? stageOf(a.variant) ?? null,
          what: machineWhat(detail),
          fix: HINT[kind] ?? 'see the finding',
          verify: `rerun this stage: ${kind} gone on ${p.id}/${a.variant}`,
          status: 'open'
        })
      }
  return machine
}

function machineMarkdown(machine, at, clusters = null) {
  return [
    `# Machine notes — ${at}`,
    '',
    'Each row is a todo in the shared shape (references/visual-qa.md). The coding agent fills Fix; the machine closes its own rows when the finding is gone on the rerun.',
    '',
    // The rows below are sightings; read the clusters first and open the rows on demand.
    ...(clusters ? ['## Clusters first', '', ...clusterDigest(clusters, { link: '../clusters.md' }), '', '## Rows (one per sighting — the members of the clusters above)', ''] : []),
    '| Id | Lens | Page | Axis | What | Fix hint | Verify | Status | Fix |',
    '|---|---|---|---|---|---|---|---|---|',
    ...machine.map((m) => `| ${m.id} | ${m.lens} | ${m.page} | ${m.axis} | ${m.what.replace(/\|/g, '\\|')} | ${m.fix} | ${m.verify} | ${m.status} | |`),
    machine.length ? '' : 'none',
    ''
  ].join('\n')
}

/** What of the intrinsic mobile probe (#65) blocks a run — defined with the evidence model (intrinsic-report.mjs). */
export { intrinsicBlocking }

/** The exit code of a visual-qa run: 1 for any finding, unclassified element, stale identity, blocking intrinsic defect or interaction probe that failed or left a state unmeasured (its findings are advisory and never count). */
export const exitCodeOf = (summary) => (summary.findings || summary.unclassified || summary.stale || summary.intrinsic?.blocking || summary.interaction?.blocking ? 1 : 0)

/** The machine rows of the intrinsic probe: one per site-only defect / unreadable reading, one for a failed probe. */
export function intrinsicNotes(i, start = 0) {
  if (!i) return []
  const rows = []
  const add = (lens, page, axis, detail, fix) =>
    rows.push({ id: `M${start + rows.length + 1}`, lens, page, layout: null, axis, stage: null, what: JSON.stringify(detail).slice(0, 300), fix, verify: `rerun visual-qa: ${lens} gone on ${page}/${axis}`, status: 'open' })
  if (i.status !== 'run') add('machine:intrinsic-probe', '-', '-', { status: i.status, reason: i.reason }, 'the probe is part of every run: fix the error or give --spec (its page-map.json), then rerun')
  for (const r of i.rows ?? []) add(`machine:intrinsic-${r.kind}`, r.route, `${r.width}px`, { label: r.label, selector: r.selector, lines: r.lines, over: r.over, source: r.source ?? null }, 'the port is worse than (or has a defect the source lacks at) this width — fix it in the theme')
  for (const e of i.errorRows ?? []) add('machine:intrinsic-probe', e.route, `${e.width}px`, { error: e.error }, 'the route could not be read at this width; fix the route or the stand, then rerun')
  return rows
}

/** Write the whole evidence set of a run into `out`. Returns the report object. */
export function writeRun({ out, site, sourceSite, contractFile, identity = null, stageReports, pages, stageOf, method, scope = { kind: 'full', plan: null }, fastGate = null, inputs = null, browser = null, selectors = null, intrinsic = null, interaction = null }) {
  const at = identity?.capturedAt ?? new Date().toISOString()
  const summary = summarize(pages, stageReports)
  if (identity?.stale?.length) summary.stale = identity.stale
  // the intrinsic rows go to the machine notes; visual.json keeps the counts (the full rows are in intrinsic.json)
  const { rows: intrinsicRows, errorRows: intrinsicErrorRows, ...intrinsicCounts } = intrinsic ?? {}
  if (intrinsic) summary.intrinsic = summaryClaimOf(intrinsicCounts)
  // the interaction probe's full record is interaction.json; visual.json keeps its claim (interaction-report.mjs)
  const interactionProblems = interaction?.record ? interactionAttestationProblems(interaction.record, { site, source: sourceSite ?? null, routes: pages.map((page) => page.route ?? page.path ?? page.id).filter((route) => typeof route === 'string'), referenceKinds: Object.fromEntries(pages.filter((page) => page.referenceKind).map((page) => [page.path ?? page.route ?? page.id, page.referenceKind])) }) : interaction ? ['interaction record is missing'] : null
  const interactionCoverage = interaction ? { ok: Boolean(interaction.record) && interactionProblems.length === 0, problems: interactionProblems } : null
  if (interaction) summary.interaction = { ...interactionSummaryOf(interaction.claim), coverage: interactionCoverage }
  // `inputs` and `browser` are the verdict inputs that live in NO file: flags, the binary that drew
  // the pixels, whether a source was cited. `pageHash` cannot see them, so the only way two runs can
  // be compared on them is for each run to write them down and for `--reuse` to read them back.
  const report = { schemaVersion: 1, at, site, sourceSite: sourceSite ?? null, contract: contractFile, identity, scope, fastGate, method, inputs, browser, ...(selectors ? { selectors } : {}), ...(intrinsic ? { intrinsic: intrinsicCounts } : {}), ...(interaction ? { interaction: { ...interaction.claim, coverage: interactionCoverage } } : {}), stages: stageReports, summary, pages }
  mkdirSync(path.join(out, 'notes'), { recursive: true })
  writeFileSync(path.join(out, 'visual.json'), JSON.stringify(report, null, 2) + '\n')
  if (scope.plan) writeFileSync(path.join(out, 'FAST-GATE-PLAN.md'), planMarkdown(scope.plan))
  // Written before VISUAL.md so both read ONE grouping. round.mjs rewrites clusters.{json,md} with
  // the earlier measurements of each page (unchanged markers); the grouping itself does not move.
  const clusters = writeClusters(out, pages, { at })
  writeFileSync(path.join(out, 'VISUAL.md'), visualMarkdown({ site, at, summary, stageReports, pages, identity, scope, clusters, selectors }))
  writeFileSync(path.join(out, 'index.json'), JSON.stringify({ ...shotIndex({ at, site, sourceSite, pages, out, stageOf }), scope: scope.kind }, null, 2) + '\n')
  const machine = machineNotes(pages, stageOf)
  machine.push(...intrinsicNotes(intrinsic ? { ...intrinsicCounts, rows: intrinsicRows, errorRows: intrinsicErrorRows } : null, machine.length))
  machine.push(...interactionNotes(interaction?.record ?? (interaction ? { status: interaction.claim.status, reason: interaction.claim.reason } : null), machine.length))
  writeFileSync(path.join(out, 'notes', 'machine.json'), JSON.stringify(machine, null, 2) + '\n')
  // the interaction findings are an advisory list to read, not machine rows: nothing counts them (interaction-report.mjs)
  const advisory = interactionAdvisory(interaction?.record ?? null)
  writeFileSync(path.join(out, 'notes', 'advisory.json'), JSON.stringify(advisory, null, 2) + '\n')
  writeFileSync(path.join(out, 'notes', 'advisory.md'), advisoryMarkdown(advisory, at))
  writeFileSync(path.join(out, 'notes', 'machine.md'), machineMarkdown(machine, at, clusters))
  return report
}

/**
 * Regroup a written run with the earlier measurements of each page (`history`, oldest first, as
 * `[{ run, pages }]`) so clusters that did not change since the last measurement are listed apart:
 * rewrites clusters.{json,md}, the clusters section of VISUAL.md and notes/machine.md. Findings,
 * totals, machine.json and the verdict are not touched. Returns the clusters and which views were
 * rewritten (a VISUAL.md without the section — written by an older producer — is left as it is).
 */
export function writeClusterViews(out, report, { history = null } = {}) {
  const at = report.at ?? ''
  const clusters = writeClusters(out, report.pages, { history, at })
  const views = { clusters: true, visual: false, machine: false }
  const visual = path.join(out, 'VISUAL.md')
  if (existsSync(visual)) {
    const md = readFileSync(visual, 'utf8')
    const start = md.indexOf(CLUSTERS_HEADING)
    const end = start < 0 ? -1 : md.indexOf('\n## ', start + CLUSTERS_HEADING.length)
    if (start >= 0 && end >= 0) {
      writeFileSync(visual, md.slice(0, start) + [CLUSTERS_HEADING, '', ...clusterDigest(clusters), ''].join('\n') + md.slice(end))
      views.visual = true
    }
  }
  const machineJson = path.join(out, 'notes', 'machine.json')
  if (existsSync(machineJson)) {
    writeFileSync(path.join(out, 'notes', 'machine.md'), machineMarkdown(readEvidence(machineJson, MACHINE, { what: 'notes/machine.json' }), at, clusters))
    views.machine = true
  }
  return { clusters, views }
}
