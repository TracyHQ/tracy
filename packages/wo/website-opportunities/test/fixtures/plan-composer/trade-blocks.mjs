// Invented blocks that explain how a trade works, added to the invented block store for the trade knowledge tests
// (#575): a repeating block of written copy only, a single block of written copy only, and a block that also has a
// field for a fact of the business. No real template or business.
import { blockStore, goodComposition, pageRecipes } from './invented-club.mjs'

const text = (name, kind, limit) => ({ name, kind, type: 'text', limit })
const places = (name) => [1, 2, 3].map((n) => `first-visit.item${n}.${name}`)

export const TRADE_BLOCKS = Object.freeze({
  /** How a first lesson runs, stage by stage: every field is written copy. */
  firstVisit: 'first-visit',
  /** What to bring: one heading and one paragraph of written copy. */
  whatToBring: 'what-to-bring',
  /** The club's story with a quote: the quote is a fact of the business. */
  story: 'club-story'
})

const tradeBlocks = () => [
  {
    id: TRADE_BLOCKS.firstVisit,
    name: 'Your first lesson',
    type: 'services',
    positions: ['body'],
    items: { min: 1, max: 3 },
    noData: { rule: 'hide' },
    itemsLabel: 'Stages',
    fields: [text('heading', 'editorial.heading', 40), text('intro', 'editorial.paragraph', 200)],
    itemFields: [
      { ...text('stage_title', 'editorial.heading', 30), slots: places('stage_title') },
      { ...text('stage_text', 'editorial.paragraph', 120), slots: places('stage_text') }
    ]
  },
  {
    id: TRADE_BLOCKS.whatToBring,
    name: 'What to bring',
    type: 'text',
    positions: ['body'],
    items: { min: 1, max: 1 },
    noData: { rule: 'hide' },
    fields: [text('heading', 'editorial.heading', 40), text('body', 'editorial.paragraph', 300)]
  },
  {
    id: TRADE_BLOCKS.story,
    name: 'Our story',
    type: 'about',
    positions: ['body'],
    items: { min: 1, max: 1 },
    noData: { rule: 'hide' },
    fields: [
      text('heading', 'editorial.heading', 40),
      text('story', 'editorial.paragraph', 300),
      text('quote', 'quote.text', 200)
    ]
  }
]

/** The invented block store with the trade blocks. */
export function tradeStore() {
  const store = blockStore()
  store.blocks.push(...tradeBlocks())
  return store
}

/** The invented recipes with the trade blocks on the home page, before its contact block. */
export function tradeRecipes() {
  const recipes = pageRecipes()
  const home = recipes.recipes.find((r) => r.pageType === 'home')
  home.blocks.splice(home.blocks.indexOf('contact-strip'), 0, ...Object.values(TRADE_BLOCKS))
  return recipes
}

/** A trade block of a composition: written from general knowledge of the trade, citing the activity's fact. */
export const tradeBlock = (block, factIds, extra = {}) => ({
  block,
  label: 'Your first lesson',
  data: [],
  reason: 'New players see how a first lesson goes before they book one.',
  basis: 'trade',
  factIds,
  ...extra
})

/** The good composition with a trade block on the home page, before the contact block. */
export function tradeComposition(
  block = tradeBlock(TRADE_BLOCKS.firstVisit, ['service-adult-group-lessons'])
) {
  const c = goodComposition()
  const home = c.pages[0].blocks
  home.splice(
    home.findIndex((b) => b.block === 'contact-strip'),
    0,
    block
  )
  return c
}
