import assert from 'node:assert/strict'
import { test } from 'node:test'

import { historyLabels } from '../src/client/history-labels.ts'
import { baseEn } from '../src/client/strings.ts'

/** A translator over a table, filling `{name}` the way dsh's does; a missing key comes back as-is. */
const over =
  (table) =>
  (key, params = {}) =>
    (table[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params[name]))
const t = over(baseEn)

const backup = (version, title, extra = {}) => ({
  kind: 'backup',
  version,
  sha: `sha${version}`,
  title,
  notes: null,
  at: 1_759_000_000,
  by: { kind: 'agent' },
  files: 3,
  ...extra
})

test('v1 is the site as built, whatever its tag message says (old sites say "Initial release")', () => {
  for (const title of ['Initial release', 'Initial backup']) {
    assert.deepEqual(historyLabels(backup(1, title), t), { title: 'Site as built', badge: 'Initial backup' })
  }
})

test('a later backup keeps its own title and is badged by its number, never by its tag', () => {
  assert.deepEqual(historyLabels(backup(3, 'Footer touch-ups'), t), {
    title: 'Footer touch-ups',
    badge: 'Backup 3'
  })
})

test('the point taken before a restore is said in the reader’s language', () => {
  const row = backup(4, 'Before restore to Backup 2', { auto: 'pre-restore' })
  assert.deepEqual(historyLabels(row, t), { title: 'Before restore to Backup 2', badge: 'Backup 4' })
  const de = over({
    ...baseEn,
    'workspace.backup.beforeRestore': 'Vor der Wiederherstellung auf Sicherung {m}',
    'workspace.kind.backup': 'Sicherung {n}'
  })
  assert.deepEqual(historyLabels(row, de), {
    title: 'Vor der Wiederherstellung auf Sicherung 2',
    badge: 'Sicherung 4'
  })
  // Only Tracy's own point is read that way: a person may title a backup with the same words.
  assert.equal(historyLabels(backup(5, 'Before restore to Backup 2'), de).title, 'Before restore to Backup 2')
})

test('moments and outside rows keep their title and say their kind', () => {
  const moment = {
    kind: 'moment',
    sha: 'a',
    at: 1,
    by: { kind: 'agent' },
    title: 'Tighten the footer',
    files: 1
  }
  assert.deepEqual(historyLabels(moment, t), { title: 'Tighten the footer', badge: 'Change' })
  assert.deepEqual(historyLabels({ ...moment, kind: 'outside', title: 'Edited on the site' }, t), {
    title: 'Edited on the site',
    badge: 'Outside'
  })
})
