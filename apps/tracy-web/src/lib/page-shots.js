// Page screenshots from the host's own screenshotter (`POST /_host/capture`, mode `vision-tiles/1`), the stream the demo
// look of website opportunities reads (opportunities-build/demo-look.js): every page at desktop (1440 px) and phone
// (390 px) width, top to bottom in viewport tiles, each a JPEG. Here the tiles are kept as they come, for a caller that
// shows them to a model and keeps some as files (the write step's finisher). A frame that breaks the stream's shape stops
// the shot of that page and width, which is then named in `unshot`, never counted as seen. A host that measures them
// starts each view with the boxes of the page's text elements (`view-start.boxes`, in page pixels); they come back in
// `boxes`, and a host that sends none gives none.
import { createHash } from 'node:crypto'
import { captureLayouts } from './capture-layouts.js'

export const SHOT_MODE = 'vision-tiles/1'
const VIEWPORTS = { 1440: 'desktop', 390: 'phone' }
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const MAX_TILE_BYTES = 640 * 1024

/**
 * @param {{ capture: (layouts: {key: string, path: string}[], opts: {onFrame: Function, signal?: AbortSignal}) =>
 *   Promise<{ok: boolean, body?: any}>, pages: string[], signal?: AbortSignal }} input
 *   `capture` asks the site's host to stream the pages (the host and the site are the caller's)
 * @returns {Promise<{ shots: { page: string, viewport: 'desktop' | 'phone', index: number, y: number, height: number,
 *   documentHeight: number, image: string }[], boxes: { page: string, viewport: string, x: number, y: number,
 *   width: number, height: number, text: string }[], unshot: { page: string, viewport: string, why: string }[] }>}
 *   `image` is a `data:image/jpeg;base64,` URL
 */
export async function shootPages({ capture, pages, signal }) {
  const layouts = captureLayouts(pages)
  const views = new Map()
  for (const l of layouts)
    for (const viewport of ['desktop', 'phone'])
      views.set(`${l.path}\n${viewport}`, {
        page: l.path,
        viewport,
        tiles: [],
        boxes: [],
        complete: false,
        why: null
      })
  const onFrame = async (frame) => {
    if (frame?.type === 'end') return
    const view = views.get(`${frame?.page}\n${VIEWPORTS[frame?.width] ?? frame?.viewport}`)
    if (!view || view.why) return
    if (frame.type === 'view-start') {
      view.boxes = boxesOf(frame.boxes, view)
      return
    }
    if (frame.type === 'view-end') {
      view.complete = frame.complete === true && view.tiles.length > 0
      if (!view.complete) view.why = frame.reason ?? 'the capture ended before the page was shot whole'
      return
    }
    if (frame.type !== 'tile') return
    const bytes =
      typeof frame.jpeg === 'string' && BASE64.test(frame.jpeg) ? Buffer.from(frame.jpeg, 'base64') : null
    const sound =
      bytes &&
      bytes.length <= MAX_TILE_BYTES &&
      frame.index === view.tiles.length &&
      (!frame.sha256 || createHash('sha256').update(bytes).digest('hex') === frame.sha256)
    if (!sound) {
      view.why = 'a tile of the capture stream was malformed'
      return
    }
    view.tiles.push({
      page: view.page,
      viewport: view.viewport,
      index: frame.index,
      y: frame.y,
      height: frame.height,
      documentHeight: frame.documentHeight,
      image: `data:image/jpeg;base64,${frame.jpeg}`
    })
  }
  let failed = null
  try {
    const answer = await capture(layouts, { onFrame, signal })
    if (!answer?.ok) failed = answer?.body?.code ?? 'SHOTS_UNAVAILABLE'
  } catch (error) {
    failed = typeof error?.code === 'string' ? error.code : String(error?.message ?? error).slice(0, 160)
  }
  const shots = []
  const boxes = []
  const unshot = []
  for (const view of views.values()) {
    if (view.complete && !view.why) {
      shots.push(...view.tiles)
      boxes.push(...view.boxes)
    } else unshot.push({ page: view.page, viewport: view.viewport, why: view.why ?? failed ?? 'not shot' })
  }
  return { shots, boxes, unshot }
}

const MAX_BOXES = 2000
const whole = (n) => Number.isFinite(n) && n >= 0

/** The text element boxes of a view as the host sent them, each kept only when whole and with words. */
function boxesOf(sent, { page, viewport }) {
  if (!Array.isArray(sent)) return []
  return sent
    .slice(0, MAX_BOXES)
    .filter(
      (b) =>
        [b?.x, b?.y].every(whole) &&
        b.width > 0 &&
        b.height > 0 &&
        typeof b.text === 'string' &&
        b.text.trim()
    )
    .map((b) => ({ page, viewport, x: b.x, y: b.y, width: b.width, height: b.height, text: b.text }))
}
