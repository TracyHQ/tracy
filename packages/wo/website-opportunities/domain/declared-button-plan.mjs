// Button words and destinations are decisions of the content map's declared action and the brief, never model copy.
const list = (v) => (Array.isArray(v) ? v : [])
const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const entityOf = (s) => s.entity ?? String(s.key).split('.')[0]

/** The real Contact page, keeping its native CMS address. */
export function contactDestination(contentMap) {
  const page = list(contentMap?.pages).find(
    (p) =>
      p.role === 'contact' ||
      /(?:^|\/)(?:contact|contact-us)(?:$|\/|\?)/i.test(String(p.route ?? p.slug ?? '')) ||
      /com_contact/.test(String(p.link ?? ''))
  )
  if (!page) return null
  const id = /^menuItem-(\d+)$/.exec(String(page.entity))?.[1]
  if (id) return `index.php?Itemid=${id}`
  const route = text(page.path) ?? text(page.route) ?? text(page.slug)
  return route ? `/${route.replace(/^\//, '')}` : null
}

/** Resolve the one action already derived by the brief's language model, without inventing a channel. */
export function primaryActionOf(brief, contentMap) {
  const action = brief?.primaryAction
  const label = text(action?.label)
  if (!label) return null
  const href = action.channel === 'contact' ? contactDestination(contentMap) : text(action.href)
  return href ? { ...action, label, href } : null
}

/** A button's explicitly bound URL, then its group's URL, then the URL of its own single-button record. */
export function buttonUrlOf(slot, contentMap) {
  const slots = list(contentMap?.slots)
  const urls = slots.filter((s) => s.type === 'url')
  const bound = urls.find((s) => s.key === slot.action?.urlKey)
  if (bound) return bound
  const grouped = urls.find((s) => slot.group?.id && s.group?.id === slot.group.id)
  if (grouped) return grouped
  const own = slots.filter((s) => entityOf(s) === entityOf(slot))
  const labels = own.filter(
    (s) => s.type === 'text' && (s.action || /(?:button|cta)_label$/.test(s.role ?? ''))
  )
  const ownUrls = own.filter((s) => s.type === 'url')
  return labels.length === 1 && ownUrls.length === 1 ? ownUrls[0] : null
}

/** Every use of a shared language string must accept its words. Mixed jobs keep neutral navigation words. */
function kindOf(slot) {
  const uses = list(slot.action?.uses).map((u) => u.kind)
  const kinds = new Set(uses.length ? uses : [slot.action?.kind])
  return kinds.size === 1 ? [...kinds][0] : 'navigation'
}

/**
 * The page a navigation button leads to, when its own section is shown on that page: a button never sends the visitor
 * to the page they are already on. Judged on pages that name the module as included (a module shown on every page is
 * a menu, whose link to the page it sits on is the "you are here" entry).
 */
function leadsToItsOwnPage(slot, contentMap) {
  const url = buttonUrlOf(slot, contentMap)?.sample
  if (!url) return false
  const id = /(?:[?&])Itemid=(\d+)/.exec(String(url))?.[1]
  const page = list(contentMap?.pages).find((p) =>
    id ? p.entity === `menuItem-${id}` : [p.route, p.path, p.slug].includes(url)
  )
  const pageId = Number(/^menuItem-(\d+)$/.exec(String(page?.entity))?.[1])
  return list(page?.assignedModules).some(
    (m) =>
      m.entity === entityOf(slot) &&
      m.assignmentMode === 'include' &&
      (!list(m.menuIds).length || list(m.menuIds).map(Number).includes(pageId))
  )
}

/**
 * A navigation button's words: its destination page's name (`pageNameOf`), so a button never says "Contact" over a link to
 * the classes (COO criterion 1.8). A string shared by different jobs takes neutral words valid for every use. Null when
 * the destination has no name: the writer words it from the page it leads to, never a fixed fallback.
 */
function navigationWords(slot, contentMap, planned = null) {
  const mixed = new Set(list(slot.action?.uses).map((u) => u.kind)).size > 1
  if (mixed) return 'View details'
  const url = buttonUrlOf(slot, contentMap)?.sample
  const id = url ? /(?:[?&])Itemid=(\d+)/.exec(String(url))?.[1] : null
  const page = url
    ? list(contentMap?.pages).find((p) =>
        id ? p.entity === `menuItem-${id}` : [p.route, p.path, p.slug].includes(url)
      )
    : null
  return pageNameOf(page, planned)
}

/**
 * The name a button gives the page it leads to (COO criterion 1.8): the page's own title, else the name its address
 * reads ("about-us/our-trainers" is "Our trainers"), in sentence case. Null for a page the site plan drops, a page with no
 * address, or the home page.
 * @param {any} page - a content-map page
 * @param {Array<{id: string, path?: string, decision?: string}> | null} [planned] - the site plan's page decisions
 */
export function pageNameOf(page, planned = null) {
  if (!page) return null
  const route = String(page.route ?? page.path ?? page.slug ?? '').replace(/^\/+|\/+$/g, '')
  const row = list(planned).find((r) =>
    [r.id, r.path].map((v) => String(v ?? '').replace(/^\/+|\/+$/g, '')).includes(route)
  )
  if (row && row.decision === 'drop') return null
  const own = text(page.title) ?? text(page.label)
  if (own) return own
  const last = route.split('/').at(-1) ?? ''
  if (!last || last === 'home' || /[^a-z0-9-]/i.test(last)) return null
  const words = last.replace(/-+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1).toLowerCase() : null
}

/** A link that reaches the business on one channel. */
const TEL = /^tel:/i
const MAIL = /^mailto:/i
const CHAT = /^(?:https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/|whatsapp:)/i

/**
 * The words of a button that reaches the business, named by where it leads (COO criterion 1.8): a call says "Call us", a
 * mailbox "Email us", WhatsApp "Message us on WhatsApp"; the Contact page says the main action when that action is taken
 * there ("Book a court"), else "Contact us". Never one label for every channel.
 * @param {string | null | undefined} href
 * @param {{label?: string, href?: string} | null} [primary] - the site's main action, resolved (`primaryActionOf`)
 */
export function channelButtonLabel(href, primary = null) {
  const h = String(href ?? '').trim()
  if (TEL.test(h)) return 'Call us'
  if (MAIL.test(h)) return 'Email us'
  if (CHAT.test(h)) return 'Message us on WhatsApp'
  if (primary?.label && primary.href && String(primary.href) === h) return primary.label
  return 'Contact us'
}

/** The channel a contact button leads to when the site keeps no Contact page: WhatsApp, then a phone, then a mailbox. */
function channelHrefOf(channels) {
  for (const test of [CHAT, TEL, MAIL]) {
    const hit = list(channels).find((c) => test.test(String(c?.href ?? '')))
    if (hit) return String(hit.href)
  }
  return null
}

/** Declared actions override both the generic writer and the older hero plan; modal URLs remain template-owned. */
export function declaredButtonSlots(brief, contentMap, { pages = null, channels = [] } = {}) {
  const out = []
  const primary = primaryActionOf(brief, contentMap)
  if (!primary && list(contentMap?.slots).some((s) => s.action?.kind === 'primary-cta'))
    throw Object.assign(
      new Error('Re-read the business research to provide its primary conversion action and real channel'),
      { code: 'PRIMARY_ACTION_REQUIRED' }
    )
  const decide = (slot, value) =>
    out.push({
      key: slot.key,
      role: slot.role ?? null,
      decision: 'value',
      value,
      valueType: slot.type,
      reason: 'button-action',
      source: slot.action?.kind === 'primary-cta' ? 'brief.primaryAction' : 'content-map.action'
    })
  for (const slot of list(contentMap?.slots)) {
    if (!slot.action || slot.type !== 'text') continue
    const kind = kindOf(slot)
    if (kind === 'primary-cta') {
      if (!primary) continue
      const url = buttonUrlOf(slot, contentMap)
      if (!url)
        throw Object.assign(new Error(`The primary button needs a writable destination: ${slot.key}`), {
          code: 'PRIMARY_ACTION_DESTINATION_REQUIRED'
        })
      decide(slot, primary.label)
      decide(url, primary.href)
    } else if (kind === 'open-map') decide(slot, 'Get directions')
    else if (kind === 'go-to-item') decide(slot, 'View details')
    else if (kind === 'contact') {
      // 🔒 A CONTACT BUTTON LEADS TO THE CONTACT PAGE, OR TO THE BRIEF'S OWN CHANNEL, AND SAYS WHICH (COO criteria 1.8, 5.2).
      const contactKept = !list(pages).some((p) => p?.role === 'contact' && p?.decision === 'drop')
      const href = (contactKept ? contactDestination(contentMap) : null) ?? channelHrefOf(channels)
      const url = buttonUrlOf(slot, contentMap)
      decide(slot, channelButtonLabel(href, primary))
      if (url && href) decide(url, href)
    } else if (kind === 'external-profile') decide(slot, 'View profile')
    else if (kind === 'navigation' && leadsToItsOwnPage(slot, contentMap)) {
      // Its section already sits on the destination: the next useful action is the main one, or nothing is written.
      const url = buttonUrlOf(slot, contentMap)
      if (primary && url) {
        decide(slot, primary.label)
        decide(url, primary.href)
      }
    } else if (kind === 'navigation') {
      const words = navigationWords(slot, contentMap, pages)
      if (words) decide(slot, words)
    }
  }
  return out
}
