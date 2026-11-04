// Which text slot is a link's label has one source in the kit: `blocks[].links[].labelId`. A link that shows words
// either names the slot those words come from (`labelId`, a slot of the same block), or says why its words are not a
// customer's to write (`fixedLabel: {rule, reason}`), decided here by rule, never by a list of link ids:
//   template-words  the words are the block's fixed text (`fixedText[]`): a CMS string such as "Forgot your
//                   password?", a copyright line, the "Previous article: ..." line of an article page;
//   icon-name       the link shows an icon only and its words are the icon's accessible name ("facebook");
//   pagination      a page number or "Go to next page" of the CMS pagination, linking the same listing at another
//                   result page;
//   control-value   a link with no address that shows only a number: the value of an in-page control (a rating
//                   star "1" to "5", a slide dot), which the control's script reads;
//   sort-control    a link opening the same listing in another order (`?orderby=`, `/by,name/dirdesc`): its words
//                   name a column the CMS sorts by.
// `linkLabelChecks` counts a link with words and neither, or with a `labelId` that is not a slot of its block.
import { normText } from '../../content-coverage/lib/normalize.mjs'

const hasWords = (s) => /[\p{L}\p{N}]/u.test(s)

/** Every slot id a block declares: its slots, demo facts, list rows, and slots of other blocks shown in it. */
export function blockSlotIds(kit) {
  const out = new Map(kit.blocks.map((b) => [b.id, new Set()]))
  for (const b of kit.blocks) {
    const add = (x) => {
      if (!x?.id) return
      out.get(b.id).add(x.id)
      for (const other of x.alsoShownIn ?? []) out.get(other)?.add(x.id)
    }
    for (const s of b.slots ?? []) add(s)
    for (const d of b.demoOwned ?? []) add(d)
    for (const l of b.lists ?? []) {
      for (const s of l.rowSlots ?? []) {
        add(s)
        for (const x of Array.isArray(s.slots) ? s.slots : []) add(x)
      }
      for (const r of l.rows ?? []) for (const s of r.slots ?? []) add(s)
    }
  }
  return out
}

const wordsOf = (s) => s.match(/[\p{L}\p{N}']+/gu) ?? []

/**
 * True when the label is made only of the block's fixed texts (each whole, or the label is a piece of one). Words
 * left over that repeat a word of a fixed text found in the label are its step word ("Next article: X" and "Next").
 */
function fixedWords(label, fixed) {
  const n = normText(label)
  if (fixed.some((f) => f.includes(n))) return true
  let rest = n
  const found = []
  for (const f of [...fixed].sort((a, b) => b.length - a.length))
    if (rest.includes(f)) {
      found.push(f)
      rest = rest.split(f).join(' ')
    }
  if (!hasWords(rest)) return true
  const seen = new Set(found.flatMap(wordsOf))
  return found.length > 0 && wordsOf(rest).every((w) => seen.has(w))
}

const iconName = (l) =>
  !!l.icon && [l.icon.title, l.icon.network].some((x) => x && normText(x) === normText(l.label))

/** The address without its `start` parameter, and whether it had one. */
function resultPage(path) {
  try {
    const u = new URL(String(path), 'http://kit.invalid')
    const start = u.searchParams.has('start')
    u.searchParams.delete('start')
    return { base: `${u.pathname}?${u.searchParams}`, start }
  } catch {
    return null
  }
}

/** The link opens the listing its block is shown on at another result page (`?start=`). */
function paginationLink(l, pagePaths) {
  if (!l.target) return false
  const to = resultPage(l.target)
  if (!to) return false
  return pagePaths.some((p) => {
    const at = resultPage(p)
    return at && at.base === to.base && (at.start || to.start) && String(p) !== String(l.target)
  })
}

/** A link to no page (none, `#` or `javascript:`) whose words are digits only: a control's value. */
const controlValue = (l) =>
  (!l.target || /^(?:#|javascript:)/i.test(String(l.target))) &&
  /^[\p{N}\s.,/]+$/u.test(String(l.label ?? '').trim())

const ORDER_WORDS =
  /(?:^|[?&/,_])(?:order(?:by|ing)?|sort(?:by)?|dir(?:asc|desc)?|filter_order(?:_dir)?|by)(?:[=,/]|$)/i

/** The link opens one of the block's pages again in another order: the page path, then order words only. */
function sortLink(l, pagePaths) {
  if (!l.target) return false
  const to = String(l.target)
  return pagePaths.some((p) => {
    const base = String(p).split('?')[0].replace(/\/$/, '')
    if (!base || !to.startsWith(base) || to === String(p)) return false
    const rest = to.slice(base.length)
    return /^[/?]/.test(rest) && ORDER_WORDS.test(rest)
  })
}

const REASONS = {
  'template-words':
    "the link's words are the block's fixed text (a CMS or template string), not a slot the customer writes",
  'icon-name': "the link shows an icon only; its words are the icon's accessible name, not a slot",
  pagination:
    'a CMS pagination control: a page number or step word linking the same listing at another result page',
  'control-value':
    'an in-page control with no address (a rating star, a slide dot): its number is the value the script reads',
  'sort-control':
    "a listing's sort control: it opens the same listing in another order and names the CMS column"
}

/**
 * Sets `fixedLabel: {rule, reason}` on every link that shows words, names no `labelId` and matches a rule above;
 * removes a stale one from a link that now names its slot. Returns how many links carry one.
 * @param {object} kit changed in place
 */
export function fixedLinkLabels(kit) {
  const pathsOf = new Map(kit.blocks.map((b) => [b.id, []]))
  for (const p of kit.pages ?? []) {
    const ids = Array.isArray(p.blocks) ? p.blocks : Object.values(p.blocks ?? {}).flat()
    for (const id of new Set(ids)) pathsOf.get(id)?.push(p.path)
  }
  let fixed = 0
  for (const b of kit.blocks) {
    const texts = (b.fixedText ?? []).map((t) => normText(t.text ?? '')).filter(Boolean)
    for (const l of b.links ?? []) {
      delete l.fixedLabel
      if (l.labelId || !hasWords(normText(l.label ?? ''))) continue
      const rule = paginationLink(l, pathsOf.get(b.id) ?? [])
        ? 'pagination'
        : controlValue(l)
          ? 'control-value'
          : sortLink(l, pathsOf.get(b.id) ?? [])
            ? 'sort-control'
            : iconName(l)
              ? 'icon-name'
              : texts.length && fixedWords(l.label, texts)
                ? 'template-words'
                : null
      if (!rule) continue
      l.fixedLabel = { rule, reason: REASONS[rule] }
      fixed++
    }
  }
  return fixed
}

/**
 * Self-check: every link that shows words names a slot of its own block as its label (`labelId`), or carries the
 * reason its words are fixed (`fixedLabel`). Returns how many do neither; each one is listed in `errors`.
 * @param {{kit: object, errors: object[]}} o
 */
export function linkLabelChecks({ kit, errors }) {
  const slots = blockSlotIds(kit)
  let wrong = 0
  for (const b of kit.blocks)
    for (const l of b.links ?? []) {
      const field = `blocks[${b.id}].links[${l.id}]`
      if (l.labelId) {
        if (slots.get(b.id)?.has(l.labelId)) continue
        wrong++
        errors.push({
          kind: 'link-label',
          field: `${field}.labelId`,
          reason: `label slot ${l.labelId} is not a slot of the block`
        })
      } else if (hasWords(normText(l.label ?? '')) && !l.fixedLabel?.reason) {
        wrong++
        errors.push({
          kind: 'link-label',
          field,
          reason: `the link "${String(l.label).slice(0, 50)}" shows words but names no label slot and no reason they are fixed`
        })
      }
    }
  return wrong
}

/**
 * Settle every link label of a kit already written (no browser, no capture): drop the retired `labelOf` copy from
 * every slot, name each link's label slot again from the content map, mark the fixed ones, and count the rest.
 * @param {object} kit changed in place
 * @param {{map: object, linkLabelSlots: Function}} o
 */
export function relabelKit(kit, { map, linkLabelSlots }) {
  for (const b of kit.blocks) for (const s of b.slots ?? []) delete s.labelOf
  const set = linkLabelSlots(kit, map)
  const fixed = fixedLinkLabels(kit)
  kit.errors = (kit.errors ?? []).filter((e) => e.kind !== 'link-label')
  kit.checks = { ...kit.checks, linksWithoutLabel: linkLabelChecks({ kit, errors: kit.errors }) }
  return { set, fixed, wrong: kit.checks.linksWithoutLabel }
}
