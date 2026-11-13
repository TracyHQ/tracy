// The text of a child list row field that names a network (ticket #615, Contract A `textOf: "network"`, coming with
// #584): a social row's label is the display name of the network of the link in the same row. It is data, never copy:
// it is not sent to the model, and it follows the icon step's own network detection (`icon-social.mjs`), so the label
// and the network icon of a row always name the same network. A row with no usable link has no label. Pure.
import { networkOf, socialReasonOf } from './icon-social.mjs'
import { SOCIAL_URL_KINDS } from './picture-block-places.mjs'

/** The `textOf` value of a row text field filled with the network of the row's link. */
export const TEXT_OF_NETWORK = 'network'
const NAMES = Object.freeze({
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  threads: 'Threads',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  snapchat: 'Snapchat'
})

/** The display name of the network a link is on, or null when the icon step finds no network for it. */
export function networkNameOf(link) {
  if (socialReasonOf(link)) return null
  const network = networkOf(link)?.network
  return network ? (NAMES[network] ?? network.charAt(0).toUpperCase() + network.slice(1)) : null
}

/**
 * The network name a `textOf: "network"` field of a row shows: the network of the row's link, read from the row values
 * (data kind -> parts) of the link kind the list's own link field declares (else any social kind).
 * @param {object[]} fields the list's fields
 * @param {Record<string, string[]>} values the row's values
 */
export function rowNetworkNameOf(fields, values) {
  const own = fields.find((f) => SOCIAL_URL_KINDS.includes(f?.kind))?.kind
  const kinds = own ? [own] : SOCIAL_URL_KINDS
  for (const kind of kinds) {
    const link = values?.[kind]?.[0]
    if (link) return networkNameOf(link)
  }
  return null
}
