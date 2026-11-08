/**
 * The JA Diner business contact words (address, phone, footer phones, footer email) come from theme text options,
 * seeded with the demo values (no words in theme files), so a content contract can declare them as slots (TracyHQ/tracy#459).
 *
 * WHAT THIS FILE RUNS. A read of the overlay and of every generated copy under src/, plus a PHP render of the Contact
 * pattern and the footer line with stubbed WordPress functions (skipped when no `php` is on the PATH). It does not run
 * WordPress or a browser.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const COPIES = ['overlays/wp-ja-diner', 'src/wp-ja-diner']
const OPTIONS = {
  wp_ja_diner_contact_address: '1600 Amphitheatre Parkway, Mountain View 5692',
  wp_ja_diner_contact_phone: '(084) 555-0110',
  wp_ja_diner_footer_mobile: '+201 382 348 5327',
  wp_ja_diner_footer_landline: '+201 166 993 7763',
  wp_ja_diner_footer_email: 'Info@joomlart.com'
}

const HARNESS = `<?php
define('ABSPATH','/');
$T=$argv[1]; $O=json_decode($argv[2]?:'{}',true);
function get_option($n,$d=false){global $O;return array_key_exists($n,$O)?$O[$n]:$d;}
function esc_html($s){return htmlspecialchars((string)$s,ENT_QUOTES);}
function esc_attr($s){return esc_html($s);} function esc_url($s){return $s;}
function __($s){return $s;} function esc_html_e($s){echo esc_html($s);} function esc_attr_e($s){echo esc_attr($s);}
function get_posts(){return [];} function wp_get_attachment_url(){return '';} function get_theme_file_uri($p){return '/t/'.$p;}
function admin_url($p){return '/wp-admin/'.$p;} function wp_create_nonce(){return 'n';}
function wp_date(){return '2026';} function get_bloginfo(){return 'Site';} function add_filter(){}
require $T.'/inc/identity.php';
ob_start(); include $T.'/patterns/contact-form.php'; $out=ob_get_clean();
$foot=file_get_contents($T.'/parts/footer.html');
preg_match('#<!-- wp:paragraph \\{"metadata":\\{"name":"footer.contact.text"\\}\\} -->(.*?)<!-- /wp:paragraph -->#s',$foot,$m);
echo $out."\\n=====FOOTER\\n".wp_ja_diner_identity_fill($m[1]);
`

const php = spawnSync('php', ['-v'])
const render = (dir, options) => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'jd-text-'))
  const file = path.join(tmp, 'render.php')
  writeFileSync(file, HARNESS)
  const r = spawnSync('php', [file, path.join(PKG, dir), JSON.stringify(options)], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}

for (const copy of COPIES) {
  test(`${copy}: the theme names the five text options and keeps no demo words in its files`, () => {
    const identity = readFileSync(path.join(PKG, copy, 'inc/identity.php'), 'utf8')
    const pattern = readFileSync(path.join(PKG, copy, 'patterns/contact-form.php'), 'utf8')
    for (const [name, demo] of Object.entries(OPTIONS)) {
      assert.ok(identity.includes(`'${name}'`), `${name} is named in identity.php`)
      for (const text of [identity, pattern])
        assert.ok(!text.includes(demo), `${demo} is not in a theme file`)
    }
  })

  test(`${copy}: the footer line prints tokens, not the demo words`, () => {
    const footer = readFileSync(path.join(PKG, copy, 'parts/footer.html'), 'utf8')
    for (const token of ['{contact.mobile}', '{contact.landline}', '{contact.email}']) {
      assert.ok(footer.includes(token), `${token} is in the footer`)
    }
    assert.ok(!footer.includes('Info@joomlart.com'), 'no hard-coded email in the footer')
  })

  test(`${copy}: with the options seeded with the demo words the render shows them`, {
    skip: php.status !== 0
  }, () => {
    const out = render(copy, OPTIONS)
    for (const demo of Object.values(OPTIONS)) assert.ok(out.includes(demo), `${demo} is printed`)
    assert.ok(out.includes('<a href="mailto:Info@joomlart.com">Info@joomlart.com</a>'))
  })

  test(`${copy}: an option value is printed, escaped, in every place`, { skip: php.status !== 0 }, () => {
    const out = render(copy, {
      wp_ja_diner_contact_address: '5 Test <b>Lane</b>',
      wp_ja_diner_contact_phone: '(000) 111-0000',
      wp_ja_diner_footer_mobile: '+1 000',
      wp_ja_diner_footer_landline: '+2 000',
      wp_ja_diner_footer_email: 'hi@example.test'
    })
    assert.ok(out.includes('5 Test &lt;b&gt;Lane&lt;/b&gt;'))
    assert.ok(out.includes('(000) 111-0000'))
    assert.ok(out.includes('M. +1 000<br>P. +2 000'))
    assert.ok(out.includes('<a href="mailto:hi@example.test">hi@example.test</a>'))
    assert.ok(!out.includes('Info@joomlart.com'))
  })
}
