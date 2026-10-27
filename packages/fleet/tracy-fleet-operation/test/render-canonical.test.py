# Regression for issue #167: the imported copy's CMS canonical must be the COPY's own address, not
# the source's. The server hands `--live-site` / `--site-url` the copy's fleet address (see the
# import branch of apps/tracy-web/src/sites/route.js); these two renderers pin the CMS to whatever
# they are given. This nails down the DOCUMENTED renderer behaviour the fix depends on: whatever
# scheme the copy's own address carries is what Joomla's force_ssl/behind_loadbalancer follow, and
# both platforms end up canonical to the value passed — so passing the copy address makes the copy
# advertise itself, and passing the source (the old handoff) made it advertise the source. It is NOT
# a claim about which precise redirect the live copy hit (the live config was not read; a real
# deployment's copy is https too). No source fixture is touched: the inputs below are built in-test.
import argparse
import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).parents[1] / 'scripts/provision'


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


joomla = _load('render_configuration', 'render_configuration.py')
wp = _load('render_wp_config', 'render_wp_config.py')

# A source Joomla config as it travels inside the export archive: canonical to its own https origin,
# force_ssl pinned to 2. This is exactly the shape that made a plain-http copy 301 forever.
SOURCE_JCONFIG = (
    "<?php\nclass JConfig {\n"
    "\tpublic $live_site = 'https://fijitrips.example';\n"
    "\tpublic $force_ssl = '2';\n"
    "\tpublic $secret = 'source-secret-do-not-reuse';\n"
    "}\n"
)


def _joomla_values(live_site):
    args = argparse.Namespace(
        db_host='db', db_user='root', db_password='pw', db_name='site',
        webroot='/var/www/html', live_site=live_site, allow_mail=False,
    )
    return joomla.build_values(args)


class JoomlaCanonical(unittest.TestCase):
    def test_plain_http_copy_address_defeats_the_force_ssl_loop(self):
        # The copy answers plain http on a fleet port — the value the server now sends.
        copy = 'http://fijitrips-example-5254d120.localhost:8080/'
        values = _joomla_values(copy)
        self.assertEqual(values['live_site'], copy)
        # force_ssl / behind_loadbalancer follow the COPY scheme, not the source's — no 301 loop.
        self.assertEqual(values['force_ssl'], '0')
        self.assertEqual(values['behind_loadbalancer'], '0')
        # And the rendered file carries the copy's live_site, never the source's.
        rendered, unset = joomla.substitute(SOURCE_JCONFIG, values)
        self.assertEqual(unset, [])
        self.assertIn(f"public $live_site = '{copy}';", rendered)
        self.assertNotIn('fijitrips.example', rendered)
        self.assertIn("public $force_ssl = 0;", rendered)

    def test_https_fleet_copy_keeps_tls_but_still_never_the_source(self):
        # A real deployment's copy address is https (cloudflared terminates TLS) — force_ssl=2 is
        # correct there, arrived at from the copy's OWN scheme.
        copy = 'https://fijitrips-example-5254d120.tracy.ai/'
        values = _joomla_values(copy)
        self.assertEqual(values['live_site'], copy)
        self.assertEqual(values['force_ssl'], '2')
        self.assertEqual(values['behind_loadbalancer'], '1')

    def test_the_source_https_origin_is_the_input_that_used_to_break(self):
        # Guard the regression itself: feeding the source origin (the old handoff) to a plain-http
        # deployment is exactly what set force_ssl=2 with an http-only copy — the loop.
        values = _joomla_values('https://fijitrips.example')
        self.assertEqual(values['force_ssl'], '2')


class WordPressCanonical(unittest.TestCase):
    SOURCE_WPCONFIG = (
        "<?php\n"
        "define('DB_NAME', 'source_db');\n"
        "define('DB_USER', 'source_user');\n"
        "define('DB_PASSWORD', 'source_pw');\n"
        "define('DB_HOST', 'source-host');\n"
        "define('WP_HOME', 'https://fijitrips.example');\n"
        "define('WP_SITEURL', 'https://fijitrips.example');\n"
        "/* That's all, stop editing! Happy publishing. */\n"
    )

    def test_address_constants_are_pinned_to_the_copy_not_the_source(self):
        copy = 'http://fijitrips-example-5254d120.localhost:8080/'
        rewritten, home = wp.replace_define(self.SOURCE_WPCONFIG, 'WP_HOME', copy)
        self.assertTrue(home)
        rewritten, siteurl = wp.replace_define(rewritten, 'WP_SITEURL', copy)
        self.assertTrue(siteurl)
        self.assertIn(f"define('WP_HOME', '{copy}')", rewritten)
        self.assertIn(f"define('WP_SITEURL', '{copy}')", rewritten)
        # The source origin is gone from the address constants — the copy cannot bounce to it.
        self.assertNotIn("WP_HOME', 'https://fijitrips.example'", rewritten)


class WordPressTablePrefix(unittest.TestCase):
    """#264: a copy's web container has no WORDPRESS_* env, so wp-config must STATE the prefix."""

    OFFICIAL = (
        "<?php\n"
        "define( 'DB_NAME', getenv_docker('WORDPRESS_DB_NAME', 'wordpress') );\n"
        "define( 'DB_USER', 'source_user' );\n"
        "define( 'DB_PASSWORD', 'source_pw' );\n"
        "define( 'DB_HOST', 'source-host' );\n"
        "define( 'AUTH_KEY', 'k3y;$table_prefix = x;' );\n"
        "define( 'WP_CACHE', true ); // plugin constant\n"
        "// $table_prefix = 'old_';\n"
        "$table_prefix = getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_');\n"
        "/* That's all, stop editing! Happy publishing. */\n"
    )

    def test_getenv_docker_prefix_becomes_the_resolved_literal(self):
        out, found, rewritten = wp.replace_table_prefix(self.OFFICIAL, 'tr_')
        self.assertEqual((found, rewritten), (1, 1))
        self.assertIn("\n$table_prefix = 'tr_';\n", out)
        self.assertNotIn('WORDPRESS_TABLE_PREFIX', out)
        # Only that line changed: comments, salts and plugin constants are the same bytes.
        self.assertEqual(
            out, self.OFFICIAL.replace("getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_')", "'tr_'")
        )

    def test_plain_getenv_prefix_becomes_the_resolved_literal(self):
        source = "<?php\n$table_prefix = getenv('PREFIX') ?: 'wp_';\n"
        out, found, rewritten = wp.replace_table_prefix(source, 'wpjf_')
        self.assertEqual((found, rewritten), (1, 1))
        self.assertEqual(out, "<?php\n$table_prefix = 'wpjf_';\n")

    def test_a_literal_naming_another_prefix_is_corrected(self):
        out, _, rewritten = wp.replace_table_prefix("<?php\n$table_prefix = 'wp_';\n", 'tr_')
        self.assertEqual(rewritten, 1)
        self.assertEqual(out, "<?php\n$table_prefix = 'tr_';\n")

    def test_a_matching_literal_is_byte_identical_in_either_quote(self):
        for source in (
            "<?php\n$table_prefix = 'tr_';\n",
            '<?php\n$table_prefix  =  "tr_" ;\n',
            "<?php\r\n\t$table_prefix='tr_';\r\n",
        ):
            out, found, rewritten = wp.replace_table_prefix(source, 'tr_')
            self.assertEqual((found, rewritten), (1, 0), source)
            self.assertEqual(out, source)

    def test_a_wp_source_stays_wp(self):
        source = "<?php\n$table_prefix = 'wp_';\n"
        self.assertEqual(wp.replace_table_prefix(source, 'wp_'), (source, 1, 0))

    def test_commented_assignments_are_never_touched(self):
        source = (
            "<?php\n// $table_prefix = 'old_';\n/**\n * $table_prefix = 'x_';\n */\n"
            "# $table_prefix = 'y_';\n/*\n$table_prefix = 'old_';\n*/\n"
        )
        self.assertEqual(wp.replace_table_prefix(source, 'tr_'), (source, 0, 0))

    def test_only_the_live_assignment_after_a_block_comment_changes(self):
        source = "<?php\n/*\n$table_prefix = 'old_';\n*/\n$table_prefix = getenv_docker('P', 'wp_');\n"
        out, found, rewritten = wp.replace_table_prefix(source, 'tr_')
        self.assertEqual((found, rewritten), (1, 1))
        self.assertEqual(out, "<?php\n/*\n$table_prefix = 'old_';\n*/\n$table_prefix = 'tr_';\n")

    def test_the_text_inside_a_string_is_not_an_assignment(self):
        source = "<?php\ndefine( 'AUTH_KEY', '$table_prefix = x;' );\n"
        self.assertEqual(wp.replace_table_prefix(source, 'tr_'), (source, 0, 0))

    def test_a_computed_prefix_over_several_lines_becomes_one_literal(self):
        source = (
            "<?php\n$table_prefix = getenv_docker(\n\t'WORDPRESS_TABLE_PREFIX', // env\n\t'wp_'\n) ;\n"
            "define( 'WP_DEBUG', false );\n"
        )
        out, found, rewritten = wp.replace_table_prefix(source, 'tr_')
        self.assertEqual((found, rewritten), (1, 1))
        self.assertEqual(out, "<?php\n$table_prefix = 'tr_' ;\ndefine( 'WP_DEBUG', false );\n")

    def test_an_assignment_with_no_end_is_refused(self):
        with self.assertRaises(wp.UnreadablePrefix):
            wp.replace_table_prefix("<?php\n$table_prefix = getenv_docker('P', 'wp_')\n", 'tr_')

    def test_no_database_answer_keeps_a_literal_and_refuses_a_computed_prefix(self):
        literal = "<?php\n$table_prefix = 'tr_';\n"
        self.assertEqual(wp.replace_table_prefix(literal, ''), (literal, 1, 0))
        with self.assertRaises(wp.UnreadablePrefix):
            wp.replace_table_prefix(self.OFFICIAL, '')

    def test_the_stated_prefix_is_the_live_literal_only(self):
        self.assertEqual(wp.stated_prefix("<?php\n// $table_prefix = 'old_';\n$table_prefix = 'tr_';\n"), 'tr_')
        self.assertEqual(wp.stated_prefix("<?php\n/* $table_prefix = 'old_'; */\n"), '')
        self.assertEqual(wp.stated_prefix(self.OFFICIAL), '')

    def _render(self, source, prefix):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp, 'in.php')
            out = pathlib.Path(tmp, 'out.php')
            src.write_bytes(source.encode())
            run = subprocess.run(
                [sys.executable, str(HERE / 'render_wp_config.py'), '--source', str(src), '--out', str(out),
                 '--db-host', 'db', '--db-user', 'u', '--db-password', 'p', '--db-name', 'wordpress',
                 '--site-url', 'https://copy.tracy.site', '--table-prefix', prefix],
                capture_output=True, text=True,
            )
            return run, (out.read_bytes().decode() if out.exists() else None)

    def test_the_script_states_the_prefix_and_keeps_everything_else(self):
        run, out = self._render(self.OFFICIAL.replace('\n', '\r\n'), 'tr_')
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("\r\n$table_prefix = 'tr_';\r\n", out)
        self.assertIn("define( 'DB_NAME', 'wordpress' );\r\n", out)
        self.assertIn("define( 'AUTH_KEY', 'k3y;$table_prefix = x;' );\r\n", out)
        self.assertIn("define( 'WP_CACHE', true ); // plugin constant\r\n", out)
        self.assertIn("// $table_prefix = 'old_';\r\n", out)

    def test_the_script_fails_rather_than_leave_a_computed_prefix_unconfirmed(self):
        run, out = self._render(self.OFFICIAL, '')
        self.assertEqual(run.returncode, 1)
        self.assertIn('computes it', run.stderr)
        self.assertIsNone(out)

    def test_the_script_passes_a_literal_through_without_a_database_answer(self):
        source = self.OFFICIAL.replace("getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_')", "'tr_'")
        run, out = self._render(source, '')
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("\n$table_prefix = 'tr_';\n", out)

    def test_the_script_refuses_a_prefix_wordpress_would_refuse(self):
        run, out = self._render(self.OFFICIAL, "tr_'; evil(); //")
        self.assertEqual(run.returncode, 1)
        self.assertIsNone(out)



class JoomlaImportedCopyOnline(unittest.TestCase):
    """Beta week 16–23/10/2026: an imported copy kept its source's `offline`, so the customer's preview
    and the agent's page pictures showed only the offline page. `--online` (passed for an imported copy
    by platform/joomla.sh) sets it to 0; without it the setting is left as the site had it."""

    SOURCE = "<?php\nclass JConfig {\n\tpublic $offline = true;\n\tpublic $secret = 's';\n}\n"

    def _values(self, online):
        args = argparse.Namespace(
            db_host='db', db_user='root', db_password='pw', db_name='site', webroot='/var/www/html',
            live_site='https://copy.tracy.ai', allow_mail=False, online=online,
        )
        return joomla.build_values(args)

    def test_an_imported_copy_is_online(self):
        rendered, unset = joomla.substitute(self.SOURCE, self._values(True))
        self.assertEqual(unset, [])
        self.assertIn('\tpublic $offline = 0;\n', rendered)
        self.assertNotIn('$offline = true', rendered)

    def test_a_config_without_the_setting_gets_it(self):
        rendered, _ = joomla.substitute("<?php\nclass JConfig {\n\tpublic $secret = 's';\n}\n", self._values(True))
        self.assertIn('public $offline = 0;', rendered)

    def test_anything_else_keeps_what_the_site_said(self):
        self.assertNotIn('offline', self._values(False))
        rendered, _ = joomla.substitute(self.SOURCE, self._values(False))
        self.assertIn('$offline = true', rendered)

    def test_sync_from_live_never_takes_the_copy_offline_again(self):
        live_sync = _load_lib('live_sync', 'live_sync.py')
        self.assertIn('offline', live_sync.JOOMLA_ENVIRONMENT_SETTINGS)


def _load_lib(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE.parent / 'lib' / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

if __name__ == '__main__':
    unittest.main()
