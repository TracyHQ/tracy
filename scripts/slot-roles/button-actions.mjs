// Capture proposals use the destination and placement, never the demo button's wording.
import { isButtonSlot } from '../../packages/wo/website-opportunities/domain/button-actions.mjs'

const fieldOf = (slot) =>
  Array.isArray(slot.jsonPath)
    ? (slot.jsonPath.filter((part) => typeof part === 'string').at(-1) ?? '')
    : String(slot.target?.block ?? slot.key ?? '')
const anchorOf = (slot) => String(slot.xpath ?? '').replace(/\/(?:@href|text\(\)(?:\[\d+\])?)$/, '')
const rowOf = (slot) => (Array.isArray(slot.jsonPath) ? slot.jsonPath.filter(Number.isInteger).join('.') : '')
const numberOf = (slot) => fieldOf(slot).match(/(?:-|_)?(\d+)\]?$/)?.[1] ?? '1'

/** A label's exact anchor, block, card or sole button field supplies its destination. */
export function buttonUrlSlot(slot, slots) {
  if (slot.type === 'url') return slot
  const urls = slots.filter((other) => other.type === 'url')
  const exact = urls.find((other) => other.key === `${slot.key}.url`)
  if (exact) return exact
  const peers = urls.filter((other) => other.entity && other.entity === slot.entity)
  if (slot.xpath) {
    const anchor = peers.find(
      (other) =>
        other.column === slot.column &&
        anchorOf(other) === anchorOf(slot) &&
        JSON.stringify(other.jsonPath) === JSON.stringify(slot.jsonPath)
    )
    if (anchor) return anchor
  }
  const fields = peers.filter(
    (other) =>
      /(?:btn|button|cta).*(?:link|url)|(?:link|url).*(?:btn|button|cta)/i.test(fieldOf(other)) &&
      rowOf(other) === rowOf(slot) &&
      numberOf(other) === numberOf(slot)
  )
  if (fields.length === 1) return fields[0]
  const grouped = urls.filter((other) => slot.group?.id && other.group?.id === slot.group.id)
  return grouped.length === 1 ? grouped[0] : null
}

/** Classify only destinations whose behavior the source declares. Unknown fragments remain unplaced. */
export function actionKindOfDestination(destination, { item = false } = {}) {
  const url = String(destination ?? '').trim()
  if (!url || url === '#' || /^javascript:/i.test(url)) return null
  if (
    /google\.[^/]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|^geo:|^#.*(?:map|directions)/i.test(
      url
    )
  )
    return 'open-map'
  if (/^(?:mailto:|tel:)|(?:wa\.me|api\.whatsapp\.com)(?:\/|$)/i.test(url)) return 'contact'
  if (
    /^https?:\/\/(?:[\w-]+\.)?(?:facebook|instagram|twitter|x|linkedin|youtube|tiktok|pinterest|threads|telegram)\./i.test(
      url
    )
  )
    return 'external-profile'
  if (/(?:[?&]view=contact|(?:^|\/)contact(?:[-/?.#]|$))/i.test(url)) return 'contact'
  if (
    item ||
    /[?&](?:view=article|option=com_(?:virtuemart|hikashop))|\$\w+\s*->\s*(?:link|url)|getArticleRoute/i.test(
      url
    )
  )
    return 'go-to-item'
  if (
    /^(?:\/(?!\/)|\?|index\.php|[a-z][\w-]*(?:\/|\.html?(?:$|[?#])))/i.test(url) &&
    !/^[a-z][a-z0-9+.-]*:/i.test(url)
  )
    return 'navigation'
  return null
}

/** Preserve reviewed actions; propose only when source placement or destination establishes the job. */
export function proposeButtonActions(contentMap, { usesBySlot = new Map() } = {}) {
  const slots = contentMap.slots ?? []
  const entities = new Map((contentMap.entities ?? []).map((entity) => [entity.key, entity]))
  const unresolved = []
  for (const slot of slots) {
    if (slot.action) continue
    const entity = entities.get(slot.entity)
    const position = String(entity?.identity?.position ?? '')
    const uses = usesBySlot.get(slot.key)
    const ownAnchors = slots.filter(
      (other) =>
        other.entity === slot.entity &&
        other.type === 'url' &&
        /\/a(?:\[\d+\])?\/@href$/.test(other.xpath ?? '')
    )
    const headerButton =
      /^header(?:[-_]|$)/i.test(position) &&
      /\/a(?:\[\d+\])?(?:\/|$)/.test(slot.xpath ?? '') &&
      (uses?.length || (!entity?.initial && ownAnchors.length === 1))
    if (!isButtonSlot(slot) && !headerButton && !uses?.length) continue
    const url = buttonUrlSlot(slot, slots)
    let kind = null
    let destination = url?.sample
    const itemid = String(destination ?? '').match(/[?&]Itemid=(\d+)/i)?.[1]
    // A menu item's route is a page of the site itself: a bare SEF route ("classes") is navigation, not an unknown.
    const route = itemid
      ? (contentMap.pages ?? []).find((page) => page.entity === `menuItem-${itemid}`)?.route
      : null
    if (route) destination = `/${String(route).replace(/^\//, '')}`
    const destinationKind = actionKindOfDestination(destination, {
      item: ['service', 'menu_item', 'product', 'event'].includes(slot.group?.kind)
    })
    const conversion =
      destinationKind === 'contact' ||
      /(?:^|\/)(?:book|reserve|appointments?|order|shop)(?:[/?#-]|$)/i.test(String(destination ?? ''))
    const hero =
      numberOf(slot) === '1' &&
      /(?:^|[._/\s-])(?:hero|cta)(?:[._/\s-]|$)/i.test(`${fieldOf(slot)} ${entity?.identity?.title ?? ''}`)
    if ((headerButton || hero) && conversion) kind = 'primary-cta'
    // A CTA role names a slot, not its job: without a destination that proves the job, the button stays undeclared.
    kind ??= destinationKind
    if (uses?.length) {
      if (uses.some((use) => !use.kind)) {
        unresolved.push(slot.key)
        continue
      }
      if (kind === 'primary-cta') for (const use of uses) use.kind = 'primary-cta'
      const kinds = [...new Set(uses.map((use) => use.kind))]
      kind = kinds.length === 1 ? kinds[0] : 'navigation'
    }
    if (!kind) {
      unresolved.push(slot.key)
      continue
    }
    slot.action = {
      kind,
      ...(url && url.key !== slot.key ? { urlKey: url.key } : {}),
      ...(uses?.length ? { uses } : {})
    }
  }
  return unresolved
}
