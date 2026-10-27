/**
 * REG-PR-927: focus draws one 1px stroke, never a halo, on Tracy surfaces. Greps the sources for
 * halo and thick-outline focus rules, reads the committed bundles of tracy-site-tabs and
 * tracy-brand, and renders the sign-in page.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, ROOT, run } from './lib.mjs'

const c = checks()

/**
 * `git grep -nE` in the checkout under test; exit 1 means no match.
 * @param {string} pattern - extended regex.
 * @param {string[]} paths - pathspecs.
 * @returns {string[]} matching lines.
 */
function gitGrep(pattern, paths) {
  const r = run('git', ['-C', ROOT, 'grep', '-nE', pattern, '--', ...paths])
  if (r.status !== 0 && r.status !== 1) c.check(`git grep ${pattern} ran`, false, r.stderr)
  return r.stdout.split('\n').filter((l) => l !== '')
}

const HALO = gitGrep(
  String.raw`(focus|focus-visible|focus-within):ring-(2|3|\[)|ring-ring/|:focus[^{]*\{[^}]*box-shadow: *0 0 0 [2-9]px`,
  ['packages', 'apps', ':!packages/cms', ':!**/dist/**', ':!**/test/**', ':!packages/**/lib/**']
)
c.check('HALO is empty', HALO.length === 0, HALO)

const THICK = gitGrep(String.raw`:focus[^{]*\{[^}]*outline: ?[2-9]px`, [
  'packages/site/tracy-site-tabs/src',
  'apps/tracy-web/src/lib/page-shell.js'
])
c.check('THICK is empty', THICK.length === 0, THICK)

const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const FIELD =
  read('packages/site/tracy-site-tabs/lib/client.js').match(/tv-team-field:focus-within ?\{[^}]*\}/g) ?? []
c.check('FIELD is non-empty', FIELD.length > 0, FIELD)
c.check(
  "no FIELD entry contains 'box-shadow'",
  FIELD.every((s) => !s.includes('box-shadow')),
  FIELD.filter((s) => s.includes('box-shadow'))
)
const THUMB =
  read('packages/brand/tracy-brand/lib/client.js').match(
    /aria-pressed=\\?"true\\?"\]:focus-visible \.tb-pv \{[^}]*\}/g
  ) ?? []
c.check('THUMB is non-empty', THUMB.length > 0, THUMB)
c.check(
  "no THUMB entry contains 'box-shadow'",
  THUMB.every((s) => !s.includes('box-shadow')),
  THUMB.filter((s) => s.includes('box-shadow'))
)

const render = run(process.execPath, [
  '--input-type=module',
  '-e',
  "import {loginPage} from './apps/tracy-web/src/identity/pages.js'; const h=loginPage({}); process.stdout.write(typeof h==='string'?h:await h.text())"
])
c.eq('S4 loginPage() renders: exit code', render.status, 0)
const LOGIN = render.stdout
c.eq('RING', LOGIN.includes('box-shadow:0 0 0 1px var(--ring)'), false)
c.eq('AUTH', LOGIN.includes('.auth-card input:focus-visible'), true)
c.done()
