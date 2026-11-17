// What the pictures step of a draft run hands `finishPictures` (#575): the drawer door, resolved once per step, and the
// alt ask of the second look (the site's language, the name the site shows, the alt limit of `step-chain-draft-alt.js`).
import { ALT_LIMIT } from './step-chain-draft-alt.js'
import { draftError } from './step-chain-draft-source.js'

export { finishPictures } from './step-chain-draft-finish.js'

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * The drawer door of the run, or null when the server wires none. A wired door that refuses (unset, disabled,
 * unreadable, a model that cannot draw: `drawer-door.js`) has no door and its refusal code: the step stops typed only
 * when a frame waits.
 * A resolver that throws stops the step with its code.
 * @param {{pictureDrawer?: () => Promise<{ok: boolean, door?: object, snapshot?: object, code?: string}>}} deps
 */
export async function drawerOf(deps) {
  if (typeof deps?.pictureDrawer !== 'function') return null
  let got
  try {
    got = await deps.pictureDrawer()
  } catch (error) {
    throw draftError(String(error?.code ?? 'picture_drawer_unreadable'), String(error?.message ?? error))
  }
  return got?.ok && got.door
    ? {
        door: got.door,
        snapshot: got.snapshot ?? null,
        // A test's provider in place of the network (the real door answers none).
        ...(typeof got.fetchImpl === 'function' ? { fetchImpl: got.fetchImpl } : {})
      }
    : { door: null, refused: got?.code ?? null }
}

/** The alt ask of every look: the plan's language and the site name, null when the plan names no language. */
export function altAskOf(plan, profile) {
  const language = plan?.language
  if (!isText(language)) return () => null
  const name = (profile?.facts?.['business.name'] ?? []).find((f) => isText(f?.value))?.value ?? null
  const ask = { language: language.trim(), business: name, limit: ALT_LIMIT }
  return () => ask
}
