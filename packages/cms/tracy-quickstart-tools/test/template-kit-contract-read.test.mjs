// A front page may carry any alias; the kit still knows it as `/`. Fabricated contract of a swim club.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readContractCoverage, readContractMap, withHomeRoute } from '../template-kit/lib/contract-read.mjs'
import { pathOfRoute } from '../template-kit/lib/kit-paths.mjs'

const MAP = {
  entities: [],
  pages: [
    { entity: 'menuItem-5', route: 'welcome' },
    { entity: 'menuItem-6', route: 'welcome/lanes' },
    { entity: 'menuItem-7', route: 'news' }
  ],
  itemLists: {
    'news-list': { block: null, source: { route: 'news' } },
    'front-list': { block: null, source: { route: 'welcome' } }
  }
}
const LOCK = {
  entities: { 'menuItem-5': { home: '1', language: '*' }, 'menuItem-7': { home: '0', language: '*' } }
}

test('the item the lock marks as the front page is routed as home, whatever its alias', () => {
  const map = withHomeRoute(MAP, LOCK)
  assert.deepEqual(
    map.pages.map((p) => pathOfRoute(p.route)),
    ['/', '/welcome/lanes', '/news']
  )
  assert.equal(map.itemLists['front-list'].source.route, 'home')
  assert.equal(map.itemLists['news-list'].source.route, 'news')
})

test('a map that already routes home, or has no lock, comes back unchanged', () => {
  const routed = { pages: [{ entity: 'menuItem-5', route: 'home' }] }
  assert.equal(withHomeRoute(routed, LOCK), routed)
  assert.equal(withHomeRoute(MAP, null), MAP)
})

test('the all-languages front page wins over a language one', () => {
  const lock = {
    entities: { 'menuItem-7': { home: '1', language: 'de-DE' }, 'menuItem-5': { home: '1', language: '*' } }
  }
  assert.equal(withHomeRoute(MAP, lock).pages[0].route, 'home')
  assert.equal(withHomeRoute(MAP, lock).pages[2].route, 'news')
})

test('reading a contract folder settles the map and the coverage site map together', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-contract-read-'))
  try {
    writeFileSync(join(dir, 'content-map.json'), JSON.stringify(MAP))
    writeFileSync(join(dir, 'presentation-lock.json'), JSON.stringify(LOCK))
    writeFileSync(
      join(dir, 'content-coverage.json'),
      JSON.stringify({
        sitePages: [
          { route: 'welcome', inMainMenu: true },
          { route: 'welcome/lanes', inMainMenu: true }
        ]
      })
    )
    assert.equal(readContractMap(dir).pages[0].route, 'home')
    assert.deepEqual(
      readContractCoverage(dir).sitePages.map((r) => r.route),
      ['home', 'welcome/lanes']
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
