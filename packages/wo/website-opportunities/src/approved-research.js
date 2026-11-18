/**
 * An approved card keeps the research it was approved with (#537 R23). The cards of one place share its research: each
 * place research publishes a new `wo_place_snapshot` and moves `wo_place.current_snapshot_id`, and a one-part retry that
 * finds the same data carries its tries (collected_at, coverage, last_error) onto the current snapshot's source rows.
 * So once a card's Business facts are approved, what it reads of the shared place is pinned on the card
 * (`wo_opportunity_approved_research`, schema `0015`): the snapshot it read then, that snapshot's source rows as they
 * read then, the place's Google ids and external id then, and the social stats cache's measurements then. Every reader
 * of the card (Details, the place profile, the Content brief, the build) goes through `place-view.js`, which reads the
 * pin instead of the current snapshot. Other cards of the place research as before.
 *
 * What still applies to a pinned card: a picture withdrawn from the place (`wo_place_media.revoked_at`) and a hub copy
 * revoked by its hub, which are takedowns of the data itself, not research.
 */
import { currentSnapshotOf } from './places.js'
import { socialStatsByKey } from './place-social-stats.js'

const TIMES = ['collected_at', 'attempted_at']
const at = (v) => (v ? new Date(v).getTime() : null)

/** A source row kept as JSON, with its times read back as dates, as the table gives them. */
const sourceRowOf = (row) => {
  const out = { ...row }
  for (const k of TIMES) if (out[k]) out[k] = new Date(out[k])
  return out
}

/** Whether the card's Business facts are approved now (`approval.js`), on a place: its research is pinned. */
export const pinnedCard = (opportunity) => Boolean(opportunity?.profile_approved_at && opportunity?.place_id)

/**
 * The research an approved card reads: `{snapshot, googleIds, approved}` (`snapshot` with its kept `sources`), pinned on
 * the first read after the approval (the approve door pins it at once). Null for a card not approved, or whose place has
 * no published snapshot (it reads its own rows, `place-view.js`).
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {object} opportunity - a `wo_opportunity` row
 */
export async function approvedResearchOf(db, opportunity) {
  if (!pinnedCard(opportunity)) return null
  let row = (
    await db.query('select * from wo_opportunity_approved_research where opportunity_id = $1', [
      opportunity.id
    ])
  ).rows[0]
  if (!row || at(row.approved_at) !== at(opportunity.profile_approved_at))
    row = await pinApprovedResearch(db, opportunity)
  if (!row) return null
  const snapshot = (await db.query('select * from wo_place_snapshot where id = $1', [row.snapshot_id]))
    .rows[0]
  if (!snapshot) return null
  return {
    snapshot: { ...snapshot, sources: (row.sources ?? []).map(sourceRowOf) },
    googleIds: new Set(row.google_ids ?? []),
    approved: row
  }
}

/**
 * Pin what the card reads of its place now, for its approval (`profile_approved_at`). A pin of the same approval kept
 * by a concurrent read wins. Null when the place has no published snapshot.
 */
export async function pinApprovedResearch(db, opportunity) {
  if (!pinnedCard(opportunity)) return null
  const snapshot = await currentSnapshotOf(db, opportunity.place_id)
  if (!snapshot) return null
  const googleIds = (
    await db.query(
      "select external_id from wo_place_identity where place_id = $1 and namespace = 'google' order by external_id",
      [opportunity.place_id]
    )
  ).rows.map((r) => r.external_id)
  // The same pick as `place-profile-read.js` makes of a place's external id.
  const identity =
    (
      await db.query(
        `select namespace, external_id from wo_place_identity where place_id = $1 and namespace <> 'merge'
         order by case namespace when 'google' then 0 when 'osm' then 1 when 'url' then 2 else 3 end, external_id limit 1`,
        [opportunity.place_id]
      )
    ).rows[0] ?? null
  const { rows } = await db.query(
    `insert into wo_opportunity_approved_research (opportunity_id, approved_at, snapshot_id, sources, google_ids, identity)
     values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
     on conflict (opportunity_id) do update set approved_at = excluded.approved_at, snapshot_id = excluded.snapshot_id,
       sources = excluded.sources, google_ids = excluded.google_ids, identity = excluded.identity, social_stats = null,
       created_at = now()
     where wo_opportunity_approved_research.approved_at is distinct from excluded.approved_at
     returning *`,
    [
      opportunity.id,
      opportunity.profile_approved_at,
      snapshot.id,
      JSON.stringify(snapshot.sources),
      JSON.stringify(googleIds),
      identity ? JSON.stringify(identity) : null
    ]
  )
  return (
    rows[0] ??
    (
      await db.query('select * from wo_opportunity_approved_research where opportunity_id = $1', [
        opportunity.id
      ])
    ).rows[0]
  )
}

/**
 * The social stats measurements a pinned card reads (`place-social-stats.js socialStatsOfRead`'s `frozen`), kept on the
 * first read: every profile its place profile read and its brief read name. Null for a card that is not pinned.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {{approved?: object, profile: object, sources: object[], shown: object[], snapshot: object} | null} view
 * @param {object | null} held - the pinned snapshot's `{profile}` (`places.js snapshotProfileOf`)
 */
export async function approvedSocialStatsOf(db, view, held) {
  const approved = view?.approved
  if (!approved) return null
  if (approved.social_stats) return approved.social_stats
  // The two reads that look the measurements up: the place profile's (`place-profile-read.js`) and the brief's
  // (`brief-research.js fromPlace`).
  const byKey = await socialStatsByKey(db, [
    {
      profile: { ...held?.profile, ...view.profile },
      sources: [...view.snapshot.sources, ...view.shown, ...view.sources]
    },
    { profile: view.profile, sources: view.sources }
  ])
  // A concurrent first read that kept its measurements first wins: both read the kept row.
  const kept = (
    await db.query(
      `update wo_opportunity_approved_research
          set social_stats = coalesce(social_stats, $3::jsonb)
        where opportunity_id = $1 and snapshot_id = $2
        returning social_stats`,
      [approved.opportunity_id, approved.snapshot_id, JSON.stringify(byKey)]
    )
  ).rows[0]?.social_stats
  approved.social_stats = kept ?? byKey
  return approved.social_stats
}
