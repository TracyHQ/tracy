// The heading font of a brand run: the display face the template contract declares, read from the template's OWN
// files (never a bundled font). The result is ctx.font = { family, bytes }.
//
// The face is named by the slot contract (`discovered.displayFace`, e.g. "Bebas Neue 400, tracking 0em", or the first
// family of `baseTokens["--font-display"]`). The bytes are looked for in the template's files (`templateFiles`):
//   1. a stylesheet @font-face rule that names the face and points at a file the template holds;
//   2. any font file (ttf, otf, woff, woff2) whose own family name is the face.
// A template that does not ship the face (it asks Google Fonts for it when a page loads: JA Boxing 1.0.10 does) is
// refused with the reason, and the run does not start: a name drawn in another face would be a different logo.
import path from 'node:path'
import { create as createFont } from 'fontkit'

export class TemplateFontError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TemplateFontError'
  }
}

const FONT_FILE = /\.(woff2?|ttf|otf)$/i
const MAX_FONT_BYTES = 4 * 1024 * 1024
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** The display face family a slot contract declares, or null. */
export function displayFaceOf(contract) {
  const found = String(contract?.discovered?.displayFace ?? '')
  const fromFound = /^(.*?)(?:\s+\d{3})?(?:,|$)/.exec(found)?.[1]?.trim()
  if (fromFound) return fromFound
  const token = String(contract?.baseTokens?.['--font-display'] ?? '')
  return /^\s*["']?([^"',]+)["']?/.exec(token)?.[1]?.trim() || null
}

const familiesOf = (font) => [font.familyName, font.fullName, font.postscriptName].map(norm).filter(Boolean)

function parse(bytes) {
  try {
    const f = createFont(Buffer.from(bytes))
    return f.fonts ? f.fonts[0] : f
  } catch {
    return null
  }
}

/** Paths the template's stylesheets bind to the face with an @font-face rule. */
function declaredFiles(face, templateFiles, paths) {
  const out = []
  for (const css of paths.filter((p) => /\.css$/i.test(p))) {
    let text
    try {
      text = templateFiles.read(css).toString('utf8')
    } catch {
      continue
    }
    for (const rule of text.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      const family = /font-family\s*:\s*["']?([^;"'}]+)/i.exec(rule[1])?.[1]
      if (norm(family) !== norm(face)) continue
      for (const u of rule[1].matchAll(/url\(\s*["']?([^"')?#]+)/gi)) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(css), u[1]))
        if (FONT_FILE.test(target) && paths.includes(target)) out.push(target)
      }
    }
  }
  return out
}

/**
 * @param {{ contract: object, templateFiles: { list(): string[], read(p: string): Buffer }, face?: string }} input
 *   contract: the slot contract of the template (tracy-ds-slot library.loadContract); face overrides what it declares.
 * @returns {{ family: string, bytes: Buffer, from: string }}
 */
export function resolveTemplateFont({ contract, templateFiles, face }) {
  const wanted = face ?? displayFaceOf(contract)
  if (!wanted)
    throw new TemplateFontError(
      'the template contract declares no display face, so the name cannot be set in its heading font'
    )
  if (!templateFiles || typeof templateFiles.list !== 'function')
    throw new TemplateFontError(
      `the template files are not available, so the display face "${wanted}" cannot be read`
    )
  const paths = templateFiles.list().map((p) => path.posix.normalize(String(p).replace(/\\/g, '/')))
  const fonts = paths.filter((p) => FONT_FILE.test(p))
  const ordered = [
    ...new Set([
      ...declaredFiles(wanted, templateFiles, paths),
      ...fonts.filter((p) => norm(p).includes(norm(wanted))),
      ...fonts
    ])
  ]
  for (const p of ordered) {
    const bytes = templateFiles.read(p)
    if (bytes.length > MAX_FONT_BYTES) continue
    const font = parse(bytes)
    if (font && familiesOf(font).some((f) => f === norm(wanted) || f.startsWith(norm(wanted))))
      return { family: wanted, bytes, from: p }
  }
  throw new TemplateFontError(
    `the template declares the display face "${wanted}" but none of its ${fonts.length} font files is that face (it is probably loaded from Google Fonts when a page opens), so the name cannot be set in the template's own heading font`
  )
}
