/**
 * The value edit of `PUT /api/website-opportunities/:id/facts` (#537 R18): `{factId, value, onSite?}` sets the value the
 * site states for any fact of the seven groups of the saved profile, validated by the fact's kind
 * (`domain/fact-value-kinds.mjs`); `value: null` gives the fact back the value research read. Kept on the candidate as
 * `factEdits {[factId]: {value, at}}`, where Research again never reaches, and laid on by `savedProfileOf`, so the card
 * and every later brief read the edited value. Like every Profile edit, it marks the Profile changed (`approval.js`):
 * a brief made before reads stale and the Profile needs the owner's review again.
 */
import { markProfileChanged } from './approval.js'
import { nextFactOverrides } from './owner-fact-picks.js'
import { changeCandidate } from './owner-site-edits.js'
import { researched, researchStateOf } from './research-state.js'
import { savedPlaceProfileOf } from './saved-profile-read.js'
import { factWithPathOf } from '../domain/saved-profile.mjs'
import {
  FACT_EDITS_MAX,
  editedFactValue,
  factValueKindOf,
  nextFactEdits,
  readFactValue
} from '../domain/fact-value-kinds.mjs'

const FACT_ID = /^[a-z]+_[A-Za-z0-9_-]{1,160}$/

/**
 * @param {any} c the request
 * @param {{pool: any, host?: any, refuse: Function, notFound: Function, json: Function, opportunityShape: Function}} ctx
 * @param {{who: {accountId: string}, opp: any, body: any}} input
 */
export async function factValueEdit(c, ctx, { who, opp, body }) {
  const { pool, refuse, notFound, json } = ctx
  const factId = body?.factId
  if (typeof factId !== 'string' || !FACT_ID.test(factId))
    return refuse(c, 400, 'INVALID_FACT', 'Send "factId" as the id of a fact of the place profile.')
  const onSite = 'onSite' in body ? body.onSite : undefined
  if (onSite !== undefined && onSite !== true && onSite !== false && onSite !== null)
    return refuse(c, 400, 'INVALID_ON_SITE', 'Send "onSite" as true, false or null.')
  if (!researched(await researchStateOf(pool, opp.id))) return notFound(c, 'fact')
  const saved = await savedPlaceProfileOf(pool, { host: ctx.host, accountId: who.accountId, opp })
  if (saved.error)
    return refuse(c, 502, 'PROFILE_UNAVAILABLE', 'The place profile could not be read. Try again later.')
  const found = factWithPathOf(saved.profile, factId)
  if (!found) return notFound(c, 'fact')
  const { fact, path } = found
  // The kind is the value research read: an edit never changes what kind of fact it is.
  const research = { ...fact, value: 'researchValue' in fact ? fact.researchValue : fact.value }
  const kind = factValueKindOf(path, research)
  let value = null
  if (body.value !== null) {
    const read = readFactValue(kind, body.value, path)
    if (read.error) return refuse(c, 400, 'INVALID_VALUE', read.next, { expected: kind ?? 'none' })
    value = read.value
  }
  let saving
  try {
    saving = await changeCandidate(pool, who.accountId, opp.id, (candidate) => ({
      patch: {
        factEdits: nextFactEdits(candidate.factEdits, factId, value),
        ...(onSite !== undefined
          ? { factOverrides: nextFactOverrides(candidate.factOverrides, factId, onSite) }
          : {})
      }
    }))
  } catch (error) {
    if (error?.code === 'TOO_MANY_FACT_EDITS')
      return refuse(
        c,
        400,
        'TOO_MANY_FACT_EDITS',
        `At most ${FACT_EDITS_MAX} facts can be edited by hand. Send "value": null for one to give it back the value research read.`
      )
    if (error?.code === 'TOO_MANY_FACT_OVERRIDES')
      return refuse(
        c,
        400,
        'TOO_MANY_FACT_OVERRIDES',
        'Too many facts are switched on or off by hand. Send "onSite": null for one to let the rule decide it again.'
      )
    throw error
  }
  if (!saving) return notFound(c, 'opportunity')
  const marked = (await markProfileChanged(pool, who.accountId, opp.id)) ?? saving.row
  return json(c, {
    opportunity: ctx.opportunityShape(marked),
    fact: {
      id: factId,
      kind,
      value: value === null ? research.value : editedFactValue(path, fact, value),
      researchValue: research.value,
      editedByOwner: value !== null
    }
  })
}
