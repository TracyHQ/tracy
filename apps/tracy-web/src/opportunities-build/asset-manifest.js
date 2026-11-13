/**
 * The asset manifest stored beside a site brief (`wo_revision.asset_manifest`): one entry per picture the brief read,
 * naming it by id AND sha256 with its `origin` (`place` -> `wo_place_media`, `opportunity` -> `wo_media`, `draft` ->
 * `build_draft_picture`) and the address it was collected from. Pure. Made from a brief read's media (`brief-research.js` `fromPlace` /
 * `fromOpportunity`) by a website opportunity's revision (`revisions.js`) and by the build chat's research before a
 * site exists (`build-draft-gather-wiring.js`), so both store the same shape.
 * @param {Array<{id: string, origin?: string, kind: string, category: string, sha256: string, mime: string | null,
 *   width: number | null, height: number | null, source: string, sourceUrl: string, postId?: string | null,
 *   credit?: object | null}>} media
 */
export function assetManifestOf(media) {
  return media.map(
    ({ id, origin, kind, category, sha256, mime, width, height, source, sourceUrl, postId, credit }) => ({
      id,
      ...(origin ? { origin } : {}),
      kind,
      category,
      sha256,
      mime,
      width,
      height,
      source,
      sourceUrl,
      postId: postId ?? null,
      credit: credit ?? null
    })
  )
}
