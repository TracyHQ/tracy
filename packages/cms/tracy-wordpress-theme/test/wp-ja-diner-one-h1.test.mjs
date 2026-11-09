/**
 * JA Diner prints exactly one `h1` on every page: the article title, else the masthead title, else the first
 * other heading keeps it; a masthead that loses it becomes a paragraph of the same class; a page with none gets
 * its title as the `h1` (TracyHQ/tracy#459). Runs the pure function with PHP (skipped when no `php` is on the PATH).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const COPIES = ['overlays/wp-ja-diner', 'src/wp-ja-diner']
const HARNESS = `<?php
define('ABSPATH','/');
function add_action(){}
require $argv[1].'/inc/groups/headings.php';
$in=json_decode($argv[2],true);
echo wp_ja_diner_one_h1($in['html'],$in['site'],$in['title']);
`
const php = spawnSync('php', ['-v'])
const run = (dir, html, site = 'Ja Diner', title = '') => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'jd-h1-')), 'run.php')
  writeFileSync(file, HARNESS)
  const r = spawnSync('php', [file, path.join(PKG, dir), JSON.stringify({ html, site, title })], {
    encoding: 'utf8'
  })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}
const h1s = (html) => [...html.matchAll(/<h1\b/g)].length

for (const copy of COPIES) {
  const skip = php.status !== 0 && 'php is not installed'
  test(`${copy}: the article title keeps the h1, the masthead becomes a paragraph of the same class`, {
    skip
  }, () => {
    const html =
      '<main><h1 class="wp-block-heading ja-masthead-title">Our Blog</h1><h1 class="article-title wp-block-post-title">A post</h1></main>'
    const out = run(copy, html)
    assert.equal(h1s(out), 1)
    assert.match(out, /<p class="wp-block-heading ja-masthead-title">Our Blog<\/p>/)
    assert.match(out, /<h1 class="article-title wp-block-post-title">A post<\/h1>/)
  })
  test(`${copy}: a masthead that only prints the site name loses the h1 to the page heading`, {
    skip
  }, () => {
    const out = run(
      copy,
      '<main><h1 class="ja-masthead-title">Ja Diner</h1><h1>Login</h1></main>',
      'ja-diner'
    )
    assert.equal(h1s(out), 1)
    assert.match(out, /<h1>Login<\/h1>/)
  })
  test(`${copy}: another heading becomes an h2 that keeps the h1 size class`, { skip }, () => {
    const out = run(
      copy,
      '<main><h1 class="ja-masthead-title">About Us</h1><h1 class="jd-teams-title">Our Team</h1></main>'
    )
    assert.equal(h1s(out), 1)
    assert.match(out, /<h2 class="h1 jd-teams-title">Our Team<\/h2>/)
  })
  test(`${copy}: a page with no h1 prints its title first in main; a page with one is left alone`, {
    skip
  }, () => {
    const out = run(copy, '<html><main class="x"><p>Form</p></main></html>', 'Ja Diner', 'Error <Page>')
    assert.equal(h1s(out), 1)
    assert.match(
      out,
      /<main class="x"><h1 class="jd-page-title h1 container">Error &lt;Page&gt;<\/h1><p>Form/
    )
    const same = '<main><h1>One</h1></main>'
    assert.equal(run(copy, same, 'Ja Diner', 'T'), same)
    assert.equal(run(copy, '<main><p>x</p></main>', 'Ja Diner', ''), '<main><p>x</p></main>')
  })
}
