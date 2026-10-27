/**
 * The /ops language store: which language's dictionary is on screen while picks arrive faster than
 * dictionaries load, and what happens when one cannot be loaded. English needs no load; every other
 * language is fetched once and kept.
 *
 *   node --test packages/web/tracy-harness/test/ops-language-store.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createLanguageStore } from '../src/i18n/language-store.ts'

/** A loader whose every call waits until the test settles it. */
function heldLoader() {
  const calls = []
  const load = (lang) =>
    new Promise((resolve, reject) => {
      calls.push({ lang, resolve, reject })
    })
  const settle = async (lang, table) => {
    calls.find((c) => c.lang === lang && !c.done).resolve(table)
    calls.find((c) => c.lang === lang && !c.done).done = true
    await new Promise((r) => setTimeout(r, 0))
  }
  const fail = async (lang) => {
    const call = calls.find((c) => c.lang === lang && !c.done)
    call.done = true
    call.reject(new Error('chunk failed (fixture)'))
    await new Promise((r) => setTimeout(r, 0))
  }
  return { calls, load, settle, fail }
}

test('English is on screen at once and loads nothing', async () => {
  const loader = heldLoader()
  const applied = []
  const store = createLanguageStore({ initial: 'en', load: loader.load, onApply: (l) => applied.push(l) })
  await store.ready
  assert.equal(store.get().lang, 'en')
  assert.deepEqual(store.get().table, {})
  assert.equal(loader.calls.length, 0)
  assert.deepEqual(applied, ['en'])
})

test('a picked language shows once its dictionary arrives, the previous one until then', async () => {
  const loader = heldLoader()
  const store = createLanguageStore({ initial: 'en', load: loader.load })
  const done = store.select('de')
  assert.equal(store.get().lang, 'en')
  assert.equal(store.get().pending, 'de')
  await loader.settle('de', { 'shell.x': 'X auf Deutsch' })
  await done
  assert.equal(store.get().lang, 'de')
  assert.equal(store.get().pending, null)
  assert.equal(store.get().table['shell.x'], 'X auf Deutsch')
})

test('de then fr in quick succession ends on fr, whichever dictionary arrives last', async () => {
  for (const order of [
    ['de', 'fr'],
    ['fr', 'de']
  ]) {
    const loader = heldLoader()
    const applied = []
    const store = createLanguageStore({ initial: 'en', load: loader.load, onApply: (l) => applied.push(l) })
    await store.ready
    store.select('de')
    store.select('fr')
    for (const lang of order) await loader.settle(lang, { k: lang })
    assert.equal(store.get().lang, 'fr', `arrival order ${order}`)
    assert.equal(store.get().table.k, 'fr')
    assert.ok(!applied.includes('de'), `de was never applied (order ${order}): ${applied}`)
  }
})

test('a pick back to English while a dictionary loads wins over the late dictionary', async () => {
  const loader = heldLoader()
  const store = createLanguageStore({ initial: 'en', load: loader.load })
  store.select('de')
  store.select('en')
  await loader.settle('de', { k: 'de' })
  assert.equal(store.get().lang, 'en')
  assert.equal(store.get().pending, null)
})

test('a dictionary that fails to load leaves English on screen, says which failed, and can be retried', async () => {
  const loader = heldLoader()
  const applied = []
  const store = createLanguageStore({ initial: 'nl', load: loader.load, onApply: (l) => applied.push(l) })
  await loader.fail('nl')
  await store.ready
  assert.equal(store.get().lang, 'en')
  assert.equal(store.get().failed, 'nl')
  assert.equal(store.get().pending, null)
  assert.deepEqual(applied, ['en'])
  const again = store.retry()
  assert.equal(loader.calls.filter((c) => c.lang === 'nl').length, 2, 'the failure was not cached')
  await loader.settle('nl', { k: 'nl' })
  await again
  assert.equal(store.get().lang, 'nl')
  assert.equal(store.get().failed, null)
})

test('a loaded language is kept: switching back to it loads nothing', async () => {
  const loader = heldLoader()
  const store = createLanguageStore({ initial: 'en', load: loader.load })
  const first = store.select('it')
  await loader.settle('it', { k: 'it' })
  await first
  await store.select('en')
  await store.select('it')
  assert.equal(store.get().lang, 'it')
  assert.equal(loader.calls.length, 1)
})

test('subscribers hear every change, and an unknown language id reads as English', async () => {
  const loader = heldLoader()
  const store = createLanguageStore({ initial: 'klingon', load: loader.load })
  assert.equal(store.get().lang, 'en')
  let heard = 0
  const stop = store.subscribe(() => {
    heard += 1
  })
  const p = store.select('es')
  await loader.settle('es', {})
  await p
  stop()
  await store.select('en')
  assert.equal(heard, 2, 'pending, then applied; nothing after unsubscribe')
})
