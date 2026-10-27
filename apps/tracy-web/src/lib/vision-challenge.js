/** A fresh image-only code proves this request can read pixels before its answer is trusted. */
import { randomInt } from 'node:crypto'
import sharp from 'sharp'

export const IMAGE_CODE_INSTRUCTION =
  'The first image is an input check, not site content. Read its eight-digit code and include it as imageCode in your JSON answer. Never report that image as a finding or label. If you cannot read it, return imageCode: null.'

// Pixel glyphs avoid the container's optional font packages entirely.
const GLYPHS = {
  0: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110']
}

/** Font-free, bounded PNG; the code is encoded only in pixels, with no text metadata. */
export async function renderVisionCode(code) {
  if (!/^[0-9]{8}$/.test(code)) throw new Error('Invalid image code')
  const pixels = [...code]
    .flatMap((letter, i) =>
      GLYPHS[letter].flatMap((row, y) =>
        [...row].flatMap((on, x) =>
          on === '1' ? [`<rect x="${20 + i * 72 + x * 12}" y="${20 + y * 12}" width="12" height="12"/>`] : []
        )
      )
    )
    .join('')
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="604" height="124"><rect width="604" height="124" fill="white"/><g fill="black">${pixels}</g></svg>`
    )
  )
    .png()
    .toBuffer()
}

export async function createVisionChallenge() {
  const expectedCode = String(randomInt(100_000_000)).padStart(8, '0')
  const png = await renderVisionCode(expectedCode)
  return { expectedCode, image: `data:image/png;base64,${png.toString('base64')}` }
}

export function imageCodeMatches(answer, challenge) {
  return typeof answer?.imageCode === 'string' && answer.imageCode.trim() === challenge.expectedCode
}
