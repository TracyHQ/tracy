// Inputs of the make_icon tests: pictures an image model could return, DRAWN BY CODE on a plain ground, a fake draw
// door and a fake cost tracker. No real model, no network, no money.
import sharp from 'sharp'
import { CostCapReached } from '../src/brand-step/brand-spend.js'

const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))

/** A square picture on `ground`; `paint(x, y)` returns a hex colour for a pixel that is not ground, else null. */
export async function drawing(paint, { ground = '#ffffff', size = 600, format = 'png' } = {}) {
  const data = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) data.set(rgb(paint(x, y) ?? ground), (y * size + x) * 3)
  const image = sharp(data, { raw: { width: size, height: size, channels: 3 } })
  return format === 'jpeg' ? image.jpeg({ quality: 92 }).toBuffer() : image.png().toBuffer()
}

/** A disc of `a` with a square of `b` cut into it (the second colour is missing when b is omitted). */
export const disc =
  (a, b = null) =>
  (x, y) => {
    if (b && Math.abs(x - 300) < 70 && Math.abs(y - 300) < 70) return b
    return (x - 300) ** 2 + (y - 300) ** 2 < 200 ** 2 ? a : null
  }
/** A plain square block of `a`: not compact enough for a circular plate. */
export const block = (a) => (x, y) => (Math.abs(x - 300) < 200 && Math.abs(y - 300) < 200 ? a : null)

/** A draw door that answers the given pictures in order (the last repeats) or throws; it keeps the calls it saw. */
export function fakeDraw(answers, { cost = 0.034, model = 'vendor/picture-model' } = {}) {
  const calls = []
  const draw = async (call) => {
    calls.push(call)
    const a = answers[Math.min(calls.length - 1, answers.length - 1)]
    if (a instanceof Error) throw a
    return { image: a, cost, model, provider: 'fake-provider' }
  }
  return { draw, calls }
}

/** A cost tracker double: the order of check and record is kept; `capAfter` checks refuse once that many were made. */
export function fakeSpend({ capAfter = Number.POSITIVE_INFINITY, events = [] } = {}) {
  let checks = 0
  return {
    events,
    async check() {
      events.push('check')
      if (checks++ >= capAfter) throw new CostCapReached(1.02, 1)
    },
    async record(call) {
      events.push(call)
      return true
    }
  }
}

/** The pixels of a PNG as { colours: Set of visible #rrggbb, alphaAt(x, y) }. */
export async function pixelsOf(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const colours = new Set()
  for (let i = 0; i < info.width * info.height; i++)
    if (data[i * 4 + 3] > 0)
      colours.add(`#${[0, 1, 2].map((k) => data[i * 4 + k].toString(16).padStart(2, '0')).join('')}`)
  return {
    colours,
    width: info.width,
    height: info.height,
    alphaAt: (x, y) => data[(y * info.width + x) * 4 + 3]
  }
}
