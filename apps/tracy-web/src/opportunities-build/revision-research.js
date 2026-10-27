/**
 * One source of truth for the research a revision was made from (#1791 V2, ADR 0037 amendment of 27/10/2026).
 *
 * A revision made since 27/10/2026 keeps its frozen research ONCE, in `wo_revision.research`, beside its frozen place
 * profile (`wo_revision.place_profile`). The brief holds only a reference to both (`brief.agentDemoResearch`: revision,
 * account, opportunity, freeze time, research hash, place profile hash, and a hash over all of that). The agent
 * demo's bundle is made from that research when it is read, so a cleaning rule (`evidenceData`) applies in one place
 * and the brief never carries a second copy that can drift.
 *
 * A revision made before keeps its embedded `brief.agentDemoSnapshot` and is read as it was frozen: no stored
 * revision is rewritten (the table is immutable, migration 125).
 *
 * 🔒 EVERY READER GOES THROUGH `researchOfRevision`: the agent demo (`checkedResearch`), the QA gate (`demo-qa.js`),
 * the provisional place profile and the brief engines. Data that no longer matches its hash fails with
 * `AGENT_DEMO_SNAPSHOT_CHANGED`, so a demo can always be traced to the exact data it was built from.
 */
import { createHash } from 'node:crypto'
import { canonicalJson } from 'website-opportunities/src/canonical-json.js'
import { untrackedLinksDeep } from 'website-opportunities/domain/social-links.mjs'
import { AGENT_DEMO, evidenceData, freezeAgentResearch, researchHash } from './agent-demo.js'

export const RESEARCH_REFERENCE = 'agent-demo-research-ref/1'

const fail = (code, detail = null) => Object.assign(new Error(code), { code, ...(detail ? { detail } : {}) })

/**
 * The research a revision keeps: exactly what the agent demo's bundle is made from, cleaned of credentials and
 * share tracking, in its JSON form (what jsonb gives back, so a stored copy hashes as it was frozen).
 * @param {any} read - the research read a brief is made from (`researchOf` in `revisions.js`)
 */
export function frozenResearchOf(read) {
  return JSON.parse(
    JSON.stringify(
      evidenceData({
        opportunity: read.opportunity ?? null,
        placeSnapshotId: read.placeSnapshotId ?? null,
        profile: read.profile ?? {},
        brand: read.brand ?? null,
        rawSources: read.rawSources ?? [],
        posts: read.posts ?? [],
        media: read.media ?? []
      })
    )
  )
}

/**
 * The reference a new revision's brief holds instead of a copy of its research.
 * @param {{research: object, placeProfile: {profileHash: string} | null, accountId: string, opportunityId: string,
 *   revisionId: string, at: string}} args
 */
export function researchReference({ research, placeProfile, accountId, opportunityId, revisionId, at }) {
  const data = {
    version: RESEARCH_REFERENCE,
    accountId,
    opportunityId,
    revisionId,
    at,
    researchHash: researchHash(research),
    placeProfileHash: placeProfile?.profileHash ?? null
  }
  return { ...data, hash: researchHash(data) }
}

/** The id of the revision a row stands for: a `wo_revision` row, or a build row joined to one. */
const revisionIdOf = (revision) => revision?.revision_id ?? revision?.id

/** The frozen place profile, when its profile still hashes to the hash it was frozen under. */
function intactPlaceProfile(frozen) {
  if (!frozen?.profile || typeof frozen.profile !== 'object') return null
  const hash = createHash('sha256').update(canonicalJson(frozen.profile)).digest('hex')
  return hash === frozen.profileHash ? frozen : null
}

/**
 * The research a revision was made from, checked against what it froze.
 *
 * @param {{id?: string, revision_id?: string, account_id?: string, brief?: any, research?: any,
 *   place_profile?: any} | null} revision - a `wo_revision` row, or a build row joined to one; a row of a new
 *   revision must select `research` and `place_profile`
 * @param {{optional?: boolean, checkEmbedded?: boolean}} [options] - `optional`: a brief that froze no research
 *   answers null instead of failing with `AGENT_DEMO_SNAPSHOT_MISSING`; `checkEmbedded: false`: an older brief's
 *   embedded copy is read as stored, unchecked, for the readers that never checked it (the provisional place profile,
 *   the quickstart sources); a reference is always checked
 * @returns {{research: any, placeProfile: any | null, reference: any | null} | null} `research`: the agent demo's
 *   bundle (`freezeAgentResearch` shape, `hash` = the reference's hash for a new revision); `placeProfile`: the frozen
 *   place profile and its assessment, verified against its hash; `reference`: null for a revision made before 27/10
 * @throws `AGENT_DEMO_SNAPSHOT_MISSING` (nothing frozen, or the row was read without its research) or
 *   `AGENT_DEMO_SNAPSHOT_CHANGED` (the reference, the research or the place profile no longer match)
 */
export function researchOfRevision(revision, { optional = false, checkEmbedded = true } = {}) {
  const ref = revision?.brief?.agentDemoResearch
  if (ref) return referenced(revision, ref)
  const bundle = revision?.brief?.agentDemoSnapshot
  if (!bundle) {
    if (optional) return null
    throw fail('AGENT_DEMO_SNAPSHOT_MISSING')
  }
  // Before 27/10/2026: the copy embedded in the brief, read as it was frozen.
  if (!checkEmbedded)
    return { research: bundle, placeProfile: intactPlaceProfile(revision.place_profile), reference: null }
  if (bundle.version !== AGENT_DEMO) throw fail('AGENT_DEMO_SNAPSHOT_MISSING')
  const { hash, ...data } = bundle
  if (
    hash !== researchHash(data) ||
    bundle.revisionId !== revisionIdOf(revision) ||
    bundle.accountId !== revision.account_id
  )
    throw fail('AGENT_DEMO_SNAPSHOT_CHANGED')
  // A snapshot frozen before links were cleaned still reads clean; its hash stays the one it was frozen under.
  return {
    research: untrackedLinksDeep(bundle),
    placeProfile: intactPlaceProfile(revision.place_profile),
    reference: null
  }
}

function referenced(revision, ref) {
  if (ref.version !== RESEARCH_REFERENCE)
    throw fail('AGENT_DEMO_SNAPSHOT_MISSING', 'unknown reference version')
  const { hash, ...data } = ref
  if (
    hash !== researchHash(data) ||
    ref.revisionId !== revisionIdOf(revision) ||
    ref.accountId !== revision.account_id
  )
    throw fail('AGENT_DEMO_SNAPSHOT_CHANGED', 'reference')
  // A row read without its research column cannot be checked: never read it as "no research".
  if (!revision.research || typeof revision.research !== 'object')
    throw fail('AGENT_DEMO_SNAPSHOT_MISSING', 'research not loaded with the revision')
  if (researchHash(revision.research) !== ref.researchHash)
    throw fail('AGENT_DEMO_SNAPSHOT_CHANGED', 'research')
  let placeProfile = null
  if (ref.placeProfileHash) {
    placeProfile = intactPlaceProfile(revision.place_profile)
    if (!placeProfile || placeProfile.profileHash !== ref.placeProfileHash)
      throw fail('AGENT_DEMO_SNAPSHOT_CHANGED', 'place profile')
  }
  const bundle = freezeAgentResearch({
    read: revision.research,
    accountId: ref.accountId,
    opportunityId: ref.opportunityId,
    revisionId: ref.revisionId,
    at: ref.at
  })
  return { research: { ...bundle, hash: ref.hash }, placeProfile, reference: ref }
}

/**
 * The brief as the brief renderer reads it: a new revision's brief with its referenced research beside it, in memory
 * only, so the markdown still names what that research holds (social figures, `brief.mjs`). A brief that froze no
 * research, or whose research cannot be read, renders as stored.
 * @param {any} revision
 */
export function briefWithResearch(revision) {
  const brief = revision?.brief
  if (!brief?.agentDemoResearch) return brief
  try {
    return { ...brief, agentDemoSnapshot: researchOfRevision(revision).research }
  } catch {
    return brief
  }
}
