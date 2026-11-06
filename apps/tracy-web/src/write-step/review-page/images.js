// Pictures on the review page (#357): turning files into data URIs, and shrinking the big ones in a browser so the page
// stays a size a person can open and pass around.

const MAGIC = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/webp', [0x52, 0x49, 0x46, 0x46]],
  ['image/gif', [0x47, 0x49, 0x46]]
]

/** The media type of an image from its first bytes; null when it is none of the four the page can show. */
export function sniffType(bytes) {
  return MAGIC.find(([, head]) => head.every((b, i) => bytes[i] === b))?.[0] ?? null
}

/** A data URI for image bytes, or null when they are not an image. */
export function dataUri(bytes, type = sniffType(bytes)) {
  return type ? `data:${type};base64,${Buffer.from(bytes).toString('base64')}` : null
}

/** Runs in the page (self-contained): the image at `uri` redrawn no larger than `side` pixels on its longest side. */
async function shrinkInPage({ uri, side }) {
  const img = new Image()
  img.src = uri
  await img.decode()
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return uri.startsWith('data:image/png')
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', 0.8)
}

/**
 * @param {object} chromium Playwright's chromium
 * @param {Map<string, string>} uris key to data URI
 * @param {number} side longest side in pixels
 * @returns {Promise<Map<string, string>>} the same keys; one that cannot be shrunk keeps its original
 */
export async function shrinkAll(chromium, uris, side = 560) {
  const out = new Map(uris)
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    for (const [key, uri] of uris) {
      try {
        const small = await page.evaluate(shrinkInPage, { uri, side })
        if (small.length < uri.length) out.set(key, small)
      } catch {
        // keep the original
      }
    }
  } finally {
    await browser.close()
  }
  return out
}
