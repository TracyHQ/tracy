/**
 * The label view of one brief revision (`/ops/wo` › Briefs, #51, spec #38): every photo of the brief with where it came
 * from, what a model or the owner's own words say it shows, the offering or person it is linked to (with the evidence),
 * its role and boxes, plus the people the brief names with their portraits and the revision's readiness verdict.
 *
 * 🔒 A PURE SHAPER OVER WHAT THE REVISION ALREADY HOLDS. It reads `brief.assets`, `brief.reading` and `brief.readiness`
 * (written by research and `createRevision`) and never measures anything itself: a second opinion computed here could
 * disagree with the one a build acts on. A revision made before readiness existed answers `readiness: null`.
 * 🔒 UNLABELLED IS NOT GENERAL. A photo whose link evidence is `none` (or absent) is shown as unlabelled; only a photo a
 * model or words looked at can be "general".
 */
import { closedListOf, GENERAL } from 'website-opportunities/domain/pictures/picture-links.mjs'

const list = (v) => (Array.isArray(v) ? v : [])
const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null)
const box = (b) => (Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(n)) ? b : null)

/** One link (`depicts` or `portraitOf`) as `{id, label, via, quote}`; label is looked up in the closed list. */
function linkOf(link, labels) {
  if (!link?.id) return null
  return {
    id: link.id,
    label: labels.get(link.id) ?? null,
    via: text(link.evidence?.via) ?? 'none',
    quote: text(link.evidence?.quote)
  }
}

/**
 * @param {{id: string, n: number, opportunity_id?: string, created_at?: any, brief: any, asset_manifest?: any[]}} revision
 *   a `wo_revision` row
 * @param {{imageUrlOf?: (assetId: string) => string | null}} [opts] where a photo can be seen (a door of this surface)
 */
export function briefLabelsViewOf(revision, { imageUrlOf = () => null } = {}) {
  const brief = revision.brief ?? {}
  const closed = closedListOf(brief.reading)
  const labels = new Map([...closed.offerings, ...closed.people].map((i) => [i.id, i.label]))
  const manifest = new Map(list(revision.asset_manifest).map((m) => [m.id, m]))
  const logo = brief.brand?.logo ?? null

  const photos = list(brief.assets).map((a) => {
    const m = manifest.get(a.id) ?? {}
    const depicts = linkOf(a.depicts, labels)
    const looked = depicts !== null && depicts.via !== 'none'
    return {
      id: a.id,
      kind: a.kind,
      imageUrl: a.kind === 'image' ? imageUrlOf(a.id) : null,
      sourceUrl: text(m.sourceUrl),
      source: text(a.source) ?? 'unknown',
      credit: typeof a.credit === 'string' ? a.credit : null,
      uploaderRole: text(a.uploaderRole) ?? 'unknown',
      isLogo: a.id === logo,
      content: a.content ?? null,
      category: a.category ?? null,
      caption: text(a.caption),
      unlabelledReason: text(a.unlabelledReason),
      quality: a.quality ?? null,
      width: a.width ?? null,
      height: a.height ?? null,
      orientation: a.orientation ?? null,
      role: a.role ?? null,
      // `unlabelled`: nobody looked and no words linked it; `general`: looked, and it shows no listed offering.
      labelled: looked,
      general: looked && depicts.id === GENERAL,
      depicts: looked ? depicts : null,
      portraitOf: linkOf(a.portraitOf, labels),
      subjectBox: box(a.subjectBox),
      faceBoxes: list(a.faceBoxes).map(box).filter(Boolean),
      peopleCount: Number.isInteger(a.peopleCount) ? a.peopleCount : null,
      isGraphic: typeof a.isGraphic === 'boolean' ? a.isGraphic : null,
      isOwnPhoto: typeof a.isOwnPhoto === 'boolean' ? a.isOwnPhoto : null
    }
  })

  const idsDepicting = (id) => photos.filter((p) => p.depicts?.id === id).map((p) => p.id)
  const idsPortraying = (id) => photos.filter((p) => p.portraitOf?.id === id).map((p) => p.id)
  const images = photos.filter((p) => p.kind === 'image')

  return {
    revision: {
      id: revision.id,
      n: revision.n,
      opportunityId: revision.opportunity_id ?? null,
      createdAt: revision.created_at ?? null,
      business: text(brief.business?.name)
    },
    readiness: brief.readiness ?? null,
    counts: {
      photos: images.length,
      videos: photos.length - images.length,
      labelled: images.filter((p) => p.labelled).length,
      linkedToOffering: images.filter((p) => p.depicts && !p.general).length,
      general: images.filter((p) => p.general).length,
      unlabelled: images.filter((p) => !p.labelled).length
    },
    offerings: closed.offerings.map((o) => ({ ...o, photos: idsDepicting(o.id) })),
    people: closed.people.map((p) => ({ ...p, portraits: idsPortraying(p.id) })),
    photos
  }
}
