/**
 * The measurement file of the Template Design System Readiness check (`tdsr-measurement/v1`): what a
 * measuring run on a built site found, as NUMBERS, so /ops scores the eight built-site rules itself
 * (one threshold table, `THRESHOLDS`, read by the measuring machine and by /ops alike) and a threshold
 * change never needs a new run.
 *
 * The file travels with the fix, in the TCQR shape (spec `tasks/spec-template-design-system-readiness.md`,
 * decision 15): a re-release carries it as the `designSystem` block of its `VERIFICATION.json`; a
 * contract-only fix carries it as `design-system-measurement.json` in the contract folder of that
 * version. `measurementPath` names that folder for each CMS.
 *
 * Three pure parts: `validateMeasurement` (is this file one of ours), `fromFlow` / `fromSweepRow`
 * (a flow.json or a sweep row becomes a file), `judgeMeasurement` (the eight rules from the numbers).
 */

import { judgeParity, PARITY_RULE, PARITY_SINCE, validateParity } from './preview-parity.mjs'
import { PREVIEW_PROBE_VERSION } from './preview-probe-version.mjs'

export { judgeParity, PARITY_RULE, PARITY_SINCE }

export const MEASUREMENT_SCHEMA = 'tdsr-measurement/v1'

/** @typedef {ReturnType<typeof fromFlow>} Measurement */

/** The eight rules only a built site decides, in the order /ops lists them. */
export const BUILT_SITE_RULES = Object.freeze([
  'ROLE-1',
  'SCREEN-1',
  'CON-1',
  'UNDO-1',
  'FONT-1',
  'IDENT-1',
  'MODE-1',
  'MODE-2',
  'TPL-1',
  'CON-2',
  'BTN-1',
  'PREV-1',
  'IDENT-2',
  'FONT-2',
  'PREV-2',
  // D2 of PR 2 (14/10/2026): one rule per preview detector kind, in PREVIEW_KINDS order
  'GRAD-1',
  'SHAPE-1',
  'MOCK-1',
  'ACC-1',
  'CLIP-1',
  // G4 of PR 2 (14/10/2026): two logos where the template shows one
  'IDENT-3',
  // G3 of PR 2 (14/10/2026)
  'GROUND-1',
  'EMPTY-1',
  'FORM-1',
  // E1 of PR 2 (14/10/2026): highlighted words the system made quieter than their text
  'HIER-1',
  'HIER-2',
  // E2 of PR 2 (14/10/2026): layouts the system broke
  'LAYOUT-1',
  'LAYOUT-2',
  'HEADER-1',
  // 14/10/2026 (Akemi): a system that breaks the template's own layout (JA Kinetic's footer newsletter row)
  'LAYOUT-3',
  // 14/10/2026 (Akemi, JA Kinetic acceptance): a band the template lifts a hair that the system makes a block
  'GROUND-2',
  // E3 of PR 2 (14/10/2026): icons, states, lines and stray colours
  'ICON-1',
  'HOVER-1',
  // 20/10/2026 (JA Restaurant code review): a hover or focus state that looks exactly like rest under a system
  'HOVER-2',
  'BORDER-1',
  'FOREIGN-1',
  // probe v10 (Akemi, 17/10/2026): the template's own brand hue left on screen under a system (JA Phio, Tour,
  // Impact, Vega; detector accent-leak); off the list until PREVIEW_PROBE_VERSION reaches ACCENT_LEAK_SINCE
  ...(PREVIEW_PROBE_VERSION >= 10 ? ['ACCENT-LEAK'] : []),
  // probe v10 (Akemi, 17/10/2026): the Design system popup shows the template as Try on does
  // (preview-parity.mjs); off the list until PREVIEW_PROBE_VERSION reaches PARITY_SINCE. Last, as
  // judgeMeasurement adds it after the preview rules (ACCENT-LEAK is one of them)
  ...(PREVIEW_PROBE_VERSION >= PARITY_SINCE ? [PARITY_RULE] : [])
])

/** The probe version ACCENT-LEAK and its detector kind (`accent-leak`) are born with. */
export const ACCENT_LEAK_SINCE = 10

/**
 * The thresholds the eight rules judge with. Interim (Akemi, 13/10/2026): revisit after the first
 * scored sweep. One table for the measuring machine and /ops.
 */
export const THRESHOLDS = Object.freeze({
  /** ROLE-1: at least this share of the role checks match the worn system */
  roleMatch: 0.95,
  /** ROLE-1: the worn system matches this much better than the best other system */
  roleMargin: 0.25,
  /** ROLE-1: at least this share of what the default page painted follows the system */
  followsFloor: 0.85,
  /** SCREEN-1: at most this share of the first screen still wears the template's own colours */
  leftFirstMax: 0.15,
  /** CON-1: text under this ratio is unreadable; a text is only held against the page when it reads
   *  worse than the same text on the template's default page (flow.mjs decides that per text) */
  contrastFloor: 4.5,
  /** CON-1: below this ratio the finding is also flagged as a warning in the note */
  contrastWarn: 3,
  /** CON-2: in the Add site preview, no text the system made unreadable falls under this ratio */
  previewTextFloor: 3
})

const CMS = new Set(['joomla', 'wordpress', 'emdash'])
const MODES = new Set(['native', 'derived'])
const VIEWPORTS = new Set([1440, 390])

const isShare = (x) => x === null || (typeof x === 'number' && x >= 0 && x <= 1)
const isCount = (x) => Number.isInteger(x) && x >= 0
const isFlag = (x) => x === null || typeof x === 'boolean'

/**
 * Every way a document is not a `tdsr-measurement/v1` file. An empty list means it is one.
 * @param {any} doc
 * @returns {string[]}
 */
export function validateMeasurement(doc) {
  const out = []
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['not an object']
  if (doc.schemaVersion !== MEASUREMENT_SCHEMA)
    out.push(`schemaVersion must be ${MEASUREMENT_SCHEMA}, got ${JSON.stringify(doc.schemaVersion)}`)
  for (const k of ['template', 'tag', 'version', 'measuredAt', 'machine', 'measuredBy'])
    if (typeof doc[k] !== 'string' || !doc[k]) out.push(`${k} must be a non-empty string`)
  if (!CMS.has(doc.cms)) out.push(`cms must be joomla, wordpress or emdash, got ${JSON.stringify(doc.cms)}`)
  if (typeof doc.measuredAt === 'string' && Number.isNaN(Date.parse(doc.measuredAt)))
    out.push('measuredAt must be an ISO date')
  if (!Array.isArray(doc.systems) || !doc.systems.length || doc.systems.some((s) => typeof s !== 'string'))
    out.push('systems must be a non-empty list of system ids')
  if (!Array.isArray(doc.modes) || !doc.modes.length || doc.modes.some((m) => !MODES.has(m)))
    out.push('modes must list native and/or derived')
  if (!Array.isArray(doc.controls) || !doc.controls.every(isCount))
    out.push('controls must be a list of difference counts')
  if (!Array.isArray(doc.perSystem) || !doc.perSystem.length) out.push('perSystem must be a non-empty list')
  else
    doc.perSystem.forEach((r, i) => {
      const at = `perSystem[${i}]`
      if (!r || typeof r !== 'object') return out.push(`${at} must be an object`)
      if (!Array.isArray(doc.systems) || !doc.systems.includes(r.system))
        out.push(`${at}.system must be one of systems`)
      if (!VIEWPORTS.has(r.viewport)) out.push(`${at}.viewport must be 1440 or 390`)
      if (!MODES.has(r.mode) || (Array.isArray(doc.modes) && !doc.modes.includes(r.mode)))
        out.push(`${at}.mode must be one of modes`)
      if (r.check !== 'pass' && r.check !== 'fail') out.push(`${at}.check must be pass or fail`)
      if (!isShare(r.match)) out.push(`${at}.match must be 0..1 or null`)
      if (!(r.margin === null || typeof r.margin === 'number'))
        out.push(`${at}.margin must be a number or null`)
      if (r.apart !== undefined && !isFlag(r.apart)) out.push(`${at}.apart must be true, false or null`)
      if (!isShare(r.follows)) out.push(`${at}.follows must be 0..1 or null`)
      for (const k of ['followsSamples', 'followsKept'])
        if (r[k] !== undefined && r[k] !== null && !isCount(r[k]))
          out.push(`${at}.${k} must be a count or null`)
      if (!r.left || typeof r.left !== 'object' || !isShare(r.left.first) || !isShare(r.left.page))
        out.push(`${at}.left must hold first and page shares (0..1 or null)`)
      if (!isCount(r.lowContrast)) out.push(`${at}.lowContrast must be a count`)
      if (!isCount(r.fontsLoaded)) out.push(`${at}.fontsLoaded must be a count`)
      if (!(r.fontsDeclared === null || isCount(r.fontsDeclared)))
        out.push(`${at}.fontsDeclared must be a count or null`)
      for (const k of ['ident', 'modeMatch', 'toggleVisible'])
        if (!isFlag(r[k])) out.push(`${at}.${k} must be true, false or null`)
    })
  if (doc.evidence !== undefined && doc.evidence !== null && typeof doc.evidence !== 'string')
    out.push('evidence must be a path or null')
  // themeToggle: whether the template declares a light/dark switch (the contract's selectors.themeToggle);
  // false makes MODE-2 not applicable, null or absent (the 13/10 sweep) says the run did not know
  if (doc.themeToggle !== undefined && !isFlag(doc.themeToggle))
    out.push('themeToggle must be true, false or null')
  // preview: the Add site preview as a visitor sees it (apps/tracy-web/scripts/preview-check.mjs), one
  // row per system and visitor scheme; absent on files made before 14/10/2026
  if (doc.preview !== undefined && doc.preview !== null) {
    if (!Array.isArray(doc.preview) || !doc.preview.length)
      out.push('preview must be a non-empty list or null')
    else
      doc.preview.forEach((r, i) => {
        const at = `preview[${i}]`
        if (!r || typeof r !== 'object') return out.push(`${at} must be an object`)
        if (typeof r.system !== 'string' || !r.system) out.push(`${at}.system must be a system id`)
        if (r.scheme !== 'light' && r.scheme !== 'dark') out.push(`${at}.scheme must be light or dark`)
        for (const k of PREVIEW_COUNTS) if (!isCount(r[k])) out.push(`${at}.${k} must be a count`)
        if (!isShare(r.keptShare)) out.push(`${at}.keptShare must be 0..1`)
        // probeVersion: the preview probe that measured the row (preview-probe-version.mjs); absent on
        // rows made before it existed, which judgePreview reads as an older probe
        if (r.probeVersion !== undefined && !(Number.isInteger(r.probeVersion) && r.probeVersion > 0))
          out.push(`${at}.probeVersion must be a positive integer`)
        // page: the path of the declared page the row measured (probe 4); absent means the home page
        if (r.page !== undefined && !isPagePath(r.page)) out.push(`${at}.page must be a path starting with /`)
        // detectors: one entry per detector kind the run had (absent on rows made before PR 2 of 14/10)
        if (r.detectors !== undefined) {
          if (!r.detectors || typeof r.detectors !== 'object' || Array.isArray(r.detectors))
            out.push(`${at}.detectors must be an object of detector kinds`)
          else
            for (const [kind, d] of Object.entries(r.detectors)) {
              if (!PREVIEW_KINDS[kind]) out.push(`${at}.detectors.${kind} is not a known detector kind`)
              if (!d || !isCount(d.count)) out.push(`${at}.detectors.${kind}.count must be a count`)
              for (const n of ['unique', 'bySystem'])
                if (d && d[n] !== undefined && !isCount(d[n]))
                  out.push(`${at}.detectors.${kind}.${n} must be a count`)
              if (
                d &&
                d.where !== undefined &&
                (!Array.isArray(d.where) || d.where.some((w) => typeof w !== 'string'))
              )
                out.push(`${at}.detectors.${kind}.where must be a list of strings`)
            }
        }
      })
  }
  // previewPages: every page the template declares (preview-pages.mjs, probe 4); a declared page with
  // no row of a system and scheme is unmeasured for that rule, never a silent pass
  if (doc.previewPages !== undefined && doc.previewPages !== null)
    if (!Array.isArray(doc.previewPages) || !doc.previewPages.length || !doc.previewPages.every(isPagePath))
      out.push('previewPages must be a non-empty list of paths starting with /')
  if (
    doc.previewPagesNote !== undefined &&
    doc.previewPagesNote !== null &&
    typeof doc.previewPagesNote !== 'string'
  )
    out.push('previewPagesNote must be a string')
  // previewMisses: the declared pages a run could not measure, and why (evidence only, not judged)
  if (doc.previewMisses !== undefined && doc.previewMisses !== null)
    if (
      !Array.isArray(doc.previewMisses) ||
      doc.previewMisses.some((m) => !m || typeof m !== 'object' || !isPagePath(m.page))
    )
      out.push('previewMisses must be a list of { page, system, scheme, reason }')
  // previewParity: the popup against the page after Try on (preview-parity.mjs, probe v10)
  out.push(...validateParity(doc.previewParity))
  return out
}

/** A page path as a preview row names it: the demo's own path (and query), from its root. */
const isPagePath = (/** @type {unknown} */ p) => typeof p === 'string' && p.startsWith('/') && p.length < 500

/** The counts one preview row carries (`comparePreview` in design-system-preview-probe.js). */
export const PREVIEW_COUNTS = Object.freeze([
  'kept',
  'glare',
  'keptText',
  'lowText',
  'lostButtons',
  'failedFonts',
  'empty',
  'docs'
])

/**
 * The detector kinds of the preview (PR 2 of 14/10/2026: every error a template shows when wearing a
 * system). Each kind is one file `apps/tracy-web/scripts/preview-detectors/<kind>.mjs` that measures
 * the preview, plus ONE line here: the rule it fails, what /ops says, and how to fix it. A row of the
 * measurement file carries `detectors: { <kind>: { count, where: [selector…] } }`; `judgePreview` adds
 * each kind's count to its rule. A kind cannot be exempted per template: there is no list to pass by.
 * `systemFix`: how to fix the kind when it is the design system's own doing (`systemIssuesOf`).
 * @type {Readonly<Record<string, { rule: string, what: string, fix: string, systemFix?: string }>>}
 */
export const PREVIEW_KINDS = Object.freeze({
  'logo-invisible': {
    rule: 'IDENT-2',
    what: 'logos that vanish on their ground under the system',
    fix: "Give the logo a variant for the system's ground (a light and a dark logo the slot swaps), and drop any blanket invert filter on a logo already made for its ground"
  },
  'template-fonts-left': {
    rule: 'FONT-2',
    what: "text blocks still in the template's own fonts while the page moved to the system's",
    fix: "Make the rule that sets that font read the slot's font variable (--ds-font-body or --ds-font-heading) instead of naming the template's family"
  },
  'reveal-hidden': {
    rule: 'PREV-2',
    what: 'blocks hidden waiting for a scroll-reveal script the preview never runs',
    fix: 'Show every reveal block in the preview: give the slot or the preview page a rule that sets those blocks visible (opacity 1, no transform) when no script runs'
  },
  'gradient-stop': {
    rule: 'GRAD-1',
    what: "gradients with a stop left in the template's colours",
    fix: 'Point every stop of the gradient at the slot (a role per stop, or the palette rule of its selector), not only the first'
  },
  'shape-fill': {
    rule: 'SHAPE-1',
    what: "SVG or CSS shapes filled in the template's colours",
    fix: 'Paint the shape with a slot variable (fill/stroke of the SVG, background or border of the pseudo-element), or currentColor'
  },
  'mock-colour': {
    rule: 'MOCK-1',
    what: 'colours written by hand into the markup (arbitrary utility classes, inline styles)',
    fix: 'Replace the literal in the markup with a token class or var(--…) the slot sets, then rebuild the demo content'
  },
  'accent-surface': {
    rule: 'ACC-1',
    what: "whole sections painted in the system's accent with text that does not read on it",
    fix: 'Map that section ground to a surface role, not the accent, or give its texts the on-accent role'
  },
  'collapsed-button': {
    rule: 'CLIP-1',
    what: 'buttons that collapse or cut their label',
    fix: "Give the button a minimum size and keep its font size and padding when the slot sets the system's radius and type"
  },
  'button-size': {
    rule: 'CLIP-1',
    what: "buttons the system blew up, shrank, or rounded into a pill bigger than its band (size, padding, line height against the template's own page)",
    fix: "Make the button's own rules read the slot's button padding and line height (--ds-btn-pad-y, --ds-btn-pad-x, --ds-btn-leading) in place of adding them to the template's, so the button keeps its place in its band"
  },
  'button-role': {
    rule: 'BTN-1',
    what: "buttons that no longer wear the system's button (its corner radius, its accent fill or outline)",
    fix: "Make the button's corner read --ds-btn-radius and its fill, border and text read the button roles (--ds-c-accent and --ds-c-accent-on, or an outline in --ds-c-accent), not a ground role or the template's own values"
  },
  'logo-doubled': {
    rule: 'IDENT-3',
    what: 'headers or footers where two logos show (one logo shown twice, or more logos than the template shows)',
    fix: "Keep one logo visible per region: hide the extra copy (a drawer or mobile logo, the other scheme's variant) with a CSS rule the preview loads, not a script, and make sure the slot does not override that rule"
  },
  'veil-text': {
    rule: 'CON-2',
    what: 'texts over a picture whose veil the system recoloured until they no longer read',
    fix: "Give the cover's veil a ground role and its words the matching text role (or keep the veil the template's own dark and the words light), so the words read on the veil under every system"
  },
  // G3 of PR 2 (14/10/2026): leftovers the eye saw on dev that every rule above passed
  'off-ground': {
    rule: 'GROUND-1',
    what: 'large blocks or full-width strips on a neutral ground the system does not paint (a text colour or a template grey used as a ground)',
    fix: "Map that block's ground to a ground role of the slot (--ds-c-bg, --ds-c-surface or --ds-c-muted), not to a text colour, and drop the template's own neutral fill"
  },
  'empty-block': {
    rule: 'EMPTY-1',
    what: 'blocks whose content is in the page but none of it shows (words the colour of their ground, pictures that never load, cards with no outline)',
    fix: 'Give the words of the block the text role of its ground, load its pictures without a script (a real src, not only data-src), and give its cards a border or surface role apart from the ground'
  },
  'unstyled-input': {
    rule: 'FORM-1',
    what: "form fields that keep the browser's or the template's look (an own fill off the system, words that do not read, or no shape at all)",
    fix: 'Paint the fields from the slot: background var(--ds-c-surface) or var(--ds-c-bg), color var(--ds-c-fg), border var(--ds-c-border)'
  },
  'sheet-failed': {
    rule: 'PREV-1',
    what: 'stylesheets of the preview that did not load (the page shows unstyled)',
    fix: 'Make every stylesheet of the demo load through the preview (the asset door reads the demo where the preview door reads it), then measure again'
  },
  // E4 of PR 2 (14/10/2026): JA Directory Joomla under Moxie showed YouTube's error box in place of its video
  'embed-error': {
    rule: 'PREV-1',
    what: "embedded third-party content (YouTube, Vimeo, Google Maps…) that shows its provider's error or a blank box in the preview, which runs no script",
    fix: "Give the embed a picture the preview can show without a script: a poster or thumbnail (the video's still, a static map image) that links to the video or map, with the player or map loaded only on a click (or the template's own fallback image), so the preview never shows a bare third-party frame"
  },
  // E1 of PR 2 (14/10/2026): role inversions the eye saw on fleet01 after PR 1356
  'muted-highlight': {
    rule: 'HIER-1',
    what: 'words the template highlighted (a span, strong, em or accent class in a heading or paragraph) that now read quieter than the text around them',
    fix: "Paint the highlighted words with the slot's accent (var(--ds-c-accent)) or the full text role (var(--ds-c-fg)), never the muted text role, so they keep standing out"
  },
  'heading-quiet': {
    rule: 'HIER-2',
    what: 'headings that read quieter than the body text on their own ground',
    fix: 'Paint the headings with the full text role (var(--ds-c-fg)) or the accent, not the muted text role, so the biggest type stays the strongest'
  },
  'button-dark': {
    rule: 'BTN-1',
    what: 'dark buttons (btn-dark, a dark neutral fill) the system painted as the lightest fill of the page, louder than its accent button',
    fix: "Map the template's dark button to the slot's inverse or foreground ground in a way that stays darker than the accent on a dark page (or to the outline button), not to the lightest surface role"
  },
  // E2 of PR 2 (14/10/2026): layouts the system broke while every colour is the system's
  'squeezed-container': {
    rule: 'LAYOUT-1',
    what: "containers the system squeezed (a section or column much narrower than on the template's own page, its words pushed onto what stands beside it)",
    fix: "Find the slot rule that reaches the container's width, margin or columns (a spacing or max-width variable, a padding on a shared class) and scope it to the elements it was meant for, so the template's grid keeps its widths"
  },
  'button-overlap': {
    rule: 'LAYOUT-1',
    what: 'buttons that run into each other once the system dresses them (a pair side by side on the template wraps and overlaps)',
    fix: "Make the button's padding read the slot's button padding in place of adding to the template's, and give the row of buttons a gap and room to wrap (flex-wrap with a gap) so they never cover each other"
  },
  'shrunk-block': {
    rule: 'LAYOUT-2',
    what: 'large links, banners and cards the system shrank (a full-width banner reduced to a pill), beyond the buttons button-size reads, and low strips it blew up (a logo strip grown to a tall empty band)',
    fix: "Keep the slot's button rules (padding, line height, radius) off blocks the template draws as banners or cards: scope them to the template's button classes, or give the block its own height and radius back; keep the section rhythm off strips the template draws without padding (narrow the contract's section selector)"
  },
  'see-through-header': {
    rule: 'HEADER-1',
    what: 'fixed or sticky headers with no ground of their own, so the content shows through them as the page scrolls',
    fix: 'Give the fixed header a ground role of the slot (background var(--ds-c-bg) or var(--ds-c-surface)) in the preview, where no script turns it solid on scroll'
  },
  'layout-drift': {
    rule: 'LAYOUT-3',
    what: "rows, columns and form groups whose layout moved from the template's own page (a row that was one line wraps, a child moves to another line or changes order, a grid changes its column count, a block slides along its row, a field or button changes width or height)",
    fix: "Keep the slot's rules off the box metrics that lay the row out (padding, font size, line height, letter spacing, width, display of the form controls and the row's children): the slot may change colours, faces, radii and shadows only. Find the rule that reaches the moved box and scope it out, or give the row back the template's own metrics"
  },
  // JA Kinetic acceptance (Akemi, 14/10/2026): four things the eye saw that every kind above passed
  'heading-edge': {
    rule: 'LAYOUT-1',
    what: "headings whose words run to or past the window's edge under the system (a wider display face at the template's size: the title spills out of its box)",
    fix: "Size the heading for the system's face where the template sets a large fixed size (a worn-only font-size that fits the box, e.g. min(<template size>, <box width> / <ems the longest word needs>)), or let it wrap"
  },
  'edge-split': {
    rule: 'LAYOUT-3',
    what: "sections that start at one left edge on the template's page and at several under the system (a container the system widened or narrowed while the others kept the template's width)",
    fix: "Give the system's container width to every container of the template (name all of them in the contract's container selector), and let it win over the template's own fixed widths, so every section keeps one left edge"
  },
  'struck-text': {
    rule: 'CON-2',
    what: "words a drawn line (a timeline connector, a rule) now runs through: a hairline on the template's page that the system turned into a hard stroke",
    fix: "Give the words a ground of their own that masks the line (the band's ground role), or keep the line as quiet as the template draws it, so it never strikes through the words"
  },
  'heading-split': {
    rule: 'HIER-2',
    what: 'headings the template paints alike that take different colours under the system (one section heading in the body text colour while the others take the heading colour)',
    fix: "Let the odd heading read the template's heading variable (or give it the system's heading role) instead of a palette rule that recoloured it as text"
  },
  'loud-band': {
    rule: 'GROUND-2',
    what: "full-width bands the template lifts a hair off the page that the system turned into blocks (its card surface where the template's raised ground is barely apart)",
    fix: "Map the template's raised ground (its 'elevated' variable) to the system's quiet raised surface (--ds-c-surface-warm), not to its card surface"
  },
  // E3 of PR 2 (14/10/2026): what the eye saw after PR 1 and no rule read
  'icon-invisible': {
    rule: 'ICON-1',
    what: 'icon controls (menu toggles, icon buttons) whose glyph the system painted into their ground',
    fix: "Paint the control's bars, glyph or SVG with the text role of the ground it sits on (--ds-c-fg, or --ds-c-accent-on on an accent fill), not the ground's own role"
  },
  'hover-unreadable': {
    rule: 'HOVER-1',
    what: 'buttons and links whose hover or focus state the system made unreadable',
    fix: "Give the :hover and :focus rules of that button or link a fill and a text role that read together (--ds-c-accent with --ds-c-accent-on, or --ds-c-fg on --ds-c-bg), not a ground role with the template's own white or black"
  },
  // JA Restaurant code review (20/10/2026): a grey hover mapped to the same surface role as its rest state.
  // Added within probe 10 without a bump (`addedWithin`): a file measured before it has no row for the kind,
  // and HOVER-2 then reads "not measured yet" outside the step's numbers instead of holding the release
  'hover-same': {
    rule: 'HOVER-2',
    addedWithin: 10,
    what: "buttons and links whose hover or focus state looks exactly like their rest state under the system, while the template's own page changes it",
    fix: 'Give the :hover and :focus rules a role apart from the rest one: --ds-c-surface-hover for a grey ground on a surface, --ds-c-accent-hover for an accent fill, --ds-c-accent-text-hover for accent words, never the same role as the rest state'
  },
  'pseudo-colour': {
    rule: 'TPL-1',
    what: "pseudo-elements (::before, ::after) still in the template's colours while their element wears the system",
    fix: "Paint the pseudo-element's background, border and color from the same slot role as its element (or currentColor), not the template's own value"
  },
  'border-colour': {
    rule: 'TPL-1',
    what: "borders still in the template's brand colours",
    fix: "Make the border read a slot role (--ds-c-accent for a brand line, --ds-c-border for a rule), not the template's own colour"
  },
  'status-hue': {
    rule: 'TPL-1',
    what: "labels still in the template's brand hue through a status colour (its warn, danger or success painted as an accent)",
    fix: 'Paint a label that uses a status colour as its accent (an eyebrow, a card meta, a kicker) with the accent role (--ds-c-accent-text); keep the status roles for real messages'
  },
  'unworn-page': {
    rule: 'TPL-1',
    what: "pages that did not wear the system: most of their large grounds and their accent stay the template's own colours, far from every colour of the system",
    fix: "Find the template rule that sets its colours above the slot (presets or variables pinned on the html element, a body class, a page style) and make the slot's roles win there, as they do on the template's other pages"
  },
  'harsh-border': {
    rule: 'BORDER-1',
    what: "hard light lines on a dark ground, far above the system's border role (a text colour used as a line)",
    fix: 'Map the line to the border role of the slot (--ds-c-border), not to the text colour, so grid and card rims stay as faint as the system draws them',
    systemFix:
      "Set the system's own border role (its border colour in the library entry) to a faint line, not its text colour: every template wearing it inherits the hard lines"
  },
  // Akemi's eye check of 17/10/2026 (JA Tour, Vital, Sensei): what she saw at a glance that every kind above
  // passed. Dormant until preview probe 10 (`since` of each detector file); they judge existing rules only
  'empty-box': {
    rule: 'EMPTY-1',
    what: 'empty boxes the system drew where the template draws nothing (an empty container that took a border, a fill or a padding)',
    fix: "Keep the slot's border, fill and padding off containers the template leaves empty (Joomla's #system-message-container, an empty module position): scope the rule to boxes with content, or :not(:empty)"
  },
  'missing-element': {
    rule: 'LAYOUT-3',
    what: 'elements the template shows that disappear under the system (a button, a link, a picture, an icon), or a mark (a timeline dot, a bullet) it paints into its ground',
    fix: 'Find the slot rule that hides or collapses the element (display, visibility, a zero size, a colour the same as its ground with no box) and scope it out, so every element of the template stays'
  },
  'caret-shape': {
    rule: 'SHAPE-1',
    what: 'CSS triangles (dropdown carets, arrows drawn by borders) the system turned into bars or boxes',
    fix: "Paint only the caret's coloured side from the slot (border-top-color: currentColor or a slot role) and leave its other sides transparent; never set border-color on all sides of a caret"
  },
  'icon-font': {
    rule: 'ICON-1',
    what: 'icons whose icon font the system replaced with its text font (the glyph shows as an empty square)',
    fix: "Keep the slot's font-family off icon elements: scope the body or heading font away from [class*=fa-], [class*=icon-], i and their ::before/::after, or set the icon font back on them"
  },
  'icon-contrast': {
    rule: 'ICON-1',
    what: 'icon glyphs the system painted into their ground (an input addon, a badge, a list marker)',
    fix: 'Paint the glyph with the text role of the ground it sits on (--ds-c-fg, or --ds-c-accent-on on an accent fill), or give the addon a ground role the glyph reads on'
  },
  'photo-text': {
    rule: 'CON-2',
    what: 'words laid on a photograph that the system recoloured into its tones (a light card label turned dim)',
    fix: "Keep words on a photograph in the template's own light (or dark) colour, or give them the on-ink text role, not a muted or accent role made for a plain ground"
  },
  'band-geom': {
    rule: 'LAYOUT-2',
    what: "wide blocks whose height the system changed by half or more against the template's own page (a banner collapsed, a section blown up)",
    fix: "Find the slot rule that reaches the block's height (a font size, a padding, a line height on a broad selector) and scope it out, so the block keeps the template's height"
  },
  // Akemi's eye check of 17/10/2026, second round (JA Resume, Vital, Voyara, Impact); dormant until probe 10
  'icon-offcentre': {
    rule: 'ICON-1',
    what: "icon buttons whose glyph the system pushed off the button's centre (a back-to-top chevron)",
    fix: "Keep the slot's button padding and size off icon-only buttons (scope selectors.button away from them, e.g. .btn:not(.back-to-top .btn)), so the glyph stays where the template centres it"
  },
  'button-crowding': {
    rule: 'LAYOUT-1',
    what: 'buttons that sit on the block below them with no room between (a VIEW MORE touching the cards under it)',
    fix: "Give the button room below it in the template (a margin from the grid it leads into), or find the slot or template rule that collapsed that space; the template's own page counts too"
  },
  'template-cut-label': {
    rule: 'CLIP-1',
    what: "buttons whose label the template's own page cuts while the system's page shows it whole (a Subscribe shown as Subs in Template default)",
    fix: 'Size the button to its words in the template itself (auto width, a side padding, no wrap), not only under a system: a customer who takes the system off sees the template again'
  },
  'row-shape': {
    rule: 'BTN-1',
    what: 'buttons that took a corner of their own in a row of same-height cells (a header call to action rounded beside square menu cells)',
    fix: "Leave the row cell out of selectors.button and keep the row's corner in the template (border-radius of the row, with a ds-keep note), or round the whole row; its fill may still follow the accent"
  },
  'foreign-colour': {
    rule: 'FOREIGN-1',
    what: 'colours in neither palette: neither a colour of the system nor one the template paints with',
    fix: 'Find the rule that paints that colour (a preset or a role mapped to a stale value) and point it at a slot role'
  },
  // Akemi, 17/10/2026 (JA Phio, Tour, Impact, Vega): a rule of its own, born at probe 10. `since` keeps the kind
  // AND its rule out of every judgement before that probe (activeKinds), so no file measured at 9 reads it as unmeasured
  'accent-leak': {
    rule: 'ACCENT-LEAK',
    since: 10,
    what: "places still in the template's own brand colour under the system (a fill, words, a border, an icon, a hover, a gradient or a picture in the template's hue)",
    fix: "Point the rule that paints it at the slot's accent (var(--ds-c-accent) and its -text / -on shades, with the template's colour as the fallback); a picture drawn in the brand colour becomes a mask, an SVG flood or a gradient painted with the accent under a system"
  }
})

/**
 * The rules whose every detector kind joined the current probe after files were measured with it
 * (`addedWithin` equal to the probe): a file with no row for them leaves them out of the step's numbers
 * ("not measured yet") rather than unmeasured, so a release judged green stays green until it is measured
 * again (HOVER-2, 20/10/2026). Once the probe moves past `addedWithin`, they weigh like any other rule.
 * @param {Record<string, { rule: string, addedWithin?: number }>} registry @param {number} probe
 */
const lateRules = (registry, probe) => {
  const byRule = new Map()
  for (const k of Object.values(registry)) {
    const late = k.addedWithin === probe
    byRule.set(k.rule, (byRule.get(k.rule) ?? true) && late)
  }
  return new Set([...byRule].filter(([, late]) => late).map(([id]) => id))
}

/**
 * The detector kinds a probe version judges: a kind with `since` above it is dormant (its detector does not
 * run, preview-detectors/index.mjs), and so is its rule when no other kind of that probe names it.
 * @param {Record<string, { rule: string, since?: number }>} [registry] @param {number} [probe]
 */
export const activeKinds = (registry = PREVIEW_KINDS, probe = PREVIEW_PROBE_VERSION) =>
  Object.fromEntries(
    Object.entries(registry).filter(
      ([, k]) => !Number.isInteger(k.since) || /** @type {number} */ (k.since) <= probe
    )
  )

/** The preview rules: the four of PR 1356 and any rule a detector kind names. */
export const previewRuleIds = (kinds = PREVIEW_KINDS, probe = PREVIEW_PROBE_VERSION) => [
  ...new Set([
    'TPL-1',
    'CON-2',
    'BTN-1',
    'PREV-1',
    ...Object.values(activeKinds(kinds, probe)).map((k) => k.rule)
  ])
]

/**
 * The folder the file lives in when it travels with a contract fix (no re-release), relative to the
 * tch root, and the file name. Joomla and WordPress quickstarts keep one folder per version under
 * their contracts; an EmDash theme is one CMS, so no `<cms>` level.
 * @param {{ cms: string, template: string, tag: string, version: string }} doc
 */
export function measurementPath(doc) {
  const cmsDir = String(doc.tag).split('/').at(-1)
  if (doc.cms === 'joomla')
    return `packages/cms/tracy-joomla-quickstart/contracts/${doc.template}/${cmsDir}/${doc.version}/design-system-measurement.json`
  if (doc.cms === 'wordpress')
    return `packages/cms/tracy-wordpress-quickstart/contracts/${doc.template}/${cmsDir}/${doc.version}/design-system-measurement.json`
  const slug = String(doc.template).replace(/^tracy-/, '')
  return `packages/cms/tracy-emdash-theme-${slug}/contracts/${doc.version}/design-system-measurement.json`
}

/**
 * The ids Add site offers a template under that are not its release slug (14/10/2026): Tracy Base is
 * the card `tracy` on Joomla and WordPress and `tracy-base` on EmDash, while every release of it is
 * tagged `tracy-base/...`. Mirrored in apps/tracy-web template-design-system-readiness/readers/measurement.js
 * (a test holds the two equal).
 */
export const CARD_ALIASES = Object.freeze(/** @type {Record<string, string>} */ ({ tracy: 'tracy-base' }))

/**
 * The template line a tag names, whatever spelling it comes in: a release tag (`quickstart/ja-vega/j6`,
 * `tracy-base/emdash-0.x`), a local pack (`local/...`), a pin of quickstarts.json (`tracy-base/emdash`)
 * or an Add site card id (`tracy/j6`). Two spellings of one line give one `key`, so a measured
 * preview row, a demo and a published line can never miss each other on a slug. Null for a tag that
 * names no line.
 * @param {{ platform: string, tag: string }} line
 * @returns {{ cms: string, template: string, cmsDir: string, key: string } | null}
 */
export function previewLineOf({ platform, tag }) {
  if (!CMS.has(platform)) return null
  const parts = String(tag ?? '')
    .replace(/^local\//, '')
    .replace(/^quickstart\//, '')
    .split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const template = CARD_ALIASES[parts[0]] ?? parts[0]
  // an EmDash theme is one CMS: `emdash` and `emdash-0.x` are one line
  const cmsDir = platform === 'emdash' ? 'emdash' : parts[1]
  return { cms: platform, template, cmsDir, key: `${platform} ${template}/${cmsDir}` }
}

/**
 * The folder holding one version folder per measured version of a line, relative to the tch root.
 * @param {{ cms: string, template: string, cmsDir: string }} line
 */
export function measurementLineDir(line) {
  const file = measurementPath({
    cms: line.cms,
    template: line.template,
    tag: `${line.template}/${line.cmsDir}`,
    version: '0'
  })
  return file.split('/').slice(0, -2).join('/')
}

/** @param {any} x @returns {number | null} */
const share = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null)

/**
 * A measurement file from a judged `flow.json` (flow.mjs: `rows` + `verdicts`). The verdicts are
 * read, never the pass word: the numbers travel, /ops scores.
 * @param {{ verdicts: any[], rows?: any[], refused?: any[] }} flow
 * @param {{ template: string, cms: string, tag: string, version: string, measuredAt?: string, machine: string, measuredBy: string, flowVersion?: string | null, systems: string[], mode?: 'native' | 'derived', evidence?: string | null, themeToggle?: boolean | null }} meta
 */
export function fromFlow(flow, meta) {
  const mode = meta.mode ?? 'native'
  const systems = flow.verdicts.filter((v) => v.kind === 'system')
  const controls = flow.verdicts.filter((v) => v.kind === 'control').map((v) => v.differences ?? 0)
  // a verdict names its system through the row of its step
  const idOf = (v) => (flow.rows ?? []).find((r) => r.step === v.step)?.id ?? null
  const perSystem = systems.map((v) => ({
    system: idOf(v) ?? meta.systems[0],
    viewport: v.vw === 'phone' ? 390 : 1440,
    // a verdict of the derived side (flow.mjs, a template with two modes) says so itself
    mode: v.mode === 'derived' ? 'derived' : mode,
    check: v.pass ? 'pass' : 'fail',
    match: share(v.match),
    margin: typeof v.margin === 'number' ? v.margin : null,
    // whether the flow told the worn system apart from every other (flow.mjs `apart`); null before 15/10/2026
    apart: typeof v.apart === 'boolean' ? v.apart : null,
    follows: share(v.follows?.rate),
    // what follows counted, and what it left out because the contract keeps it as the template paints it
    // (keepWhole, kept bands, paletteKeep); null on files made before 15/10/2026
    followsSamples: typeof v.follows?.samples === 'number' ? v.follows.samples : null,
    followsKept: typeof v.follows?.kept === 'number' ? v.follows.kept : null,
    left: { first: share(v.left?.first?.share), page: share(v.left?.page?.share) },
    lowContrast: (v.contrast ?? []).filter((c) =>
      c.regressed === undefined ? c.ratio < THRESHOLDS.contrastFloor : c.regressed
    ).length,
    lowestContrast: (v.contrast ?? []).length ? Math.min(...v.contrast.map((c) => c.ratio)) : null,
    misses: (v.misses ?? []).map((m) => String(m).split('=')[0]),
    fontsLoaded: Number(v.fontsLoaded ?? 0),
    fontsDeclared: typeof v.fontsDeclared === 'number' ? v.fontsDeclared : null,
    // of the families the system loads, how many the page had loaded (flow.mjs); null for a run that
    // counted every loaded face instead (the 13/10 sweep)
    systemFontsLoaded: typeof v.systemFontsLoaded === 'number' ? v.systemFontsLoaded : null,
    ident: v.ident ?? null,
    modeMatch: v.modeMatch ?? null,
    toggleVisible: v.toggleVisible ?? null,
    shot: v.shot ?? null
  }))
  return {
    schemaVersion: MEASUREMENT_SCHEMA,
    template: meta.template,
    cms: meta.cms,
    tag: meta.tag,
    version: meta.version,
    measuredAt: meta.measuredAt ?? new Date().toISOString(),
    machine: meta.machine,
    measuredBy: meta.measuredBy,
    flowVersion: meta.flowVersion ?? null,
    modes: [...new Set(perSystem.map((r) => r.mode))],
    systems: meta.systems,
    perSystem,
    controls,
    evidence: meta.evidence ?? null,
    // only when the run knows (the default page had the switch, or had none)
    ...(typeof meta.themeToggle === 'boolean' ? { themeToggle: meta.themeToggle } : {})
  }
}

/**
 * A measurement file from one row of a sweep summary (`results.jsonl` of the 13/10/2026 sweep): the
 * row holds follows, left, fonts and low-contrast findings per system × viewport, and the four
 * control differences. Role match and margin per view are not in a row (only the misses), so they
 * are `null`; `check` is derived from the row's `pass` count where possible.
 * @param {any} row
 * @param {{ measuredAt: string, machine: string, measuredBy: string, flowVersion?: string | null, evidence?: string | null, modeMatch?: Record<string, boolean>, ident?: Record<string, boolean>, themeToggle?: boolean | null }} meta
 */
export function fromSweepRow(row, meta) {
  const systems = row.systems
  const n = systems.length
  const lows = (row.lowContrast ?? []).map((s) => {
    const m = /^([^/]+)\/(desktop|phone):/.exec(String(s))
    return m ? { label: m[1], vw: m[2] } : null
  })
  const perSystem = []
  systems.forEach((system, si) => {
    for (const [vi, vw] of [
      [0, 'desktop'],
      [1, 'phone']
    ]) {
      const k = si * 2 + vi
      const left = row.left?.[k]
      const label = labelOf(system)
      const lowContrast = lows.filter((l) => l && l.label === label && l.vw === vw).length
      const misses = row.misses ?? []
      perSystem.push({
        system,
        viewport: vw === 'phone' ? 390 : 1440,
        mode: 'native',
        // a row carries the count of passing checks, not which: a view is read as failed when the row
        // names a role miss or a low-contrast text for it; otherwise as the row's overall verdict
        check:
          misses.length || lowContrast ? 'fail' : row.pass === `${n * 2 + 4}/${n * 2 + 4}` ? 'pass' : 'fail',
        match: null,
        margin: null,
        follows: share(row.follows?.[k]),
        left: { first: share(left?.[0]), page: share(left?.[1]) },
        lowContrast,
        lowestContrast: null,
        misses,
        fontsLoaded: Number(row.fonts?.[k] ?? 0),
        fontsDeclared: null,
        systemFontsLoaded: null,
        ident: meta.ident?.[system] ?? null,
        modeMatch: meta.modeMatch?.[system] ?? null,
        toggleVisible: null,
        shot: null
      })
    }
  })
  return {
    schemaVersion: MEASUREMENT_SCHEMA,
    template: row.id,
    cms: row.cms,
    tag: row.tag,
    version: row.version,
    measuredAt: meta.measuredAt,
    machine: meta.machine,
    measuredBy: meta.measuredBy,
    flowVersion: meta.flowVersion ?? null,
    modes: ['native'],
    systems,
    perSystem,
    controls: row.controls ?? [],
    evidence: meta.evidence ?? null,
    ...(typeof meta.themeToggle === 'boolean' ? { themeToggle: meta.themeToggle } : {})
  }
}

/** The label a sweep row prints for a system id (`BMW/desktop:…`). */
export const labelOf = (system) => {
  const known = {
    'od:bmw': 'BMW',
    'od:stripe': 'Stripe',
    stripe: 'Stripe',
    'od:spotify': 'Spotify',
    'od:vercel': 'Vercel',
    'od:apple': 'Apple',
    'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0': 'Moxie'
  }
  return known[system] ?? system
}

/**
 * The eight built-site rules from the numbers of one file. Each rule answers `pass`, `fail`, `warn`
 * (measured, within the warning band or a soft miss) or `unmeasurable` (the run could not read it:
 * never counted as a pass). `note` says what the number was.
 * @param {ReturnType<typeof fromFlow>} doc
 * @param {typeof THRESHOLDS} [t]
 * @param {{ mode?: 'native' | 'derived', systemIssues?: any }} [opts]  which mode's rows to judge (default native);
 *   `systemIssues`: the kinds a design system causes on most templates (`systemIssuesOf`), not counted here
 * @returns {Record<string, { status: 'pass' | 'fail' | 'warn' | 'unmeasurable', note: string }>}
 */
export function judgeMeasurement(doc, t = THRESHOLDS, opts = {}) {
  const mode = opts.mode ?? 'native'
  const rows = (doc.perSystem ?? []).filter((r) => r.mode === mode)
  const where = (r) => `${labelOf(r.system)}/${r.viewport}`
  const pct = (x) => `${Math.round(x * 100)}%`
  /** @type {Record<string, { status: 'pass' | 'fail' | 'warn' | 'unmeasurable' | 'not-applicable', note: string }>} */
  const out = {}
  if (!rows.length) {
    for (const id of BUILT_SITE_RULES) out[id] = { status: 'unmeasurable', note: `no ${mode} rows measured` }
    return out
  }

  // ROLE-1: every view matches its system (match, margin when measured; the role misses when not) and
  // enough of the page follows
  // The margin over the other systems is judged as the flow judges it (`apart`): only as far as two systems
  // differ on what the page measures, so two systems that want the same page need none — a run of 15 systems
  // holds such pairs, margin 0 rightly (15/10/2026: 27 files failed ROLE-1 on a margin the flow had passed).
  // A file without `apart`: a view the flow passed was told apart (its pass holds the margin test since
  // 09/10/2026); otherwise the bare margin
  const marginBad = (r) =>
    typeof r.apart === 'boolean'
      ? !r.apart
      : r.check !== 'pass' && r.margin !== null && r.margin < t.roleMargin
  const roleBad = rows.filter(
    (r) =>
      (r.match !== null && r.match < t.roleMatch) ||
      marginBad(r) ||
      (r.match === null && (r.misses ?? []).length > 0)
  )
  const followBad = rows.filter((r) => r.follows !== null && r.follows < t.followsFloor)
  const followMin = Math.min(...rows.map((r) => (r.follows === null ? 1 : r.follows)))
  // what follows read and what it left out as kept by the contract, so a reader sees how much of the page was judged
  const keptNote = (/** @type {any[]} */ list) => {
    const counted = list.filter(
      (r) => typeof r.followsSamples === 'number' && typeof r.followsKept === 'number'
    )
    if (!counted.length) return ''
    const lo = counted.reduce((a, r) => (r.followsSamples < a.followsSamples ? r : a))
    return ` (${lo.followsSamples} paints read, ${lo.followsKept} kept by the contract left out, on ${where(lo)})`
  }
  out['ROLE-1'] =
    roleBad.length || followBad.length
      ? {
          status: 'fail',
          note: [
            roleBad.length
              ? `roles miss on ${roleBad.map(where).join(', ')}${roleBad[0].misses?.length ? ` (${[...new Set(roleBad.flatMap((r) => r.misses))].join(', ')})` : ''}`
              : null,
            followBad.length
              ? `page follows only ${pct(followMin)} (floor ${pct(t.followsFloor)}) on ${followBad.map(where).join(', ')}${keptNote(followBad)}`
              : null
          ]
            .filter(Boolean)
            .join('; ')
        }
      : {
          status: 'pass',
          note: `roles match on every view; page follows at least ${pct(followMin)}${keptNote(rows)}`
        }

  // SCREEN-1: the first screen's template colours by area; null = nothing to read on that view
  const measured = rows.filter((r) => r.left?.first !== null && r.left?.first !== undefined)
  const screenBad = measured.filter((r) => r.left.first > t.leftFirstMax)
  const screenMax = measured.length ? Math.max(...measured.map((r) => r.left.first)) : null
  out['SCREEN-1'] = screenBad.length
    ? {
        status: 'fail',
        note: `${pct(screenMax)} of the first screen still wears the template's colours (max ${pct(t.leftFirstMax)}) on ${screenBad.map(where).join(', ')}`
      }
    : !measured.length
      ? { status: 'unmeasurable', note: 'the first screen is all pictures on every view; nothing to read' }
      : measured.length < rows.length
        ? {
            status: 'warn',
            note: `at most ${pct(screenMax)} left where readable; ${rows.length - measured.length} view(s) all pictures`
          }
        : {
            status: 'pass',
            note: `at most ${pct(screenMax)} of the first screen keeps the template's colours`
          }

  // CON-1: a text that reads worse than the same text on the default page and under the floor
  const conBad = rows.filter((r) => r.lowContrast > 0)
  const lowest = rows.map((r) => r.lowestContrast).filter((x) => typeof x === 'number')
  out['CON-1'] = conBad.length
    ? {
        status: 'fail',
        note: `${conBad.reduce((a, r) => a + r.lowContrast, 0)} text(s) read worse than the template on ${conBad.map(where).join(', ')}${lowest.length && Math.min(...lowest) < t.contrastWarn ? ` (lowest ${Math.min(...lowest).toFixed(2)}:1, under ${t.contrastWarn}:1)` : ''}`
      }
    : { status: 'pass', note: 'every text reads at least as well as on the template' }

  // UNDO-1: the four controls (no system, undo; 1440, 390) show nothing of a system
  const controls = doc.controls ?? []
  out['UNDO-1'] = !controls.length
    ? { status: 'unmeasurable', note: 'no control view measured' }
    : controls.every((n) => n === 0)
      ? { status: 'pass', note: `${controls.length} controls, 0 differences` }
      : {
          status: 'fail',
          note: `${controls.filter((n) => n > 0).length} control view(s) differ from the template (${controls.join(', ')})`
        }

  // FONT-1: the system's faces load (the families it loads, counted when the run knew them; else every
  // loaded face); a system of proprietary faces loads none and asks nothing; a run that did not count
  // the declared faces can only warn
  const loadedOf = (r) => r.systemFontsLoaded ?? r.fontsLoaded
  const fontBad = rows.filter((r) => loadedOf(r) === 0 && (r.fontsDeclared === null || r.fontsDeclared > 0))
  out['FONT-1'] = !fontBad.length
    ? { status: 'pass', note: 'the system fonts load on every view' }
    : fontBad.some((r) => r.fontsDeclared !== null)
      ? { status: 'fail', note: `no system font loaded on ${fontBad.map(where).join(', ')}` }
      : {
          status: 'warn',
          note: `no font loaded on ${fontBad.map(where).join(', ')} (declared faces not counted by this run)`
        }

  // IDENT-1, MODE-1, MODE-2: flags a probe sets; a run without the probe cannot answer
  const flag = (id, key, failNote, passNote) => {
    const read = rows.filter((r) => r[key] !== null && r[key] !== undefined)
    const bad = read.filter((r) => r[key] === false)
    out[id] = !read.length
      ? { status: 'unmeasurable', note: `${key} not measured by this run` }
      : bad.length
        ? { status: 'fail', note: `${failNote} on ${bad.map(where).join(', ')}` }
        : { status: 'pass', note: passNote }
  }
  flag(
    'IDENT-1',
    'ident',
    'the logo or brand mark is empty, shrunk or unreadable on its ground',
    'the logo shows on every view'
  )
  flag(
    'MODE-1',
    'modeMatch',
    "the page's light or dark does not match the system",
    'the page mode matches the system on every view'
  )
  const derived = (doc.perSystem ?? []).filter((r) => r.mode === 'derived')
  const toggles = rows.filter((r) => r.toggleVisible !== null && r.toggleVisible !== undefined)
  // a template with no light/dark switch has nothing MODE-2 can lose: not applicable, never
  // "not measured" (phase 2 of spec decision 11 holds Publish on unmeasured rules)
  out['MODE-2'] =
    doc.themeToggle === false && !toggles.length
      ? { status: 'not-applicable', note: 'the template has no light/dark switch' }
      : !toggles.length
        ? { status: 'unmeasurable', note: 'the theme toggle was not measured by this run' }
        : toggles.some((r) => r.toggleVisible === false)
          ? {
              status: 'fail',
              note: `the theme toggle disappears on ${toggles
                .filter((r) => r.toggleVisible === false)
                .map(where)
                .join(', ')}`
            }
          : !derived.length
            ? { status: 'warn', note: 'the toggle stays, but the second mode was not measured' }
            : derived.some((r) => r.check === 'fail')
              ? { status: 'fail', note: 'the second mode does not follow the system' }
              : { status: 'pass', note: 'both modes follow the system and the toggle stays' }
  Object.assign(
    out,
    judgePreview(
      doc.preview,
      t,
      PREVIEW_KINDS,
      opts.systemIssues ?? null,
      PREVIEW_PROBE_VERSION,
      doc.previewPages ?? null
    )
  )
  if (BUILT_SITE_RULES.includes(PARITY_RULE))
    out[PARITY_RULE] = judgeParity(doc.previewParity, {
      probe: PREVIEW_PROBE_VERSION,
      pages: doc.previewPages ?? null,
      label: labelOf
    })
  // a multilingual site's page sampling (preview-pages.mjs localeSampleOf), said on every preview rule
  if (typeof doc.previewPagesNote === 'string' && doc.previewPagesNote)
    for (const id of previewRuleIds(PREVIEW_KINDS, PREVIEW_PROBE_VERSION))
      if (out[id]?.note) out[id] = { ...out[id], note: `${out[id].note} (pages: ${doc.previewPagesNote})` }
  return out
}

/** What a preview rule says when its rows were measured by an older preview probe. */
export const STALE_PROBE_NOTE = 'measured with an older preview probe — measure again'

/** Whether a preview row was measured by the current probe (`probeVersion` at least `probe`). */
const isCurrentProbe = (/** @type {any} */ r, probe = PREVIEW_PROBE_VERSION) =>
  Number.isInteger(r?.probeVersion) && r.probeVersion >= probe

/**
 * The probe the preview rows of a file were measured with, for the stamp on /ops: the lowest
 * `probeVersion` of the rows (null when a row has none) and whether every row is current.
 * @param {any[] | null | undefined} preview
 * @returns {{ version: number | null, current: boolean } | null} null when there are no rows
 */
export function previewProbeOf(preview, probe = PREVIEW_PROBE_VERSION) {
  if (!Array.isArray(preview) || !preview.length) return null
  const versions = preview.map((r) => (Number.isInteger(r?.probeVersion) ? r.probeVersion : null))
  const version = versions.includes(null) ? null : Math.min(.../** @type {number[]} */ (versions))
  return { version, current: preview.every((r) => isCurrentProbe(r, probe)) }
}

/**
 * The four preview rules (Akemi, 14/10/2026: the Add site preview of JA Impact, Kinetic and Resort
 * under Moxie looked broken while every built-site rule passed): judged on what a visitor of the
 * preview sees, the template's own page against the same page wearing each system.
 * - TPL-1: no colour block, glare block or brand-coloured text of the template's own left visible;
 * - CON-2: no text the system made unreadable (under previewTextFloor);
 * - BTN-1: no button that lost its shape;
 * - PREV-1: the preview is one document, its fonts load, no main block renders empty.
 * @param {any[] | null | undefined} preview
 * @param {typeof THRESHOLDS} [t]
 * @param {Record<string, { rule: string, what: string, fix: string }>} [registry] the detector kinds (tests pass their own)
 * @param {{ systems: Record<string, Record<string, any>> } | null} [systemIssues] kinds a system causes on most
 *   templates (`systemIssuesOf`): on a row of that system they are the system's, listed under `systemIssues`
 *   and not counted against the template
 * @param {number} [probe] the current preview probe version
 * @param {string[] | null} [pages] every page the template declares (`previewPages` of the file); a
 *   declared page with no row under some system and scheme leaves the rule unmeasured
 */
export function judgePreview(
  preview,
  t = THRESHOLDS,
  registry = PREVIEW_KINDS,
  systemIssues = null,
  probe = PREVIEW_PROBE_VERSION,
  pages = null
) {
  // a kind born after this probe (its `since`) is dormant: neither it nor a rule only it names is judged
  registry = activeKinds(registry, probe)
  const ids = previewRuleIds(registry, probe)
  const late = lateRules(registry, probe)
  if (!Array.isArray(preview) || !preview.length)
    return Object.fromEntries(
      ids.map((id) => [id, { status: 'unmeasurable', note: 'the preview was not measured' }])
    )
  const at = (/** @type {any} */ r) => `${labelOf(r.system)}/${r.scheme}`
  // rows an older probe measured (or one from before probeVersion) are not read: the current probe
  // could see what the old one missed, so they never make a pass (Akemi, 14/10/2026)
  const stale = preview.filter((r) => !isCurrentProbe(r, probe))
  if (stale.length === preview.length)
    return Object.fromEntries(
      ids.map((id) => [id, { status: 'unmeasurable', note: STALE_PROBE_NOTE, kinds: [] }])
    )
  if (stale.length) {
    const judged = judgePreview(
      preview.filter((r) => isCurrentProbe(r, probe)),
      t,
      registry,
      systemIssues,
      probe,
      pages
    )
    const note = `${STALE_PROBE_NOTE} on ${[...new Set(stale.map(at))].join(', ')}`
    for (const r of Object.values(judged))
      if (r.status === 'pass') Object.assign(r, { status: 'unmeasurable', note })
    return judged
  }
  // Every page the template declares (Akemi, 15/10/2026: a customer who wears a system gets the whole
  // site restyled, not the home page alone). A row names its page (absent: the home page); the
  // declared list comes with the file (`previewPages`), else it is the pages the rows name.
  const declared =
    Array.isArray(pages) && pages.length ? [...new Set(pages)] : [...new Set(preview.map(pageOf))]
  const groups = [...new Set(preview.map(at))]
  // a row whose stylesheets did not load measured an unstyled page: every other finding on it is the
  // missing CSS, not the system (14/10/2026, dev's 502 asset door). Such a row counts for PREV-1 only;
  // the other rules are judged on the rows that loaded, and are unmeasurable when none did.
  const unstyled = (/** @type {any} */ r) => (r.detectors?.['sheet-failed']?.count ?? 0) > 0
  const styled = preview.filter((r) => !unstyled(r))
  const rowsFor = (/** @type {string} */ id) => (id === 'PREV-1' ? preview : styled)
  // the declared pages a rule cannot judge: no row under some system and scheme, or (a rule other
  // than PREV-1) only unstyled rows. Unmeasured, never a pass.
  const missingFor = (/** @type {string} */ id) =>
    declared.filter(
      (p) =>
        groups.some((g) => !preview.some((r) => pageOf(r) === p && at(r) === g)) ||
        !rowsFor(id).some((r) => pageOf(r) === p)
    )
  const judge = (
    /** @type {(r: any) => number} */ count,
    /** @type {string} */ what,
    /** @type {string} */ ok,
    /** @type {string} */ id
  ) => {
    const bad = rowsFor(id).filter((r) => count(r) > 0)
    return bad.length
      ? { status: 'fail', note: `${what}: ${spreadText(spreadOf(bad, count, at))}` }
      : { status: 'pass', note: ok }
  }
  const base = {
    'TPL-1': judge(
      (r) => r.kept + r.glare + r.keptText,
      "the template's own colours stay visible in the preview (blocks, glare blocks, brand-coloured text)",
      'every colour block and text of the preview follows the system',
      'TPL-1'
    ),
    'CON-2': judge(
      (r) => r.lowText,
      `texts the system made unreadable (under ${t.previewTextFloor}:1) in the preview`,
      'every text of the preview reads',
      'CON-2'
    ),
    'BTN-1': judge(
      (r) => r.lostButtons,
      'buttons that lost their shape in the preview',
      'every button keeps its shape',
      'BTN-1'
    ),
    'PREV-1': judge(
      (r) => Math.max(0, r.docs - 1) + r.failedFonts + r.empty,
      'the preview is not the page alone (a second document, fonts that fail, empty blocks)',
      'the preview is one document, its fonts load, no block is empty',
      'PREV-1'
    )
  }
  // each detector kind adds its count to its rule; the rule lists what it saw, on which page, where,
  // and the fix
  /** @type {Record<string, any>} */
  const out = {}
  for (const id of ids) {
    const kinds = Object.entries(registry)
      .filter(([, k]) => k.rule === id)
      .map(([kind, k]) => {
        // a kind the row's system causes on most templates is the system's, never the template's
        const theSystems = (/** @type {any} */ r) => Boolean(systemIssues?.systems?.[r.system]?.[kind])
        const rows = rowsFor(id).filter((r) => !theSystems(r))
        const count = (/** @type {any} */ r) => r.detectors?.[kind]?.count ?? 0
        const bad = rows.filter((r) => count(r) > 0)
        const measured = rowsFor(id).some((r) => r.detectors?.[kind] !== undefined)
        const spread = spreadOf(bad, count, at)
        const issues = issuesOf(bad, kind, at, declared.length)
        return {
          kind,
          what: k.what,
          fix: k.fix,
          measured,
          // unique issues: an element seen on several pages, systems or schemes is one issue
          count: issues.count,
          on: issues.on,
          // "<page> <count>" of the issues that page alone has, most first (probe 4)
          pages: issues.pages,
          // an element of a page other than the home page says its page first
          where: issues.where,
          // the elements shared by several pages (a header, a footer, a shared block): told once
          sitewide: issues.sitewide,
          // the per-page detail, as each row counted it: every finding on every page, system and scheme
          occurrences: bad.reduce((a, r) => a + count(r), 0),
          perPage: spread.pages,
          perSystem: spread.on
        }
      })
    const failed = kinds.filter((k) => k.count > 0)
    // the system's own issues of this rule on these rows, shown apart and not counted
    const ofSystems = Object.entries(registry)
      .filter(([, k]) => k.rule === id)
      .flatMap(([kind, k]) =>
        [
          ...new Set(preview.filter((r) => systemIssues?.systems?.[r.system]?.[kind]).map((r) => r.system))
        ].map((system) => ({ kind, system, what: k.what, fix: /** @type {any} */ (k).systemFix ?? k.fix }))
      )
    const own = base[/** @type {keyof typeof base} */ (id)]
    const missing = missingFor(id)
    const notMeasured = missing.length
      ? `not measured on ${missing.length} of ${declared.length} declared pages (${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''})`
      : null
    const notes = [
      own?.status === 'fail' ? own.note : null,
      ...failed.map(
        (k) =>
          `${k.what}: ${[
            k.on.join(', '),
            k.sitewide.length ? sitewideText(k.sitewide) : null,
            k.pages.length &&
            (k.sitewide.length || k.pages.some((/** @type {string} */ p) => !p.startsWith('/ ')))
              ? `on pages ${k.pages.slice(0, 12).join(', ')}`
              : null
          ]
            .filter(Boolean)
            .join(' ')}${k.where.length ? ` (${k.where.join(', ')})` : ''}`
      )
    ].filter(Boolean)
    const pageFields = {
      pages: declared.length,
      ...(missing.length ? { unmeasuredPages: missing } : {})
    }
    if (id !== 'PREV-1' && !styled.length) {
      out[id] = {
        status: 'unmeasurable',
        note: `the preview loaded without its stylesheets on ${groups.join(', ')} (PREV-1): measure again once they load`,
        kinds,
        ...pageFields
      }
      continue
    }
    // a rule whose kinds joined this probe after the file was measured: not judged, never a pass
    if (!own && !kinds.some((k) => k.measured) && late.has(id)) {
      out[id] = {
        status: 'not-applicable',
        note: `not measured yet: the file was measured before ${kinds.map((k) => k.kind).join(', ')} joined preview probe v${probe}; measure the preview again to judge it`,
        kinds,
        ...pageFields
      }
      continue
    }
    // a rule only detector kinds read, and no row measured them: never a pass
    if (!own && !kinds.some((k) => k.measured)) {
      out[id] = {
        status: 'unmeasurable',
        note: 'the preview was not measured for this rule',
        kinds,
        ...pageFields
      }
      continue
    }
    const fails = own?.status === 'fail' || failed.length > 0
    out[id] = {
      // a declared page without a row is unmeasured: a rule clean on the pages it saw is not a pass
      status: fails ? 'fail' : missing.length ? 'unmeasurable' : 'pass',
      note: [
        notes.length
          ? notes.join('; ')
          : missing.length
            ? null
            : (own?.note ?? 'nothing found in the preview'),
        notMeasured
      ]
        .filter(Boolean)
        .join('; '),
      kinds,
      ...pageFields,
      ...(ofSystems.length ? { systemIssues: ofSystems } : {})
    }
  }
  return out
}

/** The page a preview row measured: its `page`, or the home page for a row from before probe 4. */
export const pageOf = (/** @type {any} */ r) => (typeof r?.page === 'string' && r.page ? r.page : '/')

/**
 * Where a count fired, twice: per system and scheme (`on`, "<system>/<scheme> <n>") and per page
 * (`pages`, "<page> <n>", most first). PURE.
 * @param {any[]} rows @param {(r: any) => number} count @param {(r: any) => string} at
 */
function spreadOf(rows, count, at) {
  /** @type {Map<string, number>} */
  const on = new Map()
  /** @type {Map<string, number>} */
  const pages = new Map()
  for (const r of rows) {
    on.set(at(r), (on.get(at(r)) ?? 0) + count(r))
    pages.set(pageOf(r), (pages.get(pageOf(r)) ?? 0) + count(r))
  }
  return {
    on: [...on].map(([k, n]) => `${k} ${n}`),
    pages: [...pages].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`)
  }
}

/**
 * The unique issues of one detector kind over its failing rows (Akemi, 15/10/2026: JA Kinetic
 * WordPress's footer Subscribe was "60 buttons" for one button on 30 pages under 2 systems). An issue
 * is an element, by kind and the selector the row names it with (`where`): the same selector on
 * several pages is one shared element (a header, a footer, a shared block), told once as site-wide
 * ("on every page", "on N of M pages"), and the same element under several systems or schemes is one
 * issue too. A row's elements its `where` does not list (`unique` past the list; before probe 6, its
 * findings past the list) count once per page, the most any row of that page saw. PURE.
 * @param {any[]} rows the failing rows of the kind
 * @param {string} kind
 * @param {(r: any) => string} at the row's system and scheme
 * @param {number} declared how many pages the template declares
 */
export function issuesOf(rows, kind, at, declared) {
  /** @type {Map<string, { pages: Set<string>, on: Set<string> }>} */
  const sigs = new Map()
  /** @type {Map<string, Map<string, number>>} page -> group -> findings no selector names */
  const rest = new Map()
  for (const r of rows) {
    const d = r.detectors?.[kind]
    const where = [...new Set(Array.isArray(d?.where) ? d.where.map(String) : [])]
    for (const w of where) {
      const s = sigs.get(w) ?? { pages: new Set(), on: new Set() }
      s.pages.add(pageOf(r))
      s.on.add(at(r))
      sigs.set(w, s)
    }
    // a row of probe 6 says how many distinct elements it saw (`unique`); an older row only how many
    // findings, several of which may share one element
    const extra = Math.max(0, (isCount(d?.unique) ? d.unique : (d?.count ?? 0)) - where.length)
    if (!extra) continue
    const g = rest.get(pageOf(r)) ?? new Map()
    g.set(at(r), Math.max(g.get(at(r)) ?? 0, extra))
    rest.set(pageOf(r), g)
  }
  const restOf = (/** @type {string} */ page) => Math.max(0, ...(rest.get(page)?.values() ?? []))
  const shared = [...sigs].filter(([, s]) => s.pages.size > 1)
  const own = [...sigs].filter(([, s]) => s.pages.size === 1)
  /** @type {Map<string, number>} */
  const perPage = new Map()
  for (const [, s] of own) for (const p of s.pages) perPage.set(p, (perPage.get(p) ?? 0) + 1)
  for (const p of rest.keys()) perPage.set(p, (perPage.get(p) ?? 0) + restOf(p))
  const groups = [...new Set(rows.map(at))]
  return {
    count: sigs.size + [...rest.keys()].reduce((a, p) => a + restOf(p), 0),
    on: groups.map((g) => {
      let n = [...sigs.values()].filter((s) => s.on.has(g)).length
      for (const m of rest.values()) n += m.get(g) ?? 0
      return `${g} ${n}`
    }),
    pages: [...perPage]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `${p} ${n}`),
    where: own
      .map(([w, s]) => {
        const p = [...s.pages][0]
        return p === '/' ? w : `${p}: ${w}`
      })
      .slice(0, 8),
    sitewide: shared
      .sort((a, b) => b[1].pages.size - a[1].pages.size)
      .slice(0, 8)
      .map(([w, s]) => ({ at: w, pages: s.pages.size, of: Math.max(declared, s.pages.size), on: [...s.on] }))
  }
}

/** The words of the site-wide elements of a kind: "site-wide: <element> on every page, …". */
export const sitewideText = (/** @type {{ at: string, pages: number, of: number }[]} */ list) =>
  `site-wide: ${list.map((x) => `${x.at} ${pagesWord(x)}`).join(', ')}`

/** "on every page" or "on N of M pages". */
export const pagesWord = (/** @type {{ pages: number, of: number }} */ x) =>
  x.pages >= x.of ? 'on every page' : `on ${x.pages} of ${x.of} pages`

/** The words of a spread: per system and scheme, then the pages when any is not the home page. */
const spreadText = (/** @type {{ on: string[], pages: string[] }} */ s) =>
  `${s.on.join(', ')}${s.pages.some((p) => !p.startsWith('/ ')) ? ` on pages ${s.pages.slice(0, 12).join(', ')}` : ''}`

/**
 * The kinds a design system causes on most templates (PR 2, 14/10/2026: harsh-border fired on about
 * 30 of 44 previews under Moxie because Moxie's border role is its text colour, the system's doing and
 * not 30 templates'). From the newest measurement file of every line: per system and kind, on how many
 * lines it fires out of the lines measured with that system. From `share` of the lines and at least
 * `min` lines, and at most half as often under every other system measured on the same lines, it is
 * the system's: /ops shows it once as a design-system issue and no template's
 * readiness counts it. PURE.
 * @param {any[]} docs the measurement files
 * @param {{ share?: number, min?: number }} [limits]
 */
export function systemIssuesOf(docs, { share = 0.6, min = 10 } = {}) {
  /** @type {Record<string, { of: Set<string>, kinds: Record<string, Set<string>> }>} */
  const by = {}
  for (const doc of docs) {
    const line = `${doc.cms} ${doc.tag}`
    for (const r of doc.preview ?? []) {
      const s = (by[r.system] ??= { of: new Set(), kinds: {} })
      s.of.add(line)
      for (const [kind, d] of Object.entries(r.detectors ?? {}))
        if (/** @type {any} */ (d?.count ?? 0) > 0) (s.kinds[kind] ??= new Set()).add(line)
    }
  }
  /** @type {Record<string, Record<string, { lines: number, of: number, examples: string[] }>>} */
  const systems = {}
  const rate = (/** @type {string} */ system, /** @type {string} */ kind) =>
    (by[system].kinds[kind]?.size ?? 0) / Math.max(1, by[system].of.size)
  for (const [system, s] of Object.entries(by))
    for (const [kind, lines] of Object.entries(s.kinds))
      if (
        lines.size >= min &&
        lines.size / s.of.size >= share &&
        // the system's own: the other systems on the same templates show it at most half as often (a
        // kind every system shows, such as a template's own font names, is the templates')
        Object.keys(by).every((o) => o === system || rate(o, kind) <= rate(system, kind) / 2)
      )
        (systems[system] ??= {})[kind] = {
          lines: lines.size,
          of: s.of.size,
          examples: [...lines].sort().slice(0, 5)
        }
  return { share, min, systems }
}

/**
 * A measured document is for this published version: same tag and version, else it says why not.
 *
 * One exception, and only with proof: a WordPress patch release whose theme and slot contract did not move (only
 * the database did) carries the numbers of the version before it, marked `inheritedFrom: "<previous version>"`
 * (`patch-artifacts.mjs`). Such a document counts only when `proof` (the caller's reading of the committed files:
 * `patch-evidence.json` beside it, both versions' presentation locks and content maps, and the previous link of a
 * chain) finds no
 * problem; without a proof it is refused, as any other older measurement is. Joomla and EmDash never inherit: no
 * gate checks evidence for them.
 * @param {ReturnType<typeof fromFlow> & { inheritedFrom?: string }} doc
 * @param {{ tag?: string | null, version: string }} published
 * @param {((from: string) => string | null) | null} [proof] why the committed files do not prove the
 *   inheritance, or null when they do
 */
export function measurementMatches(doc, published, proof = null) {
  if (!doc) return { ok: false, reason: 'no measurement' }
  if (doc.version !== published.version)
    return { ok: false, reason: `measured ${doc.version}, published ${published.version}` }
  if (published.tag && doc.tag !== published.tag)
    return { ok: false, reason: `measured ${doc.tag}, published ${published.tag}` }
  if (doc.inheritedFrom !== undefined) {
    const from = doc.inheritedFrom
    const why = !WORDPRESS_TAG.test(String(published.tag ?? doc.tag ?? ''))
      ? 'only a WordPress patch may inherit a measurement'
      : typeof from !== 'string' || !/^\d+\.\d+\.\d+$/.test(from)
        ? 'inheritedFrom must be a version'
        : proof
          ? proof(from)
          : 'no patch-evidence.json beside it'
    if (why) return { ok: false, reason: `inherited from ${from}: ${why}` }
  }
  return { ok: true, reason: null }
}

/** A WordPress release tag (`quickstart/ja-diner/wp7`): the only line whose patches may inherit a measurement. */
const WORDPRESS_TAG = /\/wp\d+$/

/**
 * Why the `patch-evidence.json` of `published` is not the evidence of this link (`published` patched from `from`),
 * or null. It decides nothing about the bytes: whether the theme, slot contract and content are unchanged is read
 * from the files committed for both versions by the caller (`apps/tracy-web/.../readers/measurement-inheritance.js`),
 * never from hashes the evidence declares.
 */
export function inheritanceProblem(
  /** @type {unknown} */ from,
  /** @type {{ tag?: string | null, version: string }} */ published,
  /** @type {any} */ evidence
) {
  if (typeof from !== 'string' || !/^\d+\.\d+\.\d+$/.test(from)) return 'inheritedFrom must be a version'
  if (!WORDPRESS_TAG.test(String(published.tag ?? evidence?.tag ?? '')))
    return 'only a WordPress patch may inherit a measurement'
  if (!evidence || typeof evidence !== 'object') return 'no patch-evidence.json beside it'
  if (evidence.version !== published.version)
    return `patch-evidence.json is for ${evidence.version}, published ${published.version}`
  if (published.tag && evidence.tag !== published.tag)
    return `patch-evidence.json is for ${evidence.tag}, published ${published.tag}`
  if (
    String(evidence.previous ?? '')
      .split('/')
      .at(-1) !== from
  )
    return `patch-evidence.json names the previous version ${evidence.previous}, not ${from}`
  return null
}
