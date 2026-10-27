// The visitor's light/dark choice and the design-system slot (ADR 0031 decision 12, rules MODE-1, MODE-2,
// UNDO-1; TCH #1315 and #1318 brought the same to Tracy Business EmDash).
//
// Up to 0.5.3 a worn system was one look: the slot hid the theme toggle and the pre-paint script returned
// early, so a dark system read as the derived light side was never possible and MODE-2 could not pass.
// From 0.5.4 the server opens the page on the system's own side (data-theme from the slot's mode line), the
// toggle stays, and a choice made while a system is worn is stored under that system's own key, so taking
// the system off gives the template back exactly as before.
//
// These tests run the real scripts (the pre-paint one in Base.astro, the toggle in Header.astro and in
// OnepageHeader.astro) against a small fake document that shares one localStorage between page loads.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const read = (/** @type {string} */ rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const PRE_PAINT = /<script is:inline>\s*(\/\/ Resolve the theme before first paint[\s\S]*?)<\/script>/.exec(
  read('src/layouts/Base.astro')
)?.[1]
const toggleOf = (/** @type {string} */ rel) => {
  const ts = /<script>\s*([\s\S]*?const KEY[\s\S]*?)<\/script>/.exec(read(rel))?.[1]
  return ts ? stripTypeScriptTypes(ts) : undefined
}
const TOGGLES = {
  Header: toggleOf('src/components/site/Header.astro'),
  OnepageHeader: toggleOf('src/components/site/OnepageHeader.astro')
}

function fakeStorage() {
  const map = new Map()
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k)
  }
}

/**
 * One page load in one browser. `worn` is the slot the server read (null = no system), rendered the way
 * Base.astro does: data-ds-worn always, data-theme="dark" for a dark system, <style id="tracy-ds-slot" data-ds>.
 */
function openPage(storage, toggle, { worn = null, search = '', osDark = false } = {}) {
  const attrs = new Map()
  if (worn) attrs.set('data-ds-worn', '')
  if (worn?.mode === 'dark') attrs.set('data-theme', 'dark')
  const html = {
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    setAttribute: (n, v) => void attrs.set(n, String(v)),
    removeAttribute: (n) => void attrs.delete(n),
    hasAttribute: (n) => attrs.has(n)
  }
  const slotStyle = worn
    ? { id: 'tracy-ds-slot', getAttribute: (n) => (n === 'data-ds' ? worn.id : null) }
    : null
  const listeners = []
  const button = { setAttribute() {}, addEventListener: (type, fn) => type === 'click' && listeners.push(fn) }
  const document = {
    documentElement: html,
    getElementById: (id) => (id === 'tracy-ds-slot' ? slotStyle : null),
    querySelectorAll: (sel) => (sel === '[data-tracy-theme-toggle]' ? [button] : [])
  }
  const window = { matchMedia: () => ({ matches: osDark }) }
  const context = vm.createContext({
    document,
    window,
    localStorage: storage,
    location: { search },
    URLSearchParams
  })
  vm.runInContext(PRE_PAINT, context)
  vm.runInContext(toggle, context)
  return { theme: () => html.getAttribute('data-theme'), click: () => listeners.forEach((fn) => fn()) }
}

const DARK = { id: 'Midnight', mode: 'dark' }
const LIGHT = { id: 'Paper', mode: 'light' }

test('the theme scripts are where this test reads them', () => {
  assert.ok(PRE_PAINT, 'Base.astro pre-paint script')
  for (const [name, t] of Object.entries(TOGGLES)) assert.ok(t, `${name}.astro theme toggle`)
})

test('the server opens a worn system on its own side and the slot reader passes the mode line on', () => {
  const base = read('src/layouts/Base.astro')
  assert.match(base, /data-theme=\{dsSlot\?\.mode === 'dark' \? 'dark' : undefined\}/)
  assert.match(read('src/lib/ds-slot.ts'), /\/\\\* mode: \(light\|dark\) \\\*\\\//)
})

for (const [name, toggle] of Object.entries(TOGGLES)) {
  test(`${name}: UNDO-1, wearing a dark system then taking it off opens the template light again`, () => {
    const storage = fakeStorage()
    assert.equal(openPage(storage, toggle, { worn: DARK }).theme(), 'dark', 'a dark system opens dark')
    assert.equal(storage.map.size, 0, 'opening on the system’s own mode stores nothing')
    assert.equal(openPage(storage, toggle).theme(), null, 'system off: the template’s light default')
  })

  test(`${name}: a choice made while a system is worn stays with that system`, () => {
    const storage = fakeStorage()
    openPage(storage, toggle, { worn: DARK }).click()
    assert.equal(
      openPage(storage, toggle, { worn: DARK }).theme(),
      null,
      'the visitor’s explicit light is kept'
    )
    assert.equal(storage.getItem('tracy-base-theme'), null, 'the template’s own key is untouched')
    assert.equal(openPage(storage, toggle).theme(), null)
    openPage(storage, toggle, { worn: LIGHT }).click()
    assert.equal(openPage(storage, toggle, { worn: LIGHT }).theme(), 'dark')
    assert.equal(openPage(storage, toggle).theme(), null)
  })

  test(`${name}: the template’s own choice survives a system worn and taken off`, () => {
    const storage = fakeStorage()
    openPage(storage, toggle).click()
    assert.equal(storage.getItem('tracy-base-theme'), 'dark', 'the template’s key, as before')
    assert.equal(openPage(storage, toggle, { worn: LIGHT }).theme(), null, 'a worn light system opens light')
    assert.equal(openPage(storage, toggle).theme(), 'dark', 'system off: the visitor’s choice from before')
  })
}

test('the OS preference still picks the template’s side, but never flips a worn system', () => {
  const storage = fakeStorage()
  assert.equal(openPage(storage, TOGGLES.Header, { osDark: true }).theme(), 'dark')
  assert.equal(openPage(storage, TOGGLES.Header, { osDark: true, worn: LIGHT }).theme(), null)
})

test('?theme= wins for one page load and is never stored', () => {
  const storage = fakeStorage()
  assert.equal(openPage(storage, TOGGLES.Header, { search: '?theme=dark' }).theme(), 'dark')
  assert.equal(storage.map.size, 0)
  assert.equal(openPage(storage, TOGGLES.Header).theme(), null)
})
