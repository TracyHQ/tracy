/**
 * Template Customization Question Readiness, group a: REL-3, NAME-1, NAME-2, NAME-3, NAME-4, FAV-1,
 * LOGO-1, LOGO-2, LOGO-3 (`src/lib/template-customization-question-readiness/rules/`), each rule
 * called directly with a context built the way `checkRelease` builds it.
 *
 * Fixtures (`fixtures/template-customization-question-readiness/a/`) are cut from the real release
 * assets of `JoomlArt-Products/joomlart-products` (09/10/2026): the database rows, template files and
 * theme files the rules read, CSS cut to its logo rules and PHP to its title functions. The
 * settings are the published files, except `quickstart_ja-essence_wp7@1.0.8`, the 1.0.9 setting
 * renamed to the 1.0.8 assets. The EmDash source is `packages/cms/tracy-emdash-theme-business` at
 * 1.7.2. A test that needs a template the releases do not have changes one file in memory and says so.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { crc32, gzipSync } from 'node:zlib'

import { TEMPLATE_PROFILES } from '../src/lib/template-profiles.js'
import {
  directoryReleaseSource,
  readText
} from '../src/lib/template-customization-question-readiness/release-source.js'
import { releaseContent } from '../src/lib/template-customization-question-readiness/readers/release-content.js'
import {
  tarGzFiles,
  zipFiles
} from '../src/lib/template-customization-question-readiness/readers/archive-binaries.js'
import { rel3LogoLayout } from '../src/lib/template-customization-question-readiness/rules/rel-3-logo-layout.js'
import { fav1OneFavicon } from '../src/lib/template-customization-question-readiness/rules/fav-1-one-favicon.js'
import { logo1CustomerLogo } from '../src/lib/template-customization-question-readiness/rules/logo-1-customer-logo.js'
import { logo2DarkLogo } from '../src/lib/template-customization-question-readiness/rules/logo-2-dark-logo.js'
import { logo3LogoSize } from '../src/lib/template-customization-question-readiness/rules/logo-3-logo-size.js'
import { name1HomeTitle } from '../src/lib/template-customization-question-readiness/rules/name-1-home-title.js'
import { name2PageTitles } from '../src/lib/template-customization-question-readiness/rules/name-2-page-titles.js'
import { name3CopyrightLine } from '../src/lib/template-customization-question-readiness/rules/name-3-copyright-line.js'
import { name4NameCharacters } from '../src/lib/template-customization-question-readiness/rules/name-4-name-characters.js'

const A = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'template-customization-question-readiness',
  'a'
)
const CMS = { joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' }

/** A minimal ustar tar.gz of `files` (path -> text), for a webroot with one file changed. */
function tarGz(files) {
  const blocks = []
  for (const [name, text] of files) {
    const body = Buffer.from(text)
    const header = Buffer.alloc(512)
    header.write(name, 0, 100)
    header.write('0000644\0', 100)
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('0', 156)
    header.write('ustar\0', 257)
    header.fill(' ', 148, 156)
    let sum = 0
    for (const b of header) sum += b
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}

/**
 * A rule context for one fixture release.
 * @param {string} folder
 * @param {{ tag: string, version?: string, row?: object, overrides?: Record<string, Buffer | string>, contracts?: Map<string, any> }} opts
 */
async function contextOf(folder, { tag, version, row, overrides = {}, contracts }) {
  const real = directoryReleaseSource(path.join(A, folder), { tag })
  const source = {
    ...real,
    names: async () => [...new Set([...(await real.names()), ...Object.keys(overrides)])].sort(),
    read: async (n) => (n in overrides ? Buffer.from(overrides[n]) : real.read(n))
  }
  const setting = JSON.parse(await readText(source, 'tracy_setting.json'))
  if (version) setting.version = version
  let profiles
  if (row) {
    profiles = structuredClone(TEMPLATE_PROFILES)
    profiles.releases[tag] = { ...profiles.releases[tag], [setting.version]: row }
  }
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
    ...(profiles ? { profiles } : {}),
    ...(contracts ? { contracts } : {})
  }
}

/** The Essence Joomla webroot with one template file replaced. */
async function essenceJ6With(file, text) {
  const webroot = 'ja-essence-j6-webroot-1.0.2.tar.gz'
  const ctx = await contextOf('quickstart_ja-essence_j6', { tag: 'quickstart/ja-essence/j6' })
  const files = tarGzFiles(await ctx.source.read(webroot), () => true)
  files.set(`templates/ja_essence/${file}`, Buffer.from(text))
  return contextOf('quickstart_ja-essence_j6', {
    tag: 'quickstart/ja-essence/j6',
    overrides: { [webroot]: tarGz([...files].map(([n, b]) => [n, b.toString('utf8')])) }
  })
}

/** A stored (uncompressed) zip of `files` (path -> Buffer), enough for the readers. */
function zipOf(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, data] of files) {
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
  end.writeUInt16LE(files.size, 8)
  end.writeUInt16LE(files.size, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

/** The Tracy Business EmDash source zip (1.7.2, the 1.7.3 title shape) with `files` (path -> text) put in. */
async function businessEmWith(files) {
  const zip = 'tracy-business-emdash-quickstart-1.7.2.zip'
  const ctx = await contextOf(BUSINESS_EM.folder, { tag: BUSINESS_EM.tag })
  const all = zipFiles(await ctx.source.read(zip), () => true)
  for (const [n, t] of Object.entries(files)) all.set(n, Buffer.from(t))
  return { ...BUSINESS_EM, overrides: { [zip]: zipOf(all) } }
}

const row = (tag, version) => TEMPLATE_PROFILES.releases[tag][version]
const ESSENCE_J6 = { folder: 'quickstart_ja-essence_j6', tag: 'quickstart/ja-essence/j6' }
const RESORT = { folder: 'quickstart_ja-resort_j6', tag: 'quickstart/ja-resort/j6' }
const MORGAN = { folder: 'quickstart_ja-morgan_j6', tag: 'quickstart/ja-morgan/j6' }
const KINETIC_J6 = { folder: 'quickstart_ja-kinetic_j6', tag: 'quickstart/ja-kinetic/j6' }
const ESSENCE_WP = { folder: 'quickstart_ja-essence_wp7', tag: 'quickstart/ja-essence/wp7' }
const ESSENCE_WP_108 = { folder: 'quickstart_ja-essence_wp7@1.0.8', tag: 'quickstart/ja-essence/wp7' }
const KINETIC_WP = { folder: 'quickstart_ja-kinetic_wp7', tag: 'quickstart/ja-kinetic/wp7' }
const BUSINESS_WP = { folder: 'tracy-business_wp7', tag: 'tracy-business/wp7' }
const BUSINESS_EM = { folder: 'tracy-business_emdash-0.x', tag: 'tracy-business/emdash-0.x' }
const run = async (rule, { folder, ...opts }) => rule.run(await contextOf(folder, opts))

// --- REL-3 ---

test('REL-3: JA Resort 1.0.1 asks only the dark logo, as its light demo picture on one key shows', async () => {
  const r = await run(rel3LogoLayout, RESORT)
  assert.equal(r.status, 'pass', r.message)
  assert.match(r.details.join('\n'), /logo\.png, a light picture \(luminance 18\d\)/)
})

test('REL-3: JA Resort 1.0.1 with its old unverified "pair" row fails, naming "dark" as the fix', async () => {
  const old = { ...row(RESORT.tag, '1.0.1'), logos: 'pair', unverified: ['logos'] }
  const r = await run(rel3LogoLayout, { ...RESORT, row: old })
  assert.equal(r.status, 'fail')
  assert.match(r.message, /row says logos "pair" but the template shows "dark"/)
  assert.match(r.fix, /"logos": "dark"/)
  assert.equal(r.owner, undefined, 'the rule owner, tracy, stands')
  assert.equal(rel3LogoLayout.owner, 'tracy')
})

test('REL-3: JA Essence Joomla 1.0.2 is a pair (site_logo_dark with dark mode on); Morgan T3 too; TB EmDash too', async () => {
  for (const release of [ESSENCE_J6, MORGAN, BUSINESS_EM]) {
    const r = await run(rel3LogoLayout, release)
    assert.equal(r.status, 'pass', `${release.tag}: ${r.message}`)
    assert.match(r.message, /asks for "pair"/)
  }
})

test('REL-3: an unverified row the files agree with is a warning (live-only), as JA Mood and JA Donate', async () => {
  const r = await run(rel3LogoLayout, {
    ...MORGAN,
    row: { ...row(MORGAN.tag, '1.0.2'), unverified: ['logos'] }
  })
  assert.equal(r.status, 'live-only')
  assert.match(r.message, /marked unverified/)
})

test('REL-3: a WordPress dark Site Logo without "darkLogo" on the row fails', async () => {
  const { darkLogo, ...withoutDark } = row(ESSENCE_WP.tag, '1.0.9')
  assert.equal(darkLogo, true)
  const r = await run(rel3LogoLayout, { ...ESSENCE_WP, row: withoutDark })
  assert.equal(r.status, 'fail')
  assert.match(r.message, /lacks "darkLogo": true/)
})

test('REL-3: a version with only a lower row borrowed fails (no stale answer)', async () => {
  // 1.0.3 to 1.0.10 have their own rows, so a later version stands in; the answer names the
  // newest older row, which moves each time a version gets its own row.
  const r = await run(rel3LogoLayout, { ...ESSENCE_J6, version: '1.0.11' })
  assert.equal(r.status, 'fail')
  assert.match(
    r.message,
    /no row of its own for quickstart\/ja-essence\/j6 1\.0\.11, only the older 1\.0\.10 one/
  )
})

// --- FAV-1 ---

test('FAV-1: JA Essence Joomla 1.0.2 passes; its error.php icon is a note, not a failure', async () => {
  const r = await run(fav1OneFavicon, ESSENCE_J6)
  assert.equal(r.status, 'pass', r.message)
  assert.deepEqual(r.details, ["error.php prints the template's own icon on that page only"])
})

test('FAV-1: Tracy Business EmDash at the 1.6.0 row (faviconReady false) fails; 1.7.2 passes', async () => {
  const old = await run(fav1OneFavicon, { ...BUSINESS_EM, version: '1.6.0' })
  assert.equal(old.status, 'fail')
  assert.match(old.message, /faviconReady is not true/)
  assert.equal((await run(fav1OneFavicon, BUSINESS_EM)).status, 'pass')
})

test('FAV-1: a T4 index.php printing its own icon fails (Essence index.php changed in memory)', async () => {
  const ctx = await essenceJ6With(
    'index.php',
    '<head>\n<link href="/templates/ja_essence/favicon.ico" rel="shortcut icon" />\n</head>'
  )
  const r = await fav1OneFavicon.run(ctx)
  assert.equal(r.status, 'fail')
  assert.match(r.message, /index\.php print an icon <link> beside the one T4 prints/)
})

test('FAV-1: WordPress Essence 1.0.9 and Tracy Business 1.3.4 print no second icon', async () => {
  for (const release of [ESSENCE_WP, BUSINESS_WP])
    assert.equal((await run(fav1OneFavicon, release)).status, 'pass', release.tag)
})

// --- LOGO-1 ---

test('LOGO-1: JA Essence Joomla 1.0.2, Essence WP 1.0.9, TB WP 1.3.4 and TB EmDash 1.7.2 pass', async () => {
  for (const release of [ESSENCE_J6, ESSENCE_WP, BUSINESS_WP, BUSINESS_EM]) {
    const r = await run(logo1CustomerLogo, release)
    assert.equal(r.status, 'pass', `${release.tag}: ${r.message}`)
  }
})

test('LOGO-1: Tracy Business EmDash 1.6.0 (brandReady false) and JA Kinetic WP 1.0.6 fail', async () => {
  for (const [release, version] of [
    [BUSINESS_EM, '1.6.0'],
    [KINETIC_WP, '1.0.6']
  ]) {
    const r = await run(logo1CustomerLogo, { ...release, version })
    assert.equal(r.status, 'fail', release.tag)
    assert.match(r.message, /brandReady is not true/)
  }
})

test('LOGO-1: Essence Joomla with a row missing home-4 or the footer slot names what is missing', async () => {
  const base = row(ESSENCE_J6.tag, '1.0.2')
  const noProfile = await run(logo1CustomerLogo, { ...ESSENCE_J6, row: { ...base, profiles: ['default'] } })
  assert.equal(noProfile.status, 'fail')
  assert.match(
    noProfile.message,
    /etc\/site\/home-4\.json holds a logo \(site_logo, site_logo_dark\) but is not in the row's profiles/
  )
  const { footerSlot, ...noFooter } = base
  assert.equal(footerSlot, 'module-121.1')
  const r = await run(logo1CustomerLogo, { ...ESSENCE_J6, row: noFooter })
  assert.equal(r.status, 'fail')
  assert.match(
    r.message,
    /module 121 "Footer Info" \(footer-info-left\) shows the demo logo images\/joomlart\/logo\/item-1\.png/
  )
})

// --- LOGO-2 ---

test('LOGO-2: Essence Joomla 1.0.2 (filter keyed to the demo file), Morgan, Essence WP 1.0.9, TB EmDash pass', async () => {
  for (const release of [ESSENCE_J6, MORGAN, ESSENCE_WP, BUSINESS_EM]) {
    const r = await run(logo2DarkLogo, release)
    assert.equal(r.status, 'pass', `${release.tag}: ${r.message}`)
  }
})

test('LOGO-2: JA Essence WP 1.0.8 fails: the footer has one logo and dark mode inverts it', async () => {
  const r = await run(logo2DarkLogo, ESSENCE_WP_108)
  assert.equal(r.status, 'fail')
  assert.match(r.message, /part "footer" \(demo database\) has no dark logo spot/)
  assert.match(
    r.message,
    /je-home\.css: :root\[data-theme="dark"\] \.je-footer__logo img recolours every logo/
  )
})

test('LOGO-2: a dark-mode filter on every logo fails (Essence 1.0.0 behaviour, darkmode.css changed in memory)', async () => {
  const ctx = await essenceJ6With(
    'css/darkmode.css',
    'html[data-theme="dark"] .navbar-brand img.logo-img { filter: brightness(0) invert(1); }\n'
  )
  const r = await logo2DarkLogo.run(ctx)
  assert.equal(r.status, 'fail')
  assert.match(
    r.message,
    /css\/darkmode\.css: html\[data-theme="dark"\] \.navbar-brand img\.logo-img recolours every logo/
  )
})

test('LOGO-2: a footer slot with no paired Custom module layout fails (Vogue 1.0.1 behaviour)', async () => {
  const ctx = await essenceJ6With('html/mod_custom/default.php', '<?php echo $module->content; ?>\n')
  const r = await logo2DarkLogo.run(ctx)
  assert.equal(r.status, 'fail')
  assert.match(
    r.message,
    /footer logo \(module-121\.1\) has no Custom module layout pairing it with site_logo_dark/
  )
})

// --- LOGO-3 ---

test('LOGO-3: Essence Joomla 1.0.2 (logoHeight 40 under a 100 px cap), Resort (48), Essence WP, TB EmDash pass', async () => {
  for (const release of [ESSENCE_J6, RESORT, ESSENCE_WP, BUSINESS_EM]) {
    const r = await run(logo3LogoSize, release)
    assert.equal(r.status, 'pass', `${release.tag}: ${r.message}`)
  }
})

test('LOGO-3: the Essence 1.0.0 row (no logoHeight) fails under the 100 px cap; Resort without one too', async () => {
  const essence = await run(logo3LogoSize, { ...ESSENCE_J6, row: row(ESSENCE_J6.tag, '1.0.0') })
  assert.equal(essence.status, 'fail')
  assert.match(essence.message, /reach 100 px, the demo logo is 40 px, and the row has no logoHeight/)
  const { logoHeight, ...noHeight } = row(RESORT.tag, '1.0.1')
  assert.equal(logoHeight, 48)
  const resort = await run(logo3LogoSize, { ...RESORT, row: noHeight })
  assert.equal(resort.status, 'fail')
  assert.match(resort.message, /reach 300 px, the demo logo is 48 px/)
})

test('LOGO-3: a logoHeight far from the demo logo fails', async () => {
  const r = await run(logo3LogoSize, {
    ...ESSENCE_J6,
    row: { ...row(ESSENCE_J6.tag, '1.0.2'), logoHeight: 100 }
  })
  assert.equal(r.status, 'fail')
  assert.match(r.message, /logoHeight 100 is more than 10% off the demo logo's 40 px/)
})

test('LOGO-3: no demo height and no cap read is live-only (Tracy Business WP)', async () => {
  assert.equal((await run(logo3LogoSize, BUSINESS_WP)).status, 'live-only')
})

// --- NAME-1 ---

test('NAME-1: Essence Joomla 1.0.2 ships its home title in the lock; Morgan, Essence WP 1.0.9, TB WP pass', async () => {
  for (const release of [ESSENCE_J6, MORGAN, ESSENCE_WP, BUSINESS_WP]) {
    const r = await run(name1HomeTitle, release)
    assert.equal(r.status, 'pass', `${release.tag}: ${r.message}`)
  }
})

test('NAME-1: a home tab that opens with the name passes (Tracy Base EmDash: "${siteTitle} — ${title}", Akemi 12/10/2026)', async () => {
  const theme = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../packages/cms/tracy-emdash-theme-base'
  )
  const base = readFileSync(path.join(theme, 'src/layouts/Base.astro'), 'utf8')
  const r = await run(name1HomeTitle, await businessEmWith({ 'src/layouts/Base.astro': base }))
  assert.equal(r.status, 'pass', r.message)
  // The page title first on every branch still fails, quoted whole.
  const pageFirst = base.replace('`${siteTitle} — ${title}`', '`${title} | ${siteTitle}`')
  assert.notEqual(pageFirst, base)
  const red = await run(name1HomeTitle, await businessEmWith({ 'src/layouts/Base.astro': pageFirst }))
  assert.equal(red.status, 'fail', red.message)
  assert.match(
    red.message,
    /builds the home tab as "currentPath === '\/' \? `\$\{title\} \| \$\{siteTitle\}` : `\$\{title\} — \$\{siteTitle\}`": never the site name first/
  )
})

test('NAME-1: Tracy Business EmDash up to 1.7.3 fails, its home tab "Home — Name"; 1.7.4 (src/lib/page-title.ts) passes', async () => {
  // The fixture's Base.astro is the 1.7.2 one, the shape 1.7.3 shipped: every tab "${title} — ${siteTitle}".
  const old = await run(name1HomeTitle, BUSINESS_EM)
  assert.equal(old.status, 'fail', old.message)
  assert.match(
    old.message,
    /src\/layouts\/Base\.astro builds the home tab as "\$\{title\} — \$\{siteTitle\}": never the site name first/
  )
  // 1.7.4: the layout and the title module as the theme ships them now.
  const theme = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../packages/cms/tracy-emdash-theme-business'
  )
  const v174 = await businessEmWith({
    'src/layouts/Base.astro': readFileSync(path.join(theme, 'src/layouts/Base.astro'), 'utf8'),
    'src/lib/page-title.ts': readFileSync(path.join(theme, 'src/lib/page-title.ts'), 'utf8')
  })
  const now = await run(name1HomeTitle, v174)
  assert.equal(now.status, 'pass', now.message)
  // The module named, but its home branch opens with the page's words: fails.
  const wordy = await businessEmWith({
    'src/layouts/Base.astro': readFileSync(path.join(theme, 'src/layouts/Base.astro'), 'utf8'),
    'src/lib/page-title.ts': readFileSync(path.join(theme, 'src/lib/page-title.ts'), 'utf8').replace(
      'return name\n',
      'return `${title} — ${name}`\n'
    )
  })
  assert.equal((await run(name1HomeTitle, wordy)).status, 'fail')
})

test('NAME-1: JA Essence WP 1.0.8 fails on "Minimal Blogging Template"', async () => {
  const r = await run(name1HomeTitle, ESSENCE_WP_108)
  assert.equal(r.status, 'fail')
  assert.match(
    r.message,
    /wp_ja_essence_title_fixed \(on pre_get_document_title\) returns the demo's words "Minimal Blogging Template - "/
  )
})

test('NAME-1: a Joomla home title the contract lock does not hold fails, owner contract', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tcqr-a-'))
  writeFileSync(path.join(dir, 'presentation-lock.json'), JSON.stringify({ entities: {} }))
  const contracts = new Map([['quickstart/ja-essence/j6@1.0.2', { id: 'ja-essence/j6/1.0.2', dir }]])
  const r = await run(name1HomeTitle, { ...ESSENCE_J6, contracts })
  assert.equal(r.status, 'fail')
  assert.equal(r.owner, 'contract')
  assert.match(
    r.message,
    /ships the page title "Minimal Blogging Joomla Template - JA Essence", which the presentation lock/
  )
})

// --- NAME-2 ---

test("NAME-2: Joomla is Tracy's switch (D1), not the template's", async () => {
  const r = await run(name2PageTitles, ESSENCE_J6)
  assert.equal(r.status, 'not-applicable')
  assert.equal(r.owner, 'tracy')
})

test('NAME-2: Essence WP 1.0.9, Kinetic WP (a $named helper), TB WP and TB EmDash keep the site name', async () => {
  for (const release of [ESSENCE_WP, KINETIC_WP, BUSINESS_WP, BUSINESS_EM]) {
    const r = await run(name2PageTitles, release)
    assert.equal(r.status, 'pass', `${release.tag}: ${r.message}`)
  }
})

test('NAME-2: JA Essence WP 1.0.8 fails: its 404 title leaves out the site name', async () => {
  const r = await run(name2PageTitles, ESSENCE_WP_108)
  assert.equal(r.status, 'fail')
  assert.match(r.message, /returns a title without the site name: return 'Error: 404 Page not found'/)
})

// --- NAME-3 ---

test('NAME-3: JA Kinetic Joomla 1.0.3 fails on error.php line 393, "Kinetic Labs, Inc."', async () => {
  const r = await run(name3CopyrightLine, KINETIC_J6)
  assert.equal(r.status, 'fail')
  assert.match(
    r.message,
    /error\.php:393 writes "2026 Kinetic Labs, Inc\. All rights reserved\." in fixed words/
  )
})

test('NAME-3: Essence Joomla (mod_footer), Morgan (slot module-163.0, override printing $lineone), Essence WP 1.0.9, TB WP, TB EmDash pass', async () => {
  for (const release of [ESSENCE_J6, MORGAN, ESSENCE_WP, BUSINESS_WP, BUSINESS_EM]) {
    const r = await run(name3CopyrightLine, release)
    assert.equal(r.status, 'pass', `${release.tag}: ${r.message}`)
  }
})

test('NAME-3: JA Essence WP 1.0.8 (footer "JA Essence") and JA Kinetic WP (404.html "Kinetic Labs") fail', async () => {
  const essence = await run(name3CopyrightLine, ESSENCE_WP_108)
  assert.equal(essence.status, 'fail')
  assert.match(
    essence.message,
    /part "footer" \(demo database\) writes the © line "Copyright © 2026 JA Essence/
  )
  const kinetic = await run(name3CopyrightLine, KINETIC_WP)
  assert.equal(kinetic.status, 'fail')
  assert.match(kinetic.message, /template "404" \(theme file\) writes the © line "© 2026 Kinetic Labs, Inc\./)
})

// --- NAME-4 ---

test('NAME-4: Tracy Business WP 1.3.4 fails on its 5 "&amp;" samples, owner contract', async () => {
  const r = await run(name4NameCharacters, BUSINESS_WP)
  assert.equal(r.status, 'fail')
  assert.equal(r.owner, 'contract')
  assert.match(
    r.message,
    /5 samples of contract tracy-business\/wp7\/1\.3\.4 hold an HTML entity \(home\.services\.item\.3\.title = "M&amp;E engineering"/
  )
})

test('NAME-4: JA Voyara Joomla 1.0.4 fails on module-902.2, even with no webroot to read', async () => {
  const r = await run(name4NameCharacters, {
    folder: 'quickstart_ja-voyara_j6',
    tag: 'quickstart/ja-voyara/j6'
  })
  assert.equal(r.status, 'fail')
  assert.match(
    r.message,
    /1 sample of contract ja-voyara\/j6\/1\.0\.4 holds an HTML entity \(module-902\.2 = "Booked Kerala &amp; Sri Lanka 2025"\)/
  )
})

test('NAME-4: Essence Joomla, Essence WP and TB EmDash pass', async () => {
  for (const release of [ESSENCE_J6, ESSENCE_WP, BUSINESS_EM]) {
    const r = await run(name4NameCharacters, release)
    assert.equal(r.status, 'pass', `${release.tag}: ${r.message}`)
  }
})

test('ABOUT-3 notes a first demo name that is not the one the demo shows: it stands in where Name is left blank', async () => {
  const { standInNote } = await import(
    '../src/lib/template-customization-question-readiness/rules/about-3-demo-company-name.js'
  )
  assert.equal(standInNote(['JA Morgan'], 'JA Morgan'), '')
  assert.equal(
    standInNote(['Northgate', 'Northgate Industrial'], 'northgate'),
    '',
    'case and spacing do not count'
  )
  assert.match(
    standInNote(['JA Nova', 'ja_nova'], 'ja_nova'),
    /first demoCompanyNames entry "JA Nova" is not the name the demo shows \("ja_nova"\)/
  )
  assert.equal(standInNote([], 'JA Nova'), '')
})
