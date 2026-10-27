/**
 * The badge settings a staff member edits at `/ops/widget`. What is worth pinning: the defaults are
 * themselves valid (a screen that opens on an invalid document has nowhere to go), every shape the
 * validator refuses is one that would reach a customer's page, and a database with no row — or no
 * database at all — reads as the defaults rather than as an error.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_SETTING, readBadgeSettings, validateBadgeSetting } from '../src/lib/badge-setting.js'

test('the defaults validate, for both badges', () => {
  for (const id of ['seat', 'advert']) {
    const out = validateBadgeSetting(id, DEFAULT_SETTING[id])
    assert.equal(out.error, undefined, `${id}: ${JSON.stringify(out)}`)
    assert.deepEqual(out.setting, DEFAULT_SETTING[id])
  }
})

test('a colour is six lowercase hex digits, and uppercase is normalised rather than refused', () => {
  const upper = structuredClone(DEFAULT_SETTING.seat)
  upper.style.bg = '#ABCDEF'
  assert.equal(validateBadgeSetting('seat', upper).setting.style.bg, '#abcdef')
  for (const bad of ['#abc', 'red', '#ggggggg', '#12345', 'abcdef', '#abcdef; color:red']) {
    const s = structuredClone(DEFAULT_SETTING.seat)
    s.style.accent = bad
    const out = validateBadgeSetting('seat', s)
    assert.equal(out.error, 'INVALID_SETTING', bad)
    assert.equal(out.path, 'style.accent', bad)
  }
})

test('position is left or right, and nothing else', () => {
  const s = structuredClone(DEFAULT_SETTING.advert)
  s.style.position = 'top'
  assert.deepEqual(validateBadgeSetting('advert', s), { error: 'INVALID_SETTING', path: 'style.position' })
})

test('a label is 1..40 characters and may not carry a tag', () => {
  const cases = [
    ['', 'doors.team.label'],
    ['x'.repeat(41), 'doors.team.label'],
    ['<b>Team</b>', 'doors.team.label'],
    [42, 'doors.team.label']
  ]
  for (const [label, path] of cases) {
    const s = structuredClone(DEFAULT_SETTING.seat)
    s.doors.team.label = label
    assert.deepEqual(validateBadgeSetting('seat', s), { error: 'INVALID_SETTING', path }, String(label))
  }
  const fine = structuredClone(DEFAULT_SETTING.seat)
  fine.doors.team.label = 'Équipe & co'
  assert.equal(validateBadgeSetting('seat', fine).setting.doors.team.label, 'Équipe & co')
})

test('an unknown key anywhere is refused — the script embeds the whole document', () => {
  const top = { ...DEFAULT_SETTING.seat, css: 'body{display:none}' }
  assert.deepEqual(validateBadgeSetting('seat', top), { error: 'INVALID_SETTING', path: 'css' })
  const nested = structuredClone(DEFAULT_SETTING.advert)
  nested.style.zIndex = 1
  assert.deepEqual(validateBadgeSetting('advert', nested), { error: 'INVALID_SETTING', path: 'style.zIndex' })
  const door = structuredClone(DEFAULT_SETTING.advert)
  door.doors.publish = { on: true, label: 'Publish' }
  assert.deepEqual(validateBadgeSetting('advert', door), { error: 'INVALID_SETTING', path: 'doors.publish' })
})

test('a door is on or off, and its switch is a boolean', () => {
  const s = structuredClone(DEFAULT_SETTING.seat)
  s.doors.signIn.on = 'yes'
  assert.deepEqual(validateBadgeSetting('seat', s), { error: 'INVALID_SETTING', path: 'doors.signIn.on' })
  const missing = structuredClone(DEFAULT_SETTING.seat)
  delete missing.doors.hide
  assert.deepEqual(validateBadgeSetting('seat', missing), { error: 'INVALID_SETTING', path: 'doors.hide' })
})

test('a badge id this table does not know is refused by name', () => {
  assert.deepEqual(validateBadgeSetting('banner', DEFAULT_SETTING.seat), { error: 'UNKNOWN_BADGE' })
  assert.deepEqual(validateBadgeSetting('seat', null), { error: 'INVALID_SETTING', path: '' })
})

test('no database, or no row, reads as the defaults at revision 0', async () => {
  const none = await readBadgeSettings(null)
  assert.deepEqual(none.seat, {
    setting: DEFAULT_SETTING.seat,
    revision: 0,
    updatedBy: null,
    updatedAt: null
  })
  assert.deepEqual(none.advert.setting, DEFAULT_SETTING.advert)

  const empty = { query: async () => ({ rows: [] }) }
  assert.deepEqual(await readBadgeSettings(empty), none)
})

test('a saved row wins over the default, and the other badge keeps its default', async () => {
  const saved = structuredClone(DEFAULT_SETTING.advert)
  saved.doors.customize.label = 'Make it mine'
  const pool = {
    query: async () => ({
      rows: [{ id: 'advert', setting: saved, revision: 3, updated_by: 'a@tracy.test', updated_at: 'T' }]
    })
  }
  const out = await readBadgeSettings(pool)
  assert.deepEqual(out.advert, { setting: saved, revision: 3, updatedBy: 'a@tracy.test', updatedAt: 'T' })
  assert.deepEqual(out.seat.setting, DEFAULT_SETTING.seat)
  assert.equal(out.seat.revision, 0)
})

test('a stored row that no longer validates is not served — the defaults are', async () => {
  // A migration or a hand edit could leave a document the current validator refuses. The script
  // must never embed it; the screen shows the defaults and the person saves a fresh one.
  const pool = {
    query: async () => ({
      rows: [{ id: 'seat', setting: { style: { bg: 'red' } }, revision: 9, updated_by: 'x', updated_at: 'T' }]
    })
  }
  const out = await readBadgeSettings(pool)
  assert.deepEqual(out.seat.setting, DEFAULT_SETTING.seat)
  // The revision is the row's, so a save from the screen replaces the bad row instead of colliding.
  assert.equal(out.seat.revision, 9)
})

test('the advert alone moves: off by default, and the seat has no such switch', () => {
  assert.equal(DEFAULT_SETTING.advert.style.animation, false)
  assert.ok(!('animation' in DEFAULT_SETTING.seat.style))
  for (const on of [true, false]) {
    const s = structuredClone(DEFAULT_SETTING.advert)
    s.style.animation = on
    assert.equal(validateBadgeSetting('advert', s).setting.style.animation, on)
  }
  const seat = structuredClone(DEFAULT_SETTING.seat)
  seat.style.animation = false
  assert.deepEqual(validateBadgeSetting('seat', seat), { error: 'INVALID_SETTING', path: 'style.animation' })
})

test('the motion switch is a boolean, nothing that merely looks like one', () => {
  for (const bad of ['yes', 1, null, 'true', 0]) {
    const s = structuredClone(DEFAULT_SETTING.advert)
    s.style.animation = bad
    assert.deepEqual(
      validateBadgeSetting('advert', s),
      { error: 'INVALID_SETTING', path: 'style.animation' },
      String(bad)
    )
  }
})

test('an advert saved before the motion switch existed is accepted as still, words and all', async () => {
  // The row on the dev surface carries the words staff chose and no `animation`. Refusing it would
  // serve "Customize with Tracy" on every demo instead of the saved words.
  const old = {
    doors: {
      customize: { on: true, label: 'Like this design? Build it with Tracy' },
      close: { on: true, label: 'Close' }
    },
    style: { bg: '#bf5b3d', fg: '#ffffff', accent: '#ffffff', position: 'right', mark: true }
  }
  const checked = validateBadgeSetting('advert', old)
  assert.equal(checked.error, undefined)
  assert.deepEqual(checked.setting, { ...old, style: { ...old.style, animation: false } })

  const pool = {
    query: async () => ({
      rows: [{ id: 'advert', setting: old, revision: 4, updated_by: 'a@tracy.test', updated_at: 'T' }]
    })
  }
  const out = await readBadgeSettings(pool)
  assert.equal(out.advert.setting.doors.customize.label, 'Like this design? Build it with Tracy')
  assert.equal(out.advert.setting.style.bg, '#bf5b3d')
  assert.equal(out.advert.setting.style.animation, false)
  assert.equal(out.advert.revision, 4)
  assert.equal(out.advert.updatedBy, 'a@tracy.test')
  // Every other unknown key is still refused.
  const extra = structuredClone(old)
  extra.style.blink = true
  assert.deepEqual(validateBadgeSetting('advert', extra), { error: 'INVALID_SETTING', path: 'style.blink' })
})

test('the seat pill is off by default, and only a boolean switches it', () => {
  // Akemi 01/10/2026: no "Managed with Tracy" on a customer's site unless staff switch it on.
  assert.equal(DEFAULT_SETTING.seat.on, false)
  assert.ok(!('on' in DEFAULT_SETTING.advert), 'the advert has no such switch')
  const shown = { ...structuredClone(DEFAULT_SETTING.seat), on: true }
  assert.equal(validateBadgeSetting('seat', shown).setting.on, true)
  assert.deepEqual(validateBadgeSetting('seat', { ...shown, on: 'yes' }), {
    error: 'INVALID_SETTING',
    path: 'on'
  })
  assert.deepEqual(validateBadgeSetting('advert', { ...DEFAULT_SETTING.advert, on: true }), {
    error: 'INVALID_SETTING',
    path: 'on'
  })
})

test('a stored seat row from before the switch reads as off, its words kept', async () => {
  // Rows saved before 01/10/2026 have no `on`: they were saved when hiding the pill was not a
  // choice, so they must not keep it on now. Refusing them instead would lose the saved words.
  const old = structuredClone(DEFAULT_SETTING.seat)
  delete old.on
  old.pillLabel = 'Run by Tracy'
  const pool = {
    query: async () => ({
      rows: [{ id: 'seat', setting: old, revision: 4, updated_by: 'x', updated_at: 'T' }]
    })
  }
  const out = await readBadgeSettings(pool)
  assert.equal(out.seat.setting.on, false)
  assert.equal(out.seat.setting.pillLabel, 'Run by Tracy')
  assert.equal(out.seat.revision, 4)
})
