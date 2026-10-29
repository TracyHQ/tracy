// Sharper reads of the leftover kinds outside the content map (ticket #196 of spec #189): the demo video (C08), the demo
// background from the template settings (C10), the showcase page (C11), demo words in a page address (C12), the template
// credit line (C14), the demo on the not-found or offline page (C16) and the link that leads nowhere (C19).
//
// 🔒 WHAT THE TRACY HEAD BLOCK HIDES IS NOT SHOWN: a build that can write a piece nowhere else hides it in one marked
// `<style data-tracy-leftovers>` (`outside-map.mjs`); a file, a video id or an address that block names is not a leftover a
// visitor meets. Rules by role, markup and address, never by template. Pure.
import { CREDIT_LINES, hiddenByHeadBlock, youtubeIdsOf } from './outside-map.mjs'
import { pageRole } from './page-plan.mjs'

/** A file a build uploaded for the business: never a demo file. */
const OWNER_UPLOAD = /(^|\/)images\/tracy[-_/]/i
const IMAGE_FILE = /images\/[^"'?#\s)]+\.(?:jpe?g|png|webp|svg|gif|avif)/i
/** Address words that name a kind of page, never a demo's subject (`about-us`, `our-services`). */
const GENERIC = new Set(
  'home about us our contact contacts blog news services service pricing prices plans plan gallery team faq faqs shop products product page pages events event'.split(
    ' '
  )
)
/** The body classes of a CMS's own showcase views: a log-in or sign-up form, a profile, a site search. */
const SHOWCASE_VIEW =
  /<body\b[^>]*class\s*=\s*["'][^"']*\b(?:com_users|view-login|view-registration|view-reset|view-remind|view-profile)\b/i
/** A typography showcase prints its headings' names as words. */
const TYPOGRAPHY = /\bh1\.\s*heading\s*1\b|\bheading\s+1\b[\s\S]{0,400}\bheading\s+2\b/i
/** A Joomla menu entry address the router could not route: its page is off. */
const UNROUTED = /(?:^|\/)index\.php\?(?:[^"']*&)?Itemid=(\d+)$/
const TOGGLE = /role\s*=\s*["']button|toggle|data-bs-|data-toggle|dropdown|close|modal/i

const hiddenOf = (page) => (page.hidden ??= hiddenByHeadBlock(page.html))
const hides = (page, value) => [...hiddenOf(page)].some((token) => String(value ?? '').includes(token))
/** The `<head>` stripped, so the block's own words are not read as the page's. */
const bodyOf = (html) => String(html ?? '').replace(/<head\b[\s\S]*?<\/head\s*>/i, ' ')
const pathWords = (path) => path.replace(/^\/+|\/+$/g, '').replace(/^index\.php\/?/, '')

/** Findings of a slot rule whose piece the page's head block hides, taken out. */
export const notHidden = (ctx, findings) =>
  findings.filter((f) => {
    const page = [...ctx.served, ...ctx.failed].find((p) => p.path === f.page)
    return !page || !hides(page, f.found)
  })

/** C08: a demo video slot still shown, and any YouTube video a page plays that the brief does not hold. */
export function demoVideoLeftovers(ctx, bySlotFindings) {
  const out = notHidden(ctx, bySlotFindings)
  const own = new Set(youtubeIdsOf(ctx.demo.own))
  for (const page of ctx.served)
    for (const id of youtubeIdsOf(bodyOf(page.html)))
      if (
        !own.has(id) &&
        !hides(page, id) &&
        !ctx.demo.own.includes(id.toLowerCase()) &&
        !out.some((f) => f.page === page.path && f.found === id)
      )
        out.push({ page: page.path, place: 'video', found: id })
  return out
}

/** The innermost rules of a stylesheet that paint a background picture. */
function backgroundRules(css) {
  const out = []
  for (const [, selector, body] of String(css ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/([^{}@;]+)\{([^{}]*)\}/g))
    for (const [, url] of body.matchAll(/background(?:-image)?\s*:[^;]*?url\(\s*["']?([^"')]+)["']?\s*\)/gi))
      out.push({ selector: selector.trim(), file: String(url).match(IMAGE_FILE)?.[0] ?? null })
  return out
}

/** C10: a background picture the page or its stylesheets paint that no slot holds, no build uploaded and no block repaints. */
export function demoBackgroundLeftovers(ctx) {
  const demoFile = (file) =>
    file && !OWNER_UPLOAD.test(file) && !ctx.demo.files.has(file) && !ctx.demo.slotFiles.has(file)
  const out = []
  for (const page of ctx.served)
    for (const url of page.backgrounds) {
      const file = String(url).match(IMAGE_FILE)?.[0]
      if (demoFile(file) && !hides(page, file))
        out.push({ page: page.path, place: 'background-image', found: file })
    }
  const first = ctx.served[0]
  for (const style of ctx.styles ?? [])
    for (const { selector, file } of backgroundRules(style.css))
      if (demoFile(file) && !(first && hides(first, file)))
        out.push({ page: style.href ?? 'stylesheet', place: selector, found: /** @type {string} */ (file) })
  return out
}

/** C11: a showcase page served (by its address, its view or its typography sample), and a link that still leads to one. */
export function showcaseLeftovers(ctx) {
  const out = []
  const isShowcase = (path) => path !== '/' && pageRole({ id: pathWords(path) }) === 'sample'
  for (const page of ctx.served) {
    if (isShowcase(page.path) || SHOWCASE_VIEW.test(page.html) || TYPOGRAPHY.test(page.text))
      out.push({ page: page.path, place: page.path, found: page.path })
    for (const link of page.links) {
      const href = String(link.href ?? '').replace(/[?#].*$/, '')
      if (
        href.startsWith('/') &&
        isShowcase(href) &&
        !hides(page, link.href) &&
        !ctx.missing.has(href.replace(/\/+$/, ''))
      )
        out.push({ page: page.path, place: `a[href="${link.href}"]`, found: link.label || href })
    }
  }
  return out
}

/** C12: an address (the page's or a link's) that carries a demo alias whose words are not all generic page words. */
export function addressLeftovers(ctx) {
  const aliases = ctx.demo.aliases.filter(
    (a) => !a.split('-').every((w) => GENERIC.has(w) || /^\d+$/.test(w))
  )
  const out = []
  for (const page of ctx.served) {
    const addresses = [page.path, ...page.links.map((l) => l.href).filter((h) => h?.startsWith('/'))]
    for (const address of new Set(addresses)) {
      const alias = aliases.find((a) => address.split(/[/?#]/).includes(a))
      if (alias) out.push({ page: page.path, place: address, found: alias })
    }
  }
  return out
}

/** C14: a credit line of the CMS or the template in what a visitor reads (the head block's words are not read). */
export function creditLeftovers(ctx) {
  return [...ctx.served, ...ctx.failed].flatMap((page) =>
    CREDIT_LINES.filter((re) => re.test(page.text)).map((re) => ({
      page: page.path,
      place: 'footer credit',
      found: /** @type {RegExpMatchArray} */ (page.text.match(re))[0]
    }))
  )
}

/** C16: a demo piece on the not-found or offline page that its head block does not hide. */
export function errorPageLeftovers(ctx, shown) {
  return ctx.failed.flatMap((page) => {
    const hits = ctx.demo.slots
      .map(({ probe }) => shown(page, probe))
      .filter((found) => found && !hides(page, found))
    const files = [
      ...new Set(page.sources.map((s) => String(s).match(IMAGE_FILE)?.[0]).filter(Boolean))
    ].filter((f) => (ctx.demo.files.has(f) || ctx.demo.slotFiles.has(f)) && !hides(page, f))
    return [...new Set([...hits, ...files])].map((found) => ({ page: page.path, place: found, found }))
  })
}

/**
 * C19: a link with words that leads to `#` (not a toggle), to an address the site does not serve, or to a Joomla menu entry
 * the router could not route (`index.php?Itemid=N`: its page is off), unless the head block hides it.
 */
export function deadLinkLeftovers(ctx, bySlotFindings) {
  const out = notHidden(ctx, bySlotFindings)
  for (const page of ctx.served)
    for (const link of page.links) {
      const href = String(link.href ?? '').replace(/&amp;/g, '&')
      if (hides(page, href)) continue
      const named =
        link.text &&
        !TOGGLE.test(link.attrs) &&
        !/facebook|twitter|instagram|youtube|linkedin|tiktok|pinterest/i.test(`${link.attrs} ${link.text}`)
      if ((href === '#' || href === '' || /^javascript:/i.test(href)) && named)
        out.push({ page: page.path, place: `a[href="#"] "${link.label}"`, found: link.label })
      else if (UNROUTED.test(href) && named) out.push({ page: page.path, place: href, found: href })
      else if (href && ctx.missing.has(href.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/'))
        out.push({ page: page.path, place: href, found: href })
    }
  return out
}
