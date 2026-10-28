// The pictures a brief carries: one copy of each photograph, and the ones fit to open the site.
//
// 🔒 NEAR_COPY_BITS IS MEASURED, NOT GUESSED (#1780, 26/10/2026). On 23 photos of Harbour Sport Club, the Instagram copies
// of three Google photos are 3, 6 and 12 bits apart (the 12 is a cropped copy). On 267 website images of another
// business, the different photographs closest to each other are 15 bits apart. 13 sits between the two. Fixture:
// `test/fixtures/pictures/near-copies.json`.
//
// 🔒 A GRAPHIC IS A COPY ONLY BYTE FOR BYTE. A fingerprint of flat colour says little: two letter avatars of different
// people are 2 to 12 bits apart. So a picture whose measured numbers say graphic (`looksGraphic`) is never matched by
// fingerprint, only by its sha256.
import { hammingDistance, looksGraphic } from './picture-labels.mjs'
import { assetLabelsOf, heroScore, NOT_A_HERO } from './asset-labels.mjs'

export const NEAR_COPY_BITS = 13
const HERO_CANDIDATES = 3

const area = (m) => (Number(m.width) || 0) * (Number(m.height) || 0)
const graphic = (m) => looksGraphic(m.labels?.features)

function sameShot(a, b) {
  if (a.sha256 && a.sha256 === b.sha256) return true
  if (graphic(a) || graphic(b)) return false
  return (hammingDistance(a.dhash, b.dhash) ?? 99) <= NEAR_COPY_BITS
}

/**
 * The pictures with one copy of each: of near-copies the sharper (more pixels, then more bytes) is kept, in its place
 * in the list. Pictures in `keep` (the logos) are never set aside nor stand for another; one without a fingerprint is
 * always kept. Nothing is deleted from the store: a copy only stays out of what the caller hands on.
 * @template {{id: string, kind?: string, width?: number|null, height?: number|null, bytes?: number|null, sha256?: string|null,
 *   dhash?: string|null, labels?: any}} M
 * @param {M[]} media
 * @param {{keep?: Set<string>}} [opts]
 * @returns {M[]}
 */
export function withoutNearCopies(media, { keep = new Set() } = {}) {
  const sharper = media
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.kind !== 'video' && !keep.has(m.id) && (m.dhash || m.sha256))
    .sort((a, b) => area(b.m) - area(a.m) || (Number(b.m.bytes) || 0) - (Number(a.m.bytes) || 0) || a.i - b.i)
  const kept = []
  const dropped = new Set()
  for (const { m } of sharper) {
    if (kept.some((k) => sameShot(k, m))) dropped.add(m.id)
    else kept.push(m)
  }
  return media.filter((m) => !dropped.has(m.id))
}

/**
 * A social network's profile picture, by the path its CDN serves it under: Instagram's `t51.<n>-19/`, Facebook's
 * `t39.30808-1/`. A post's photo is `-15/` and a cover photo `-6/`, so neither is caught.
 */
const PROFILE_PICTURE = /\/t51\.\d+-19\/|\/t39\.30808-1\//

/** The ids the brand names as a logo: the chosen one, and every candidate not read as something else. */
function logoIdsOf(brand) {
  const r = brand?.logoResearch
  return new Set(
    [
      brand?.logo,
      r?.chosen?.mediaId,
      ...(r?.candidates ?? [])
        .filter((c) => c?.via === 'social-profile' || c?.reading?.isLogo !== false)
        .map((c) => c?.mediaId)
    ].filter(Boolean)
  )
}

/**
 * The photographs among a brief's pictures (pure): every image that is neither a logo the brand names nor a social
 * network's profile picture, in its place in the list. The one selector every photo slot of a brief reads (hero,
 * gallery, highlights, story, dish photos): a logo is shown as the logo, never as a photo.
 * @template {{id: string, kind?: string, sourceUrl?: string | null}} M
 * @param {M[]} media
 * @param {Parameters<typeof heroCandidates>[1]} brand
 * @returns {M[]}
 */
export function photographsOnly(media, brand) {
  const logos = logoIdsOf(brand)
  return media.filter(
    (m) =>
      m.kind === 'image' &&
      !logos.has(m.id) &&
      !PROFILE_PICTURE.test(String(m.sourceUrl ?? '')) &&
      // A picture a vision model saw as a logo is one too, whatever the logo research chose (F08).
      assetLabelsOf(m).content !== 'logo'
  )
}

/**
 * Up to three pictures to open the site with, best first: images of known size that are neither a logo, a profile
 * picture nor a graphic of words. Best = the most of landscape, a high resolution grade and people at work or the venue
 * (`heroScore`, F08), then the most pixels. Portrait is allowed (a business's Google photos may all be portrait); the
 * build step's picture planner makes the pick and the crop. Empty when nothing qualifies: a hero never falls back to the
 * logo.
 * @param {{id: string, kind: string, width?: number|null, height?: number|null, source?: string, sourceUrl?: string|null}[]} media
 *   a brief's media
 * @param {{logo?: string, logoResearch?: {chosen?: {mediaId?: string}|null, candidates?: {mediaId?: string, via?: string,
 *   reading?: {isLogo?: boolean}|null}[]}}|null} brand the brief's brand (`briefBrand`)
 * @returns {{id: string, width: number, height: number, source: string|null}[]}
 */
export function heroCandidates(media, brand) {
  return (
    photographsOnly(media, brand)
      .map((m, i) => ({ m, i, labels: assetLabelsOf(m) }))
      // A picture a vision model calls a graphic (a banner, a flyer) never opens a site, whatever it shows (#48).
      .filter(
        ({ m, labels }) =>
          area(m) > 0 &&
          !NOT_A_HERO.has(labels.content) &&
          (m.vision ?? m.labels?.vision?.labels)?.isGraphic !== true
      )
      .sort((a, b) => heroScore(b.labels) - heroScore(a.labels) || area(b.m) - area(a.m) || a.i - b.i)
      .slice(0, HERO_CANDIDATES)
      .map(({ m }) => ({
        id: m.id,
        width: Number(m.width),
        height: Number(m.height),
        source: m.source ?? null
      }))
  )
}
