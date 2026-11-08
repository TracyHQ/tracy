// The Joomla framework of the template a kit was captured on (ticket #435): `t3` or `t4`, as the template profile row of the
// release the kit's contract seals records it (`template-profiles.json` `framework`, the same row the brand writer reads). The
// readers that scope a CSS rule to one page need it, because the two frameworks print the menu item differently:
// T4 `item-<id>` on the body, T3 `itemid-<id>` on the html element (both print the option and `view-<view>`). Never guessed from the template's name: a kit whose
// contract no profile row covers answers null, and the readers keep their T4 default.
import { defaultContracts } from './contracts.js'
import { templateProfileOf } from './template-profiles.js'

const FRAMEWORKS = new Set(['t3', 't4'])

/**
 * @param {any} kit the template kit document (`contract` names the contract it was built on)
 * @param {{ contracts?: Map<string, { id: string }>, profiles?: any }} [opts]
 * @returns {'t3' | 't4' | null}
 */
export function frameworkOfKit(kit, { contracts, profiles } = {}) {
  const id = typeof kit?.contract === 'string' ? kit.contract : null
  if (!id) return null
  let index
  try {
    index = contracts ?? defaultContracts()
  } catch {
    return null
  }
  for (const [key, contract] of index) {
    if (contract?.id !== id) continue
    const at = key.lastIndexOf('@')
    const row = templateProfileOf(key.slice(0, at), key.slice(at + 1), profiles)
    return FRAMEWORKS.has(row?.framework) ? row.framework : null
  }
  return null
}

/** The framework a write stage scopes its rules by: the one handed in (`null` included), else the kit's own. */
export const frameworkFor = (kit, given) => (given === undefined ? frameworkOfKit(kit) : given)
