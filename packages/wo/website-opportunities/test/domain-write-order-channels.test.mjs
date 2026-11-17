// The channel facts a plan holds from its brief (a WhatsApp link, a second phone: `plan-composer-channels.mjs`) are
// no fact of the profile. The page writer carries them into its plan data; the write order carries them the same way,
// so a block that shows them is written to the site (#575). The invented florist's build, scripted fakes only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order-channels.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWriteOrder } from '../domain/write-order.mjs'
import { checkWriteOrder } from '../domain/write-order-check.mjs'
import { floristBuild } from './fixtures/write-order/invented-florist.mjs'

const WHATSAPP = 'https://wa.me/15550100214'

const saved = await floristBuild()
// The plan puts the WhatsApp link in a third row of the contact block's social list, and the page writer copied it
// into the row (entries of the second row, re-keyed, with the row's network icon): the order reads the value from the writer, its plan id from the
// plan data.
const withChannels = () => {
  const input = structuredClone(saved)
  const plan = input.approval.plan
  plan.facts.push(
    { id: 'contact-whatsapp', kind: 'contact.social_url', value: WHATSAPP },
    { id: 'contact-phone-2', kind: 'contact.phone', value: '+1 555 0100 215' }
  )
  const home = plan.pages.find((p) => p.pageType === 'home')
  const contact = home.blocks.find((b) => b.block === 'contact-strip')
  contact.data.push('contact-whatsapp')
  contact.lists[0].rows.push({ data: 'contact-whatsapp' })
  const page = input.writers.find((w) => w.page.id === 'home').page
  for (const e of page.fields.filter((f) => f.block === contact.id && f.row === 'social.2')) {
    const row = 'social.3'
    const copy = { ...e, row, key: e.key.replace('social.2', row) }
    if (copy.field === 'link') Object.assign(copy, { value: WHATSAPP, data: 'contact-whatsapp' })
    page.fields.push(copy)
  }
  const icon = input.pictures.icons.find((i) => i.id === `home.${contact.id}.social.2.network-icon`)
  input.pictures.icons.push({
    ...icon,
    id: `home.${contact.id}.social.3.network-icon`,
    row: 'social.3',
    network: 'whatsapp',
    link: WHATSAPP,
    reason: 'the whatsapp network of its link'
  })
  return input
}
const linksOf = (order) => {
  const home = order.pages.find((p) => p.pageType === 'home')
  const block = home.blocks.find((b) => b.block === 'contact-strip')
  return block.lists.flatMap((l) => l.rows).flatMap((r) => r.fields)
}

test('a WhatsApp link the plan placed from the brief is written to the social links of the contact block', () => {
  const order = buildWriteOrder(withChannels())
  const link = linksOf(order).find((f) => f.value === WHATSAPP)
  assert.ok(link, 'the WhatsApp link is in a row of the order')
  assert.equal(link.data, 'contact-whatsapp')
  // The order names the plan id it holds: the fact is in the order's data index, and the order holds to the plan.
  assert.ok(JSON.stringify(order.facts).includes('contact-whatsapp'), 'the channel fact is in the data index')
  assert.deepEqual(checkWriteOrder(order), [])
})

test('without the channel fact the order is as before', () => {
  assert.ok(!linksOf(buildWriteOrder(structuredClone(saved))).some((f) => f.value === WHATSAPP))
})
