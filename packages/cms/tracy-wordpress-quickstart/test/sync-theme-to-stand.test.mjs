import assert from 'node:assert/strict'
import { test } from 'node:test'
import { syncCommands } from '../scripts/sync-theme-to-stand.mjs'

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
