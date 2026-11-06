// The ladder a model door of /ops › Model & AI climbs before a run may spend it: the door is looked up (with no secret its
// key cannot be opened), then refused when it names no provider and model (UNSET), when its provider is switched off
// (DISABLED), or when its key cannot be opened (UNREADABLE). Each door keeps its own code prefix and label; the wording
// is shared here so every door says the same thing the same way. A door that looks at pictures also shares the one
// sentence that refuses a model that cannot read them.
import { lookupDoor } from './llm-store.js'

export const DOORS_WHERE = '/ops › Model & AI'

/** What /ops holds for a door: lookupDoor's answer, or unreadable when there is no secret to open its key with. */
export const lookedUpDoor = (pool, door, secret) =>
  secret ? lookupDoor(pool, door, secret) : Promise.resolve({ state: 'unreadable' })

/**
 * The refusal of a door that may not be used, or null when it is set, on and readable.
 * @param {{ state: string, credential?: { model?: string } }} found lookupDoor's answer
 * @param {{ prefix: string, label: string, runsOn: string }} door `prefix` of its codes (`SITE_PICTURES_LOOKER`), its
 *   label as quoted in the reasons (`"Picture looker"`), and what it is meant to run on (`the looker runs on ...`)
 * @returns {{ ok: false, code: string, reason: string } | null}
 */
export function ladderRefusal(found, { prefix, label, runsOn }) {
  const refuse = (suffix, reason) => ({ ok: false, code: `${prefix}_${suffix}`, reason })
  if (found.state === 'unassigned' || (found.state === 'ok' && !found.credential?.model))
    return refuse(
      'UNSET',
      `The ${label} door has no provider and model. Set it in ${DOORS_WHERE} (${runsOn}).`
    )
  if (found.state === 'disabled')
    return refuse(
      'DISABLED',
      `The provider of the ${label} door is switched off. Turn it on, or pick another provider in ${DOORS_WHERE}.`
    )
  if (found.state !== 'ok')
    return refuse(
      'UNREADABLE',
      `The key of the ${label} door's provider cannot be opened (empty, or sealed with another secret). Save the key again in ${DOORS_WHERE}.`
    )
  return null
}

/**
 * The reason a door whose model cannot read pictures is refused, for every door that looks at pictures.
 * @param {{ said: string, label: string, sight: string }} input `said` names who says so and the model ("The provider
 *   says gpt-x"), `sight` what the role looks at ("the looker checks every picture by sight")
 */
export const cannotSeeReason = ({ said, label, sight }) =>
  `${said} cannot read pictures, and ${sight}. Pick another model for the ${label} door in ${DOORS_WHERE}.`
