#!/usr/bin/env node
/**
 * The emdash adapter against a real SQLite file — export, edit, apply.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-content.test.mjs
 *
 * The database here is built to the schema measured on `tchemdash1` (02/09), including the detail
 * that bit once already: `featured_image` exists on `ec_posts` and NOT on `ec_pages`, so a single
 * column list across both tables throws at runtime and only on a site that has pages.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('../scripts/tools/emdash/emdash-content.mjs', import.meta.url))

const BLOCKS = (text) =>
  JSON.stringify([
    { _type: 'block', style: 'normal', _key: 'k0', children: [{ _type: 'span', text, _key: 'k1' }] }
  ])

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'emdash-'))
  const dbPath = path.join(dir, 'data.db')
  const db = new DatabaseSync(dbPath)
  db.exec(`
    create table ec_posts (
      id text primary key, slug text, status text, author_id text, created_at text, updated_at text,
      published_at text, scheduled_at text, deleted_at text, version integer,
      live_revision_id text, draft_revision_id text, locale text not null,
      translation_group text, title text not null, featured_image text, content json, excerpt text
    );
    create table ec_pages (
      id text primary key, slug text, status text, author_id text, created_at text, updated_at text,
      published_at text, scheduled_at text, deleted_at text, version integer,
      live_revision_id text, draft_revision_id text, locale text not null,
      translation_group text, title text not null, content json
    );
  `)
  db.prepare(
    'insert into ec_posts (id, slug, status, locale, title, excerpt, content, version, updated_at) values (?,?,?,?,?,?,?,?,?)'
  ).run(
    'POST1',
    'first-post',
    'draft',
    'en',
    'First Post',
    'An excerpt.',
    BLOCKS('Hello world.'),
    1,
    '2026-09-01T00:00:00.000Z'
  )
  db.prepare(
    'insert into ec_pages (id, slug, status, locale, title, content, version, updated_at) values (?,?,?,?,?,?,?,?)'
  ).run('PAGE1', 'about', 'published', 'en', 'About', BLOCKS('About us.'), 1, '2026-09-01T00:00:00.000Z')
  // A deleted post must not be mirrored: exporting it would put removed content back into git.
  db.prepare(
    'insert into ec_posts (id, slug, status, locale, title, content, deleted_at) values (?,?,?,?,?,?,?)'
  ).run('GONE', 'gone', 'draft', 'en', 'Gone', BLOCKS('Removed.'), '2026-09-01T10:00:00.000Z')
  db.close()
  return { dir, dbPath }
}

const cli = (args, cwd) => run(process.execPath, [CLI, ...args], { cwd })

test('export writes one file per live row, and skips deleted ones', async () => {
  const { dir, dbPath } = await fixture()
  const { stdout } = await cli(['export', dir, dbPath])
  assert.match(stdout, /2 written/)

  const posts = await readdir(path.join(dir, 'SiteContent/posts'))
  const pages = await readdir(path.join(dir, 'SiteContent/pages'))
  assert.deepEqual(posts, ['POST1-first-post.md'])
  assert.deepEqual(pages, ['PAGE1-about.md'])
  // A row with `deleted_at` set is gone from the site; mirroring it would republish it in git.
  assert.equal(
    posts.some((p) => p.startsWith('GONE')),
    false
  )

  const body = await readFile(path.join(dir, 'SiteContent/posts/POST1-first-post.md'), 'utf8')
  assert.match(body, /title: "First Post"/)
  assert.ok(body.trimEnd().endsWith('Hello world.'))
})

test('a second export writes nothing — the mirror is stable', async () => {
  const { dir, dbPath } = await fixture()
  await cli(['export', dir, dbPath])
  const { stdout } = await cli(['export', dir, dbPath])
  assert.match(stdout, /0 written, 2 unchanged/)
})

test('an edit to the prose reaches the row, and search stays consistent through the same UPDATE', async () => {
  const { dir, dbPath } = await fixture()
  await cli(['export', dir, dbPath])
  const file = path.join(dir, 'SiteContent/posts/POST1-first-post.md')
  await writeFile(file, (await readFile(file, 'utf8')).replace('Hello world.', 'Hello **Tracy**.'), 'utf8')

  const { stdout } = await cli(['apply', dir, dbPath])
  assert.match(stdout, /1 row\(s\) written/)

  const db = new DatabaseSync(dbPath, { readOnly: true })
  const row = db.prepare('select content, updated_at from ec_posts where id = ?').get('POST1')
  const blocks = JSON.parse(row.content)
  assert.deepEqual(
    blocks[0].children.map((c) => c.text),
    ['Hello ', 'Tracy', '.']
  )
  assert.ok(blocks[0].children[1].marks.includes('strong'))
  // A row whose words changed while its timestamp did not is a row every cache keeps serving stale.
  assert.notEqual(row.updated_at, '2026-09-01T00:00:00.000Z')
  db.close()
})

test('a front-matter edit changes the words but not emdash’s bookkeeping', async () => {
  const { dir, dbPath } = await fixture()
  await cli(['export', dir, dbPath])
  const file = path.join(dir, 'SiteContent/posts/POST1-first-post.md')
  await writeFile(
    file,
    (await readFile(file, 'utf8'))
      .replace('status: "draft"', 'status: "published"')
      .replace('version: 1', 'version: 42'),
    'utf8'
  )
  await cli(['apply', dir, dbPath])

  const db = new DatabaseSync(dbPath, { readOnly: true })
  const row = db.prepare('select status, version from ec_posts where id = ?').get('POST1')
  assert.equal(row.status, 'published')
  assert.equal(row.version, 1, 'a text file must not be able to rewrite a revision counter')
  db.close()
})

test('one unreadable file cancels the whole run — no half-applied set of posts', async () => {
  const { dir, dbPath } = await fixture()
  await cli(['export', dir, dbPath])
  const post = path.join(dir, 'SiteContent/posts/POST1-first-post.md')
  const page = path.join(dir, 'SiteContent/pages/PAGE1-about.md')
  // A good edit and a broken one in the same run. The good one must NOT land: a partial apply over
  // a public site is the state nobody can reason about afterwards.
  await writeFile(page, (await readFile(page, 'utf8')).replace('About us.', 'About all of us.'), 'utf8')
  await writeFile(
    post,
    (await readFile(post, 'utf8')).replace('Hello world.', '```portable-text\n{ broken\n```'),
    'utf8'
  )

  const failed = await cli(['apply', dir, dbPath]).catch((error) => error)
  assert.equal(failed.code, 1)
  assert.match(String(failed.stderr), /body_does_not_round_trip/)
  assert.match(String(failed.stderr), /nothing written/)

  const db = new DatabaseSync(dbPath, { readOnly: true })
  assert.match(db.prepare('select content from ec_pages where id = ?').get('PAGE1').content, /About us\./)
  db.close()
})

test('--dry-run names what would change and writes nothing', async () => {
  const { dir, dbPath } = await fixture()
  await cli(['export', dir, dbPath])
  const file = path.join(dir, 'SiteContent/posts/POST1-first-post.md')
  await writeFile(file, (await readFile(file, 'utf8')).replace('Hello world.', 'Changed.'), 'utf8')

  const { stdout } = await cli(['apply', dir, dbPath, '--dry-run'])
  assert.match(stdout, /would change \(dry run\)/)
  const db = new DatabaseSync(dbPath, { readOnly: true })
  assert.match(db.prepare('select content from ec_posts where id = ?').get('POST1').content, /Hello world\./)
  db.close()
})

test('applying an untouched export writes nothing at all', async () => {
  const { dir, dbPath } = await fixture()
  await cli(['export', dir, dbPath])
  const { stdout } = await cli(['apply', dir, dbPath])
  assert.match(stdout, /nothing to do/)
})

test('a file whose row is gone is refused, and never deleted behind the author’s back', async () => {
  const { dir, dbPath } = await fixture()
  await cli(['export', dir, dbPath])
  const stray = path.join(dir, 'SiteContent/posts/STRAY.md')
  await writeFile(stray, '---\nid: "NO-SUCH-ROW"\n---\n\nText.\n', 'utf8')

  const failed = await cli(['apply', dir, dbPath]).catch((error) => error)
  assert.equal(failed.code, 1)
  assert.match(String(failed.stderr), /no_such_row/)

  const { stdout } = await cli(['export', dir, dbPath])
  assert.match(stdout, /1 orphaned/)
  assert.match(stdout, /rerun with --prune/)
  await readFile(stray, 'utf8')
})
