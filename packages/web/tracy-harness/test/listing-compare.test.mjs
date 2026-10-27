/**
 * The unsaved mark on Save / Update listing (Templates page, Akemi 10/10/2026): the edited listing
 * is compared with the saved one, so an edit undone is not a change, while a real change — a
 * flipped field, a drafted listing, a new picture, a page added, removed or moved — stays one until
 * it is saved.
 *
 * What is pinned here is `src/cms/listing-compare.ts`, bundled in memory.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))

let sameListing

before(async () => {
  const built = await rootRequire('esbuild').build({
    entryPoints: [path.join(pkgRoot, 'src/cms/listing-compare.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent'
  })
  const code = built.outputFiles[0].text
  ;({ sameListing } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`))
})

const saved = () => ({
  schemaVersion: '1',
  template: 'tracy-business',
  provider: 'Tracy',
  category: 'Starter',
  blurb: 'A site for a small business.',
  image: 'home-1440.png',
  nav: 'top-left',
  hero: 'split',
  languages: ['en', 'vi'],
  layouts: [
    { key: 'home', label: 'Home', path: '/', shots: { desktop: 'home-1440.png', mobile: 'home-390.png' } },
    { key: 'about', label: 'About', path: '/about', count: 2, shots: { desktop: 'about-1440.png' } }
  ]
})

test('the listing as read is not unsaved', () => {
  assert.equal(sameListing(saved(), saved()), true)
})

test('dark flipped on is a change, flipped back off is not, even when the saved listing never said dark', () => {
  const on = { ...saved(), dark: true }
  assert.equal(sameListing(on, saved()), false)
  assert.equal(sameListing({ ...on, dark: false }, saved()), true)
  assert.equal(sameListing({ ...saved(), dark: true }, { ...saved(), dark: true }), true)
})

test('a typed field changed is a change until it is typed back', () => {
  assert.equal(sameListing({ ...saved(), blurb: 'Other words.' }, saved()), false)
  assert.equal(sameListing({ ...saved(), category: 'Fintech & Crypto' }, saved()), false)
  assert.equal(sameListing({ ...saved(), provider: 'JoomlArt' }, saved()), false)
  assert.equal(sameListing({ ...saved(), nav: 'sidebar' }, saved()), false)
  assert.equal(sameListing({ ...saved(), image: 'other.png' }, saved()), false)
})

test('fields the server writes are not the form’s and never make it unsaved', () => {
  assert.equal(sameListing({ ...saved(), schemaVersion: '2', template: 'x' }, saved()), true)
  const { schemaVersion: _s, template: _t, ...bare } = saved()
  assert.equal(sameListing(bare, saved()), true)
})

test('pages keep their order: added, removed or moved is a change; moved back is not', () => {
  const base = saved()
  const added = {
    ...base,
    layouts: [...base.layouts, { key: 'contact', label: 'Contact', path: '/contact' }]
  }
  assert.equal(sameListing(added, base), false)
  assert.equal(sameListing({ ...base, layouts: base.layouts.slice(0, 1) }, base), false)
  const moved = { ...base, layouts: [...base.layouts].reverse() }
  assert.equal(sameListing(moved, base), false)
  assert.equal(sameListing({ ...moved, layouts: [...moved.layouts].reverse() }, base), true)
})

test('a page field or a picture changed is a change', () => {
  const base = saved()
  const at = (patch) => ({ ...base, layouts: [{ ...base.layouts[0], ...patch }, base.layouts[1]] })
  assert.equal(sameListing(at({ label: 'Start' }), base), false)
  assert.equal(sameListing(at({ path: '/home' }), base), false)
  assert.equal(sameListing(at({ address: '/index.php' }), base), false)
  assert.equal(sameListing(at({ count: 3 }), base), false)
  assert.equal(sameListing(at({ shots: { desktop: 'new-1440.png', mobile: 'home-390.png' } }), base), false)
})

test('no picture reads the same whether it is absent, undefined or empty', () => {
  const base = saved()
  const bare = {
    ...base,
    layouts: [
      base.layouts[0],
      {
        key: 'about',
        label: 'About',
        path: '/about',
        count: 2,
        shots: { desktop: 'about-1440.png', mobile: '' }
      }
    ]
  }
  assert.equal(sameListing(bare, base), true)
  const noShots = { ...base, layouts: [{ key: 'x', label: 'X', path: '/x' }] }
  assert.equal(
    sameListing({ ...noShots, layouts: [{ key: 'x', label: 'X', path: '/x', shots: {} }] }, noShots),
    true
  )
  assert.equal(
    sameListing({ ...noShots, layouts: [{ key: 'x', label: 'X', path: '/x', count: undefined }] }, noShots),
    true
  )
})

test('languages keep their order', () => {
  assert.equal(sameListing({ ...saved(), languages: ['vi', 'en'] }, saved()), false)
  assert.equal(sameListing({ ...saved(), languages: ['en', 'vi'] }, saved()), true)
})
