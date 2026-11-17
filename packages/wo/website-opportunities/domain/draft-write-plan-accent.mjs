// The look of the draft write (ticket #597): the accent, written as the kit declares it (`look.accent.writtenAs`,
// docs/references/ai-quickstart-contract.md, "look.accent: the accent door"). The module text is the one the brand
// and write steps build (`accentModule`) from the stylesheets the site serves, so the runner builds it at write time;
// the plan says which order value each side takes (`sides.values`: `accent` on `:root`, `accentDark` on `:root` with
// `sides.darkHook`, the accent again when the order has none) and the module's columns. Measured on both sides (fact
// L1). Pure; part of `writePlanOf`. The logo is a fact (`draft-write-plan-facts.mjs`).
import { ACCENT_CONTENT, ACCENT_SIDE_VALUES } from './ai-quickstart-build-words.mjs'
import { DraftWriteError } from './draft-write-error.mjs'
import { consume, recordOf, skip, unproven } from './draft-write-sink.mjs'

/** The module assignments the write knows (`writtenAs.assign`): every page is menu id 0. */
const ASSIGN = Object.freeze({ 'every-page': [0] })
const WHY = {
  accent_variables_not_declared: 'the mapping file names no colour variable the accent is written into',
  accent_door_missing: 'no door of the write step writes the template colour variables'
}

/** The declaration as the write follows it, or a typed stop naming the word it does not know. */
function declaredOf(accent) {
  const w = accent.writtenAs
  const values = accent.sides?.values ?? {}
  const unknown = (key, value) =>
    new DraftWriteError('accent_written_as_unknown', `look.accent ${key} is "${value}"`, {
      key,
      value: value ?? null
    })
  if (w.kind !== 'module') throw unknown('writtenAs.kind', w.kind)
  if (!ACCENT_CONTENT.includes(w.content)) throw unknown('writtenAs.content', w.content)
  if (!Object.hasOwn(ASSIGN, w.assign)) throw unknown('writtenAs.assign', w.assign)
  for (const [side, known] of Object.entries(ACCENT_SIDE_VALUES))
    if (!known.includes(values[side])) throw unknown(`sides.values.${side}`, values[side])
  return { w, values }
}

/**
 * The accent: one module op written as declared, its entries written by it; with no `writtenAs` no door writes the
 * variables (`accent_door_missing`), and without variables there is nothing to write into
 * (`accent_variables_not_declared`): both skip the entries, flagged.
 */
export function planLook(state) {
  const look = state.order.look ?? {}
  const entries = ['look.accent', ...(look.accentDark ? ['look.accentDark'] : [])]
  const accent = state.kit.mapping.look?.accent
  const variables = accent?.variables ?? null
  const base = { kind: 'look', recordKind: 'look', accent: look.accent ?? null, variables }
  if (!variables || !accent.writtenAs) {
    const reason = variables ? 'accent_door_missing' : 'accent_variables_not_declared'
    const record = recordOf(state.sink, 'look', { ...base, accentDark: look.accentDark ?? null })
    for (const id of entries) skip(state.sink, id, reason, { record: record.key })
    unproven(state.sink, reason, { op: 'look', why: WHY[reason] })
    return entries
  }
  const { w, values } = declaredOf(accent)
  const tone = (side) => look[values[side]] ?? look.accent ?? null
  const record = recordOf(state.sink, 'look', {
    ...base,
    tones: { light: tone('light'), dark: tone('dark') },
    sides: { opensOn: accent.sides.opensOn ?? null, darkHook: accent.sides.darkHook ?? null },
    module: {
      module: w.module,
      title: w.title,
      position: w.position,
      ordering: w.ordering ?? 0,
      showtitle: w.showtitle ?? 0,
      style: w.style ?? ''
    },
    menuids: ASSIGN[w.assign],
    // The brand file's own fill and words per side (#575, P4 of the brand audit), when the plan's accent is its own.
    ...(state.accentShifts?.length ? { shifts: state.accentShifts } : {})
  })
  for (const id of entries) consume(state.sink, id, record.key)
  return entries
}

/** The op of the look record (`opsOf`). */
export function lookOp(record) {
  return {
    key: 'look',
    kind: 'look.accent',
    record: record.key,
    mark: 'tracy-look-accent',
    accent: record.accent,
    variables: record.variables,
    ...(record.module
      ? {
          tones: record.tones,
          sides: record.sides,
          module: record.module,
          menuids: record.menuids,
          ...(record.shifts ? { shifts: record.shifts } : {})
        }
      : { accentDark: record.accentDark }),
    entries: record.entries,
    rules: record.module ? ['look.accent.writtenAs', 'look.accent.sides.values'] : ['look'],
    ...(record.variables ? {} : { unproven: 'accent_variables_not_declared' })
  }
}
