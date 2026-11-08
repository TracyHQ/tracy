import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  templatePartEntitiesOf,
  themeTextDeclaration,
  themeTextSlotsOf
} from '../scripts/capture-contract.mjs'

test('the manifest declares the theme text options, held to the theme prefix the plugin binds by', () => {
  assert.deepEqual(
    themeTextDeclaration({ theme: 'wp-demo-bistro', options: ['wp_demo_bistro_contact_phone'] }),
    { options: ['wp_demo_bistro_contact_phone'] }
  )
  assert.equal(themeTextDeclaration({ theme: 'wp-demo-bistro', options: [] }), null)
  assert.throws(
    () => themeTextDeclaration({ theme: 'wp-demo-bistro', options: ['siteurl'] }),
    /option siteurl is not one of the theme wp-demo-bistro \(its name starts wp_demo_bistro_\)/
  )
})

test('a declared text option is an entity with one text slot holding its value', () => {
  const got = themeTextSlotsOf({
    options: ['wp_demo_bistro_contact_phone', 'wp_demo_bistro_contact_address'],
    values: new Map([
      ['wp_demo_bistro_contact_phone', '(555) 010-2030'],
      ['wp_demo_bistro_contact_address', '1 Example Road']
    ])
  })
  assert.deepEqual(
    got.entities.map((e) => [e.key, e.kind, e.identity.name]),
    [
      ['option-wp_demo_bistro_contact_phone', 'option', 'wp_demo_bistro_contact_phone'],
      ['option-wp_demo_bistro_contact_address', 'option', 'wp_demo_bistro_contact_address']
    ]
  )
  assert.equal(got.slots[0].key, 'theme.wp_demo_bistro_contact_phone')
  assert.deepEqual(got.slots[0].target, { option: 'wp_demo_bistro_contact_phone' })
  assert.equal(got.slots[0].type, 'text')
  assert.equal(got.slots[0].sample, '(555) 010-2030')
  assert.throws(
    () => themeTextSlotsOf({ options: ['wp_demo_bistro_x'], values: new Map() }),
    /theme text option wp_demo_bistro_x is not in the dump/
  )
})

const FOOTER = `<!-- wp:group {"className":"x"} -->
<div class="wp-block-group x"><!-- wp:paragraph {"metadata":{"name":"footer.contact.text"}} -->
<p>Call (555) 010-2030</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->`

test('a named template part is a templatePart entity addressed by slug, with the slots of its named blocks', () => {
  const rows = [
    {
      ID: '9',
      post_type: 'wp_template_part',
      post_name: 'footer',
      post_status: 'publish',
      post_content: FOOTER
    },
    {
      ID: '10',
      post_type: 'wp_template_part',
      post_name: 'header',
      post_status: 'publish',
      post_content: FOOTER
    }
  ]
  const got = templatePartEntitiesOf(rows, ['footer'])
  assert.deepEqual(got.entities, [
    { key: 'templatePart-footer', kind: 'templatePart', identity: { slug: 'footer' } }
  ])
  assert.deepEqual(
    got.slots.map((s) => [s.key, s.entity, s.target.block, s.sample]),
    [['part-footer.footer.contact.text', 'templatePart-footer', 'footer.contact.text', 'Call (555) 010-2030']]
  )
})

test('a template part with no row in the dump, or two, is refused by name', () => {
  assert.throws(() => templatePartEntitiesOf([], ['footer']), /template part footer resolves to 0 rows/)
  const two = [1, 2].map((ID) => ({
    ID: String(ID),
    post_type: 'wp_template_part',
    post_name: 'footer',
    post_status: 'publish',
    post_content: FOOTER
  }))
  assert.throws(() => templatePartEntitiesOf(two, ['footer']), /template part footer resolves to 2 rows/)
})
