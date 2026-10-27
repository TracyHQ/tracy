/**
 * REG-PR-1143: the g60 system fixes of the seven questions hold, and ship with the releases they were
 * cut for. No network, no stand:
 *   S1 the Apply door test: every action the brief engines and the seeder call is allowed by the door;
 *   S2 the disobedient-model tests: a model that answers wrong (tokens dropped, duplicate titles, labels
 *      that do not name their target, short bodies, failed translation batches) never leaves a line
 *      silently dropped or left in English, in the WordPress, Joomla and EmDash engines and the EmDash
 *      personalize tool of all three themes;
 *   S3 the built-site audit unit tests and the readiness rules of the round (g60 test, CSS words);
 *   S4 both quickstarts.json pin Claude Cowork for Joomla 0.24.12 everywhere, Tracy Business EmDash
 *      1.7.8 and Tracy SaaS EmDash 1.4.5 with their asset ids;
 *   S5 ja-essence/wp7/1.0.13 is the cut that carries theme 1.0.13: content map as 1.0.12, the lock
 *      differs from 1.0.12 only in the four theme files 1.0.13 changed, and it has a profile row.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()

// S1
c.tapClean(
  'S1 Apply door allows every action the engines call',
  nodeTest(['apps/tracy-web/test/brief-engine-door-actions.test.mjs'])
)

// S2
c.tapClean(
  'S2 brief engines with a disobedient model',
  nodeTest([
    'apps/tracy-web/test/brief-wp-runs.test.mjs',
    'apps/tracy-web/test/brief-wp-posts.test.mjs',
    'apps/tracy-web/test/brief-wp-buttons.test.mjs',
    'apps/tracy-web/test/brief-wp-block-words.test.mjs',
    'apps/tracy-web/test/joomla-kit-pages.test.mjs',
    'apps/tracy-web/test/joomla-article-order.test.mjs',
    'apps/tracy-web/test/brief-emdash.test.mjs'
  ])
)
c.tapClean(
  'S2 EmDash personalize fallback gate (three themes)',
  nodeTest([
    'packages/cms/tracy-emdash-theme-business/tests/personalize-fallback-gate.test.mjs',
    'packages/cms/tracy-emdash-theme-saas/tests/personalize-fallback-gate.test.mjs',
    'packages/cms/tracy-emdash-theme-base/tests/personalize-fallback-gate.test.mjs'
  ])
)

// S3
c.tapClean(
  'S3 built-site audit and readiness rules of the round',
  nodeTest([
    'scripts/test/template-customization-question-readiness-built-site.test.mjs',
    'apps/tracy-web/test/template-customization-question-readiness-g60.test.mjs',
    'packages/cms/tracy-wordpress-theme/test/css-words.test.mjs'
  ])
)

// S4
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const q = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  const joomla = Object.entries(q).filter(([, e]) => e?.platform === 'joomla' && e.cowork)
  c.check(`S4 ${file}: Joomla pins exist`, joomla.length > 0, joomla.length)
  for (const [tag, e] of joomla) c.eq(`S4 ${file}: ${tag} Claude Cowork`, e.cowork.version, '0.24.12')
  for (const [id, v] of [
    ['tracy-business/emdash', '1.7.8'],
    ['tracy-saas/emdash', '1.4.5']
  ]) {
    const e = q[id]
    c.eq(`S4 ${file}: ${id} version`, e?.version, v)
    for (const part of ['source', 'state']) {
      c.check(`S4 ${file}: ${id} ${part} names ${v}`, String(e?.[part]?.file).includes(v), e?.[part]?.file)
      c.check(`S4 ${file}: ${id} ${part} asset id`, Number.isSafeInteger(e?.[part]?.githubAssetId), e?.[part])
    }
  }
}

// S5
const W = 'packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7'
const read = (/** @type {string} */ p) => JSON.parse(readFileSync(join(ROOT, W, p), 'utf8'))
const m = read('1.0.13/manifest.json')
c.eq('S5 contract id', m.id, 'ja-essence/wp7/1.0.13')
c.eq('S5 quickstart version', m.quickstart.version, '1.0.13')
c.eq(
  'S5 content map is 1.0.12s',
  readFileSync(join(ROOT, W, '1.0.13/content-map.json'), 'utf8') ===
    readFileSync(join(ROOT, W, '1.0.12/content-map.json'), 'utf8'),
  true
)
const lock = read('1.0.13/presentation-lock.json')
const old = read('1.0.12/presentation-lock.json')
const changed = Object.keys({ ...lock.files, ...old.files })
  .filter((f) => lock.files?.[f] !== old.files?.[f])
  .map((f) => f.replace('wp-content/themes/wp-ja-essence/', ''))
  .sort()
c.eq(
  'S5 lock differs from 1.0.12 only in the theme files 1.0.13 changed',
  changed.join(' '),
  'assets/css/je-detail.css inc/words.php readme.txt style.css'
)
c.eq(
  'S5 template parts and entities as 1.0.12',
  JSON.stringify([lock.templateParts, lock.entities]) === JSON.stringify([old.templateParts, old.entities]),
  true
)
const profiles = JSON.parse(readFileSync(join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8'))
const row = profiles.releases?.['quickstart/ja-essence/wp7']?.['1.0.13']
c.check(
  'S5 profile row 1.0.13 (logo pair, brand ready)',
  row?.logos === 'pair' && row?.brandReady === true,
  row
)
c.done()
