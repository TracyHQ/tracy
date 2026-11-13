// The real JA Boxing block store, read for its declaration only, with every block that declares a child list placed on
// a page of its own, and invented items and rows for them (ticket #615). Nothing here is a real business or person; the
// profile links use real network hosts (the icon step knows networks by host) with invented handles.
import { readFileSync } from 'node:fs'
import { blocksOf } from '../../../domain/picture-step.mjs'
import { planDataOf } from '../../../domain/plan-data.mjs'
import { planRows } from '../../../domain/plan-rows.mjs'

const BOXING = new URL(
  '../../../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/block-store.json',
  import.meta.url
)
export const boxingStore = () => JSON.parse(readFileSync(BOXING, 'utf8'))

const sources = ['site']
const NETWORKS = [
  (h) => `https://instagram.com/${h}`,
  (h) => `https://facebook.com/${h}`,
  (h) => `https://youtube.com/@${h}`,
  (h) => `https://x.com/${h}`,
  (h) => `https://tiktok.com/@${h}`
]
/** The invented club's own links (business facts). */
export const CLUB_LINKS = [
  'https://instagram.com/invented-boxing-club',
  'https://youtube.com/@invented-boxing-club'
]
const row = (owner, n, fields) => ({ id: `${owner}-row-${n}`, fields, sources })

/** One invented item for a block: a coach with five links, else a class with three sessions and five features. */
function itemOf(block, n) {
  const id = `${block.id}-item-${n}`
  if (block.type === 'team')
    return {
      id,
      kind: 'person',
      fields: { 'person.name': { value: `Coach ${n}`, sources } },
      sources,
      rows: NETWORKS.map((link, r) =>
        row(id, r + 1, { 'person.social_url': { value: link(`coach-${n}-invented`) } })
      )
    }
  return {
    id,
    kind: 'service',
    fields: { 'offering.name': { value: `Class ${n}`, sources } },
    sources,
    rows: [
      ...[1, 2, 3].map((r) =>
        row(id, r, { 'offering.schedule': { value: [`Day ${r}`, `${r + 8}:00 to ${r + 9}:00`] } })
      ),
      ...[1, 2, 3, 4, 5].map((r) =>
        row(id, r + 3, { 'offering.description': { value: `Feature ${r} of class ${n}` } })
      )
    ]
  }
}

/** JA Boxing with every block that declares a child list placed, its rows planned by the rules. */
export function boxingPlan(store = boxingStore()) {
  const items = { service: [], person: [] }
  const pages = []
  for (const block of store.blocks.filter((b) => b.lists || b.itemLists)) {
    // A post shows the business's own rows (its points); a block of one class or coach shows that item's rows.
    const count = block.type === 'posts' ? 0 : block.lists ? 1 : block.items.max
    const data = []
    for (let n = 1; n <= count; n++) {
      const item = itemOf(block, n)
      items[item.kind].push(item)
      data.push(item.id)
    }
    if (block.id === 'block-180') data.splice(1, 0, 'contact-social-url', 'contact-social-url-2')
    pages.push({
      id: block.id,
      name: block.id,
      pageType: 'home',
      blocks: [{ id: 'b1', type: block.type, block: block.id, data }]
    })
  }
  const profile = {
    sources: [{ id: 'site', origin: 'website' }],
    facts: { 'contact.social_url': CLUB_LINKS.map((value) => ({ value, sources })) },
    items,
    rows: [1, 2, 3, 4, 5].map((n) =>
      row('business', n, { 'article.lead': { value: `Point ${n} of the article` } })
    )
  }
  const data = planDataOf(profile)
  const planned = planRows(pages, blocksOf(store), data)
  return {
    plan: { language: 'en', pages: planned.pages, pictures: {} },
    profile,
    data,
    dropped: planned.dropped
  }
}
