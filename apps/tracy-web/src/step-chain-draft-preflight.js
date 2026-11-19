// What a draft run checks before any work that costs (#575): the step chain's `doors` step, the first step of every
// run, reads every door the run will need and answers the ones that cannot be answered, so the run stops coded
// (`STEP_CHAIN_DOORS_EMPTY`, naming each door and its state) before the writer, the vision call or the drawer is paid.
// The older step chain did the same for its seven model doors (`step-chain-doors.js` `emptyChainDoors`); a draft run
// spends the build model and the picture drawer:
//
//   buildModel     the build model door (`build-draft/build-model.js`), every writer, vision, look, wish and icon call
//   pictureDrawer  the drawer door: unset, refused (disabled, a key that will not open, a model that cannot draw) or
//                  unreadable. A frame that waits for a drawing is only known after the pictures are placed, and the
//                  placement is paid, so the drawer is held to be there before anything is (the create door asks the
//                  same at approval)
//
// The site doors of the write are the server's wiring, not a door with a provider: a run with none stops typed at the
// write (`write_not_ready_for_draft`), which spends nothing on the site.
// Reading a door spends nothing. Pure over the injected resolvers.
import { drawerOf } from './step-chain-draft-finish-wiring.js'

const stateOf = (error, fallback) => String(error?.code ?? fallback)

/**
 * The doors a draft run cannot answer, each `{door, state}`; none means the run may start.
 * @param {object} deps the draft deps (`createDraftSteps`)
 * @param {() => Promise<Function>} modelOf the build model resolver of the steps
 * @returns {Promise<{door: string, state: string}[]>}
 */
export async function draftPreflight(deps, modelOf) {
  const empty = []
  try {
    await modelOf()
  } catch (error) {
    empty.push({ door: 'buildModel', state: stateOf(error, 'unreadable') })
  }
  try {
    const drawer = await drawerOf(deps)
    if (!drawer) empty.push({ door: 'pictureDrawer', state: 'unset' })
    else if (!drawer.door) empty.push({ door: 'pictureDrawer', state: String(drawer.refused ?? 'refused') })
  } catch (error) {
    empty.push({ door: 'pictureDrawer', state: stateOf(error, 'picture_drawer_unreadable') })
  }
  return empty
}
