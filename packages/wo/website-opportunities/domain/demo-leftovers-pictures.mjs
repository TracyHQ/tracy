// The picture rules of the demo-leftover check (spec TracyHQ/tracy#189, tickets #194 and #195): C01 (a demo picture in a
// general slot), C04 (a demo icon), C05 (a demo cut-out figure) and C06 (a demo picture several cards share). Each rule
// reads every place a page can carry a demo picture: an image source, a lazy-load or data attribute, an inline
// background, and a copy of the file the CMS made (another format, or a resized copy beside it).
//
// 🔒 THE SLOT'S LABEL DECIDES THE KIND, never a file name of one template: a cut-out is a slot whose Slot fit says
// `cutout` (or a transparent PNG in a general slot of a map without Slot fit), an icon is an item icon, and a slot the
// template readiness labelled pure design (`decor: "design"`) is never a leftover.

/** Picture roles of a slot that shows the business in general. */
const GENERAL_PICTURES = new Set(['business.hero_image', 'business.gallery_image', 'editorial.illustration'])
/** Picture roles a demo file shared by several cards is reported for: the ones the business's own pictures replace. */
const SHARED_ROLES = new Set([...GENERAL_PICTURES, 'offering.image', 'person.image', 'article.image'])

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether a served page carries a demo file: the path itself (URL-encoded or not) in any attribute, style or script, or
 * a copy the CMS made of it (the same name in another picture format, or with a size added).
 * @param {{html: string}} page
 * @param {string} file - `images/...`
 */
export function carriesPicture(page, file) {
  const html = page.html ?? ''
  if (html.includes(file) || html.includes(encodeURI(file))) return true
  const stem = file.replace(/\.(?:jpe?g|png|webp|svg|gif|avif)$/i, '')
  return new RegExp(`${escapeRe(stem)}(?:[_-]\\d+x\\d+)?\\.(?:jpe?g|png|webp|gif|avif)`, 'i').test(html)
}

const isDesign = (slot) => slot.decor === 'design'
/** Whether a slot is a cut-out figure (C05). */
export const isCutOutSlot = (slot, file) =>
  !isDesign(slot) &&
  !String(slot.role).startsWith('person.') &&
  (slot.fit?.kind === 'cutout' ||
    (!slot.fit?.kind && GENERAL_PICTURES.has(slot.role) && /\.png$/i.test(file ?? '')))

/** Every picture slot of `which` whose demo file a served page still carries, by page and slot. */
const pictureSlots = (which) => (ctx) => {
  const out = []
  for (const page of ctx.served)
    for (const { slot, probe } of ctx.demo.slots) {
      if (!probe.file || isDesign(slot) || !which(slot, probe.file)) continue
      if (carriesPicture(page, probe.file)) out.push({ page: page.path, place: slot.key, found: probe.file })
    }
  return out
}

/** C01: a general picture slot still on its demo file (a hero, a band, a gallery tile, an illustration). */
export const findGeneralPictures = pictureSlots(
  (slot, file) => GENERAL_PICTURES.has(slot.role) && !isCutOutSlot(slot, file) && slot.fit?.kind !== 'icon'
)

/** C04: an item icon still on the demo's icon. */
export const findDemoIcons = pictureSlots((slot) => slot.role === 'editorial.item_icon')

/** C05: a cut-out figure still on the demo's figure. */
export const findCutOuts = pictureSlots((slot, file) => isCutOutSlot(slot, file))

/**
 * C06: a demo file that cards of several groups (or entities) share, still on a page. Each place that shows it is one
 * finding: the build gives each card its own picture, so any one left is the demo's.
 */
export function findSharedPictures(ctx) {
  const owners = new Map()
  for (const { slot, probe } of ctx.demo.slots) {
    if (!probe.file || isDesign(slot) || !SHARED_ROLES.has(slot.role) || isCutOutSlot(slot, probe.file))
      continue
    const at = owners.get(probe.file) ?? new Set()
    at.add(slot.group?.id ?? slot.entity)
    owners.set(probe.file, at)
  }
  const out = []
  for (const page of ctx.served)
    for (const [file, by] of owners)
      if (by.size > 1 && carriesPicture(page, file)) out.push({ page: page.path, place: file, found: file })
  return out
}
