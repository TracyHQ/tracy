/**
 * The brief's own identity written over the demo's in a Joomla site's custom modules and articles (spec TracyHQ/tracy#189,
 * ticket #193), from the site plan's `logo`, `posts`, `socials` and `map` decisions (`site-plan-identity.mjs`).
 *
 *   socials  a social link of the template is pointed at the brief's profile of that network; the first link of a network
 *            the business lacks carries its WhatsApp when the brief holds one and the link draws an icon font class; every
 *            other one is hidden in place (`hidden`, its address and words emptied), none left on `#` or on the demo's
 *            account. 🔒 Hidden, never cut out (#189): a contract slot bound inside the list keeps its node, so the
 *            records guard does not hold the whole module write. A WhatsApp link outside a social list is a contact fact's.
 *   map      an embedded map shows the brief's address, or is taken off; a module left with nothing to show is unpublished.
 *   logo     with no logo of the brief (`name-as-text`), a picture of the template's own logo files becomes the business name
 *            as text.
 *   posts    every demo post is unpublished. The brief's own posts are written afterwards by `joomla-wo-content.js`, which
 *            publishes again the articles it writes (an unpublished one counts as a place for a post).
 *
 * Rules by markup and role, never by template. A site no brief build made has no plan and writes nothing here; what the
 * site cannot give is a note, never a failed build.
 */
import { articleSteps, listWhole } from './joomla-articles.js'
import { contentOf } from './joomla-article-routes.js'
import { menuSteps, readMenu, readModules } from './joomla-tidy.js'
import { socialListParams } from './joomla-plan-social-lists.js'

const escapeHtml = (/** @type {string} */ s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
const HREF = /(\shref\s*=\s*)(["'])([\s\S]*?)\2/i
const GOOGLE_MAP = /google\.[a-z.]+\/maps|maps\.google/i
/** A link that shares the visited page, not a profile of the business. */
const SHARE = /sharer|share\?|intent\/tweet|share\.php/i
const NETWORKS = [
  ['facebook', /facebook|fb\.com/i],
  ['instagram', /instagram/i],
  ['x', /twitter|x\.com|fa-x-twitter/i],
  ['tiktok', /tiktok/i],
  ['youtube', /youtube|youtu\.be/i],
  ['linkedin', /linkedin/i],
  ['pinterest', /pinterest/i],
  ['telegram', /(^|[^a-z])t\.me\/|telegram/i]
]

/** An icon font class naming a network (`fa-facebook`, `fa-x-twitter`, `fa-instagram-square`). */
const ICON_NETWORK =
  /\bfa-(?:x-twitter|facebook|instagram|twitter|tiktok|youtube|linkedin|pinterest|telegram)(?:-[a-z]+)?\b/i
/** An anchor's inner HTML with its words taken out, its tags (the icon) kept. */
const textless = (/** @type {string} */ inner) => inner.replace(/>([^<]+)</g, (m, t) => (t.trim() ? '><' : m))

/** The network a link is for, from its address, its attributes and what it holds (an icon class, a word). */
function networkOf(/** @type {string} */ href, /** @type {string} */ attrs, /** @type {string} */ inner) {
  const text = `${href} ${attrs} ${inner}`
  if (/wa\.me\/|whatsapp/i.test(text)) return null
  for (const [net, re] of NETWORKS) if (re.test(text)) return net
  return null
}

/** A module that lists articles (not `mod_articles_categories`, which lists categories). */
const LISTS_ARTICLES = /^mod_articles(?:_category|_latest|_news|_popular|_archive)?$/

const paramsOf = (/** @type {any} */ row) => {
  if (row?.params && typeof row.params === 'object') return row.params
  try {
    return JSON.parse(String(row?.params ?? '{}')) ?? {}
  } catch {
    return {}
  }
}

/**
 * The menu entries and article-listing modules that only lead to demo posts, so none is left as an empty list or a dead
 * link once the posts are unpublished. A category (or the featured view) counts only when every published article in it is a
 * demo post: a page the business keeps in the same category keeps its entry and module.
 * @param {object} input
 * @param {any[]} input.menu @param {any[]} input.modules @param {any[]} input.articles
 * @param {Set<number>} input.demoIds @param {Set<string>} input.visible
 * @returns {{ menuIds: number[], moduleIds: number[] }}
 */
export function blogSurfacesGoing({ menu, modules, articles, demoIds, visible }) {
  const live = articles.filter((a) => Number(a.state) === 1)
  const onlyDemo = (/** @type {any[]} */ list) =>
    list.length > 0 && list.every((a) => demoIds.has(Number(a.id)))
  const cats = new Set(live.map((a) => String(a.catid)))
  const demoCats = new Set(
    [...cats]
      .filter((c) => live.some((a) => String(a.catid) === c && demoIds.has(Number(a.id))))
      .filter((c) => onlyDemo(live.filter((a) => String(a.catid) === c)))
  )
  const reach = (/** @type {any} */ row) => {
    const language = String(row.language ?? '*')
    return Number(row.published) === 1 && (language === '*' || visible.has(language))
  }
  const menuIds = menu
    .filter((row) => reach(row) && Number(row.id) > 1 && Number(row.home ?? 0) !== 1)
    .filter((row) => {
      const to = contentOf(row)
      if (to?.view === 'article') return demoIds.has(Number(to.id))
      if (to?.view === 'category') return demoCats.has(String(to.id))
      // 🔒 The featured view is the home page's own (and often a kept page's): it is never taken off here, whatever its
      // articles are. Taking it off broke the whole site (every page answered 404).
      return false
    })
    .map((row) => Number(row.id))
  const moduleIds = modules
    .filter((row) => reach(row) && LISTS_ARTICLES.test(String(row.module ?? '')))
    .filter((row) => {
      const raw = paramsOf(row).catid
      const named = (Array.isArray(raw) ? raw : raw ? [raw] : [])
        .map(String)
        .filter((id) => id !== '' && id !== '0')
      return named.length > 0 && named.every((id) => demoCats.has(id))
    })
    .map((row) => Number(row.id))
  return { menuIds, moduleIds }
}

/**
 * One module's HTML with the plan's identity decisions applied.
 * @param {string} html
 * @param {{ socials?: { keep?: Record<string, string> }, map?: { decision?: string, embed?: string },
 *   logo?: { decision?: string, name?: string, demoFiles?: string[] } }} plan
 * @returns {{ html: string, socials: number, maps: number, logos: number, emptied: boolean }}
 */
export function joomlaIdentityHtml(html, plan) {
  let socials = 0
  let maps = 0
  let logos = 0
  const keep = plan.socials?.keep ?? {}
  let whatsapp = typeof plan.socials?.whatsapp === 'string' ? plan.socials.whatsapp : null
  /** A social anchor of a network the business lacks: its WhatsApp, once, when it draws an icon font class; else hidden. */
  const spare = (/** @type {string} */ inner) => {
    if (whatsapp && ICON_NETWORK.test(inner)) {
      const href = whatsapp
      whatsapp = null
      const icon = inner.replace(ICON_NETWORK, 'fa-whatsapp')
      return `<a href="${escapeHtml(href)}" title="WhatsApp" target="_blank" rel="noopener">${textless(icon)}</a>`
    }
    return '<a href="" hidden></a>'
  }
  const swap = (/** @type {string} */ whole, /** @type {string} */ attrs, /** @type {string} */ inner) => {
    const href = HREF.exec(attrs)?.[3] ?? ''
    if (SHARE.test(href)) return whole
    const net = networkOf(href, attrs, inner)
    if (!net) return whole
    const own = keep[net]
    if (!own) {
      socials += 1
      return spare(inner)
    }
    if (href === own) return whole
    socials += 1
    const next = HREF.test(attrs)
      ? attrs.replace(HREF, (_m, lead, quote) => `${lead}${quote}${escapeHtml(own)}${quote}`)
      : `${attrs} href="${escapeHtml(own)}"`
    return `<a${next} target="_blank" rel="noopener">${inner}</a>`
  }
  // A list item that held only a hidden link is hidden with it, in place.
  let out = String(html ?? '').replace(
    /<li\b([^>]*)>(\s*)(<a\b([^>]*)>([\s\S]*?)<\/a\s*>)(\s*)<\/li>/gi,
    (whole, liAttrs, lead, anchor, attrs, inner, tail) => {
      const made = swap(anchor, attrs, inner)
      if (made === anchor) return whole
      const hidden = made.includes(' hidden>') && !/\shidden\b/.test(liAttrs)
      return `<li${liAttrs}${hidden ? ' hidden' : ''}>${lead}${made.replace(/^<a href="" hidden>/, '<a href="">')}${tail}</li>`
    }
  )
  out = out.replace(ANCHOR, (whole, attrs, inner) =>
    /\shidden\b/.test(attrs) || /^\s*href=""\s*$/.test(attrs) ? whole : swap(whole, attrs, inner)
  )
  out = out.replace(
    // The src is read whole and tested apart: one unbounded run each side of the map host would backtrack on long input.
    /<iframe\b[^>]*\ssrc\s*=\s*(["'])([^"']*)\1[^>]*>\s*<\/iframe\s*>/gi,
    (whole, quote, src) => {
      if (!GOOGLE_MAP.test(src)) return whole
      if ((plan.map?.decision === 'address' || plan.map?.decision === 'place') && plan.map.embed) {
        if (src === plan.map.embed || src.replace(/&amp;/g, '&') === plan.map.embed) return whole
        maps += 1
        return whole.replace(src, escapeHtml(plan.map.embed))
      }
      maps += 1
      return ''
    }
  )
  // A map drawn by the template's map plugin shortcode (`{jamap ...}{/jamap}`, the demo's coordinates in its attributes).
  out = out.replace(/\{jamap\b[\s\S]*?\{\/jamap\}/gi, () => {
    maps += 1
    return (plan.map?.decision === 'address' || plan.map?.decision === 'place') && plan.map.embed
      ? `<iframe src="${escapeHtml(plan.map.embed)}" width="100%" height="450" style="border:0" loading="lazy" allowfullscreen></iframe>`
      : ''
  })
  if (plan.logo?.decision === 'name-as-text' && plan.logo.name) {
    const files = plan.logo.demoFiles ?? []
    out = out.replace(/<img\b[^>]*>/gi, (tag) => {
      const src = tag.match(/\ssrc\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? ''
      if (!files.some((f) => src.includes(f))) return tag
      logos += 1
      return `<span class="tracy-brand-name">${escapeHtml(plan.logo?.name ?? '')}</span>`
    })
  }
  // What a visitor still sees once the hidden links are left out: nothing, and the module goes (a map taken off, or a
  // social block with no network of the business left).
  const seen = out
    .replace(/<li\b[^>]*\shidden\b[^>]*>[\s\S]*?<\/li\s*>/gi, '')
    .replace(/<a href=""(?: hidden)?><\/a>/g, '')
  const emptied =
    (maps > 0 || socials > 0) &&
    seen.replace(/<[^>]*>/g, '').trim() === '' &&
    !/<img\b|<iframe\b|<a\b[^>]*\shref="[^"]/i.test(seen)
  return { html: out, socials, maps, logos, emptied }
}

/**
 * Whether the site plan keeps a blog page for the brief's posts to go into. A plan that names its pages and keeps none of the
 * blog role leaves the posts no place, so the blog's entries and article-listing modules go with the demo posts (an empty
 * list is a demo leftover of its own). A plan that names no pages decides nothing here.
 * @param {any} plan
 */
export function keepsABlogPage(plan) {
  const pages = Array.isArray(plan?.pages) ? plan.pages : []
  return pages.length === 0 || pages.some((p) => p?.decision === 'keep' && p?.role === 'blog')
}

/** The numbers and mailbox of a site plan an icon row calls and mails (`joomla-plan-social-lists.js`). */
function contactIconsOf(/** @type {any} */ plan) {
  const phones = (Array.isArray(plan?.channels) ? plan.channels : [])
    .filter((c) => c?.kind === 'phone' && typeof c.href === 'string')
    .map((c) => ({ href: c.href, value: String(c.value) }))
  // The main number first (the plan's contact phone): an icon row shows that one only.
  const main = plan?.contact?.phone?.href ? String(plan.contact.phone.href) : null
  const at = main ? phones.findIndex((p) => p.href === main) : -1
  if (at > 0) phones.unshift(...phones.splice(at, 1))
  if (phones.length === 0 && main) phones.push({ href: main, value: String(plan.contact.phone.value) })
  const email = plan?.contact?.email?.href ? { href: String(plan.contact.email.href) } : null
  return phones.length || email ? { phones, email } : null
}

/**
 * The writes of the identity decisions: module HTML (merged over the steps already planned for the same module, so one
 * module gets one write), the module a taken-off map leaves empty unpublished, and the demo posts unpublished.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {{ siteKey: string, email: string, note: (line: string) => void, time?: (key: string, n: number) => void }} input.ctx
 * @param {{ sitePlanFor?: Function } | null} input.woContent
 * @param {Set<string>} input.visible
 * @param {Array<{ kind: string, id: number, fields: Record<string, unknown> }>} [input.base] - steps already planned
 * @returns {Promise<{ steps: Array<{ kind: string, id: number, fields: Record<string, unknown> }> }>}
 */
export async function planIdentitySteps({ apply, siteKey, ctx, woContent, visible, base = [] }) {
  const plan = await woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
  if (!plan || (!plan.socials && !plan.map && !plan.logo && !plan.posts)) return { steps: base }
  const steps = [...base]
  const planned = new Map(
    base.filter((s) => s.kind === 'module' && typeof s.fields?.content === 'string').map((s) => [s.id, s])
  )
  let counts = { socials: 0, maps: 0, logos: 0 }
  try {
    for (const row of await readModules(apply, siteKey)) {
      const language = String(row.language ?? '*')
      if (Number(row.published) !== 1 || (language !== '*' && !visible.has(language))) continue
      const before = planned.get(Number(row.id))
      // A JSON list of social links kept in the module's parameters (a JA ACM style module).
      // The row calls and mails the business before its networks (COO rule 29/10/2026): the plan's numbers and mailbox.
      const listed = socialListParams(paramsOf(row), plan.socials, contactIconsOf(plan))
      if (listed.changed > 0) {
        counts.socials += listed.changed
        const fields = {
          ...planned.get(Number(row.id))?.fields,
          params: JSON.stringify(listed.params),
          ...(listed.empty ? { published: 0 } : {})
        }
        const mine =
          planned.get(Number(row.id)) ?? steps.find((s) => s.kind === 'module' && s.id === Number(row.id))
        if (mine) mine.fields = fields
        else steps.push({ kind: 'module', id: Number(row.id), fields })
        if (listed.empty) continue
      }
      const html = before ? String(before.fields.content) : typeof row.content === 'string' ? row.content : ''
      if (html === '') continue
      const made = joomlaIdentityHtml(html, plan)
      if (made.html === html) continue
      counts = {
        socials: counts.socials + made.socials,
        maps: counts.maps + made.maps,
        logos: counts.logos + made.logos
      }
      const fields = {
        ...before?.fields,
        content: made.html,
        ...(made.emptied ? { published: 0 } : {})
      }
      if (before) before.fields = fields
      else steps.push({ kind: 'module', id: Number(row.id), fields })
    }
    if (counts.socials) ctx.time?.('socialLinksWritten', counts.socials)
    if (counts.maps) ctx.time?.('mapsWritten', counts.maps)
    if (counts.logos) ctx.time?.('demoLogosTakenOff', counts.logos)
  } catch (error) {
    ctx.note(
      `the modules' social links, map and logo could not be read: ${error instanceof Error ? error.message : error}`
    )
  }
  const ids = (plan.posts?.demoArticles ?? []).map((/** @type {{ id: number }} */ a) => Number(a.id))
  if (ids.length) {
    steps.push(...articleSteps(ids))
    ctx.time?.('demoPostsUnpublished', ids.length)
    // No post of the business to show: the blog's menu entries and article-listing modules go too (an empty list is a demo
    // leftover of its own). With posts of the brief, the blog stays and `joomla-wo-content.js` fills it.
    if (plan.posts?.decision === 'hide' || !keepsABlogPage(plan)) {
      try {
        const [menu, modules, articles] = await Promise.all([
          readMenu(apply, siteKey),
          readModules(apply, siteKey),
          listWhole(apply, siteKey, 'article')
        ])
        const going = blogSurfacesGoing({ menu, modules, articles, demoIds: new Set(ids), visible })
        const gone = new Set(steps.filter((s) => s.kind === 'menuItem').map((s) => s.id))
        steps.push(...menuSteps(going.menuIds.filter((id) => !gone.has(id))))
        for (const id of going.moduleIds) steps.push({ kind: 'module', id, fields: { published: 0 } })
        ctx.time?.('blogSurfacesHidden', going.menuIds.length + going.moduleIds.length)
      } catch (error) {
        ctx.note(
          `the blog's menu entries and modules could not be read, so they stay: ${error instanceof Error ? error.message : error}`
        )
      }
    }
  }
  return { steps }
}
