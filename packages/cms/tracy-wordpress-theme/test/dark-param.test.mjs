/**
 * `?theme=dark|light` on the address wins for that load, over the saved cookie and over the OS.
 *
 * Tracy's Design inspiration preview frames a demo and asks for a theme this way: it cannot reach
 * the site's cookie across origins, and a frame cannot change what the framed page reads as the
 * OS preference. Measured 29/09 on dev: the WordPress demo of Tracy Business ignored the parameter,
 * so the preview's Light/Dark buttons did nothing, and on a Mac set to dark the demo stayed dark
 * whichever button was pressed. The EmDash themes already honour it (`Base.astro`).
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { targetOf } from '../scripts/build.mjs'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'
import { after, before, test } from 'node:test'

const here = new URL('..', import.meta.url)

/**
 * Every overlay target that ships a dark toggle, found rather than listed, so a future port cannot
 * ship without the override. A toggle is a `[data-tracy-theme-toggle]` marker in the overlay's
 * parts/templates, a `<slug>-dark.js` in its assets, or an enqueue of one in its extra.php. A target
 * that has a toggle but no dark script in the overlay or the built tree fails here, by name.
 */
const readIn = (root, rel) => readFileSync(path.join(root, rel), 'utf8')
const walk = (root, rel) => {
  const out = []
  for (const e of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...walk(root, `${rel}/${e.name}`))
    else out.push(`${rel}/${e.name}`)
  }
  return out
}
const hasToggle = (root, slug) => {
  const overlay = `overlays/${slug}`
  if (existsSync(path.join(root, `${overlay}/assets/js/${slug}-dark.js`))) return true
  const extra = `${overlay}/inc/extra.php`
  if (existsSync(path.join(root, extra)) && /-dark\.js/.test(readIn(root, extra))) return true
  return ['parts', 'templates', 'patterns']
    .filter((d) => existsSync(path.join(root, `${overlay}/${d}/`)))
    .flatMap((d) => walk(root, `${overlay}/${d}`))
    .some((f) => readIn(root, f).includes('data-tracy-theme-toggle'))
}
/**
 * Every directory under overlays/ is a target; its config is then read through targetOf(), so a
 * directory with a missing or broken theme.config.json stops here under its own name instead of
 * dropping out of the list (overlayTargets() would skip it silently).
 */
const toggleTargets = (root) => {
  const dir = path.join(root, 'overlays')
  if (!existsSync(dir)) return []
  const slugs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  for (const slug of slugs) targetOf(slug, { pkgDir: root })
  return slugs.filter((slug) => hasToggle(root, slug))
}
const read = (rel) => readIn(fileURLToPath(here), rel)
const TOGGLE_TARGETS = toggleTargets(fileURLToPath(here))
const SCRIPTS = TOGGLE_TARGETS.flatMap((slug) => [
  `overlays/${slug}/assets/js/${slug}-dark.js`,
  `src/${slug}/assets/js/${slug}-dark.js`
])

test('the toggle targets are discovered and every one has its dark script in the overlay and the built tree', () => {
  assert.ok(TOGGLE_TARGETS.length >= 6, `discovered only ${TOGGLE_TARGETS.join(', ')}`)
  for (const slug of ['wp-ja-kinetic', 'wp-ja-morgan', 'wp-ja-nova', 'wp-ja-vega']) {
    assert.ok(TOGGLE_TARGETS.includes(slug), `${slug} is not discovered`)
  }
  for (const file of SCRIPTS) assert.ok(existsSync(new URL(file, here)), `${file} is missing`)
})

test('an overlay directory with a missing or broken config stops discovery under its name', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dark-param-'))
  try {
    const dir = path.join(root, 'overlays', 'wp-ja-fixture', 'assets', 'js')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'wp-ja-fixture-dark.js'), '')
    assert.throws(() => toggleTargets(root), /wp-ja-fixture/)
    writeFileSync(path.join(root, 'overlays', 'wp-ja-fixture', 'theme.config.json'), '{')
    assert.throws(() => toggleTargets(root), /wp-ja-fixture/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('every toggle target enqueues its dark script in the head, blocking', () => {
  for (const slug of TOGGLE_TARGETS) {
    for (const base of ['overlays', 'src']) {
      const php = read(`${base}/${slug}/inc/extra.php`)
      assert.match(
        php,
        new RegExp(`${slug}-dark\\.js'[^;]*'in_footer' => false`),
        `${base}/${slug}/inc/extra.php`
      )
    }
  }
})

/**
 * WordPress's canonical redirect rebuilds the query from a parsed copy where a repeated key keeps its
 * LAST value, so `?theme=dark&theme=light` was sent to `?theme=light` before any script ran and the
 * "first value decides" rule never saw the repeat (measured 01/10 on jmgwp: 301 to `?theme=light`).
 * Every toggle target carries the same filter; it runs here as real PHP, on the function text taken
 * from the overlay and from the built tree.
 */
const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp({})
})
after(() => php?.stop())

const FILTER_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function add_filter() {}
eval($in['code']);
$out = [];
foreach ($in['cases'] as $c) { $out[] = ($in['fn'])($c[0], $c[1]); }
echo json_encode($out, JSON_UNESCAPED_SLASHES);
`
const REDIRECT_CASES = [
  // [wanted, asked, answer]: false = cancelled, else the address WordPress wanted
  ['http://s.test/?theme=light', 'http://s.test/?theme=dark&theme=light', false],
  ['http://s.test/?theme=light&x=1', 'http://s.test/?x=1&theme=dark&theme=light', false],
  ['http://s.test/?theme=dark', 'http://s.test/?theme=dark', 'http://s.test/?theme=dark'],
  ['http://s.test/about/?theme=dark', 'http://s.test/about?theme=dark', 'http://s.test/about/?theme=dark'],
  [
    'http://s.test/about/?theme=light',
    'http://s.test/about?theme=dark&theme=light',
    'http://s.test/about/?theme=light'
  ],
  ['http://s.test/?mytheme=1', 'http://s.test/?mytheme=1&mytheme=2', 'http://s.test/?mytheme=1'],
  [false, 'http://s.test/?theme=dark&theme=light', false],
  // first decoded key decides: bare, encoded, invalid, empty, ordered, "+", "=" in value
  ['http://s.test/?theme=dark', 'http://s.test/?theme&theme=dark', false],
  ['http://s.test/?theme=dark', 'http://s.test/?th%65me=purple&theme=dark', false],
  ['http://s.test/?theme=dark', 'http://s.test/?theme=&theme=dark', false],
  ['http://s.test/?theme=light', 'http://s.test/?th%65me=dark&theme=light', false],
  ['http://s.test/?theme=light', 'http://s.test/?theme=%64ark&theme=light', false],
  ['http://s.test/?theme=dark', 'http://s.test/?theme=+dark&theme=dark', false],
  ['http://s.test/?theme=dark', 'http://s.test/?theme=a=b&theme=dark', false],
  ['http://s.test/?theme=dark', 'http://s.test/?theme=dark&theme=dark', 'http://s.test/?theme=dark'],
  ['http://s.test/?theme=light', 'http://s.test/?theme=purple&theme=light&theme=dark', false],
  // look-alike keys are not theme
  ['http://s.test/?theme[]=a', 'http://s.test/?theme[]=a&theme[]=b', 'http://s.test/?theme[]=a'],
  ['http://s.test/?xtheme=1', 'http://s.test/?xtheme=1&theme=dark', 'http://s.test/?xtheme=1'],
  // a redirect that is not only about theme is left to WordPress
  [
    'http://other.test/?theme=light',
    'http://s.test/?theme=dark&theme=light',
    'http://other.test/?theme=light'
  ],
  ['https://s.test/?theme=light', 'http://s.test/?theme=dark&theme=light', 'https://s.test/?theme=light'],
  [
    'http://s.test:8080/?theme=light',
    'http://s.test/?theme=dark&theme=light',
    'http://s.test:8080/?theme=light'
  ],
  ['http://s.test/b/?theme=light', 'http://s.test/a/?theme=dark&theme=light', 'http://s.test/b/?theme=light'],
  ['http://s.test/?theme=light#x', 'http://s.test/?theme=dark&theme=light', 'http://s.test/?theme=light#x'],
  [
    'http://s.test/?theme=light&x=2',
    'http://s.test/?x=1&theme=dark&theme=light',
    'http://s.test/?theme=light&x=2'
  ],
  ['http://s.test/?theme=light', 'http://s.test/?x=1&theme=dark&theme=light', 'http://s.test/?theme=light'],
  // unparseable input keeps WordPress's decision
  ['http://s.test/?theme=light', 'http:///?theme=dark&theme=light', 'http://s.test/?theme=light']
]

test('every toggle target keeps a repeated ?theme= as written instead of letting the canonical redirect drop the first', {
  skip: PHP_SKIP
}, () => {
  for (const slug of TOGGLE_TARGETS) {
    for (const base of ['overlays', 'src']) {
      const file = `${base}/${slug}/inc/extra.php`
      const text = read(file)
      const fn = `${slug.replaceAll('-', '_')}_keep_first_theme_value`
      const code = text.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n}\\n`))?.[0]
      assert.ok(code, `${file}: no ${fn}()`)
      assert.match(
        text,
        new RegExp(`add_filter\\( 'redirect_canonical', '${fn}', 20, 2 \\);`),
        `${file}: filter not hooked`
      )
      const [out] = php.run([
        {
          args: ['-r', FILTER_PROBE],
          input: JSON.stringify({ code, fn, cases: REDIRECT_CASES.map((c) => [c[0], c[1]]) })
        }
      ])
      assert.equal(out.status, 0, `${file}: php failed: ${out.stderr}${out.stdout}`)
      assert.deepEqual(
        JSON.parse(out.stdout),
        REDIRECT_CASES.map((c) => c[2]),
        file
      )
    }
  }
})

/** Kinetic has two states and the page's own default; every other script has three and starts on auto. */
const defaultOf = (file) => {
  // Essence (1.0.5) and Nova (1.1.6) resolve auto to the OS setting on the root, so on the light OS these runs use it shows `light`.
  if (file.includes('wp-ja-essence') || file.includes('wp-ja-nova')) return 'light'
  return readFileSync(new URL(file, here), 'utf8').includes("'auto'") ? 'auto' : 'dark'
}

/** Run one dark-mode script on a bare page and answer the root's data-theme and the cookie it left. */
function run(
  file,
  {
    search = '',
    cookie = '',
    osDark = false,
    blocked = false,
    readyState = 'complete',
    click = false,
    pageDefault = ''
  }
) {
  const attrs = new Map(pageDefault ? [['data-theme-default', pageDefault]] : [])
  const classes = new Set()
  const listeners = {}
  const document = {
    cookie,
    readyState,
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      removeAttribute: (k) => attrs.delete(k),
      classList: {
        toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
        contains: (c) => classes.has(c)
      }
    },
    querySelectorAll: () => [],
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn)
  }
  if (blocked) {
    Object.defineProperty(document, 'cookie', {
      get() {
        throw new Error('blocked')
      },
      set() {
        throw new Error('blocked')
      }
    })
  }
  const window = { matchMedia: () => ({ matches: osDark, addEventListener: () => {} }) }
  const location = { search, protocol: 'https:' }
  const code = readFileSync(new URL(file, here), 'utf8')
  new Function('document', 'window', 'location', code)(document, window, location)
  const fallback = defaultOf(file)
  const before = attrs.get('data-theme') ?? 'auto'
  if (readyState === 'loading') for (const fn of listeners.DOMContentLoaded ?? []) fn()
  let saved = blocked ? '' : document.cookie
  if (click) {
    const button = { closest: () => button }
    for (const fn of listeners.click ?? []) fn({ target: button, preventDefault: () => {} })
    saved = blocked ? '' : document.cookie
    return {
      theme: attrs.get('data-theme') ?? 'auto',
      before,
      cookie: saved,
      fallback,
      dark: classes.has('t4-dark')
    }
  }
  return {
    theme: attrs.get('data-theme') ?? fallback,
    before,
    cookie: saved,
    fallback,
    dark: classes.has('t4-dark')
  }
}

for (const file of SCRIPTS) {
  test(`${file}: ?theme= wins over the cookie and the OS, and is not saved`, () => {
    assert.equal(
      run(file, { search: '?theme=light', cookie: 'tracy_theme=dark', osDark: true }).theme,
      'light'
    )
    assert.equal(run(file, { search: '?theme=dark', cookie: 'tracy_theme=light' }).theme, 'dark')
    assert.equal(run(file, { search: '?theme=dark' }).cookie, '', 'the asked theme is for this load only')
  })

  test(`${file}: without the parameter, the cookie still decides, and an unknown value is ignored`, () => {
    assert.equal(run(file, { cookie: 'tracy_theme=dark' }).theme, 'dark')
    assert.equal(run(file, { search: '?theme=purple', cookie: 'tracy_theme=light' }).theme, 'light')
    assert.equal(run(file, {}).theme, defaultOf(file))
  })
}

for (const file of SCRIPTS) {
  test(`${file}: the override applies while the document is loading and after DOMContentLoaded, a click still saves`, () => {
    const loading = run(file, { search: '?theme=light', cookie: 'tracy_theme=dark', readyState: 'loading' })
    assert.equal(loading.before, 'light', 'applied before DOMContentLoaded')
    assert.equal(loading.theme, 'light')
    assert.equal(loading.cookie, 'tracy_theme=dark', 'the cookie is untouched by the load')
    const clicked = run(file, { search: '?theme=dark', click: true })
    assert.match(clicked.cookie, /tracy_theme=(light|auto)/, 'a click saves the next state')
  })
}

for (const file of SCRIPTS) {
  test(`${file}: only exact dark|light count, the first repeat wins, markup is ignored`, () => {
    assert.equal(run(file, { search: '?theme=Dark', cookie: 'tracy_theme=light' }).theme, 'light')
    assert.equal(run(file, { search: '?theme=auto', cookie: 'tracy_theme=dark' }).theme, 'dark')
    assert.equal(run(file, { search: '?theme=', cookie: 'tracy_theme=dark' }).theme, 'dark')
    assert.equal(run(file, { search: '?theme=%E0%A4%A' }).theme, defaultOf(file))
    assert.equal(run(file, { search: '?theme=<script>' }).theme, defaultOf(file))
    assert.equal(run(file, { search: '?theme=dark&theme=light' }).theme, 'dark')
    // Only the FIRST theme value counts: an invalid one first asks for nothing, whatever follows.
    assert.equal(
      run(file, { search: '?theme=purple&theme=dark', cookie: 'tracy_theme=light' }).theme,
      'light'
    )
    assert.equal(run(file, { search: '?theme=&theme=dark', cookie: 'tracy_theme=light' }).theme, 'light')
    assert.equal(run(file, { search: '?x=1&theme=dark&y=2', cookie: 'tracy_theme=light' }).theme, 'dark')
  })
}

// Kinetic keeps the t4-dark class beside data-theme and defaults to the page's own theme.
for (const base of ['overlays', 'src']) {
  const file = `${base}/wp-ja-kinetic/assets/js/wp-ja-kinetic-dark.js`
  test(`${file}: t4-dark follows the state, and the page default (light on Blueprint) applies without a parameter`, () => {
    const light = run(file, { pageDefault: 'light' })
    assert.equal(light.theme, 'light')
    assert.equal(light.dark, false)
    const dark = run(file, {})
    assert.equal(dark.theme, 'dark')
    assert.equal(dark.dark, true)
    assert.equal(run(file, { pageDefault: 'light', cookie: 'tracy_theme=dark' }).dark, true)
    const asked = run(file, { search: '?theme=light', cookie: 'tracy_theme=dark' })
    assert.equal(asked.theme, 'light')
    assert.equal(asked.dark, false, 'the override drops t4-dark')
    assert.equal(run(file, { search: '?theme=dark', pageDefault: 'light' }).dark, true)
    const clicked = run(file, { search: '?theme=dark', click: true })
    assert.equal(clicked.theme, 'light')
    assert.equal(clicked.dark, false)
    assert.match(clicked.cookie, /tracy_theme=light/)
  })
}

// Only the JA Vega script guards its cookie access (1.1.4); the other themes' scripts are not part of that change.
for (const file of SCRIPTS.filter((f) => f.includes('wp-ja-vega'))) {
  test(`${file}: a blocked cookie does not break the preview`, () => {
    assert.equal(run(file, { search: '?theme=dark', blocked: true }).theme, 'dark')
    assert.equal(run(file, { blocked: true }).theme, defaultOf(file))
  })
}

test('wp-ja-vega: the head script is enqueued blocking and no filter pins the light scheme', () => {
  for (const base of ['overlays', 'src']) {
    const php = readFileSync(new URL(`${base}/wp-ja-vega/inc/extra.php`, here), 'utf8')
    assert.match(php, /wp-ja-vega-dark\.js'[^;]*'in_footer' => false/)
    assert.doesNotMatch(php, /language_attributes|data-theme="light"/)
    const header = readFileSync(new URL(`${base}/wp-ja-vega/parts/header.html`, here), 'utf8')
    assert.match(header, /data-tracy-theme-toggle/)
  }
})
