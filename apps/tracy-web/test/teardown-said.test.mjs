/**
 * `teardownSaid`: the line a failed teardown job gives the person who deleted the site. The door-level
 * case is in sites-route.test.mjs (it needs a database); these pin the rules on their own.
 *
 *   node --test apps/tracy-web/test/teardown-said.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TEARDOWN_SAID_MAX, teardownSaid } from '../src/sites/teardown-said.js'

const failed = (output) => ({ state: 'failed', step: 'teardown', output })

test('the verdict line wins over the lines before it, and the `!!` mark is not part of what is said', () => {
  const said = teardownSaid(
    failed(
      [
        '==> tearing down stuck → /srv/tracy-private/stuck',
        "!! could not remove /srv/tracy-private/stuck: rm: cannot remove '/srv/tracy-private/stuck/webroot-baseline.git': Directory not empty",
        '!! teardown of stuck did not finish (the steps after the directory ran): still on this host after two tries: /srv/tracy-private/stuck',
        '==> stuck: done with what could be done'
      ].join('\n')
    ),
    'stuck'
  )
  assert.equal(
    said,
    'teardown of stuck did not finish (the steps after the directory ran): still on this host after two tries: tracy-private/stuck'
  )
})

test('without a verdict line the last `!!` line is said; without any, nothing is', () => {
  const output = [
    '!! compose down reported an error — continuing to clean up what is left',
    "!! could not remove /srv/tracy-private/stuck: rm: cannot remove '/srv/tracy-private/stuck/webroot-baseline.git': Directory not empty",
    '==> the rest went'
  ].join('\n')
  assert.equal(
    teardownSaid(failed(output), 'stuck'),
    "could not remove tracy-private/stuck: rm: cannot remove 'tracy-private/stuck/webroot-baseline.git': Directory not empty"
  )
  assert.equal(teardownSaid(failed('==> nothing to say\n'), 'stuck'), null)
  assert.equal(teardownSaid({ state: 'failed' }, 'stuck'), null)
  assert.equal(teardownSaid(null, 'stuck'), null)
})

test("another site's verdict line is not this site's, and a label that merely starts the same is not this one", () => {
  const output = '!! teardown of stuck2 stopped: something\n!! last words'
  assert.equal(teardownSaid(failed(output), 'stuck'), 'last words')
})

test("a path that does not run through this site's label, and a name that is not this site's, are left out", () => {
  const said = teardownSaid(
    failed(
      '!! could not remove the site network stuck_default: Error response from daemon: network stuck_default has active endpoints (name:"other-site-web-1" id:"8f2c"), see /var/lib/docker/network'
    ),
    'stuck'
  )
  assert.equal(
    said,
    'could not remove the site network stuck_default: Error response from daemon: network stuck_default has active endpoints (name:"…" id:"…"), see …'
  )
  for (const own of ['stuck', 'stuck_db', 'stuck_app', 'stuck_default', 'stuck-db-1'])
    assert.match(teardownSaid(failed(`!! docker answered '${own}' here`), 'stuck'), new RegExp(`'${own}'`))
  for (const other of ['stuck2_db', 'stuck-2_db', 'neighbour_db', 'stuck_db extra'])
    assert.equal(
      teardownSaid(failed(`!! docker answered '${other}' here`), 'stuck'),
      "docker answered '…' here"
    )
})

test('an `error` a host sends is said first, under the same rules', () => {
  assert.equal(
    teardownSaid({ state: 'failed', error: 'boom in /srv/tracy-private/stuck', output: '!! other' }, 'stuck'),
    'boom in tracy-private/stuck'
  )
})

test('what is said is bounded, and says it was cut', () => {
  const said = teardownSaid(failed(`!! teardown of stuck did not finish: ${'x'.repeat(500)}`), 'stuck')
  assert.equal(said.length, TEARDOWN_SAID_MAX)
  assert.ok(said.endsWith('…'))
})
