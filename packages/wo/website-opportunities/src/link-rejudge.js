/**
 * Re-judging a place's sources with today's link rules (`sources.js sourceOfUrl`, `domain/link-kinds.mjs`). A place
 * researched before a rule changed can hold a URL under the wrong kind: on dev (26/10/2026, opportunity 9c3d4e5f) a
 * magicpin listing page was the place's Website, so it was crawled, scored for page speed, and the social pages it
 * links to (magicpin's own Facebook and Instagram) became the place's. Each run re-judges first: a source whose URL is
 * now another kind stops being that source, and so does every link it brought (a link the website named, kept with
 * `verified_by = 'website'` and `evidence.page`), with their snapshot rows and photos.
 */
import { SOURCES, normalizeUrl, sourceOfUrl } from './sources.js'

const norm = (url) => {
  try {
    return normalizeUrl(url)
  } catch {
    return null
  }
}

/** Whether `url` held as the `kind` source is that kind under today's rules. */
export const judgedAs = (kind, url) => !SOURCES.includes(kind) || sourceOfUrl(url) === kind

/**
 * What no longer stands (pure): the links of the place that are misjudged or were brought by a misjudged website,
 * and the snapshot sources (`SOURCES` rows) whose ref is one of those or is itself misjudged.
 * @param {{kind: string, url: string, verified_by?: string, evidence?: any}[]} links
 * @param {{source: string, ref: string | null}[]} sources
 * @returns {{links: {kind: string, url: string}[], sources: {source: string, ref: string}[]}}
 */
export function misjudged(links, sources) {
  const wrong = links.filter((l) => !judgedAs(l.kind, l.url))
  const wrongPages = new Set(wrong.filter((l) => l.kind === 'website').map((l) => norm(l.url)))
  // Sources a misjudged website brought, the snapshot's own website row included when the link is gone already.
  for (const s of sources)
    if (s.source === 'website' && s.ref && !judgedAs('website', s.ref)) wrongPages.add(norm(s.ref))
  const brought = links.filter(
    (l) =>
      !wrong.includes(l) &&
      l.verified_by === 'website' &&
      typeof l.evidence?.page === 'string' &&
      wrongPages.has(norm(l.evidence.page))
  )
  const dropped = [...wrong, ...brought]
  const droppedRefs = new Set(dropped.map((l) => `${l.kind}\n${norm(l.url)}`))
  return {
    links: dropped.map((l) => ({ kind: l.kind, url: l.url })),
    sources: sources
      .filter(
        (s) =>
          SOURCES.includes(s.source) &&
          s.ref &&
          (!judgedAs(s.source, s.ref) || droppedRefs.has(`${s.source}\n${norm(s.ref)}`))
      )
      .map((s) => ({ source: s.source, ref: s.ref }))
  }
}

/** The host itself or one of its subdomains: `notmagicpin.in` is not `magicpin.in`. */
const sameSite = (h, host) => h === host || Boolean(h?.endsWith(`.${host}`))
const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Drop what `misjudged` names from the place and from its working (unpublished) snapshot: the links, the snapshot
 * rows, and the photos those sources gave. A photo is that source's when the kind has no other source left, or (a kind
 * kept with another ref) when it was found on the dropped page's own host.
 * @returns {Promise<{links: {kind: string, url: string}[], sources: {source: string, ref: string}[]}>} what was dropped
 */
export async function dropMisjudged(db, placeId, snapshotId) {
  const links = (
    await db.query('select kind, url, verified_by, evidence from wo_place_link where place_id = $1', [
      placeId
    ])
  ).rows
  const sources = (
    await db.query('select source, ref from wo_place_snapshot_source where snapshot_id = $1', [snapshotId])
  ).rows
  const out = misjudged(links, sources)
  for (const l of out.links)
    await db.query('delete from wo_place_link where place_id = $1 and kind = $2 and url = $3', [
      placeId,
      l.kind,
      l.url
    ])
  for (const s of out.sources) {
    await db.query('delete from wo_place_snapshot_source where snapshot_id = $1 and source = $2', [
      snapshotId,
      s.source
    ])
    // `ensureSource` names the kind again from a link that still stands (another ref of the same kind).
    const kept = links.some(
      (l) =>
        l.kind === s.source &&
        !out.links.some((d) => d.kind === l.kind && d.url === l.url) &&
        judgedAs(l.kind, l.url)
    )
    const host = hostOf(s.ref)
    const media = (
      await db.query(
        `select m.id, m.source_url from wo_place_snapshot_media sm join wo_place_media m on m.id = sm.media_id
          where sm.snapshot_id = $1 and m.source = $2`,
        [snapshotId, s.source]
      )
    ).rows.filter((m) => !kept || (host && sameSite(hostOf(m.source_url), host)))
    for (const m of media)
      await db.query('delete from wo_place_snapshot_media where snapshot_id = $1 and media_id = $2', [
        snapshotId,
        m.id
      ])
  }
  return out
}
