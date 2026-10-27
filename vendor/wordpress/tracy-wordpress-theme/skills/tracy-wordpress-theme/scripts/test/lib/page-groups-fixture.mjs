// The small fixture site of the page-groups live check (scripts/test/page-groups.integration.mjs): one tracked tree
// (`tasks/fix/` the dossier, `pkg/` a minimal generator package) that the harness copies into a baseline, a main
// worktree and one worktree per group, exactly as the recipe's `$WT-<g>` split.
//
//   /        home    front-page   coordinator's (frozen shared files)
//   /alpha   page    page-alpha   group g1: its template, its content record
//   /beta    page    page-beta    group g2: its template, its content record
//
// The reference is a rendered snapshot of the FINAL design (`spec/reference/rendered/*.html`): at the baseline /alpha and
// /beta differ from it (draft words, text colour from the neutral preset), and each group closes the difference with one
// content record and one owned template. Nothing here imitates a measurement tool; the pipeline under test is real.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const SLUG = 'fix'
export const PAGES = Object.freeze({
  home: { file: 'index.html', view: 'front-page', path: '/', slug: 'home', title: 'Home' },
  alpha: { file: 'alpha.html', view: 'page', path: '/alpha', slug: 'alpha', title: 'Alpha' },
  beta: { file: 'beta.html', view: 'page', path: '/beta', slug: 'beta', title: 'Beta' },
  // the groups are MIXED: g1 holds an html page and a page with no HTTP source, g2 an html page and a url page
  gamma: { file: 'gamma.html', view: 'page', path: '/gamma', slug: 'gamma', title: 'Gamma' },
  delta: { file: 'delta.html', view: 'page', path: '/delta', slug: 'delta', title: 'Delta' },
  // a url page with NO pairs entry: read at the same path on the source origin
  epsilon: { file: 'epsilon.html', view: 'page', path: '/epsilon', slug: 'epsilon', title: 'Epsilon' },
  // a MOVED page: the page-map says /zeta, the stand serves it at /our-zeta/ (its slug) — the seeded route differs from the page-map's
  zeta: { file: 'zeta.html', view: 'page', path: '/zeta', slug: 'our-zeta', title: 'Zeta' }
})
/** Where the stand serves a page whose seeded route is not its page-map path (the seed report's `pagemapPath` entry). */
export const MOVED = Object.freeze({ zeta: '/our-zeta/' })
/** The live source serves gamma at another route than the stand does: pairs.json maps `/gamma-live` → `/gamma`. */
export const GAMMA_SOURCE_ROUTE = '/gamma-live'
/** The effective reference.kind of the fixture's pages beside the pack default `html` (spec-pack.md §3). */
export const PAGE_KINDS = Object.freeze({ gamma: 'url', epsilon: 'url', delta: 'none' })
/** The pack's default kind is NOT http (`none`); the pages that have a source say so by their own entry (spec-pack.md §3). */
export const DEFAULT_KIND = 'none'
export const TEXT = Object.freeze({
  home: 'Welcome to the fixture site.',
  alphaDraft: 'Alpha draft text.',
  alphaFinal: 'Alpha final text.',
  betaDraft: 'Beta draft text.',
  betaFinal: 'Beta final text.',
  gamma: 'Gamma stays as it is.',
  delta: 'Delta stays as it is.',
  epsilon: 'Epsilon stays as it is.',
  zeta: 'Zeta stays as it is.'
})
export const TASK = 'tasks/fix'
export const PKG = 'pkg'
export const SPEC = `${TASK}/spec`
export const OVERLAY = `${PKG}/overlays/${SLUG}`
/** The two palette presets a group's template picks the page text colour from. */
export const COLORS = Object.freeze({ contrast: '#111111', accent: '#b00000', accent2: '#0050b0', base: '#ffffff', dark: { contrast: '#f2f2f2', base: '#101010', accent: '#ff6b6b', accent2: '#6ba6ff' } })

const p = (t) => `<!-- wp:paragraph -->\n<p>${t}</p>\n<!-- /wp:paragraph -->`
const json = (o) => JSON.stringify(o, null, 2) + '\n'

/** Page template: header part, a `main` group whose text colour is the preset `color`, title and content, footer part. */
export const pageTemplate = (color) => `<!-- wp:template-part {"slug":"header","tagName":"div"} /-->

<!-- wp:group {"tagName":"main","textColor":"${color}","layout":{"type":"constrained"}} -->
<main class="wp-block-group has-${color}-color has-text-color">
<!-- wp:post-title {"level":1} /-->

<!-- wp:post-content /-->
</main>
<!-- /wp:group -->

<!-- wp:template-part {"slug":"footer","tagName":"div"} /-->
`

const STYLE = `body{margin:0}
html[data-theme="dark"]{--wp--preset--color--base:${COLORS.dark.base};--wp--preset--color--contrast:${COLORS.dark.contrast};--wp--preset--color--accent:${COLORS.dark.accent};--wp--preset--color--accent-2:${COLORS.dark.accent2}}
`

/** Source side: the static page the design asks for, in light and (under html[data-theme=dark]) dark. */
export const sourcePage = (title, text, color, { live = false } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="fixture-source" content="${live ? 'independent-live' : 'snapshot'}">${live ? `
<script>(function(){var m=document.cookie.match(/(?:^|; )tracy_theme=(dark|light)/);if(m&&m[1]==="dark")document.documentElement.setAttribute("data-theme","dark")})()</script>` : ''}
<style>
:root{--base:${COLORS.base};--contrast:${COLORS.contrast};--accent:${COLORS.accent};--accent-2:${COLORS.accent2}}
html[data-theme="dark"]{--base:${COLORS.dark.base};--contrast:${COLORS.dark.contrast};--accent:${COLORS.dark.accent};--accent-2:${COLORS.dark.accent2}}
body{margin:0;background:var(--base);color:var(--contrast);font-family:system-ui,sans-serif;font-size:18px;line-height:1.6}
h1{font-size:40px;line-height:1.2;font-weight:700;margin:0 0 16px}
p{margin:0 0 16px}
main{max-width:720px;margin:0 auto;padding:0}
header,footer{max-width:720px;margin:0 auto}
</style></head>
<body>
<header><p>Fix Site</p></header>
<main style="color:var(--${color})">
<h1>${title}</h1>
<p>${text}</p>
</main>
<footer><p>© Fix Site</p></footer>
</body></html>
`

/**
 * Write the tracked tree under `root`. `state` is the baseline: the draft words and the neutral text colour on /alpha
 * and /beta; the groups edit exactly one record and one template each.
 */
export function writeFixture(root) {
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), text)
  }
  const pageRecord = (k, content) => ({ ...PAGES[k], parent: null, status: 'publish', content, meta: {}, images: [] })
  // --- the dossier ---
  put(`${SPEC}/page-map.json`, json({
    template: { name: SLUG, title: 'Fix' },
    theme: { palette: { light: { primary: COLORS.accent, secondary: COLORS.accent2, body_bg: COLORS.base, text: COLORS.contrast }, dark: null }, darkDerived: false, fonts: { body: 'system-ui' }, hook: { attribute: 'data-theme', darkValue: 'dark' } },
    scope: { mode: 'template' },
    locales: ['en'],
    defaultLocale: 'en',
    source: { kind: 'html' },
    pages: Object.values(PAGES).map((x) => ({ ...x }))
  }))
  put(`${SPEC}/content.json`, json({
    site: { name: 'Fix Site', tagline: 'A fixture', locales: ['en'], defaultLocale: 'en' },
    pages: [pageRecord('home', p(TEXT.home)), pageRecord('alpha', p(TEXT.alphaDraft)), pageRecord('beta', p(TEXT.betaDraft)), pageRecord('gamma', p(TEXT.gamma)), pageRecord('epsilon', p(TEXT.epsilon)), pageRecord('zeta', p(TEXT.zeta)), pageRecord('delta', Array.from({ length: 30 }, (_, i) => p(`${TEXT.delta} (${i + 1})`)).join('\n'))],
    posts: [],
    categories: [],
    archives: [],
    images: []
  }))
  put(`${SPEC}/sections.json`, json({ acm: [], custom: [], other: [] }))
  put(`${SPEC}/menus.json`, json({ menus: [] }))
  put(`${SPEC}/redirects.json`, json({ rules: [] }))
  put(`${SPEC}/reference.json`, json({
    kind: DEFAULT_KIND,
    viewports: [1440, 390],
    modes: ['light', 'dark'],
    pages: Object.entries(PAGES).map(([k, x]) => (PAGE_KINDS[k] ? { page: x.file, kind: PAGE_KINDS[k] } : { page: x.file, kind: 'html', path: `reference/rendered/${x.slug}--1440-light.html` }))
  }))
  put(`${SPEC}/reference/rendered/home--1440-light.html`, sourcePage('Home', TEXT.home, 'contrast'))
  put(`${SPEC}/reference/rendered/alpha--1440-light.html`, sourcePage('Alpha', TEXT.alphaFinal, 'accent'))
  put(`${SPEC}/reference/rendered/beta--1440-light.html`, sourcePage('Beta', TEXT.betaFinal, 'accent-2'))
  put(`${SPEC}/reference/rendered/${PAGES.zeta.slug}--1440-light.html`, sourcePage('Zeta', TEXT.zeta, 'contrast'))
  put(`${TASK}/review.config.json`, json({
    hook: { type: 'attribute', name: 'data-theme' },
    persistence: { type: 'cookie', key: 'tracy_theme' },
    containers: { none: 'fixture: one centred column, no container grid' },
    mega: false
  }))
  // the url page's live source: a route pair for gamma (another source route); epsilon has none and is read at its own path; the harness serves it from the stand itself (SOURCE_SITE)
  put(`${TASK}/pairs.json`, json({ rules: [{ from: GAMMA_SOURCE_ROUTE, to: PAGES.gamma.path }] }))
  put(`${TASK}/parity-accepted.json`, json({ accept: [] }))
  // --- the generator package: overlay in, built theme and zip out ---
  put(`${PKG}/scripts/build.mjs`, `#!/usr/bin/env node
// A minimal generator: overlays/<target>/ → src/<target>/ → dist/<target>.zip (what seed.mjs --theme-src runs: \`node scripts/build.mjs --target <slug>\`).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const i = process.argv.indexOf('--target')
const target = i > 0 ? process.argv[i + 1] : null
if (!/^[a-z][a-z0-9-]*$/.test(target ?? '') || !existsSync(path.join(root, 'overlays', target))) {
  console.error('build: --target <overlay name> is required')
  process.exit(2)
}
const out = path.join(root, 'src', target)
rmSync(out, { recursive: true, force: true })
mkdirSync(path.dirname(out), { recursive: true })
cpSync(path.join(root, 'overlays', target), out, { recursive: true })
mkdirSync(path.join(root, 'dist'), { recursive: true })
rmSync(path.join(root, 'dist', target + '.zip'), { force: true })
const z = spawnSync('zip', ['-qr', path.join(root, 'dist', target + '.zip'), target, '-x', '*.DS_Store'], { cwd: path.join(root, 'src'), encoding: 'utf8' })
if (z.status !== 0) {
  console.error('build: zip failed: ' + (z.stderr || z.error))
  process.exit(1)
}
console.log('build: ' + target + ' → dist/' + target + '.zip')
`)
  put(`${OVERLAY}/style.css`, `/*\nTheme Name: Fix\nVersion: 1.0.0\nText Domain: ${SLUG}\n*/\n${STYLE}`)
  put(`${OVERLAY}/theme.json`, json({
    $schema: 'https://schemas.wp.org/trunk/theme.json',
    version: 3,
    settings: {
      appearanceTools: false,
      layout: { contentSize: '720px', wideSize: '720px' },
      color: { palette: [
        { slug: 'base', name: 'Base', color: COLORS.base },
        { slug: 'contrast', name: 'Contrast', color: COLORS.contrast },
        { slug: 'accent', name: 'Accent', color: COLORS.accent },
        { slug: 'accent-2', name: 'Accent 2', color: COLORS.accent2 }
      ] },
      typography: { fontFamilies: [{ slug: 'system', name: 'System', fontFamily: 'system-ui, sans-serif' }] }
    },
    styles: {
      color: { background: 'var(--wp--preset--color--base)', text: 'var(--wp--preset--color--contrast)' },
      typography: { fontFamily: 'var(--wp--preset--font-family--system)', fontSize: '18px', lineHeight: '1.6' },
      elements: { h1: { typography: { fontSize: '40px', lineHeight: '1.2', fontWeight: '700' } } }
    }
  }))
  put(`${OVERLAY}/functions.php`, `<?php
// A block theme does not load style.css by itself: it carries the dark restate of the palette presets.
add_action('wp_enqueue_scripts', function () {
  wp_enqueue_style('fix-style', get_stylesheet_uri(), array(), wp_get_theme()->get('Version'));
});
// No skip link: core draws it 1px wide, which the intrinsic mobile probe reports as a site-only wrapped control (the real theme styles it).
remove_action('wp_footer', 'the_block_template_skip_link');
remove_action('wp_enqueue_scripts', 'wp_enqueue_block_template_skip_link');
// The stored choice (cookie tracy_theme) becomes the dark hook before first paint, as the real theme does.
add_action('wp_head', function () {
  echo '<script>(function(){var m=document.cookie.match(/(?:^|; )tracy_theme=(dark|light)/);if(m&&m[1]==="dark")document.documentElement.setAttribute("data-theme","dark")})()</script>';
}, 1);
// The body class the contract reads as a page's kind (tracy_page_kind() in the real theme).
add_filter('body_class', function ($classes) {
  $classes[] = is_front_page() ? 'tracy-page-home' : 'tracy-page-page';
  return $classes;
});
`)
  put(`${OVERLAY}/patterns.map.json`, json({ types: {} }))
  put(`${OVERLAY}/parts/header.html`, `<!-- wp:group {"tagName":"header","layout":{"type":"constrained"}} -->\n<header class="wp-block-group">\n${p('Fix Site')}\n</header>\n<!-- /wp:group -->\n`)
  put(`${OVERLAY}/parts/footer.html`, `<!-- wp:group {"tagName":"footer","layout":{"type":"constrained"}} -->\n<footer class="wp-block-group">\n${p('© Fix Site')}\n</footer>\n<!-- /wp:group -->\n`)
  put(`${OVERLAY}/templates/index.html`, pageTemplate('contrast'))
  put(`${OVERLAY}/templates/front-page.html`, pageTemplate('contrast'))
  put(`${OVERLAY}/templates/page.html`, pageTemplate('contrast'))
  // the group-owned templates start on the neutral colour; each group's fix is the one owned file
  put(`${OVERLAY}/templates/page-alpha.html`, pageTemplate('contrast'))
  put(`${OVERLAY}/templates/page-beta.html`, pageTemplate('contrast'))
}

/** The ownership manifest of the split (group-merge.mjs). */
export const manifest = () => ({
  schemaVersion: 1,
  roots: [TASK, OVERLAY],
  records: [{ file: `${SPEC}/content.json`, adapter: 'content' }],
  frozen: [`${OVERLAY}/theme.json`, `${OVERLAY}/style.css`, `${OVERLAY}/functions.php`, `${OVERLAY}/templates/front-page.html`, `${OVERLAY}/templates/page.html`, `${OVERLAY}/templates/index.html`, `${OVERLAY}/parts/`],
  groups: { g1: { owns: [`${OVERLAY}/templates/page-alpha.html`] }, g2: { owns: [`${OVERLAY}/templates/page-beta.html`] } }
})
