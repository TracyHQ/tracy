/**
 * Third-party content that only a script can show, made a neutral stand-in in the design system preview
 * (16/10/2026, PREV-1 and EMPTY-1 of the batch 2 role variables).
 *
 * The preview frame runs no script (`sandbox` without `allow-scripts`, `PREVIEW_CSP`), and a frame inside
 * it inherits that sandbox. So the customer saw, in the preview popup:
 * - a provider frame showing the provider's own error: JA Directory's "Featured Video" module and JA Spa's
 *   "Our spa" page, a black YouTube box reading "An error occurred… enable JavaScript";
 * - a map a script draws into an empty box: JA Directory's Contact page, a 1440 × 655 blank band where
 *   the JA Google Map plugin's `<div id="ja-widget-mapN" style="height:…"></div>` waits for its script;
 * - an Owl carousel, which its own stylesheet hides (`.owl-carousel{display:none}`) until its script
 *   adds `.owl-loaded`: JA Directory's hero slideshow and clients row were not there at all.
 * The real site runs its scripts; none of this is the demo's content being wrong. The preview only:
 * - a frame on another host gets a `srcdoc` stand-in in place of its address (same element, so the
 *   template's sizing rules still apply): the video's poster from `i.ytimg.com` linked to YouTube for a
 *   YouTube frame, a soft box with a glyph (play, map pin) for any other;
 * - an empty map box with its own height gets a soft box with a map pin glyph;
 * - an Owl carousel that never started shows its items in one row, clipped at its edge
 *   ({@link EMBEDS_STYLE}).
 * Language free on purpose: glyphs, no words, whatever language the site speaks. PURE.
 */

const attr = (/** @type {string} */ v) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A play triangle and a map pin, drawn in the text colour of where they sit. */
const PLAY =
  '<svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
const PIN =
  '<svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>'

/**
 * The preview's rules for the stand-ins in the page itself (the map box) and for carousels that never
 * started. Colours come from the text colour of the place (`currentColor`), never a literal, so the box
 * wears whatever system the preview shows.
 */
export const EMBEDS_STYLE =
  '<style id="tracy-preview-embeds">' +
  '.tracy-preview-map{display:flex;align-items:center;justify-content:center;width:100%;height:100%;' +
  'background:color-mix(in srgb,currentColor 8%,transparent)}' +
  '.owl-carousel:not(.owl-loaded){display:flex!important;flex-wrap:nowrap;overflow:hidden}' +
  '.owl-carousel:not(.owl-loaded)>*{flex:0 0 auto;max-width:100%}' +
  '</style>'

/** The value of one attribute in an opening tag, or null. */
const attrOf = (/** @type {string} */ tag, /** @type {string} */ name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '').replace(/&amp;/g, '&') : null
}

/** The opening tag without the attributes named. */
const without = (/** @type {string} */ tag, /** @type {string[]} */ names) =>
  names.reduce((t, n) => t.replace(new RegExp(`\\s${n}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'), ''), tag)

/**
 * The id of a YouTube video an address plays, or null (PURE): `/embed/ID`, `youtu.be/ID`, `watch?v=ID`.
 * @param {URL} u
 */
export function youtubeIdOf(u) {
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  let id = null
  if (/^(m\.)?youtube(-nocookie)?\.com$/.test(host))
    id = /^\/(?:embed|shorts|v)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? u.searchParams.get('v')
  else if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0]
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null
}

/** Is a frame's address a map (Google Maps, OpenStreetMap, Bing Maps)? */
const isMap = (/** @type {URL} */ u) => {
  const h = u.hostname.toLowerCase()
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return h.startsWith('maps.') || /^\/maps\b/.test(u.pathname)
  return /(^|\.)openstreetmap\.org$/.test(h) || (/(^|\.)bing\.com$/.test(h) && /^\/maps\b/.test(u.pathname))
}

/**
 * The document a frame shows in place of a provider's page (PURE): the YouTube poster linked to the video
 * (a new tab: the preview allows popups), or a soft box with a glyph.
 * @param {URL} u the frame's address
 */
export function standInOf(u) {
  const base = 'html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;'
  const id = youtubeIdOf(u)
  if (id) {
    const poster = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    return (
      `<style>${base}background:#000 url(${poster}) center/cover no-repeat}` +
      'a{display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#fff;text-decoration:none}' +
      'a span{display:flex;align-items:center;justify-content:center;width:68px;height:48px;border-radius:12px;background:rgba(0,0,0,.6)}</style>' +
      `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer"><span>${PLAY.replace(/48/g, '32')}</span></a>`
    )
  }
  return `<style>${base}background:#e8e9eb;color:#6b7078}@media (prefers-color-scheme:dark){body{background:#2a2c30;color:#a3a7ae}}</style>${isMap(u) ? PIN : PLAY}`
}

const web = (/** @type {string | null} */ v, /** @type {string} */ base) => {
  if (!v) return null
  try {
    const u = new URL(v, base)
    return /^https?:$/.test(u.protocol) ? u : null
  } catch {
    return null
  }
}
const bare = (/** @type {string} */ h) => h.toLowerCase().replace(/^www\./, '')

/** A frame that is not drawn (a tracking frame: zero size, or hidden by its own style). */
const unseen = (/** @type {string} */ tag) =>
  attrOf(tag, 'width') === '0' ||
  attrOf(tag, 'height') === '0' ||
  /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attrOf(tag, 'style') ?? '')

/** A map box a script draws into: named a map, with its own height, nothing in it. */
const MAP_BOX = /<div\b([^>]*)>(\s*)<\/div>/gi
const MAP_NAME = /(^|[\s_-])(g|google-?)?maps?(?=[\s_-]|\d|$)/i

/**
 * The page with its script-only third-party content made stand-ins (see the file's comment). Frames on
 * the demo's own host (`base`) stay: they are the demo's pages, not a provider's. PURE.
 * @param {string} html
 * @param {{ base: string }} p `base`: the page's public address
 */
export function withScriptlessEmbeds(html, { base }) {
  const home = bare(new URL(base).hostname)
  // A `<noscript>` is the template's own fallback for a visitor without script: it stays as written.
  return outsideNoscript(html, (part) =>
    part
      .replace(/<iframe\b[^>]*>/gi, (tag) => {
        if (attrOf(tag, 'srcdoc') !== null || unseen(tag)) return tag
        const u =
          web(attrOf(tag, 'src'), base) ??
          web(attrOf(tag, 'data-src') ?? attrOf(tag, 'data-lazy-src') ?? attrOf(tag, 'data-url'), base)
        if (!u) return tag
        const host = bare(u.hostname)
        if (host === home || host.endsWith(`.${home}`)) return tag
        const kept = without(tag, ['src', 'data-src', 'data-lazy-src', 'data-url', 'loading'])
        return kept.replace(
          /^<iframe\b/i,
          `<iframe srcdoc="${attr(standInOf(u))}" data-tracy-preview-embed="${attr(host)}"`
        )
      })
      .replace(MAP_BOX, (all, attrs, space) => {
        const tag = `<div${attrs}>`
        const named = MAP_NAME.test(attrOf(tag, 'id') ?? '') || MAP_NAME.test(attrOf(tag, 'class') ?? '')
        const tall = /(^|;)\s*(min-)?height\s*:\s*[1-9]/i.test(attrOf(tag, 'style') ?? '')
        return named && tall ? `${tag}${space}<span class="tracy-preview-map">${PIN}</span></div>` : all
      })
  )
}

/** `html` with `edit` applied to every part outside a `<noscript>` element. */
const outsideNoscript = (/** @type {string} */ html, /** @type {(part: string) => string} */ edit) =>
  html
    .split(/(<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>)/i)
    .map((part, i) => (i % 2 ? part : edit(part)))
    .join('')
