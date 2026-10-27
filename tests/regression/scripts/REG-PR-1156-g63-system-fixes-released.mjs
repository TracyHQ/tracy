/**
 * REG-PR-1156: the g63 system fixes of the seven questions hold, and ship with the releases they were
 * cut for. No network, no stand:
 *   S1 WordPress and Joomla FULL post titles come from one title stage written last from each post's
 *      own final body (models that cut words, return the name, carry the demo topic or only rephrase);
 *   S2 EmDash: a label the model gives back unchanged or leaves out is asked again, then one at a time,
 *      and named in the report (three themes and the kit); the seed's language editions keep no
 *      English address words;
 *   S3 WordPress themes: no bundled translation keeps the English example words of its source;
 *   S4 the built-site audit skips person names and counts one Joomla article on two routes once;
 *   S5 both quickstarts.json pin Tracy Business EmDash 1.7.11 and Tracy SaaS EmDash 1.4.8 with their
 *      asset ids;
 *   S6 ja-essence/wp7/1.0.15 is the cut that carries theme 1.0.15: content map as 1.0.14, the lock
 *      differs only in the ten theme files 1.0.15 changed, and a profile row exists.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const themes = ['business', 'saas', 'base']

// S1
c.tapClean(
  'S1 one post title stage for WordPress and Joomla',
  nodeTest([
    'apps/tracy-web/test/post-title-stage-g62.test.mjs',
    'apps/tracy-web/test/wp-posts-g62.test.mjs',
    'apps/tracy-web/test/joomla-posts-g62.test.mjs'
  ])
)

// S2
c.tapClean(
  'S2 EmDash echoed labels asked again and reported, seed languages',
  nodeTest([
    ...themes.map((t) => `packages/cms/tracy-emdash-theme-${t}/tests/personalize-labels-echoed.test.mjs`),
    'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tests/personalize-labels-echoed.test.mjs',
    'packages/cms/tracy-emdash-theme-business/tests/seed-language-leftovers.test.mjs'
  ])
)

// S3
c.tapClean(
  'S3 theme translations keep no English example words',
  nodeTest(['packages/cms/tracy-wordpress-theme/test/l10n-example-words.test.mjs'])
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
  for (const [id, v] of [
    ['tracy-business/emdash', '1.7.11'],
    ['tracy-saas/emdash', '1.4.8']
  ]) {
    const e = q[id]
    c.eq(`S5 ${file}: ${id} version`, e?.version, v)
    for (const part of ['source', 'state']) {
      c.check(
        `S5 ${file}: ${id} ${part} names ${v}`,
        String(e?.[part]?.file).includes(`-${v}.`),
        e?.[part]?.file
      )
      c.check(`S5 ${file}: ${id} ${part} asset id`, Number.isSafeInteger(e?.[part]?.githubAssetId), e?.[part])
    }
  }
}

// S6
const W = 'packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7'
const read = (/** @type {string} */ p) => JSON.parse(readFileSync(join(ROOT, W, p), 'utf8'))
const m = read('1.0.15/manifest.json')
c.eq('S6 contract id', m.id, 'ja-essence/wp7/1.0.15')
c.eq('S6 quickstart version', m.quickstart.version, '1.0.15')
c.eq(
  'S6 content map is 1.0.14s',
  readFileSync(join(ROOT, W, '1.0.15/content-map.json'), 'utf8') ===
    readFileSync(join(ROOT, W, '1.0.14/content-map.json'), 'utf8'),
  true
)
const lock = read('1.0.15/presentation-lock.json')
const old = read('1.0.14/presentation-lock.json')
const changed = Object.keys({ ...lock.files, ...old.files })
  .filter((f) => lock.files?.[f] !== old.files?.[f])
  .map((f) => f.replace('wp-content/themes/wp-ja-essence/', ''))
  .sort()
c.eq(
  'S6 lock differs from 1.0.14 only in the theme files 1.0.15 changed',
  changed.join(' '),
  [
    ...['de_DE', 'es_ES', 'fr_FR', 'it_IT', 'nl_NL', 'vi', 'zh_CN', 'zh_TW'].map(
      (l) => `languages/${l}.l10n.php`
    ),
    'readme.txt',
    'style.css'
  ].join(' ')
)
c.eq(
  'S6 template parts and entities as 1.0.14',
  JSON.stringify([lock.templateParts, lock.entities]) === JSON.stringify([old.templateParts, old.entities]),
  true
)
const profiles = JSON.parse(readFileSync(join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8'))
const row = profiles.releases?.['quickstart/ja-essence/wp7']?.['1.0.15']
c.check(
  'S6 profile row 1.0.15 (logo pair, brand ready)',
  row?.logos === 'pair' && row?.brandReady === true,
  row
)
c.done()
