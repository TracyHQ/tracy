// Setting slots: values a page prints that live in a CMS row no content map slot holds, which a released content
// map can never gain (it never changes), so the kit itself names the row and how to write it. Each one is listed
// once in `site.settingSlots[]` with its id, where it is written (`writeTo`: the content map entity and column), the
// value format and how a brief fills it; what uses it points at that id:
//   - map-location: the map a button opens in a modal (`links[].opens`, `shows: "map"`), drawn by a map shortcode
//     in a block's own content (`site.mapSettings`, read from the database by the CMS adapter). The button gets
//     `writable: true` and `slotId` when exactly one such block is assigned to the page the button is on.
//   - contact-mobile: the contact's mobile line, printed once filled but empty in the demo, so the capture declared
//     no slot for it. It takes the limit of the contact's telephone line: the page prints both in the same layout.
//   - template-background: the picture a template paints behind the blocks of many pages from one site setting
//     (background-slot.mjs); every frame painted behind with it gets `writable: true` and `slotId`.
// Read-only: nothing here measures or shoots; `cli.mjs setting-slots` settles a written kit again with it.
import { settleBackgroundSlots } from './background-slot.mjs'
import { assignedAt, indexMap } from './map-index.mjs'

const MAP_REASON =
  'the button opens a map the page draws from its own settings, which no content map slot holds; a planner cannot point it at the customer address'

/** The map-location slot of one map setting the adapter read (`{entity, column, shortcode, ...}`). */
export function mapLocationSlot(m) {
  const id = `${m.entity.replace(/^module-/, 'block-')}.map-location`
  return {
    id,
    kind: 'map-location',
    writable: true,
    writeTo: { entity: m.entity, column: m.column, whole: true, template: m.template },
    sample: m.location,
    valueFormat:
      'the whole column, written from `template` with three values: <address> one line of plain text, the address as a visitor would type it in Google Maps; <latitude> and <longitude> decimal degrees (40.7049955, -74.0069912), or both empty. Each value is escaped as inside a JSON string; no single quote (write a typographic one), no line break.',
    fillFrom:
      "<address>: the brief's `address` fact on one line. <latitude>, <longitude>: with a Google placeId, the place's own coordinates (the place record's location, or Place Details geometry.location), since the map takes no place id; without a placeId, both empty, and the map finds the address itself when it opens",
    drawnBy: m.drawnBy
  }
}

/** The contact-mobile slot of a contact block's mobile field, with the limit of its telephone line. */
function mobileSlot(entity, phone) {
  return {
    id: `${entity}.mobile`,
    kind: 'contact-mobile',
    writable: true,
    writeTo: { entity, column: 'mobile' },
    sample: '',
    maxCharacters: phone.maxCharacters,
    maxCharactersFrom: `the contact's telephone line (${phone.id}): the page prints the mobile line in the same layout, once filled`,
    valueFormat: 'a phone number as the page should print it, plain text on one line ((239) 555-0108)',
    fillFrom:
      "a second number of the brief's `phone` fact (a mobile or another line); the first number goes to the telephone slot. Without a second number it stays empty and the page prints no mobile line"
  }
}

/**
 * Tie each map button to the one map setting assigned to its page; returns how many were tied. A button on a page
 * with none, or with several, keeps `writable: false` and says why.
 */
function tieMapButtons(kit, idx, slots) {
  let tied = 0
  for (const b of kit.blocks ?? [])
    for (const l of b.links ?? []) {
      if (l.opens?.shows !== 'map') continue
      const paths = (kit.pages ?? [])
        .filter((p) => Object.values(p.blocks ?? {}).some((ids) => ids.includes(b.id)))
        .map((p) => p.path)
      const found = new Set()
      for (const path of paths)
        for (const a of assignedAt(idx, path))
          for (const s of slots) if (s.writeTo.entity === a.entity) found.add(s.id)
      if (found.size === 1) {
        const [slotId] = found
        delete l.opens.writableReason
        Object.assign(l.opens, { writable: true, slotId })
        tied++
      } else {
        delete l.opens.slotId
        Object.assign(l.opens, {
          writable: false,
          writableReason: found.size
            ? `the page holds ${found.size} map settings (${[...found].join(', ')}); which one the button opens is not read`
            : MAP_REASON
        })
      }
    }
  return tied
}

/** Open each contact block's mobile field that has no content map slot, through a contact-mobile setting slot. */
function openMobileFields(kit) {
  const out = []
  for (const c of kit.site?.contactBlocks ?? []) {
    const a = c.accepts
    const fields = a?.fields ?? []
    const phone = fields.find((f) => f.kind === 'phone' && f.writable && Number.isFinite(f.maxCharacters))
    for (const f of fields) {
      if (f.kind !== 'mobile' || !f.printed || (f.writable && !f.id?.endsWith('.mobile')) || !phone) continue
      const slot = mobileSlot(a.entity, phone)
      delete f.writableReason
      Object.assign(f, {
        id: slot.id,
        writable: true,
        maxCharacters: slot.maxCharacters,
        maxCharactersFrom: slot.maxCharactersFrom,
        settingSlot: true
      })
      out.push(slot)
    }
  }
  return out
}

/**
 * Settle the kit's setting slots (changed in place): `site.settingSlots` from the map settings (`mapSettings`, else
 * the site part's `site.mapSettings`), the contact blocks and the background settings (`backgroundSettings`, else
 * `site.backgroundSettings`; neither read keeps the background slots the kit has), then tie the map buttons, open the
 * mobile fields and point the frames painted behind at their background slot.
 * @param {object} kit
 * @param {{map: object, mapSettings?: object[]|null, backgroundSettings?: object[]|null}} o
 * @returns {{slots: number, tied: number, mobile: number, backgrounds: number}}
 */
export function settleSettingSlots(kit, { map, mapSettings = null, backgroundSettings = null }) {
  if (!kit.site) return { slots: 0, tied: 0, mobile: 0, backgrounds: 0 }
  const settings = mapSettings ?? kit.site.mapSettings ?? []
  delete kit.site.mapSettings
  const backgroundsRead = backgroundSettings ?? kit.site.backgroundSettings ?? null
  delete kit.site.backgroundSettings
  const backgrounds = settleBackgroundSlots(kit, backgroundsRead, kit.site.settingSlots ?? [])
  const maps = settings.map(mapLocationSlot)
  const tied = tieMapButtons(kit, indexMap({ entities: [], ...map }), maps)
  const mobiles = openMobileFields(kit)
  // Only the map settings a button uses are listed: a map no link opens is the block's own content.
  const used = new Set(kit.blocks.flatMap((b) => (b.links ?? []).map((l) => l.opens?.slotId).filter(Boolean)))
  kit.site.settingSlots = [...maps.filter((s) => used.has(s.id)), ...mobiles, ...backgrounds]
  return {
    slots: kit.site.settingSlots.length,
    tied,
    mobile: mobiles.length,
    backgrounds: backgrounds.reduce((n, s) => n + s.frames.length, 0)
  }
}
