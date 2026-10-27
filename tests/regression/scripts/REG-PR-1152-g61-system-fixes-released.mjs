/**
 * REG-PR-1152: the g61 system fixes of the seven questions hold, and ship with the releases they were
 * cut for. No network, no stand:
 *   S1 language on WordPress and Joomla FULL, each test with a model that answers wrong: lines the plan
 *      leaves English are translated (left-words), repeated named WordPress blocks are page lines, an
 *      author's job and bio are translated, Joomla plugin strings, date literals and layout literals,
 *      and glyph faces for letters the template's fonts cannot draw;
 *   S2 template buttons (social kept, void buttons to Contact on FULL) and distinct post titles;
 *   S3 EmDash: the tracy-web image carries every seed file the tool reads (media-map.json), the demo
 *      company's file button, the seed's language editions without English leftovers, and the form
 *      plugin's words in the page language (three themes);
 *   S4 the built-site audit tests of the round and the LANG-2 fonts readiness rule;
 *   S5 both quickstarts.json pin Claude Cowork for Joomla 0.24.13 everywhere, Tracy Business EmDash
 *      1.7.9 and Tracy SaaS EmDash 1.4.6 with their asset ids;
 *   S6 ja-essence/wp7/1.0.14 is the cut that carries theme 1.0.14: content map as 1.0.13, the lock
 *      differs from 1.0.13 only in the 11 theme files 1.0.14 changed, and it has a profile row.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()

// S1
c.tapClean(
  'S1 language left in English, repeated names, author words, Joomla words, glyph fallback',
  nodeTest([
    'apps/tracy-web/test/joomla-left-english.test.mjs',
    'apps/tracy-web/test/brief-wp-labels-left.test.mjs',
    'apps/tracy-web/test/brief-wp-repeated-names.test.mjs',
    'apps/tracy-web/test/author-words.test.mjs',
    'apps/tracy-web/test/joomla-author-words.test.mjs',
    'apps/tracy-web/test/brief-wordpress.test.mjs',
    'apps/tracy-web/test/joomla-site-words.test.mjs',
    'apps/tracy-web/test/glyph-fallback.test.mjs'
  ])
)

// S2
c.tapClean(
  'S2 template buttons and distinct post titles',
  nodeTest([
    'packages/cms/tracy-seeder/test/plan-template-buttons.test.mjs',
    'apps/tracy-web/test/brief-wp-buttons.test.mjs',
    'apps/tracy-web/test/brief-wp-posts.test.mjs',
    'apps/tracy-web/test/joomla-article-titles.test.mjs'
  ])
)

// S3
c.tapClean(
  'S3 EmDash tool image files, demo files, seed languages, form words',
  nodeTest([
    'apps/tracy-web/test/emdash-tool.test.mjs',
    'packages/cms/tracy-emdash-theme-business/tests/personalize-demo-files-seed.test.mjs',
    'packages/cms/tracy-emdash-theme-business/tests/seed-language-leftovers.test.mjs',
    'packages/cms/tracy-emdash-theme-business/tests/form-embed-words.test.mjs',
    'packages/cms/tracy-emdash-theme-saas/tests/form-embed-words.test.mjs',
    'packages/cms/tracy-emdash-theme-base/tests/form-embed-words.test.mjs'
  ])
)

// S4
c.tapClean(
  'S4 built-site audit and fonts readiness',
  nodeTest([
    'scripts/test/template-customization-question-readiness-built-site-social-and-lists.test.mjs',
    'scripts/test/template-customization-question-readiness-built-site-dates-fonts.test.mjs',
    'scripts/test/template-customization-question-readiness-built-site-dead-buttons.test.mjs',
    'apps/tracy-web/test/template-customization-question-readiness-fonts.test.mjs'
  ])
)

// S5
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const q = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  const joomla = Object.entries(q).filter(([, e]) => e?.platform === 'joomla' && e.cowork)
  c.check(`S5 ${file}: Joomla pins exist`, joomla.length > 0, joomla.length)
  for (const [tag, e] of joomla) c.eq(`S5 ${file}: ${tag} Claude Cowork`, e.cowork.version, '0.24.13')
  for (const [id, v] of [
    ['tracy-business/emdash', '1.7.9'],
    ['tracy-saas/emdash', '1.4.6']
  ]) {
    const e = q[id]
    c.eq(`S5 ${file}: ${id} version`, e?.version, v)
    for (const part of ['source', 'state']) {
      c.check(`S5 ${file}: ${id} ${part} names ${v}`, String(e?.[part]?.file).includes(v), e?.[part]?.file)
      c.check(`S5 ${file}: ${id} ${part} asset id`, Number.isSafeInteger(e?.[part]?.githubAssetId), e?.[part])
    }
  }
}

// S6
const W = 'packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7'
const read = (/** @type {string} */ p) => JSON.parse(readFileSync(join(ROOT, W, p), 'utf8'))
const m = read('1.0.14/manifest.json')
c.eq('S6 contract id', m.id, 'ja-essence/wp7/1.0.14')
c.eq('S6 quickstart version', m.quickstart.version, '1.0.14')
c.eq(
  'S6 content map is 1.0.13s',
  readFileSync(join(ROOT, W, '1.0.14/content-map.json'), 'utf8') ===
    readFileSync(join(ROOT, W, '1.0.13/content-map.json'), 'utf8'),
  true
)
const lock = read('1.0.14/presentation-lock.json')
const old = read('1.0.13/presentation-lock.json')
const changed = Object.keys({ ...lock.files, ...old.files })
  .filter((f) => lock.files?.[f] !== old.files?.[f])
  .map((f) => f.replace('wp-content/themes/wp-ja-essence/', ''))
  .sort()
c.eq(
  'S6 lock differs from 1.0.13 only in the theme files 1.0.14 changed',
  changed.join(' '),
  [
    'inc/extra.php',
    ...['de_DE', 'es_ES', 'fr_FR', 'it_IT', 'nl_NL', 'vi', 'zh_CN', 'zh_TW'].map(
      (l) => `languages/${l}.l10n.php`
    ),
    'readme.txt',
    'style.css'
  ].join(' ')
)
c.eq(
  'S6 template parts and entities as 1.0.13',
  JSON.stringify([lock.templateParts, lock.entities]) === JSON.stringify([old.templateParts, old.entities]),
  true
)
const profiles = JSON.parse(readFileSync(join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8'))
const row = profiles.releases?.['quickstart/ja-essence/wp7']?.['1.0.14']
c.check(
  'S6 profile row 1.0.14 (logo pair, brand ready)',
  row?.logos === 'pair' && row?.brandReady === true,
  row
)
c.done()
