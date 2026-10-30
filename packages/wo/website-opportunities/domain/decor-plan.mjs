// Icons and cut-outs follow the business's subject (spec TracyHQ/tracy#189, ticket #195). Template readiness labels each
// decorative picture slot as pure design or as carrying the demo's subject (`decorOf`); the plan then gives every
// subject-carrying icon an icon of the business's own offering, and every cut-out figure a step of the cut-out ladder
// (`cutout-ladder.mjs`). Pure design (lines, colour blocks, patterns) stays as the template drew it. Pure and
// deterministic: no model, no site; the engine renders the icons and shapes the cut-outs.
//
// 🔒 THE LABEL COMES FROM THE SLOT, NEVER FROM A NAME OF ONE TEMPLATE: a declared `decor` on the slot ("subject" or
// "design") wins; else an item icon (role `editorial.item_icon`) stands beside an item's words and so carries its
// subject, and a cut-out (Slot fit kind `cutout`) is a figure of the demo's activity. Released content maps are never
// edited (their hash is bound on every site), so the label is derived for them.
// 🔒 AN ICON IS CHOSEN BY MEANING: the words the build writes for its item (the copy pins), else the offering of the page
// it sits on, else the brief's offerings in item order. A word of the demo is never read, so the demo's subject cannot
// choose the new icon. A model's reading of the item's words ranks first when the engine has one (`iconChoices`), the
// keyword lexicon after it; no two items of one section show the same glyph (`icon-choice.mjs`). Nothing matches: a
// neutral mark the section has not used, never the demo's icon.
// 🔒 A CUT-OUT IS NEVER DRAWN: it climbs the cut-out ladder (`cutout-ladder.mjs`): the owner's own transparent picture,
// else taken off (the default), else, where taking it off leaves its own column empty beside the text, an owner photo the
// fill plan chose for it, shown in a frame.
import { CUT_OUT_REASONS, cutOutStepOf } from './cutout-ladder.mjs'
import {
  assignGlyphs,
  catalogNameRanking,
  ICON_SET,
  keywordRanking,
  NEUTRAL_GLYPHS,
  usableCatalog,
  validRanking
} from './icon-choice.mjs'
import { closedListOf, namedIn } from './pictures/picture-links.mjs'
import { fileOf } from './pictures/slot-map.mjs'

export const DECOR_PLAN_VERSION = 'decor-plan/3'

/** Every reason code a decor decision carries, with the sentence a report shows for it. */
export const DECOR_REASONS = Object.freeze({
  'icon-of-item': 'an icon matching the words written for this item',
  'icon-of-page-offering': 'an icon of the offering this page is about',
  'icon-of-offering': "an icon of one of the business's offerings",
  'icon-neutral': 'no icon matches the business, so a neutral mark stands in its place',
  ...CUT_OUT_REASONS,
  'design-kept': 'a pure design piece of the template, kept as drawn'
})

/** The longest piece of the brief's words an `asked` sentence quotes. */
const ASKED_QUOTE = 160

/**
 * The words a decor decision hands the site with its write (`replace_kept`, Claude Cowork for Joomla): a template marks
 * its icons and figures as pictures it keeps (Slot fit `replace: "keep"`), and the site takes a new one only with the
 * words that ask for it. A brief build asks for the business's own site, and these words say which part of the brief
 * chose the new picture (`quote`), or that none did and the demo's picture is only taken off.
 * @param {'icon' | 'cut-out'} action
 * @param {string | null} quote - the brief's words that chose the picture
 */
export function decorAsked(action, quote) {
  const thing = action === 'icon' ? 'icon' : 'figure'
  const words = typeof quote === 'string' ? quote.replace(/\s+/g, ' ').trim().slice(0, ASKED_QUOTE) : ''
  return words
    ? `The owner's brief asks for a site of its own: this ${thing} shows "${words}" in place of the template demo's ${thing}.`
    : `The owner's brief asks for a site of its own: the template demo's ${thing} shows another business, so it is replaced.`
}

/** The neutral mark an icon takes when nothing matches. */
export const NEUTRAL_GLYPH = NEUTRAL_GLYPHS[0]

/** Words → icons: the curated lexicon of the icon set (`icon-choice.mjs` `ICON_SET`), as [best icon, words] pairs. */
export const ICON_LEXICON = Object.freeze(ICON_SET.map((g) => Object.freeze([g.icons[0], g.words])))

/** The icon whose words a text holds first (in the text's own order), or null. */
export function glyphOf(text) {
  return keywordRanking(text)[0] ?? null
}

/**
 * The template readiness label of a picture slot: `icon` and `cut-out` carry the demo's subject and are replaced,
 * `design` is pure design and stays, null for every other picture (a photo the fill plan decides).
 * @param {{type?: string, role?: string, decor?: string, fit?: {kind?: string}}} slot
 * @returns {'icon' | 'cut-out' | 'design' | null}
 */
export function decorOf(slot) {
  if (slot?.type !== 'image') return null
  const kind = slot.fit?.kind
  const shape = kind === 'cutout' ? 'cut-out' : 'icon'
  if (slot.decor === 'design') return 'design'
  if (slot.decor === 'subject') return shape
  if (slot.role === 'editorial.item_icon') return 'icon'
  if (
    kind === 'cutout' &&
    !String(slot.role).startsWith('person.') &&
    !String(slot.role).startsWith('quote.')
  )
    return 'cut-out'
  if (['editorial.design_element', 'editorial.decorative_image'].includes(slot.role) || kind === 'decoration')
    return 'design'
  return null
}

/** The text slots that speak for an icon: its group's, else those after it in its entity up to the next picture. */
function wordsOfItem(slot, slots, at) {
  if (slot.group?.id) return slots.filter((s) => s.type === 'text' && s.group?.id === slot.group.id)
  const out = []
  for (let i = at + 1; i < slots.length && slots[i].entity === slot.entity; i += 1) {
    if (slots[i].type === 'image') {
      if (out.length) break
      continue
    }
    if (slots[i].type === 'text') out.push(slots[i])
  }
  return out
}

/**
 * Every item icon of a map, with the item it shows and the words the build writes for that item. An item is its group
 * (`group.id`), else the run of icons that share the words after them (a dark and a light icon of one feature); a
 * section is the entity the icons sit in. The words are the build's own (`copy`), never the demo's.
 * @param {any[]} slots
 * @param {{pins?: Record<string, string>, sources?: Record<string, string>} | null} copy
 * @returns {Array<{slot: any, at: number, id: string, section: string, words: string[]}>}
 */
function iconItems(slots, copy) {
  const out = []
  slots.forEach((slot, at) => {
    if (decorOf(slot) !== 'icon') return
    const texts = wordsOfItem(slot, slots, at)
    const words = texts
      .filter((s) => copy?.sources?.[s.key] !== 'placeholder')
      .map((s) => copy?.pins?.[s.key])
      .filter((w) => typeof w === 'string' && w.trim())
    const section = String(slot.entity ?? slot.key)
    const id = slot.group?.id ?? (texts[0] ? `${section}#${texts[0].key}` : slot.key)
    out.push({ slot, at, id, section, words })
  })
  return out
}

/**
 * The items whose icon a model may choose (`icon-choice.mjs` `iconQuestion`): one per item that has words of its own,
 * in page order. The engine asks the model and hands its rankings back to {@link planDecor} as `iconChoices`.
 * @param {{contentMap: {slots: any[]}, copy?: {pins?: Record<string, string>, sources?: Record<string, string>} | null}} input
 * @returns {Array<{id: string, section: string, words: string[]}>}
 */
export function iconItemsOf({ contentMap, copy = null }) {
  const seen = new Set()
  const out = []
  for (const i of iconItems(contentMap?.slots ?? [], copy)) {
    if (seen.has(i.id) || !i.words.length) continue
    seen.add(i.id)
    out.push({ id: i.id, section: i.section, words: i.words })
  }
  return out
}

const SOURCE_REASON = Object.freeze({ item: 'icon-of-item' })

/**
 * The glyph of every item icon, by slot key. Each item ranks its candidates from its OWN meaning only (its written words,
 * else the offering its own card is named for): a model's reading of them, the keyword lexicon on them, an offering they
 * name; then `assignGlyphs` gives every item of a section
 * its own glyph (`icon-choice.mjs`). An item with no words, or none that match, makes its whole row neutral.
 * @returns {Map<string, {glyph: string, reason: string, quote: string | null}>}
 */
function iconDecisions({ slots, copy, list, offerings = [], choices, catalog }) {
  // The offering a card's own name says (the site plan's `cardNames`, read by the fill plan): that card's own meaning.
  const cardOffering = new Map((offerings ?? []).map((o) => [o.groupId, o]))
  const items = iconItems(slots, copy)
  const usable = catalog ? usableCatalog(catalog) : null
  const allowed = usable ? new Set(usable.map((c) => c.name)) : null
  // A model's names were checked against each item's menu by the engine; with a catalog they are checked again here.
  const chosen = (list) =>
    validRanking(list, allowed ?? (Array.isArray(list) ? list.filter((n) => typeof n === 'string') : []))
  const asked = new Map()
  for (const i of items) {
    if (asked.has(i.id)) continue
    const card = i.slot.group?.id ? cardOffering.get(i.slot.group.id) : null
    const written = i.words.join(' ') || (card?.label ?? '')
    const named = written ? namedIn(written, list)?.label : null
    const candidates = [
      ...(written ? chosen(choices?.[i.id]) : []).map((glyph) => ({
        glyph,
        source: 'item',
        quote: written
      })),
      ...[
        ...keywordRanking(written),
        ...keywordRanking(named ?? ''),
        ...(usable ? catalogNameRanking(written, usable) : [])
      ].map((glyph) => ({
        glyph,
        source: 'item',
        quote: written
      }))
      // 🔒 AN ITEM'S ICON SAYS ITS OWN WORDS ONLY (#189, site build rule 4, criterion 3.5): the page's offering or the n-th
      // offering of the brief never stands in for an item without words (measured on a pilot build: a padel page row
      // showed a swimmer and a barbell taken from other offerings). Such an item has no candidate, and its row turns neutral.
    ]
    asked.set(i.id, { id: i.id, section: i.section, candidates })
  }
  const assigned = assignGlyphs([...asked.values()])
  // 🔒 ONE NEUTRAL FOR A WHOLE ROW (#189, site build rule 4): when an item of a row matches no icon by its own words,
  // every item of that row shows the same neutral mark, never a row where some items carry a meaning and others a filler.
  const rowOf = (i) =>
    i.slot.group?.id ? `${i.section}#${String(i.slot.group.id).replace(/\.\d+$/, '')}` : i.section
  const neutralRows = new Set(items.filter((i) => assigned.get(i.id)?.source !== 'item').map(rowOf))
  for (const i of items)
    if (neutralRows.has(rowOf(i))) assigned.set(i.id, { glyph: NEUTRAL_GLYPHS[0], source: null })
  const out = new Map()
  for (const i of items) {
    const got = assigned.get(i.id)
    const from = got.source ? asked.get(i.id).candidates.find((c) => c.glyph === got.glyph) : null
    out.set(i.slot.key, {
      glyph: got.glyph,
      reason: from ? SOURCE_REASON[from.source] : 'icon-neutral',
      quote: from?.quote ?? null
    })
  }
  return out
}

/**
 * @param {object} input
 * @param {{slots: any[]}} input.contentMap - the whole map, the slots a profile only declares included
 * @param {{reading?: any, assets?: any[]}} input.brief
 * @param {{pins?: Record<string, string>, sources?: Record<string, string>} | null} [input.copy] - the words the build
 *   writes, by slot key (`copyPinsOf`)
 * @param {Array<{groupId: string, offeringId: string, label: string}>} [input.offerings] - the fill plan's card offerings
 * @param {Array<{key: string, action?: string, mediaId?: string, crop?: any}>} [input.fill] - the fill plan's slot
 *   decisions: the photo it chose for a cut-out slot is the one a frame may show (ladder step 3)
 * @param {Array<{name: string, tags?: string[], categories?: string[]}> | null} [input.iconCatalog] - the icon
 *   catalog (Phosphor's name, tags, categories): its names an item's words say rank after the curated lexicon
 * @param {Record<string, string[]> | null} [input.iconChoices] - a model's ranked icon names by item id
 *   ({@link iconItemsOf}); without them the keyword lexicon ranks alone
 * @returns {{version: string, slots: Array<{key: string, file: string, decor: string, action: 'icon' | 'cut-out' |
 *   'keep', reason: string, glyph?: string, mode?: 'own' | 'off' | 'framed', step?: number, mediaId?: string,
 *   crop?: any, subject?: any, asked?: string}>}}
 */
export function planDecor({
  contentMap,
  brief,
  copy = null,
  offerings = [],
  fill = [],
  iconChoices = null,
  iconCatalog = null
}) {
  const slots = contentMap?.slots ?? []
  const list = closedListOf(brief?.reading).offerings
  const pageOffering = new Map()
  for (const o of offerings) {
    const entity = slots.find((s) => s.group?.id === o.groupId)?.entity
    if (entity && !pageOffering.has(entity)) pageOffering.set(entity, o)
  }
  // An entity whose own words name one offering (an offering's page) speaks for that offering.
  for (const s of slots) {
    const words = copy?.pins?.[s.key]
    if (pageOffering.has(s.entity) || typeof words !== 'string' || copy?.sources?.[s.key] === 'placeholder')
      continue
    if (!['offering.name', 'article.title', 'claim.heading'].includes(s.role)) continue
    const hit = namedIn(words, list)
    if (hit) pageOffering.set(s.entity, { offeringId: hit.id, label: hit.label })
  }
  const photoOf = new Map(
    (fill ?? []).filter((d) => d?.action === 'photo' && d.mediaId).map((d) => [d.key, d])
  )
  const iconOf = iconDecisions({
    slots,
    copy,
    list,
    offerings,
    choices: iconChoices,
    catalog: iconCatalog
  })
  const out = []
  slots.forEach((slot) => {
    const decor = decorOf(slot)
    if (!decor) return
    const file = fileOf(slot.sample)
    if (decor === 'design') {
      out.push({ key: slot.key, file, decor, action: 'keep', reason: 'design-kept' })
      return
    }
    if (decor === 'icon') {
      const got = iconOf.get(slot.key)
      out.push({
        key: slot.key,
        file,
        decor,
        action: 'icon',
        reason: got.reason,
        glyph: got.glyph,
        asked: decorAsked('icon', got.quote)
      })
      return
    }
    const main = pageOffering.get(slot.entity) ?? list[0] ?? null
    const subject = main
      ? { kind: 'offering', id: main.offeringId ?? main.id, label: main.label }
      : { kind: 'venue' }
    const step = cutOutStepOf({
      slot,
      slots,
      assets: brief?.assets ?? [],
      subject,
      photo: photoOf.get(slot.key)
    })
    out.push({
      key: slot.key,
      file,
      decor,
      action: 'cut-out',
      reason: step.reason,
      mode: step.mode,
      step: step.step,
      subject,
      ...(step.mediaId ? { mediaId: step.mediaId } : {}),
      ...(step.crop ? { crop: step.crop } : {}),
      asked: decorAsked('cut-out', step.mode === 'off' ? null : (main?.label ?? null))
    })
  })
  return { version: DECOR_PLAN_VERSION, slots: out }
}
