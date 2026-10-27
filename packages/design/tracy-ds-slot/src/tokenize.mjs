/**
 * A released template's compiled stylesheet → the same stylesheet reading its own palette through the
 * slot: every hex that IS one of the template's palette colours becomes `var(--ds-c-<role>, <that
 * hex>)`. `--ds-c-*` is defined only while a system is worn (`colourVars`), so the template's default
 * look — light and dark — computes exactly what it did before. PURE.
 *
 * Which role a hex takes depends on where it is painted, never on the hex alone: the same white is
 * the page in `background` and the text on a button in `color`. A colour used as text maps only to a
 * text role; a fill only to a fill role; a line only to a line role. A hex the palette does not hold,
 * or holds in no role that fits the property, stays as it is — a literal the template still owns.
 * One pairing across a rule: text on an accent fill (`.btn{background:#c2562f;color:#fff}`) is the
 * accent's own text (`accent-on`), so a light accent never ends up under white text.
 */
import { brandKeepOf } from './role-scan/brand.mjs'

/** Roles each kind of property may take, in order of preference when two roles share a hex. */
const ROLES = {
  text: [
    'fg',
    'fg-2',
    'muted',
    'meta',
    'accent',
    'accent-hover',
    'accent-active',
    'success',
    'warn',
    'danger'
  ],
  fill: [
    'bg',
    'surface',
    'surface-warm',
    // a contract's own grey hover ground (palette `surface-hover`): after the surface, so a hex both hold
    // stays the surface it always was
    'surface-hover',
    'accent',
    'accent-hover',
    'accent-active',
    'success',
    'warn',
    'danger'
  ],
  line: ['border', 'border-soft', 'accent', 'accent-hover', 'accent-active', 'success', 'warn', 'danger'],
  glyph: ['accent', 'accent-hover', 'fg', 'fg-2', 'muted', 'meta']
}

const kindOf = (prop) => {
  const p = prop.toLowerCase()
  if (p === 'color' || p === 'caret-color' || p === '-webkit-text-fill-color') return 'text'
  if (p === 'background' || p === 'background-color' || p === 'background-image') return 'fill'
  if (/^(border|outline|column-rule|text-decoration)/.test(p)) return 'line'
  if (p === 'fill' || p === 'stroke') return 'glyph'
  if (p.startsWith('--')) return 'custom'
  return null
}

const PAGE_FILLS = ['bg', 'surface', 'surface-warm', 'surface-hover']
// WCAG relative luminance (what a contrast ratio is defined on)
const wcagLum = (h) =>
  [1, 3, 5]
    .map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
const lumOf = (h) =>
  [1, 3, 5]
    .map((i) => Number.parseInt(h.slice(i, i + 2), 16))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0) / 255

/** `#abc` / `#aabbcc` / `#aabbccff` → `#aabbcc`; translucent or malformed → null. */
export function normHex(h) {
  let x = h.slice(1).toLowerCase()
  if (x.length === 3) x = [...x].map((c) => c + c).join('')
  else if (x.length === 8 && x.endsWith('ff')) x = x.slice(0, 6)
  return /^[0-9a-f]{6}$/.test(x) ? `#${x}` : null
}

// the name of a custom property hints which side of the paint it is on
const textName = /(^|-)(text|ink|fg|on|heading|title|link|muted|meta|dim|color-dark)(-|$)/
const fillName = /(^|-)(bg|background|surface|elevated|fill|card|panel|light)(-|$)/
const lineName = /(^|-)(border|line|rule|divider|stroke|outline)(-|$)/

/**
 * The template's accent variables and every variable that only renames one of them (`--primary:
 * var(--wp--preset--color--accent)`), read across all the stylesheets tokenized together: a text that reads
 * the alias is accent text as much as one that reads the variable (JA Kinetic's 150 `color: var(--primary)`
 * kept the accent's fill as text, 2.2–2.9:1 on the other side of a two-mode system, 15/10/2026).
 * @param {string[]} sheets
 * @param {string[]} accentVars
 * @returns {string[]}
 */
export function accentAliases(sheets, accentVars = []) {
  const names = new Set(accentVars.filter((v) => /^--[\w-]+$/.test(v)))
  const defs = sheets.flatMap((css) => [...css.matchAll(/(--[\w-]+)\s*:\s*var\((--[\w-]+)\)\s*[;}]/g)])
  // an alias of an alias too, until no new name comes
  for (let grew = true; grew; ) {
    grew = false
    for (const [, alias, of] of defs)
      if (names.has(of) && !names.has(alias)) {
        names.add(alias)
        grew = true
      }
  }
  return [...names]
}

/**
 * The palette one stylesheet is tokenized with: the contract's own for that file (`filePalettes`: a path part →
 * a palette or a list of them) when one names it, else the template's. A T3 theme sheet of its own look (JA
 * Resume's dark-triangular-yellow, its "Home Blogger" page: #111 page, #999 text, #ffcc00 buttons, never
 * tokenized) gets its own colours' roles there, and the light themes' roles do not move (one holders map serves a
 * whole palette, so #111 named a page there would turn the light themes' dark bands into the page).
 * @param {Record<string, string> | Record<string, string>[]} palette
 * @param {{ filePalettes?: Record<string, unknown> } | null | undefined} contract
 * @param {string} file
 */
export function paletteForFile(palette, contract, file) {
  for (const [part, own] of Object.entries(contract?.filePalettes ?? {}))
    if (part !== '' && String(file).includes(part) && own && typeof own === 'object')
      return /** @type {any} */ (own)
  return palette
}

/** The status roles: a fill, a line or a mark in their own colour, and the readable shade the slot gives their text. */
const STATUS = ['success', 'warn', 'danger']
const TEXT_PROPS = new Set(['color', 'caret-color', '-webkit-text-fill-color'])

/**
 * The template's custom properties that only ever colour TEXT: every use is a text property, or another such
 * property (`--bs-btn-color: var(--t4-btn-color)` read by `color:`). A status colour one of them holds is text
 * and takes the readable shade (`--ds-c-<status>-text`): T4's `--t4-btn-color` of its outline buttons and its
 * form feedback colours read the status fill at 2-3:1 on the worn page under most systems (15/10/2026: 164
 * such uses in 70 released templates).
 * @param {string[]} sheets
 * @returns {string[]}
 */
export function textOnlyVars(sheets) {
  /** variable → the properties that read it */
  const readers = new Map()
  for (const css of sheets)
    for (const m of css.matchAll(/([-\w]+)\s*:\s*([^;{}]*)/g)) {
      const prop = m[1].toLowerCase()
      for (const v of m[2].matchAll(/var\(\s*(--[\w-]+)/g)) {
        // the slot's own variables are Tracy's, not the template's
        if (v[1].startsWith('--ds-')) continue
        if (!readers.has(v[1])) readers.set(v[1], new Set())
        readers.get(v[1]).add(prop)
      }
    }
  const text = new Set(readers.keys())
  // the largest set closed under "every reader is a text property or one of the set"
  for (let shrank = true; shrank; ) {
    shrank = false
    for (const name of text)
      if (![...readers.get(name)].every((p) => TEXT_PROPS.has(p) || (p.startsWith('--') && text.has(p)))) {
        text.delete(name)
        shrank = true
      }
  }
  // a property only ever read by other variables never reaches a text: keep those that do
  const reaches = (name, seen = new Set()) =>
    !seen.has(name) &&
    [...(readers.get(name) ?? [])].some(
      (p) => TEXT_PROPS.has(p) || (text.has(p) && reaches(p, new Set([...seen, name])))
    )
  return [...text].filter((n) => reaches(n)).sort()
}

/**
 * @param {string} css
 * @param {Record<string, string> | Record<string, string>[]} palette  role → hex: the template's own
 *   colours (any of COLOUR_TOKENS); several when the template has more than one look (light, dark) —
 *   a worn system is one look, so the dark set's colours take the same roles
 * @param {{ accentVars?: string[], keepScopes?: string[], classifyText?: boolean, alphaText?: boolean, pairVarFill?: boolean, varRoles?: Record<string, string>, t4Placeholders?: Record<string, string | Record<string, string>>, textVars?: string[], reRole?: { from: string, colour: string }[], moveOnly?: boolean }} [opts]
 *   alphaText: a translucent TEXT colour (`rgba(r, g, b, a)`) whose colour is the palette's reads
 *   `var(--ds-a-<role>-<NN>, <the rgba itself>)` (NN = the alpha in hundredths) — the same text in the
 *   worn role at the same opacity; the slot defines each name the contract lists (`alphaVars`). Off
 *   unless a contract asks: a stylesheet tokenized before it is what the tokenizer still makes of it
 *   pairVarFill: a fill painted with one of `accentVars` counts as the accent, so the rule's own text
 *   colour pairs with it as `accent-on` (opt-in, as alphaText)
 *   reRole: slots an earlier release wrote in a role now known wrong (`var(--ds-c-<from>, <colour>)`, the contract's
 *   `reRole`): each such expression, in place, takes the role this palette gives the colour for its property (council,
 *   15/10/2026: only the slots known wrong move, chosen by today's classifier; a value already read through the slot
 *   is otherwise never swapped again, so nothing else moves). `reRoled` reports each move.
 *   moveOnly: a re-cut of a released sheet moves only what it was cut for — status text to its shade, the
 *   `reRole` slots — and tokenizes nothing new: the tokenizer learned rules since the release was cut, and
 *   what they would add now is reviewed in its own round, not carried in unseen (council, 15/10/2026: of 75
 *   re-cuts, 31 picked up literals tokenized anew, 43 headings of JA Boxing among them).
 * @returns {{ css: string, replaced: number, byRole: Record<string, number>, kept: Record<string, number>, keptKinds: Record<string, Record<string, number>>, alphas: string[], reRoled: Record<string, number> }}
 */
export function tokenizeCss(css, palette, opts = {}) {
  // accent the template paints as TEXT through a variable (a WordPress preset, T4's primary)
  const accentVars = (opts.accentVars ?? []).filter((v) => /^--[\w-]+$/.test(v))
  // the template's own colour variables whose role its name cannot tell and whose hex the palette
  // holds in several roles or none (JA Titan's dark mode: --t4-gray-900 #F8F8F8 is its title text,
  // --t4-gray-100 #1B1B1B its panels): the contract names the role of each (`varRoles`), wherever
  // the stylesheet declares it — nested redeclarations included
  const VAR_ROLES = new Set([
    ...ROLES.text,
    ...ROLES.fill,
    ...ROLES.line,
    'accent-text',
    'accent-text-hover',
    'accent-on',
    ...STATUS.map((r) => `${r}-text`)
  ])
  // the variables that only colour text (`textOnlyVars`): given across the sheets tokenized together, else
  // read off this sheet, so a per-file caller (a release, the readiness check) judges as the CLI does
  const textVars = new Set(
    (opts.textVars ?? textOnlyVars([css])).filter((v) => /^--[\w-]+$/.test(v)).map((v) => v.toLowerCase())
  )
  const textish = (/** @type {string} */ kind, /** @type {string} */ prop) =>
    kind === 'text' ||
    (kind === 'custom' && (textVars.has(prop.toLowerCase()) || textName.test(prop.slice(2).toLowerCase())))
  const varRoles = Object.fromEntries(
    Object.entries(opts.varRoles ?? {})
      .filter(([k, r]) => /^--[\w-]+$/.test(k) && VAR_ROLES.has(r))
      .map(([k, r]) => [k.toLowerCase(), r])
  )
  // a text colour the palette does not name, on the page's side of light: the role its contrast with
  // the template's page gives it (strong: body text, medium: muted, weak: meta) — JA Resort's heading
  // green, JA Tour's intro grey stayed put while the page turned dark
  const page0 = (Array.isArray(palette) ? palette[0] : palette)?.bg
  const pageHex = page0 && normHex(String(page0).trim())
  const classify =
    opts.classifyText && pageHex
      ? (h) => {
          const a = wcagLum(h)
          const b = wcagLum(pageHex)
          const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
          if (r < 1.6) return null // on the page's own colour: not text meant for it
          return r >= 7 ? 'fg' : r >= 4.5 ? 'muted' : 'meta'
        }
      : null
  // inverse bands the page keeps (a dark footer on a light page): their rules stay the template's,
  // so a band and the text on it remain a pair
  const keep = (opts.keepScopes ?? [])
    .filter((x) => /^[.#][\w-]+$/.test(x))
    .map((x) => new RegExp(`${x.replace(/[.#]/, (c) => `\\${c}`)}(?![\\w-])`))
  /** hex → roles that hold it */
  const holders = new Map()
  const sets = Array.isArray(palette) ? palette : [palette]
  const firstPage = sets[0]?.bg && normHex(String(sets[0].bg).trim())
  for (const set of sets) {
    // a set without a page of its own (shared or near colours) is judged against the template's
    const page = (set.bg && normHex(String(set.bg).trim())) || firstPage
    for (const [role, hex] of Object.entries(set)) {
      const h = hex && normHex(String(hex).trim())
      if (!h) continue
      // a page-family fill on the other side of light from this set's own page is an inverse band
      // (a dark hero in a light theme): it keeps the template's colour, or the system's light
      // surface would end up under the band's light text
      if (PAGE_FILLS.includes(role) && page && Math.abs(lumOf(h) - lumOf(page)) > 0.5) continue
      if (!holders.has(h)) holders.set(h, [])
      if (!holders.get(h).includes(role)) holders.get(h).push(role)
    }
  }
  const byRole = {}
  const kept = {}
  const keptKinds = {}
  /** `<from>→<to>` → how many expressions moved (opts.reRole) */
  const reRoled = {}
  let replaced = 0
  const reRoles = (opts.reRole ?? [])
    .map((r) => ({ from: String(r?.from ?? ''), colour: normHex(String(r?.colour ?? '').trim()) }))
    .filter((r) => /^[a-z][\w-]*$/.test(r.from) && r.colour)
  const pick = (h, kind, prop, hover) => {
    if (kind === 'custom' && varRoles[prop.toLowerCase()]) return varRoles[prop.toLowerCase()]
    const roles = holders.get(h)
    if (!roles) return kind === 'text' && classify ? classify(h) : null
    if (kind === 'custom') {
      const name = prop.slice(2).toLowerCase()
      const want =
        textName.test(name) || textVars.has(prop.toLowerCase())
          ? ROLES.text
          : lineName.test(name)
            ? ROLES.line
            : fillName.test(name)
              ? ROLES.fill
              : null
      const fits = want ? want.filter((r) => roles.includes(r)) : roles
      const r = fits.length === 1 || (want && fits.length) ? fits[0] : null
      // the accent a variable that only ever colours text holds is the readable accent, as a `color:` of the
      // accent is: T4's --t4-btn-color, --t4-nav-link-color and --t4-pagination-color painted links and outline
      // buttons with the system's accent fill (Tracy Base 1.0.4 under Moxie: #6786c4 on #eae5cc, 2.87:1, CON-2,
      // 16/10/2026)
      if (r && r.startsWith('accent') && r !== 'accent-on' && textVars.has(prop.toLowerCase()))
        return r === 'accent-hover' || /hover|active|focus/.test(name) ? 'accent-text-hover' : 'accent-text'
      // a status colour a text variable holds is its readable shade
      return r && STATUS.includes(r) && textish(kind, prop) ? `${r}-text` : r
    }
    const order = ROLES[kind]
    const r = order.find((x) => roles.includes(x))
    // held by the palette only in roles this property cannot take (JA Podcast's white is a fill and
    // the accent's text): as text it is classified like a colour no palette names
    if (!r) return kind === 'text' && classify ? classify(h) : null
    if (kind === 'text' && r.startsWith('accent'))
      return hover || r === 'accent-hover' ? 'accent-text-hover' : 'accent-text'
    // a status colour set as text reads the shade the slot makes readable on the page (--ds-c-<status>-text)
    if (kind === 'text' && STATUS.includes(r)) return `${r}-text`
    return r
  }
  // T4's own style sheet is generated on the site from css/tpl/theme.tpl.css, its colours written in as
  // placeholders (`background-color: __color_white`) and the file rewritten whenever its content
  // changes — on a fresh install too (JA Stark 1.0.1, 11/10/2026: a tokenized media/t4/css/14.css was
  // rewritten on the first request). The template file is what lasts: a placeholder the contract names
  // (`t4Placeholders`: name → role) becomes `var(--ds-c-<role>, __name)`, which T4 fills in as before.
  // The role must fit the property, as for a hex (text takes the readable accent). A value used in
  // two roles names one per kind of property (`{ "fill": "accent", "text": "fg-2" }`: JA Landscape's
  // __color_primary paints its buttons and its headings); a kind it does not name keeps T4's value
  const fits = (r) =>
    typeof r === 'string'
      ? VAR_ROLES.has(r)
      : r !== null &&
        typeof r === 'object' &&
        Object.entries(r).every(
          ([k, v]) => ['text', 'fill', 'line', 'glyph', 'custom'].includes(k) && VAR_ROLES.has(v)
        )
  const placeholders = Object.fromEntries(
    Object.entries(opts.t4Placeholders ?? {}).filter(([k, r]) => /^__[0-9a-z_]+$/i.test(k) && fits(r))
  )
  const placeholderRole = (name, kind, hover) => {
    const e = placeholders[name]
    const r = typeof e === 'string' ? e : e?.[kind]
    if (!r) return null
    if (kind === 'custom') return r
    if (kind === 'text' && r.startsWith('accent'))
      return hover || r === 'accent-hover' ? 'accent-text-hover' : 'accent-text'
    return ROLES[kind]?.includes(r) ? r : null
  }
  const swapPlaceholders = (value, kind, hover) =>
    Object.keys(placeholders).length === 0 || value.includes('url(') || value.includes('var(--ds-c-')
      ? value
      : value.replace(/(^|[^\w-])(__[0-9a-z_]+)(?![\w])/gi, (all, pre, name) => {
          const role = placeholderRole(name, kind, hover)
          if (!role) return all
          replaced += 1
          byRole[role] = (byRole[role] ?? 0) + 1
          return `${pre}var(--ds-c-${role}, ${name})`
        })
  const toHex = (r, g, b) => `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`
  const swapAlpha = (value, kind, prop, hover) =>
    !opts.alphaText || kind !== 'text' || value.includes('var(--ds-')
      ? value
      : value.replace(
          /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0?\.\d+)\s*\)/g,
          (m, r, g, b, a) => {
            const nn = Math.round(Number(a) * 100)
            if ([r, g, b].some((v) => Number(v) > 255) || nn < 1 || nn > 99) return m
            const role = pick(toHex(r, g, b), kind, prop, hover)
            if (!role) return m
            const name = `${role}-${String(nn).padStart(2, '0')}`
            replaced += 1
            byRole[role] = (byRole[role] ?? 0) + 1
            return `var(--ds-a-${name}, ${m})`
          }
        )
  const swap = (value, kind, prop, hover) =>
    value.includes('url(') || value.includes('var(--ds-c-')
      ? swapPlaceholders(value, kind, hover)
      : swapAlpha(swapPlaceholders(value, kind, hover), kind, prop, hover).replace(
          /#[0-9a-fA-F]{3,8}\b/g,
          (m) => {
            const h = normHex(m)
            const role = h && pick(h, kind, prop, hover)
            if (!role) {
              if (h) {
                kept[h] = (kept[h] ?? 0) + 1
                keptKinds[h] ??= {}
                keptKinds[h][kind] = (keptKinds[h][kind] ?? 0) + 1
              }
              return m
            }
            replaced += 1
            byRole[role] = (byRole[role] ?? 0) + 1
            return `var(--ds-c-${role}, ${m})`
          }
        )

  // every innermost block: `selector { declarations }` with no brace inside
  const out = css.replace(/([^{}]*)\{([^{}]*)\}/g, (whole, selector, body) => {
    // a brand logo (wordmark, mark, site title) keeps the template's look under every system
    if (
      /@font-face/i.test(selector) ||
      keep.some((re) => re.test(selector)) ||
      brandKeepOf({ selector: selector.trim() })
    )
      return whole
    const hover = /:(hover|focus|active)/.test(selector)
    let accentFill = false
    let pageFill = false
    const decls = body.split(/;(?![^(]*\))/)
    const mapped = decls.map((d) => {
      const m = /^(\s*)([-\w]+)(\s*:\s*)([\s\S]*)$/.exec(d)
      if (!m) return d
      const kind = kindOf(m[2])
      if (!kind) return d
      let v = opts.moveOnly ? m[4] : swap(m[4], kind, m[2], hover)
      for (const rr of reRoles)
        v = v.replace(
          new RegExp(`var\\(--ds-c-${rr.from},\\s*(${rr.colour.slice(1)}|${rr.colour})\\)`, 'gi'),
          (all) => {
            const fallback = /,\s*(#[0-9a-fA-F]{3,8})\)$/.exec(all)?.[1] ?? rr.colour
            const role = pick(
              rr.colour,
              kind === 'custom' && textish(kind, m[2]) ? 'text' : kind,
              m[2],
              hover
            )
            if (!role || role === rr.from) return all
            reRoled[`${rr.from}→${role}`] = (reRoled[`${rr.from}→${role}`] ?? 0) + 1
            byRole[role] = (byRole[role] ?? 0) + 1
            return `var(--ds-c-${role}, ${fallback})`
          }
        )
      // a stylesheet tokenized before the shade existed: its status text read the fill, and a value already
      // read through the slot is never swapped again, so the role is moved here (run twice, nothing more moves)
      if (textish(kind, m[2]) && /var\(--ds-c-(success|warn|danger)\s*,/.test(v))
        v = v.replace(/var\(--ds-c-(success|warn|danger)\s*,/g, (all, r) => {
          replaced += 1
          byRole[`${r}-text`] = (byRole[`${r}-text`] ?? 0) + 1
          return `var(--ds-c-${r}-text,`
        })
      // already read through the slot (a stylesheet tokenized before): left as it is
      if (!opts.moveOnly && kind === 'text' && accentVars.length && !v.includes('var(--ds-c-accent-text'))
        v = v.replace(/var\((--[\w-]+)\)/g, (all, name) => {
          if (!accentVars.includes(name)) return all
          replaced += 1
          const role = hover ? 'accent-text-hover' : 'accent-text'
          byRole[role] = (byRole[role] ?? 0) + 1
          return `var(--ds-c-${role}, var(${name}))`
        })
      if (kind === 'fill' && /var\(--ds-c-accent(-hover|-active)?,/.test(v)) accentFill = true
      // pairVarFill: a fill painted with one of the template's accent variables (T4's
      // var(--color-primary)) is the worn accent too, so the text the rule sets on it pairs with it
      // (JA Candidate's active phone menu item: white on the accent)
      if (
        opts.pairVarFill &&
        kind === 'fill' &&
        accentVars.some((n) => v.replace(/\s/g, '').includes(`var(${n})`))
      )
        accentFill = true
      if (kind === 'fill' && /var\(--ds-c-(bg|surface|surface-warm),/.test(v)) pageFill = true
      return m[1] + m[2] + m[3] + v
    })
    if (opts.moveOnly) return `${selector}{${mapped.join(';')}}`
    // a fill this rule keeps literal (a colour the palette does not hold): its text stays literal too,
    // or the pair breaks (JA Morgan's Facebook button: white on #3b5999 turned dark on #3b5999)
    const literalFill = mapped.some((d) => {
      const m = /^\s*(background(?:-color)?)\s*:\s*([\s\S]*)$/.exec(d)
      return m && /#[0-9a-fA-F]{3,8}\b/.test(m[2].replace(/var\(--ds-c-[\w-]+,\s*#[0-9a-fA-F]{3,8}\)/g, ''))
    })
    if (literalFill)
      for (const [i, d] of mapped.entries()) {
        const m =
          /^(\s*)(color)(\s*:\s*)var\(--ds-c-[\w-]+,\s*(#[0-9a-fA-F]{3,8})\)(\s*(!important)?\s*)$/.exec(d)
        if (m) mapped[i] = `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}`
        else if (/^\s*color\s*:/.test(d) && d.includes('var(--ds-a-'))
          mapped[i] = d.replace(/var\(--ds-a-[\w-]+,\s*(rgba?\([^)]*\))\)/g, '$1')
      }
    // text the rule itself sets on the fill it maps: the accent's own text, or the page's text
    const on = accentFill ? 'accent-on' : pageFill ? 'fg' : null
    if (on)
      for (const [i, d] of mapped.entries()) {
        // a bare hex, or one already read through the slot (classified as text): the fill's pair wins
        const m =
          /^(\s*)(color)(\s*:\s*)(?:var\(--ds-c-[\w-]+,\s*)?(#[0-9a-fA-F]{3,8})\)?(\s*(!important)?\s*)$/.exec(
            d
          )
        if (!m || !normHex(m[4]) || (on === 'fg' && /var\(--ds-c-/.test(d))) continue
        replaced += 1
        byRole[on] = (byRole[on] ?? 0) + 1
        mapped[i] = `${m[1]}${m[2]}${m[3]}var(--ds-c-${on}, ${m[4]})${m[5]}`
      }
    return `${selector}{${mapped.join(';')}}`
  })
  // the dark half of a light-dark() pair plays the role of its light half
  const paired = opts.moveOnly ? { css: out, replaced: 0, byRole: {} } : darkArms(out)
  replaced += paired.replaced
  for (const [r, n] of Object.entries(paired.byRole)) byRole[r] = (byRole[r] ?? 0) + n
  // the translucent names the output still reads (a pair kept literal gave its own back)
  const alphaNames = [...new Set([...paired.css.matchAll(/var\(--ds-a-([\w-]+),/g)].map((m) => m[1]))].sort()
  return { css: paired.css, replaced, byRole, kept, keptKinds, alphas: alphaNames, reRoled }
}

/**
 * `light-dark(var(--ds-c-<role>, <light>), <dark>)` → `light-dark(var(--ds-c-<role>, <light>),
 * var(--ds-c-<role>, <dark>))`: the template's dark half, a literal, plays the same role as its light
 * half. A worn system sets the page's colour scheme by its own side of light, so under a dark system
 * every light-dark() takes its dark half: left literal, it painted the template's own dark colours
 * (JA Essence's current menu link #7d93ff under Spotify's green, 13/10/2026). Unworn, `--ds-c-*` is
 * undefined and both halves compute what they did. A dark half that already reads a variable is left
 * alone. PURE.
 * @param {string} css
 * @returns {{ css: string, replaced: number, byRole: Record<string, number> }}
 */
export function darkArms(css) {
  let replaced = 0
  const byRole = {}
  let out = ''
  let i = 0
  const OPEN = 'light-dark('
  for (;;) {
    const at = css.indexOf(OPEN, i)
    if (at === -1) break
    // the call's two arguments, split at its top-level comma (each may hold var() and rgba())
    let depth = 0
    let comma = -1
    let end = -1
    for (let k = at + OPEN.length; k < css.length; k++) {
      const c = css[k]
      if (c === '(') depth += 1
      else if (c === ')') {
        if (depth === 0) {
          end = k
          break
        }
        depth -= 1
      } else if (c === ',' && depth === 0 && comma === -1) comma = k
    }
    if (end === -1 || comma === -1) {
      out += css.slice(i, at + OPEN.length)
      i = at + OPEN.length
      continue
    }
    const lightArm = css.slice(at + OPEN.length, comma)
    const darkArm = css.slice(comma + 1, end)
    const role = /^\s*var\(--ds-c-([\w-]+)\s*,/.exec(lightArm)?.[1]
    const literal = /^\s*(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%/]+\)|transparent)\s*$/i.test(darkArm)
    out += css.slice(i, at)
    if (role && literal) {
      out += `${OPEN}${lightArm}, var(--ds-c-${role}, ${darkArm.trim()}))`
      replaced += 1
      byRole[role] = (byRole[role] ?? 0) + 1
    } else out += css.slice(at, end + 1)
    i = end + 1
  }
  return { css: out + css.slice(i), replaced, byRole }
}

const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
const lum = (h) => rgb(h).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0) / 255

/**
 * For the colours a template paints often outside its palette: the role each would take, by the kind
 * of property that paints it most and the nearest palette colour among the roles that kind allows —
 * only when close (RGB distance ≤ `near`, 64 by default) and on the same side of light. A PROPOSAL for the contract's
 * `extraPalettes`, read against the page by a person; never applied by itself.
 */
export function suggestRoles(kept, keptKinds, palette, min = 4, near = 64) {
  const own = Array.isArray(palette) ? palette[0] : palette
  const out = []
  for (const [h, n] of Object.entries(kept)) {
    if (n < min) continue
    const kinds = Object.entries(keptKinds[h] ?? {}).sort((a, b) => b[1] - a[1])
    const kind = kinds[0]?.[0]
    const roles = kind === 'custom' ? Object.keys(own) : (ROLES[kind] ?? [])
    let best = null
    for (const r of roles) {
      const c = own[r] && normHex(own[r])
      if (!c) continue
      const d = Math.hypot(...rgb(c).map((v, i) => v - rgb(h)[i]))
      if (Math.abs(lum(c) - lum(h)) > 0.15) continue
      if (!best || d < best.d) best = { role: r, d }
    }
    if (best && best.d <= near)
      out.push({ hex: h, uses: n, kind, role: best.role, near: own[best.role], distance: Math.round(best.d) })
  }
  return out.sort((a, b) => b.uses - a.uses)
}
