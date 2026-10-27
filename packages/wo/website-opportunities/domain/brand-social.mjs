const MERGE_DISTANCE = 24
const MIN_HUE_GAP = 30
const VI_CHARS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i
const EMOJI = /\p{Extended_Pictographic}/u

const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

function hsl({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === R) h = ((G - B) / d) % 6
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

function mergeSimilar(palette, within = MERGE_DISTANCE) {
  const groups = []
  for (const c of [...palette].sort((a, b) => b.weight - a.weight)) {
    const g = groups.find((x) => Math.hypot(x.r - c.r, x.g - c.g, x.b - c.b) < within)
    if (!g) {
      groups.push({ ...c })
      continue
    }
    const w = g.weight + c.weight
    g.r = (g.r * g.weight + c.r * c.weight) / w
    g.g = (g.g * g.weight + c.g * c.weight) / w
    g.b = (g.b * g.weight + c.b * c.weight) / w
    g.weight = w
  }
  return groups.sort((a, b) => b.weight - a.weight)
}

// A logo's colours (#1780 item 15). The photo threshold (lightness above 0.12) filed a dark logo's own colour as
// "neutral": Harbour Sport Club's forest green #052514 has lightness 0.08. On a logo only near black and near white are
// neutral, and a colour must cover at least 1% of it, so JPEG noise and antialiased edges are no brand colour.
const LOGO_NEAR_BLACK = 0.04
const LOGO_NEAR_WHITE = 0.95
const LOGO_MIN_SHARE = 0.01
const LOGO_MIN_SATURATION = 0.2
// How far apart two logo colours may be and still be one: wider than the photos', a logo's gold shades are one gold.
const LOGO_MERGE_DISTANCE = 30
// Colourfulness: HSL saturation calls a nearly black green "76% saturated"; chroma (max minus min) does not.
const chromaOf = ({ r, g, b }) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255
const validPalette = (palette) =>
  (Array.isArray(palette) ? palette : []).filter(
    (c) => [c?.r, c?.g, c?.b, c?.weight].every(Number.isFinite) && c.weight > 0
  )

/**
 * The colours of a logo's palette (pure): `colors` (the heaviest brand colour as primary, the accent, up to two
 * neutrals) and `accent`, the most colourful colour that is not near black or white, with its share of the logo
 * (0 to 1); null when the logo has none (black and white).
 * @param {{r: number, g: number, b: number, weight: number}[]} palette
 * @returns {{colors: {hex: string, role: string}[], accent: {hex: string, source: 'logo', share: number} | null}}
 */
export function logoColorsOf(palette) {
  const valid = validPalette(palette)
  const total = valid.reduce((sum, c) => sum + c.weight, 0) || 1
  const merged = mergeSimilar(
    valid.map((c) => ({ ...c, weight: c.weight / total })),
    LOGO_MERGE_DISTANCE
  )
    .filter((c) => c.weight >= LOGO_MIN_SHARE)
    .map((c) => ({ ...c, ...hsl(c), chroma: chromaOf(c) }))
  const coloured = merged.filter(
    (c) => c.s >= LOGO_MIN_SATURATION && c.l > LOGO_NEAR_BLACK && c.l < LOGO_NEAR_WHITE
  )
  const neutrals = merged.filter((c) => !coloured.includes(c))
  const top = [...coloured].sort((a, b) => b.chroma - a.chroma || b.weight - a.weight)[0]
  const accent = top ? { hex: hex(top), source: 'logo', share: Number(top.weight.toFixed(3)) } : null
  const colors = []
  const primary = coloured[0]
  if (primary) colors.push({ hex: hex(primary), role: 'primary' })
  if (top && top !== primary) colors.push({ hex: accent.hex, role: 'accent' })
  for (const n of neutrals.slice(0, 2)) colors.push({ hex: hex(n), role: 'neutral' })
  return { colors, accent }
}

function voiceOf(bio) {
  const text = String(bio ?? '').trim()
  if (!text) return undefined
  const lang = VI_CHARS.test(text) ? 'Vietnamese' : /[a-z]/i.test(text) ? 'English' : 'unknown language'
  const cues = [EMOJI.test(text) && 'emoji', text.includes('!') && 'exclamations'].filter(Boolean)
  // No dash in generated prose (#1791): the voice reaches the build as written.
  const tone = cues.length ? `informal tone, ${cues.join(' and ')}` : 'neutral tone'
  return `${lang}; ${tone} (observed from bio)`
}

/**
 * Brand observation for a business with only social profiles. `palette` comes from the host
 * (pixel stats of downloaded images). This is an observation, never an official brand. With `logoPalette` (the chosen
 * logo's own colours, `media-info.js logoPaletteOf`) the colours are the logo's alone, `colorsFrom: 'logo'`, and the
 * brand carries the logo's `accent` (#1780 item 15); photographs of a session say nothing about a brand.
 */
export function brandFromSocial({
  palette = [],
  logoPalette = null,
  bio,
  name,
  avatarUrl,
  avatarAssetId
} = {}) {
  const valid = validPalette(palette)
  const logo = validPalette(logoPalette)
  if (logo.length) {
    const read = logoColorsOf(logo)
    const out = observation({ colors: read.colors, bio, name, avatarUrl, avatarAssetId }, [
      { kind: 'palette', detail: `${logo.length} colour samples from the logo` }
    ])
    out.colorsFrom = 'logo'
    if (read.accent) out.accent = read.accent
    return out
  }
  const merged = mergeSimilar(valid).map((c) => ({ ...c, ...hsl(c) }))
  const chromatic = merged.filter((c) => c.s >= 0.2 && c.l > 0.12 && c.l < 0.92)
  const neutrals = merged.filter((c) => !chromatic.includes(c))

  const colors = []
  const primary = chromatic[0]
  if (primary) {
    colors.push({ hex: hex(primary), role: 'primary' })
    const accent = chromatic.slice(1).find((c) => {
      const gap = Math.abs(c.h - primary.h)
      return Math.min(gap, 360 - gap) >= MIN_HUE_GAP
    })
    if (accent) colors.push({ hex: hex(accent), role: 'accent' })
  }
  for (const n of neutrals.slice(0, 2)) colors.push({ hex: hex(n), role: 'neutral' })

  return observation(
    { colors, bio, name, avatarUrl, avatarAssetId },
    valid.length ? [{ kind: 'palette', detail: `${valid.length} colour samples from collected images` }] : []
  )
}

/** The observation around its colours: the bio's voice, the avatar, the logo asset and the name. */
function observation({ colors, bio, name, avatarUrl, avatarAssetId }, evidence) {
  if (typeof bio === 'string' && bio.trim()) evidence.push({ kind: 'bio', quote: bio.trim() })
  if (avatarUrl) evidence.push({ kind: 'avatar', url: avatarUrl })

  const out = { origin: 'social', official: false, colors, fonts: [], evidence }
  const voice = voiceOf(bio)
  if (voice) out.voice = voice
  if (avatarAssetId) out.logo = avatarAssetId
  if (name) out.name = name
  return out
}

// The same name, as written: case and runs of spaces aside. A handle ("crumb.bakery") is never the same name, even when
// its letters are.
const spelled = (v) =>
  String(v ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
const sameName = (a, b) => spelled(a) === spelled(b)

/**
 * The name a brand observation carries (pure): always the business name decided for the site (`nameCheck`), never the
 * raw handle a social page was read under ("harbour.sportclub"); a display name that is the decided name, spelled its
 * own way, is kept as written.
 * @param {string | null | undefined} observed the observation's name
 * @param {string | null | undefined} decided the decided business name
 */
export function brandNameOf(observed, decided) {
  const want = typeof decided === 'string' && decided.trim() ? decided.trim() : null
  if (!want) return typeof observed === 'string' && observed.trim() ? observed.trim() : null
  return typeof observed === 'string' && sameName(observed, want) ? observed.trim() : want
}

/** The brand with its name decided (`brandNameOf`); null without a brand. */
export function brandNamed(brand, decided) {
  if (!brand || typeof brand !== 'object') return null
  const name = brandNameOf(brand.name, decided)
  return name ? { ...brand, name } : brand
}
