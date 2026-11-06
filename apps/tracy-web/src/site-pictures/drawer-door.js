// The picture drawer's door (#344, ADR 0043 section 3): the image model that draws a `specific` frame no owner photo
// fits, or extends a real photo sideways for a wide band, reached through its own door `pictureDrawer` (by default
// google/gemini-3.1-flash-lite-image through OpenRouter, about 0.034 USD a picture).
//
// A run that may need a drawing (its plan has a frame that waits for a specific picture) does not start without it: an
// unset, disabled or unreadable door, or a model its provider says cannot draw, refuses the run at its start and again
// when a worker claims it, as does a door changed since the start. A run records the door's snapshot (never the key) as
// `door.drawer`.
import { DOORS_WHERE as WHERE, ladderRefusal, lookedUpDoor } from '../lib/door-ladder.js'

export const PICTURE_DRAWER_DOOR = 'pictureDrawer'

/** The model the drawer is meant to run on (OpenRouter id). Naming it here assigns nothing: a door is set in /ops. */
export const PICTURE_DRAWER_MODEL = 'google/gemini-3.1-flash-lite-image'

const LABEL = '"Picture drawer"'

/**
 * The drawer door, or a refusal with its code and reason.
 * @param {{ pool: import('pg').Pool, secret?: string }} input
 * @returns {Promise<
 *   | { ok: true, door: { providerId: string, baseUrl: string, apiKey: string, model: string }, snapshot: object }
 *   | { ok: false, code: string, reason: string }
 * >} `snapshot` is what a run stores: which provider, model and assignment revision it used, never the key.
 */
export async function pictureDrawerDoor({ pool, secret }) {
  const found = await lookedUpDoor(pool, PICTURE_DRAWER_DOOR, secret)
  const refused = ladderRefusal(found, {
    prefix: 'SITE_PICTURES_DRAWER',
    label: LABEL,
    runsOn: `the drawer runs on ${PICTURE_DRAWER_MODEL}`
  })
  if (refused) return refused
  const refuse = (suffix, reason) => ({ ok: false, code: `SITE_PICTURES_DRAWER_${suffix}`, reason })
  const { providerId, baseUrl, apiKey, model } = found.credential
  if (found.snapshot.metadata?.draws === false)
    return refuse(
      'MODEL_LACKS',
      `The provider says ${model} cannot draw pictures. Pick a model that draws for the ${LABEL} door in ${WHERE}.`
    )
  return {
    ok: true,
    door: { providerId, baseUrl, apiKey, model },
    snapshot: {
      door: PICTURE_DRAWER_DOOR,
      model,
      endpointHost: new URL(baseUrl).hostname,
      ...found.snapshot
    }
  }
}

/**
 * The drawer door of a claimed run: the one it was started with (the same provider, model and endpoint, `started`), or
 * a refusal. A run started without a drawer (its plan has no frame that may be drawn) gets none.
 */
export async function runDrawerDoor(deps, started) {
  if (!started?.door) return { ok: true, door: null, snapshot: null }
  const door = await pictureDrawerDoor(deps)
  if (!door.ok) return door
  const same = ['providerId', 'model', 'endpointHost'].every((k) => door.snapshot[k] === started[k])
  if (!same)
    return {
      ok: false,
      code: 'SITE_PICTURES_DRAWER_CHANGED',
      reason: `the drawer door now uses ${door.snapshot.providerId} ${door.snapshot.model}, the run was started on ${started.providerId} ${started.model}`
    }
  return door
}
