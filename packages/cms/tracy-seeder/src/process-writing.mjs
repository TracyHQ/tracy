// Editorial journeys are written from the brief, never filled as missing research facts. The existing step roles pair
// title/body/index fields. A declared presentation wins; older unnumbered groups with list bodies describe offering tabs.
// No template, field label or trade name determines the writing task.
export const PROCESS_WRITING_RULE =
  ' A slot with "journey" is editorial copy from the business brief. Keep every field of its group about the same subject. For kind "process", write distinct ordered stages from first contact to the result, using the brief\'s material. For kind "offering-tabs", the first tab introduces the first visit; each later tab describes only its assigned offering (or the corresponding offering in the brief when none is named). A subject "unavailable" has no offering: return its keys as pending. Give every useful step or tab a meaningful short title AND a body. Never return Step, Item, numbers alone or another neutral placeholder as a title. For format "intro-and-list", write a short intro followed by short bullet items, keeping the sample\'s paragraph and list tags (including its ((...)) encoding) and replacing their words. Add no markup absent from the sample and no extra line breaks; respect maxCharacters and maxLines. Do not invent prices, guarantees, durations, qualifications or factual procedures absent from the brief; editorial guidance must follow what the business says. If the brief cannot support a useful title and body, return BOTH keys as pending. A tab with "name" is the tab of that one offering: its title is that name exactly as given, and its body describes only that offering. For kind "session-outline", the group is one part of an outline of a session of the page\'s offering: its title names the part, each description one short thing that happens in it, in this business\'s own terms; never the demo trade\'s rhythm (rounds, rest periods, repeat counts) unless the brief describes it, and never a tag or label in place of an item.'

/** The offering name the site plan binds to a key (a group id, or `<entity>.offering`), or null. */
const boundName = (offerings, key) =>
  offerings && typeof offerings[key] === 'string' && offerings[key].trim() ? offerings[key] : null

/** Declared step groups as writing tasks, shared by all scalar contract writers. */
export function processWritingOf(slots, offerings = null) {
  const groups = new Map()
  for (const slot of slots) {
    if (!/^step\.(title|description|index)$/.test(slot.role ?? '') || !slot.group?.id) continue
    const id = slot.group.id
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(slot)
  }
  const collections = new Map()
  for (const [id, fields] of groups) {
    const key = `${fields[0].entity ?? ''}:${id.replace(/\.\d+$/, '')}`
    if (!collections.has(key)) collections.set(key, [])
    collections.get(key).push(fields)
  }
  const names = offerings
    ? [...new Set(Object.values(offerings).filter((v) => typeof v === 'string' && v.trim()))]
    : null
  const out = new Map()
  for (const collection of collections.values()) {
    collection.sort((a, b) => (a[0].group.item ?? 0) - (b[0].group.item ?? 0))
    const numbered = collection.some((fields) => fields.some((s) => s.role === 'step.index'))
    const listBody = collection.some((fields) =>
      fields.some((s) => s.role === 'step.description' && /<li\b|\(\(li\b/i.test(s.sample ?? ''))
    )
    const declared = collection[0][0].group.presentation
    if (declared === 'session-outline') {
      // 🔒 AN OUTLINE IS THE PAGE'S OFFERING'S OWN (spec #189, round 9): measured 30/10/2026, a tennis page's outline kept
      // the boxing demo's "one focused round, take a breather, repeat" and filled its spare lines with tags.
      collection.forEach((fields, i) => {
        const entity = fields[0].entity ?? ''
        const offering = boundName(offerings, `${entity}.offering`)
        const task = {
          kind: 'session-outline',
          group: fields[0].group.id,
          position: i + 1,
          count: collection.length,
          subject: 'outline-part',
          ...(offering ? { offering } : {}),
          format: 'short-body'
        }
        for (const field of fields) out.set(field.key, task)
      })
      continue
    }
    const kind =
      declared === 'offering-tabs' || (declared !== 'process' && !numbered && listBody)
        ? 'offering-tabs'
        : 'process'
    // 🔒 TABS BOUND TO OFFERINGS ARE ONE PER OFFERING (spec #189, round 9): the site plan names each tab's offering by its
    // group (`cardNames`), the name as the brief gives it. Measured 30/10/2026: a free first-visit tab pushed the fourth
    // offering out and the writer titled the tennis tab "Serve".
    const bound = kind === 'offering-tabs' && collection.some((fields) => boundName(offerings, fields[0].group.id))
    if (bound) {
      collection.forEach((fields, i) => {
        const name = boundName(offerings, fields[0].group.id)
        const task = {
          kind,
          group: fields[0].group.id,
          position: i + 1,
          count: collection.length,
          subject: name ? 'offering' : 'unavailable',
          ...(name ? { offering: name, name } : {}),
          format: listBody ? 'intro-and-list' : 'short-body'
        }
        for (const field of fields) out.set(field.key, task)
      })
      continue
    }
    collection.forEach((fields, i) => {
      const offering = kind === 'offering-tabs' && i > 0 ? names?.[i - 1] : null
      const task = {
        kind,
        group: fields[0].group.id,
        position: i + 1,
        count: collection.length,
        subject:
          kind === 'process'
            ? 'stage'
            : i === 0
              ? 'first-visit'
              : names && !offering
                ? 'unavailable'
                : 'offering',
        ...(offering ? { offering } : {}),
        format: listBody ? 'intro-and-list' : 'short-body'
      }
      for (const field of fields) out.set(field.key, task)
    })
  }
  return out
}
