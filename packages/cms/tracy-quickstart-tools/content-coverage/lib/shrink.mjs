// Downscale + recompress JPEG screenshots inside Chromium (no native image library needed).
export async function createShrinker(chromium) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent('<canvas id="c"></canvas>')
  return {
    /** @returns {Promise<Buffer>} JPEG at `width` px wide (height scaled), quality 0..1. */
    async shrink(buf, width, quality) {
      const b64 = await page.evaluate(
        async ({ src, width, quality }) => {
          const img = new Image()
          img.src = src
          await img.decode()
          const scale = Math.min(1, width / img.naturalWidth)
          const c = document.getElementById('c')
          c.width = Math.round(img.naturalWidth * scale)
          c.height = Math.round(img.naturalHeight * scale)
          const g = c.getContext('2d')
          g.imageSmoothingQuality = 'high'
          g.drawImage(img, 0, 0, c.width, c.height)
          return c.toDataURL('image/jpeg', quality).split(',')[1]
        },
        { src: 'data:image/jpeg;base64,' + buf.toString('base64'), width, quality }
      )
      return Buffer.from(b64, 'base64')
    },
    close: () => browser.close()
  }
}
