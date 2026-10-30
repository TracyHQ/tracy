/**
 * "Sync from live" right after "Sync to live" (`scripts/lib/live_sync.py db --pushed`, `DbMerge.seed_pushed`):
 * the live site now holds what the push wrote — a new term with the taxonomy row WordPress numbered
 * itself, a post moved into it, a new page with the meta WordPress gave it — and the base (the read
 * before the push) does not. With the push's places taken as base first, the merge brings none of it
 * back as the live site's own: no second term, no second page, no relationship to a number the copy
 * does not have. Without them, it would.
 *
 * Needs a real MariaDB (`mariadb:11` in a container of its own; SKIPPED where no docker daemon answers).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-sync-pushed.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ENGINE = join(here, '..', 'scripts', 'lib', 'live_sync.py')
const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0
const DB_CONTAINER = `tracy-live-sync-pushed-db-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the merge needs a real MariaDB' }
const CLIENT = [REAL_DOCKER, 'exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot']
const root = mkdtempSync(join(tmpdir(), 'live-sync-pushed-'))
after(() => rmSync(root, { recursive: true, force: true }))

const sql = (script, db = '') =>
  execFileSync(CLIENT[0], [...CLIENT.slice(1), '-N', '-B', ...(db ? [db] : [])], {
    input: script,
    encoding: 'utf8'
  }).trim()
const rows = (query, db) =>
  sql(query, db)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))

before(async () => {
  if (!DOCKER_UP) return
  spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
  execFileSync(
    REAL_DOCKER,
    ['run', '-d', '--name', DB_CONTAINER, '-e', 'MARIADB_ROOT_PASSWORD=t', 'mariadb:11'],
    {
      stdio: 'ignore'
    }
  )
  for (let i = 0; i < 240; i++) {
    const ok = spawnSync(
      REAL_DOCKER,
      ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-h127.0.0.1', '-e', 'SELECT 1'],
      { stdio: 'ignore' }
    )
    if (ok.status === 0) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('test MariaDB never answered')
})
after(() => {
  if (DOCKER_UP) spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
})

const LIVE = 'https://shop.example'
const COPY = 'https://shop-com.tracy.ai'
const TABLES = `
CREATE TABLE wp_posts (ID BIGINT UNSIGNED PRIMARY KEY, post_content LONGTEXT, post_title TEXT, post_status VARCHAR(20),
  post_name VARCHAR(200), post_modified DATETIME, post_type VARCHAR(20), post_parent BIGINT UNSIGNED DEFAULT 0,
  guid VARCHAR(255), menu_order INT DEFAULT 0, comment_count BIGINT DEFAULT 0);
CREATE TABLE wp_postmeta (meta_id BIGINT UNSIGNED PRIMARY KEY, post_id BIGINT UNSIGNED, meta_key VARCHAR(255), meta_value LONGTEXT);
CREATE TABLE wp_terms (term_id BIGINT UNSIGNED PRIMARY KEY, name VARCHAR(200), slug VARCHAR(200), term_group BIGINT DEFAULT 0);
CREATE TABLE wp_term_taxonomy (term_taxonomy_id BIGINT UNSIGNED PRIMARY KEY, term_id BIGINT UNSIGNED, taxonomy VARCHAR(32),
  description LONGTEXT, parent BIGINT UNSIGNED DEFAULT 0, count BIGINT DEFAULT 0, UNIQUE KEY term_id_taxonomy (term_id, taxonomy));
CREATE TABLE wp_term_relationships (object_id BIGINT UNSIGNED, term_taxonomy_id BIGINT UNSIGNED, term_order INT DEFAULT 0,
  PRIMARY KEY (object_id, term_taxonomy_id));
CREATE TABLE wp_options (option_id BIGINT UNSIGNED PRIMARY KEY, option_name VARCHAR(191) UNIQUE, option_value LONGTEXT,
  autoload VARCHAR(20) DEFAULT 'yes');
INSERT INTO wp_terms VALUES (1, 'Uncategorized', 'uncategorized', 0);
INSERT INTO wp_term_taxonomy VALUES (1, 1, 'category', '', 0, 1);
INSERT INTO wp_posts VALUES (10, '<p>Hello</p>', 'Hello world', 'publish', 'hello-world', '2026-01-01', 'post', 0, 'HOME/?p=10', 0, 0);
INSERT INTO wp_term_relationships VALUES (10, 1, 0);
INSERT INTO wp_postmeta VALUES (1, 10, '_edit_last', '1');
INSERT INTO wp_options VALUES (1, 'home', 'HOME', 'yes'), (2, 'siteurl', 'HOME', 'yes'), (3, 'blogname', 'Shop', 'yes');
`
const home = (url) =>
  `UPDATE wp_posts SET guid = REPLACE(guid, 'HOME', '${url}'); UPDATE wp_options SET option_value = '${url}' WHERE option_value = 'HOME';`

/** base, ours and theirs: the live site before the push, the copy, the live site after it. */
function three(name) {
  for (const side of ['base', 'ours', 'theirs']) {
    sql(`DROP DATABASE IF EXISTS \`${name}_${side}\`; CREATE DATABASE \`${name}_${side}\`;`)
    sql(TABLES, `${name}_${side}`)
  }
  sql(home(LIVE), `${name}_base`)
  // The copy: Tracy made "Cakes" (term 7, its taxonomy row 9), put the post in it, made a page (11).
  sql(
    `${home(COPY)}
     INSERT INTO wp_terms VALUES (7, 'Cakes', 'cakes', 0); INSERT INTO wp_term_taxonomy VALUES (9, 7, 'category', '', 0, 1);
     DELETE FROM wp_term_relationships WHERE object_id = 10; INSERT INTO wp_term_relationships VALUES (10, 9, 0);
     INSERT INTO wp_posts VALUES (11, '<p>Our cakes</p>', 'Cakes', 'publish', 'cakes', '2026-10-24', 'page', 0, '${COPY}/?page_id=11', 0, 0);`,
    `${name}_ours`
  )
  // The live site after the push: WordPress numbered the term 2 and its taxonomy row 2, the page 12,
  // stamped its own `modified`, and gave the page a meta row of its own.
  sql(
    `${home(LIVE)}
     INSERT INTO wp_terms VALUES (2, 'Cakes', 'cakes', 0); INSERT INTO wp_term_taxonomy VALUES (2, 2, 'category', '', 0, 1);
     DELETE FROM wp_term_relationships WHERE object_id = 10; INSERT INTO wp_term_relationships VALUES (10, 2, 0);
     UPDATE wp_term_taxonomy SET count = 0 WHERE term_taxonomy_id = 1;
     INSERT INTO wp_posts VALUES (12, '<p>Our cakes</p>', 'Cakes', 'publish', 'cakes', NOW(), 'page', 0, '${LIVE}/?page_id=12', 0, 0);
     INSERT INTO wp_postmeta VALUES (2, 12, '_edit_last', '1');`,
    `${name}_theirs`
  )
}

function merge(name, pushed) {
  const map = join(root, `${name}-map.json`)
  // The numbers the push learnt: the live site's 2 is the copy's term 7, its 12 the copy's page 11.
  writeFileSync(map, JSON.stringify({ terms: { 2: 7 }, posts: { 12: 11 } }))
  const args = [
    ENGINE,
    'db',
    '--base-schema',
    `${name}_base`,
    '--ours-schema',
    `${name}_ours`,
    '--theirs-schema',
    `${name}_theirs`,
    '--work-schema',
    `${name}_work`,
    '--platform',
    'wordpress',
    '--prefix',
    'wp_',
    '--prefer',
    'ours',
    '--id-map',
    map
  ]
  if (pushed) {
    const file = join(root, `${name}-pushed.json`)
    writeFileSync(file, JSON.stringify({ records: pushed }))
    args.push('--pushed', file)
  }
  const r = spawnSync('python3', args, {
    encoding: 'utf8',
    env: { ...process.env, TRACY_SYNC_SQL: JSON.stringify(CLIENT) }
  })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  return JSON.parse(r.stdout.trim().split('\n').at(-1))
}

// As lib/live_push.py `seeds` wrote them for this push (lib/live_push.py record).
const PUSHED = [
  {
    table: 'terms',
    match: { term_id: 7 },
    columns: ['name', 'slug'],
    from: 'ours',
    create: true,
    entity: 'terms',
    id: 7,
    align: { entity: 'term_taxonomy', match: { term_id: 7, taxonomy: 'category' } }
  },
  { table: 'posts', match: { ID: 10 }, columns: [], from: 'ours' },
  { table: 'term_relationships', match: { object_id: 10 }, rows: 'ours' },
  {
    table: 'posts',
    match: { ID: 11 },
    columns: ['post_title', 'post_content', 'post_status', 'post_name'],
    from: 'ours',
    create: true,
    entity: 'posts',
    id: 11
  }
]

test(
  'after a push, the sync takes the push’s places as base: no second term, page or relationship',
  opts,
  () => {
    three('pa')
    const answer = merge('pa', PUSHED)
    assert.equal(answer.ok, true)
    assert.deepEqual(answer.held, [])
    assert.deepEqual(answer.kept, [], JSON.stringify(answer.kept))
    assert.deepEqual(rows('SELECT term_id, slug FROM wp_terms ORDER BY term_id', 'pa_ours'), [
      ['1', 'uncategorized'],
      ['7', 'cakes']
    ])
    assert.deepEqual(rows('SELECT term_taxonomy_id, term_id FROM wp_term_taxonomy ORDER BY 1', 'pa_ours'), [
      ['1', '1'],
      ['9', '7']
    ])
    assert.deepEqual(
      rows('SELECT object_id, term_taxonomy_id FROM wp_term_relationships ORDER BY 1, 2', 'pa_ours'),
      [['10', '9']]
    )
    assert.deepEqual(rows('SELECT ID, post_type FROM wp_posts ORDER BY ID', 'pa_ours'), [
      ['10', 'post'],
      ['11', 'page']
    ])
    assert.deepEqual(rows('SELECT post_id, meta_key FROM wp_postmeta ORDER BY meta_id', 'pa_ours'), [
      ['10', '_edit_last']
    ])
    // The live site's taxonomy row 2 is the copy's 9 from now on.
    assert.equal(answer.idMap.term_taxonomy['2'], 9)
    assert.ok(answer.pushedSeeded > 0)
  }
)

test(
  'the same merge without the push’s places: the live site’s copies of Tracy’s records come back (why seeding exists)',
  opts,
  () => {
    three('pb')
    const answer = merge('pb', null)
    const terms = rows('SELECT COUNT(*) FROM wp_terms', 'pb_ours')[0][0]
    const pages = rows("SELECT COUNT(*) FROM wp_posts WHERE post_type = 'page'", 'pb_ours')[0][0]
    const rels = rows('SELECT COUNT(*) FROM wp_term_relationships WHERE object_id = 10', 'pb_ours')[0][0]
    assert.ok(
      Number(pages) > 1 ||
        Number(terms) > 2 ||
        Number(rels) > 1 ||
        answer.held.length > 0 ||
        answer.kept.length > 0,
      `without seeding the merge should show the push as the live site's change: ${JSON.stringify({ terms, pages, rels, held: answer.held.length, kept: answer.kept.length })}`
    )
  }
)

test(
  'without the push’s places, a record the id map already names is not taken for a new one: the copy’s page stays one, under the number the map gives it',
  opts,
  () => {
    three('pc')
    const answer = merge('pc', null)
    assert.equal(answer.ok, true)
    // The live site's page 12 is the copy's 11 (the push made it): the base not holding it yet makes it
    // no record both sides created — numbered again, the copy got a second "Cakes" page and the map
    // lost 12 → 11, so the next push made the page on the live site a second time.
    assert.deepEqual(
      answer.renumbered.filter((r) => r.table === 'posts' || r.table === 'terms'),
      [],
      JSON.stringify(answer.renumbered)
    )
    assert.equal(answer.idMap.posts['12'], 11)
    assert.equal(answer.idMap.terms['2'], 7)
    assert.deepEqual(rows("SELECT ID FROM wp_posts WHERE post_type = 'page' ORDER BY ID", 'pc_ours'), [
      ['11']
    ])
    assert.deepEqual(rows('SELECT term_id FROM wp_terms ORDER BY term_id', 'pc_ours'), [['1'], ['7']])
  }
)

for (const limited of [true, false]) {
  test(
    `after a push of a post’s categories, the copy keeps its terms the push never sent — Polylang language, a plugin’s taxonomy (#105)${limited ? '' : ': the unlimited seed lost them'}`,
    opts,
    () => {
      const name = limited ? 'pt' : 'pu'
      for (const side of ['base', 'ours', 'theirs']) {
        sql(`DROP DATABASE IF EXISTS \`${name}_${side}\`; CREATE DATABASE \`${name}_${side}\`;`)
        sql(
          `${TABLES}
           INSERT INTO wp_terms VALUES (8, 'News', 'news', 0), (20, 'Spring', 'spring', 0), (21, 'Francais', 'fr', 0);
           INSERT INTO wp_term_taxonomy VALUES (8, 8, 'category', '', 0, 0), (20, 20, 'series', '', 0, 0),
             (21, 21, 'language', 'a:0:{}', 0, 1);
           INSERT INTO wp_term_relationships VALUES (10, 21, 0);`,
          `${name}_${side}`
        )
      }
      sql(home(LIVE), `${name}_base`)
      // Tracy moved the post to News and filed it in a series; the push sent the category only.
      sql(
        `${home(COPY)} DELETE FROM wp_term_relationships WHERE object_id = 10 AND term_taxonomy_id = 1;
         INSERT INTO wp_term_relationships VALUES (10, 8, 0), (10, 20, 0);`,
        `${name}_ours`
      )
      sql(
        `${home(LIVE)} DELETE FROM wp_term_relationships WHERE object_id = 10 AND term_taxonomy_id = 1;
         INSERT INTO wp_term_relationships VALUES (10, 8, 0);`,
        `${name}_theirs`
      )
      const answer = merge(name, [
        { table: 'posts', match: { ID: 10 }, columns: [], from: 'ours' },
        {
          table: 'term_relationships',
          match: { object_id: 10 },
          rows: 'ours',
          ...(limited ? { taxonomies: ['category', 'post_tag'] } : {})
        }
      ])
      assert.equal(answer.ok, true)
      const kept = rows(
        'SELECT term_taxonomy_id FROM wp_term_relationships WHERE object_id = 10 ORDER BY 1',
        `${name}_ours`
      ).map((r) => r[0])
      if (limited) assert.deepEqual(kept, ['8', '20', '21'])
      else
        assert.ok(
          !kept.includes('20'),
          `the unlimited seed read the series as removed on the live site: ${kept}`
        )
    }
  )
}

test(
  'Joomla: the assets of articles a push created meet the copy’s own assets, never a false conflict or an id the copy lacks (#172)',
  opts,
  () => {
    const tables = `
    CREATE TABLE jos_assets (id INT UNSIGNED PRIMARY KEY, parent_id INT DEFAULT 0, lft INT DEFAULT 0, rgt INT DEFAULT 0,
      level INT DEFAULT 0, name VARCHAR(50) NOT NULL UNIQUE, title VARCHAR(100), rules VARCHAR(5120) DEFAULT '{}');
    CREATE TABLE jos_content (id INT UNSIGNED PRIMARY KEY, asset_id INT UNSIGNED DEFAULT 0, title VARCHAR(255), alias VARCHAR(400),
      introtext MEDIUMTEXT, state TINYINT DEFAULT 1, catid INT UNSIGNED DEFAULT 2, modified DATETIME);
    INSERT INTO jos_assets VALUES (1, 0, 0, 3, 0, 'root.1', 'Root', '{}'), (30, 1, 1, 2, 1, 'com_content.article.1', 'Live', '{}');
    INSERT INTO jos_content VALUES (1, 30, 'Live', 'live', '', 1, 2, '2026-01-01');`
    for (const side of ['base', 'ours', 'theirs']) {
      sql(`DROP DATABASE IF EXISTS jp_${side}; CREATE DATABASE jp_${side}; USE jp_${side}; ${tables}`)
    }
    // The copy made two articles, with their assets in the order it made them …
    sql(
      `INSERT INTO jos_assets VALUES (50, 1, 3, 4, 1, 'com_content.article.10', 'A', '{}'), (51, 1, 5, 6, 1, 'com_content.article.11', 'B', '{}');
     INSERT INTO jos_content VALUES (10, 50, 'A', 'a', '', 1, 2, '2026-01-02'), (11, 51, 'B', 'b', '', 1, 2, '2026-01-02');`,
      'jp_ours'
    )
    // … the push made them on live as 20 and 21, and live numbered their assets the other way round.
    sql(
      `INSERT INTO jos_assets VALUES (60, 1, 3, 4, 1, 'com_content.article.21', 'B', '{}'), (61, 1, 5, 6, 1, 'com_content.article.20', 'A', '{}');
     INSERT INTO jos_content VALUES (20, 61, 'A', 'a', '', 1, 2, '2026-01-02'), (21, 60, 'B', 'b', '', 1, 2, '2026-01-02');`,
      'jp_theirs'
    )
    const map = join(root, 'jp-map.json')
    writeFileSync(map, JSON.stringify({ content: { 20: 10, 21: 11 } }))
    // As lib/live_push.py `seeds` writes an article it creates: its row, and its asset to align by name.
    const seed = (id) => ({
      table: 'content',
      match: { id },
      columns: ['title', 'alias', 'introtext', 'state', 'catid'],
      create: true,
      entity: 'content',
      id,
      align: { entity: 'assets', match: { name: `com_content.article.${id}` } }
    })
    const pushed = join(root, 'jp-pushed.json')
    writeFileSync(pushed, JSON.stringify({ records: [seed(10), seed(11)] }))
    const r = spawnSync(
      'python3',
      [
        ENGINE,
        'db',
        '--base-schema',
        'jp_base',
        '--ours-schema',
        'jp_ours',
        '--theirs-schema',
        'jp_theirs',
        '--work-schema',
        'jp_work',
        '--platform',
        'joomla',
        '--prefix',
        'jos_',
        '--id-map',
        map,
        '--pushed',
        pushed
      ],
      { encoding: 'utf8', env: { ...process.env, TRACY_SYNC_SQL: JSON.stringify(CLIENT) } }
    )
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const answer = JSON.parse(r.stdout.trim().split('\n').at(-1))
    assert.deepEqual(answer.conflicts, [], JSON.stringify(answer.conflicts))
    assert.deepEqual(
      answer.idMap.assets,
      { 60: 51, 61: 50 },
      'each live asset is the copy’s asset of the same article'
    )
    const onCopy = rows('SELECT id FROM jos_assets', 'jp_ours').map(([id]) => Number(id))
    assert.ok(
      Object.values(answer.idMap.assets).every((id) => onCopy.includes(id)),
      'no id the copy does not hold'
    )
    assert.deepEqual(
      rows('SELECT id, asset_id FROM jos_content WHERE id IN (10, 11) ORDER BY id', 'jp_ours'),
      [
        ['10', '50'],
        ['11', '51']
      ]
    )
  }
)
