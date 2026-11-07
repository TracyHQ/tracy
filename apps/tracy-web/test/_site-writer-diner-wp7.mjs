// Fixtures for the site writer on WordPress (#463): the committed JA Diner WP7 contract (template kit, content map,
// navigation source) with an invented plan, brief and writer answer for the invented "Lantern Kitchen". Everything is
// built from the kit at test time, never from block ids or counts written here: the kit's page blocks may be split
// again, and the tests must hold the same. The plan keeps the home, about and contact pages (each with its first text
// slot), and keeps one dropdown child under Home (the red home page), so every kind of main menu item is present.
import { defaultContracts } from '../src/lib/contracts.js'
import { openContentMap } from '../src/lib/content-map-source.js'
import { mainMenuOf } from '../src/lib/site-copy/main-menu.js'
import { openKit } from '../src/lib/template-kit-source.js'

export const DINER_REF = 'ja-diner/wp7/1.0.1'

/** A contract index holding only the Diner WP7 contract, as the repository ships it. */
export function dinerIndex() {
  for (const [key, contract] of defaultContracts())
    if (contract.id === DINER_REF) return new Map([[key, contract]])
  throw new Error(`no contract ${DINER_REF} in the repository`)
}

export const dinerKit = () => openKit(DINER_REF, { index: dinerIndex() })
export const dinerContentMap = () => openContentMap(DINER_REF, { index: dinerIndex() })

const KEPT = ['page-home', 'page-about-us', 'page-contact-us']

/** The first body block (page-body or section, else hero) of a page that has a text slot, and that slot. */
function firstTextOf(kitDoc, pageId) {
  const page = kitDoc.pages.find((p) => p.id === pageId)
  const ids = page.blocks['1440'] ?? Object.values(page.blocks)[0]
  for (const roles of [['page-body', 'section'], ['hero']]) {
    for (const id of ids) {
      const block = kitDoc.blocks.find((b) => b.id === id)
      if (!block || !roles.includes(block.role)) continue
      const slot = (block.slots ?? []).find((s) => s.type === 'text' && s.maxCharacters >= 20)
      if (slot) return { block: block.id, slot }
    }
  }
  throw new Error(`${pageId} has no body or hero block with a text slot`)
}

export function brief() {
  return {
    language: 'en',
    facts: [
      { id: 'f-name', field: 'name', value: 'Lantern Kitchen', source: 'stated' },
      { id: 'f-hours', field: 'hours', value: 'Open 11:00 to 22:00, Tuesday to Sunday', source: 'stated' },
      { id: 'f-phone', field: 'phone', value: '+000 555 0199', source: 'stated' }
    ],
    reviews: [],
    missing: []
  }
}

export function plan(kitDoc = dinerKit().doc) {
  const keep = (pageId) => {
    const { block, slot } = firstTextOf(kitDoc, pageId)
    return {
      id: pageId,
      decision: 'keep',
      blocks: [
        {
          block,
          seen: 'seen',
          decision: 'keep',
          why: 'fits',
          copy: [{ slot: slot.id, says: 'what the kitchen serves', factIds: ['f-name'], basis: 'brief' }]
        }
      ]
    }
  }
  return {
    version: 'site-plan/3',
    kit: `${kitDoc.kit} ${kitDoc.contract}`,
    brief: 'opp-lantern-kitchen',
    site: { language: 'en', voice: { summary: 'warm and plain', ownWords: [], avoid: [] }, forbidden: [] },
    sharedBlocks: [],
    pages: KEPT.map(keep),
    mainMenu: [
      {
        page: 'page-home',
        intent: 'Start here',
        children: [{ page: 'page-home_home-red', intent: 'The seasonal menu' }]
      },
      { page: 'page-about-us', intent: 'Who cooks', children: [] },
      { page: 'page-contact-us', intent: 'Book a table', children: [] }
    ]
  }
}

const MENU_WORDS = ['Home', 'Seasonal menu', 'Our kitchen', 'Book a table']

/**
 * What a writing turn answers: every writer slot of the plan and of the main menu, with short invented words that fit
 * the slot's limit, an SEO entry per kept page, and the empty lists the copy needs.
 */
export function writerAnswer(kitDoc = dinerKit().doc, contentMap = dinerContentMap().doc) {
  const p = plan(kitDoc)
  const words = {
    'page-home': 'Lantern Kitchen serves slow cooked plates from the market every day',
    'page-about-us': 'Two cooks and one wood oven, in a quiet street since the spring',
    'page-contact-us': 'Write or call us to book a table for lunch or for dinner'
  }
  const seo = {
    'page-home': [
      'Lantern Kitchen, market plates',
      'Slow cooked plates from the market, open Tuesday to Sunday.'
    ],
    'page-about-us': [
      'About the cooks of Lantern Kitchen',
      'Two cooks, one wood oven and a short menu that changes often.'
    ],
    'page-contact-us': [
      'Book a table at Lantern Kitchen',
      'Reserve by phone for lunch or dinner, from 11:00 to 22:00.'
    ]
  }
  const slots = p.pages.flatMap((page) =>
    page.blocks.flatMap((b) =>
      b.copy.map((c) => {
        const max = firstTextOf(kitDoc, page.id).slot.maxCharacters
        return {
          slot: c.slot,
          owner: 'writer',
          text: words[page.id].slice(0, max).trim(),
          factIds: ['f-name']
        }
      })
    )
  )
  const menu = mainMenuOf({ plan: p, kit: kitDoc, contentMap })
  menu.slots.forEach((s, i) =>
    slots.push({ slot: s.slot, owner: 'writer', text: MENU_WORDS[i % MENU_WORDS.length], factIds: [] })
  )
  return {
    slots,
    alts: [],
    seo: KEPT.map((page) => ({ page, title: seo[page][0], description: seo[page][1] })),
    pages: [],
    notebook: [],
    returns: []
  }
}
