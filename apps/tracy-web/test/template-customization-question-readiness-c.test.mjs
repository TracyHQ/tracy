/**
 * Template Customization Question Readiness, group c rules (ABOUT-1, ABOUT-2, ABOUT-3, STAB-1,
 * STAB-2, STAB-6, STAB-7, HIDDEN-1, SHARE-1; and PAGE-5 on theme patterns, which needs a built theme
 * zip), each module called directly on a rule context.
 *
 * Fixtures (`fixtures/template-customization-question-readiness/c/`) are cut from the real release
 * assets of `JoomlArt-Products/ja-products` (09/10/2026): settings byte for byte; dumps cut to the
 * rows a rule reads; the JA Podcast installer and the JA Kinetic webroot reduced to the release's
 * own template files named in each test; the Tracy Base 1.1.2 contract as it stood before commit
 * 27e543dd6 re-captured it (from git, byte for byte). The Tracy Business EmDash source zip is built here from
 * `packages/cms/tracy-emdash-theme-business` (its package is 1.7.2, the published version).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { crc32, gzipSync } from 'node:zlib'

import { readContracts } from '../src/lib/contracts.js'
import { tarOf } from '../src/lib/tar.js'
import { releaseContent } from '../src/lib/template-customization-question-readiness/readers/release-content.js'
import { contractOf } from '../src/lib/template-customization-question-readiness/readers/quickstart-contract.js'
import { directoryReleaseSource } from '../src/lib/template-customization-question-readiness/release-source.js'
import { about1HomeHeading } from '../src/lib/template-customization-question-readiness/rules/about-1-home-heading.js'
import { about2DemoParagraphs } from '../src/lib/template-customization-question-readiness/rules/about-2-demo-paragraphs.js'
import { about3DemoCompanyName } from '../src/lib/template-customization-question-readiness/rules/about-3-demo-company-name.js'
import { page5ButtonsLeadSomewhere } from '../src/lib/template-customization-question-readiness/rules/page-5-buttons-lead-somewhere.js'
import { hidden1SystemPages } from '../src/lib/template-customization-question-readiness/rules/hidden-1-system-pages.js'
import { share1LinkPreview } from '../src/lib/template-customization-question-readiness/rules/share-1-link-preview.js'
import { stab1OneBuild } from '../src/lib/template-customization-question-readiness/rules/stab-1-one-build.js'
import { stab2TechnicalErrors } from '../src/lib/template-customization-question-readiness/rules/stab-2-technical-errors.js'
import { stab6LockMatchesRelease } from '../src/lib/template-customization-question-readiness/rules/stab-6-lock-matches-release.js'
import { stab7MachineText } from '../src/lib/template-customization-question-readiness/rules/stab-7-machine-text.js'
import {
  declaredCopyOwner,
  NO_CONTRACT_FIX
} from '../src/lib/template-customization-question-readiness/readers/quickstart-contract.js'
import {
  acmStrings,
  isProse,
  isSettingField
} from '../src/lib/template-customization-question-readiness/readers/joomla-row-text.js'
import { contextOf as fixtureContext, dumpOf } from './template-customization-question-readiness-fixtures.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures', 'template-customization-question-readiness')
const C = path.join(FIXTURES, 'c')
const BUSINESS_THEME = path.join(HERE, '..', '..', '..', 'packages', 'cms', 'tracy-emdash-theme-business')
const CMS = { joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' }

/** A stored (uncompressed) zip of `files` (path -> text or Buffer), enough for the readers. */
function zipOf(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
    const nameBytes = Buffer.from(name)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data)
    centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

/** A release source serving `extra` (name -> Buffer or text) over a fixture folder. */
function sourceOf(dir, tag, extra = {}) {
  const base = directoryReleaseSource(dir, { tag })
  return {
    ...base,
    names: async () => [...new Set([...(await base.names()), ...Object.keys(extra)])].sort(),
    read: async (name) => (name in extra ? Buffer.from(extra[name]) : base.read(name))
  }
}

/**
 * Plugin evidence (`collectCoworkEvidence`) saying the plugin a new site gets carries `contract`
 * whole, the way `customize-readiness.js` hands it to the check.
 */
const carriedBy = (contract, more = {}) => ({
  state: 'carries',
  checkedAt: '2026-10-25T10:00:00.000Z',
  contract,
  expected: {},
  source: 'release',
  plugins: [
    {
      role: 'release',
      version: '9.9.9',
      file: 'claude-cowork-9.9.9.zip',
      digest: 'd'.repeat(64),
      state: 'carries',
      problems: []
    }
  ],
  ...more
})

/**
 * A rule context, built the way `checkRelease` builds it. Unless a test says otherwise, the plugin
 * evidence says the plugin carries the contract that seals the release (STAB-1 (3)).
 */
function contextOf(dir, tag, more = {}) {
  const context = contextWithoutEvidence(dir, tag, more)
  if (!('coworkEvidence' in more)) {
    const sealed = contractOf(context)
    if (sealed) context.coworkEvidence = carriedBy(sealed.id)
  }
  return context
}

function contextWithoutEvidence(dir, tag, { extra = {}, setting: patch = {}, ...more } = {}) {
  const setting = { ...JSON.parse(readFileSync(path.join(dir, 'tracy_setting.json'), 'utf8')), ...patch }
  const source = sourceOf(dir, tag, extra)
  return {
    release: {
      template: setting.template ?? null,
      platform: setting.platform,
      version: setting.version,
      tag,
      name: `${setting.label} ${CMS[setting.platform]} ${setting.version}`
    },
    setting,
    source,
    content: releaseContent(source, setting),
    ...more
  }
}

const run = async (rule, context) => ({
  id: rule.id,
  owner: rule.owner,
  fix: null,
  ...(await rule.run(context))
})

/** The Tracy Business EmDash 1.7.2 source zip, from the theme package, with files replaced. */
function businessSource(replace = {}) {
  const files = {}
  for (const file of [
    'template.config.json',
    'seed/personalize.json',
    'seed/questions.json',
    'seed/seed.json',
    'src/views/Home.astro',
    'src/layouts/Base.astro',
    'src/pages/404.astro',
    'tools/personalize.mjs'
  ])
    files[`tracy-business/${file}`] = readFileSync(path.join(BUSINESS_THEME, file))
  for (const [file, text] of Object.entries(replace)) files[`tracy-business/${file}`] = text
  return zipOf(files)
}
const BUSINESS_ZIP = 'tracy-business-emdash-quickstart-1.7.2.zip'
const businessEmdash = (replace = {}, extra = {}) =>
  contextOf(path.join(C, 'tracy-business_emdash-0.x'), 'tracy-business/emdash-0.x', {
    extra: { [BUSINESS_ZIP]: businessSource(replace), ...extra }
  })
const personalize = () => JSON.parse(readFileSync(path.join(BUSINESS_THEME, 'seed/personalize.json'), 'utf8'))
/** seed/personalize.json as Tracy Business EmDash 1.7.2 shipped it, before 1.7.3 fixed ABOUT-2 and HIDDEN-1. */
const personalize172 = () =>
  JSON.parse(readFileSync(path.join(FIXTURES, 'tracy-business-emdash-1.7.2-personalize.json'), 'utf8'))
const businessEmdash172 = (p = personalize172()) =>
  businessEmdash({ 'seed/personalize.json': JSON.stringify(p) })

const novaWp = () => contextOf(path.join(C, 'quickstart_ja-nova_wp7'), 'quickstart/ja-nova/wp7')
const businessWp = () => contextOf(path.join(C, 'tracy-business_wp7'), 'tracy-business/wp7')
const baseWp = (more = {}) => contextOf(path.join(C, 'tracy-base_wp7'), 'tracy-base/wp7', more)
const essenceJ6 = (extra = {}) =>
  contextOf(path.join(FIXTURES, 'quickstart_ja-essence_j6'), 'quickstart/ja-essence/j6', { extra })
/** The JA Essence Joomla 1.0.2 webroot cut to the two `configuration.php` lines ABOUT-3 reads. */
const essenceJ6Webroot = (sitename = 'JA Essence') => ({
  'ja-essence-j6-webroot-1.0.2.tar.gz': gzipSync(
    tarOf([
      {
        name: 'configuration.php',
        bytes: Buffer.from(
          `<?php\nclass JConfig {\n\tpublic $sitename = '${sitename}';\n\tpublic $fromname = 'JA Essence';\n}\n`
        )
      }
    ])
  )
})
/** JA Essence WordPress 1.0.9 with its theme zip cut to `parts/footer.html` (byte for byte). */
const essenceWp = () =>
  contextOf(path.join(FIXTURES, 'quickstart_ja-essence_wp7'), 'quickstart/ja-essence/wp7', {
    extra: {
      'wp-ja-essence-1.0.9.zip': zipOf({
        'wp-ja-essence/parts/footer.html': readFileSync(
          path.join(C, 'ja-essence-wp7-1.0.9-parts-footer.html')
        )
      })
    }
  })
const podcastJ6 = () => contextOf(path.join(C, 'quickstart_ja-podcast_j6'), 'quickstart/ja-podcast/j6')
const kineticJ6 = () => contextOf(path.join(C, 'quickstart_ja-kinetic_j6'), 'quickstart/ja-kinetic/j6')
const phioJ6 = () => contextOf(path.join(C, 'quickstart_ja-phio_j6'), 'quickstart/ja-phio/j6')
/**
 * The Tracy Base 1.1.2 contract before 27e543dd6, kept as `.json.txt` so the formatter leaves its
 * bytes alone (`superseded.json` holds the sha256 of the lock's exact bytes), laid out as a profile.
 */
function OLD_BASE_CONTRACT() {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'tcqr-c-')), 'tracy-base', 'wp7', '1.1.2')
  mkdirSync(dir, { recursive: true })
  const from = path.join(C, 'contracts-tracy-base-before-recapture')
  for (const f of ['manifest', 'content-map', 'presentation-lock', 'superseded'])
    copyFileSync(path.join(from, `${f}.json.txt`), path.join(dir, `${f}.json`))
  return readContracts(path.dirname(path.dirname(path.dirname(dir))))
}

test('ABOUT-1: JA Nova WordPress 1.1.10 fails, its home heading hero.title has no slot', async () => {
  const r = await run(about1HomeHeading, novaWp())
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /named block "hero\.title", which no contract slot targets/)
  assert.equal(r.owner, 'contract')
})

test('ABOUT-1: Tracy Business WordPress 1.3.4 and EmDash 1.7.2 pass; JA Essence Joomla is live-only', async () => {
  const wp = await run(about1HomeHeading, businessWp())
  assert.equal(wp.status, 'pass', wp.message)
  assert.match(wp.message, /hero\.heading, hero\.intro/)
  const em = await run(about1HomeHeading, businessEmdash())
  assert.equal(em.status, 'pass', em.message)
  assert.match(em.message, /hero_title_a, hero_title_b, hero_text/)
  const j6 = await run(about1HomeHeading, essenceJ6())
  assert.equal(j6.status, 'live-only', j6.message)
})

test('ABOUT-2: an ACM field holding button classes is a setting, not demo prose (JA Symphony j6 module 102)', () => {
  const lock = JSON.parse(
    readFileSync(
      path.join(
        HERE,
        '..',
        '..',
        '..',
        'packages/cms/tracy-joomla-quickstart/contracts/ja-symphony/j6/1.0.1/presentation-lock.json'
      ),
      'utf8'
    )
  )
  const prose = acmStrings(lock.entities['module-102'].params).filter(
    ({ path: p, text }) => !isSettingField(p, text) && isProse(text)
  )
  const fields = new Set(prose.map(({ path: p }) => String(p[1])))
  // `event[event-btn-1]` = "btn-secondary disabled" is the class of the Sold Out button.
  assert.equal(fields.has('event[event-btn-1]'), false, [...fields].join(', '))
  // The words around it stay prose: the show names and their places.
  assert.ok(fields.has('event[event-name]'))
  assert.ok(fields.has('event[event-description]'))
  // A sentence of ordinary words is never taken for classes.
  assert.equal(isSettingField(['x', 'event[event-btn-1]'], 'Book your seat today'), false)
})

test('ABOUT-2: Tracy Business EmDash 1.7.2 fails on Investors and the legal pages, not on the kit pages', async () => {
  // As published: seed/personalize.json declares no keptText.
  const p = personalize172()
  delete p.keptText
  const r = await run(about2DemoParagraphs, businessEmdash172(p))
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /investors\/investors: \d+ \(.*lede/)
  assert.match(r.message, /pages\/terms/)
  assert.match(r.message, /pages\/privacy/)
  assert.doesNotMatch(r.message, /kit-/)
})

test('ABOUT-2: the legal pages EmDash declares in keptText are not counted; Investors still fails', async () => {
  const r = await run(about2DemoParagraphs, businessEmdash172())
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /investors\/investors/)
  assert.doesNotMatch(r.message, /pages\/(terms|privacy)/)
  assert.ok(r.details.some((d) => /declares 2 kept-on-purpose ids \(keptText\); 4 demo text pieces/.test(d)))
})

test('ABOUT-2: JA Essence WordPress 1.0.9 keeps its tokenized copyright line; the other footer texts fail', async () => {
  const r = await run(about2DemoParagraphs, essenceWp())
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /3 demo text pieces nothing rewrites; part footer: 3 \(/)
  for (const name of ['footer.tagline', 'footer.cta', 'footer.note'])
    assert.match(r.message, new RegExp(name))
  assert.doesNotMatch(r.message, /footer\.copyright/)
  assert.ok(r.details.some((d) => /1 demo text pieces sit in them/.test(d)))
})

test('ABOUT-2: JA Nova WordPress fails on its named home blocks; JA Essence Joomla passes', async () => {
  const nova = await run(about2DemoParagraphs, novaWp())
  assert.equal(nova.status, 'fail', nova.message)
  assert.ok(nova.details.some((d) => d.startsWith('page home hero.title')))
  const essence = await run(about2DemoParagraphs, essenceJ6())
  assert.equal(essence.status, 'pass', essence.message)
  assert.ok(essence.details.some((d) => /shown module titles have no slot/.test(d)))
})

test('ABOUT-2: JA Essence Joomla fails when a menu item names a category by another label (categories, 12/10/2026)', async () => {
  const dump = (/** @type {string} */ label) => ({
    'ja-essence-j6-database-1.0.2.sql.gz': dumpOf({
      jd_menu: [
        {
          id: 154,
          menutype: 'category',
          title: label,
          link: 'index.php?option=com_content&view=category&layout=ja_essence:news&id=10',
          type: 'component',
          published: 1,
          params: '{}',
          client_id: 0
        }
      ],
      jd_categories: [{ id: 10, title: 'Design', extension: 'com_content', published: 1 }]
    })
  })
  const variant = await run(about2DemoParagraphs, essenceJ6(dump('Design news')))
  assert.equal(variant.status, 'fail', variant.message)
  assert.match(variant.message, /"Design news" → category 10 "Design"/)
  const exact = await run(about2DemoParagraphs, essenceJ6(dump('Design')))
  assert.equal(exact.status, 'pass', exact.message)
})

test('ABOUT-3: the golden three pass on their declared demoCompanyNames', async () => {
  const em = await run(about3DemoCompanyName, businessEmdash())
  assert.equal(em.status, 'pass', em.message)
  const wp = await run(about3DemoCompanyName, essenceWp())
  assert.equal(wp.status, 'pass', wp.message)
  // The fixture's dump is cut and carries no blogname; the release-cache run reads "JA Essence".
  assert.match(wp.details[0], /1\.0\.9\.copy\.json declares JA Essence; name slots site\.name/)
  const j6 = await run(about3DemoCompanyName, essenceJ6(essenceJ6Webroot()))
  assert.equal(j6.status, 'pass', j6.message)
  // Without the webroot the demo's sitename cannot be read.
  assert.equal((await run(about3DemoCompanyName, essenceJ6())).status, 'live-only')
})

test('ABOUT-3: the fix goes where demoCompanyNames lives, the contract in tch on Joomla and WordPress, the template on EmDash', async () => {
  // Tracy Business WordPress 1.3.4 on dev, 12/10/2026: the prompt sent the fix to ja-products, but
  // the list is in packages/cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.3.4.copy.json.
  const wp = await run(about3DemoCompanyName, businessWp())
  assert.deepEqual([wp.status, wp.owner], ['fail', 'contract'])
  const j6 = await run(about3DemoCompanyName, essenceJ6(essenceJ6Webroot('Essence Studio')))
  assert.deepEqual([j6.status, j6.owner], ['fail', 'contract'])
  const { demoCompanyNames: _gone, ...without } = personalize()
  const em = await run(
    about3DemoCompanyName,
    businessEmdash({ 'seed/personalize.json': JSON.stringify(without) })
  )
  assert.deepEqual([em.status, em.owner], ['fail', 'template'], em.message)
  // No contract at all: capturing one is the contract's fix, whatever the rule's default owner.
  const unsealed = await run(about3DemoCompanyName, { ...businessWp(), contracts: new Map() })
  assert.deepEqual([unsealed.status, unsealed.owner, unsealed.fix], ['fail', 'contract', NO_CONTRACT_FIX])
})

test('where each declared-copy and no-contract fix goes, per platform', async () => {
  assert.deepEqual(
    ['joomla', 'wordpress', 'emdash'].map((p) => declaredCopyOwner(p)),
    ['contract', 'contract', 'template']
  )
  const unsealed = { ...businessWp(), contracts: new Map() }
  const asked = []
  for (const rule of [
    about2DemoParagraphs,
    about3DemoCompanyName,
    hidden1SystemPages,
    stab2TechnicalErrors,
    stab7MachineText
  ]) {
    const r = await run(rule, unsealed)
    if (r.fix !== NO_CONTRACT_FIX) continue
    asked.push(rule.id)
    assert.equal(r.owner, 'contract', `${rule.id}: no contract`)
  }
  assert.ok(asked.length >= 2, `rules asking for a contract: ${asked.join(', ')}`)
})

test('ABOUT-3: a demo name the declared list misses fails, and so does a contract declaring none', async () => {
  const j6 = await run(about3DemoCompanyName, essenceJ6(essenceJ6Webroot('Essence Studio')))
  assert.equal(j6.status, 'fail')
  assert.match(
    j6.message,
    /the demo name "Essence Studio" \(configuration\.php\) is not in 1\.0\.2\.copy\.json/
  )
  const wp = await run(about3DemoCompanyName, businessWp())
  assert.equal(wp.status, 'fail')
  assert.match(wp.message, /the contract version's 1\.3\.4\.copy\.json declares no demoCompanyNames/)
  const podcast = await run(about3DemoCompanyName, podcastJ6())
  assert.equal(podcast.status, 'fail')
  assert.match(podcast.message, /\.copy\.json declares no demoCompanyNames/)
})

test('ABOUT-3: EmDash fails without demoCompanyNames, on a demo title outside it, and on a name no replace renames', async () => {
  const p = personalize()
  delete p.demoCompanyNames
  const none = await run(
    about3DemoCompanyName,
    businessEmdash({ 'seed/personalize.json': JSON.stringify(p) })
  )
  assert.match(none.message, /seed\/personalize\.json declares no demoCompanyNames/)
  const q = personalize()
  q.demoCompanyNames = ['NORTHGATE']
  const short = await run(
    about3DemoCompanyName,
    businessEmdash({ 'seed/personalize.json': JSON.stringify(q) })
  )
  assert.match(
    short.message,
    /the demo name "Northgate Industrial" is not in seed\/personalize\.json demoCompanyNames/
  )
  const r = personalize()
  r.replace = r.replace.filter((x) => !x.find.startsWith('Northgate'))
  const unrenamed = await run(
    about3DemoCompanyName,
    businessEmdash({ 'seed/personalize.json': JSON.stringify(r) })
  )
  assert.equal(unrenamed.status, 'fail')
  assert.match(
    unrenamed.message,
    /the demo name "Northgate Industrial" has no seed\/personalize\.json replace rule renaming it/
  )
})

test('STAB-7: JA Podcast Joomla 1.0.1 fails, TPL_CONTACT_WEBSITE is in no .ini file', async () => {
  const r = await run(stab7MachineText, podcastJ6())
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /TPL_CONTACT_WEBSITE \(html\/com_contact\/contact\/default_address\.php\)/)
})

/**
 * JA Smallbiz j6 1.0.1 installer, cut to helper.php (its relative-time function, as shipped), one
 * layout and the language file. `layout` is what the layout prints.
 */
function smallbizJ6(/** @type {string} */ ini, layout = "<?php echo JText::_('TPL_READ_MORE'); ?>") {
  const helper = [
    '<?php',
    'class JATemplateHelper {',
    '  public static function relTime($timespan, $granularity = 1) {',
    '    foreach ($units as $key => $value) {',
    "        $output .= ($output ? ' ' : '') . JText::sprintf('TPL_RT_' . $key . (floor($interval / $value) != 1 ? 'S' : ''), floor($interval / $value));",
    '    }',
    "    return $output ? JText::sprintf($future ? 'TPL_RT_FUTURE' : 'TPL_RT_PAST', $output) : JText::_('TPL_RT_NOW');",
    '  }',
    '}'
  ].join('\n')
  return fixtureContext(
    {
      platform: 'joomla',
      label: 'JA Smallbiz',
      version: '1.0.1',
      template: 'ja_smallbiz',
      install: { installer: { file: 'installer.zip' } }
    },
    {
      'installer.zip': zipOf({
        'templates/ja_smallbiz/helper.php': helper,
        'templates/ja_smallbiz/html/com_content/article/default.php': layout,
        'language/en-GB/en-GB.tpl_ja_smallbiz.ini': ini
      })
    },
    'quickstart/ja-smallbiz/j6'
  )
}

test('STAB-7: a TPL_ key built at run time (TPL_RT_ . $key) is a prefix the .ini must start, not a key', async () => {
  const readMore = 'TPL_READ_MORE="Read more"\n'
  // As shipped: no layout calls relTime(), so its keys never print (noted, not failed).
  const shipped = await run(stab7MachineText, smallbizJ6(readMore))
  assert.doesNotMatch(shipped.message, /TPL_RT_/, shipped.message)
  assert.ok(
    shipped.details?.some((d) => /relTime \(helper\.php\)/.test(d)),
    String(shipped.details)
  )
  // A layout that calls it needs every key: the literal ones, both ternary branches, and the prefix.
  const calls = '<?php echo JATemplateHelper::relTime($item->publish_up); ?>'
  const bare = await run(stab7MachineText, smallbizJ6(readMore, calls))
  for (const key of ['TPL_RT_NOW', 'TPL_RT_FUTURE', 'TPL_RT_PAST'])
    assert.match(bare.message, new RegExp(`the key ${key} \\(helper\\.php\\) is in no \\.ini file`))
  assert.match(bare.message, /the key prefix TPL_RT_ \(helper\.php\) starts no key of any \.ini file/)
  assert.doesNotMatch(bare.message, /the key TPL_RT_ \(/)
  // JA Directory's language file defines them all.
  const directory = `${readMore}TPL_RT_FUTURE="in %s"\nTPL_RT_PAST="%s ago"\nTPL_RT_NOW="now"\nTPL_RT_DAY="%d day"\nTPL_RT_DAYS="%d days"\n`
  const full = await run(stab7MachineText, smallbizJ6(directory, calls))
  assert.doesNotMatch(full.message, /TPL_RT_/, full.message)
  // A genuinely undefined key is still caught.
  const missing = await run(stab7MachineText, smallbizJ6('X="y"\n'))
  assert.match(
    missing.message,
    /the key TPL_READ_MORE \(html\/com_content\/article\/default\.php\) is in no \.ini file/
  )
})

test('STAB-7: Tracy Business EmDash passes; an optional fact with no "empty" and no "keep-demo" fails', async () => {
  assert.equal((await run(stab7MachineText, businessEmdash())).status, 'pass')
  const p = personalize()
  const hotline = p.identity.find((r) => r.field === 'hotline')
  assert.equal(
    hotline.unanswered,
    'keep-demo',
    'the demo hotline stays as a placeholder (TCH #1013, 11/10/2026)'
  )
  delete hotline.empty
  delete hotline.unanswered
  const r = await run(stab7MachineText, businessEmdash({ 'seed/personalize.json': JSON.stringify(p) }))
  assert.equal(r.status, 'fail')
  assert.match(
    r.message,
    /site\.hotline writes an optional fact with no "empty" value and no "unanswered": "keep-demo"/
  )
})

test('STAB-2: JA Podcast fails on id-article, JA Essence on auto_time; real counts are not machine values', async () => {
  const pod = await run(stab2TechnicalErrors, podcastJ6())
  assert.equal(pod.status, 'fail', pod.message)
  assert.match(pod.message, /module-114\.3 \(the field features-intro\[id-article\] holds the number 46\)/)
  // Only the slots fail: the contract is what changes, and the fix says nothing about error.php
  // (JA Resort and JA Phio on dev, 12/10/2026, were sent to the template for a contract slot).
  if (!/error\.php/.test(pod.message)) {
    assert.equal(pod.owner, 'contract')
    assert.doesNotMatch(pod.fix, /error\.php|new release/)
  }
  const essence = await run(stab2TechnicalErrors, essenceJ6())
  assert.equal(essence.status, 'fail')
  assert.match(essence.message, /basic\[auto_time\] holds the number 2500/)
  assert.equal((await run(stab2TechnicalErrors, businessEmdash())).status, 'pass')
})

test('STAB-2: an error.php using a T3 constant unguarded fails, one on JPATH_THEMES passes', async () => {
  // Illustrative error.php bodies of the two shapes measured on JA Social II 1.0.0 and 1.0.1.
  const social = (php) =>
    contextOf(path.join(C, 'quickstart_ja-social-ii_j6'), 'quickstart/ja-social-ii/j6', {
      setting: {
        install: { installer: { file: 'ja-social-ii-j6-quickstart-1.0.1.zip', sha256: '0'.repeat(64) } }
      },
      extra: { 'ja-social-ii-j6-quickstart-1.0.1.zip': zipOf({ 'templates/ja_social_ii/error.php': php }) }
    })
  const t3 = await run(stab2TechnicalErrors, social("<?php\ninclude T3_TEMPLATE_PATH . '/error-page.php';\n"))
  assert.equal(t3.status, 'fail')
  assert.match(t3.message, /error\.php uses a T3 constant with no defined\(\) guard/)
  if (!/machine values/.test(t3.message)) {
    assert.equal(t3.owner ?? 'template', 'template')
    assert.doesNotMatch(t3.fix, /contract slots/)
  }
  const t4 = await run(
    stab2TechnicalErrors,
    social("<?php\ninclude JPATH_THEMES . '/ja_social_ii/error-page.php';\n")
  )
  assert.equal(t4.status, 'pass', t4.message)
})

/**
 * A gzipped ustar of directories and files at given modes, enough for the webroot mode reader:
 * `[name, mode]`, a name ending in `/` is a directory.
 */
function modeTar(/** @type {[string, number][]} */ members) {
  const blocks = []
  for (const [name, mode] of members) {
    const dir = name.endsWith('/')
    const body = dir ? Buffer.alloc(0) : Buffer.from('<?php\n')
    const h = Buffer.alloc(512)
    const octal = (/** @type {number} */ v, /** @type {number} */ w) =>
      `${v.toString(8).padStart(w - 1, '0')}\0`
    h.write(name, 0, 100, 'utf8')
    h.write(octal(mode, 8), 100, 8, 'ascii')
    h.write(octal(0, 8), 108, 8, 'ascii')
    h.write(octal(0, 8), 116, 8, 'ascii')
    h.write(octal(body.length, 12), 124, 12, 'ascii')
    h.write(octal(1577836800, 12), 136, 12, 'ascii')
    h.write(dir ? '5' : '0', 156, 1, 'ascii')
    h.write('ustar\u000000', 257, 8, 'ascii')
    h.fill(' ', 148, 156)
    let sum = 0
    for (const b of h) sum += b
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
    blocks.push(h, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}
const BASE_WEBROOT = 'tracy-base-wp7-webroot-1.1.2.tar.gz'

test('STAB-1: a webroot archive with 0600/0700 members fails, owned by the template maker (12/10/2026)', async () => {
  // The batch-1 WordPress packs, restored under umask 077 and packed as they were: provision keeps
  // the modes, and wp-cli in the site's container could not read wp-load.php.
  const bad = modeTar([
    ['./', 0o700],
    ['./wp-load.php', 0o600],
    ['./wp-content/', 0o755],
    ['./wp-content/index.php', 0o644]
  ])
  const r = await run(stab1OneBuild, baseWp({ extra: { [BASE_WEBROOT]: bad } }))
  assert.equal(r.status, 'fail', r.message)
  assert.equal(r.owner, 'template')
  assert.match(
    r.message,
    /holds 2 of 4 members the site cannot read as unpacked \(1 directory 0700, 1 file 0600; first \.\/\)/
  )
  assert.match(r.fix, /every file 0644 and every directory 0755/)
})

test('STAB-1: a webroot archive at 0644/0755 (and an executable file at 0755) passes', async () => {
  const good = modeTar([
    ['./', 0o755],
    ['./wp-load.php', 0o644],
    ['./wp-content/', 0o755],
    ['./wp-content/bin.sh', 0o755]
  ])
  const r = await run(stab1OneBuild, baseWp({ extra: { [BASE_WEBROOT]: good } }))
  assert.equal(r.status, 'pass', r.message)
  assert.ok(!r.details.some((d) => /file modes are not checked/.test(d)), r.details.join('\n'))
})

test('STAB-1: a copy of the release without its webroot says the modes were not checked', async () => {
  const r = await run(stab1OneBuild, baseWp())
  assert.ok(
    r.details.some((d) => d === `${BASE_WEBROOT} is not carried here: its file modes are not checked`),
    r.details.join('\n')
  )
})

test('webrootModes: group-writable and world-writable members are refused too', async () => {
  const { webrootModes } = await import(
    '../src/lib/template-customization-question-readiness/readers/webroot-modes.js'
  )
  const r = webrootModes(
    modeTar([
      ['./', 0o775],
      ['./a.php', 0o664],
      ['./b.php', 0o666],
      ['./c.php', 0o644]
    ])
  )
  assert.equal(r.members, 4)
  assert.deepEqual(
    r.wrong.map((w) => `${w.name} ${w.mode}`),
    ['./ 0775', './a.php 0664', './b.php 0666']
  )
})

test('STAB-1: Tracy Base WordPress 1.1.2 passes now and failed on the contract carried from 1.0.0', async () => {
  const now = await run(stab1OneBuild, baseWp())
  assert.equal(now.status, 'pass', now.message)
  const before = await run(stab1OneBuild, baseWp({ contracts: OLD_BASE_CONTRACT() }))
  assert.equal(before.status, 'fail')
  assert.match(before.message, /the option tracy_contact_phone is not in the dump/)
  assert.ok(before.details.some((d) => /the syncedPattern contact-information is not in the dump/.test(d)))
})

const BASE_ID = 'tracy-base/wp7/1.1.2'

test('STAB-1: a plugin that does not carry the contract at all fails, owned by the plugin', async () => {
  // JA Essence WordPress 1.0.10 on 09/10/2026: claude-cowork 0.18.5 carried 1.0.3 and 1.0.9, not 1.0.10.
  const r = await run(
    stab1OneBuild,
    baseWp({
      coworkEvidence: carriedBy(BASE_ID, {
        state: 'lacks',
        plugins: [
          {
            role: 'release',
            version: null,
            file: 'claude-cowork-0.18.5.zip',
            digest: 'd'.repeat(64),
            state: 'lacks',
            problems: [
              `Claude Cowork claude-cowork-0.18.5.zip (release) does not carry the contract ${BASE_ID}`
            ]
          }
        ]
      })
    })
  )
  assert.equal(r.status, 'fail', r.message)
  assert.equal(r.owner, 'plugin')
  assert.match(
    r.message,
    /claude-cowork-0\.18\.5\.zip \(release\) does not carry the contract tracy-base\/wp7\/1\.1\.2/
  )
  assert.match(r.fix, /the plugin release must carry this contract/i)
})

test('STAB-1: a plugin that carries the contract id but not its showcase map fails (JA Boxing 1.0.3, 25/10/2026)', async () => {
  // Claude Cowork for Joomla 0.24.62 listed ja-boxing/j6/1.0.3 and published its asset without
  // showcase-nav-map.json: every new site kept the demo menu while the old check said "carries".
  const lacks = carriedBy(BASE_ID, {
    state: 'lacks',
    expected: {
      'manifest.json': 'a'.repeat(64),
      'content-map.json': 'b'.repeat(64),
      'showcase-nav-map.json': 'c'.repeat(64)
    },
    source: 'fleet',
    plugins: [
      {
        role: 'latest',
        version: '0.24.62',
        file: 'pkg_claudecowork-0.24.62.zip',
        digest: 'd'.repeat(64),
        state: 'lacks',
        problems: ['ja-boxing--j6--1.0.3.zip of Claude Cowork 0.24.62 has no showcase-nav-map.json']
      },
      {
        role: 'floor',
        version: '0.24.63',
        file: 'pkg_claudecowork-0.24.63.zip',
        digest: 'e'.repeat(64),
        state: 'carries',
        problems: []
      }
    ]
  })
  const r = await run(stab1OneBuild, baseWp({ coworkEvidence: lacks }))
  assert.equal(r.status, 'fail', r.message)
  assert.equal(r.owner, 'plugin')
  assert.match(r.message, /has no showcase-nav-map\.json/)
})

test('STAB-1: a quickstarts.json pin that lists the contract files does not stand for the plugin bytes', async () => {
  // The pin's hand-written contractFiles once made STAB-1 say "carries" without opening the zip.
  const pins = {
    'tracy-base/wp7': {
      version: '1.1.2',
      cowork: {
        file: 'claude-cowork-9.9.9.zip',
        sha256: 'f'.repeat(64),
        bytes: 1,
        url: 'https://example.test/c.zip',
        overridesRelease: true,
        contractFiles: {}
      }
    }
  }
  const lacks = carriedBy(BASE_ID, {
    state: 'lacks',
    source: 'pin',
    plugins: [
      {
        role: 'pin',
        version: '9.9.9',
        file: 'claude-cowork-9.9.9.zip',
        digest: 'f'.repeat(64),
        state: 'lacks',
        problems: ['Claude Cowork 9.9.9 (pin) has no showcase-nav-map.json']
      }
    ]
  })
  const r = await run(stab1OneBuild, baseWp({ pins, coworkEvidence: lacks }))
  assert.equal(r.status, 'fail', r.message)
  assert.equal(r.owner, 'plugin')
})

test('STAB-1: a plugin that carries the contract whole passes, and says when it was read', async () => {
  const r = await run(stab1OneBuild, baseWp())
  assert.equal(r.status, 'pass', r.message)
  assert.ok(
    r.details.some((d) => /carries tracy-base\/wp7\/1\.1\.2 \(read 2026-10-25T10:00:00\.000Z\)/.test(d)),
    r.details.join('\n')
  )
})

test('STAB-1: with no plugin evidence the rule is not checked, never a pass', async () => {
  // Before 25/10/2026 a plugin nobody could read ("cannot be known statically") passed.
  const r = await run(stab1OneBuild, baseWp({ pins: {}, coworkEvidence: null }))
  assert.equal(r.status, 'not-checked', r.message)
  assert.match(r.message, /was not read for this check/)
  assert.match(r.fix, /Publish waits/)
})

test('STAB-1: plugin evidence that could not be read, or read for another contract, is not checked', async () => {
  const unread = carriedBy(BASE_ID, {
    state: 'not-checked',
    plugins: [
      {
        role: 'latest',
        version: '0.18.40',
        file: 'claude-cowork-0.18.40.zip',
        digest: null,
        state: 'not-checked',
        problems: [],
        reason: 'https://github.com/x answered HTTP 404'
      }
    ]
  })
  const r = await run(stab1OneBuild, baseWp({ coworkEvidence: unread }))
  assert.equal(r.status, 'not-checked', r.message)
  assert.match(r.message, /answered HTTP 404/)
  const other = await run(stab1OneBuild, baseWp({ coworkEvidence: carriedBy('tracy-base/wp7/1.1.1') }))
  assert.equal(other.status, 'not-checked', other.message)
})

test('STAB-1: a release failure still fails when the plugin could not be read', async () => {
  const r = await run(stab1OneBuild, baseWp({ contracts: OLD_BASE_CONTRACT(), coworkEvidence: null }))
  assert.equal(r.status, 'fail', r.message)
})

test('STAB-1: Tracy Business EmDash passes, and fails without tracy_site_question.json', async () => {
  assert.equal((await run(stab1OneBuild, businessEmdash())).status, 'pass')
  const ctx = businessEmdash()
  const names = ctx.source.names
  ctx.source.names = async () => (await names()).filter((n) => n !== 'tracy_site_question.json')
  const r = await run(stab1OneBuild, ctx)
  assert.equal(r.status, 'fail')
  assert.match(r.message, /no tracy_site_question\.json/)
})

test("STAB-1: a version with no profile row of its own is Tracy's to fix, not the contract's", async () => {
  // Tracy Apple Joomla 1.3.0 on dev, 12/10/2026: the only failure was the missing row, yet the
  // prompt sent the admin to capture a contract and "only then publish" a release already live.
  const ctx = businessEmdash()
  ctx.release = { ...ctx.release, version: '9.9.9' }
  const r = await run(stab1OneBuild, ctx)
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /template-profiles\.json has no row for tracy-business\/emdash-0\.x 9\.9\.9/)
  assert.equal(r.owner, 'tracy')
  assert.match(
    r.fix,
    /^Add the exact row for this version to apps\/tracy-web\/src\/lib\/template-profiles\.json/
  )
  assert.doesNotMatch(r.fix, /contract|publish the release/)
})

test('STAB-6: Tracy Base WordPress 1.1.2 lock matches its dump now, and did not before the re-capture', async () => {
  const now = await run(stab6LockMatchesRelease, baseWp())
  assert.equal(now.status, 'live-only', now.message)
  assert.match(now.message, /webroot is not carried/)
  const before = await run(stab6LockMatchesRelease, baseWp({ contracts: OLD_BASE_CONTRACT() }))
  assert.equal(before.status, 'fail', before.message)
  assert.match(before.message, /7 contract entities have no entry in the lock/)
  assert.doesNotMatch(before.message, /superseded/)
})

/**
 * The Tracy Base 1.1.2 contract with its lock's `files` set to the theme files given (and no
 * superseded.json, whose hash names the published lock), laid out as a profile.
 */
function baseContractLocking(/** @type {Record<string, string>} */ theme) {
  const root = mkdtempSync(path.join(tmpdir(), 'tcqr-c-'))
  const dir = path.join(root, 'tracy-base', 'wp7', '1.1.2')
  mkdirSync(dir, { recursive: true })
  const from = path.join(
    HERE,
    '..',
    '..',
    '..',
    'packages/cms/tracy-wordpress-quickstart/contracts/tracy-base/wp7/1.1.2'
  )
  for (const f of ['manifest.json', 'content-map.json']) copyFileSync(path.join(from, f), path.join(dir, f))
  const lock = JSON.parse(readFileSync(path.join(from, 'presentation-lock.json'), 'utf8'))
  lock.fileRoots = ['wp-content/themes/tracy-base']
  lock.files = Object.fromEntries(
    Object.entries(theme).map(([f, t]) => [
      `wp-content/themes/tracy-base/${f}`,
      createHash('sha256').update(t).digest('hex')
    ])
  )
  writeFileSync(path.join(dir, 'presentation-lock.json'), JSON.stringify(lock))
  return readContracts(root)
}

test('STAB-6 on WordPress reads the lock against the theme zip when the webroot is not carried', async () => {
  const theme = { 'style.css': '/* Theme Name: Tracy Base */', 'functions.php': '<?php\n' }
  const contracts = baseContractLocking(theme)
  const zip = (/** @type {Record<string, string>} */ files) => ({
    // The server reads the theme zip, named after the THEME's version (Tracy Base 1.1.3 ships 1.1.6).
    'tracy-base-1.1.6.zip': zipOf(
      Object.fromEntries(Object.entries(files).map(([f, t]) => [`tracy-base/${f}`, t]))
    )
  })
  const same = await run(stab6LockMatchesRelease, baseWp({ contracts, extra: zip(theme) }))
  assert.equal(same.status, 'pass', same.message)
  assert.ok(
    same.details.some((d) => /compared with the theme zip tracy-base-1\.1\.6\.zip/.test(d)),
    same.details.join(' | ')
  )
  // A zip that is not the locked cut leaves the part to the webroot: it may carry another cut than the zip.
  const other = await run(
    stab6LockMatchesRelease,
    baseWp({ contracts, extra: zip({ ...theme, 'functions.php': '<?php // 1.1.7\n' }) })
  )
  assert.equal(other.status, 'live-only', other.message)
  assert.match(
    other.message,
    /no theme zip matches the lock \(tracy-base-1\.1\.6\.zip: 1 locked file differs/
  )
})

test('STAB-6: the EmDash manifest hashes must be the packed distribution.json', async () => {
  const manifest = JSON.parse(
    readFileSync(path.join(C, 'tracy-business_emdash-0.x', 'manifest.json'), 'utf8')
  )
  const dist = (artifactHash) =>
    JSON.stringify({ contractHash: manifest.template.contractHash.replace(/^sha256:/, ''), artifactHash })
  const same = await run(
    stab6LockMatchesRelease,
    businessEmdash({ 'distribution.json': dist(manifest.template.artifactHash) })
  )
  assert.equal(same.status, 'pass', same.message)
  const other = await run(
    stab6LockMatchesRelease,
    businessEmdash({ 'distribution.json': dist('f'.repeat(64)) })
  )
  assert.equal(other.status, 'fail')
  assert.match(other.message, /artifactHash is not the packed source's/)
})

test('HIDDEN-1: JA Kinetic Joomla error.php writes the demo brand and address', async () => {
  const r = await run(hidden1SystemPages, kineticJ6())
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /error\.php writes demo text .*Kinetic, hello@kineticlabs\.dev/)
  assert.doesNotMatch(r.message, /legal article/)
})

test('HIDDEN-1: Tracy Business EmDash Terms and Privacy bodies have only labels and the brand replace', async () => {
  const r = await run(hidden1SystemPages, businessEmdash172())
  assert.equal(r.status, 'fail')
  assert.match(r.message, /the body of pages\/terms has .*the brand replace/)
  assert.match(r.message, /the body of pages\/privacy/)
})

test('SHARE-1: JA Phio Joomla home carries its own og_title and og_desc; Tracy Business EmDash passes', async () => {
  const phio = await run(share1LinkPreview, phioJ6())
  assert.equal(phio.status, 'fail')
  assert.match(phio.message, /the menu item home carries its own og_title/)
  assert.match(phio.message, /og_desc "JA Phio is a versatile/)
  assert.equal((await run(share1LinkPreview, businessEmdash())).status, 'pass')
})

test('ABOUT-2 and HIDDEN-1: Tracy Business EmDash 1.7.3 as in the tree passes both', async () => {
  const about = await run(about2DemoParagraphs, businessEmdash())
  assert.equal(about.status, 'pass', about.message)
  const hidden = await run(hidden1SystemPages, businessEmdash())
  assert.equal(hidden.status, 'pass', hidden.message)
})

/** JA Essence WordPress 1.0.9 with a theme zip of `files` (path inside the theme -> text). */
const essenceWpTheme = (files) =>
  contextOf(path.join(FIXTURES, 'quickstart_ja-essence_wp7'), 'quickstart/ja-essence/wp7', {
    extra: {
      'wp-ja-essence-1.0.9.zip': zipOf(
        Object.fromEntries(Object.entries(files).map(([f, t]) => [`wp-ja-essence/${f}`, t]))
      )
    }
  })
/** The shape of JA Essence 1.0.10's `tracy/section-cta-final` copy: two action buttons on #. */
const CTA_FINAL = `<?php
/**
 * Title: Call to action, final
 * Slug: tracy/section-cta-final
 */
?>
<!-- wp:buttons {"className":"tracy-actions justify-center"} -->
<div class="wp-block-buttons tracy-actions justify-center">
<!-- wp:button {"className":"tracy-btn tracy-btn--inverse"} -->
<div class="wp-block-button tracy-btn tracy-btn--inverse"><a class="wp-block-button__link wp-element-button" href="#"><?php echo esc_html__( 'Get started', 'wp-ja-essence' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline tracy-btn tracy-btn--ghost"} -->
<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link wp-element-button" href="#"><?php echo esc_html__( 'Talk to us', 'wp-ja-essence' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
`

test('PAGE-5: a pattern a template pulls in (through another pattern) with # action buttons fails; the same pattern pulled in by nothing does not count', async () => {
  const pulled = await run(
    page5ButtonsLeadSomewhere,
    essenceWpTheme({
      'templates/pricing.html': '<!-- wp:pattern {"slug":"tracy/landing"} /-->\n',
      'patterns/landing.php':
        '<?php\n/**\n * Slug: tracy/landing\n */\n?>\n<!-- wp:pattern {"slug":"tracy/section-cta-final"} /-->\n<!-- wp:pattern {"slug":"wp-ja-essence/page-404"} /-->\n',
      'patterns/section-cta-final.php': CTA_FINAL,
      // A link printed by PHP is a real destination (JA Essence 1.0.10's error page button).
      'patterns/page-404.php': `<?php\n/**\n * Slug: wp-ja-essence/page-404\n */\n?>\n<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php echo esc_html__( 'Home Page', 'wp-ja-essence' ); ?></a></div>\n`
    })
  )
  assert.equal(pulled.status, 'fail', pulled.message)
  assert.doesNotMatch(pulled.message, /page-404/)
  assert.match(pulled.message, /patterns\/section-cta-final\.php \(2\)/)
  const alone = await run(
    page5ButtonsLeadSomewhere,
    essenceWpTheme({
      'templates/pricing.html': '<p>Pricing</p>\n',
      'patterns/section-cta-final.php': CTA_FINAL
    })
  )
  assert.doesNotMatch(alone.message, /patterns\//)
})
