// The visitor's light/dark choice and the design-system slot (ADR 0031 decision 12, rules MODE-2 and UNDO-1;
// TCH #1315 and #1318 brought the same to Tracy Business EmDash).
//
// Up to 1.4.13 a worn system was one look: the slot hid the theme toggle and the pre-paint script returned
// early. From 1.4.14 the server opens the page on the system's own side (data-theme from the slot's mode
// line), the toggle stays, and a choice made while a system is worn is stored under that system's own key,
// so taking the system off gives the template back exactly as before.
//
// These tests run the real scripts (the pre-paint one in Base.astro, the toggle in ThemeToggle.astro) against
// a small fake document that shares one localStorage between page loads.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const read = (/** @type {string} */ rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const PRE_PAINT = /<script is:inline>\s*(\/\/ Apply the visitor's saved theme[\s\S]*?)<\/script>/.exec(
  read('src/layouts/Base.astro')
)?.[1]
const TOGGLE_TS = /<script>\s*([\s\S]*?)<\/script>/.exec(read('src/components/site/ThemeToggle.astro'))?.[1]
const TOGGLE = TOGGLE_TS ? stripTypeScriptTypes(TOGGLE_TS) : undefined

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
 * One page load in one browser, rendered the way Base.astro does: data-theme is the worn system's mode,
 * else the direction's default (`dark` here, the dark directions), data-ds-worn and
 * <style id="tracy-ds-slot" data-ds> while a system is worn.
 */
function openPage(storage, { worn = null, own = 'dark' } = {}) {
  const attrs = new Map([['data-theme', worn ? worn.mode : own]])
  if (worn) attrs.set('data-ds-worn', '')
  const html = {
    dataset: new Proxy(
      {},
      {
        get: (_, k) => (k === 'theme' ? attrs.get('data-theme') : undefined),
        set: (_, k, v) => (k === 'theme' && attrs.set('data-theme', String(v)), true)
      }
    ),
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    setAttribute: (n, v) => void attrs.set(n, String(v)),
    removeAttribute: (n) => void attrs.delete(n),
    hasAttribute: (n) => attrs.has(n)
  }
  const slotStyle = worn ? { getAttribute: (n) => (n === 'data-ds' ? worn.id : null) } : null
  const listeners = []
  const button = { setAttribute() {}, addEventListener: (type, fn) => type === 'click' && listeners.push(fn) }
  const document = {
    documentElement: html,
    getElementById: (id) => (id === 'tracy-ds-slot' ? slotStyle : null),
    querySelectorAll: (sel) => (sel === '[data-theme-toggle]' ? [button] : [])
  }
  const context = vm.createContext({ document, localStorage: storage })
  vm.runInContext(PRE_PAINT, context)
  vm.runInContext(TOGGLE, context)
  return { theme: () => html.getAttribute('data-theme'), click: () => listeners.forEach((fn) => fn()) }
}

const DARK = { id: 'Midnight', mode: 'dark' }
const LIGHT = { id: 'Paper', mode: 'light' }

test('the theme scripts are where this test reads them, and the server opens on the system’s mode', () => {
  assert.ok(PRE_PAINT, 'Base.astro pre-paint script')
  assert.ok(TOGGLE, 'ThemeToggle.astro script')
  assert.match(read('src/layouts/Base.astro'), /dsSlot\.mode \?\?/)
  assert.match(read('src/lib/ds-slot.ts'), /\/\\\* mode: \(light\|dark\) \\\*\\\//)
})

test('UNDO-1: wearing a light system then taking it off opens the template’s own default again', () => {
  const storage = fakeStorage()
  assert.equal(openPage(storage, { worn: LIGHT }).theme(), 'light')
  assert.equal(storage.map.size, 0, 'opening on the system’s own mode stores nothing')
  assert.equal(openPage(storage).theme(), 'dark', 'system off: the direction’s default')
})

test('a choice made while a system is worn stays with that system', () => {
  const storage = fakeStorage()
  openPage(storage, { worn: LIGHT }).click()
  assert.equal(openPage(storage, { worn: LIGHT }).theme(), 'dark', 'the visitor’s explicit dark is kept')
  assert.equal(storage.getItem('kinetic-theme'), null, 'the template’s own key is untouched')
  assert.equal(openPage(storage, { own: 'light' }).theme(), 'light', 'system off: the template default')
  openPage(storage, { worn: DARK }).click()
  assert.equal(openPage(storage, { worn: DARK }).theme(), 'light')
  assert.equal(openPage(storage).theme(), 'dark')
})

test('the template’s own choice survives a system worn and taken off', () => {
  const storage = fakeStorage()
  openPage(storage).click()
  assert.equal(storage.getItem('kinetic-theme'), 'light', 'the template’s key, as before')
  assert.equal(openPage(storage, { worn: DARK }).theme(), 'dark', 'a worn dark system opens dark')
  assert.equal(openPage(storage).theme(), 'light', 'system off: the visitor’s choice from before')
})
