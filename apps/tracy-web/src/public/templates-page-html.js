/**
 * The HTML of the public Templates pages (issue #1762): pure functions, data in, a complete document
 * out. No database, no request, no script: everything a visitor or a crawler reads is in the answer.
 *
 * Every value from a card (name, blurb, picture address, demo address) is published data a person
 * typed, so it is escaped here, and an address is used only when it is an http(s) URL.
 */
import { escapeHtml } from '../lib/html.js'
import { TRACY_ICON_DATA_URI } from '../lib/tracy-icon.js'
import { CHROME_SCRIPT, THEME_BOOT_SCRIPT, footer, header } from './templates-chrome-html.js'
import { TEMPLATES_CSS } from './templates-page-style.js'
import { platformIcon } from './templates-button-icons.js'
import { industryOf } from './templates-industry.js'
import { PREVIEW_SCRIPT, demoButton, demoPages, livePreview, previewBlock } from './templates-preview-html.js'
import { PLATFORM_NAMES, WORDS, wordsFor } from './templates-words.js'

const FONTS =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap'
/** The keys of a visit's campaign, carried onto the build link as the Design inspiration page does. */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']
const DESCRIPTION_MAX = 160

/** An http(s) address, or null: a card's picture or demo is never trusted to be a URL. */
export function webAddress(value) {
  if (typeof value !== 'string' || value === '') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export const platformName = (platform) => PLATFORM_NAMES[platform] ?? String(platform)

/** The platforms a template runs on, each once, in the card's order. */
export function platformsOf(template) {
  const seen = []
  for (const p of Array.isArray(template?.platforms) ? template.platforms : [])
    if (typeof p?.platform === 'string' && !seen.includes(p.platform)) seen.push(p.platform)
  return seen
}

export const templatePath = (id) => `/templates/${encodeURIComponent(id)}/`

/**
 * A card's blurb in the page's language: its stored translation (`card.blurbs`, filled by
 * `lib/template-blurb-translations.js`), else the published English. The industry guess and
 * `/llms.txt` keep reading the English `card.blurb`.
 */
export function blurbOf(template, lang = 'en') {
  const card = template?.card ?? {}
  const translated = card.blurbs && typeof card.blurbs === 'object' ? card.blurbs[lang] : undefined
  const text = typeof translated === 'string' && translated.trim() ? translated : card.blurb
  return typeof text === 'string' ? text.trim() : ''
}

/** The existing build road (`packages/web/tracy-design-page/src/templates.mjs` `buildUrl`), utm carried. */
export function buildLink(id, platform, search = '') {
  const params = new URLSearchParams()
  params.set('inspiration', id)
  params.set('platform', platform)
  const page = new URLSearchParams(search)
  for (const key of UTM_KEYS) {
    const value = page.get(key)
    if (value) params.set(key, value)
  }
  return `/new/?${params.toString()}`
}

/** A phone shot (`*-390.png`): wrong for any landscape frame. */
const isPhoneShot = (url) => /-390\.[a-z]+$/i.test(new URL(url).pathname)

/**
 * The landscape picture of a card, as the ORIGINAL address (the full-page desktop shot), or null.
 * Order: the desktop shot of the layout keyed `home`; else the first layout with a desktop shot;
 * else `card.image` when it is not a phone shot. A phone shot is never returned.
 */
export function heroImage(template) {
  const layouts = layoutsOf(template)
  const home = layouts.find((l) => l?.key === 'home' && webAddress(l?.shots?.desktop))
  const any = layouts.find((l) => webAddress(l?.shots?.desktop))
  const desktop = webAddress((home ?? any)?.shots?.desktop)
  if (desktop) return desktop
  const own = webAddress(template?.card?.image)
  return own && !isPhoneShot(own) ? own : null
}

/**
 * The same shot through the thumbnail door (`?w=`, first 16:10 screen as WebP). Addresses that are
 * not a stored shot are returned as they are; an existing query (`?v=`) is kept.
 */
export function thumbUrl(src, width) {
  const url = webAddress(src)
  if (!url) return null
  const u = new URL(url)
  if (!/\/api\/templates\/[^/]+\/shots\//.test(u.pathname)) return url
  u.searchParams.set('w', String(width))
  return u.href
}

export const layoutsOf = (template) => (Array.isArray(template?.card?.layouts) ? template.card.layouts : [])

/**
 * Up to four others, in a stable order: the same industry (sharing a platform first), then the same
 * style category, then anything sharing a platform. `industry` is the page's own industry when at
 * least one other template shares it, else null (the section keeps its plain heading).
 */
export function relatedTemplates(template, all) {
  const mine = platformsOf(template)
  const others = all.filter((t) => t.id !== template.id)
  const shares = (t) => platformsOf(t).some((p) => mine.includes(p))
  const industry = industryOf(template)
  const category = template.card?.category ?? null
  const sameIndustry = others.filter((t) => industryOf(t) === industry)
  const sameCategory = category ? others.filter((t) => t.card?.category === category) : []
  const pools = [
    sameIndustry.filter(shares),
    sameIndustry,
    sameCategory.filter(shares),
    sameCategory,
    others.filter(shares)
  ]
  const picked = []
  for (const t of pools.flat()) if (!picked.includes(t)) picked.push(t)
  return { list: picked.slice(0, 4), industry: sameIndustry.length ? industry : null }
}

const shortText = (text, max = DESCRIPTION_MAX) =>
  text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`

/**
 * One picture, or the "not available yet" placeholder in its place: never a broken image.
 * `thumb` ({widths, sizes}) serves it through the thumbnail door with a srcset; `big` is the largest
 * width, the plain `src`. Without `thumb` the address is used as it is (phone shots).
 */
function shot(src, alt, { lazy = true, thumb = null, w = WORDS } = {}) {
  const url = webAddress(src)
  if (!url)
    return `<div class="noshot" role="img" aria-label="${escapeHtml(alt)}">${escapeHtml(w.noPreview)}</div>`
  const loading = lazy ? ' loading="lazy" decoding="async"' : ''
  if (!thumb) return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${loading}>`
  const widths = thumb.widths
  const srcset = widths.map((w) => `${thumbUrl(url, w)} ${w}w`).join(', ')
  const big = widths[widths.length - 1]
  return `<img src="${escapeHtml(thumbUrl(url, big))}" srcset="${escapeHtml(srcset)}" sizes="${escapeHtml(thumb.sizes)}" alt="${escapeHtml(alt)}"${loading}>`
}

const CARD_THUMB = {
  widths: [360, 720],
  sizes: '(min-width: 1200px) 300px, (min-width: 900px) 30vw, (min-width: 600px) 50vw, 100vw'
}
const HERO_THUMB = { widths: [720, 960], sizes: '(min-width: 1152px) 1120px, calc(100vw - 32px)' }

/** Icon-only CMS tags: the name lives in title and aria-label, never as visible text. */
const badges = (platforms) =>
  `<div class="badges">${platforms.map((p) => `<span class="badge" role="img" title="${escapeHtml(platformName(p))}" aria-label="${escapeHtml(platformName(p))}">${platformIcon(p)}</span>`).join('')}</div>`

/** JSON inside `<script>`: `<` escaped so no value can close the element. */
const jsonLd = (value) =>
  `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`

/**
 * A whole document.
 * @param {{title: string, description: string, canonical?: string, image?: string | null,
 *   body: string, head?: string, tail?: string, year: number, index?: boolean}} page
 */
export function document({
  title,
  description,
  canonical,
  image = null,
  body,
  head = '',
  tail = '',
  year,
  index = true,
  appOrigin = '',
  w = WORDS
}) {
  const meta = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    index ? '' : '<meta name="robots" content="noindex">',
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : '',
    `<meta property="og:type" content="website"><meta property="og:site_name" content="Tracy">`,
    `<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">`,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : '',
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}">`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ''
  ].filter(Boolean)
  return `<!doctype html>
<html lang="${w.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${meta.join('\n')}
<link rel="icon" href="${TRACY_ICON_DATA_URI}">
${THEME_BOOT_SCRIPT}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}">
<style>${TEMPLATES_CSS}</style>${head}</head><body>
${header(appOrigin, w)}
${body}
${footer(year, w, appOrigin)}
${CHROME_SCRIPT}${tail}
</body></html>`
}

/**
 * One template's page.
 * @param {{template: any, all: any[], origin: string, appOrigin?: string, search?: string, year: number}} input
 * `origin` is the PUBLIC origin (canonical, JSON-LD); `appOrigin` is where the app's own links go.
 */
export function templatePage({ template, all, origin, appOrigin = origin, search = '', year, lang = 'en' }) {
  const w = wordsFor(lang)
  const id = template.id
  const name = typeof template.label === 'string' && template.label ? template.label : id
  const card = template.card ?? {}
  const platforms = platformsOf(template)
  const cms = platforms.map(platformName)
  const blurb = blurbOf(template, w.lang)
  const canonical = `${origin}${templatePath(id)}`
  const image = heroImage(template)
  const layouts = layoutsOf(template)
  const { list: related, industry: relatedIndustry } = relatedTemplates(template, all)
  // A template with a demo is shown LIVE (`templates-preview-html.js`): the demo itself, with a chip
  // per page, replaces the hero picture and the per-page screenshot walls. The hero shot stays as
  // the frame's poster (and the share image). Only a template with no demo keeps the pictures.
  const live = livePreview(template)
  // When no layout has any picture at all, a wall of placeholders says nothing: only the main one shows.
  const anyLayoutShot = layouts.some((l) => webAddress(l?.shots?.desktop))

  // A template can run on several CMSs, so the detail page has no platform crumb: Templates > name.
  const crumbs = [
    { name: WORDS.templates, shown: w.templates, url: `${origin}/templates/` },
    { name, url: canonical }
  ]
  const crumbHtml = crumbs
    .map((c, i) =>
      i === crumbs.length - 1
        ? `<span aria-current="page">${escapeHtml(c.shown ?? c.name)}</span>`
        : `<a href="${escapeHtml(new URL(c.url).pathname)}">${escapeHtml(c.shown ?? c.name)}</a>`
    )
    .join(' <i aria-hidden="true">&rsaquo;</i> ')

  // One CMS: one button. Several: a short label and one row of equal buttons named after the CMS.
  const useLink = (p, text) =>
    `<a class="btn btn-primary" href="${escapeHtml(appOrigin + buildLink(id, p, search))}">${platformIcon(p)}${escapeHtml(text)}</a>`
  const use =
    platforms.length === 0
      ? ''
      : platforms.length === 1
        ? useLink(platforms[0], w.useTemplate)
        : `<p class="cta-label">${escapeHtml(w.useTemplateLabel)}</p><div class="cta-row">${platforms.map((p) => useLink(p, platformName(p))).join('')}</div>`
  // "View demo site" sits right under it, as wide as it, in the outline style (no demo, no button).
  const demoBtn = demoButton(template, w)
  const cta = use || demoBtn ? `<div class="cta">${use}${demoBtn}</div>` : ''

  // Every fact is a table row, the CMS once ("Supported CMS"). The demo link is the button under the CTA.
  const fact = (label, value) => `<li><b>${escapeHtml(label)}</b><span>${value}</span></li>`
  const text = (label, value) => fact(label, escapeHtml(value))
  const facts = [
    text(w.facts.industry, industryOf(template)),
    card.category ? text(w.facts.style, card.category) : '',
    card.provider ? text(w.facts.provider, card.provider) : '',
    cms.length ? text(w.facts.supportedCms, cms.join(', ')) : ''
  ].join('')

  // The demo's pages reach crawlers through the JSON-LD hasPart below; they are not shown on the page.
  const pages = demoPages(card)

  const layoutName = (l) => (typeof l?.label === 'string' && l.label ? l.label : String(l?.key ?? ''))
  const desktops = layouts
    .map(
      (l) =>
        `<figure><div class="lshot">${shot(l?.shots?.desktop, w.layoutAlt(name, layoutName(l), w.desktop), { thumb: CARD_THUMB, w })}</div><figcaption>${escapeHtml(layoutName(l))}</figcaption></figure>`
    )
    .join('')
  const cards = related.map((t) => relatedCard(t, { w })).join('')
  const heroShot = shot(image, w.heroAlt(name), { lazy: false, thumb: HERO_THUMB, w })

  // Two columns on a wide screen: the information on the left , the live demo on the right.
  // Below 1025px they stack, information first. A template with no demo shows its picture on the right.
  const stage = live
    ? previewBlock({ name, live, poster: heroShot, words: w })
    : `<div class="hero-shot">${heroShot}</div>`
  const body = `<main class="wrap wide">
<section class="split"><div class="info">
<nav class="crumbs" aria-label="${escapeHtml(w.breadcrumb)}">${crumbHtml}</nav>
<div class="dintro"><h1>${escapeHtml(name)}</h1>${blurb ? `<p class="lead">${escapeHtml(blurb)}</p>` : ''}
${cta}</div>
${facts ? `<aside class="dside" aria-label="${escapeHtml(w.facts.label)}"><ul class="facts">${facts}</ul></aside>` : ''}
</div>
<div class="stage-col">${stage}</div></section>
${
  !live && layouts.length && anyLayoutShot
    ? `<section class="sec"><h2>${escapeHtml(w.layoutsHeading)}</h2><p class="sub">${escapeHtml(w.layoutsSub(layouts.length, name))}</p><div class="lays">${desktops}</div></section>`
    : ''
}
<section class="sec"><h2>${escapeHtml(w.moreHeading(relatedIndustry))}</h2>${cards ? `<div class="grid">${cards}</div>` : ''}
<p class="allt"><a class="btn btn-ghost" href="/templates/">${escapeHtml(w.seeAllCount(all.length))}</a></p></section>
</main>`

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url
    }))
  }
  const templateLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name,
    url: canonical,
    // schema.org has no "website template" type: CreativeWork is the honest generic parent.
    ...(blurb ? { description: blurb } : {}),
    ...(thumbUrl(image, 960) ? { image: thumbUrl(image, 960) } : {}),
    genre: industryOf(template),
    keywords: [...cms, industryOf(template)].join(', '),
    ...(card.provider
      ? {
          provider: { '@type': 'Organization', name: card.provider },
          creator: { '@type': 'Organization', name: card.provider }
        }
      : {}),
    ...(pages.length
      ? {
          workExample: { '@type': 'WebSite', name: `${name} demo`, url: pages[0].url },
          hasPart: pages.map((d) => ({ '@type': 'WebPage', name: d.name, url: d.url }))
        }
      : {})
  }
  return document({
    title: w.detailTitle(name, cms),
    description: shortText(blurb || w.detailDescriptionFallback(name, cms)),
    canonical,
    image: thumbUrl(image, 960),
    body,
    // The CMS list lives in the JSON-LD (no visible section repeats the table's "Supported CMS" row): the meta
    // description uses the card blurb, so this node is where search engines read the platforms.
    head: jsonLd(breadcrumbLd) + (cms.length ? jsonLd(templateLd) : ''),
    tail: live ? PREVIEW_SCRIPT : '',
    year,
    appOrigin,
    w
  })
}

/** A card of the "More templates" row and of the gallery. */
export function relatedCard(t, { lazy = true, w = WORDS } = {}) {
  const name = typeof t.label === 'string' && t.label ? t.label : t.id
  const blurb = blurbOf(t, w.lang)
  return `<a class="tcard" href="${escapeHtml(templatePath(t.id))}" data-platforms="${escapeHtml(platformsOf(t).join('|'))}" data-industry="${escapeHtml(industryOf(t))}"><div class="tshot">${shot(heroImage(t), w.cardAlt(name), { lazy, thumb: CARD_THUMB, w })}</div>
<div class="tbody"><h3>${escapeHtml(name)}</h3>${blurb ? `<p>${escapeHtml(blurb)}</p>` : ''}<div class="tmeta">${badges(platformsOf(t))}<span class="tind">${escapeHtml(industryOf(t))}</span></div></div></a>`
}

/** The 404 answer for an id that is not a published template: a way back to all templates. */
export function notFoundPage({ year, appOrigin = '', lang = 'en' }) {
  const w = wordsFor(lang)
  const body = `<main class="wrap"><section class="lost"><h1>${escapeHtml(w.notFoundHeading)}</h1>
<p class="lead">${escapeHtml(w.notFoundText)}</p>
<a class="btn btn-primary" href="/templates/">${escapeHtml(w.seeAll)}</a></section></main>`
  return document({
    title: w.notFoundTitle,
    description: w.notFoundText,
    body,
    year,
    index: false,
    appOrigin,
    w
  })
}
