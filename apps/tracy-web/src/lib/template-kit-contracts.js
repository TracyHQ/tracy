// Kit readers also consume EmDash artifacts. These are not sealing profiles: their authored kit and content map
// name the release, and no manifest is created or added to the shared profile index.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultContracts } from './contracts.js'

const IMAGE_ROOT = fileURLToPath(new URL('../contracts/', import.meta.url))
const CMS_ROOT = fileURLToPath(new URL('../../../../packages/cms/', import.meta.url))

function directories(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name))
  } catch {
    return []
  }
}

/** Authored EmDash identity only; malformed or mismatched artifacts never become a readable contract. */
function emdashArtifact(dir) {
  try {
    const kit = JSON.parse(readFileSync(path.join(dir, 'template-kit.json'), 'utf8'))
    const map = JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8'))
    if (map.schemaVersion !== 'tracy-quickstart-content-map/emdash/v1') return null
    if (
      typeof kit.contract !== 'string' ||
      typeof map.template !== 'string' ||
      typeof map.version !== 'string'
    )
      return null
    const [template, line, version, extra] = kit.contract.split('/')
    if (
      extra !== undefined ||
      !template?.trim() ||
      !version?.trim() ||
      path.basename(dir) !== version ||
      template !== map.template ||
      version !== map.version ||
      !/^emdash-[a-z0-9.x-]+$/.test(line ?? '') ||
      kit.quickstart?.version !== version ||
      kit.template?.name !== template
    )
      return null
    return { id: kit.contract, dir, platform: 'emdash', release: `${template}/${line}`, version }
  } catch {
    return null
  }
}

/**
 * The kit/content-map reader index, leaving the profile index and its sealing semantics unchanged.
 * Image folders and checkout theme folders carry the same authored EmDash artifacts. Explicit reader indexes do
 * not call this discovery path; custom indexes remain isolated from the deployment's files.
 */
function discover({ index = defaultContracts(), imageRoot = IMAGE_ROOT, cmsRoot = CMS_ROOT }) {
  const result = new Map(index)
  const imageDirs = directories(imageRoot).flatMap((template) =>
    directories(template)
      .filter((line) => /^emdash-/.test(path.basename(line)))
      .flatMap((line) => directories(line))
  )
  const checkoutDirs = directories(cmsRoot)
    .filter((dir) => path.basename(dir).startsWith('tracy-emdash-theme-'))
    .flatMap((dir) => directories(path.join(dir, 'contracts')))
  for (const dirs of [imageDirs, checkoutDirs]) {
    const claimed = new Set()
    for (const dir of dirs) {
      const artifact = emdashArtifact(dir)
      if (!artifact) continue
      const key = `${artifact.release}@${artifact.version}`
      if (claimed.has(key)) throw new Error(`EmDash kit identity is claimed more than once: ${key}`)
      claimed.add(key)
      // An image artifact wins over the same checkout artifact. Existing profile entries also retain authority.
      if (result.has(key)) continue
      const { release: _release, version: _version, ...contract } = artifact
      result.set(key, contract)
    }
  }
  return result
}

let defaultKitIndex = null

/** Default deployment discovery is read once; explicit roots and indexes are always read afresh. */
export function kitContracts(options) {
  if (options !== undefined) return discover(options)
  defaultKitIndex ??= discover({})
  return defaultKitIndex
}
