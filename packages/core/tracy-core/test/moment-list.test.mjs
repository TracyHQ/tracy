#!/usr/bin/env node
/**
 * The pure half of a Site changes row's time and of one moment's files — `src/site-tabs/moment-list.ts`.
 *
 *   node --test packages/core/tracy-core/test/moment-list.test.mjs
 *
 * Node strips the types on import; the module needs no build. Quiet failures guarded here: a zone
 * drawn as a guess, a CMS cache listed as files Tracy changed.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fileGroups, shortAgo, splitExcluded } from '../src/site-tabs/moment-list.ts'

test('shortAgo: just now, minutes, hours, days', () => {
  const words = {
    justNow: 'just now',
    minutes: (n) => `${n} min ago`,
    hours: (n) => `${n}h ago`,
    days: (n) => `${n}d ago`
  }
  const now = 1_000_000_000_000
  const at = (seconds) => (now - seconds * 1000) / 1000
  assert.equal(shortAgo(at(20), now, words), 'just now')
  assert.equal(shortAgo(at(4 * 60), now, words), '4 min ago')
  assert.equal(shortAgo(at(90 * 60), now, words), '1h ago')
  assert.equal(shortAgo(at(50 * 3600), now, words), '2d ago')
})

test('files group by the zone the host named, in zone order; with no zones, one group without a heading', () => {
  const order = ['design', 'function', 'addons', 'content', 'core', 'system']
  assert.deepEqual(
    fileGroups(
      [
        { path: 'b.php', zone: 'core' },
        { path: 'a.css', zone: 'design' },
        { path: 'x', zone: 'mystery' }
      ],
      order
    ).map((g) => [g.zone, g.files.map((f) => f.path)]),
    [
      ['design', ['a.css']],
      ['core', ['b.php']],
      ['mystery', ['x']]
    ]
  )
  assert.deepEqual(fileGroups([{ path: 'a' }, { path: 'b' }], order), [
    { zone: null, files: [{ path: 'a' }, { path: 'b' }] }
  ])
  assert.deepEqual(fileGroups([], order), [])
})

test('Q4: files the exclude list names today fold into one count, never into the list', () => {
  const files = [
    { path: 'media/t4/optimize/css/5313d648.css', zone: 'core', excluded: true },
    { path: 'templates/tracy_business/css/custom.css', zone: 'design' },
    { path: 'media/t4/optimize/css/531ea080.css', zone: 'core', excluded: true }
  ]
  const { shown, excluded } = splitExcluded(files)
  assert.deepEqual(
    shown.map((f) => f.path),
    ['templates/tracy_business/css/custom.css']
  )
  assert.equal(excluded, 2)
  assert.deepEqual(splitExcluded([{ path: 'a.css' }]), { shown: [{ path: 'a.css' }], excluded: 0 })
  // A host older than Q4 says nothing: every file is shown, as before.
  assert.equal(splitExcluded([{ path: 'media/t4/optimize/x.css' }]).excluded, 0)
})
