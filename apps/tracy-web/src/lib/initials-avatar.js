/**
 * The initials avatar: the neutral substitute of a person picture whose person has no portrait in the brief (TracyHQ/tracy
 * #134, ADR 0040). The letters are drawn from vector strokes, not from a font: a host without fonts (the build image) would
 * draw a font's letters as empty boxes, and two hosts with different fonts would draw different pictures. Only A to Z have
 * strokes (`initialsOf` of the domain folds a name to them); with none, a neutral head-and-shoulders figure is drawn.
 * The picture fills the whole frame of the slot, so the template's box and shape stay as designed.
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const JPEG = { quality: 84, mozjpeg: false }
const HEX = /^#?([0-9a-f]{6})$/i
/** The ground when the brand has no colour: the warm grey of the plain placeholder. */
const GROUND = 'd9d4cc'

// Each letter on a 4 x 6 grid (x right, y down): polylines split by "|", points by spaces.
const O = '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0'
const P = '0,6 0,0 3,0 4,1 4,2 3,3 0,3'
const STROKES = {
  A: '0,6 2,0 4,6|0.7,4 3.3,4',
  B: '0,0 0,6 3,6 4,5 4,4 3,3 0,3|0,0 3,0 4,1 4,2 3,3',
  C: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5',
  D: '0,0 0,6 2.5,6 4,4.5 4,1.5 2.5,0 0,0',
  E: '4,0 0,0 0,6 4,6|0,3 3,3',
  F: '4,0 0,0 0,6|0,3 3,3',
  G: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3.5 2.5,3.5',
  H: '0,0 0,6|4,0 4,6|0,3 4,3',
  I: '1,0 3,0|2,0 2,6|1,6 3,6',
  J: '4,0 4,5 3,6 1,6 0,5',
  K: '0,0 0,6|4,0 0,3.5|1.3,2.7 4,6',
  L: '0,0 0,6 4,6',
  M: '0,6 0,0 2,3 4,0 4,6',
  N: '0,6 0,0 4,6 4,0',
  O,
  P,
  Q: `${O}|2.5,4.5 4,6`,
  R: `${P}|2,3 4,6`,
  S: '4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5',
  T: '0,0 4,0|2,0 2,6',
  U: '0,0 0,5 1,6 3,6 4,5 4,0',
  V: '0,0 2,6 4,0',
  W: '0,0 1,6 2,2.5 3,6 4,0',
  X: '0,0 4,6|4,0 0,6',
  Y: '0,0 2,3 4,0|2,3 2,6',
  Z: '0,0 4,0 0,6 4,6'
}
/** @type {Record<string, number[][][]>} */
const GLYPHS = Object.fromEntries(
  Object.entries(STROKES).map(([letter, text]) => [
    letter,
    text.split('|').map((line) => line.split(' ').map((point) => point.split(',').map(Number)))
  ])
)
/** The distance from one letter's left edge to the next one's, in grid units. */
const ADVANCE = 6
const STROKE = 0.7

/** Black or white, whichever reads better on `hex` (relative luminance, WCAG). */
function inkOn(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.4 ? '1f1f1f' : 'ffffff'
}

const round = (n) => Math.round(n * 100) / 100

/** The SVG of the letters, centred in `width x height`, a letter as tall as a third of the shorter side. */
function lettersSvg(letters, width, height, ink) {
  const unit = Math.min(width, height) / 3 / 6
  const across = (letters.length - 1) * ADVANCE + 4
  const x0 = (width - across * unit) / 2
  const y0 = (height - 6 * unit) / 2
  const paths = letters.flatMap((letter, i) =>
    GLYPHS[letter].map(
      (line) =>
        `<polyline points="${line.map(([x, y]) => `${round(x0 + (i * ADVANCE + x) * unit)},${round(y0 + y * unit)}`).join(' ')}"/>`
    )
  )
  return `<g fill="none" stroke="#${ink}" stroke-width="${round(STROKE * unit)}" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</g>`
}

/** A neutral head and shoulders, centred, for a card that names no one. */
function figureSvg(width, height, ink) {
  const s = Math.min(width, height)
  const cx = width / 2
  const cy = height / 2
  const head = round(s * 0.13)
  const shoulders = `M${round(cx - s * 0.24)},${round(cy + s * 0.3)} a${round(s * 0.24)},${round(s * 0.22)} 0 0 1 ${round(s * 0.48)},0 Z`
  return `<g fill="#${ink}" fill-opacity="0.55"><circle cx="${round(cx)}" cy="${round(cy - s * 0.08)}" r="${head}"/><path d="${shoulders}"/></g>`
}

/**
 * Draw an initials avatar: the brand's first colour as the ground, the letters in black or white over it.
 * @param {{width: number, height: number, initials?: string, colours?: string[]}} input - the frame of the slot
 * @returns {Promise<{bytes: Buffer, ext: 'jpg', width: number, height: number, sha256: string}>}
 */
export async function initialsAvatar({ width, height, initials = '', colours = [] }) {
  const ground = colours.map((c) => HEX.exec(String(c))?.[1]).find(Boolean) ?? GROUND
  const ink = inkOn(ground)
  const letters = [...String(initials).toUpperCase()].filter((c) => Object.hasOwn(GLYPHS, c)).slice(0, 2)
  const art = letters.length ? lettersSvg(letters, width, height, ink) : figureSvg(width, height, ink)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#${ground}"/>${art}</svg>`
  const out = await sharp(Buffer.from(svg)).resize(width, height, { fit: 'fill' }).jpeg(JPEG).toBuffer()
  return { bytes: out, ext: 'jpg', width, height, sha256: createHash('sha256').update(out).digest('hex') }
}
