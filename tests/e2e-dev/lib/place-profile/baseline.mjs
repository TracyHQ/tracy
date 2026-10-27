// A template's own layout, read from the committed contract beside its quickstart: the slot-roles sidecar
// (`slot-roles.json`, ADR 0037) for the groups — sections and their cards — and the content map for the pages a
// Joomla module shows on and the samples the template ships. This is the baseline a demo is counted against: every
// section, with as many cards (plan §7: count sections and cards against the template).

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slotRolesOf } from '../../../../apps/tracy-web/src/lib/slot-roles.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const CMS_DIR = join(REPO, 'packages', 'cms')

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null)
const sha256File = (file) =>
  existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null

/**
 * The committed contract folder of a release, e.g. (`tracy-base`, `j6`, `1.0.5`) →
 * `packages/cms/tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.5`. EmDash themes keep theirs under
 * `packages/cms/tracy-emdash-theme-<name>/contracts/<version>`.
 * @param {{ slug: string, line?: string | null, version: string }} release
 * @returns {string | null}
 */
export function findContractDir({ slug, line = null, version }) {
  for (const pkg of readdirSync(CMS_DIR)) {
    const contracts = join(CMS_DIR, pkg, 'contracts')
    if (!existsSync(contracts)) continue
    const nested = line ? join(contracts, slug, line, version) : null
    if (nested && existsSync(nested) && statSync(nested).isDirectory()) return nested
    if (pkg === `tracy-emdash-theme-${slug.replace(/^tracy-/, '')}` && existsSync(join(contracts, version)))
      return join(contracts, version)
  }
  return null
}

/** Group ids are `<entity>.<section>.<n>` (Joomla `module-183.tier.0`) or `<page>.<section>[.<kind>].<n>`. */
function splitGroup(id) {
  const parts = String(id).split('.')
  return { head: parts[0], section: parts[1] ?? '', rest: parts.slice(2) }
}

/**
 * The baseline of one contract: per page, its sections and the cards each holds.
 * @param {string} dir - a contract folder (`findContractDir`)
 * @returns {{ dir: string, cms: string | null, contract: string | null, state: string, baseHash: string | null,
 *   sidecarSha256: string | null, pages: Record<string, { sections: { id: string, cards: number }[] }>,
 *   factSamples: { slotKey: string, role: string, sample: string }[] }}
 */
export function templateBaseline(dir) {
  const roles = slotRolesOf(dir)
  const doc = roles.doc ?? null
  const contentMap = readJson(join(dir, 'content-map.json'))
  const out = {
    dir,
    cms: doc?.cms ?? null,
    contract: doc?.contract ?? null,
    state: roles.state,
    baseHash: doc?.baseHash ?? null,
    sidecarSha256: sha256File(join(dir, 'slot-roles.json')),
    pages: /** @type {Record<string, { sections: { id: string, cards: number }[] }>} */ ({}),
    factSamples: /** @type {{ slotKey: string, role: string, sample: string }[]} */ ([])
  }
  if (!doc) return out

  /** @type {Map<string, Map<string, number>>} page → section → cards */
  const pages = new Map()
  const add = (page, section, card) => {
    if (!pages.has(page)) pages.set(page, new Map())
    const sections = pages.get(page)
    sections.set(section, (sections.get(section) ?? 0) + (card ? 1 : 0))
  }

  if (doc.cms === 'joomla') {
    // A module is one section; its groups other than `section` are its cards. Pages come from the content map.
    const cards = new Map()
    for (const g of doc.groups ?? []) {
      const { head, section } = splitGroup(g.id)
      cards.set(head, (cards.get(head) ?? 0) + (section === 'section' ? 0 : 1))
    }
    for (const p of contentMap?.pages ?? []) {
      const page = p.route || p.entity
      for (const m of p.assignedModules ?? []) {
        if (m.published !== '1' || !cards.has(m.entity)) continue
        add(page, m.entity, false)
        pages.get(page).set(m.entity, cards.get(m.entity))
      }
    }
  } else {
    for (const g of doc.groups ?? []) {
      const { head, section, rest } = splitGroup(g.id)
      add(head, section, rest.length > 0)
    }
  }
  for (const [page, sections] of pages)
    out.pages[page] = { sections: [...sections].map(([id, cards]) => ({ id, cards })) }

  const samples = new Map((contentMap?.slots ?? []).map((s) => [String(s.key), s.sample]))
  for (const b of doc.bindings ?? []) {
    const sample = samples.get(String(b.slotKey))
    if (typeof sample === 'string' && sample.trim())
      out.factSamples.push({ slotKey: b.slotKey, role: b.role, sample })
  }
  return out
}
