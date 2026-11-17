/**
 * A BUSINESS KNOWN ONLY BY ITS OWNER'S WORDS (#575): the build chat's research when the owner gave no link and no
 * place was found by name and city. The business is still the step chain's: a private opportunity of the account
 * marked `ownSite` (never listed among Website Opportunities), whose only source is what its owner said, and whose
 * content brief is the step chain's own (`createRevision`, a `wo_revision`), so the draft keeps the same record as a
 * research of links.
 *
 * 🔒 THE STEP CHAIN'S OWN SHAPES, NO SECOND ONE. An opportunity with no place is read by the brief from its own rows
 * (`brief-research.js` `fromOpportunity`), as an outside builder's demo request is (`public-demos.js`):
 *   - `wo_source` row `owner-statement`, status `complete`: the owner's statements as said (`collected.statements`),
 *     the source the brief names;
 *   - `wo_profile`: the name and the business reading of those statements (`profile.businessReading`, read by the
 *     step chain's `readBusiness` with the statements as its `ownerStatement`, decision D46: research, never copy),
 *     and a neutral brand part (the brand step refuses a brief without one; nothing was observed, so it claims nothing);
 *   - the facts an answer stated, read by the answer reading: the Profile card's own owner edits on the candidate
 *     (`profileEdits` for the phone, address and email, `hoursPick` for the hours), which every brief lays on top.
 * There is no place, so no shared data is written: the place tables stay untouched.
 */
import { randomUUID } from 'node:crypto'
import { saveProfile } from 'website-opportunities/src/store.js'
import { EDITABLE_PROFILE_FIELDS, readProfileEdits } from 'website-opportunities/src/profile-edits.js'

/** The provider of a business known by its owner's words: its id names the build draft it was told in. */
export const OWNER_PROVIDER = 'owner-statement'
/** The source row the owner's statements are kept in. */
export const OWNER_SOURCE = 'owner-statement'
/** The answer reading's contact kinds, as the Profile card's owner edits. */
const EDIT_OF_KIND = Object.freeze({
  'contact.phone': 'phone',
  'contact.address': 'address',
  'contact.email': 'email'
})

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The brand part of a business nothing was observed for: its name only, unofficial, no colour, no logo. */
const neutralBrand = (name) => ({
  website: null,
  social: { origin: 'social', official: false, colors: [], fonts: [], evidence: [], name }
})

/**
 * The owner edits (`profileEdits`, `hoursPick`) the read facts give, on top of the ones kept: one value per kind,
 * the one the reading marked primary, else the first. A value the Profile card would refuse is left out.
 * @param {object} candidate the opportunity's candidate
 * @param {Array<{kind: string, value: string, primary?: boolean}>} facts
 * @param {string} at
 */
function ownerEditsOf(candidate, facts, at) {
  const pick = (kind) => {
    const of = facts.filter((f) => f?.kind === kind && isText(f.value))
    return (of.find((f) => f.primary) ?? of[0])?.value ?? null
  }
  const sent = {}
  for (const [kind, field] of Object.entries(EDIT_OF_KIND)) {
    const value = pick(kind)
    if (value && [...value].length <= EDITABLE_PROFILE_FIELDS[field]) sent[field] = value
  }
  const read = Object.keys(sent).length ? readProfileEdits({ edits: sent }) : { edits: {} }
  const edits = { ...candidate?.profileEdits }
  for (const [field, value] of Object.entries(read.edits ?? {})) edits[field] = { value, at }
  const hours = pick('contact.hours')
  return {
    ...(Object.keys(edits).length ? { profileEdits: edits } : {}),
    // The card's own "Edit hours" choice, one line per group of days as the answer reading writes them: a line it
    // cannot read is never shown (`hoursPickOf`).
    ...(hours
      ? {
          hoursPick: {
            choice: 'edit',
            hours: hours
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean),
            at
          }
        }
      : {})
  }
}

/**
 * Save (or find again) the owner's business and write what the owner said, then make its content brief.
 * @param {object} h `pool`, `now`, `insertOpportunity`, `opportunityOf`, `makeBrief`
 * @param {{accountId: string, opportunityId?: string | null, name: string, own: object, statements: string[],
 *   reading?: object | null, facts?: object[], trade?: string | null}} input `own`: the `ownSite` marker, with the
 *   draft it was told in (`buildDraft`); `opportunityId`: the business an earlier research of the draft saved
 * @returns {Promise<{opportunityId: string, revision?: object, error?: string}>}
 */
export async function ownerBrief(h, input) {
  const { pool } = h
  const { accountId, name, own, statements, reading = null, facts = [], trade = null } = input
  const at = new Date(h.now()).toISOString()
  const held = input.opportunityId
    ? await h.opportunityOf(pool, accountId, input.opportunityId).catch(() => null)
    : null
  const opp =
    held?.provider === OWNER_PROVIDER
      ? held
      : (
          await h.insertOpportunity(pool, accountId, {
            name,
            branch: null,
            provider: OWNER_PROVIDER,
            providerId: `build-draft:${own.buildDraft ?? own.requestId ?? randomUUID()}`,
            candidate: { name, ownSite: own }
          })
        ).row
  const candidate = {
    typedName: name,
    ownSite: { ...opp.candidate?.ownSite, ...own },
    ...(isText(trade) && trade !== 'other' ? { trade } : {}),
    ...ownerEditsOf(opp.candidate, facts, at)
  }
  await pool.query(
    `update wo_opportunity set name = $3, candidate = candidate || $4::jsonb, updated_at = now()
     where id = $1 and account_id = $2`,
    [opp.id, accountId, name, JSON.stringify(candidate)]
  )
  await pool.query(
    `insert into wo_source (opportunity_id, source, ref, status, coverage, collected, updated_at)
     values ($1, $2, null, 'complete', $3::jsonb, $4::jsonb, now())
     on conflict (opportunity_id, source) do update set status = 'complete', reason = null,
       coverage = excluded.coverage, collected = excluded.collected, updated_at = now()`,
    [opp.id, OWNER_SOURCE, JSON.stringify({ fetched: statements.length }), JSON.stringify({ statements })]
  )
  await saveProfile(pool, opp.id, {
    profile: { name, ...(reading ? { businessReading: reading } : {}) },
    brand: neutralBrand(name)
  })
  const made = await h.makeBrief({ accountId, opportunityId: opp.id })
  return {
    opportunityId: opp.id,
    ...(made?.revision ? { revision: made.revision } : { error: made?.error ?? 'BRIEF_FAILED' })
  }
}
