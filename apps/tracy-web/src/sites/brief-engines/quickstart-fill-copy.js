/**
 * What the quickstart-first path reads before it places pictures and writes words, for a release whose content map says
 * each slot's v3 role (ADR 0040): the copy pins (`copyPinsOf`), whose card names decide each card's offering or person
 * for its photo and its words alike, the brief's accepted number facts and people, and the text substitutes the fill plan
 * decides (`textSubstitutesOf`: a claim heading without its demo number, a signature's name).
 *
 * 🔒 THE NAME ON A CARD IS THE ONE ITS PHOTO WAS CHOSEN BY: the copy pins' card names are pinned on the page, so the
 * editor never renames a card whose photo the fill plan already placed.
 * 🔒 NEVER IN THE WAY OF A SITE'S OWN BUILD: no contract, a version 2 map or no brief answers null, and the path is as before.
 */
import { cardNamesOf } from 'website-opportunities/domain/fill-plan.mjs'
import { textSubstitutesOf } from 'website-opportunities/domain/fill-text.mjs'
import { contentMapOf } from './real-pictures.js'
import { copyPinsOf } from './wo-copy-pins.js'
import { fillsByPlan } from './quickstart-fill-pictures.js'

/** The text roles whose pinned words name a card: the decider of the card's photo. */
const NAME_ROLES = new Set(['offering.name', 'person.name'])

/** The place profile's facts of `kind` that its assessment accepts and the demo may show. */
function accepted(placeProfile, list) {
  const ok = new Set(
    (placeProfile?.assessment ?? []).filter((a) => a?.status === 'accepted').map((a) => a.factId)
  )
  return (Array.isArray(list) ? list : []).filter(
    (f) => f?.id && ok.has(f.id) && !(f.value?.restrictions ?? []).includes('not-on-demo')
  )
}

/**
 * @param {{ctx: any, woContent: any, real: any}} input - `real`: the build's pictures (`realPictures.forSite`)
 * @returns {Promise<null | {contentMap: any, brief: any, cardNames: Record<string, string>, copy: any, facts: any[],
 *   people: any[]}>}
 */
export async function quickstartFillInput({ ctx, woContent, real }) {
  if (!ctx.contract?.dir || !real?.brief) return null
  let contentMap
  try {
    contentMap = contentMapOf(ctx.contract)
  } catch {
    return null
  }
  if (!fillsByPlan(contentMap, real.brief)) return null
  const copy = await copyPinsOf(woContent, ctx, {
    cms: ctx.platform,
    contentMap,
    lang: ctx.normalized?.languages?.[0] ?? 'en',
    pictures: real.pictures ?? []
  })
  const profile = copy?.placeProfile ?? null
  return {
    contentMap,
    brief: real.brief,
    cardNames: cardNamesOf(contentMap, copy),
    copy,
    facts: accepted(profile, profile?.profile?.claims?.statistics),
    people: accepted(profile, profile?.profile?.people)
  }
}

/**
 * The words the fill plan pins on the native records, by record key and binding key: each card's name from the copy
 * pins, and each text substitute. A slot the contract writes inside a larger field (an XPath slot) is left to the editor.
 * @param {{adapter: {records: any[], coverage?: any[], get: Function}, input: NonNullable<Awaited<ReturnType<typeof quickstartFillInput>>>}} args
 * @returns {{pins: Map<string, Record<string, string>>, substitutes: any[]}}
 */
export function quickstartTextPins({ adapter, input }) {
  const where = new Map()
  for (const entry of adapter.coverage ?? []) {
    if (entry?.disposition !== 'editable' || !entry.record || !Array.isArray(entry.path)) continue
    const record = adapter.records.find((r) => r.key === entry.record)
    const binding = record?.bindings?.find(
      (b) => JSON.stringify(b.path) === JSON.stringify(entry.path) && !b.htmlSlots?.length
    )
    if (binding) where.set(entry.surface, { record, binding })
  }
  const names = {}
  for (const slot of input.contentMap.slots ?? []) {
    const name = input.copy?.pins?.[slot.key]
    if (NAME_ROLES.has(slot.role) && typeof name === 'string' && name.trim())
      if (input.copy?.sources?.[slot.key] !== 'placeholder') names[slot.key] = name
  }
  const texts = {}
  for (const [key, { record, binding }] of where) {
    const value = adapter.get(record.data, binding.path)
    if (typeof value === 'string') texts[key] = value
  }
  const substitutes = textSubstitutesOf({
    contentMap: input.contentMap,
    texts,
    facts: input.facts,
    people: input.people,
    pinned: names
  })
  const pins = new Map()
  const pin = (slotKey, text) => {
    const at = where.get(slotKey)
    if (!at) return false
    pins.set(at.record.key, { ...pins.get(at.record.key), [at.binding.key]: text })
    return true
  }
  for (const [key, name] of Object.entries(names)) pin(key, name)
  const written = substitutes.filter((s) => pin(s.key, s.text))
  return { pins, substitutes: written }
}
