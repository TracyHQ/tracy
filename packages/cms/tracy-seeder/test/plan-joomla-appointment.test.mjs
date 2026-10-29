// A business that works by appointment is never invited to walk in (spec TracyHQ/tracy#189 item 19). Fictional trades:
// a mobile dog groomer (by appointment) and a corner bakery (open to walk-ins).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planJoomlaContract } from '../src/plan-joomla-contract.mjs'

const slots = [
  {
    key: 'module-3.heading',
    entity: 'module-3',
    type: 'text',
    role: 'editorial.heading',
    label: 'Contact / heading',
    maxCharacters: 40,
    sample: 'Visit us'
  }
]

/** The system rules the copy writer is given for a site. */
async function rulesFor(site) {
  let system = ''
  await planJoomlaContract({
    state: { contract: 'fictional/v1', revision: 'r', slots },
    site,
    generate: async (call) => {
      system = String(call?.system ?? '')
      return { values: { [slots[0].key]: 'Book a grooming visit' }, pending: [] }
    }
  })
  return system
}

test('a dog groomer by appointment: the copy writer is told never to invite a walk-in', async () => {
  const system = await rulesFor({ name: 'Fluffy Paws', about: 'Mobile dog grooming.', byAppointment: true })
  assert.match(system, /works by appointment only: never invite a visitor to come by/)
})

test('a corner bakery open to walk-ins gets no such rule', async () => {
  const system = await rulesFor({ name: 'Corner Crumb', about: 'A bakery on the high street.' })
  assert.doesNotMatch(system, /by appointment only/)
})
