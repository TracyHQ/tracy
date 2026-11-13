// The accounting of the pictures step against the DECLARATION (ticket #595): every icon, video and image field the
// placed blocks declare, at every depth, enumerated straight from the block store, and compared with what the step
// decided. Its own walk of the declaration, apart from the walk the step reads (`picture-block-places.mjs`), so a
// field the step does not see shows as missing instead of being left out of both sides. Pure.
//
// Declared instances: a block field once per placed block, an item field once per shown item, a child list field once
// per row the list may hold (`items.max`) per parent place, nested lists likewise.
// Decided: icons = library + social mark + network class + hidden with a reason; images and videos = own + generated + none with a reason,
// plus the frames of a dropped item (`droppedFrames`).
import { shownItemsOf } from './picture-block-places.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** What a declared field is to the pictures step: `icon`, `video`, `image`, or null. */
export function mediaKindOf(field) {
  if (field?.type === 'icon' || field?.kind === 'editorial.item_icon') return 'icon'
  if (field?.type === 'link' && field?.kind === 'business.video') return 'video'
  if (field?.type === 'image') return 'image'
  return null
}

function declare(fields, prefix, out) {
  for (const field of list(fields)) {
    const kind = mediaKindOf(field)
    if (kind) out[kind].push(`${prefix}.${field.name}`)
  }
}

function declareLists(lists, prefix, out) {
  for (const child of list(lists)) {
    const rows = Number.isInteger(child?.items?.max) ? child.items.max : 0
    for (let n = 1; n <= rows; n++) {
      declare(child.fields, `${prefix}.${child.name}.${n}`, out)
      declareLists(child.lists, `${prefix}.${child.name}.${n}`, out)
    }
  }
}

/**
 * Every icon, video and image field instance the placed blocks declare, by id.
 * @returns {{icon: string[], video: string[], image: string[]}}
 */
export function declaredMediaOf(pages, blocks, data) {
  const out = { icon: [], video: [], image: [] }
  for (const page of list(pages))
    for (const block of list(page?.blocks)) {
      const d = blocks.get(block.block) ?? {}
      const base = `${page.id}.${block.id}`
      declare(d.fields, base, out)
      declareLists(d.lists, base, out)
      for (const item of shownItemsOf(block, d, data)) {
        declare(d.itemFields, `${base}.${item.id}`, out)
        declareLists(d.itemLists, `${base}.${item.id}`, out)
      }
    }
  return out
}

function account(declared, decided) {
  const ids = new Set(decided.map((d) => d.id))
  const reasons = {}
  let unexplained = 0
  for (const d of decided)
    if (isText(d.reason)) reasons[d.reason] = (reasons[d.reason] ?? 0) + 1
    else unexplained += 1
  const sources = {}
  for (const d of decided) sources[d.source] = (sources[d.source] ?? 0) + 1
  return {
    declared: declared.length,
    decided: decided.length,
    sources,
    reasons,
    missing: declared.filter((id) => !ids.has(id)),
    extra: [...ids].filter((id) => !declared.includes(id)),
    unexplained
  }
}

/**
 * The pictures step's result against the declaration: per media kind, the declared and decided counts, the decided
 * sources, the reasons of every field left empty, and every id declared but not decided (or decided but not declared).
 * @param {{icon: string[], video: string[], image: string[]}} declared `declaredMediaOf`'s answer
 * @param {{frames: object[], droppedFrames?: object[], icons: object[]}} step the pictures step's result
 */
export function mediaAccountOf(declared, step) {
  const frames = [
    ...list(step.frames).map((f) => ({
      id: f.id,
      video: f.place === 'video',
      source: f.source,
      reason: f.source === 'none' ? f.reason : f.source
    })),
    ...list(step.droppedFrames).map((f) => ({ id: f.frame, source: 'dropped', reason: f.reason }))
  ]
  const videoIds = new Set(declared.video)
  const icons = list(step.icons).map((i) => ({
    id: i.id,
    source: i.source === 'library' ? (i.case === 'social' ? 'social' : 'library') : i.source,
    reason:
      i.source === 'none'
        ? i.reason
        : i.source === 'network'
          ? 'network'
          : i.case === 'social'
            ? 'social'
            : 'library'
  }))
  return {
    icon: account(declared.icon, icons),
    video: account(
      declared.video,
      frames.filter((f) => videoIds.has(f.id) || f.video)
    ),
    image: account(
      declared.image,
      frames.filter((f) => !videoIds.has(f.id) && !f.video)
    )
  }
}
