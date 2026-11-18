// Inputs of the brand gate tests: the invented businesses under fixtures/brand-step, the JA Boxing 1.0.10 kit
// committed in the repo, and every image a brand file points to, DRAWN BY CODE (no copied logo, no real brand).
// The pixels are written raw and encoded losslessly, so the favicon numbers recorded in the fixtures are stable.
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { memoryFiles } from '../src/brand-step/gate-context.js'

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'))
const KIT = read(
  '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.10/template-kit.json'
)

export const CASES = ['1-padel', '2-words-only', '3-no-logo', '4-black-grey-symbol', '5-bakery-words']

// Favicon candidates are drawn per kind. Case 1 starts with a dark green mark that cannot be seen on a dark tab,
// so it walks the whole order transparent -> tile -> tile with a recoloured mark; the others pass at once.
const LIGHT_MARK = '#f2e3b3'
const FAVICON_MARKS = {
  '1-padel': { transparent: '#0b3d20', tile: '#0b3d20', 'tile-recoloured': LIGHT_MARK },
  '3-no-logo': { transparent: '#f44141' }
}
const markColour = (id, kind) => FAVICON_MARKS[id]?.[kind] ?? LIGHT_MARK

const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
const encode = (w, h, pixel) => {
  const data = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y)
      data.set([r, g, b, a], (y * w + x) * 4)
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer()
}

/** A transparent picture with a solid block in the middle: stands for a logo, a name or a mark. */
export const blockPng = (colour = '#7a5a2e', w = 120, h = 40) => {
  const c = rgb(colour)
  return encode(w, h, (x, y) =>
    x > w / 5 && x < (w * 4) / 5 && y > h / 5 && y < (h * 4) / 5 ? [...c, 255] : [0, 0, 0, 0]
  )
}

/** An icon with hard edges: a disc in the first colour, a square in the second; every visible pixel is exact. */
export const iconPng = (colours) => {
  const a = rgb(colours[0])
  const b = rgb(colours[1] ?? colours[0])
  const n = 128
  return encode(n, n, (x, y) => {
    if (Math.abs(x - 64) < 20 && Math.abs(y - 64) < 20) return [...b, 255]
    return (x - 64) ** 2 + (y - 64) ** 2 < 56 ** 2 ? [...a, 255] : [0, 0, 0, 0]
  })
}

/** A 32 px tab icon: transparent (a square mark) or a tile (the opening ground with a smaller mark). */
export const faviconPng = (kind, colour, tileGround = '#121111') => {
  const c = rgb(colour)
  if (kind === 'transparent')
    return encode(32, 32, (x, y) => (x >= 4 && x < 28 && y >= 4 && y < 28 ? [...c, 255] : [0, 0, 0, 0]))
  const t = rgb(tileGround)
  // rounded tile: the four corners are transparent, as in a real tab icon
  const corner = (x, y) => {
    const dx = Math.max(0, 5 - x, x - 26)
    const dy = Math.max(0, 5 - y, y - 26)
    return dx * dx + dy * dy > 25
  }
  return encode(32, 32, (x, y) =>
    corner(x, y) ? [0, 0, 0, 0] : x >= 8 && x < 24 && y >= 8 && y < 24 ? [...c, 255] : [...t, 255]
  )
}

/** The phone icon: a solid ground, no transparency. */
export const phonePng = (ground = '#121111', colour = LIGHT_MARK) => {
  const g = rgb(ground)
  const c = rgb(colour)
  return encode(180, 180, (x, y) => (x >= 50 && x < 130 && y >= 50 && y < 130 ? [...c, 255] : [...g, 255]))
}

function referencedFiles(node, out = new Map(), path = []) {
  if (typeof node === 'string') {
    if (/\.(png|jpg|ico|html)$/.test(node) && !node.includes(' '))
      out.set(node, [...(out.get(node) ?? []), path.join('.')])
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) referencedFiles(v, out, [...path, k])
  }
  return out
}

/** Draws every file the brand file points to, with the picture each one needs to pass the gate. */
export async function drawFiles(id, brand) {
  const files = new Map()
  const { favicon: F, logo: L, colours } = brand
  const icon = L.mark.decision === 'icon' ? L.mark.icon : null
  const tile = F.tileGround
  const candidateKind = new Map((F.check?.candidates ?? []).map((c) => [c.png32, c.kind]))
  const finalKind = F.check?.candidates?.at(-1)?.kind
  for (const [file, where] of referencedFiles(brand)) {
    const at = where.join(' ')
    let bytes
    if (file === F.png32)
      bytes = await faviconPng(
        finalKind === 'transparent' ? 'transparent' : 'tile',
        markColour(id, finalKind),
        tile
      )
    else if (candidateKind.has(file))
      bytes = await faviconPng(
        candidateKind.get(file) === 'transparent' ? 'transparent' : 'tile',
        markColour(id, candidateKind.get(file)),
        tile
      )
    else if (file === F.phone180) bytes = await phonePng()
    else if (icon && (file === L.mark.file || icon.attempts.some((t) => t.file === file)))
      bytes = await iconPng(icon.colours)
    else if (file === F.ico || file.endsWith('.jpg')) bytes = Buffer.from('not-an-image')
    else if (file === colours.module?.file) bytes = Buffer.from('<style>/* accent module */</style>')
    else if (file === L.mark.file) bytes = await blockPng('#986837')
    else
      bytes = await blockPng(
        /\.dark/.test(file) ? '#f2e3b3' : /logo|spots|name/.test(at) ? '#33261a' : '#7a5a2e'
      )
    files.set(file, bytes)
  }
  // Bench runs now validate the actual 2x spot file. Generate real fitted copies instead of the
  // old generic 120x40 blocks, and keep the final-file review explicit in these scripted fixtures.
  for (const spot of L.spots) {
    const kit = KIT.site.logoSpots.find((x) => x.id === spot.spot)
    const side = kit.ground.side
    const from =
      spot.shows === 'mark'
        ? L.mark.recoloured?.[side] || L.mark.file
        : spot.shows === 'logo'
          ? L.logos[side]
          : L.logos.twoLines[side]
    const cropped = await sharp(files.get(from)).trim({ threshold: 0 }).png().toBuffer()
    files.set(
      spot.file,
      await sharp(cropped)
        .resize(kit.width * 2, kit.height * 2, {
          fit: 'contain',
          position: 'left',
          background: '#00000000'
        })
        .png()
        .toBuffer()
    )
    if (!L.look.some((look) => look.file === spot.file && look.ground === spot.ground))
      L.look.push({
        file: spot.file,
        ground: spot.ground,
        verdict: 'pass',
        checks: [
          {
            check: 'the fitted mark or name reads on its spot ground',
            verdict: 'pass',
            reason: 'Scripted final-file review of the generated fixture.'
          }
        ]
      })
  }
  return files
}

/** One fixture case, fully built: { brand, brief, kit, files } (the files are an in-memory file folder). */
export async function loadCase(id) {
  const brand = read(`./fixtures/brand-step/${id}/brand-file.json`)
  const brief = read(`./fixtures/brand-step/${id}/brief.json`)
  const entries = await drawFiles(id, brand)
  return { id, brand, brief, kit: structuredClone(KIT), entries, files: memoryFiles(entries) }
}

/** Same case with a few files replaced or removed (null removes), for the rules that read pixels. */
export const withFiles = (c, changes) => {
  const entries = new Map(c.entries)
  for (const [k, v] of Object.entries(changes)) v === null ? entries.delete(k) : entries.set(k, v)
  return memoryFiles(entries)
}

/** A picture with no transparency at all (a logo on a solid box). */
export const opaquePng = (colour = '#336699', w = 120, h = 40) => encode(w, h, () => [...rgb(colour), 255])
