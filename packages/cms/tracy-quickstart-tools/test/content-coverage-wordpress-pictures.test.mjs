/**
 * TracyHQ/tracy#459: how the content coverage audit reads a picture of a WordPress page.
 *
 * WordPress prints a picture with the sizes it generated from the attachment (`cake-300x200.jpg` in `srcset`, or a
 * `-scaled` copy of a large upload). A picture slot names the attachment's own file, and a write to the slot moves the
 * block's attachment id, so every generated size follows the slot: those files are the slot's picture, not holes.
 *
 * A picture no slot names is an attachment some row points at by id (a theme option, a theme's post meta, the site
 * logo). The upload path is stored without `wp-content/uploads/`, and the pointer is a bare number, so the plain text
 * search finds neither: the audit resolves the attachment and names the row that prints it, instead of "unknown".
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { createClassifier } from '../content-coverage/lib/classify.mjs'
import { buildDbIndex } from '../content-coverage/lib/db-index.mjs'
import { createMatcher } from '../content-coverage/lib/match.mjs'

const SITE = 'http://tea.invalid/'

/** The smallest contract the matcher reads: one picture slot, nothing else. */
const contractWith = (platform, images) => ({
  platform,
  template: 'wp-demo',
  pages: [],
  lockedFiles: new Set(),
  index: {
    text: new Map(),
    textCompact: new Map(),
    textList: [],
    image: new Map(images.map((p) => [p, ['home.cake']])),
    url: new Map(),
    rawSample: new Map()
  }
})

test('a generated size of a WordPress slot picture is the slot picture', () => {
  const match = createMatcher(contractWith('wordpress', ['wp-content/uploads/2026/10/cake.jpg']), SITE)
  for (const file of ['cake-300x200.jpg', 'cake-1536x816.jpg', 'cake-scaled.jpg', 'cake-150x150.jpg']) {
    const got = match({ kind: 'image', value: `/wp-content/uploads/2026/10/${file}` })
    assert.equal(got.status, 'matched', file)
    assert.deepEqual(got.slots, ['home.cake'])
    assert.match(got.by, /size/)
  }
  assert.equal(match({ kind: 'image', value: '/wp-content/uploads/2026/10/cake.jpg' }).by, 'path')
})

test('a size of another picture, or a picture in another folder, stays a hole', () => {
  const match = createMatcher(contractWith('wordpress', ['wp-content/uploads/2026/10/cake.jpg']), SITE)
  assert.equal(
    match({ kind: 'image', value: '/wp-content/uploads/2026/10/scone-300x200.jpg' }).status,
    'hole'
  )
  assert.equal(match({ kind: 'image', value: '/wp-content/uploads/2026/09/cake-300x200.jpg' }).status, 'hole')
  // A file whose own name ends in digits is not a size of a shorter one.
  assert.equal(match({ kind: 'image', value: '/wp-content/uploads/2026/10/cake-2.jpg' }).status, 'hole')
})

test('a Joomla contract keeps matching pictures by their exact path only', () => {
  const match = createMatcher(contractWith('joomla', ['images/cake.jpg']), SITE)
  assert.equal(match({ kind: 'image', value: '/images/cake-300x200.jpg' }).status, 'hole')
})

const q = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
const table = (name, columns, rows) =>
  `CREATE TABLE \`tr_${name}\` (\n${columns.map((c) => `  \`${c}\` text`).join(',\n')}\n) ENGINE=InnoDB;\nINSERT INTO \`tr_${name}\` VALUES ${rows.map((r) => `(${r.map(q).join(',')})`).join(',')};\n`

function dump() {
  const sql =
    table(
      'options',
      ['option_id', 'option_name', 'option_value'],
      [
        [1, 'blogname', 'Larkspur'],
        [2, 'site_logo', '50'],
        [3, 'wp_demo_blog_banner_image', '51']
      ]
    ) +
    table(
      'posts',
      ['ID', 'post_content', 'post_title', 'post_status', 'post_name', 'post_type', 'post_parent'],
      [
        [
          10,
          '<!-- wp:paragraph --><p>Scones daily.</p><!-- /wp:paragraph -->',
          'Scones',
          'publish',
          'scones',
          'post',
          0
        ],
        [50, '', 'larkspur-logo', 'inherit', 'larkspur-logo', 'attachment', 0],
        [51, '', 'banner', 'inherit', 'banner', 'attachment', 0],
        [52, '', 'scone', 'inherit', 'scone', 'attachment', 10],
        [53, '', 'orphan', 'inherit', 'orphan', 'attachment', 0]
      ]
    ) +
    table(
      'postmeta',
      ['meta_id', 'post_id', 'meta_key', 'meta_value'],
      [
        [1, 50, '_wp_attached_file', '2026/10/larkspur-logo.png'],
        [2, 51, '_wp_attached_file', '2026/10/banner.jpg'],
        [3, 52, '_wp_attached_file', '2026/10/scone.jpg'],
        [4, 53, '_wp_attached_file', '2026/10/orphan.jpg'],
        [5, 10, 'wp_demo_intro_image', '52']
      ]
    )
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'cov-wp-pictures-')), 'database.sql')
  writeFileSync(file, sql)
  return file
}

const contract = {
  platform: 'wordpress',
  template: 'wp-demo',
  lock: { entities: {} },
  index: { text: new Map(), textCompact: new Map() },
  entityOfRow: () => undefined
}

test('a WordPress picture no slot names is the attachment a row points at by id: that row is named', () => {
  const classify = createClassifier(contract, buildDbIndex(dump()), null)
  const logo = classify({ kind: 'image' }, { path: 'wp-content/uploads/2026/10/larkspur-logo.png' })
  assert.equal(logo.class, 'a')
  assert.match(logo.label, /attachment #50/)
  assert.ok(
    logo.evidence.some((e) => /options#2\.option_value site_logo/.test(e)),
    logo.evidence.join(' | ')
  )

  const banner = classify({ kind: 'image' }, { path: 'wp-content/uploads/2026/10/banner-1024x544.jpg' })
  assert.equal(banner.class, 'a')
  assert.ok(banner.evidence.some((e) => /wp_demo_blog_banner_image/.test(e)))

  const intro = classify({ kind: 'image' }, { path: 'wp-content/uploads/2026/10/scone-150x150.jpg' })
  assert.equal(intro.class, 'a')
  assert.ok(intro.evidence.some((e) => /postmeta#5\.meta_value wp_demo_intro_image \(post 10\)/.test(e)))
})

test('an attachment no row points at is still named, with the attachment as its evidence', () => {
  const classify = createClassifier(contract, buildDbIndex(dump()), null)
  const got = classify({ kind: 'image' }, { path: 'wp-content/uploads/2026/10/orphan.jpg' })
  assert.equal(got.class, 'a')
  assert.match(got.label, /attachment #53/)
  assert.match(got.label, /no row points at it by id/)
})

test('a picture that is no attachment of the dump stays unknown', () => {
  const classify = createClassifier(contract, buildDbIndex(dump()), null)
  assert.equal(classify({ kind: 'image' }, { path: 'wp-content/uploads/2026/10/nowhere.jpg' }).class, 'd')
})
