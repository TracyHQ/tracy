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

// ── #223 on WordPress: records a push made, then deleted for good on the live site ────────────────
// WordPress's own tables (wp-admin/includes/schema.php), and rows as two real WordPress 7.1 sites
// made them through the Claude Cowork writer (02/11/2026): the copy's by Tracy, the live site's by the
// push. They differ only where WordPress stamps the record itself — the times of what is sent with no
// date, the `guid` (fixed from the site's own address at the first insert), an untitled menu item's
// name (its number), a custom link's object (the item's own number) — and in their numbers.
const WP_TABLES = `
CREATE TABLE wp_posts (ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, post_author bigint(20) unsigned NOT NULL DEFAULT 0,
  post_date datetime NOT NULL DEFAULT '0000-00-00 00:00:00', post_date_gmt datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  post_content longtext NOT NULL, post_title text NOT NULL, post_excerpt text NOT NULL,
  post_status varchar(20) NOT NULL DEFAULT 'publish', comment_status varchar(20) NOT NULL DEFAULT 'open',
  ping_status varchar(20) NOT NULL DEFAULT 'open', post_password varchar(255) NOT NULL DEFAULT '',
  post_name varchar(200) NOT NULL DEFAULT '', to_ping text NOT NULL, pinged text NOT NULL,
  post_modified datetime NOT NULL DEFAULT '0000-00-00 00:00:00', post_modified_gmt datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  post_content_filtered longtext NOT NULL, post_parent bigint(20) unsigned NOT NULL DEFAULT 0,
  guid varchar(255) NOT NULL DEFAULT '', menu_order int(11) NOT NULL DEFAULT 0, post_type varchar(20) NOT NULL DEFAULT 'post',
  post_mime_type varchar(100) NOT NULL DEFAULT '', comment_count bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (ID), KEY post_name (post_name(191)), KEY type_status_date (post_type, post_status, post_date, ID),
  KEY post_parent (post_parent), KEY post_author (post_author));
CREATE TABLE wp_postmeta (meta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, post_id bigint(20) unsigned NOT NULL DEFAULT 0,
  meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (meta_id), KEY post_id (post_id), KEY meta_key (meta_key(191)));
CREATE TABLE wp_terms (term_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, name varchar(200) NOT NULL DEFAULT '',
  slug varchar(200) NOT NULL DEFAULT '', term_group bigint(10) NOT NULL DEFAULT 0, PRIMARY KEY (term_id), KEY slug (slug(191)));
CREATE TABLE wp_term_taxonomy (term_taxonomy_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, term_id bigint(20) unsigned NOT NULL DEFAULT 0,
  taxonomy varchar(32) NOT NULL DEFAULT '', description longtext NOT NULL, parent bigint(20) unsigned NOT NULL DEFAULT 0,
  count bigint(20) NOT NULL DEFAULT 0, PRIMARY KEY (term_taxonomy_id), UNIQUE KEY term_id_taxonomy (term_id, taxonomy));
CREATE TABLE wp_term_relationships (object_id bigint(20) unsigned NOT NULL DEFAULT 0, term_taxonomy_id bigint(20) unsigned NOT NULL DEFAULT 0,
  term_order int(11) NOT NULL DEFAULT 0, PRIMARY KEY (object_id, term_taxonomy_id));
CREATE TABLE wp_options (option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, option_name varchar(191) NOT NULL DEFAULT '',
  option_value longtext NOT NULL, autoload varchar(20) NOT NULL DEFAULT 'yes', PRIMARY KEY (option_id), UNIQUE KEY option_name (option_name));
INSERT INTO wp_terms VALUES (1, 'Uncategorized', 'uncategorized', 0), (2, 'Main', 'main', 0),
  (3, 'twentytwentyfive', 'twentytwentyfive', 0), (4, 'header', 'header', 0);
INSERT INTO wp_term_taxonomy VALUES (1, 1, 'category', '', 0, 0), (2, 2, 'nav_menu', '', 0, 0),
  (3, 3, 'wp_theme', '', 0, 0), (4, 4, 'wp_template_part_area', '', 0, 0);
INSERT INTO wp_options VALUES (1, 'home', 'HOME', 'yes'), (2, 'siteurl', 'HOME', 'yes'), (3, 'blogname', 'Shop', 'yes');
`
const sqlText = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
const wpRow = (r) => {
  const row = {
    post_author: 0,
    post_content: '',
    post_excerpt: '',
    post_status: 'publish',
    comment_status: 'closed',
    ping_status: 'closed',
    post_password: '',
    to_ping: '',
    pinged: '',
    post_content_filtered: '',
    post_parent: 0,
    menu_order: 0,
    post_mime_type: '',
    comment_count: 0,
    ...r
  }
  row.post_date_gmt ??= row.post_date
  row.post_modified ??= row.post_date
  row.post_modified_gmt ??= row.post_date
  const cols = Object.keys(row)
  return `INSERT INTO wp_posts (${cols.join(', ')}) VALUES (${cols.map((c) => sqlText(row[c])).join(', ')});`
}
const menuMeta = (id, post, type, object, objectId, url) =>
  [
    ['_menu_item_type', type],
    ['_menu_item_menu_item_parent', '0'],
    ['_menu_item_object_id', String(objectId)],
    ['_menu_item_object', object],
    ['_menu_item_target', ''],
    ['_menu_item_classes', 'a:1:{i:0;s:0:"";}'],
    ['_menu_item_xfn', ''],
    ['_menu_item_url', url]
  ].map(([k, v], i) => `(${id + i}, ${post}, ${sqlText(k)}, ${sqlText(v)})`)
/** The records Tracy made on the copy (`by: 'copy'`, its numbers) or the push on the live site (+100). */
function made(by) {
  const live = by === 'live'
  const n = (id) => (live ? id + 100 : id)
  const at = live ? '2026-11-02 15:12:28' : '2026-11-02 15:12:26'
  const home = 'HOME'
  return [
    wpRow({
      ID: n(7),
      post_date: '2026-11-02 15:12:26',
      post_content: '<p>Open daily.</p>',
      post_title: 'Opening hours',
      post_name: 'opening-hours',
      guid: `${home}/opening-hours/`,
      post_type: 'page'
    }),
    wpRow({
      ID: n(10),
      post_date: at,
      post_content: ' ',
      post_title: '',
      post_name: String(n(10)),
      guid: `${home}/${n(10)}/`,
      menu_order: 1,
      post_type: 'nav_menu_item'
    }),
    wpRow({
      ID: n(12),
      post_date: at,
      post_title: 'Sale',
      post_name: 'sale',
      guid: `${home}/sale/`,
      menu_order: 2,
      post_type: 'nav_menu_item'
    }),
    wpRow({
      ID: n(13),
      post_date: at,
      post_content: '<!-- wp:site-title /-->',
      post_title: 'Header',
      post_name: 'header',
      guid: `${home}/header/`,
      post_type: 'wp_template_part'
    }),
    wpRow({
      ID: n(17),
      post_date: at,
      post_content: 'body { color: #123456; }',
      post_title: 'twentytwentyfive',
      post_name: 'twentytwentyfive',
      guid: `${home}/twentytwentyfive/`,
      post_type: 'custom_css'
    }),
    wpRow({
      ID: n(18),
      post_date: at,
      post_title: 'tracy-pixel',
      post_status: 'inherit',
      comment_status: 'open',
      post_name: 'tracy-pixel',
      guid: `${home}/tracy-pixel/`,
      post_type: 'attachment',
      post_mime_type: 'image/png'
    }),
    `INSERT INTO wp_postmeta VALUES ${[
      `(${n(13)}, ${n(7)}, 'subtitle', 'A subtitle')`,
      ...menuMeta(n(40), n(10), 'post_type', 'page', n(7), ''),
      ...menuMeta(n(30), n(12), 'custom', 'custom', n(12), `${home}/sale/`),
      `(${n(50)}, ${n(18)}, '_wp_attached_file', '2026/11/tracy-pixel.png')`,
      `(${n(51)}, ${n(18)}, '_wp_attachment_metadata', 'a:1:{s:4:"file";s:23:"2026/11/tracy-pixel.png";}')`
    ].join(', ')};`,
    `INSERT INTO wp_term_relationships VALUES (${n(10)}, 2, 0), (${n(12)}, 2, 0), (${n(13)}, 3, 0), (${n(13)}, 4, 0);`
  ].join('\n')
}
const SITE = (url, records) =>
  `${WP_TABLES}\nINSERT INTO wp_posts (ID, post_author, post_date, post_date_gmt, post_content, post_title, post_excerpt, to_ping, pinged, post_modified, post_modified_gmt, post_content_filtered, post_name, guid, post_type)
   VALUES (2, 1, '2026-01-01 00:00:00', '2026-01-01 00:00:00', '<p>Sample</p>', 'Sample Page', '', '', '', '2026-01-01 00:00:00', '2026-01-01 00:00:00', '', 'sample-page', 'HOME/?page_id=2', 'page');
   ${records}`.replaceAll('HOME', url)
// As lib/live_push.py `seeds` writes the creates of this push (test/live-push-changeset.test.mjs).
const W = ['guid', 'post_author', 'post_date', 'post_date_gmt', 'post_modified', 'post_modified_gmt']
const menuSeeds = (id) => [
  {
    table: 'posts',
    match: { ID: id },
    columns: ['post_title', 'menu_order'],
    create: true,
    entity: 'posts',
    id,
    stamps: [...W, 'post_name'].sort()
  },
  ...[
    '_menu_item_type',
    '_menu_item_object',
    '_menu_item_object_id',
    '_menu_item_url',
    '_menu_item_menu_item_parent'
  ].map((meta_key) => ({
    table: 'postmeta',
    match: { post_id: id, meta_key },
    columns: ['meta_value'],
    align: { entity: 'postmeta', match: { post_id: id, meta_key } }
  }))
]
const WP_PUSHED = [
  {
    table: 'posts',
    match: { ID: 7 },
    create: true,
    entity: 'posts',
    id: 7,
    columns: [
      'post_title',
      'post_content',
      'post_excerpt',
      'post_status',
      'post_name',
      'post_parent',
      'menu_order',
      'post_date',
      'post_type'
    ],
    stamps: ['guid', 'post_author', 'post_date_gmt', 'post_modified', 'post_modified_gmt']
  },
  {
    table: 'postmeta',
    match: { post_id: 7, meta_key: 'subtitle' },
    columns: ['meta_value'],
    align: { entity: 'postmeta', match: { post_id: 7, meta_key: 'subtitle' } }
  },
  ...menuSeeds(10),
  ...menuSeeds(12),
  {
    table: 'posts',
    match: { ID: 13 },
    columns: ['post_content', 'post_title'],
    create: true,
    entity: 'posts',
    id: 13,
    stamps: W
  },
  {
    table: 'posts',
    match: { ID: 17 },
    create: true,
    entity: 'posts',
    id: 17,
    stamps: W,
    columns: ['post_type', 'post_name', 'post_title', 'post_status', 'post_content']
  },
  { table: 'posts', match: { ID: 18 }, columns: [], create: true, entity: 'posts', id: 18, stamps: W }
]
const WP_MAP = { posts: { 107: 7, 110: 10, 112: 12, 113: 13, 117: 17, 118: 18 } }

function wpMerge(names, pushed, map = WP_MAP) {
  const file = join(root, `${names.ours}-${names.theirs}-map.json`)
  writeFileSync(file, JSON.stringify(map))
  const args = [
    ENGINE,
    'db',
    '--base-schema',
    names.base,
    '--ours-schema',
    names.ours,
    '--theirs-schema',
    names.theirs,
    '--work-schema',
    `${names.theirs}_work`,
    '--platform',
    'wordpress',
    '--prefix',
    'wp_',
    '--prefer',
    'ours',
    '--id-map',
    file
  ]
  if (pushed) {
    writeFileSync(`${file}.pushed`, JSON.stringify({ records: pushed }))
    args.push('--pushed', `${file}.pushed`)
  }
  const r = spawnSync('python3', args, {
    encoding: 'utf8',
    env: { ...process.env, TRACY_SYNC_SQL: JSON.stringify(CLIENT) }
  })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  return JSON.parse(r.stdout.trim().split('\n').at(-1))
}
const schema = (name, script) => {
  sql(`DROP DATABASE IF EXISTS \`${name}\`; CREATE DATABASE \`${name}\`;`)
  sql(script, name)
}

test(
  'WordPress: what a push made and the customer then deleted for good on the live site goes from the copy too — page, menu items, template part, Additional CSS, picture (#223)',
  opts,
  () => {
    // The sync right after the push: the live site holds the push's records, stamped its own way.
    schema('wd_base', SITE(LIVE, ''))
    schema('wd_ours', SITE(COPY, made('copy')))
    schema('wd_theirs', SITE(LIVE, made('live')))
    const settle = wpMerge({ base: 'wd_base', ours: 'wd_ours', theirs: 'wd_theirs' }, WP_PUSHED)
    assert.equal(settle.ok, true)
    assert.deepEqual(settle.kept, [], JSON.stringify(settle.kept))
    assert.deepEqual(settle.held, [])
    assert.deepEqual(
      rows('SELECT COUNT(*) FROM wp_posts', 'wd_ours'),
      [['7']],
      'no record of the push came back a second time'
    )
    // The live site's stamps came over: the copy's rows read as the live site's now.
    assert.deepEqual(rows('SELECT guid FROM wp_posts WHERE ID = 7', 'wd_ours'), [[`${LIVE}/opening-hours/`]])
    assert.deepEqual(
      rows(
        "SELECT meta_value FROM wp_postmeta WHERE post_id = 12 AND meta_key = '_menu_item_object_id'",
        'wd_ours'
      ),
      [['12']]
    )

    // The customer deletes every one of them for good on the live site (emptying the trash does the
    // same): rows, meta and relationships. The next sync reads the live site again.
    schema('wd_base2', SITE(LIVE, made('live')))
    schema('wd_theirs2', SITE(LIVE, ''))
    const after = wpMerge({ base: 'wd_base2', ours: 'wd_ours', theirs: 'wd_theirs2' }, null, {
      ...settle.idMap,
      posts: { ...WP_MAP.posts, ...settle.idMap?.posts }
    })
    assert.equal(after.ok, true)
    assert.deepEqual(after.kept, [], JSON.stringify(after.kept))
    assert.deepEqual(after.held, [])
    assert.deepEqual(rows('SELECT ID FROM wp_posts ORDER BY ID', 'wd_ours'), [['2']])
    assert.deepEqual(rows('SELECT COUNT(*) FROM wp_postmeta', 'wd_ours'), [['0']])
    assert.deepEqual(rows('SELECT COUNT(*) FROM wp_term_relationships', 'wd_ours'), [['0']])
  }
)

// ── #307: a record whose live delete the merge took leaves the id map and its copy-only rows ──────
function joomlaMerge(names, map) {
  const file = join(root, `${names.ours}-map.json`)
  writeFileSync(file, JSON.stringify(map))
  const r = spawnSync(
    'python3',
    [
      ENGINE,
      'db',
      '--base-schema',
      names.base,
      '--ours-schema',
      names.ours,
      '--theirs-schema',
      names.theirs,
      '--work-schema',
      `${names.ours}_work`,
      '--platform',
      'joomla',
      '--prefix',
      'jos_',
      '--prefer',
      'ours',
      '--id-map',
      file
    ],
    { encoding: 'utf8', env: { ...process.env, TRACY_SYNC_SQL: JSON.stringify(CLIENT) } }
  )
  assert.equal(r.status, 0, r.stderr + r.stdout)
  return JSON.parse(r.stdout.trim().split('\n').at(-1))
}
const J_TABLES = `
CREATE TABLE jos_content (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, asset_id INT UNSIGNED DEFAULT 0,
  title VARCHAR(255), alias VARCHAR(400), introtext MEDIUMTEXT, state TINYINT DEFAULT 1, catid INT UNSIGNED DEFAULT 2,
  modified DATETIME);
CREATE TABLE jos_history (version_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, item_id VARCHAR(50) NOT NULL,
  version_note VARCHAR(255) DEFAULT '', save_date DATETIME, editor_user_id INT UNSIGNED DEFAULT 0, character_count INT DEFAULT 0,
  sha1_hash VARCHAR(50) DEFAULT '', version_data MEDIUMTEXT, keep_forever TINYINT DEFAULT 0);
CREATE TABLE jos_workflow_associations (item_id INT UNSIGNED NOT NULL, stage_id INT UNSIGNED NOT NULL,
  extension VARCHAR(50) NOT NULL, PRIMARY KEY (item_id, extension));`
const ARTICLE_1 = `INSERT INTO jos_content VALUES (1, 0, 'Tracy news', 'tracy-news', 'new by Tracy', 1, 2, '2026-11-02 10:00:00');
  INSERT INTO jos_workflow_associations VALUES (1, 1, 'com_content.article');`
const autoIncrement = (db, table) =>
  Number(
    rows(
      `SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA='${db}' AND TABLE_NAME='${table}'`
    )[0][0]
  )

test(
  'Joomla: an article a push made and the live site deleted for good leaves the id map, keeps its number used, and takes its copy-only versions along (#307)',
  opts,
  () => {
    // The base is the read after the push (the article there); the copy has it with the versions
    // Tracy's own saves made; the live site deleted it with its rows, by hand.
    schema('jd_base', `${J_TABLES} ${ARTICLE_1}`)
    schema(
      'jd_ours',
      `${J_TABLES} ${ARTICLE_1}
       INSERT INTO jos_history (version_id, item_id, save_date, version_data) VALUES
         (5, 'com_content.article.1', '2026-11-02 09:00:00', '{}'), (6, 'com_content.article.1', '2026-11-02 10:00:00', '{}');`
    )
    schema('jd_theirs', J_TABLES)
    assert.equal(autoIncrement('jd_ours', 'jos_content'), 2)
    const answer = joomlaMerge(
      { base: 'jd_base', ours: 'jd_ours', theirs: 'jd_theirs' },
      { content: { 1: 1 } }
    )
    assert.equal(answer.ok, true)
    assert.deepEqual(answer.kept, [], JSON.stringify(answer.kept))
    assert.equal(
      answer.tables.jos_content,
      'from-theirs',
      'the whole table is the live one, as in the report'
    )
    assert.deepEqual(rows('SELECT COUNT(*) FROM jos_content', 'jd_ours'), [['0']])
    // The map no longer names the deleted article: a new copy article is the copy's own.
    assert.equal(answer.idMap.content, undefined, JSON.stringify(answer.idMap))
    assert.deepEqual(answer.idMapForgotten, [{ table: 'content', live: 1, copy: 1 }])
    // Its number stays used: the copy's next article is 2, never 1 again.
    assert.ok(autoIncrement('jd_ours', 'jos_content') >= 2, 'AUTO_INCREMENT went back')
    // The versions Tracy's saves made went with it.
    assert.deepEqual(rows('SELECT COUNT(*) FROM jos_history', 'jd_ours'), [['0']])
    assert.equal(answer.counts.orphansRemoved, 2)
  }
)

test(
  'Joomla: an article the merge keeps (Tracy changed it, the live site deleted it) keeps its versions; its live number leaves the id map (#307)',
  opts,
  () => {
    schema('jk_base', `${J_TABLES} ${ARTICLE_1}`)
    schema(
      'jk_ours',
      `${J_TABLES} ${ARTICLE_1}
     UPDATE jos_content SET introtext = 'edited by Tracy' WHERE id = 1;
     INSERT INTO jos_history (version_id, item_id, save_date, version_data) VALUES (5, 'com_content.article.1', '2026-11-02 11:00:00', '{}');`
    )
    schema('jk_theirs', J_TABLES)
    const answer = joomlaMerge(
      { base: 'jk_base', ours: 'jk_ours', theirs: 'jk_theirs' },
      { content: { 1: 1 } }
    )
    assert.equal(answer.ok, true)
    assert.ok(
      answer.kept.some((k) => k.reason === 'delete-modify' && k.table === 'jos_content'),
      JSON.stringify(answer.kept)
    )
    // The live site has no record of it any more: Sync to live holds it by its kept place, never
    // again refuses it as a live record.
    assert.equal(answer.idMap.content, undefined)
    assert.deepEqual(answer.idMapForgotten, [{ table: 'content', live: 1, copy: 1 }])
    assert.deepEqual(rows('SELECT introtext FROM jos_content', 'jk_ours'), [['edited by Tracy']])
    assert.deepEqual(rows('SELECT COUNT(*) FROM jos_history', 'jk_ours'), [['1']])
    // The rows the live site deleted with it stay with the kept article (`dependents`).
    assert.deepEqual(rows('SELECT item_id FROM jos_workflow_associations', 'jk_ours'), [['1']])
  }
)

test(
  'WordPress: a picture Tracy retitled and the live site deleted for good is kept with its meta, its terms and its files; a deleted post takes its copy-only revision and meta along (#223, #307)',
  opts,
  () => {
    const picture = (title) =>
      `${wpRow({
        ID: 18,
        post_date: '2026-11-02 15:12:26',
        post_title: title,
        post_status: 'inherit',
        comment_status: 'open',
        post_name: 'rt-pic',
        guid: `${LIVE}/rt-pic/`,
        post_type: 'attachment',
        post_mime_type: 'image/png'
      })}
       INSERT INTO wp_postmeta VALUES (50, 18, '_wp_attached_file', '2026/11/rt-pic.png'),
         (51, 18, '_wp_attachment_metadata', 'a:3:{s:4:"file";s:18:"2026/11/rt-pic.png";s:5:"sizes";a:1:{s:9:"thumbnail";a:1:{s:4:"file";s:18:"rt-pic-150x150.png";}}s:14:"original_image";s:15:"rt-pic-full.png";}');`
    const post = `${wpRow({
      ID: 30,
      post_date: '2026-11-01 10:00:00',
      post_content: '<p>Old</p>',
      post_title: 'Old news',
      post_name: 'old-news',
      guid: `${LIVE}/old-news/`,
      post_type: 'post'
    })}
       INSERT INTO wp_postmeta VALUES (60, 30, 'subtitle', 'A subtitle'),
         (62, 30, '_pingme', '1'), (63, 30, '_encloseme', '1');
       INSERT INTO wp_term_relationships VALUES (30, 1, 0);`
    schema('wk_base', SITE(LIVE, `${picture('rt-pic')} ${post}`))
    schema(
      'wk_ours',
      SITE(
        COPY,
        `${picture('RT picture')} ${post}
         ${wpRow({
           ID: 31,
           post_date: '2026-11-02 12:00:00',
           post_content: '<p>Old</p>',
           post_title: 'Old news',
           post_name: '30-revision-v1',
           guid: 'HOME/30-revision-v1/',
           post_type: 'revision',
           post_status: 'inherit',
           post_parent: 30
         })}
         INSERT INTO wp_postmeta VALUES (61, 30, '_edit_last', '1');`
      )
    )
    schema('wk_theirs', SITE(LIVE, ''))
    const answer = wpMerge({ base: 'wk_base', ours: 'wk_ours', theirs: 'wk_theirs' }, null, {})
    assert.equal(answer.ok, true)
    // The picture: Tracy changed its title, so it is kept, whole.
    assert.deepEqual(
      answer.kept.map((k) => [k.table, k.reason]),
      [['wp_posts', 'delete-modify']],
      JSON.stringify(answer.kept)
    )
    assert.deepEqual(rows('SELECT post_title FROM wp_posts WHERE ID = 18', 'wk_ours'), [['RT picture']])
    assert.deepEqual(
      rows('SELECT meta_key FROM wp_postmeta WHERE post_id = 18 ORDER BY meta_id', 'wk_ours'),
      [['_wp_attached_file'], ['_wp_attachment_metadata']]
    )
    assert.deepEqual(answer.keepFiles, [
      'wp-content/uploads/2026/11/rt-pic-150x150.png',
      'wp-content/uploads/2026/11/rt-pic-full.png',
      'wp-content/uploads/2026/11/rt-pic.png'
    ])
    // The post nobody changed goes, with its terms and meta, and with the revision and meta only the
    // copy had.
    assert.deepEqual(rows('SELECT ID FROM wp_posts WHERE ID IN (30, 31)', 'wk_ours'), [])
    assert.deepEqual(rows('SELECT COUNT(*) FROM wp_postmeta WHERE post_id = 30', 'wk_ours'), [['0']])
    assert.deepEqual(rows('SELECT COUNT(*) FROM wp_term_relationships WHERE object_id = 30', 'wk_ours'), [
      ['0']
    ])
    assert.equal(answer.counts.orphansRemoved, 4)
  }
)

test(
  "Joomla: a site already stuck — a new copy article under a deleted one's number — is put right at its next sync (#307)",
  opts,
  () => {
    // The delete was taken by an older sync: the base no longer has article 1, and the copy has a new
    // article that got number 1 again, which the map still names as the live site's.
    schema('js_base', J_TABLES)
    schema(
      'js_ours',
      `${J_TABLES} INSERT INTO jos_content VALUES (1, 0, 'Tracy news 2', 'tracy-news-2', 'again', 1, 2, '2026-11-03 09:00:00');`
    )
    schema('js_theirs', J_TABLES)
    const answer = joomlaMerge(
      { base: 'js_base', ours: 'js_ours', theirs: 'js_theirs' },
      { content: { 1: 1 } }
    )
    assert.equal(answer.ok, true)
    assert.equal(answer.idMap.content, undefined, JSON.stringify(answer.idMap))
    assert.deepEqual(
      rows('SELECT title FROM jos_content', 'js_ours'),
      [['Tracy news 2']],
      'the new article stays'
    )
  }
)

for (const high of [false, true]) {
  test(
    `Joomla: repeated push with reversed live ids syncs without counter pollution (existing high ids: ${high}, #536)`,
    opts,
    () => {
      const offset = high ? 2_000_000_000 : 0
      schema('repeat_base', `${J_TABLES} ${ARTICLE_1}`)
      schema('repeat_ours', `${J_TABLES} ${ARTICLE_1}`)
      schema('repeat_theirs', `${J_TABLES} ${ARTICLE_1}`)
      const first = joomlaMerge(
        { base: 'repeat_base', ours: 'repeat_ours', theirs: 'repeat_theirs' },
        { content: { 1: 1 } }
      )
      assert.equal(first.ok, true)
      assert.equal(autoIncrement('repeat_ours', 'jos_content'), 2)
      for (const [id, title] of [
        [2, 'D2'],
        [3, 'G1']
      ]) {
        sql(`INSERT INTO jos_content (id, title) VALUES (${offset + id}, '${title}');`, 'repeat_ours')
        sql(`INSERT INTO jos_content (id, title) VALUES (${5 - id}, '${title}');`, 'repeat_theirs')
      }
      const map = { content: { 1: 1, 2: offset + 3, 3: offset + 2 } }
      const answer = joomlaMerge({ base: 'repeat_base', ours: 'repeat_ours', theirs: 'repeat_theirs' }, map)
      assert.equal(answer.ok, true)
      assert.deepEqual(rows('SELECT id, title FROM jos_content ORDER BY id', 'repeat_ours'), [
        ['1', 'Tracy news'],
        [String(offset + 2), 'D2'],
        [String(offset + 3), 'G1']
      ])
      assert.equal(autoIncrement('repeat_ours', 'jos_content'), offset + 4)
    }
  )
}

for (const high of [false, true]) {
  test(
    `WordPress: reversed pushed post ids sync with references (existing high ids: ${high}, #536)`,
    opts,
    () => {
      const offset = high ? 2_000_000_000 : 0
      schema('wr_base', SITE(LIVE, ''))
      const post = (id, title) =>
        wpRow({
          ID: id,
          post_title: title,
          post_name: title.toLowerCase(),
          post_type: 'post',
          post_date: '2026-11-10 10:00:00'
        })
      schema(
        'wr_ours',
        SITE(
          COPY,
          `${post(offset + 700, 'D2')} ${post(offset + 701, 'G1')}
      INSERT INTO wp_postmeta VALUES (900, ${offset + 700}, 'subtitle', 'D2 meta');`
        )
      )
      schema(
        'wr_theirs',
        SITE(
          LIVE,
          `${post(701, 'D2')} ${post(700, 'G1')}
      INSERT INTO wp_postmeta VALUES (900, 701, 'subtitle', 'D2 meta');`
        )
      )
      const answer = wpMerge({ base: 'wr_base', ours: 'wr_ours', theirs: 'wr_theirs' }, null, {
        posts: { 701: offset + 700, 700: offset + 701 }
      })
      assert.equal(answer.ok, true)
      assert.deepEqual(rows(`SELECT ID, post_title FROM wp_posts WHERE ID >= 700 ORDER BY ID`, 'wr_ours'), [
        [String(offset + 700), 'D2'],
        [String(offset + 701), 'G1']
      ])
      assert.deepEqual(rows("SELECT post_id FROM wp_postmeta WHERE meta_key = 'subtitle'", 'wr_ours'), [
        [String(offset + 700)]
      ])
      assert.equal(autoIncrement('wr_ours', 'wp_posts'), offset + 702)
    }
  )
}
