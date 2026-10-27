/**
 * Composing a `tracy_setting.json` for a release that already exists — the part that reads the
 * release's asset list and SHA256SUMS and decides nothing else.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  designInspirationFrom,
  installerAssetOf,
  partsFrom,
  pinProblems,
  pinsIn,
  settingFrom,
  sumsOf,
  sumsOfManifest,
  templateInZip
} from '../tracy-setting.mjs'

const EMDASH = {
  tag: 'tracy-business/emdash-0.x',
  assets: [
    'tracy-business-emdash-quickstart-1.0.0.zip',
    'tracy-business-emdash-state-1.0.0.tar.gz',
    'manifest.json',
    'SHA256SUMS'
  ],
  sums: [
    'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111  tracy-business-emdash-quickstart-1.0.0.zip',
    'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222  tracy-business-emdash-state-1.0.0.tar.gz'
  ].join('\n')
}

test('SHA256SUMS is read as the release wrote it, star prefix and all', () => {
  assert.deepEqual(sumsOf(`${'c'.repeat(64)} *file one.zip\n${'d'.repeat(64)}  two.tar.gz\n\n`), {
    'file one.zip': 'c'.repeat(64),
    'two.tar.gz': 'd'.repeat(64)
  })
})

test('an EmDash release: the zip is the source, the tarball is the state', () => {
  const parts = partsFrom('emdash', EMDASH.assets, sumsOf(EMDASH.sums))
  assert.deepEqual(parts, {
    source: { file: 'tracy-business-emdash-quickstart-1.0.0.zip', sha256: 'aaaa1111'.repeat(8) },
    state: { file: 'tracy-business-emdash-state-1.0.0.tar.gz', sha256: 'bbbb2222'.repeat(8) }
  })
})

test('a Joomla release: the webroot tarball and the database dump, not the 79 MB bundle', () => {
  const assets = [
    'tracy-business-j6-quickstart-1.0.0.zip',
    'tracy-business-j6-runtime-quickstart-1.0.0.zip',
    'tracy-business-j6-webroot-1.0.0.tar.gz',
    'tracy-business-j6-database-1.0.0.sql.gz'
  ]
  const sums = Object.fromEntries(assets.map((f, i) => [f, String(i).repeat(64)]))
  assert.deepEqual(partsFrom('joomla', assets, sums), {
    webroot: { file: 'tracy-business-j6-webroot-1.0.0.tar.gz', sha256: '2'.repeat(64) },
    database: { file: 'tracy-business-j6-database-1.0.0.sql.gz', sha256: '3'.repeat(64) }
  })
})

test('a part the release does not carry is left out, and says which', () => {
  const missing = partsFrom('joomla', ['tracy-base-j6-quickstart-1.0.0.zip'], {})
  assert.deepEqual(missing, {})
})

test('the composed setting is one the validator accepts', () => {
  const doc = settingFrom({
    tag: EMDASH.tag,
    platform: 'emdash',
    label: 'Tracy Business',
    version: '1.0.0',
    cms: '0.37.0',
    template: 'tracy-business',
    assets: EMDASH.assets,
    sums: sumsOf(EMDASH.sums)
  })
  assert.equal(doc.schemaVersion, 'tracy-setting/v1')
  assert.equal(doc.install.source.file, 'tracy-business-emdash-quickstart-1.0.0.zip')
  assert.equal(doc.template, 'tracy-business')
})

test('a setting that cannot be composed throws rather than shipping half a file', () => {
  // The bundle is attached but its checksum is in neither the sums file nor a runtime manifest, so
  // no shape can be composed — and the sentence names the shapes rather than one missing part.
  assert.throws(
    () =>
      settingFrom({
        tag: 'tracy-base/j6',
        platform: 'joomla',
        label: 'Tracy Base',
        version: '1.0.0',
        cms: '6.1.1',
        assets: ['tracy-base-j6-quickstart-1.0.0.zip'],
        sums: {}
      }),
    /install must be webroot \+ database, or bundle/
  )
  // EmDash has one shape, so the same emptiness names the two files it wanted.
  assert.throws(
    () =>
      settingFrom({
        tag: 'tracy-business/emdash-0.x',
        platform: 'emdash',
        label: 'Tracy Business',
        version: '1.0.0',
        cms: '0.37.0',
        assets: ['tracy-business-emdash-quickstart-1.0.0.zip'],
        sums: {}
      }),
    /install\.source is missing[\s\S]*install\.state is missing/
  )
})

test('the version is read off the files when it is not given, so two releases cannot be confused', () => {
  const doc = settingFrom({
    tag: EMDASH.tag,
    platform: 'emdash',
    label: 'Tracy Business',
    cms: '0.37.0',
    assets: EMDASH.assets,
    sums: sumsOf(EMDASH.sums)
  })
  assert.equal(doc.version, '1.0.0')
})

test('a Joomla release with only an Akeeba bundle composes the bundle shape', () => {
  const assets = ['tracy-base-j6-quickstart-1.0.0.zip', 'tracy-base-j6-profile-1.0.0.zip', 'SHA256SUMS']
  const sums = { 'tracy-base-j6-quickstart-1.0.0.zip': '9'.repeat(64) }
  const doc = settingFrom({
    tag: 'tracy-base/j6',
    platform: 'joomla',
    label: 'Tracy Base',
    cms: '6.1.1',
    template: 'tracy',
    assets,
    sums
  })
  assert.deepEqual(doc.install, {
    bundle: { file: 'tracy-base-j6-quickstart-1.0.0.zip', sha256: '9'.repeat(64) }
  })
  assert.equal(doc.version, '1.0.0')
})

test('the webroot pair wins over a bundle when a release carries both — a build restores the pair', () => {
  const assets = [
    'tracy-business-j6-quickstart-1.0.0.zip',
    'tracy-business-j6-webroot-1.0.0.tar.gz',
    'tracy-business-j6-database-1.0.0.sql.gz'
  ]
  const sums = Object.fromEntries(assets.map((f, i) => [f, String(i + 1).repeat(64)]))
  const doc = settingFrom({
    tag: 'tracy-business/j6',
    platform: 'joomla',
    label: 'Tracy Business',
    cms: '6.1.1',
    assets,
    sums
  })
  assert.deepEqual(Object.keys(doc.install), ['webroot', 'database'])
})

test('checksums missing from SHA256SUMS are taken from a runtime manifest, never invented', () => {
  // Measured on tracy-apple/j6, 15/09: SHA256SUMS lists the 1.0.0 files only; the 1.1.0 webroot and
  // database were attached later, and their checksums live in runtime-manifest-1.1.0.json.
  const assets = [
    'tracy-apple-j6-quickstart-1.0.0.zip',
    'tracy-apple-j6-webroot-1.1.0.tar.gz',
    'tracy-apple-j6-database-1.1.0.sql.gz',
    'runtime-manifest-1.1.0.json'
  ]
  const runtime = {
    parts: {
      webroot: { file: 'tracy-apple-j6-webroot-1.1.0.tar.gz', sha256: 'a'.repeat(64) },
      database: { file: 'tracy-apple-j6-database-1.1.0.sql.gz', sha256: 'b'.repeat(64) }
    }
  }
  const sums = {
    ...sumsOf(`${'c'.repeat(64)}  tracy-apple-j6-quickstart-1.0.0.zip`),
    ...sumsOfManifest(runtime)
  }
  const doc = settingFrom({
    tag: 'tracy-apple/j6',
    platform: 'joomla',
    label: 'Tracy Apple',
    cms: '6.1.1',
    assets,
    sums
  })
  assert.deepEqual(doc.install.webroot, {
    file: 'tracy-apple-j6-webroot-1.1.0.tar.gz',
    sha256: 'a'.repeat(64)
  })
  assert.equal(doc.version, '1.1.0')
})

test('a release carrying two versions of a part declares the newest, not the first listed', () => {
  // GitHub lists assets by name, so 1.1.0 comes back before 1.2.0. Measured on tracy-apple/j6
  // once the 1.2.0 cascade was attached beside the 1.1.0 it replaces: taking the first match made
  // the setting declare an archive the registry had already moved off.
  const assets = [
    'tracy-apple-j6-database-1.1.0.sql.gz',
    'tracy-apple-j6-database-1.2.0.sql.gz',
    'tracy-apple-j6-webroot-1.1.0.tar.gz',
    'tracy-apple-j6-webroot-1.2.0.tar.gz'
  ]
  const sums = Object.fromEntries(assets.map((f, i) => [f, String(i).repeat(64)]))
  assert.deepEqual(partsFrom('joomla', assets, sums), {
    webroot: { file: 'tracy-apple-j6-webroot-1.2.0.tar.gz', sha256: '3'.repeat(64) },
    database: { file: 'tracy-apple-j6-database-1.2.0.sql.gz', sha256: '1'.repeat(64) }
  })
})

test('every hand-pinned release file in the tree is collected, whichever file pinned it', () => {
  const pins = pinsIn({
    'packages/site/tracy-site-build-joomla/src/host/capabilities.json': JSON.stringify({
      artifacts: {
        'a-1.0.0': {
          release: 'tracy-apple/j6',
          url: 'https://github.com/JoomlArt-Products/ja-products/releases/download/tracy-apple%2Fj6/a-1.0.0.zip',
          sha256: 'a'.repeat(64)
        }
      }
    }),
    'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json': JSON.stringify({
      'tracy-apple/j6': {
        webroot: {
          file: 'tracy-apple-j6-webroot-1.2.0.tar.gz',
          sha256: 'b'.repeat(64),
          url: 'https://github.com/JoomlArt-Products/ja-products/releases/download/tracy-apple%2Fj6/tracy-apple-j6-webroot-1.2.0.tar.gz'
        }
      }
    })
  })
  assert.deepEqual(
    pins.map((p) => [p.repo, p.tag, p.file]).map((r) => r.slice(1)),
    [
      ['tracy-apple/j6', 'a-1.0.0.zip'],
      ['tracy-apple/j6', 'tracy-apple-j6-webroot-1.2.0.tar.gz']
    ]
  )
  // The tag comes off the URL, encoded slash and all — a pin that named a release in one field and
  // a file from another would be exactly the drift this looks for.
  assert.equal(pins[0].where, 'packages/site/tracy-site-build-joomla/src/host/capabilities.json')
  assert.equal(
    pins[0].repo,
    'JoomlArt-Products/ja-products',
    'the repository is read off the URL, not assumed'
  )
})

// ── the `installer` shape: 79 old JA releases, and not one of them publishes a SHA256SUMS ──────

test('the one quickstart package on an installer release is found, and two are refused', () => {
  // Measured 16/09 across `quickstart/ja-*/j6`, `quickstart/purity-iii/j6` and friends: one zip per
  // release, no sums file, no manifest. A second zip is not a tie this script may break — which one
  // a customer's site is built from is not a coin toss.
  assert.equal(installerAssetOf(['ja-space-j6-quickstart.zip']), 'ja-space-j6-quickstart.zip')
  assert.equal(installerAssetOf(['ja-space-j6-quickstart.zip', 'notes.txt']), 'ja-space-j6-quickstart.zip')
  assert.equal(installerAssetOf(['a-quickstart.zip', 'b-quickstart.zip']), undefined)
  assert.equal(installerAssetOf(['notes.txt']), undefined)
})

test("the template is read out of the package's own templates/, never from the tag", () => {
  // The real listing of `ja-space-j6-quickstart.zip`, measured 16/09. `index.html` is a file, not a
  // template; the other three are Joomla's own and ship in every package.
  const names = [
    'index.php',
    'templates/index.html',
    'templates/cassiopeia/index.php',
    'templates/cassiopeia_extended/index.php',
    'templates/system/error.php',
    'templates/ja_space/index.php',
    'administrator/templates/atum/index.php'
  ]
  assert.equal(templateInZip(names), 'ja_space')

  // Two candidates is not a guess this script makes — it prints nothing and `--template` decides.
  assert.equal(templateInZip([...names, 'templates/ja_other/index.php']), undefined)
  assert.equal(templateInZip(['templates/cassiopeia/index.php']), undefined)
})

test('an installer setting is composed from the computed pin, with no SHA256SUMS in sight', () => {
  const doc = settingFrom({
    tag: 'quickstart/ja-space/j6',
    platform: 'joomla',
    label: 'JA Space',
    version: '1.0.0',
    cms: '6.0.3',
    template: 'ja_space',
    assets: ['ja-space-j6-quickstart.zip'],
    sums: {},
    install: { installer: { file: 'ja-space-j6-quickstart.zip', sha256: '7'.repeat(64) } }
  })
  assert.deepEqual(doc.install, {
    installer: { file: 'ja-space-j6-quickstart.zip', sha256: '7'.repeat(64) }
  })
  assert.equal(doc.template, 'ja_space')

  // Still held to the release's own asset list — a computed checksum is not a licence to skip that.
  assert.throws(
    () =>
      settingFrom({
        tag: 'quickstart/ja-space/j6',
        platform: 'joomla',
        label: 'JA Space',
        version: '1.0.0',
        cms: '6.0.3',
        assets: ['ja-space-j6-quickstart.zip'],
        sums: {},
        install: { installer: { file: 'somewhere-else.zip', sha256: '7'.repeat(64) } }
      }),
    /is not an asset of this release/
  )
})
// ── the card, now a file of its own ────────────────────────────────────────────────────────────

const card = (over = {}) => ({
  schemaVersion: 'tracy-design-inspiration/v1',
  template: 'tracy-business',
  provider: 'JoomlArt',
  category: 'Professional & Corporate',
  blurb: 'Industrial / B2B company site.',
  image: 'business-home-1440.png',
  layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'business-home-1440.png' } }],
  ...over
})

test('the card is composed into its own file, and never into the setting', () => {
  const doc = settingFrom({
    tag: EMDASH.tag,
    platform: 'emdash',
    label: 'Tracy Business',
    cms: '0.37.0',
    template: 'tracy-business',
    assets: EMDASH.assets,
    sums: sumsOf(EMDASH.sums)
  })
  assert.equal(doc.card, undefined, 'a card inside tracy_setting.json is the shape this replaced')

  const file = designInspirationFrom({ tag: EMDASH.tag, template: 'tracy-business', doc: card() })
  assert.equal(file.schemaVersion, 'tracy-design-inspiration/v1')
  assert.equal(file.template, 'tracy-business')
})

test('a card the product would refuse never reaches a release', () => {
  assert.throws(
    () =>
      designInspirationFrom({ tag: EMDASH.tag, template: 'tracy-business', doc: card({ provider: 'Acme' }) }),
    /provider must be one of Tracy, JoomlArt/
  )
  // A demo address is the one field this file may not carry: it belongs to the environment serving
  // the card, and a pinned one is wrong everywhere else.
  assert.throws(
    () =>
      designInspirationFrom({
        tag: EMDASH.tag,
        template: 'tracy-business',
        doc: card({ demo: { url: 'https://business-emdash.tracy.ai', version: '1.0.0' } })
      }),
    /demo is the server's, not the file's/
  )
})

test('a card naming another template than the setting is refused, not quietly rewritten', () => {
  assert.throws(
    () => designInspirationFrom({ tag: EMDASH.tag, template: 'tracy-base', doc: card() }),
    /tracy-business.*tracy-base|tracy-base.*tracy-business/
  )
})

test('a card that leaves the template out takes the one the setting declares — one source, not two', () => {
  const doc = card()
  delete doc.template
  assert.equal(
    designInspirationFrom({ tag: EMDASH.tag, template: 'tracy-business', doc }).template,
    'tracy-business'
  )
  // With no template anywhere there is nothing to transcribe, and the validator says so.
  assert.throws(() => designInspirationFrom({ tag: EMDASH.tag, doc }), /template must be a template id/)
})
test('a pin naming a file the release does not carry is reported, and one that matches is not', () => {
  const repo = 'JoomlArt-Products/ja-products'
  const assets = { [`${repo} tracy-apple/j6`]: ['a-1.0.0.zip'] }
  const problems = pinProblems(
    [
      { repo, tag: 'tracy-apple/j6', file: 'a-1.0.0.zip', where: 'x.json' },
      { repo, tag: 'tracy-apple/j6', file: 'tracy-apple-j6-webroot-1.2.0.tar.gz', where: 'y.json' }
    ],
    assets
  )
  assert.equal(problems.length, 1)
  assert.match(problems[0], /y\.json.*webroot-1\.2\.0.*tracy-apple\/j6/)
})
