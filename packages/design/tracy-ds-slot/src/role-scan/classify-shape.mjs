/**
 * Corners and font stacks (`classify.mjs`): a radius is a corner role by the component it sits on,
 * a font stack is a font role by the face it names. PURE.
 */
import { fontRole } from './fonts.mjs'
import { radiusRoleOf, roleOrNull } from './hints.mjs'
import { auto, flag, keep } from './verdicts.mjs'

const base = (file) =>
  file
    .split('/')
    .pop()
    .replace(/\.[a-z]+$/i, '')

export function radius(f, ctx) {
  const size = f.source === 'tailwind' ? f.tw.size : f.text.trim()
  // a highlight of matched words (`<mark>`, `[&_mark]:rounded…`) sits inside a sentence: no component
  if (
    /(^|[\s>+~,_(])mark(?![\w-])/.test(
      f.source === 'tailwind' ? (f.tw?.variants ?? f.text) : (f.selector ?? '')
    )
  )
    return keep('highlight of a matched word inside text, not a component')
  const hint =
    (f.tag?.includes(f.text) ? elementRadiusRole(f.tag) : null) ??
    radiusRoleOf(f.lineText, f.selector, f.classString, f.name, base(f.file))
  if (/^(full|50%)$/.test(size) || /^(9{3,}|[1-9]\d{2,})px$/.test(size)) {
    if (hint === '--ds-pill-radius' && size !== '50%') return auto(f, hint, 'pill shape of a chip', ctx)
    return keep('circle or pill geometry, not a corner role')
  }
  // a square corner on a panel drawn edge to edge (a full-screen mega menu): a system corner would
  // round the screen's edge, so it is left to the agent
  if (/^(none|0|0px|0rem|\[0(px|rem)?\])$/.test(size) && isFullBleed(f, ctx))
    return flag(
      hint,
      hint ? [hint] : [],
      'square corner of a full-bleed (edge-to-edge) panel: keep it square?'
    )
  if (!hint)
    return flag(
      null,
      ['card-radius', 'btn-radius', 'input-radius', 'pill-radius'],
      'corner of an unnamed component'
    )
  const v = auto(f, hint, `corner of a ${hint.replace(/^--ds-|-radius$/g, '')}`, ctx)
  // a corner set per side (`0 0 5px 5px`): only the rounded corners read the role, the square ones
  // stay square (wrapped whole, a system rounded all four)
  const parts = /^(.*?)(\s*!important)?$/i.exec(f.source === 'tailwind' ? '' : f.text.trim())
  const tokens = parts?.[1].split(/\s+/) ?? []
  if (v.class === 'auto' && tokens.length > 1)
    v.replacement =
      tokens.map((t) => (/^0(px|rem|em|%)?$/.test(t) ? t : `var(${hint}, ${t})`)).join(' ') + (parts[2] ?? '')
  return v
}

const TEXT_INPUT = /^(text|email|search|password|tel|url|number|date|datetime-local|month|week|time)$/
/** The corner role of the element a class list sits on, when its tag names a control (the attributes
 * of a JSX `<input>` often run over several lines, so its class line alone names nothing). */
function elementRadiusRole(tag) {
  const name = /^<([a-z]+)/.exec(tag ?? '')?.[1]
  if (name === 'textarea' || name === 'select') return '--ds-input-radius'
  if (name === 'button') return '--ds-btn-radius'
  if (name !== 'input') return null
  const type = /\btype\s*=\s*["']([\w-]+)["']/.exec(tag)?.[1] ?? 'text'
  if (/^(submit|button|reset)$/.test(type)) return '--ds-btn-radius'
  return TEXT_INPUT.test(type) ? '--ds-input-radius' : null
}

const FULL_BLEED_CLASS =
  /(^|[\s"'`])!?(w-screen|inset-0|inset-x-0|fixed|full-bleed|full-width|edge-to-edge|w-\[100vw\])(?=$|[\s"'`])/
/** The element or rule a corner sits on spans the screen: fixed, inset 0, 100vw. */
function isFullBleed(f, ctx) {
  if (f.source === 'tailwind')
    return (
      FULL_BLEED_CLASS.test(f.classString ?? '') ||
      /position\s*:\s*['"]?fixed|width\s*:\s*['"]?100vw/.test(f.tag ?? '')
    )
  const ds = f.rule && ctx.siblings ? ctx.siblings(f.rule) : []
  const v = (prop) => ds.find((d) => d.prop === prop)?.value.trim() ?? ''
  return (
    v('position') === 'fixed' ||
    /^0(px)?$/.test(v('inset')) ||
    /^100vw$/.test(v('width')) ||
    (/^0(px)?$/.test(v('left')) && /^0(px)?$/.test(v('right')))
  )
}

export function font(f, ctx) {
  const r = fontRole(f, ctx.faces ?? { body: null, display: null }, ctx.fontDefs ?? new Map())
  if (r?.keep) return keep(r.keep)
  if (!roleOrNull(r?.role))
    return flag(null, ['font-body', 'font-display'], 'font stack of an unnamed component')
  // a stack may run over several lines: `.` would stop at the first line break and match nothing
  const m = /^([\s\S]*?)(\s*!important)?$/i.exec(f.text)
  return {
    class: 'auto',
    role: r.role,
    reason: `font stack: ${r.role.replace('--ds-', '')} (${r.why})`,
    replacement: `var(${r.role}, ${m[1]})${m[2] ?? ''}`
  }
}
