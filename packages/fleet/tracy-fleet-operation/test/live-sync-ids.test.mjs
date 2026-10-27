/**
 * "Sync from live" — records both sites created under one number (`scripts/lib/live_sync.py` `IdMap`).
 * The agent makes an article on the copy while the customer makes one on the live site: both get the
 * next AUTO_INCREMENT number. The live site's article must come over under a new number, with what
 * points at it, and keep that number in every later sync — so the customer's later edits of it land
 * on it, and a record the live site later makes under that same number is numbered again in turn.
 *
 * Three syncs in a row against a real `mariadb:11` (skipped where no docker daemon answers): each
 * sync's base is the previous live read, and the id map the previous merge answered is handed on,
 * as `webroot-sync.sh` does.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-sync-ids.test.mjs
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
const DB_CONTAINER = `tracy-live-sync-ids-db-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the merge needs a real MariaDB' }
const CLIENT = [REAL_DOCKER, 'exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot']
const root = mkdtempSync(join(tmpdir(), 'live-sync-ids-'))
after(() => rmSync(root, { recursive: true, force: true }))

const sql = (script) =>
  execFileSync(CLIENT[0], [...CLIENT.slice(1), '-N', '-B'], { input: script, encoding: 'utf8' }).trim()
const rows = (query) =>
  sql(query)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))

before(async () => {
  if (!DOCKER_UP) return
  spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
  execFileSync(
    REAL_DOCKER,
    ['run', '-d', '--name', DB_CONTAINER, '-e', 'MARIADB_ROOT_PASSWORD=t', 'mariadb:11'],
    { stdio: 'ignore' }
  )
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
CREATE TABLE jos_content (id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT, title VARCHAR(255), introtext TEXT);
CREATE TABLE jos_content_frontpage (content_id INT PRIMARY KEY, ordering INT);
CREATE TABLE jos_workflow_associations (item_id INT, stage_id INT, extension VARCHAR(50), PRIMARY KEY (item_id, extension));
CREATE TABLE jos_assets (id INT AUTO_INCREMENT PRIMARY KEY, parent_id INT, lft INT, rgt INT, level INT, name VARCHAR(50), UNIQUE KEY idx_asset_name (name));
CREATE TABLE jos_menu (id INT AUTO_INCREMENT PRIMARY KEY, parent_id INT, lft INT, rgt INT, level INT, path VARCHAR(255), title VARCHAR(255), link VARCHAR(255));
CREATE TABLE jos_action_logs (id INT AUTO_INCREMENT PRIMARY KEY, message_language_key VARCHAR(255), extension VARCHAR(50), user_id INT, item_id INT);
INSERT INTO jos_assets VALUES (1,0,0,9,0,'root.1'),(10,1,1,2,1,'com_content.article.1'),(11,1,3,4,1,'com_content.article.2');
INSERT INTO jos_content VALUES (1,10,'Hello','first'),(2,11,'About','second');
INSERT INTO jos_content_frontpage VALUES (1,1),(2,2);
INSERT INTO jos_workflow_associations VALUES (1,1,'com_content.article'),(2,1,'com_content.article'),(2,9,'com_other.thing');
INSERT INTO jos_menu VALUES (1,0,0,3,0,'','Root',''),(101,1,1,2,1,'home','Home','index.php?option=com_content&view=article&id=1');
`
/** An article the way Joomla makes one: its asset, the article, featured, its workflow row. */
const article = (id, asset, title, extra = '') => `
INSERT INTO jos_assets VALUES (${asset},1,0,0,1,'com_content.article.${id}');
INSERT INTO jos_content VALUES (${id},${asset},'${title}','${title} body${extra}');
INSERT INTO jos_content_frontpage VALUES (${id},0);
INSERT INTO jos_workflow_associations VALUES (${id},1,'com_content.article');`

/** The live site, kept in schema `live`; each sync reads it into a fresh schema. */
function readLive(into) {
  const dump = execFileSync(
    REAL_DOCKER,
    ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb-dump', '-uroot', 'live'],
    { maxBuffer: 1 << 26 }
  )
  sql(`DROP DATABASE IF EXISTS ${into}; CREATE DATABASE ${into};`)
  execFileSync(CLIENT[0], [...CLIENT.slice(1), into], { input: dump })
}

let idMap = {}
let syncs = 0
/** One sync as webroot-sync.sh runs it: base = the last live read, map = the last merge's map. */
function sync() {
  readLive('st')
  const file = join(root, `map-${++syncs}.json`)
  writeFileSync(file, JSON.stringify(idMap))
  const done = spawnSync(
    'python3',
    [
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
      'jos_',
      '--prefer',
      'ours',
      '--id-map',
      file
    ],
    { encoding: 'utf8', env: { ...process.env, TRACY_SYNC_SQL: JSON.stringify(CLIENT) } }
  )
  assert.equal(done.status, 0, done.stderr)
  const answer = JSON.parse(done.stdout.trim().split('\n').pop())
  idMap = answer.idMap
  readLive('sb')
  return answer
}

test(
  'a record both sites created comes over under a new number, keeps it, and takes the customer’s later edits',
  opts,
  () => {
    for (const s of ['live', 'sm', 'sb'])
      sql(`DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${TABLES}`)

    // Since the import: the agent made article 3 on the copy, the customer made article 3 on the live
    // site and linked it from a new menu item.
    sql(`USE sm; ${article(3, 12, 'Tracy news')}`)
    sql(`USE live; ${article(3, 12, 'Spring sale')}
       INSERT INTO jos_menu VALUES (102,1,0,0,1,'sale','Sale','index.php?option=com_content&view=article&id=3');
       INSERT INTO jos_action_logs VALUES (1,'PLG_ACTIONLOG_JOOMLA_CONTENT_ADDED','com_content.article',42,3),
                                          (2,'PLG_ACTIONLOG_JOOMLA_USER_LOGGED_IN','com_users',42,42);`)

    const first = sync()
    assert.deepEqual(first.conflicts, [])
    assert.deepEqual(
      first.renumbered.map((r) => [r.table, r.live, r.copy, r.why]),
      [
        ['content', 3, 4, 'created-on-both'],
        ['assets', 12, 13, 'created-on-both']
      ]
    )
    assert.deepEqual(idMap, { content: { 3: 4 }, assets: { 12: 13 } })
    assert.deepEqual(rows('SELECT id, asset_id, title FROM sm.jos_content ORDER BY id'), [
      ['1', '10', 'Hello'],
      ['2', '11', 'About'],
      ['3', '12', 'Tracy news'],
      ['4', '13', 'Spring sale']
    ])
    assert.deepEqual(rows('SELECT content_id FROM sm.jos_content_frontpage ORDER BY 1'), [
      ['1'],
      ['2'],
      ['3'],
      ['4']
    ])
    assert.deepEqual(
      rows(
        "SELECT item_id FROM sm.jos_workflow_associations WHERE extension='com_content.article' ORDER BY 1"
      ),
      [['1'], ['2'], ['3'], ['4']]
    )
    assert.deepEqual(rows('SELECT id, name FROM sm.jos_assets WHERE id >= 12 ORDER BY id'), [
      ['12', 'com_content.article.3'],
      ['13', 'com_content.article.4']
    ])
    assert.deepEqual(rows('SELECT link FROM sm.jos_menu WHERE id = 102'), [
      ['index.php?option=com_content&view=article&id=4']
    ])
    assert.deepEqual(
      rows("SELECT item_id FROM sm.jos_workflow_associations WHERE extension='com_other.thing'"),
      [['2']],
      'another extension’s row is not touched'
    )
    assert.ok(first.rebuild.includes('jos_assets'), 'the asset tree took rows: rebuilt')
    // The live site's "article created" log row follows the new number, and holds nothing.
    assert.deepEqual(first.held, [])
    assert.deepEqual(rows('SELECT item_id, extension FROM sm.jos_action_logs ORDER BY id'), [
      ['4', 'com_content.article'],
      ['42', 'com_users']
    ])

    // The customer edits their article on the live site (still number 3 there): the edit lands on 4.
    sql("UPDATE live.jos_content SET title='Spring sale — extended' WHERE id = 3")
    const second = sync()
    assert.deepEqual(second.renumbered, [])
    assert.deepEqual(second.kept ?? [], [])
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_content WHERE id IN (3, 4) ORDER BY id'), [
      ['3', 'Tracy news'],
      ['4', 'Spring sale — extended']
    ])

    // The live site's counter reaches 4 on its own: that record cannot have 4 — it is numbered again.
    sql(`USE live; ${article(4, 13, 'Autumn menu')}`)
    const third = sync()
    assert.deepEqual(
      third.renumbered.map((r) => [r.table, r.live, r.copy, r.why]),
      [
        ['content', 4, 5, 'occupied'],
        ['assets', 13, 14, 'occupied']
      ]
    )
    assert.deepEqual(rows('SELECT id, asset_id, title FROM sm.jos_content ORDER BY id'), [
      ['1', '10', 'Hello'],
      ['2', '11', 'About'],
      ['3', '12', 'Tracy news'],
      ['4', '13', 'Spring sale — extended'],
      ['5', '14', 'Autumn menu']
    ])
    assert.deepEqual(rows('SELECT name FROM sm.jos_assets WHERE id = 14'), [['com_content.article.5']])
    assert.deepEqual(
      rows('SELECT link FROM sm.jos_menu WHERE id = 102'),
      [['index.php?option=com_content&view=article&id=4']],
      'a link is moved once, not along the chain'
    )

    // And the customer deleting their first article on the live site deletes it here, under 4.
    sql(
      'USE live; DELETE FROM jos_content WHERE id = 3; DELETE FROM jos_content_frontpage WHERE content_id = 3;'
    )
    sync()
    assert.deepEqual(rows('SELECT id FROM sm.jos_content ORDER BY id'), [['1'], ['2'], ['3'], ['5']])

    // That delete left the live site's workflow row of article 3 behind (an orphan, as some real
    // sites have). The customer then makes article 5 (copy 6) and deletes it the same way: its
    // orphan row sits on 5, the number live article 4 moves to. The merge does not stop on it.
    sql(`USE live; ${article(5, 15, 'Gone soon')}`)
    sync()
    sql(
      'USE live; DELETE FROM jos_content WHERE id = 5; DELETE FROM jos_content_frontpage WHERE content_id = 5;'
    )
    sql("UPDATE live.jos_content SET title='Autumn menu — new dishes' WHERE id = 4")
    sync()
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_content ORDER BY id'), [
      ['1', 'Hello'],
      ['2', 'About'],
      ['3', 'Tracy news'],
      ['5', 'Autumn menu — new dishes']
    ])
    assert.deepEqual(
      rows(
        "SELECT item_id FROM sm.jos_workflow_associations WHERE extension='com_content.article' AND item_id IN (3, 5) ORDER BY 1"
      ),
      [['3'], ['5']],
      'Tracy’s article keeps its row, and live article 4 keeps its own under 5'
    )
  }
)

test(
  'an extension table both sites added to, or that points at a renumbered record, is held — never dropped',
  opts,
  () => {
    const ext = `CREATE TABLE jos_forms_entries (id INT AUTO_INCREMENT PRIMARY KEY, form VARCHAR(50), content_id INT);`
    for (const s of ['live', 'sm', 'sb'])
      sql(`DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${TABLES} ${ext}`)
    idMap = {}
    // Both add an entry 1 to an extension's table the adapter does not know.
    sql("USE sm; INSERT INTO jos_forms_entries VALUES (1, 'tracy test', NULL);")
    sql("USE live; INSERT INTO jos_forms_entries VALUES (1, 'customer order', NULL);")
    const held = sync()
    assert.deepEqual(held.kept ?? [], [])
    assert.deepEqual(
      held.held.map((h) => [h.id, h.reason]),
      [['db:jos_forms_entries:["1"]', 'added-both']]
    )

    // Both create article 3, and the customer's form entry points at their article 3 by `content_id`.
    for (const s of ['live', 'sm', 'sb'])
      sql(`DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${TABLES} ${ext}`)
    idMap = {}
    sql(`USE sm; ${article(3, 12, 'Tracy news')}`)
    sql(`USE live; ${article(3, 12, 'Spring sale')} INSERT INTO jos_forms_entries VALUES (5, 'signup', 3);`)
    const ref = sync()
    assert.deepEqual(
      ref.held.map((h) => [h.table, h.column, h.points_at, h.live, h.reason]),
      [['jos_forms_entries', 'content_id', 'content', 3, 'unhandled-reference']]
    )
  }
)

// #1560 · #1561: what Joomla 4/5 keeps beside an article — custom field values (their item as text),
// versions (`#__history`) and the 404 log (`#__redirect_links`) — on a real site, measured by QA.
const JOOMLA_LOGS = `
CREATE TABLE jos_fields (id INT AUTO_INCREMENT PRIMARY KEY, context VARCHAR(255), name VARCHAR(255));
CREATE TABLE jos_fields_values (field_id INT UNSIGNED NOT NULL, item_id VARCHAR(255) NOT NULL, value TEXT, KEY idx_field_id (field_id), KEY idx_item_id (item_id(191)));
CREATE TABLE jos_history (version_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, item_id VARCHAR(50) NOT NULL, version_note VARCHAR(255), editor_user_id INT UNSIGNED, version_data MEDIUMTEXT);
CREATE TABLE jos_redirect_links (id INT AUTO_INCREMENT PRIMARY KEY, old_url VARCHAR(2048), new_url VARCHAR(2048), hits INT);
CREATE TABLE jos_votes (id INT AUTO_INCREMENT PRIMARY KEY, item_id VARCHAR(20), stars INT);
CREATE TABLE jos_notes (id INT AUTO_INCREMENT PRIMARY KEY, item_id TEXT, note TEXT);
INSERT INTO jos_fields VALUES (2,'com_content.article','origin'),(5,'com_content.article','altitude'),(7,'com_contact.contact','phone');
INSERT INTO jos_fields_values VALUES (2,'1','Yirgacheffe'),(7,'3','555-0100');
INSERT INTO jos_history VALUES (1,'com_content.article.1','',42,'{}');
INSERT INTO jos_redirect_links VALUES (1,'/old-page','',3);
`

test(
  'field values, versions and 404 log rows follow a renumbered article; neither log holds the sync',
  opts,
  () => {
    for (const s of ['live', 'sm', 'sb'])
      sql(`DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${TABLES} ${JOOMLA_LOGS}`)
    idMap = {}
    // The copy: Tracy makes article 3 (a version of it, no field values) and logs a 404.
    sql(`USE sm; ${article(3, 12, 'Tracy news')}
       INSERT INTO jos_history VALUES (2,'com_content.article.3','',42,'{"title":"Tracy news"}');
       INSERT INTO jos_redirect_links VALUES (2,'/tracy-missing','',1);`)
    // The live site: the customer makes their own article 3 with two field values and a version,
    // and their visitors log another 404 under the same number.
    sql(`USE live; ${article(3, 12, 'Ethiopia beans')}
       INSERT INTO jos_fields_values VALUES (2,'3','Sidama'),(5,'3','2100');
       INSERT INTO jos_history VALUES (2,'com_content.article.3','',42,'{"title":"Ethiopia beans"}');
       INSERT INTO jos_redirect_links VALUES (2,'/customer-missing','',4);`)

    const first = sync()
    // Live's field values moved with its article; the contact's field on number 3 did not.
    assert.deepEqual(
      rows('SELECT field_id, item_id, value FROM sm.jos_fields_values ORDER BY field_id, item_id'),
      [
        ['2', '1', 'Yirgacheffe'],
        ['2', '4', 'Sidama'],
        ['5', '4', '2100'],
        ['7', '3', '555-0100']
      ]
    )
    assert.deepEqual(first.held, [], 'a version or a 404 never holds the sync')
    assert.deepEqual(first.kept ?? [], [])
    assert.deepEqual(
      first.renumbered.map((r) => [r.table, r.live, r.copy]),
      [
        ['content', 3, 4],
        ['history', 2, 3],
        ['redirect_links', 2, 3],
        ['assets', 12, 13]
      ]
    )
    assert.deepEqual(
      rows('SELECT version_id, item_id, version_data FROM sm.jos_history ORDER BY version_id'),
      [
        ['1', 'com_content.article.1', '{}'],
        ['2', 'com_content.article.3', '{"title":"Tracy news"}'],
        ['3', 'com_content.article.4', '{"title":"Ethiopia beans"}']
      ]
    )
    assert.deepEqual(rows('SELECT id, old_url FROM sm.jos_redirect_links ORDER BY id'), [
      ['1', '/old-page'],
      ['2', '/tracy-missing'],
      ['3', '/customer-missing']
    ])

    // The customer edits their article's field value later: it lands on 4, and nothing is held.
    sql("UPDATE live.jos_fields_values SET value='Sidama, Bensa' WHERE field_id=2 AND item_id='3'")
    const second = sync()
    assert.deepEqual(second.held, [])
    assert.deepEqual(
      rows('SELECT item_id, value FROM sm.jos_fields_values WHERE field_id=2 ORDER BY item_id'),
      [
        ['1', 'Yirgacheffe'],
        ['4', 'Sidama, Bensa']
      ]
    )

    // An extension's text column named like a reference, pointing at a renumbered article: held.
    for (const s of ['live', 'sm', 'sb'])
      sql(`DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${TABLES} ${JOOMLA_LOGS}`)
    idMap = {}
    sql(`USE sm; ${article(3, 12, 'Tracy news')}`)
    sql(
      `USE live; ${article(3, 12, 'Ethiopia beans')} INSERT INTO jos_votes VALUES (1,'3',5); INSERT INTO jos_notes VALUES (1,'3','tasting note');`
    )
    const voted = sync()
    assert.deepEqual(voted.held.map((h) => [h.table, h.column, h.points_at, h.live, h.reason]).sort(), [
      ['jos_notes', 'item_id', 'content', 3, 'unhandled-reference'],
      ['jos_votes', 'item_id', 'content', 3, 'unhandled-reference']
    ])
  }
)

/**
 * `IdMap.unhandled_refs` against the rule it replaced, spelled out here: per column named like a
 * reference in a table outside the adapter, per renumbered number, `COUNT(*) WHERE col = n` on the
 * live read and on the base (0 where the base lacks the table), held where the live read has more.
 * The engine asks it in one grouped call; the answer must be the same, entry for entry, in order.
 */
const COUNTS_BY_NUMBER = `
import importlib.util, json, sys, time
spec = importlib.util.spec_from_file_location("live_sync", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sql = m.Sql(json.loads(sys.argv[2]))
ids = m.IdMap(sql, "wp_", m.POLICIES["wordpress"]["entities"], {})
ids.REF_NAME = m.POLICIES["wordpress"]["refName"]
pairs = [(n, 100000 + n) for n in json.loads(sys.argv[3])]
started, calls = time.monotonic(), sql.calls
got = ids.unhandled_refs("rb", "rt", "posts", pairs)
grouped = {"seconds": time.monotonic() - started, "calls": sql.calls - calls}
cols, in_base = ids.ref_columns("rb", "rt")
want = []
for tbl, col, kind in cols:
    for old, _ in pairs:
        value = m.sql_str(str(old)) if kind in ids.TEXT_TYPES else str(old)
        n_t = int(sql.run(f"SELECT COUNT(*) FROM rt.{m.q(tbl)} WHERE {m.q(col)} = {value};")[0][0])
        n_b = int(sql.run(f"SELECT COUNT(*) FROM rb.{m.q(tbl)} WHERE {m.q(col)} = {value};")[0][0]) if tbl in in_base else 0
        if n_t > n_b:
            want.append({"id": f"held:{tbl}.{col}={old}", "kind": "reference", "table": tbl, "column": col,
                         "points_at": "posts", "live": old, "rows": n_t - n_b, "reason": "unhandled-reference"})
sql.close()
print(json.dumps({"got": got, "want": want, "cols": cols, "grouped": grouped}))
`

test(
  'references from tables outside the adapter are counted in one grouped call, with the same answer as one count per number',
  opts,
  () => {
    // A WordPress site's plugin tables, numbers 1..700 spread over them; the base holds fewer of
    // some, none of one table. Text columns hold numbers as text, padded, with a prefix, or not at all.
    let seed = 7
    const next = (n) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    const textOf = (n) => [String(n), ` ${n}`, `${n} `, `0${n}`, `${n}abc`, 'none'][next(6)]
    const tables = (rows) => `
      CREATE TABLE wp_wc_product_meta_lookup (product_id BIGINT NOT NULL, sku VARCHAR(100));
      CREATE TABLE wp_yoast_indexable (id INT AUTO_INCREMENT PRIMARY KEY, object_id BIGINT, author_id BIGINT, post_parent BIGINT);
      CREATE TABLE wp_plugin_notes (note_id INT, post_id VARCHAR(20), attachment_id TEXT, note TEXT) COLLATE utf8mb4_unicode_520_ci;
      CREATE TABLE wp_comment_votes (comment_id INT, votes INT);
      ${rows}`
    const insert = (count) =>
      [
        `INSERT INTO wp_wc_product_meta_lookup VALUES ${Array.from({ length: count }, () => `(${next(700) + 1}, 'sku')`).join(',')};`,
        `INSERT INTO wp_yoast_indexable (object_id, author_id, post_parent) VALUES ${Array.from({ length: count * 3 }, () => `(${next(700) + 1}, ${next(5) + 1}, ${next(700)})`).join(',')};`,
        `INSERT INTO wp_plugin_notes VALUES ${Array.from({ length: count }, (_, i) => `(${i}, '${textOf(next(700) + 1)}', ${next(4) ? `'${textOf(next(700) + 1)}'` : 'NULL'}, 'n')`).join(',')};`,
        `INSERT INTO wp_comment_votes VALUES ${Array.from({ length: count }, () => `(${next(700) + 1}, 1)`).join(',')};`
      ].join('\n')
    sql(`DROP DATABASE IF EXISTS rb; CREATE DATABASE rb; USE rb; ${tables(insert(600))}`)
    sql(
      `DROP DATABASE IF EXISTS rt; CREATE DATABASE rt; USE rt; ${tables(insert(1000))}
       CREATE TABLE wp_only_live (user_id INT, order_id VARCHAR(10));
       INSERT INTO wp_only_live VALUES ${Array.from({ length: 300 }, () => `(${next(700) + 1}, '${next(700) + 1}')`).join(',')};`
    )
    // More numbers than one IN list holds (REF_CHUNK, 500).
    const numbers = Array.from({ length: 640 }, (_, i) => i + 1)
    const done = spawnSync(
      'python3',
      ['-c', COUNTS_BY_NUMBER, ENGINE, JSON.stringify(CLIENT), JSON.stringify(numbers)],
      { encoding: 'utf8', maxBuffer: 1 << 28 }
    )
    assert.equal(done.status, 0, done.stderr)
    const { got, want, cols, grouped } = JSON.parse(done.stdout)
    assert.deepEqual(
      cols.map(([t, c]) => `${t}.${c}`),
      [
        'wp_comment_votes.comment_id',
        'wp_only_live.user_id',
        'wp_only_live.order_id',
        'wp_plugin_notes.post_id',
        'wp_plugin_notes.attachment_id',
        'wp_wc_product_meta_lookup.product_id',
        'wp_yoast_indexable.object_id',
        'wp_yoast_indexable.author_id'
      ]
    )
    assert.ok(
      want.length > 500 && want.some((h) => h.table === 'wp_plugin_notes'),
      `a fixture that holds many: ${want.length}`
    )
    assert.deepEqual(got, want)
    // One call for the counts (the column listing was read for the reference too, before).
    assert.ok(grouped.calls <= 2, JSON.stringify(grouped))
  }
)

test(
  'a remembered number whose live record is gone never stands for the live record now created under its copy number',
  opts,
  () => {
    for (const s of ['live', 'sm', 'sb'])
      sql(`DROP DATABASE IF EXISTS ${s}; CREATE DATABASE ${s}; USE ${s}; ${TABLES}`)
    idMap = {}
    // Both make article 3: the live one comes over as 4 and is remembered (3 → 4).
    sql(`USE sm; ${article(3, 12, 'Tracy news')}`)
    sql(`USE live; ${article(3, 12, 'Spring sale')}`)
    sync()
    assert.deepEqual(idMap.content, { 3: 4 })
    // The customer deletes it: gone from the copy too, and 3 → 4 now names a record no read has.
    sql(
      'USE live; DELETE FROM jos_content WHERE id = 3; DELETE FROM jos_content_frontpage WHERE content_id = 3;' +
        " DELETE FROM jos_workflow_associations WHERE item_id = 3 AND extension = 'com_content.article';" +
        ' DELETE FROM jos_assets WHERE id = 12;'
    )
    sync()
    assert.deepEqual(rows('SELECT id FROM sm.jos_content ORDER BY id'), [['1'], ['2'], ['3']])
    // Then both make a new article under 4 (S5 on dev, 24/10/2026): the live one is numbered again,
    // said as live 4, and remembered under 4 — not under the 3 that pointed at 4 before.
    sql(`USE sm; ${article(4, 20, 'Tracy recipes')}`)
    sql(`USE live; ${article(4, 21, 'Live S5')}`)
    const both = sync()
    assert.deepEqual(
      both.renumbered.filter((r) => r.table === 'content').map((r) => [r.live, r.copy, r.why]),
      [[4, 5, 'created-on-both']]
    )
    assert.equal(idMap.content['4'], 5, JSON.stringify(idMap))
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_content WHERE id >= 4 ORDER BY id'), [
      ['4', 'Tracy recipes'],
      ['5', 'Live S5']
    ])
    // The customer's later edit of their article lands on it, and Tracy's article stays as it is.
    sql("UPDATE live.jos_content SET title='Live S5 — edited' WHERE id = 4")
    const edit = sync()
    assert.deepEqual(edit.conflicts, [])
    assert.deepEqual(rows('SELECT id, title FROM sm.jos_content WHERE id >= 4 ORDER BY id'), [
      ['4', 'Tracy recipes'],
      ['5', 'Live S5 — edited']
    ])
  }
)
