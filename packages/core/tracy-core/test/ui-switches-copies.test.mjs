/**
 * `uiSwitches()` across bundle copies. Every Tracy plugin bundles its own copy of this module, so a
 * dsh page holds a dozen of them (14 on cowork.tracy.site, 25/10/2026). A copy first asked late — My
 * Sites' module, the first time the Browser toolbar's More menu opened — started from the code
 * defaults and drew the menu before its own read landed: `site-sync-to-live` (off by default, on in
 * `/ops`) read off, and its row never showed. Its first mark also wrote the defaults back onto
 * `<html>`, hiding every off-by-default piece the page already showed until that read came back.
 *
 * Own file, so its page-wide state starts empty: `node --test` gives each file its own process.
 * Each `import()` with a distinct query is a separate module instance, as each bundle copy is.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const MODULE = new URL('../src/ui-switches/index.mjs', import.meta.url).href
const copy = (n) => import(`${MODULE}?copy=${n}`)

const fakeRoot = () => {
  const writes = []
  return {
    setAttribute: (name, value) => {
      if (name === 'data-tracy-hide') writes.push(value.split(' ').filter(Boolean).sort())
    },
    writes
  }
}

test('a bundle copy first asked after the door answered reads the answer at once, and every copy shares one read', async () => {
  const realFetch = globalThis.fetch
  const realDocument = globalThis.document
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    // The operator turned Sync to live on: the door leaves it out of the hidden list.
    return new Response(JSON.stringify({ hidden: ['language'] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  const root = fakeRoot()
  globalThis.document = { documentElement: root }
  try {
    const early = (await copy(1)).uiSwitches()
    assert.equal(early.isShown('site-sync-to-live'), false, 'before any answer: the code default')
    await early.ready
    assert.equal(early.isShown('site-sync-to-live'), true)
    const answered = root.writes.at(-1)

    // Another plugin's copy, asked for the first time long after the page loaded.
    const late = (await copy(2)).uiSwitches()
    assert.equal(late.isShown('site-sync-to-live'), true, 'no default window: the page already knows')
    assert.equal(late.isShown('language'), false)
    assert.deepEqual(root.writes.at(-1), answered, 'its first mark is the answer, not the defaults')
    await late.ready
    assert.equal(calls, 1, 'one read of the door for the whole page')

    // A copy asked while the read is still on its way joins it and hears it land.
    calls = 0
    delete globalThis[Symbol.for('@tracy/core/ui-switches#page-read')]
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const slowFetch = globalThis.fetch
    globalThis.fetch = async (...args) => {
      await gate
      return slowFetch(...args)
    }
    const a = (await copy(3)).uiSwitches()
    const b = (await copy(4)).uiSwitches()
    let heard = 0
    b.subscribe(() => heard++)
    assert.equal(b.isShown('site-sync-to-live'), false)
    release()
    await Promise.all([a.ready, b.ready])
    assert.equal(b.isShown('site-sync-to-live'), true)
    assert.equal(heard, 1)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = realFetch
    if (realDocument === undefined) delete globalThis.document
    else globalThis.document = realDocument
  }
})
