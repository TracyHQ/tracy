// Demo-only entities of a content map: content that exists only to show the template's own styles (a style-guide page
// of sample headings, progress bars and buttons), marked `"demoOnly": true` on the entity. No build writes a business's
// words over a style sample, so its slots are not judged for labelling: the label rules R1 to R8 and the verify
// viewer's suspicion rules skip them. The mark changes nothing else: the page is still captured, audited for holes
// (R9 still reads every hole) and shipped as the template ships it.

/** The keys of the entities a content map marks demo-only. */
export function demoOnlyEntities(map) {
  const entities = Array.isArray(map?.entities) ? map.entities : []
  return new Set(entities.filter((e) => e?.demoOnly === true && typeof e.key === 'string').map((e) => e.key))
}
