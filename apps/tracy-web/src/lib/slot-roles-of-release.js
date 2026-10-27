/**
 * The slot roles of a release's sealing contract, wherever that contract lives: the Joomla and WordPress contract
 * folders, or the EmDash theme (its seed folder in the image or in a checkout). Read through the shared reader
 * (`contract-slot-roles.js`: the content map first, then the `slot-roles.json` sidecar). Used by Content coverage on the
 * Road to live and by the Website Opportunities fill (`slot-roles-for.js`).
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readSlotRoles } from './contract-slot-roles.js'
import { contractFor } from './contracts.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const IN_IMAGE = path.resolve(HERE, '../contracts')
const EMDASH_CMS_DIR = path.resolve(HERE, '../../../../packages/cms')

function emdashContractDir(release, version) {
  if (!version) return null
  const parts = String(release?.tag ?? '')
    .split('/')
    .filter(Boolean)
  const slug = parts.at(-2) ?? String(release?.setting?.template ?? '')
  const cmsDir = parts.at(-1) ?? 'emdash-0.x'
  if (slug) {
    const imgDir = path.join(IN_IMAGE, slug, cmsDir, version)
    const imgSeed = path.resolve(IN_IMAGE, '../emdash-tool', slug, 'seed/seed.json')
    if (existsSync(imgDir) || existsSync(imgSeed)) return imgDir
  }
  const rawTemplate = String(release?.setting?.template ?? slug)
  const themeName = rawTemplate.replace(/^tracy-/, '')
  if (themeName) {
    const pkgDir = path.join(EMDASH_CMS_DIR, `tracy-emdash-theme-${themeName}`)
    if (existsSync(path.join(pkgDir, 'seed/seed.json'))) {
      return path.join(pkgDir, 'contracts', version)
    }
  }
  return null
}

/**
 * The slot roles of a release's sealing contract (or EmDash theme version), through the shared reader
 * (`contract-slot-roles.js`: the content map, then the `slot-roles.json` sidecar).
 * @param {any} release
 * @param {import('./contracts.js').ContractIndex} contracts
 */
export function slotRolesOfRelease(release, contracts) {
  const version = typeof release?.setting?.version === 'string' ? release.setting.version : undefined
  const contract = contractFor(contracts, release?.tag, version)
  if (contract?.dir) return readSlotRoles(contract.dir)
  if (release?.platform === 'emdash') {
    const dir = emdashContractDir(release, version)
    if (dir) return readSlotRoles(dir)
  }
  return readSlotRoles(null)
}
