/**
 * Every file a Customize your site prompt names is where the prompt says it is (12/10/2026).
 *
 * The prompt on /ops (`problem-guides.ts` `customizeOutside`) writes, for each failing rule, "fix in
 * <place>" (from the result's `owner`) and the rule's own fix text. ABOUT-3 sent Tracy Business
 * WordPress 1.3.4 to the template package on ja-products although `demoCompanyNames` lives in the
 * contract version's `.copy.json` in tch. This test reads every fix the rules can write, per rule and
 * per platform (`readiness-fix-sites.mjs`), takes each file or folder it names, and holds it to
 * reality:
 *
 *   - every path a fix names is classified below (an unknown one fails until someone says where it lives);
 *   - a path named on a platform where it does not exist must be qualified by its own platform's
 *     name in the same sentence ("EmDash: seed/personalize.json"), or the prompt points nowhere;
 *   - a tch path must have a real instance in this checkout for that platform (glob);
 *   - the owner the fix carries must send the reader to that place: a tch file to `contract` or
 *     `tracy`, a template-package file to `template` or `plugin`. A fix naming files in both places
 *     (or saying "cut a new release") may carry either.
 *
 * Rules built on the findings helper (`f.owner(...)`) choose their owner while they run, so for them
 * one of the owners they can carry must fit.
 */
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { fixSites } from './readiness-fix-sites.mjs'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const CMS_NAME = { joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' }

/**
 * Where each file a fix may name lives. `tch`: in this repository, with a glob per platform where
 * it exists. `template`: in the template package (JA templates: ja-products; Tracy's EmDash
 * templates: `packages/cms/tracy-emdash-theme-*` here, globbed). `release`: an asset the quickstart
 * build writes into the release, the template's to fix.
 */
const PLACES = [
  {
    match: /packages\/cms\/tracy-\*-quickstart\/contracts\/?/,
    place: 'tch',
    globs: {
      joomla: 'packages/cms/tracy-joomla-quickstart/contracts/*',
      wordpress: 'packages/cms/tracy-wordpress-quickstart/contracts/*'
    }
  },
  {
    match: /(^|[^\w/-])\.copy\.json|\b[\d.]+\.copy\.json/,
    place: 'tch',
    globs: {
      joomla: 'packages/cms/tracy-joomla-quickstart/contracts/**/*.copy.json',
      wordpress: 'packages/cms/tracy-wordpress-quickstart/contracts/**/*.copy.json'
    }
  },
  {
    match: /apps\/tracy-web\/src\/lib\/template-profiles\.json/,
    place: 'tch',
    globs: Object.fromEntries(
      ['joomla', 'wordpress', 'emdash'].map((p) => [p, 'apps/tracy-web/src/lib/template-profiles.json'])
    )
  },
  {
    match: /\beditions\.json/,
    place: 'tch',
    globs: {
      joomla: 'packages/cms/tracy-joomla-quickstart/contracts/**/editions.json',
      wordpress: 'packages/cms/tracy-wordpress-quickstart/contracts/**/editions.json'
    }
  },
  {
    match: /\bmultilingual-map\.json/,
    place: 'tch',
    globs: { joomla: 'packages/cms/tracy-joomla-quickstart/contracts/**/multilingual-map.json' }
  },
  {
    match: /\binventory\.json/,
    place: 'tch',
    globs: {
      joomla: 'packages/cms/tracy-joomla-quickstart/contracts/**/inventory.json',
      wordpress: 'packages/cms/tracy-wordpress-quickstart/contracts/**/inventory.json'
    }
  },
  {
    match: /\bdemo-trim-map\.json/,
    place: 'tch',
    globs: {
      joomla: 'packages/cms/tracy-joomla-quickstart/contracts/**/demo-trim-map.json',
      wordpress: 'packages/cms/tracy-wordpress-quickstart/contracts/**/demo-trim-map.json'
    }
  },
  {
    match: /(?:seed\/)?personalize\.json/,
    place: 'template',
    globs: { emdash: 'packages/cms/tracy-emdash-theme-*/seed/personalize.json' }
  },
  {
    match: /(?:seed\/)?site-model\.json/,
    place: 'template',
    globs: { emdash: 'packages/cms/tracy-emdash-theme-*/seed/site-model.json' }
  },
  {
    match: /\btemplate\.config\.json/,
    place: 'template',
    globs: { emdash: 'packages/cms/tracy-emdash-theme-*/template.config.json' }
  },
  { match: /\btracy_setting\.json/, place: 'release', platforms: ['joomla', 'wordpress', 'emdash'] },
  // LANG-5 EmDash: the release manifest's languages.live (not a contract manifest).
  { match: /\bmanifest\.json languages\.live/, place: 'release', platforms: ['emdash'] },
  { match: /\berror\.php/, place: 'template', platforms: ['joomla'] },
  { match: /\btemplates\/404\.html|(^|[^/\w])404\.php/, place: 'template', platforms: ['wordpress'] },
  { match: /\binc\/identity\.php/, place: 'template', platforms: ['wordpress'] },
  {
    match: /\bsrc\/lib\/link-gate\.ts/,
    place: 'template',
    globs: { emdash: 'packages/cms/tracy-emdash-theme-*/src/lib/link-gate.ts' }
  },
  {
    match: /\bsrc\/pages\/404\.astro/,
    place: 'template',
    globs: { emdash: 'packages/cms/tracy-emdash-theme-*/src/pages/404.astro' }
  },
  { match: /\.ini\b/, place: 'template', platforms: ['joomla'] }
]

/** Every path-like word of a fix text: a file with an extension, or a folder under packages/. */
const PATH_WORD =
  /(?:[\w.*<>{}-]+\/)*[\w.*<>{}-]*\.(?:json|html|php|ini|astro|tsx?|mjs|css|xml)\b(?: languages\.live)?|packages\/[\w*<>/-]+/g

const OWNERS = { tch: ['contract', 'tracy'], template: ['template', 'plugin'], release: ['template'] }

/** Files under `root` matching a glob (`*` one segment part, `**` any depth). */
function glob(pattern) {
  const re = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replaceAll('\u0000', '(?:.*/)?')}$`
  )
  const base = pattern.split(/[*]/)[0].replace(/\/[^/]*$/, '')
  const found = []
  const visit = (rel) => {
    let entries
    try {
      entries = readdirSync(path.join(ROOT, rel))
    } catch {
      return
    }
    for (const name of entries) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const child = rel ? `${rel}/${name}` : name
      if (re.test(child)) found.push(child)
      if (statSync(path.join(ROOT, child)).isDirectory()) visit(child)
    }
  }
  visit(base)
  return found
}

const placeOf = (word) => PLACES.find((p) => p.match.test(word))
const platformsOf = (place) => place.platforms ?? Object.keys(place.globs ?? {})

/** The sentence part before `index` names the CMS the word belongs to ("EmDash: …", "WordPress demo-trim-map.json"). */
function qualified(text, index, platforms) {
  const before = text.slice(Math.max(0, text.lastIndexOf('.', index - 1) + 1, index - 80), index)
  return platforms.some((p) => before.includes(CMS_NAME[p]))
}

const SITES = fixSites()

test('the reader finds the fixes of every rule on every platform it runs on', () => {
  assert.ok(SITES.length > 100, `${SITES.length} fix sites`)
  for (const id of ['ABOUT-3', 'LANG-5', 'REL-3', 'STAB-1'])
    assert.ok(
      SITES.some((s) => s.rule === id),
      id
    )
})

test('every path a fix names is classified, and every tch path exists here for its platform', () => {
  const unknown = new Set()
  const missing = new Set()
  for (const site of SITES)
    for (const m of site.fix.matchAll(PATH_WORD)) {
      const place = placeOf(m[0])
      if (!place) unknown.add(`${site.rule} ${site.file}:${site.line}: ${m[0]}`)
      else if (place.globs?.[site.platform] && glob(place.globs[site.platform]).length === 0)
        missing.add(`${place.globs[site.platform]} (${site.rule} on ${site.platform})`)
    }
  assert.deepEqual([...unknown], [], 'classify these paths in PLACES (where does the file live?)')
  assert.deepEqual([...missing], [], 'no instance of these paths exists in this checkout')
})

test('a fix names only files that exist on its platform, unless it says which CMS they belong to', () => {
  const wrong = new Set()
  for (const site of SITES)
    for (const m of site.fix.matchAll(PATH_WORD)) {
      const place = placeOf(m[0])
      if (!place) continue
      const where = platformsOf(place)
      if (where.includes(site.platform) || qualified(site.fix, m.index, where)) continue
      wrong.add(
        `${site.rule} ${site.file}:${site.line} on ${site.platform}: ${m[0]} exists only on ${where.join(', ')}`
      )
    }
  assert.deepEqual([...wrong], [])
})

test('the place a fix is sent to is where the files it names live', () => {
  // One site = one (rule, object, platform, assignment) and owner; group the owners of one fix.
  const groups = new Map()
  for (const s of SITES) {
    const key = `${s.rule}|${s.file}:${s.line}|${s.platform}|${s.fix}`
    if (!groups.has(key)) groups.set(key, { ...s, owners: new Set() })
    groups.get(key).owners.add(s.owner)
  }
  const wrong = []
  for (const g of groups.values()) {
    const places = new Set()
    for (const m of g.fix.matchAll(PATH_WORD)) {
      const place = placeOf(m[0])
      if (place && platformsOf(place).includes(g.platform)) places.add(place.place)
    }
    if (places.size === 0) continue
    const allowed = new Set([...places].flatMap((p) => OWNERS[p]))
    if (/cut a new release|release it again/i.test(g.fix)) allowed.add('template')
    const owners = [...g.owners]
    // A findings rule picks among several owners while it runs: one of them must fit.
    const fits = owners.length > 1 ? owners.some((o) => allowed.has(o)) : allowed.has(owners[0])
    if (!fits)
      wrong.push(
        `${g.rule} ${g.file}:${g.line} on ${g.platform}: owner ${owners.join('/')} but the fix names ${[...places].join(' + ')} files: ${g.fix.slice(0, 140)}`
      )
  }
  assert.deepEqual(wrong, [])
})

/**
 * The prompt on /ops carries one release, so its fixes speak of that release's CMS only (12/10/2026:
 * WordPress prompts told the admin to use "T4 site_logo_dark", "EmDash brand.logoDark" and "an
 * EmDash copy rule"). A word of another CMS is noise at best and a wrong place at worst.
 */
test('a fix speaks of its own CMS only', () => {
  const OTHER = {
    joomla: /\b(?:WordPress|EmDash)\b|\bwp_|\.astro\b|seed\//,
    wordpress: /\b(?:Joomla|EmDash|T4|T3)\b|\.astro\b|seed\/|\.ini\b|error\.php/,
    emdash: /\b(?:Joomla|WordPress|T4|T3)\b|\bwp_|\.php\b|\.ini\b|contract slot|re-capture the contract/
  }
  const wrong = new Set()
  for (const site of SITES) {
    const hit = OTHER[site.platform]?.exec(site.fix)
    if (hit) wrong.add(`${site.rule} on ${site.platform} names "${hit[0]}": ${site.fix.slice(0, 160)}`)
  }
  assert.deepEqual([...wrong], [])
})

/**
 * A command a fix tells the admin to run must exist in the tools the admin has. `tracy-dev
 * site-pages` is only on the draft branch feat/site-pages-file of TracyHQ/tracy-template-dev (PR #1,
 * not merged), and the released tracy-dev 0.7.1 answers it with "unknown command" (measured
 * 12/10/2026), so a fix that writes the pages file names the branch and the script it runs.
 */
test('no fix sends the admin to a tracy-dev command the released tracy-dev lacks', () => {
  const wrong = SITES.filter((s) => /tracy-dev site-pages/.test(s.fix)).map(
    (s) => `${s.rule} ${s.file}:${s.line} on ${s.platform}`
  )
  assert.deepEqual(wrong, [])
})
