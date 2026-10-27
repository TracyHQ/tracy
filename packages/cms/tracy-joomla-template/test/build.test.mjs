// Tests for the generator behind `tpl_tracy`: every design system of the vendored OpenDesign
// library becomes one token file plus one option row, and a system whose tokens drifted from
// the token contract stops the build instead of shipping a template with holes.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { plan, stale, TOKEN_NAMES } from '../scripts/build.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(PKG, 'src', 'tpl_tracy')

/** A tokens.css with every contract name, or with some removed. */
function tokensCss(omit = []) {
  const lines = TOKEN_NAMES.filter((n) => !omit.includes(n)).map((n) => `  ${n}: 1px;`)
  return `:root {\n${lines.join('\n')}\n}\n`
}

/** A throwaway vendor tree with the given systems. */
function fixtureVendor(systems) {
  const dir = mkdtempSync(path.join(tmpdir(), 'od-'))
  const catalog = { schemaVersion: 1, count: systems.length, systems: [] }
  const dark = { systems: {} }
  for (const s of systems) {
    mkdirSync(path.join(dir, 'systems', s.id), { recursive: true })
    writeFileSync(path.join(dir, 'systems', s.id, 'tokens.css'), s.css ?? tokensCss())
    catalog.systems.push({ id: s.id, name: s.name ?? s.id, category: 'Cat', nav: 'sidebar', hero: 'cover' })
    dark.systems[s.id] = { safe: s.dark ?? true }
  }
  writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(catalog))
  writeFileSync(path.join(dir, 'dark.json'), JSON.stringify(dark))
  return dir
}

test('one system in, one token file, one option and one catalog row out', () => {
  const vendor = fixtureVendor([{ id: 'alpha', name: 'Alpha & Co', dark: false }])
  const { files, ids } = plan({ vendorDir: vendor, srcDir: SRC, version: '9.9.9' })
  assert.deepEqual(ids, ['alpha'])
  assert.equal(files.get('media/css/inspirations/alpha.css'), tokensCss())
  const xml = files.get('templateDetails.xml')
  assert.match(xml, /<version>9\.9\.9<\/version>/)
  assert.match(xml, /<option value="alpha">Alpha &amp; Co \(Cat\)<\/option>/)
  assert.doesNotMatch(xml, /@@/)
  const catalog = JSON.parse(files.get('inspirations.json'))
  assert.deepEqual(catalog.systems.alpha, {
    name: 'Alpha & Co',
    category: 'Cat',
    nav: 'sidebar',
    hero: 'cover',
    dark: false
  })
})

test('a system missing a contract token stops the build and names the hole', () => {
  const vendor = fixtureVendor([{ id: 'holey', css: tokensCss(['--accent', '--radius-md']) }])
  assert.throws(
    () => plan({ vendorDir: vendor, srcDir: SRC, version: '0.0.0' }),
    /holey.*--accent.*--radius-md/
  )
})

test('a catalog count that disagrees with its rows stops the build', () => {
  const vendor = fixtureVendor([{ id: 'one' }])
  writeFileSync(
    path.join(vendor, 'catalog.json'),
    JSON.stringify({
      count: 2,
      systems: [{ id: 'one', name: 'One', category: 'C', nav: 'top-left', hero: 'split' }]
    })
  )
  assert.throws(() => plan({ vendorDir: vendor, srcDir: SRC, version: '0.0.0' }), /count/)
})

test('stale lists every planned file that differs from disk, and orphans in inspirations/', () => {
  const vendor = fixtureVendor([{ id: 'alpha' }])
  const { files } = plan({ vendorDir: vendor, srcDir: SRC, version: '0.0.0' })
  const out = mkdtempSync(path.join(tmpdir(), 'tpl-'))
  mkdirSync(path.join(out, 'media', 'css', 'inspirations'), { recursive: true })
  writeFileSync(
    path.join(out, 'media', 'css', 'inspirations', 'alpha.css'),
    files.get('media/css/inspirations/alpha.css')
  )
  writeFileSync(path.join(out, 'media', 'css', 'inspirations', 'ghost.css'), '/* nobody made me */')
  const report = stale(files, out)
  assert.ok(report.includes('templateDetails.xml'))
  assert.ok(report.includes('inspirations.json'))
  assert.ok(!report.includes('media/css/inspirations/alpha.css'))
  assert.ok(report.includes('media/css/inspirations/ghost.css'))
})
