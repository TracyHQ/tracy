// review/brand-ready.mjs: a built theme is ready for Tracy's "Customize your site" sheet only when every
// place it draws the brand reads WordPress core (Site Logo / Site Title, tracy_logo_dark, site_icon,
// the title tag, {site.title}). Each rule on a theme that breaks it alone, the clean theme, the
// one-ground note, and the exit codes through the real process.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { brandReady } from '../review/brand-ready.mjs'

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'review', 'brand-ready.mjs')
const SCRATCH = fs.mkdtempSync(path.join(process.env.TRACY_TEST_SCRATCH || tmpdir(), 'brand-ready-'))
test.after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }))

const HEADER = `<!-- wp:group {"className":"x-header"} -->
<div class="wp-block-group x-header">
<!-- wp:site-logo {"width":120,"shouldSyncIcon":false,"className":"x-logo x-logo--light"} /-->
<!-- wp:site-logo {"width":120,"shouldSyncIcon":false,"className":"x-logo x-logo--dark"} /-->
<!-- wp:navigation /-->
</div>
<!-- /wp:group -->
`
const FOOTER = `<!-- wp:site-logo {"width":90,"shouldSyncIcon":false,"className":"x-footer__logo tracy-logo-dark"} /-->
<!-- wp:paragraph {"className":"copyright"} -->
<p class="copyright">© {year} {site.title}. All rights reserved.</p>
<!-- /wp:paragraph -->
`
const CLEAN = {
  'style.css': '/*\nTheme Name: X\n*/\n',
  'theme.json': '{"version":3,"styles":{"color":{"background":"light-dark(#fff,#111)"}}}',
  'functions.php': "<?php\nrequire_once __DIR__ . '/inc/brand-logo.php';\n",
  'inc/brand-logo.php': '<?php\n// conventions\n',
  'parts/header.html': HEADER,
  'parts/footer.html': FOOTER,
  'templates/index.html': '<!-- wp:template-part {"slug":"header"} /-->\n<!-- wp:post-content /-->\n'
}

/** A theme: the clean one with `change` applied (a value of null removes the file). */
function theme(name, change = {}) {
  const dir = fs.mkdtempSync(path.join(SCRATCH, `${name}-`))
  for (const [rel, body] of Object.entries({ ...CLEAN, ...change })) {
    if (body === null) continue
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), body)
  }
  return dir
}
const rules = (dir) => brandReady(dir).findings.map((f) => f.rule)

test('the clean theme is ready: no finding, no note, and it says what it examined', () => {
  const r = brandReady(theme('clean'))
  assert.deepEqual(r.findings, [])
  assert.deepEqual(r.notes, [])
  assert.equal(r.examined.headerParts, 1)
  assert.equal(r.examined.siteLogos, 3)
  assert.equal(r.darkMode, true)
})

test('brand-logo-php: the file missing, or functions.php not loading it', () => {
  assert.deepEqual(rules(theme('nofile', { 'inc/brand-logo.php': null })), ['brand-logo-php'])
  assert.deepEqual(rules(theme('noreq', { 'functions.php': '<?php\n' })), ['brand-logo-php'])
})

test('header-brand: a header with neither Site Logo nor Site Title; a theme with no header part', () => {
  assert.deepEqual(rules(theme('nohead', { 'parts/header.html': '<!-- wp:navigation /-->\n' })), ['header-brand'])
  const named = theme('title', { 'parts/header.html': '<!-- wp:site-title {"level":0} /-->\n<!-- wp:navigation /-->\n' })
  assert.deepEqual(rules(named), [])
  assert.deepEqual(rules(theme('nopart', { 'parts/header.html': null })), ['header-brand'])
})

test('logo-picture: an Image block, an <img> or an inline <svg> drawing the logo in a part', () => {
  const img = `${HEADER}<!-- wp:image {"className":"x-brand-mark"} -->\n<figure class="wp-block-image x-brand-mark"><img src="/logo.png" alt=""/></figure>\n<!-- /wp:image -->\n`
  assert.deepEqual(rules(theme('image', { 'parts/header.html': img })), ['logo-picture'])
  const svg = `${HEADER}<!-- wp:html -->\n<a class="x-home" href="/"><svg class="x-logo-mark" viewBox="0 0 1 1"></svg></a>\n<!-- /wp:html -->\n`
  assert.deepEqual(rules(theme('svg', { 'parts/header.html': svg })), ['logo-picture'])
  // An icon is no logo, and a clients' logo strip in a pattern is content.
  const icon = `${HEADER}<!-- wp:html -->\n<button class="x-toggle"><svg class="x-moon"></svg></button>\n<!-- /wp:html -->\n`
  const clients = { 'patterns/clients.php': '<!-- wp:image {"className":"x-clients__logo"} -->\n<figure></figure>\n<!-- /wp:image -->\n' }
  assert.deepEqual(rules(theme('icon', { 'parts/header.html': icon, ...clients })), [])
})

test('sync-icon: a Site Logo block without "shouldSyncIcon":false', () => {
  const h = HEADER.replace('"shouldSyncIcon":false,"className":"x-logo x-logo--light"', '"className":"x-logo x-logo--light"')
  assert.deepEqual(rules(theme('sync', { 'parts/header.html': h })), ['sync-icon'])
})

test('logo-ground: in a dark-mode theme a Site Logo says its ground; without dark mode it need not', () => {
  const h = HEADER.replace('x-logo x-logo--light', 'x-logo')
  assert.deepEqual(rules(theme('ground', { 'parts/header.html': h })), ['logo-ground'])
  assert.deepEqual(rules(theme('light-only', { 'parts/header.html': h, 'theme.json': '{"version":3}' })), [])
  const bare = HEADER.replace('x-logo x-logo--light', 'x-logo tracy-logo-bare')
  assert.deepEqual(rules(theme('bare', { 'parts/header.html': bare })), [])
})

test('one ground in both modes (no dark-classed spot) is a note, never a finding', () => {
  const h = '<!-- wp:site-logo {"shouldSyncIcon":false,"className":"x-logo tracy-logo-fallback"} /-->\n'
  const f = FOOTER.replace('x-footer__logo tracy-logo-dark', 'x-footer__logo tracy-logo-fallback')
  const r = brandReady(theme('one-ground', { 'parts/header.html': h, 'parts/footer.html': f }))
  assert.deepEqual(r.findings, [])
  assert.match(r.notes.join('\n'), /no dark-ground Site Logo spot/)
})

test('favicon: the theme printing its own icon link or unhooking wp_site_icon; a fallback behind has_site_icon() passes', () => {
  const own = "<?php\nadd_action( 'wp_head', function () { echo '<link rel=\"icon\" href=\"/fav.png\">'; } );\n"
  assert.deepEqual(rules(theme('fav', { 'inc/head.php': own })), ['favicon'])
  assert.deepEqual(rules(theme('unhook', { 'inc/head.php': "<?php\nremove_action( 'wp_head', 'wp_site_icon', 99 );\n" })), ['favicon'])
  const guarded = "<?php\nadd_action( 'wp_head', function () { if ( ! has_site_icon() ) { echo '<link rel=\"icon\" href=\"/fav.png\">'; } } );\n"
  assert.deepEqual(rules(theme('guarded', { 'inc/head.php': guarded })), [])
})

test('title: a filter that returns fixed text, a <title> in a template, title-tag removed; a filter reading the name passes', () => {
  const fixed = "<?php\nfunction x_title( $t ) {\n\treturn 'Minimal Blogging Template';\n}\nadd_filter( 'pre_get_document_title', 'x_title' );\n"
  assert.deepEqual(rules(theme('fixed', { 'inc/title.php': fixed })), ['title'])
  const part = "<?php\nfunction x_parts( array $p ): array {\n\t$p['title'] = __( 'Home', 'x' );\n\treturn $p;\n}\nadd_filter( 'document_title_parts', 'x_parts' );\n"
  assert.deepEqual(rules(theme('part', { 'inc/title.php': part })), ['title'])
  const named = "<?php\nfunction x_title( $t ) {\n\treturn esc_html( 'Page not found – ' . get_bloginfo( 'name' ) );\n}\nadd_filter( 'pre_get_document_title', 'x_title' );\n"
  assert.deepEqual(rules(theme('named', { 'inc/title.php': named })), [])
  const drop = "<?php\nfunction x_parts( array $p ): array {\n\tunset( $p['tagline'] );\n\treturn $p;\n}\nadd_filter( 'document_title_parts', 'x_parts' );\n"
  assert.deepEqual(rules(theme('drop', { 'inc/title.php': drop })), [])
  assert.deepEqual(rules(theme('closure', { 'inc/title.php': "<?php\nadd_filter( 'pre_get_document_title', function () { return 'X'; } );\n" })), ['title'])
  assert.deepEqual(rules(theme('tag', { 'templates/blank.html': '<title>Demo</title>\n' })), ['title'])
  assert.deepEqual(rules(theme('support', { 'inc/setup.php': "<?php\nremove_theme_support( 'title-tag' );\n" })), ['title'])
})

test('copyright: a demo name in the line, or the line outside a Paragraph/Custom HTML block; a class or heading named copyright is no line', () => {
  const demo = FOOTER.replace('© {year} {site.title}.', '© 2019 Morgan.')
  assert.deepEqual(rules(theme('demo', { 'parts/footer.html': demo })), ['copyright'])
  const heading = `${FOOTER}<!-- wp:heading -->\n<h3 class="wp-block-heading">Copyright 2026 Demo Co.</h3>\n<!-- /wp:heading -->\n`
  assert.deepEqual(rules(theme('heading', { 'parts/footer.html': heading })), ['copyright'])
  const titled = `${FOOTER}<!-- wp:heading -->\n<h3 class="wp-block-heading copyright">Copyright.</h3>\n<!-- /wp:heading -->\n`
  assert.deepEqual(rules(theme('titled', { 'parts/footer.html': titled })), [])
  const template = { 'templates/404.html': '<!-- wp:paragraph -->\n<p>© 2026 Kinetic Labs, Inc.</p>\n<!-- /wp:paragraph -->\n' }
  assert.deepEqual(rules(theme('tpl', template)), ['copyright'])
})

test('the process: exit 0 ready, 1 a finding, 2 not a built theme or no --theme', () => {
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' })
  const ok = run('--theme', theme('cli-clean'))
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stderr, /0 finding\(s\) · examined \d+ files/)
  const bad = run('--theme', theme('cli-bad', { 'functions.php': '<?php\n' }))
  assert.equal(bad.status, 1)
  assert.match(bad.stdout, /^brand-logo-php · functions\.php · /m)
  assert.equal(run('--theme', theme('cli-none', { 'theme.json': null })).status, 2)
  assert.equal(run('--theme', path.join(SCRATCH, 'missing')).status, 2)
  assert.equal(run().status, 2)
  const json = JSON.parse(run('--theme', theme('cli-json'), '--json').stdout)
  assert.deepEqual(json.findings, [])
})
