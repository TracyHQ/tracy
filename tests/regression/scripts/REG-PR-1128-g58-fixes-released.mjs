/**
 * REG-PR-1128: the g58 round of the seven questions (JA Essence Joomla/WordPress, Tracy EmDash)
 * holds, and ships with the releases it was cut for. No network, no stand:
 *   S1 the new and changed tests of the round pass: the Joomla brief (site words, article titles,
 *      button labels, kit pages, brief-joomla), the WordPress brief and theme (brief-wordpress,
 *      brief-wp-posts, brief-wp-leaves, essence), EmDash Business, SaaS and Base personalize;
 *   S2 both quickstarts.json pin Claude Cowork for Joomla 0.24.11 everywhere, Tracy Business EmDash
 *      1.7.7 and Tracy SaaS EmDash 1.4.4 with their asset ids;
 *   S3 ja-essence/wp7/1.0.12 is the cut the theme 1.0.12 pack was captured from, and has a profile row.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()

// S1
const web = nodeTest([
  'apps/tracy-web/test/joomla-site-words.test.mjs',
  'apps/tracy-web/test/joomla-article-titles.test.mjs',
  'apps/tracy-web/test/joomla-button-labels.test.mjs',
  'apps/tracy-web/test/joomla-kit-pages.test.mjs',
  'apps/tracy-web/test/brief-joomla.test.mjs',
  'apps/tracy-web/test/brief-wordpress.test.mjs',
  'apps/tracy-web/test/brief-wp-posts.test.mjs',
  'apps/tracy-web/test/brief-wp-leaves.test.mjs',
  'apps/tracy-web/test/brief-emdash.test.mjs'
])
c.tapClean('S1 tracy-web brief tests of the round', web)
const theme = nodeTest(['packages/cms/tracy-wordpress-theme/test/essence.test.mjs'])
c.tapClean('S1 wp-ja-essence theme tests', theme)
const emdash = nodeTest([
  'packages/cms/tracy-emdash-theme-business/tests/personalize-kit-pictures.test.mjs',
  'packages/cms/tracy-emdash-theme-business/tests/personalize-trim.test.mjs',
  'packages/cms/tracy-emdash-theme-business/tests/page-gate.test.mjs',
  'packages/cms/tracy-emdash-theme-business/tests/empty-claims.test.mjs',
  'packages/cms/tracy-emdash-theme-saas/tests/personalize-facts.test.mjs',
  'packages/cms/tracy-emdash-theme-base/tests/personalize-facts.test.mjs'
])
c.tapClean('S1 EmDash personalize tests', emdash)

// S2
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const q = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  const joomla = Object.entries(q).filter(([, e]) => e?.platform === 'joomla' && e.cowork)
  c.check(`S2 ${file}: Joomla pins exist`, joomla.length > 0, joomla.length)
  for (const [tag, e] of joomla) c.eq(`S2 ${file}: ${tag} Claude Cowork`, e.cowork.version, '0.24.11')
  for (const [id, v] of [
    ['tracy-business/emdash', '1.7.7'],
    ['tracy-saas/emdash', '1.4.4']
  ]) {
    const e = q[id]
    c.eq(`S2 ${file}: ${id} version`, e?.version, v)
    for (const part of ['source', 'state']) {
      c.check(`S2 ${file}: ${id} ${part} names ${v}`, String(e?.[part]?.file).includes(v), e?.[part]?.file)
      c.check(`S2 ${file}: ${id} ${part} asset id`, Number.isSafeInteger(e?.[part]?.githubAssetId), e?.[part])
    }
  }
}

// S3
const W = 'packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7/1.0.12'
const m = JSON.parse(readFileSync(join(ROOT, `${W}/manifest.json`), 'utf8'))
c.eq('S3 contract id', m.id, 'ja-essence/wp7/1.0.12')
c.eq('S3 quickstart version', m.quickstart.version, '1.0.12')
const lock = JSON.parse(readFileSync(join(ROOT, `${W}/presentation-lock.json`), 'utf8'))
const style = lock.files?.['wp-content/themes/wp-ja-essence/style.css']
c.check(
  'S3 lock pins the theme files, words.php among them',
  Boolean(lock.files?.['wp-content/themes/wp-ja-essence/inc/words.php']),
  Object.keys(lock.files ?? {}).length
)
c.check('S3 lock pins style.css', typeof style === 'string', style)
const profiles = JSON.parse(readFileSync(join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8'))
const row = profiles.releases?.['quickstart/ja-essence/wp7']?.['1.0.12']
c.check(
  'S3 profile row 1.0.12 (logo pair, brand ready)',
  row?.logos === 'pair' && row?.brandReady === true,
  row
)
c.done()
