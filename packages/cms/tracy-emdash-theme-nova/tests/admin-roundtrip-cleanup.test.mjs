// admin-roundtrip.mjs takes its own stamp, and only its stamp, out of the entry when the run fails
// after the save or the restore is not proven (the decisions only; editing needs a browser and a site).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { newStamp, restoreVerified, stampCleanup, withoutStamp } from '../tools/roundtrip-cleanup.mjs'

test('a failure after the stamp was saved asks for the stamp to be removed', () => {
  assert.equal(stampCleanup({ stampSaved: true, restored: false }), 'remove')
})

test('a run that failed before the save, or restored the entry itself, leaves the site alone', () => {
  assert.equal(stampCleanup({ stampSaved: false, restored: false }), 'none')
  assert.equal(stampCleanup({ stampSaved: true, restored: true }), 'none')
  assert.equal(stampCleanup(), 'none')
})

test('every run has its own stamp', () => {
  const a = newStamp(1)
  const b = newStamp(1)
  assert.match(a, /^Edited in admin 1-[0-9a-f]{8}$/)
  assert.notEqual(a, b)
})

test('withoutStamp takes out this run’s stamp only; other text, an edit made meanwhile and another run’s stamp stay', () => {
  const stamp = 'Edited in admin 5-0a1b2c3d'
  assert.equal(withoutStamp(`Our story ${stamp}`, stamp), 'Our story')
  assert.equal(withoutStamp(`Our story, edited by Ana ${stamp}`, stamp), 'Our story, edited by Ana')
  const other = 'Edited in admin 5-ffffffff'
  assert.equal(withoutStamp(`Text ${other} ${stamp}`, stamp), `Text ${other}`)
  assert.equal(withoutStamp('Edited in admin is a phrase', stamp), 'Edited in admin is a phrase')
  assert.equal(withoutStamp(stamp, stamp), '')
})

test('the restore counts only when the publish went through and neither field nor public page holds the stamp', () => {
  const stamp = 'Edited in admin 5-0a1b2c3d'
  assert.equal(
    restoreVerified({ published: true, fieldValue: 'Our story', publicHasStamp: false, stamp }),
    true
  )
  assert.equal(
    restoreVerified({ published: false, fieldValue: 'Our story', publicHasStamp: false, stamp }),
    false
  )
  assert.equal(
    restoreVerified({ published: true, fieldValue: 'Our story', publicHasStamp: true, stamp }),
    false
  )
  assert.equal(
    restoreVerified({ published: true, fieldValue: `Our story ${stamp}`, publicHasStamp: false, stamp }),
    false
  )
  assert.equal(restoreVerified({ stamp }), false)
})

test('admin-roundtrip.mjs: cleanup in finally before the browser closes, restore proven before it counts, no value written back', () => {
  const source = readFileSync(new URL('../tools/admin-roundtrip.mjs', import.meta.url), 'utf8')
  const fin = source.slice(source.lastIndexOf('} finally {'))
  assert.match(fin, /stampCleanup\(run\) === 'remove'/)
  assert.ok(
    fin.indexOf('removeStamp()') < fin.indexOf('browser.close()'),
    'cleanup runs while the browser is open'
  )
  assert.ok(
    source.indexOf('run.stampSaved = true') < source.indexOf('const saved = await saveAndPublish()'),
    'the stamp counts as saved from the moment the save starts'
  )
  assert.match(source, /run\.restored = restoreVerified\(/)
  assert.doesNotMatch(source, /run\.restored = true/)
  const remove = source.slice(source.indexOf('async function removeStamp'), source.indexOf('\ntry {'))
  assert.doesNotMatch(
    remove,
    /discardDraft|run\.original/,
    'cleanup neither drops a draft nor writes an old value back'
  )
  assert.match(remove, /withoutStamp\(current, run\.stamp\)/)
})
