// Wiring: a built site's update, restore and abandon (#612, `build-draft/rebuild-route.js`), with Part 3's restore and
// abandon (`step-chain-draft-restore.js`, `step-chain-draft-abandon.js`) over the build store (`build-draft/
// site-builds.js`). It sits beside app.js because it composes the build draft folder with the step chain's modules.
//
// THREE SEAMS ARE INJECTED, and none is on the branch yet (each missing one makes its door say plainly that the site
// cannot be updated from the chat, and nothing is written):
//   startRun({accountId, email, siteKey, draftId, build, brief})  starts a step chain run on the site that is already
//        built, with `brief` (`{workflow, draftId, plan, rebuildFrom, buildRun}`), the run's ctx carrying `siteKey`
//        and `accountId`, and every write under `applyFor(email, runId)`; answers `{started: true}` or
//        `{refusal: {code, status}}`. The run frame (`sites/brief-build.js`) starts a chain run only with a site it
//        creates, so it has no entry for this yet.
//   siteDoorsFor({siteKey, email, runId})  the site doors of a draft write (`draftDoorsOf` over `applyFor(email, runId)`),
//        or null.
//   runRecordOf(runId, ctx)  the run record an unfinished revision kept (`deps.draftWrite.record` of that run), or null:
//        the write wiring keeps it in the process only, so a crashed run's record is gone with its process.
import { abandonRun } from './step-chain-draft-abandon.js'
import { restoreBuild } from './step-chain-draft-restore.js'

const missing = (what) =>
  Object.assign(new Error(`this server has no ${what} for a built site`), {
    code: 'previous_build_doors_missing'
  })

/**
 * @param {{builds: object, startRun?: Function, siteDoorsFor?: Function, runRecordOf?: Function}} deps
 * @returns {{builds: object, startRevision?: Function, restoreSite: Function, abandonSite: Function}}
 */
export function draftRebuild({ builds, startRun, siteDoorsFor, runRecordOf }) {
  const doorsOf = async (input) => {
    const doors = typeof siteDoorsFor === 'function' ? await siteDoorsFor(input) : null
    if (!doors) throw missing('site doors')
    return doors
  }
  return {
    builds,
    ...(typeof startRun === 'function' ? { startRevision: startRun } : {}),
    restoreSite: async ({ siteKey, email, runId, build, ctx }) =>
      restoreBuild({
        build,
        doors: await doorsOf({ siteKey, email, runId }),
        record: {},
        runId,
        builds,
        ctx
      }),
    abandonSite: async ({ siteKey, email, run, runId, ctx }) => {
      const runRecord = typeof runRecordOf === 'function' ? await runRecordOf(run, ctx) : null
      if (!runRecord) throw missing('record of the unfinished run')
      return abandonRun({
        run,
        runRecord,
        doors: await doorsOf({ siteKey, email, runId }),
        record: {},
        runId,
        builds,
        ctx
      })
    }
  }
}
