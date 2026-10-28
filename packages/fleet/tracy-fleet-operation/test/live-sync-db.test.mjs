/**
 * "Sync from live", the database half (`scripts/lib/live_sync.py db`, plan
 * tasks/ke-hoach-dong-bo-tu-live.md §3.3): three schemas — the live site as last read (base), a frozen
 * copy of the copy's database (ours, merged in place), the live site as read now (theirs) — merged row
 * by row and column by column with the Joomla adapter.
 *
 * Needs a real MariaDB (the merge is SQL: CHECKSUM TABLE, `<=>`, REPLACE, unique keys): the test starts
 * `mariadb:11` in a container of its own, removed at the end, and is SKIPPED where no docker daemon
 * answers (the CI check runners have none).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-sync-db.test.mjs
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
const DB_CONTAINER = `tracy-live-sync-test-db-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the merge needs a real MariaDB' }
const CLIENT = [REAL_DOCKER, 'exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot']

const root = mkdtempSync(join(tmpdir(), 'live-sync-db-'))
after(() => rmSync(root, { recursive: true, force: true }))

const sql = (script) =>
  execFileSync(CLIENT[0], [...CLIENT.slice(1), '-N', '-B'], { input: script, encoding: 'utf8' }).trim()
const rows = (query) =>
  sql(query)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))

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
  // Over TCP: the image's first-boot server listens on the socket only and then restarts.
  for (let i = 0; i < 240; i++) {
    const ok = spawnSync(
      REAL_DOCKER,
      ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-h127.0.0.1', '-e', 'SELECT 1'],
      {
        stdio: 'ignore'
      }
    )
    if (ok.status === 0) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('test MariaDB never answered')
})
after(() => {
  if (DOCKER_UP) spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
})

const TABLES = `
CREATE TABLE jos_content (id INT PRIMARY KEY, title VARCHAR(255), introtext MEDIUMTEXT, hits INT, modified DATETIME NULL);
CREATE TABLE jos_extensions (extension_id INT PRIMARY KEY, element VARCHAR(100), params TEXT);
CREATE TABLE jos_menu (id INT PRIMARY KEY, parent_id INT, lft INT, rgt INT, level INT, path VARCHAR(400), alias VARCHAR(100), title VARCHAR(255));
CREATE TABLE jos_kv (id INT PRIMARY KEY, name VARCHAR(100), value TEXT, UNIQUE KEY name (name));
CREATE TABLE jos_session (session_id VARBINARY(192) PRIMARY KEY, data TEXT);
CREATE TABLE jos_claudecowork_content_identity (id INT PRIMARY KEY, uid CHAR(36));
CREATE TABLE jos_action_logs (id INT PRIMARY KEY, message TEXT);
CREATE TABLE jos_scheduler_logs (id INT PRIMARY KEY, taskname VARCHAR(100));
CREATE TABLE jos_scheduler_tasks (id INT PRIMARY KEY, title VARCHAR(100), last_execution DATETIME NULL, times_executed INT);
CREATE TABLE jos_update_sites (update_site_id INT PRIMARY KEY, name VARCHAR(100), last_check_timestamp BIGINT);
CREATE TABLE jos_categories (id INT PRIMARY KEY, title VARCHAR(255));
CREATE TABLE jos_nopk (a INT, b INT);
CREATE TABLE jos_users (id INT PRIMARY KEY, name VARCHAR(100));
INSERT INTO jos_content VALUES (1,'A','a-intro',10,'2026-01-01'),(2,'B','b',5,'2026-01-01'),(3,'C','c',0,'2026-01-01'),(4,'D','d',0,'2026-01-01');
INSERT INTO jos_extensions VALUES (100,'com_claudecowork','{"token":"T"}'),(101,'com_content','{}');
INSERT INTO jos_menu VALUES (1,0,0,5,0,'','root','Root'),(2,1,1,2,1,'home','home','Home'),(3,1,3,4,1,'about','about','About');
INSERT INTO jos_kv VALUES (1,'a','1'),(2,'b','2');
INSERT INTO jos_session VALUES ('s1','x');
INSERT INTO jos_claudecowork_content_identity VALUES (1,'u-1');
INSERT INTO jos_action_logs VALUES (1,'m1'),(2,'m2');
INSERT INTO jos_scheduler_logs VALUES (1,'run 1');
INSERT INTO jos_scheduler_tasks VALUES (1,'Rotate logs','2026-01-01 00:00:00',1);
INSERT INTO jos_update_sites VALUES (1,'Joomla Core',100);
INSERT INTO jos_categories VALUES (1,'Cat');
INSERT INTO jos_nopk VALUES (1,1);
INSERT INTO jos_users VALUES (1,'admin');
`

const OURS = `
UPDATE jos_content SET introtext='a-intro TRACY', hits=11, modified='2026-02-01' WHERE id=1;
UPDATE jos_content SET title='B-ours' WHERE id=2;
DELETE FROM jos_content WHERE id=3;
INSERT INTO jos_content VALUES (10,'Ours new','o',0,NULL);
UPDATE jos_extensions SET params='{"token":"COPY"}' WHERE extension_id=100;
UPDATE jos_menu SET title='About us' WHERE id=3;
INSERT INTO jos_kv VALUES (6,'x','ours');
UPDATE jos_session SET data='y';
INSERT INTO jos_claudecowork_content_identity VALUES (2,'u-2');
INSERT INTO jos_action_logs VALUES (3,'ours log');
INSERT INTO jos_scheduler_logs VALUES (2,'ours run');
UPDATE jos_scheduler_tasks SET last_execution='2026-02-01 00:00:00', times_executed=2;
UPDATE jos_update_sites SET last_check_timestamp=200;
INSERT INTO jos_nopk VALUES (2,2);
`

const THEIRS = `
UPDATE jos_content SET title='A-live', hits=50, modified='2026-03-01' WHERE id=1;
UPDATE jos_content SET title='B-live', introtext='B' WHERE id=2;
UPDATE jos_content SET introtext='c-live' WHERE id=3;
DELETE FROM jos_content WHERE id=4;
INSERT INTO jos_content VALUES (10,'Live new','l',0,NULL),(11,'Live only','lo',0,NULL);
UPDATE jos_extensions SET params='{"token":"LIVE2"}' WHERE extension_id=100;
UPDATE jos_extensions SET params='{"x":1}' WHERE extension_id=101;
UPDATE jos_menu SET rgt=7 WHERE id=1;
INSERT INTO jos_menu VALUES (4,1,5,6,1,'contact','contact','Contact');
INSERT INTO jos_kv VALUES (5,'x','live');
UPDATE jos_session SET data='z';
UPDATE jos_claudecowork_content_identity SET uid='u-live';
INSERT INTO jos_action_logs VALUES (3,'live log'),(4,'live 4');
INSERT INTO jos_scheduler_logs VALUES (2,'live run'),(3,'live run 3');
UPDATE jos_scheduler_tasks SET last_execution='2026-03-01 00:00:00', times_executed=5;
UPDATE jos_update_sites SET last_check_timestamp=300;
UPDATE jos_categories SET title='Cat live'; INSERT INTO jos_categories VALUES (2,'New cat');
INSERT INTO jos_nopk VALUES (3,3);
CREATE TABLE jos_newext (id INT PRIMARY KEY, v TEXT); INSERT INTO jos_newext VALUES (1,'v');
ALTER TABLE jos_users MODIFY name VARCHAR(100) COLLATE utf8mb4_bin; UPDATE jos_users SET name='Admin';
`

function stage() {
  sql(
    ['sb', 'sm', 'st']
      .map((s) => `DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${TABLES}`)
      .join('\n') + `\nUSE sm; ${OURS}\nUSE st; ${THEIRS}`
  )
}

function merge(decisions, prefer) {
  const args = [
    ENGINE,
    'db',
    '--base-schema',
    'sb',
    '--ours-schema',
    'sm',
    '--theirs-schema',
    'st',
    '--work-schema',
    'sw',
    '--platform',
    'joomla',
    '--prefix',
    'jos_'
  ]
  if (prefer) args.push('--prefer', prefer)
  if (decisions) {
    const file = join(root, 'decisions.json')
    writeFileSync(file, JSON.stringify(decisions))
    args.push('--decisions', file)
  }
  const done = spawnSync('python3', args, {
    encoding: 'utf8',
    env: { ...process.env, TRACY_SYNC_SQL: JSON.stringify(CLIENT) }
  })
  assert.equal(done.status, 0, done.stderr)
  return JSON.parse(done.stdout.trim().split('\n').pop())
}

test(
  'the live site’s changes come over, the copy’s stay, and every clash is a conflict, not a guess',
  opts,
  () => {
    stage()
    const answer = merge()

    assert.deepEqual(rows('SELECT id, title, introtext, hits, modified FROM sm.jos_content ORDER BY id'), [
      ['1', 'A-live', 'a-intro TRACY', '50', '2026-03-01 00:00:00'],
      ['2', 'B-ours', 'B', '5', '2026-01-01 00:00:00'],
      ['10', 'Ours new', 'o', '0', 'NULL'],
      ['11', 'Live only', 'lo', '0', 'NULL'],
      ['12', 'Live new', 'l', '0', 'NULL']
    ])
    assert.deepEqual(rows('SELECT extension_id, params FROM sm.jos_extensions ORDER BY 1'), [
      ['100', '{"token":"COPY"}'],
      ['101', '{"x":1}']
    ])
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_menu ORDER BY id'), [
      ['1', 'Root'],
      ['2', 'Home'],
      ['3', 'About us'],
      ['4', 'Contact']
    ])
    assert.deepEqual(rows('SELECT id, name, value FROM sm.jos_kv ORDER BY id'), [
      ['1', 'a', '1'],
      ['2', 'b', '2'],
      ['6', 'x', 'ours']
    ])
    assert.deepEqual(rows('SELECT data FROM sm.jos_session'), [['y']])
    assert.deepEqual(rows('SELECT id, uid FROM sm.jos_claudecowork_content_identity ORDER BY id'), [
      ['1', 'u-1'],
      ['2', 'u-2']
    ])
    assert.deepEqual(rows('SELECT id, message FROM sm.jos_action_logs ORDER BY id'), [
      ['1', 'm1'],
      ['2', 'm2'],
      ['3', 'ours log'],
      ['4', 'live 4']
    ])
    // Joomla 5's scheduler logs on both sites under one id: the copy's row stays, never held.
    assert.deepEqual(rows('SELECT id, taskname FROM sm.jos_scheduler_logs ORDER BY id'), [
      ['1', 'run 1'],
      ['2', 'ours run'],
      ['3', 'live run 3']
    ])
    // A task's run stamps, moved on both sites: the live site's, and no conflict.
    assert.deepEqual(rows('SELECT last_execution, times_executed FROM sm.jos_scheduler_tasks'), [
      ['2026-03-01 00:00:00', '5']
    ])
    // Each site's own update check, stamped on both: the live site's stamp, and no conflict.
    assert.deepEqual(rows('SELECT last_check_timestamp FROM sm.jos_update_sites'), [['300']])
    assert.equal(
      answer.conflicts.some((c) => ['jos_scheduler_tasks', 'jos_update_sites'].includes(c.table)),
      false,
      'no clash is named on a stamp'
    )
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_categories ORDER BY id'), [
      ['1', 'Cat live'],
      ['2', 'New cat']
    ])
    assert.deepEqual(rows('SELECT a, b FROM sm.jos_nopk ORDER BY a'), [
      ['1', '1'],
      ['2', '2']
    ])
    assert.deepEqual(rows('SELECT id, v FROM sm.jos_newext'), [['1', 'v']])

    assert.deepEqual(
      answer.conflicts.map((c) => [c.id, c.kind, c.reason ?? c.column]),
      [
        ['db:jos_content:["2"]:title', 'column', 'title'],
        ['db:jos_content:["3"]', 'row', 'delete-modify'],
        ['db:jos_kv:["5"]', 'row', 'unique-key'],
        ['db:jos_nopk', 'table', 'no-primary-key']
      ]
    )
    const title = answer.conflicts[0]
    assert.deepEqual(title.key, { id: '2' })
    assert.deepEqual(title.values, {
      base: { title: { text: 'B' } },
      ours: { title: { text: 'B-ours' } },
      theirs: { title: { text: 'B-live' } }
    })
    const deleted = answer.conflicts[1]
    assert.equal(deleted.values.ours, null, 'the copy deleted the row')
    assert.equal(deleted.values.theirs.introtext.text, 'c-live')
    assert.deepEqual(answer.rebuild, ['jos_menu'])
    // Both created article 10: the live site's comes over as 12 (above every number either side uses).
    assert.deepEqual(answer.renumbered, [{ table: 'content', live: 10, copy: 12, why: 'created-on-both' }])
    assert.deepEqual(answer.idMap, { content: { 10: 12 } })
    assert.equal(
      answer.counts.skipped,
      2,
      'the new action_logs rows under id 3 and scheduler_logs under id 2'
    )
    assert.equal(answer.tables.jos_categories, 'from-theirs')
    assert.equal(answer.tables.jos_newext, 'added')
    assert.equal(
      answer.tables.jos_users,
      'from-theirs',
      'a new collation on the live site comes over with its table'
    )
    assert.deepEqual(rows('SELECT name FROM sm.jos_users'), [['Admin']])
    assert.equal(answer.tables.jos_menu, 'merged')
    assert.equal(answer.tables.jos_kv, 'conflict')
    assert.equal(answer.tables.jos_session, 'ours-kept')
    assert.equal(rows("SHOW DATABASES LIKE 'sw'").length, 0, 'the work schema is dropped')
  }
)

test('decisions pick the live site’s side, one conflict at a time', opts, () => {
  stage()
  const answer = merge({
    'db:jos_content:["2"]:title': 'theirs',
    'db:jos_content:["3"]': 'theirs',
    'db:jos_kv:["5"]': 'theirs',
    'db:jos_nopk': 'theirs',
    'db:jos_content:["99"]': 'theirs'
  })
  assert.deepEqual(answer.conflicts, [])
  assert.deepEqual(rows('SELECT id, title, introtext FROM sm.jos_content ORDER BY id'), [
    ['1', 'A-live', 'a-intro TRACY'],
    ['2', 'B-live', 'B'],
    ['3', 'C', 'c-live'],
    ['10', 'Ours new', 'o'],
    ['11', 'Live only', 'lo'],
    ['12', 'Live new', 'l']
  ])
  assert.deepEqual(rows('SELECT id, name, value FROM sm.jos_kv ORDER BY id'), [
    ['1', 'a', '1'],
    ['2', 'b', '2'],
    ['5', 'x', 'live']
  ])
  assert.deepEqual(rows('SELECT a, b FROM sm.jos_nopk ORDER BY a'), [
    ['1', '1'],
    ['3', '3']
  ])
})

test('“ours” decisions keep the copy and close the conflict', opts, () => {
  stage()
  const answer = merge({ 'db:jos_content:["2"]:title': 'ours', 'db:jos_nopk': 'ours' })
  assert.deepEqual(
    answer.conflicts.map((c) => c.id),
    ['db:jos_content:["3"]', 'db:jos_kv:["5"]']
  )
  assert.deepEqual(rows('SELECT title FROM sm.jos_content WHERE id=2'), [['B-ours']])
})

test(
  '--prefer ours: every clash keeps the copy and is listed as kept, with what the live site had',
  opts,
  () => {
    stage()
    const answer = merge(null, 'ours')
    assert.deepEqual(answer.conflicts, [])
    assert.deepEqual(
      answer.kept.map((c) => c.id),
      ['db:jos_content:["2"]:title', 'db:jos_content:["3"]', 'db:jos_kv:["5"]', 'db:jos_nopk']
    )
    assert.deepEqual(answer.kept[0].values.theirs, { title: { text: 'B-live' } })
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_content ORDER BY id'), [
      ['1', 'A-live'],
      ['2', 'B-ours'],
      ['10', 'Ours new'],
      ['11', 'Live only'],
      ['12', 'Live new']
    ])
  }
)

test(
  'Tracy’s table copies (`_tracy_snap_*`, `_tracy_trash_*`) are no table of the site: never compared, carried or reported (#1649)',
  opts,
  () => {
    stage()
    const plain = merge(null, 'ours')
    stage()
    sql(`
      USE sm; CREATE TABLE _tracy_snap_20261023000000__jos_content LIKE jos_content;
        INSERT INTO _tracy_snap_20261023000000__jos_content SELECT * FROM jos_content;
      USE st; CREATE TABLE _tracy_snap_20260901000000__jos_menu LIKE jos_menu;
        INSERT INTO _tracy_snap_20260901000000__jos_menu SELECT * FROM jos_menu;
        CREATE TABLE _tracy_trash_20260901000000__jos_old (id INT PRIMARY KEY); INSERT INTO _tracy_trash_20260901000000__jos_old VALUES (1);
      USE sb; CREATE TABLE _tracy_snap_20260801000000__jos_kv (id INT PRIMARY KEY);
    `)
    const answer = merge(null, 'ours')
    assert.deepEqual(
      Object.keys(answer.tables).filter((t) => t.startsWith('_tracy_')),
      [],
      'not one is reported'
    )
    assert.deepEqual(answer.counts, plain.counts, 'nor counted')
    assert.deepEqual(answer.kept, plain.kept)
    // The copy's own snapshot stays as it was; the live site's copies never reach the copy.
    assert.equal(rows('SELECT COUNT(*) FROM sm._tracy_snap_20261023000000__jos_content')[0][0], '4')
    assert.deepEqual(rows("SHOW TABLES FROM sm LIKE '\\_tracy\\_%'"), [
      ['_tracy_snap_20261023000000__jos_content']
    ])

    // Nor do they count as the copy moving while it syncs (`checksums`, what `apply` compares).
    const checksums = () =>
      spawnSync(
        'python3',
        [ENGINE, 'checksums', '--schema', 'sm', '--platform', 'joomla', '--prefix', 'jos_'],
        { encoding: 'utf8', env: { ...process.env, TRACY_SYNC_SQL: JSON.stringify(CLIENT) } }
      ).stdout
    const before = checksums()
    assert.doesNotMatch(before, /_tracy_/)
    sql(
      'USE sm; CREATE TABLE _tracy_snap_20261023000001__jos_kv LIKE jos_kv; INSERT INTO _tracy_snap_20261023000001__jos_kv SELECT * FROM jos_kv;'
    )
    assert.equal(checksums(), before, 'a snapshot taken meanwhile is not the copy changing')
  }
)

// ── #1647 · #1648: what a Joomla article carries with it, a menu's order, counters ───────────────

const JOOMLA = `
CREATE TABLE jos_content (id INT PRIMARY KEY, asset_id INT, title VARCHAR(255), hits INT);
CREATE TABLE jos_assets (id INT PRIMARY KEY, parent_id INT, lft INT, rgt INT, level INT, name VARCHAR(50) NOT NULL, title VARCHAR(100), UNIQUE KEY idx_asset_name (name));
CREATE TABLE jos_workflow_associations (item_id INT NOT NULL, stage_id INT NOT NULL, extension VARCHAR(50) NOT NULL, PRIMARY KEY (item_id, extension));
CREATE TABLE jos_contentitem_tag_map (type_alias VARCHAR(255) NOT NULL DEFAULT '', core_content_id INT UNSIGNED NOT NULL, content_item_id INT NOT NULL, tag_id INT UNSIGNED NOT NULL, tag_date TIMESTAMP NOT NULL DEFAULT '2026-01-01 00:00:00', type_id MEDIUMINT NOT NULL, UNIQUE KEY uc_ItemnameTagid (type_id, content_item_id, tag_id));
CREATE TABLE jos_fields (id INT PRIMARY KEY, context VARCHAR(255));
CREATE TABLE jos_fields_values (field_id INT UNSIGNED NOT NULL, item_id VARCHAR(255) NOT NULL, value MEDIUMTEXT, KEY idx_field_id (field_id));
CREATE TABLE jos_ucm_content (core_content_id INT PRIMARY KEY, core_type_alias VARCHAR(255), core_content_item_id INT, core_title VARCHAR(255));
CREATE TABLE jos_menu (id INT PRIMARY KEY, menutype VARCHAR(24), title VARCHAR(255), parent_id INT, lft INT, rgt INT, level INT, path VARCHAR(400), client_id TINYINT NOT NULL DEFAULT 0);
CREATE TABLE jos_banners (id INT PRIMARY KEY, name VARCHAR(255), impmade INT, clicks INT);
CREATE TABLE jos_action_logs (id INT PRIMARY KEY, message TEXT);
CREATE TABLE jos_loose (a INT, b INT);
CREATE TABLE jos_contact_details (id INT PRIMARY KEY, name VARCHAR(255), checked_out INT UNSIGNED NOT NULL DEFAULT 0, checked_out_time DATETIME NOT NULL DEFAULT '2000-01-01 00:00:00');
INSERT INTO jos_contact_details (id, name) VALUES (1,'Shop');
INSERT INTO jos_content VALUES (17,117,'Seventeen',0),(22,122,'Twenty-two',0),(23,123,'Twenty-three',0);
ALTER TABLE jos_content ADD checked_out INT UNSIGNED NULL, ADD checked_out_time DATETIME NULL;
INSERT INTO jos_assets VALUES (1,0,0,7,0,'root.1','Root'),(117,1,1,2,1,'com_content.article.17','Seventeen'),
  (122,1,3,4,1,'com_content.article.22','Twenty-two'),(123,1,5,6,1,'com_content.article.23','Twenty-three');
INSERT INTO jos_workflow_associations VALUES (17,1,'com_content.article'),(22,1,'com_content.article'),(23,1,'com_content.article');
INSERT INTO jos_contentitem_tag_map (type_alias, core_content_id, content_item_id, tag_id, type_id) VALUES
  ('com_content.article',1,17,2,1),('com_content.article',2,22,2,1),('com_content.article',3,23,2,1),('com_content.article',3,23,5,1);
INSERT INTO jos_fields VALUES (1,'com_content.article');
INSERT INTO jos_fields_values VALUES (1,'17','red'),(1,'22','blue'),(1,'23','green');
INSERT INTO jos_ucm_content VALUES (1,'com_content.article',17,'Seventeen'),(2,'com_content.article',22,'Twenty-two'),(3,'com_content.article',23,'Twenty-three');
INSERT INTO jos_menu VALUES (1,'','Menu_Item_Root',0,0,17,0,'',0),
  (2,'mainmenu','Home',1,1,2,1,'home',0),(3,'mainmenu','Coffee',1,3,4,1,'coffee',0),(4,'mainmenu','Tags',1,5,6,1,'tags',0),
  (5,'mainmenu','Shop',1,7,8,1,'shop',0),(6,'mainmenu','Forum',1,9,10,1,'forum',0),
  (7,'footer','Legal',1,11,12,1,'legal',0),(8,'footer','Privacy',1,13,14,1,'privacy',0),(9,'footer','Cookies',1,15,16,1,'cookies',0);
INSERT INTO jos_banners VALUES (1,'Ad',100,10);
INSERT INTO jos_action_logs VALUES (1,'m1');
INSERT INTO jos_loose VALUES (1,1);
`

const JOOMLA_OURS = `
UPDATE jos_content SET title='Twenty-two (Tracy)', checked_out=7, checked_out_time='2026-10-23 09:00:00' WHERE id=22;
-- Tracy saved article 17: Joomla wrote its tag rows again, with a new stamp.
UPDATE jos_contentitem_tag_map SET tag_date='2026-02-02 00:00:00' WHERE content_item_id=17;
-- The footer reordered on the copy (Privacy first), and a new item at the end of the main menu.
UPDATE jos_menu SET lft=11 WHERE id=8; UPDATE jos_menu SET lft=13 WHERE id=7;
INSERT INTO jos_menu VALUES (10,'mainmenu','Blog',1,17,18,1,'blog',0);
UPDATE jos_banners SET impmade=150, clicks=12;
INSERT INTO jos_action_logs VALUES (2,'ours log');
INSERT INTO jos_loose VALUES (2,2);
`

const JOOMLA_THEIRS = `
-- The customer deleted articles 22 and 23, with everything Joomla deletes with them.
DELETE FROM jos_content WHERE id IN (22,23);
DELETE FROM jos_assets WHERE id IN (122,123);
DELETE FROM jos_workflow_associations WHERE item_id IN (22,23);
DELETE FROM jos_contentitem_tag_map WHERE content_item_id IN (22,23);
DELETE FROM jos_fields_values WHERE item_id IN ('22','23');
DELETE FROM jos_ucm_content WHERE core_content_item_id IN (22,23);
-- … tagged article 17 twice more,
INSERT INTO jos_contentitem_tag_map (type_alias, core_content_id, content_item_id, tag_id, type_id) VALUES
  ('com_content.article',1,17,14,1),('com_content.article',1,17,20,1);
-- … moved Tags before Coffee and Forum before Shop, and the footer its own way (Cookies second).
UPDATE jos_menu SET lft=5 WHERE id=3; UPDATE jos_menu SET lft=3 WHERE id=4;
UPDATE jos_menu SET lft=9 WHERE id=5; UPDATE jos_menu SET lft=7 WHERE id=6;
UPDATE jos_menu SET lft=15 WHERE id=8; UPDATE jos_menu SET lft=13 WHERE id=9;
UPDATE jos_banners SET impmade=130, clicks=15;
-- … and left edit forms open: an article, and a contact (whose table the copy never touched).
UPDATE jos_content SET checked_out=42, checked_out_time='2026-10-23 10:00:00' WHERE id=17;
UPDATE jos_contact_details SET name='Shop & Co', checked_out=42, checked_out_time='2026-10-23 10:00:00';
INSERT INTO jos_action_logs VALUES (2,'live log');
INSERT INTO jos_loose VALUES (3,3);
`

function stageJoomla() {
  sql(
    ['sb', 'sm', 'st']
      .map((s) => `DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${JOOMLA}`)
      .join('\n') + `\nUSE sm; ${JOOMLA_OURS}\nUSE st; ${JOOMLA_THEIRS}`
  )
}

/** The menu's items of one menu, in the order the merge leaves them (`lft`). */
const menu = (type) =>
  rows(`SELECT title FROM sm.jos_menu WHERE menutype='${type}' ORDER BY lft, id`).map((r) => r[0])

test(
  'live tag changes come over by the tag map’s own key; the stamp Joomla rewrites on every save is no change (#1647)',
  opts,
  () => {
    stageJoomla()
    const answer = merge(null, 'ours')
    assert.deepEqual(
      rows('SELECT content_item_id, tag_id FROM sm.jos_contentitem_tag_map ORDER BY 1, 2'),
      [
        ['17', '2'],
        ['17', '14'],
        ['17', '20'],
        ['22', '2']
      ],
      'the live site’s new tags on 17 are in; 23’s rows went with 23; 22 stays with 22'
    )
    assert.equal(answer.tables.jos_contentitem_tag_map, 'merged')
    assert.equal(
      answer.kept.some((c) => c.table === 'jos_contentitem_tag_map'),
      false
    )
    // A table with no key at all is still the copy's whole, and said so.
    assert.deepEqual(rows('SELECT a FROM sm.jos_loose ORDER BY a'), [['1'], ['2']])
    assert.ok(answer.kept.some((c) => c.id === 'db:jos_loose' && c.reason === 'no-primary-key'))
  }
)

test(
  'an article the live site deleted and Tracy edited keeps the rows that belong to it (#1647)',
  opts,
  () => {
    stageJoomla()
    const answer = merge(null, 'ours')
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_content ORDER BY id'), [
      ['17', 'Seventeen'],
      ['22', 'Twenty-two (Tracy)']
    ])
    assert.deepEqual(
      answer.kept.filter((c) => c.table === 'jos_content').map((c) => [c.id, c.reason]),
      [['db:jos_content:["22"]', 'delete-modify']]
    )
    assert.deepEqual(rows('SELECT item_id FROM sm.jos_workflow_associations ORDER BY 1'), [['17'], ['22']])
    assert.deepEqual(rows('SELECT item_id, value FROM sm.jos_fields_values ORDER BY 1'), [
      ['17', 'red'],
      ['22', 'blue']
    ])
    assert.deepEqual(rows('SELECT core_content_item_id FROM sm.jos_ucm_content ORDER BY 1'), [['17'], ['22']])
    assert.deepEqual(rows('SELECT id FROM sm.jos_assets ORDER BY 1'), [['1'], ['117'], ['122']])
    assert.equal(answer.tables.jos_fields_values, 'merged', 'matched by field, item and value')
  }
)

test(
  'a menu the live site alone reordered takes the live order; one both reordered keeps Tracy’s and says so (#1647)',
  opts,
  () => {
    stageJoomla()
    const answer = merge(null, 'ours')
    assert.deepEqual(menu('mainmenu'), ['Home', 'Tags', 'Coffee', 'Forum', 'Shop', 'Blog'])
    assert.deepEqual(menu('footer'), ['Privacy', 'Legal', 'Cookies'])
    const order = answer.kept.find((c) => c.kind === 'order')
    assert.deepEqual(order, {
      id: 'db:jos_menu:order:["1", "footer", "0"]',
      kind: 'order',
      table: 'jos_menu',
      key: { parent_id: '1', menutype: 'footer', client_id: '0' },
      base: ['Legal', 'Privacy', 'Cookies'],
      ours: ['Privacy', 'Legal', 'Cookies'],
      theirs: ['Legal', 'Cookies', 'Privacy']
    })
    assert.ok(answer.rebuild.includes('jos_menu'), 'Joomla rebuilds the tree from the order written')
    // A person who picks the live order gets it.
    stageJoomla()
    merge({ [order.id]: 'theirs' }, 'ours')
    assert.deepEqual(menu('footer'), ['Legal', 'Cookies', 'Privacy'])
  }
)

test(
  'counters both sites moved take the larger and are no clash; skipped log rows are named (#1648)',
  opts,
  () => {
    stageJoomla()
    const answer = merge(null, 'ours')
    assert.deepEqual(rows('SELECT impmade, clicks FROM sm.jos_banners'), [['150', '15']])
    assert.equal(
      answer.kept.some((c) => c.table === 'jos_banners'),
      false
    )
    assert.equal(answer.counts.skipped, 1)
    assert.deepEqual(answer.skipped, [
      {
        id: 'db:jos_action_logs:["2"]',
        kind: 'row',
        table: 'jos_action_logs',
        key: { id: '2' },
        reason: 'log-added-both'
      }
    ])
  }
)

test('edit locks are the copy’s own on every row, whatever the row or its table went through', opts, () => {
  stageJoomla()
  const answer = merge(null, 'ours')
  assert.deepEqual(rows('SELECT id, checked_out, checked_out_time FROM sm.jos_content ORDER BY id'), [
    ['17', 'NULL', 'NULL'],
    ['22', '7', '2026-10-23 09:00:00']
  ])
  assert.equal(answer.tables.jos_contact_details, 'from-theirs')
  assert.deepEqual(rows('SELECT name, checked_out, checked_out_time FROM sm.jos_contact_details'), [
    ['Shop & Co', '0', '2000-01-01 00:00:00']
  ])
  assert.equal(
    answer.kept.some((c) => c.table === 'jos_content' && c.column),
    false
  )
})

// ── #1699: a row the live site replaced — deleted, then inserted again under a new number ────────

// Joomla's `#__menu` with its real unique key. 101 and 102: a component's administrator menu item
// and its submenu, as an extension's installer writes them.
const REPLACED = `
CREATE TABLE jos_menu (id INT PRIMARY KEY, menutype VARCHAR(24) NOT NULL, title VARCHAR(255) NOT NULL,
  alias VARCHAR(400) NOT NULL, path VARCHAR(1024) NOT NULL DEFAULT '', link VARCHAR(1024) NOT NULL,
  type VARCHAR(16) NOT NULL, parent_id INT NOT NULL DEFAULT 1, level INT NOT NULL DEFAULT 0,
  component_id INT NOT NULL DEFAULT 0, lft INT NOT NULL DEFAULT 0, rgt INT NOT NULL DEFAULT 0,
  language CHAR(7) NOT NULL DEFAULT '', client_id TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY idx_client_id_parent_id_alias_language (client_id, parent_id, alias(100), language));
CREATE TABLE jos_modules_menu (moduleid INT NOT NULL, menuid INT NOT NULL, PRIMARY KEY (moduleid, menuid));
INSERT INTO jos_menu VALUES
  (1,'','Menu_Item_Root','root','','','',0,0,0,0,11,'*',0),
  (2,'mainmenu','Home','home','home','index.php?option=com_content&view=featured','component',1,1,19,1,2,'*',0),
  (3,'mainmenu','About','about','about','index.php?option=com_content&view=article&id=1','component',1,1,19,3,4,'*',0),
  (101,'main','COM_CLAUDECOWORK','com-claudecowork','com-claudecowork','index.php?option=com_claudecowork','component',1,1,10201,5,8,'*',1),
  (102,'main','COM_CLAUDECOWORK_SITES','com-claudecowork-sites','com-claudecowork/com-claudecowork-sites','index.php?option=com_claudecowork&view=sites','component',101,2,10201,6,7,'*',1);
INSERT INTO jos_modules_menu VALUES (90,2),(90,3);
`

// Tracy renamed a site menu item (so the table is merged row by row, not taken whole).
const REPLACED_OURS = `UPDATE jos_menu SET title='About us' WHERE id=3;`

// The owner updated the extension on the live site: its installer deleted the administrator menu
// items and inserted them again, under new numbers, with the same unique key.
const REPLACED_THEIRS = `
DELETE FROM jos_menu WHERE id IN (101,102);
INSERT INTO jos_menu VALUES
  (2358,'main','COM_CLAUDECOWORK','com-claudecowork','com-claudecowork','index.php?option=com_claudecowork','component',1,1,10201,9,12,'*',1),
  (2359,'main','COM_CLAUDECOWORK_SITES','com-claudecowork-sites','com-claudecowork/com-claudecowork-sites','index.php?option=com_claudecowork&view=sites','component',2358,2,10201,10,11,'*',1);
`

function stageReplaced(ours = '', theirs = '') {
  sql(
    ['sb', 'sm', 'st']
      .map((s) => `DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${REPLACED}`)
      .join('\n') + `\nUSE sm; ${REPLACED_OURS} ${ours}\nUSE st; ${REPLACED_THEIRS} ${theirs}`
  )
}

const menuRows = () => rows('SELECT id, parent_id, alias FROM sm.jos_menu ORDER BY id')

test(
  'a row the live site deleted and inserted again under a new number, with the same unique key, replaces the copy’s untouched one: no conflict (#1699)',
  opts,
  () => {
    stageReplaced()
    const answer = merge(null, 'ours')
    assert.deepEqual(answer.kept, [], 'nobody made a conflict')
    assert.deepEqual(answer.conflicts, [])
    assert.deepEqual(menuRows(), [
      ['1', '0', 'root'],
      ['2', '1', 'home'],
      ['3', '1', 'about'],
      ['2358', '1', 'com-claudecowork'],
      ['2359', '2358', 'com-claudecowork-sites']
    ])
    assert.deepEqual(
      rows('SELECT title FROM sm.jos_menu WHERE id=3'),
      [['About us']],
      'the copy’s edit stays'
    )
    assert.deepEqual(rows('SELECT moduleid, menuid FROM sm.jos_modules_menu ORDER BY 1, 2'), [
      ['90', '2'],
      ['90', '3']
    ])
    assert.equal(answer.tables.jos_menu, 'merged')
    assert.equal(answer.counts.rowsDeleted, 2)
    assert.equal(answer.counts.rowsFromTheirs, 2)
  }
)

test(
  'a replaced row the copy changed since the last sync is still a conflict on both rows, and the copy’s stays (#1699)',
  opts,
  () => {
    stageReplaced(`UPDATE jos_menu SET title='Claude Cowork (Tracy)' WHERE id=101;`)
    const answer = merge(null, 'ours')
    assert.deepEqual(
      answer.kept.map((c) => [c.id, c.reason]),
      [
        ['db:jos_menu:["101"]', 'delete-modify'],
        ['db:jos_menu:["2358"]', 'unique-key']
      ]
    )
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_menu WHERE id IN (101, 2358)'), [
      ['101', 'Claude Cowork (Tracy)']
    ])
  }
)

test(
  'a live row clashing with a copy row the live site did not delete is still a conflict (#1699)',
  opts,
  () => {
    stageReplaced(
      `INSERT INTO jos_menu VALUES (50,'mainmenu','News','news','news','index.php?option=com_content&view=category&id=8','component',1,1,19,9,10,'*',0);`,
      `INSERT INTO jos_menu VALUES (60,'mainmenu','News','news','news','index.php?option=com_content&view=category&id=9','component',1,1,19,13,14,'*',0);`
    )
    const answer = merge(null, 'ours')
    assert.deepEqual(
      answer.kept.map((c) => [c.id, c.reason]),
      [['db:jos_menu:["60"]', 'unique-key']]
    )
    assert.deepEqual(menuRows(), [
      ['1', '0', 'root'],
      ['2', '1', 'home'],
      ['3', '1', 'about'],
      ['50', '1', 'news'],
      ['2358', '1', 'com-claudecowork'],
      ['2359', '2358', 'com-claudecowork-sites']
    ])
  }
)

// ── one record under two numbers: the copy kept its own row of a record the live site replaced ──
//
// Before #1699 a sync kept the copy's administrator menu items (101, 102) as Tracy's version when
// the live site replaced them (2358, 2359); the base then became that read, so the copy's rows are
// in neither the base nor the live site. The next update on the live site replaces its rows again
// (2400, 2401), and each sync after met the same clash: kept for ever (dev, ja-energy-solutions24,
// 25/10/2026). The copy's rows are the live site's, number and place aside: the copy takes the live
// site's numbers, and what pointed at the copy's numbers follows.
const TWICE_THEIRS = `
DELETE FROM jos_menu WHERE id IN (2358,2359);
INSERT INTO jos_menu VALUES
  (2400,'main','COM_CLAUDECOWORK','com-claudecowork','com-claudecowork','index.php?option=com_claudecowork','component',1,1,10201,13,16,'*',1),
  (2401,'main','COM_CLAUDECOWORK_SITES','com-claudecowork-sites','com-claudecowork/com-claudecowork-sites','index.php?option=com_claudecowork&view=sites','component',2400,2,10201,14,15,'*',1);
`

function stageTwice(ours = '', theirs = '') {
  sql(
    `DROP DATABASE IF EXISTS sb; CREATE DATABASE sb; USE sb; ${REPLACED} ${REPLACED_THEIRS}
     DROP DATABASE IF EXISTS sm; CREATE DATABASE sm; USE sm; ${REPLACED} ${REPLACED_OURS}
       INSERT INTO jos_modules_menu VALUES (90,101); ${ours}
     DROP DATABASE IF EXISTS st; CREATE DATABASE st; USE st; ${REPLACED} ${REPLACED_THEIRS} ${TWICE_THEIRS} ${theirs}`
  )
}

test(
  'a copy-only row that is the same record as a row the live site added under another number takes the live number, with what points at it: no conflict',
  opts,
  () => {
    stageTwice()
    const answer = merge(null, 'ours')
    assert.deepEqual(answer.kept, [], 'nobody made a conflict')
    assert.deepEqual(answer.conflicts, [])
    assert.deepEqual(menuRows(), [
      ['1', '0', 'root'],
      ['2', '1', 'home'],
      ['3', '1', 'about'],
      ['2400', '1', 'com-claudecowork'],
      ['2401', '2400', 'com-claudecowork-sites']
    ])
    assert.deepEqual(
      rows('SELECT title FROM sm.jos_menu WHERE id=3'),
      [['About us']],
      'the copy’s edit stays'
    )
    assert.deepEqual(
      rows('SELECT moduleid, menuid FROM sm.jos_modules_menu ORDER BY 1, 2'),
      [
        ['90', '2'],
        ['90', '3'],
        ['90', '2400']
      ],
      'what pointed at the copy’s number points at the live one'
    )
    assert.deepEqual(answer.renumbered, [], 'the live site’s numbers are kept: nothing to remember')
    // The next sync, with this read as its base: nothing to merge.
    sql(`DROP DATABASE sb; CREATE DATABASE sb; USE sb; ${REPLACED} ${REPLACED_THEIRS} ${TWICE_THEIRS}`)
    const again = merge(null, 'ours')
    assert.deepEqual(again.kept, [])
    assert.deepEqual(menuRows(), [
      ['1', '0', 'root'],
      ['2', '1', 'home'],
      ['3', '1', 'about'],
      ['2400', '1', 'com-claudecowork'],
      ['2401', '2400', 'com-claudecowork-sites']
    ])
  }
)

test(
  'a copy-only row Tracy changed is not the live row under another number: still a conflict, the copy’s kept',
  opts,
  () => {
    stageTwice(`UPDATE jos_menu SET title='Claude Cowork (Tracy)' WHERE id=101;`)
    const answer = merge(null, 'ours')
    assert.deepEqual(
      answer.kept.map((c) => [c.id, c.reason]),
      [['db:jos_menu:["2400"]', 'unique-key']]
    )
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_menu WHERE id IN (101, 2400)'), [
      ['101', 'Claude Cowork (Tracy)']
    ])
    assert.deepEqual(rows('SELECT moduleid, menuid FROM sm.jos_modules_menu WHERE menuid=101'), [
      ['90', '101']
    ])
  }
)

test(
  'a different copy-only record clashing on the unique key with a live one is still a conflict, beside the same record that is not',
  opts,
  () => {
    stageTwice(
      `INSERT INTO jos_menu VALUES (50,'mainmenu','News','news','news','index.php?option=com_content&view=category&id=8','component',1,1,19,9,10,'*',0);`,
      `INSERT INTO jos_menu VALUES (60,'mainmenu','News','news','news','index.php?option=com_content&view=category&id=9','component',1,1,19,17,18,'*',0);`
    )
    const answer = merge(null, 'ours')
    assert.deepEqual(
      answer.kept.map((c) => [c.id, c.reason]),
      [['db:jos_menu:["60"]', 'unique-key']]
    )
    assert.deepEqual(menuRows(), [
      ['1', '0', 'root'],
      ['2', '1', 'home'],
      ['3', '1', 'about'],
      ['50', '1', 'news'],
      ['2400', '1', 'com-claudecowork'],
      ['2401', '2400', 'com-claudecowork-sites']
    ])
  }
)

// A CMS editor re-indents the HTML it saves: Joomla's admin, asked only for a new title, writes the
// untouched fulltext back with `  <li>` as `<li>` (ja-energy, 24/10). That is no change of the text.
const LAYOUT = `CREATE TABLE jos_content (id INT PRIMARY KEY, title VARCHAR(255), introtext MEDIUMTEXT);
INSERT INTO jos_content VALUES (7, 'Rise', '<p>Intro</p>\\n<ul>\\n  <li>A</li>\\n  <li>B</li>\\n</ul>');`
function stageLayout(ours, theirs) {
  sql(
    ['sb', 'sm', 'st']
      .map((s) => `DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${LAYOUT}`)
      .join('\n') + `\nUSE sm; ${ours}\nUSE st; ${theirs}`
  )
}
const REINDENTED = `'<p>Intro</p>\\n<ul>\\n<li>A</li>\\n<li>B</li>\\n</ul>'`

test(
  'a column the live site only re-laid out (an editor re-indenting saved HTML) is no conflict: the copy’s text stays',
  opts,
  () => {
    stageLayout(
      `UPDATE jos_content SET introtext = CONCAT(introtext, '\\n<p>Tracy added</p>') WHERE id = 7;`,
      `UPDATE jos_content SET title = 'Rise (live)', introtext = ${REINDENTED} WHERE id = 7;`
    )
    const answer = merge(null, 'ours')
    assert.deepEqual(answer.kept, [], 'nobody changed the text twice')
    assert.deepEqual(rows('SELECT title, introtext FROM sm.jos_content WHERE id = 7'), [
      // The client prints a newline as `\\n`.
      ['Rise (live)', '<p>Intro</p>\\n<ul>\\n  <li>A</li>\\n  <li>B</li>\\n</ul>\\n<p>Tracy added</p>']
    ])
  }
)

test('a column the copy only re-laid out takes the live site’s real change, with no conflict', opts, () => {
  stageLayout(
    `UPDATE jos_content SET introtext = ${REINDENTED} WHERE id = 7;`,
    `UPDATE jos_content SET introtext = '<p>Intro</p>\\n<ul>\\n  <li>A</li>\\n  <li>B</li>\\n  <li>C live</li>\\n</ul>' WHERE id = 7;`
  )
  const answer = merge(null, 'ours')
  assert.deepEqual(answer.kept, [])
  assert.deepEqual(rows('SELECT introtext FROM sm.jos_content WHERE id = 7'), [
    ['<p>Intro</p>\\n<ul>\\n  <li>A</li>\\n  <li>B</li>\\n  <li>C live</li>\\n</ul>']
  ])
})

test('both sides changing what a reader sees is still a conflict, the copy’s kept', opts, () => {
  stageLayout(
    `UPDATE jos_content SET introtext = CONCAT(introtext, '\\n<p>Tracy added</p>') WHERE id = 7;`,
    `UPDATE jos_content SET introtext = CONCAT(${REINDENTED}, '\\n<p>Live added</p>') WHERE id = 7;`
  )
  const answer = merge(null, 'ours')
  assert.deepEqual(
    answer.kept.map((c) => c.id),
    ['db:jos_content:["7"]:introtext']
  )
  assert.match(rows('SELECT introtext FROM sm.jos_content WHERE id = 7')[0][0], /Tracy added/)
})

// ── what came over, as a person counts it (`records`), and a column that mirrors a record's ────────
function stageRecords(ours, theirs) {
  const base = `
CREATE TABLE jos_content (id INT PRIMARY KEY, title VARCHAR(255), introtext MEDIUMTEXT, hits INT, modified DATETIME NULL, asset_id INT);
CREATE TABLE jos_assets (id INT PRIMARY KEY, parent_id INT, lft INT, rgt INT, level INT, name VARCHAR(50), title VARCHAR(100));
CREATE TABLE jos_history (version_id INT PRIMARY KEY, item_id VARCHAR(50), version_data MEDIUMTEXT);
CREATE TABLE jos_categories (id INT PRIMARY KEY, title VARCHAR(255), asset_id INT);
INSERT INTO jos_content VALUES (1,'A','a',0,'2026-01-01',11),(2,'B','b',0,'2026-01-01',12);
INSERT INTO jos_assets VALUES (1,0,0,5,0,'root.1','Root'),(11,1,1,2,1,'com_content.article.1','A'),(12,1,3,4,1,'com_content.article.2','B');
INSERT INTO jos_history VALUES (1,'com_content.article.1','{}');
INSERT INTO jos_categories VALUES (1,'Cat',0);`
  sql(
    ['sb', 'sm', 'st']
      .map((s) => `DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${base}`)
      .join('\n') + `\nUSE sm; ${ours}\nUSE st; ${theirs}`
  )
}

test(
  'a title the live site changed in a table the copy left alone is one record that came over, not nothing',
  opts,
  () => {
    // Joomla saving an article on the live site: its title, its stamp, its asset's title, a version.
    stageRecords(
      '',
      `UPDATE jos_content SET title='A live', modified='2026-02-01' WHERE id=1;
       UPDATE jos_assets SET title='A live' WHERE id=11;
       INSERT INTO jos_history VALUES (2,'com_content.article.1','{"title":"A live"}');`
    )
    const answer = merge(null, 'ours')
    assert.equal(answer.tables.jos_content, 'from-theirs')
    assert.equal(answer.counts.records, 1, JSON.stringify(answer.counts))
    assert.deepEqual(rows('SELECT title FROM sm.jos_content WHERE id = 1'), [['A live']])
  }
)

test('a stamp or a counter the live site moved is no record; a category it added is one', opts, () => {
  stageRecords(
    "UPDATE jos_content SET title='B Tracy' WHERE id=2;",
    `UPDATE jos_content SET hits=40, modified='2026-03-01' WHERE id=1;
       INSERT INTO jos_categories VALUES (2,'New cat',0);`
  )
  const answer = merge(null, 'ours')
  assert.equal(answer.counts.records, 1, JSON.stringify(answer.counts))
  assert.deepEqual(rows('SELECT title FROM sm.jos_categories ORDER BY id'), [['Cat'], ['New cat']])
})

test(
  'one title both sites changed is one place kept: the asset that mirrors it follows, never named',
  opts,
  () => {
    stageRecords(
      "UPDATE jos_content SET title='A Tracy' WHERE id=1; UPDATE jos_assets SET title='A Tracy' WHERE id=11;",
      "UPDATE jos_content SET title='A live' WHERE id=1; UPDATE jos_assets SET title='A live' WHERE id=11;"
    )
    const answer = merge(null, 'ours')
    assert.deepEqual(
      answer.kept.map((c) => c.id),
      ['db:jos_content:["1"]:title']
    )
    assert.deepEqual(rows('SELECT title FROM sm.jos_assets WHERE id = 11'), [['A Tracy']])
    assert.equal(answer.counts.records, 0)
  }
)

// ── a held record's rows: Phoca Cart, both sites added a product under one number ──────────────────
function stagePhoca(ours, theirs) {
  // Columns as Phoca Cart 6.1.9's install SQL has them (the ones the merge reads).
  const base = `
CREATE TABLE jos_phocacart_products (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255), alias VARCHAR(255));
CREATE TABLE jos_phocacart_product_categories (product_id INT NOT NULL DEFAULT 0, category_id INT NOT NULL DEFAULT 0, ordering INT NOT NULL DEFAULT 0, UNIQUE KEY idx_category (product_id, category_id));
CREATE TABLE jos_phocacart_product_images (id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL DEFAULT 0, image VARCHAR(255) NOT NULL DEFAULT '');
CREATE TABLE jos_phocacart_product_featured (product_id INT NOT NULL DEFAULT 0 PRIMARY KEY, ordering INT NOT NULL DEFAULT 0);
CREATE TABLE jos_phocacart_item_groups (item_id INT NOT NULL DEFAULT 0, group_id INT NOT NULL DEFAULT 0, product_id INT NOT NULL DEFAULT 0, type TINYINT NOT NULL DEFAULT 0);
CREATE TABLE jos_phocacart_logs (a INT, b INT);
INSERT INTO jos_phocacart_item_groups VALUES (5,1,0,3);
INSERT INTO jos_phocacart_logs VALUES (1,1);
INSERT INTO jos_phocacart_products VALUES (5,'Mug','mug');
INSERT INTO jos_phocacart_product_categories VALUES (5,1,1);
INSERT INTO jos_phocacart_product_images VALUES (1,5,'mug.jpg');`
  sql(
    ['sb', 'sm', 'st']
      .map((s) => `DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${base}`)
      .join('\n') + `\nUSE sm; ${ours}\nUSE st; ${theirs}`
  )
}

const PHOCA_OURS = `INSERT INTO jos_phocacart_products VALUES (6,'Tracy hat','tracy-hat');
INSERT INTO jos_phocacart_product_categories VALUES (6,1,2);`
const PHOCA_THEIRS = `INSERT INTO jos_phocacart_products VALUES (6,'Live scarf','live-scarf'),(7,'Live socks','live-socks');
INSERT INTO jos_phocacart_product_categories VALUES (6,2,1),(7,2,2);
INSERT INTO jos_phocacart_product_images VALUES (2,6,'scarf.jpg'),(3,7,'socks.jpg');
INSERT INTO jos_phocacart_product_featured VALUES (6,1);`

test(
  'a held live product keeps its rows out of the copy and names them; a live product with no clash brings its own',
  opts,
  () => {
    stagePhoca(PHOCA_OURS, PHOCA_THEIRS)
    const answer = merge(null, 'ours')
    // Tracy's product 6 stays as Tracy made it: in its own category, with no image or flag of the live one.
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_phocacart_products ORDER BY id'), [
      ['5', 'Mug'],
      ['6', 'Tracy hat'],
      ['7', 'Live socks']
    ])
    assert.deepEqual(
      rows('SELECT product_id, category_id FROM sm.jos_phocacart_product_categories ORDER BY 1, 2'),
      [
        ['5', '1'],
        ['6', '1'],
        ['7', '2']
      ]
    )
    assert.deepEqual(rows('SELECT id, product_id FROM sm.jos_phocacart_product_images ORDER BY id'), [
      ['1', '5'],
      ['3', '7']
    ])
    assert.deepEqual(rows('SELECT product_id FROM sm.jos_phocacart_product_featured'), [])
    const held = answer.held.find((h) => h.id === 'db:jos_phocacart_products:["6"]')
    assert.equal(held?.reason, 'added-both', JSON.stringify(answer.held))
    assert.deepEqual(held.belonging, [
      { table: 'jos_phocacart_product_categories', key: { product_id: '6', category_id: '2' } },
      { table: 'jos_phocacart_product_featured', key: { product_id: '6' } },
      { table: 'jos_phocacart_product_images', key: { id: '2' } }
    ])
    assert.equal(held.belongingCount, 3)
  }
)

test(
  'a held live product taken by a person (“theirs”) brings its rows; “ours” names them as skipped',
  opts,
  () => {
    stagePhoca(PHOCA_OURS, PHOCA_THEIRS)
    merge({ 'db:jos_phocacart_products:["6"]': 'theirs' }, 'ours')
    assert.deepEqual(rows('SELECT title FROM sm.jos_phocacart_products WHERE id = 6'), [['Live scarf']])
    assert.deepEqual(rows('SELECT id FROM sm.jos_phocacart_product_images WHERE product_id = 6'), [['2']])
    stagePhoca(PHOCA_OURS, PHOCA_THEIRS)
    const answer = merge({ 'db:jos_phocacart_products:["6"]': 'ours' }, 'ours')
    assert.deepEqual(rows('SELECT id FROM sm.jos_phocacart_product_images WHERE product_id = 6'), [])
    assert.deepEqual(
      answer.skipped.filter((s) => s.reason === 'belongs-to-held').map((s) => [s.table, s.record]),
      [
        ['jos_phocacart_product_categories', { table: 'jos_phocacart_products', id: '6' }],
        ['jos_phocacart_product_featured', { table: 'jos_phocacart_products', id: '6' }],
        ['jos_phocacart_product_images', { table: 'jos_phocacart_products', id: '6' }]
      ]
    )
  }
)

test(
  'a product the live site deleted and Tracy changed keeps its rows (`dependents`, the kept side)',
  opts,
  () => {
    stagePhoca(
      "UPDATE jos_phocacart_products SET title='Mug Tracy' WHERE id=5;",
      'DELETE FROM jos_phocacart_products WHERE id=5; DELETE FROM jos_phocacart_product_categories WHERE product_id=5; DELETE FROM jos_phocacart_product_images WHERE product_id=5;'
    )
    merge(null, 'ours')
    assert.deepEqual(rows('SELECT title FROM sm.jos_phocacart_products'), [['Mug Tracy']])
    assert.deepEqual(rows('SELECT product_id, category_id FROM sm.jos_phocacart_product_categories'), [
      ['5', '1']
    ])
    assert.deepEqual(rows('SELECT id FROM sm.jos_phocacart_product_images'), [['1']])
  }
)

// Phoca Cart's `item_groups` has no key (6.1.9): a held product's customer groups go, the others come.
const GROUPS_THEIRS = `${PHOCA_THEIRS}
INSERT INTO jos_phocacart_item_groups VALUES (6,2,0,3),(7,2,0,3),(6,4,0,2);
INSERT INTO jos_phocacart_logs VALUES (2,2);`

test(
  'a held product’s customer groups stay out of a table taken whole; every other live row of it comes',
  opts,
  () => {
    stagePhoca(PHOCA_OURS, GROUPS_THEIRS)
    const answer = merge(null, 'ours')
    assert.equal(answer.tables.jos_phocacart_item_groups, 'from-theirs', JSON.stringify(answer.tables))
    // (6,4,0,2) is category 6's group (type 2), not the product's: it comes.
    assert.deepEqual(rows('SELECT item_id, group_id, type FROM sm.jos_phocacart_item_groups ORDER BY 1, 2'), [
      ['5', '1', '3'],
      ['6', '4', '2'],
      ['7', '2', '3']
    ])
    // A table with no key and no held row in it is taken whole, as before.
    assert.equal(answer.tables.jos_phocacart_logs, 'from-theirs')
    assert.deepEqual(rows('SELECT a FROM sm.jos_phocacart_logs ORDER BY a'), [['1'], ['2']])
    const held = answer.held.find((h) => h.id === 'db:jos_phocacart_products:["6"]')
    assert.deepEqual(
      held.belonging.filter((b) => b.table === 'jos_phocacart_item_groups'),
      [
        {
          table: 'jos_phocacart_item_groups',
          key: { item_id: '6', group_id: '2', product_id: '0', type: '3' }
        }
      ]
    )
  }
)

test(
  'a held product’s customer groups stay out when the copy changed the table too (merged row by row)',
  opts,
  () => {
    stagePhoca(`${PHOCA_OURS}\nINSERT INTO jos_phocacart_item_groups VALUES (6,1,0,3);`, GROUPS_THEIRS)
    const answer = merge(null, 'ours')
    assert.equal(answer.tables.jos_phocacart_item_groups, 'merged', JSON.stringify(answer.tables))
    assert.deepEqual(rows('SELECT item_id, group_id, type FROM sm.jos_phocacart_item_groups ORDER BY 1, 2'), [
      ['5', '1', '3'],
      ['6', '1', '3'],
      ['6', '4', '2'],
      ['7', '2', '3']
    ])
  }
)

// A row the base had that the live site pointed at its held product: the copy's version stays, never
// grafted onto Tracy's product of that number nor lost, and the held product names it as changed.
const REPOINT_THEIRS = `${PHOCA_THEIRS}
UPDATE jos_phocacart_product_images SET product_id = 6, image = 'scarf-2.jpg' WHERE id = 1;`

test(
  'a base row the live site pointed at a held product stays the copy’s, in a table taken whole',
  opts,
  () => {
    stagePhoca(PHOCA_OURS, REPOINT_THEIRS)
    const answer = merge(null, 'ours')
    assert.equal(answer.tables.jos_phocacart_product_images, 'from-theirs', JSON.stringify(answer.tables))
    assert.deepEqual(rows('SELECT id, product_id, image FROM sm.jos_phocacart_product_images ORDER BY id'), [
      ['1', '5', 'mug.jpg'],
      ['3', '7', 'socks.jpg']
    ])
    const held = answer.held.find((h) => h.id === 'db:jos_phocacart_products:["6"]')
    assert.deepEqual(
      held.belonging.filter((b) => b.table === 'jos_phocacart_product_images'),
      [
        { table: 'jos_phocacart_product_images', key: { id: '1' }, changed: true },
        { table: 'jos_phocacart_product_images', key: { id: '2' } }
      ]
    )
  }
)

test('a base row the live site pointed at a held product stays the copy’s, merged row by row', opts, () => {
  // The copy changed the table too (an image of its own product 5), so it is merged row by row.
  stagePhoca(
    `${PHOCA_OURS}\nINSERT INTO jos_phocacart_product_images VALUES (4,5,'mug-2.jpg');`,
    REPOINT_THEIRS
  )
  const answer = merge(null, 'ours')
  assert.equal(answer.tables.jos_phocacart_product_images, 'merged', JSON.stringify(answer.tables))
  assert.deepEqual(rows('SELECT id, product_id, image FROM sm.jos_phocacart_product_images ORDER BY id'), [
    ['1', '5', 'mug.jpg'],
    ['3', '7', 'socks.jpg'],
    ['4', '5', 'mug-2.jpg']
  ])
  const held = answer.held.find((h) => h.id === 'db:jos_phocacart_products:["6"]')
  assert.deepEqual(
    held.belonging.filter((b) => b.table === 'jos_phocacart_product_images'),
    [
      { table: 'jos_phocacart_product_images', key: { id: '1' }, changed: true },
      { table: 'jos_phocacart_product_images', key: { id: '2' } }
    ]
  )
})

test(
  'a keyless row the live site moved to a held product: the new row stays out, the old one’s deletion stands',
  opts,
  () => {
    // `item_groups` is matched by all its columns: (5,1,0,3) → (6,1,0,3) reads as one deleted, one added.
    stagePhoca(
      PHOCA_OURS,
      `${PHOCA_THEIRS}\nUPDATE jos_phocacart_item_groups SET item_id = 6 WHERE item_id = 5;`
    )
    const answer = merge(null, 'ours')
    assert.deepEqual(rows('SELECT item_id, group_id FROM sm.jos_phocacart_item_groups'), [])
    const held = answer.held.find((h) => h.id === 'db:jos_phocacart_products:["6"]')
    assert.deepEqual(
      held.belonging.filter((b) => b.table === 'jos_phocacart_item_groups'),
      [
        {
          table: 'jos_phocacart_item_groups',
          key: { item_id: '6', group_id: '1', product_id: '0', type: '3' }
        }
      ]
    )
  }
)

function stageHeldContactFields(ours, theirs) {
  const base = `
CREATE TABLE jos_contact_details (id INT PRIMARY KEY, name VARCHAR(100), asset_id INT);
CREATE TABLE jos_fields (id INT PRIMARY KEY, title VARCHAR(100), context VARCHAR(100), asset_id INT);
CREATE TABLE jos_fields_values (field_id INT, item_id VARCHAR(100), value TEXT, PRIMARY KEY(field_id,item_id));
CREATE TABLE jos_fields_categories (field_id INT, category_id INT, PRIMARY KEY(field_id,category_id));
CREATE TABLE jos_contentitem_tag_map (type_alias VARCHAR(100), content_item_id INT, tag_id INT, PRIMARY KEY(type_alias,content_item_id,tag_id));
CREATE TABLE jos_ucm_content (core_content_id INT PRIMARY KEY, core_content_item_id INT, core_type_alias VARCHAR(100));
CREATE TABLE jos_content_types (type_id INT PRIMARY KEY, type_alias VARCHAR(100));
CREATE TABLE jos_ucm_base (ucm_id INT PRIMARY KEY, ucm_item_id INT, ucm_type_id INT);
CREATE TABLE jos_assets (id INT PRIMARY KEY, name VARCHAR(100));
INSERT INTO jos_content_types VALUES (1,'com_contact.contact');
INSERT INTO jos_fields VALUES (1,'Contact field','com_contact.contact',0);
INSERT INTO jos_fields_values VALUES (1,'1','base');`
  sql(
    ['sb', 'sm', 'st']
      .map((s) => `DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${base}`)
      .join('\n') + `\nUSE sm; ${ours}\nUSE st; ${theirs}`
  )
}

test('held contacts and custom fields keep live dependent rows off the copy', opts, () => {
  for (const rowMerge of [false, true]) {
    const ours = `INSERT INTO jos_contact_details VALUES (2,'Tracy contact',0);
INSERT INTO jos_fields VALUES (4,'Tracy field','com_content.article',0);
${rowMerge ? "UPDATE jos_fields_values SET value='copy base' WHERE field_id=1;" : ''}`
    const theirs = `INSERT INTO jos_contact_details VALUES (2,'Live contact',102);
INSERT INTO jos_fields VALUES (4,'Live field','com_content.article',104);
INSERT INTO jos_fields_values VALUES (1,'2','contact value'),(4,'9','article value');
INSERT INTO jos_fields_categories VALUES (4,9);
INSERT INTO jos_contentitem_tag_map VALUES ('com_contact.contact',2,7),('com_content.article',2,8);
INSERT INTO jos_ucm_content VALUES (1,2,'com_contact.contact');
INSERT INTO jos_ucm_base VALUES (1,2,1);
INSERT INTO jos_assets VALUES (102,'com_contact.contact.2'),(104,'com_content.field.4');`
    stageHeldContactFields(ours, theirs)
    const answer = merge(null, 'ours')
    assert.equal(
      answer.held.find((h) => h.table === 'jos_contact_details')?.belongingCount,
      5,
      JSON.stringify(answer.held)
    )
    assert.equal(
      answer.held.find((h) => h.table === 'jos_fields')?.belongingCount,
      3,
      JSON.stringify(answer.held)
    )
    assert.deepEqual(rows('SELECT field_id,item_id FROM sm.jos_fields_values ORDER BY 1,2'), [['1', '1']])
    assert.deepEqual(rows('SELECT * FROM sm.jos_fields_categories'), [])
    assert.deepEqual(rows('SELECT type_alias FROM sm.jos_contentitem_tag_map'), [['com_content.article']])
    assert.deepEqual(rows('SELECT * FROM sm.jos_ucm_content'), [])
    assert.deepEqual(rows('SELECT * FROM sm.jos_ucm_base'), [])
    assert.deepEqual(rows('SELECT * FROM sm.jos_assets'), [])
  }
})
