import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkFeedUnchanged, compareVersions, parseFeed, preflight } from '../build/release-preflight.mjs'

const SHA = 'a'.repeat(40)

/** The fuse wire of a packaged app as build/fuses.mjs leaves it. */
const HARDENED_FUSES = [{ version: 1, states: [48, 49, 48, 48, 48, 48, 48, 49] }]

/** A dev candidate that passes every check; each test breaks exactly one fact. */
function goodFacts(overrides = {}) {
  return {
    channel: 'dev',
    sha: SHA,
    tree: { porcelain: '' },
    ancestry: { branch: 'origin/develop', isAncestor: true },
    ci: {
      runs: [{ id: 1, head_sha: SHA, status: 'completed', conclusion: 'success', html_url: 'https://ci/1' }]
    },
    candidate: { version: '0.3.0-dev.2', buildId: 'b2' },
    feed: { url: 'https://update.example/desktop/dev-mac.yml', text: 'version: 0.3.0-dev.1\nbuildId: b1\n' },
    notes: { text: 'Sign-in now returns to the app.\n' },
    contract: {
      origin: 'https://cowork.tracy.site',
      results: [{ id: 'auth-me', method: 'GET', path: '/auth/me', ok: true, reasons: [] }]
    },
    signature: { skipped: 'no --artifact given' },
    artifacts: {
      expected: [{ name: 'Tracy-Cowork-Dev-0.3.0-dev.2-arm64.zip', sha512: 'eA==', size: 1 }],
      downloaded: [{ name: 'Tracy-Cowork-Dev-0.3.0-dev.2-arm64.zip', sha512: 'eA==', size: 1 }]
    },
    ...overrides
  }
}

/** The status of one named check. */
const statusOf = (results, name) => {
  const found = results.find((r) => r.check === name)
  assert.ok(found, `no check named ${name}: ${results.map((r) => r.check).join(', ')}`)
  return found.status
}

test('a candidate whose every fact is right passes every check, and an unchecked signature says so', () => {
  const results = preflight(goodFacts())
  for (const r of results.filter((x) => x.check !== 'signature')) assert.equal(r.status, 'PASS', r.check)
  assert.equal(statusOf(results, 'signature'), 'SKIP')
  assert.match(results.find((r) => r.check === 'signature').detail, /not checked/)
})

test('a dirty tree fails, and names what is dirty', () => {
  const results = preflight(goodFacts({ tree: { porcelain: ' M src/main.js\n?? scratch.txt\n' } }))
  assert.equal(statusOf(results, 'clean tree'), 'FAIL')
  assert.match(results.find((r) => r.check === 'clean tree').detail, /src\/main\.js/)
})

test('a sha that is not in the channel branch history fails', () => {
  const results = preflight(goodFacts({ ancestry: { branch: 'origin/develop', isAncestor: false } }))
  assert.equal(statusOf(results, 'on origin'), 'FAIL')
})

test('only a completed, successful Tracy CI run on exactly this sha counts', () => {
  const run = (over) => ({ id: 2, head_sha: SHA, status: 'completed', conclusion: 'success', ...over })
  for (const runs of [
    [],
    [run({ conclusion: 'failure' })],
    [run({ status: 'in_progress', conclusion: null })],
    [run({ head_sha: 'b'.repeat(40) })]
  ])
    assert.equal(
      statusOf(preflight(goodFacts({ ci: { runs } })), 'ci green on sha'),
      'FAIL',
      JSON.stringify(runs)
    )
  assert.equal(
    statusOf(
      preflight(goodFacts({ ci: { runs: [run({ conclusion: 'failure' }), run({ id: 3 })] } })),
      'ci green on sha'
    ),
    'PASS'
  )
  assert.equal(
    statusOf(preflight(goodFacts({ ci: { error: 'gh: not logged in' } })), 'ci green on sha'),
    'FAIL'
  )
})

test('version order: a release beats its dev builds, dev builds order by N numerically', () => {
  assert.ok(compareVersions('0.3.0', '0.3.0-dev.17') > 0)
  assert.ok(compareVersions('0.3.0-dev.10', '0.3.0-dev.9') > 0)
  assert.ok(compareVersions('0.3.1-dev.1', '0.3.0') > 0)
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0)
  assert.equal(compareVersions('0.3.0-dev.2', '0.3.0-dev.2'), 0)
})

test('the candidate version must be strictly greater than the one on the channel feed', () => {
  const at = (version, feedText) =>
    statusOf(
      preflight(goodFacts({ candidate: { version, buildId: 'b9' }, feed: { url: 'f', text: feedText } })),
      'version above feed'
    )
  assert.equal(at('0.3.0-dev.2', 'version: 0.3.0-dev.1\n'), 'PASS')
  assert.equal(at('0.3.0-dev.1', 'version: 0.3.0-dev.2\n'), 'FAIL')
  assert.equal(at('0.2.9-dev.5', 'version: 0.3.0-dev.1\n'), 'FAIL')
})

test('the same version is allowed only as a re-run of the very build already published', () => {
  const at = (buildId, feedText) =>
    statusOf(
      preflight(
        goodFacts({ candidate: { version: '0.3.0-dev.1', buildId }, feed: { url: 'f', text: feedText } })
      ),
      'version above feed'
    )
  assert.equal(at('b1', 'version: 0.3.0-dev.1\nbuildId: b1\n'), 'PASS')
  assert.equal(at('b7', 'version: 0.3.0-dev.1\nbuildId: b1\n'), 'FAIL')
  assert.equal(at(null, 'version: 0.3.0-dev.1\nbuildId: b1\n'), 'FAIL')
  // A feed that does not say which build it serves cannot prove a re-run.
  assert.equal(at('b1', 'version: 0.3.0-dev.1\n'), 'FAIL')
})

test('each channel takes only its own version form', () => {
  const dev = (version) =>
    statusOf(preflight(goodFacts({ candidate: { version, buildId: 'x' } })), 'version above feed')
  assert.equal(dev('0.4.0'), 'FAIL')
  const stable = (version) =>
    statusOf(
      preflight(
        goodFacts({
          channel: 'stable',
          ancestry: { branch: 'origin/main', isAncestor: true },
          candidate: { version, buildId: 'x' },
          feed: { url: 'f', text: 'version: 0.3.0\n' }
        })
      ),
      'version above feed'
    )
  assert.equal(stable('0.3.1'), 'PASS')
  assert.equal(stable('0.3.1-dev.1'), 'FAIL')
})

test('no feed yet is a first release; an unreadable feed is a failure, never an empty one', () => {
  assert.equal(
    statusOf(preflight(goodFacts({ feed: { url: 'f', missing: true } })), 'version above feed'),
    'PASS'
  )
  assert.equal(
    statusOf(preflight(goodFacts({ feed: { url: 'f', error: 'HTTP 503' } })), 'version above feed'),
    'FAIL'
  )
  assert.equal(
    statusOf(preflight(goodFacts({ feed: { url: 'f', text: 'files: []\n' } })), 'version above feed'),
    'FAIL'
  )
})

test('parseFeed reads the version and build id of a channel file', () => {
  assert.deepEqual(
    parseFeed("version: 0.3.0-dev.4\nbuildId: 20261009-ab12\npath: x.zip\nreleaseDate: '2026'\n"),
    {
      version: '0.3.0-dev.4',
      buildId: '20261009-ab12'
    }
  )
  assert.deepEqual(parseFeed('version: 0.3.0\nfiles:\n  - url: a.zip\n'), { version: '0.3.0', buildId: null })
})

test('release notes with Vietnamese fail; plain English passes; no notes is not checked', () => {
  assert.equal(
    statusOf(preflight(goodFacts({ notes: { text: 'Đăng nhập nhanh hơn' } })), 'notes in English'),
    'FAIL'
  )
  // Decomposed marks (NFD) are the same letters.
  assert.equal(
    statusOf(preflight(goodFacts({ notes: { text: 'Sua loi dang nhập' } })), 'notes in English'),
    'FAIL'
  )
  assert.equal(statusOf(preflight(goodFacts({ notes: null })), 'notes in English'), 'SKIP')
})

test('server contract fails when any door fails or the check could not run', () => {
  const broken = {
    origin: 'https://o',
    results: [
      { id: 'a', method: 'GET', path: '/a', ok: true, reasons: [] },
      { id: 'b', method: 'GET', path: '/b', ok: false, reasons: ['status 404, expected 200'] }
    ]
  }
  const results = preflight(goodFacts({ contract: broken }))
  assert.equal(statusOf(results, 'server contract'), 'FAIL')
  assert.match(results.find((r) => r.check === 'server contract').detail, /\/b/)
  assert.equal(
    statusOf(preflight(goodFacts({ contract: { origin: 'o', error: 'boom' } })), 'server contract'),
    'FAIL'
  )
})

test('a checked signature passes only as a notarized Developer ID app of the right team and variant', () => {
  const signed = {
    codesignVerify: { ok: true, output: '' },
    codesignInfo: 'Authority=Developer ID Application: Tracy (9S5F8693FB)\nTeamIdentifier=9S5F8693FB\n',
    spctl: 'Tracy Cowork Dev.app: accepted\nsource=Notarized Developer ID\n',
    stapler: { ok: true, output: 'The validate action worked!' },
    bundleId: 'ai.tracy.cowork.dev',
    origin: 'https://cowork.tracy.site',
    updateChannel: 'dev',
    updateFeed: 'https://update.tracy.site/desktop',
    fuses: HARDENED_FUSES,
    debugGuard: true
  }
  assert.equal(statusOf(preflight(goodFacts({ signature: signed })), 'signature'), 'PASS')
  for (const broken of [
    { codesignVerify: { ok: false, output: 'invalid signature' } },
    { codesignInfo: 'Signature=adhoc\nTeamIdentifier=not set\n' },
    { codesignInfo: 'Authority=Developer ID Application: Someone (AAAAAAAAAA)\nTeamIdentifier=AAAAAAAAAA\n' },
    { spctl: 'rejected\nsource=Unnotarized Developer ID\n' },
    { stapler: { ok: false, output: 'does not have a ticket stapled' } },
    { bundleId: 'ai.tracy.cowork' },
    { origin: 'https://cowork.tracy.ai' },
    { updateChannel: '' },
    { updateFeed: 'http://127.0.0.1:17910/desktop' },
    // the stable channel's feed in a dev app: it would follow the production feed
    { updateFeed: 'https://update.tracy.ai/desktop' },
    { updateFeed: '' }
  ])
    assert.equal(
      statusOf(preflight(goodFacts({ signature: { ...signed, ...broken } })), 'signature'),
      'FAIL',
      JSON.stringify(broken)
    )
})

test('an artifact that was named but could not be read fails; it is not "not checked"', () => {
  const results = preflight(goodFacts({ signature: { error: 'no app at /tmp/missing.app' } }))
  assert.equal(statusOf(results, 'signature'), 'FAIL')
})

test('a candidate whose version could not be read fails the version check', () => {
  const results = preflight(
    goodFacts({ candidate: { version: null, buildId: null, error: 'no package.json at sha' } })
  )
  assert.equal(statusOf(results, 'version above feed'), 'FAIL')
  assert.match(results.find((r) => r.check === 'version above feed').detail, /no package\.json/)
})

test('a Tracy CI answer without a run list is a failure to read, not "no runs"', () => {
  assert.equal(statusOf(preflight(goodFacts({ ci: {} })), 'ci green on sha'), 'FAIL')
})

// ── B3: what publish checks on the target ────────────────────────────────────────────────────────

const ZIP = { name: 'Tracy-Cowork-Dev-0.3.0-dev.2-arm64.zip', sha512: 'Zm9v', size: 3 }
const DMG = { name: 'Tracy-Cowork-Dev-0.3.0-dev.2-arm64.dmg', sha512: 'YmFy', size: 3 }

test('artifacts downloaded from the target must match the manifest byte for byte', () => {
  const ok = preflight(goodFacts({ artifacts: { expected: [ZIP, DMG], downloaded: [ZIP, DMG] } }))
  assert.equal(statusOf(ok, 'artifacts match manifest'), 'PASS')

  const swapped = preflight(
    goodFacts({ artifacts: { expected: [ZIP, DMG], downloaded: [ZIP, { ...DMG, sha512: 'b3RoZXI=' }] } })
  )
  assert.equal(statusOf(swapped, 'artifacts match manifest'), 'FAIL')
  assert.match(swapped.find((r) => r.check === 'artifacts match manifest').detail, /\.dmg/)

  const gone = preflight(
    goodFacts({
      artifacts: { expected: [ZIP, DMG], downloaded: [ZIP, { name: DMG.name, error: 'not on the target' }] }
    })
  )
  assert.equal(statusOf(gone, 'artifacts match manifest'), 'FAIL')
  assert.match(gone.find((r) => r.check === 'artifacts match manifest').detail, /not on the target/)
})

test('a manifest that lists no artifact fails; no artifact facts at all is "not checked"', () => {
  assert.equal(
    statusOf(
      preflight(goodFacts({ artifacts: { expected: [], downloaded: [] } })),
      'artifacts match manifest'
    ),
    'FAIL'
  )
  assert.equal(statusOf(preflight(goodFacts({ artifacts: undefined })), 'artifacts match manifest'), 'SKIP')
})

test('the feed must be exactly as it was read: same etag, or still absent', () => {
  assert.equal(checkFeedUnchanged({ etag: '"a"' }, { etag: '"a"' }).status, 'PASS')
  assert.equal(checkFeedUnchanged({ missing: true }, { missing: true }).status, 'PASS')
  assert.equal(checkFeedUnchanged({ etag: '"a"' }, { etag: '"b"' }).status, 'FAIL')
  assert.equal(checkFeedUnchanged({ missing: true }, { etag: '"b"' }).status, 'FAIL')
  assert.equal(checkFeedUnchanged({ etag: '"a"' }, { missing: true }).status, 'FAIL')
})

test('an app built against a test feed passes only when that test feed is the one expected', () => {
  const signed = {
    codesignVerify: { ok: true, output: '' },
    codesignInfo: 'Authority=Developer ID Application: Tracy (9S5F8693FB)\nTeamIdentifier=9S5F8693FB\n',
    spctl: 'source=Notarized Developer ID\n',
    stapler: { ok: true, output: '' },
    bundleId: 'ai.tracy.cowork.dev',
    origin: 'https://cowork.tracy.site',
    updateChannel: 'dev',
    updateFeed: 'http://127.0.0.1:17910/desktop',
    fuses: HARDENED_FUSES,
    debugGuard: true
  }
  const facts = goodFacts({ signature: signed, updateFeed: 'http://127.0.0.1:17910/desktop' })
  assert.equal(statusOf(preflight(facts), 'signature'), 'PASS')
  assert.equal(
    statusOf(preflight({ ...facts, updateFeed: 'https://update.tracy.site/desktop' }), 'signature'),
    'FAIL'
  )
})

test('release notes that name a third party fail; effects pass; no notes is not checked', () => {
  const name = 'notes name no third party'
  assert.equal(statusOf(preflight(goodFacts({ notes: { text: 'Updated Electron to 39' } })), name), 'FAIL')
  assert.equal(statusOf(preflight(goodFacts({ notes: { text: 'Security updates' } })), name), 'PASS')
  assert.equal(statusOf(preflight(goodFacts({ notes: null })), name), 'SKIP')
})

/** A dev app as the release checks read it, of the given archs. */
const signedApp = (archs) => ({
  codesignVerify: { ok: true, output: '' },
  codesignInfo: 'Authority=Developer ID Application: Tracy (9S5F8693FB)\nTeamIdentifier=9S5F8693FB\n',
  spctl: 'source=Notarized Developer ID\n',
  stapler: { ok: true, output: '' },
  bundleId: 'ai.tracy.cowork.dev',
  origin: 'https://cowork.tracy.site',
  updateChannel: 'dev',
  updateFeed: 'https://update.tracy.site/desktop',
  fuses: HARDENED_FUSES,
  debugGuard: true,
  archs
})

const ZIP_ARM = 'Tracy-Cowork-Dev-0.3.0-dev.2-arm64.zip'
const ZIP_X64 = 'Tracy-Cowork-Dev-0.3.0-dev.2-x64.zip'
const DMG_UNI = 'Tracy-Cowork-Dev-0.3.0-dev.2-universal.dmg'

test('every artifact of a release has its app checked, each in a line of its own', () => {
  const signatures = [
    { artifact: ZIP_ARM, expectArchs: ['arm64'], signature: signedApp(['arm64']) },
    { artifact: ZIP_X64, expectArchs: ['x86_64'], signature: signedApp(['x86_64']) },
    {
      artifact: DMG_UNI,
      expectArchs: ['arm64', 'x86_64'],
      signature: {
        ...signedApp(['x86_64', 'arm64']),
        container: { spctl: 'source=Notarized Developer ID\n', stapler: { ok: true, output: '' } }
      }
    }
  ]
  const results = preflight(goodFacts({ signature: undefined, signatures }))
  for (const name of [ZIP_ARM, ZIP_X64, DMG_UNI])
    assert.equal(statusOf(results, `signature ${name}`), 'PASS', name)
  assert.equal(results.filter((r) => r.check.startsWith('signature')).length, 3)

  // One bad app fails its own line only: the x64 zip notarized for nobody.
  const oneBad = signatures.map((s) =>
    s.artifact === ZIP_X64
      ? { ...s, signature: { ...s.signature, spctl: 'source=Unnotarized Developer ID\n' } }
      : s
  )
  const judged = preflight(goodFacts({ signature: undefined, signatures: oneBad }))
  assert.equal(statusOf(judged, `signature ${ZIP_X64}`), 'FAIL')
  assert.equal(statusOf(judged, `signature ${ZIP_ARM}`), 'PASS')
})

test("an app whose binary is not the artifact's arch fails: an x64 zip holding arm64, a universal dmg holding one arch", () => {
  for (const [artifact, expectArchs, archs] of [
    [ZIP_X64, ['x86_64'], ['arm64']],
    [DMG_UNI, ['arm64', 'x86_64'], ['arm64']],
    [ZIP_ARM, ['arm64'], ['x86_64', 'arm64']]
  ]) {
    const results = preflight(
      goodFacts({
        signature: undefined,
        signatures: [{ artifact, expectArchs, signature: signedApp(archs) }]
      })
    )
    assert.equal(statusOf(results, `signature ${artifact}`), 'FAIL', `${artifact} ${archs}`)
    assert.match(results.find((r) => r.check === `signature ${artifact}`).detail, /arch/)
  }
})

test('an app that could not be opened is a failure when the publish needs it, "not checked" otherwise', () => {
  const unopened = (signature) =>
    preflight(
      goodFacts({
        signature: undefined,
        signatures: [{ artifact: ZIP_ARM, expectArchs: ['arm64'], signature }]
      })
    )
  assert.equal(statusOf(unopened({ error: 'cannot open the zip here' }), `signature ${ZIP_ARM}`), 'FAIL')
  assert.equal(statusOf(unopened({ skipped: 'needs macOS' }), `signature ${ZIP_ARM}`), 'SKIP')
})

test('a dmg is judged as a container too: Developer ID signed, notarized and stapled, or its line fails', () => {
  const container = {
    spctl: 'Tracy-Cowork-Dev-0.3.0-dev.2-universal.dmg: accepted\nsource=Notarized Developer ID\n',
    stapler: { ok: true, output: 'The validate action worked!' }
  }
  const judge = (c) =>
    preflight(
      goodFacts({
        signature: undefined,
        signatures: [
          {
            artifact: DMG_UNI,
            expectArchs: ['arm64', 'x86_64'],
            signature: { ...signedApp(['arm64', 'x86_64']), container: c }
          }
        ]
      })
    ).find((r) => r.check === `signature ${DMG_UNI}`)
  assert.equal(judge(container).status, 'PASS')
  assert.match(judge(container).detail, /dmg notarized and stapled/)
  for (const [broken, why] of [
    [
      { ...container, spctl: 'rejected\nsource=no usable signature\n' },
      /dmg is not a notarized Developer ID/
    ],
    [
      { ...container, stapler: { ok: false, output: 'does not have a ticket stapled' } },
      /dmg has no stapled ticket/
    ],
    [undefined, /dmg container was not checked/]
  ]) {
    const r = judge(broken)
    assert.equal(r.status, 'FAIL', JSON.stringify(broken))
    assert.match(r.detail, why)
  }
  // A zip is no container to judge: its line does not ask for one.
  const zip = preflight(
    goodFacts({
      signature: undefined,
      signatures: [{ artifact: ZIP_ARM, expectArchs: ['arm64'], signature: signedApp(['arm64']) }]
    })
  )
  assert.equal(statusOf(zip, `signature ${ZIP_ARM}`), 'PASS')
})

test('an app whose Electron fuses are not hardened fails its signature line, naming the fuse', () => {
  const stock = [{ version: 1, states: [49, 48, 49, 49, 48, 48, 48, 49] }]
  const line = (fuses) =>
    preflight(
      goodFacts({
        signature: undefined,
        signatures: [
          { artifact: ZIP_ARM, expectArchs: ['arm64'], signature: { ...signedApp(['arm64']), fuses } }
        ]
      })
    ).find((r) => r.check === `signature ${ZIP_ARM}`)
  assert.equal(line(HARDENED_FUSES).status, 'PASS')
  assert.match(line(HARDENED_FUSES).detail, /fuses hardened/)
  assert.equal(line(stock).status, 'FAIL')
  assert.match(line(stock).detail, /RunAsNode is on.*EnableNodeCliInspectArguments is on/)
  assert.match(line(undefined).detail, /fuses were not read/)
})

test('an app whose main.js does not refuse remote-debugging switches first fails its signature line', () => {
  const line = (debugGuard) =>
    preflight(
      goodFacts({
        signature: undefined,
        signatures: [
          { artifact: ZIP_ARM, expectArchs: ['arm64'], signature: { ...signedApp(['arm64']), debugGuard } }
        ]
      })
    ).find((r) => r.check === `signature ${ZIP_ARM}`)
  assert.equal(line(true).status, 'PASS')
  assert.match(line(true).detail, /refuses remote debugging/)
  assert.equal(line(false).status, 'FAIL')
  assert.match(line(false).detail, /remote-debugging switches/)
  assert.equal(line(undefined).status, 'FAIL')
})

// ── Windows / Linux payloads, several channel files, the feed signature (W3) ─────────────────────

import { generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { pinnedFeedKeys } from '../build/release-preflight.mjs'

const requireCjs = createRequire(import.meta.url)
const { signFeed, publicKeyText } = requireCjs('../src/feed-signature.js')

/** The unpacked Windows app of a good dev candidate. */
const goodPayload = (over = {}) => ({
  version: '0.3.0-dev.2',
  arch: 'x64',
  fuses: HARDENED_FUSES,
  origin: 'https://cowork.tracy.site',
  updateChannel: 'dev',
  updateFeed: 'https://update.tracy.site/desktop',
  debugGuard: true,
  ...over
})

const payloadFacts = (payload, expectArch = 'x64') =>
  goodFacts({
    candidate: { version: '0.3.0-dev.2', buildId: 'b2' },
    updateFeed: 'https://update.tracy.site/desktop',
    payloads: [{ artifact: `Tracy-Cowork-Dev-0.3.0-dev.2-win-${expectArch}-setup.exe`, expectArch, payload }]
  })

test('an unsigned Windows/Linux app passes on what it is: version, arch, fuses, origin, channel, feed, debug guard', () => {
  const results = preflight(payloadFacts(goodPayload()))
  const line = results.find((r) => r.check === 'payload Tracy-Cowork-Dev-0.3.0-dev.2-win-x64-setup.exe')
  assert.equal(line.status, 'PASS', line.detail)
  assert.match(line.detail, /not code-signed/)
})

test('a Windows/Linux app that is not what its artifact says fails its line, naming each problem', () => {
  const cases = [
    [{ version: '0.3.0-dev.1' }, /version 0\.3\.0-dev\.1, expected 0\.3\.0-dev\.2/],
    [{ arch: 'arm64' }, /binary arch arm64, expected x64/],
    [{ fuses: [{ version: 1, states: [49, 49, 48, 48] }] }, /RunAsNode is on/],
    [{ origin: 'https://cowork.tracy.ai' }, /pinned origin/],
    [{ updateChannel: 'stable' }, /update channel stable/],
    [{ updateFeed: 'https://evil.test/desktop' }, /update feed/],
    [{ debugGuard: false }, /remote-debugging/]
  ]
  for (const [over, why] of cases) {
    const line = preflight(payloadFacts(goodPayload(over))).find((r) => r.check.startsWith('payload '))
    assert.equal(line.status, 'FAIL', JSON.stringify(over))
    assert.match(line.detail, why)
  }
  // Could not be unpacked: FAIL for a real store (publish says so), "not checked" on a test target.
  const failed = preflight(
    payloadFacts({ error: 'cannot unpack — a real store is never published unchecked' })
  )
  assert.equal(failed.find((r) => r.check.startsWith('payload ')).status, 'FAIL')
  const skipped = preflight(payloadFacts({ skipped: 'no unsquashfs' }))
  assert.equal(skipped.find((r) => r.check.startsWith('payload ')).status, 'SKIP')
})

test('with several channel files, the version rule is judged per channel file', () => {
  const results = preflight(
    goodFacts({
      feeds: [
        { file: 'dev-mac.yml', url: 'x/dev-mac.yml', text: 'version: 0.3.0-dev.1\nbuildId: b1\n' },
        { file: 'dev.yml', url: 'x/dev.yml', missing: true },
        { file: 'dev-linux.yml', url: 'x/dev-linux.yml', text: 'version: 0.3.0-dev.5\nbuildId: b5\n' }
      ]
    })
  )
  assert.equal(statusOf(results, 'version above feed dev-mac.yml'), 'PASS')
  assert.equal(statusOf(results, 'version above feed dev.yml'), 'PASS')
  assert.equal(statusOf(results, 'version above feed dev-linux.yml'), 'FAIL')
  assert.equal(
    results.some((r) => r.check === 'version above feed'),
    false
  )
})

test('every channel file must verify against the feed keys the candidate pins, or publish stops', () => {
  const ours = generateKeyPairSync('ed25519')
  const theirs = generateKeyPairSync('ed25519')
  const yml = 'version: 0.3.0-dev.2\n'
  const signed = (privateKey, file = 'dev.yml') => ({
    file,
    yml,
    signature: signFeed({ channelFile: file, text: yml, privateKey })
  })
  const judge = (feedSignatures, pinnedKeys) =>
    preflight(goodFacts({ feedSignatures, pinnedKeys })).find((r) => r.check === 'feed signature dev.yml')
  const pinned = [publicKeyText(ours.publicKey)]
  assert.equal(judge([signed(ours.privateKey)], pinned).status, 'PASS')
  const foreign = judge([signed(theirs.privateKey)], pinned)
  assert.equal(foreign.status, 'FAIL')
  assert.match(foreign.detail, /signing key is not one this build pins/)
  const none = judge([signed(ours.privateKey)], [])
  assert.equal(none.status, 'FAIL')
  assert.match(none.detail, /pins no feed key/)
  const unread = judge([signed(ours.privateKey)], undefined)
  assert.equal(unread.status, 'FAIL')
})

test('the pinned keys are read from src/feed-key.js as the candidate has it', () => {
  const key = Buffer.alloc(32, 7).toString('base64')
  assert.deepEqual(pinnedFeedKeys(`const FEED_PUBLIC_KEYS = Object.freeze([])\n`), [])
  assert.deepEqual(pinnedFeedKeys(`const FEED_PUBLIC_KEYS = Object.freeze(['${key}'])\n`), [key])
  assert.deepEqual(
    pinnedFeedKeys(`const FEED_PUBLIC_KEYS = Object.freeze([\n  '${key}',\n  "${key}"\n])\n`),
    [key, key]
  )
  assert.equal(pinnedFeedKeys('no list here'), null)
})
