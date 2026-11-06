// The layouts of a host capture (`POST /_host/capture`, the host's `capture.js` KEY): one per page path, each with a key
// that is stable, short and unique per path. Shared by the demo look of website opportunities and the write step's
// finisher, which ask the same screenshotter for the same tiles.

/**
 * @param {string[]} pages page paths; anything not starting with "/" and repeats are left out
 * @param {number} [max] the most layouts one look asks for
 * @returns {{ key: string, path: string }[]}
 */
export function captureLayouts(pages, max = Infinity) {
  const seen = new Set()
  const out = []
  for (const path of pages) {
    if (typeof path !== 'string' || !path.startsWith('/') || seen.has(path)) continue
    seen.add(path)
    out.push({ key: `p${out.length}`, path })
    if (out.length >= max) break
  }
  return out
}
