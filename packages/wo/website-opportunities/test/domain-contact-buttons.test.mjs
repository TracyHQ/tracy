// A button that would say a bare "Contact" names the action it leads to (spec TracyHQ/tracy#189, COO rule 29/10/2026): a card
// button the template links to the card's own page says so, and a button on the Contact page says how it helps. The plan
// decides the words; the writer uses them only where the words written are a bare "Contact". All businesses are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contactButtonSlots } from '../domain/contact-buttons.mjs'
import { planSite } from '../domain/site-plan.mjs'

const slot = (key, role, sample, extra = {}) => ({
  key,
  entity: key.split('.')[0],
  column: 'params',
  type: 'text',
  role,
  sample,
  ...extra
})
// A dental clinic's treatments list: one button label for every card, linked by the template to each card's page; a
// call-to-action band whose button leads to the Contact page; and the hero, which its own plan decides.
const map = {
  entities: [],
  pages: [{ route: 'contact', entity: 'menuItem-40' }],
  slots: [
    slot('module-20.6', 'editorial.button_label', 'Start today'),
    slot('module-21.3', 'contact.cta_label', 'Book a free check-up', { group: { id: 'module-21.cta' } }),
    {
      ...slot('module-21.4', 'contact.cta_url', 'index.php?Itemid=40', { group: { id: 'module-21.cta' } }),
      type: 'url'
    },
    slot('module-22.1', 'editorial.button_label', 'Read more', {
      group: { id: 'module-22.links' }
    }),
    {
      ...slot('module-22.2', 'editorial.navigation_url', 'index.php?Itemid=7', {
        group: { id: 'module-22.links' }
      }),
      type: 'url'
    },
    slot('article-3.1', 'editorial.button_label', 'Contact')
  ]
}

test('a card button with no link of its own says it opens the card; a button to the Contact page names it', () => {
  const out = contactButtonSlots(map, { heroEntity: null })
  const by = Object.fromEntries(out.map((d) => [d.key, d]))
  assert.equal(by['module-20.6'].value, 'Learn more')
  assert.equal(by['module-20.6'].when, 'bare-contact')
  assert.equal(by['module-21.3'].value, 'Contact us')
  // A link to another page, and a line inside an article, are not contact buttons of a block.
  assert.equal(by['module-22.1'], undefined)
  assert.equal(by['article-3.1'], undefined)
  assert.equal(
    out.every((d) => d.reason === 'cta-action' && d.decision === 'value'),
    true
  )
})

test('the hero button is left to the first-screen plan', () => {
  assert.equal(
    contactButtonSlots(map, { heroEntity: 'module-21' }).some((d) => d.key === 'module-21.3'),
    false
  )
})

test('the plan carries the decisions for any brief, a bakery with only Instagram as for a florist with nothing', () => {
  for (const brief of [
    {
      business: { name: 'Crumb and Crust', socials: { instagram: 'https://instagram.com/crumb_and_crust' } }
    },
    { business: { name: 'Petal Lane' } }
  ]) {
    const plan = planSite(brief, { questions: [] }, { contentMap: map })
    assert.equal(plan.slots.find((s) => s.key === 'module-20.6')?.reason, 'cta-action')
  }
})
