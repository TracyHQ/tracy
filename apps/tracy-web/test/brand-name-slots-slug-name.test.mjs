// The template name the name slots match is read from the kit's CMS site-name setting, which a measuring stand fills
// with the product slug ("ja-diner"). The pages print the name with spaces ("Ja Diner"), so "-", "_" and spaces are
// one separator when the template name is matched.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeNameSlots } from '../src/lib/brand-name-slots.js'

const kit = {
  template: { name: 'ja-diner' },
  site: {
    nameSlots: [
      { kind: 'setting', scope: 'cms', setting: 'global configuration sitename', value: 'ja-diner' },
      { kind: 'slot', id: 'block-1.0', block: 'block-1', sample: 'Ja Diner' },
      {
        kind: 'printed',
        where: 'text',
        region: 'footer',
        sample: 'Copyright © 2026 ja-diner. All Rights Reserved.'
      },
      { kind: 'slot', id: 'block-2.0', block: 'block-2', sample: 'JA_Diner, a restaurant Joomla template' },
      { kind: 'slot', id: 'block-3.0', block: 'block-3', sample: 'Fresh food every day' }
    ]
  }
}

test('name slots: a slug site name ("ja-diner") finds the name the pages print ("Ja Diner", "JA_Diner")', () => {
  const r = computeNameSlots(kit, { brand: { name: 'Harbor Padel Club' } })
  const by = Object.fromEntries(r.slots.map((s) => [s.id, s]))
  assert.equal(r.templateName, 'ja-diner')
  assert.equal(by['setting:global configuration sitename'].value, 'Harbor Padel Club')
  assert.deepEqual([by['slot:block-1.0'].status, by['slot:block-1.0'].pattern], ['written', 'name-only'])
  assert.equal(by['slot:block-1.0'].value, 'Harbor Padel Club')
  assert.equal(by['printed:text:footer'].value, 'Copyright © 2026 Harbor Padel Club. All Rights Reserved.')
  assert.deepEqual([by['slot:block-2.0'].status, by['slot:block-2.0'].pattern], ['handed-off', 'marketing'])
  assert.equal(by['slot:block-3.0'].pattern, 'no-template-name')
})

test('name slots: a separator never matches across words that only share letters ("jadiner" stays unmatched)', () => {
  const k = {
    ...kit,
    site: { nameSlots: [kit.site.nameSlots[0], { kind: 'slot', id: 'x.0', block: 'x', sample: 'jadiner' }] }
  }
  const r = computeNameSlots(k, { brand: { name: 'Harbor Padel Club' } })
  assert.equal(r.slots[1].pattern, 'no-template-name')
})
