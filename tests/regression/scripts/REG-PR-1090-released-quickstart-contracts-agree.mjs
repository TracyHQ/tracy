/**
 * REG-PR-1090: after the 09/10/2026 re-release, what Tracy seals each new site with agrees with what
 * the Claude Cowork plugin carries and what the release serves. No network, no stand:
 *   S1 ja-essence/j6/1.0.3 is byte for byte the contract #1083 released (Claude Cowork for Joomla
 *      0.24.5/0.24.6 carry these SHA-256) — #1087 had merged one built from 1.0.2;
 *   S2 both quickstarts.json pin JA Voyara 1.0.5 or later on Claude Cowork 0.24.6 or later, the pin's
 *      contract files are the tch contract's own, and both design-templates.json follow the pin;
 *   S3 ja-kinetic/j6/1.0.4 carries a demo-trim map that is current for its contract
 *      (build-joomla-demo-trim.mjs --check) and hides the 241 demo posts;
 *   S4 the gates that judge contracts and pins pass;
 *   S5 Kinetic is pinned at its current release (1.0.8) on Claude Cowork 0.24.36 or later, which carries
 *      its demo-trim map (1.0.4 on 0.24.7 was the first such pin);
 *   S6 JA Trip, Spa and Space (batch 2, #1095) are pinned at their tokenized versions or later on Claude Cowork
 *      0.24.8 or later; the pin's contract files are the tch contract's own, and every older version
 *      the pin says the plugin also carries has the same files in tch;
 *   S7 JA Voyara 1.0.6 and JA Spa 1.0.3 and 1.0.4 (Joomla releases of 10/10/2026) have a profile of their
 *      own: the content map is the previous profile's byte for byte, the lock differs from it only in
 *      the hashes of the files each release changed (the release's own VERIFICATION.json list), and
 *      Tracy resolves each exactly, so publishing the Design inspiration card raises no LOWER_CONTRACT.
 *      The profiles ship in Claude Cowork for Joomla 0.24.16: that is their floor, no pending marker
 *      remains, every pin is on that plugin or later and answers for the three versions through
 *      `coworkPinFor`. The list of changed files is the one derived from comparing the release archives
 *      (the archives are large, so this case records the result and the verification run compares the
 *      archives themselves).
 *
 * "OR LATER" (10/10/2026, #1100): the plugin version each section names is the FIRST release that
 * carries that contract, which is what a new site needs. A later plugin carrying the same profiles is
 * the same seal with more fixes, and `scripts/pin-joomla-cowork.mjs` moves the pins onto it only after
 * reading the release's zip and finding every profile the pin records byte for byte; the hash checks
 * below still hold the recorded profiles to this tree. An exact version here would go red on every
 * such move (0.24.9 is the first) without anything having broken.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, ROOT, run } from './lib.mjs'

const c = checks()
const sha = (p) =>
  createHash('sha256')
    .update(readFileSync(join(ROOT, p)))
    .digest('hex')
const C = 'packages/cms/tracy-joomla-quickstart/contracts'
/** `version` is `floor` or a later X.Y.Z release. */
const atLeast = (version, floor) => {
  const [a, b] = [version, floor].map((v) => String(v).split('.').map(Number))
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}

// S1
const ESSENCE = {
  'manifest.json': 'fbd41349fa3234aea03531ced71c03ca91e7f4ae0d8ef33be02f0ac7f5402b23',
  'content-map.json': '836b332e6c76f5f97d537f4d4f6984f3d2386f3ec8dfd952d2654faaf2570f77',
  'presentation-lock.json': '0d78fe39e658babedfdb77fca7534c3c3eb58882e4a933fd225cec956de48a12'
}
for (const [f, want] of Object.entries(ESSENCE))
  c.eq(`S1 ja-essence/j6/1.0.3 ${f} is the carried one`, sha(`${C}/ja-essence/j6/1.0.3/${f}`), want)

// S2 Voyara 1.0.5 was the first such pin; the pin moves on with each release (1.0.10 at batch 2),
// so the case holds the CURRENT pin to its own contract files rather than one exact version.
const voyaraPins = new Set()
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const pin = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))['quickstart/ja-voyara/j6']
  c.check(`S2 ${file}: Voyara version at least 1.0.5`, atLeast(pin.version, '1.0.5'), pin.version)
  c.eq(`S2 ${file}: Voyara contract`, pin.contract, `ja-voyara/j6/${pin.version}`)
  c.check(
    `S2 ${file}: Claude Cowork at least 0.24.6`,
    atLeast(pin.cowork.version, '0.24.6'),
    pin.cowork.version
  )
  for (const [f, h] of Object.entries(pin.cowork.contractFiles))
    c.eq(`S2 ${file}: contract ${f}`, h, sha(`${C}/ja-voyara/j6/${pin.version}/${f}`))
  voyaraPins.add(pin.version)
}
c.eq('S2 both quickstarts.json pin the same Voyara', voyaraPins.size, 1)
const [VOYARA] = voyaraPins
for (const file of [
  'apps/tracy-web/src/design-templates.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json'
]) {
  const d = JSON.parse(readFileSync(join(ROOT, file), 'utf8')).designs['ja-voyara']
  c.eq(`S2 ${file}: Voyara profile`, d.contractProfile, `ja-voyara/j6/${VOYARA}`)
  c.eq(`S2 ${file}: Voyara base`, d.base.version, VOYARA)
}

// S3
const map = JSON.parse(readFileSync(join(ROOT, `${C}/ja-kinetic/j6/1.0.4/demo-trim-map.json`), 'utf8'))
c.eq('S3 the map is for ja-kinetic/j6/1.0.4', map.contract, 'ja-kinetic/j6/1.0.4')
c.check(
  'S3 it hides the 241 demo posts',
  map.hide.filter((h) => String(h.key ?? h).startsWith('article-')).length === 241,
  map.counts
)
const trim = run(process.execPath, ['scripts/build-joomla-demo-trim.mjs', '--check'])
c.eq('S3 build-joomla-demo-trim.mjs --check', trim.status, 0)

// S5 Kinetic is pinned at its current release on the plugin that carries that release's demo-trim map.
// 1.0.4 on 0.24.7 was the first such pin; 1.0.8 (the role-variable release, 16/10/2026) ships in
// Claude Cowork for Joomla 0.24.36, which carries its demo-trim map.
const KINETIC = { version: '1.0.8', cowork: '0.24.36' }
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const pin = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))['quickstart/ja-kinetic/j6']
  c.eq(`S5 ${file}: Kinetic version`, pin.version, KINETIC.version)
  c.check(
    `S5 ${file}: Kinetic Claude Cowork at least ${KINETIC.cowork}`,
    atLeast(pin.cowork.version, KINETIC.cowork),
    pin.cowork.version
  )
  c.eq(
    `S5 ${file}: the pin carries the demo-trim map`,
    pin.cowork.contractFiles['demo-trim-map.json'],
    sha(`${C}/ja-kinetic/j6/${KINETIC.version}/demo-trim-map.json`)
  )
}
for (const file of [
  'apps/tracy-web/src/design-templates.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json'
]) {
  const d = JSON.parse(readFileSync(join(ROOT, file), 'utf8')).designs['ja-kinetic']
  c.eq(`S5 ${file}: Kinetic profile`, d.contractProfile, `ja-kinetic/j6/${KINETIC.version}`)
  c.eq(`S5 ${file}: Kinetic needs the plugin that carries its map`, d.coworkMinVersion, KINETIC.cowork)
}

// S6 the three pinned templates of batch 2 follow their switch onto Claude Cowork 0.24.8 or later
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const cat = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  // The first pinned version of each; the pin follows later releases, so the current pin is held
  // to its own contract and release files.
  for (const [t, first] of [
    ['ja-trip', '1.0.4'],
    ['ja-spa', '1.0.2'],
    ['ja-space', '1.0.3']
  ]) {
    const pin = cat[`quickstart/${t}/j6`]
    const v = pin.version
    c.check(`S6 ${file}: ${t} version at least ${first}`, atLeast(v, first), v)
    c.eq(`S6 ${file}: ${t} contract`, pin.contract, `${t}/j6/${v}`)
    c.check(
      `S6 ${file}: ${t} Claude Cowork at least 0.24.8`,
      atLeast(pin.cowork.version, '0.24.8'),
      pin.cowork.version
    )
    c.eq(`S6 ${file}: ${t} webroot`, pin.webroot.file, `${t}-j6-webroot-${v}.tar.gz`)
    c.eq(`S6 ${file}: ${t} database`, pin.database.file, `${t}-j6-database-${v}.sql.gz`)
    for (const [f, h] of Object.entries(pin.cowork.contractFiles))
      c.eq(`S6 ${file}: ${t} contract ${f}`, h, sha(`${C}/${t}/j6/${v}/${f}`))
    for (const o of pin.cowork.contractVersions)
      for (const [f, h] of Object.entries(pin.cowork.alsoCarries[`${t}/j6/${o}`] ?? { missing: '' }))
        c.eq(
          `S6 ${file}: ${t} also carries ${o} ${f}`,
          h,
          f === 'missing' ? 'carried' : sha(`${C}/${t}/j6/${o}/${f}`)
        )
  }
}

// S7
const { coworkPinFor, readContracts } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/contracts.js')).href
)
const { contractStatus, contractWarnings } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/brief-support.js')).href
)
const index = readContracts()
const digest = (text) => createHash('sha256').update(text).digest('hex')
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const T = 'templates'
for (const [slug, version, previous, changed] of [
  [
    'ja-voyara',
    '1.0.6',
    '1.0.5',
    [`${T}/ja_voyara/local/etc/site/default.json`, `${T}/ja_voyara/templateDetails.xml`]
  ],
  ['ja-spa', '1.0.3', '1.0.2', [`${T}/ja_spa/etc/theme/default.json`, `${T}/ja_spa/templateDetails.xml`]],
  [
    'ja-spa',
    '1.0.4',
    '1.0.3',
    [
      `${T}/ja_spa/AGENTS.md`,
      `${T}/ja_spa/css/error.css`,
      `${T}/ja_spa/css/offline.css`,
      `${T}/ja_spa/docs/design-system.md`,
      `${T}/ja_spa/error.php`,
      `${T}/ja_spa/offline.php`,
      `${T}/ja_spa/templateDetails.xml`
    ]
  ]
]) {
  const here = `${C}/${slug}/j6/${version}`
  const before = `${C}/${slug}/j6/${previous}`
  const name = `S7 ${slug}/j6/${version}`
  const manifest = json(`${here}/manifest.json`)
  c.eq(`${name}: manifest id`, manifest.id, `${slug}/j6/${version}`)
  c.eq(`${name}: manifest release version`, manifest.quickstart.version, version)
  c.eq(
    `${name}: webroot file`,
    manifest.quickstart.parts.webroot.file,
    `${slug}-j6-webroot-${version}.tar.gz`
  )
  c.eq(
    `${name}: database file`,
    manifest.quickstart.parts.database.file,
    `${slug}-j6-database-${version}.sql.gz`
  )
  c.eq(
    `${name}: content map is ${previous}'s`,
    sha(`${here}/content-map.json`),
    sha(`${before}/content-map.json`)
  )
  c.eq(`${name}: design sidecar is ${previous}'s`, sha(`${here}.design.json`), sha(`${before}.design.json`))
  const [lock, was] = [json(`${here}/presentation-lock.json`), json(`${before}/presentation-lock.json`)]
  const { files: nowFiles, ...nowRest } = lock
  const { files: wasFiles, ...wasRest } = was
  c.eq(
    `${name}: lock outside files is ${previous}'s`,
    digest(JSON.stringify(nowRest)),
    digest(JSON.stringify(wasRest))
  )
  c.eq(
    `${name}: same locked paths`,
    digest(Object.keys(nowFiles).sort().join('\n')),
    digest(Object.keys(wasFiles).sort().join('\n'))
  )
  c.eq(
    `${name}: only the files the release changed differ`,
    Object.keys(nowFiles)
      .filter((f) => nowFiles[f] !== wasFiles[f])
      .sort()
      .join('\n'),
    [...changed].sort().join('\n')
  )
  // The profile ships in Claude Cowork for Joomla 0.24.16 (published asset, manifests byte for byte the
  // package's): the floor is that version, there is no pending marker, a pin names the profile, and
  // every pin's plugin meets the floor and answers for this version through `coworkPinFor`.
  const profile = `${slug}/j6/${version}`
  const floor = [...index.values()].find((x) => x.id === profile)?.coworkMinVersion
  c.eq(`${name}: plugin floor is the release that carries it`, floor, '0.24.16')
  c.eq(`${name}: manifest coworkContractVersion`, manifest.coworkContractVersion, '0.24.16')
  c.check(
    `${name}: no pending marker`,
    !('coworkContractPending' in manifest),
    manifest.coworkContractPending
  )
  for (const file of [
    'apps/tracy-web/src/quickstarts.json',
    'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
  ]) {
    const pin = json(file)[`quickstart/${slug}/j6`]
    c.check(
      `${name}: ${file} names the profile`,
      pin.contract === profile || profile in (pin.cowork.alsoCarries ?? {}),
      pin.contract
    )
    c.check(`${name}: ${file} pins plugin ${pin.cowork.version}`, atLeast(pin.cowork.version, floor), floor)
    const got = coworkPinFor(`quickstart/${slug}/j6`, version, join(ROOT, file))
    c.eq(`${name}: ${file} coworkPinFor answers`, got?.sha256, pin.cowork.sha256)
    c.eq(`${name}: ${file} coworkPinFor version`, got?.version, pin.cowork.version)
  }
  const build = { platform: 'joomla', tag: `quickstart/${slug}/j6`, version }
  c.eq(
    `${name}: resolves exactly`,
    JSON.stringify(contractStatus(build, index)),
    JSON.stringify({ state: 'exact', profile: `${slug}/j6/${version}`, version })
  )
  c.eq(`${name}: no LOWER_CONTRACT on publish`, JSON.stringify(contractWarnings([build], index)), '[]')
}

// S4
const gates = run(
  'pnpm',
  [
    'exec',
    'tsx',
    'scripts/check-all.ts',
    '--only',
    'contracts',
    '--only',
    'design-templates',
    '--only',
    'quickstart-overrides',
    '--only',
    'joomla-demo-trim'
  ],
  { timeoutS: 900 }
)
c.check(
  'S4 contracts, design-templates, quickstart-overrides, joomla-demo-trim pass',
  gates.status === 0,
  gates.stdout.split('\n').slice(-4).join(' ')
)
c.done()
