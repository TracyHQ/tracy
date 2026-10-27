/**
 * The admin log in the Tracy Access mu-plugin (`tracy-access.php`, site changes plan P2.1): what a
 * PERSON changes in wp-admin becomes one row of `<prefix>tracy_admin_log`, which tracy-host pulls
 * (`apps/tracy-host/src/cms-log.js` `mapWordpress` owns the column contract).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/wordpress-admin-log.test.mjs
 *
 * ⚠ WHAT THIS IS NOT: a WordPress install. The plugin runs for real, on a stub of the WordPress
 * functions it calls; hooks are fired the way core fires them (same names, same arguments), and the
 * table is an in-memory `$wpdb` that understands the plugin's three statements (CREATE TABLE IF
 * NOT EXISTS, INSERT, DELETE … WHERE id <= N). Which hooks a real Save fires, and how often, was
 * measured on a real site instead (tasks/evidence/site-changes/P2/wordpress/).
 *
 * Every case is one PHP request; all run in ONE php batch in `before()` (scripts/test-support/php.mjs).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const PLUGIN = fileURLToPath(
  new URL('../scripts/provision/access/wordpress/tracy-access.php', import.meta.url)
)
const SOURCE = readFileSync(PLUGIN, 'utf8')
const PHP_SKIP = phpSupport().skip

const WP_STUB =
  String.raw`
define('ABSPATH', '/tmp/wp/');
define('AUTH_COOKIE', 'wordpress_h');
define('SECURE_AUTH_COOKIE', 'wordpress_sec_h');
define('LOGGED_IN_COOKIE', 'wordpress_logged_in_h');
define('DAY_IN_SECONDS', 86400);
class WP_User { public $ID = 0; public $display_name = ''; public $user_email = ''; public $roles = []; public $caps = []; }
class WP_Post { public $ID; public $post_type = 'post'; public $post_status = 'publish'; public $post_title = ''; public $post_parent = 0; public $post_name = '';
  public function __construct($a = []) { foreach ($a as $k => $v) $this->$k = $v; } }
class WP_Theme { public $s; public $n; public function __construct($s, $n) { $this->s = $s; $this->n = $n; }
  public function get_stylesheet() { return $this->s; } public function get($k) { return $this->n; } public function exists() { return true; } }
class Stub_Wpdb {
  public $prefix = 'wp_'; public $insert_id = 0; public $tables = []; public $auto = []; public $fail = false;
  public $statements = []; public $quiet = false; public $ddl = null; public $altered = [];
  public function get_charset_collate() { return 'DEFAULT CHARSET=utf8mb4'; }
  public function suppress_errors($s = true) { $o = $this->quiet; $this->quiet = $s; return $o; }
  public function prepare($q, ...$a) { return vsprintf(str_replace('%s', "'%s'", $q), $a); }
  public function query($sql) {
    $sql = trim(preg_replace('/\s+/', ' ', $sql)); $this->statements[] = strtok($sql, ' ');
    if ($this->fail) return false;
    if (preg_match('/^CREATE TABLE IF NOT EXISTS ` +
  '`' +
  String.raw`(\w+)` +
  '`' +
  String.raw`/', $sql, $m)) {
      if (!isset($this->tables[$m[1]])) { $this->tables[$m[1]] = []; $this->ddl = $sql; } return true; }
    if (preg_match('/^DELETE FROM ` +
  '`' +
  String.raw`(\w+)` +
  '`' +
  String.raw` WHERE id <= (\d+)$/', $sql, $m)) {
      $n = 0; foreach ($this->tables[$m[1]] as $id => $r) if ($id <= (int) $m[2]) { unset($this->tables[$m[1]][$id]); $n++; } return $n; }
    if (preg_match('/^ALTER TABLE ` +
  '`' +
  String.raw`(\w+)` +
  '`' +
  String.raw` ADD COLUMN (\w+) /', $sql, $m)) { $this->altered[] = $m[2]; return true; }
    throw new Exception("stub wpdb cannot run: $sql"); }
  public function insert($t, $data, $format = null) {
    $this->statements[] = 'INSERT';
    if ($this->fail || !isset($this->tables[$t])) return false;
    $id = ($this->auto[$t] ?? 0) + 1; $this->auto[$t] = $id; $this->insert_id = $id;
    $this->tables[$t][$id] = ['id' => $id] + $data; return 1; }
  public function drop($t) { unset($this->tables[$t]); $this->auto[$t] = 0; }
}
$GLOBALS['wpdb'] = new Stub_Wpdb();
$GLOBALS['hooks'] = []; $GLOBALS['options'] = []; $GLOBALS['posts'] = []; $GLOBALS['current'] = null;
function add_action($h, $cb, $p = 10, $n = 1) { $GLOBALS['hooks'][$h][$p][] = [$cb, $n]; return true; }
function add_filter($h, $cb, $p = 10, $n = 1) { return add_action($h, $cb, $p, $n); }
function do_action($h, ...$args) {
  $GLOBALS['did'][$h] = ($GLOBALS['did'][$h] ?? 0) + 1;
  $all = $GLOBALS['hooks'][$h] ?? []; ksort($all);
  foreach ($all as $entries) foreach ($entries as [$cb, $n]) $cb(...array_slice($args, 0, $n)); }
function did_action($h) { return $GLOBALS['did'][$h] ?? 0; }
function get_option($k, $d = false) { return $GLOBALS['options'][$k] ?? $d; }
function update_option($k, $v, $autoload = null) { $GLOBALS['options'][$k] = $v; return true; }
function wp_get_current_user() { return $GLOBALS['current'] ?? new WP_User(); }
function current_user_can($cap) { return in_array($cap, wp_get_current_user()->caps, true); }
function wp_installing() { return !empty($GLOBALS['installing']); }
function wp_is_post_revision($p) { return $p->post_type === 'revision' ? $p->post_parent : false; }
function wp_is_post_autosave($p) { return $p->post_type === 'revision' && str_contains($p->post_name, 'autosave') ? $p->post_parent : false; }
function get_post($id) { return $GLOBALS['posts'][(int) $id] ?? null; }
function get_stylesheet() { return 'tracy-business'; }
function wp_get_nav_menu_object($id) { return $GLOBALS['menus'][$id] ?? false; }
function wp_get_theme($s) { return new WP_Theme($s, ucfirst($s) . ' Theme'); }

// Test helpers: who is signed in, and a post the "database" holds.
function as_user($id, $name, $caps = ['edit_posts']) { $u = new WP_User(); $u->ID = $id; $u->display_name = $name; $u->caps = $caps; $GLOBALS['current'] = $u; }
function post($a) { $p = new WP_Post($a); $GLOBALS['posts'][$p->ID] = $p; return $p; }
function rows() { return array_values($GLOBALS['wpdb']->tables['wp_tracy_admin_log'] ?? []); }
`

/** One request: `defines` run before the plugin loads (DOING_AJAX, WP_CLI, …), then `body` fires hooks. */
const request = ({ defines = '', body, out = 'json_encode(rows())' }) => ({
  args: [
    '-r',
    `${WP_STUB}
${defines}
eval('?>' . getenv('TRACY_ACCESS_SRC'));
${body}
echo ${out};`
  ],
  env: { TRACY_ACCESS_SRC: SOURCE }
})

const EDITOR = "as_user(7, 'Minh Tran');"
const page = (a = '') => `post(['ID' => 42, 'post_type' => 'page', 'post_title' => 'About us'${a}])`

const CASES = {
  pageUpdated: request({
    body: `${EDITOR}
$before = ${page()}; $after = ${page()};
do_action('wp_after_insert_post', 42, $after, true, $before);`
  }),
  pageCreatedFromAutoDraft: request({
    body: `${EDITOR}
$before = ${page(", 'post_status' => 'auto-draft'")}; $after = ${page(", 'post_status' => 'draft'")};
do_action('wp_after_insert_post', 42, $after, true, $before);`
  }),
  bookkeepingPosts: request({
    body: `${EDITOR}
do_action('wp_after_insert_post', 50, post(['ID' => 50, 'post_type' => 'revision', 'post_parent' => 42, 'post_name' => '42-autosave-v1']), false, null);
do_action('wp_after_insert_post', 51, post(['ID' => 51, 'post_type' => 'revision', 'post_parent' => 42, 'post_name' => '42-revision-v1']), false, null);
do_action('wp_after_insert_post', 52, post(['ID' => 52, 'post_status' => 'auto-draft']), false, null);
do_action('wp_after_insert_post', 53, post(['ID' => 53, 'post_type' => 'nav_menu_item']), false, null);
do_action('wp_after_insert_post', 54, post(['ID' => 54, 'post_type' => 'customize_changeset']), false, null);`
  }),
  trashRestoreDelete: request({
    body: `${EDITOR}
$p = ${page()};
// wp_trash_post() saves the post with status trash (firing wp_after_insert_post), then trashed_post.
$t = ${page(", 'post_status' => 'trash'")};
do_action('wp_after_insert_post', 42, $t, true, $p);
do_action('trashed_post', 42, 'publish');
// A second request would restore it; here a different post, so the per-request rule does not hide it.
$q = post(['ID' => 43, 'post_title' => 'Old news', 'post_status' => 'draft']);
do_action('wp_after_insert_post', 43, $q, true, post(['ID' => 43, 'post_title' => 'Old news', 'post_status' => 'trash']));
do_action('untrashed_post', 43, 'publish');
do_action('deleted_post', 44, post(['ID' => 44, 'post_title' => 'Gone']));`
  }),
  attachments: request({
    body: `${EDITOR}
$a = post(['ID' => 60, 'post_type' => 'attachment', 'post_status' => 'inherit', 'post_title' => 'hero-photo']);
do_action('wp_after_insert_post', 60, $a, false, null);
do_action('add_attachment', 60);
$b = post(['ID' => 61, 'post_type' => 'attachment', 'post_status' => 'inherit', 'post_title' => 'old-logo']);
do_action('delete_attachment', 61, $b);
do_action('deleted_post', 61, $b);`
  }),
  menuSavedTwice: request({
    body: `${EDITOR}
$GLOBALS['menus'][3] = (object) ['name' => 'Main menu'];
do_action('wp_update_nav_menu', 3, ['menu-name' => 'Main menu']);
do_action('wp_update_nav_menu', 3);
do_action('delete_nav_menu', 9, 9, (object) ['name' => 'Footer']);`
  }),
  themeAndPlugins: request({
    body: `${EDITOR}
do_action('switch_theme', 'Twenty Twenty-Five', new WP_Theme('twentytwentyfive', 'Twenty Twenty-Five'), new WP_Theme('tracy-business', 'Tracy Business'));
do_action('activated_plugin', 'hello-dolly/hello.php', false);
do_action('deactivated_plugin', 'akismet/akismet.php', false);`
  }),
  options: request({
    body: `${EDITOR}
do_action('updated_option', 'blogname', 'Old', 'New');
do_action('updated_option', 'active_plugins', [], []);
do_action('updated_option', 'cron', [], []);
do_action('updated_option', '_transient_x', 1, 2);
do_action('added_option', 'site_icon', 12);
// The Customizer's publish (customize_save) writes the active theme's mods once per setting:
// one Publish, one row.
do_action('customize_save', null);
do_action('updated_option', 'theme_mods_tracy-business', [], ['a' => 1]);
do_action('updated_option', 'theme_mods_tracy-business', [], ['a' => 1, 'b' => 2]);
// Another theme's mods are not what the site shows.
do_action('updated_option', 'theme_mods_twentytwentyfive', [], ['a' => 1]);`
  }),
  // switch_theme() and the next admin request's check_theme_switched() write theme mods themselves
  // (sidebars, classic sidebars for a block theme): measured on scwp1002, four such rows around two
  // switches. The switch is its own row; those writes are not a Customizer save.
  themeModsOutsideCustomizer: request({
    body: `${EDITOR}
do_action('updated_option', 'theme_mods_tracy-business', [], ['sidebars_widgets' => []]);
do_action('added_option', 'theme_mods_tracy-business', []);`
  }),
  applyDoor: request({
    defines: "define('DOING_AJAX', true); $_REQUEST['action'] = 'claude_cowork';",
    body: `${EDITOR}
do_action('wp_after_insert_post', 42, ${page()}, true, ${page()});
do_action('updated_option', 'blogname', 'Old', 'New');`
  }),
  otherAjax: request({
    defines: "define('DOING_AJAX', true); $_REQUEST['action'] = 'inline-save';",
    body: `${EDITOR}
do_action('wp_after_insert_post', 42, ${page()}, true, ${page()});`
  }),
  // The block editor's Save is two requests: the REST save, then post.php?meta-box-loader=1 saving
  // the classic meta boxes of the same post (measured on e3sw0330, WordPress 7.1.2).
  metaBoxLoader: request({
    defines: "$_GET['meta-box-loader'] = '1'; $_REQUEST['meta-box-loader'] = '1';",
    body: `${EDITOR}
do_action('wp_after_insert_post', 42, ${page()}, true, ${page()});`
  }),
  wpCli: request({
    defines: "define('WP_CLI', true);",
    body: `${EDITOR}
do_action('wp_after_insert_post', 42, ${page()}, true, ${page()});`
  }),
  cronUpdate: request({
    defines: "define('DOING_CRON', true);",
    body: `
do_action('upgrader_process_complete', null, ['action' => 'update', 'type' => 'plugin', 'plugins' => ['claude-cowork/claude-cowork.php']]);
do_action('upgrader_process_complete', null, ['action' => 'update', 'type' => 'theme', 'themes' => ['twentytwentyfive']]);
do_action('upgrader_process_complete', null, ['action' => 'update', 'type' => 'core']);
do_action('upgrader_process_complete', null, ['action' => 'update', 'type' => 'translation', 'translations' => []]);`
  }),
  // A person installing from the admin, and (another request) updating from Plugins/Themes — the
  // upgrader's own `action`: 0.3.0 logged both as `install`.
  personInstalls: request({
    body: `${EDITOR}
do_action('upgrader_process_complete', null, ['action' => 'install', 'type' => 'plugin', 'plugin' => 'akismet/akismet.php']);
do_action('upgrader_process_complete', null, ['action' => 'install', 'type' => 'theme', 'theme' => 'twentytwentyfive']);`
  }),
  personUpdates: request({
    body: `${EDITOR}
do_action('upgrader_process_complete', null, ['action' => 'update', 'type' => 'plugin', 'bulk' => true, 'plugins' => ['hello-dolly/hello.php', 'akismet/akismet.php']]);
do_action('upgrader_process_complete', null, ['action' => 'update', 'type' => 'theme', 'bulk' => true, 'themes' => ['twentytwentyfive']]);`
  }),
  visitor: request({
    body: `
do_action('wp_after_insert_post', 70, post(['ID' => 70, 'post_type' => 'feedback', 'post_title' => 'Contact form entry']), false, null);
as_user(8, 'A customer', []);
do_action('wp_after_insert_post', 71, post(['ID' => 71, 'post_type' => 'shop_order', 'post_title' => 'Order']), false, null);`
  }),
  ring: request({
    body: `${EDITOR}
for ($i = 1; $i <= 5003; $i++) do_action('wp_after_insert_post', $i, post(['ID' => $i, 'post_title' => "P$i"]), true, post(['ID' => $i]));
$r = rows();`,
    out: "json_encode(['count' => count($r), 'first' => $r[0]['resource_id'], 'last' => end($r)['resource_id'], 'deletes' => count(array_filter($GLOBALS['wpdb']->statements, fn ($s) => $s === 'DELETE'))])"
  }),
  dbFails: request({
    body: `${EDITOR}
$GLOBALS['wpdb']->fail = true;
do_action('wp_after_insert_post', 42, ${page()}, true, ${page()});`,
    out: "json_encode(['rows' => rows(), 'quietAfter' => $GLOBALS['wpdb']->quiet])"
  }),
  droppedTable: request({
    body: `${EDITOR}
do_action('wp_after_insert_post', 42, ${page()}, true, ${page()});
$GLOBALS['wpdb']->drop('wp_tracy_admin_log');
do_action('wp_after_insert_post', 43, post(['ID' => 43, 'post_title' => 'After the drop']), true, post(['ID' => 43]));`
  }),
  // A site whose hook was schema 1: the table exists, the option says '1'. The first write of the
  // schema-2 hook adds the three producer columns, then writes the row with them.
  upgradeFromSchema1: request({
    body: `${EDITOR}
$GLOBALS['wpdb']->tables['wp_tracy_admin_log'] = []; update_option('tracy_admin_log_schema', '1');
do_action('updated_option', 'blogname', 'a', 'b');`,
    out: "json_encode(['schema' => get_option('tracy_admin_log_schema'), 'statements' => $GLOBALS['wpdb']->statements, 'altered' => $GLOBALS['wpdb']->altered, 'rows' => rows()])"
  }),
  lazySchema: request({
    body: `${EDITOR}
$created = isset($GLOBALS['wpdb']->tables['wp_tracy_admin_log']);
do_action('updated_option', 'blogname', 'a', 'b');
do_action('updated_option', 'blogdescription', 'a', 'b');`,
    out: "json_encode(['before' => $created, 'schema' => get_option('tracy_admin_log_schema'), 'statements' => $GLOBALS['wpdb']->statements, 'ddl' => $GLOBALS['wpdb']->ddl])"
  })
}

const out = {}
let php
before(() => {
  if (PHP_SKIP) return
  php = startPhp()
  const keys = Object.keys(CASES)
  const results = php.run(keys.map((k) => CASES[k]))
  keys.forEach((k, i) => {
    assert.equal(results[i].status, 0, `${k}: php failed: ${results[i].stderr}${results[i].stdout}`)
    assert.equal(results[i].stderr, '', `${k}: php wrote to stderr`)
    out[k] = JSON.parse(results[i].stdout)
  })
})
after(() => php?.stop())

/** The columns that matter to the reader, without the clock. */
const shape = (rows) =>
  rows.map(({ user_id, user_name, type, resource_type, resource_id, resource_title, op }) => ({
    user_id,
    user_name,
    type,
    resource_type,
    resource_id,
    resource_title,
    op
  }))

test('an editor saving a page writes one row: who, which page, update', { skip: PHP_SKIP }, () => {
  assert.deepEqual(shape(out.pageUpdated), [
    {
      user_id: 7,
      user_name: 'Minh Tran',
      type: 'wp_after_insert_post',
      resource_type: 'page',
      resource_id: '42',
      resource_title: 'About us',
      op: 'update'
    }
  ])
  assert.match(out.pageUpdated[0].at, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
})

test('the first save out of the editor’s auto-draft is the create', { skip: PHP_SKIP }, () => {
  assert.deepEqual(
    out.pageCreatedFromAutoDraft.map((r) => r.op),
    ['create']
  )
})

test('autosaves, revisions, auto-drafts, menu items and changesets write nothing', { skip: PHP_SKIP }, () => {
  assert.deepEqual(out.bookkeepingPosts, [])
})

test('trash, restore and delete are one row each, not doubled by the save they cause', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(
    shape(out.trashRestoreDelete).map((r) => [r.type, r.resource_id, r.resource_title, r.op]),
    [
      ['trashed_post', '42', 'About us', 'trash'],
      ['untrashed_post', '43', 'Old news', 'restore'],
      ['deleted_post', '44', 'Gone', 'delete']
    ]
  )
})

test('a media upload is one upload row; deleting one is one delete row', { skip: PHP_SKIP }, () => {
  assert.deepEqual(
    shape(out.attachments).map((r) => [r.type, r.resource_type, r.resource_id, r.resource_title, r.op]),
    [
      ['add_attachment', 'attachment', '60', 'hero-photo', 'upload'],
      ['delete_attachment', 'attachment', '61', 'old-logo', 'delete']
    ]
  )
})

test('saving a menu (which fires wp_update_nav_menu twice) is one row; a deleted menu keeps its name', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(
    shape(out.menuSavedTwice).map((r) => [r.type, r.resource_type, r.resource_id, r.resource_title, r.op]),
    [
      ['wp_update_nav_menu', 'nav_menu', '3', 'Main menu', 'update'],
      ['delete_nav_menu', 'nav_menu', '9', 'Footer', 'delete']
    ]
  )
})

test('theme switch and plugin (de)activation are logged by name', { skip: PHP_SKIP }, () => {
  assert.deepEqual(
    shape(out.themeAndPlugins).map((r) => [r.resource_type, r.resource_id, r.resource_title, r.op]),
    [
      ['theme', 'twentytwentyfive', 'Twenty Twenty-Five', 'switch'],
      ['plugin', 'hello-dolly/hello.php', 'hello-dolly/hello.php', 'activate'],
      ['plugin', 'akismet/akismet.php', 'akismet/akismet.php', 'deactivate']
    ]
  )
})

test('only whitelisted options and the active theme’s mods are logged, the mods once per request', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(
    shape(out.options).map((r) => [r.type, r.resource_type, r.resource_id, r.resource_title, r.op]),
    [
      ['updated_option', 'option', 'blogname', 'Site Title', 'update'],
      ['added_option', 'option', 'site_icon', 'Site Icon', 'create'],
      ['updated_option', 'theme_mods', 'tracy-business', 'Customizer', 'update']
    ]
  )
})

test('theme mods written outside a Customizer publish (a theme switch) write nothing', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(out.themeModsOutsideCustomizer, [])
})

test('Tracy’s own writes through the Apply door (admin-ajax action=claude_cowork) write nothing', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(out.applyDoor, [])
})

test('any other admin-ajax save (Quick Edit) by a person is logged', { skip: PHP_SKIP }, () => {
  assert.equal(out.otherAjax.length, 1)
})

test('the block editor’s meta-box follow-up request is not a second save', { skip: PHP_SKIP }, () => {
  assert.deepEqual(out.metaBoxLoader, [])
})

test('WP-CLI writes nothing', { skip: PHP_SKIP }, () => {
  assert.deepEqual(out.wpCli, [])
})

test('WP-Cron’s automatic updates are logged with no user, one row per item, translations left out', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(
    shape(out.cronUpdate).map((r) => [
      r.user_id,
      r.user_name,
      r.resource_type,
      r.resource_id,
      r.resource_title,
      r.op
    ]),
    [
      [0, '', 'plugin', 'claude-cowork/claude-cowork.php', 'claude-cowork/claude-cowork.php', 'update'],
      [0, '', 'theme', 'twentytwentyfive', 'Twentytwentyfive Theme', 'update'],
      [0, '', 'core', 'wordpress', 'WordPress', 'update']
    ]
  )
})

test('an install is `install` and an update is `update`, as the upgrader says (0.3.0 wrote install for both)', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(
    [...shape(out.personInstalls), ...shape(out.personUpdates)].map((r) => [
      r.resource_type,
      r.resource_id,
      r.op
    ]),
    [
      ['plugin', 'akismet/akismet.php', 'install'],
      ['theme', 'twentytwentyfive', 'install'],
      ['plugin', 'hello-dolly/hello.php', 'update'],
      ['plugin', 'akismet/akismet.php', 'update'],
      ['theme', 'twentytwentyfive', 'update']
    ]
  )
})

test('a visitor’s request, or a user who cannot edit posts, writes nothing', { skip: PHP_SKIP }, () => {
  assert.deepEqual(out.visitor, [])
})

test('the log is a ring of 5000 rows: the oldest go, pruning starts only past 5000', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(out.ring, { count: 5000, first: '4', last: '5003', deletes: 3 })
})

test('a database that refuses every statement breaks nothing and restores its error setting', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(out.dbFails, { rows: [], quietAfter: false })
})

test('a table dropped by hand is created again on the next write', { skip: PHP_SKIP }, () => {
  assert.deepEqual(
    out.droppedTable.map((r) => [r.id, r.resource_title]),
    [[1, 'After the drop']]
  )
})

test('the table is created lazily, once, and the schema version is remembered', { skip: PHP_SKIP }, () => {
  const r = out.lazySchema
  assert.equal(r.before, false)
  assert.equal(r.schema, '2')
  assert.deepEqual(r.statements, ['CREATE', 'INSERT', 'INSERT'], 'a fresh table needs no ALTER')
  for (const col of [
    'id',
    'at',
    'user_id',
    'user_name',
    'type',
    'resource_type',
    'resource_id',
    'resource_title',
    'op',
    'producer_version',
    'producer_hash',
    'context'
  ]) {
    assert.match(r.ddl, new RegExp(`\\b${col} `), `column ${col}`)
  }
})

// Site changes V2 (contract D1): each row names the hook that wrote it, so "no user" reads as
// Automatic from the row itself. Under `eval` (this harness) the file has no path to hash: ''.
test('every row names its producer; a WP-Cron row says context cron, a person’s row says none', {
  skip: PHP_SKIP
}, () => {
  for (const r of out.cronUpdate) {
    assert.equal(r.producer_version, '0.4.0')
    assert.equal(r.context, 'cron')
    assert.equal(r.producer_hash, '')
  }
  assert.equal(out.pageUpdated[0].producer_version, '0.4.0')
  assert.equal(out.pageUpdated[0].context, '')
  assert.match(SOURCE, /Version:\s+0\.4\.0\n/, 'the header Version matches TRACY_ADMIN_LOG_PRODUCER')
  assert.match(SOURCE, /const TRACY_ADMIN_LOG_PRODUCER = '0\.4\.0';/)
})

test('a schema-1 table gets the producer columns once, then the row is written with them', {
  skip: PHP_SKIP
}, () => {
  const r = out.upgradeFromSchema1
  assert.equal(r.schema, '2')
  assert.deepEqual(r.altered, ['producer_version', 'producer_hash', 'context'])
  assert.deepEqual(r.statements, ['CREATE', 'ALTER', 'ALTER', 'ALTER', 'INSERT'])
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].producer_version, '0.4.0')
})
