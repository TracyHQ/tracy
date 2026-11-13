// The invented club template of the child list tests (ticket #615) with child lists added: session rows and step rows
// with nested tips inside each service card, profile links inside each team card, opening lines in the footer. Every
// stored place is invented and sits on its parent's record. Nothing here is a real template.
import * as Club from '../plan-composer/invented-club.mjs'

/** Stored places per parent place, each on its parent's record (`<record>.<name>-<row>`). */
const places = (records, name, counts) =>
  counts.map((n, p) => Array.from({ length: n }, (_, r) => `${records[p]}.${name}-${r + 1}`))
const items = (block, n) => Array.from({ length: n }, (_, i) => `${block}.item${i + 1}`)
const SERVICES = items('services-grid', 4)
const TEAM = items('team-cards', 4)
/** The parent records of the nested tips: one per step row, place after place (3, 2, 1 and 0 rows). */
const STEP_ROWS = [0, 0, 0, 1, 1, 2].map((i) => SERVICES[i])
const text = (name, kind, limit, slots) => ({ name, kind, type: 'text', limit, slots })

/** The invented club template with child lists added. */
export function potteryStore() {
  const store = Club.blockStore()
  const block = (id) => store.blocks.find((b) => b.id === id)
  block('services-grid').itemLists = [
    {
      name: 'sessions',
      label: 'Wheel sessions',
      items: { min: 0, max: 2 },
      itemsFrom: {
        min: 'invented: a card without a session row',
        max: 'invented: the most rows a card stores'
      },
      fields: [
        text('days', 'offering.schedule', 20, places(SERVICES, 'days', [2, 1, 2, 0])),
        text('times', 'offering.schedule', 16, places(SERVICES, 'times', [2, 1, 2, 0]))
      ]
    },
    {
      name: 'steps',
      label: 'Steps',
      items: { min: 0, max: 3 },
      itemsFrom: { min: 'invented: a card without steps', max: 'invented: the most steps a card stores' },
      fields: [
        {
          name: 'icon',
          kind: 'editorial.item_icon',
          type: 'icon',
          storage: 'image-file',
          frame: { width: 48, height: 48 },
          for: ['step'],
          slots: places(SERVICES, 'step-icon', [3, 2, 1, 0])
        },
        text('step', 'step.title', 24, places(SERVICES, 'step', [3, 2, 1, 0]))
      ],
      lists: [
        {
          name: 'tips',
          label: 'Tips',
          items: { min: 0, max: 1 },
          itemsFrom: { min: 'invented: a step without a tip', max: 'invented: one tip per step' },
          fields: [
            text(
              'tip',
              'step.description',
              60,
              places(STEP_ROWS, 'tip', [1, 1, 1, 1, 1, 1]).map((p, i) => [`${p[0]}-${i + 1}`])
            )
          ]
        }
      ]
    }
  ]
  block('team-cards').itemLists = [
    {
      name: 'links',
      label: 'Profile links',
      items: { min: 0, max: 2 },
      itemsFrom: { min: 'invented: a card without links', max: 'invented: two links per card' },
      fields: [
        { name: 'link', kind: 'person.social_url', type: 'link', slots: places(TEAM, 'link', [2, 2, 2, 2]) },
        {
          name: 'network-icon',
          kind: 'editorial.item_icon',
          type: 'icon',
          storage: 'class-name',
          iconOf: 'network',
          frame: { width: 18, height: 18 },
          slots: places(TEAM, 'link-icon', [2, 2, 2, 2])
        }
      ]
    }
  ]
  block('footer-main').lists = [
    {
      name: 'hours',
      label: 'Opening hours',
      items: { min: 0, max: 2 },
      itemsFrom: { min: 'invented: the footer without lines', max: 'invented: two stored lines' },
      fields: [text('line', 'offering.schedule', 32, places(['footer-main.block'], 'line', [2]))]
    }
  ]
  return store
}
