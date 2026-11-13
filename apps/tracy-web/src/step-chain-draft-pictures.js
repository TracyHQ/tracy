// The customer's pictures of an assembled run (#597).
//
// DRAFT PICTURES. The build chat's research stores the customer's pictures before a site exists (manifest entries of
// origin `draft`). The profile names each by its web address (`ref`) and, for a gallery photo, its manifest id
// (`pictureId`). Their bytes are opened through the injected `openDraftPicture(id, {accountId})`, and the vision call
// is shown those bytes (a `data:` address) in place of the web address. 🔒 ONLY STORED BYTES COUNT: a picture value
// with no stored picture behind it, or one that cannot be opened (`null`, a throw, no bytes: gone, changed, pruned,
// another account's), is a MISSING picture, never a build stop and never fetched from its web address: its value
// leaves the profile, so the picture policy treats its frame as one with no own photo (drawn when drawable, hidden
// otherwise). The vision call is never sent a web address (`visionThrough` refuses one).
//
// HELD TEXTS. A picture whose own texts name a held person or the held business name (its research or vision label,
// its file name or address, its item's id, label, alt, caption or title, as words or in a slug) is refused
// (`refusedPicture`): never shown to the vision call when its texts already name one, never placed, its frame left
// to the picture policy, which never draws a person. The alt text hand-off lives in `step-chain-draft-alt.js`.
import { heldTextsOf, itemTextsOf, namesHeldInAnyForm } from 'website-opportunities/domain/plan-withheld.mjs'
import { draftError } from './step-chain-draft-source.js'

export { altProblemsOf, withAltTexts } from './step-chain-draft-alt.js'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const IMAGE_FIELD = /(?:\.image|_image|_logo)$/

/**
 * The profile with its draft pictures opened: the vision call's address of each opened one (`refs`), the stored ids
 * used and missing, and `unstored`: picture values with no stored picture behind them (left out like a missing one).
 * @param {{profile: object, manifest?: object[], accountId: string,
 *   openDraftPicture?: (id: string, opts: {accountId: string}) => Promise<{bytes: Uint8Array, mime?: string} | null>}} input
 * @returns {Promise<{profile: object, refs: Map<string, string>, used: string[], missing: string[], unstored: number}>}
 */
export async function withDraftPictures({ profile, manifest, accountId, openDraftPicture }) {
  const drafts = list(manifest).filter((m) => m?.origin === 'draft' && isText(m.id))
  const byId = new Map(drafts.map((m) => [m.id, m]))
  const byUrl = new Map(drafts.filter((m) => isText(m.sourceUrl)).map((m) => [m.sourceUrl, m]))
  const refs = new Map()
  const used = []
  const missing = []
  let unstored = 0
  const opened = new Map()
  const open = async (entry) => {
    if (!opened.has(entry.id)) {
      let got = null
      try {
        got = typeof openDraftPicture === 'function' ? await openDraftPicture(entry.id, { accountId }) : null
      } catch {
        got = null
      }
      opened.set(entry.id, got?.bytes instanceof Uint8Array && got.bytes.length > 0 ? got : null)
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
        const got = entry ? await open(entry) : null
        if (!got) {
          if (entry) missing.push(entry.id)
          else unstored += 1
          fields[role] = { ...field, value: null }
          continue
        }
        used.push(entry.id)
        const mime = isText(got.mime) ? got.mime : isText(entry.mime) ? entry.mime : 'image/jpeg'
        refs.set(field.value, `data:${mime};base64,${Buffer.from(got.bytes).toString('base64')}`)
      }
      items[kind].push({ ...item, fields })
    }
  }
  return {
    profile: { ...profile, items },
    refs,
    used: [...new Set(used)],
    missing: [...new Set(missing)],
    unstored
  }
}

/**
 * The vision call of the build model, shown the opened bytes of a draft picture in place of its web address. An image
 * with no opened bytes is never sent: the call stops typed (`picture_not_opened`), as no such picture can be asked for.
 */
export const visionThrough = (model, refs) => (request) => {
  const images = list(request?.images).map((ref) => refs.get(ref) ?? null)
  if (images.some((image) => image === null))
    throw draftError(
      'picture_not_opened',
      'the vision call was asked for a picture whose stored bytes were not opened'
    )
  return model({ ...request, images })
}

/**
 * Whether a picture record of the pictures step names a held text (`withheld` of the full profile) in its own texts:
 * its label (research or vision), its address and file name, its id and its item's texts in `profile`.
 */
export function refusedPicture(withheld, profile) {
  const held = heldTextsOf(withheld)
  if (held.length === 0) return () => false
  const items = itemsOf(profile)
  return (picture) =>
    namesHeldInAnyForm(
      [picture?.label, picture?.ref, picture?.id, picture?.item, ...itemTextsOf(items.get(picture?.item))],
      held
    )
}

/** Every item of the profile by id. */
const itemsOf = (profile) =>
  new Map(
    Object.values(profile?.items ?? {})
      .flat()
      .filter((i) => isText(i?.id))
      .map((i) => [i.id, i])
  )
