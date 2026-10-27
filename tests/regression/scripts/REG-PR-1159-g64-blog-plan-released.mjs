/**
 * REG-PR-1159: the g64 system fixes of the seven questions hold, and ship with the releases they were
 * cut for. No network, no stand:
 *   S1 WordPress and Joomla FULL demo blogs are planned as a whole (one brief per published post, demo
 *      copies included) and each post is written from its own brief, through the real Apply door, with
 *      disobedient models (one About story for every brief, lorem echo, sentence-tail titles, filler,
 *      a model that never obeys and is reported);
 *   S2 the title and post tests this PR moved to the new flow still pass;
 *   S3 EmDash: a label the model hands back unchanged or half translated is asked again, then one at a
 *      time, and named in the report (three themes and the kit);
 *   S4 both quickstarts.json pin Tracy Business EmDash 1.7.12 and Tracy SaaS EmDash 1.4.9 with their
 *      asset ids.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const themes = ['business', 'saas', 'base']
const web = (/** @type {string} */ f) => `apps/tracy-web/test/${f}.test.mjs`

// S1
c.tapClean(
  'S1 one blog plan for WordPress and Joomla, each post from its own brief',
  nodeTest([web('joomla-blog-plan-g63'), web('wp-blog-plan-g63')])
)

// S2
c.tapClean(
  'S2 title and post tests on the new flow',
  nodeTest(
    [
      'post-title-stage-g62',
      'wp-posts-g62',
      'joomla-posts-g62',
      'joomla-posts-g61',
      'wp-post-titles-g61',
      'joomla-article-titles',
      'joomla-demo-articles',
      'brief-wp-posts'
    ].map(web)
  )
)

// S3
const labelTests = ['personalize-labels-echoed', 'personalize-labels']
c.tapClean(
  'S3 EmDash echoed and half translated labels asked again and reported',
  nodeTest([
    ...themes.flatMap((t) =>
      labelTests.map((n) => `packages/cms/tracy-emdash-theme-${t}/tests/${n}.test.mjs`)
    ),
    ...labelTests.map(
      (n) => `vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tests/${n}.test.mjs`
    )
  ])
)

// S4
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const q = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  for (const [id, v] of [
    ['tracy-business/emdash', '1.7.12'],
    ['tracy-saas/emdash', '1.4.9']
  ]) {
    const e = q[id]
    c.eq(`S4 ${file}: ${id} version`, e?.version, v)
    for (const part of ['source', 'state']) {
      c.check(
        `S4 ${file}: ${id} ${part} names ${v}`,
        String(e?.[part]?.file).includes(`-${v}.`),
        e?.[part]?.file
      )
      c.check(`S4 ${file}: ${id} ${part} asset id`, Number.isSafeInteger(e?.[part]?.githubAssetId), e?.[part])
    }
  }
}
c.done()
