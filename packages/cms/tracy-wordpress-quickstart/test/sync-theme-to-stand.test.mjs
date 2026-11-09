import assert from 'node:assert/strict'
import { test } from 'node:test'
import { optionCommands, syncCommands } from '../scripts/sync-theme-to-stand.mjs'

test('each database row of a named part is written from the theme file of that part', () => {
  const cmds = syncCommands({
    slug: 'wp-demo',
    parts: ['footer', 'header'],
    ids: { footer: [97], header: [96, 120] }
  })
  assert.deepEqual(cmds, [
    ['post', 'update', '97', '/var/www/html/wp-content/themes/wp-demo/parts/footer.html'],
    ['post', 'update', '96', '/var/www/html/wp-content/themes/wp-demo/parts/header.html'],
    ['post', 'update', '120', '/var/www/html/wp-content/themes/wp-demo/parts/header.html']
  ])
})

test('a part with no database row writes nothing, and a name that is not plain is refused', () => {
  assert.deepEqual(syncCommands({ slug: 'wp-demo', parts: ['footer'], ids: {} }), [])
  assert.throws(() => syncCommands({ slug: 'wp-demo', parts: ['../x'], ids: {} }), /not a plain name/)
  assert.throws(() => syncCommands({ slug: 'wp demo;', parts: ['footer'], ids: {} }), /not a plain name/)
})

test('declared option values become option update commands, held to the theme prefix', () => {
  const file = { version: 1, options: { wp_demo_contact_address: '1 Example Road,\nSometown' } }
  assert.deepEqual(optionCommands(file, 'wp-demo'), [
    ['option', 'update', 'wp_demo_contact_address', '1 Example Road,\nSometown']
  ])
  assert.throws(
    () => optionCommands({ version: 1, options: { siteurl: 'x' } }, 'wp-demo'),
    /not one of the theme/
  )
  assert.throws(() => optionCommands({ version: 2, options: {} }, 'wp-demo'), /version must be 1/)
})
