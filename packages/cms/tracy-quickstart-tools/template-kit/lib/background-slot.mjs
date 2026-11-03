// The template's page background as a setting slot. A T4 template paints one picture behind the blocks of many pages
// from one site setting (`body_bg_img` in `etc/site/<profile>.json`), compiled into its CSS on every page; the read pass
// sees it as a frame painted behind each block it shows through (picture-frames.mjs), the first one the root and the
// others its twins. One setting is one slot: every such frame showing the setting's picture points at it
// (`writable: true`, `slotId`), and the write step sets or empties the setting through the plugin's
// `template.siteSettings` (Claude Cowork for Joomla with `body_bg_img`, see the Tracy writer
// `joomla-t4-body-background.js`). A frame painted behind with any other picture keeps `writable: false`.
import { PAINTED_BEHIND_REASON } from './picture-frames.mjs'

export const BACKGROUND_SLOT_ID = 'site.body-background'
export const BACKGROUND_KIND = 'template-background'

/** A picture path as compared: without the media field suffix (`#joomlaImage:...`), a leading slash or case. */
const pictureKey = (f) =>
  String(f ?? '')
    .split('#')[0]
    .replace(/^\/+/, '')
    .toLowerCase()

/** Frames a background setting shows: painted behind a block as a CSS background, with the setting's picture. */
const showsSetting = (f, setting) =>
  f.paintedBehind === true &&
  f.shownAs === 'background' &&
  pictureKey(f.picture) === pictureKey(setting.value)

/** The slot of one background setting read by the adapter (`{key, value, template, file}`), naming its frames. */
function backgroundSlot(setting, frames) {
  return {
    id: BACKGROUND_SLOT_ID,
    kind: BACKGROUND_KIND,
    writable: true,
    writeTo: {
      action: 'template.siteSettings',
      template: setting.template,
      key: setting.key,
      file: setting.file
    },
    sample: setting.value,
    canHide: true,
    frames,
    valueFormat:
      'a picture path relative to the site root, under images/, of a file already on the site (media.upload first, under a new name each time); empty clears the background',
    fillFrom:
      "the picture wish of the frame in `frames` that has no twinOf (the others are its twins and follow it): a wide photo that suits the business, shown behind the top of every page those frames are on. A hiddenSlots entry for that frame writes it empty: those pages then show the template's own background colour, with its gradient and overlay",
    drawnBy: `template site setting ${setting.key} (${setting.file}), printed by the template as the CSS background painted behind the blocks of every page that uses it`
  }
}

/**
 * Settle the background slots (changed in place): with `settings` read (`[]` for none), each setting whose picture
 * some frame shows becomes a slot those frames point at, and a frame tied to a slot that is gone is untied with the
 * painted-behind reason. With `settings` null (nothing read), the background slots the kit has are kept as they are.
 * @param {object} kit
 * @param {object[]|null} settings
 * @param {object[]} previous the kit's setting slots before this settle
 * @returns {object[]} the background slots to list
 */
export function settleBackgroundSlots(kit, settings, previous = []) {
  if (settings === null) return previous.filter((s) => s.kind === BACKGROUND_KIND)
  const frames = kit.blocks.flatMap((b) => b.frames ?? [])
  const slots = []
  for (const setting of settings) {
    const shown = frames.filter((f) => showsSetting(f, setting))
    if (!shown.length || slots.some((s) => s.id === BACKGROUND_SLOT_ID)) continue
    for (const f of shown) {
      delete f.writableReason
      Object.assign(f, { writable: true, slotId: BACKGROUND_SLOT_ID })
    }
    slots.push(
      backgroundSlot(
        setting,
        shown.map((f) => f.id)
      )
    )
  }
  const kept = new Set(slots.flatMap((s) => s.frames))
  for (const f of frames)
    if (f.slotId === BACKGROUND_SLOT_ID && !kept.has(f.id)) {
      delete f.slotId
      Object.assign(f, { writable: false, writableReason: PAINTED_BEHIND_REASON })
    }
  return slots
}
