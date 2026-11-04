// Finding a picture frame on a live page (#357). The write step names every picture file by the sha256 of its bytes, so
// the frame a file was written to is the element whose image, srcset or background mentions that hash. `locateInPage` runs
// in the page (Playwright `evaluate`, so it must stay self-contained) and returns, for each hash, the boxes of the matching elements in document order.

export function locateInPage(shas) {
  const out = {}
  for (const sha of shas) out[sha] = []
  const dx = window.scrollX
  const dy = window.scrollY
  const attrs = ['src', 'srcset', 'data-src', 'data-srcset', 'data-bg', 'data-background', 'style']
  for (const el of document.querySelectorAll('*')) {
    if (el.tagName === 'SOURCE' || el.tagName === 'SCRIPT') continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    let haystack = style.backgroundImage === 'none' ? '' : style.backgroundImage
    if (el.tagName === 'IMG') haystack += ' ' + (el.currentSrc || '')
    for (const name of attrs) haystack += ' ' + (el.getAttribute(name) || '')
    for (const sha of shas) {
      if (!haystack.includes(sha)) continue
      const r = el.getBoundingClientRect()
      if (r.width >= 8 && r.height >= 8)
        out[sha].push({ x: r.left + dx, y: r.top + dy, width: r.width, height: r.height })
    }
  }
  return out
}
/**
 * Which box each frame gets. Frames that share a file take the matches in order, so two tiles that show the same picture
 * are cropped from two places; the last match is reused when a page shows the file fewer times than frames ask for it.
 * @param {{ id: string, sha: string | null }[]} frames in the order they should take matches
 * @param {Record<string, {x: number, y: number, width: number, height: number}[]>} found from LOCATE_SOURCE
 * @returns {Map<string, object>} frame id to box
 */
export function assignBoxes(frames, found) {
  const taken = new Map()
  const out = new Map()
  for (const f of frames) {
    const boxes = found[f.sha] ?? []
    if (!f.sha || boxes.length === 0) continue
    const n = taken.get(f.sha) ?? 0
    taken.set(f.sha, n + 1)
    out.set(f.id, boxes[Math.min(n, boxes.length - 1)])
  }
  return out
}
