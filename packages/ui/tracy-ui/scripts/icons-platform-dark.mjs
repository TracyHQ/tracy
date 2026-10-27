/**
 * Derive `icons/platforms/dark/<id>.svg` from every `icons/platforms/light/<id>.svg`.
 *
 * Platform marks come from Simple Icons as one brand colour on a transparent ground. On a dark
 * surface a dark brand colour (GitHub black, Medium black, Notion black …) disappears, while a
 * saturated one (WordPress blue, Joomla blue) still reads. So the dark side is derived, not drawn:
 *
 *   - a fill that is near-black, or dark AND grey (low saturation), becomes white — a saturated
 *     dark brand colour (WordPress blue, YouTube red) is NOT flipped, it reads on both grounds;
 *   - a white fill inside such a mark (a cut-out) becomes the mark's dark colour,
 *     so figure and ground swap instead of both turning white;
 *   - every other colour is kept — the brand keeps its brand.
 *
 * Run after adding a platform SVG, before `icons:generate --type=platforms`:
 *
 *   node scripts/icons-platform-dark.mjs          # writes dark/, prints what changed
 *   node scripts/icons-platform-dark.mjs --check  # exits 1 when dark/ is stale
 *
 * A dark SVG that must differ from this rule (a hand-drawn one) is kept: add its id to KEEP.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const LIGHT = path.join(here, '../icons/platforms/light')
const DARK = path.join(here, '../icons/platforms/dark')
const NEAR_BLACK = 0.06
const DARK_LUMINANCE = 0.25
const GREY_SATURATION = 0.3
const WHITE = '#FFFFFF'
const SWAP_TO = '#111111'
/** Ids whose dark SVG is authored by hand and must not be regenerated. */
const KEEP = new Set([])

const check = process.argv.includes('--check')

/** WCAG relative luminance of a #rgb / #rrggbb colour; null when the value is not a hex colour. */
function luminance(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const chan = (i) => {
    const v = Number.parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4)
}

/** HSL saturation of a hex colour, 0..1; null when not a hex colour. */
function saturation(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const l = (max + min) / 2
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
}

/** True for a fill that vanishes on a dark ground: near-black, or dark and grey. */
function vanishes(hex) {
  const l = luminance(hex)
  if (l === null) return false
  if (l < NEAR_BLACK) return true
  const s = saturation(hex)
  return l < DARK_LUMINANCE && s !== null && s < GREY_SATURATION
}

function derive(svg) {
  const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1])
  const darkFills = fills.filter(vanishes)
  if (darkFills.length === 0) return { svg, changed: false }
  const hasWhite = fills.some((f) => luminance(f) !== null && luminance(f) > 0.95)
  const out = svg.replace(/fill="([^"]+)"/g, (whole, value) => {
    const l = luminance(value)
    if (l === null) return whole
    if (vanishes(value)) return `fill="${WHITE}"`
    if (l > 0.95 && hasWhite) return `fill="${SWAP_TO}"`
    return whole
  })
  return { svg: out, changed: true }
}

mkdirSync(DARK, { recursive: true })
const ids = readdirSync(LIGHT)
  .filter((f) => f.endsWith('.svg'))
  .sort()
let stale = 0
const flipped = []
for (const file of ids) {
  const id = file.replace(/\.svg$/, '')
  if (KEEP.has(id)) continue
  const light = readFileSync(path.join(LIGHT, file), 'utf8')
  const { svg, changed } = derive(light)
  if (changed) flipped.push(id)
  const target = path.join(DARK, file)
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null
  if (current === svg) continue
  stale += 1
  if (!check) writeFileSync(target, svg)
}
const summary = `platform dark: ${ids.length} marks, ${flipped.length} flipped to white (${flipped.join(', ')})`
if (check) {
  if (stale > 0) {
    console.error(`${summary} — ${stale} dark file(s) stale, run node scripts/icons-platform-dark.mjs`)
    process.exit(1)
  }
  console.log(`${summary} — dark/ is current`)
} else {
  console.log(`${summary} — ${stale} file(s) written`)
}
