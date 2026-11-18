// The plan data a plan is judged against, the same for every gate (#575): the composer's gate, a change request's,
// the plan edit door's and every plan card operation's. It is the needs profile's data (`planDataOf`), the plan facts of
// its open item field conflicts (`addItemFieldFacts`), and the facts the composer made from the brief that no profile
// holds (`carryChannelFacts`: a WhatsApp link, a second phone), carried from the plan itself. A gate that built the
// data any other way would refuse, for a part the owner never touched, a plan another gate accepted. Pure.
import { carryChannelFacts } from './plan-composer-channels.mjs'
import { addItemFieldFacts } from './plan-conflicts.mjs'
import { planDataOf } from './plan-data.mjs'

/**
 * The plan data of `profile`, with what `plan` holds from its brief.
 * @param {object} profile a needs profile (the settled one a plan was composed from, or an edit's)
 * @param {object | null} [plan] the plan the data is for; without one, the profile's data only
 */
export function planDataOfPlan(profile, plan = null) {
  const data = addItemFieldFacts(profile, planDataOf(profile))
  if (plan) carryChannelFacts(plan, data)
  return data
}
