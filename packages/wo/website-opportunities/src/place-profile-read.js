import { withProfileEdits } from './profile-edits.js'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { placeViewOf } from './place-view.js'
import { socialStatsOfRead } from './place-social-stats.js'
import { currentSnapshotOf, snapshotMediaOf, snapshotProfileOf } from './places.js'
import { approvedSocialStatsOf } from './approved-research.js'

/** Read the full research, including failed/pending collectors, without the brief's content limits. */
export async function readPlaceProfile(db, ids = {}) {
  return (await readPlaceProfileWithInputs(db, ids))?.profile ?? null
}

/**
 * The place profile with what it was made from (`{profile, research, media}`): the research profile (the reading's team
 * and the reviews) and the stored media rows, which the saved profile keys the owner's choices on (`saved-profile.mjs`).
 * Null when the opportunity or place does not exist.
 */
export async function readPlaceProfileWithInputs(db, { opportunityId, placeId } = {}) {
  if (Boolean(opportunityId) === Boolean(placeId))
    throw new Error('Provide exactly one of opportunityId or placeId')
  let opportunity
  let place
  let snapshot
  let profile = {}
  let brand = {}
  let sources = []
  let media = []
  // An approved card's pin (`approved-research.js`): its place's external id and social measurements as they were then.
  let approved = null
  let frozenStats = null
  if (opportunityId) {
    opportunity = (await db.query('select * from wo_opportunity where id = $1', [opportunityId])).rows[0]
    if (!opportunity) return null
    placeId = opportunity.place_id
    const view = placeId ? await placeViewOf(db, opportunity) : null
    if (view) {
      snapshot = view.snapshot
      const held = await snapshotProfileOf(db, snapshot.id)
      approved = view.approved ?? null
      frozenStats = await approvedSocialStatsOf(db, view, held)
      profile = { ...held?.profile, ...view.profile }
      brand = view.brand
      // Keep collectors absent from the display list, too (search seeds and future collectors).
      sources = [...snapshot.sources, ...view.shown.filter((row) => !row.shared)]
      for (const row of view.sources) {
        const index = sources.findIndex((s) => s.source === row.source && s.ref === row.ref)
        if (index < 0) sources.push(row)
        else sources[index] = { ...sources[index], collected: row.collected }
      }
      media = view.media
    } else {
      const held = (
        await db.query('select profile, brand from wo_profile where opportunity_id = $1', [opportunityId])
      ).rows[0]
      profile = withProfileEdits(held?.profile ?? {}, opportunity)
      brand = held?.brand ?? {}
      sources = (
        await db.query('select * from wo_source where opportunity_id = $1 order by source, ref', [
          opportunityId
        ])
      ).rows
      media = (
        await db.query('select * from wo_media where opportunity_id = $1 order by collected_at, id', [
          opportunityId
        ])
      ).rows
    }
  } else {
    place = (await db.query('select * from wo_place where id = $1', [placeId])).rows[0]
    if (!place) return null
    snapshot = await currentSnapshotOf(db, placeId)
    if (snapshot) {
      const held = await snapshotProfileOf(db, snapshot.id)
      profile = held?.profile ?? {}
      brand = held?.brand ?? {}
      sources = snapshot.sources
      media = await snapshotMediaOf(db, snapshot.id)
    }
  }
  const external = approved
    ? approved.identity
    : placeId
      ? (
          await db.query(
            `select namespace, external_id from wo_place_identity where place_id = $1 and namespace <> 'merge'
     order by case namespace when 'google' then 0 when 'osm' then 1 when 'url' then 2 else 3 end, external_id limit 1`,
            [placeId]
          )
        ).rows[0]
      : null
  const identity = {
    ...(opportunity ?? { id: placeId, name: place?.display_name }),
    ...(external ? { namespace: external.namespace, externalId: external.external_id } : {})
  }
  const posts = sources
    .filter((s) => ['complete', 'partial'].includes(s.status) || s.collected_at)
    .flatMap((s) => (s.collected?.posts ?? []).map((p) => ({ source: s.source, ...p })))
  const stored = media.filter((m) => !m.revoked_at && m.status === 'stored')
  return {
    profile: placeProfileFromResearch({
      identity,
      snapshot,
      profile,
      brand,
      sources,
      media: stored,
      posts,
      socialStats: await socialStatsOfRead(db, { profile, sources }, undefined, { frozen: frozenStats })
    }),
    research: profile,
    media: stored
  }
}
