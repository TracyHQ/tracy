/**
 * The site's address and its sidebar (tasks/todo-desktop-update-policy.md H5). The site is served at
 * the root of its own host (`docs.tracy.ai`, `apps/tracy-web/src/docs/route.js`), so it is built for
 * `base: '/'`; the sidebar reads Get started · Using Tracy · Desktop app · MCP Server · Changelog · For developers
 * (people who use Tracy first, the API as one group); and every label the
 * sidebar asks for is present in every translation's `_sidebar.json` — a key missing there shows the
 * English label inside a translated page, silently.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'

import { labelKeys, sidebar } from '../sidebar.mjs'

const CONTENT = new URL('../src/content/docs/', import.meta.url)

/** `{ vi: { lang, label, labels }, … }` — every directory that declares itself a translation. */
function translations() {
  return Object.fromEntries(
    readdirSync(CONTENT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        try {
          return [
            [entry.name, JSON.parse(readFileSync(new URL(`${entry.name}/_sidebar.json`, CONTENT), 'utf8'))]
          ]
        } catch {
          return []
        }
      })
  )
}

test('the site is built for the root of docs.tracy.ai', async () => {
  const { default: config } = await import('../astro.config.mjs')
  assert.equal(config.base, '/')
  assert.equal(config.site, 'https://docs.tracy.ai')
})

test('the sidebar reads Get started · Using Tracy · Desktop app · MCP Server · Changelog · For developers', () => {
  const entries = sidebar(translations())
  assert.deepEqual(
    entries.map((entry) => entry.label),
    ['Get started', 'Using Tracy', 'Desktop app', 'MCP Server', 'Changelog', 'For developers']
  )
  const [start, using, desktop, mcp, changelog, developers] = entries
  // The first two are single pages for people who use Tracy, not groups.
  assert.equal(start.slug, 'get-started')
  assert.equal(using.slug, 'using-tracy')
  assert.deepEqual(
    desktop.items.map((item) => item.slug),
    ['desktop/download']
  )
  assert.equal(mcp.items[0].slug, 'mcp')
  assert.equal(mcp.items[1].slug, 'mcp/getting-started')
  // Every changelog lives in one group: the product's (Tracy Cowork, web and desktop app; E3), then
  // the API's.
  assert.deepEqual(
    changelog.items.map((item) => [item.label, item.slug]),
    [
      ['Tracy Cowork', 'changelog/desktop'],
      ['API', 'changelog']
    ]
  )
  // Everything the API pages had, at the slugs they had (links already sent, llms.txt), opened by
  // the API overview that used to be the home page.
  assert.deepEqual(
    developers.items.map((item) => item.slug ?? item.label),
    ['api', 'quickstart', 'authentication', 'concepts', 'Guides', 'Reference']
  )
  const reference = developers.items.find((item) => item.label === 'Reference')
  assert.deepEqual(
    reference.items.map((item) => item.slug),
    ['reference', 'reference/errors', 'reference/compatibility']
  )
})

test('every page appears once in the sidebar: the API changelog only under Changelog › API (DT-4)', () => {
  // Measured 11/10/2026 on docs.tracy.site: "Changelog › API" and "For developers › API changelog"
  // both named `/changelog/`.
  const places = new Map()
  const walk = (items, path) => {
    for (const item of items) {
      if (item.items) walk(item.items, [...path, item.label])
      else places.set(item.slug, [...(places.get(item.slug) ?? []), [...path, item.label].join(' › ')])
    }
  }
  walk(sidebar(translations()), [])
  assert.deepEqual(places.get('changelog'), ['Changelog › API'])
  const twice = [...places].filter(([, at]) => at.length > 1)
  assert.deepEqual(twice, [], 'a page the sidebar names more than once')
})

test('every sidebar label is translated in every _sidebar.json', () => {
  const all = translations()
  assert.ok(Object.keys(all).length >= 6, `found ${Object.keys(all).join(', ')}`)
  for (const [dir, { labels }] of Object.entries(all)) {
    const missing = labelKeys().filter((key) => typeof labels?.[key] !== 'string' || labels[key] === '')
    assert.deepEqual(missing, [], `${dir}/_sidebar.json`)
  }
})

test('a translated label reaches the sidebar under its language tag', () => {
  const [start, , , , , developers] = sidebar(translations())
  assert.equal(start.translations.vi, 'Bắt đầu')
  assert.equal(developers.translations.vi, 'Dành cho nhà phát triển')
})

test('every page the sidebar names exists in the English tree', () => {
  const slugs = []
  const walk = (items) => {
    for (const item of items) {
      if (item.items) walk(item.items)
      else slugs.push(item.slug)
    }
  }
  walk(sidebar(translations()))
  for (const slug of slugs) {
    const base = slug === '' ? 'index' : slug
    const found = ['.md', '.mdx', '/index.md', '/index.mdx'].some((ext) => {
      try {
        readFileSync(new URL(`${base}${ext}`, CONTENT))
        return true
      } catch {
        return false
      }
    })
    // The three generated pages are written by `scripts/generate.mjs` before the build.
    const generated = ['reference/errors', 'reference/compatibility', 'changelog'].includes(slug)
    assert.ok(found || generated, `sidebar names "${slug}", which has no page`)
  }
})
