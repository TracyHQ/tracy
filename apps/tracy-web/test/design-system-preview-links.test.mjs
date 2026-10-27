/**
 * A design system preview you can browse (Akemi, 12/10/2026, option B): every same-site link of a worn page
 * points back at the preview door with `path=`, so each page the visitor opens wears the system too
 * (`src/sites/design-system-preview-links.js`).
 *
 *   node --test apps/tracy-web/test/design-system-preview-links.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  navigableDocOf,
  PREVIEW_PATH_MAX,
  previewMissPage,
  previewPathOf
} from '../src/sites/design-system-preview-links.js'

test('previewPathOf: a same-site path, normalized; anything that could name another host or escape is null', () => {
  assert.equal(previewPathOf('/'), '/')
  assert.equal(previewPathOf('/about'), '/about')
  assert.equal(previewPathOf('/en/services/?page=2'), '/en/services/?page=2')
  assert.equal(previewPathOf('/index.php?option=com_content&id=1'), '/index.php?option=com_content&id=1')
  assert.equal(previewPathOf('/about#team'), '/about', 'the fragment is the browser’s, never sent')
  assert.equal(previewPathOf('/caf%C3%A9'), '/caf%C3%A9')
  assert.equal(previewPathOf('/a b'), null, 'raw whitespace')
  for (const bad of [
    '',
    'about',
    '//evil.test/',
    '///evil.test/',
    'http://evil.test/',
    'https:evil.test',
    'javascript:alert(1)',
    '/\\evil.test',
    '\\\\evil.test',
    '/..',
    '/a/../../etc/passwd',
    '/./about',
    '/%2e%2e/admin',
    '/%2E%2E/admin',
    '/.%2e/admin',
    '/%2f%2fevil.test',
    '/a%5cb',
    '/a%00b',
    '/a\u0000b',
    '/a\nb',
    `/${'a'.repeat(PREVIEW_PATH_MAX)}`,
    undefined,
    null,
    42
  ])
    assert.equal(previewPathOf(/** @type {any} */ (bad)), null, JSON.stringify(bad))
})

const PAGE = new URL('http://shop.tracy.test:51710/en/')
const door = (/** @type {string} */ path) =>
  `http://tracy.test:51710/api/sites/shop/design-system/preview?id=x&path=${encodeURIComponent(path)}`

test('navigableDocOf: same-site anchors point at the door with their path, in the same frame', () => {
  const html = `<a href="http://shop.tracy.test:51710/about">A</a><a class="n" href='services/' target="_blank">S</a>
<a href=/contact?x=1&amp;y=2#form>C</a><area href="/map" shape="rect"><a data-href="/no">D</a>`
  const out = navigableDocOf(html, { page: PAGE, doorOf: door })
  assert.ok(out.includes(`<a href="${door('/about').replace(/&/g, '&amp;')}" target="_self">A</a>`), out)
  assert.ok(
    out.includes(`<a class="n" href="${door('/en/services/').replace(/&/g, '&amp;')}" target="_self">S</a>`)
  )
  assert.ok(
    out.includes(`href="${door('/contact?x=1&y=2').replace(/&/g, '&amp;')}#form" target="_self">C</a>`),
    'entities read, the fragment kept on the door address'
  )
  assert.ok(out.includes(`<area href="${door('/map').replace(/&/g, '&amp;')}" shape="rect" target="_self">`))
  assert.ok(out.includes('<a data-href="/no">D</a>'), 'an attribute that only ends in href is not a link')
})

test('navigableDocOf: other hosts open a new tab; a hash stays on this page; mail, phone and script links stay', () => {
  const html = `<a href="https://facebook.com/shop" rel="me">F</a><a href="//cdn.other.test/x">O</a>
<a href="#top">T</a><a href="mailto:a@b.test">M</a><a href="tel:+1">P</a><a href="javascript:void(0)">J</a><a>none</a>`
  const out = navigableDocOf(html, { page: PAGE, doorOf: door })
  assert.ok(
    out.includes('<a href="https://facebook.com/shop" target="_blank" rel="noopener noreferrer">F</a>'),
    out
  )
  assert.ok(out.includes('<a href="http://cdn.other.test/x" target="_blank" rel="noopener noreferrer">O</a>'))
  assert.ok(
    out.includes(`<a href="${door('/en/').replace(/&/g, '&amp;')}#top" target="_self">T</a>`),
    'the base is the site, so a bare hash would leave: it goes to this same preview page'
  )
  assert.ok(out.includes('<a href="mailto:a@b.test">M</a>'))
  assert.ok(out.includes('<a href="tel:+1">P</a>'))
  assert.ok(out.includes('<a href="javascript:void(0)">J</a>'))
  assert.ok(out.includes('<a>none</a>'))
})

test('navigableDocOf: a same-site link the door would refuse opens the real page in a new tab', () => {
  const out = navigableDocOf('<a href="/a/%2e%2e/b">X</a>', { page: PAGE, doorOf: door })
  assert.ok(out.includes('target="_blank" rel="noopener noreferrer"'), out)
  assert.ok(!out.includes('design-system/preview'))
})

test('navigableDocOf: forms are neutralised (the sandbox never submits them anyway)', () => {
  const out = navigableDocOf('<form method="post" action="/contact"><input></form><form class="s">', {
    page: PAGE,
    doorOf: door
  })
  assert.ok(out.includes('<form method="post" action="about:blank"><input></form>'), out)
  assert.ok(out.includes('<form class="s" action="about:blank">'))
})

test('previewMissPage: a small page with what happened and a way home, everything escaped', () => {
  const html = previewMissPage({ title: 'No <page>', text: 'Gone & lost', home: 'http://t.test/?a=1&b=2' })
  assert.match(html, /^<!DOCTYPE html>/)
  assert.ok(html.includes('No &lt;page&gt;'))
  assert.ok(html.includes('Gone &amp; lost'))
  assert.ok(html.includes('href="http://t.test/?a=1&amp;b=2" target="_self"'))
  assert.ok(!/<script/i.test(html))
  assert.ok(!previewMissPage({ title: 'x', text: 'y' }).includes('<a '), 'no way home when none is given')
})

test('navigableDocOf: every CMS’s own link shapes stay in the preview, the query kept in path', () => {
  const page = new URL('http://shop.tracy.test:51710/en/')
  const html = [
    '<a href="/index.php?option=com_content&amp;view=article&amp;id=2&amp;Itemid=105">J1</a>',
    '<a href="index.php/services">J2</a>',
    '<a href="/?page_id=12">W1</a>',
    '<a href="https://shop.tracy.test/?p=7">W2</a>',
    '<a href="http://www.shop.tracy.test:8080/fr/a-propos/">W3</a>',
    '<a href="/blog/hello-world">E1</a>'
  ].join('')
  const out = navigableDocOf(html, { page, doorOf: door })
  const at = (/** @type {string} */ p) => `href="${door(p).replace(/&/g, '&amp;')}" target="_self"`
  for (const p of [
    '/index.php?option=com_content&view=article&id=2&Itemid=105',
    '/en/index.php/services',
    '/?page_id=12',
    '/?p=7',
    '/fr/a-propos/',
    '/blog/hello-world'
  ])
    assert.ok(out.includes(at(p)), `${p}\n${out}`)
  assert.ok(!out.includes('_blank'), out)
})

test('navigableDocOf: a ping never survives, whatever the link', () => {
  const html =
    '<a href="/x" ping="https://evil.test/p">A</a><a ping=/p href="mailto:a@b.test">M</a><a ping="/p">N</a>'
  const out = navigableDocOf(html, { page: PAGE, doorOf: door })
  assert.ok(!/ping/i.test(out), out)
})
