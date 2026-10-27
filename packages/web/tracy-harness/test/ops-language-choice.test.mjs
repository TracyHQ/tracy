/**
 * How /ops picks and remembers its language (plan `tasks/todo-ops-i18n.md`, D5): its own choice in
 * `localStorage` (`tracy.ops.lang`), the `tracy_lang` cookie of Settings › Language only READ as a
 * starting value and never written or deleted, then the browser, then English. `?lang=` speaks for
 * one page load and is not remembered. A browser that refuses storage still switches language.
 *
 * WHAT RUNS: the real module over a fixture window (location, storage, cookie jar, navigator,
 * `<html>`); dictionaries come from a fixture loader. No browser.
 *
 *   node --test packages/web/tracy-harness/test/ops-language-choice.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createOpsLanguage, OPS_LANGUAGE_KEY } from '../src/i18n/ops-language.ts'

/** A window as /ops reads it. `storage: 'refused'` throws on every access, as a locked-down browser does. */
function fixtureWindow({ search = '', saved, cookie = '', languages = ['en-US'], storage = 'ok' } = {}) {
  const items = new Map(
    Object.entries({ 'tracy.ops.theme': 'dark', ...(saved ? { [OPS_LANGUAGE_KEY]: saved } : {}) })
  )
  const cookieWrites = []
  const refuse = () => {
    throw new Error('SecurityError (fixture)')
  }
  const localStorage =
    storage === 'refused'
      ? { getItem: refuse, setItem: refuse, removeItem: refuse }
      : {
          getItem: (k) => items.get(k) ?? null,
          setItem: (k, v) => void items.set(k, String(v)),
          removeItem: (k) => void items.delete(k)
        }
  const root = { lang: 'en' }
  const document = {
    documentElement: root,
    get cookie() {
      return cookie
    },
    set cookie(value) {
      cookieWrites.push(value)
    }
  }
  const win = {
    location: { search },
    navigator: { languages, language: languages[0] ?? '' },
    document
  }
  if (storage === 'getter-throws')
    Object.defineProperty(win, 'localStorage', {
      get: refuse
    })
  else win.localStorage = localStorage
  return { win, items, cookieWrites, root }
}

const load = async (lang) => ({ 'shell.sample': `sample in ${lang}` })
const settle = () => new Promise((r) => setTimeout(r, 0))

test('the first language found wins: ?lang=, the /ops choice, the tracy_lang cookie, the browser, English', async () => {
  for (const [visitor, want] of [
    [{ search: '?lang=fr', saved: 'de', cookie: 'tracy_lang=it', languages: ['es'] }, 'fr'],
    [{ search: '?lang=xx', saved: 'de', cookie: 'tracy_lang=it', languages: ['es'] }, 'de'],
    [{ saved: 'klingon', cookie: 'a=1; tracy_lang=it', languages: ['es'] }, 'it'],
    [{ cookie: 'tracy_lang=%E0%A4%A', languages: ['ja', 'nl-BE'] }, 'nl'],
    [{ languages: ['zh-CN'] }, 'zh'],
    [{ languages: ['zh-TW'] }, 'en'],
    [{ languages: ['zh-Hant-HK', 'pt-BR'] }, 'en'],
    [{ languages: [] }, 'en']
  ]) {
    const { win } = fixtureWindow(visitor)
    const ops = createOpsLanguage({ win, load })
    await ops.store.ready
    assert.equal(ops.store.get().lang, want, JSON.stringify(visitor))
  }
})

test('<html lang> follows the language on screen, Chinese written zh-CN', async () => {
  const { win, root } = fixtureWindow({ languages: ['zh'] })
  const ops = createOpsLanguage({ win, load })
  await ops.store.ready
  assert.equal(root.lang, 'zh-CN')
  await ops.setLanguage('de')
  assert.equal(root.lang, 'de')
})

test('a pick is remembered in tracy.ops.lang; ?lang= alone is not', async () => {
  const { win, items } = fixtureWindow({ search: '?lang=fr' })
  const ops = createOpsLanguage({ win, load })
  await ops.store.ready
  assert.equal(items.has(OPS_LANGUAGE_KEY), false, 'the address speaks for this load only')
  assert.equal(ops.followsDevice(), true)
  await ops.setLanguage('nl')
  assert.equal(items.get(OPS_LANGUAGE_KEY), 'nl')
  assert.equal(ops.store.get().lang, 'nl')
  assert.equal(ops.followsDevice(), false)
})

test('Follow device forgets only tracy.ops.lang and goes back to the cookie, then the browser', async () => {
  const { win, items } = fixtureWindow({ saved: 'de', cookie: 'tracy_lang=it', languages: ['es'] })
  const ops = createOpsLanguage({ win, load })
  await ops.store.ready
  assert.equal(ops.store.get().lang, 'de')
  await ops.setLanguage('device')
  assert.equal(items.has(OPS_LANGUAGE_KEY), false)
  assert.equal(items.get('tracy.ops.theme'), 'dark', 'the theme choice is untouched')
  assert.equal(ops.store.get().lang, 'it')
  assert.equal(ops.followsDevice(), true)
  const noCookie = fixtureWindow({ saved: 'de', languages: ['es-MX'] })
  const other = createOpsLanguage({ win: noCookie.win, load })
  await other.setLanguage('device')
  assert.equal(other.store.get().lang, 'es')
})

test('the tracy_lang cookie is never written or deleted, whatever is picked', async () => {
  const { win, cookieWrites } = fixtureWindow({ cookie: 'tracy_lang=vi' })
  const ops = createOpsLanguage({ win, load })
  await ops.store.ready
  for (const pick of ['de', 'en', 'device', 'zh', 'device']) await ops.setLanguage(pick)
  await settle()
  assert.deepEqual(cookieWrites, [])
})

test('a browser that refuses storage still switches language and does not crash', async () => {
  for (const storage of ['refused', 'getter-throws']) {
    const { win } = fixtureWindow({ storage, languages: ['fr'] })
    const ops = createOpsLanguage({ win, load })
    await ops.store.ready
    assert.equal(ops.store.get().lang, 'fr', storage)
    await ops.setLanguage('de')
    assert.equal(ops.store.get().lang, 'de', storage)
    await ops.setLanguage('device')
    assert.equal(ops.store.get().lang, 'fr', storage)
  }
})

test('a window with no cookie, no navigator and a broken address still starts in English', async () => {
  const win = {
    get location() {
      throw new Error('no location (fixture)')
    },
    document: {
      documentElement: {},
      get cookie() {
        throw new Error('no cookie (fixture)')
      }
    }
  }
  const ops = createOpsLanguage({ win, load })
  await ops.store.ready
  assert.equal(ops.store.get().lang, 'en')
})
