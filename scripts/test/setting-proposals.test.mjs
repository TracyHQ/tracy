/**
 * The batch behind the button: 79 releases' proposals, read once so a person can eyeball them
 * before any of them is written.
 *
 * What is tested here is the part that decides and the part that prints — not the HTTP. The doors
 * have their own tests (`apps/tracy-web/test/ops-quickstart-setting.test.mjs`); what this file
 * exists to stop is a run that skips a release silently, or a `--dry-run` whose lines do not say
 * which of them would actually be written.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lineFor, toVisit } from '../setting-proposals.mjs'

const row = (over = {}) => ({
  tag: 'quickstart/ja-space/j6',
  name: 'Quickstart: JA Space / Joomla 6',
  kind: 'quickstart',
  github: 'published',
  tracy: 'no-setting',
  platform: 'joomla',
  ...over
})

test('the batch visits the releases that have no file, and says why it left the others', () => {
  const { visit, skip } = toVisit([
    row(),
    row({ tag: 'quickstart/ja-kinetic/j6', tracy: 'ready' }),
    row({ tag: 'tracy-base/wp7', platform: 'wordpress' }),
    row({ tag: 'quickstart/ja-nitro/j6', github: 'draft' }),
    row({ tag: 'tracy-airbnb/j6', kind: 'design-pack' })
  ])
  assert.deepEqual(
    visit.map((r) => r.tag),
    ['quickstart/ja-space/j6']
  )
  // Every one left out is named with its reason: a batch that prints "1 of 5" and nothing else is
  // a batch nobody can tell "correctly skipped" from "quietly dropped".
  assert.deepEqual(
    skip.map((s) => [s.tag, s.why]),
    [
      ['quickstart/ja-kinetic/j6', 'already Ready'],
      ['tracy-base/wp7', 'not Joomla'],
      ['quickstart/ja-nitro/j6', 'a draft'],
      ['tracy-airbnb/j6', 'a design pack, not a quickstart']
    ]
  )
  // `--only` narrows the visiting list, and does not turn a refusal into a visit.
  assert.deepEqual(
    toVisit([row(), row({ tag: 'quickstart/ja-kinetic/j6' })], { only: 'ja-kinetic' }).visit.map(
      (r) => r.tag
    ),
    ['quickstart/ja-kinetic/j6']
  )
})

test('a dry-run line carries what a person is being asked to eyeball', () => {
  const line = lineFor({
    tag: 'quickstart/ja-space/j6',
    document: {
      label: 'JA Space',
      version: '1.0.0',
      cms: '6.0.3',
      template: 'ja_space',
      install: { installer: { file: 'ja-space-j6-quickstart.zip', sha256: 'ab'.repeat(32) } }
    },
    fields: { version: { source: 'default' }, cms: { source: 'package' } },
    problems: []
  })
  for (const want of ['quickstart/ja-space/j6', 'JA Space', '1.0.0', '6.0.3', 'ja_space', 'ababababababab'])
    assert.match(line, new RegExp(want.replace(/[/.]/g, '\\$&')))
  // The one field nobody chose is marked on the line itself — 79 lines of unmarked 1.0.0 read as
  // 79 versions somebody looked up.
  assert.match(line, /1\.0\.0 \(default\)/)

  // A release with nothing to write says so on its own line rather than being left out.
  const refused = lineFor({
    tag: 'quickstart/ja-old/j6',
    document: null,
    fields: {},
    problems: ['cms: no readable Version.php']
  })
  assert.match(refused, /quickstart\/ja-old\/j6/)
  assert.match(refused, /would NOT be written/)
  assert.match(refused, /no readable Version\.php/)
})
