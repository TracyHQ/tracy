/** Match Design inspiration's cardPoster/cardThumb without importing another plugin's internals.
 * @param {any} card
 * @returns {string | null}
 */
export function startingDesignImage(card) {
  const template = card?.card
  /** @param {unknown} value */
  const picture = (value) => {
    if (typeof value !== 'string' || !/^https?:\/\/[^/\\?#]/i.test(value)) return null
    try {
      return new URL(value).href
    } catch {
      return null
    }
  }
  const home = Array.isArray(template?.layouts)
    ? template.layouts.find((/** @type {any} */ layout) => layout?.key === 'home')
    : null
  const image = picture(template?.image)
  const poster = template?.demo?.url ? (picture(home?.shots?.desktop) ?? image) : image
  if (!poster) return null
  const shots = /^\/api\/templates\/[^/]+\/shots\/[^/]+$/
  // Only the shots door promises resizing; other desktop posters fall back to the published card picture.
  const chosen = shots.test(new URL(poster).pathname) ? poster : image
  if (!chosen) return null
  const url = new URL(chosen)
  if (shots.test(url.pathname)) {
    url.searchParams.set('w', '720')
    return url.href
  }
  return chosen
}
