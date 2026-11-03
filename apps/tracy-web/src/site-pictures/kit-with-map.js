// The template kit as the picture bench reads it (#340): the kit document (lib/template-kit-source.js openKit) with
// the content map beside it in the contract folder joined under `contentMap`, as the picture check expects (ADR 0043
// section 2): a content map slot's `fit.source` is the size of the demo file the site holds, whose aspect the write
// door accepts. A contract with no content map gives an empty slot list.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defaultContracts } from '../lib/contracts.js'
import { openKit } from '../lib/template-kit-source.js'

const CONTENT_MAP = 'content-map.json'

/**
 * One readable kit by its ref with its content map, or null.
 * @param {string} ref the contract id, e.g. "ja-boxing/j6/1.0.10"
 * @param {{ index?: Map<string, { id: string, dir?: string }> }} [options] the contracts to find kits in (tests)
 */
export function openKitWithMap(ref, { index = defaultContracts() } = {}) {
  const kit = openKit(ref, { index })
  if (!kit) return null
  const contract = [...index.values()].find((c) => c.id === ref)
  return { ...kit, doc: { ...kit.doc, contentMap: contentMapIn(contract?.dir) } }
}

function contentMapIn(dir) {
  if (!dir) return { slots: [] }
  try {
    const map = JSON.parse(readFileSync(path.join(dir, CONTENT_MAP), 'utf8'))
    return { slots: Array.isArray(map?.slots) ? map.slots : [] }
  } catch {
    return { slots: [] }
  }
}
