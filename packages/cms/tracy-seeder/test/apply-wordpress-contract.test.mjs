/**
 * The WordPress contract writer: inputs → slot values → one named block or option each, through a
 * fake door. What is pinned: nothing is invented for a slot with no input, a block is found by its
 * `metadata.name` and not by position, a pattern with several slots is one read and one write, and
 * a pattern the site does not carry is reported rather than created.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  applyWordPressContract,
  inputsFromSite,
  loadContract,
  planContractWrites,
  setBlockValue
} from '../src/apply-wordpress-contract.mjs'

import { readFileSync } from 'node:fs'

/** The authored contract, read from the package it is authored in (the seeder ships a copy). */
const CONTRACT_DIR = fileURLToPath(
  new URL('../../tracy-wordpress-quickstart/contracts/tracy-base/wp7/1.0.0/', import.meta.url)
)
const contract = () => {
  const read = (name) => JSON.parse(readFileSync(path.join(CONTRACT_DIR, name), 'utf8'))
  return { manifest: read('manifest.json'), contentMap: read('content-map.json') }
}

const HERO = `<!-- wp:group {"className":"acm-hero"} -->
<div class="wp-block-group acm-hero">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"hero.eyebrow"}} -->
<p class="tracy-eyebrow">Studio</p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"tracy-display","metadata":{"role":"content","name":"hero.title"}} -->
<h1 class="wp-block-heading tracy-display">A better website starts with your business.</h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-lead","metadata":{"role":"content","name":"hero.lead"}} -->
<p class="tracy-lead">Strategy, design and development.</p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"tracy-actions"} -->
<div class="wp-block-buttons tracy-actions">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"hero.btn-1"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#">Explore our services</a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline","url":"#","metadata":{"role":"content","name":"hero.btn-2"}} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#">See work</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->`

test('inputsFromSite: only what the customer said, split from one contact line', () => {
  assert.deepEqual(inputsFromSite({}), {})
  const got = inputsFromSite({
    name: 'Harbor Studio',
    about: 'We design harbours. Since 1998, for ports of every size.',
    contact: 'hello@harbor.example · +84 90 123 4567 · 12 Nguyen Hue, District 1, Saigon'
  })
  assert.equal(got.name, 'Harbor Studio')
  assert.equal(got['hero.heading'], 'Harbor Studio')
  assert.equal(got.tagline, 'We design harbours')
  assert.equal(got['hero.paragraph'], 'We design harbours. Since 1998, for ports of every size.')
  assert.equal(got['contact.email'], 'hello@harbor.example')
  assert.equal(got['contact.phone'], '+84 90 123 4567')
  assert.equal(got['contact.address'], '12 Nguyen Hue, District 1, Saigon')
  assert.deepEqual(Object.keys(inputsFromSite({ contact: 'a@b.co' })), ['contact.email'])
  // Slogan-length, cut at a clause or a word, never mid-word and never with a trailing comma.
  assert.equal(inputsFromSite({ about: `${'x'.repeat(200)} y` }).tagline, 'x'.repeat(70))
  assert.equal(
    inputsFromSite({
      about:
        'Nhà thầu xây dựng nhà xưởng công nghiệp tại Bình Dương, thành lập 2009, chuyên thiết kế và thi công trọn gói.'
    }).tagline,
    'Nhà thầu xây dựng nhà xưởng công nghiệp tại Bình Dương'
  )
  assert.equal(
    inputsFromSite({
      about: 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen'
    }).tagline,
    'One two three four five six seven eight nine ten eleven twelve'
  )
})

test('planContractWrites: a slot with no input keeps the quickstart words; images are reported, not guessed', () => {
  const { contentMap } = contract()
  const { writes, skipped } = planContractWrites(
    contentMap,
    inputsFromSite({ name: 'Harbor', contact: 'a@b.co' })
  )
  assert.deepEqual(
    writes.map((w) => [w.slot, w.value]),
    [
      ['site.name', 'Harbor'],
      ['contact.email', 'a@b.co'],
      ['home.hero.heading', 'Harbor']
    ]
  )
  const why = Object.fromEntries(skipped.map((s) => [s.slot, s.reason]))
  assert.match(why['site.tagline'], /no input/)
  assert.match(why['home.hero.cta.label'], /no input/)
  assert.match(why['site.logo'], /no input/)
  // A logo that WAS given is still not written: the door has no theme-mod write, and that is said.
  const withLogo = planContractWrites(contentMap, { logo: 'https://x/logo.png' })
  assert.equal(withLogo.writes.length, 0)
  assert.match(withLogo.skipped.find((s) => s.slot === 'site.logo').reason, /theme-mod/)
  // The budget clamps, and says so with an ellipsis rather than a cut word.
  const long = planContractWrites(contentMap, { name: 'H'.repeat(100) })
  assert.equal(long.writes[0].value.length, 80)
  assert.ok(long.writes[0].value.endsWith('…'))
})

test('setBlockValue: by metadata.name, never by position; text is escaped; a url rewrites href and the url attribute', () => {
  let out = setBlockValue(HERO, 'hero.title', 'content', 'Harbor <Studio> & co')
  assert.match(out, /<h1 class="wp-block-heading tracy-display">Harbor &lt;Studio&gt; &amp; co<\/h1>/)
  assert.match(out, /<p class="tracy-eyebrow">Studio<\/p>/, 'the block before it is untouched')
  out = setBlockValue(out, 'hero.btn-1', 'text', 'Talk to sales')
  assert.match(
    out,
    /tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#">Talk to sales<\/a>/
  )
  assert.match(out, />See work<\/a>/, 'the second button keeps its words')
  out = setBlockValue(out, 'hero.btn-2', 'url', '/contact/')
  assert.match(
    out,
    /<!-- wp:button \{"className":"is-style-outline","url":"\/contact\/","metadata":\{"role":"content","name":"hero.btn-2"\}\} -->/
  )
  assert.match(
    out,
    /is-style-outline"><a class="wp-block-button__link wp-element-button" href="\/contact\/">See work<\/a>/
  )
  assert.match(
    out,
    /tracy-btn--primary"><a [^>]*href="#">Talk to sales/,
    'the first button link is untouched'
  )
  assert.throws(() => setBlockValue(HERO, 'hero.nope', 'content', 'x'), /not in this pattern/)
  assert.throws(() => setBlockValue(HERO, 'hero.title', 'colour', 'x'), /unsupported/)
  // The block comments survive, so the editor still recognises every block.
  assert.equal((out.match(/<!-- \/wp:/g) ?? []).length, (HERO.match(/<!-- \/wp:/g) ?? []).length)
})

function fakeOps(patterns) {
  const calls = []
  const store = new Map(
    Object.entries(patterns).map(([slug, content], i) => [slug, { id: 100 + i, content }])
  )
  return {
    calls,
    store,
    ops: {
      async setOption(name, value) {
        calls.push(['setOption', name, value])
      },
      async find(type, slug) {
        calls.push(['find', type, slug])
        return store.get(slug)?.id ?? null
      },
      async readContent(id) {
        calls.push(['readContent', id])
        return [...store.values()].find((p) => p.id === id)?.content ?? null
      },
      async setContent(id, content) {
        calls.push(['setContent', id])
        const hit = [...store.values()].find((p) => p.id === id)
        if (hit) hit.content = content
      }
    }
  }
}

test('applyWordPressContract: options one by one, a pattern in one read and one write, a missing pattern reported', async () => {
  const { contentMap } = contract()
  const { writes } = planContractWrites(
    contentMap,
    inputsFromSite({ name: 'Harbor', about: 'We design harbours.', contact: 'a@b.co · +1 555 000 1111' })
  )
  const f = fakeOps({ 'home-hero': HERO })
  const r = await applyWordPressContract({ ops: f.ops, writes })
  assert.deepEqual(
    f.calls.filter((c) => c[0] === 'setOption').map((c) => c.slice(1)),
    [
      ['blogname', 'Harbor'],
      ['blogdescription', 'We design harbours'],
      ['tracy_contact_phone', '+1 555 000 1111']
    ]
  )
  assert.deepEqual(
    f.calls.filter((c) => c[0] !== 'setOption'),
    [
      ['find', 'wp_block', 'contact-information'],
      ['find', 'wp_block', 'home-hero'],
      ['readContent', 100],
      ['setContent', 100]
    ]
  )
  assert.match(f.store.get('home-hero').content, /<h1 class="wp-block-heading tracy-display">Harbor<\/h1>/)
  assert.match(f.store.get('home-hero').content, /<p class="tracy-lead">We design harbours\.<\/p>/)
  assert.deepEqual(
    r.written.map((w) => w.slot).sort(),
    ['home.hero.heading', 'home.hero.paragraph', 'site.name', 'site.tagline', 'contact.phone'].sort()
  )
  assert.deepEqual(r.skipped, [
    { slot: 'contact.email', reason: 'pattern contact-information is not on the site' }
  ])
})

test('applyWordPressContract: a door that returns no content leaves the pattern alone and says so', async () => {
  const { contentMap } = contract()
  const { writes } = planContractWrites(contentMap, { 'hero.heading': 'Harbor' })
  const f = fakeOps({ 'home-hero': HERO })
  f.ops.readContent = async () => null
  const r = await applyWordPressContract({ ops: f.ops, writes })
  assert.equal(
    f.calls.some((c) => c[0] === 'setContent'),
    false
  )
  assert.equal(r.written.length, 0)
  assert.match(r.skipped[0].reason, /did not return the content/)
})

test('loadContract: refuses an id that is not a WordPress contract, and one the seeder does not ship', () => {
  assert.throws(() => loadContract('/nowhere', 'tracy-apple/j6/1.1.0'), /not a WordPress contract/)
  assert.throws(() => loadContract('/nowhere', 'tracy-base/wp7/1.0.0'), /not shipped/)
})

// The Tracy Business hero picture exactly as the 1.2.0 archive ships it.
const PICTURE =
  '<!-- wp:image {"className":"wtb-hero__media","sizeSlug":"large","metadata":{"role":"content","name":"hero.img"},"id":91} -->\n' +
  '<figure class="wp-block-image size-large wtb-hero__media"><img src="/wp-content/uploads/2026/09/hero-ru.png" alt="Drop a site photo here · 4:5" class="wp-image-91"></figure>\n' +
  '<!-- /wp:image -->'

test('setBlockValue: a picture rewrites src, the block id and the wp-image class, and nothing else', () => {
  const drawn = `wp-content/uploads/tracy-content/${'a'.repeat(64)}.jpg`
  const out = setBlockValue(PICTURE, 'hero.img', 'src', drawn, 120)
  assert.equal(
    out,
    PICTURE.replace('/wp-content/uploads/2026/09/hero-ru.png', `/${drawn}`)
      .replace('"id":91}', '"id":120}')
      .replace('wp-image-91', 'wp-image-120')
  )
  // Putting the demo picture back is the page it shipped as — the Claude Cowork plugin's skeleton relies on it.
  assert.equal(setBlockValue(out, 'hero.img', 'src', 'wp-content/uploads/2026/09/hero-ru.png', 91), PICTURE)
  assert.throws(
    () => setBlockValue(PICTURE, 'hero.img', 'src', drawn),
    /needs the attachment id of its picture/
  )
  assert.throws(() => setBlockValue(HERO, 'hero.title', 'src', drawn, 5), /has no picture to write/)
})
