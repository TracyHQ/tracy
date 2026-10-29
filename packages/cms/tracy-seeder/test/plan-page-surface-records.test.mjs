import { strict as assert } from 'node:assert'
import test from 'node:test'
import { planJoomlaContract, sectionShows } from '../src/plan-joomla-contract.mjs'

// The records a visitor reads that the pages surface used to leave out, and what the writer is told about each line
// (spec TracyHQ/tracy#189, measured 29/10/2026 on a local brief build of a Joomla T4 template): the Contact page's own
// record kept the demo's "One of our friendly staff" paragraph, a template language string kept "Book your trial class
// now", every offering card was written from the whole business ("Pick tennis, padel, swimming or fitness" on one sport's
// card) and a gallery got the heading "Our coaching team". The business below is made up: a bakery and a dental clinic.

const asked = async (state, extra = {}) => {
  /** @type {any[]} */
  const seen = []
  /** @type {string[]} */
  const systems = []
  await planJoomlaContract({
    state: { contract: 'test/v1', revision: 'r1', ...state },
    site: { name: 'Copperleaf Bakery', about: 'Sourdough and pastries in Ashby Vale.' },
    surface: 'pages',
    now: new Date('2026-10-29T00:00:00Z'),
    generate: async ({ system, input }) => {
      systems.push(system)
      seen.push(...input.slots)
      return JSON.stringify({ values: {}, pending: input.slots.map((s) => s.key) })
    },
    ...extra
  })
  return { seen, system: systems[0] ?? '' }
}

test("a Contact page's own record and the template's language strings are planned with the pages", async () => {
  const { seen } = await asked({
    pages: [
      { entity: 'menuItem-10', link: 'index.php?option=com_contact&view=contact&id=3', assignedModules: [] },
      { entity: 'menuItem-11', link: 'index.php?option=com_content&view=featured', assignedModules: [] }
    ],
    entities: [
      { key: 'contact-3', kind: 'contact' },
      { key: 'contact-4', kind: 'contact' },
      { key: 'languageString-77', kind: 'languageString' }
    ],
    slots: [
      {
        key: 'contact-3.4',
        entity: 'contact-3',
        sample: 'Want to know more? Our friendly bakers will help.'
      },
      { key: 'contact-4.4', entity: 'contact-4', sample: 'A second branch nobody opens.' },
      { key: 'languageString-77.0', entity: 'languageString-77', sample: 'Book your tasting class now' }
    ]
  })
  assert.deepEqual(seen.map((s) => s.key).sort(), ['contact-3.4', 'languageString-77.0'])
})

test('every line of an offering card or page is bound to that offering, and the writer is told to keep to it', async () => {
  const { seen, system } = await asked(
    {
      pages: [
        {
          entity: 'menuItem-20',
          link: 'index.php?option=com_content&view=featured',
          assignedModules: [{ entity: 'module-30' }]
        }
      ],
      entities: [],
      slots: [
        {
          key: 'module-30.0',
          entity: 'module-30',
          label: 'Treatments / title',
          sample: 'Ring work',
          group: { id: 'module-30.item.0', item: 0, kind: 'service' }
        },
        {
          key: 'module-30.1',
          entity: 'module-30',
          label: 'Treatments / desc',
          sample: 'Hit the bags hard.',
          group: { id: 'module-30.item.0', item: 0, kind: 'service' }
        },
        {
          key: 'module-30.2',
          entity: 'module-30',
          label: 'Treatments / title',
          sample: 'Sparring',
          group: { id: 'module-30.item.1', item: 1, kind: 'service' }
        }
      ]
    },
    { offerings: { 'module-30.item.0': 'Teeth whitening', 'module-30.item.1': 'Braces' } }
  )
  const bound = Object.fromEntries(seen.map((s) => [s.key, s.offering]))
  assert.deepEqual(bound, {
    'module-30.0': 'Teeth whitening',
    'module-30.1': 'Teeth whitening',
    'module-30.2': 'Braces'
  })
  assert.match(system, /"offering"/)
})

test('an offering article is bound by its record, not only by its cards', async () => {
  const { seen } = await asked(
    {
      pages: [
        {
          entity: 'menuItem-21',
          link: 'index.php?option=com_content&view=article&id=40',
          assignedModules: []
        }
      ],
      entities: [],
      slots: [{ key: 'article-40.2', entity: 'article-40', sample: 'The pool is warm all year.' }]
    },
    { offerings: { 'article-40.offering': 'Sourdough classes' } }
  )
  assert.equal(seen[0].offering, 'Sourdough classes')
})

test("a section's heading and intro are told what the section shows; the rule is in the writer's instructions", async () => {
  const { seen, system } = await asked({
    pages: [
      {
        entity: 'menuItem-22',
        link: 'index.php?option=com_content&view=featured',
        assignedModules: [{ entity: 'module-50' }]
      }
    ],
    entities: [],
    slots: [
      { key: 'module-50.0', entity: 'module-50', role: 'editorial.heading', sample: 'Studio life' },
      {
        key: 'module-50.1',
        entity: 'module-50',
        role: 'editorial.paragraph',
        sample: 'Visual proof of the workouts.'
      },
      {
        key: 'module-50.2',
        entity: 'module-50',
        type: 'image',
        role: 'business.gallery_image',
        sample: 'images/demo/g1.jpg',
        group: { id: 'module-50.gallery.0', item: 0, kind: 'gallery' }
      },
      {
        key: 'module-50.3',
        entity: 'module-50',
        role: 'editorial.paragraph',
        sample: '',
        group: { id: 'module-50.gallery.0', item: 0, kind: 'gallery' }
      }
    ]
  })
  const heading = seen.find((s) => s.key === 'module-50.0')
  assert.deepEqual(heading.shows, ['gallery'])
  assert.equal(seen.find((s) => s.key === 'module-50.1').shows?.[0], 'gallery')
  assert.match(system, /"shows"/)
  // A step or card title of the demo is never kept as it is.
  assert.match(system, /never keep the demo's (title|label)/i)
})

test('a card the site plan takes off is not named in the heading of the section that held it', () => {
  const card = (key, id, kind) => ({
    key,
    entity: 'module-60',
    role: 'editorial.paragraph',
    group: { id, item: 0, kind }
  })
  const slots = [
    { key: 'module-60.0', entity: 'module-60', role: 'editorial.heading', sample: 'Meet the team' },
    card('module-60.1', 'module-60.person.0', 'person'),
    card('module-60.2', 'module-60.gallery.0', 'gallery')
  ]
  assert.deepEqual(sectionShows(slots)(slots[0]), ['gallery', 'person'])
  assert.deepEqual(sectionShows(slots, ['module-60.person.0'])(slots[0]), ['gallery'])
  assert.equal(sectionShows(slots, ['module-60.person.0', 'module-60.gallery.0'])(slots[0]), null)
})
