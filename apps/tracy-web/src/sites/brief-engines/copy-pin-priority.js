// Pin precedence is shared by Joomla and WordPress. Missing profile data cannot erase a sourced map value or a
// frozen brief decision; a person card's identity follows the same honesty decision as its initials avatar.
const nonempty = (value) => typeof value === 'string' && value.trim() !== ''

/** Merge a profile fill over map pins, retaining sourced words where the profile has only an empty placeholder. */
export function mergeCopyPins(base, next) {
  const pins = { ...base.pins, ...next.pins }
  const sources = { ...base.sources, ...next.sources }
  for (const [key, value] of Object.entries(base.pins))
    if (nonempty(value) && base.sources[key] !== 'placeholder' && !nonempty(next.pins[key])) {
      pins[key] = value
      sources[key] = base.sources[key]
    }
  return { pins, sources }
}

/**
 * Resolve pins before either engine excludes them from its writer or reinserts them after cleanup.
 * A site-plan value decision (a brief fact) replaces a pin that is empty or a placeholder; a sourced pin keeps its words.
 */
export function withHonestyPins(copy, contentMap, honesty, planSlots = []) {
  const facts = (planSlots ?? []).filter(
    (s) => s?.decision === 'value' && nonempty(s.value) && s.key in (copy.pins ?? {})
  )
  if (!honesty && !facts.length) return copy
  honesty = honesty ?? {}
  const pins = { ...copy.pins }
  const sources = { ...copy.sources }
  const roles = { ...copy.roles }
  const changed = new Set()
  const removed = new Set()
  const byKey = new Map((contentMap.slots ?? []).map((s) => [s.key, s]))
  const people = new Map(
    (honesty.records ?? [])
      .filter((r) => r.kind === 'person' && r.decision === 'keep')
      .map((r) => [r.group, r.assigned])
  )
  const hidden = new Set((honesty.records ?? []).filter((r) => r.decision === 'hide').map((r) => r.group))
  const blanked = new Set((honesty.blanks ?? []).map((s) => s.key))
  for (const fact of facts) {
    const key = fact.key
    if (nonempty(pins[key]) && sources[key] !== 'placeholder') continue
    pins[key] = fact.value
    sources[key] = `site-plan:${fact.reason ?? 'value'}`
    if (fact.role) roles[key] = fact.role
    changed.add(key)
  }
  for (const slot of contentMap.slots ?? []) {
    const key = slot.key
    // A guest quote rejected as a whole must stay empty on both CMS write paths, not return to the copy writer.
    if (blanked.has(key) && slot.type === 'text' && slot.role?.startsWith('quote.')) {
      pins[key] = ''
      sources[key] = 'site-plan:no-fitting-review'
      roles[key] = slot.role
      removed.add(key)
      continue
    }
    if (hidden.has(slot.group?.id) || blanked.has(key)) {
      delete pins[key]
      delete sources[key]
      removed.add(key)
      continue
    }
    const planned = honesty.values?.[key]
    if (!nonempty(planned?.value)) continue
    pins[key] = planned.value
    sources[key] = `site-plan:${planned.reason}`
    roles[key] = slot.role
    changed.add(key)
  }
  const placeholders = (copy.placeholders ?? []).filter(
    (key) => key in pins && sources[key] === 'placeholder'
  )
  const manifest = copy.slotFill?.manifest.map((row) => {
    const key = row.slotKey
    if (!changed.has(key) && !removed.has(key)) return row
    const { neutralKey: _neutralKey, entityId: _entityId, ...rest } = row
    if (removed.has(key)) return { ...rest, state: 'empty', factRefs: [] }
    const person = people.get(byKey.get(key)?.group?.id)
    return { ...rest, state: 'sourced', ...(person ? { entityId: person.id } : {}), factRefs: [] }
  })
  return {
    ...copy,
    pins,
    sources,
    roles,
    placeholders,
    ...(copy.slotFill ? { slotFill: { ...copy.slotFill, manifest } } : {})
  }
}
