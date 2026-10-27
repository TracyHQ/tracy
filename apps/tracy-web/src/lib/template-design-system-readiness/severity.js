/**
 * How a report of the Template Design System Readiness check weighs on the Road to live step
 * "Design system": each failing rule goes into one of two groups, read from ONE data file
 * (`rule-severity.json`), so a rule can move between groups without a code change. The summary is the
 * Customize your site check's own (`summarizeWith`), so both steps count and cut alike.
 *
 *   must-fix      a customer who presses Design system gets a broken or unreadable site, or one who
 *                 never presses it loses the template's look. Publish of a template not yet live
 *                 waits for every one of them.
 *   worth-fixing  the button refuses politely, or the site wears the system with a leftover.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { dsSlotModule } from '../ds-slot.js'
import { summarizeWith } from '../template-customization-question-readiness/severity.js'

/** @typedef {import('../template-customization-question-readiness/severity.js').RuleSeverity} RuleSeverity */

const FILE = fileURLToPath(new URL('./rule-severity.json', import.meta.url))

// the preview probe version this server runs: a rule of a later probe (`rulesFromProbe`) weighs only from then
const { PREVIEW_PROBE_VERSION } = await dsSlotModule('preview-probe-version')
const FILE_DOC = JSON.parse(readFileSync(FILE, 'utf8'))

/**
 * Every rule id the file names, with its group, part of the template, plain line and reason; with the rules
 * of `rulesFromProbe` whose probe version this server has reached (PREVIEW-PARITY from v10).
 */
export const DS_RULE_SEVERITY = Object.freeze(
  /** @type {Record<string, RuleSeverity>} */ ({
    ...FILE_DOC.rules,
    ...Object.assign(
      {},
      ...Object.entries(FILE_DOC.rulesFromProbe ?? {})
        .filter(([v]) => Number(v) <= PREVIEW_PROBE_VERSION)
        .map(([, rules]) => rules)
    )
  })
)

/**
 * A rule the file does not name counts as must-fix, as in the Customize your site check.
 * @param {string} id
 * @param {Record<string, RuleSeverity>} [rules] another table than the file's (a phase, a test)
 * @returns {RuleSeverity}
 */
export function dsSeverityOf(id, rules = DS_RULE_SEVERITY) {
  return (
    rules[id] ?? {
      group: 'must-fix',
      question: 'Design system',
      text: `${id} fails.`,
      reason: 'Not in rule-severity.json yet, so it counts as must-fix.'
    }
  )
}

/** How a built-site rule with no measurement file weighs (`unmeasured` in the file). */
export const DS_UNMEASURED = Object.freeze(
  /** @type {{ group: 'must-fix' | 'worth-fixing', text: string, reason?: string }} */ (
    JSON.parse(readFileSync(FILE, 'utf8')).unmeasured ?? { group: 'worth-fixing', text: 'Not measured yet.' }
  )
)

/**
 * How a preview rule (question "Preview": the four of PR 1356 and every later detector) with no
 * preview measurement weighs (`unmeasuredPreview` in the file): its own phase switch, so the preview
 * can hold Publish while the other built-site rules only warn. Absent: the preview rules weigh like
 * every other unmeasured rule.
 */
export const DS_UNMEASURED_PREVIEW = Object.freeze(
  /** @type {{ group: 'must-fix' | 'worth-fixing', text: string, reason?: string } | null} */ (
    JSON.parse(readFileSync(FILE, 'utf8')).unmeasuredPreview ?? null
  )
)

/**
 * @typedef {{
 *   rules: Record<string, RuleSeverity>,
 *   unmeasured: typeof DS_UNMEASURED,
 *   unmeasuredPreview?: typeof DS_UNMEASURED_PREVIEW
 * }} DsSeverity
 */

/** The file's table as one value: what the step scores with unless told otherwise. */
export const DS_SEVERITY = Object.freeze({
  rules: DS_RULE_SEVERITY,
  unmeasured: DS_UNMEASURED,
  unmeasuredPreview: DS_UNMEASURED_PREVIEW
})

/**
 * Phase 2 of the Publish lock (spec decision 11, ADR 0031): SCREEN-1 and IDENT-1 at must-fix, and a
 * version with no measurement file held like a failing must-fix rule. The switch itself is the same
 * three edits in `rule-severity.json`; this names them so a test, or /ops, can score a report under
 * phase 2 before the file is switched.
 * @param {DsSeverity} [base]
 * @returns {DsSeverity}
 */
export function phaseTwoOf(base = DS_SEVERITY) {
  const up = (/** @type {string} */ id) => ({
    ...dsSeverityOf(id, base.rules),
    group: /** @type {const} */ ('must-fix')
  })
  return {
    ...base,
    rules: { ...base.rules, 'SCREEN-1': up('SCREEN-1'), 'IDENT-1': up('IDENT-1') },
    unmeasured: { ...base.unmeasured, group: 'must-fix' }
  }
}

/** The measure commands run to several thousand characters (15 systems): kept whole up to 8000. */
const clipCommand = (/** @type {unknown} */ text) => String(text ?? '').slice(0, 8000)

const clip = (/** @type {unknown} */ text) => {
  const t = String(text ?? '')
  return t.length > 400 ? `${t.slice(0, 399)}…` : t
}

/**
 * "<version>, <date>, <machine>" of the measurement file a built-site rule was scored from (the
 * "Measured on" stamp `rules/built-site.js` ends its message with), or null.
 * @param {unknown} message
 */
const stampOf = (message) => /Measured on (.+?)\.(?:\s|$)/.exec(String(message ?? ''))?.[1] ?? null

/**
 * What a preview detector found for one failing rule, as the row under it shows it: what it saw,
 * on which system and scheme, the elements, and the fix (`judgePreview` in `@tracy/ds-slot`
 * `measurement.mjs` puts them on the judged rule as `kinds`; `rules/built-site.js` passes them on).
 * @param {unknown} kinds
 * @returns {{ kind: string, what: string, on: string[], pages: string[], sitewide: string[], where: string[], fix: string | null }[]}
 */
const findingsOf = (kinds) =>
  (Array.isArray(kinds) ? kinds : [])
    .filter((k) => k && typeof k === 'object' && Number(k.count) > 0)
    .slice(0, 12)
    .map((k) => ({
      kind: String(k.kind ?? ''),
      what: clip(k.what),
      on: (Array.isArray(k.on) ? k.on : []).slice(0, 12).map((x) => clip(x)),
      // the pages it fired on, "<page> <count>" (preview probe 4: every declared page is measured)
      pages: (Array.isArray(k.pages) ? k.pages : []).slice(0, 12).map((x) => clip(x)),
      // the elements shared by several pages, told once: "<element> on every page" / "on N of M pages"
      sitewide: (Array.isArray(k.sitewide) ? k.sitewide : [])
        .filter((x) => x && typeof x === 'object' && x.at)
        .slice(0, 8)
        .map((x) =>
          clip(
            `${x.at} ${Number(x.pages) >= Number(x.of) ? 'on every page' : `on ${x.pages} of ${x.of} pages`}`
          )
        ),
      where: (Array.isArray(k.where) ? k.where : []).slice(0, 8).map((x) => clip(x)),
      fix: k.fix ? clip(k.fix) : null
    }))

/** The rule DEMO-1 asks of this server, not of the release files (`rule-severity.json`). */
export const DEMO_RULE = 'DEMO-1'

const DEMO_FIX =
  'Install the demo of this release on this server: Road to live step Demo, or Demo Site on /ops, press Install demo and wait for its address. The Add site preview reads that demo, so the Design system picker appears once it is live; then press Check again.'

/**
 * The Design system step's numbers and groups from one report: the Customize your site summary
 * (passed, total, must-fix, worth-fixing) plus what is specific to this check (spec decisions 9 and 11):
 *
 *   unmeasured      the built-site rules with no measurement file for this version ("Not measured
 *                   yet"): counted in `total`, never in `passed`. A preview rule (question Preview)
 *                   goes to must-fix instead, with `unmeasured: true`, while `unmeasuredPreview` in
 *                   `rule-severity.json` is must-fix (switched on 14/10/2026);
 *   unmeasuredHolds whether an unmeasured rule holds Publish like a must-fix one (phase 2, set in
 *                   `rule-severity.json`);
 *   grade           A every decided rule passes · B only worth-fixing rules fail · C a must-fix rule
 *                   fails or a rule is not measured · null nothing checked;
 *   measuredOn      "<version>, <date>, <machine>" of the measurement file the built-site rules were
 *                   scored from, null when none counted;
 *   evidence        the evidence folder that file names (screenshots, flow.json), or null;
 *   notAtProbe      set (and every other field empty, grade null) when the release has no measurement
 *                   at the current preview probe: { current, measured, measure } with the measure
 *                   commands; such a release is never ds-ready;
 *   measuredPassed  the built-site rules that passed on that run, each with its stamp; every
 *                   must-fix and worth-fixing item also carries `measuredOn` (null for a static rule)
 *                   and, for a preview rule, `findings` (what each detector saw, where, the fix).
 *
 * `world.previewGap` (the road's answer from `lib/preview-demo.js`, the predicate the Add site preview
 * door refuses by: 'NO_DEMO', 'NO_SLOT', or null when it has a demo) adds DEMO-1 once the template
 * has a slot contract (SLOT-1 passes): without that demo the Add site panel offers no preview and no
 * Design system picker, so a customer never sees the feature. Left out, DEMO-1 is not judged.
 * @param {Parameters<typeof summarizeWith>[0]} report
 * @param {DsSeverity} [severity] the table to score with (the file's by default)
 * `world.doorHealth` (`lib/preview-door-health.js`, this server's own doors asked now): a stylesheet or font
 * that does not load fails PREV-1 as must-fix, over what the measurement file says.
 * @param {{ previewGap?: 'NO_DEMO' | 'NO_SLOT' | null, doorHealth?: { checkedAt: number, assets: number, failed: { path: string, status: number }[] } | null }} [world]
 */
export function summarizeDsReadiness(report, severity = DS_SEVERITY, world = {}) {
  const of = (/** @type {string} */ id) => dsSeverityOf(id, severity.rules)
  const results = Array.isArray(report?.results) ? report.results : []
  // not measured at the current preview probe (no file of this version, or preview rows of an older
  // probe, `rules/built-site.js`): the release was not judged on the preview rules, so the step shows
  // that alone, with no grade, no ratio and no groups built from older evidence (16/10/2026)
  const gap = /** @type {any} */ (results.find((r) => /** @type {any} */ (r).previewProbe))?.previewProbe
  if (gap)
    return {
      passed: 0,
      total: 0,
      mustFix: [],
      worthFixing: [],
      measuredPassed: [],
      unmeasured: [],
      unmeasuredHolds: true,
      grade: null,
      measuredOn: null,
      evidence: null,
      notAtProbe: {
        current: Number(gap.current),
        measured: gap.measured ?? null,
        measure: clipCommand(gap.measure)
      }
    }
  const base = summarizeWith(report, of)
  // each scored built-site rule carries the stamp of its own run, for the sub line under its row (#1313)
  const stampById = new Map(results.map((r) => [r.id, stampOf(r.message)]))
  const kindsById = new Map(results.map((r) => [r.id, /** @type {any} */ (r).kinds]))
  const stamped = (/** @type {any} */ item) => {
    const findings = findingsOf(kindsById.get(item.rule))
    return { ...item, measuredOn: stampById.get(item.rule) ?? null, ...(findings.length ? { findings } : {}) }
  }
  const mustFix = base.mustFix.map(stamped)
  const worthFixing = base.worthFixing.map(stamped)
  // the built-site rules that passed on that run: listed too, so a pass shows which run it came from
  const measuredPassed = results
    .filter((r) => r.status === 'pass' && stampById.get(r.id))
    .map((r) => {
      const s = dsSeverityOf(r.id)
      return {
        rule: r.id,
        text: clip(String(r.message ?? '').replace(/\s*Measured on .*$/, '')),
        question: s.question,
        owner: r.owner ?? 'contract',
        message: clip(r.message),
        fix: null,
        measuredOn: stampById.get(r.id) ?? null
      }
    })
  // a preview rule not measured holds Publish while its own switch says must-fix (`unmeasuredPreview`)
  const previewHeld = severity.unmeasuredPreview?.group === 'must-fix'
  const unmeasuredAll = results.filter((r) => r.status === 'unmeasured')
  const unmeasured = []
  for (const r of unmeasuredAll) {
    const s = of(r.id)
    const item = {
      rule: r.id,
      text: s.text,
      question: s.question,
      owner: r.owner ?? 'contract',
      message: clip(r.message),
      fix: r.fix ? clip(r.fix) : null
    }
    if (previewHeld && s.question === 'Preview')
      mustFix.push({
        ...item,
        text: severity.unmeasuredPreview?.text ?? s.text,
        measuredOn: null,
        unmeasured: true
      })
    else unmeasured.push(item)
  }
  let passed = base.passed
  let total = base.total + unmeasuredAll.length
  // DEMO-1: asked of this server, only for a template the button would serve (SLOT-1 passes)
  const slotReady = results.some((r) => r.id === 'SLOT-1' && r.status === 'pass')
  if (world.previewGap !== undefined && slotReady) {
    total += 1
    if (world.previewGap === null) passed += 1
    else {
      const s = of(DEMO_RULE)
      mustFix.push({
        rule: DEMO_RULE,
        text: s.text,
        question: s.question,
        owner: 'ops',
        message: `The Add site preview door answers 409 DS_PREVIEW_UNAVAILABLE (${world.previewGap}) for it${world.previewGap === 'NO_SLOT' ? ': its demo row records no platform' : ': no published demo of this release here'}.`,
        fix: DEMO_FIX,
        measuredOn: null
      })
    }
  }
  // the customer's preview, asked of this server's own doors now (`lib/preview-door-health.js`): a
  // stylesheet or font that does not load fails PREV-1 whatever the measuring machine saw
  const door = world.doorHealth
  if (door && Array.isArray(door.failed) && door.failed.length) {
    const s = of('PREV-1')
    const was = measuredPassed.findIndex((m) => m.rule === 'PREV-1')
    if (was !== -1) {
      measuredPassed.splice(was, 1)
      passed -= 1
    }
    const shown = door.failed.slice(0, 6).map((f) => `${f.path} (${f.status || 'no answer'})`)
    mustFix.push({
      rule: 'PREV-1',
      text: "The customer's preview cannot load its stylesheets or fonts.",
      question: s.question,
      owner: 'ops',
      message: `Asked of this server's own preview doors at ${new Date(door.checkedAt).toISOString().slice(0, 16)}Z: ${door.failed.length} of ${door.assets} file(s) did not load: ${shown.join(', ')}${door.failed.length > shown.length ? ', …' : ''}. The Add site popup shows the page unstyled.`,
      fix: 'Make GET /api/design-system/preview-asset answer 200 for this demo (it reads the demo where the preview door reads it), then press Check again; nothing in the template needs to change.',
      measuredOn: null,
      live: true
    })
  }
  const grade = mustFix.length || unmeasured.length ? 'C' : worthFixing.length ? 'B' : total ? 'A' : null
  // the stamp of the measurement file every built-site rule was scored from ("Measured on <version>,
  // <date>, <machine>", `rules/built-site.js`) and the evidence folder it names, for the step's sub-line
  const measuredOn = results.map((r) => stampOf(r.message)).find((x) => x !== null) ?? null
  const evidence =
    results
      .flatMap((r) => (Array.isArray(r.details) ? r.details : []))
      .map((d) => /^evidence: (.+)$/.exec(String(d))?.[1] ?? null)
      .find((x) => x !== null) ?? null
  return {
    ...base,
    passed,
    mustFix,
    worthFixing,
    measuredPassed,
    total,
    unmeasured,
    unmeasuredHolds: severity.unmeasured.group === 'must-fix',
    grade,
    measuredOn,
    evidence
  }
}
