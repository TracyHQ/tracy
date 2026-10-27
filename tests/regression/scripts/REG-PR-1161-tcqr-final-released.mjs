/**
 * REG-PR-1161: the final-round fixes of the seven questions hold, and ship with the releases they were
 * cut for. No network, no stand:
 *   S1 a text call OpenRouter refuses for a transient in-flight budget (402) is waited out and asked
 *      again; a call too big for the budget, or no credit at all, is not;
 *   S2 WordPress and Joomla FULL blogs: the build report says the truth when the model is unavailable,
 *      the business is named at most once per post, demo blog categories are renamed for the
 *      customer's trade (slugs and posts kept), and a WordPress embed's address is never rewritten;
 *   S3 EmDash: a label given back with capitalised address words or half English is asked again, one
 *      page has one name, legal pages keep the template's text renamed, and the seed's language rows
 *      keep no English address noun (three themes and the kit);
 *   S4 JA Essence WordPress 1.0.16: a Vietnamese page draws its headings in a font the theme ships;
 *   S5 both quickstarts.json pin Tracy Business EmDash 1.7.13 and Tracy SaaS EmDash 1.4.10 with their
 *      asset ids;
 *   S6 ja-essence/wp7/1.0.16 is the cut that carries theme 1.0.16: content map as 1.0.15, the lock
 *      differs only in the eleven theme files 1.0.16 changed or added, and a profile row exists;
 *   S7 the readiness checker's LANG-2 fonts accept a font the template replaces on pages of a language with
 *      one that draws its letters (spec final rule 6), and count a family's per-language cut;
 *   S8 ja-essence/j6/1.0.5 is the cut that carries ja_essence 1.3.4: content map as 1.0.4, floor plugin 0.24.15,
 *      a profile row; every Joomla pin of both quickstarts.json is on Claude Cowork for Joomla 0.24.15, and the
 *      JA Essence j6 entry pins 1.0.5 with its asset ids and still carries 1.0.4.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const themes = ['business', 'saas', 'base']

// S1
c.tapClean('S1 in-flight budget 402 waited out', nodeTest(['apps/tracy-web/test/seed-model.test.mjs']))

// S2
c.tapClean(
  'S2 truthful blog report, name once, blog categories, WP embeds',
  nodeTest([
    'apps/tracy-web/test/blog-truthful-g64.test.mjs',
    'apps/tracy-web/test/joomla-blog-categories.test.mjs',
    'apps/tracy-web/test/brief-wordpress.test.mjs',
    'apps/tracy-web/test/brief-wp-leaves.test.mjs'
  ])
)

// S3
c.tapClean(
  'S3 EmDash address labels, one name per page, legal pages, seed languages',
  nodeTest([
    ...themes.flatMap((t) => [
      `packages/cms/tracy-emdash-theme-${t}/tests/personalize-labels-echoed.test.mjs`,
      `packages/cms/tracy-emdash-theme-${t}/tests/personalize-labels-destination.test.mjs`
    ]),
    'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tests/personalize-labels-echoed.test.mjs',
    'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tests/personalize-labels-destination.test.mjs',
    'packages/cms/tracy-emdash-theme-business/tests/personalize-legal-pages.test.mjs',
    'packages/cms/tracy-emdash-theme-business/tests/personalize-keeps-structure.test.mjs',
    'packages/cms/tracy-emdash-theme-business/tests/seed-language-leftovers.test.mjs'
  ])
)

// S4
c.tapClean(
  'S4 JA Essence WordPress Vietnamese heading font',
  nodeTest(['packages/cms/tracy-wordpress-theme/test/essence.test.mjs'])
)

// S5
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const q = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  for (const [id, v] of [
    ['tracy-business/emdash', '1.7.13'],
    ['tracy-saas/emdash', '1.4.10']
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
const m = read('1.0.16/manifest.json')
c.eq('S6 contract id', m.id, 'ja-essence/wp7/1.0.16')
c.eq('S6 quickstart version', m.quickstart.version, '1.0.16')
c.eq(
  'S6 content map is 1.0.15s',
  readFileSync(join(ROOT, W, '1.0.16/content-map.json'), 'utf8') ===
    readFileSync(join(ROOT, W, '1.0.15/content-map.json'), 'utf8'),
  true
)
const lock = read('1.0.16/presentation-lock.json')
const old = read('1.0.15/presentation-lock.json')
const changed = Object.keys({ ...lock.files, ...old.files })
  .filter((f) => lock.files?.[f] !== old.files?.[f])
  .map((f) => f.replace('wp-content/themes/wp-ja-essence/', ''))
  .sort()
c.eq(
  'S6 lock differs from 1.0.15 only in the theme files 1.0.16 changed or added',
  changed.join(' '),
  [
    'assets/css/je-category.css',
    'assets/css/je-detail.css',
    'assets/css/wp-ja-essence.css',
    ...[
      'be-vietnam-pro-400',
      'be-vietnam-pro-600',
      'be-vietnam-pro-700',
      'noto-serif-vietnamese-400',
      'noto-serif-vietnamese-700'
    ].map((f) => `assets/fonts/${f}.woff2`),
    'docs/design-system.md',
    'readme.txt',
    'style.css'
  ].join(' ')
)
c.eq(
  'S6 template parts and entities as 1.0.15',
  JSON.stringify([lock.templateParts, lock.entities]) === JSON.stringify([old.templateParts, old.entities]),
  true
)
const profiles = JSON.parse(readFileSync(join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8'))
const row = profiles.releases?.['quickstart/ja-essence/wp7']?.['1.0.16']
c.check(
  'S6 profile row 1.0.16 (logo pair, brand ready)',
  row?.logos === 'pair' && row?.brandReady === true,
  row
)

// S7
c.tapClean(
  'S7 LANG-2 fonts accept a language-scoped replacement font',
  nodeTest(['apps/tracy-web/test/template-customization-question-readiness-fonts.test.mjs'])
)

// S8
const J = 'packages/cms/tracy-joomla-quickstart/contracts/ja-essence/j6'
const jm = JSON.parse(readFileSync(join(ROOT, J, '1.0.5/manifest.json'), 'utf8'))
c.eq('S8 contract id', jm.id, 'ja-essence/j6/1.0.5')
c.eq('S8 floor plugin', jm.coworkContractVersion, '0.24.15')
c.eq(
  'S8 content map is 1.0.4s',
  readFileSync(join(ROOT, J, '1.0.5/content-map.json'), 'utf8') ===
    readFileSync(join(ROOT, J, '1.0.4/content-map.json'), 'utf8'),
  true
)
c.check(
  'S8 profile row 1.0.5 (logo pair, brand ready)',
  profiles.releases?.['quickstart/ja-essence/j6']?.['1.0.5']?.logos === 'pair',
  profiles.releases?.['quickstart/ja-essence/j6']?.['1.0.5']
)
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const q = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  const joomla = Object.entries(q).filter(([, e]) => e?.platform === 'joomla' && e?.cowork)
  c.check(`S8 ${file}: Joomla pins exist`, joomla.length > 0, joomla.length)
  for (const [id, e] of joomla)
    c.eq(`S8 ${file}: ${id} on Claude Cowork for Joomla`, e.cowork.version, '0.24.15')
  const e = q['quickstart/ja-essence/j6']
  c.eq(`S8 ${file}: JA Essence j6 version`, e?.version, '1.0.5')
  c.eq(`S8 ${file}: JA Essence j6 contract`, e?.contract, 'ja-essence/j6/1.0.5')
  c.eq(`S8 ${file}: JA Essence j6 also carries`, JSON.stringify(e?.cowork?.contractVersions), '["1.0.4"]')
  for (const part of ['webroot', 'database'])
    c.check(
      `S8 ${file}: j6 ${part} 1.0.5 with asset id`,
      String(e?.[part]?.file).includes('-1.0.5.') && Number.isSafeInteger(e?.[part]?.githubAssetId),
      e?.[part]
    )
}
c.done()
