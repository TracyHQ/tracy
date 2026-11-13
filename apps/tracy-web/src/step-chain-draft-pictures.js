// The customer's pictures of an assembled run (#597) and the alt text hand-off from the pictures step to the write
// order.
//
// DRAFT PICTURES. The build chat's research stores the customer's pictures before a site exists (manifest entries of
// origin `draft`). The profile names each by its web address (`ref`) and, for a gallery photo, its manifest id
// (`pictureId`). Their bytes are opened through the injected `openDraftPicture(id, {accountId})`, and the vision call
// is shown those bytes (a `data:` address) in place of the web address. A picture that cannot be opened (`null`: gone,
// changed, pruned) is a MISSING picture, never a build stop: its value leaves the profile, so the picture policy
// treats its frame as one with no own photo (drawn when drawable, hidden otherwise).
//
// ALT TEXT. The write order owns alt text (`write-order-block.mjs`): an own picture says its label, a drawn one its
// label or its item's, an initials avatar the person's name. The labels are made by the vision call, which is asked
// for no language, so they are read as English. The hand-off runs after the pictures step and the writer, before the
// order is built: every placed frame gets an alt in the site language and naming nothing held off the site. On a site
// not in English the alt is the item's own label (the business's words), else the site name. `altProblemsOf` checks the
// built order.
import { heldTextsOf, namesHeld } from 'website-opportunities/domain/plan-withheld.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isEnglish = (language) => !isText(language) || /^en(?:[-_]|$)/i.test(language)
const IMAGE_FIELD = /(?:\.image|_image|_logo)$/

/**
 * The profile with its draft pictures opened: the vision call's address of each opened one (`refs`), the ids used and
 * missing. A picture of any other origin is left as it is.
 * @param {{profile: object, manifest?: object[], accountId: string,
 *   openDraftPicture?: (id: string, opts: {accountId: string}) => Promise<{bytes: Buffer, mime?: string} | null>}} input
 * @returns {Promise<{profile: object, refs: Map<string, string>, used: string[], missing: string[]}>}
 */
export async function withDraftPictures({ profile, manifest, accountId, openDraftPicture }) {
  const drafts = list(manifest).filter((m) => m?.origin === 'draft' && isText(m.id))
  const byId = new Map(drafts.map((m) => [m.id, m]))
  const byUrl = new Map(drafts.filter((m) => isText(m.sourceUrl)).map((m) => [m.sourceUrl, m]))
  const refs = new Map()
  const used = []
  const missing = []
  const opened = new Map()
  const open = async (entry) => {
    if (!opened.has(entry.id)) {
      let got = null
      try {
        got = typeof openDraftPicture === 'function' ? await openDraftPicture(entry.id, { accountId }) : null
      } catch {
        got = null
      }
      opened.set(entry.id, Buffer.isBuffer(got?.bytes) ? got : null)
    }
    return opened.get(entry.id)
  }
  const items = {}
  for (const [kind, values] of Object.entries(profile?.items ?? {})) {
    items[kind] = []
    for (const item of list(values)) {
      const fields = { ...item?.fields }
      for (const [role, field] of Object.entries(fields)) {
        if (!IMAGE_FIELD.test(role) || !isText(field?.value)) continue
        const entry =
          (role === 'business.gallery_image' && byId.get(item.pictureId)) || byUrl.get(field.value)
        if (!entry) continue
        const got = await open(entry)
        if (!got) {
          missing.push(entry.id)
          fields[role] = { ...field, value: null }
          continue
        }
        used.push(entry.id)
        const mime = isText(got.mime) ? got.mime : isText(entry.mime) ? entry.mime : 'image/jpeg'
        refs.set(field.value, `data:${mime};base64,${got.bytes.toString('base64')}`)
      }
      items[kind].push({ ...item, fields })
    }
  }
  return { profile: { ...profile, items }, refs, used: [...new Set(used)], missing: [...new Set(missing)] }
}

/** The vision call of the build model, shown the opened bytes of a draft picture in place of its web address. */
export const visionThrough = (model, refs) => (request) =>
  model({ ...request, images: list(request?.images).map((ref) => refs.get(ref) ?? ref) })

/** The site name: the business name the profile shows (the neutral identity while the real one is held). */
const siteNameOf = (profile) =>
  list(profile?.facts?.['business.name']).find((f) => isText(f?.value))?.value ?? null

/** Every item of the profile by id. */
const itemsOf = (profile) =>
  new Map(
    Object.values(profile?.items ?? {})
      .flat()
      .filter((i) => isText(i?.id))
      .map((i) => [i.id, i])
  )

const itemLabelOf = (item) =>
  isText(item?.label)
    ? item.label
    : (Object.entries(item?.fields ?? {}).find(([role, f]) => role.endsWith('.name') && isText(f?.value))?.[1]
        ?.value ?? null)

/**
 * The frames of the pictures step with the alt text the write order reads (`label`) settled for every own and drawn
 * picture: the vision label on an English site, else the item's own label, else the site name, always the first of
 * them that names nothing held off the site (`withheld` of the full profile).
 * @param {object[]} frames the `frames` of `placeBuildPictures`
 * @param {{profile: object, language?: string, withheld?: object}} context the profile the order is built from
 */
export function withAltTexts(frames, { profile, language, withheld }) {
  const held = heldTextsOf(withheld)
  const clean = (text) => isText(text) && !namesHeld([text], held)
  const items = itemsOf(profile)
  const site = siteNameOf(profile)
  return list(frames).map((frame) => {
    if (frame?.source !== 'own' && frame?.source !== 'generated') return frame
    const item = frame.item ? items.get(frame.item) : null
    const choices = [isEnglish(language) ? frame.label : null, itemLabelOf(item), site]
    const alt = choices.find(clean) ?? null
    return { ...frame, label: alt }
  })
}

/** Every placed picture of a built order whose alt text is missing or names something held off the site. */
export function altProblemsOf(order, withheld) {
  const held = heldTextsOf(withheld)
  const problems = []
  for (const picture of list(order?.pictures)) {
    if (!['own', 'generated', 'initials'].includes(picture?.source)) continue
    if (!isText(picture.alt)) problems.push({ code: 'alt_text_missing', frame: picture.frame })
    else if (namesHeld([picture.alt], held))
      problems.push({ code: 'alt_text_withheld', frame: picture.frame })
  }
  return problems
}
