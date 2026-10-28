/**
 * The link rules of the WordPress rule tables (spec #37, issue #43), for a version 3 map. A capture of every visible
 * text (`capture-contract.mjs --all-text`) writes a url slot for each button, menu link and link inside a sentence,
 * keyed beside its text: `<block>.url` (the link of the text slot `<block>`) and `<block>.link.<n>` (a link in it).
 * They place
 *   - a button: its label and its link, one contact card (a call to action);
 *   - a menu link block: its label and its link, one card; a social network is a contact;
 *   - a link inside a sentence: its role only, no card;
 * and only slots no other table placed. A link to another site that is not a social network is left for the
 * packaging agent: no role says what it is.
 */

const SOCIAL_HOST =
  /^https?:\/\/(?:[\w-]+\.)*(?:facebook|instagram|twitter|x|linkedin|youtube|tiktok|pinterest|threads|whatsapp|telegram)\.[a-z.]+(?:[/?#]|$)/i
const INTERNAL = /^(?:\/(?!\/)|#|\?|[\w-]+\.php|[\w-]+(?:\/|$))/i

/** The role of a link by what it points at, or null when no role says what it is. */
function linkRole(href) {
  const url = String(href).trim()
  if (/^mailto:/i.test(url)) return 'contact.email'
  if (/^tel:/i.test(url)) return 'contact.phone'
  if (SOCIAL_HOST.test(url)) return 'contact.social_url'
  if (INTERNAL.test(url) && !/^[a-z][a-z0-9+.-]*:/i.test(url)) return 'editorial.navigation_url'
  return null
}

/**
 * @param {any[]} slots the slots still without a role
 * @returns {Map<string, {groupId: string | null, entityKind?: string, itemIndex?: number, role: string}>}
 */
export function proposeWordpressLinks(slots) {
  const out = new Map()
  const byKey = new Map(slots.map((s) => [String(s.key), s]))
  for (const slot of slots) {
    if (slot.type !== 'url') continue
    const key = String(slot.key)
    const role = linkRole(slot.sample)
    if (key.endsWith('.url') && !key.includes('.link.')) {
      const base = key.slice(0, -4)
      const label = byKey.get(base)
      if (!label || label.type !== 'text' || !role) continue
      const social = role === 'contact.social_url'
      const menu = /\.navigation-link\.\d+$/.test(base) || /\.navigation-submenu\.\d+$/.test(base)
      if (menu && !social) {
        out.set(key, { groupId: `${base}`, entityKind: 'business', itemIndex: 0, role })
        out.set(base, {
          groupId: `${base}`,
          entityKind: 'business',
          itemIndex: 0,
          role: 'editorial.menu_label'
        })
      } else if (social) {
        out.set(key, { groupId: `${base}`, entityKind: 'contact', itemIndex: 0, role })
        out.set(base, {
          groupId: `${base}`,
          entityKind: 'contact',
          itemIndex: 0,
          role: 'contact.social_label'
        })
      } else if (role === 'editorial.navigation_url' && !menu) {
        out.set(key, { groupId: `${base}`, entityKind: 'contact', itemIndex: 0, role: 'contact.cta_url' })
        out.set(base, { groupId: `${base}`, entityKind: 'contact', itemIndex: 0, role: 'contact.cta_label' })
      } else out.set(key, { groupId: null, role })
      continue
    }
    if (key.includes('.link.') && role) out.set(key, { groupId: null, role })
  }
  return out
}
