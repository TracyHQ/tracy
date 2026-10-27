/**
 * Reader and freshness verifier for a quickstart contract's `slot-roles.json` sidecar (`tracy-quickstart-slot-roles/v1`).
 *
 * Recomputes `baseHash` with the shared `baseHashOf` formula from `website-opportunities/domain` (re-exported by
 * `scripts/lib/showcase-nav/common.mjs`):
 * - Joomla / WordPress contracts hash `manifest.json`, `content-map.json`, `presentation-lock.json`.
 * - EmDash contracts (`packages/cms/tracy-emdash-theme-<slug>/contracts/<version>/`) hash `seed/seed.json`,
 *   `seed/personalize.json`, `seed/field-map.json`.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  BASE_FILES,
  EMDASH_BASE_FILES,
  baseHashOf,
  isFactRole,
  sha256,
  validateSlotRoles
} from 'website-opportunities/domain'

export const SLOT_ROLES_FILE = 'slot-roles.json'
export { BASE_FILES, EMDASH_BASE_FILES, baseHashOf, sha256 }

function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function resolveEmdashSeedDir(contractDir) {
  const candidates = [
    path.join(contractDir, 'seed'),
    path.resolve(contractDir, '../../seed'),
    path.resolve(contractDir, '../seed'),
    path.resolve(
      contractDir,
      '../../../../emdash-tool',
      path.basename(path.resolve(contractDir, '../..')),
      'seed'
    )
  ]
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'seed.json'))) return candidate
  }
  return null
}

function emdashSubFieldsByCollection(fieldMap) {
  const map = new Map()
  for (const col of fieldMap?.collections ?? []) {
    const fieldSubMap = new Map()
    for (const field of col?.fields ?? []) {
      if (field?.type !== 'repeater' || !Array.isArray(field.subFields)) continue
      const subs = field.subFields
        .map((raw) => {
          const [name, type] = String(raw).split(':')
          return { name: name?.trim() ?? '', type: type?.trim() ?? 'string' }
        })
        .filter((s) => s.name && s.type !== 'boolean')
      fieldSubMap.set(field.slug, subs)
    }
    map.set(col.collection, fieldSubMap)
  }
  return map
}

function defaultLocaleEntries(entries, defaultLocale) {
  if (!Array.isArray(entries)) return []
  const matching = entries.filter((e) => !e?.locale || e.locale === defaultLocale)
  return matching.length > 0 ? matching : entries
}

function expandEmdashInventory(seedDir) {
  const seedNames = ['seed.json', 'personalize.json', 'field-map.json']
  const baseFiles = {}
  for (const name of seedNames) {
    const p = path.join(seedDir, name)
    if (!existsSync(p)) return { baseFiles: null, baseHash: null, slotKeys: [], requiresEvidenceSlots: [] }
    baseFiles[`seed/${name}`] = sha256(readFileSync(p))
  }
  const baseHash = baseHashOf(baseFiles, EMDASH_BASE_FILES)

  const seed = readJsonIfPresent(path.join(seedDir, 'seed.json'))
  const personalize = readJsonIfPresent(path.join(seedDir, 'personalize.json'))
  const fieldMap = readJsonIfPresent(path.join(seedDir, 'field-map.json'))
  if (!seed || !personalize || !fieldMap) {
    return { baseFiles, baseHash, slotKeys: [], requiresEvidenceSlots: [] }
  }

  const defaultLocale = seed.defaultLocale ?? 'en'
  const subFieldsMap = emdashSubFieldsByCollection(fieldMap)
  const slotKeySet = new Set(['settings.title', 'settings.tagline'])

  for (const [collection, rawEntries] of Object.entries(seed.content ?? {})) {
    const entries = defaultLocaleEntries(rawEntries, defaultLocale)
    const colSubMap = subFieldsMap.get(collection)
    for (const entry of entries) {
      const slug = entry?.slug
      if (!slug) continue
      if (typeof entry.title === 'string') slotKeySet.add(`${collection}.${slug}.title`)
      const data = entry?.data && typeof entry.data === 'object' ? entry.data : {}
      for (const [field, val] of Object.entries(data)) {
        if (Array.isArray(val)) {
          const declaredSubs = colSubMap?.get(field)?.map((s) => s.name) ?? null
          for (let i = 0; i < val.length; i++) {
            const item = val[i]
            if (!item || typeof item !== 'object') continue
            const subNames = declaredSubs ?? Object.keys(item).filter((k) => typeof item[k] !== 'boolean')
            for (const sub of subNames) {
              slotKeySet.add(`${collection}.${slug}.${field}[${i}].${sub}`)
            }
          }
        } else {
          slotKeySet.add(`${collection}.${slug}.${field}`)
        }
      }
    }
  }

  const requiresEvidenceSlots = []
  const reqSeen = new Set()
  const addReq = (key) => {
    slotKeySet.add(key)
    if (!reqSeen.has(key)) {
      reqSeen.add(key)
      requiresEvidenceSlots.push(key)
    }
  }

  for (const fact of personalize.facts ?? []) {
    const collection = fact?.collection
    const field = fact?.field
    if (!collection || !field) continue
    const entries = defaultLocaleEntries(seed.content?.[collection], defaultLocale)
    const targets = fact.slug ? entries.filter((e) => e?.slug === fact.slug) : entries
    const colSubMap = subFieldsMap.get(collection)
    const declaredSubs = colSubMap?.get(field)?.map((s) => s.name) ?? null

    for (const entry of targets) {
      const slug = entry?.slug
      if (!slug) continue
      const val = entry?.data?.[field]
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          const item = val[i]
          if (!item || typeof item !== 'object') continue
          const subNames = declaredSubs ?? Object.keys(item).filter((k) => typeof item[k] !== 'boolean')
          for (const sub of subNames) {
            if (sub === 'initials') continue
            addReq(`${collection}.${slug}.${field}[${i}].${sub}`)
          }
        }
      } else {
        addReq(`${collection}.${slug}.${field}`)
      }
    }
  }

  return {
    cms: 'emdash',
    seedDir,
    baseFiles,
    baseHash,
    slotKeys: Array.from(slotKeySet),
    requiresEvidenceSlots
  }
}

export function contractSlotInventory(contractDir) {
  if (!contractDir) {
    return { cms: null, baseFiles: null, baseHash: null, slotKeys: [], requiresEvidenceSlots: [] }
  }

  const hasContentMap = existsSync(path.join(contractDir, 'content-map.json'))
  const hasManifest = existsSync(path.join(contractDir, 'manifest.json'))
  if (hasContentMap || hasManifest) {
    const baseFiles = {}
    let allBasePresent = true
    for (const name of BASE_FILES) {
      const p = path.join(contractDir, name)
      if (!existsSync(p)) {
        allBasePresent = false
        break
      }
      baseFiles[name] = sha256(readFileSync(p))
    }
    const baseHash = allBasePresent ? baseHashOf(baseFiles, BASE_FILES) : null
    const manifest = readJsonIfPresent(path.join(contractDir, 'manifest.json'))
    const contentMap = readJsonIfPresent(path.join(contractDir, 'content-map.json'))
    const slots = Array.isArray(contentMap?.slots) ? contentMap.slots : []
    const slotKeys = slots.map((s) => String(s.key))
    const requiresEvidenceSlots = slots.filter((s) => s?.requiresEvidence === true).map((s) => String(s.key))
    const rawCms = String(
      manifest?.quickstart?.cms ??
        manifest?.cms ??
        (manifest?.wordpress ? 'wordpress' : manifest?.joomla ? 'joomla' : '')
    ).toLowerCase()
    const cms =
      rawCms.startsWith('wp') ||
      rawCms === 'wordpress' ||
      (!rawCms && !slots.some((s) => s?.jsonPath || s?.xpath))
        ? 'wordpress'
        : 'joomla'
    return {
      cms,
      baseFiles: allBasePresent ? baseFiles : null,
      baseHash,
      slotKeys,
      requiresEvidenceSlots
    }
  }

  const seedDir = resolveEmdashSeedDir(contractDir)
  if (seedDir) {
    return expandEmdashInventory(seedDir)
  }

  return { cms: null, baseFiles: null, baseHash: null, slotKeys: [], requiresEvidenceSlots: [] }
}

/**
 * Read and verify `<contractDir>/slot-roles.json`.
 * @param {string | null | undefined} contractDir
 * @returns {{
 *   state: 'missing' | 'stale' | 'invalid' | 'ready',
 *   doc?: any,
 *   errors?: string[],
 *   gaps: string[]
 * }}
 */
export function slotRolesOf(contractDir) {
  if (!contractDir) return { state: 'missing', gaps: [] }
  const inventory = contractSlotInventory(contractDir)
  const filePath = path.join(contractDir, SLOT_ROLES_FILE)
  if (!existsSync(filePath)) {
    return { state: 'missing', gaps: inventory.requiresEvidenceSlots }
  }

  let doc
  try {
    doc = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (err) {
    return {
      state: 'invalid',
      errors: [err instanceof Error ? err.message : 'invalid JSON'],
      gaps: inventory.requiresEvidenceSlots
    }
  }

  const boundFactSlots = new Set()
  if (Array.isArray(doc?.bindings)) {
    for (const b of doc.bindings) {
      if (typeof b?.slotKey === 'string' && isFactRole(b?.role)) {
        boundFactSlots.add(b.slotKey)
      }
    }
  }
  const gaps = inventory.requiresEvidenceSlots.filter((key) => !boundFactSlots.has(key))

  const validation = validateSlotRoles(doc, {
    slotKeys: inventory.slotKeys.length > 0 ? inventory.slotKeys : undefined
  })
  if (!validation.ok) {
    return { state: 'invalid', doc, errors: validation.errors, gaps }
  }

  if (
    typeof doc.baseHash !== 'string' ||
    !doc.baseHash.trim() ||
    !doc.baseFiles ||
    typeof doc.baseFiles !== 'object' ||
    Array.isArray(doc.baseFiles)
  ) {
    return {
      state: 'invalid',
      doc,
      errors: ['baseHash and baseFiles are required'],
      gaps
    }
  }

  if (!inventory.baseFiles || !inventory.baseHash) {
    return { state: 'stale', doc, gaps }
  }

  const expectedKeys = Object.keys(inventory.baseFiles)
  const filesMatch = expectedKeys.every((k) => doc.baseFiles[k] === inventory.baseFiles[k])
  if (!filesMatch || doc.baseHash !== inventory.baseHash) {
    return { state: 'stale', doc, gaps }
  }

  return { state: 'ready', doc, gaps }
}
