// A button of a contact block or an offering card that would say a bare "Contact" names the action it leads to (spec
// TracyHQ/tracy#189, COO rule 29/10/2026). Measured 29/10/2026 on a brief build of a Joomla T4 template: every class card
// carried a "Contact" button that opened the class's own page, not a way to reach the business.
//
// 🔒 BY SLOT ROLE AND GROUP, NEVER BY TEMPLATE: a button label (ADR 0040 roles) whose group holds no link of its own is a
// button the template links to the card's page, so it says "Learn more"; one whose link is the Contact page keeps that link
// and says how it helps ("How to reach us"). A label never promises a booking or a call it does not lead to. The words are
// a decision with `when: 'bare-contact'`: the writer uses them only where the words written are a bare "Contact"
// (`hero-lines.js`), so a button the copy writer already named by its action keeps its words. The hero is decided by
// `hero-first-screen.mjs`; a line inside an article is not a block's button.

const LABEL_ROLES = new Set(['contact.cta_label', 'editorial.button_label', 'offering.cta_label'])
const list = (v) => (Array.isArray(v) ? v : [])

/** The Contact page's link in a content map (`index.php?Itemid=<id>`), or null. */
function contactPageOf(contentMap) {
  const page = list(contentMap?.pages).find(
    (p) => /contact/i.test(String(p?.route ?? '')) || /com_contact/.test(String(p?.link ?? ''))
  )
  const id = /menuItem-(\d+)/.exec(String(page?.entity ?? ''))?.[1]
  return id ? `index.php?Itemid=${id}` : null
}

const samePage = (a, b) =>
  String(a ?? '')
    .replace(/^\//, '')
    .toLowerCase() ===
  String(b ?? '')
    .replace(/^\//, '')
    .toLowerCase()

/**
 * @param {{slots?: any[], pages?: any[]} | null} contentMap
 * @param {{heroEntity?: string | null}} [options]
 * @returns {Array<{key: string, role: string, decision: 'value', value: string, reason: 'cta-action', when: 'bare-contact'}>}
 */
export function contactButtonSlots(contentMap, { heroEntity = null } = {}) {
  const slots = list(contentMap?.slots)
  const contactPage = contactPageOf(contentMap)
  const urlsOf = (group) => slots.filter((s) => s.type === 'url' && group && s.group?.id === group)
  const out = []
  for (const slot of slots) {
    if (slot.type !== 'text' || !LABEL_ROLES.has(slot.role)) continue
    const entity = String(slot.entity ?? slot.key.split('.')[0])
    if (!entity.startsWith('module-') || entity === heroEntity) continue
    const urls = urlsOf(slot.group?.id)
    let value = null
    if (urls.length === 0) value = 'Learn more'
    else if (
      urls.some((u) => (contactPage && samePage(u.sample, contactPage)) || /contact/i.test(String(u.sample)))
    )
      value = 'How to reach us'
    if (value)
      out.push({
        key: slot.key,
        role: slot.role,
        decision: 'value',
        value,
        reason: 'cta-action',
        when: 'bare-contact'
      })
  }
  return out
}
