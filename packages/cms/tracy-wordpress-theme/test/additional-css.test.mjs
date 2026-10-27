/**
 * 🔒 A DESIGN PAGE STILL PRINTS THE SITE'S ADDITIONAL CSS (TracyHQ/tch#1710, 25/10/2026).
 *
 * On a block theme WordPress prints Customizer › Additional CSS (the `custom_css` post) INSIDE the
 * `global-styles` inline sheet and takes `wp_custom_css_cb` off `wp_head` (WordPress 7.1.3,
 * `wp-includes/script-loader.php` `wp_enqueue_global_styles`). A fixture or artifact page — the home
 * page of every site the seeder builds is the landing artifact — dequeues `global-styles` to stay
 * pixel for pixel the preview, and the Additional CSS went with it: a rule saved there (by the site's
 * agent, `look.set`, or the customer in the Customizer) reached every page but the home page.
 * Measured on a WordPress 7.1.3 stand with this theme: `/about/` carried the rule inside
 * `global-styles-inline-css`, the artifact home page carried nothing.
 *
 * So a design page that drops `global-styles` hands the Additional CSS back to WordPress's own
 * printer, `<style id="wp-custom-css">` at `wp_head` 101 — the place a classic theme prints it.
 * Checked on every built target: each one's functions.php is a copy of `src/tracy/functions.php`.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const here = new URL('..', import.meta.url)
const PHP_SKIP = phpSupport().skip

/** The design-page callback of a theme's functions.php, run alone with WordPress stubbed. */
const PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['actions'] = array();
$GLOBALS['dequeued'] = array();
function add_action($hook, $cb, $priority = 10) { $GLOBALS['actions'][] = array($hook, is_string($cb) ? $cb : 'closure', $priority); }
function wp_dequeue_style($handle) { $GLOBALS['dequeued'][] = $handle; }
function tracy_page_kind() { return $GLOBALS['in']['kind']; }
eval($in['code']);
tracy_design_page_styles();
echo json_encode(array('actions' => $GLOBALS['actions'], 'dequeued' => $GLOBALS['dequeued']));
`

const targets = readdirSync(new URL('src/', here)).filter((name) =>
  statSync(new URL(`src/${name}`, here)).isDirectory()
)

test('every built theme hooks its design-page styles by name at wp_enqueue_scripts 100', () => {
  assert.ok(targets.includes('tracy'))
  for (const slug of targets) {
    const php = readFileSync(new URL(`src/${slug}/functions.php`, here), 'utf8')
    assert.match(php, /add_action\( 'wp_enqueue_scripts', 'tracy_design_page_styles', 100 \);/, slug)
  }
})

test('🔒 a fixture or artifact page drops global-styles AND prints the Additional CSS at wp_head 101; a section page is left alone', {
  skip: PHP_SKIP
}, () => {
  const php = startPhp({ files: { cwd: fileURLToPath(here), paths: [] } })
  try {
    for (const slug of targets) {
      const source = readFileSync(new URL(`src/${slug}/functions.php`, here), 'utf8')
      const code = /function tracy_design_page_styles\(\): void \{[\s\S]*?\n\}/.exec(source)?.[0]
      assert.ok(code, `${slug}: function tracy_design_page_styles`)
      for (const [kind, design] of [
        ['artifact', true],
        ['fixture', true],
        ['home', false],
        ['page', false]
      ]) {
        const [out] = php.run([{ args: ['-r', PROBE], input: JSON.stringify({ code, kind }) }])
        assert.equal(out.status, 0, `${slug} ${kind}: ${out.stderr}${out.stdout}`)
        const got = JSON.parse(out.stdout)
        assert.equal(got.dequeued.includes('global-styles'), design, `${slug} ${kind}: global-styles`)
        assert.deepEqual(
          got.actions,
          design ? [['wp_head', 'wp_custom_css_cb', 101]] : [],
          `${slug} ${kind}: the Additional CSS printer`
        )
      }
    }
  } finally {
    php.stop?.()
  }
})
