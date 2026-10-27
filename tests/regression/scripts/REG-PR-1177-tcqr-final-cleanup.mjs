/**
 * REG-PR-1177: the final decisions after the g65 builds hold. No network, no stand:
 *   S1 WordPress and Joomla FULL demo posts are translated only, through the real Apply door, with disobedient translators
 *      and out-of-credit models; menu items into a renamed category take its new name; the EmDash emptied-entry note;
 *   S2 EmDash: a vacancy is rewritten for the trade or emptied, never another company's job (three themes and the kit);
 *   S3 the readiness checks: built-site L1/L3/L5 and demo-mirrored titles, ABOUT-2 category menu labels;
 *   S4 Road to live's Polish step;
 *   S5 both quickstarts.json pin Tracy Business EmDash 1.7.14 with its asset ids;
 *   S6 the blog rewrite modules are gone.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const web = (/** @type {string} */ f) => `apps/tracy-web/test/${f}.test.mjs`

// S1
c.tapClean(
  'S1 FULL demo posts translated only, menu items follow renamed categories',
  nodeTest(
    [
      'brief-wordpress',
      'brief-wp-posts',
      'joomla-blog-translate',
      'joomla-demo-articles',
      'joomla-blog-categories',
      'blog-truthful-g64',
      'brief-emdash'
    ].map(web)
  )
)

// S2
c.tapClean(
  'S2 EmDash vacancies rewritten for the trade or emptied',
  nodeTest([
    ...['business', 'saas', 'base'].map(
      (t) => `packages/cms/tracy-emdash-theme-${t}/tests/personalize-rewrite-trade.test.mjs`
    ),
    'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tests/personalize-rewrite-trade.test.mjs',
    'packages/cms/tracy-emdash-theme-business/tests/personalize-keeps-structure.test.mjs'
  ])
)

// S3
c.tapClean(
  'S3 readiness checks of 12/10',
  nodeTest([
    'scripts/test/template-customization-question-readiness-built-site.test.mjs',
    web('template-customization-question-readiness-category-menus')
  ])
)

// S4
c.tapClean(
  'S4 Road to live Polish step',
  nodeTest([
    'packages/web/tracy-harness/test/problem-guides.test.mjs',
    'packages/web/tracy-harness/test/template-presses.test.mjs'
  ])
)

// S5
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const e = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))['tracy-business/emdash']
  c.eq(`S5 ${file}: tracy-business/emdash version`, e?.version, '1.7.14')
  for (const part of ['source', 'state']) {
    c.check(`S5 ${file}: ${part} names 1.7.14`, String(e?.[part]?.file).includes('-1.7.14.'), e?.[part]?.file)
    c.check(`S5 ${file}: ${part} asset id`, Number.isSafeInteger(e?.[part]?.githubAssetId), e?.[part])
  }
}

// S6
const engines = join(ROOT, 'apps/tracy-web/src/sites/brief-engines')
for (const gone of ['blog-plan.js', 'post-title-stage.js', 'blog-name-once.js', 'joomla-article-titles.js'])
  c.check(`S6 ${gone} removed`, !existsSync(join(engines, gone)), gone)
for (const here of ['blog-translate.js', 'joomla-menu-categories.js'])
  c.check(`S6 ${here} present`, existsSync(join(engines, here)), here)
c.done()
