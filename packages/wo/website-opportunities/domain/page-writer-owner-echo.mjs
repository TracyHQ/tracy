// The owner echo check of the page writer (decision D46, #609): what the owner typed in the build chat is a source,
// its wording is never site copy. Every value a page shows that the writer wrote (its copy fields and its search texts)
// is held to the owner's statement with `echoProblemsIn` (`owner-echo.mjs`: a run of four words in a row, or 60% of a
// sentence in order). The names and values of the plan's data are public texts: a service name the owner typed is a
// fact value, so a title that is that name stands. An owner's fact (`page-writer-owner-facts.mjs`) is NOT one: the
// writer says it in its own words. A copying field fails with `copies_owner` and goes back to the writer once like
// every failing field (`page-writer-rounds.mjs`); still copying, the build stops with `copy_check_failed` (noRerun).
// The problem names the rule and the weight, never the owner's words. Pure.
import { echoProblemsIn } from './owner-echo.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * What the echo check of a build reads, or null with no statement: the statement and the public texts.
 * @param {string | null | undefined} ownerStatement what the owner typed in the build chat
 * @param {{known: Array<{value: string}>, data: object}} context the writer context before the owner's facts join it
 */
export function ownerEchoContextOf(ownerStatement, { known, data }) {
  if (!isText(ownerStatement)) return null
  const publicTexts = [
    ...new Set(
      [...list(known).map((e) => e?.value), ...list(data?.items).map((i) => i?.label)].filter(isText)
    )
  ]
  return { statement: ownerStatement, publicTexts }
}

/** The failing fields of a page whose written words copy the owner (`keys`: the search texts' keys). */
export function ownerEchoFailing(state, echo, keys) {
  if (!echo) return []
  const values = {}
  for (const slot of state.slots)
    if (typeof state.values[slot.key] === 'string') values[slot.key] = state.values[slot.key]
  for (const [name, key] of Object.entries(keys))
    if (typeof state.seo?.[name] === 'string') values[key] = state.seo[name]
  return echoProblemsIn(values, echo.statement, { publicTexts: echo.publicTexts }).map(
    ({ field, rule, weight }) => ({
      key: field,
      value: field in state.values ? state.values[field] : state.seo?.[field.split('.')[1]],
      problems: [
        {
          code: 'copies_owner',
          message: `these words copy the owner's own statement (${rule === 'run' ? `${weight} words in a row` : 'most of one sentence'}): say the fact in other words of your own`
        }
      ]
    })
  )
}
