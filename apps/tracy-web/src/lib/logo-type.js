/**
 * A line of words as glyph OUTLINES (an SVG path), for a logo Tracy makes (`brief-engines/logo-lockup.js`).
 *
 * 🔒 NO FONT OF THE SERVER IS EVER ASKED. librsvg (under `sharp`) draws an SVG `<text>` with whatever fontconfig finds, which
 * differs from machine to machine and is often nothing at all; a name drawn that way changes look between a laptop and the
 * fleet. The words are laid out here with `fontkit` (pure JavaScript, MIT) from font files shipped beside this module
 * (`logo-fonts/`, SIL Open Font License, licences beside them), and drawn as paths, so every machine draws the same pixels.
 *
 *   FACES               'name': Saira Extra Condensed Bold, the business name (bold, condensed, set in capitals by the
 *                       caller); 'line': Be Vietnam Pro SemiBold, the small spaced descriptor line under it
 *   typeset(text, px)   the line's path, its advance width and the face's ascent, descent and cap height at `px`, or null
 *                       when the face has no glyph for one of its letters (the caller then leaves the name to the template)
 *
 * A face may be several files (Google's subsets: Latin, Latin Extended, Vietnamese): each letter is drawn from the first
 * file that has it, in runs, so kerning holds inside a run.
 */
import { readFileSync } from 'node:fs'
import * as fontkit from 'fontkit'

const fileOf = (/** @type {string} */ name) => new URL(`./logo-fonts/${name}`, import.meta.url)

/** The faces a made logo is drawn in, each its files in the order a letter is looked up. */
export const FACES = Object.freeze({
  name: [
    'saira-extra-condensed-700-latin.woff2',
    'saira-extra-condensed-700-latin-ext.woff2',
    'saira-extra-condensed-700-vietnamese.woff2'
  ],
  line: ['be-vietnam-pro-600.woff2']
})

/** @typedef {keyof typeof FACES} Face */

/** @type {Map<Face, any[]>} */
const loaded = new Map()
const filesOf = (/** @type {Face} */ face) => {
  let files = loaded.get(face)
  if (!files) {
    files = FACES[face].map((name) => fontkit.create(readFileSync(fileOf(name))))
    loaded.set(face, files)
  }
  return files
}

/** The file of `face` that draws `ch`, or null. */
const fileFor = (/** @type {Face} */ face, /** @type {string} */ ch) =>
  filesOf(face).find((f) => f.hasGlyphForCodePoint(/** @type {number} */ (ch.codePointAt(0)))) ?? null

/** Whether every letter of `text` (spaces left out) has a glyph in `face`. */
export function canTypeset(text, /** @type {Face} */ face = 'name') {
  const clean = String(text ?? '').normalize('NFC')
  for (const ch of clean) if (!/\s/.test(ch) && !fileFor(face, ch)) return false
  return clean.trim() !== ''
}

/**
 * @param {string} text
 * @param {number} px - the font size in pixels
 * @param {{tracking?: number, face?: Face}} [options] - extra space between letters, as a share of the size (negative
 *   tightens), and the face (the name's by default)
 * @returns {{d: string, width: number, ascent: number, descent: number, capHeight: number} | null} paths start at x 0 with
 *   the baseline at y `ascent`
 */
export function typeset(text, px, { tracking = 0, face = 'name' } = {}) {
  const clean = String(text ?? '').normalize('NFC')
  if (!canTypeset(clean, face)) return null
  const files = filesOf(face)
  const main = files[0]
  const ascent = (main.ascent * px) / main.unitsPerEm
  // Runs of letters drawn by one file; a space goes with the run before it.
  /** @type {Array<{file: any, text: string}>} */
  const runs = []
  for (const ch of clean) {
    const file = /\s/.test(ch) ? (runs.at(-1)?.file ?? main) : fileFor(face, ch)
    if (runs.at(-1)?.file === file) runs[runs.length - 1].text += ch
    else runs.push({ file, text: ch })
  }
  const glyphCount = runs.reduce((n, r) => n + r.file.layout(r.text).glyphs.length, 0)
  let x = 0
  let d = ''
  let drawn = 0
  for (const { file, text: part } of runs) {
    const scale = px / file.unitsPerEm
    const run = file.layout(part)
    for (let i = 0; i < run.glyphs.length; i += 1) {
      const at = run.positions[i]
      d += run.glyphs[i].path
        .scale(scale, -scale)
        .translate(x + at.xOffset * scale, ascent - at.yOffset * scale)
        .toSVG()
      drawn += 1
      x += at.xAdvance * scale + (drawn < glyphCount ? tracking * px : 0)
    }
  }
  return {
    d,
    width: x,
    ascent,
    descent: (-main.descent * px) / main.unitsPerEm,
    capHeight: (main.capHeight * px) / main.unitsPerEm
  }
}
