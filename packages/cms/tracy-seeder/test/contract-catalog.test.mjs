import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
const root = new URL('../../tracy-joomla-quickstart/contracts/tracy-apple/j6/1.1.0/', import.meta.url)
const read = (name) => JSON.parse(readFileSync(new URL(name + '.json', root), 'utf8'))
test('the shipped quickstart contract has unique slots, complete entity/display references and immutable assets', () => {
  const manifest = read('manifest'),
    content = read('content-map'),
    presentation = read('presentation-lock')
  assert.equal(manifest.id, 'tracy-apple/j6/1.1.0')
  const entities = new Set(content.entities.map((e) => e.key))
  assert.equal(entities.size, content.entities.length)
  assert.equal(new Set(content.slots.map((s) => s.key)).size, content.slots.length)
  for (const slot of content.slots) {
    assert(entities.has(slot.entity), slot.key)
    assert(['text', 'url', 'image'].includes(slot.type), slot.type)
    assert(typeof slot.sample === 'string' && slot.maxCharacters > 0)
  }
  for (const page of content.pages) {
    assert(entities.has(page.entity))
    if (page.style) assert(entities.has(page.style))
    for (const module of page.assignedModules) assert(entities.has(module.entity))
  }
  assert(Object.keys(presentation.files).length > 3000)
  for (const [file, hash] of Object.entries(presentation.files)) {
    assert(!file.startsWith('/') && !file.split('/').includes('..'))
    assert.match(hash, /^[a-f0-9]{64}$/)
  }
})

// ── The WordPress contract, authored in tracy-wordpress-quickstart and shipped the same way ──────
const wp = new URL('../../tracy-wordpress-quickstart/contracts/tracy-base/wp7/1.0.0/', import.meta.url)
const readWp = (name) => JSON.parse(readFileSync(new URL(name + '.json', wp), 'utf8'))
test('the tracy-base/wp7 contract names its floor, and every slot lands in one WordPress object', () => {
  const manifest = readWp('manifest'),
    content = readWp('content-map'),
    presentation = readWp('presentation-lock')
  assert.equal(manifest.id, 'tracy-base/wp7/1.0.0')
  assert.equal(manifest.platform, 'wordpress')
  assert.equal(manifest.theme, 'tracy-base')
  assert.match(manifest.coworkMinVersion ?? manifest.receiverFloor, /^\d+\.\d+\.\d+$/) // vocabulary-allow: pre-rename key in published data
  assert.equal(manifest.quickstart.placeholderUrl, 'https://quickstart.invalid')
  const entities = new Map(content.entities.map((e) => [e.key, e]))
  assert.equal(entities.size, content.entities.length)
  assert.equal(new Set(content.slots.map((s) => s.key)).size, content.slots.length)
  for (const entity of content.entities) {
    assert(['option', 'themeMod', 'syncedPattern'].includes(entity.kind), entity.key)
    if (entity.kind === 'syncedPattern') assert.equal(entity.identity.postType, 'wp_block')
  }
  for (const slot of content.slots) {
    const entity = entities.get(slot.entity)
    assert(entity, slot.key)
    assert(['text', 'url', 'image'].includes(slot.type), slot.type)
    assert(typeof slot.sample === 'string' && slot.maxCharacters > 0, slot.key)
    assert(typeof slot.input === 'string' && slot.input !== '', slot.key)
    // Exactly one address, and it matches the entity's kind.
    const kinds = ['option', 'themeMod', 'block'].filter((k) => k in slot.target)
    assert.equal(kinds.length, 1, slot.key)
    if (kinds[0] === 'option') assert.equal(slot.target.option, entity.identity.name)
    if (kinds[0] === 'themeMod') assert.equal(slot.target.themeMod, entity.identity.name)
    if (kinds[0] === 'block') {
      assert.equal(entity.kind, 'syncedPattern', slot.key)
      assert.match(slot.target.block, /^[a-z-]+\.[a-z0-9-]+$/, slot.key)
      assert(['content', 'text', 'url'].includes(slot.target.attr), slot.key)
    }
  }
  // The eight things Phase G promised, by input name.
  assert.deepEqual(
    content.slots.map((s) => s.input).sort(),
    [
      'contact.address',
      'contact.email',
      'contact.phone',
      'cta.label',
      'cta.link',
      'hero.heading',
      'hero.paragraph',
      'logo',
      'name',
      'tagline'
    ].sort()
  )
  assert.equal(presentation.options.stylesheet, 'tracy-base')
  for (const [file, hash] of Object.entries(presentation.files)) {
    assert(!file.startsWith('/') && !file.split('/').includes('..'))
    assert.match(hash, /^[a-f0-9]{64}$/)
  }
})
