// What a brief build writes or clears OUTSIDE the template's content map (spec TracyHQ/tracy#189, ticket #196): the demo's
// videos, the backgrounds the template settings paint, the showcase pages, the page addresses made from the demo's titles,
// the template's credit line, the not-found and offline pages, and the links that lead nowhere. The content map names none
// of these as a slot, so the contract write never reaches them; this module decides them once, and gives the engines the
// pure pieces they write with. Pure and deterministic: no site, no network, no clock.
//
// 🔒 FRAMEWORK RULES, NEVER ONE TEMPLATE'S: a decision reads slot roles, entity kinds and what a page serves (a background
// rule of a stylesheet, a credit line, a video id), never a template's name or a business's trade.
// 🔒 THE OWNER'S OWN DATA FIRST, THEN A NEUTRAL SUBSTITUTE, NEVER THE DEMO: a demo video becomes the brief's own video or a
// still picture; a demo background becomes the owner's picture or none; a credit line goes.
// 🔒 ONE HEAD BLOCK HIDES WHAT NO DOOR CAN WRITE: a template setting the plugin will not write (a T4 profile's
// `body_bg_img`), a play button whose video slot the contract will not empty, a button whose layout keeps a link to a page
// taken off. The block is one marked `<style>` the engine keeps in the template style's own head-code param (T4
// `system_advancedCodeAfterHead`, T3 `snippet_close_head`); the leftover check reads the same block to know what is hidden.

import { neutralText } from './neutral-copy.mjs'

export const OUTSIDE_MAP_VERSION = 'outside-map/1'

/** Every reason code an outside-map decision carries, with the sentence a report shows for it. */
export const OUTSIDE_MAP_REASONS = Object.freeze({
  'brief-video': 'a video of the business the brief holds',
  'no-playable-video':
    'the brief holds no video this player can play, so its still picture stays without a play button',
  'template-credit': 'a credit line of the template or the CMS, which the business never wrote',
  'showcase-page': 'a sample page the template ships to show its features',
  'title-written': 'the page address follows the title written for the business',
  'demo-background': 'a background picture of the demo the template settings paint',
  'error-page-picture': 'a demo picture on the not-found or offline page',
  'page-taken-off': 'a link to a page the build took off'
})

/** Footer lines a template or a CMS ships, which a business never wrote. */
export const CREDIT_LINES = Object.freeze([
  /joomla!?\s+is\s+free\s+software/i,
  /powered\s+by\s+joomla/i,
  /proudly\s+powered\s+by\s+wordpress/i,
  /designed\s+by\s+joomlart/i,
  /(?:joomla!?\s+)?templates?\s+(?:designed\s+)?by\s+joomlart/i,
  /powered\s+by\s+(?:the\s+)?t[34]\s+framework/i
])

export const HEAD_BLOCK_START = '<!-- tracy-leftovers -->'
export const HEAD_BLOCK_END = '<!-- /tracy-leftovers -->'

const YOUTUBE_ID =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^"'\s]*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})(?![\w-])/g
/** An owner's upload a build made: never a demo file. */
const OWNER_UPLOAD = /(^|\/)images\/tracy[-_/]/i
const IMAGE_FILE = /images\/[^"'?#\s)]+\.(?:jpe?g|png|webp|svg|gif|avif)/i
/** An entity address that names the not-found or offline page. */
const ERROR_PAGE = /(^|[^a-z])(404|error|not[- ]found|offline|maintenance)([^a-z]|$)/i

const words = (value) =>
  String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** The `images/...` file a value names, or null. */
export const fileOf = (value) => String(value ?? '').match(IMAGE_FILE)?.[0] ?? null

/**
 * A page address made from a title: lower case latin letters and digits joined by hyphens, accents dropped. Empty when the
 * title holds no latin letter or digit (the caller then leaves the address as it is).
 * @param {string} title
 */
export function slugOf(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

/** Every YouTube video id a text names, in order, once each. */
export function youtubeIdsOf(text) {
  return [...new Set([...String(text ?? '').matchAll(YOUTUBE_ID)].map((m) => m[1]))]
}

/** The demo's video id a slot sample names (a bare id or a link). */
const demoVideoOf = (sample) => {
  const s = String(sample ?? '').trim()
  return youtubeIdsOf(s)[0] ?? (/^[\w-]{11}$/.test(s) ? s : null)
}

/**
 * The video slots: the brief's own YouTube videos, one per slot in order, and a still picture with no play button for the rest.
 * The brief's channel link is no video: only a link that names one video counts.
 * @param {{contentMap?: {slots?: any[]} | null, brief?: object | null}} input
 * @returns {Array<{key: string, demo: string | null, decision: 'video' | 'still', value?: string, reason: string}>}
 */
export function planVideos({ contentMap = null, brief = null }) {
  const own = youtubeIdsOf(JSON.stringify(brief ?? {}))
  let next = 0
  return (contentMap?.slots ?? [])
    .filter((slot) => slot?.role === 'business.video')
    .map((slot) => {
      const demo = demoVideoOf(slot.sample)
      if (next < own.length) {
        const value = own[next]
        next += 1
        // A link slot takes the link, an id slot the id, as the template shipped it.
        const asLink = /^https?:/i.test(String(slot.sample ?? '').trim())
        return {
          key: slot.key,
          demo,
          decision: 'video',
          value: asLink ? `https://www.youtube.com/watch?v=${value}` : value,
          reason: 'brief-video'
        }
      }
      return { key: slot.key, demo, decision: 'still', reason: 'no-playable-video' }
    })
}

/**
 * The demo pictures of the not-found and offline pages: every picture slot of an entity whose own address names such a page.
 * @param {{contentMap?: {slots?: any[], entities?: any[]} | null}} input
 * @returns {Array<{key: string, file: string, reason: string}>}
 */
export function errorPagePictures({ contentMap = null }) {
  const errorEntities = new Set(
    (contentMap?.entities ?? [])
      .filter((e) =>
        ERROR_PAGE.test(String(e?.identity?.alias ?? e?.identity?.path ?? '').replace(/[-_/]+/g, ' '))
      )
      .map((e) => e.key)
  )
  return (contentMap?.slots ?? [])
    .filter((slot) => slot?.type === 'image' && errorEntities.has(slot.entity) && fileOf(slot.sample))
    .map((slot) => ({
      key: slot.key,
      file: /** @type {string} */ (fileOf(slot.sample)),
      reason: 'error-page-picture'
    }))
}

/**
 * The decisions outside the content map a site plan carries (`site-plan.mjs` `outside`).
 * @param {{brief?: object | null, contentMap?: {slots?: any[], entities?: any[]} | null}} input
 */
export function planOutsideMap({ brief = null, contentMap = null }) {
  return {
    version: OUTSIDE_MAP_VERSION,
    videos: planVideos({ brief, contentMap }),
    backgrounds: { decision: 'owner-picture-else-none', reason: 'demo-background' },
    showcase: { decision: 'remove', reason: 'showcase-page' },
    aliases: { decision: 'from-title', reason: 'title-written' },
    credit: { decision: 'remove', reason: 'template-credit' },
    errorPages: errorPagePictures({ contentMap }),
    deadLinks: { decision: 'hide', reason: 'page-taken-off' }
  }
}

/**
 * New addresses for the articles whose address is still the demo's while their title is the business's: the address is made
 * from the written title, unique among the addresses of the same category. An article the content map does not know, or whose
 * title is still the demo's, keeps its address.
 * @param {{contentMap?: {slots?: any[], entities?: any[]} | null,
 *   articles: Array<{id: number|string, alias?: string, title?: string, catid?: number|string}>}} input
 * @returns {Array<{id: number, alias: string, from: string, reason: string}>}
 */
export function planAliases({ contentMap = null, articles = [] }) {
  /** @type {Map<number, {alias: string, title: string | null}>} */
  const demo = new Map()
  for (const entity of contentMap?.entities ?? []) {
    if (entity?.kind !== 'article' || typeof entity.identity?.alias !== 'string') continue
    const title = (contentMap?.slots ?? []).find(
      (s) => s.entity === entity.key && s.column === 'title'
    )?.sample
    demo.set(Number(entity.sourceId ?? String(entity.key).split('-').at(-1)), {
      alias: entity.identity.alias,
      title: typeof title === 'string' ? title : null
    })
  }
  /** @type {Map<string, Set<string>>} category → its addresses */
  const taken = new Map()
  const inCategory = (catid) => {
    const key = String(catid ?? '')
    if (!taken.has(key)) taken.set(key, new Set())
    return /** @type {Set<string>} */ (taken.get(key))
  }
  for (const a of articles) inCategory(a.catid).add(String(a.alias ?? ''))
  const out = []
  for (const a of articles) {
    const was = demo.get(Number(a.id))
    const alias = String(a.alias ?? '')
    if (!was || alias !== was.alias || was.title === null) continue
    if (words(a.title) === words(was.title)) continue
    const base = slugOf(String(a.title ?? ''))
    if (!base || base === alias) continue
    const used = inCategory(a.catid)
    let next = base
    for (let n = 2; used.has(next); n += 1) next = `${base}-${n}`
    used.delete(alias)
    used.add(next)
    out.push({ id: Number(a.id), alias: next, from: alias, reason: 'title-written' })
  }
  return out
}

/** The innermost rule blocks of a stylesheet: `selector { declarations }` (the rules inside `@media` too). */
function rulesOf(css) {
  return [
    ...String(css ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/([^{}@;]+)\{([^{}]*)\}/g)
  ].map((m) => ({
    selector: m[1].trim(),
    body: m[2]
  }))
}

/**
 * The demo's background pictures a served site paints outside the content map: each stylesheet rule and each inline style
 * that paints an `images/` file no slot of the content map holds and no build uploaded. A rule gives its own selector; an
 * inline style (a module's parameter) is reached by the file it names.
 * @param {{styles?: Array<{css: string}>, pages?: Array<{html: string}>, contentMap?: {slots?: any[]} | null}} input
 * @returns {Array<{selector: string, file: string}>}
 */
export function demoBackgrounds({ styles = [], pages = [], contentMap = null }) {
  const slotFiles = new Set(
    (contentMap?.slots ?? []).map((s) => (s?.type === 'image' ? fileOf(s.sample) : null)).filter(Boolean)
  )
  const demoFile = (url) => {
    const file = fileOf(url)
    return file && !OWNER_UPLOAD.test(file) && !slotFiles.has(file) ? file : null
  }
  const seen = new Set()
  const out = []
  const add = (selector, file) => {
    const key = `${selector}|${file}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ selector, file })
  }
  for (const { css } of styles)
    for (const { selector, body } of rulesOf(css))
      for (const [, url] of body.matchAll(
        /background(?:-image)?\s*:[^;]*?url\(\s*["']?([^"')]+)["']?\s*\)/gi
      )) {
        const file = demoFile(url)
        if (file && selector && !selector.startsWith('@')) add(selector, file)
      }
  for (const { html } of pages)
    for (const [, url] of String(html ?? '').matchAll(
      /style\s*=\s*["'][^"']*background(?:-image)?\s*:[^;"']*url\(\s*(?:&quot;|["'])?([^"')&]+)/gi
    )) {
      const file = demoFile(url)
      if (file) add(`[style*="${file}"]`, file)
    }
  return out
}

const cssString = (value) => String(value).replace(/["\\\n\r]/g, '')

/**
 * The marked head block that hides or repaints what no door writes. Empty when there is nothing to do.
 * @param {{backgrounds?: Array<{selector: string, file: string}>, picture?: string | null, videos?: string[],
 *   files?: string[], links?: string[]}} input
 *   - `backgrounds`: demo backgrounds, repainted with `picture` (a site path of the owner's picture) or taken off
 *   - `videos`: demo video ids whose play controls are hidden (the still picture stays)
 *   - `files`: demo pictures hidden where they are shown as an `<img>` (the not-found and offline pages)
 *   - `links`: addresses of pages taken off, whose links are hidden where no door could empty them
 */
export function leftoverHeadBlock({ backgrounds = [], picture = null, videos = [], files = [], links = [] }) {
  const rules = []
  if (backgrounds.length) {
    const paint = picture ? `url("/${cssString(picture).replace(/^\/+/, '')}")` : 'none'
    rules.push(`/* demo backgrounds: ${[...new Set(backgrounds.map((b) => cssString(b.file)))].join(' ')} */`)
    rules.push(
      `${[...new Set(backgrounds.map((b) => b.selector))].join(',\n')}{background-image:${paint} !important}`
    )
  }
  if (videos.length) {
    const sel = [...new Set(videos)].flatMap((id) => {
      const v = cssString(id)
      return [`[data-src*="${v}"]`, `[href*="${v}"]`, `[data-video*="${v}"]`, `iframe[src*="${v}"]`]
    })
    rules.push(`${sel.join(',\n')}{display:none !important}`)
  }
  if (files.length)
    rules.push(
      `${[...new Set(files)].map((f) => `img[src*="${cssString(f)}"]`).join(',\n')}{visibility:hidden !important}`
    )
  if (links.length) {
    const sel = [...new Set(links)].flatMap((l) => {
      const v = cssString(l)
      return /^Itemid=\d+$/.test(v) ? [`a[href$="${v}"]`, `a[href*="${v}&"]`] : [`a[href="${v}"]`]
    })
    rules.push(`${sel.join(',\n')}{display:none !important}`)
  }
  if (!rules.length) return ''
  return `${HEAD_BLOCK_START}<style data-tracy-leftovers>\n${rules.join('\n')}\n</style>${HEAD_BLOCK_END}`
}

/**
 * A head-code value with the Tracy block put in, replacing the one a previous build left; every other byte is kept. An
 * empty block takes the previous one out.
 * @param {string} existing @param {string} block
 */
export function withHeadBlock(existing, block) {
  const value = String(existing ?? '')
  const start = value.indexOf(HEAD_BLOCK_START)
  const end = value.indexOf(HEAD_BLOCK_END)
  const kept =
    start >= 0 && end > start
      ? `${value.slice(0, start)}${value.slice(end + HEAD_BLOCK_END.length)}`.trim()
      : value.trim()
  return [kept, block].filter(Boolean).join('\n')
}

/**
 * What a served page's Tracy block hides: every file, video id and address it names. The leftover check counts nothing in
 * this set as shown.
 * @param {string} html
 * @returns {Set<string>}
 */
export function hiddenByHeadBlock(html) {
  const out = new Set()
  for (const [, css] of String(html ?? '').matchAll(
    /<style\b[^>]*data-tracy-leftovers[^>]*>([\s\S]*?)<\/style>/gi
  )) {
    for (const [, value] of css.matchAll(/\[[\w-]+[*$^]?="([^"]+)"\]/g)) out.add(value)
    for (const [file] of css.matchAll(new RegExp(IMAGE_FILE.source, 'gi'))) out.add(file)
  }
  return out
}

/**
 * A module's HTML with every element that holds a credit line taken out (the innermost `p`, `div`, `span`, `small` or `li`
 * whose words hold one). `removed` counts the elements.
 * @param {string} html
 * @returns {{html: string, removed: number}}
 */
export function withoutCredit(html) {
  let out = String(html ?? '')
  let removed = 0
  for (let round = 0; round < 10; round += 1) {
    let hit = false
    out = out.replace(
      /<(p|div|span|small|li)\b[^>]*>((?:(?!<\1\b)[\s\S])*?)<\/\1\s*>/gi,
      (whole, _tag, inner) => {
        if (hit || !CREDIT_LINES.some((re) => re.test(words(inner)))) return whole
        hit = true
        removed += 1
        return ''
      }
    )
    if (!hit) break
  }
  return { html: out, removed }
}

/** Whether a text holds a credit line. */
export const holdsCredit = (text) => CREDIT_LINES.some((re) => re.test(words(text)))

/**
 * The business's copyright line in the site's language (`neutral.footer.copyright`), with no year so it never goes stale.
 * @param {string} name @param {string} [locale] - the site's language tag (`vi-VN`, `en-GB`)
 */
export const copyrightLine = (name, locale) =>
  neutralText('neutral.footer.copyright', locale, { name }) ?? name
