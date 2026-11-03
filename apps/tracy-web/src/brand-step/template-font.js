// The heading font of a brand run: the display face the template itself declares, never a font Tracy bundles. The
// result is ctx.font = { family, bytes, from }.
//
// The face is named by the template's slot contract (`discovered.displayFace`, e.g. "Bebas Neue 400, tracking 0em", or
// the first family of `baseTokens["--font-display"]`). It is looked for, in this order:
//   1. the template's own files (`templateFiles`): an @font-face rule that names the face and points at a font file
//      the template holds, or any font file whose own family name is the face;
//   2. the Google Fonts stylesheet the template stands for. A template such as JA Boxing 1.0.10 ships no font file: it
//      asks Google Fonts for its face when a page loads. The stylesheet URL is the one ds-slot builds from the declared
//      family and weight (`fontsHref`, the link the template's pages carry); its latin face is fetched through the
//      injected `fetchImpl` and cached in `cacheDir`, one file per family and weight;
//   3. nothing: refused with the reason. A name drawn in another face would be a different logo.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
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
const GOOGLE_CSS = 'https://fonts.googleapis.com/css2'
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

/** The weight the contract declares for the display face ("Bebas Neue 400, ..." is 400), 400 when it says none. */
export const displayWeightOf = (contract) =>
  Number(/\s(\d{3})(?:,|$)/.exec(String(contract?.discovered?.displayFace ?? ''))?.[1] ?? 400)

/** The Google Fonts css2 link of one family and weight, the form ds-slot's fontsHref builds. */
export const googleHrefOf = (family, weight) =>
  `${GOOGLE_CSS}?family=${family.replace(/ /g, '+')}:wght@${weight}&display=swap`

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

/** Step 1: the face in the template's own files, or null (with nothing thrown). */
function fromTemplateFiles(wanted, templateFiles) {
  if (!templateFiles || typeof templateFiles.list !== 'function') return null
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
  return null
}

/** The face of the latin subset: the one whose unicode range starts at U+0000, else the first face given. */
const latinOf = (faces) => faces.find((f) => /U\+0000-00FF/i.test(f.unicodeRange ?? '')) ?? faces[0]

/** Step 2: the face from Google Fonts, from the cache folder when it holds it. Throws TemplateFontError. */
async function fromGoogle({ wanted, weight, fetchImpl, googleFontFaces, cacheDir }) {
  const cacheFile = cacheDir ? path.join(cacheDir, `${norm(wanted)}-${weight}.woff2`) : null
  if (cacheFile) {
    const cached = await readFile(cacheFile).catch(() => null)
    if (cached && parse(cached))
      return { family: wanted, bytes: cached, from: `cache:${path.basename(cacheFile)}` }
  }
  if (typeof googleFontFaces !== 'function' || typeof fetchImpl !== 'function')
    throw new TemplateFontError(
      `the face "${wanted}" is not in the template's files and no Google Fonts door is wired`
    )
  const href = googleHrefOf(wanted, weight)
  let faces
  try {
    faces = await googleFontFaces(href, fetchImpl)
  } catch (e) {
    throw new TemplateFontError(
      `Google Fonts did not give the stylesheet for "${wanted}" ${weight}: ${e?.message ?? e}`
    )
  }
  const face = latinOf(faces)
  const src = face?.src?.[0]
  if (!src) throw new TemplateFontError(`Google Fonts lists no face for "${wanted}" ${weight}`)
  let bytes
  try {
    const res = await fetchImpl(src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    bytes = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    throw new TemplateFontError(
      `the font file of "${wanted}" ${weight} could not be downloaded: ${e?.message ?? e}`
    )
  }
  if (bytes.length > MAX_FONT_BYTES || !parse(bytes))
    throw new TemplateFontError(`what Google Fonts served for "${wanted}" ${weight} is not a readable font`)
  if (cacheFile) {
    await mkdir(cacheDir, { recursive: true })
    const tmp = `${cacheFile}.${process.pid}.tmp`
    await writeFile(tmp, bytes)
    await rename(tmp, cacheFile)
  }
  return { family: wanted, bytes, from: href }
}

/**
 * @param {{ contract: object, templateFiles?: { list(): string[], read(p: string): Buffer }, face?: string,
 *   weight?: number, fetchImpl?: typeof fetch, googleFontFaces?: (href: string, fetchImpl: typeof fetch) => Promise<any[]>,
 *   cacheDir?: string }} input contract: the slot contract of the template (tracy-ds-slot library.loadContract);
 *   face and weight override what it declares.
 * @returns {Promise<{ family: string, bytes: Buffer, from: string }>}
 */
export async function templateFont({ contract, templateFiles, face, weight, ...google }) {
  const wanted = face ?? displayFaceOf(contract)
  if (!wanted)
    throw new TemplateFontError(
      'the template contract declares no display face, so the name cannot be set in its heading font'
    )
  const own = fromTemplateFiles(wanted, templateFiles)
  if (own) return own
  return fromGoogle({ wanted, weight: weight ?? displayWeightOf(contract), ...google })
}
