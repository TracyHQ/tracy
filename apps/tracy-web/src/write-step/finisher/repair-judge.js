// The checker's verdict on a repair the customer sees (spec #418): the page is shot again, the repaired block is cropped before
// and after (repair-crops.js), and the checker model compares the two. Its call is kept as a reply file like every role's.
import { shootPages } from '../../lib/page-shots.js'
import { askChecker, verdictOf } from './finisher-roles.js'
import { cropsOf } from './repair-crops.js'

/**
 * @param {object} run the finisher's run (finisher.js)
 * @param {{ fault: object, firstShots: object, repairNumber: number, wordsBefore: string, wordsAfter: string }} input
 *   `wordsBefore` and `wordsAfter` are the words the block is found by on the shots before and after the repair
 * @returns {Promise<{ verdict: string, reason: string, crops: object, checkedBy: 'checker', proven: boolean }>} `proven`:
 *   the repaired page was shot again, so a verdict of better rests on evidence
 */
export async function judgedOnCrops(run, { fault, firstShots, repairNumber, wordsBefore, wordsAfter }) {
  const { doors } = run
  const afterShots = await shootPages({ capture: run.capture, pages: [fault.page] })
  const crops = await cropsOf({
    fault,
    before: firstShots,
    after: afterShots,
    wordsBefore,
    wordsAfter,
    name: `r${repairNumber}`,
    saveFile: run.saveFile
  })
  const judged = run.spend(await askChecker(doors.checker, fault, crops.beforeShots, crops.afterShots))
  await run.replies.keep({
    name: `checker-r${repairNumber}`,
    role: 'checker',
    page: fault.page,
    repair: repairNumber,
    door: doors.checker,
    sent: judged.sent,
    images: [...crops.files.before, ...crops.files.after],
    call: judged
  })
  const { verdict, reason } = judged.problem
    ? { verdict: 'not better', reason: `the checker: ${judged.problem}` }
    : verdictOf(judged.answer)
  return { verdict, reason, crops, checkedBy: 'checker', proven: crops.afterShots.length > 0 }
}
