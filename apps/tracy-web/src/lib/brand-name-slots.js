// Name slots (decision 21, option A). Code only, no model. Reads brief.brand.name EXACTLY and the kit's
// site.nameSlots, and returns, per slot: id, kind, where, current value, and either the new value or a hand-off to
// the writing step.
//
// THE RULE (generic: it never looks at a slot id; it only looks at the slot's current text):
//   templateName = the demo name the template prints: the value of the CMS site-name setting in nameSlots, else
//   kit.template.name with "_" and "-" read as spaces. It is matched case-insensitively, with "-", "_" and
//   whitespace as one separator ("ja-diner" matches "Ja Diner").
//   1. brief has no brand.name, or brief.missing[] holds it back ("brand.name" / "name" / "business.name"):
//      write NOTHING; every slot is status "not-written"; owner task confirm-name.
//   2. current value empty and the slot is a setting (site name setting that prints the CMS name when empty):
//      status "written", value = brand.name exactly.
//   3. current value, trimmed, is just the template name: written, value = brand.name exactly.
//   4. the template name sits inside longer text: take the text with the template name removed (the remainder).
//      Written (template name replaced by brand.name, everything else untouched) ONLY when the remainder is a
//      fixed legal or attribution pattern: after dropping punctuation, digits (a year) and the fixed words
//      LEGAL_WORDS, nothing is left, AND no product word (the template name's words, PRODUCT_WORDS such as
//      "template", "joomla") is in the remainder. Such a pattern stays valid for any business.
//   5. anything else is template marketing prose (a tagline, a sentence about the template): NOT written, handOff
//      "writer", reason "template marketing sentence; the writing step rewrites it". This includes text that does
//      not contain the template name at all (nothing to judge).
// The brand name is written raw: escaping for HTML or attributes belongs to the step that writes it.

export const LEGAL_WORDS = [
  'copyright',
  'c',
  'all',
  'rights',
  'reserved',
  'powered',
  'by',
  'designed',
  'developed'
]
export const PRODUCT_WORDS = [
  'template',
  'templates',
  'theme',
  'themes',
  'joomla',
  'wordpress',
  'emdash',
  'cms'
]
const MARKETING_REASON = 'template marketing sentence; the writing step rewrites it'
const HELD_BACK_FIELDS = ['brand.name', 'name', 'business.name']

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// "-", "_" and spaces are one separator in the template name: a stand fills the CMS site name with the product slug
// ("ja-diner") while the pages print "Ja Diner" (JA Diner 1.0.6 and 1.0.7 kits)
const SEP = /[\s_-]+/g
const nameRe = (tpl) => new RegExp(tpl.trim().split(SEP).map(esc).join('[\\s_-]+'), 'gi')
const sameName = (a, b) =>
  a.trim().toLowerCase().replace(SEP, ' ') === b.trim().toLowerCase().replace(SEP, ' ')
const words = (s) => s.toLowerCase().match(/[\p{L}]+/gu) ?? []

/** The demo name the template prints: the CMS site-name setting's value, else the template slug as words. */
export function templateNameOf(K) {
  const slots = K.site?.nameSlots ?? []
  const cms = slots.find(
    (s) => s.kind === 'setting' && s.scope === 'cms' && typeof s.value === 'string' && s.value.trim()
  )
  if (cms) return cms.value.trim()
  return String(K.template?.name ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

const currentOf = (s) =>
  typeof s.value === 'string'
    ? s.value
    : typeof s.text === 'string'
      ? s.text
      : typeof s.sample === 'string'
        ? s.sample
        : ''

/** Stable id per kit slot: the setting, the slot id, or kind + where + block/region (+ #n when it repeats). */
function idsOf(slots) {
  const seen = new Map()
  return slots.map((s) => {
    const base =
      s.kind === 'setting'
        ? `setting:${s.setting}`
        : s.kind === 'slot'
          ? `slot:${s.id}`
          : `printed:${s.where}:${s.block ?? s.region ?? 'page'}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}#${n}`
  })
}

function judge(current, tpl, name, kind) {
  if (!current.trim()) {
    if (kind === 'setting')
      return {
        status: 'written',
        value: name,
        pattern: 'empty-setting',
        reason: 'empty setting that prints the CMS site name: gets the business name'
      }
    return {
      status: 'handed-off',
      value: null,
      handOff: 'writer',
      pattern: 'no-template-text',
      reason: 'no template text to judge; the writing step decides'
    }
  }
  const re = nameRe(tpl)
  if (!re.test(current)) {
    return {
      status: 'handed-off',
      value: null,
      handOff: 'writer',
      pattern: 'no-template-name',
      reason: `${MARKETING_REASON} (the text does not hold the template name)`
    }
  }
  if (sameName(current, tpl)) {
    return {
      status: 'written',
      value: name,
      pattern: 'name-only',
      reason: 'the slot holds only the template name'
    }
  }
  const remainder = current.replace(re, ' ')
  const rw = words(remainder)
  const productHit = rw.filter((w) => PRODUCT_WORDS.includes(w) || words(tpl).includes(w))
  const prose = rw.filter((w) => !LEGAL_WORDS.includes(w))
  if (!productHit.length && !prose.length) {
    return {
      status: 'written',
      value: current.replace(re, () => name),
      pattern: 'legal-line',
      reason: 'fixed legal or attribution pattern: only the template name is replaced'
    }
  }
  return {
    status: 'handed-off',
    value: null,
    handOff: 'writer',
    pattern: 'marketing',
    reason: MARKETING_REASON,
    evidence: productHit.length
      ? { productWords: [...new Set(productHit)] }
      : { proseWords: prose.slice(0, 6) }
  }
}

/** Pure function. Returns { name, templateName, heldBack, slots[], ownerTasks[] }. */
export function computeNameSlots(K, brief) {
  const name = brief?.brand?.name
  const kitSlots = K.site?.nameSlots ?? []
  const tpl = templateNameOf(K)
  const held = (brief?.missing ?? []).some((m) => HELD_BACK_FIELDS.includes(m?.field))
  const heldBack = typeof name !== 'string' || !name.trim() || held
  const ids = idsOf(kitSlots)
  const slots = kitSlots.map((s, i) => {
    const current = currentOf(s)
    const target = Object.fromEntries(
      Object.entries(s).filter(([k]) => !['value', 'sample', 'text', 'pages'].includes(k))
    )
    const head = {
      id: ids[i],
      kind: s.kind,
      where: s.where ?? s.scope ?? s.region ?? s.id ?? null,
      current,
      target
    }
    if (heldBack) {
      return {
        ...head,
        status: 'not-written',
        value: null,
        handOff: null,
        pattern: 'name-held-back',
        reason: 'the brief has no business name or holds it back; nothing is written'
      }
    }
    const j = judge(current, tpl, name, s.kind)
    return {
      ...head,
      status: j.status,
      value: j.value,
      handOff: j.handOff ?? null,
      pattern: j.pattern,
      reason: j.reason,
      ...(j.evidence ? { evidence: j.evidence } : {})
    }
  })
  const ownerTasks = heldBack
    ? [
        {
          kind: 'confirm-name',
          say: 'We could not confirm the business name, so we wrote it nowhere; please tell us how it is spelled.'
        }
      ]
    : []
  return { name: heldBack ? null : name, templateName: tpl, heldBack, slots, ownerTasks }
}
