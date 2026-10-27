/**
 * Embedded third-party content that shows an error in the preview (E4 of PR 2, 14/10/2026). JA Directory
 * Joomla under Moxie, Add site preview on dev: the "Featured Video" section showed a black block reading
 * "An error occurred. Try watching this video on www.youtube.com, or enable JavaScript if it is disabled
 * in your browser." where the template shows a video; earlier audits saw Google Maps answer with its
 * own error. The preview frame is `sandbox` without `allow-scripts` (PREVIEW_CSP), and a frame inside it
 * inherits that sandbox: the player, the map, the widget a provider serves never runs its script, so the
 * visitor sees the provider's error or a blank box. Nothing in such an embed can show its content.
 *
 * In the page (read from the composed markup only, no third-party page is fetched or opened): every
 * visible `<iframe>`, `<object>` or `<embed>` of at least `minSide` × `minSide` whose address is on
 * another host than the demo (the page's `<base>`), with the provider it names, the section it sits in
 * (its nearest sectioning ancestor and that section's first heading), and its state: `scriptless` (an
 * address the sandbox opens without script) or `never-loads` (only a `data-src`, which only a script
 * would move into `src`). An embed replaced by a poster image is no iframe at all, so it is never a
 * finding. A finding is one such embed on the worn page; `by` says whether the template's own preview
 * already showed it.
 *
 * In the live frame (probe 10) the page's scripts run, and a frame whose player the probe read showing its
 * content (`data-tracy-embed="content"`, preview-check/embed-frames.mjs) is no finding: JA Spa's /our-spa video
 * plays there. A frame showing its provider's error, or one the probe cannot read, stays a finding.
 */
import { byPath, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'embed-error'

const LIMITS = Object.freeze({
  /** smaller embeds are trackers and pixels, not something a visitor looks at */
  minSide: 40,
  /** at most this many embeds read per page */
  most: 40
})

/** The provider a host belongs to, by name; another host is named by its address. */
export const PROVIDERS = Object.freeze([
  [/(^|\.)(youtube(-nocookie)?\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)vimeo\.com$/, 'Vimeo'],
  [/(^|\.)dailymotion\.com$/, 'Dailymotion'],
  [/(^|\.)(wistia\.(com|net)|wi\.st)$/, 'Wistia'],
  [/(^|\.)loom\.com$/, 'Loom'],
  [/(^|\.)spotify\.com$/, 'Spotify'],
  [/(^|\.)soundcloud\.com$/, 'SoundCloud'],
  [/(^|\.)(facebook\.com|fb\.com)$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(twitter\.com|x\.com)$/, 'X (Twitter)'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)calendly\.com$/, 'Calendly'],
  [/(^|\.)typeform\.com$/, 'Typeform'],
  [/(^|\.)openstreetmap\.org$/, 'OpenStreetMap'],
  [/(^|\.)(bing\.com)$/, 'Bing'],
  [/(^|\.)google\.[a-z.]+$/, 'Google']
])

/**
 * The name of the provider of an embed address (PURE): `YouTube`, `Google Maps`, or its host.
 * @param {string} host @param {string} [path]
 */
export function providerOf(host, path = '') {
  const h = String(host ?? '')
    .toLowerCase()
    .replace(/^www\./, '')
  for (const [re, name] of PROVIDERS) {
    if (!re.test(h)) continue
    if (name === 'Google') {
      if (h.startsWith('maps.') || /^\/maps\b/.test(path)) return 'Google Maps'
      if (h.startsWith('calendar.') || /^\/calendar\b/.test(path)) return 'Google Calendar'
      if (h.startsWith('docs.') && /^\/forms\b/.test(path)) return 'Google Forms'
    }
    if (name === 'Bing' && /^\/maps\b/.test(path)) return 'Bing Maps'
    return name
  }
  return h
}

export const probe = `(() => {${PAGE_HELPERS}
  const bare = (h) => String(h || '').toLowerCase().replace(/^www\\./, '')
  let home = ''
  try { home = bare(new URL(document.baseURI).hostname) } catch {}
  const ours = (h) => h === home || (home && h.endsWith('.' + home))
  const web = (v) => { if (!v) return null; try { const u = new URL(v, document.baseURI); return /^https?:$/.test(u.protocol) ? u : null } catch { return null } }
  // the section an embed sits in: its nearest sectioning ancestor, and the first heading in it
  const sectionOf = (e) => {
    let s = null
    for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) {
      if (/^(SECTION|ARTICLE|ASIDE|FOOTER|HEADER|MAIN)$/.test(x.tagName) || (typeof x.className === 'string' && /(^|[\\s_-])(section|block|module|moduletable)([\\s_-]|$)/i.test(x.className))) { s = x; break }
    }
    let heading = ''
    for (let x = e.parentElement, i = 0; x && x !== document.body && i < 8 && !heading; x = x.parentElement, i++) {
      const h = x.querySelector('h1, h2, h3, h4, .module-title, .section-title')
      if (h) heading = (h.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
    }
    return { section: s ? label(s) : 'body', heading }
  }
  const out = []
  for (const e of document.querySelectorAll('iframe, object, embed')) {
    if (out.length >= ${LIMITS.most}) break
    // every embed, a third-party one included: this detector judges the embed itself
    const r = seenAny(e, getComputedStyle(e))
    if (!r || r.width < ${LIMITS.minSide} || r.height < ${LIMITS.minSide}) continue
    // the live frame (probe 10) read this frame where it runs and it shows its player (preview-check/embed-frames.mjs)
    if (e.getAttribute('data-tracy-embed') === 'content') continue
    const live = web(e.getAttribute('src') || e.getAttribute('data'))
    const lazy = live ? null : web(e.getAttribute('data-src') || e.getAttribute('data-lazy-src') || e.getAttribute('data-url'))
    const u = live || lazy
    if (!u) continue
    const host = bare(u.hostname)
    if (ours(host)) continue
    out.push({ path: pathOf(e), at: label(e), tag: e.tagName.toLowerCase(), host, route: u.pathname.slice(0, 80), state: live ? 'scriptless' : 'never-loads', w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), ...sectionOf(e) })
  }
  return out
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const plainOf = byPath(plain?.data)
  const findings = (worn?.data ?? []).map((/** @type {any} */ b) => {
    const provider = providerOf(b.host, b.route)
    return {
      at: `${b.tag} ${provider} in ${b.section}${b.heading ? ` "${b.heading}"` : ''}`,
      provider,
      section: b.section,
      heading: b.heading,
      size: `${b.w}×${b.h}`,
      top: b.top,
      why:
        b.state === 'never-loads'
          ? `the ${provider} embed only has a data-src a script would load, so it stays blank`
          : `the ${provider} embed runs without script inside the preview, so it shows the provider's error`,
      by: plainOf.has(b.path) ? 'template' : 'system'
    }
  })
  return { count: findings.length, findings }
}
