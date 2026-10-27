/**
 * The link checks of the Template Customization Question Readiness built-site check, each on one page's document (and its demo page):
 * - `deadButtons`: an action button whose link is `#`, empty or `javascript:` (PAGE-5); social
 *   buttons keep the demo's empty link (K6) and are left out;
 * - `fileLinks`: a link to a file (a PDF profile, an uploaded media file): on FULL a file of the demo
 *   company is a wrong destination (10/10, DEMO FILE LINKS);
 * - `socialLinks`: the social buttons and icons of a page, to compare their count with the demo (K6);
 * - `pageNavigation`: the Previous / Next targets of an article page (PAGE-2);
 * - `foreignLang`: elements whose `lang` differs from the page's (a contact form left `en-US`).
 */

const NETWORK =
  /\b(facebook|instagram|twitter|linkedin|tiktok|youtube|pinterest|threads|telegram|whatsapp|discord|github|zalo|dribbble|behance|vimeo|mastodon|bluesky)\b|\bt\.me\/|\bx\.com\/|\bvk\.com\//i
const BUTTON = /\b(btn[\w-]*|button[\w-]*|wp-block-button__link|cta[\w-]*)\b/i
const DEAD = /^\s*(#|javascript:.*)?\s*$/i
const FILE = /\.(pdf|docx?|pptx?|xlsx?|zip)(\?|#|$)|\/_emdash\/api\/media\/file\//i
const text = (/** @type {any} */ el) =>
  String(el?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
export const labelOf = (/** @type {any} */ a) =>
  text(a) || a.getAttribute('aria-label') || a.getAttribute('title') || ''

/** Every link of a page with its words and classes. */
export function linksOf(/** @type {any} */ doc) {
  return [...doc.querySelectorAll('a')].map((a) => ({
    href: a.getAttribute('href') ?? '',
    label: labelOf(a),
    cls: `${a.getAttribute('class') ?? ''} ${a.parentElement?.getAttribute('class') ?? ''}`,
    // Menus and pagination: their words are the page's own title or a page number, not a call.
    pager: !!a.closest('[class*=pagination], .page-numbers, .pagenavigation'),
    nav: !!a.closest(
      'header nav, header .menu, header [role=navigation], .t4-megamenu, .wp-block-navigation, nav.navbar, .t4-offcanvas, #offcanvas, .breadcrumb, [aria-label*=readcrumb]'
    ),
    social: !!a.closest('[class*=social]')
  }))
}

export const isSocial = (/** @type {ReturnType<typeof linksOf>[number]} */ l) =>
  l.social || NETWORK.test(l.href) || NETWORK.test(l.label) || /social/i.test(l.cls)

export const deadButtons = (/** @type {any} */ doc) =>
  linksOf(doc)
    .filter((l) => BUTTON.test(l.cls) && DEAD.test(l.href) && !isSocial(l) && l.label)
    .map((l) => `${l.label} → ${l.href || '(empty)'}`)

// A card or slide that links a file as a whole (its words run past a button's) is not a button.
export const fileLinks = (/** @type {any} */ doc) =>
  linksOf(doc)
    .filter((l) => FILE.test(l.href) && l.label.length <= 60)
    .map((l) => `${l.label || '(no words)'} → ${l.href}`)

export const socialLinks = (/** @type {any} */ doc) => linksOf(doc).filter(isSocial)

const NETWORK_NAME =
  'facebook|instagram|twitter|linkedin|tiktok|youtube|pinterest|threads|telegram|whatsapp|discord|github|zalo|dribbble|behance|vimeo|mastodon|bluesky|vk|vkontakte|dzen|ok'
// A label that is one network's name and nothing else ("Telegram", "VK ↗"), never a sentence.
const NETWORK_LABEL = new RegExp(`^[^\\p{L}\\p{N}]*(${NETWORK_NAME}|x)[^\\p{L}\\p{N}]*$`, 'iu')
// An icon class naming one network: fa-facebook, bi-instagram, icon-vk, wp-social-link-x.
const NETWORK_CLASS = new RegExp(
  `(^|[\\s_-])(${NETWORK_NAME}|x-twitter)(-[a-z]+)?($|\\s)|wp-social-link-[a-z]+`,
  'i'
)
const SKIP_TAGS = /^(A|OPTION|SCRIPT|STYLE|TITLE|H[1-6]|P|LABEL|BUTTON)$/i

/** One element that shows a single network by its own words, accessible name or icon class. */
function namesNetwork(/** @type {any} */ el) {
  const own = [text(el), el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? ''].filter(Boolean)
  return own.some((s) => NETWORK_LABEL.test(s)) || NETWORK_CLASS.test(String(el.getAttribute('class') ?? ''))
}

/**
 * The social buttons and icons of a page, link or not (K6 keeps a button with its link emptied,
 * and a template may then print it as a `<span>`): every social `<a>`, plus each element outside a
 * link that names one network by its label or icon class, counted once at its outermost element.
 */
export function socialItems(/** @type {any} */ doc) {
  const links = [...doc.querySelectorAll('a')].filter(
    (a) =>
      NETWORK_LABEL.test(labelOf(a)) ||
      isSocial({
        href: a.getAttribute('href') ?? '',
        label: labelOf(a),
        cls: `${a.getAttribute('class') ?? ''} ${a.parentElement?.getAttribute('class') ?? ''}`,
        pager: false,
        nav: false,
        social: !!a.closest('[class*=social]')
      })
  )
  const loose = [...doc.querySelectorAll('body *')].filter(
    (el) =>
      !SKIP_TAGS.test(el.tagName) &&
      !el.closest('a, head') &&
      !el.querySelector('a') &&
      text(el).length <= 30 &&
      namesNetwork(el)
  )
  const outermost = loose.filter((el) => !loose.some((o) => o !== el && o.contains(el)))
  return [...links, ...outermost]
}

/** Previous / Next of an article page, as paths (null when absent). */
export function pageNavigation(/** @type {any} */ doc, /** @type {string} */ origin) {
  const pick = (/** @type {string} */ sel) => {
    const a = doc.querySelector(sel)
    if (!a) return null
    try {
      return new URL(a.getAttribute('href') ?? '', origin).pathname
    } catch {
      return null
    }
  }
  return {
    prev: pick(
      'nav.pagenavigation a.previous, a[rel=prev], .wp-block-post-navigation-link.post-navigation-link-previous a, .nav-previous a'
    ),
    next: pick(
      'nav.pagenavigation a.next, a[rel=next], .wp-block-post-navigation-link.post-navigation-link-next a, .nav-next a'
    )
  }
}

/** A path of a link, or null for another origin, an anchor or a mail link. */
export function pathOf(/** @type {string} */ href, /** @type {string} */ origin) {
  if (DEAD.test(href) || /^(mailto|tel):/i.test(href)) return null
  try {
    const u = new URL(href, origin)
    return u.origin === new URL(origin).origin ? u.pathname.replace(/\/$/, '') || '/' : null
  } catch {
    return null
  }
}

/** Elements whose `lang` is another language than the page's. */
export function foreignLang(/** @type {any} */ doc) {
  const page = String(doc.documentElement?.getAttribute('lang') ?? '')
    .slice(0, 2)
    .toLowerCase()
  if (!page) return []
  // A language list (each option in its own language) is right as it is.
  return [...doc.querySelectorAll('body [lang]')]
    .filter((el) => el.tagName !== 'OPTION' && !el.closest('[class*=lang], [class*=language]'))
    .filter((el) => String(el.getAttribute('lang')).slice(0, 2).toLowerCase() !== page)
    .map(
      (el) =>
        `<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') ?? '').slice(0, 40)}" lang="${el.getAttribute('lang')}">`
    )
}
