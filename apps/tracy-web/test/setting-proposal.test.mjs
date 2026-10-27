/**
 * The file an administrator would write for a release that has none — composed from the release
 * itself, with every field saying where its value came from.
 *
 * WHY EVERY FIELD CARRIES A SOURCE. The screen shows this before anything is written, and the
 * whole point of the review is telling apart "GitHub says so" from "this is a default nobody
 * chose". A proposal that hands back six confident-looking strings is a proposal nobody reads.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cmsVersionOf,
  fileIn,
  labelOf,
  namesIn,
  packageOf,
  proposalFrom,
  readPackage
} from '../src/lib/setting-proposal.js'
import { QUICKSTART_PACKAGE, QUICKSTART_SHA256 } from './_quickstart-package.mjs'

/** A release as `readReleases` hands one over: no setting, one classic package attached. */
const release = (over = {}) => ({
  tag: 'quickstart/ja-space/j6',
  name: 'Quickstart: JA Space / Joomla 6',
  kind: 'quickstart',
  github: 'published',
  tracy: 'no-setting',
  setting: null,
  assets: [
    { name: 'ja-space-j6-quickstart.zip', size: 51_200_000, id: 71 },
    { name: 'README.txt', size: 400, id: 72 }
  ],
  ...over
})

/** The package as the door reads it after downloading the bytes. */
const attached = readPackage('ja-space-j6-quickstart.zip', QUICKSTART_PACKAGE)

test('a release name becomes the label a person sees, without the packaging words', () => {
  assert.equal(labelOf('Quickstart: JA Space / Joomla 6'), 'JA Space')
  assert.equal(labelOf('Quickstart: Purity III'), 'Purity III')
  assert.equal(labelOf('JA Kinetic / Joomla 6'), 'JA Kinetic')
  // Neither half is there to strip — the name is already the label.
  assert.equal(labelOf('Tracy Business'), 'Tracy Business')
  // The CMS is stripped by name, not by "everything after the last slash": a release whose title
  // genuinely carries one keeps it.
  assert.equal(labelOf('Quickstart: Blog / Magazine'), 'Blog / Magazine')
})

test('the package is read where it sits: its names, and one file out of it', () => {
  const names = namesIn(QUICKSTART_PACKAGE)
  assert.ok(names.includes('installation/joomla.php'), 'the CLI installer says this is a classic package')
  assert.ok(names.includes('templates/ja_space/index.php'))
  // A deflated entry, not a stored one: the reader inflates rather than copying bytes out.
  assert.match(fileIn(QUICKSTART_PACKAGE, 'libraries/src/Version.php'), /MAJOR_VERSION = 6;/)
  // A stored entry — the same reader, the other compression method.
  assert.match(fileIn(QUICKSTART_PACKAGE, 'installation/joomla.php'), /joomla installer cli/)
  assert.equal(fileIn(QUICKSTART_PACKAGE, 'libraries/src/Nothing.php'), null)
})

test('the pin is computed from the bytes the release serves, because this release signed none', () => {
  const pkg = readPackage('ja-space-j6-quickstart.zip', QUICKSTART_PACKAGE)
  assert.equal(pkg.file, 'ja-space-j6-quickstart.zip')
  assert.equal(pkg.sha256, QUICKSTART_SHA256)
  assert.ok(pkg.names.includes('installation/joomla.php'))
  assert.match(pkg.php, /MAJOR_VERSION = 6;/)
})

test('the CMS version is the one the package would install, read out of its own Version.php', () => {
  assert.equal(cmsVersionOf(fileIn(QUICKSTART_PACKAGE, 'libraries/src/Version.php')), '6.0.3')
  // A pre-release carries its suffix — Joomla writes it as a fourth constant, not in PATCH.
  assert.equal(
    cmsVersionOf(
      "const MAJOR_VERSION = 5;\nconst MINOR_VERSION = 4;\nconst PATCH_VERSION = 0;\nconst EXTRA_VERSION = 'beta2';"
    ),
    '5.4.0-beta2'
  )
  // Half a file says nothing: a version composed from two of three numbers would be a fact the
  // screen shows with no mark on it.
  assert.equal(cmsVersionOf('const MAJOR_VERSION = 5;'), null)
  assert.equal(cmsVersionOf(null), null)
})

test('which file would be installed, and when the answer is not a single one', () => {
  assert.deepEqual(packageOf(release()), { file: 'ja-space-j6-quickstart.zip' })
  // Two packages is not a tie to break: which one a customer's site is built from is not a coin
  // toss. Same rule `scripts/tracy-setting.mjs` keeps, and the same sentence.
  const two = packageOf(
    release({
      assets: [
        { name: 'a-quickstart.zip', size: 1, id: 1 },
        { name: 'b-quickstart.zip', size: 1, id: 2 }
      ]
    })
  )
  assert.equal(two.file, undefined)
  assert.match(two.why, /a-quickstart\.zip, b-quickstart\.zip/, 'and it names both, so a person can look')
  assert.match(packageOf(release({ assets: [] })).why, /no zip/i)
  // The installer shape is Joomla's; no WordPress package carries a Joomla installer.
  assert.match(packageOf(release({ tag: 'quickstart/ja-space/wp7' })).why, /joomla/i)
})

test('every field of the proposal says where its value came from', () => {
  const p = proposalFrom({ release: release(), pkg: attached })
  assert.deepEqual(Object.fromEntries(Object.entries(p.fields).map(([k, f]) => [k, [f.value, f.source]])), {
    platform: ['joomla', 'release'],
    label: ['JA Space', 'release'],
    // Nobody chose this one, and the screen has to be able to say so.
    version: ['1.0.0', 'default'],
    cms: ['6.0.3', 'package'],
    template: ['ja_space', 'package']
  })
  assert.deepEqual(p.install, {
    value: { installer: { file: 'ja-space-j6-quickstart.zip', sha256: QUICKSTART_SHA256 } },
    source: 'package',
    why: null
  })
  assert.deepEqual(p.document, {
    schemaVersion: 'tracy-setting/v1',
    platform: 'joomla',
    label: 'JA Space',
    version: '1.0.0',
    cms: '6.0.3',
    template: 'ja_space',
    install: { installer: { file: 'ja-space-j6-quickstart.zip', sha256: QUICKSTART_SHA256 } }
  })
  assert.deepEqual(p.problems, [], 'what it proposes is a file the product would accept')
})

test('what cannot be read comes back null with a reason, never as a confident guess', () => {
  // A package with no Version.php and no template of its own: two fields nobody can fill in here.
  const p = proposalFrom({
    release: release(),
    pkg: { ...attached, names: ['installation/joomla.php', 'templates/cassiopeia/index.php'], php: null }
  })
  assert.equal(p.fields.cms.value, null)
  assert.equal(p.fields.cms.source, null)
  assert.match(p.fields.cms.why, /Version\.php/)
  assert.equal(p.fields.template.value, null)
  assert.match(p.fields.template.why, /templates\//)
  assert.equal(p.document, null, 'a half-composed file is not offered for a press')
  assert.ok(
    p.problems.some((s) => /cms/.test(s)),
    'and the reason is the validator’s own sentence'
  )
})

test('a package that is not a classic Joomla quickstart is refused, not patched up', () => {
  const p = proposalFrom({
    release: release(),
    pkg: { ...attached, names: ['index.php', 'wp-admin/admin.php'] }
  })
  assert.equal(p.install.value, null)
  assert.match(p.install.why, /installation\/joomla\.php/)
  assert.equal(p.document, null)
})
