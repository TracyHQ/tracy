// The visitor's light/dark choice and the design-system slot (ADR 0031 decision 12, rule UNDO-1, #1317 round 4).
//
// Measured on the 1.7.18 release: a site wearing a dark system opens with <html data-theme="dark"> (the server
// sets it from the slot's mode), and the topbar's toggle script then called its own `apply(true)` on load,
// which wrote localStorage "ngi-theme" = "dark" in every visitor's browser. Once the system was taken off,
// those visitors kept opening the site dark, while a fresh browser opened it light: taking a system off did
// not give the site back exactly as before.
//
// These tests run the two real scripts (the pre-paint one in Base.astro, the toggle in Topbar.astro) against a
// small fake document that shares one localStorage between page loads, the way one browser does.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const read = (/** @type {string} */ rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const PRE_PAINT = /<script is:inline>\s*(\/\/ Restore the saved theme[\s\S]*?)<\/script>/.exec(
  read('src/layouts/Base.astro')
)?.[1]
const TOGGLE_TS = /(\/\/ Theme toggle:[\s\S]*?)<\/script>/.exec(read('src/components/site/Topbar.astro'))?.[1]
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
 * One page load in one browser. `worn` is the slot the server read (null = no system), the way
 * Base.astro renders it: data-theme="dark" on <html> for a dark system, <style id="tracy-ds-slot" data-ds>.
 * Returns the page, with `click()` pressing the theme toggle.
 */
function openPage(storage, { worn = null, search = '' } = {}) {
  const attrs = new Map()
  if (worn?.mode === 'dark') attrs.set('data-theme', 'dark')
  const html = {
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    setAttribute: (n, v) => void attrs.set(n, String(v)),
    removeAttribute: (n) => void attrs.delete(n),
    hasAttribute: (n) => attrs.has(n)
  }
  const slotStyle = worn
    ? {
        id: 'tracy-ds-slot',
        dataset: { ds: worn.id },
        getAttribute: (n) => (n === 'data-ds' ? worn.id : null)
      }
    : null
  const listeners = []
  const label = { textContent: '' }
  const button = {
    dataset: { lightLabel: 'Light', darkLabel: 'Dark' },
    attrs: new Map(),
    querySelector: () => label,
    setAttribute(n, v) {
      this.attrs.set(n, v)
    },
    addEventListener: (type, fn) => type === 'click' && listeners.push(fn)
  }
  const document = {
    documentElement: html,
    getElementById: (id) => (id === 'tracy-ds-slot' ? slotStyle : null),
    querySelector: (sel) => (slotStyle && sel.includes('tracy-ds-slot') ? slotStyle : null),
    querySelectorAll: (sel) => (sel === '.ng-theme-toggle' ? [button] : [])
  }
  const context = vm.createContext({ document, localStorage: storage, location: { search }, URLSearchParams })
  vm.runInContext(PRE_PAINT, context)
  vm.runInContext(TOGGLE, context)
  return {
    theme: () => html.getAttribute('data-theme'),
    label: () => label.textContent,
    click: () => {
      for (const fn of listeners) fn()
    }
  }
}

const DARK = { id: 'Midnight', mode: 'dark' }

test('the two theme scripts are where this test reads them', () => {
  assert.ok(PRE_PAINT, 'Base.astro pre-paint script')
  assert.ok(TOGGLE, 'Topbar.astro theme toggle')
})

test('UNDO-1: wearing a dark system, then taking it off, opens the site light again in the same browser', () => {
  const storage = fakeStorage()
  const worn = openPage(storage, { worn: DARK })
  assert.equal(worn.theme(), 'dark', 'a dark system opens dark')
  assert.equal(worn.label(), 'Light', 'the toggle offers the other side')
  assert.equal(storage.map.size, 0, 'opening on the system’s own mode stores nothing')
  const off = openPage(storage)
  assert.equal(off.theme(), null, 'system taken off: the template’s own light default')
  assert.equal(off.label(), '', 'the toggle label is the template’s own, untouched')
})

test('a choice made while a system is worn stays with that system, not with the template', () => {
  const storage = fakeStorage()
  openPage(storage, { worn: DARK }).click()
  assert.notEqual(openPage(storage, { worn: DARK }).theme(), 'dark', 'the visitor’s explicit light is kept')
  assert.equal(openPage(storage).theme(), null, 'system off: the template default again')
  // a visitor who pressed "dark" while a light system was worn does not take dark to the template either
  const light = { id: 'Paper', mode: 'light' }
  openPage(storage, { worn: light }).click()
  assert.equal(openPage(storage, { worn: light }).theme(), 'dark')
  assert.equal(openPage(storage).theme(), null)
})

test('the template’s own toggle still remembers the visitor, and that choice survives a system worn and taken off', () => {
  const storage = fakeStorage()
  const page = openPage(storage)
  page.click()
  assert.equal(page.theme(), 'dark')
  assert.equal(storage.getItem('ngi-theme'), 'dark', 'the template’s key, as before')
  assert.equal(openPage(storage).theme(), 'dark', 'reload keeps the choice')
  assert.equal(
    openPage(storage, { worn: { id: 'Paper', mode: 'light' } }).theme(),
    null,
    'a worn system opens on its own mode'
  )
  assert.equal(openPage(storage).theme(), 'dark', 'system off: the visitor’s own choice from before')
})

test('?theme= wins for one page load and is never stored', () => {
  const storage = fakeStorage()
  assert.equal(openPage(storage, { search: '?theme=dark' }).theme(), 'dark')
  assert.equal(storage.map.size, 0)
  assert.equal(openPage(storage).theme(), null)
})
