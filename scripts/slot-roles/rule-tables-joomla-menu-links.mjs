/**
 * The menu link rule of the Joomla rule tables: a menu entry of type `url` has a `link` slot, the address it opens
 * (`capture-contract.py`). An entry that is a social network, by that address or by its title naming the network
 * (JA Impact's "Follow us" menu: Twitter, Facebook, Instagram, Threads, each opening `#`), is one contact card, its
 * title the label and its link the address. Each entry of one menu shows its own profile: the nth social entry of a
 * menu is item n, so four entries never all print the business's first profile.
 */

const NETWORK = 'facebook|instagram|twitter|x|linkedin|youtube|tiktok|pinterest|threads|whatsapp|telegram'
const SOCIAL_HOST = new RegExp(`^https?://(?:[\\w-]+\\.)*(?:${NETWORK})\\.[a-z.]+(?:[/?#]|$)`, 'i')
const SOCIAL_TITLE = new RegExp(`^(?:${NETWORK})$`, 'i')

/**
 * @param {any[]} slots the slots still without a role
 * @param {Map<string, string>} [menutypeOf] menu entry entity -> its menu, to count entries per menu
 * @returns {Map<string, {groupId: string, entityKind: string, itemIndex: number, role: string}>}
 */
export function proposeJoomlaMenuLinks(slots, menutypeOf = new Map()) {
  const out = new Map()
  const titleOf = new Map()
  for (const s of slots)
    if (String(s.entity ?? '').startsWith('menuItem-') && s.column === 'title' && s.type === 'text')
      titleOf.set(s.entity, s)
  const count = new Map()
  for (const slot of slots) {
    const entity = String(slot.entity ?? '')
    if (!entity.startsWith('menuItem-') || slot.column !== 'link' || slot.type !== 'url') continue
    const title = titleOf.get(entity)
    const social =
      SOCIAL_HOST.test(String(slot.sample ?? '').trim()) ||
      SOCIAL_TITLE.test(String(title?.sample ?? '').trim())
    if (!social) continue
    const menu = menutypeOf.get(entity) ?? ''
    const itemIndex = count.get(menu) ?? 0
    count.set(menu, itemIndex + 1)
    const card = { groupId: `${entity}.social`, entityKind: 'contact', itemIndex }
    out.set(String(slot.key), { ...card, role: 'contact.social_url' })
    if (title) out.set(String(title.key), { ...card, role: 'contact.social_label' })
  }
  return out
}
