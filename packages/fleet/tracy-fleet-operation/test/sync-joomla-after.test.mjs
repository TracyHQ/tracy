// `webroot/sync-joomla-after.php` on Joomla 3 and on Joomla 4 and later, against stand-in Joomla
// trees (`fixtures/sync-joomla-after/`): the framework's factory, its nested tables and the Tags
// table, each counting its `rebuild()`. Joomla 3 has no service container; every Sync from live of
// a Joomla 3 site had ended SYNC_AFTER_FAILED on `Factory::getContainer()` (#217).
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const support = phpSupport()
const FIXTURES = 'test/fixtures/sync-joomla-after'
let php
before(() => {
  if (!support.skip)
    php = startPhp({
      // The oldest PHP Tracy's Joomla 3 copies run on.
      image: 'php:7.4-cli',
      files: {
        cwd: join(here, '..'),
        paths: ['scripts/webroot/sync-joomla-after.php', FIXTURES]
      }
    })
})
after(() => php?.stop())

const run = (version) =>
  php.run([
    {
      args: [join(php.root, 'scripts/webroot/sync-joomla-after.php')],
      env: {
        TRACY_JOOMLA_ROOT: join(php.root, FIXTURES, version),
        TRACY_SYNC_REBUILD: 'menu,categories,assets,tags'
      }
    }
  ])[0]

test('Joomla 3: the nested sets rebuild with no service container, and the answer says so (#217)', {
  skip: support.skip
}, () => {
  const r = run('j3')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.doesNotMatch(r.stderr, /getContainer|Fatal/)
  assert.match(r.stdout, /^TRACY_RESULT rebuild=menu:ok,categories:ok,assets:ok,tags:ok cache=cleared$/m)
  assert.match(r.stdout, /^rebuilt #__menu #__categories #__assets #__tags$/m)
  assert.doesNotMatch(r.stdout, /application started/, 'no application, so no session')
})

test('Joomla 4 and later: the administrator application is started first, as before', {
  skip: support.skip
}, () => {
  const r = run('j4')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /^application started$/m)
  assert.match(r.stdout, /^TRACY_RESULT rebuild=menu:ok,categories:ok,assets:ok,tags:ok cache=cleared$/m)
})
