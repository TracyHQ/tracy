// The menus of the JA Boxing florist's draft write fixture (ticket #597, `boxing-site.mjs`): the phone menu (block-187,
// the main menu) and a footer menu (block-174, the site-map menu) on the home and contact pages, and their items as a
// write order gives them. Invented data.

const MENUS = [
  ['m1', 'block-187', 'header'],
  ['m2', 'block-174', 'footer']
]
/** The phone menu and a footer menu on the home and contact pages (the plan blocks; their items come after). */
export function withMenus(plan) {
  for (const page of plan.pages.filter((p) => p.pageType === 'home' || p.pageType === 'contact'))
    for (const [n, id, type] of MENUS)
      page.blocks.push({
        id: `${page.id}-${n}`,
        type,
        block: id,
        source: 'template',
        label: id,
        data: [],
        reason: 'Shown.'
      })
}

/**
 * The items of the two menu blocks, in the shape the write order gives a menu entry (an item that is a page: a label
 * the writer wrote and the derived address of that page). The plan has no page ids among its data, so the order leaves
 * these blocks to their fallback; the write step must still handle menu items when an order carries them.
 */
export function withMenuItems(order, kit) {
  const targets = {
    'block-187': ['home', 'classes', 'contact'],
    'block-174': ['classes', 'plans', 'contact']
  }
  const labels = { home: 'Start', classes: 'Bouquets', plans: 'Plans', contact: 'Find us' }
  for (const page of order.pages)
    for (const block of page.blocks.filter((b) => targets[b.block])) {
      const field = kit.blockStore.blocks.find((b) => b.id === block.block).itemFields[0]
      block.items = targets[block.block].map((target) => {
        const at = `${block.at}.${target}`
        const link = { place: `${at}.link`, derived: 'the page address', target: { page: target } }
        order.derived.push(link)
        order.hidden = order.hidden.filter((h) => !h.at.startsWith(`${block.at}.`) && h.at !== block.at)
        return {
          id: target,
          data: target,
          at,
          declared: [
            { name: 'label', type: 'text' },
            { name: 'link', type: 'link' }
          ],
          fields: [
            {
              key: `${block.id}/${target}/label`,
              place: `${at}.label`,
              field: 'label',
              kind: field.kind,
              type: 'text',
              limit: field.limit,
              slots: field.slots,
              from: 'writer',
              value: labels[target]
            },
            {
              key: `${block.id}/${target}/link`,
              place: `${at}.link`,
              field: 'link',
              kind: 'editorial.navigation_url',
              type: 'link',
              from: 'derived',
              ...link
            }
          ],
          pictures: [],
          icons: [],
          lists: [],
          state: 'show'
        }
      })
      block.counts = { ...block.counts, available: block.items.length, shown: block.items.length }
      block.state = 'show'
      delete block.reason
      delete block.fallback
    }
}
