#!/usr/bin/env node
/**
 * Row ⇄ file for emdash, and the front matter that carries a row's identity.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-mirror.test.mjs
 *
 * The direction that can hurt is file → row: it reaches a site that is already public, with no
 * Preview in between. So the refusals are pinned harder than the successes.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { changesFrom, fileFor, pathFor } from '../scripts/tools/emdash/mirror.mjs'
import { parse, splitFile, stringify } from '../scripts/tools/emdash/frontmatter.mjs'

/** A row exactly as `ec_posts` holds one — column names and shapes measured on `tchemdash1`. */
const row = (over = {}) => ({
  id: '01M1F79DAXK49F1M2S8GM40W64',
  slug: 'work-in-progress',
  status: 'draft',
  locale: 'en',
  title: 'Work in Progress',
  excerpt: 'This post is still being written.',
  featured_image: null,
  published_at: null,
  updated_at: '2026-09-01T19:31:42.045Z',
  version: 1,
  content: JSON.stringify([
    {
      _type: 'block',
      style: 'normal',
      _key: 'k0',
      children: [{ _type: 'span', text: 'This is a draft post.', _key: 'k1' }]
    }
  ]),
  ...over
})

test('a row becomes a file a person can read, body as prose', () => {
  const file = fileFor(row())
  assert.match(file, /^---\n/)
  assert.match(file, /id: "01M1F79DAXK49F1M2S8GM40W64"/)
  assert.match(file, /title: "Work in Progress"/)
  assert.ok(file.endsWith('This is a draft post.\n'))
})

test('exporting the same row twice is byte-identical — nothing of ours moves', () => {
  // A field that changes on every export rewrites every file on every Sync, and the one line that
  // really changed is then invisible in the diff.
  assert.equal(fileFor(row()), fileFor(row()))
})

test('a plain edit comes back as exactly the columns that changed', () => {
  const before = row()
  const edited = fileFor(before).replace('This is a draft post.', 'This is a published post.')
  const result = changesFrom(edited, before)
  assert.equal(result.ok, true)
  assert.deepEqual(Object.keys(result.changes), ['content'])
  assert.match(result.changes.content, /This is a published post\./)
})

test('editing the front matter changes the words, not the bookkeeping', () => {
  const before = row()
  const edited = fileFor(before)
    .replace('status: "draft"', 'status: "published"')
    .replace('version: 1', 'version: 99')
  const result = changesFrom(edited, before)
  assert.equal(result.ok, true)
  assert.equal(result.changes.status, 'published')
  // `version` is emdash's own counter. Obeying a hand-typed one would let a file rewrite the row's
  // history, and there is no reading of that which is a person's intent.
  assert.equal('version' in result.changes, false)
  assert.equal('updated_at' in result.changes, false)
})

test('no change in, no change out — an untouched file writes nothing', () => {
  const before = row()
  const result = changesFrom(fileFor(before), before)
  assert.equal(result.ok, true)
  assert.deepEqual(
    result.changes,
    {},
    'a Sync that rewrites unchanged rows bumps every timestamp for nothing'
  )
})

test('a file whose id does not match the row is refused, not guessed at', () => {
  const before = row()
  const copied = fileFor(row({ id: 'SOMEONE-ELSES-ID' }))
  assert.deepEqual(changesFrom(copied, before), { ok: false, reason: 'id_does_not_match_row' })
})

test('a file with no id at all is refused', () => {
  assert.deepEqual(changesFrom('just some prose\n', row()), { ok: false, reason: 'no_id_in_frontmatter' })
})

test('a body the projection cannot read back is refused rather than half-applied', () => {
  // This is the guard doing its job: the cost of a construct this adapter gets wrong is a refusal,
  // never a live edit that silently drops part of a post.
  const broken = fileFor(row()).replace('This is a draft post.', '```portable-text\n{ not json\n```')
  assert.deepEqual(changesFrom(broken, row()), { ok: false, reason: 'body_does_not_round_trip' })
})

test('a verbatim block the author left alone applies without being rewritten', () => {
  const image = { _type: 'image', _key: 'img1', asset: { _ref: 'image-abc' } }
  const before = row({ content: JSON.stringify([image]) })
  const result = changesFrom(fileFor(before), before)
  assert.equal(result.ok, true)
  assert.deepEqual(result.changes, {}, 'round-tripping an image must not count as an edit')
})

test('the filename leads with the id, so retitling does not read as delete-and-recreate', () => {
  assert.equal(pathFor('posts', row()), 'SiteContent/posts/01M1F79DAXK49F1M2S8GM40W64-work-in-progress.md')
  assert.equal(pathFor('pages', row({ slug: null })), 'SiteContent/pages/01M1F79DAXK49F1M2S8GM40W64.md')
  // A slug is author-supplied text; it must not be able to climb out of the directory.
  assert.equal(
    pathFor('posts', row({ slug: '../../etc/passwd' })),
    'SiteContent/posts/01M1F79DAXK49F1M2S8GM40W64-etc-passwd.md'
  )
})

test('front matter never guesses a type from how a value looks', () => {
  // A slug of `yes`, a title of `12.30`, an id with a leading zero: YAML that infers types turns
  // each of these into something else, and the row stops matching the site.
  const data = { slug: 'yes', title: '12.30', id: '0123', empty: null, count: 4, flag: true }
  const back = parse(stringify(data))
  assert.deepEqual(back, data)
})

test('a title containing a colon or a quote survives the round trip', () => {
  const file = fileFor(row({ title: 'Tracy: the "real" story\\backslash' }))
  assert.equal(splitFile(file).data.title, 'Tracy: the "real" story\\backslash')
})
