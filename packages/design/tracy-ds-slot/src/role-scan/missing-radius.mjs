/**
 * Components that should read a corner role but declare NO corner at all (finding class `missing`):
 * invisible to a scan of literals, yet a design system with round buttons leaves them square. PURE.
 *
 * Heuristics, kept narrow so a finding is nearly always real:
 * - Stylesheets: a base rule (no pseudo-class, not dark-only, not in @keyframes/@font-face/print)
 *   whose LAST compound names a button (`button`, `[type=submit]`, `.btn*`, `.button*`), a text field
 *   (`input` of a text type, `textarea`, `select`, `.form-control`, `.search-field`/`-input`,
 *   `*-input`), a chip (`.chip`, `.pill`, `.tag`, `.badge` and their `-active`… forms) or a card
 *   (`.card`); and that draws a box (a background that is not transparent, or a full border that is not
 *   0/none). One finding per component class (`.x.is-error` is a state of `.x`); a selector naming a
 *   check box, radio or switch is left out (the control draws itself). Parts and holders (`-group`, `-wrap`, `-icon`, `-label`, `-body`, `-title`, `-link`…) are
 *   not the component. It counts only when NO rule of any stylesheet for the same compound, or for the
 *   same class, sets a corner (literal, role read, or `@apply rounded…`).
 * - Markup: a `<button>`, `<input>` (text-like or submit), `<textarea>` or `<select>` whose class list
 *   draws a box (`bg-<colour>` or a full `border`) and has no `rounded*` class, no class a stylesheet
 *   styles (that rule is judged above), and no class from a prop (`cn(…, className)`: unknowable).
 */
import { classAttr } from './class-attr.mjs'
import { elementTree } from './markup-tree.mjs'

const PART =
  /-(group|groups|toolbar|wrap|wrapper|container|holder|close|link|icon|text|label|row|list|area|body|header|footer|title|meta|img|image|grid|content|count|counter|caption|inner|outer|desc|description)(?![\w-])/
const ROLE_OF_CLASS = [
  [/^\.(btn|button)(-[\w-]+)?$/, '--ds-btn-radius'],
  [
    /^\.(form-control|form-input|text-input|search-field|search-input|[\w-]+-input|input|textarea|select)$/,
    '--ds-input-radius'
  ],
  [/^\.(chip|pill|tag|badge)(-[\w-]+)?$/, '--ds-pill-radius'],
  [/^\.card(-[\w-]+)?$/, '--ds-card-radius']
]
const TEXT_TYPES = /^(text|email|search|password|tel|url|number|date|datetime-local|month|week|time)$/

/** The role a compound selector's component reads, or null. */
export function componentRadiusRole(compound) {
  const c = compound
    .replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/\[[^\]]*\]/g, (a) => (/type\s*=\s*["']?(submit|button|reset)/.test(a) ? '[type=submit]' : ''))
  if (/^button(\.|$)|^\[type=submit\]$|^input\[type=submit\]/.test(c)) return '--ds-btn-radius'
  const typed = /^input\[type\s*=\s*["']?([\w-]+)/.exec(compound)
  if (/^(textarea|select)(\.|$)/.test(c) || (/^input(\.|$)/.test(c) && (!typed || TEXT_TYPES.test(typed[1]))))
    return '--ds-input-radius'
  for (const cls of c.match(/\.[\w-]+/g) ?? []) {
    if (PART.test(cls)) continue
    for (const [re, role] of ROLE_OF_CLASS) if (re.test(cls)) return role
  }
  return null
}

const lastCompound = (sel) =>
  sel
    .trim()
    .split(/\s*[>+~]\s*|\s+/)
    .pop() ?? ''
const drawsBox = (d) =>
  (/^(background|background-color)$/.test(d.prop) &&
    !/^(transparent|none|inherit|initial|unset|0)\b/i.test(d.value.trim())) ||
  (/^border$/.test(d.prop) && !/^(0|none|0px)\b/i.test(d.value.trim()))

/**
 * @param {{ file: { rel: string, kind: string }, text: string, decls: object[] }[]} per every file scanned
 * @param {(rel: string) => (offset: number) => number} lineIndexOf the 1-based line of an offset, per file
 * @returns {object[]} raw findings of class `missing`
 */
export function missingRadius(per, lineIndexOf) {
  const rules = new Map()
  for (const p of per)
    for (const d of p.decls) {
      if (d.selector.startsWith('<')) continue
      const id = `${p.file.rel}#${d.rule}`
      if (!rules.has(id))
        rules.set(id, {
          file: p.file.rel,
          selector: d.selector,
          atRules: d.atRules,
          scheme: d.scheme,
          decls: [],
          start: d.start,
          rule: d.rule
        })
      rules.get(id).decls.push(d)
    }
  const cornered = []
  for (const r of rules.values())
    if (r.decls.some((d) => /(^|-)radius$/.test(d.prop) && !d.prop.startsWith('--')))
      cornered.push(
        ...r.selector.split(',').map((s) => lastCompound(s).replace(/::?[\w-]+(\([^)]*\))?/g, ''))
      )
  for (const p of per)
    if (['css', 'scss', 'less'].includes(p.file.kind))
      for (const m of p.text.matchAll(/([^{}]+)\{[^{}]*@apply[^{};]*\brounded/g))
        cornered.push(...m[1].split(',').map((s) => lastCompound(s)))
  // a variant reads the corner of its base class: `.btn-primary` of `.btn`, `.badge-primary` of `.badge`
  const withBases = (cls) => {
    const parts = cls.slice(1).split('-')
    return parts.map((_, i) => `.${parts.slice(0, parts.length - i).join('-')}`).filter((b) => b.length > 2)
  }
  const hasCorner = (compound) => {
    const classes = (compound.match(/\.[\w-]+/g) ?? []).flatMap(withBases)
    return cornered.some(
      (c) =>
        c === compound ||
        classes.some((cls) => new RegExp(`${cls.replace(/[.-]/g, '\\$&')}(?![\\w-])`).test(c))
    )
  }
  // the class lists of the markup: a class drawn on an element that also carries a class which sets
  // the corner (`.avatar.chip`, where `.avatar` rounds it) takes that corner
  const lists = []
  for (const p of per)
    if (p.file.kind === 'markup' || p.file.kind === 'script')
      for (const el of elementTree(p.text)) {
        const info = classAttr(el.attrs)
        if (info.present && !info.unknown) lists.push(info.always.map((t) => `.${t}`))
      }
  const roundedBy = new Set(cornered.filter((c) => /^\.[\w-]+$/.test(c)))
  const takesCorner = (cls) => {
    const on = lists.filter((l) => l.includes(cls))
    return on.length > 0 && on.every((l) => l.some((c) => c !== cls && roundedBy.has(c)))
  }
  const fieldCornered = cornered.some(
    (c) => /^(input|textarea|select)(\[[^\]]*\])*$/.test(c) && componentRadiusRole(c) === '--ds-input-radius'
  )
  const out = []
  const seen = new Set()
  for (const r of rules.values()) {
    if (r.scheme === 'dark' || r.atRules.some((a) => /@(keyframes|font-face|media\s+print)/i.test(a)))
      continue
    if (!r.decls.some(drawsBox) || fullBleedRule(r.decls)) continue
    for (const sel of r.selector.split(',')) {
      const compound = lastCompound(sel)
      if (!compound || /:/.test(compound.replace(/\[[^\]]*\]/g, ''))) continue
      const role = componentRadiusRole(compound)
      // a check box or switch is drawn by its own control, not by a field corner
      if (!role || /checkbox|radio|switch|toggle/i.test(sel) || hasCorner(compound)) continue
      // a field class takes the corner a generic field rule gives every input (`input[type=search]`)
      if (role === '--ds-input-radius' && fieldCornered) continue
      const own = compound.match(/\.[\w-]+/g) ?? []
      if (own.length === 1 && takesCorner(own[0])) continue
      // one finding per component: `.field-input.is-error` is the state of `.field-input`
      const key = (compound.match(/\.[\w-]+/g) ?? []).find((c) => componentRadiusRole(c)) ?? compound
      if (seen.has(key)) continue
      seen.add(key)
      out.push(
        missing(
          r.file,
          r.start,
          lineIndexOf(r.file)(r.start),
          role,
          sel.trim(),
          `${compound} draws a box but sets no corner: it never reads ${role}`,
          r.rule
        )
      )
    }
  }
  // component classes a stylesheet styles: their corner is judged on that rule, not on the element
  const styled = new Set(
    [...rules.values()].flatMap((r) =>
      (r.selector.match(/\.[\w-]+/g) ?? []).filter((c) => componentRadiusRole(c))
    )
  )
  for (const p of per) {
    if (p.file.kind !== 'markup' && p.file.kind !== 'script') continue
    for (const el of elementTree(p.text)) {
      const tag = el.name
      if (!/^(button|input|textarea|select)$/.test(tag)) continue
      const type = /\btype\s*=\s*["']([\w-]+)["']/.exec(el.attrs)?.[1] ?? (tag === 'input' ? 'text' : '')
      if (tag === 'input' && !TEXT_TYPES.test(type) && !/^(submit|button|reset)$/.test(type)) continue
      const info = classAttr(el.attrs)
      if (!info.present || info.unknown || /border-radius/.test(el.attrs)) continue
      const all = [...info.always, ...info.sometimes]
      if (
        all.some((t) => /(^|:)!?rounded(-|$)/.test(t) || styled.has(`.${t}`) || /^(hidden|sr-only)$/.test(t))
      )
        continue
      const box = info.always.some(
        (t) =>
          /^!?border(-[0-9]+|-\[[\d.]+px\])?$/.test(t) ||
          (/^!?bg-/.test(t) &&
            !/^!?bg-(transparent|none|cover|contain|center|no-repeat|clip-.+|gradient-.+|\[url.+)$/.test(t))
      )
      // a scrim drawn edge to edge (`absolute inset-0`) is a backdrop to click, not a button face
      if (!box || all.some((t) => /^!?(inset-0|w-screen)$/.test(t))) continue
      const role =
        tag === 'button' || /^(submit|button|reset)$/.test(type) ? '--ds-btn-radius' : '--ds-input-radius'
      const f = missing(
        p.file.rel,
        el.start,
        lineIndexOf(p.file.rel)(el.start),
        role,
        `<${tag}>`,
        `<${tag}> draws a box but has no rounded class: it never reads ${role}`
      )
      f.lineText = p.text.slice(el.start, el.openEnd)
      f.source = 'markup'
      out.push(f)
    }
  }
  return out
}

/** The rule spans its box edge to edge (`position: absolute|fixed; inset: 0`): a backdrop, no face. */
function fullBleedRule(decls) {
  const v = (prop) => decls.find((d) => d.prop === prop)?.value.trim() ?? ''
  if (!/^(absolute|fixed)$/.test(v('position'))) return false
  const zero = (x) => /^0(px|%)?$/.test(x)
  return zero(v('inset')) || (zero(v('top')) && zero(v('left')) && zero(v('right')) && zero(v('bottom')))
}

const missing = (file, start, line, role, selector, why, rule = null) => ({
  file,
  start,
  rule,
  end: start,
  line,
  source: 'css',
  valueType: 'missing',
  kind: 'radius',
  prop: 'border-radius',
  text: '',
  selector,
  role,
  why,
  scheme: 'light'
})
