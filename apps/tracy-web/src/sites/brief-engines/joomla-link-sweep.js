/**
 * Every link of a finished Joomla brief build that leads nowhere (spec TracyHQ/tracy#189, C19), rewritten or removed in the
 * record that holds it, never only hidden by a style:
 *
 *   dead target  a link to a menu entry or an article that is no longer published goes to the nearest published entry above
 *                it in the menu; with none, a contact-like link goes to the contact page, and any other link is removed
 *   own page     a link to the page its own section is shown on (the module is assigned to specific pages, one of them the
 *                target) goes to the main action of the business (its contact, phone or WhatsApp page), else is removed
 *   `#` link     an empty target goes by the role of its words: a call or message to the business's phone or WhatsApp, a
 *                booking or contact wish to the contact page, an offering's name to the page of that offering; else removed
 *
 * It reads the site as it stands after the tidy-up, so it judges the final menu. The places it reads are the three that hold
 * links: a custom module's HTML anchors, a JSON list of a style module (`...[link]` arrays beside their titles), and a menu
 * entry of type link. Rules by structure and role, never by one template. Pure functions + one writer.
 */
import { listWhole } from './joomla-articles.js'
import { paramsOf, readMenu, readModules, writeSteps } from './joomla-tidy.js'

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
const HREF = /(\shref\s*=\s*)(["'])([\s\S]*?)\2/i
const EMPTY = /^(?:#|javascript:\s*(?:void\(0\))?;?|)$/i
const LINK_KEY = /\[[^\]]*(?:link|url|href)\]$/i

const textOf = (/** @type {string} */ html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * What the sweep needs to know about the site, built once.
 * @param {{ menu: any[], articles: any[], contact?: { phoneHref?: string, whatsappHref?: string } }} input
 */
export function sweepContext({ menu, articles, contact = {}, primaryAction = null }) {
  const live = menu.filter((r) => Number(r.published) === 1 && Number(r.id) > 1)
  const byId = new Map(menu.map((r) => [Number(r.id), r]))
  const liveIds = new Set(live.map((r) => Number(r.id)))
  const goneArticles = new Set(articles.filter((a) => Number(a.state) !== 1).map((a) => String(a.id)))
  const contactEntry = live.find((r) => /[?&]view=contact\b/.test(String(r.link ?? '')))
  const home = menu.find((r) => Number(r.home) === 1)
  /** @type {Map<string, string>} */
  const pages = new Map()
  for (const r of live) {
    const title = String(r.title ?? '')
      .trim()
      .toLowerCase()
    if (title && !pages.has(title) && !/^index\.php\?itemid=/i.test(String(r.link ?? '')) && r.type !== 'url')
      pages.set(title, `index.php?Itemid=${r.id}`)
  }
  for (const a of articles)
    if (Number(a.state) === 1) {
      const title = String(a.title ?? '')
        .trim()
        .toLowerCase()
      if (title && !pages.has(title))
        pages.set(
          title,
          `index.php?option=com_content&view=article&id=${a.id}${a.catid ? `&catid=${a.catid}` : ''}`
        )
    }
  return {
    byId,
    liveIds,
    goneArticles,
    homeId: home ? Number(home.id) : 0,
    contactHref: contactEntry ? `index.php?Itemid=${contactEntry.id}` : null,
    phoneHref: contact.phoneHref ?? null,
    whatsappHref: contact.whatsappHref ?? null,
    primaryLabel: typeof primaryAction?.label === 'string' ? primaryAction.label : null,
    primaryHref: primaryHrefOf(
      {
        contactHref: contactEntry ? `index.php?Itemid=${contactEntry.id}` : null,
        phoneHref: contact.phoneHref ?? null,
        whatsappHref: contact.whatsappHref ?? null
      },
      primaryAction
    ),
    pages
  }
}

/** The real destination of the business's main action: its channel's page or link, never an invented one. */
function primaryHrefOf(where, action) {
  const channel = action?.channel
  if (channel === 'phone') return where.phoneHref ?? where.contactHref
  if (channel === 'whatsapp') return where.whatsappHref ?? where.contactHref
  return action ? where.contactHref : null
}

/** The nearest published entry above a gone menu entry, or null. */
function ancestorOf(ctx, id) {
  const seen = new Set()
  for (
    let at = Number(ctx.byId.get(id)?.parent_id ?? 0);
    at > 1 && !seen.has(at);
    at = Number(ctx.byId.get(at)?.parent_id ?? 0)
  ) {
    seen.add(at)
    if (ctx.liveIds.has(at) && ctx.byId.get(at)?.type !== 'heading') return at
  }
  return null
}

/** The role of an empty link's words: where it should lead. */
function byRole(ctx, text) {
  const t = text.toLowerCase().trim()
  if (/\b(call|phone|ring|dial)\b/.test(t)) return ctx.phoneHref ?? ctx.whatsappHref ?? ctx.contactHref
  if (/\b(whatsapp|message|chat|text us)\b/.test(t))
    return ctx.whatsappHref ?? ctx.phoneHref ?? ctx.contactHref
  if (
    /\b(contact|get in touch|hello|enquir\w*|book\w*|trial|reach|apply|join|sign up|register|reserve|schedule)\b/.test(
      t
    )
  )
    return ctx.contactHref
  return ctx.pages.get(t) ?? null
}

/**
 * Where a link should lead.
 * @param {Set<number> | null} [here] - the menu entries the link's own module is shown on (null: unknown or every page)
 * @returns {{ keep: true } | { keep: false, href: string | null, self?: true }} `href` null: remove the link
 */
export function resolveLink(ctx, href, text, here = null) {
  const raw = String(href ?? '').trim()
  const own = /[?&]Itemid=(\d+)/i.exec(raw)?.[1]
  if (own && here && here.size > 0 && !here.has(0) && here.has(Number(own)) && ctx.liveIds.has(Number(own)))
    return { keep: false, href: ctx.primaryHref, self: true }
  if (EMPTY.test(raw)) {
    const to = byRole(ctx, text)
    return to ? { keep: false, href: to } : { keep: false, href: null }
  }
  const item = /[?&]Itemid=(\d+)/i.exec(raw)?.[1]
  if (item && !ctx.liveIds.has(Number(item)) && ctx.byId.has(Number(item))) {
    const up = ancestorOf(ctx, Number(item))
    if (up) return { keep: false, href: `index.php?Itemid=${up}` }
    return {
      keep: false,
      href: byRole(ctx, text) && /contact|touch|hello|book|trial/i.test(text) ? ctx.contactHref : null
    }
  }
  const article =
    /[?&]view=article\b[^"']*?[?&]id=(\d+)/i.exec(raw)?.[1] ??
    /[?&]id=(\d+)[^"']*?[?&]view=article\b/i.exec(raw)?.[1]
  if (article && ctx.goneArticles.has(article))
    return { keep: false, href: /contact|touch|hello|book|trial/i.test(text) ? ctx.contactHref : null }
  return { keep: true }
}

/**
 * A module's HTML with every unusable link rewritten or taken out. With `keepNodes` (an article's body, whose nodes the
 * content contract binds by path) a link is only ever rewritten to a target, never removed or unwrapped.
 */
export function sweepHtml(ctx, html, { keepNodes = false, here = null } = {}) {
  let changed = 0
  const swap = (whole, attrs, inner) => {
    const href = HREF.exec(attrs)?.[3]
    if (href === undefined) return whole
    const to = resolveLink(ctx, href, textOf(inner), here)
    if (to.keep || (!to.href && keepNodes)) return whole
    changed += 1
    if (to.href) {
      // A self-link sent to the main action says the main action's words when it only held plain words.
      const words = to.self && ctx.primaryLabel && !/</.test(inner) ? ctx.primaryLabel : inner
      return `<a${attrs.replace(HREF, (_m, lead, quote) => `${lead}${quote}${to.href}${quote}`)}>${words}</a>`
    }
    return /\bbtn\b|button/i.test(attrs) || textOf(inner) === '' ? '' : inner
  }
  let out = keepNodes
    ? String(html ?? '')
    : String(html ?? '').replace(
        /<li\b[^>]*>\s*(<a\b([^>]*)>([\s\S]*?)<\/a\s*>)\s*<\/li>/gi,
        (whole, anchor, attrs, inner) => {
          const before = changed
          const made = swap(anchor, attrs, inner)
          if (changed === before) return whole
          return /<a\b/i.test(made) ? whole.replace(anchor, () => made) : ''
        }
      )
  out = out.replace(ANCHOR, swap)
  return { html: out, changed }
}

/** The links of a style module's JSON list: a link array beside the other arrays of its group (the words of each item). */
function sweepList(ctx, node, tally, here = null) {
  if (!node || typeof node !== 'object') return
  if (!Array.isArray(node)) {
    const groups = new Map()
    for (const key of Object.keys(node)) {
      const prefix = key.includes('[') ? key.slice(0, key.indexOf('[')) : null
      if (prefix && Array.isArray(node[key])) groups.set(prefix, [...(groups.get(prefix) ?? []), key])
    }
    for (const keys of groups.values())
      for (const linkKey of keys.filter((k) => LINK_KEY.test(k)))
        node[linkKey].forEach((value, i) => {
          if (typeof value !== 'string') return
          const words = keys
            .filter((k) => k !== linkKey && typeof node[k]?.[i] === 'string')
            .map((k) => textOf(node[k][i]))
            .join(' ')
          const to = resolveLink(ctx, value, words, here)
          if (to.keep) return
          node[linkKey][i] = to.href ?? ''
          tally.changed += 1
        })
  }
  for (const v of Array.isArray(node) ? node : Object.values(node)) sweepList(ctx, v, tally, here)
}

/** A style module's parameters with its list links resolved, or null when nothing changed. */
export function sweepParams(ctx, params, here = null) {
  const raw = params?.['jatools-config']
  if (typeof raw !== 'string' || !/\[[^\]"]*(?:link|url|href)\]/i.test(raw)) return null
  let config
  try {
    config = JSON.parse(raw)
  } catch {
    return null
  }
  const tally = { changed: 0 }
  sweepList(ctx, config, tally, here)
  return tally.changed
    ? { params: { ...params, 'jatools-config': JSON.stringify(config) }, changed: tally.changed }
    : null
}

/** A link entry of the menu: the step that fixes or takes it off, or null. */
export function sweepEntry(ctx, row) {
  if (Number(row.published) !== 1 || row.type !== 'url') return null
  const link = String(row.link ?? '')
  if (/^index\.php\?Itemid=$/i.test(link)) return null
  const to = resolveLink(ctx, link, String(row.title ?? ''))
  if (to.keep) return null
  if (
    EMPTY.test(link.trim()) &&
    [...ctx.byId.values()].some((r) => Number(r.parent_id) === Number(row.id) && Number(r.published) === 1)
  )
    return null
  return { kind: 'menuItem', id: Number(row.id), fields: to.href ? { link: to.href } : { published: 0 } }
}

/** The menu entries a module is shown on (`#__modules_menu`); null when unreadable. 0 means every page. */
async function pagesOf(apply, siteKey, id) {
  try {
    const got = await apply({
      siteKey,
      action: 'content.get',
      params: { kind: 'moduleAssignment', id: Number(id) }
    })
    const ids = JSON.parse(String(got?.item?.menuids ?? 'null'))
    return Array.isArray(ids) ? new Set(ids.map(Number)) : null
  } catch {
    return null
  }
}

/**
 * Sweep the whole site and write the fixes under one apply id. Never throws: what cannot be read or written is said.
 * @returns {Promise<number>} how many records were written
 */
export async function sweepDeadLinks({ apply, siteKey, plan, applyId, note }) {
  try {
    const [menu, modules, articles] = await Promise.all([
      readMenu(apply, siteKey),
      readModules(apply, siteKey),
      listWhole(apply, siteKey, 'article')
    ])
    const ctx = sweepContext({
      menu,
      articles,
      contact: { phoneHref: plan?.contact?.phone?.href, whatsappHref: plan?.contact?.whatsapp?.href },
      primaryAction: plan?.primaryAction
    })
    const steps = []
    for (const row of menu) {
      const step = sweepEntry(ctx, row)
      if (step) steps.push(step)
    }
    for (const a of articles) {
      if (Number(a.state) !== 1) continue
      const fields = {}
      for (const column of ['introtext', 'fulltext'])
        if (typeof a[column] === 'string' && a[column].includes('<a')) {
          const made = sweepHtml(ctx, a[column], { keepNodes: true })
          if (made.changed) fields[column] = made.html
        }
      if (Object.keys(fields).length) steps.push({ kind: 'article', id: Number(a.id), fields })
    }
    for (const m of modules) {
      if (Number(m.published) !== 1 || m.note === 'tracy-leftovers') continue
      const fields = {}
      const here = await pagesOf(apply, siteKey, m.id)
      if (m.module === 'mod_custom' && typeof m.content === 'string') {
        const made = sweepHtml(ctx, m.content, { here })
        if (made.changed) fields.content = made.html
      }
      const params = paramsOf(m.params)
      const listed = params ? sweepParams(ctx, params, here) : null
      if (listed) fields.params = JSON.stringify(listed.params)
      if (Object.keys(fields).length) steps.push({ kind: 'module', id: Number(m.id), fields })
    }
    if (steps.length === 0) return 0
    const done = await writeSteps({ apply, siteKey, steps, applyId })
    for (const line of done.notes.slice(0, 3)) note(line)
    return done.written
  } catch (error) {
    note(`the links to pages taken off could not be swept: ${error instanceof Error ? error.message : error}`)
    return 0
  }
}
