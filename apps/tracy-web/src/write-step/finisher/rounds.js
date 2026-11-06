// The finisher's rounds on one page (spec #418, #424): at most two, a third never starts. Round one repairs every fault found
// on the page. Round two only retries the repairs the checker (or code) rejected in round one, each with the order tried
// before (`tried`), which the fixer may not give again; the page is not shot again and the finder is not asked again. A fault
// that waited for another repair of the same place joins round two only while no limit is reached. What is still left after
// the last round, or when a limit stops the run, is logged as unrepaired with its reason.
import { repairPage } from './page-repairs.js'
import { unrepairedRecord } from './repair-log.js'
import { budgetReason } from './run-limits.js'

/**
 * @param {object} run the finisher's run (finisher.js)
 * @param {string | null} page
 * @param {object[]} faults the page's faults, found and merged
 * @param {object} shots the page's shots they were found on
 * @returns {Promise<{ records: object[], kept: object[], rounds: number }>}
 */
export async function repairRounds(run, page, faults, shots) {
  const records = []
  const kept = []
  const last = run.budget.limits.rounds
  let todo = faults
  let round = 0
  while (todo.length) {
    round += 1
    const result = await repairPage(run, page, todo, shots, round)
    records.push(...result.records)
    kept.push(...result.kept)
    const stopped = run.budget.stopped()
    const roundLeft = round < last
    const waitingWhy = stopped
      ? budgetReason(stopped)
      : 'another repair of the same place took the round, and no round is left'
    if (!roundLeft || stopped) {
      records.push(...result.deferred.map((f) => unrepairedRecord(run.firstCheck, f, waitingWhy)))
      break
    }
    todo = [...result.rejected, ...result.deferred]
  }
  return { records, kept, rounds: round }
}
