/**
 * `media.icon` — another icon from Tracy's icon library, in an icon slot of a quickstart's contract.
 *
 * WHY THE AGENT NEEDS IT. An icon on a quickstart page is a picture slot holding a small transparent PNG, and on a
 * template with a light and a dark version of it, a PAIR of slots (`feature_img` / `feature_img_light` on a Joomla
 * article): the build's icon step chose it from the Phosphor set and drew both files. The agent's media tools only
 * draw a photo, upload a file or read one, so "change this icon" ended in `media.draw` — a picture model asked for a
 * glyph, refused outright where none is set up (`NO_PICTURE_MODEL`), and a drawing in no template's look where one is.
 *
 * 🔒 THE DRAWING IS TRACY-WEB'S, THE WRITE IS THE PERSON'S. The icon set and the code that draws a replaced icon in its
 * template's look live in tracy-web (`apps/tracy-web/src/lib/picture-paint/icons/icon-pick.js`), which this dsh does
 * not carry; its icon door (`POST /api/sites/:key/icons`) searches, names the pair from the template kit, and draws.
 * It writes nothing: the files go up through `media.upload` and into the slots through one `content.contract apply`,
 * both through the Apply door as the viewer, so the change is in Changes and `apply.revert` undoes it.
 *
 * Two calls: `{query}` lists library names; `{slot, icon}` draws that icon into the slot and its twins. The look and
 * the colours are read from the files the slots name (the template's demo icon and what the slot shows now), read here
 * from the site's own folder — never typed by the model.
 */
import { pictureFolder } from './draw.mjs'

/** A contract slot key: `article-2.18`, `module-441.8`, `home.hero.img`. */
const SLOT_KEY = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/
/** A library icon's name: `barbell`, `boxing-glove`. */
const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** A picture path on the site, as a slot holds it (Joomla adds `#joomlaImage://…` after the path). */
const SITE_PICTURE = /^(?!.*\.\.)[\w./-]+\.(?:png|webp|jpe?g|gif)$/i

/**
 * @param {Record<string, unknown>} params
 * @returns {{ ok: true, search: string } | { ok: true, slot: string, icon: string } | { ok: false, error: string }}
 */
export function planIcon(params) {
  const p = params && typeof params === 'object' ? params : {}
  const icon = typeof p.icon === 'string' ? p.icon.trim().toLowerCase() : ''
  const slot = typeof p.slot === 'string' ? p.slot.trim() : ''
  const query = typeof p.query === 'string' ? p.query.trim() : ''
  if (icon === '') {
    if (query === '')
      return {
        ok: false,
        error: 'media.icon {query:"<what the icon shows>"} lists icons; {slot, icon} puts one in'
      }
    if (query.length > 200) return { ok: false, error: 'query: at most 200 characters' }
    return { ok: true, search: query }
  }
  if (!ICON_NAME.test(icon))
    return { ok: false, error: 'icon: a name media.icon {query} listed, e.g. "barbell"' }
  if (!SLOT_KEY.test(slot))
    return {
      ok: false,
      error: 'slot: the icon slot key, such as article-2.18 (content.read names it as field.slotKey)'
    }
  return { ok: true, slot, icon }
}

/**
 * The site path a slot value names, without Joomla's `#joomlaImage://…` tail; null when it names no picture.
 * @param {unknown} value
 * @returns {string | null}
 */
export function pictureOfSlotValue(value) {
  const file = String(value ?? '')
    .split('#')[0]
    .replace(/^\/+/, '')
  return SITE_PICTURE.test(file) ? file : null
}

/**
 * @param {{ params: Record<string, unknown>, platform: string | null,
 *   door: (body: Record<string, unknown>) => Promise<any>,
 *   imageSlots: (entity: string | null) => Promise<{ key: string, sample?: string, current?: string }[]>,
 *   readFile: (sitePath: string) => Promise<Buffer | null>,
 *   upload: (params: { apply_id: string, path: string, content_b64: string }) => Promise<any>,
 *   apply: (params: Record<string, unknown>) => Promise<any> }} deps
 */
export async function mediaIcon({ params, platform, door, imageSlots, readFile, upload, apply }) {
  const plan = planIcon(params)
  if (!plan.ok) return { ok: false, code: 'BAD_PARAMS', error: plan.error }
  if ('search' in plan) {
    const found = await door({ operation: 'search', query: plan.search })
    if (!found?.ok) return iconDoorRefusal(found)
    const icons = Array.isArray(found.icons) ? found.icons : []
    if (icons.length === 0)
      return {
        ok: true,
        icons: [],
        next: 'No icon in the library says those words: search again with a simpler word for the same thing (one noun).'
      }
    return {
      ok: true,
      icons,
      next: 'Choose the name that shows what the customer asked for, then media.icon {slot:"<the icon slot>", icon:"<that name>"}.'
    }
  }

  const pair = await door({ operation: 'pair', slot: plan.slot })
  if (!pair?.ok) {
    if (pair?.code === 'NOT_AN_ICON_SLOT')
      return {
        ok: false,
        code: 'NOT_AN_ICON_SLOT',
        error: `${plan.slot} holds a ${pair.kind ?? 'picture'}, not an icon: media.draw {prompt, slot} draws a picture for it.`
      }
    if (pair?.code === 'SLOT_UNKNOWN')
      return {
        ok: false,
        code: 'SLOT_UNKNOWN',
        error: `${plan.slot} is not a slot of this site's template kit: content.read names a picture's slot (field.slotKey).`
      }
    return iconDoorRefusal(pair)
  }
  const keys = /** @type {string[]} */ (pair.slots)
  /** @type {Map<string, { key: string, sample?: string, current?: string }>} */
  const known = new Map()
  for (const entity of new Set(keys.map((k) => k.split('.')[0])))
    for (const s of await imageSlots(entity)) known.set(s.key, s)
  const files = []
  for (const key of keys) {
    const slot = known.get(key)
    if (!slot)
      return {
        ok: false,
        code: 'SLOT_NOT_FOUND',
        error: `${key} is not an image slot of this site's contract; nothing was written.`
      }
    const template = pictureOfSlotValue(slot.sample)
    const current = pictureOfSlotValue(slot.current)
    const templateBytes = template ? await readFile(template) : null
    const currentBytes = current ? await readFile(current) : null
    if (!templateBytes && !currentBytes)
      return {
        ok: false,
        code: 'ICON_NOT_ON_SITE',
        error: `The icon ${key} shows is not in the site's folder, so its look cannot be read; nothing was written.`
      }
    files.push({
      slot: key,
      ...(templateBytes ? { template_b64: templateBytes.toString('base64') } : {}),
      ...(currentBytes ? { current_b64: currentBytes.toString('base64') } : {})
    })
  }
  const drawn = await door({ operation: 'draw', icon: plan.icon, files })
  if (!drawn?.ok) {
    if (drawn?.code === 'ICON_UNKNOWN')
      return {
        ok: false,
        code: 'ICON_UNKNOWN',
        error: `The library has no icon named ${plan.icon}: media.icon {query:"<what it shows>"} lists the names.`
      }
    return iconDoorRefusal(drawn)
  }
  /** @type {Record<string, string>} */
  const changes = {}
  for (const picture of drawn.pictures) {
    const path = `${pictureFolder(platform)}/${picture.sha256}.png`
    const uploaded = await upload({
      apply_id: `media-icon-${String(picture.sha256).slice(0, 16)}`,
      path,
      content_b64: picture.png_b64
    })
    if (!uploaded?.ok)
      return { ...(uploaded && typeof uploaded === 'object' ? uploaded : {}), ok: false, slot: picture.slot }
    changes[picture.slot] = path
  }
  const applied = await apply({ operation: 'apply', changes })
  if (!applied?.ok) return applied
  return {
    ...applied,
    icon: plan.icon,
    slots: changes,
    next: `The ${plan.icon} icon now shows in ${keys.length === 1 ? 'that slot' : `both themes (${keys.join(', ')})`}, in the template's look and colours. apply.revert with this receipt's apply_id puts the old icon back.`
  }
}

/**
 * A door answer that is not one of the refusals above, said without its internals.
 * @param {any} answer
 */
function iconDoorRefusal(answer) {
  const a = answer && typeof answer === 'object' ? answer : {}
  return {
    ok: false,
    code: typeof a.code === 'string' ? a.code : 'ICON_DOOR_FAILED',
    error:
      typeof a.error === 'string' && a.error !== ''
        ? `${a.error}. Nothing was written.`
        : 'Tracy could not pick or draw the icon just now; nothing was written. Tell the customer, and try once more later.'
  }
}
