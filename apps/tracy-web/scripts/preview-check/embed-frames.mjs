/**
 * Whether a provider's frame in the live frame shows its content or its error (probe 10, 18/10/2026).
 *
 * embed-error (PREV-1) was written for the static frame: a sandbox without script, where a provider's frame
 * can only show its error ("An error occurred… enable JavaScript"), so every visible third-party frame was a
 * finding. The live frame both popups show since probe 10 runs the page's scripts (`LIVE_SANDBOX` allows them),
 * and a YouTube frame there plays: JA Spa 1.0.7's /our-spa video read as an error only because the probe served
 * the stand at a bare IP, which YouTube refuses for that video (`host-named.mjs`). So in the live frame each
 * provider frame is read where it runs (cdp.mjs `framesEvaluate`, a frame of another site is a target of its
 * own) and an `<iframe>` whose frame shows its player is marked `data-tracy-embed="content"`; embed-error leaves
 * a marked frame out. Only a player the probe can tell apart is marked (YouTube's, by its DOM, language free); a
 * frame showing its error, one not loaded yet, or another provider's stays a finding, as before. The static frame
 * never marks anything, so no v9 row reads differently.
 *
 * Google Maps (20/10/2026, kept at probe 10): JA Restaurant 1.0.6's contact map drew its tiles in the live frame and
 * still failed PREV-1, as only YouTube's player was read. A Maps frame is content only on evidence that cannot be
 * blank: a tile picture inside `.gm-style` that has loaded (complete, natural width above 0), 64px or more a side and
 * on screen. A canvas is no evidence (it may be blank, and a WebGL one cannot be read), and the container alone is a
 * map still loading: both undecided. Google's error box (`.gm-err-container`) is an error, and Maps frames are
 * waited for like YouTube's. The embed's `src` (`/maps?q=…&output=embed`) lands on another path
 * (`/maps/embed?pb=…`), so Maps frames are matched as one group: the page's Maps iframes are marked only when as
 * many Maps frames answered with a drawn map as the page holds Maps iframes (a frame that does not answer leaves
 * every Maps embed a finding).
 */

/** In a provider's frame: 'error' (its error is on screen), 'content' (its player, no error), else null. */
export const FRAME_STATE = `(() => {
  const shown = (e) => { if (!e) return false; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' }
  if (shown(document.querySelector('.ytp-error')) || shown(document.querySelector('.gm-err-container'))) return 'error'
  if (document.querySelector('#movie_player, .html5-video-player')) return 'content'
  const gm = document.querySelector('.gm-style')
  const W = innerWidth, H = innerHeight
  const drawn = (e) => { const r = e.getBoundingClientRect(); return e.complete && e.naturalWidth > 0 && r.width >= 64 && r.height >= 64 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H && shown(e) }
  return gm && [...gm.querySelectorAll('img')].some(drawn) ? 'content' : null
})()`

/** The attribute a frame showing its content carries for the in-page probes. */
export const CONTENT_MARK = 'data-tracy-embed'

/** A Google Maps embed: a Google host (www.google.com, maps.google.co.uk…) and a path under /maps. */
const MAPS_HOST = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/
const MAPS_PATH = /^\/maps(\/|$)/
/** The one key every Google Maps frame shares: its `src` and the address it lands on differ in path. */
const MAPS_KEY = 'google-maps'
const isMaps = (/** @type {string} */ url) => {
  try {
    const u = new URL(url)
    return MAPS_HOST.test(u.hostname) && MAPS_PATH.test(u.pathname)
  } catch {
    return false
  }
}

/** A frame's address as the page's `src` and the frame's target both spell it: origin and path (Maps: one group). */
const frameKeyOf = (/** @type {string} */ url) => {
  try {
    const u = new URL(url)
    return isMaps(url) ? MAPS_KEY : `${u.origin}${u.pathname}`
  } catch {
    return ''
  }
}

/** A frame of YouTube's or of Google Maps (the players read): the wait is for these frames only. */
const PLAYER_HOST = /(^|\.)youtube(-nocookie)?\.com$/
const isPlayer = (/** @type {string} */ url) => {
  try {
    return PLAYER_HOST.test(new URL(url).hostname) || isMaps(url)
  } catch {
    return false
  }
}

/**
 * The state of each frame key: a frame's own, and for the Maps group `error` when one Maps frame shows its error,
 * `content` only when every Maps frame read shows its map and they are as many as the page's Maps iframes
 * (`mapsIframes`; a frame that did not answer, or a page not counted, leaves the group undecided).
 * @param {{ url: string, value: unknown }[]} read
 * @param {{ mapsIframes?: number }} [o]
 * @returns {Map<string, string>}
 */
export function frameStatesOf(read, { mapsIframes = 0 } = {}) {
  const states = new Map(
    read.filter((x) => x.value && !isMaps(x.url)).map((x) => [frameKeyOf(x.url), String(x.value)])
  )
  const maps = read.filter((x) => isMaps(x.url))
  if (maps.some((x) => x.value === 'error')) states.set(MAPS_KEY, 'error')
  else if (mapsIframes > 0 && maps.length === mapsIframes && maps.every((x) => x.value === 'content'))
    states.set(MAPS_KEY, 'content')
  return states
}

/**
 * Marks every `<iframe>` of the open page whose frame shows its content, waiting (at most `waitMs`) while a
 * frame is still loading. Returns how many frames were marked and how many show their error.
 * @param {any} chrome a cdp.mjs browser
 * @param {{ waitMs?: number, stepMs?: number }} [o]
 * @returns {Promise<{ content: number, error: number }>}
 */
export async function markShowingEmbeds(chrome, { waitMs = 10000, stepMs = 500 } = {}) {
  // the page's Maps iframes, counted where the page spells them: every one must answer with a drawn map
  const mapsIframes = Number(
    await chrome
      .evaluate(
        `(() => { let n = 0; for (const f of document.querySelectorAll('iframe[src]')) { try { const u = new URL(f.getAttribute('src'), document.baseURI); if (${MAPS_HOST}.test(u.hostname) && ${MAPS_PATH}.test(u.pathname)) n++ } catch {} } return n })()`
      )
      .catch(() => 0)
  )
  /** @type {Map<string, string>} */
  let states = new Map()
  for (let t = 0; ; t += stepMs) {
    const read = await chrome.framesEvaluate(FRAME_STATE).catch(() => [])
    states = frameStatesOf(read, { mapsIframes })
    // every player frame answered one way or the other, every Maps iframe has a frame that answered, or time is up
    const undecided =
      read.some((x) => !x.value && isPlayer(x.url)) || read.filter((x) => isMaps(x.url)).length < mapsIframes
    if (!undecided || t >= waitMs) break
    await new Promise((r) => setTimeout(r, stepMs))
  }
  const content = [...states].filter(([, v]) => v === 'content').map(([k]) => k)
  const error = [...states.values()].filter((v) => v === 'error').length
  if (content.length)
    await chrome.evaluate(`(() => { const keys = new Set(${JSON.stringify(content)}); let n = 0
      const maps = (u) => ${MAPS_HOST}.test(u.hostname) && ${MAPS_PATH}.test(u.pathname)
      for (const f of document.querySelectorAll('iframe[src]')) { try { const u = new URL(f.getAttribute('src'), document.baseURI); if (keys.has(maps(u) ? ${JSON.stringify(MAPS_KEY)} : u.origin + u.pathname)) { f.setAttribute(${JSON.stringify(CONTENT_MARK)}, 'content'); n++ } } catch {} }
      return n })()`)
  return { content: content.length, error }
}
