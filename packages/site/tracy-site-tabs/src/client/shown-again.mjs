/**
 * When a tab's pane comes back into view — the person picks the side card's tab again, or brings the
 * browser tab back to the front. A list read while it was out of sight may be behind the site.
 *
 * Two signals, because the side card and the browser hide a tab differently: the side card leaves
 * an unpicked tab mounted but not displayed (its box has no size, so it does not intersect the
 * viewport), the browser keeps the page laid out and says `document.visibilityState`. The first
 * sighting is not "again": the tab read its list when it mounted.
 */

/**
 * Call `onShown` each time `el` is shown again after being out of view.
 * @param {Element} el - the tab's root.
 * @param {() => void} onShown - called once per return into view.
 * @param {{ doc?: Document, Observer?: typeof IntersectionObserver }} [env] - what to watch with.
 * @returns {() => void} stop watching.
 */
export function followShownAgain(el, onShown, env = {}) {
  const doc = env.doc ?? document
  const Observer =
    env.Observer ?? (typeof IntersectionObserver === 'function' ? IntersectionObserver : undefined)
  /** @type {boolean | null} whether the pane is laid out in view; null until the observer first said. */
  let inView = null
  const pageShown = () => doc.visibilityState !== 'hidden'
  const observer =
    Observer === undefined
      ? undefined
      : new Observer((entries) => {
          const now = entries.some((e) => e.isIntersecting)
          if (now && inView === false && pageShown()) onShown()
          inView = now
        })
  observer?.observe(el)
  const onVisibility = () => {
    if (pageShown() && inView !== false) onShown()
  }
  doc.addEventListener('visibilitychange', onVisibility)
  return () => {
    observer?.disconnect()
    doc.removeEventListener('visibilitychange', onVisibility)
  }
}

/**
 * Whether a tab's pane is on screen now: laid out (the side card gives an unpicked tab
 * `display: none`, which leaves it no boxes) and the browser tab in front. Site changes moves its
 * "seen" watermark only while this holds — a list read behind another tab was not looked at.
 * @param {Element | null} el - the tab's root; null before it mounts.
 * @param {{ doc?: Document }} [env]
 * @returns {boolean}
 */
export function paneShown(el, env = {}) {
  if (el === null) return false
  const doc = env.doc ?? el.ownerDocument ?? document
  return doc.visibilityState !== 'hidden' && el.getClientRects().length > 0
}
