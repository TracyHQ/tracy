/**
 * The latest release of a template as the quickstart list pins it (`quickstarts.json`), and the release row the
 * readiness verdict reads when GitHub is not asked (the required reference test, a command line run with no token).
 *
 * 🔒 ONLY WHAT THE REPOSITORY KNOWS. The pin names the tag, the version, the install part with its sha256 and the
 * contract; the contract's own manifest names the template. The asset list GitHub would give is NOT known here, so
 * the row carries `assets: null`, and the steps that compare assets (missing install files, the kit's image zip,
 * GitHub's stated sha256) are not judged on it rather than judged on an invented list. The row says where it came
 * from (`source: 'pin'`) so no reader takes it for a GitHub reading.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { contractFor } from '../contracts.js'

const PINS_FILE = fileURLToPath(new URL('../../quickstarts.json', import.meta.url))

/** The install parts a pin may name, as `tracy_setting.json` names them. */
const PARTS = Object.freeze(['installer', 'webroot', 'database', 'source', 'state'])

/**
 * @typedef {{ tag: string, platform: string, version: string, contract: string | null, cowork: string | null, install: Record<string, { file: string, sha256: string, bytes?: number }> }} Pin
 */

/** The parsed quickstart list. @param {string} [file] */
export function readPins(file = PINS_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * The pin of a template: `name` is a tag (`quickstart/ja-boxing/j6`) or a template slug (`ja-boxing`, read as its
 * Joomla 6 quickstart `quickstart/<slug>/j6`, else the only tag of that slug). Null when the list has none.
 * @param {string} name
 * @param {Record<string, any>} [pins] the parsed list (`readPins()` by default)
 * @returns {Pin | null}
 */
export function latestPin(name, pins = readPins()) {
  const tags = Object.keys(pins)
  const ofSlug = tags.filter((t) => t.split('/').at(-2) === name)
  const tag = pins[name]
    ? name
    : ofSlug.includes(`quickstart/${name}/j6`)
      ? `quickstart/${name}/j6`
      : ofSlug.length === 1
        ? ofSlug[0]
        : null
  if (tag === null) return null
  const entry = pins[tag]
  /** @type {Pin['install']} */
  const install = {}
  for (const part of PARTS) {
    const p = entry[part]
    if (p && typeof p.file === 'string') install[part] = { file: p.file, sha256: p.sha256, bytes: p.bytes }
  }
  return {
    tag,
    platform: entry.platform,
    version: entry.version,
    contract: typeof entry.contract === 'string' ? entry.contract : null,
    cowork: typeof entry.cowork?.version === 'string' ? entry.cowork.version : null,
    install
  }
}

/**
 * The release row of a pin, in the shape `readReleases` gives, built from the pin and its contract's manifest.
 * @param {Pin} pin
 * @param {import('../contracts.js').ContractIndex} contracts
 */
export function releaseOfPin(pin, contracts) {
  const contract = contractFor(contracts, pin.tag, pin.version)
  let template = null
  if (contract) {
    try {
      const manifest = JSON.parse(readFileSync(`${contract.dir}/manifest.json`, 'utf8'))
      template = manifest.template ?? manifest.quickstart?.template ?? null
    } catch {
      template = null
    }
  }
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: pin.platform,
    version: pin.version,
    ...(template ? { template } : {}),
    install: pin.install
  }
  return {
    tag: pin.tag,
    name: pin.tag,
    kind: 'quickstart',
    // A pin is written once its release is published (the quickstart-contract skill pins a published release).
    github: 'published',
    tracy: 'ready',
    reason: null,
    publishedAt: null,
    assets: null,
    setting,
    inspiration: null,
    inspirationHidden: false,
    pages: null,
    local: null,
    choosable: true,
    platform: pin.platform,
    source: 'pin'
  }
}
