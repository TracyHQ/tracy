/**
 * 🔒 THE FILL STAGES TAKE THEIR DECISIONS FROM THE ACCEPTED SITE PLAN (spec TracyHQ/tracy#231, ticket #240). When the one
 * author's plan was accepted (`site-plan-author.js`), the stages that fill the site (buttons, contact details, menus,
 * footer, the privacy page, SEO and forms) stop deciding on their own: what the plan decided is turned into what each stage
 * already reads (`planFill`), and laid over the brief build's own site plan (`overlaySitePlan`), the one every fill stage
 * reads through `woContent.sitePlanFor` (`withPlanFill`):
 *   - every kept button and link takes the plan's real action as its link: a page of the site, a call, an email, WhatsApp,
 *     a booking address or a map; never a dead or demo link. A hidden one is listed for the engine to take off;
 *   - the pages are the plan's: a kept page is kept, a dropped page is dropped (the engine unpublishes it and takes it off
 *     every menu), so the main menu and the footer columns, which list the kept pages, list exactly the plan's pages;
 *   - the privacy page is kept or dropped as the plan's `legal.privacy` says;
 *   - each kept page's search title and description follow its SEO intent in the plan, when they fit and state no fact
 *     the brief does not;
 *   - a form the plan hides (it sends nowhere real) comes off with the other blocks that have no destination;
 *   - a contact part the plan hides (phone, email, address, hours, map, socials) is not shown.
 * With no accepted plan nothing here runs and the stages decide as before. CMS-neutral except the one page link form
 * below (a Joomla menu item, `index.php?Itemid=<n>`).
 */

/** The longest search title and description a page carries (`SEO_TITLE_MAX`, `SEO_DESCRIPTION_MAX` of the WO brief). */
const TITLE_MAX = 60
const DESCRIPTION_MAX = 155

const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])
const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '')
const bare = (/** @type {unknown} */ v) => String(v ?? '').replace(/^\/+|\/+$/g, '')

/** The link of a page of the site: a template page by its menu item; an added page has none yet. */
export function pageHref(/** @type {string} */ pageId) {
  const item = /^page:menuItem-(\d+)$/.exec(String(pageId))
  return item ? `index.php?Itemid=${item[1]}` : null
}

/**
 * The link a plan action makes, or null when the action keeps the template's own link (a control on its page, the item
 * its card shows) or has no link yet.
 * @param {{kind?: string, target?: string} | null | undefined} action
 */
export function hrefOfAction(action) {
  const target = text(action?.target)
  if (!target) return null
  const digits = target.replace(/\D+/g, '')
  switch (action?.kind) {
    case 'page':
      return pageHref(target)
    case 'call':
      return digits.length >= 7 ? `tel:${target.startsWith('+') ? '+' : ''}${digits}` : null
    case 'whatsapp':
      return digits.length >= 7 ? `https://wa.me/${digits}` : null
    case 'email':
      return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(target) ? `mailto:${target}` : null
    case 'booking':
      return /^https?:\/\/\S+$/i.test(target) ? target : null
    case 'map':
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`
    default:
      return null
  }
}

/** A search line of the plan, or null when it does not fit or states a fact the brief does not. */
function seoLine(
  /** @type {unknown} */ value,
  /** @type {number} */ max,
  /** @type {(t: string) => string[]} */ refuse
) {
  let line = text(value)
  if (!line) return null
  if (max === DESCRIPTION_MAX && !/[.!?]$/.test(line)) line = `${line}.`
  line = line.charAt(0).toUpperCase() + line.slice(1)
  if ([...line].length > max || /[<>\n\r]/.test(line)) return null
  return refuse(line).length ? null : line
}

/**
 * What the fill stages need of an accepted site plan, or null when there is none.
 * @param {any} plan - the accepted site plan (`site-plan/1`, completed by `completePlan`)
 * @param {{inventory: {elements: any[]}, refuse?: (text: string) => string[]}} input - `refuse`: the business facts a line
 *   states that the brief does not (`factsNotIn` of the fact detector); none by default
 */
export function planFill(plan, { inventory, refuse = () => [] }) {
  if (!plan || typeof plan !== 'object') return null
  const elements = new Map(list(inventory?.elements).map((e) => [e.id, e]))
  const pages = []
  for (const p of list(plan.pages)) {
    const element = elements.get(String(p?.id))
    const route = bare(element?.route ?? p?.route)
    if (!route) continue
    const item = /^menuItem-(\d+)$/.exec(String(element?.entity ?? ''))
    pages.push({
      id: String(p.id),
      route,
      menuId: item ? Number(item[1]) : null,
      decision: ['keep', 'add'].includes(p.decision) ? 'keep' : 'drop',
      ...(p.decision === 'drop' ? { reason: text(p.reason) || 'not part of this site' } : {})
    })
  }
  /** @type {Record<string, string>} */
  const buttons = {}
  /** @type {string[]} */
  const hidden = []
  const forms = []
  for (const d of list(plan.decisions)) {
    const element = elements.get(String(d?.element))
    if (!element) continue
    if (element.kind === 'button' || element.kind === 'link') {
      const urlKey = element.kind === 'link' ? element.key : element.urlKey
      if (d.decision === 'hide') {
        hidden.push(...[element.key, element.kind === 'button' ? element.urlKey : null].filter(Boolean))
        continue
      }
      const href = hrefOfAction(d.action)
      if (urlKey && href) buttons[urlKey] = href
    } else if (element.kind === 'form')
      forms.push({
        element: element.id,
        entity: element.entity,
        kind: element.formKind,
        decision: d.decision === 'keep' ? 'keep' : 'hide',
        ...(d.sendsTo ? { sendsTo: d.sendsTo } : {}),
        ...(d.reason ? { reason: d.reason } : {})
      })
  }
  const seo = []
  for (const p of list(plan.pages)) {
    if (!['keep', 'add'].includes(p?.decision)) continue
    const route = bare(elements.get(String(p.id))?.route ?? p.route)
    if (!route) continue
    const own = p.seo && typeof p.seo === 'object' ? p.seo : { description: p.seo }
    const title = seoLine(own.title, TITLE_MAX, refuse)
    const description = seoLine(own.description ?? own.intent, DESCRIPTION_MAX, refuse)
    if (title || description)
      seo.push({ route, ...(title ? { title } : {}), ...(description ? { description } : {}) })
  }
  return {
    version: 'site-plan-fill/1',
    pages,
    buttons,
    hidden,
    seo,
    forms,
    contact: plan.contact ?? null,
    identity: plan.identity ?? null,
    legal: plan.legal ?? null
  }
}

/** Whether a part of the plan is hidden. */
const hides = (/** @type {any} */ part) => part?.decision === 'hide' || part?.decision === 'drop'

/**
 * The brief build's site plan (`woContent.sitePlanFor`) with the accepted plan's decisions laid over it.
 * @param {any} woPlan @param {ReturnType<typeof planFill>} fill
 */
export function overlaySitePlan(woPlan, fill) {
  if (!fill || !woPlan || typeof woPlan !== 'object') return woPlan
  const byRoute = new Map(fill.pages.map((p) => [p.route, p]))
  const privacy = fill.legal?.privacy
  const pages = list(woPlan.pages).map((p) => {
    const planned = byRoute.get(bare(p?.id)) ?? byRoute.get(bare(p?.path))
    if (planned)
      return planned.decision === 'keep'
        ? { ...p, decision: 'keep' }
        : { ...p, decision: 'drop', reason: 'site-plan', why: planned.reason }
    if (p?.role === 'privacy' && privacy)
      return hides(privacy)
        ? {
            ...p,
            decision: 'drop',
            reason: 'site-plan',
            why: text(privacy.reason) || 'the site plan drops it'
          }
        : { ...p, decision: 'keep' }
    return p
  })
  const listed = new Set(pages.map((p) => bare(p?.id)))
  for (const p of fill.pages)
    if (p.decision === 'keep' && !listed.has(p.route))
      pages.push({
        id: p.route,
        path: p.route === 'home' ? '/' : `/${p.route}`,
        decision: 'keep',
        reason: 'site-plan',
        why: 'the site plan keeps this page'
      })
  // The button links of the plan replace the declared ones; a hidden button keeps no declared words or link.
  const taken = new Set([...Object.keys(fill.buttons), ...fill.hidden])
  const slots = [
    ...list(woPlan.slots).filter((s) => !(s?.reason === 'button-action' && taken.has(s.key))),
    ...Object.entries(fill.buttons).map(([key, value]) => ({
      key,
      decision: 'value',
      value,
      valueType: 'url',
      reason: 'button-action',
      source: 'site-plan'
    }))
  ]
  // SEO: each kept page's planned title and description win over the ones made from the brief alone.
  const seoPages = list(woPlan.seo?.pages).map((p) => {
    const own = fill.seo.find((s) => s.route === bare(p?.id) || s.route === bare(p?.path))
    if (!own) return p
    const { route: _, ...line } = own
    return { ...p, ...line }
  })
  for (const s of fill.seo)
    if (
      s.title &&
      s.description &&
      !seoPages.some((p) => bare(p?.id) === s.route || bare(p?.path) === s.route)
    )
      seoPages.push({
        id: s.route,
        path: s.route === 'home' ? '/' : `/${s.route}`,
        role: s.route === 'home' ? 'home' : 'other',
        title: s.title,
        description: s.description
      })
  // Forms: a module form the plan hides comes off like any block with no destination; one it keeps stays.
  const kept = new Set(fill.forms.filter((f) => f.decision === 'keep').map((f) => f.entity))
  const formHides = fill.forms
    .filter((f) => f.decision === 'hide' && /^module-\d+$/.test(String(f.entity)))
    .map((f) => ({
      reason: 'no-form-destination',
      how: 'entity',
      kind: 'module',
      entity: f.entity,
      why: f.reason
    }))
  const honestyHide = [
    ...list(woPlan.honesty?.hide).filter(
      (h) =>
        !(
          h?.reason === 'no-form-destination' &&
          (kept.has(h.entity) || formHides.some((f) => f.entity === h.entity))
        )
    ),
    ...formHides
  ]
  // Contact: a part the plan hides is not shown.
  const contact =
    woPlan.contact && typeof woPlan.contact === 'object' ? { ...woPlan.contact } : woPlan.contact
  if (contact)
    for (const part of ['phone', 'email', 'address', 'hours'])
      if (hides(fill.contact?.[part])) delete contact[part]
  return {
    ...woPlan,
    pages,
    slots,
    ...(woPlan.seo || seoPages.length ? { seo: { ...woPlan.seo, pages: seoPages } } : {}),
    ...(woPlan.honesty || honestyHide.length
      ? { honesty: { ...woPlan.honesty, hide: honestyHide } }
      : {}),
    ...(contact !== undefined ? { contact } : {}),
    ...(hides(fill.contact?.map) ? { map: null } : {}),
    ...(hides(fill.contact?.socials) ? { socials: [] } : {}),
    authorFill: fill
  }
}

/**
 * The brief build's content door with the accepted plan laid over its site plan: every fill stage that reads
 * `sitePlanFor` reads the plan's decisions. With no fill the door is returned as it is.
 * @template T
 * @param {T} woContent @param {ReturnType<typeof planFill>} fill
 * @returns {T}
 */
export function withPlanFill(woContent, fill) {
  if (!fill || !woContent || typeof woContent !== 'object') return woContent
  const source = /** @type {any} */ (woContent)
  if (typeof source.sitePlanFor !== 'function') return woContent
  const sitePlanFor = async (/** @type {any} */ args) => overlaySitePlan(await source.sitePlanFor(args), fill)
  return new Proxy(source, {
    get(target, prop) {
      if (prop === 'sitePlanFor') return sitePlanFor
      const value = target[prop]
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}
