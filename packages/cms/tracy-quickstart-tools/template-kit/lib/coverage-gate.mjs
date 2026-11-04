// The coverage gate: the kit carries every content map slot its pages show, faithfully copied from the contract.
// `applyCoverage` completes the kit from what the contract and the kit already read (nothing is measured again):
// every link showing a slot's words names it (link-label-slots.mjs), each link's label becomes a slot of the block
// holding the link (a reference when another block owns it), every picture a block shows is a frame
// (picture-frames.mjs), each contact field the contract can write names its slot and one the page prints but the
// contract cannot write says so,
// every text slot gets its one limit (slot-limits.mjs), and the main menu row its whole-row limit. `coverageGate`
// then counts what is still missing, part by part, and lists every failure: green (0) means the kit is final.
import { linkLabelSlots, linksWithoutLabelSlot } from './link-label-slots.mjs'
import { imagesWithoutFrame, pictureFrames } from './picture-frames.mjs'
import { menuLinkChecks, whatElseChanges } from './link-labels.mjs'
import { linksWithoutTarget, textsWithoutSlot } from './page-coverage.mjs'
import { neutralKey } from './ids.mjs'
import { pageTitleChecks, settlePageTitles } from './page-titles.mjs'
import { settleSettingSlots } from './setting-slots.mjs'
import { demoLength, slotLimitChecks, slotPlaces, unifyLimits } from './slot-limits.mjs'
import { formatOf, textFormatChecks } from './text-format.mjs'

/** The slot entries a block lists as its own (a reference to another block's slot is not one). */
function ownEntries(b) {
  const out = [...(b.slots ?? []).filter((s) => !s.ownedBy), ...(b.demoOwned ?? [])]
  for (const l of b.lists ?? []) {
    for (const s of l.rowSlots ?? []) out.push(s, ...(Array.isArray(s.slots) ? s.slots : []))
    for (const r of l.rows ?? []) out.push(...(r.slots ?? []))
  }
  return out.filter((s) => s?.id)
}

const FORMAT = ['type', 'role', 'sample', 'paragraphs', 'bullets', 'formatFrom']

/** Each link's label is a slot of the block holding the link: its own, or a reference to the owning block's. */
function labelSlots(kit, mapOf) {
  const owner = new Map()
  for (const b of kit.blocks) for (const s of ownEntries(b)) if (!owner.has(s.id)) owner.set(s.id, { b, s })
  for (const b of kit.blocks) {
    const here = new Set([...ownEntries(b), ...(b.slots ?? [])].map((s) => s.id))
    for (const l of b.links ?? []) {
      if (!l.labelId) continue
      // The block already lists it (a slot, a list row or a card field); which link prints it is said only by the
      // link's own labelId, never copied onto the slot.
      if (here.has(l.labelId)) continue
      const o = owner.get(l.labelId)
      const m = mapOf.get(l.labelId)
      const entry = o
        ? Object.fromEntries(FORMAT.filter((k) => o.s[k] !== undefined).map((k) => [k, o.s[k]]))
        : { type: 'text', role: m?.role ?? null, ...formatOf(m?.sample ?? l.label, {}) }
      entry.type ??= 'text'
      const slot = { id: l.labelId, ...entry, ...(o ? { ownedBy: o.b.id } : {}) }
      b.slots = [...(b.slots ?? []), slot]
      here.add(l.labelId)
      if (!o) owner.set(l.labelId, { b, s: slot })
    }
  }
}

/** Each contact field the page can print: its slot when the contract has one for the column, else why not. */
function contactFields(kit, mapSlots) {
  for (const c of kit.site?.contactBlocks ?? []) {
    const a = c.accepts
    if (!a?.entity) continue
    for (const f of a.fields ?? []) {
      const slot = mapSlots.find((s) => s.entity === a.entity && s.column === f.column && s.type === 'text')
      if (slot) Object.assign(f, { id: neutralKey(slot.key), writable: true })
      else {
        delete f.id
        f.writable = false
        f.writableReason = `the content map declares no slot for the contact's ${f.column} column, so it cannot be written; ${
          f.printed
            ? f.filled
              ? 'the page prints the demo value'
              : 'the page prints it once it is filled'
            : 'the page does not print it'
        }`
      }
    }
  }
}

/**
 * Every contact field names a slot with its limit (a content map slot, or a setting slot listed in
 * `site.settingSlots`), or says it cannot be written and why. Returns how many do neither, each passed to `fail`.
 */
export function contactFieldChecks(kit, fail) {
  const settings = new Set((kit.site?.settingSlots ?? []).map((s) => s.id))
  let wrong = 0
  for (const c of kit.site?.contactBlocks ?? [])
    for (const f of c.accepts?.fields ?? []) {
      const ok =
        f.writable === false
          ? !!f.writableReason && !f.id
          : !!f.id &&
            Number.isFinite(f.maxCharacters) &&
            !!f.maxCharactersFrom &&
            (!f.settingSlot || settings.has(f.id))
      if (ok) continue
      wrong++
      fail(
        'contactFieldsUnresolved',
        `site.contactBlocks[${c.block}].accepts.fields[${f.column}]`,
        'neither a slot with its limit nor a reason it cannot be written'
      )
    }
  return wrong
}

/** The menu block the header's links come from (`links[].menu`), as a kit block id. */
const mainMenuBlock = (kit) => {
  const header = kit.blocks.find((b) => b.id === 'header')
  const menu = (header?.links ?? []).find((l) => l.menu)?.menu
  return menu ? neutralKey(menu) : null
}

/**
 * The main menu row's whole-row limit: the characters its top-level labels hold when all are filled together, read
 * in the page at every width the row shows (row-fit.json). Without that reading, the labels as the content map
 * measured the demo row at desktop, summed: the row is known to hold them, and the source says its room was not read.
 */
function mainMenuRow(kit, mapOf, rowFit) {
  const block = mainMenuBlock(kit)
  const g = (kit.site?.navigationGroups ?? []).find((x) => x.block === block)
  if (!g) return
  const top = (g.items ?? []).filter((it) => it.level === 1 && it.labelSlot)
  const read = rowFit[g.id]
  if (Number.isFinite(read?.maxCharacters)) {
    const at = Object.entries(read.byWidth ?? {})
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([w, n]) => `${w}px ${n}`)
      .join(', ')
    g.rowLimit = {
      maxCharacters: read.maxCharacters,
      items: top.map((it) => it.labelSlot),
      narrowestWidth: read.narrowest,
      maxCharactersFrom: `kit frame: every top-level label filled together until one wraps, drops to another row or pushes past the header, at each width the row shows (${at}); narrower, the menu folds into the off-canvas button`
    }
    return
  }
  const widths = top.map((it) => mapOf.get(it.labelSlot)?.fit?.maxChars?.desktop)
  if (!top.length || !widths.every(Number.isFinite)) return
  g.rowLimit = {
    maxCharacters: widths.reduce((a, n) => a + n, 0),
    items: top.map((it) => it.labelSlot),
    at: 'desktop',
    maxCharactersFrom:
      'content map fit: the top-level labels of the demo row at desktop, summed; the row is known to hold them, its spare room was not read'
  }
}

/**
 * Complete the kit from the contract: link label slots, contact fields, one limit per slot, the main menu row.
 * @param {object} kit changed in place
 * @param {{map: object, textFit?: object, rowFit?: object, drives?: object}} o
 */
export function applyCoverage(kit, { map, textFit = {}, rowFit = {}, readings = new Map(), drives = {} }) {
  const mapSlots = map.slots ?? []
  const mapOf = new Map(mapSlots.map((s) => [neutralKey(s.key), s]))
  linkLabelSlots(kit, map)
  pictureFrames(kit, map, readings)
  labelSlots(kit, mapOf)
  contactFields(kit, mapSlots)
  unifyLimits(kit, { mapSlots, textFit })
  // After the limits: a setting slot borrows the limit of the line the page prints it beside.
  settleSettingSlots(kit, { map })
  mainMenuRow(kit, mapOf, rowFit)
  settlePageTitles(kit, { map, drives })
  whatElseChanges(kit)
  return kit
}

/**
 * Count what the kit still lacks against the content map (`map`) and the read pass (`readings`: block id -> the
 * block's reading at the widest width), part by part (`kit.coverage.parts`), list every failure
 * (`kit.coverage.failures`, also in `kit.errors`) and return the total: 0 means every shown slot is covered.
 */
export function coverageGate(kit, { map, readings = new Map() }) {
  const mapOf = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s]))
  const failures = []
  const fail = (part, where, reason) => failures.push({ part, where, reason })
  const parts = {}
  // 1. Every text slot a kit page shows is listed with a limit and its source.
  const listed = new Map()
  for (const p of slotPlaces(kit))
    if (!listed.has(p.id) || !listed.get(p.id).maxCharactersFrom) listed.set(p.id, p.entry)
  const shown = new Map()
  for (const b of kit.blocks) for (const id of b.shownSlots ?? []) if (!shown.has(id)) shown.set(id, b.id)
  parts.slotsMissing = 0
  let checked = 0
  for (const [id, block] of shown) {
    if (mapOf.get(id)?.type === 'text') checked++
    const e = listed.get(id)
    if (mapOf.get(id)?.type !== 'text' || (e && Number.isFinite(e.maxCharacters) && e.maxCharactersFrom))
      continue
    parts.slotsMissing++
    fail(
      'slotsMissing',
      `blocks[${block}]`,
      `slot ${id} is shown but ${e ? 'has no limit and source' : 'the kit does not list it'}`
    )
  }
  // 2. Every link label is a slot of its block; every top-level menu item is some link's label.
  const errors = []
  parts.linkLabelsOutsideBlock = menuLinkChecks({
    blocks: kit.blocks,
    groups: kit.site?.navigationGroups ?? [],
    errors
  })
  for (const e of errors) fail('linkLabelsOutsideBlock', e.field, e.reason)
  for (const b of kit.blocks) {
    const here = new Set([...ownEntries(b), ...(b.slots ?? [])].map((s) => s.id))
    for (const l of b.links ?? [])
      if (l.labelId && !here.has(l.labelId)) {
        parts.linkLabelsOutsideBlock++
        fail(
          'linkLabelsOutsideBlock',
          `blocks[${b.id}].links[${l.id}]`,
          `label slot ${l.labelId} is not a slot of the block`
        )
      }
  }
  // 3. One limit per slot, and the paragraphs and bullets of every text slot.
  const limitErrors = []
  parts.slotLimitsDiffering = slotLimitChecks({ kit, errors: limitErrors })
  for (const e of limitErrors) fail('slotLimitsDiffering', `slots[${e.slot}]`, e.reason)
  const formatErrors = []
  parts.textFormatMissing = textFormatChecks({ blocks: kit.blocks, errors: formatErrors })
  for (const e of formatErrors) fail('textFormatMissing', `slots[${e.slot}]`, e.reason)
  // No limit below the demo words, which show fine on the page.
  parts.limitsBelowDemo = 0
  const below = new Set()
  for (const { id, entry } of slotPlaces(kit)) {
    const demo = demoLength(mapOf.get(id)?.sample)
    if (!Number.isFinite(entry.maxCharacters) || entry.maxCharacters >= demo || below.has(id)) continue
    below.add(id)
    parts.limitsBelowDemo++
    fail(
      'limitsBelowDemo',
      `slots[${id}]`,
      `limit ${entry.maxCharacters} is below the ${demo} characters the demo shows`
    )
  }
  // Against the page's own reading: every element printing the block's content is a slot of its own, and every
  // clickable element whose label is a slot says what it opens (page-coverage.mjs).
  parts.textsWithoutSlot = textsWithoutSlot({ kit, map, readings, fail })
  parts.linksWithoutTarget = linksWithoutTarget({ kit, map, readings, fail })
  parts.linksWithoutLabelSlot = linksWithoutLabelSlot({ kit, map, fail })
  parts.imagesWithoutFrame = imagesWithoutFrame({ kit, map, readings, fail })
  // 4. The main menu row has its whole-row limit.
  const block = mainMenuBlock(kit)
  const main = (kit.site?.navigationGroups ?? []).find((g) => g.block === block)
  parts.mainMenuRowLimitMissing = block && main && !Number.isFinite(main.rowLimit?.maxCharacters) ? 1 : 0
  if (parts.mainMenuRowLimitMissing)
    fail(
      'mainMenuRowLimitMissing',
      `site.navigationGroups[${main.id}]`,
      'the main menu row has no whole-row limit'
    )
  // 5. Every contact field: a slot with its limit, or not writable with the reason.
  parts.contactFieldsUnresolved = contactFieldChecks(kit, fail)
  // 6. Shown words from a slot declared nowhere (the orphan check, counted here too).
  parts.orphanTexts = kit.checks?.orphanTexts ?? 0
  // 7. Every page has exactly one title slot (page-titles.mjs).
  parts.pageTitleSlots = kit.pages?.some((p) => 'titleSlot' in p) ? pageTitleChecks(kit, fail) : 0
  // How many shown text slots part 1 checked, so a gate at 0 over nothing is told from a covered kit.
  kit.coverage = { shownTextSlots: checked, parts, failures }
  for (const f of failures)
    kit.errors.push({ kind: 'coverage-gate', part: f.part, field: f.where, reason: f.reason })
  return Object.values(parts).reduce((a, n) => a + n, 0)
}
