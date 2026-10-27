import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mergeNotes, readTable, readOpened, noteId, notesMarkdown } from '../visual/notes.mjs'

const shots = [
  { stage: 'light-desktop', file: '/run/shots/en-home--1440-light.png', consumers: ['layout', 'color'] },
  { stage: 'light-desktop', file: '/run/shots/en-home--1440-light--source.png', consumers: ['layout'] },
  { stage: 'dark-desktop', file: '/run/shots/en-home--1440-dark.png', consumers: ['color'] }
]
const layoutNotes = `# layout
## Opened
- /run/shots/en-home--1440-light.png
- /run/shots/en-home--1440-light--source.png
## Notes
| Page | Axis | What | Where | Fix | Verify | Flag |
|---|---|---|---|---|---|---|
| en-home | 1440-light | cards touch \\| no gap | services grid | set gap | gap 24px | |
| en-home | 1440-light | hero eyebrow missing | hero | seed eyebrow | eyebrow shows | LEE |
`
const colorNotes = `# color
## Opened
- /run/shots/en-home--1440-light.png
## Notes
| Page | Axis | What | Where | Fix | Verify | Flag |
|---|---|---|---|---|---|---|
| en-home | 1440-light | cards touch \\| no gap | services grid | set gap | gap 24px | |
`
const machine = [
  { id: 'M1', layout: 'home', status: 'open', lens: 'machine:scan:contrast', page: 'en-home', axis: '1440-light', stage: 'light-desktop', what: 'cr 2.1 on .chip', fix: 'raise token', verify: 'rerun' },
  { id: 'M2', layout: 'home', status: 'open', lens: 'machine:scan:contrast', page: 'en-home', axis: '1440-dark', stage: 'dark-desktop', what: 'other stage', fix: '', verify: '' }
]

test('notes: tables with escaped pipes read back; Opened lists the pictures a lens looked at', () => {
  const rows = readTable(layoutNotes, '## Notes')
  assert.equal(rows[0].what, 'cards touch | no gap')
  assert.deepEqual(readOpened(layoutNotes).length, 2)
})

test('notes: merge folds machine + two lenses into one list — same page/axis/what from two lenses is one row with both tags; stage filters machine rows; coverage names the picture a consumer skipped', () => {
  const r = mergeNotes({ stage: 'light-desktop', machine, lensNotes: { layout: layoutNotes, color: colorNotes }, shots })
  const shared = r.todos.find((t) => t.what === 'cards touch | no gap')
  assert.deepEqual(shared.lenses, ['layout', 'color'])
  assert.equal(r.todos.filter((t) => t.id.startsWith('M-')).length, 1, 'the dark-stage machine row is not in the light merge')
  assert.equal(r.todos.find((t) => t.flag === 'LEE').what, 'hero eyebrow missing')
  assert.equal(r.counts.open, 3)
  assert.equal(r.coverage.missing.length, 0, 'every consumer opened its pictures')
  const md = notesMarkdown({ ...r, at: 'now' })
  assert.match(md, /\| layout, color \| en-home \| 1440-light \| cards touch \\\| no gap/)
})

test('notes: a fix marks done; the lens that wrote the row closes it; a machine row gone on rerun closes itself, one still present after a done fix reopens', () => {
  const first = mergeNotes({ stage: 'light-desktop', machine, lensNotes: { layout: layoutNotes }, shots })
  const nId = first.todos.find((t) => t.what === 'cards touch | no gap').id
  const mId = first.todos.find((t) => t.id.startsWith('M-')).id
  const fixes = [
    { id: nId, status: 'done', fix: 'gap set' },
    { id: mId, status: 'done', fix: 'token raised' }
  ]
  const closes = { layout: [{ id: nId, status: 'closed', reason: 'gap is 24px' }], color: [{ id: nId, status: 'reopened', reason: 'not mine' }] }
  const second = mergeNotes({ stage: 'light-desktop', machine, lensNotes: { layout: layoutNotes }, fixes, closes, prior: { todos: first.todos.map((t) => (t.id === mId ? { ...t, status: 'done', fixNote: 'token raised' } : t)) }, shots })
  assert.equal(second.todos.find((t) => t.id === nId).status, 'closed', 'closed by its own lens; the other lens cannot reopen a row it did not write')
  assert.equal(second.todos.find((t) => t.id === mId).status, 'reopened')
  const third = mergeNotes({ stage: 'light-desktop', machine: [], lensNotes: { layout: layoutNotes }, prior: second, shots })
  assert.equal(third.todos.find((t) => t.id === mId).status, 'closed')
  assert.equal(third.todos.find((t) => t.id === mId).closeNote, 'gone on rerun')
})

test('notes: a lens that did not open a picture it consumes is a coverage miss; ids are stable', () => {
  const r = mergeNotes({ stage: 'light-desktop', lensNotes: { color: colorNotes }, shots })
  assert.deepEqual(r.coverage.missing.map((m) => m.lens), ['layout', 'layout'])
  assert.equal(noteId('N', 'a', 'b', 'c', 'd'), noteId('N', 'a', 'b', 'c', 'd'))
})

test('notes: when two coding agents answer one id, done beats a skipped handoff', () => {
  const first = mergeNotes({ stage: 'light-desktop', lensNotes: { layout: layoutNotes }, shots })
  const nId = first.todos.find((t) => t.what === 'cards touch | no gap').id
  const r = mergeNotes({ stage: 'light-desktop', lensNotes: { layout: layoutNotes }, shots, fixes: [{ id: nId, status: 'done', fix: 'gap set' }, { id: nId, status: 'skipped', fix: '→ tokens-css' }] })
  const t = r.todos.find((x) => x.id === nId)
  assert.equal(t.status, 'done')
  assert.match(t.fixNote, /gap set/)
})

test('notes: a picture cut into tiles is opened only when EVERY tile was — the full-page file alone proves nothing; a tile of an assigned picture is not "extra"', () => {
  const tiled = [{ stage: 'light-desktop', file: '/run/shots/en-home--1440-light.png', tiles: ['/run/shots/en-home--1440-light/0.png', '/run/shots/en-home--1440-light/1.png'], consumers: ['layout'] }]
  const notes = (opened) => `# layout\n## Opened\n${opened.map((f) => `- ${f}`).join('\n')}\n## Notes\n| Page | Axis | What | Where | Fix | Verify | Flag |\n|---|---|---|---|---|---|---|\n`
  let r = mergeNotes({ stage: 'light-desktop', lensNotes: { layout: notes(['/run/shots/en-home--1440-light.png']) }, shots: tiled })
  assert.deepEqual(r.coverage.missing.map((m) => m.file), ['/run/shots/en-home--1440-light/0.png', '/run/shots/en-home--1440-light/1.png'])
  r = mergeNotes({ stage: 'light-desktop', lensNotes: { layout: notes(['/run/shots/en-home--1440-light/0.png']) }, shots: tiled })
  assert.deepEqual(r.coverage.missing.map((m) => m.file), ['/run/shots/en-home--1440-light/1.png'])
  assert.deepEqual(r.coverage.extra, [])
  r = mergeNotes({ stage: 'light-desktop', lensNotes: { layout: notes(['/run/shots/en-home--1440-light/0.png', '/run/shots/en-home--1440-light/1.png']) }, shots: tiled })
  assert.deepEqual(r.coverage.missing, [])
})

// After a CSS change every page is shot again into a new folder, and only the changed pages draw
// differently: a tile whose bytes the lens already opened under the earlier run's path was looked at.
test('notes: a tile opened under another path with the same bytes counts as opened; different bytes do not', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'notes-'))
  const a = path.join(dir, 'a.png')
  const b = path.join(dir, 'b.png')
  const c = path.join(dir, 'c.png')
  writeFileSync(a, 'same-picture')
  writeFileSync(b, 'same-picture')
  writeFileSync(c, 'another-picture')
  const shots = [{ stage: 'light-desktop', file: path.join(dir, 'p.png'), tiles: [b, c], consumers: ['layout'] }]
  const notes = `# layout\n## Opened\n- ${a}\n## Notes\n| Page | Axis | What | Where | Fix | Verify | Flag |\n|---|---|---|---|---|---|---|\n`
  const r = mergeNotes({ stage: 'light-desktop', lensNotes: { layout: notes }, shots })
  assert.deepEqual(r.coverage.missing.map((m) => m.file), [c])
})

test('notes: Flag SOURCE (the source has the same defect) stays a todo to fix — counted apart, never blocking like LEE', () => {
  const text = `# layout\n## Opened\n- /run/shots/en-home--1440-light.png\n- /run/shots/en-home--1440-light--source.png\n## Notes\n| Page | Axis | What | Where | Fix | Verify | Flag |\n|---|---|---|---|---|---|---|\n| en-home | 1440-light | unit wraps alone under the figure (source wraps too) | stats | nowrap | one line | SOURCE |\n`
  const r = mergeNotes({ stage: 'light-desktop', lensNotes: { layout: text }, shots })
  const t = r.todos.find((x) => x.id.startsWith('N-'))
  assert.equal(t.flag, 'SOURCE')
  assert.equal(t.status, 'open')
  assert.equal(r.counts.leeFlagged, 0)
  assert.equal(r.counts.sourceFlagged, 1)
  assert.match(notesMarkdown(r), /\[SOURCE\] 1/)
})

// The merged list is what the coding agent works from: the clusters of the run's machine findings
// are shown before the todo rows. Ids, counts and closing are exactly what they were.
test('notes: merge shows the run clusters before the todos; ids and counts do not change', async () => {
  const { mergeRun } = await import('../visual/notes.mjs')
  const { writeClusters } = await import('../visual/cluster.mjs')
  const { mkdirSync } = await import('node:fs')
  const dir = mkdtempSync(path.join(tmpdir(), 'notes-clusters-'))
  mkdirSync(path.join(dir, 'notes'))
  writeFileSync(path.join(dir, 'notes', 'machine.json'), JSON.stringify(machine))
  const without = mergeRun(dir, 'light-desktop')
  assert.equal(without.clusters, undefined)
  assert.doesNotMatch(notesMarkdown(without), /Clusters first/)
  const d = (w) => ({ kind: 'parity-mismatch', element: `h3.t "${w}"`, deltas: [{ property: 'color', expected: 'rgb(0, 0, 0)', observed: 'rgb(9, 9, 9)' }] })
  writeClusters(dir, [{ id: 'en-home', axes: [{ variant: '1440-light', findings: [d('A'), d('B')], accepted: [] }] }], { at: 'now' })
  const withClusters = mergeRun(dir, 'light-desktop')
  assert.deepEqual(withClusters.todos.map((t) => t.id), without.todos.map((t) => t.id))
  assert.deepEqual(withClusters.counts, without.counts)
  assert.ok(withClusters.clusters.clusters.every((c) => !('members' in c)), 'the digest carries no members; clusters.json does')
  const md = notesMarkdown(withClusters)
  assert.ok(md.indexOf('## Clusters first') < md.indexOf('| Id | Lens |'))
  assert.match(md, /\| C-[0-9a-f]{8} \| 2 \| parity-mismatch \| h3\.t \| color \| rgb\(0, 0, 0\) → rgb\(9, 9, 9\) \| 1 \| en-home \|/)
})
