// Fixtures for the finisher's content orders (#422): a written site of an invented club whose words, demo phone, demo link,
// gallery alt and page title the orders repair, behind a fake site door that answers the contract door, `content.get`,
// `content.update` and `apply.revert` and records every write and revert. The club, its brief and its site are invented.
import { report, written } from './_site-check.mjs'
import { codesToHtml } from '../src/lib/site-copy/emphasis-markup.js'
import { benchSite, scriptedDoor, VERSION } from './_write-step-finisher.mjs'
import { SITE } from './_write-step-run.mjs'

export { benchSite, scriptedDoor }

/** The fault kind of the list each content order answers in these tests: the finder names a real kind. */
export const KIND_OF_ORDER = Object.freeze({
  'fix-link': 'bad-link',
  'remove-demo-item': 'demo-fact',
  'fix-alt': 'wrong-alt',
  'fix-title-meta': 'demo-title-meta',
  'mark-emphasis': 'lost-design'
})

export const HEADING = 'Harbour Strength Gym'
export const DEMO_PHONE = '+1 555 0100'
export const BRIEF_PHONE = '+44 20 7946 0123'
export const SEEN = 'Two athletes lifting barbells in a bright hall'
export const ABOUT_TITLE = 'About the Harbour Strength Club'

/** The kit: a heading stored as codes and one stored as HTML, a contact block, a gallery row, and the about page's block. */
export const BLOCKS = [
  {
    id: 'block-2',
    slots: [{ id: 'block-2.1', type: 'text', inline: [{ tag: 'span', text: 'Studio', at: 'end' }] }]
  },
  {
    id: 'block-5',
    slots: [
      { id: 'block-5.1', type: 'text' },
      { id: 'block-5.2', type: 'text' },
      { id: 'block-5.3', type: 'url' }
    ]
  },
  {
    id: 'block-6',
    slots: [
      { id: 'block-6.1', type: 'image' },
      { id: 'block-6.2', type: 'text' }
    ]
  },
  {
    id: 'block-7',
    slots: [{ id: 'block-7.1', type: 'text', inline: [{ tag: 'span', text: 'Coach', at: 'end' }] }]
  },
  { id: 'block-4', slots: [{ id: 'block-4.1', type: 'text' }] }
]

export const PAGES = [
  { id: 'page-home', path: '/', blocks: { 1440: ['block-2', 'block-5', 'block-6', 'block-7'] } },
  { id: 'page-about-us', path: '/about-us', blocks: { 1440: ['block-4'] } }
]

const KEPT_PAGES = [
  { id: 'page-home', path: '/' },
  { id: 'page-about-us', path: '/about' }
]

/** The content map: block-2.1 is read by the template as codes, block-7.1 is a text inside HTML. */
export const CONTENT_MAP = {
  slots: [
    { key: 'module-2.1', entity: 'module-2', nestedJson: 'jatools-config', jsonPath: ['title'] },
    { key: 'module-5.1', entity: 'module-5', sample: `Call ${DEMO_PHONE} today` },
    { key: 'module-5.2', entity: 'module-5', sample: 'Front desk of Demo Fitness' },
    { key: 'module-7.1', entity: 'module-7', column: 'content', xpath: '/h2' }
  ]
}

/** What the written site holds at the start, by content map key. */
export const heldAtStart = () => ({
  'module-2.1': HEADING,
  'module-5.1': `Call ${DEMO_PHONE} today`,
  'module-5.2': 'Front desk of Demo Fitness',
  'module-5.3': 'https://demo.example.test/contact',
  'module-6.1': 'images/tracy-content/hall.jpg',
  'module-6.2': 'Woman running on a beach',
  'module-7.1': 'Meet your Coach',
  'module-4.1': 'Our story began in a garage'
})

/** The menu item that opens the about page, whose params hold its title. */
const aboutRow = () => ({
  id: 102,
  params: JSON.stringify({ page_title: 'About Demo Fitness', show_title: 1 })
})

export const brief = (phones = [BRIEF_PHONE]) => ({
  facts: [
    { id: 'f-name', field: 'name', value: 'Harbour Strength Club' },
    ...phones.map((value, i) => ({ id: `f-phone-${i}`, field: 'phone', value }))
  ]
})

export const copy = () => ({
  version: 'site-copy/1',
  fingerprint: {
    kit: VERSION,
    planSha256: 'a'.repeat(64),
    briefSha256: 'b'.repeat(64),
    promptSha256: 'c'.repeat(64)
  },
  slots: [],
  alts: [{ frame: 'block-6.1', text: 'Our training hall' }],
  seo: [{ page: 'page-about-us', title: ABOUT_TITLE, description: 'Who we are and how we coach.' }],
  pages: []
})

export const sitePictures = () => ({
  version: 'site-pictures/1',
  frames: [{ frame: 'block-6.1', seen: SEEN }]
})

/** The write report of the run, its first site check kept on it, and the line of the about page's title. */
export function writtenRun(held = heldAtStart()) {
  const lines = Object.entries(held).map(([key, words]) => written(`block-${key.slice(7)}`, key, words))
  lines.push(
    written('page-about-us:title', null, 'About Demo Fitness', {
      owner: 'plan',
      readFrom: {
        action: 'content.get',
        params: { kind: 'menuItem', id: 102 },
        path: ['item', 'params', 'page_title']
      }
    })
  )
  return {
    id: 'run-1',
    siteKey: SITE,
    kit: VERSION,
    status: 'done',
    phase: 'done',
    report: {
      ...report(lines, { site: SITE, kit: VERSION, contract: VERSION, keptPages: KEPT_PAGES }),
      siteCheck: {
        version: 'site-check/1',
        status: 'green',
        allGroups: false,
        counts: { block: 0, warn: 0 },
        groups: []
      }
    }
  }
}

/**
 * The written site. A module's row reads its HTML slot as `content`; `content.update` and the contract door both keep, under
 * their apply id, what they changed, and `apply.revert` puts it back. `writes` and `reverts` are what a test reads.
 */
export function writtenSite(held = heldAtStart()) {
  const rows = { 'menuItem:102': aboutRow() }
  const writes = []
  const reverts = []
  const before = new Map()
  const rowOf = (kind, id) => {
    if (kind === 'module') return { id, content: held[`module-${id}.1`] }
    return rows[`${kind}:${id}`]
  }
  const door = {
    async apply({ action, params }) {
      if (action === 'apply.revert') {
        reverts.push(params.apply_id)
        const undo = before.get(params.apply_id)
        if (!undo) return { ok: false, error: 'not_found', message: 'no such apply' }
        undo()
        return { ok: true }
      }
      if (action === 'content.get') {
        const item = rowOf(params.kind, params.id)
        return item
          ? { ok: true, item: { ...item } }
          : { ok: false, error: 'not_found', message: 'no such row' }
      }
      if (action === 'content.update') {
        if (!params.apply_id) return { ok: false, error: 'bad_params', message: 'apply_id required' }
        writes.push({ applyId: params.apply_id, action, fields: { ...params.fields } })
        if (params.kind === 'module') {
          const key = `module-${params.id}.1`
          const was = held[key]
          before.set(params.apply_id, () => void (held[key] = was))
          held[key] = params.fields.content
        } else {
          const row = rows[`${params.kind}:${params.id}`]
          const was = { ...row }
          before.set(params.apply_id, () => void (rows[`${params.kind}:${params.id}`] = was))
          Object.assign(row, params.fields)
        }
        return { ok: true }
      }
      if (action !== 'content.contract') return { ok: false, error: 'unexpected_action' }
      if (params.operation === 'inspect')
        return {
          ok: true,
          contract: VERSION,
          revision: `rev-${writes.length + reverts.length + 1}`,
          pages: [
            { entity: 'menuItem-101', route: 'home' },
            { entity: 'menuItem-102', route: 'about' }
          ],
          slots: Object.entries(held).map(([key, current]) => ({
            key,
            entity: key.slice(0, key.lastIndexOf('.')),
            type: 'text',
            current
          }))
        }
      if (params.operation !== 'apply' || !params.apply_id)
        return { ok: false, error: 'bad_params', message: 'apply_id required' }
      writes.push({ applyId: params.apply_id, action, changes: { ...params.changes } })
      const was = Object.fromEntries(Object.keys(params.changes).map((k) => [k, held[k]]))
      before.set(params.apply_id, () => Object.assign(held, was))
      Object.assign(held, params.changes)
      return { ok: true }
    }
  }
  return { door, held, rows, writes, reverts }
}

/** The finder's answer naming one fault on the home page (a demo fact unless the test names the kind). */
export const finding = (over = {}) => ({
  faults: [
    {
      page: '/',
      viewport: 'desktop',
      tile: 0,
      slot: 'block-5.1',
      kind: 'demo-fact',
      seen: 'a fault',
      ...over
    }
  ]
})

/**
 * The page as the site serves it now, read from the written site's state: the about page's title from its row, the contact
 * link and the gallery alt from their slots. A link to a menu item is served at its routed address, as Joomla prints it.
 */
export function servedPage(site) {
  return async ({ path: page }) => {
    const title = page === '/about' ? JSON.parse(site.rows['menuItem:102'].params).page_title : 'Home'
    const link = site.held['module-5.3'].replace(/^index\.php\?Itemid=102$/, '/index.php/about')
    // The template prints emphasis codes as a span, as the real one does.
    const heading = codesToHtml(site.held['module-2.1'])
    return `<html><head><title>${title}</title></head><body><h2>${heading}</h2><p>${site.held['module-5.1']}</p><a href="${link}">Contact</a><img src="/${site.held['module-6.1']}" alt="${site.held['module-6.2']}"><h3>${site.held['module-7.1']}</h3></body></html>`
  }
}
