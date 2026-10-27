/**
 * Tracy Base (Joomla, template `tracy`): `?theme=dark|light` on the address wins for that load,
 * over the saved cookie, the GUI default and the OS, and is never saved.
 *
 * Tracy's Design inspiration preview frames the demo and asks for a theme this way: it cannot reach
 * the site's cookie across origins, and a frame cannot change what the framed page reads as the OS
 * preference. Measured 29/09 on `base-joomla.tracy.site` (tracy-base/j6 1.0.0): the parameter was
 * ignored, so the preview's Light/Dark buttons did nothing. Same rule as the EmDash themes
 * (`Base.astro`) and the WordPress themes (`tracy-wordpress-theme/test/dark-param.test.mjs`).
 *
 * The template sets its dark hook three ways at once — `data-theme`, `html.t4-dark` and
 * `data-bs-theme` — first in PHP (a pre-paint head script) and then in `js/darkmode.js`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const here = new URL('../template-patches/tracy-base/', import.meta.url)

/**
 * Run darkmode.js on a bare page whose first paint already chose `painted`, and answer the three
 * hooks, the cookie it left, and a way to flip the OS preference afterwards.
 */
function run({ search = '', cookie = '', osDark = false, painted = 'light', cfg }) {
  const attrs = new Map([
    ['data-theme', painted],
    ['data-bs-theme', painted]
  ])
  const classes = new Set(painted === 'dark' ? ['t4-dark'] : [])
  const listeners = []
  const document = {
    cookie,
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: (k) => attrs.get(k) ?? null,
      removeAttribute: (k) => attrs.delete(k),
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
        contains: (c) => classes.has(c)
      }
    },
    querySelectorAll: () => [],
    addEventListener: () => {}
  }
  const mq = { matches: osDark, addEventListener: (_type, fn) => listeners.push(fn) }
  const window = { tracyTheme: cfg ?? { def: 'auto', enabled: true }, matchMedia: () => mq }
  const location = { search, protocol: 'https:' }
  const code = readFileSync(new URL('js/darkmode.js', here), 'utf8')
  new Function('document', 'window', 'location', code)(document, window, location)
  const hooks = () => ({
    theme: attrs.get('data-theme'),
    bs: attrs.get('data-bs-theme'),
    t4dark: classes.has('t4-dark'),
    cookie: document.cookie
  })
  return {
    ...hooks(),
    osChanges(matches) {
      for (const fn of listeners) fn({ matches })
      return hooks()
    }
  }
}

test('darkmode.js: ?theme=light wins over a dark cookie, a dark OS and a dark first paint', () => {
  const page = run({ search: '?theme=light', cookie: 'tracy-theme=dark', osDark: true, painted: 'dark' })
  assert.deepEqual(
    { theme: page.theme, bs: page.bs, t4dark: page.t4dark },
    { theme: 'light', bs: 'light', t4dark: false }
  )
})

test('darkmode.js: ?theme=dark wins over a light cookie and sets all three hooks', () => {
  const page = run({ search: '?theme=dark', cookie: 'tracy-theme=light', painted: 'light' })
  assert.deepEqual(
    { theme: page.theme, bs: page.bs, t4dark: page.t4dark },
    { theme: 'dark', bs: 'dark', t4dark: true }
  )
})

test('darkmode.js: the asked theme is for this load only — no cookie is written', () => {
  assert.equal(run({ search: '?theme=dark' }).cookie, '')
})

test('darkmode.js: while a theme is asked, an OS change does not take it back', () => {
  const page = run({ search: '?theme=dark', osDark: true, painted: 'dark' })
  assert.equal(page.osChanges(false).theme, 'dark')
})

test('darkmode.js: without the parameter, the first paint stands and the OS is still followed', () => {
  const page = run({ painted: 'dark', osDark: true })
  assert.equal(page.theme, 'dark')
  assert.equal(page.osChanges(false).theme, 'light')
  assert.equal(run({ search: '?theme=purple', painted: 'light', cookie: 'tracy-theme=light' }).theme, 'light')
})

test('darkmode.js: a site locked to light with the switcher off is not turned dark', () => {
  const page = run({ search: '?theme=dark', painted: 'light', cfg: { def: 'light', enabled: false } })
  assert.equal(page.theme, 'light')
})

/**
 * PHP is not run here (CI has no PHP); the browser measurement in the task's STATUS proves the
 * page. This pins the ORDER of the rule in both server-side resolutions, which is what broke:
 * the request parameter is read, restricted to dark|light, and consulted before the cookie.
 */
for (const file of ['index.php', 'theme-resolve.php']) {
  test(`${file}: the first paint consults ?theme before the cookie`, () => {
    const php = readFileSync(new URL(file, here), 'utf8')
    const asked = php.search(/input->getCmd\('theme', ''\)/)
    assert.ok(asked > 0, 'reads theme from the request')
    assert.match(php, /!== 'dark' && \$\w+ !== 'light'\)\s*\{\s*\$\w*[Aa]sked\w* = '';/)
    const firstBranch = php.search(/if \(\$\w*[Aa]sked\w* !== ''/)
    const cookieBranch = php.search(/Enabled && \$\w*[Cc]ookie\w* !== ''\)/)
    assert.ok(firstBranch > asked && cookieBranch > firstBranch, 'the asked theme is the first branch')
  })
}
