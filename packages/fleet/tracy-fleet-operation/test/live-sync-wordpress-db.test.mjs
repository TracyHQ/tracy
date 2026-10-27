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
