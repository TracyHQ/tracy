// Two records the needs profile carries from its research as they are, beside what the model reads (#575, plan stage
// inputs). Pure; code checks their structure only.
//   - `videos` (P10): the business's own videos the brief keeps for the site (`needs-research-media.mjs`), so the plan
//     knows the owner has some, how many and from where, and a template with a video place can use one. The profile
//     reads no video itself: `{count, sources: [{id, origin, count}], items: [{id, ref, source, label?}]}`, present
//     only when there is one; a video of a source the research does not name is not counted.
//   - `heldBack`: what the brief holds back from the site, by stable code and count (`brief-held-back.mjs`), so the
//     plan card can group and translate it: `[{field, code, count}]`, present only when there is one.

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const CODE = /^[a-z][a-z0-9_]*$/

/**
 * The profile's `videos` key from the research's own videos.
 * @param {{videos?: Array<{id: string, ref: string, from?: string[], label?: string | null}>}} research
 * @param {Array<{id: string, origin: string}>} sources the research sources the profile reads
 */
export function videosOfResearch(research, sources) {
  const origins = new Map(list(sources).map((s) => [s.id, s.origin]))
  const items = list(research?.videos)
    .filter((v) => isText(v?.id) && isText(v?.ref) && origins.has(list(v.from)[0]))
    .map((v) => ({
      id: v.id,
      ref: v.ref,
      source: v.from[0],
      ...(isText(v.label) ? { label: v.label.trim() } : {})
    }))
  if (!items.length) return {}
  const counts = new Map()
  for (const v of items) counts.set(v.source, (counts.get(v.source) ?? 0) + 1)
  return {
    videos: {
      count: items.length,
      sources: [...counts].map(([id, count]) => ({ id, origin: origins.get(id), count })),
      items
    }
  }
}

/** The profile's `heldBack` key from the research's (`researchOf`), each entry checked. */
export function heldBackOfResearch(research) {
  const heldBack = list(research?.heldBack)
    .filter((e) => isText(e?.field) && CODE.test(e?.code ?? '') && Number.isInteger(e?.count) && e.count > 0)
    .map(({ field, code, count }) => ({ field, code, count }))
  return heldBack.length ? { heldBack } : {}
}
