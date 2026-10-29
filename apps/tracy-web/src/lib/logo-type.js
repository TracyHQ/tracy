/**
 * A line of words as glyph OUTLINES (an SVG path), for a logo Tracy makes (`brief-engines/logo-lockup.js`).
 *
 * 🔒 NO FONT OF THE SERVER IS EVER ASKED. librsvg (under `sharp`) draws an SVG `<text>` with whatever fontconfig finds, which
 * differs from machine to machine and is often nothing at all; a name drawn that way changes look between a laptop and the
 * fleet. The words are laid out here with `fontkit` (pure JavaScript, MIT) from a font file shipped beside this module
 * (`logo-fonts/`, SIL Open Font License, licence beside it), and drawn as paths, so every machine draws the same pixels.
 *
 *   typeset(text, px)   the line's path, its advance width and the font's ascent and descent at `px`, or null when the font
 *                       has no glyph for one of its letters (the caller then leaves the name to the template, as text)
 */
import { readFileSync } from 'node:fs'
import * as fontkit from 'fontkit'

/** The face a made logo's name is drawn in: Be Vietnam Pro SemiBold (Latin, Latin Extended, Vietnamese). */
const FONT_FILE = new URL('./logo-fonts/be-vietnam-pro-600.woff2', import.meta.url)

/** @type {any} */
let font = null
const fontOf = () => {
  font ??= fontkit.create(readFileSync(FONT_FILE))
  return font
}

/** Whether every letter of `text` (spaces left out) has a glyph in the logo face. */
export function canTypeset(text) {
  const face = fontOf()
  for (const ch of String(text ?? ''))
    if (!/\s/.test(ch) && !face.hasGlyphForCodePoint(/** @type {number} */ (ch.codePointAt(0)))) return false
  return String(text ?? '').trim() !== ''
}

/**
 * @param {string} text
 * @param {number} px - the font size in pixels
 * @param {{tracking?: number}} [options] - extra space between letters, as a share of the size (0.08 for a spaced small line)
 * @returns {{d: string, width: number, ascent: number, descent: number, capHeight: number} | null} paths start at x 0 with
 *   the baseline at y `ascent`
 */
export function typeset(text, px, { tracking = 0 } = {}) {
  if (!canTypeset(text)) return null
  const face = fontOf()
  const scale = px / face.unitsPerEm
  const run = face.layout(String(text))
  const ascent = face.ascent * scale
  let x = 0
  let d = ''
  for (let i = 0; i < run.glyphs.length; i += 1) {
    const glyph = run.glyphs[i]
    const at = run.positions[i]
    d += glyph.path
      .scale(scale, -scale)
      .translate(x + at.xOffset * scale, ascent - at.yOffset * scale)
      .toSVG()
    x += at.xAdvance * scale + (i < run.glyphs.length - 1 ? tracking * px : 0)
  }
  return {
    d,
    width: x,
    ascent,
    descent: -face.descent * scale,
    capHeight: face.capHeight * scale
  }
}
