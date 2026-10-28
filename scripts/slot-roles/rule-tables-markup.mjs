/**
 * The markup rules of the Joomla rule tables (spec #37 C2, C5): slots the HTML helper cut out of a module body, an
 * article or a field that holds markup, told apart by their xpath. They place
 *   - a link list: one card per `li`, its label and its link together (a social network is a contact whatever list it
 *     sits in; any other page link needs `editorial.navigation_url`, which only version 3 has, so version 2 groups the
 *     social items only and labels the rest);
 *   - a button written in a module body: the label of an `a` that stands alone and its `href`, one contact card;
 *   - a link inside a sentence: version 3 labels a link to a page of the site; version 2 has no role for it.
 * Article and category text is not touched: a link in an article is the article's own words, never a call to action.
 */

const ROOT = '/html/body/div'
const SOCIAL_HOST =
  /^https?:\/\/(?:[\w-]+\.)*(?:facebook|instagram|twitter|x|linkedin|youtube|tiktok|pinterest|threads|whatsapp|telegram)\.[a-z.]+(?:[/?#]|$)/i
const INTERNAL = /^(?:\/|#|index\.php|\?|[\w-]+\.php)/i

const segmentTag = (segment) => String(segment ?? '').replace(/\[\d+\]$/, '')
const segmentIndex = (segment) => Number(String(segment).match(/\[(\d+)\]$/)?.[1] ?? 1)

/** A readable id piece for an element path under the synthetic root: `/html/body/div/ul[2]` is `ul2`. */
function slugOf(xpath) {
  const rest = xpath.startsWith(ROOT) ? xpath.slice(ROOT.length) : xpath
  const slug = rest
    .replace(/\[(\d+)\]/g, '$1')
    .split('/')
    .filter(Boolean)
    .join('-')
  return slug || 'root'
}

/** The part of a slot's identity that keeps two fields of one entity apart: its column and the field it sits in. */
function scopeOf(slot) {
  const names = Array.isArray(slot.jsonPath)
    ? slot.jsonPath.filter((p) => typeof p === 'string').map((p) => p.replace(/.*\[([^\]]+)\]$/, '$1'))
    : []
  return [slot.column ?? 'content', ...names].join('-')
}

/** What a slot's xpath says: the anchor it belongs to (`.../a`) and its list item (`.../ul/li[k]`), when it has them. */
function parse(slot) {
  const xpath = String(slot.xpath ?? '')
  if (!xpath.startsWith('/')) return null
  const segments = xpath.slice(1).split('/')
  const last = segments.at(-1)
  const info = { anchor: null, anchorPart: null, list: null }
  if (slot.type === 'url' && last === '@href' && segmentTag(segments.at(-2)) === 'a') {
    info.anchor = `/${segments.slice(0, -1).join('/')}`
    info.anchorPart = 'url'
  } else if (
    slot.type === 'text' &&
    /^text\(\)(\[\d+\])?$/.test(last) &&
    segmentTag(segments.at(-2)) === 'a'
  ) {
    info.anchor = `/${segments.slice(0, -1).join('/')}`
    info.anchorPart = 'label'
  }
  // The nearest list item above the slot, and the list it belongs to.
  for (let i = segments.length - 1; i >= 1; i--) {
    if (segmentTag(segments[i]) === 'li' && ['ul', 'ol'].includes(segmentTag(segments[i - 1]))) {
      info.list = { path: `/${segments.slice(0, i).join('/')}`, item: segmentIndex(segments[i]) - 1 }
      break
    }
  }
  return info
}

/**
 * The bindings the markup rules give the open Joomla slots. A binding with `groupId: null` is a role and no card.
 * @param {any[]} slots
 * @param {{vocabulary3: boolean}} options
 * @returns {Map<string, {groupId: string | null, entityKind?: string, itemIndex?: number, role: string}>}
 */
export function proposeMarkupBindings(slots, { vocabulary3 }) {
  const out = new Map()
  const parsed = slots.map((slot) => [slot, parse(slot)]).filter(([, info]) => info)
  const anchorKey = (slot, info) => `${slot.entity}|${scopeOf(slot)}|${info.anchor}`
  // Anchors with a label slot of their own; an `href` without one is a link inside a sentence.
  const labelled = new Set(
    parsed.filter(([, i]) => i.anchorPart === 'label').map(([s, i]) => anchorKey(s, i))
  )
  const hrefs = new Map(
    parsed.filter(([, i]) => i.anchorPart === 'url').map(([s, i]) => [anchorKey(s, i), s])
  )
  for (const [slot, info] of parsed) {
    if (!info.anchor && !info.list) continue
    const key = String(slot.key)
    const entity = String(slot.entity ?? '')
    const scope = scopeOf(slot)
    const href = info.anchor ? String(hrefs.get(anchorKey(slot, info))?.sample ?? '') : ''
    const social = SOCIAL_HOST.test(href)
    const internalUrl = info.anchorPart === 'url' && INTERNAL.test(String(slot.sample))
    if (info.list) {
      const { path, item } = info.list
      const card = (entityKind, role) => ({
        groupId: `${entity}.${scope}.${slugOf(path)}.${item}`,
        entityKind,
        itemIndex: item,
        role
      })
      if (social && info.anchorPart === 'url') out.set(key, card('contact', 'contact.social_url'))
      else if (social && info.anchorPart === 'label') out.set(key, card('contact', 'contact.social_label'))
      else if (vocabulary3 && internalUrl) out.set(key, card('business', 'editorial.navigation_url'))
      else if (info.anchorPart === 'label')
        out.set(
          key,
          vocabulary3
            ? card('business', 'editorial.menu_label')
            : { groupId: null, role: 'editorial.menu_label' }
        )
      continue
    }
    // Outside a list: only a module's own body can carry a call to action.
    if (info.anchor && labelled.has(anchorKey(slot, info)) && hrefs.has(anchorKey(slot, info))) {
      if (!entity.startsWith('module-')) continue
      out.set(key, {
        groupId: `${entity}.${scope}.cta.${slugOf(info.anchor)}`,
        entityKind: 'contact',
        itemIndex: 0,
        role: info.anchorPart === 'label' ? 'contact.cta_label' : 'contact.cta_url'
      })
    } else if (vocabulary3 && internalUrl) out.set(key, { groupId: null, role: 'editorial.navigation_url' })
  }
  return out
}
