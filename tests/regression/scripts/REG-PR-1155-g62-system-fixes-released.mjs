/**
 * REG-PR-1155: the g62 system fixes of the seven questions hold, and ship with the releases they were
 * cut for. No network, no stand:
 *   S1 a demo label that reads like a brand ("J!Pages") is translated and only the customer's names are
 *      kept, on the line path and the Joomla batch path, each with a model that keeps any "J!" words;
 *   S2 every FULL post has its own title and an intro that does not restate the About answer (Joomla and
 *      WordPress, models that repeat, answer About-like or translate the demo's title);
 *   S3 EmDash: every font carries the vietnamese subset (three themes), kit components and the seed's
 *      language editions without English leftovers, BLANK keeps the demo's file button, FULL drops the
 *      line saying what the demo company posts on the social buttons kept (three themes);
 *   S4 the built-site audit counts one article reached by two routes once;
 *   S5 both quickstarts.json pin Claude Cowork for Joomla 0.24.14 everywhere, Tracy Business EmDash
 *      1.7.10 and Tracy SaaS EmDash 1.4.7 with their asset ids.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const themes = ['business', 'saas', 'base']

// S1
c.tapClean(
  'S1 demo labels translated, only the customer names kept',
  nodeTest([
    'apps/tracy-web/test/translate-lines-demo-names.test.mjs',
    'packages/cms/tracy-seeder/test/plan-joomla-language-demo-names.test.mjs'
  ])
)

// S2
c.tapClean(
  'S2 distinct FULL post titles and intros',
  nodeTest([
    'apps/tracy-web/test/joomla-blog-translate.test.mjs',
    'apps/tracy-web/test/brief-wp-posts.test.mjs'
  ])
)

// S3
c.tapClean(
  'S3 EmDash fonts, kit words, seed languages, demo file button, social lines',
  nodeTest([
    ...themes.map((t) => `packages/cms/tracy-emdash-theme-${t}/tests/font-subsets.test.mjs`),
    ...themes.map((t) => `packages/cms/tracy-emdash-theme-${t}/tests/personalize-facts.test.mjs`),
    'packages/cms/tracy-emdash-theme-business/tests/kit-component-words.test.mjs',
    'packages/cms/tracy-emdash-theme-business/tests/seed-language-leftovers.test.mjs',
    'packages/cms/tracy-emdash-theme-business/tests/personalize-demo-files-seed.test.mjs'
  ])
)

// S4
c.tapClean(
  'S4 built-site audit',
  nodeTest(['scripts/test/template-customization-question-readiness-built-site.test.mjs'])
)

// S5
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const q = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  const joomla = Object.entries(q).filter(([, e]) => e?.platform === 'joomla' && e.cowork)
  c.check(`S5 ${file}: Joomla pins exist`, joomla.length > 0, joomla.length)
  // The released fix versions are floors: a later pin has the fixes too (the pins move forward).
  const triple = (v) => (/^\d+\.\d+\.\d+$/.test(String(v)) ? String(v).split('.').map(Number) : null)
  const atLeast = (v, floor) => {
    const [a, b] = [triple(v), triple(floor)]
    if (!a || !b) return false
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
    return true
  }
  // `<name>-<x.y.z>.zip` or `.tar.gz`: the version is parsed, never matched against one exact file name
  const fileVersion = (f) => /^[a-z0-9-]+-(\d+\.\d+\.\d+)\.(?:zip|tar\.gz)$/.exec(String(f))?.[1]
  for (const [tag, e] of joomla)
    c.check(
      `S5 ${file}: ${tag} Claude Cowork 0.24.14 or later`,
      atLeast(e.cowork.version, '0.24.14'),
      e.cowork.version
    )
  for (const [id, v] of [
    ['tracy-business/emdash', '1.7.10'],
    ['tracy-saas/emdash', '1.4.7']
  ]) {
    const e = q[id]
    c.check(`S5 ${file}: ${id} version ${v} or later`, atLeast(e?.version, v), e?.version)
    for (const part of ['source', 'state']) {
      c.check(
        `S5 ${file}: ${id} ${part} names ${v} or later`,
        atLeast(fileVersion(e?.[part]?.file), v),
        e?.[part]?.file
      )
      c.check(`S5 ${file}: ${id} ${part} asset id`, Number.isSafeInteger(e?.[part]?.githubAssetId), e?.[part])
    }
  }
}
c.done()
