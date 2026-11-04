// from-wp-spec.test.mjs — the bridge adapter over a real, previously-shipped source (ADR 0016 §2a).
//
// The fixture is a slice of tasks/tracy-base-wp7/spec/ in TCH — the output of the WordPress
// skill's from-joomla.mjs, kept small on purpose so this test does not depend on that file living
// at a fixed path. The real run against the full 43-route spec is recorded in
// examples/tracy-base-j6.md, not repeated here as a unit test.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { validateModel } from '../contract/validate.mjs'
import { fromSpec } from '../ingest/from-wp-spec.mjs'

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-spec-'))
  const write = (name, data) => writeFileSync(path.join(dir, name), JSON.stringify(data))
  write('page-map.json', {
    source: { path: 'tracy-base-j6-1.0.0' },
    pages: [
      { path: '/', view: 'home' },
      { path: '/services', view: 'category' }
    ]
  })
  write('content.json', {
    site: { name: 'Tracy', tagline: 'Precision, in every surface' },
    categories: [{ id: '2', title: 'Services', wpSlug: 'services' }],
    pages: [
      {
        slug: 'home',
        title: 'Home',
        status: 'publish',
        view: 'home',
        content: '<!-- wp:paragraph --><p>Welcome.</p><!-- /wp:paragraph -->'
      }
    ],
    posts: [
      {
        slug: 'launch',
        title: 'Launch',
        status: 'publish',
        date: '2026-01-01',
        author: { name: 'Ann' },
        category: 'services',
        path: '/services/launch',
        excerpt: '<p>Short.</p>',
        content:
          '<!-- wp:paragraph --><p>Long.</p><!-- /wp:paragraph -->\n<figure class="wp-block-image"><img src="/wp-content/uploads/launch.png" class="wp-image-9"></figure>',
        featuredImage: '/wp-content/uploads/launch-cover.png',
        featuredImageAlt: 'Launch cover'
      }
    ],
    archives: [{ path: '/services' }]
  })
  write('sections.json', {
    acm: [
      {
        id: '1',
        type: 'hero',
        title: '[Tracy] Home - Hero',
        position: 'masthead',
        published: true,
        fields: { title: 'Build with us', 'hero-image': '/wp-content/uploads/hero.jpg' },
        items: []
      }
    ]
  })
  write('menus.json', {
    menus: [
      {
        menutype: 'tracy',
        title: 'Main',
        items: [
          { label: 'Home', url: '/', type: 'component', published: true, children: [] },
          {
            label: 'Resources',
            url: null,
            type: 'heading',
            published: true,
            children: [
              { label: 'Services', url: '/services', type: 'component', published: true, children: [] }
            ]
          }
        ]
      }
    ]
  })
  write('redirects.json', { rules: [{ from: '/old-home', to: '/' }] })
  return dir
}

test('a real WordPress-skill spec-pack becomes a valid, foreign-vocabulary-free model', () => {
  const dir = fixture()
  try {
    const model = fromSpec(dir)
    assert.deepEqual(validateModel(model), [])

    const body = model.records.find((r) => r.type === 'posts' && r.slug === 'launch').values.body
    assert.ok(!body.includes('wp:paragraph'), 'block comments must be gone')
    assert.ok(!body.includes('wp-content'), 'the uploads path must be gone')
    assert.ok(!body.includes('wp-block'), 'the block-editor class must be gone')
    assert.ok(body.includes('launch.png'), 'the file itself is kept, just not its foreign path')

    const media = model.media.map((m) => m.file)
    assert.ok(media.includes('launch-cover.png'))
    assert.ok(
      media.includes('launch.png'),
      'an image found inside prose is registered too, not just featuredImage'
    )
    assert.ok(media.includes('hero.jpg'), 'an image field on a section instance is registered')

    const heroType = model.types.find((t) => t.name === 'hero')
    assert.ok(heroType, 'a section kind becomes its own type')
    const heroRecord = model.records.find((r) => r.type === 'hero')
    assert.equal(heroRecord.values.title, 'Build with us')
    assert.equal(
      heroRecord.values.hero_image,
      'hero.jpg',
      'an image field is replaced by the registered file name, and the key is normalised like every other field'
    )

    // The model records what the source actually said — a group label with no destination — and
    // stays neutral about it. Turning that into the '#' convention is compile-seed.mjs's job
    // (invariant tested in compile-seed.test.mjs); the adapter's job stops at not inventing a link.
    const menu = model.menus[0]
    assert.equal(menu.items[1].path, '', 'no destination is recorded as none, not invented')
    assert.equal(menu.items[1].kind, 'heading')
    assert.equal(menu.items[1].label.en, 'Resources', 'the heading text itself is kept')
    assert.equal(menu.items[1].children[0].path, '/services')

    assert.deepEqual(model.redirects, [{ from: '/old-home', to: '/', status: 301 }])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a spec-pack with no redirects.json is not an error', () => {
  const dir = fixture()
  rmSync(path.join(dir, 'redirects.json'))
  try {
    const model = fromSpec(dir)
    assert.deepEqual(model.redirects, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
