# WordPress's half of "Sync from live" (scripts/lib/live_sync_wordpress.py), the parts that need no
# database: the live address rewritten the way provision's `wp search-replace` rewrote it into the
# copy (serialized PHP re-measured), and wp-config.php merged constant by constant.
#
#   python3 -m unittest packages/fleet/tracy-fleet-operation/test/live-sync-wordpress.test.py
#   (or: python3 packages/fleet/tracy-fleet-operation/test/live-sync-wordpress.test.py)
import importlib.util
import pathlib
import re
import subprocess
import tempfile
import unittest

LIB = pathlib.Path(__file__).parents[1] / "scripts/lib"
spec = importlib.util.spec_from_file_location("live_sync_wordpress", LIB / "live_sync_wordpress.py")
wp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wp)

OLD = b"https://shop.example"
NEW = b"https://shop-com.tracy.ai"


def s(text: bytes) -> bytes:
    """A serialized PHP string of `text`, its length said right."""
    return b's:%d:"%s";' % (len(text), text)


def php_unserialize_ok(data: bytes) -> bool:
    """Whether PHP reads the bytes back (when php is on this machine; else the shape is trusted)."""
    try:
        done = subprocess.run(["php", "-r", "echo unserialize(stream_get_contents(STDIN)) === false ? 'no' : 'yes';"],
                              input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return True
    return done.stdout == b"yes"


class AddressRewrite(unittest.TestCase):
    def test_plain_text_is_a_plain_replace(self):
        self.assertEqual(wp.replace_value(b'<a href="https://shop.example/menu">Menu</a>', OLD, NEW),
                         b'<a href="https://shop-com.tracy.ai/menu">Menu</a>')

    def test_a_value_without_the_address_is_left_byte_for_byte(self):
        value = b'a:1:{s:3:"url";s:9:"/relative";}'
        self.assertIs(wp.replace_value(value, OLD, NEW), value)

    def test_serialized_strings_are_measured_again(self):
        value = b"a:2:{s:4:\"logo\";" + s(b"https://shop.example/logo.png") + b"i:0;s:2:\"hi\";}"
        out = wp.replace_value(value, OLD, NEW)
        self.assertEqual(out, b"a:2:{s:4:\"logo\";" + s(b"https://shop-com.tracy.ai/logo.png") + b"i:0;s:2:\"hi\";}")
        self.assertTrue(php_unserialize_ok(out))

    def test_a_serialized_string_inside_a_serialized_string(self):
        inner = b"a:1:{i:0;" + s(b"https://shop.example/a.jpg") + b"}"
        value = b"a:1:{s:5:\"block\";" + s(inner) + b"}"
        out = wp.replace_value(value, OLD, NEW)
        inner_new = b"a:1:{i:0;" + s(b"https://shop-com.tracy.ai/a.jpg") + b"}"
        self.assertEqual(out, b"a:1:{s:5:\"block\";" + s(inner_new) + b"}")
        self.assertTrue(php_unserialize_ok(out))

    def test_objects_keep_their_class_and_property_names(self):
        value = b'O:8:"stdClass":1:{' + s(b"https://shop.example") + s(b"https://shop.example/x") + b"}"
        out = wp.replace_value(value, OLD, NEW)
        # The property NAME holding the address is a key: left alone, as wp-cli leaves array keys.
        self.assertEqual(out, b'O:8:"stdClass":1:{' + s(b"https://shop.example") + s(b"https://shop-com.tracy.ai/x") + b"}")

    def test_numbers_booleans_nulls_and_floats_pass_through(self):
        value = b"a:5:{i:0;i:-3;i:1;b:1;i:2;N;i:3;d:1.5E+20;i:4;" + s(b"https://shop.example") + b"}"
        out = wp.replace_value(value, OLD, NEW)
        self.assertEqual(out, b"a:5:{i:0;i:-3;i:1;b:1;i:2;N;i:3;d:1.5E+20;i:4;" + s(NEW) + b"}")

    def test_a_value_that_only_looks_serialized_is_a_plain_replace(self):
        # A length that does not match: PHP cannot read it, and wp-cli replaces it as text.
        broken = b'a:1:{s:3:"url";s:99:"https://shop.example";}'
        self.assertEqual(wp.replace_value(broken, OLD, NEW), broken.replace(OLD, NEW))

    def test_trailing_bytes_after_a_value_make_it_text(self):
        value = s(b"https://shop.example") + b" and more"
        self.assertEqual(wp.replace_value(value, OLD, NEW), value.replace(OLD, NEW))

    def test_a_custom_serialized_payload_is_carried_as_it_is(self):
        payload = b"https://shop.example"
        value = b'a:2:{i:0;C:3:"Foo":%d:{%s}i:1;%s}' % (len(payload), payload, s(b"https://shop.example/y"))
        out = wp.replace_value(value, OLD, NEW)
        self.assertEqual(out, b'a:2:{i:0;C:3:"Foo":%d:{%s}i:1;%s}' % (len(payload), payload, s(b"https://shop-com.tracy.ai/y")))

    def test_multibyte_text_is_measured_in_bytes(self):
        text = "Cà phê https://shop.example/menu".encode()
        out = wp.replace_value(s(text), OLD, NEW)
        self.assertEqual(out, s("Cà phê https://shop-com.tracy.ai/menu".encode()))
        self.assertTrue(php_unserialize_ok(out))


BASE = """<?php
/** The base configuration for WordPress */
define( 'DB_NAME', 'shop_live' );
define( 'DB_USER', 'shop' );
define( 'DB_PASSWORD', 'live-password' );
define( 'DB_HOST', 'localhost' );
define( 'AUTH_KEY', 'live-key' );
define( 'WP_DEBUG', false );
define( 'WP_POST_REVISIONS', 5 );
define( 'DISALLOW_FILE_EDIT', true );
$table_prefix = 'wp_';

/* That's all, stop editing! Happy publishing. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
"""


def copy_of(base: str) -> str:
    """The copy as provision renders it: its database, its address pinned above the marker."""
    out = (base.replace("'shop_live'", "'wordpress'").replace("'shop'", "'root'")
           .replace("'live-password'", "'copy-password'").replace("'localhost'", "'db'"))
    return out.replace("/* That's all", "define('WP_HOME', 'https://shop-com.tracy.ai');\n"
                                        "define('WP_SITEURL', 'https://shop-com.tracy.ai');\n/* That's all")


def merge(base: str, ours: str, theirs: str, decisions=None):
    got = wp.merge_wp_config(base.encode(), ours.encode(), theirs.encode(), decisions or {}, "wp-config.php")
    return None if got is None else (got[0].decode(), got[1])


class WpConfigMerge(unittest.TestCase):
    def test_a_live_constant_comes_over_and_the_copys_environment_stays(self):
        theirs = (BASE.replace("'WP_DEBUG', false", "'WP_DEBUG', true")
                  .replace("'live-password'", "'rotated'").replace("'live-key'", "'new-key'"))
        out, conflicts = merge(BASE, copy_of(BASE), theirs)
        self.assertEqual(conflicts, [])
        self.assertIn("define( 'WP_DEBUG', true );", out)
        self.assertIn("define( 'DB_PASSWORD', 'copy-password' );", out)
        self.assertIn("define( 'AUTH_KEY', 'live-key' );", out)
        self.assertIn("define('WP_HOME', 'https://shop-com.tracy.ai');", out)

    def test_a_constant_the_live_site_added_goes_above_the_marker(self):
        theirs = BASE.replace("$table_prefix", "define( 'WP_AUTO_UPDATE_CORE', 'minor' );\n$table_prefix")
        out, conflicts = merge(BASE, copy_of(BASE), theirs)
        self.assertEqual(conflicts, [])
        self.assertLess(out.index("WP_AUTO_UPDATE_CORE"), out.index("That's all"))
        self.assertGreater(out.index("WP_AUTO_UPDATE_CORE"), out.index("WP_SITEURL"))

    def test_a_constant_the_live_site_removed_goes_with_its_line(self):
        theirs = BASE.replace("define( 'DISALLOW_FILE_EDIT', true );\n", "")
        out, conflicts = merge(BASE, copy_of(BASE), theirs)
        self.assertEqual(conflicts, [])
        self.assertNotIn("DISALLOW_FILE_EDIT", out)
        self.assertEqual(out, copy_of(BASE).replace("define( 'DISALLOW_FILE_EDIT', true );\n", ""))

    def test_both_changed_one_constant_the_copys_stays_and_is_named(self):
        ours = copy_of(BASE).replace("'WP_POST_REVISIONS', 5", "'WP_POST_REVISIONS', 10")
        theirs = BASE.replace("'WP_POST_REVISIONS', 5", "'WP_POST_REVISIONS', 3")
        out, conflicts = merge(BASE, ours, theirs)
        self.assertIn("'WP_POST_REVISIONS', 10", out)
        self.assertEqual([(c["setting"], c["ours"], c["theirs"]) for c in conflicts], [("WP_POST_REVISIONS", "10", "3")])
        # A decision for the live side takes it.
        out, conflicts = merge(BASE, ours, theirs, {"file:wp-config.php#WP_POST_REVISIONS": "theirs"})
        self.assertEqual(conflicts, [])
        self.assertIn("'WP_POST_REVISIONS', 3", out)

    def test_the_table_prefix_is_the_copys(self):
        theirs = BASE.replace("$table_prefix = 'wp_';", "$table_prefix = 'shop_';")
        out, conflicts = merge(BASE, copy_of(BASE), theirs)
        self.assertIn("$table_prefix = 'wp_';", out)
        self.assertEqual(conflicts, [])

    def test_code_outside_the_constants_is_not_taken_and_is_named(self):
        theirs = BASE.replace("/* That's all", "if ( isset( $_GET['debug'] ) ) { ini_set( 'display_errors', 1 ); }\n/* That's all")
        out, conflicts = merge(BASE, copy_of(BASE), theirs)
        self.assertNotIn("display_errors", out)
        self.assertEqual([c["setting"] for c in conflicts], ["(code)"])

    def test_commented_out_defines_and_strings_are_not_constants(self):
        base = BASE.replace("$table_prefix", "// define( 'WP_DEBUG', true );\n$x = \"define('NOPE', 1);\";\n$table_prefix")
        theirs = base.replace("define( 'WP_DEBUG', false );", "define( 'WP_DEBUG', 1 );")
        out, conflicts = merge(base, copy_of(base), theirs)
        self.assertEqual(conflicts, [])
        self.assertIn("define( 'WP_DEBUG', 1 );", out)
        self.assertIn("// define( 'WP_DEBUG', true );", out)

    def test_a_value_spanning_calls_and_concatenation(self):
        theirs = BASE.replace("define( 'WP_POST_REVISIONS', 5 );",
                              "define( 'WP_POST_REVISIONS', (int) getenv( 'REVS' ) ?: max( 2, 3 ) );")
        out, conflicts = merge(BASE, copy_of(BASE), theirs)
        self.assertEqual(conflicts, [])
        self.assertIn("define( 'WP_POST_REVISIONS', (int) getenv( 'REVS' ) ?: max( 2, 3 ) );", out)

    def test_an_unclosed_define_is_unreadable(self):
        self.assertIsNone(merge(BASE, copy_of(BASE), BASE.replace("define( 'WP_DEBUG', false );", "define( 'WP_DEBUG', (false ;")))

    def test_environment_names(self):
        for name in ("DB_HOST", "WP_HOME", "NONCE_SALT", "WP_REDIS_HOST", "STRIPE_SECRET_KEY", "WP_CACHE_KEY_SALT"):
            self.assertTrue(wp.environment_constant(name), name)
        for name in ("WP_DEBUG", "WP_POST_REVISIONS", "DISALLOW_FILE_EDIT", "WPLANG", "EMPTY_TRASH_DAYS"):
            self.assertFalse(wp.environment_constant(name), name)


class VolatileRows(unittest.TestCase):
    def test_the_same_names_in_sql_and_in_a_dumped_row(self):
        import re
        self.assertIn("r.option_name LIKE '\\\\_transient\\\\_%'", wp.volatile_sql("options"))
        rows = {t: re.compile(p) for t, p in wp.volatile_rows().items()}
        self.assertTrue(rows["options"].search("('7','_transient_feed','x','no')"))
        self.assertTrue(rows["options"].search("(7,'cron','a:0:{}','yes')"))
        self.assertFalse(rows["options"].search("(7,'cronjob','x','yes')"), "an exact name is not a prefix")
        self.assertFalse(rows["options"].search("(7,'blogname','_transient_feed','yes')"), "the name, not the value")
        self.assertTrue(rows["usermeta"].search("('2','1','session_tokens','a:0:{}')"))
        self.assertFalse(rows["usermeta"].search("('2','1','nickname','session_tokens')"))
        self.assertTrue(rows["postmeta"].search("(5,4,'_edit_lock','1:1')"))

    def test_wordpress_housekeeping_by_core_names(self):
        import re
        rows = {t: re.compile(p) for t, p in wp.volatile_rows().items()}
        # What wp-admin and WP-Cron write on their own (#1664).
        for name in ("dashboard_widget_options", "https_detection_errors", "user_count", "db_upgraded"):
            self.assertTrue(rows["options"].search(f"('9','{name}','x','no')"), name)
        self.assertTrue(rows["postmeta"].search("('9','4','_trackbackme','1')"))
        # WooCommerce's analytics import keeps where it got to, on each site by itself (wp-tracy-ai, 24/10).
        for name in ("woocommerce_admin_scheduler_last_processed_order_modified_date",
                     "woocommerce_admin_scheduler_last_processed_order_id"):
            self.assertTrue(rows["options"].search(f"('9','{name}','2026-10-24 18:22:13','yes')"), name)
        for name in ("woocommerce_store_address", "woocommerce_currency", "woocommerce_admin_notices"):
            self.assertFalse(rows["options"].search(f"('9','{name}','x','yes')"), name)
        # A user option carries the site's table prefix: said by its end, the prefix any.
        for key in ("wp_user-settings", "wp_user-settings-time", "abc_dashboard_quick_press_last_post_id",
                    "wp_persisted_preferences", "closedpostboxes_post", "manageedit-postcolumnshidden",
                    "edit_post_per_page"):
            self.assertTrue(rows["usermeta"].search(f"('9','1','{key}','x')"), key)
        self.assertFalse(rows["usermeta"].search("('9','1','first_name','wp_user-settings')"), "the key, not the value")
        self.assertFalse(rows["usermeta"].search("('9','1','wp_capabilities','x')"))
        self.assertIn("r.meta_key LIKE '%user-settings'", wp.volatile_sql("usermeta"))
        self.assertIn("r.meta_key LIKE '%\\\\_per\\\\_page'", wp.volatile_sql("usermeta"))
        # A real setting, page or menu is never housekeeping.
        for name in ("blogname", "blogdescription", "theme_mods_shop", "widget_text", "sidebars_widgets"):
            self.assertFalse(rows["options"].search(f"('9','{name}','x','yes')"), name)

    def test_an_auto_draft_by_its_status_column(self):
        import re
        posts = re.compile(wp.volatile_rows()["posts"])
        row = lambda content, status, title="Auto Draft": (
            f"('7','1','2026-10-24 01:00:00','2026-10-24 01:00:00','{content}','{title}','','{status}','open','open','','',"
            "'','','2026-10-24 01:00:00','2026-10-24 01:00:00','','0','https://x/?p=7','0','post','','0')")
        self.assertTrue(posts.search(row("", "auto-draft")))
        self.assertFalse(posts.search(row("", "publish")))
        self.assertFalse(posts.search(row("", "draft")), "a draft a person saved is content")
        # Quotes, commas and the word itself inside the content do not move the status's place.
        tricky = "it\\'s (here), \\',\\'auto-draft\\',\\' \\\\"
        self.assertFalse(posts.search(row(tricky, "publish")))
        self.assertTrue(posts.search(row(tricky, "auto-draft")))
        self.assertFalse(posts.search(row("x", "publish", title="auto-draft")), "a title that says it is no status")
        # A NULL and a bare number read as values too.
        self.assertTrue(posts.search("(7,1,NULL,NULL,'','','','auto-draft','open')"))

    def test_row_names_and_ignored_tables_for_live_pull(self):
        self.assertEqual(wp.ROW_NAMES, {"options": 1, "usermeta": 2, "postmeta": 2})
        self.assertEqual(wp.ignored_tables(""), {})
        rule = wp.ignored_tables("wp_")
        self.assertEqual(rule["prefix"], "wp_")
        import re
        bare = lambda t: any(re.search(p, t) for p in rule["patterns"])
        for table in ("actionscheduler_actions", "wfhits", "yoast_indexable", "wc_sessions", "redirection_logs"):
            self.assertTrue(bare(table), table)
        for table in ("posts", "options", "postmeta", "woocommerce_order_items", "users"):
            self.assertFalse(bare(table), table)


class FirstManifest(unittest.TestCase):
    def test_the_bytes_sha1_of_every_file_of_the_tree(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            work = pathlib.Path(tmp) / "w"
            (work / "wp-content").mkdir(parents=True)
            (work / "index.php").write_bytes(b"<?php\n")
            (work / "wp-content" / "a.css").write_bytes(b"body{}\n")
            repo = str(pathlib.Path(tmp) / "r.git")
            env = {"GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null", "PATH": "/usr/bin:/bin:/usr/local/bin"}
            g = lambda *a: subprocess.run(["git", f"--git-dir={repo}", f"--work-tree={work}", *a], check=True,
                                          stdout=subprocess.PIPE, env={**env, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                                                                         "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"})
            subprocess.run(["git", "init", "-q", "--bare", repo], check=True, env=env)
            g("add", "-A")
            g("commit", "-qm", "base")
            got = wp.first_manifest(repo, "HEAD", str(work))
            self.assertEqual(got, {"index.php": hashlib.sha1(b"<?php\n").hexdigest(),
                                   "wp-content/a.css": hashlib.sha1(b"body{}\n").hexdigest()})


engine_spec = importlib.util.spec_from_file_location("live_sync", LIB / "live_sync.py")
engine = importlib.util.module_from_spec(engine_spec)
engine_spec.loader.exec_module(engine)


class RecordingSql:
    """A database that knows WordPress's posts table and records every script it is handed."""

    def __init__(self):
        self.scripts = []
        self.calls = 0

    def run(self, script):
        self.scripts.append(script)
        if "information_schema.columns" in script:
            return [["wp_posts", c, t] for c, t in (("ID", "bigint"), ("post_parent", "bigint"),
                                                     ("post_content", "longtext"), ("guid", "varchar"))]
        return []


class LinksInText(unittest.TestCase):
    def test_no_statement_nests_more_links_of_a_column_than_the_server_can_take(self):
        # 58 remembered posts, three links each in the content and three in the guid: one nest of
        # 174 REGEXP_REPLACE killed MariaDB on dev (23/10/2026). Each column now goes TEXT_NEST at a
        # time, every link still rewritten, in the same order.
        sql = RecordingSql()
        ids = engine.IdMap(sql, "wp_", wp.POLICY["entities"], {})
        rule = dict(wp.POLICY["entities"])["posts"]
        pairs = [(3543 + i, 3591 + i) for i in range(58)]
        ids.renumber("theirs", "posts", rule, pairs)
        updates = [s for script in sql.scripts for s in script.split(";\n") if "REGEXP_REPLACE" in s]
        deepest = max(len(run) // len("REGEXP_REPLACE(") for s in updates for run in
                      re.findall(r"(?:REGEXP_REPLACE\()+", s))
        self.assertLessEqual(deepest, engine.IdMap.TEXT_NEST)
        rewritten = [m for s in updates for m in re.findall(r"REGEXP_REPLACE\(", s)]
        self.assertEqual(len(rewritten), 2 * 58 * 6, "hold and final, six links per post")
        # Rows found by one regular expression per column, not a LIKE per link (47 s on dev's posts).
        for statement in updates:
            self.assertNotIn(" LIKE ", statement)
            self.assertIn("` REGEXP '", statement)
        # The hold step's statements all come before the final step's.
        holds = [i for i, s in enumerate(updates) if "(?![0-9])" in s]
        self.assertEqual(holds, list(range(len(holds))))


class PolicyTables(unittest.TestCase):
    """The tables a sync always loads into both reads' scratch schemas (live_sync.py
    `policy_tables`): every one the merge reads beyond comparing it whole."""

    def test_every_table_the_rules_name_or_reach(self):
        wp_tables = engine.policy_tables("wordpress", "wp_")
        for table in ("posts", "postmeta", "options", "users", "usermeta", "terms", "term_taxonomy",
                      "term_relationships", "termmeta", "comments", "commentmeta", "links"):
            self.assertIn("wp_" + table, wp_tables)
        self.assertNotIn("wp_yoast_indexable", wp_tables)
        # What the auto-drafts' yield (YIELD) reads and writes in all three schemas.
        self.assertTrue({"wp_posts", "wp_postmeta", "wp_term_relationships"} <= wp_tables)
        joomla = engine.policy_tables("joomla", "jos_")
        # Reached through conditions (`{fields}`, `{content_types}`), normalised (extensions), trees,
        # rows that belong to a record, names and links.
        for table in ("content", "assets", "menu", "categories", "tags", "fields", "fields_values",
                      "content_types", "ucm_base", "ucm_content", "extensions", "workflow_associations",
                      "contentitem_tag_map", "content_frontpage", "modules_menu", "history", "action_logs",
                      "user_usergroup_map", "redirect_links"):
            self.assertIn("jos_" + table, joomla)
        self.assertNotIn("jos_finder_links", joomla)


class EngineStops(unittest.TestCase):
    """A half that stops says why, in one line with no value of the site: the job's step line, and
    the JSON answer's `detail` that webroot-sync.sh hands on as MERGE_FAILED's."""

    def stop(self, client_script):
        import json
        import os
        done = subprocess.run(
            ["python3", str(LIB / "live_sync.py"), "db", "--base-schema", "b", "--ours-schema", "o",
             "--theirs-schema", "t", "--work-schema", "w", "--platform", "wordpress", "--prefix", "wp_"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            env={**os.environ, "TRACY_SYNC_SQL": json.dumps(["sh", "-c", client_script]), "TRACY_SYNC_T0": ""})
        self.assertEqual(done.returncode, 1, done.stderr)
        return json.loads(done.stdout.strip().splitlines()[-1]), done.stderr

    def test_a_refused_statement_names_the_error_not_the_row(self):
        answer, log = self.stop("read -r _; echo 'WARNING: Error loading config file' >&2;"
                                " echo \"ERROR 1062 (23000) at line 3: Duplicate entry 'secret-value' for key 'PRIMARY'\" >&2;"
                                " exit 1")
        self.assertEqual(answer["code"], "MERGE_FAILED")
        self.assertRegex(answer["detail"], r"^SqlError: ERROR 1062 \(23000\) at line 3: Duplicate entry '…' \(in ")
        self.assertNotIn("secret-value", answer["detail"])
        self.assertIn("==> db merge stopped: SqlError: ERROR 1062", log)
        self.assertIn("Traceback", log)

    def test_a_database_server_that_died_is_named_as_such(self):
        answer, _ = self.stop("read -r _; exit 137")
        self.assertRegex(answer["detail"], r"^SqlError: the SQL client stopped with status 137 and no error"
                                           r" \(did the database server stop\?\) \(in ")


if __name__ == "__main__":
    unittest.main()
