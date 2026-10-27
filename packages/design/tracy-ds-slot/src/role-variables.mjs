/**
 * The standard role variables: the ONE list of `--ds-*` names every template quickstart declares, so a
 * design system only sets values. A template reads each one with its own value as the fallback
 * (`var(--ds-c-bg, #faf7f2)`): undefined until a system is worn, so the template's default look stays
 * byte for byte. Frame, spacing and layout (padding, margins, gaps, container widths) are NOT roles:
 * they stay the template's own and never appear here.
 *
 * Names are the ones the slot already writes (`emit.mjs`, `tokens56.mjs` `COLOUR_TOKENS`/`colourVars`,
 * the contracts' `templateVars`); a role the slot has no name for yet gets one in the same scheme
 * (`emitted: false` would say the emitter does not write it yet; every role is emitted since 15/10/2026,
 * role-values.mjs). Read by the Template Design System
 * Readiness rule VARS-1 (`apps/tracy-web/src/lib/template-design-system-readiness/rules/vars-1-role-variables.js`)
 * and by the packaging scanner, which writes the report that rule reads (`ROLE_SCAN_REPORT_SCHEMA`).
 *
 * Each entry:
 *   name      the custom property, with its leading `--`
 *   role      what the role paints, in one line
 *   kind      'color' | 'radius' | 'font'
 *   required  a quickstart must declare it (VARS-1 fails without it)
 *   schemes   the schemes whose value differs: ['light', 'dark'] for a colour, ['light'] for a value
 *             both schemes share (a radius, a face)
 *   emitted   the slot emitter writes this name today
 */

/** @typedef {'color' | 'radius' | 'font'} RoleKind */
/** @typedef {{ name: string, role: string, kind: RoleKind, required: boolean, schemes: readonly ('light' | 'dark')[], emitted: boolean }} RoleVariable */

const BOTH = Object.freeze(/** @type {('light' | 'dark')[]} */ (['light', 'dark']))
const ONE = Object.freeze(/** @type {('light' | 'dark')[]} */ (['light']))

/**
 * @param {string} name @param {RoleKind} kind @param {boolean} required @param {string} role
 * @param {boolean} [emitted]
 * @returns {RoleVariable}
 */
const v = (name, kind, required, role, emitted = true) =>
  Object.freeze({ name, role, kind, required, schemes: kind === 'color' ? BOTH : ONE, emitted })

/** Every standard role variable, grounds first, then text, accent, lines, states, status, shape, type. */
export const ROLE_VARIABLES = Object.freeze([
  // grounds
  v('--ds-c-bg', 'color', true, 'Page ground: the background of the page and of plain sections.'),
  v('--ds-c-surface', 'color', true, 'Card face: cards, panels, menus, popovers and field fills.'),
  v(
    '--ds-c-surface-warm',
    'color',
    true,
    'Alternate surface (surface-alt): a second ground for alternating sections and highlighted panels.'
  ),
  v(
    '--ds-c-surface-hover',
    'color',
    false,
    'Neutral hover ground: the fill a card row, menu item or grey button takes under the pointer.'
  ),
  v(
    '--ds-c-ink',
    'color',
    true,
    'Inverse ground: a band drawn as a contrast to the page (a dark hero on a light page).'
  ),
  v('--ds-c-on-ink', 'color', true, 'Text and icons on the inverse ground.'),
  v(
    '--ds-c-accent-on-ink',
    'color',
    false,
    'Readable accent as text on the inverse ground: accent words and kickers set on an ink band.'
  ),
  // text
  v('--ds-c-fg', 'color', true, 'Main text: body copy and every text without a quieter role.'),
  v(
    '--ds-c-heading',
    'color',
    true,
    'Headings: the strongest text on the page, never quieter than the body.'
  ),
  v(
    '--ds-c-fg-2',
    'color',
    false,
    "Secondary text: the template's second text role (lead paragraphs, strong labels)."
  ),
  v('--ds-c-muted', 'color', true, 'Muted text: descriptions, helper text, footer links.'),
  v('--ds-c-meta', 'color', false, 'Meta text: dates, captions, small print.'),
  // accent
  v('--ds-c-accent', 'color', true, 'Accent fill: primary buttons, active chips, badges, highlights.'),
  v('--ds-c-accent-on', 'color', true, 'Text and icons on the accent fill.'),
  v('--ds-c-accent-hover', 'color', true, 'Accent fill on hover.'),
  v('--ds-c-accent-active', 'color', false, 'Accent fill while pressed.'),
  v(
    '--ds-c-accent-text',
    'color',
    true,
    'Readable accent as text: links, eyebrows, accent words, readable on the page and the surface.'
  ),
  v('--ds-c-accent-text-hover', 'color', false, 'Readable accent text on hover.'),
  v('--ds-c-accent-band', 'color', false, 'A whole band painted in the accent (a call-to-action strip).'),
  v('--ds-c-on-accent-band', 'color', false, 'Text on a band painted in the accent.'),
  // lines and states
  v('--ds-c-border', 'color', true, 'Border: field outlines, dividers, outline buttons.'),
  v('--ds-c-border-soft', 'color', true, 'Soft border: card rims, grid lines, faint separators.'),
  v('--ds-c-focus-ring', 'color', true, 'Focus ring: the outline a focused control or link shows.'),
  v('--ds-c-disabled-bg', 'color', true, 'Disabled control fill.'),
  v('--ds-c-disabled-fg', 'color', true, 'Disabled control text.'),
  // status: the fill or line, its pale ground, its words
  v('--ds-c-success', 'color', true, 'Success: fills, icons and lines of a success state.'),
  v('--ds-c-success-bg', 'color', true, 'Success ground: the pale background of a success message.'),
  v(
    '--ds-c-success-text',
    'color',
    true,
    'Success words: text set in the success colour, readable on its ground.'
  ),
  v('--ds-c-warn', 'color', true, 'Warning: fills, icons and lines of a warning state.'),
  v('--ds-c-warn-bg', 'color', true, 'Warning ground: the pale background of a warning message.'),
  v(
    '--ds-c-warn-text',
    'color',
    true,
    'Warning words: text set in the warning colour, readable on its ground.'
  ),
  v('--ds-c-danger', 'color', true, 'Error: fills, icons and lines of an error state.'),
  v('--ds-c-danger-bg', 'color', true, 'Error ground: the pale background of an error message.'),
  v(
    '--ds-c-danger-text',
    'color',
    true,
    'Error words: text set in the error colour, readable on its ground.'
  ),
  v('--ds-c-info', 'color', true, 'Info: fills, icons and lines of an informational state.'),
  v('--ds-c-info-bg', 'color', true, 'Info ground: the pale background of an informational message.'),
  v('--ds-c-info-text', 'color', true, 'Info words: text set in the info colour, readable on its ground.'),
  // shape
  v('--ds-btn-radius', 'radius', true, 'Button corner: every button, submit and button-styled link.'),
  v('--ds-card-radius', 'radius', true, 'Card corner: cards, panels, menus, popovers, images in cards.'),
  v(
    '--ds-input-radius',
    'radius',
    true,
    'Field corner: text fields, selects, search boxes, joined search buttons.'
  ),
  v('--ds-pill-radius', 'radius', true, 'Chip corner: chips, tags, badges, filter pills.'),
  // type
  v('--ds-font-display', 'font', true, 'Heading face: the display line and the headings.'),
  v('--ds-font-body', 'font', true, 'Body face: body copy, controls, fields.'),
  v(
    '--ds-font-heading',
    'font',
    false,
    'Section heading face, when the system sets headings apart from the display line.'
  ),
  v('--ds-font-mono', 'font', false, 'Monospace face: code and figures.')
])

/** Every role variable name. */
export const ROLE_VARIABLE_NAMES = Object.freeze(ROLE_VARIABLES.map((r) => r.name))

/** The names a quickstart must declare. */
export const REQUIRED_ROLE_VARIABLES = Object.freeze(
  ROLE_VARIABLES.filter((r) => r.required).map((r) => r.name)
)

const BY_NAME = new Map(ROLE_VARIABLES.map((r) => [r.name, r]))

/**
 * One role variable, or null.
 * @param {string} name
 * @returns {RoleVariable | null}
 */
export const roleVariable = (name) => BY_NAME.get(name) ?? null

/** @param {string} name */
export const isRoleVariable = (name) => BY_NAME.has(name)

/**
 * The optional roles a contract leaves out of the slot (`omit`): a Joomla module with no bytes to spare
 * does not write a role its template never reads. A required role is never left out.
 * @param {{ omit?: unknown }} contract
 * @returns {Set<string>}
 */
export const omittedRoles = (contract) =>
  new Set(
    (Array.isArray(contract?.omit) ? contract.omit : []).filter((n) => BY_NAME.get(n)?.required === false)
  )

/**
 * Roles every template has a place for: a template can never declare one of them not used (page
 * ground, text, accent and its words, border, headings).
 */
export const ALWAYS_REQUIRED = Object.freeze([
  '--ds-c-bg',
  '--ds-c-fg',
  '--ds-c-accent',
  '--ds-c-accent-on',
  '--ds-c-border',
  '--ds-c-heading'
])

/** A required role a template may declare it has no honest place for (`ds-not-used`). */
export const canBeNotUsed = (/** @type {string} */ name) =>
  isRoleVariable(name) && !ALWAYS_REQUIRED.includes(name)

/**
 * The required names absent from what a template declares, in list order. A name the template
 * declares not used (`ds-not-used: <names> — <reason>`, `notUsed`) is not missing, unless it is one of
 * `ALWAYS_REQUIRED`.
 * @param {Iterable<string>} declared
 * @param {Iterable<string | { name: string }>} [notUsed]
 * @returns {string[]}
 */
export function missingRoleVariables(declared, notUsed = []) {
  const has = new Set(declared)
  for (const n of notUsed) {
    const name = typeof n === 'string' ? n : n?.name
    if (canBeNotUsed(name)) has.add(name)
  }
  return REQUIRED_ROLE_VARIABLES.filter((n) => !has.has(n))
}

/**
 * Slot variables that are frame, spacing or layout, never roles: the scanner neither asks for them nor
 * reports a template's own spacing literals (padding, margin, gap, container widths stay the template's).
 */
export const NOT_ROLE_VARIABLE = /^--ds-(?:btn-pad-[xy]|container|section-[\w-]+|gap[\w-]*|space[\w-]*)$/

/** The schema tag of the packaging scanner's report (`design-system-roles.json`), read by VARS-1. */
export const ROLE_SCAN_REPORT_SCHEMA = 'tdsr-role-scan/v1'
