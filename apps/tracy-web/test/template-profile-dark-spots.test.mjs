/**
 * The per-template dark spots of Joomla logos live in each version row of `template-profiles.json` (`darkSpots`), not in
 * a table of the brand engine, so the readiness check and the engine read one source (spec
 * `tasks/spec-template-customization-question-readiness.md`, Tracy task 8).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { profileTableProblems, TEMPLATE_PROFILES, templateProfileOf } from '../src/lib/template-profiles.js'
import { darkSpotsOf } from '../src/sites/brief-engines/brand-joomla-places.js'

/** The engine's own table as it stood before the move (07/10/2026), frozen here as the golden answer. */
const BEFORE = {
  'quickstart/ja-nova/j6': { footer: true },
  'quickstart/ja-phio/j6': { profiles: ['home-2'] },
  'quickstart/ja-podcast/j6': { footer: true },
  'quickstart/ja-seven/j6': { profiles: ['home-4'] },
  'quickstart/ja-spa/j6': { profiles: ['logo-light'] },
  'quickstart/ja-vega/j6': { profiles: ['default'], footer: true },
  'quickstart/ja-vital/j6': { footer: true },
  'quickstart/ja-vogue/j6': { profiles: ['home-6'] },
  'quickstart/ja-sensei/j6': { header: true }
}
const DARK_KEYS = new Set(['site_logo_dark', 'site_logo_dark_small', 'site_logo_2'])
/**
 * Rows cut after the move whose dark spots were measured on a restored site and differ from what the old table would
 * have answered for them, each with the answer that proof gave (12/10/2026, TCH #1241: JA Impact 1.0.2, JA Mood 1.0.2 and JA
 * Vega 1.0.5 are light/dark pairs whose darkSpots, with its proof, is written in the row).
 */
const PROVEN_SINCE = {
  'quickstart/ja-impact/j6@1.0.2': { profiles: ['default', 'Blog', 'home-magz'], footer: true },
  'quickstart/ja-mood/j6@1.0.2': { header: true },
  'quickstart/ja-vega/j6@1.0.5': { profiles: ['default'] },
  // their re-cuts (TCH #1375, 16/10/2026): status text only, the same row and the same proof
  'quickstart/ja-impact/j6@1.0.3': { profiles: ['default', 'Blog', 'home-magz'], footer: true },
  'quickstart/ja-mood/j6@1.0.3': { header: true },
  'quickstart/ja-vega/j6@1.0.6': { profiles: ['default'] },
  // role-variable batch 2 (16/10/2026): stylesheets only, the same row and the same proof
  'quickstart/ja-vega/j6@1.0.7': { profiles: ['default'] },
  'quickstart/ja-impact/j6@1.0.4': { profiles: ['default', 'Blog', 'home-magz'], footer: true },
  // design system dot 3 group B (20/10/2026): the role-variable re-cut, the same row and the same proof
  'quickstart/ja-mood/j6@1.0.4': { header: true },
  // TEXT-1 batch 1 (21/10/2026): stylesheets only, the same row and the same proof
  'quickstart/ja-impact/j6@1.0.5': { profiles: ['default', 'Blog', 'home-magz'], footer: true },
  // TEXT-1 batch 2 (21/10/2026): status text reads its text role, the same row and the same proof
  'quickstart/ja-vega/j6@1.0.8': { profiles: ['default'] },
  // JA Boxing's first rows (24/10/2026): measured on a stand from the 1.0.3 installer, the footer band stays dark in both modes
  'quickstart/ja-boxing/j6@1.0.1': { footer: true },
  'quickstart/ja-boxing/j6@1.0.2': { footer: true },
  'quickstart/ja-boxing/j6@1.0.3': { footer: true },
  // JA Boxing 1.0.4 (25/10/2026): alt text and the preview's ?theme= only, the same row and the same proof
  'quickstart/ja-boxing/j6@1.0.4': { footer: true },
  // JA Boxing 1.0.5 (27/10/2026): an empty footer column is not drawn, the same row and the same proof
  'quickstart/ja-boxing/j6@1.0.5': { footer: true },
  // JA Boxing 1.0.6 (27/10/2026): phone and tablet layout rules only, the same row and the same proof
  'quickstart/ja-boxing/j6@1.0.6': { footer: true },
  // JA Boxing 1.0.7 (28/10/2026): the 1.0.6 installer byte for byte with a Slot fit contract, the same row and proof
  'quickstart/ja-boxing/j6@1.0.7': { footer: true }
}

/** `darkSpotsOf` as it read the table above. */
function before(profile) {
  const all = profile?.logos === 'dark'
  const spots = PROVEN_SINCE[`${profile?.release}@${profile?.version}`] ?? BEFORE[profile?.release] ?? {}
  return {
    t4: (name, key) => all || DARK_KEYS.has(key) || (spots.profiles ?? []).includes(name),
    t3: (title) => all || spots.header === true || /\bdark\b/i.test(String(title)),
    footer: all || spots.footer === true
  }
}

const KEYS = ['site_logo', 'site_logo_small', ...DARK_KEYS]
const NAMES = ['default', 'home-2', 'home-3', 'home-4', 'home-6', 'logo-light', 'other']
const TITLES = ['Default', 'Home Dark', 'Home 2']

/** Every answer of one dark-spot test, flattened so two can be compared with deepEqual. */
const answers = (spots) => ({
  t4: NAMES.flatMap((n) => KEYS.map((k) => `${n}.${k}=${spots.t4(n, k)}`)),
  t3: TITLES.map((t) => `${t}=${spots.t3(t)}`),
  footer: spots.footer
})

test('every release row, and a patch version that falls back to it, answers the dark spots it did before the move', () => {
  let rows = 0
  for (const [tag, versions] of Object.entries(TEMPLATE_PROFILES.releases))
    for (const version of Object.keys(versions)) {
      const [maj, min, patch] = version.split('.').map(Number)
      for (const asked of [version, `${maj}.${min}.${patch + 50}`]) {
        const profile = templateProfileOf(tag, asked)
        assert.deepEqual(answers(darkSpotsOf(profile)), answers(before(profile)), `${tag}@${asked}`)
      }
      rows++
    }
  assert.ok(rows > 40, `only ${rows} rows were compared`)
  assert.deepEqual(answers(darkSpotsOf(null)), answers(before(null)))
})

test('every release of the old table is still covered by a row that says darkSpots or logos: dark', () => {
  for (const tag of Object.keys(BEFORE))
    for (const [version, row] of Object.entries(TEMPLATE_PROFILES.releases[tag] ?? {}))
      assert.ok(row.darkSpots || row.logos === 'dark', `${tag}@${version}`)
})

const joomlaRow = (darkSpots, extra = {}) => ({
  releases: {
    'quickstart/ja-x/j6': {
      '1.0.0': {
        logos: 'pair',
        brandReady: true,
        faviconReady: true,
        framework: 't4',
        profiles: ['default', 'home-2'],
        footerSlot: 'module-1.0',
        darkSpots,
        ...extra
      }
    }
  }
})
const problemsOf = (table) => profileTableProblems(table).join('\n')

test('a clean darkSpots names T4 profiles of the row, the footer, and a proof sentence', () => {
  assert.equal(problemsOf(joomlaRow({ profiles: ['home-2'], footer: true, proof: 'home-2 lum 243' })), '')
  assert.equal(problemsOf(joomlaRow({ header: true }, { framework: 't3', profiles: undefined })), '')
})

test('darkSpots must be a non-empty object of known keys, each true or a profile of the row', () => {
  assert.match(problemsOf(joomlaRow([])), /darkSpots must be an object/)
  assert.match(problemsOf(joomlaRow({ proof: 'x' })), /darkSpots names no spot/)
  assert.match(problemsOf(joomlaRow({ colour: true })), /darkSpots has unknown key "colour"/)
  assert.match(problemsOf(joomlaRow({ footer: false })), /darkSpots.footer must be true/)
  assert.match(
    problemsOf(joomlaRow({ profiles: ['home-9'] })),
    /darkSpots.profiles names home-9, not a profile of the row/
  )
  assert.match(
    problemsOf(joomlaRow({ profiles: ['home-2'], proof: 3 })),
    /darkSpots.proof must be a sentence/
  )
})

test('darkSpots holds each spot to the framework that has it, and to Joomla', () => {
  assert.match(problemsOf(joomlaRow({ header: true })), /darkSpots.header is a T3 style spot/)
  assert.match(
    problemsOf(joomlaRow({ profiles: ['home-2'] }, { framework: 't3' })),
    /darkSpots.profiles is a T4 spot/
  )
  assert.match(
    problemsOf(joomlaRow({ footer: true }, { footerSlot: undefined })),
    /darkSpots.footer .*no footerSlot/
  )
  assert.match(
    problemsOf(joomlaRow({ footer: true }, { logos: 'dark' })),
    /logos: dark already makes every spot dark/
  )
  const wp = {
    releases: { 'quickstart/ja-x/wp7': joomlaRow({ footer: true }).releases['quickstart/ja-x/j6'] }
  }
  assert.match(problemsOf(wp), /darkSpots is read on Joomla only/)
})
