/**
 * The rules only a built site can decide (ADR 0031, amended 13/10/2026), scored HERE from the
 * numbers of the release's measurement file (`readers/measurement.js`): the measuring machine wrote
 * what it saw, /ops judges it with the one threshold table of `@tracy/ds-slot` `measurement.mjs`, so
 * a threshold change re-scores every file without a new run.
 *
 * A version with no file, or only a file of another version, answers `unmeasured`: shown as
 * "Not measured yet", never counted as a pass (`severity.js`).
 */
import { dsSlotModule } from '../../ds-slot.js'
import { measurementOf } from '../readers/measurement.js'
import { slotOf } from '../readers/slot.js'
import { measureCommandOf } from './measure-command.js'

// Through `dsSlotModule`, never a relative path into `packages/`: the tracy-web image carries
// `apps/tracy-web` alone, with `@tracy/ds-slot` copied under `src/ds-slot/`, so a static import of
// `packages/design/tracy-ds-slot` loads in a checkout and crashes the check runner in the image
// (every release read "ds-error" on dev after #1405, 16/10/2026).
const { PREVIEW_PROBE_VERSION } = await dsSlotModule('preview-probe-version')

/**
 * How a version is measured, for the message and the fix of an unmeasured rule: the commands that run it
 * (`measure-command.js`), filled with this release's tag, version and slot contract. `previewOnly`: the
 * file is there and only its preview is older than the current probe.
 * @param {import('../index.js').RuleContext} context @param {boolean} previewOnly
 */
async function howOf(context, previewOnly) {
  let contract = null
  try {
    contract = (await slotOf(context)).name
  } catch {}
  const { platform, tag, version } = context.release
  const command = measureCommandOf({
    platform,
    tag,
    version,
    contract,
    setting: context.setting,
    previewOnly
  })
  const what = previewOnly
    ? `Measure the Add site preview of ${version} again with the current preview probe v${PREVIEW_PROBE_VERSION}`
    : `Measure ${version} (the built-site run under the 15 featured systems, then the Add site preview with preview probe v${PREVIEW_PROBE_VERSION})`
  return command
    ? `${what} and commit the file it writes in the contract folder of this version (tdsr skill):\n${command}`
    : `${what} with the tdsr skill and bring design-system-measurement.json for this version.`
}

/**
 * When a run measured, as a reader on /ops reads it: the date and the time in Dubai (the team works in
 * UTC+4), e.g. "2026-10-14 21:57 Dubai time". A value that is not a date is shown as it is.
 * @param {unknown} iso
 */
export function dubaiTime(iso) {
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  )
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} Dubai time`
}

/**
 * The probe part of a preview rule's stamp: the probe version its rows were measured with, and the
 * current one when the rows are older (`previewProbeOf` of measurement.mjs).
 * @param {{ version: number | null, current: boolean } | null | undefined} probe
 */
const probeStamp = (probe) =>
  !probe
    ? ''
    : probe.current
      ? `, preview probe v${probe.version}`
      : `, older preview probe (${probe.version === null ? 'rows without a probe version' : `v${probe.version}`}; the current probe is v${PREVIEW_PROBE_VERSION})`

/**
 * @param {string} id @param {string} title @param {string} fix what to change when the rule fails
 * @param {(platform: string) => string} [howOf] how a run measures it (the built-site run by default)
 * @returns {import('../index.js').Rule}
 */
const measured = (id, title, fix) => ({
  id,
  title,
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: 'contract',
  async run(context) {
    const outcome = await judgeRule(id, title, fix, context)
    const gap = await probeGapOf(context)
    return gap ? { ...outcome, previewProbe: gap } : outcome
  }
})

/**
 * Whether this release lacks a measurement at the current preview probe: no file of its version, or
 * a file whose preview rows are missing or of an older probe. Such a release was not judged on the
 * preview rules /ops holds it to, so the step shows only "Not measured with preview probe vN" and
 * its prompt is the measure commands (`severity.js`, 16/10/2026). Null when it is measured.
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{ current: number, measured: number | null, measure: string } | null>}
 */
async function probeGapOf(context) {
  const { measured: m } = await measurementOf(context)
  if (m?.probe?.current) return null
  return {
    current: PREVIEW_PROBE_VERSION,
    measured: m?.probe?.version ?? null,
    measure: await howOf(context, Boolean(m?.probe))
  }
}

/**
 * One built-site rule judged from the measurement file, as it reads with no regard to the probe.
 * @param {string} id @param {string} title @param {string} fix @param {import('../index.js').RuleContext} context
 */
async function judgeRule(id, title, fix, context) {
  const { measured: m, rejected } = await measurementOf(context)
  if (!m) {
    const how = await howOf(context, false)
    return {
      status: 'unmeasured',
      message: `${title}: not measured yet on ${context.release.version}${rejected.length ? ` (${rejected.join('; ')})` : ''}. ${how}`,
      fix: how
    }
  }
  const r = m.judged[id]
  // a preview rule (judgePreview gives it `kinds`) is stamped with the preview pass, which runs apart
  // from the built-site run and later (preview-check.mjs --write sets previewMeasuredAt)
  const at = r && 'kinds' in r && m.doc.previewMeasuredAt ? m.doc.previewMeasuredAt : m.doc.measuredAt
  const probe = r && 'kinds' in r ? probeStamp(m.probe) : ''
  const stamp = `Measured on ${m.doc.version}, ${dubaiTime(at)}, ${m.doc.machine}${probe}`
  const details = m.doc.evidence ? [`evidence: ${m.doc.evidence}`] : []
  if (r?.status === 'not-applicable')
    return { status: 'not-applicable', message: `${title}: ${r.note}. ${stamp}.`, details }
  if (!r || r.status === 'unmeasurable') {
    // preview rows of an older probe: not measured at the current probe, and only the preview is run again
    const stale = Boolean(r && 'kinds' in r && m.probe && !m.probe.current)
    const how = await howOf(context, stale)
    return {
      status: 'unmeasured',
      message: stale
        ? `${title}: not measured with the current preview probe v${PREVIEW_PROBE_VERSION}. ${stamp}. ${how}`
        : `${title}: that run could not read it (${r?.note ?? 'no entry'}). ${stamp}. ${how}`,
      fix: how,
      details
    }
  }
  // a preview rule carries what each detector saw, where and its fix, for the row on /ops
  const kinds = Array.isArray(r.kinds) && r.kinds.length ? { kinds: r.kinds } : {}
  if (r.status === 'fail')
    return { status: 'fail', message: `${title}: ${r.note}. ${stamp}.`, fix, details, ...kinds }
  return {
    status: 'pass',
    message: `${title}: ${r.note}${r.status === 'warn' ? ' (warning)' : ''}. ${stamp}.`,
    details
  }
}

const AGAIN = 'then measure again with the tdsr skill and bring the new file.'

export const role1RolesWearSystem = measured(
  'ROLE-1',
  'Headings, text, buttons, cards and containers wear the system',
  `Point the missing roles at the slot in the template's stylesheets or the contract's roles, ${AGAIN}`
)
export const screen1FirstScreenChanges = measured(
  'SCREEN-1',
  'The first screen visibly changes',
  `Make the first screen's bands wear the system (the contract's bands, or keepWhole with a reason), ${AGAIN}`
)
export const con1TextReads = measured(
  'CON-1',
  'Every text reads on its ground under every system',
  `Give the text a role that reads on its band (followRules, bandText), ${AGAIN}`
)
export const undo1DefaultAndUndo = measured(
  'UNDO-1',
  'No system, and Undo, give back the template exactly',
  `Keep every slot read with the template's own value as fallback and clear everything the apply writes, ${AGAIN}`
)
export const font1FontsLoad = measured(
  'FONT-1',
  "The system's fonts load",
  `Load the system's faces (fontsHref) and name them where the template sets its families, ${AGAIN}`
)
export const ident1LogoShows = measured(
  'IDENT-1',
  'The logo or brand mark shows under every system',
  `Keep the logo's size and content when the slot repaints its band, ${AGAIN}`
)
export const mode1PageMatchesSystem = measured(
  'MODE-1',
  "The page's light or dark matches the system",
  `Switch the template to the mode the system is (its dark flag) when it is worn, ${AGAIN}`
)
export const mode2BothModesFollow = measured(
  'MODE-2',
  'A template with two modes keeps both, and both follow the system',
  `Do not hide the template's light/dark switch; derive the second mode from the system, ${AGAIN}`
)

// The Add site preview as a visitor sees it (14/10/2026), measured by
// apps/tracy-web/scripts/preview-check.mjs into the file's preview block
const PREVIEW_AGAIN =
  'then run apps/tracy-web/scripts/preview-check.mjs (with --palette after a stylesheet change) and bring the new file.'
export const tpl1NoTemplateColourLeft = measured(
  'TPL-1',
  "No colour of the template's own stays visible under a system",
  `Let the auto palette map it (regenerate templates/palette/<contract>.json); keep a block only over a picture, with its reason in keepScopesNote, ${PREVIEW_AGAIN}`
)
export const con2PreviewTextReads = measured(
  'CON-2',
  'Every text of the preview reads under every system',
  `Find the rule that paints the text (PREVIEW_WHY=<selector>) and give it a role hint (paletteRoles), ${PREVIEW_AGAIN}`
)
export const btn1ButtonsKeepShape = measured(
  'BTN-1',
  'Every button keeps its shape under every system',
  `Give the button's fill or border a role apart from its ground (paletteRoles), its corner --ds-btn-radius on the box the visitor sees (wrapper included) and its fill the button roles, ${PREVIEW_AGAIN}`
)
export const prev1PreviewIsThePage = measured(
  'PREV-1',
  'The preview is the page alone: one document, fonts that load, no empty block',
  `Fix the demo that prints a second page, or the stylesheet whose fonts the asset door cannot serve, ${PREVIEW_AGAIN}`
)
/** A rule of the preview's detector kinds: unmeasured, it says how the PREVIEW is measured (preview-check.mjs), not the built-site run. */
const previewMeasured = (/** @type {string} */ id, /** @type {string} */ title, /** @type {string} */ fix) =>
  measured(id, title, fix)
// The detector kinds of the preview (PR 2 of 14/10/2026): one rule each, scored from the kind's count
export const ident2PreviewLogoShows = previewMeasured(
  'IDENT-2',
  'The logo reads on its ground in the preview under every system',
  `Give the logo a variant for the system's ground and drop any blanket invert filter on a logo already made for its ground, ${PREVIEW_AGAIN}`
)
export const font2NoTemplateFontLeft = previewMeasured(
  'FONT-2',
  "No text keeps the template's own fonts once the page wears the system's",
  `Make the rule that sets that font read the slot's font variable (--ds-font-body or --ds-font-heading), ${PREVIEW_AGAIN}`
)
export const prev2NothingHiddenForReveal = previewMeasured(
  'PREV-2',
  'No block stays hidden in the preview waiting for a scroll-reveal script',
  `Make the reveal blocks visible when no script runs (opacity 1, no transform), ${PREVIEW_AGAIN}`
)

// D2 of PR 2 (14/10/2026): one rule per preview detector kind (apps/tracy-web/scripts/preview-detectors)
export const grad1GradientStopsFollow = previewMeasured(
  'GRAD-1',
  'Every stop of a gradient wears the system',
  `Point every stop of the gradient at the slot (a role per stop, or the palette rule of its selector), ${PREVIEW_AGAIN}`
)
export const shape1ShapesFollow = previewMeasured(
  'SHAPE-1',
  'SVG and CSS shapes wear the system',
  `Paint the shape with a slot variable (fill/stroke of the SVG, background or border of the pseudo-element), or currentColor, ${PREVIEW_AGAIN}`
)
export const mock1NoHandWrittenColour = previewMeasured(
  'MOCK-1',
  'No colour is written by hand into the markup',
  `Replace the literal (bg-[#…], style="color:…") with a token class or var(--…) the slot sets, ${PREVIEW_AGAIN}`
)
export const acc1AccentStaysSmall = previewMeasured(
  'ACC-1',
  "No section in the system's accent carries unreadable text",
  `Map that section ground to a surface role, not the accent, or give its texts the on-accent role, ${PREVIEW_AGAIN}`
)
export const clip1ButtonsKeepLabel = previewMeasured(
  'CLIP-1',
  'Every button keeps its size and its whole label',
  `Give the button a minimum size, keep its font size and padding under the system's radius and type, and keep a block its band stretches from turning into a pill, ${PREVIEW_AGAIN}`
)

// G3 of PR 2 (14/10/2026): leftovers the eye saw on dev after PR 1356 that every rule above passed
export const ground1BlocksOnSystemGround = previewMeasured(
  'GROUND-1',
  'Every large block and strip stands on a ground role of the system',
  `Map that block's ground to a ground role of the slot (--ds-c-bg, --ds-c-surface or --ds-c-muted), not to a text colour, and drop the template's own neutral fill, ${PREVIEW_AGAIN}`
)
export const empty1BlocksShowContent = previewMeasured(
  'EMPTY-1',
  'Every block of the preview shows its content',
  `Give the words of the block the text role of its ground, load its pictures without a script, and give its cards a border or surface role apart from the ground, ${PREVIEW_AGAIN}`
)
export const form1FieldsWearSystem = previewMeasured(
  'FORM-1',
  'Every form field wears the system',
  `Paint the fields from the slot (background var(--ds-c-surface), color var(--ds-c-fg), border var(--ds-c-border)), ${PREVIEW_AGAIN}`
)
// G4 of PR 2 (14/10/2026): two logos visible (JA Vega WordPress under Moxie, light)
export const ident3OneLogoShows = previewMeasured(
  'IDENT-3',
  'The header and the footer show one logo each, not two',
  `Hide the extra logo copy (a drawer or mobile logo, the other scheme's variant) with a CSS rule the preview loads, not a script, ${PREVIEW_AGAIN}`
)
// E1 of PR 2 (14/10/2026): highlighted words turned quieter than their text (JA Nova, Phio, Prodex, Podcast Joomla under Moxie)
export const hier1HighlightsStandOut = previewMeasured(
  'HIER-1',
  'Words the template highlights still stand out from the text around them',
  `Paint the highlighted words with the slot's accent (var(--ds-c-accent)) or the full text role (var(--ds-c-fg)), never the muted text role, ${PREVIEW_AGAIN}`
)
export const hier2HeadingsReadStrongest = previewMeasured(
  'HIER-2',
  'Headings read at least as strongly as the body text on their ground',
  `Paint the headings with the full text role (var(--ds-c-fg)) or the accent, not the muted text role, ${PREVIEW_AGAIN}`
)
// E2 of PR 2 (14/10/2026): layouts the system broke while every colour is the system's
export const layout1BlocksKeepTheirPlace = previewMeasured(
  'LAYOUT-1',
  'Every container keeps its width and no button runs into another',
  `Scope the slot rule that reaches the container's width, margin or columns to the elements it was meant for, and give rows of buttons a gap and room to wrap, ${PREVIEW_AGAIN}`
)
export const layout2BlocksKeepTheirSize = previewMeasured(
  'LAYOUT-2',
  'Every large link, banner and card keeps its size',
  `Keep the slot's button rules off blocks the template draws as banners or cards (scope them to the template's button classes), ${PREVIEW_AGAIN}`
)
// 14/10/2026: wearing a system must not break the template's own layout (JA Kinetic's footer newsletter row)
export const layout3LayoutKept = previewMeasured(
  'LAYOUT-3',
  "Every row, column and form group keeps the template's own layout",
  `Keep the slot's rules off the box metrics that lay rows out (padding, font size, line height, letter spacing, width, display of form controls and row children): colours, faces, radii and shadows only, ${PREVIEW_AGAIN}`
)
// 14/10/2026 (JA Kinetic acceptance): a band the template lifts a hair stays quiet under a system
export const ground2BandsStayQuiet = previewMeasured(
  'GROUND-2',
  'Every band the template lifts a hair off the page stays as quiet under a system',
  `Map the template's raised ground (its elevated variable) to the system's quiet raised surface (--ds-c-surface-warm), not to its card surface, ${PREVIEW_AGAIN}`
)
export const header1HeaderHasGround = previewMeasured(
  'HEADER-1',
  'A fixed or sticky header has a ground the content does not show through',
  `Give the fixed header a ground role of the slot (var(--ds-c-bg) or var(--ds-c-surface)) where no script turns it solid on scroll, ${PREVIEW_AGAIN}`
)

// E3 of PR 2 (14/10/2026): icons, states, lines and stray colours the eye saw after PR 1
export const icon1IconControlsShow = previewMeasured(
  'ICON-1',
  'Every icon control (menu toggle, icon button) shows its glyph on its ground',
  `Paint the control's bars, glyph or SVG with the text role of its ground, not the ground's own role, ${PREVIEW_AGAIN}`
)
export const hover1StatesRead = previewMeasured(
  'HOVER-1',
  'Every button and link reads in its hover and focus state',
  `Give the :hover and :focus rules a fill and a text role that read together, ${PREVIEW_AGAIN}`
)
// 20/10/2026 (JA Restaurant code review): a hover that no longer changes, the twin of HOVER-1
export const hover2StatesChange = previewMeasured(
  'HOVER-2',
  'Every button and link still changes on hover and focus',
  `Give the :hover and :focus rules a role apart from the rest one (--ds-c-surface-hover for a grey ground, --ds-c-accent-hover for an accent fill), ${PREVIEW_AGAIN}`
)
export const border1LinesStayFaint = previewMeasured(
  'BORDER-1',
  "No line on a dark ground is far harder than the system's border role",
  `Map grid and card lines to the slot's border role (--ds-c-border), not to the text colour, ${PREVIEW_AGAIN}`
)
export const foreign1NoStrayColour = previewMeasured(
  'FOREIGN-1',
  'Every colour of the preview comes from the system or the template',
  `Point the rule that paints the stray colour at a slot role, ${PREVIEW_AGAIN}`
)

// Probe v10 (17/10/2026): the Design system popup shows the template as Try on shows it — the
// popup's page against the same page after Try on (apps/tracy-web/scripts/preview-parity.mjs into the
// file's previewParity block). Joomla only: the measuring script wears a system the way the Joomla apply
// does; a WordPress or EmDash release is not held to a rule no run measures yet. On the list only once
// PREVIEW_PROBE_VERSION reaches PARITY_SINCE (measurement.mjs BUILT_SITE_RULES).
const { BUILT_SITE_RULES, PARITY_RULE } = await dsSlotModule('measurement')
export const previewParityMatchesTryOn = {
  ...measured(
    PARITY_RULE,
    'The Design system popup shows the template as Try on shows it',
    'Find what the popup loads apart from the page (an icon or text font whose stylesheet the popup cannot read, a carousel or layout a script builds), make the popup load it as the page does, then run apps/tracy-web/scripts/preview-parity.mjs --write and bring the new file.'
  ),
  platforms: ['joomla']
}
// probe v10 (17/10/2026): the template's brand hue left on screen under a system (JA Phio's red pictures,
// JA Tour's orange icons, JA Impact's navy icons, JA Vega's blue call-to-action band and hero glow); detector
// accent-leak. On the list only once PREVIEW_PROBE_VERSION reaches ACCENT_LEAK_SINCE (BUILT_SITE_RULES)
export const accentLeakBrandHueFollows = previewMeasured(
  'ACCENT-LEAK',
  "No place keeps the template's own brand colour under a system",
  `Point the rule that paints it at the slot's accent (var(--ds-c-accent), its -text and -on shades, the template's colour as fallback), and draw a picture in the brand colour as a mask, an SVG flood or a gradient painted with the accent under a system, ${PREVIEW_AGAIN}`
)
/** The rules of the current probe that only a later version turns on: empty until their probe (v10). */
export const probeNextRules = [
  ...(BUILT_SITE_RULES.includes(PARITY_RULE) ? [previewParityMatchesTryOn] : []),
  ...(BUILT_SITE_RULES.includes('ACCENT-LEAK') ? [accentLeakBrandHueFollows] : [])
]
