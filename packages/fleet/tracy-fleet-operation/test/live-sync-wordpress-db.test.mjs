/**
 * WordPress's reads made comparable, against a real database (`scripts/lib/live_sync_wordpress.py`
 * `rewrite_address`, `scripts/lib/live_sync.py` `IdMap.renumber`): what the server now does itself
 * must be what the value-by-value rewrite in Python did. Every value ends as `replace_value` makes
 * it — plain text replaced by the server, serialized PHP walked in Python — and links renumbered
 * through the rows found once end as the statements over the whole table left them.
 *
 * `mariadb:11` in a container of its own; SKIPPED where no docker daemon answers.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-sync-wordpress-db.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'lib')
const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0
const DB_CONTAINER = `tracy-live-sync-wp-db-test-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the rewrite needs a real MariaDB' }
const CLIENT = [REAL_DOCKER, 'exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot']

const sql = (script) =>
  execFileSync(CLIENT[0], [...CLIENT.slice(1), '-N', '-B'], { input: script, encoding: 'utf8' }).trim()

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

/** Python with the engine loaded and a client on the test's database; the script's stdout back. */
const py = (body) => {
  const done = spawnSync(
    'python3',
    [
      '-c',
      `import importlib.util, json, sys
sys.path.insert(0, ${JSON.stringify(LIB)})
spec = importlib.util.spec_from_file_location("live_sync", ${JSON.stringify(join(LIB, 'live_sync.py'))})
engine = importlib.util.module_from_spec(spec); spec.loader.exec_module(engine)
wp = engine._WORDPRESS
sql = engine.Sql(json.loads(${JSON.stringify(JSON.stringify(CLIENT))}))
${body}
sql.close()`
    ],
    { encoding: 'utf8', maxBuffer: 1 << 26 }
  )
  assert.equal(done.status, 0, done.stderr)
  return done.stdout
}

const OLD = 'https://shop.example'
const NEW = 'https://shop-com.tracy.ai'

test(
  'every value holding the live address ends as replace_value makes it, guid and NULL untouched',
  opts,
  () => {
    sql(`DROP DATABASE IF EXISTS rw; CREATE DATABASE rw CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci; USE rw;
CREATE TABLE wp_posts (ID bigint PRIMARY KEY, post_content longtext, post_excerpt text, guid varchar(255));
CREATE TABLE wp_options (option_id bigint PRIMARY KEY, option_name varchar(191), option_value longtext);
CREATE TABLE wp_latin (id int PRIMARY KEY, v text CHARACTER SET latin1);
CREATE TABLE wp_nokey (v text);`)
    // Values of every kind the rewrite meets: plain, serialized (nested, objects, a wrong length that
    // only looks serialized), JSON with escaped slashes, multibyte text, the address twice, upper case,
    // NULL; a row whose two columns take the two different paths.
    const ser = (s) => `s:${Buffer.byteLength(s)}:"${s}";`
    const values = [
      `<p><a href="${OLD}/a">a</a> and ${OLD}/b</p>`,
      `a:2:{s:3:"url";${ser(`${OLD}/x`)}s:1:"n";i:3;}`,
      `a:1:{i:0;${ser(`a:1:{s:1:"u";${ser(`${OLD}/deep`)}}`)}}`,
      `O:8:"stdClass":1:{s:4:"logo";${ser(`${OLD}/logo.png`)}}`,
      `a:1:{s:3:"url";s:99:"${OLD}/wrong-length";}`,
      `s:5:"not really serialized ${OLD}`,
      `[{"url":"${OLD.replace(/\//g, '\\/')}\\/x","u":"${OLD}/y"}]`,
      `Tiếng Việt ${OLD}/đường-dẫn ✓`,
      `${OLD.toUpperCase()}/stays`,
      `nothing to see`,
      null
    ]
    const lit = (v) => (v === null ? 'NULL' : `X'${Buffer.from(v).toString('hex')}'`)
    sql(
      `USE rw; INSERT INTO wp_posts VALUES ${values.map((v, i) => `(${i + 1}, ${lit(v)}, ${lit(values[(i + 1) % values.length])}, '${OLD}/?p=${i + 1}')`).join(',')};
INSERT INTO wp_options VALUES (1, 'home', '${OLD}'), ${values.map((v, i) => `(${i + 2}, 'o${i}', ${lit(v ?? '')})`).join(',')};
INSERT INTO wp_latin VALUES (1, '${OLD}/latin'), (2, 'caf\\xe9');
INSERT INTO wp_nokey VALUES ('${OLD}/nokey'), (NULL);`
    )
    const dump = (schema) =>
      sql(`SELECT 'posts', ID, HEX(post_content), HEX(post_excerpt), HEX(guid) FROM ${schema}.wp_posts
         UNION ALL SELECT 'options', option_id, HEX(option_name), HEX(option_value), '' FROM ${schema}.wp_options
         UNION ALL SELECT 'latin', id, HEX(v), '', '' FROM ${schema}.wp_latin ORDER BY 1, 2`)
    const before = dump('rw')
    const said = JSON.parse(
      py(`print(json.dumps(wp.rewrite_address(sql, "rw", ${JSON.stringify(OLD)}, ${JSON.stringify(NEW)})))`)
    )
    const after = dump('rw')
    // What each value must be: replace_value of its bytes (guid left alone), computed in Python.
    const expected = py(`
import sys
old, new = ${JSON.stringify(OLD)}.encode(), ${JSON.stringify(NEW)}.encode()
for line in sys.stdin.read().splitlines() if False else ${JSON.stringify(before)}.splitlines():
    kind, key, *cols = line.split("\\t")
    out = []
    for i, c in enumerate(cols):
        if c in ("NULL", "") or (kind == "posts" and i == 2) or (kind == "options" and i == 0):
            out.append(c)
        else:
            out.append(wp.replace_value(bytes.fromhex(c), old, new).hex().upper())
    print("\\t".join([kind, key, *out]))`).trim()
    assert.equal(after, expected)
    assert.notEqual(after, before)
    const changed = before.split('\n').filter((l, i) => l !== after.split('\n')[i]).length
    assert.equal(said.rows, changed + 1, 'rows counted as changed: these, and the table without a key')
    assert.equal(sql("SELECT GROUP_CONCAT(IFNULL(v, 'NULL')) FROM rw.wp_nokey"), `${NEW}/nokey,NULL`)
  }
)

test(
  'links renumbered through the rows found once end as the statements over every row left them',
  opts,
  () => {
    const setup = (schema) =>
      sql(`DROP DATABASE IF EXISTS ${schema}; CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci; USE ${schema};
CREATE TABLE wp_posts (ID bigint PRIMARY KEY, post_content longtext, guid varchar(255), post_parent bigint DEFAULT 0);
INSERT INTO wp_posts VALUES ${Array.from({ length: 300 }, (_, i) => {
        const id = i + 1
        // Posts 101.. are the live site's renumbered ones; others point at them, at neighbours whose
        // numbers only start alike (1010, 10100), or at nothing.
        const at = 101 + (i % 70)
        return `(${id}, '<img class="wp-image-${at}"/><!-- wp:block {"ref":${at}} /--> {"id":${at * 10}} wp-image-${at}0 ${id % 3 ? '' : 'plain'}', 'https://shop.example/?p=${id}', 0)`
      }).join(',')};`)
    setup('ra')
    setup('rb')
    // 60 posts: more links of a column than one statement takes (IdMap.TEXT_NEST), as a chain
    // (101 → 102 while 102 → 103 …), its last onto a free number.
    const pairs = JSON.stringify([...Array.from({ length: 59 }, (_, i) => [101 + i, 102 + i]), [160, 401]])
    py(`
rule = dict(wp.POLICY["entities"])["posts"]
pairs = [tuple(p) for p in json.loads(${JSON.stringify(pairs)})]
fast = engine.IdMap(sql, "wp_", wp.POLICY["entities"], {})
seen, run = [], sql.run
sql.run = lambda script: (seen.append(script), run(script))[1]
fast.renumber("ra", "posts", rule, pairs)
sql.run = run
assert any("CREATE TEMPORARY TABLE" in script for script in seen), "the rows were found once"
whole = engine.IdMap(sql, "wp_", wp.POLICY["entities"], {})
whole.primary_key = lambda schema, table: None
whole.renumber("rb", "posts", rule, pairs)`)
    const content = (schema) =>
      sql(`SELECT ID, HEX(post_content), HEX(guid) FROM ${schema}.wp_posts ORDER BY ID`)
    const fast = content('ra')
    assert.equal(fast, content('rb'))
    assert.match(sql('SELECT post_content FROM ra.wp_posts WHERE ID = 1'), /wp-image-102"/)
    assert.doesNotMatch(fast, /74726163792d73796e632d686f6c64/i, 'no holding link left (tracy-sync-hold)')
  }
)

function orderRecordMerge({
  type = 'shop_order_placehold',
  ours = '',
  theirs = '',
  decisions = {},
  extraSql = ''
}) {
  sql(
    ['wc_b', 'wc_m', 'wc_t', 'wc_w']
      .map(
        (schema) => `DROP DATABASE IF EXISTS ${schema};
    CREATE DATABASE ${schema}; USE ${schema};
    CREATE TABLE wp_posts (ID bigint NOT NULL PRIMARY KEY, post_type varchar(30), post_title varchar(100), post_content text);
    INSERT INTO wp_posts VALUES (1, '${type}', 'Original', 'Body'), (2, 'page', 'Other', 'Other body');
    ALTER TABLE wp_posts ADD post_status varchar(20) NOT NULL DEFAULT 'publish';
    ${extraSql}`
      )
      .join('\n') + `\nUSE wc_m; ${ours}\nUSE wc_t; ${theirs}`
  )
  return JSON.parse(
    py(`result = engine.DbMerge(sql, 'wc_b', 'wc_m', 'wc_t', 'wc_w', 'wordpress', 'wp_',
    json.loads(${JSON.stringify(JSON.stringify(decisions))})).run()
print(json.dumps(result))`)
  )
}

for (const rowMerge of [false, true]) {
  test(
    `WooCommerce record counts preserve data across placeholder changes and type transitions (${rowMerge ? 'row merge' : 'whole table'})`,
    opts,
    () => {
      const copyEdit = rowMerge ? "UPDATE wp_posts SET post_title='Copy edit' WHERE ID=2;" : ''
      const cases = [
        {
          type: 'post',
          change: "UPDATE wp_posts SET post_title='Live edit' WHERE ID=1;",
          count: 1,
          result: 'post'
        },
        { type: 'post', change: 'DELETE FROM wp_posts WHERE ID=1;', count: 1, result: '' },
        {
          type: 'post',
          change:
            "INSERT INTO wp_posts (ID, post_type, post_title, post_content) VALUES (3, 'shop_order', 'Legacy order', '');",
          count: 1,
          result: 'post'
        },
        {
          type: 'shop_order_placehold',
          change: "UPDATE wp_posts SET post_title='Live edit' WHERE ID=1;",
          count: 0,
          result: 'shop_order_placehold'
        },
        { type: 'shop_order_placehold', change: 'DELETE FROM wp_posts WHERE ID=1;', count: 0, result: '' },
        {
          type: 'shop_order_placehold',
          change: "UPDATE wp_posts SET post_type='post' WHERE ID=1;",
          count: 1,
          result: 'post'
        },
        {
          type: 'post',
          change: "UPDATE wp_posts SET post_type='shop_order_placehold' WHERE ID=1;",
          count: 1,
          result: 'shop_order_placehold'
        },
        {
          type: 'shop_order',
          change: "UPDATE wp_posts SET post_title='Live edit' WHERE ID=1;",
          count: 1,
          result: 'shop_order'
        },
        {
          type: 'post',
          change:
            "INSERT INTO wp_posts (ID, post_type, post_title, post_content) VALUES (3, 'shop_order_placehold', 'New placeholder', '');",
          count: 0,
          result: 'post'
        }
      ]
      for (const entry of cases) {
        const answer = orderRecordMerge({ type: entry.type, ours: copyEdit, theirs: entry.change })
        assert.equal(answer.counts.records, entry.count, JSON.stringify({ entry, answer }))
        assert.deepEqual(answer.conflicts, [])
        assert.equal(sql('SELECT post_type FROM wc_m.wp_posts WHERE ID=1'), entry.result)
        assert.equal(answer.tables.wp_posts, rowMerge ? 'merged' : 'from-theirs')
        if (entry.change.includes("'New placeholder'"))
          assert.equal(sql('SELECT post_type FROM wc_m.wp_posts WHERE ID=3'), 'shop_order_placehold')
      }
    }
  )
}

test('WooCommerce record counts read the actual merged type when the copy alone changed it', opts, () => {
  for (const [before, after, count] of [
    ['post', 'shop_order_placehold', 0],
    ['shop_order_placehold', 'post', 1]
  ]) {
    const answer = orderRecordMerge({
      type: before,
      ours: `UPDATE wp_posts SET post_type='${after}' WHERE ID=1;`,
      theirs: "UPDATE wp_posts SET post_title='Live title' WHERE ID=1;"
    })
    assert.equal(answer.counts.records, count, JSON.stringify(answer))
    assert.equal(sql('SELECT post_type FROM wc_m.wp_posts WHERE ID=1'), after)
    assert.equal(sql('SELECT post_title FROM wc_m.wp_posts WHERE ID=1'), 'Live title')
  }
})

test(
  'WooCommerce placeholder delete-modify decisions count only visible records actually taken',
  opts,
  () => {
    for (const type of ['post', 'shop_order_placehold']) {
      for (const deleted of ['ours', 'theirs']) {
        for (const choice of ['ours', 'theirs']) {
          const editing = "UPDATE wp_posts SET post_title='Edited' WHERE ID=1;"
          const removing = 'DELETE FROM wp_posts WHERE ID=1;'
          const answer = orderRecordMerge({
            type,
            ours: deleted === 'ours' ? removing : editing,
            theirs: deleted === 'theirs' ? removing : editing,
            decisions: { 'db:wp_posts:["1"]': choice }
          })
          assert.equal(
            answer.counts.records,
            choice === 'theirs' && type === 'post' ? 1 : 0,
            JSON.stringify({ type, deleted, choice, answer })
          )
          assert.deepEqual(answer.conflicts, [])
          assert.equal(sql('SELECT COUNT(*) FROM wc_m.wp_posts WHERE ID=1'), choice === deleted ? '0' : '1')
        }
      }
    }
  }
)

test(
  'WooCommerce counts use post-type column decisions after merging an independent live title',
  opts,
  () => {
    for (const choice of ['ours', 'theirs']) {
      const answer = orderRecordMerge({
        type: 'post',
        ours: "UPDATE wp_posts SET post_type='shop_order_placehold' WHERE ID=1;",
        theirs: "UPDATE wp_posts SET post_type='page', post_title='Live title' WHERE ID=1;",
        decisions: { 'db:wp_posts:["1"]:post_type': choice }
      })
      assert.equal(answer.counts.records, choice === 'theirs' ? 1 : 0, JSON.stringify(answer))
      assert.deepEqual(answer.conflicts, [])
      assert.equal(
        sql('SELECT post_type FROM wc_m.wp_posts WHERE ID=1'),
        choice === 'theirs' ? 'page' : 'shop_order_placehold'
      )
      assert.equal(sql('SELECT post_title FROM wc_m.wp_posts WHERE ID=1'), 'Live title')
    }
  }
)

const WC_COUNT_STORAGE = (enabled) => `
  CREATE TABLE wp_options (option_id bigint PRIMARY KEY, option_name varchar(191), option_value longtext);
  ${enabled === null ? '' : `INSERT INTO wp_options VALUES (1, 'woocommerce_custom_orders_table_enabled', '${enabled}');`}
  CREATE TABLE wp_wc_orders (id bigint PRIMARY KEY, status varchar(30));
  INSERT INTO wp_wc_orders VALUES (1, 'wc-processing');`

test('WooCommerce only counts its configured root store while still merging backup changes', opts, () => {
  for (const enabled of ['yes', 'no', null]) {
    for (const changed of ['posts', 'orders']) {
      const theirs =
        changed === 'posts'
          ? "UPDATE wp_posts SET post_title='Backup changed' WHERE ID=1;"
          : "UPDATE wp_wc_orders SET status='wc-completed' WHERE id=1;"
      const answer = orderRecordMerge({ type: 'shop_order', extraSql: WC_COUNT_STORAGE(enabled), theirs })
      assert.equal(
        answer.counts.records,
        (enabled === 'yes') === (changed === 'orders') ? 1 : 0,
        JSON.stringify({ enabled, changed, answer })
      )
      assert.equal(
        sql('SELECT post_title FROM wc_m.wp_posts WHERE ID=1'),
        changed === 'posts' ? 'Backup changed' : 'Original'
      )
      assert.equal(
        sql('SELECT status FROM wc_m.wp_wc_orders WHERE id=1'),
        changed === 'orders' ? 'wc-completed' : 'wc-processing'
      )
    }
  }
  // A normal post is still a record even if an order happens to use the same number.
  const ordinary = orderRecordMerge({
    type: 'post',
    extraSql: WC_COUNT_STORAGE('yes'),
    theirs: "UPDATE wp_posts SET post_title='Real post edit' WHERE ID=1;"
  })
  assert.equal(ordinary.counts.records, 1)
  assert.equal(sql('SELECT post_title FROM wc_m.wp_posts WHERE ID=1'), 'Real post edit')
})

test('WooCommerce storage mode transitions keep per-table counting and preserve both stores', opts, () => {
  const answer = orderRecordMerge({
    type: 'shop_order',
    extraSql: WC_COUNT_STORAGE('no'),
    theirs: `UPDATE wp_options SET option_value='yes' WHERE option_name='woocommerce_custom_orders_table_enabled';
      UPDATE wp_posts SET post_title='Post edit' WHERE ID=1;
      UPDATE wp_wc_orders SET status='wc-completed' WHERE id=1;`
  })
  assert.equal(answer.counts.records, 3, JSON.stringify(answer))
  assert.equal(sql('SELECT post_title FROM wc_m.wp_posts WHERE ID=1'), 'Post edit')
  assert.equal(sql('SELECT status FROM wc_m.wp_wc_orders WHERE id=1'), 'wc-completed')
})

test('WooCommerce compatibility refunds count once and a missing root table keeps the fallback', opts, () => {
  for (const enabled of ['yes', 'no']) {
    const answer = orderRecordMerge({
      type: 'shop_order_refund',
      extraSql: WC_COUNT_STORAGE(enabled),
      theirs:
        "UPDATE wp_posts SET post_title='Refund edit' WHERE ID=1; UPDATE wp_wc_orders SET status='wc-refunded' WHERE id=1;"
    })
    assert.equal(answer.counts.records, 1, JSON.stringify(answer))
    assert.equal(sql('SELECT post_type FROM wc_m.wp_posts WHERE ID=1'), 'shop_order_refund')
    assert.equal(sql('SELECT status FROM wc_m.wp_wc_orders WHERE id=1'), 'wc-refunded')
  }
  const missing = orderRecordMerge({
    type: 'shop_order',
    extraSql: WC_COUNT_STORAGE('yes'),
    theirs: "DROP TABLE wp_wc_orders; UPDATE wp_posts SET post_title='Kept fallback edit' WHERE ID=1;"
  })
  assert.equal(missing.counts.records, 1)
  assert.equal(sql('SELECT post_title FROM wc_m.wp_posts WHERE ID=1'), 'Kept fallback edit')
})

function counterMerge({ ours = '', theirs = '', decisions = {} }) {
  sql(
    ['cnt_b', 'cnt_m', 'cnt_t', 'cnt_w']
      .map(
        (schema) => `
    DROP DATABASE IF EXISTS ${schema}; CREATE DATABASE ${schema}; USE ${schema};
    CREATE TABLE wp_posts (ID bigint NOT NULL PRIMARY KEY, post_type varchar(30), post_status varchar(20), post_title varchar(100), comment_count bigint DEFAULT 0);
    INSERT INTO wp_posts VALUES (1, 'post', 'publish', 'First', 0), (2, 'post', 'publish', 'Second', 0);
    CREATE TABLE wp_term_taxonomy (term_taxonomy_id bigint NOT NULL PRIMARY KEY, term_id bigint, taxonomy varchar(30), count bigint);
    INSERT INTO wp_term_taxonomy VALUES (1, 1, 'category', 0);
    CREATE TABLE wp_term_relationships (object_id bigint NOT NULL, term_taxonomy_id bigint NOT NULL, term_order int DEFAULT 0, PRIMARY KEY (object_id, term_taxonomy_id));
    INSERT INTO wp_term_relationships VALUES (1, 1, 0);
    CREATE TABLE wp_comments (comment_ID bigint NOT NULL PRIMARY KEY, comment_post_ID bigint, comment_approved varchar(20), comment_content text);
    INSERT INTO wp_comments VALUES (1, 1, '1', 'Original');
  `
      )
      .join('\n') + `USE cnt_m; ${ours}\nUSE cnt_t; ${theirs}`
  )
  return JSON.parse(
    py(`print(json.dumps(engine.DbMerge(sql, 'cnt_b', 'cnt_m', 'cnt_t', 'cnt_w', 'wordpress', 'wp_',
    json.loads(${JSON.stringify(JSON.stringify(decisions))})).run()))`)
  )
}

for (const rowMerge of [false, true]) {
  test(
    `WordPress counters follow dependency mutations (${rowMerge ? 'row merge' : 'whole table'})`,
    opts,
    () => {
      const cases = [
        {
          table: 'term_relationships',
          change: 'INSERT INTO wp_term_relationships VALUES (2, 1, 0);',
          copy: 'UPDATE wp_term_relationships SET term_order=2 WHERE object_id=1;',
          rebuild: ['wp_term_taxonomy'],
          check: 'SELECT COUNT(*) FROM cnt_m.wp_term_relationships',
          value: '2'
        },
        {
          table: 'term_relationships',
          change: 'DELETE FROM wp_term_relationships WHERE object_id=1;',
          copy: 'INSERT INTO wp_term_relationships VALUES (2, 1, 0);',
          rebuild: ['wp_term_taxonomy'],
          check: 'SELECT GROUP_CONCAT(object_id) FROM cnt_m.wp_term_relationships',
          value: rowMerge ? '2' : 'NULL'
        },
        {
          table: 'posts',
          change: "UPDATE wp_posts SET post_status='draft' WHERE ID=1;",
          copy: "UPDATE wp_posts SET post_title='Copy' WHERE ID=2;",
          rebuild: ['wp_posts', 'wp_term_taxonomy'],
          check: 'SELECT post_status FROM cnt_m.wp_posts WHERE ID=1',
          value: 'draft'
        },
        {
          table: 'posts',
          change: "UPDATE wp_posts SET post_type='page' WHERE ID=1;",
          copy: "UPDATE wp_posts SET post_title='Copy' WHERE ID=2;",
          rebuild: ['wp_posts', 'wp_term_taxonomy'],
          check: 'SELECT post_type FROM cnt_m.wp_posts WHERE ID=1',
          value: 'page'
        },
        {
          table: 'comments',
          change: "INSERT INTO wp_comments VALUES (2, 1, '1', 'Added');",
          copy: "UPDATE wp_comments SET comment_content='Copy' WHERE comment_ID=1;",
          rebuild: ['wp_posts'],
          check: 'SELECT COUNT(*) FROM cnt_m.wp_comments',
          value: '2'
        },
        {
          table: 'comments',
          change: 'DELETE FROM wp_comments WHERE comment_ID=1;',
          copy: "INSERT INTO wp_comments VALUES (2, 1, '1', 'Copy');",
          rebuild: ['wp_posts'],
          check: 'SELECT GROUP_CONCAT(comment_ID) FROM cnt_m.wp_comments',
          value: rowMerge ? '2' : 'NULL'
        },
        {
          table: 'comments',
          change: "UPDATE wp_comments SET comment_approved='0' WHERE comment_ID=1;",
          copy: "INSERT INTO wp_comments VALUES (2, 2, '1', 'Copy');",
          rebuild: ['wp_posts'],
          check: 'SELECT comment_approved FROM cnt_m.wp_comments WHERE comment_ID=1',
          value: '0'
        }
      ]
      for (const c of cases) {
        const result = counterMerge({ ours: rowMerge ? c.copy : '', theirs: c.change })
        assert.equal(sql(c.check), c.value, c.change)
        assert.deepEqual(result.rebuild, c.rebuild, `${c.table}: ${c.change}`)
      }
    }
  )
}

test('WordPress counter dependencies keep decisions and missing target tables safe', opts, () => {
  const conflict = {
    ours: "UPDATE wp_comments SET comment_approved='spam' WHERE comment_ID=1;",
    theirs: "UPDATE wp_comments SET comment_approved='0' WHERE comment_ID=1;"
  }
  const kept = counterMerge(conflict)
  assert.equal(sql('SELECT comment_approved FROM cnt_m.wp_comments WHERE comment_ID=1'), 'spam')
  assert.deepEqual(kept.rebuild, [])
  const taken = counterMerge({
    ...conflict,
    decisions: { 'db:wp_comments:["1"]:comment_approved': 'theirs' }
  })
  assert.equal(sql('SELECT comment_approved FROM cnt_m.wp_comments WHERE comment_ID=1'), '0')
  assert.deepEqual(taken.rebuild, ['wp_posts'])
  const dropped = counterMerge({ theirs: 'DROP TABLE wp_term_taxonomy; DROP TABLE wp_term_relationships;' })
  assert.equal(
    sql(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cnt_m' AND table_name='wp_term_taxonomy'"
    ),
    '0'
  )
  assert.deepEqual(dropped.rebuild, [])
})

test(
  'theme mod references renumber by entity and path without changing dimensions or cascading IDs',
  opts,
  () => {
    sql(`DROP DATABASE IF EXISTS tm; CREATE DATABASE tm; USE tm;
CREATE TABLE wp_posts (ID bigint PRIMARY KEY);
CREATE TABLE wp_terms (term_id bigint PRIMARY KEY);
CREATE TABLE wp_options (option_id bigint PRIMARY KEY, option_name varchar(191), option_value longtext);
INSERT INTO wp_posts VALUES (64), (67); INSERT INTO wp_terms VALUES (64);`)
    const mods =
      'a:5:{s:11:"custom_logo";i:64;s:18:"custom_css_post_id";s:2:"67";s:17:"header_image_data";O:8:"stdClass":3:{s:13:"attachment_id";i:67;s:5:"width";i:64;s:6:"height";i:67;}s:18:"nav_menu_locations";a:1:{s:7:"primary";i:64;}s:5:"width";i:64;}'
    sql(`INSERT INTO tm.wp_options VALUES(1,'theme_mods_test',X'${Buffer.from(mods).toString('hex')}')`)
    py(`
mapper = engine.IdMap(sql, "wp_", wp.POLICY["entities"], {})
rules = dict(wp.POLICY["entities"])
mapper.renumber("tm", "posts", rules["posts"], [(64, 67), (67, 70)])
mapper.renumber("tm", "terms", rules["terms"], [(64, 90)])`)
    const expected = mods
      .replace('s:11:"custom_logo";i:64;', 's:11:"custom_logo";i:67;')
      .replace('s:18:"custom_css_post_id";s:2:"67";', 's:18:"custom_css_post_id";s:2:"70";')
      .replace('s:13:"attachment_id";i:67;', 's:13:"attachment_id";i:70;')
      .replace('s:7:"primary";i:64;', 's:7:"primary";i:90;')
    assert.equal(
      Buffer.from(sql('SELECT HEX(option_value) FROM tm.wp_options WHERE option_id=1'), 'hex').toString(),
      expected
    )
    assert.equal(sql('SELECT GROUP_CONCAT(ID ORDER BY ID) FROM tm.wp_posts'), '67,70')
  }
)

test('serialized-only theme references reserve fresh IDs and receive remembered mappings', opts, () => {
  sql(`DROP DATABASE IF EXISTS td; CREATE DATABASE td; USE td;
CREATE TABLE wp_posts (ID bigint PRIMARY KEY); INSERT INTO wp_posts VALUES (64);
CREATE TABLE wp_options (option_id bigint PRIMARY KEY, option_name varchar(191), option_value longtext);`)
  const mods = 'a:1:{s:11:"custom_logo";i:1000;}'
  sql(`INSERT INTO td.wp_options VALUES(1,'theme_mods_test',X'${Buffer.from(mods).toString('hex')}')`)
  const result = JSON.parse(
    py(`
mapper = engine.IdMap(sql, "wp_", wp.POLICY["entities"], {"posts": {"1000": 1001}})
mapper.survey(["td"])
fresh = mapper.fresh("posts", set())
refs = sorted(mapper.referenced("td", dict(wp.POLICY["entities"])["posts"]))
mapper.apply("td")
print(json.dumps({"fresh": fresh, "refs": refs}))`)
  )
  assert.ok(result.fresh > 1000)
  assert.deepEqual(result.refs, [1000])
  assert.equal(
    Buffer.from(sql('SELECT HEX(option_value) FROM td.wp_options'), 'hex').toString(),
    mods.replace('i:1000;', 'i:1001;')
  )
  assert.equal(sql('SELECT ID FROM td.wp_posts'), '64')
})

test(
  'typed theme references retain byte lengths, Unicode and opaque payloads while refusing unsafe aliases',
  opts,
  () => {
    py(`
data = 'a:4:{s:5:"label";s:4:"Caf\u00e9";s:11:"custom_logo";s:1:"9";s:17:"header_image_data";a:2:{s:13:"attachment_id";i:9;s:5:"width";i:9;}s:6:"opaque";C:4:"Demo":1:{9}}'.encode()
# The multibyte label has five bytes.
data = data.replace(b's:4:"Caf', b's:5:"Caf')
changed = wp.visit_theme_mods(data, lambda entity, number: 100 if entity == "posts" and number == 9 else number)
expected = data.replace(b's:11:"custom_logo";s:1:"9";', b's:11:"custom_logo";s:3:"100";').replace(b's:13:"attachment_id";i:9;', b's:13:"attachment_id";i:100;')
assert changed == expected, (changed, expected)
assert wp.visit_theme_mods(changed, lambda entity, number: number) == changed
for broken in [b'a:2:{s:11:"custom_logo";i:64;s:5:"width";R:2;}', b'a:2:{s:6:"holder";a:1:{s:7:"primary";i:64;}s:18:"nav_menu_locations";R:2;}', b'a:1:{s:11:"custom_logo";R:2;}', b'a:1:{s:17:"header_image_data";C:4:"Demo":1:{9}}', b'a:1:{s:11:"custom_logo";s:99:"9";}']:
    try:
        wp.visit_theme_mods(broken, lambda entity, number: 100)
    except ValueError:
        pass
    else:
        raise AssertionError("unsafe serialized reference was accepted")`)
  }
)

test(
  'a plugin state table the copy has never had comes whole from the live site once, then stays the copy’s (#106)',
  opts,
  () => {
    // Wordfence installed on the live site after the import: its tables are ignored by the merge
    // (their rows move on every request), yet a copy without them breaks the active plugin.
    const answer = orderRecordMerge({
      type: 'post',
      theirs: `CREATE TABLE wp_wfconfig (name varchar(100) PRIMARY KEY, val longblob);
        INSERT INTO wp_wfconfig VALUES ('isPaid', '0');
        CREATE TABLE wp_wfhits (id bigint PRIMARY KEY, ip varchar(40));
        INSERT INTO wp_wfhits VALUES (1, '203.0.113.9');`
    })
    assert.equal(answer.tables.wp_wfconfig, 'added', JSON.stringify(answer.tables))
    assert.equal(sql("SELECT val FROM wc_m.wp_wfconfig WHERE name='isPaid'"), '0')
    assert.equal(sql('SELECT COUNT(*) FROM wc_m.wp_wfhits'), '1')
    assert.equal(answer.counts.records, 0, 'a plugin state table is no record the customer made')
    // Once the copy has it, the live site's moving rows no longer come over.
    const later = orderRecordMerge({
      type: 'post',
      extraSql: `CREATE TABLE wp_wfconfig (name varchar(100) PRIMARY KEY, val longblob);
        INSERT INTO wp_wfconfig VALUES ('isPaid', '0');`,
      theirs: "UPDATE wp_wfconfig SET val='1' WHERE name='isPaid';"
    })
    assert.equal(later.tables.wp_wfconfig, 'ours-kept')
    assert.equal(sql("SELECT val FROM wc_m.wp_wfconfig WHERE name='isPaid'"), '0')
  }
)

const PAGE_META = `CREATE TABLE wp_postmeta (meta_id bigint NOT NULL PRIMARY KEY, post_id bigint, meta_key varchar(255), meta_value longtext);
  INSERT INTO wp_postmeta VALUES (20, 1, '_edit_last', '1');`

test(
  'a page template both sites set on one page is one row, a conflict, never two rows — under one meta_id or two (#118)',
  opts,
  () => {
    for (const [ourId, theirId] of [
      [24, 24],
      [24, 25]
    ]) {
      const answer = orderRecordMerge({
        type: 'page',
        extraSql: PAGE_META,
        ours: `INSERT INTO wp_postmeta VALUES (${ourId}, 1, '_wp_page_template', 'page-no-title.php');`,
        theirs: `INSERT INTO wp_postmeta VALUES (${theirId}, 1, '_wp_page_template', 'page-wide.php');`
      })
      const label = `copy ${ourId}, live ${theirId}`
      assert.equal(
        sql("SELECT COUNT(*) FROM wc_m.wp_postmeta WHERE post_id=1 AND meta_key='_wp_page_template'"),
        '1',
        label
      )
      assert.equal(
        sql("SELECT meta_value FROM wc_m.wp_postmeta WHERE post_id=1 AND meta_key='_wp_page_template'"),
        'page-no-title.php',
        `${label}: the copy's stays until a decision`
      )
      assert.ok(
        answer.conflicts.some((c) => c.table === 'wp_postmeta'),
        `${label}: ${JSON.stringify(answer.conflicts)} ${JSON.stringify(answer.renumbered)}`
      )
      // Picking the live site's side takes its template, still in one row.
      const id = answer.conflicts.find((c) => c.table === 'wp_postmeta').id
      orderRecordMerge({
        type: 'page',
        extraSql: PAGE_META,
        ours: `INSERT INTO wp_postmeta VALUES (${ourId}, 1, '_wp_page_template', 'page-no-title.php');`,
        theirs: `INSERT INTO wp_postmeta VALUES (${theirId}, 1, '_wp_page_template', 'page-wide.php');`,
        decisions: { [id]: 'theirs' }
      })
      assert.deepEqual(
        sql("SELECT meta_value FROM wc_m.wp_postmeta WHERE post_id=1 AND meta_key='_wp_page_template'"),
        'page-wide.php',
        label
      )
    }
    // The same template set on both sides: one row, no conflict.
    const same = orderRecordMerge({
      type: 'page',
      extraSql: PAGE_META,
      ours: "INSERT INTO wp_postmeta VALUES (24, 1, '_wp_page_template', 'page-wide.php');",
      theirs: "INSERT INTO wp_postmeta VALUES (25, 1, '_wp_page_template', 'page-wide.php');"
    })
    assert.equal(
      sql("SELECT COUNT(*) FROM wc_m.wp_postmeta WHERE post_id=1 AND meta_key='_wp_page_template'"),
      '1'
    )
    assert.deepEqual(same.conflicts, [])
    // A key that may hold several values keeps both rows (two old slugs are two redirects).
    orderRecordMerge({
      type: 'page',
      extraSql: PAGE_META,
      ours: "INSERT INTO wp_postmeta VALUES (24, 1, '_wp_old_slug', 'a');",
      theirs: "INSERT INTO wp_postmeta VALUES (25, 1, '_wp_old_slug', 'b');"
    })
    assert.equal(
      sql("SELECT COUNT(*) FROM wc_m.wp_postmeta WHERE post_id=1 AND meta_key='_wp_old_slug'"),
      '2'
    )
  }
)

test(
  'Polylang translation groups, term languages and per-language menus follow post and term renumbers (#105)',
  opts,
  () => {
    const group = (members) =>
      `a:${Object.keys(members).length}:{${Object.entries(members)
        .map(([lang, v]) => `s:${lang.length}:"${lang}";${typeof v === 'string' ? v : `i:${v};`}`)
        .join('')}}`
    const posts = group({ en: 5, fr: 27, sync: 'a:1:{s:2:"fr";s:2:"en";}' })
    const terms = group({ en: 1, fr: 30 })
    const settings = (en, fr) =>
      `a:2:{s:12:"default_lang";s:2:"en";s:9:"nav_menus";a:1:{s:4:"shop";a:1:{s:7:"primary";a:2:{s:2:"en";i:${en};s:2:"fr";i:${fr};}}}}`
    sql(`DROP DATABASE IF EXISTS pl; CREATE DATABASE pl; USE pl;
CREATE TABLE wp_posts (ID bigint PRIMARY KEY);
CREATE TABLE wp_terms (term_id bigint PRIMARY KEY);
CREATE TABLE wp_term_taxonomy (term_taxonomy_id bigint PRIMARY KEY, term_id bigint, taxonomy varchar(32), description longtext, parent bigint DEFAULT 0);
CREATE TABLE wp_term_relationships (object_id bigint, term_taxonomy_id bigint, PRIMARY KEY (object_id, term_taxonomy_id));
CREATE TABLE wp_options (option_id bigint PRIMARY KEY, option_name varchar(191), option_value longtext);
INSERT INTO wp_posts VALUES (5), (27);
INSERT INTO wp_terms VALUES (1), (2), (27), (30), (31), (40), (41);
INSERT INTO wp_term_taxonomy VALUES (2, 2, 'language', 'a:0:{}', 0), (3, 27, 'term_language', '', 0),
  (4, 30, 'category', '', 0), (5, 31, 'term_translations', '${terms}', 0),
  (6, 40, 'post_translations', '${posts}', 0), (7, 41, 'post_translations', 'not serialized 27', 0);
INSERT INTO wp_term_relationships VALUES (27, 2), (27, 6), (5, 6), (27, 3), (30, 3), (30, 5);
INSERT INTO wp_options VALUES (1, 'polylang', '${settings(30, 31)}');`)
    py(`
mapper = engine.IdMap(sql, "wp_", wp.POLICY["entities"], {})
rules = dict(wp.POLICY["entities"])
mapper.renumber("pl", "posts", rules["posts"], [(27, 29)])
mapper.renumber("pl", "terms", rules["terms"], [(30, 50)])`)
    const description = (id) =>
      Buffer.from(
        sql(`SELECT HEX(description) FROM pl.wp_term_taxonomy WHERE term_taxonomy_id=${id}`),
        'hex'
      ).toString()
    // The French post's group names its new number; Polylang Pro's `sync` languages stay.
    assert.equal(description(6), group({ en: 5, fr: 29, sync: 'a:1:{s:2:"fr";s:2:"en";}' }))
    // The French category's group and the French menu follow the term's number.
    assert.equal(description(5), group({ en: 1, fr: 50 }))
    assert.equal(sql('SELECT option_value FROM pl.wp_options WHERE option_id=1'), settings(50, 31))
    // A group Polylang itself cannot read names nothing and is left as it is.
    assert.equal(description(7), 'not serialized 27')
    // The post's language and group moved with the post; term 27's language stayed with term 27,
    // and term 30's language and group moved with the term, not with any post.
    assert.equal(
      sql(
        "SELECT GROUP_CONCAT(CONCAT(object_id, ':', term_taxonomy_id) ORDER BY object_id, term_taxonomy_id) FROM pl.wp_term_relationships"
      ),
      '5:6,27:3,29:2,29:6,50:3,50:5'
    )
    // A number only a group names is taken: a fresh number goes above it.
    sql(`UPDATE pl.wp_term_taxonomy SET description='${group({ en: 5, fr: 1000 })}' WHERE term_taxonomy_id=6`)
    const refs = JSON.parse(
      py(`
mapper = engine.IdMap(sql, "wp_", wp.POLICY["entities"], {})
print(json.dumps(sorted(mapper.referenced("pl", dict(wp.POLICY["entities"])["posts"]))))`)
    )
    assert.ok(refs.includes(1000), JSON.stringify(refs))
    assert.ok(!refs.includes(50), JSON.stringify(refs))
  }
)

/** A merge of three WordPress schemas built from one `setup` script, then `ours`/`theirs` run on their side. */
function wpMerge({ setup, ours = '', theirs = '', decisions = {} }) {
  sql(
    ['dp_b', 'dp_m', 'dp_t', 'dp_w']
      .map(
        (schema) => `DROP DATABASE IF EXISTS ${schema}; CREATE DATABASE ${schema}; USE ${schema}; ${setup}`
      )
      .join('\n') + `\nUSE dp_m; ${ours}\nUSE dp_t; ${theirs}`
  )
  return JSON.parse(
    py(`result = engine.DbMerge(sql, 'dp_b', 'dp_m', 'dp_t', 'dp_w', 'wordpress', 'wp_',
    json.loads(${JSON.stringify(JSON.stringify(decisions))})).run()
print(json.dumps(result))`)
  )
}

const TERMS = `
  CREATE TABLE wp_posts (ID bigint NOT NULL PRIMARY KEY, post_type varchar(30), post_title varchar(100), post_status varchar(20) NOT NULL DEFAULT 'publish');
  CREATE TABLE wp_terms (term_id bigint NOT NULL PRIMARY KEY, name varchar(100), slug varchar(100));
  CREATE TABLE wp_term_taxonomy (term_taxonomy_id bigint NOT NULL PRIMARY KEY, term_id bigint, taxonomy varchar(32), description longtext, parent bigint, count bigint);
  CREATE TABLE wp_term_relationships (object_id bigint NOT NULL, term_taxonomy_id bigint NOT NULL, term_order int NOT NULL DEFAULT 0, PRIMARY KEY (object_id, term_taxonomy_id));
  INSERT INTO wp_posts VALUES (10, 'post', 'Live post', 'publish'), (20, 'nav_menu_item', '', 'publish');
  INSERT INTO wp_terms VALUES (1, 'Uncategorized', 'uncategorized'), (2, 'News', 'news'), (3, 'Main', 'main');
  INSERT INTO wp_term_taxonomy VALUES (1, 1, 'category', '', 0, 0), (2, 2, 'category', '', 0, 1), (3, 3, 'nav_menu', '', 0, 1);
  INSERT INTO wp_term_relationships VALUES (10, 2, 0), (20, 3, 0);`

test(
  'a category or menu the customer deleted on live stays while the copy’s new post or menu item uses it: a conflict, never an orphan (#119)',
  opts,
  () => {
    const answer = wpMerge({
      setup: TERMS,
      // Tracy files a new post in News and adds an item to the Main menu.
      ours: `INSERT INTO wp_posts VALUES (11, 'post', 'Tracy post', 'publish'), (21, 'nav_menu_item', '', 'publish');
        INSERT INTO wp_term_relationships VALUES (11, 2, 0), (21, 3, 0);`,
      // The customer deletes News and the Main menu (with their links).
      theirs: `DELETE FROM wp_term_relationships WHERE term_taxonomy_id IN (2, 3);
        DELETE FROM wp_term_taxonomy WHERE term_taxonomy_id IN (2, 3); DELETE FROM wp_terms WHERE term_id IN (2, 3);
        DELETE FROM wp_posts WHERE ID = 20;`
    })
    // Kept on the copy, with what uses them, and named as a delete on live against a use on the copy.
    assert.equal(sql('SELECT COUNT(*) FROM dp_m.wp_term_taxonomy WHERE term_taxonomy_id IN (2, 3)'), '2')
    assert.equal(sql('SELECT COUNT(*) FROM dp_m.wp_terms WHERE term_id IN (2, 3)'), '2')
    assert.equal(sql('SELECT COUNT(*) FROM dp_m.wp_term_relationships WHERE object_id IN (11, 21)'), '2')
    const deleted = answer.conflicts.filter((c) => c.reason === 'delete-modify').map((c) => c.table)
    assert.ok(
      deleted.includes('wp_term_taxonomy') && deleted.includes('wp_terms'),
      JSON.stringify(answer.conflicts)
    )
    // The live site's own deletions the copy does not use still come over.
    assert.equal(sql('SELECT COUNT(*) FROM dp_m.wp_term_relationships WHERE object_id IN (10, 20)'), '0')
    // A deletion of a category nothing of the copy's uses comes over as before.
    const plain = wpMerge({
      setup: TERMS,
      theirs: `DELETE FROM wp_term_relationships WHERE term_taxonomy_id = 2; DELETE FROM wp_term_taxonomy WHERE term_taxonomy_id = 2;
        DELETE FROM wp_terms WHERE term_id = 2;`
    })
    assert.equal(sql('SELECT COUNT(*) FROM dp_m.wp_terms WHERE term_id = 2'), '0')
    assert.deepEqual(plain.conflicts, [])
  }
)

test('a collation the live site changed reaches the copy though every row is the same (#120)', opts, () => {
  const setup = `
    CREATE TABLE wp_posts (ID bigint NOT NULL PRIMARY KEY, post_type varchar(30), post_title varchar(100), post_status varchar(20) NOT NULL DEFAULT 'publish');
    CREATE TABLE wp_shop (id int NOT NULL PRIMARY KEY, name varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    INSERT INTO wp_shop VALUES (1, 'Cafe'), (2, 'Tea');`
  const answer = wpMerge({
    setup,
    theirs: 'ALTER TABLE wp_shop MODIFY name varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;'
  })
  assert.equal(answer.tables.wp_shop, 'from-theirs', JSON.stringify(answer.tables))
  assert.equal(
    sql(
      "SELECT collation_name FROM information_schema.columns WHERE table_schema = 'dp_m' AND table_name = 'wp_shop' AND column_name = 'name'"
    ),
    'utf8mb4_bin'
  )
  assert.deepEqual(answer.conflicts, [])
  // The substance checksum the apply compares tells the two apart too, rows alike.
  const sums = JSON.parse(
    py(
      `print(json.dumps({s: dict(engine.substance_checksums(sql, s, 'wordpress', 'wp_')).get('wp_shop') for s in ('dp_b', 'dp_t')}))`
    )
  )
  assert.notEqual(sums.dp_b, sums.dp_t)
  assert.equal(
    sums.dp_b.split(':').slice(0, 2).join(':'),
    sums.dp_t.split(':').slice(0, 2).join(':'),
    'the rows are the same'
  )
})
