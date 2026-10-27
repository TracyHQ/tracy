/**
 * The slot roles of the release a build installs, as the shared reader (`contract-slot-roles.js`, ADR 0038) reads them:
 * the content map first, then the `slot-roles.json` sidecar (ADR 0037). Only a `ready` read (valid and, for a sidecar,
 * its `baseHash` matching the files in use) is filled from; any other state keeps the path without a group plan.
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { contractFor, defaultContracts } from './contracts.js'
import { readSlotRoles } from './contract-slot-roles.js'
import { slotRolesOfRelease } from './slot-roles-of-release.js'

const IN_IMAGE = fileURLToPath(new URL('../contracts/', import.meta.url))
const IN_CHECKOUT = fileURLToPath(new URL('../../../../packages/cms/', import.meta.url))

/** The template (product) of a quickstart tag: `tracy-base/j6` is `tracy-base`, `quickstart/ja-restaurant/wp7` is `ja-restaurant`. */
export function templateOfQuickstart(quickstart) {
  return (
    String(quickstart ?? '')
      .split('/')
      .at(-2) ?? ''
  )
}

/**
 * @param {{cms?: string, quickstart?: string, version?: string}} template - a revision's template
 * @param {import('./contracts.js').ContractIndex} [contracts]
 * @returns {ReturnType<typeof readSlotRoles>}
 */
export function sidecarForTemplate(template, contracts = defaultContracts()) {
  const { cms, quickstart, version } = template ?? {}
  if (cms === 'emdash')
    return slotRolesOfRelease({ platform: 'emdash', tag: quickstart, setting: { version } }, contracts)
  return readSlotRoles(contractFor(contracts, quickstart, version)?.dir ?? null, {
    cms,
    template: templateOfQuickstart(quickstart)
  })
}

/** The folders an EmDash template's sidecars sit in: one per version, in the image and in a checkout. */
function emdashContractDirs(templateId) {
  const dirs = []
  const list = (dir) => {
    try {
      return readdirSync(dir).map((name) => path.join(dir, name))
    } catch {
      return []
    }
  }
  dirs.push(...list(path.join(IN_IMAGE, templateId, 'emdash-0.x')))
  dirs.push(
    ...list(path.join(IN_CHECKOUT, `tracy-emdash-theme-${templateId.replace(/^tracy-/, '')}`, 'contracts'))
  )
  return dirs
}

/**
 * The `ready` slot roles of an EmDash template, whichever version they were cut for: `ready` means a sidecar's hash
 * matches the seed this process runs the template's tool with, so it is the one for this build. Null when none is.
 * @param {string} templateId - `emdashToolFor(...).templateId`
 */
export function emdashReadySidecar(templateId) {
  if (!templateId) return null
  for (const dir of emdashContractDirs(templateId)) {
    const read = readSlotRoles(dir, { cms: 'emdash', template: templateId })
    if (read.state === 'ready') return read
  }
  return null
}
