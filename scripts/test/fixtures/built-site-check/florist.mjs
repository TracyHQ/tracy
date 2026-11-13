// An invented florist built from an invented AI quickstart kit, for the built site check tests (ticket #601). Every
// business, person and sentence here is made up. The "demo" sentences stand for a template's demo text; they are
// declared demo by this fixture only.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const HELD_PERSON = 'Odalys Brenwick'
export const DEMO_SENTENCES = ['Train like a champion every day.', 'Join the ring tonight.']
export const DEMO_IMAGE = 'images/demo/ring-fighter.jpg'

export const kit = () => ({
  blockStore: {
    schema: 'tracy-ai-quickstart-block-store/v1',
    blocks: [
      {
        id: 'hero-main',
        type: 'hero',
        fields: [
          { name: 'heading', kind: 'editorial.heading', type: 'text', limit: 40, slot: 'module-10.0' },
          { name: 'design-overlay', type: 'design', slot: 'module-10.3', designFrom: 'overlay.params' }
        ]
      },
      {
        id: 'intro-text',
        type: 'text',
        fields: [
          { name: 'paragraph', kind: 'editorial.paragraph', type: 'text', limit: 60, slot: 'module-11.0' },
          { name: 'note', kind: 'editorial.paragraph', type: 'text', limit: 23, slot: 'module-11.1' }
        ]
      }
    ]
  },
  mapping: {
    blocks: {
      'hero-main': {
        fields: {
          heading: { slot: 'module-10.0', entity: 'module-10', column: 'title' },
          'design-overlay': {
            slot: 'module-10.3',
            entity: 'module-10',
            column: 'params',
            jsonPath: ['overlay']
          }
        },
        designLines: [{ slot: 'module-10.4', entity: 'module-10', column: 'params', jsonPath: ['gutter'] }]
      },
      'intro-text': {
        fields: {
          paragraph: { slot: 'module-11.0', entity: 'module-11', column: 'content' },
          note: { slot: 'module-11.1', entity: 'module-11', column: 'params', jsonPath: ['note'] }
        }
      }
    },
    networkIconClasses: {
      classes: { facebook: 'fab fa-facebook', instagram: 'fab fa-instagram' },
      why: 'invented'
    }
  },
  contentMap: {
    slots: [
      { key: 'module-10.0', entity: 'module-10', column: 'title', sample: 'Demo hero heading' },
      { key: 'module-10.3', entity: 'module-10', column: 'params', sample: 'dark-60' },
      { key: 'module-10.4', entity: 'module-10', column: 'params', sample: '24' },
      {
        key: 'module-12.9',
        entity: 'module-12',
        column: 'params',
        sample: 'wide',
        role: 'editorial.design_element'
      }
    ]
  }
})

export const approval = () => ({
  plan: {
    id: 'plan-1',
    pages: [
      { id: 'home', pageType: 'home', name: 'Home', blocks: [] },
      { id: 'services', pageType: 'services', name: 'Bouquets', blocks: [] },
      { id: 'contact', pageType: 'contact', name: 'Visit us', blocks: [] }
    ]
  },
  profile: { withheld: { people: [HELD_PERSON], names: [] } }
})

const entry = (key, field, limit) => ({ key, place: key.replace(/\.[^.]+$/, ''), field, type: 'text', limit })
const block = (id, store, fields) => ({ id, block: store, at: id, fields, items: [], lists: [] })

/** The write plan and its run report; `values` adds or replaces values of the in-place apply. */
export const writeResult = ({ values, ran } = {}) => {
  const ops = [
    {
      key: 'menu:home',
      kind: 'menuItem.create',
      page: 'home',
      fields: { title: 'Home', alias: 'home', menutype: 'mainmenu', home: 1 },
      values: []
    },
    {
      key: 'menu:services',
      kind: 'menuItem.create',
      page: 'services',
      fields: { title: 'Bouquets', alias: 'bouquets', menutype: 'mainmenu' },
      values: []
    },
    {
      key: 'menu:contact',
      kind: 'menuItem.create',
      page: 'contact',
      fields: { title: 'Visit us', alias: 'visit-us', menutype: 'mainmenu' },
      values: []
    },
    {
      key: 'menu:footer:contact',
      kind: 'menuItem.create',
      page: 'contact',
      fields: { title: 'Find us', alias: 'find-us', menutype: 'footermenu' },
      values: []
    },
    {
      key: 'apply:module-10',
      kind: 'contract.apply',
      values: values ?? [
        {
          loc: { slot: 'module-10.0', entity: 'module-10', column: 'title' },
          entry: 'home.hero.heading',
          value: 'Fresh <em>tulips</em> every morning'
        },
        {
          loc: { slot: 'module-11.0', entity: 'module-11', column: 'content' },
          entry: 'services.intro.paragraph',
          value: 'Hand tied bouquets for weddings, birthdays and quiet thank you notes'
        },
        {
          loc: { slot: 'module-11.1', entity: 'module-11', column: 'params', jsonPath: ['note'] },
          entry: 'services.intro.note',
          value: 'Caf&eacute; posies &amp; ribbons 🌷'
        }
      ]
    }
  ]
  const order = {
    pages: [
      { id: 'home', blocks: [block('home.hero', 'hero-main', [entry('home.hero.heading', 'heading', 40)])] },
      {
        id: 'services',
        blocks: [
          block('services.intro', 'intro-text', [
            entry('services.intro.paragraph', 'paragraph', 80),
            entry('services.intro.note', 'note', 30)
          ])
        ]
      },
      { id: 'contact', blocks: [] }
    ]
  }
  return {
    plan: { schema: 'tracy-draft-write-plan/v1', mainMenu: 'mainmenu', order, ops },
    report: { status: 'done', ran: ran ?? ops.map((o) => o.key) }
  }
}

const nav = (extra = '') => `<nav class="t4-megamenu"><ul>
  <li><a href="/">Home</a></li><li><a href="/bouquets/">Bouquets</a></li>
  <li><a href="/index.php/visit-us">Visit us</a></li>${extra}</ul></nav>`
const footer = '<footer><div class="footer-menu"><a href="/visit-us">Find us</a></div></footer>'

/** The rendered pages of the built florist, by file name. */
export const pages = () => ({
  'index.html': `<!doctype html><html><head><title>Quillhaven Florist</title><style>p{}</style></head><body>
${nav('<li><a href="/demo-classes">Boxing classes</a></li>')}
<h1>Fresh <em>tulips</em> every morning</h1>
<p>Arranged each dawn by ${HELD_PERSON} and the team.</p>
<p>${DEMO_SENTENCES[0]}</p><img src="/${DEMO_IMAGE}" alt="">${footer}</body></html>`,
  'bouquets.html': `<html><body>${nav()}
<p>Hand tied bouquets for weddings, birthdays and quiet thank you notes</p>
<p class="note">Caf&eacute; posies &amp; ribbons 🌷</p>${footer}</body></html>`,
  'visit-us.html': `<html><body>${nav()}<h2>Find the shop</h2><p>Open from eight.</p>${footer}</body></html>`,
  'demo-classes.html': `<html><body>${nav()}<p>${DEMO_SENTENCES[1]}</p></body></html>`
})

/** A folder holding `files` (name to HTML), made for one test. */
export function folderOf(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'built-site-check-'))
  for (const [name, html] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), html)
  }
  return dir
}
