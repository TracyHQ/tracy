/**
 * "Sync to live", the changeset as the host reads it (`scripts/lib/live_push.py changeset`, its SQL
 * reader `SqlSource`): two schemas — the live site's last read (base) and the copy — of a Joomla site
 * and of a WordPress site, every kind's rows read through the merge's SQL client, digests first and
 * whole rows only where they differ.
 *
 * Needs a real MariaDB: `mariadb:11` in a container of its own, removed at the end; SKIPPED where no
 * docker daemon answers.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-push-sql.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PUSH = join(here, '..', 'scripts', 'lib', 'live_push.py')
const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0
const DB_CONTAINER = `tracy-live-push-sql-db-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the reader needs a real MariaDB' }
const CLIENT = [REAL_DOCKER, 'exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot']
const root = mkdtempSync(join(tmpdir(), 'live-push-sql-'))
after(() => rmSync(root, { recursive: true, force: true }))

const sql = (script, db = '') =>
  execFileSync(CLIENT[0], [...CLIENT.slice(1), '-N', '-B', ...(db ? [db] : [])], {
    input: script,
    encoding: 'utf8'
  }).trim()

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

/** Two schemas from one script, then each side's own statements. */
function schemas(name, tables, base, copy) {
  for (const side of ['base', 'copy']) {
    sql(
      `DROP DATABASE IF EXISTS \`${name}_${side}\`; CREATE DATABASE \`${name}_${side}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    )
    sql(tables, `${name}_${side}`)
  }
  sql(base, `${name}_base`)
  sql(copy, `${name}_copy`)
}

/** The changeset of `<name>_base` against `<name>_copy`; `kept`: sync/kept.json, when given. */
function changeset(name, platform, prefix, idMap = {}, kept = null) {
  const map = join(root, `${name}-id-map.json`)
  writeFileSync(map, JSON.stringify(idMap))
  const keptArgs = []
  if (kept) {
    writeFileSync(join(root, `${name}-kept.json`), JSON.stringify(kept))
    keptArgs.push('--kept', join(root, `${name}-kept.json`))
  }
  const r = spawnSync(
    'python3',
    [
      PUSH,
      'changeset',
      '--platform',
      platform,
      '--prefix',
      prefix,
      '--base-schema',
      `${name}_base`,
      '--copy-schema',
      `${name}_copy`,
      '--id-map',
      map,
      ...keptArgs
    ],
    { encoding: 'utf8', env: { ...process.env, TRACY_SYNC_SQL: JSON.stringify(CLIENT) } }
  )
  assert.equal(r.status, 0, r.stderr + r.stdout)
  return JSON.parse(r.stdout.trim().split('\n').at(-1))
}

const JOOMLA = `
CREATE TABLE jos_content (id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT NOT NULL DEFAULT 0, title VARCHAR(255) NOT NULL,
  alias VARCHAR(400) NOT NULL DEFAULT '', introtext MEDIUMTEXT, \`fulltext\` MEDIUMTEXT, state TINYINT NOT NULL DEFAULT 1,
  catid INT NOT NULL DEFAULT 2, modified DATETIME NULL, hits INT NOT NULL DEFAULT 0, created_by_alias VARCHAR(255) NOT NULL DEFAULT '');
CREATE TABLE jos_categories (id INT PRIMARY KEY, asset_id INT NOT NULL DEFAULT 0, parent_id INT NOT NULL DEFAULT 0, lft INT, rgt INT,
  level INT, path VARCHAR(400), extension VARCHAR(50), title VARCHAR(255), alias VARCHAR(400), published TINYINT DEFAULT 1);
CREATE TABLE jos_tags (id INT PRIMARY KEY, parent_id INT, lft INT, rgt INT, level INT, path VARCHAR(400), title VARCHAR(255), published TINYINT DEFAULT 1);
CREATE TABLE jos_contentitem_tag_map (type_alias VARCHAR(255), core_content_id INT, content_item_id INT, tag_id INT, tag_date DATETIME,
  type_id INT, UNIQUE KEY uc_ItemnameTagid (type_id, content_item_id, tag_id));
CREATE TABLE jos_menu (id INT PRIMARY KEY, menutype VARCHAR(24), title VARCHAR(255), alias VARCHAR(400), path VARCHAR(1024),
  link VARCHAR(1024), type VARCHAR(16), published TINYINT, parent_id INT, level INT, lft INT, rgt INT, client_id TINYINT DEFAULT 0,
  component_id INT DEFAULT 0, home TINYINT DEFAULT 0, language CHAR(7) DEFAULT '*', params TEXT, note VARCHAR(255) DEFAULT '',
  template_style_id INT DEFAULT 0);
CREATE TABLE jos_menu_types (id INT PRIMARY KEY, asset_id INT DEFAULT 0, menutype VARCHAR(24), title VARCHAR(48), description VARCHAR(255),
  client_id INT DEFAULT 0, UNIQUE KEY idx_menutype (client_id, menutype));
CREATE TABLE jos_modules (id INT PRIMARY KEY, asset_id INT DEFAULT 0, title VARCHAR(100), note VARCHAR(255) DEFAULT '', content TEXT,
  ordering INT DEFAULT 0, position VARCHAR(50), published TINYINT DEFAULT 1, module VARCHAR(50), access INT DEFAULT 1,
  showtitle TINYINT DEFAULT 1, params TEXT, client_id TINYINT DEFAULT 0, language CHAR(7) DEFAULT '*');
CREATE TABLE jos_modules_menu (moduleid INT, menuid INT, PRIMARY KEY (moduleid, menuid));
CREATE TABLE jos_fields (id INT PRIMARY KEY, context VARCHAR(255), title VARCHAR(255), name VARCHAR(255), type VARCHAR(255));
CREATE TABLE jos_fields_values (field_id INT, item_id VARCHAR(255), value TEXT);
CREATE TABLE jos_extensions (extension_id INT PRIMARY KEY, type VARCHAR(20), folder VARCHAR(20), element VARCHAR(100), params TEXT);
CREATE TABLE jos_template_styles (id INT PRIMARY KEY, template VARCHAR(50), client_id TINYINT, home CHAR(7), title VARCHAR(255),
  inheritable TINYINT DEFAULT 0, parent VARCHAR(50) DEFAULT '', params TEXT);
INSERT INTO jos_template_styles VALUES (9, 'cassiopeia', 0, '1', 'Cassiopeia - Default', 0, '', '{"brand":"1","colorName":"colors_standard"}'),
  (10, 'atum', 1, '1', 'Atum - Default', 0, '', '{}');
INSERT INTO jos_content (id, title, alias, introtext, \`fulltext\`, catid) VALUES (1, 'Hello', 'hello', 'first', '', 2), (2, 'About', 'about', 'second', '', 2);
INSERT INTO jos_categories VALUES (1, 0, 0, 0, 5, 0, '', 'system', 'ROOT', 'root', 1), (2, 0, 1, 1, 2, 1, 'news', 'com_content', 'News', 'news', 1);
INSERT INTO jos_tags VALUES (1, 0, 0, 3, 0, '', 'ROOT', 1), (5, 1, 1, 2, 1, 'sale', 'Sale', 1);
INSERT INTO jos_menu VALUES (1, '', 'Menu_Item_Root', 'root', '', '', '', 1, 0, 0, 0, 9, 0, 0, 0, '*', '', '', 0),
  (101, 'mainmenu', 'Home', 'home', 'home', 'index.php?option=com_content&view=featured', 'component', 1, 1, 1, 1, 2, 0, 22, 1, '*', '{}', '', 0),
  (102, 'mainmenu', 'About', 'about', 'about', 'index.php?option=com_content&view=article&id=2', 'component', 1, 1, 1, 3, 4, 0, 22, 0, '*', '{}', '', 0),
  (103, 'mainmenu', 'Contact', 'contact', 'contact', 'index.php?option=com_contact', 'component', 1, 1, 1, 5, 6, 0, 8, 0, '*', '{}', '', 0);
INSERT INTO jos_menu_types VALUES (1, 0, 'mainmenu', 'Main Menu', '', 0);
INSERT INTO jos_modules VALUES (90, 0, 'Footer', '', '<p>Hi</p>', 1, 'footer', 1, 'mod_custom', 1, 1, '{}', 0, '*');
INSERT INTO jos_modules_menu VALUES (90, 0);
INSERT INTO jos_fields VALUES (7, 'com_content.article', 'Origin', 'origin', 'text');
INSERT INTO jos_fields_values VALUES (7, '1', 'Vietnam');
INSERT INTO jos_contentitem_tag_map VALUES ('com_content.article', 1, 1, 5, NOW(), 1);
INSERT INTO jos_extensions VALUES (10, 'plugin', 'system', 'sef', '{"domain": ""}'), (11, 'module', '', 'mod_menu', '{}');
`

test(
  'Joomla: every kind read through SQL — an article, a new category, menu order, a module’s pages, a field value, an extension',
  opts,
  () => {
    schemas(
      'jpush',
      JOOMLA,
      '',
      `UPDATE jos_content SET title = 'Hello, by Tracy', modified = NOW(), hits = 7 WHERE id = 1;
     INSERT INTO jos_categories VALUES (3, 0, 1, 3, 4, 1, 'events', 'com_content', 'Events', 'events', 1);
     INSERT INTO jos_content (id, title, alias, introtext, \`fulltext\`, catid) VALUES (3, 'Fair', 'fair', 'soon', '', 3);
     UPDATE jos_menu SET lft = 3 WHERE id = 103; UPDATE jos_menu SET lft = 5 WHERE id = 102;
     DELETE FROM jos_modules_menu; INSERT INTO jos_modules_menu VALUES (90, 101), (90, 102);
     UPDATE jos_fields_values SET value = 'Viet Nam' WHERE field_id = 7;
     DELETE FROM jos_contentitem_tag_map;
     UPDATE jos_extensions SET params = '{"x": 1}' WHERE extension_id = 11;
     UPDATE jos_template_styles SET params = '{"brand":"1","colorName":"colors_alternative"}' WHERE id IN (9, 10);`
    )
    const answer = changeset('jpush', 'joomla', 'jos_')
    const items = Object.fromEntries(answer.items.map((i) => [i.id, i]))
    assert.deepEqual(Object.keys(items).sort(), [
      'article:1',
      'article:new:3',
      'category:new:3',
      'fieldValue:7:1:com_content.article',
      'menuItem:102:move',
      'menuItem:103:move',
      'moduleAssignment:90',
      'templateStyle:9'
    ])
    // A site template style's params (the administrator's style is not the site's): a setting.
    assert.deepEqual(items['templateStyle:9'].write, {
      params: '{"brand":"1","colorName":"colors_alternative"}'
    })
    assert.equal(items['templateStyle:9'].group, 'settings')
    assert.deepEqual(items['article:1'].write, { title: 'Hello, by Tracy' })
    assert.deepEqual(items['article:new:3'].write.catid, { $new: 'categories:3' })
    assert.equal(items['fieldValue:7:1:com_content.article'].ident, 7_000_000_001)
    assert.deepEqual(items['fieldValue:7:1:com_content.article'].expect, { value: 'Vietnam' })
    assert.deepEqual(items['moduleAssignment:90'].write, { menuids: [101, 102] })
    assert.deepEqual(items['moduleAssignment:90'].expect, { menuids: '[0]' })
    assert.deepEqual(answer.unsupported.map((u) => [u.what, u.field ?? u.table, u.names ?? null]).sort(), [
      ['field', 'tags', null],
      ['table', 'extensions', ['mod_menu']]
    ])
  }
)

const WORDPRESS = `
CREATE TABLE wp_posts (ID BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, post_author BIGINT UNSIGNED DEFAULT 0, post_date DATETIME,
  post_date_gmt DATETIME, post_content LONGTEXT, post_title TEXT, post_excerpt TEXT, post_status VARCHAR(20) DEFAULT 'publish',
  comment_status VARCHAR(20) DEFAULT 'open', ping_status VARCHAR(20) DEFAULT 'open', post_password VARCHAR(255) DEFAULT '',
  post_name VARCHAR(200), to_ping TEXT, pinged TEXT, post_modified DATETIME, post_modified_gmt DATETIME, post_content_filtered LONGTEXT,
  post_parent BIGINT UNSIGNED DEFAULT 0, guid VARCHAR(255), menu_order INT DEFAULT 0, post_type VARCHAR(20) DEFAULT 'post',
  post_mime_type VARCHAR(100) DEFAULT '', comment_count BIGINT DEFAULT 0);
CREATE TABLE wp_postmeta (meta_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, post_id BIGINT UNSIGNED, meta_key VARCHAR(255), meta_value LONGTEXT);
CREATE TABLE wp_terms (term_id BIGINT UNSIGNED PRIMARY KEY, name VARCHAR(200), slug VARCHAR(200), term_group BIGINT DEFAULT 0);
CREATE TABLE wp_term_taxonomy (term_taxonomy_id BIGINT UNSIGNED PRIMARY KEY, term_id BIGINT UNSIGNED, taxonomy VARCHAR(32),
  description LONGTEXT, parent BIGINT UNSIGNED DEFAULT 0, count BIGINT DEFAULT 0, UNIQUE KEY term_id_taxonomy (term_id, taxonomy));
CREATE TABLE wp_term_relationships (object_id BIGINT UNSIGNED, term_taxonomy_id BIGINT UNSIGNED, term_order INT DEFAULT 0,
  PRIMARY KEY (object_id, term_taxonomy_id));
CREATE TABLE wp_options (option_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, option_name VARCHAR(191) UNIQUE, option_value LONGTEXT,
  autoload VARCHAR(20) DEFAULT 'yes');
INSERT INTO wp_terms VALUES (1, 'Uncategorized', 'uncategorized', 0), (2, 'Main', 'main', 0), (3, 'News', 'news', 0);
INSERT INTO wp_term_taxonomy VALUES (1, 1, 'category', '', 0, 1), (2, 2, 'nav_menu', '', 0, 1), (3, 3, 'category', '', 0, 0);
INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_type, guid, post_modified) VALUES
  (10, '2026-01-01', '<p>Our <a href="HOME/menu">menu</a></p>', 'About', '', 'about', 'page', 'HOME/?page_id=10', '2026-01-01'),
  (11, '2026-01-01', '<p>Hello</p>', 'Hello world', '', 'hello-world', 'post', 'HOME/?p=11', '2026-01-01'),
  (20, '2026-01-01', '', 'About', '', '20', 'nav_menu_item', 'HOME/?p=20', '2026-01-01');
INSERT INTO wp_term_relationships VALUES (11, 1, 0), (20, 2, 0);
INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (20, '_menu_item_type', 'post_type'), (20, '_menu_item_object', 'page'),
  (20, '_menu_item_object_id', '10'), (20, '_menu_item_url', ''), (20, '_menu_item_menu_item_parent', '0'),
  (10, '_wp_page_template', 'default'), (10, '_edit_lock', '1:1');
INSERT INTO wp_options (option_name, option_value) VALUES ('home', 'HOME'), ('siteurl', 'HOME'), ('blogname', 'Shop'),
  ('blogdescription', 'Fresh bread'), ('theme_mods_astra', 'a:0:{}'), ('cron', 'a:0:{}'), ('claude_cowork_token', 'secret'),
  ('stylesheet', 'astra'), ('theme_mods_oldtheme', 'a:0:{}'), ('permalink_structure', '/%postname%/');
INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_type, guid, post_modified) VALUES
  (30, '2026-01-01', '.a{}', 'astra', '', 'astra', 'custom_css', 'HOME/?p=30', '2026-01-01');
`

test(
  'WordPress: every kind read through SQL, the address rewritten — a page, the tagline, a post’s category, a new menu entry',
  opts,
  () => {
    const live = 'https://shop.example'
    const copy = 'https://shop-com.tracy.ai'
    schemas(
      'wpush',
      WORDPRESS,
      `UPDATE wp_posts SET post_content = REPLACE(post_content, 'HOME', '${live}'), guid = REPLACE(guid, 'HOME', '${live}');
     UPDATE wp_options SET option_value = '${live}' WHERE option_value = 'HOME';`,
      `UPDATE wp_posts SET post_content = REPLACE(post_content, 'HOME', '${copy}'), guid = REPLACE(guid, 'HOME', '${copy}');
     UPDATE wp_options SET option_value = '${copy}' WHERE option_value = 'HOME';
     UPDATE wp_posts SET post_title = 'About our bakery', post_modified = NOW() WHERE ID = 10;
     UPDATE wp_options SET option_value = 'Fresh bread every morning' WHERE option_name = 'blogdescription';
     UPDATE wp_options SET option_value = 'a:1:{s:4:"logo";i:5;}' WHERE option_name = 'theme_mods_astra';
     UPDATE wp_options SET option_value = 'a:1:{s:1:"x";i:1;}' WHERE option_name = 'theme_mods_oldtheme';
     UPDATE wp_options SET option_value = '/%year%/%postname%/' WHERE option_name = 'permalink_structure';
     UPDATE wp_posts SET post_content = '.a{background:url(${copy}/bg.png)}' WHERE ID = 30;
     UPDATE wp_options SET option_value = 'a:1:{i:1;s:1:"x";}' WHERE option_name = 'cron';
     UPDATE wp_postmeta SET meta_value = '2:2' WHERE meta_key = '_edit_lock';
     UPDATE wp_postmeta SET meta_value = 'full-width.php' WHERE meta_key = '_wp_page_template';
     DELETE FROM wp_term_relationships WHERE object_id = 11; INSERT INTO wp_term_relationships VALUES (11, 3, 0);
     INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_type, guid, menu_order, post_modified)
       VALUES (21, NOW(), '', 'News', '', '21', 'nav_menu_item', '${copy}/?p=21', 2, NOW());
     INSERT INTO wp_term_relationships VALUES (21, 2, 0);
     INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (21, '_menu_item_type', 'taxonomy'), (21, '_menu_item_object', 'category'),
       (21, '_menu_item_object_id', '3'), (21, '_menu_item_url', ''), (21, '_menu_item_menu_item_parent', '0');`
    )
    const answer = changeset('wpush', 'wordpress', 'wp_')
    const items = Object.fromEntries(answer.items.map((i) => [i.id, i]))
    assert.deepEqual(Object.keys(items).sort(), [
      'customCss:30',
      'menuItem:new:21',
      'option:blogdescription',
      'option:theme_mods_astra',
      'post:10',
      'post:11',
      'postmeta:10:_wp_page_template'
    ])
    // Phase 2: the active theme's mods whole, its Additional CSS in the live site's address.
    assert.deepEqual(items['option:theme_mods_astra'].write, { value: { logo: 5 } })
    assert.deepEqual(items['option:theme_mods_astra'].expect, { value: [] })
    assert.deepEqual(items['customCss:30'].write, { post_content: `.a{background:url(${live}/bg.png)}` })
    assert.deepEqual(items['customCss:30'].expect, { post_content: '.a{}' })
    assert.deepEqual(items['post:10'].write, { post_title: 'About our bakery' })
    assert.deepEqual(items['post:11'].write, { categories: ['news'] })
    assert.deepEqual(items['post:11'].expect, { post_category: [1] })
    assert.deepEqual(items['option:blogdescription'].write, { value: 'Fresh bread every morning' })
    assert.equal(items['option:blogdescription'].title, 'Tagline')
    // What each one is and its fixed words, by name: the dialog says them in the Owner's language.
    assert.deepEqual(
      ['post:10', 'post:11', 'option:blogdescription', 'menuItem:new:21', 'customCss:30'].map((id) => [
        items[id].what,
        items[id].label ?? null,
        items[id].subject ?? null
      ]),
      [
        ['page', null, null],
        ['post', null, null],
        ['setting', 'blogdescription', null],
        ['menuItem', null, null],
        ['setting', 'additionalCss', 'astra']
      ]
    )
    assert.deepEqual(items['postmeta:10:_wp_page_template'].expect, { value: 'default' })
    assert.equal(items['menuItem:new:21'].key, 'main')
    assert.deepEqual(
      { ...items['menuItem:new:21'].write, title: undefined },
      {
        title: undefined,
        position: '2',
        type: 'taxonomy',
        object: 'category',
        object_id: '3',
        url: '',
        parent: '0'
      }
    )
    assert.deepEqual(answer.homes, [live, copy])
    // A theme that does not run is named, permalinks never go; WordPress's own cron and Tracy's token are not named.
    assert.deepEqual(answer.unsupported, [
      {
        what: 'setting',
        table: 'options',
        name: 'theme_mods_oldtheme',
        change: 'modified',
        reason: 'no-safe-action'
      },
      {
        what: 'setting',
        table: 'options',
        name: 'Permalink structure',
        change: 'modified',
        reason: 'permalink',
        // The dialog says it in the Owner's language by this name (`push.label.permalink_structure`).
        label: 'permalink_structure'
      }
    ])
  }
)

// ── a block theme (dev wp-tracy-ai, 27/10/2026) ─────────────────────────────────────────────
// The agent renamed a menu entry of a block theme in its header part: the change sat in a
// `wp_template_part` row, which no kind read, and the push neither sent it nor said it was not sent.
const BLOCK_THEME = `
UPDATE wp_options SET option_value = 'twentytwentyfive' WHERE option_name = 'stylesheet';
INSERT INTO wp_terms VALUES (10, 'twentytwentyfive', 'twentytwentyfive', 0), (11, 'header', 'header', 0),
  (12, 'oldtheme', 'oldtheme', 0), (13, 'footer', 'footer', 0);
INSERT INTO wp_term_taxonomy VALUES (10, 10, 'wp_theme', '', 0, 1), (11, 11, 'wp_template_part_area', '', 0, 1),
  (12, 12, 'wp_theme', '', 0, 1), (13, 13, 'wp_template_part_area', '', 0, 0);
INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_type, guid, post_modified) VALUES
  (40, '2026-01-01', '<!-- wp:navigation {"ref":43} /-->', 'Header', '', 'header', 'wp_template_part', 'HOME/?p=40', '2026-01-01'),
  (42, '2026-01-01', '<!-- wp:group --><!-- wp:post-content /--><!-- /wp:group -->', 'Page', '', 'page', 'wp_template', 'HOME/?p=42', '2026-01-01'),
  (43, '2026-01-01', '<!-- wp:navigation-link {"label":"Help","url":"HOME/help"} /-->', 'Main menu', '', 'main-menu', 'wp_navigation', 'HOME/?p=43', '2026-01-01'),
  (44, '2026-01-01', 'Bread', 'Bread', '', 'bread', 'product', 'HOME/?p=44', '2026-01-01'),
  (45, '2026-01-01', '<p>Old header</p>', 'Header', '', 'header', 'wp_template_part', 'HOME/?p=45', '2026-01-01'),
  (46, '2026-01-01', '{"version":3}', 'Custom Styles', '', 'wp-global-styles-twentytwentyfive', 'wp_global_styles', 'HOME/?p=46', '2026-01-01'),
  (47, '2026-01-01', 'x', '', '', '47-revision-v1', 'revision', 'HOME/?p=47', '2026-01-01');
INSERT INTO wp_term_relationships VALUES (40, 10, 0), (40, 11, 0), (42, 10, 0), (45, 12, 0), (46, 10, 0);
`

test(
  'WordPress block theme: a header part, a new footer part, a template handed back to the theme, a menu and Styles go by what they are; any other post type is named as not sent',
  opts,
  () => {
    const live = 'https://shop.example'
    const copy = 'https://shop-com.tracy.ai'
    const home = (
      side
    ) => `UPDATE wp_posts SET post_content = REPLACE(post_content, 'HOME', '${side}'), guid = REPLACE(guid, 'HOME', '${side}');
     UPDATE wp_options SET option_value = '${side}' WHERE option_value = 'HOME';`
    schemas(
      'wblock',
      WORDPRESS + BLOCK_THEME,
      home(live),
      `${home(copy)}
     UPDATE wp_posts SET post_content = '<!-- wp:navigation {"ref":43,"overlayMenu":"never"} /--><p>Call us</p>' WHERE ID = 40;
     INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_type, guid, post_modified)
       VALUES (41, NOW(), '<p><a href="${copy}/about">Shop</a></p>', 'Footer', '', 'footer', 'wp_template_part', '${copy}/?p=41', NOW());
     INSERT INTO wp_term_relationships VALUES (41, 10, 0), (41, 13, 0);
     DELETE FROM wp_posts WHERE ID = 42; DELETE FROM wp_term_relationships WHERE object_id = 42;
     UPDATE wp_posts SET post_content = '<!-- wp:navigation-link {"label":"Support","url":"${copy}/help"} /-->' WHERE ID = 43;
     UPDATE wp_posts SET post_title = 'Sourdough' WHERE ID = 44;
     UPDATE wp_posts SET post_content = '<p>Other theme</p>' WHERE ID = 45;
     UPDATE wp_posts SET post_content = '{"version":3,"styles":{"color":{"text":"#111"}}}' WHERE ID = 46;
     UPDATE wp_posts SET post_content = 'y' WHERE ID = 47;`
    )
    const answer = changeset('wblock', 'wordpress', 'wp_')
    const items = Object.fromEntries(answer.items.map((i) => [i.id, i]))
    assert.deepEqual(Object.keys(items).sort(), [
      'blockPost:43',
      'globalStyles:46',
      'template:page',
      'templatePart:footer',
      'templatePart:header'
    ])
    // The header: by slug, written whole (content and title), each checked against the base.
    const header = items['templatePart:header']
    assert.deepEqual(
      [header.kind, header.op, header.key, header.ident, header.title],
      ['templatePart', 'update', 'header', 0, 'Header']
    )
    assert.deepEqual(header.write, {
      content: '<!-- wp:navigation {"ref":43,"overlayMenu":"never"} /--><p>Call us</p>',
      title: 'Header'
    })
    assert.deepEqual(header.expect, { content: '<!-- wp:navigation {"ref":43} /-->', title: 'Header' })
    assert.equal(header.bodyRevision, true)
    assert.equal(header.what, 'templatePart', 'the dialog names it a template part in the Owner’s words')
    assert.deepEqual(
      Object.keys(header.fields),
      ['post_content'],
      'the dialog names what changed, not what goes with it'
    )
    assert.deepEqual(header.seed, [
      { table: 'posts', match: { ID: 40 }, columns: ['post_content', 'post_title'] }
    ])
    // The new footer: only while the live site still shows the theme's file; in the live site's address;
    // remembered as the copy's row 41 once the live site numbers it.
    const footer = items['templatePart:footer']
    assert.deepEqual([footer.op, footer.key, footer.creates], ['create', 'footer', 'posts:41'])
    assert.deepEqual(footer.write, {
      content: `<p><a href="${live}/about">Shop</a></p>`,
      title: 'Footer',
      area: 'footer'
    })
    assert.deepEqual(footer.expect, { $absent: true })
    assert.deepEqual(footer.seed, [
      {
        table: 'posts',
        match: { ID: 41 },
        columns: ['post_content', 'post_title'],
        create: true,
        entity: 'posts',
        id: 41
      }
    ])
    // The page template the copy handed back to the theme: removed on the live site (with the removals
    // ticked), only while it still holds the base's.
    const page = items['template:page']
    assert.deepEqual([page.op, page.key, page.group], ['delete', 'page', 'remove'])
    assert.deepEqual(page.expect, {
      content: '<!-- wp:group --><!-- wp:post-content /--><!-- /wp:group -->',
      title: 'Page'
    })
    assert.deepEqual(page.seed, [{ table: 'posts', match: { ID: 42 }, rows: 'theirs' }])
    // The block menu and Styles: posts the engine writes by number.
    assert.deepEqual(
      [items['blockPost:43'].kind, items['blockPost:43'].title, items['blockPost:43'].what],
      ['post', 'Main menu', 'navigation']
    )
    assert.deepEqual(
      [items['template:page'].what, items['templatePart:footer'].what],
      ['template', 'templatePart']
    )
    assert.deepEqual(items['blockPost:43'].write, {
      post_content: `<!-- wp:navigation-link {"label":"Support","url":"${live}/help"} /-->`
    })
    assert.deepEqual(items['globalStyles:46'].write, {
      post_content: '{"version":3,"styles":{"color":{"text":"#111"}}}'
    })
    assert.deepEqual(
      [items['globalStyles:46'].title, items['globalStyles:46'].label, items['globalStyles:46'].what],
      ['Styles', 'styles', 'setting']
    )
    // A product is named; another theme's part and a revision are not.
    assert.deepEqual(
      answer.unsupported.filter((u) => u.what === 'record'),
      [{ what: 'record', kind: 'product', title: 'Sourdough', op: 'update', reason: 'no-safe-action' }]
    )
  }
)

// ── an id map that files live records under the wrong live number (dev, 25/10/2026) ─────────
// wp-tracy-ai: live auto-draft 3683 was remembered as copy 3741; the live site dropped it and published
// post 3741; a Sync from live of before 24f5c8cd29 numbered that post 3822 on the copy and wrote
// `3683 → 3822` — so live 3741 was remembered nowhere. Sync to live then offered copy 3822 as a new post
// and live 3741 as one Tracy deleted: the push trashed 3741 and made 3977, a second copy of it. Here
// in small numbers: live 41/46/47 are copy 82/84/85, filed under 33/34/35 — 33 gone from the live
// site (the auto-draft), 34 a revision it still holds and the copy holds as 46, 35 gone and nowhere.

/** The changeset's records by what happens to them, in the live site's numbers. */
const ops = (answer) =>
  answer.items
    .filter((i) => ['create', 'update', 'delete'].includes(i.op))
    .map((i) => [i.op, i.title, i.liveId])
    .sort((a, b) => String(a).localeCompare(String(b)))

/** `live_push.py record` after an apply that wrote `written`: the id map it leaves. */
function recordPush(name, answer, idMap, written = []) {
  const files = Object.fromEntries(
    ['changeset', 'result', 'map', 'pushed'].map((f) => [f, join(root, `${name}-record-${f}.json`)])
  )
  writeFileSync(files.changeset, JSON.stringify(answer))
  writeFileSync(files.result, JSON.stringify({ written: written.map((id) => ({ id })), created: {} }))
  writeFileSync(files.map, JSON.stringify(idMap))
  const r = spawnSync(
    'python3',
    [
      PUSH,
      'record',
      '--changeset',
      files.changeset,
      '--result',
      files.result,
      '--id-map',
      files.map,
      '--pushed',
      files.pushed
    ],
    { encoding: 'utf8' }
  )
  assert.equal(r.status, 0, r.stderr)
  return {
    said: JSON.parse(r.stdout.trim().split('\n').at(-1)),
    map: JSON.parse(readFileSync(files.map, 'utf8'))
  }
}

test(
  'WordPress: a post the id map files under the wrong live number pairs with the live post it is — never a new post and a removed one; Tracy’s own post is still made',
  opts,
  () => {
    const live = 'https://shop.example'
    const copy = 'https://shop-com.tracy.ai'
    const post = (home, id, date, title, content, status = 'publish') =>
      `(${id}, '${date}', '${content}', '${title}', '', '${status === 'auto-draft' ? '' : title.toLowerCase().replace(/ /g, '-')}',
        'post', '${home}/?p=${id}', '${date}', '${status}')`
    const posts = (home, list) =>
      `INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_type, guid, post_modified,
         post_status) VALUES ${list.map((p) => post(home, ...p)).join(', ')};`
    // A revision of "Spring sale": the live site's 34 is the copy's 46 (as live 3692 was copy 3759).
    const revision = (home, id, parent) =>
      `INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_type, guid, post_modified,
         post_status, post_parent) VALUES (${id}, '2026-03-02 10:00:00', 'Spring.', 'Spring sale', '', '${parent}-revision-v1',
         'revision', '${home}/?p=${id}', '2026-03-02 10:00:00', 'inherit', ${parent});`
    const at = (home) =>
      `UPDATE wp_posts SET post_content = REPLACE(post_content, 'HOME', '${home}'), guid = REPLACE(guid, 'HOME', '${home}');
       UPDATE wp_options SET option_value = '${home}' WHERE option_value = 'HOME';`
    schemas(
      'wpmoved',
      WORDPRESS,
      `${at(live)}
       ${posts(live, [
         [41, '2026-10-24 08:06:00', 'Live S5 0806', 'Live S5 text.'],
         [46, '2026-10-24 08:40:00', 'Live S13 0806 n1', 'n1 text.'],
         [47, '2026-10-24 08:41:00', 'Live S13 0806 n7', 'n7 text.'],
         [12, '2026-03-01 10:00:00', 'Spring sale', 'Spring.'],
         [50, '2026-02-01 10:00:00', 'Old offer', 'Old.']
       ])}
       INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (41, '_wp_page_template', 'live.php');
       ${revision(live, 34, 12)}`,
      `${at(copy)}
       ${posts(copy, [
         // The copy still holds 41 for the auto-draft it was given (as 3741 on dev).
         [41, '2026-10-24 07:00:00', 'Auto Draft', '', 'auto-draft'],
         [82, '2026-10-24 08:06:00', 'Live S5 0806', 'Live S5 text.'],
         [84, '2026-10-24 08:40:00', 'Live S13 0806 n1', 'n1 text, by Tracy.'],
         [85, '2026-10-24 08:41:00', 'Live S13 0806 n7', 'n7 text.'],
         [13, '2026-03-01 10:00:00', 'Spring sale', 'Spring, by Tracy.'],
         // Filed under a live number the live site lost, and named nothing the live site holds.
         [86, '2026-05-05 10:00:00', 'Renamed by Tracy', 'Kept.'],
         [90, '2026-10-25 09:00:00', 'Tracy news', 'By Tracy.']
       ])}
       INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (82, '_wp_page_template', 'live.php');
       ${revision(copy, 46, 13)}`
    )
    const idMap = { posts: { 33: 82, 34: 84, 35: 85, 12: 13, 36: 86 } }
    const answer = changeset('wpmoved', 'wordpress', 'wp_', idMap)
    assert.deepEqual(ops(answer), [
      ['create', 'Tracy news', null],
      ['delete', 'Old offer', 50],
      ['update', 'Live S13 0806 n1', 46],
      ['update', 'Spring sale', 12]
    ])
    assert.deepEqual(
      answer.items.find((i) => i.liveId === 46).write,
      { post_content: 'n1 text, by Tracy.' },
      'Tracy’s edit of a renumbered post goes to the live post it is'
    )
    // The safety net: a record the id map names is the live site's own — never made there again.
    assert.deepEqual(
      answer.unsupported.filter((u) => u.what === 'record'),
      [
        {
          what: 'record',
          kind: 'post',
          title: 'Renamed by Tracy',
          op: 'create',
          reason: 'no-safe-action',
          why: 'live-record',
          liveId: 36
        }
      ]
    )
    assert.deepEqual(
      answer.repairs.map((r) => [r.live, r.copy, r.was]),
      [
        [41, 82, 33],
        [46, 84, 34],
        [47, 85, 35]
      ]
    )
    // After the push the map names each live post by its own number, and the number it was filed
    // under the copy's record it named before (the auto-draft 41, the revision 46), or nothing.
    const { said, map } = recordPush('wpmoved', answer, idMap)
    assert.equal(said.idMapRepaired, 3)
    assert.deepEqual(map, { posts: { 12: 13, 33: 41, 34: 46, 36: 86, 41: 82, 46: 84, 47: 85 } })
    // A preview on the map put right offers the same, with nothing left to put right.
    const again = changeset('wpmoved', 'wordpress', 'wp_', map)
    assert.deepEqual(ops(again), ops(answer))
    assert.equal(again.repairs, undefined)
  }
)

test(
  'Joomla: an article the id map files under the wrong live number pairs with the live article it is; one it cannot tell apart is neither made nor removed',
  opts,
  () => {
    const articles = (list) =>
      `INSERT INTO jos_content (id, title, alias, introtext, \`fulltext\`, catid) VALUES ${list
        .map(
          ([id, title, text]) =>
            `(${id}, '${title}', '${title.toLowerCase().replace(/ /g, '-')}', '${text}', '', 2)`
        )
        .join(', ')};`
    schemas(
      'jmoved',
      JOOMLA,
      articles([
        [41, 'Live S5', 'Made on the live site.'],
        [42, 'Draft', 'One.'],
        [43, 'Draft', 'Two.'],
        [50, 'Old offer', 'Old.']
      ]),
      articles([
        [82, 'Live S5', 'Made on the live site, by Tracy.'],
        // Filed under a live number the live site lost; two live articles carry its name.
        [86, 'Draft', 'Kept.'],
        [90, 'Tracy fair', 'Soon.']
      ])
    )
    const idMap = { content: { 33: 82, 36: 86 } }
    const answer = changeset('jmoved', 'joomla', 'jos_', idMap)
    assert.deepEqual(ops(answer), [
      ['create', 'Tracy fair', null],
      ['delete', 'Old offer', 50],
      ['update', 'Live S5', 41]
    ])
    assert.deepEqual(answer.items.find((i) => i.liveId === 41).write, {
      introtext: 'Made on the live site, by Tracy.'
    })
    assert.deepEqual(
      answer.unsupported.filter((u) => u.what === 'record').map((u) => [u.op, u.title, u.why, u.liveId]),
      [
        ['create', 'Draft', 'live-record', 36],
        ['delete', 'Draft', 'live-record-unclear', '42'],
        ['delete', 'Draft', 'live-record-unclear', '43']
      ]
    )
    assert.deepEqual(answer.repairs, [
      { entity: 'content', kind: 'article', live: 41, copy: 82, was: 33, wasNow: null, title: 'Live S5' }
    ])
    assert.deepEqual(recordPush('jmoved', answer, idMap).map, { content: { 36: 86, 41: 82 } })
  }
)

// ── a multilingual WordPress site as the dev one that failed (24/10/2026) ─────────────────────
// Italian and English help pages (a language taxonomy and its translation groups), many pages around
// 3518–3553, the active theme's mods (menu locations, the Additional CSS post, the logo, an address),
// menus, auto-drafts, trashed pages, revisions, a new picture, options holding serialized arrays — and
// a `wp_options` whose two columns carry different collations, which an old site upgraded column by
// column has. `S((…))` is a PHP serialized string, its byte length counted once the address is in.
const WORDPRESS_MULTILINGUAL = `
CREATE TABLE wp_posts (ID BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, post_author BIGINT UNSIGNED DEFAULT 0, post_date DATETIME,
  post_date_gmt DATETIME, post_content LONGTEXT, post_title TEXT, post_excerpt TEXT, post_status VARCHAR(20) DEFAULT 'publish',
  comment_status VARCHAR(20) DEFAULT 'open', ping_status VARCHAR(20) DEFAULT 'open', post_password VARCHAR(255) DEFAULT '',
  post_name VARCHAR(200), to_ping TEXT, pinged TEXT, post_modified DATETIME, post_modified_gmt DATETIME, post_content_filtered LONGTEXT,
  post_parent BIGINT UNSIGNED DEFAULT 0, guid VARCHAR(255), menu_order INT DEFAULT 0, post_type VARCHAR(20) DEFAULT 'post',
  post_mime_type VARCHAR(100) DEFAULT '', comment_count BIGINT DEFAULT 0);
CREATE TABLE wp_postmeta (meta_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, post_id BIGINT UNSIGNED, meta_key VARCHAR(255), meta_value LONGTEXT);
CREATE TABLE wp_terms (term_id BIGINT UNSIGNED PRIMARY KEY, name VARCHAR(200), slug VARCHAR(200), term_group BIGINT DEFAULT 0);
CREATE TABLE wp_term_taxonomy (term_taxonomy_id BIGINT UNSIGNED PRIMARY KEY, term_id BIGINT UNSIGNED, taxonomy VARCHAR(32),
  description LONGTEXT, parent BIGINT UNSIGNED DEFAULT 0, count BIGINT DEFAULT 0, UNIQUE KEY term_id_taxonomy (term_id, taxonomy));
CREATE TABLE wp_term_relationships (object_id BIGINT UNSIGNED, term_taxonomy_id BIGINT UNSIGNED, term_order INT DEFAULT 0,
  PRIMARY KEY (object_id, term_taxonomy_id));
CREATE TABLE wp_termmeta (meta_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, term_id BIGINT UNSIGNED, meta_key VARCHAR(255), meta_value LONGTEXT);
CREATE TABLE wp_options (option_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, option_name VARCHAR(191) COLLATE utf8mb4_unicode_520_ci UNIQUE, option_value LONGTEXT COLLATE utf8mb4_unicode_ci,
  autoload VARCHAR(20) DEFAULT 'yes');
CREATE TABLE wp_users (ID BIGINT UNSIGNED PRIMARY KEY, user_login VARCHAR(60), user_email VARCHAR(100));
CREATE TABLE wp_usermeta (umeta_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED, meta_key VARCHAR(255), meta_value LONGTEXT);
CREATE TABLE wp_comments (comment_ID BIGINT UNSIGNED PRIMARY KEY, comment_post_ID BIGINT UNSIGNED, comment_content TEXT);
INSERT INTO wp_users VALUES (1, 'admin', 'a@b.c');
INSERT INTO wp_terms VALUES (1, 'Uncategorized', 'uncategorized', 0), (2, 'Main', 'main', 0), (3, 'Footer IT', 'footer-it', 0),
  (4, 'Italiano', 'it', 0), (5, 'English', 'en', 0), (6, 'pll_6a1b', 'pll_6a1b', 0), (7, 'pll_it', 'pll_it', 0), (9, 'Guide', 'guide', 0);
INSERT INTO wp_term_taxonomy VALUES (1, 1, 'category', '', 0, 1), (2, 2, 'nav_menu', '', 0, 2), (3, 3, 'nav_menu', '', 0, 0),
  (4, 4, 'language', 'a:3:{s:6:"locale";s:5:"it_IT";s:3:"rtl";i:0;s:9:"flag_code";s:2:"it";}', 0, 4),
  (5, 5, 'language', 'a:3:{s:6:"locale";s:5:"en_GB";s:3:"rtl";i:0;s:9:"flag_code";s:2:"gb";}', 0, 1),
  (6, 6, 'post_translations', 'a:2:{s:2:"it";i:3518;s:2:"en";i:3519;}', 0, 2), (7, 7, 'term_language', '', 0, 1),
  (9, 9, 'category', 'Guide è facile', 1, 0);
INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_status, post_type, post_parent, guid, menu_order, post_modified) VALUES
  (3518, '2026-01-01', '<p>Benvenuto nell’<a href="HOME/it/help/">aiuto</a></p>', 'Aiuto', '', 'aiuto', 'publish', 'page', 0, 'HOME/?page_id=3518', 0, '2026-01-01'),
  (3519, '2026-01-01', '<p>Welcome to <a href="HOME/en/help/">help</a></p>', 'Help', '', 'help', 'publish', 'page', 0, 'HOME/?page_id=3519', 0, '2026-01-01'),
  (3520, '2026-01-01', '<p>Iniziare è facile</p>', 'Come iniziare', '', 'come-iniziare', 'publish', 'page', 3518, 'HOME/?page_id=3520', 1, '2026-01-01'),
  (3521, '2026-01-01', '<p>Domande</p>', 'Domande frequenti', '', 'domande-frequenti', 'publish', 'page', 3518, 'HOME/?page_id=3521', 2, '2026-01-01'),
  (3522, '2026-01-01', '<p>old</p>', 'Vecchia pagina', '', 'vecchia__trashed', 'trash', 'page', 0, 'HOME/?page_id=3522', 0, '2026-01-01'),
  (3523, '2026-01-01', '', 'Bozza automatica', '', '', 'auto-draft', 'page', 0, 'HOME/?page_id=3523', 0, '2026-01-01'),
  (3524, '2026-01-01', '.site-header{color:#111}', 'astra', '', 'astra', 'publish', 'custom_css', 0, 'HOME/?p=3524', 0, '2026-01-01'),
  (3525, '2026-01-01', '', '', '', '3525', 'publish', 'nav_menu_item', 0, 'HOME/?p=3525', 1, '2026-01-01'),
  (3526, '2026-01-01', '', 'Shop', '', '3526', 'publish', 'nav_menu_item', 0, 'HOME/?p=3526', 2, '2026-01-01'),
  (3527, '2026-01-01', '', 'logo', '', 'logo', 'inherit', 'attachment', 0, 'HOME/wp-content/uploads/2026/10/logo.png', 0, '2026-01-01'),
  (3530, '2026-01-01', '<p>Scrivici</p>', 'Contatti', '', 'contatti', 'publish', 'page', 0, 'HOME/?page_id=3530', 3, '2026-01-01'),
  (3541, '2026-01-01', '<p>Spedizione gratuita</p>', 'Spedizione', '', 'spedizione', 'publish', 'page', 3518, 'HOME/?page_id=3541', 4, '2026-01-01'),
  (3542, '2026-01-01', '<p>rev</p>', 'Aiuto', '', '3518-revision-v1', 'inherit', 'revision', 3518, 'HOME/?p=3542', 0, '2026-01-01'),
  (3543, '2026-01-01', '<p>Ciao</p>', 'Ciao mondo', '', 'ciao-mondo', 'publish', 'post', 0, 'HOME/?p=3543', 0, '2026-01-01');
INSERT INTO wp_term_relationships VALUES (3518, 4, 0), (3520, 4, 0), (3521, 4, 0), (3530, 4, 0), (3519, 5, 0), (3518, 6, 0), (3519, 6, 0),
  (3525, 2, 0), (3526, 2, 0), (3543, 1, 0), (3543, 4, 0), (1, 7, 0);
INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES
  (3525, '_menu_item_type', 'post_type'), (3525, '_menu_item_object', 'page'), (3525, '_menu_item_object_id', '3518'),
  (3525, '_menu_item_url', ''), (3525, '_menu_item_menu_item_parent', '0'), (3525, '_menu_item_target', ''),
  (3525, '_menu_item_classes', 'a:1:{i:0;s:0:"";}'), (3525, '_menu_item_xfn', ''),
  (3526, '_menu_item_type', 'custom'), (3526, '_menu_item_object', 'custom'), (3526, '_menu_item_object_id', '3526'),
  (3526, '_menu_item_url', 'HOME/shop/'), (3526, '_menu_item_menu_item_parent', '0'),
  (3527, '_wp_attached_file', '2026/10/logo.png'),
  (3527, '_wp_attachment_metadata', 'a:3:{s:5:"width";i:200;s:6:"height";i:80;s:4:"file";s:16:"2026/10/logo.png";}'),
  (3527, '_wp_attachment_image_alt', 'Logo'),
  (3518, '_wp_page_template', 'default'), (3518, '_edit_lock', '1:1'), (3518, '_thumbnail_id', '3527'),
  (3518, '_yoast_wpseo_title', 'Aiuto %%sep%% %%sitename%%'), (3518, '_yoast_wpseo_metadesc', 'Tutto sull’aiuto'),
  (3518, '_elementor_data', '[{"id":"a1","settings":{"link":{"url":"HOME/it/help/"}}}]'),
  (3518, '_elementor_page_settings', 'a:1:{s:10:"hide_title";s:3:"yes";}'),
  (3520, '_wp_page_template', 'default'), (3520, '_edit_last', '1'), (3521, '_wp_page_template', 'default'),
  (3530, '_wp_page_template', 'default'), (3541, '_wp_page_template', 'default'),
  (3522, '_wp_trash_meta_status', 'publish'), (3522, '_wp_trash_meta_time', '1760000000'), (3522, '_wp_desired_post_slug', 'vecchia'),
  (3518, 'dup', '1'), (3518, 'dup', '2');
INSERT INTO wp_options (option_name, option_value) VALUES ('home', 'HOME'), ('siteurl', 'HOME'), ('blogname', 'Scooter elettrici'),
  ('blogdescription', 'Per studenti'), ('stylesheet', 'astra'), ('template', 'astra'),
  ('theme_mods_astra', 'a:5:{i:0;b:0;s:18:"nav_menu_locations";a:2:{s:7:"primary";i:2;s:6:"footer";i:3;}s:18:"custom_css_post_id";i:3524;s:11:"custom_logo";i:3527;s:11:"header_html";S((<a href="HOME/it/">Home</a>));}'),
  ('theme_mods_twentytwentyfive', 'a:1:{s:18:"custom_css_post_id";i:-1;}'),
  ('polylang', 'a:4:{s:7:"browser";i:0;s:7:"rewrite";i:1;s:12:"default_lang";s:2:"it";s:10:"post_types";a:0:{}}'),
  ('sidebars_widgets', 'a:2:{s:19:"wp_inactive_widgets";a:0:{}s:13:"array_version";i:3;}'),
  ('widget_text', 'a:1:{s:12:"_multiwidget";i:1;}'), ('page_on_front', '3518'), ('show_on_front', 'page'), ('site_icon', '3527'),
  ('permalink_structure', '/%postname%/'), ('cron', 'a:0:{}'), ('claude_cowork_token', 'secret'),
  ('_transient_x', 'y'), ('rewrite_rules', 'a:0:{}'), ('date_format', 'd/m/Y'), ('timezone_string', 'Europe/Rome'), ('gmt_offset', '');
`
const WORDPRESS_MULTILINGUAL_COPY = `
UPDATE wp_posts SET post_content = '<p>Iniziare è facilissimo: <a href="HOME/it/help/spedizioni/">spedizioni</a></p>', post_modified = NOW() WHERE ID = 3520;
UPDATE wp_posts SET post_status = 'trash', post_name = 'domande-frequenti__trashed' WHERE ID = 3521;
UPDATE wp_posts SET post_title = 'Contattaci' WHERE ID = 3545;
INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_status, post_type, post_parent, guid, menu_order, post_modified) VALUES
  (3546, NOW(), '<p>Spediamo in tutta Italia</p>', 'Spedizioni', '', 'spedizioni', 'publish', 'page', 3518, 'HOME/?page_id=3546', 5, NOW()),
  (3547, NOW(), '', 'spedizioni', '', 'spedizioni-2', 'inherit', 'attachment', 3546, 'HOME/wp-content/uploads/2026/10/spedizioni.jpg', 0, NOW()),
  (3548, NOW(), '', '', '', '3548', 'publish', 'nav_menu_item', 0, 'HOME/?p=3548', 1, NOW()),
  (3549, NOW(), '', 'Bozza automatica', '', '', 'auto-draft', 'post', 0, 'HOME/?p=3549', 0, NOW()),
  (3550, NOW(), '<p>rev</p>', 'Spedizioni', '', '3546-revision-v1', 'inherit', 'revision', 3546, 'HOME/?p=3550', 0, NOW());
INSERT INTO wp_terms VALUES (8, 'Footer nuovo', 'footer-nuovo', 0);
INSERT INTO wp_term_taxonomy VALUES (8, 8, 'nav_menu', '', 0, 1);
UPDATE wp_term_taxonomy SET description = 'a:2:{s:2:"it";i:3518;s:2:"en";i:3519;}', count = 3 WHERE term_taxonomy_id = 6;
INSERT INTO wp_term_relationships VALUES (3546, 4, 0), (3548, 8, 0);
INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (3546, '_wp_page_template', 'default'), (3546, '_thumbnail_id', '3547'),
  (3546, '_yoast_wpseo_title', 'Spedizioni %%sep%% %%sitename%%'),
  (3547, '_wp_attached_file', '2026/10/spedizioni.jpg'),
  (3547, '_wp_attachment_metadata', 'a:1:{s:5:"width";i:800;}'),
  (3548, '_menu_item_type', 'post_type'), (3548, '_menu_item_object', 'page'), (3548, '_menu_item_object_id', '3546'),
  (3548, '_menu_item_url', ''), (3548, '_menu_item_menu_item_parent', '0');
UPDATE wp_postmeta SET meta_value = '[{"id":"a1","settings":{"link":{"url":"HOME/it/help/spedizioni/"}}}]' WHERE post_id = 3518 AND meta_key = '_elementor_data';
UPDATE wp_options SET option_value = 'a:5:{i:0;b:0;s:18:"nav_menu_locations";a:2:{s:7:"primary";i:2;s:6:"footer";i:8;}s:18:"custom_css_post_id";i:3524;s:11:"custom_logo";i:3527;s:11:"header_html";S((<a href="HOME/it/">Casa</a>));}' WHERE option_name = 'theme_mods_astra';
UPDATE wp_posts SET post_content = '.site-header{color:#c33}' WHERE ID = 3524;
UPDATE wp_options SET option_value = 'Per studenti e famiglie' WHERE option_name = 'blogdescription';
UPDATE wp_options SET option_value = 'a:2:{s:19:"wp_inactive_widgets";a:1:{i:0;s:6:"text-2";}s:13:"array_version";i:3;}' WHERE option_name = 'sidebars_widgets';
INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_status, post_type, post_parent, guid, menu_order, post_modified) VALUES
  (3551, NOW(), '', NULL, '', '3551', 'publish', 'nav_menu_item', 0, 'HOME/?p=3551', 3, NOW()),
  (3552, NOW(), NULL, 'Senza testo', NULL, NULL, 'draft', 'page', 9999, 'HOME/?p=3552', 0, NOW()),
  (3553, NOW(), '', 'no file', '', 'nofile', 'inherit', 'attachment', 0, 'HOME/?p=3553', 0, NOW());
INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (3546, NULL, 'x'), (3546, 'nullvalue', NULL), (3546, '_pll_strings', 'a:1:{i:0;s:3:"già";}'),
  (3520, '_thumbnail_id', '3547');
INSERT INTO wp_options (option_name, option_value) VALUES ('nullopt', NULL), ('site_logo', '3547');
UPDATE wp_options SET option_value = '3546' WHERE option_name = 'page_on_front';
UPDATE wp_options SET option_value = '3547' WHERE option_name = 'site_icon';
UPDATE wp_options SET option_value = NULL WHERE option_name = 'timezone_string';
UPDATE wp_term_taxonomy SET description = NULL WHERE term_taxonomy_id = 9;
UPDATE wp_terms SET name = 'Guide è facili' WHERE term_id = 9;
`
const serialized = (text, home) =>
  text.replaceAll('HOME', home).replace(/S\(\((.*?)\)\)/g, (_, s) => `s:${Buffer.byteLength(s)}:"${s}"`)

test(
  'WordPress, a multilingual site: renumbered pages, theme mods, menus, auto-drafts and trash read through SQL — options whose columns differ in collation too',
  opts,
  () => {
    const live = 'https://wp-tracy-ai.xemaydienhocsinh.com'
    const copy = 'https://wp-tracy-ai-xemaydienhocsinh-com.tracy.ai'
    for (const [side, home] of [
      ['base', live],
      ['copy', copy]
    ]) {
      sql(
        `DROP DATABASE IF EXISTS \`wml_${side}\`; CREATE DATABASE \`wml_${side}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      )
      sql(serialized(WORDPRESS_MULTILINGUAL, home), `wml_${side}`)
    }
    // Earlier syncs renumbered: the customer's Contatti (live 3530) is 3545 on the copy, and Tracy's
    // Spedizione (3530 on the copy) is 3541 on the live site.
    sql(
      `UPDATE wp_posts SET ID = 3545 WHERE ID = 3530; UPDATE wp_postmeta SET post_id = 3545 WHERE post_id = 3530;
       UPDATE wp_term_relationships SET object_id = 3545 WHERE object_id = 3530;
       UPDATE wp_posts SET ID = 3530 WHERE ID = 3541; UPDATE wp_postmeta SET post_id = 3530 WHERE post_id = 3541;`,
      'wml_copy'
    )
    sql(serialized(WORDPRESS_MULTILINGUAL_COPY, copy), 'wml_copy')
    const answer = changeset('wml', 'wordpress', 'wp_', { posts: { 3530: 3545, 3541: 3530 } })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    const items = Object.fromEntries(answer.items.map((i) => [i.id, i]))
    // The renumbered page is written under the live site's number; the trashed one goes to the trash.
    assert.equal(items['post:3545'].liveId, 3530)
    assert.deepEqual(items['post:3545'].write, { post_title: 'Contattaci' })
    assert.equal(items['post:3521'].op, 'delete')
    // The active theme's mods, whole: the footer menu is the menu this push makes.
    const mods = items['option:theme_mods_astra']
    assert.deepEqual(mods.write.value.nav_menu_locations, { primary: 2, footer: { $new: 'terms:8' } })
    assert.equal(mods.write.value.header_html, `<a href="${live}/it/">Casa</a>`)
    assert.deepEqual(mods.dependsOn, ['term:new:8:nav_menu'])
    assert.deepEqual(items['customCss:3524'].write, { post_content: '.site-header{color:#c33}' })
    assert.deepEqual(items['option:page_on_front'].write, { value: { $new: 'posts:3546' } })
    assert.deepEqual(items['menuItem:new:3548'].write.object_id, { $new: 'posts:3546' })
    // Auto-drafts and revisions are never offered.
    assert.ok(!Object.keys(items).some((id) => /3549|3550|3542|3523/.test(id)), Object.keys(items).join(' '))
    assert.ok(
      answer.unsupported.some((u) => u.name === 'sidebars_widgets' && u.reason === 'no-safe-action'),
      JSON.stringify(answer.unsupported)
    )
  }
)

// ── WordPress: what a Sync from live kept as Tracy's while the customer changed it too ──────────
// The sync names a kept place by the row's own number in the copy (`option_id`, `meta_id`,
// `term_taxonomy_id`); the push names its items by what they are (`option_name`, `(post_id, meta_key)`,
// `(term_id, taxonomy)`). A setting both sides changed must still read as changed on both, or the
// push writes over the customer's value: the base it compares with is the live read the sync just
// took, which already holds the customer's change (24/10/2026).
const SYNC = join(here, '..', 'scripts', 'lib', 'live_sync.py')
const php = (pairs) =>
  `a:${Object.keys(pairs).length}:{${Object.entries(pairs)
    .map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`)
    .join('')}}`
const KEPT_BASE = `
INSERT INTO wp_terms VALUES (1, 'Uncategorized', 'uncategorized', 0), (3, 'News', 'news', 0), (4, 'Events', 'events', 0);
INSERT INTO wp_term_taxonomy VALUES (1, 1, 'category', '', 0, 0), (3, 3, 'category', 'What is new', 0, 0),
  (4, 4, 'category', 'Events here', 0, 0);
INSERT INTO wp_posts (ID, post_date, post_content, post_title, post_excerpt, post_name, post_type, guid, post_modified) VALUES
  (10, '2026-01-01', '<p>About</p>', 'About', '', 'about', 'page', 'HOME/?page_id=10', '2026-01-01'),
  (11, '2026-01-01', '<p>Hello</p>', 'Hello', '', 'hello', 'post', 'HOME/?p=11', '2026-01-01');
INSERT INTO wp_term_relationships VALUES (11, 1, 0);
INSERT INTO wp_postmeta (meta_id, post_id, meta_key, meta_value) VALUES (1, 10, '_wp_page_template', 'default'),
  (2, 10, 'subtitle', 'Old subtitle'), (3, 11, 'subtitle', 'Post subtitle');
INSERT INTO wp_options (option_id, option_name, option_value) VALUES (1, 'home', 'HOME'), (2, 'siteurl', 'HOME'),
  (3, 'blogname', 'Shop'), (4, 'blogdescription', 'Fresh bread'), (5, 'date_format', 'd/m/Y'), (6, 'stylesheet', 'astra'),
  (7, 'template', 'astra'), (8, 'theme_mods_astra', '${php({ header_color: '#111', footer_text: 'Hi' })}');
`
// Tracy on the copy. The copy numbers its options its own way (an earlier sync took them in another
// order): every option_id there is 100 above the live site's.
const KEPT_OURS = `
UPDATE wp_options SET option_id = option_id + 100;
UPDATE wp_options SET option_value = 'Shop by Tracy' WHERE option_name = 'blogname';
UPDATE wp_options SET option_value = 'Fresh bread daily' WHERE option_name = 'blogdescription';
UPDATE wp_options SET option_value = '${php({ header_color: '#c33', footer_text: 'Hi' })}' WHERE option_name = 'theme_mods_astra';
UPDATE wp_postmeta SET meta_value = 'Tracy subtitle' WHERE meta_id = 2;
UPDATE wp_postmeta SET meta_value = 'full-width.php' WHERE meta_id = 1;
UPDATE wp_terms SET name = 'Tracy News' WHERE term_id = 3;
UPDATE wp_term_taxonomy SET description = 'Tracy events' WHERE term_taxonomy_id = 4;
UPDATE wp_posts SET post_title = 'About Tracy' WHERE ID = 10;
UPDATE wp_posts SET post_title = 'Hello there' WHERE ID = 11;
`
// The customer on the live site, the same places — and an option of their own under the number the
// copy gives the site title, so a number read on the wrong side names the wrong setting.
const KEPT_THEIRS = `
UPDATE wp_options SET option_value = 'Shop Live' WHERE option_name = 'blogname';
UPDATE wp_options SET option_value = '${php({ header_color: '#0a0', footer_text: 'Hi' })}' WHERE option_name = 'theme_mods_astra';
INSERT INTO wp_options (option_id, option_name, option_value) VALUES (103, 'customer_option', 'mine');
UPDATE wp_postmeta SET meta_value = 'Live subtitle' WHERE meta_id = 2;
UPDATE wp_terms SET name = 'Live News' WHERE term_id = 3;
UPDATE wp_term_taxonomy SET description = 'Live events' WHERE term_taxonomy_id = 4;
UPDATE wp_posts SET post_title = 'About us' WHERE ID = 10;
`

test(
  'WordPress: a site title, a theme mod, a page’s meta and a category both sides changed since the last sync are never written over',
  opts,
  () => {
    const home = 'https://shop.example'
    const tables = WORDPRESS.slice(0, WORDPRESS.indexOf('INSERT INTO'))
    // kc_sb: the sync's base (the live read before); kc_copy: the copy; kc_st: the live read now, and
    // kc_base the same read as "Sync to live" loads it afterwards (raw: the merge rewrites its own).
    const sides = { sb: '', copy: KEPT_OURS, st: KEPT_THEIRS, base: KEPT_THEIRS }
    for (const [side, after] of Object.entries(sides)) {
      sql(
        `DROP DATABASE IF EXISTS \`kc_${side}\`; CREATE DATABASE \`kc_${side}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      )
      sql(tables + KEPT_BASE.replaceAll('HOME', home) + after, `kc_${side}`)
    }
    sql('DROP DATABASE IF EXISTS `kc_sw`;')
    const env = { ...process.env, TRACY_SYNC_SQL: JSON.stringify(CLIENT) }
    for (const schema of ['kc_sb', 'kc_st']) {
      const n = spawnSync(
        'python3',
        [SYNC, 'normalise', '--schema', schema, '--platform', 'wordpress', '--prefix', 'wp_'],
        {
          encoding: 'utf8',
          env
        }
      )
      assert.equal(n.status, 0, n.stderr)
    }
    const merged = spawnSync(
      'python3',
      [
        SYNC,
        'db',
        '--base-schema',
        'kc_sb',
        '--ours-schema',
        'kc_copy',
        '--theirs-schema',
        'kc_st',
        '--work-schema',
        'kc_sw',
        '--platform',
        'wordpress',
        '--prefix',
        'wp_',
        '--prefer',
        'ours'
      ],
      { encoding: 'utf8', env }
    )
    assert.equal(merged.status, 0, merged.stderr)
    const sync = JSON.parse(merged.stdout.trim().split('\n').at(-1))
    // What webroot-sync.sh `remember_kept` writes to sync/kept.json: names only, never a value.
    const kept = sync.kept
      .filter((k) => ['column', 'row'].includes(k.kind))
      .map((k) =>
        Object.fromEntries(
          ['id', 'kind', 'table', 'column', 'key', 'reason'].filter((n) => n in k).map((n) => [n, k[n]])
        )
      )
    assert.ok(kept.length >= 6, JSON.stringify(sync.kept))
    // The copy kept Tracy's every value: the push has each to offer.
    assert.equal(
      sql("SELECT option_value FROM wp_options WHERE option_name = 'blogname'", 'kc_copy'),
      'Shop by Tracy'
    )

    const answer = changeset('kc', 'wordpress', 'wp_', {}, kept)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    const conflicts = Object.fromEntries(answer.items.map((i) => [i.id, i.conflict ?? null]))
    assert.deepEqual(conflicts, {
      // Both changed: shown, never written.
      'option:blogname': { reason: 'changed-on-both', fields: ['value'] },
      'option:theme_mods_astra': { reason: 'changed-on-both', fields: ['header_color'] },
      'postmeta:10:subtitle': { reason: 'changed-on-both', fields: ['value'] },
      'term:3:category': { reason: 'changed-on-both', fields: ['name'] },
      'term:4:category': { reason: 'changed-on-both', fields: ['description'] },
      'post:10': { reason: 'changed-on-both', fields: ['post_title'] },
      // Only Tracy changed: still sent.
      'option:blogdescription': null,
      'postmeta:10:_wp_page_template': null,
      'post:11': null
    })
  }
)

test('WordPress preview uses native menu object titles and skips trash bookkeeping', opts, () => {
  schemas(
    'wlabels',
    WORDPRESS.replaceAll('HOME', 'https://shop.example'),
    `INSERT INTO wp_posts (ID,post_title,post_name,post_type) VALUES (66,'','menu-item','nav_menu_item');
      INSERT INTO wp_postmeta (post_id,meta_key,meta_value) VALUES (66,'_menu_item_type','post_type'),(66,'_menu_item_object','page'),(66,'_menu_item_object_id','10'),(66,'_menu_item_url',''),(66,'_menu_item_menu_item_parent','0');
      INSERT INTO wp_term_relationships VALUES (66,2,0);`,
    `INSERT INTO wp_posts (ID,post_title,post_name,post_type,menu_order) VALUES (66,'','menu-item','nav_menu_item',2);
      INSERT INTO wp_postmeta (post_id,meta_key,meta_value) VALUES (66,'_menu_item_type','post_type'),(66,'_menu_item_object','page'),(66,'_menu_item_object_id','10'),(66,'_menu_item_url',''),(66,'_menu_item_menu_item_parent','0'),(10,'_wp_desired_post_slug','about-old');
      INSERT INTO wp_term_relationships VALUES (66,2,0);`
  )
  const answer = changeset('wlabels', 'wordpress', 'wp_')
  const item = answer.items.find((i) => i.kind === 'menuItem')
  assert.equal(item.title, 'About')
  assert.deepEqual(item.write, { position: '2' })
  assert.ok(!answer.items.some((i) => i.key === '_wp_desired_post_slug'))
})
