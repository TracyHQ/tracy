/** A failed/capped drawing tries owner photos before a neutral fill. Owner eligibility and face-safe crops stay shared. */
import { planFill, pagesOfMap, shownWidthOf } from 'website-opportunities/domain/fill-plan.mjs'
import { fitAspectOf } from 'website-opportunities/domain/fill-draw.mjs'
import { cutForPlace } from '../../lib/picture-cut.js'
import { pictureDeadline } from './picture-deadline.js'
import { judgePhoto, slotClassOf } from '../../lib/photo-sharpness.js'
import { correctedCut } from './sharpness-gate.js'

const OWNER_READ_MS = 1000

const PHOTO_ROLES = new Set([
  'business.hero_image',
  'business.gallery_image',
  'editorial.illustration',
  'offering.image',
  'article.image'
])
const REUSABLE_BACKGROUNDS = new Set(['business.hero_image', 'editorial.illustration'])

/** Deterministic, sequential selection so parallel cuts cannot spend the same unused photo twice. */
export async function drawingFallbacks({ plan, byGroup, drawn, real, contentMap, demo, cardNames }) {
  const slotOf = new Map(contentMap.slots.map((s) => [s.key, s]))
  const readable = new Map(real.pictures.map((p) => [p.id, p]))
  const assets = (real.brief?.assets ?? [])
    .filter((a) => readable.has(a.id) && a.id !== real.brief?.brand?.logo)
    .map((a) => ({ ...a, width: readable.get(a.id).width, height: readable.get(a.id).height }))
  const pagesOf = pagesOfMap(contentMap)
  // A drawing failure does not waive an owner-photo quality refusal already measured for this slot.
  const unsharp = new Map(
    Object.entries(plan.sharpness?.slots ?? {}).map(([key, verdict]) => [
      key,
      new Set((verdict.refused ?? []).map((r) => r.mediaId))
    ])
  )
  const used = new Set(plan.placements.map((p) => p.mediaId))
  const shown = new Map()
  const bytesOf = new Map()
  const read = (id) => {
    if (!bytesOf.has(id))
      bytesOf.set(
        id,
        pictureDeadline(() => real.bytes(id), AbortSignal.timeout(OWNER_READ_MS)).catch(() => null)
      )
    return bytesOf.get(id)
  }
  const remember = (group, mediaId) => {
    used.add(mediaId)
    for (const o of group?.occurrences ?? [])
      for (const page of pagesOf(o.entity)) shown.set(page, (shown.get(page) ?? new Set()).add(mediaId))
  }
  for (const p of plan.placements) remember(byGroup.get(p.groupId), p.mediaId)
  const out = new Map()
  for (const u of plan.unfilled) {
    if (drawn.has(u.groupId)) continue
    const group = byGroup.get(u.groupId)
    if (!group?.demo) continue
    const slots = group.occurrences.map((o) => slotOf.get(o.key)).filter(Boolean)
    if (!slots.length || !slots.every((s) => PHOTO_ROLES.has(s.role))) continue
    const keys = new Set(slots.map((s) => s.key))
    // Keep the full map's text/card bindings; only this picture unit competes for a photo now.
    const map = {
      ...contentMap,
      slots: contentMap.slots.filter((s) => s.type !== 'image' || keys.has(s.key))
    }
    const onPage = new Set(slots.flatMap((s) => pagesOf(s.entity)).flatMap((p) => [...(shown.get(p) ?? [])]))
    const reusable = slots.every((s) => REUSABLE_BACKGROUNDS.has(s.role))
    const tiers = [
      assets.filter((a) => !used.has(a.id)),
      assets.filter((a) => !onPage.has(a.id)),
      ...(reusable ? [assets] : [])
    ]
    const tried = new Set()
    const frames = new Map(demo)
    // The receiving plugin judges cover pictures against the measured slot aspect, not the demo file aspect.
    const aspect = slots.map(fitAspectOf).find(Boolean)
    if (aspect) frames.set(group.file, { width: group.demo.width, height: group.demo.width / aspect })
    let placed = null
    for (const tier of tiers) {
      while (!placed) {
        const fill = planFill({
          contentMap: map,
          brief: { ...real.brief, assets: tier.filter((a) => !tried.has(a.id)) },
          demo: frames,
          cardNames,
          perSlot: true,
          unsharp
        })
        const candidate = fill.slots.find((s) => keys.has(s.key) && s.action === 'photo')
        if (!candidate) break
        tried.add(candidate.mediaId)
        try {
          const bytes = await read(candidate.mediaId)
          if (!bytes) continue
          let cut = await cutForPlace(bytes, candidate.crop)
          const cls = slotClassOf(slots, shownWidthOf)
          const judged = cls
            ? await judgePhoto(cut.bytes, cls, {
                source: bytes,
                scale: candidate.crop.output.width / candidate.crop.source.width
              })
            : null
          if (judged?.verdict === 'fail') continue
          if (judged) cut = await correctedCut(cut, judged)
          const { corrected: _corrected, ...quality } = judged ?? {}
          placed = {
            group: {
              sample: group.id,
              role: group.role,
              slots: group.occurrences,
              routes: group.routes ?? []
            },
            bytes: cut.bytes,
            ext: cut.ext,
            hash: cut.sha256,
            receipt: {
              kind: 'photo',
              origin: 'real',
              mediaId: candidate.mediaId,
              fallback: 'drawing-unavailable',
              ...(judged ? { sharpness: { mediaId: candidate.mediaId, ...quality } } : {}),
              reused: used.has(candidate.mediaId),
              rect: cut.rect,
              width: cut.width,
              height: cut.height
            }
          }
          remember(group, candidate.mediaId)
        } catch {
          // A missing or corrupt owner file tries the next fitting photo before the neutral rung.
        }
      }
      if (placed) break
    }
    if (placed) out.set(group.id, placed)
  }
  return out
}
