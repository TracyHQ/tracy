/**
 * `wp-ja-kinetic` favicon: the site's icon is WordPress's own Site Icon (Settings > General /
 * Customizer > Site Identity), printed by core's `wp_site_icon()`. Only when no Site Icon is set
 * does the theme print one fallback link, and that fallback is the theme's own Kinetic mark (the
 * two strokes of the header logo), never the Joomla logo the 1.1.2 port shipped as
 * `assets/images/favicon.png`.
 *
 * Static checks of the overlay (the source) and of the generated tree (what the zip carries): the
 * printer is plain PHP with one guard, so reading it is the seam; no PHP runtime is needed.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const TREES = ['overlays/wp-ja-kinetic', 'src/wp-ja-kinetic']
/** md5 of the 16x16 PNG shipped in wp-ja-kinetic 1.1.2: the Joomla logo, not Kinetic's. */
const JOOMLA_FAVICON_MD5 = '1194d7d32448e1f90741a97b42af91fa'
const FALLBACK = 'assets/images/favicon.svg'

const read = (tree, rel) => readFileSync(path.join(PKG, tree, rel), 'utf8')
const md5 = (file) => createHash('md5').update(readFileSync(file)).digest('hex')

/** Every regular file under `dir`, as absolute paths. */
function filesUnder(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else out.push(full)
  }
  return out
}

/**
 * The Kinetic mark's two strokes as the theme itself draws them: the logo at the head of the mobile menu drawer
 * (`wp_ja_kinetic_drawer_head()` in inc/extra.php). Since 1.1.9 the header shows the site's own logo, so the drawer
 * is the one place the theme still draws the mark.
 */
function headerMarkPaths(tree) {
  const head = read(tree, 'inc/extra.php').match(/tracy-nav__drawer-logo[\s\S]*?<svg[^>]*>([\s\S]*?)<\/svg>/)
  assert.ok(head, `${tree}/inc/extra.php: the drawer logo's <svg> not found`)
  return [...head[1].matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])
}

/** The body of `wp_ja_kinetic_favicon()` in inc/extra.php. */
function faviconFunction(tree) {
  const fn = read(tree, 'inc/extra.php').match(/function wp_ja_kinetic_favicon\(\)[^{]*\{([\s\S]*?)\n\}/)
  assert.ok(fn, `${tree}/inc/extra.php: wp_ja_kinetic_favicon() not found`)
  return fn[1]
}

for (const tree of TREES) {
  test(`${tree}: ships no Joomla favicon and no favicon.png`, () => {
    assert.equal(existsSync(path.join(PKG, tree, 'assets/images/favicon.png')), false)
    const joomla = filesUnder(path.join(PKG, tree)).filter((f) => md5(f) === JOOMLA_FAVICON_MD5)
    assert.deepEqual(joomla, [], 'the Joomla logo PNG is still in the tree')
  })

  test(`${tree}: the fallback icon is the header's Kinetic mark`, () => {
    const svg = read(tree, FALLBACK)
    const fallbackPaths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])
    const mark = headerMarkPaths(tree)
    assert.equal(mark.length, 2, 'the drawer logo draws the two strokes')
    assert.deepEqual(fallbackPaths, mark)
  })

  test(`${tree}: the theme prints its icon only when no Site Icon is set, once`, () => {
    const body = faviconFunction(tree)
    assert.doesNotMatch(body, /favicon\.png/)
    // The guard comes before the one print: with a Site Icon, core's wp_site_icon() owns the head.
    const guard = body.search(/if \( has_site_icon\(\) \|\| is_customize_preview\(\) \) \{\s*return;\s*\}/)
    const print = body.search(/rel=\\?"icon\\?"/)
    assert.ok(guard >= 0, 'no early return on has_site_icon() / is_customize_preview()')
    assert.ok(print > guard, 'the icon link is printed before the guard')
    assert.equal(body.match(/rel=\\?"icon\\?"/g).length, 1)
    assert.match(body, /get_theme_file_uri\( 'assets\/images\/favicon\.svg' \)/)
    assert.match(body, /type=\\?"image\/svg\+xml\\?"/)
  })

  test(`${tree}: nothing else in the theme prints an icon link`, () => {
    const printers = filesUnder(path.join(PKG, tree))
      .filter((f) => /\.(php|html)$/.test(f))
      .filter((f) => /rel=\\?["']icon/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(path.join(PKG, tree), f))
    assert.deepEqual(printers, ['inc/extra.php'])
  })
}
