// How much of a region changed between two shots: the share of pixels whose colour moved by more than a small
// step. Used to tell whether emptying a frame changed anything on screen; when it did not, the picture is
// painted by something else and the measurement would be invalid. Compared in a blank page's canvas.

export const CHANGE_STEP = 48 // sum of the three channel differences, out of 765
export const MIN_CHANGED = 0.02 // below this share of changed pixels, emptying the frame changed nothing

/** PNG of a page region (page coordinates), or null when it is too small or off the page. */
export async function regionPng(page, box, width) {
  const x = Math.max(0, Math.floor(box.left))
  const y = Math.max(0, Math.floor(box.top))
  const w = Math.min(Math.ceil(box.width), width - x)
  const h = Math.min(Math.ceil(box.height), 4000)
  if (w < 2 || h < 2) return null
  return page.screenshot({ type: 'png', fullPage: true, clip: { x, y, width: w, height: h } })
}

/**
 * @param {object} cmp a blank page used as the canvas
 * @returns {Promise<number>} share of changed pixels (0..1)
 */
export async function changedShare(cmp, a, b) {
  if (!a || !b) return 0
  return cmp.evaluate(
    async ({ a, b, step }) => {
      const load = async (d) => {
        const img = new Image()
        img.src = `data:image/png;base64,${d}`
        await img.decode()
        return img
      }
      const [ia, ib] = await Promise.all([load(a), load(b)])
      const s = Math.min(1, 256 / Math.max(ia.width, ia.height))
      const w = Math.max(1, Math.round(ia.width * s))
      const h = Math.max(1, Math.round(ia.height * s))
      const px = (img) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d')
        g.drawImage(img, 0, 0, w, h)
        return g.getImageData(0, 0, w, h).data
      }
      const pa = px(ia)
      const pb = px(ib)
      let changed = 0
      for (let i = 0; i < pa.length; i += 4)
        if (
          Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) >
          step
        )
          changed++
      return changed / (w * h)
    },
    { a: a.toString('base64'), b: b.toString('base64'), step: CHANGE_STEP }
  )
}
