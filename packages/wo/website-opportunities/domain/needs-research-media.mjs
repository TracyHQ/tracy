// The pictures and videos of the needs profile research (#597, `needs-research.mjs`): only the business's own media the
// brief KEPT for the site, read the way the brief reads its usable photos (`brief.mjs`: not a stale event photo, a
// photograph only, so never the logo or a profile picture, `photographsOnly`). Own = an owner upload or a picture of the
// business's own channels (`uploaderRoleOf`, `asset-origin.mjs`); a map photo by someone else (`isMapPhotoByOthers`) and
// a guest's photo are set aside. The address of each comes from the asset manifest stored beside the brief.
// The needs profile reads no video: own videos come back apart (`videos`), in the record the pictures step takes as
// its extra own pictures (`picturesStep({pictures})`). Every asset lands in exactly one of pictures, videos, setAside.
import { isMapPhotoByOthers, uploaderRoleOf } from './pictures/asset-origin.mjs'
import { photographsOnly } from './pictures/brief-media.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The ids of the stale event photos the brief lists (`stale[].field` `media:<id>`). */
const staleIdsOf = (brief) =>
  new Set(
    list(brief?.stale)
      .map((s) => (typeof s?.field === 'string' && s.field.startsWith('media:') ? s.field.slice(6) : null))
      .filter(Boolean)
  )

/** Photos the brief shows only with a team member (its team section), never in another section. */
function teamOnlyIdsOf(brief) {
  const team = new Set()
  const other = new Set()
  for (const page of list(brief?.sitemap))
    for (const section of list(page?.sections))
      for (const id of list(section?.assetIds)) (section.kind === 'team' ? team : other).add(id)
  return new Set([...team].filter((id) => !other.has(id)))
}

const isOwn = (asset) =>
  asset.uploaderRole === 'owner' ||
  (asset.uploaderRole !== 'customer' && uploaderRoleOf({ source: asset.source }) === 'owner')

/**
 * The own media of a brief, split for the research.
 * @param {object} brief the stored research brief
 * @param {Array<{id: string, sourceUrl?: string}>} manifest the stored asset manifest
 * @param {(sourceName: string) => object | null} sourceOf the research source of a platform, or null outside the
 *   trust order
 * @returns {{videos: object[], setAside: object[]}} the pictures are added to their sources
 */
export function mediaOf(brief, manifest, sourceOf) {
  const addresses = new Map(list(manifest).map((m) => [m?.id, m?.sourceUrl]))
  const stale = staleIdsOf(brief)
  const teamOnly = teamOnlyIdsOf(brief)
  const assets = list(brief?.assets).map((a) => ({ ...a, sourceUrl: addresses.get(a?.id) }))
  const photographs = new Set(
    photographsOnly(
      assets.filter((a) => a.kind === 'image' && a.content !== 'logo'),
      brief?.brand
    ).map((a) => a.id)
  )
  const videos = []
  const setAside = []
  const aside = (asset, reason) => setAside.push({ what: 'picture', id: asset?.id, reason })
  for (const asset of assets) {
    const source = sourceOf(asset.source)
    if (asset.kind !== 'image' && asset.kind !== 'video')
      aside(asset, `a ${asset.kind} asset, not a photo or a video`)
    else if (stale.has(asset.id)) aside(asset, 'a past event photo the brief keeps off the site')
    else if (asset.kind === 'image' && !photographs.has(asset.id))
      aside(asset, 'the logo or a profile picture')
    else if (teamOnly.has(asset.id)) aside(asset, 'a team member photo, shown with that person only')
    else if (isMapPhotoByOthers(asset)) aside(asset, 'a map photo posted by someone else')
    else if (!isOwn(asset)) aside(asset, 'not the business own photo')
    else if (!isText(asset.sourceUrl)) aside(asset, 'no address in the asset manifest')
    else if (!source) aside(asset, 'from a source outside the trust order')
    else if (asset.kind === 'video')
      videos.push({
        id: asset.id,
        ref: asset.sourceUrl,
        media: 'video',
        item: null,
        itemKind: 'video',
        label: isText(asset.caption) ? asset.caption : null,
        width: asset.width ?? null,
        height: asset.height ?? null,
        stock: false,
        from: [source.id]
      })
    else
      source.pictures.push({
        id: asset.id,
        ref: asset.sourceUrl,
        ...(isText(asset.caption) ? { label: asset.caption } : {})
      })
  }
  return { videos, setAside }
}
