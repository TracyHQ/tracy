// The template kit fixes of 0.1.1 (DECISIONS D-K1): what the views, the stylesheet, the field map and the seed limits
// must keep saying so the kit's self-checks (linksWithoutTarget, phoneNotCallable, slotLimitsDiffering) stay at 0.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { telHref } from '../src/lib/tel.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
const json = (file) => JSON.parse(read(file))
const css = read('src/styles/global.css')

test('each menu tab button is stamped with its menu entry title, so the kit names its label slot and its panel', () => {
  const home = read('src/views/Home.astro')
  assert.match(
    home,
    /role="tab"[^\n]*aria-controls=\{`panel-\$\{m\.slug\}`\}[^\n]*\{\.\.\.stampFor\(Astro\.request, 'menu', \{ id: m\.id, slug: m\.slug \}\)\('title'\)\}>\{m\.title\}<\/button>/
  )
})

test('the menu title is a menu label, not a heading: it is printed only as the tab label', () => {
  assert.equal(json('seed/field-map.json').fields['menu.title'].role, 'editorial.menu_label')
  const views = ['src/views/Home.astro', 'src/views/Offers.astro', 'src/views/About.astro']
  const printed = views
    .filter((v) => {
      try {
        return /\{m\.title\}/.test(read(v))
      } catch {
        return false
      }
    })
    .map((v) => read(v).match(/\{m\.title\}/g).length)
  assert.deepEqual(printed, [1], 'one place prints a menu title: the tab button of Home')
})

test('the footer prints each phone line as a tel: link drawn as the plain line the source prints', () => {
  const footer = read('src/components/site/Footer.astro')
  assert.match(
    footer,
    /\$c\('footer_phone'\)\}>\{lines\(site\.footer_phone\)\.map\(\(l, i\) => <>\{i > 0 && <br \/>\}\{telHref\(l\) \? <a href=\{telHref\(l\)!\}>\{l\}<\/a> : l\}<\/>\)\}<\/p>/
  )
  assert.match(
    css,
    /\.dn-footer-cols p a\[href\^="tel:"\], \.dn-footer-cols p a\[href\^="tel:"\]:hover \{ display: inline; font-size: inherit; border-bottom: 0; color: inherit; \}/
  )
})

test('telHref keeps the + and the digits of each demo phone line and drops the line prefix', () => {
  const chrome = json('seed/seed.json').content.chrome[0].data
  const lines = String(chrome.footer_phone).split('\n').filter(Boolean)
  assert.deepEqual(lines.map(telHref), ['tel:+2013823485327', 'tel:+2011669937763'])
  assert.equal(telHref('Call us'), null, 'no digit, no dead link')
  assert.equal(telHref('(555) 010-2030 ext. 12'), 'tel:5550102030;ext=12')
})

test('slot-limits.json holds only limits with a real source: a measured box, or a nonVisual declaration with no number', () => {
  const { limits } = json('seed/slot-limits.json')
  for (const rule of limits) {
    assert.ok(
      String(rule.from).trim().length > 10,
      `${rule.slot} says where its number or its non-visual use comes from`
    )
    if (rule.nonVisual === true)
      assert.equal('maxCharacters' in rule, false, `${rule.slot}: no invented number`)
    else {
      assert.ok(Number.isInteger(rule.maxCharacters) && rule.maxCharacters > 0, rule.slot)
      assert.match(
        rule.from,
        /measured|filled|box|field is/i,
        `${rule.slot}: the number comes from a measured box`
      )
    }
  }
  assert.deepEqual(
    limits
      .filter((r) => r.nonVisual)
      .map((r) => r.slot)
      .sort(),
    ['chrome.chrome.appearance_label', 'chrome.chrome.menu_label', 'settings.title']
  )
  // the demo words fit the measured limits
  const chrome = json('seed/seed.json').content.chrome[0].data
  const limit = (slot) => limits.find((r) => r.slot === slot).maxCharacters
  assert.ok(chrome.brand_name.length <= limit('chrome.chrome.brand_name'))
  assert.ok(chrome.subscribe_placeholder.length <= limit('chrome.chrome.subscribe_placeholder'))
})

test('the 0.1.1 content map carries the declared limits and the menu label role', () => {
  const map = json('contracts/0.1.1/content-map.json')
  assert.equal(map.version, '0.1.1')
  const slot = (key) => map.slots.find((s) => s.key === key)
  assert.equal(slot('chrome.chrome.brand_name').maxCharacters, 41)
  assert.equal(slot('chrome.chrome.subscribe_placeholder').maxCharacters, 22)
  for (const key of ['settings.title', 'chrome.chrome.menu_label', 'chrome.chrome.appearance_label'])
    assert.equal(slot(key).nonVisual, true, key)
  for (const m of ['main-dishes', 'soft-drinks', 'dessert'])
    assert.equal(slot(`menu.${m}.title`).role, 'editorial.menu_label')
})
