/**
 * What the seeder reads before it plans: the preview file (`site`, `pages`, `chosen`), the copy
 * file, and the design system's own files from the data directory the image ships next to the
 * script (the vendored library: `systems/<id>/components.html`, `tokens.css`, `DESIGN.md`,
 * `catalog.json`, `slots.json`; the section library's 13 fragments). The engine's landing is built
 * here, as the preview host builds it, so the seeded home is the Landing chip.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { slotsOf } from '../../../../scripts/lib/od-slots-dom.mjs'
import { brandFromSystem } from '../../../design/tracy-design-inspiration/src/host/library-brand.mjs'
import { buildArtifactDocs } from '../../tracy-cms-sections/lib/artifacts.mjs'

/** @param {string} file */
export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * The words of the two model turns, from what the Build tab wrote into `site` (name, about, tone,
 * languages, notes) and what the preview read (headline, sub, nav).
 * @param {Record<string, any> | null | undefined} site
 */
export function wordsOf(site) {
  const s = site ?? {}
  const extracts = []
  if (typeof s.tone === 'string' && s.tone.trim()) extracts.push(`Tone: ${s.tone.trim()}`)
  if (typeof s.contact === 'string' && s.contact.trim()) extracts.push(`Contact: ${s.contact.trim()}`)
  if (Array.isArray(s.notes))
    for (const n of s.notes) if (typeof n === 'string' && n.trim()) extracts.push(n.trim())
  const lang = Array.isArray(s.languages) && typeof s.languages[0] === 'string' ? s.languages[0] : 'en'
  return {
    about: typeof s.about === 'string' ? s.about : null,
    site: {
      name: s.name ?? null,
      headline: s.headline ?? null,
      sub: s.sub ?? null,
      nav: Array.isArray(s.nav) ? s.nav : []
    },
    extracts,
    lang
  }
}

/**
 * The design system's files and slot maps, from the data directory.
 * @param {string} dataDir
 * @param {string} id
 * @returns {{ id: string, name: string, category: string, fixtureHtml: string, fixtureSlots: any[], landingHtml: string, landingSlots: any[] }}
 */
export function loadSystem(dataDir, id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`not a design system id: ${id}`)
  const dir = path.join(dataDir, 'systems', id)
  const fixture = path.join(dir, 'components.html')
  if (!existsSync(fixture)) throw new Error(`design system ${id} is not in the seeder's data (${dir})`)
  const catalog = readJson(path.join(dataDir, 'catalog.json'))
  const rows = Array.isArray(catalog.systems) ? catalog.systems : catalog
  const row = rows.find((r) => r.id === id) ?? { id, name: id, category: '' }
  const fixtureHtml = readFileSync(fixture, 'utf8')
  const slotsFile = path.join(dataDir, 'slots.json')
  const fixtureSlots = existsSync(slotsFile)
    ? (readJson(slotsFile).systems?.[id]?.slots ?? slotsOf(fixtureHtml, []))
    : slotsOf(fixtureHtml, [])
  const tokensCss = readFileSync(path.join(dir, 'tokens.css'), 'utf8')
  const designPath = path.join(dir, 'DESIGN.md')
  const designMd = existsSync(designPath) ? readFileSync(designPath, 'utf8') : ''
  const docs = buildArtifactDocs({ id, name: row.name, category: row.category, tokensCss, designMd })
  const landingHtml = docs.landing
  return {
    id,
    name: row.name,
    category: row.category,
    fixtureHtml,
    fixtureSlots,
    landingHtml,
    landingSlots: slotsOf(landingHtml, [])
  }
}

/**
 * A design system read from ONE folder rather than the library: the customer's brand,
 * `Brand/<host>/` in the site folder, which the brand engine writes in the library's shape
 * (`components.html`, `tokens.css`, `DESIGN.md`, `slots.json`; ADR 0023). Its slot map is flat
 * (`{ slots }`), the library's is keyed by system — both are read.
 * @param {string} dir
 * @param {{ id: string, name: string, category: string }} meta
 * @returns {ReturnType<typeof loadSystem>}
 */
export function loadSystemFrom(dir, meta) {
  const fixture = path.join(dir, 'components.html')
  if (!existsSync(fixture)) throw new Error(`design system ${meta.id} has no components.html in ${dir}`)
  const fixtureHtml = readFileSync(fixture, 'utf8')
  const slotsFile = path.join(dir, 'slots.json')
  let fixtureSlots = null
  if (existsSync(slotsFile)) {
    const parsed = readJson(slotsFile)
    fixtureSlots = Array.isArray(parsed.slots) ? parsed.slots : (parsed.systems?.[meta.id]?.slots ?? null)
  }
  if (fixtureSlots === null) fixtureSlots = slotsOf(fixtureHtml, [])
  const tokensCss = readFileSync(path.join(dir, 'tokens.css'), 'utf8')
  const designPath = path.join(dir, 'DESIGN.md')
  const designMd = existsSync(designPath) ? readFileSync(designPath, 'utf8') : ''
  const docs = buildArtifactDocs({
    id: meta.id,
    name: meta.name,
    category: meta.category,
    tokensCss,
    designMd
  })
  return {
    id: meta.id,
    name: meta.name,
    category: meta.category,
    fixtureHtml,
    fixtureSlots,
    landingHtml: docs.landing,
    landingSlots: slotsOf(docs.landing, [])
  }
}

/** The section library's fragments, by name. @param {string} dataDir */
export function loadSections(dataDir) {
  const dir = path.join(dataDir, 'sections')
  if (!existsSync(dir)) return null
  const out = {}
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.html')) continue
    out[f.replace(/\.html$/, '')] = readFileSync(path.join(dir, f), 'utf8')
  }
  return out
}

/**
 * The inspiration the site chose, from the preview file. A brand (`brand:<host>`) is a system the
 * seeder draws from the site's own `Brand/<host>/` folder (`--system-dir`, ADR 0023) — the theme
 * wears it as a variation made at build time, so the old refusal is gone.
 * @param {Record<string, any>} preview
 */
export function systemIdOf(preview) {
  const raw = preview?.chosen
  const chosen = typeof raw === 'string' ? raw : typeof raw?.id === 'string' ? raw.id : null
  if (!chosen) throw new Error('design-preview.json names no chosen inspiration')
  return chosen
}

export { brandFromSystem }
