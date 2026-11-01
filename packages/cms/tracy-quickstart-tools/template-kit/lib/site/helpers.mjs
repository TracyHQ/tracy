// Pure helpers the kit calls per page, list and link: where a page's main title comes from, whether a list holds
// social profiles, and what a link does. CMS-neutral; each takes what was measured and returns a closed vocabulary
// value, or null with no guess when the measure does not say.

const SOCIAL_HOSTS =
  /(?:^|\.)(?:facebook|fb|instagram|twitter|x|t|telegram|tiktok|youtube|youtu|linkedin|pinterest|threads|wa|whatsapp|zalo|vk|snapchat|tumblr|discord|behance|dribbble)\.(?:com|me|be|net|org|me)$/i
const SOCIAL_ROLE = /^contact\.social_(?:url|label)$/
const PERSON_ROLE = /^person\./
const CONTROL_LABEL =
  /^(?:prev(?:ious)?|next|close|open|play|pause|stop|more|less|show more|load more|back to top|toggle|menu|search|\d+|[‹›«»<>←→↑↓×]+)$/i
const PRIMARY_ROLE = /^(?:contact|package|offering)\.cta_(?:url|label)$/

const norm = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Whether an address is a profile on a social network. */
export function isSocialProfile(href) {
  try {
    const u = new URL(href)
    return /^https?:$/.test(u.protocol) && SOCIAL_HOSTS.test(u.hostname.replace(/^www\./, ''))
  } catch {
    return false
  }
}

/**
 * What a list holds: `socialProfiles` (the business's social profiles), `personSocials` (the profiles of one person,
 * in a person card or a person's page), or null.
 * @param {{rowSlots?: Array<{role?: string|null}>}} list
 * @param {{blockRoles?: string[], rowLinks?: string[]}} [ctx] the slot roles of the whole block, the rows' links
 */
export function listHolds(list, ctx = {}) {
  const roles = (list?.rowSlots ?? []).map((s) => s.role ?? '')
  const links = ctx.rowLinks ?? []
  const social =
    roles.some((r) => SOCIAL_ROLE.test(r)) ||
    (links.length >= 2 && links.filter(Boolean).every((h) => isSocialProfile(h)))
  if (!social) return null
  const person = [...roles, ...(ctx.blockRoles ?? [])].some((r) => PERSON_ROLE.test(r))
  return person ? 'personSocials' : 'socialProfiles'
}

/**
 * What a link does: `primary-cta` | `go-to-item` | `contact` | `external-profile` | `navigation` | `submit-form` |
 * `page-control`.
 * @param {{label?: string|null, target?: string|null, href?: string|null, role?: string|null, submit?: boolean}} link
 *   `target` a page path of the site or an outside address; `role` the content map role of the link's slot
 * @param {{itemPaths?: Set<string>|string[], contactPaths?: Set<string>|string[], inRow?: boolean}} [ctx]
 */
export function linkAction(link, ctx = {}) {
  const has = (set, x) => (set instanceof Set ? set.has(x) : (set ?? []).includes(x))
  const target = String(link?.target ?? link?.href ?? '').trim()
  const label = norm(link?.label)
  if (link?.submit) return 'submit-form'
  if (PRIMARY_ROLE.test(link?.role ?? '')) return 'primary-cta'
  if (/^(?:tel:|mailto:|sms:)/i.test(target) || /(?:^|\.)wa\.me$|whatsapp\.com$/i.test(hostOf(target)))
    return 'contact'
  if (isSocialProfile(target)) return 'external-profile'
  if (
    !target ||
    /^(?:#|javascript:)/i.test(target) ||
    /[?&]start=\d+/.test(target) ||
    CONTROL_LABEL.test(label)
  )
    return 'page-control'
  if (has(ctx.contactPaths, target)) return 'contact'
  if (has(ctx.itemPaths, target) || ctx.inRow) return 'go-to-item'
  return 'navigation'
}

function hostOf(href) {
  try {
    return new URL(href).hostname
  } catch {
    return ''
  }
}

/**
 * Where a page's one main title (h1) comes from:
 *   template      the template prints it (a hero title, a fixed heading): nothing to set
 *   page-heading  the CMS's own page heading of the page's menu entry
 *   menu-param    another setting of the menu entry that the template's layout prints as the title
 *   content-slot  a content slot of the content map (an article title field, a block's heading)
 * `{via, ...}`, or `{via: null, reason}` when the page shows no h1 or several.
 * @param {{h1s: Array<{text: string, shown?: boolean, inPageHeader?: boolean}>, titleShownAs?: object|null, menu?: {title?: string, params?: object}|null, slotOf?: (text: string) => ({id: string, entityKind?: string}|null)}} page
 */
export function h1Source(page) {
  const shown = (page?.h1s ?? []).filter((h) => h.shown !== false && norm(h.text))
  if (!shown.length)
    return {
      via: null,
      reason: 'the page shows no h1',
      ...(page?.titleShownAs ? { titleShownAs: page.titleShownAs } : {}),
      // The CMS can print the menu entry's own heading as an h1 on this page (a later step may switch it on).
      pageHeadingAvailable: Boolean(page?.menu)
    }
  if (shown.length > 1)
    return { via: null, reason: `the page shows ${shown.length} h1`, texts: shown.map((h) => h.text) }
  const h = shown[0]
  const text = norm(h.text)
  const params = page.menu?.params ?? {}
  const heading = norm(params.page_heading) || norm(page.menu?.title)
  if (h.inPageHeader && heading && text === heading && params.show_page_heading !== '0')
    return { via: 'page-heading', text: h.text }
  for (const [k, v] of Object.entries(params))
    if (k !== 'page_heading' && typeof v === 'string' && norm(v) && norm(v) === text)
      return { via: 'menu-param', param: k, text: h.text }
  const slot = page.slotOf?.(h.text) ?? null
  if (slot) return { via: 'content-slot', slot: slot.id, text: h.text }
  if (h.inPageHeader && heading && text === heading) return { via: 'page-heading', text: h.text }
  return { via: 'template', text: h.text }
}
