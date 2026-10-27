import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  checkWinLinuxSource,
  extractApp,
  prepare,
  publish,
  readManifest,
  readStableKey,
  setMinimum
} from '../build/release.mjs'
import { openStore } from '../build/release-store.mjs'
import { readPolicy, withPolicy } from '../build/release-feed.mjs'
import { generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'

const requireCjs = createRequire(import.meta.url)
const { publicKeyText, signFeed, verifyFeed } = requireCjs('../src/feed-signature.js')

/** The test feed key: publish signs with its private half; the candidate "pins" its public half. */
const FEED_KEY = generateKeyPairSync('ed25519')
const PINNED = [publicKeyText(FEED_KEY.publicKey)]
/** The Mac channel file a manifest froze. */
const macYml = (manifest) => manifest.channels.find((c) => c.platform === 'mac').yml

const SHA = 'c0ffee'.padEnd(40, '0')
const sha512 = (buf) => createHash('sha512').update(buf).digest('base64')
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** A temp folder that is the release target, plus a scratch folder for fake builds. */
function sandbox() {
  const root = mkdtempSync(path.join(tmpdir(), 'release-test-'))
  const target = path.join(root, 'target')
  mkdirSync(target)
  return {
    root,
    target,
    store: openStore(target),
    done: () => rmSync(root, { recursive: true, force: true })
  }
}

/** Every key under a folder store. */
function keys(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? keys(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]
  )
}

/**
 * Build fakes for prepare: a checkout that is a temp folder, and a build that writes a zip and a dmg
 * and the channel file release.sh would write (with the folder URLs).
 */
function fakePrepareDeps(box, over = {}) {
  const calls = { checkout: 0, build: 0, cleanup: 0, order: [], pages: [] }
  return {
    calls,
    deps: {
      // The changelog page as committed at the release sha (`git show <sha>:<file>`); null when absent.
      readPage: (sha, file) => {
        calls.pages.push({ sha, file })
        return PAGES[file] ?? null
      },
      // A dev release with no page section falls back to the PR notes (collect-release-notes.mjs).
      collectNotes: () => ({
        text: 'Sign-in now returns to the app.',
        prs: [{ number: 1014, title: 'Desktop sign-in', url: 'u' }],
        source: 'PRs into develop merged >2026-10-01'
      }),
      // The Windows + Linux run (release-win-linux.mjs): six installers and the record of that run.
      winLinux: async (candidate) => {
        calls.order.push('winLinux')
        calls.winLinux = candidate
        return fakeWinLinuxRun(box, candidate)
      },
      store: box.store,
      resolveSha: () => SHA,
      packageVersion: () => '0.3.0',
      signingIdentity: () => 'Developer ID Application: ADHD Studio Limited (9S5F8693FB)',
      checkout: async () => {
        calls.checkout++
        const dir = mkdtempSync(path.join(box.root, 'checkout-'))
        return { dir, cleanup: async () => void calls.cleanup++ }
      },
      build: async ({ variant, version, buildId, archs, universal, feed, releaseDate, releaseNotes }) => {
        calls.build++
        calls.releaseNotes = releaseNotes
        calls.order.push('build')
        calls.feed = feed
        calls.releaseDate = releaseDate
        calls.archs = archs
        calls.universal = universal
        const stage = mkdtempSync(path.join(box.root, 'stage-'))
        const name = variant === 'dev' ? 'Tracy-Cowork-Dev' : 'Tracy-Cowork'
        // What release.sh makes: a zip per arch, and ONE universal dmg — or, with no universal app,
        // a dmg per arch.
        const kinds = [
          ...archs.map((arch) => [arch, 'zip']),
          ...(universal ? [['universal', 'dmg']] : archs.map((arch) => [arch, 'dmg']))
        ]
        const artifacts = kinds.map(([arch, ext]) => {
          const file = path.join(stage, `${name}-${version}-${arch}.${ext}`)
          writeFileSync(file, `${ext} bytes of ${version} ${arch} ${buildId}`)
          return file
        })
        return {
          artifacts,
          // What the build read from each dmg it made: signed, notarized, stapled.
          containers: Object.fromEntries(
            artifacts.filter((a) => a.endsWith('.dmg')).map((a) => [path.basename(a), NOTARIZED_DMG])
          ),
          bundleId: variant === 'dev' ? 'ai.tracy.cowork.dev' : 'ai.tracy.cowork',
          origin: variant === 'dev' ? 'https://cowork.tracy.site' : 'https://cowork.tracy.ai',
          electronVersion: '40.1.0',
          lockfileSha256: 'f'.repeat(64),
          feed
        }
      },
      log: () => {},
      ...over
    }
  }
}

/**
 * What `desktop-win-linux.yml` leaves for a candidate: x64 + arm64 installers of both OSes, and its
 * build record (package-win-linux.mjs `buildInfo`) saying exactly that candidate.
 */
function fakeWinLinuxRun(box, { sha, variant, version, buildId, releaseDate, feed }) {
  const dir = mkdtempSync(path.join(box.root, 'win-linux-'))
  const name = variant === 'dev' ? 'Tracy-Cowork-Dev' : 'Tracy-Cowork'
  const files = []
  for (const platform of ['win', 'linux'])
    for (const arch of ['x64', 'arm64'])
      for (const kind of platform === 'win' ? ['exe'] : ['AppImage', 'deb']) {
        const file =
          platform === 'win'
            ? `${name}-${version}-win-${arch}-setup.exe`
            : `${name}-${version}-linux-${arch}.${kind}`
        const body = Buffer.from(`${kind} bytes of ${version} ${arch} ${buildId}`)
        writeFileSync(path.join(dir, file), body)
        files.push({ name: file, platform, arch, kind, sha512: sha512(body), size: body.length })
      }
  return {
    run: {
      id: '77',
      url: 'https://github.com/TracyHQ/tch/actions/runs/77',
      event: 'workflow_dispatch',
      headSha: sha,
      release: 'desktop-win-linux-77'
    },
    info: {
      schema: 1,
      sha,
      variant,
      version,
      buildId,
      releaseDate,
      origin: variant === 'dev' ? 'https://cowork.tracy.site' : 'https://cowork.tracy.ai',
      feed,
      electronVersion: '40.1.0',
      lockfileSha256: 'f'.repeat(64),
      run: { id: '77' },
      files
    },
    artifacts: files.map((f) => path.join(dir, f.name))
  }
}

/** The desktop changelog pages at the release sha, by repo path. */
const PAGE_DIR = 'apps/tracy-docs/src/content/docs/changelog/desktop'
const PAGE_03 = `---
title: Tracy Cowork 0.3
description: What changed in the 0.3 releases of the desktop app.
version: "0.3"
released: 2026-10-10
slug: changelog/desktop/0.3
---

## Highlights
- Sign-in now returns to the app.
  <!-- no-media: a redirect back to the app, nothing a still would show -->

## Changes
### New
- Sign-in now returns to the app.

## 0.3.1
Released 2026-10-12.
- Windows remember their size.
`
const PAGES = { [`${PAGE_DIR}/0.3.md`]: PAGE_03 }

const prepareOptions = (over = {}) => ({
  variant: 'dev',
  sha: 'HEAD',
  version: '0.3.0-dev.1',
  buildId: 'b1',
  archs: ['arm64'],
  notes: {
    text: 'Sign-in now returns to the app.',
    prs: [{ number: 1014, title: 'Desktop sign-in', url: 'u' }]
  },
  ...over
})

test('prepare uploads the artifacts and a manifest into <variant>/<version>/<build-id>/, and never a channel file', async () => {
  const box = sandbox()
  try {
    const { deps } = fakePrepareDeps(box)
    const result = await prepare(prepareOptions(), deps)
    assert.equal(result.manifestKey, 'dev/0.3.0-dev.1/b1/manifest.json')
    assert.deepEqual(
      keys(box.target)
        .filter((k) => /\.(zip|dmg|json)$/.test(k))
        .sort(),
      [
        'dev/0.3.0-dev.1/b1/Tracy-Cowork-Dev-0.3.0-dev.1-arm64.dmg',
        'dev/0.3.0-dev.1/b1/Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip',
        'dev/0.3.0-dev.1/b1/manifest.json'
      ]
    )
    const bytes = (await box.store.get(result.manifestKey)).body
    assert.equal(result.digest, sha256(bytes))
    const manifest = JSON.parse(bytes)
    assert.equal(manifest.sha, SHA)
    assert.equal(manifest.version, '0.3.0-dev.1')
    assert.equal(manifest.buildId, 'b1')
    assert.equal(manifest.schema, 2)
    assert.equal(manifest.platforms.mac.bundleId, 'ai.tracy.cowork.dev')
    assert.equal(manifest.origin, 'https://cowork.tracy.site')
    assert.equal(manifest.electronVersion, '40.1.0')
    assert.equal(manifest.lockfileSha256, 'f'.repeat(64))
    assert.deepEqual(manifest.platforms.mac.archs, ['arm64'])
    assert.deepEqual(
      manifest.notes.prs.map((p) => p.number),
      [1014]
    )
    const zipBytes = (await box.store.get('dev/0.3.0-dev.1/b1/Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip')).body
    const zip = manifest.files.find((f) => f.name.endsWith('.zip'))
    assert.equal(zip.sha512, sha512(zipBytes))
    assert.equal(zip.size, zipBytes.length)
    // The channel file publish will write, frozen now: points at this build's folder.
    assert.match(macYml(manifest), /^version: 0\.3\.0-dev\.1$/m)
    assert.match(
      macYml(manifest),
      /^ {2}- url: dev\/0\.3\.0-dev\.1\/b1\/Tracy-Cowork-Dev-0\.3\.0-dev\.1-arm64\.zip$/m
    )
    assert.match(macYml(manifest), new RegExp(`^ {4}sha512: ${zip.sha512.replace(/[+/]/g, '\\$&')}$`, 'm'))
    assert.match(macYml(manifest), /^buildId: b1$/m)
    assert.match(macYml(manifest), /^releaseNotes: \|-\n {2}Sign-in now returns to the app\.$/m)
  } finally {
    box.done()
  }
})

test('prepare builds against the production feed unless a test feed is named, and records the feed in the manifest', async () => {
  const box = sandbox()
  try {
    const plain = fakePrepareDeps(box)
    const first = await prepare(prepareOptions(), plain.deps)
    assert.equal(plain.calls.feed, 'https://update.tracy.site/desktop')
    assert.equal(
      JSON.parse((await box.store.get(first.manifestKey)).body).feed,
      'https://update.tracy.site/desktop'
    )

    const test = fakePrepareDeps(box)
    const second = await prepare(
      prepareOptions({ buildId: 'b2', feed: 'http://127.0.0.1:17910/desktop' }),
      test.deps
    )
    assert.equal(test.calls.feed, 'http://127.0.0.1:17910/desktop')
    assert.equal(
      JSON.parse((await box.store.get(second.manifestKey)).body).feed,
      'http://127.0.0.1:17910/desktop'
    )

    // The bundle must carry the feed asked for: a build that wrote another one is not this candidate.
    const liar = fakePrepareDeps(box)
    const build = liar.deps.build
    liar.deps.build = async (input) => ({
      ...(await build(input)),
      feed: 'https://update.tracy.site/desktop'
    })
    await assert.rejects(
      prepare(prepareOptions({ buildId: 'b3', feed: 'http://127.0.0.1:17910/desktop' }), liar.deps),
      /feed/
    )
    assert.equal(await box.store.get('dev/0.3.0-dev.1/b3/manifest.json'), null)
    // A feed that is not a URL stops before anything is built.
    const early = fakePrepareDeps(box)
    await assert.rejects(
      prepare(prepareOptions({ buildId: 'b4', feed: 'stand' }), early.deps),
      /must be a URL/
    )
    assert.equal(early.calls.build, 0)
  } finally {
    box.done()
  }
})

test('prepare builds both archs and a universal dmg by default: two zips for updates, one dmg to install', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box)
    const result = await prepare(prepareOptions({ archs: undefined }), deps)
    assert.deepEqual(calls.archs, ['arm64', 'x64'])
    assert.equal(calls.universal, true)
    const files = result.manifest.files
      .filter((f) => f.platform === 'mac')
      .map((f) => `${f.arch} ${f.kind} ${f.name}`)
      .sort()
    assert.deepEqual(files, [
      'arm64 zip Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip',
      'universal dmg Tracy-Cowork-Dev-0.3.0-dev.1-universal.dmg',
      'x64 zip Tracy-Cowork-Dev-0.3.0-dev.1-x64.zip'
    ])
    assert.deepEqual(result.manifest.platforms.mac.archs, ['arm64', 'x64'])
    assert.equal(result.manifest.platforms.mac.universal, true)
    // The channel file lists all three: the updater picks a zip by arch and ignores the dmg; the
    // download link of an ad-hoc copy reads the dmg from it.
    for (const name of files.map((f) => f.split(' ')[2]))
      assert.match(
        macYml(result.manifest),
        new RegExp(`- url: dev/0\\.3\\.0-dev\\.1/b1/${name.replaceAll('.', '\\.')}$`, 'm')
      )
  } finally {
    box.done()
  }
})

test('--arch narrows the build: one arch makes no universal app, and its own zip and dmg', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box)
    const result = await prepare(prepareOptions({ archs: ['x64'] }), deps)
    assert.deepEqual(calls.archs, ['x64'])
    assert.equal(calls.universal, false)
    assert.deepEqual(
      result.manifest.files
        .filter((f) => f.platform === 'mac')
        .map((f) => f.name)
        .sort(),
      ['Tracy-Cowork-Dev-0.3.0-dev.1-x64.dmg', 'Tracy-Cowork-Dev-0.3.0-dev.1-x64.zip']
    )
    assert.equal(result.manifest.platforms.mac.universal, false)
  } finally {
    box.done()
  }
})

test('prepare refuses a build whose artifacts would confuse the updater: a universal zip, or an arch with no zip', async () => {
  const box = sandbox()
  try {
    for (const [extra, drop, why] of [
      ['Tracy-Cowork-Dev-0.3.0-dev.1-universal.zip', null, /universal.*dmg only/],
      [null, '-x64.zip', /no zip for x64/],
      [null, '-universal.dmg', /no universal dmg/]
    ]) {
      const fake = fakePrepareDeps(box)
      const build = fake.deps.build
      fake.deps.build = async (input) => {
        const built = await build(input)
        let artifacts = built.artifacts.filter((a) => !drop || !a.endsWith(drop))
        if (extra) {
          const file = path.join(path.dirname(artifacts[0]), extra)
          writeFileSync(file, 'universal zip')
          artifacts = [...artifacts, file]
        }
        return { ...built, artifacts }
      }
      await assert.rejects(
        prepare(prepareOptions({ archs: undefined, buildId: `bad${drop ? 1 : 2}` }), fake.deps),
        why
      )
    }
    assert.deepEqual(keys(box.target), [])
  } finally {
    box.done()
  }
})

test('prepare uploads nothing when a dmg it built is not notarized and stapled as an image', async () => {
  const box = sandbox()
  try {
    for (const [broken, why] of [
      [
        { ...NOTARIZED_DMG, spctl: 'rejected\nsource=no usable signature\n' },
        /not a notarized Developer ID image/
      ],
      [{ ...NOTARIZED_DMG, stapler: { ok: false, output: 'no ticket' } }, /no stapled ticket/],
      [undefined, /not checked/]
    ]) {
      const fake = fakePrepareDeps(box)
      const build = fake.deps.build
      fake.deps.build = async (input) => {
        const built = await build(input)
        const dmg = Object.keys(built.containers)[0]
        return { ...built, containers: { ...built.containers, [dmg]: broken } }
      }
      await assert.rejects(prepare(prepareOptions({ archs: undefined }), fake.deps), why)
    }
    assert.deepEqual(keys(box.target), [])
  } finally {
    box.done()
  }
})

test('prepare freezes ONE release date: the build (release.sh) gets the date the frozen channel file carries', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box, { now: () => new Date('2026-10-09T10:11:12.345Z') })
    const result = await prepare(prepareOptions(), deps)
    assert.equal(calls.releaseDate, '2026-10-09T10:11:12.345Z')
    assert.match(macYml(result.manifest), /^releaseDate: '2026-10-09T10:11:12\.345Z'$/m)
    assert.equal(result.manifest.releaseDate, '2026-10-09T10:11:12.345Z')
  } finally {
    box.done()
  }
})

test('a manifest whose frozen channel file carries another date than the manifest is refused', async () => {
  const box = sandbox()
  try {
    const { manifestKey } = await prepared(box)
    const bytes = (await box.store.get(manifestKey)).body
    assert.equal(readManifest(bytes).releaseDate, JSON.parse(bytes).releaseDate)
    const drifted = { ...JSON.parse(bytes), releaseDate: '2026-01-01T00:00:00.000Z' }
    assert.throws(() => readManifest(Buffer.from(JSON.stringify(drifted))), /releaseDate/)
  } finally {
    box.done()
  }
})

test('prepare stops before building when this machine has no Developer ID — never ad-hoc for a feed build', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box, { signingIdentity: () => null })
    await assert.rejects(prepare(prepareOptions(), deps), /Developer ID/)
    assert.equal(calls.checkout, 0)
    assert.equal(calls.build, 0)
    assert.deepEqual(keys(box.target), [])
  } finally {
    box.done()
  }
})

test('prepare takes a dev version only as <package version>-dev.N, and stable only as the package version', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box)
    await assert.rejects(prepare(prepareOptions({ version: undefined }), deps), /-dev\.N/)
    await assert.rejects(prepare(prepareOptions({ version: '0.4.0-dev.1' }), deps), /0\.3\.0-dev\.N/)
    await assert.rejects(prepare(prepareOptions({ variant: 'stable', version: '0.3.1' }), deps), /0\.3\.0/)
    await assert.rejects(prepare(prepareOptions({ variant: 'preview' }), deps), /stable or dev/)
    assert.equal(calls.build, 0)
  } finally {
    box.done()
  }
})

test('prepare refuses release notes that are not English', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box)
    await assert.rejects(
      prepare(prepareOptions({ notes: { text: 'Đăng nhập quay về app.', prs: [] } }), deps),
      /English/
    )
    assert.equal(calls.build, 0)
  } finally {
    box.done()
  }
})

test('prepare cleans up its checkout even when the build fails', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box, {
      build: async () => {
        throw new Error('codesign failed')
      }
    })
    await assert.rejects(prepare(prepareOptions(), deps), /codesign failed/)
    assert.equal(calls.cleanup, 1)
  } finally {
    box.done()
  }
})

test('one prepare makes ONE candidate of three platforms: Mac built here, Windows + Linux from the run at the same sha', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box, { now: () => new Date('2026-10-10T08:00:00.000Z') })
    const result = await prepare(prepareOptions({ archs: undefined }), deps)
    // The run is asked for exactly this candidate, and started before the Mac build (it runs meanwhile).
    assert.deepEqual(calls.winLinux, {
      sha: SHA,
      variant: 'dev',
      version: '0.3.0-dev.1',
      buildId: 'b1',
      releaseDate: '2026-10-10T08:00:00.000Z',
      feed: 'https://update.tracy.site/desktop'
    })
    assert.deepEqual(calls.order, ['winLinux', 'build'])
    const installers = [
      'Tracy-Cowork-Dev-0.3.0-dev.1-linux-arm64.AppImage',
      'Tracy-Cowork-Dev-0.3.0-dev.1-linux-arm64.deb',
      'Tracy-Cowork-Dev-0.3.0-dev.1-linux-x64.AppImage',
      'Tracy-Cowork-Dev-0.3.0-dev.1-linux-x64.deb',
      'Tracy-Cowork-Dev-0.3.0-dev.1-win-arm64-setup.exe',
      'Tracy-Cowork-Dev-0.3.0-dev.1-win-x64-setup.exe'
    ]
    // Same folder as the Mac files; still no channel file anywhere.
    assert.deepEqual(
      keys(box.target)
        .filter((k) => !/\.(zip|dmg|json)$/.test(k))
        .sort(),
      installers.map((n) => `dev/0.3.0-dev.1/b1/${n}`)
    )
    const m = result.manifest
    assert.deepEqual(Object.keys(m.platforms), ['mac', 'win', 'linux'])
    assert.deepEqual(m.platforms.win.archs, ['x64', 'arm64'])
    assert.deepEqual(m.platforms.linux.archs, ['x64', 'arm64'])
    assert.equal(m.platforms.win.run.url, 'https://github.com/TracyHQ/tch/actions/runs/77')
    assert.deepEqual(
      m.channels.map((c) => c.file),
      ['dev-mac.yml', 'dev.yml', 'dev-linux.yml', 'dev-linux-arm64.yml']
    )
    const exe = m.files.find((f) => f.name.endsWith('win-arm64-setup.exe'))
    const body = (await box.store.get(`dev/0.3.0-dev.1/b1/${exe.name}`)).body
    assert.deepEqual(
      { platform: exe.platform, arch: exe.arch, kind: exe.kind, sha512: exe.sha512, size: exe.size },
      { platform: 'win', arch: 'arm64', kind: 'exe', sha512: sha512(body), size: body.length }
    )
    // Every channel file carries the one release date and the same notes; publish reads them back as they are.
    for (const c of m.channels) {
      assert.match(c.yml, /^releaseDate: '2026-10-10T08:00:00\.000Z'$/m, c.file)
      assert.match(c.yml, /^releaseNotes: \|-\n {2}Sign-in now returns to the app\.$/m, c.file)
    }
    const read = readManifest((await box.store.get(result.manifestKey)).body)
    assert.equal(read.files.length, 9)
  } finally {
    box.done()
  }
})

test('prepare uploads nothing when the Windows/Linux run is not this candidate', async () => {
  const box = sandbox()
  try {
    const cases = [
      ['another sha', (r) => ({ ...r, info: { ...r.info, sha: 'd'.repeat(40) } }), /sha/],
      ['another version', (r) => ({ ...r, info: { ...r.info, version: '0.3.0-dev.2' } }), /version/],
      ['another build id', (r) => ({ ...r, info: { ...r.info, buildId: 'zz' } }), /build id/],
      [
        'another date',
        (r) => ({ ...r, info: { ...r.info, releaseDate: '2020-01-01T00:00:00.000Z' } }),
        /release date/
      ],
      ['another feed', (r) => ({ ...r, info: { ...r.info, feed: 'https://elsewhere.example/d' } }), /feed/],
      ['another origin', (r) => ({ ...r, info: { ...r.info, origin: 'https://cowork.tracy.ai' } }), /origin/],
      ['another Electron', (r) => ({ ...r, info: { ...r.info, electronVersion: '44.0.0' } }), /Electron/],
      [
        'another lockfile',
        (r) => ({ ...r, info: { ...r.info, lockfileSha256: '0'.repeat(64) } }),
        /lockfile/
      ],
      [
        'an installer missing',
        (r) => ({ ...r, artifacts: r.artifacts.filter((a) => !a.endsWith('linux-arm64.deb')) }),
        /linux-arm64\.deb/
      ],
      [
        'a stray file',
        (r) => {
          const extra = path.join(
            path.dirname(r.artifacts[0]),
            'Tracy-Cowork-Dev-0.3.0-dev.1-win-ia32-setup.exe'
          )
          writeFileSync(extra, 'x')
          return { ...r, artifacts: [...r.artifacts, extra] }
        },
        /ia32/
      ],
      [
        'bytes that are not the recorded ones',
        (r) => {
          writeFileSync(r.artifacts[0], 'something else')
          return r
        },
        /does not match the run's record/
      ]
    ]
    for (const [label, tamper, why] of cases) {
      const fake = fakePrepareDeps(box)
      fake.deps.winLinux = async (c) => tamper(fakeWinLinuxRun(box, c))
      await assert.rejects(prepare(prepareOptions({ archs: undefined }), fake.deps), why, label)
      assert.deepEqual(keys(box.target), [], label)
      assert.equal(fake.calls.cleanup, 1, label)
    }
  } finally {
    box.done()
  }
})

test('a failed Windows/Linux run stops prepare with nothing uploaded, and a failed Mac build leaves nothing dangling', async () => {
  const box = sandbox()
  try {
    const failed = fakePrepareDeps(box, {
      winLinux: async () => {
        throw new Error(
          'the Windows/Linux build ended failure: https://github.com/TracyHQ/tch/actions/runs/77'
        )
      }
    })
    await assert.rejects(prepare(prepareOptions(), failed.deps), /actions\/runs\/77/)
    assert.deepEqual(keys(box.target), [])
    assert.equal(failed.calls.cleanup, 1)
    // The Mac build fails while the run is still going, then the run fails too: one error, the Mac one.
    let rejectRun
    const both = fakePrepareDeps(box, {
      winLinux: () => new Promise((_, reject) => (rejectRun = reject)),
      build: async () => {
        throw new Error('codesign failed')
      }
    })
    await assert.rejects(prepare(prepareOptions(), both.deps), /codesign failed/)
    rejectRun(new Error('later'))
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(keys(box.target), [])
  } finally {
    box.done()
  }
})

test('prepare takes the build id and release date of a finished run when it is given them', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box)
    const result = await prepare(
      prepareOptions({
        archs: undefined,
        buildId: '20261010T133609Z-d1cc9d0',
        releaseDate: '2026-10-10T13:36:09.000Z'
      }),
      deps
    )
    assert.equal(calls.releaseDate, '2026-10-10T13:36:09.000Z')
    assert.equal(calls.winLinux.releaseDate, '2026-10-10T13:36:09.000Z')
    assert.equal(result.manifest.folder, 'dev/0.3.0-dev.1/20261010T133609Z-d1cc9d0')
    await assert.rejects(
      prepare(prepareOptions({ buildId: 'b9', releaseDate: 'yesterday' }), deps),
      /release date/
    )
  } finally {
    box.done()
  }
})

// ── publish ──────────────────────────────────────────────────────────────────────────────────────

/** A prepared candidate on the box's target. */
async function prepared(box, over = {}) {
  const { deps } = fakePrepareDeps(box)
  // A stable release takes its notes from the changelog page only (no --notes file).
  const notes = over.variant === 'stable' ? { notes: undefined } : {}
  return prepare(prepareOptions({ archs: undefined, ...notes, ...over }), deps)
}

/**
 * Publish fakes: facts from git/gh/the contract are good; the feed and artifacts publish read from
 * the target go through as they are, so the real version and artifact rules judge them.
 */
function fakePublishDeps(box, over = {}) {
  return {
    // The docs host serving every page as deployed: the HTML page and the raw markdown (no front matter).
    fetchDocs: docsServing(PAGES),
    openStore: () => box.store,
    credentialsFor: (channel) => {
      if (channel === 'stable') throw new Error('stable key: no key file (fake)')
      return undefined
    },
    feedSigningKey: () => FEED_KEY.privateKey,
    // Every artifact "opens" to an app; the fake gather below reads it as signed right.
    extractApp: async ({ name, kind }) => ({
      app: `/fake/${name}.app`,
      ...(kind === 'dmg' ? { container: `/fake/${name}` } : {}),
      cleanup: () => {}
    }),
    // Every Windows / Linux artifact "unpacks"; the fake gather reads its app as right.
    extractPayload: async ({ name }) => ({ root: `/fake/${name}`, cleanup: () => {} }),
    // This machine has every unpacker (payload.mjs `missingUnpackers`).
    missingUnpackers: () => [],
    gather: async (o) => ({
      channel: o.channel,
      sha: o.sha,
      updateFeed: o.updateFeed,
      tree: { porcelain: '' },
      ancestry: { branch: 'origin/develop', isAncestor: true },
      ci: { runs: [{ id: 1, head_sha: o.sha, status: 'completed', conclusion: 'success' }] },
      candidate: { version: o.version, buildId: o.buildId },
      feeds: o.feedReads,
      feedSignatures: o.feedSignatures,
      pinnedKeys: PINNED,
      payloads: o.payloads.map((p) => ({
        artifact: p.artifact,
        expectArch: p.expectArch,
        payload: p.payload ?? goodPayload(o, p)
      })),
      notes: { text: 'Sign-in now returns to the app.' },
      contract: { origin: o.origin, results: [] },
      // What gatherFacts does with the apps publish opened: read each signature (here: a good one of
      // the arch the artifact names), or keep the verdict publish already gave an unopened one.
      signatures: o.apps.map((a) => ({
        artifact: a.artifact,
        expectArchs: a.expectArchs,
        signature: a.signature ?? { ...signedApp(o, a.expectArchs), container: a.container && NOTARIZED_DMG }
      })),
      artifacts: o.artifacts
    }),
    canTag: async () => {},
    tag: async () => {
      throw new Error('no tag in a dev publish')
    },
    log: () => {},
    ...over
  }
}

/** What the checks read from the unpacked Windows / Linux app of a good candidate. */
const goodPayload = (o, p) => ({
  version: o.version,
  arch: p.expectArch,
  fuses: [{ version: 1, states: [48, 49, 48, 48, 48, 48, 48, 49] }],
  origin: o.origin,
  updateChannel: o.channel,
  updateFeed: o.updateFeed,
  debugGuard: true
})

/** What the checks read from a dmg that is signed, notarized and stapled. */
const NOTARIZED_DMG = { spctl: 'source=Notarized Developer ID\n', stapler: { ok: true, output: '' } }

/** A Developer ID, notarized app of the candidate's channel, of the given archs. */
const signedApp = (o, archs) => ({
  codesignVerify: { ok: true, output: '' },
  codesignInfo: 'Authority=Developer ID Application: Tracy (9S5F8693FB)\nTeamIdentifier=9S5F8693FB\n',
  spctl: 'source=Notarized Developer ID\n',
  stapler: { ok: true, output: '' },
  bundleId: o.channel === 'dev' ? 'ai.tracy.cowork.dev' : 'ai.tracy.cowork',
  origin: o.origin,
  updateChannel: o.channel,
  updateFeed: o.updateFeed,
  fuses: [{ version: 1, states: [48, 49, 48, 48, 48, 48, 48, 49] }],
  debugGuard: true,
  archs
})

const publishOptions = (box, result, over = {}) => ({
  manifest: result.manifestKey,
  digest: result.digest,
  target: box.target,
  ...over
})

test('publish writes the channel file exactly as the manifest froze it, and leaves no lock', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    const manifest = JSON.parse((await box.store.get(result.manifestKey)).body)
    const out = await publish(publishOptions(box, result), fakePublishDeps(box))
    assert.equal(out.published, true)
    assert.equal((await box.store.get('dev-mac.yml')).body.toString(), macYml(manifest))
    assert.equal(await box.store.get('.publish.lock'), null)
  } finally {
    box.done()
  }
})

test('publish checks the app inside EVERY artifact — both zips and the universal dmg — each against its arch', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box, { archs: undefined })
    const opened = []
    const seen = []
    const deps = fakePublishDeps(box, {
      extractApp: async ({ name, kind, body }) => {
        opened.push(`${kind} ${name} ${body.length > 0}`)
        return {
          app: `/fake/${name}.app`,
          ...(kind === 'dmg' ? { container: `/fake/${name}` } : {}),
          cleanup: () => opened.push(`cleanup ${name}`)
        }
      }
    })
    const gather = deps.gather
    deps.gather = async (o) => (seen.push(o.apps), gather(o))
    const out = await publish(publishOptions(box, result), deps)
    assert.deepEqual(opened.filter((l) => !l.startsWith('cleanup')).sort(), [
      'dmg Tracy-Cowork-Dev-0.3.0-dev.1-universal.dmg true',
      'zip Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip true',
      'zip Tracy-Cowork-Dev-0.3.0-dev.1-x64.zip true'
    ])
    assert.equal(opened.filter((l) => l.startsWith('cleanup')).length, 3, 'every opened app is removed')
    // The dmg goes to the checks with the image itself, so its container is judged too.
    assert.deepEqual(
      seen[0].map((a) => `${a.artifact} ${a.expectArchs.join('+')} ${a.container ?? '-'}`).sort(),
      [
        'Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip arm64 -',
        'Tracy-Cowork-Dev-0.3.0-dev.1-universal.dmg arm64+x86_64 /fake/Tracy-Cowork-Dev-0.3.0-dev.1-universal.dmg',
        'Tracy-Cowork-Dev-0.3.0-dev.1-x64.zip x86_64 -'
      ]
    )
    assert.equal(out.results.filter((r) => r.check.startsWith('signature ') && r.status === 'PASS').length, 3)
  } finally {
    box.done()
  }
})

test('where the apps cannot be opened (no macOS), a test target says "not checked" and a real store refuses', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box, { archs: undefined })
    const noMac = fakePublishDeps(box, { extractApp: async () => null })
    await assert.rejects(
      publish(publishOptions(box, result, { target: 's3://tracy-releases-dev/desktop' }), noMac),
      /publish refused: signature/
    )
    assert.equal(await box.store.get('dev-mac.yml'), null)
    const out = await publish(publishOptions(box, result), noMac)
    const lines = out.results.filter((r) => r.check.startsWith('signature '))
    assert.equal(lines.length, 3)
    for (const r of lines) assert.equal(r.status, 'SKIP', r.check)

    // The stable store too: no stable feed is written with an unchecked app.
    const stable = await prepared(box, { variant: 'stable', version: '0.3.0', archs: undefined })
    await assert.rejects(
      publish(
        publishOptions(box, stable, { target: 's3://tracy-releases/desktop', pushTag: false }),
        fakePublishDeps(box, {
          extractApp: async () => null,
          credentialsFor: () => ({ accessKeyId: 'a', secretAccessKey: 's' })
        })
      ),
      /publish refused: signature/
    )
    assert.equal(await box.store.get('stable-mac.yml'), null)
  } finally {
    box.done()
  }
})

test('an artifact whose app will not open is a FAIL line of its own, and the other checks still run', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box, { archs: undefined })
    const deps = fakePublishDeps(box)
    const open = deps.extractApp
    deps.extractApp = async (a) => {
      if (a.kind === 'dmg') throw new Error('hdiutil: attach failed')
      return open(a)
    }
    let results
    deps.log = () => {}
    const gather = deps.gather
    deps.gather = async (o) => {
      const facts = await gather(o)
      results = facts
      return facts
    }
    await assert.rejects(
      publish(publishOptions(box, result), deps),
      /signature Tracy-Cowork-Dev-0\.3\.0-dev\.1-universal\.dmg/
    )
    const dmg = results.signatures.find((x) => x.artifact.endsWith('-universal.dmg'))
    assert.match(dmg.signature.error, /cannot open .*attach failed/)
    assert.equal(await box.store.get('dev-mac.yml'), null)
  } finally {
    box.done()
  }
})

test('publish refuses a manifest whose digest is not the one given, and writes nothing', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    await assert.rejects(
      publish(publishOptions(box, result, { digest: '0'.repeat(64) }), fakePublishDeps(box)),
      /digest/
    )
    assert.equal(await box.store.get('dev-mac.yml'), null)
    assert.equal(await box.store.get('.publish.lock'), null)
  } finally {
    box.done()
  }
})

test('a second build of a published version is refused', async () => {
  const box = sandbox()
  try {
    const first = await prepared(box)
    await publish(publishOptions(box, first), fakePublishDeps(box))
    const before = (await box.store.get('dev-mac.yml')).body.toString()
    const second = await prepared(box, { buildId: 'b2' })
    await assert.rejects(publish(publishOptions(box, second), fakePublishDeps(box)), /version above feed/)
    assert.equal((await box.store.get('dev-mac.yml')).body.toString(), before)
    // …and the very build already published may run again.
    await publish(publishOptions(box, first), fakePublishDeps(box))
  } finally {
    box.done()
  }
})

test('publish refuses when an artifact on the target is not the one the manifest froze', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    await box.store.put('dev/0.3.0-dev.1/b1/Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip', Buffer.from('swapped'))
    await assert.rejects(
      publish(publishOptions(box, result), fakePublishDeps(box)),
      /artifacts match manifest/
    )
    assert.equal(await box.store.get('dev-mac.yml'), null)
  } finally {
    box.done()
  }
})

test('publish refuses when the feed changes between its checks and its write', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    let feedReads = 0
    const racing = {
      ...box.store,
      async get(key) {
        if (key === 'dev-mac.yml' && ++feedReads === 2)
          await box.store.put('dev-mac.yml', Buffer.from('version: 0.3.0-dev.9\nbuildId: other\n'))
        return box.store.get(key)
      }
    }
    await assert.rejects(
      publish(publishOptions(box, result), fakePublishDeps(box, { openStore: () => racing })),
      /feed unchanged|another publish/
    )
    assert.match((await box.store.get('dev-mac.yml')).body.toString(), /0\.3\.0-dev\.9/)
  } finally {
    box.done()
  }
})

test('only one publish at a time: a held lock refuses, and is left to its owner', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    await box.store.put('.publish.lock', Buffer.from('{"host":"elsewhere","pid":1}'))
    await assert.rejects(publish(publishOptions(box, result), fakePublishDeps(box)), /lock/)
    assert.equal(await box.store.get('dev-mac.yml'), null)
    assert.notEqual(await box.store.get('.publish.lock'), null)
  } finally {
    box.done()
  }
})

test('publishing stable without the stable key stops before touching the target', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box, { variant: 'stable', version: '0.3.0' })
    await assert.rejects(publish(publishOptions(box, result), fakePublishDeps(box)), /stable key/)
    assert.equal(await box.store.get('stable-mac.yml'), null)
    assert.equal(await box.store.get('.publish.lock'), null)
  } finally {
    box.done()
  }
})

test('publishing stable with its key writes the feed, then tags the sha', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box, { variant: 'stable', version: '0.3.0' })
    const tagged = []
    const deps = fakePublishDeps(box, {
      credentialsFor: () => ({ accessKeyId: 'a', secretAccessKey: 's' }),
      tag: async (t) => {
        assert.ok(await box.store.get('stable-mac.yml'), 'the tag comes after the feed')
        tagged.push(t)
      }
    })
    await publish(publishOptions(box, result, { pushTag: false }), deps)
    assert.deepEqual(tagged, [{ name: 'desktop-v0.3.0', sha: SHA, push: false }])
  } finally {
    box.done()
  }
})

test('waiving a check is for a dev publish to a test target only', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    const failingCi = fakePublishDeps(box)
    const gather = failingCi.gather
    failingCi.gather = async (o) => ({ ...(await gather(o)), ci: { runs: [] } })
    await assert.rejects(publish(publishOptions(box, result), failingCi), /ci green on sha/)
    const out = await publish(publishOptions(box, result, { waive: ['ci green on sha'] }), failingCi)
    assert.equal(out.published, true)
    assert.ok(out.results.some((r) => r.check === 'ci green on sha' && r.status === 'WAIVED'))
    await assert.rejects(
      publish(
        publishOptions(box, result, {
          waive: ['ci green on sha'],
          target: 's3://tracy-releases-dev/desktop'
        }),
        failingCi
      ),
      /waive/
    )
  } finally {
    box.done()
  }
})

test('a candidate built against a test feed is never published to a real store', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box, { feed: 'http://127.0.0.1:17910/desktop' })
    await assert.rejects(
      publish(
        publishOptions(box, result, { target: 's3://tracy-releases-dev/desktop' }),
        fakePublishDeps(box)
      ),
      /test feed/
    )
    assert.equal(await box.store.get('dev-mac.yml'), null)
    // …while a test target takes it, and the checks judge the app against that feed.
    const seen = []
    const deps = fakePublishDeps(box)
    const gather = deps.gather
    deps.gather = async (o) => (seen.push(o.updateFeed), gather(o))
    await publish(publishOptions(box, result), deps)
    assert.deepEqual(seen, ['http://127.0.0.1:17910/desktop'])
  } finally {
    box.done()
  }
})

test('each real store takes only its own channel, at the feed of that channel, with nothing waived', async () => {
  const box = sandbox()
  try {
    const dev = await prepared(box)
    const testFeed = await prepared(box, { buildId: 'b9', feed: 'http://127.0.0.1:17910/desktop' })
    const toStore = (result, target, over = {}) =>
      publish(publishOptions(box, result, { target, ...over }), fakePublishDeps(box))
    await assert.rejects(toStore(dev, 's3://tracy-releases/desktop'), /tracy-releases serves stable/)
    await assert.rejects(toStore(testFeed, 's3://tracy-releases-dev/desktop'), /test feed/)
    await assert.rejects(toStore(dev, 's3://tracy-releases-dev/desktop', { waive: ['on origin'] }), /waive/)
    assert.equal(await box.store.get('dev-mac.yml'), null)

    const seen = []
    const deps = fakePublishDeps(box)
    const gather = deps.gather
    deps.gather = async (o) => (seen.push(o.updateFeed), gather(o))
    await publish(publishOptions(box, dev, { target: 's3://tracy-releases-dev/desktop' }), deps)
    assert.deepEqual(seen, ['https://update.tracy.site/desktop'])

    const stable = await prepared(box, { variant: 'stable', version: '0.3.0' })
    await assert.rejects(
      publish(
        publishOptions(box, stable, { target: 's3://tracy-releases-dev/desktop', pushTag: false }),
        fakePublishDeps(box, { credentialsFor: () => ({ accessKeyId: 'a', secretAccessKey: 's' }) })
      ),
      /tracy-releases-dev serves dev/
    )
  } finally {
    box.done()
  }
})

test('prepare refuses a target that cannot take the candidate, before building', async () => {
  const box = sandbox()
  try {
    for (const [over, why] of [
      [{ target: 's3://tracy-releases/desktop' }, /tracy-releases serves stable/],
      [{ target: 's3://tracy-releases-dev/desktop', feed: 'http://127.0.0.1:17910/desktop' }, /test feed/]
    ]) {
      const { deps, calls } = fakePrepareDeps(box)
      await assert.rejects(prepare(prepareOptions(over), deps), why)
      assert.equal(calls.build, 0)
    }
  } finally {
    box.done()
  }
})

// ── B4: the stable key lives in a file only its owner reads ──────────────────────────────────────

/** A throwaway key file with the given body and mode. */
function keyFile(body, mode = 0o600) {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-stable-key-'))
  const file = path.join(dir, 'tracy-releases-stable.env')
  writeFileSync(file, body)
  chmodSync(file, mode)
  return { file, done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('the stable key is read from its env file: ACCESS_KEY = key id, SECRET_KEY = secret', () => {
  const k = keyFile('# tracy-releases-stable-write\nACCESS_KEY=AKIASTABLE\nSECRET_KEY="the-secret"\n')
  try {
    assert.deepEqual(readStableKey({ file: k.file }), {
      accessKeyId: 'AKIASTABLE',
      secretAccessKey: 'the-secret'
    })
  } finally {
    k.done()
  }
})

test('a missing key file says where the key goes', () => {
  assert.throws(
    () => readStableKey({ file: path.join(tmpdir(), 'no-such-dir', 'tracy-releases-stable.env') }),
    /no stable key.*tracy-releases-stable\.env.*ACCESS_KEY.*SECRET_KEY/s
  )
})

test('a key file others can read is refused, before its content is read', () => {
  const k = keyFile('ACCESS_KEY=AKIASTABLE\nSECRET_KEY=the-secret\n', 0o644)
  try {
    assert.throws(() => readStableKey({ file: k.file }), /readable by others.*chmod 600/s)
  } finally {
    k.done()
  }
})

test('a key file without both lines is refused', () => {
  const k = keyFile('ACCESS_KEY=AKIASTABLE\n')
  try {
    assert.throws(() => readStableKey({ file: k.file }), /needs both ACCESS_KEY and SECRET_KEY/)
  } finally {
    k.done()
  }
})

test('a stable tag that already points elsewhere refuses the publish before the feed is written', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box, { variant: 'stable', version: '0.3.0' })
    const deps = fakePublishDeps(box, {
      credentialsFor: () => ({ accessKeyId: 'a', secretAccessKey: 's' }),
      canTag: async ({ name }) => {
        throw new Error(`tag ${name} already points at deadbeef — tags never move`)
      }
    })
    await assert.rejects(publish(publishOptions(box, result, { pushTag: false }), deps), /tags never move/)
    assert.equal(await box.store.get('stable-mac.yml'), null)
    assert.equal(await box.store.get('.publish.lock'), null)
  } finally {
    box.done()
  }
})

test('prepare refuses release notes that name a third party, before building', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box)
    await assert.rejects(
      prepare(prepareOptions({ notes: { text: 'Bump dsh-passwords 2.7.7', prs: [] } }), deps),
      /third party.*dsh-passwords/
    )
    assert.equal(calls.build, 0)
  } finally {
    box.done()
  }
})

test('the app inside a zip and inside a dmg is copied out for the checks, and removed after', {
  skip: process.platform !== 'darwin'
}, async () => {
  const box = sandbox()
  try {
    const src = path.join(box.root, 'src')
    mkdirSync(path.join(src, 'Tracy Cowork Dev.app', 'Contents'), { recursive: true })
    writeFileSync(path.join(src, 'Tracy Cowork Dev.app', 'Contents', 'Info.plist'), 'plist of the test app')
    const zip = path.join(box.root, 'a.zip')
    const dmg = path.join(box.root, 'a.dmg')
    execFileSync('ditto', ['-c', '-k', '--keepParent', path.join(src, 'Tracy Cowork Dev.app'), zip])
    execFileSync('hdiutil', [
      'create',
      '-quiet',
      '-volname',
      'Test',
      '-srcfolder',
      src,
      '-format',
      'UDZO',
      dmg
    ])
    for (const [kind, file] of [
      ['zip', zip],
      ['dmg', dmg]
    ]) {
      const opened = await extractApp({ name: `a.${kind}`, kind, body: readFileSync(file) })
      assert.equal(path.basename(opened.app), 'Tracy Cowork Dev.app', kind)
      // A dmg comes back with the image too, for the container checks; a zip has none.
      assert.equal(opened.container !== undefined && existsSync(opened.container), kind === 'dmg', kind)
      assert.equal(
        readFileSync(path.join(opened.app, 'Contents', 'Info.plist'), 'utf8'),
        'plist of the test app'
      )
      opened.cleanup()
      assert.equal(existsSync(opened.app), false, `${kind}: cleanup removes the copy`)
    }
  } finally {
    box.done()
  }
})

// ── signed feed, schema 2, Windows / Linux channel files (tasks/todo-desktop-windows.md W3) ──────

import { channelYml as makeChannelYml } from '../build/release-feed.mjs'

/** A store that records the order of writes. */
function recording(store) {
  const puts = []
  return {
    puts,
    store: { ...store, put: async (key, body, opts) => (puts.push(key), store.put(key, body, opts)) }
  }
}

test('publish signs the channel file with the feed key: the .sig goes up first, the channel file last', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    const { puts, store } = recording(box.store)
    await publish(publishOptions(box, result), fakePublishDeps(box, { openStore: () => store }))
    // Every signature first, then every channel file: one lock, all four feeds, none before its .sig.
    const files = ['dev-mac.yml', 'dev.yml', 'dev-linux.yml', 'dev-linux-arm64.yml']
    assert.deepEqual(
      puts.filter((k) => k !== '.publish.lock'),
      [...files.map((f) => `${f}.sig`), ...files]
    )
    const text = (await box.store.get('dev-mac.yml')).body.toString()
    const signature = (await box.store.get('dev-mac.yml.sig')).body.toString()
    assert.deepEqual(verifyFeed({ channelFile: 'dev-mac.yml', text, signature, publicKeys: PINNED }), {
      ok: true
    })
  } finally {
    box.done()
  }
})

test('publish with no feed signing key stops before touching the target', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    const deps = fakePublishDeps(box, {
      feedSigningKey: () => {
        throw new Error('no feed signing key: … does not exist')
      }
    })
    await assert.rejects(publish(publishOptions(box, result), deps), /no feed signing key/)
    assert.equal(await box.store.get('.publish.lock'), null)
    assert.equal(await box.store.get('dev-mac.yml'), null)
  } finally {
    box.done()
  }
})

test('a candidate that pins another key (or none) is refused: it could never take the update it is sent', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    for (const pinnedKeys of [[publicKeyText(generateKeyPairSync('ed25519').publicKey)], []]) {
      const base = fakePublishDeps(box)
      const deps = { ...base, gather: async (o) => ({ ...(await base.gather(o)), pinnedKeys }) }
      await assert.rejects(publish(publishOptions(box, result), deps), /feed signature dev-mac\.yml/)
      assert.equal(await box.store.get('dev-mac.yml'), null)
      assert.equal(await box.store.get('dev-mac.yml.sig'), null)
    }
  } finally {
    box.done()
  }
})

test('a schema 1 manifest (a Mac-only release, before 0.4.0) is still read, and never published again (rule R)', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    const m = result.manifest
    const { platforms, channels, files, ...rest } = m
    const old = {
      ...rest,
      schema: 1,
      bundleId: platforms.mac.bundleId,
      archs: platforms.mac.archs,
      universal: platforms.mac.universal,
      signedBy: platforms.mac.signedBy,
      files: files.filter((f) => f.platform === 'mac').map(({ platform: _p, ...f }) => f),
      channelFile: 'dev-mac.yml',
      channelYml: channels[0].yml
    }
    const bytes = Buffer.from(`${JSON.stringify(old, null, 2)}\n`)
    const key = `${m.folder}/manifest-v1.json`
    await box.store.put(key, bytes, { contentType: 'application/json' })
    assert.equal(readManifest(bytes).channels[0].file, 'dev-mac.yml')
    await assert.rejects(
      publish({ manifest: key, digest: sha256(bytes), target: box.target }, fakePublishDeps(box)),
      /not one release of all three platforms.*the win platform.*the linux platform/
    )
    assert.equal(await box.store.get('dev-mac.yml'), null)
    assert.equal(await box.store.get('.publish.lock'), null)
  } finally {
    box.done()
  }
})

/**
 * A three-platform candidate, prepared with the fakes; `winArchs: ['x64']` drops the arm64 installer
 * and hand-writes a `dev.yml` listing what is left (channelYml refuses to make one).
 */
async function windowsLinuxCandidate(box, { winArchs = ['x64', 'arm64'] } = {}) {
  if (winArchs.length === 2) return prepared(box)
  return edited(box, (m) => {
    const files = m.files.filter((f) => !(f.platform === 'win' && !winArchs.includes(f.arch)))
    const yml = [
      `version: ${m.version}`,
      'files:',
      ...files
        .filter((f) => f.platform === 'win')
        .flatMap((f) => [`  - url: ${m.folder}/${f.name}`, `    sha512: ${f.sha512}`, `    size: ${f.size}`]),
      `releaseDate: '${m.releaseDate}'`,
      `buildId: ${m.buildId}`,
      ''
    ].join('\n')
    return { ...m, files, channels: m.channels.map((c) => (c.platform === 'win' ? { ...c, yml } : c)) }
  })
}

test('a Windows + Linux manifest publishes every channel file, each signed for its own name, every app checked', async () => {
  const box = sandbox()
  try {
    const result = await windowsLinuxCandidate(box)
    const out = await publish(publishOptions(box, result), fakePublishDeps(box))
    for (const file of ['dev.yml', 'dev-linux.yml', 'dev-linux-arm64.yml']) {
      const text = (await box.store.get(file)).body.toString()
      assert.equal(text, result.manifest.channels.find((c) => c.file === file).yml)
      const signature = (await box.store.get(`${file}.sig`)).body.toString()
      assert.deepEqual(
        verifyFeed({ channelFile: file, text, signature, publicKeys: PINNED }),
        { ok: true },
        file
      )
      assert.equal(out.results.find((r) => r.check === `feed signature ${file}`).status, 'PASS')
      assert.equal(out.results.find((r) => r.check === `version above feed ${file}`).status, 'PASS')
    }
    // Every installer, AppImage and .deb has its own payload line, every Mac artifact its signature line.
    assert.equal(out.results.filter((r) => r.check.startsWith('payload ')).length, 6)
    assert.equal(out.results.filter((r) => r.check.startsWith('signature ')).length, 3)
    assert.ok(
      /  - url: dev\/0\.3\.0-dev\.1\/b1\/Tracy-Cowork-Dev-0\.3\.0-dev\.1-win-x64-setup\.exe\n[^]*win-arm64-setup\.exe/.test(
        (await box.store.get('dev.yml')).body.toString()
      )
    )
  } finally {
    box.done()
  }
})

test('a manifest whose Windows channel file lacks an arch is refused before anything is written', async () => {
  const box = sandbox()
  try {
    const result = await windowsLinuxCandidate(box, { winArchs: ['x64'] })
    await assert.rejects(publish(publishOptions(box, result), fakePublishDeps(box)), /no installer for arm64/)
    assert.equal(await box.store.get('dev.yml'), null)
    assert.equal(await box.store.get('.publish.lock'), null)
  } finally {
    box.done()
  }
})

test('an installer whose app is the wrong arch or version fails its payload line, and nothing is written', async () => {
  const box = sandbox()
  try {
    const result = await windowsLinuxCandidate(box)
    const base = fakePublishDeps(box)
    const deps = {
      ...base,
      gather: async (o) => {
        const facts = await base.gather(o)
        facts.payloads = facts.payloads.map((p) =>
          p.artifact.includes('win-arm64') ? { ...p, payload: { ...p.payload, arch: 'x64' } } : p
        )
        return facts
      }
    }
    await assert.rejects(
      publish(publishOptions(box, result), deps),
      /payload Tracy-Cowork-Dev-0\.3\.0-dev\.1-win-arm64-setup\.exe/
    )
    for (const file of ['dev.yml', 'dev.yml.sig', 'dev-linux.yml'])
      assert.equal(await box.store.get(file), null, file)
  } finally {
    box.done()
  }
})

test('where the Windows / Linux apps cannot be unpacked, a test target says "not checked" and a real store refuses', async () => {
  const box = sandbox()
  try {
    const result = await windowsLinuxCandidate(box)
    const noTools = fakePublishDeps(box, { extractPayload: async () => null })
    const base = noTools.gather
    // Keep the verdict publish gave (gather reads only what publish could open).
    noTools.gather = async (o) => ({
      ...(await base(o)),
      payloads: o.payloads.map((p) => ({
        artifact: p.artifact,
        expectArch: p.expectArch,
        payload: p.payload
      }))
    })
    await assert.rejects(
      publish(publishOptions(box, result, { target: 's3://tracy-releases-dev/desktop' }), noTools),
      /publish refused: payload Tracy-Cowork-Dev-0\.3\.0-dev\.1-win-x64-setup\.exe/
    )
    const out = await publish(publishOptions(box, result), noTools)
    const lines = out.results.filter((r) => r.check.startsWith('payload '))
    assert.equal(lines.length, 6)
    for (const line of lines) {
      assert.equal(line.status, 'SKIP')
      assert.match(line.detail, /cannot unpack/)
    }
  } finally {
    box.done()
  }
})

/** A prepared candidate whose manifest is changed by `edit`, put back under a new name and digest. */
async function edited(box, edit) {
  const result = await prepared(box)
  const m = edit(structuredClone(result.manifest))
  const bytes = Buffer.from(`${JSON.stringify(m, null, 2)}\n`)
  const key = `${m.folder}/manifest-edited.json`
  await box.store.put(key, bytes, {})
  return { manifestKey: key, digest: sha256(bytes), manifest: m }
}

test('publish refuses a candidate missing a platform or an arch, before the lock and before any check', async () => {
  for (const [label, edit, why] of [
    [
      'no Linux',
      (m) => ({
        ...m,
        files: m.files.filter((f) => f.platform !== 'linux'),
        channels: m.channels.filter((c) => c.platform !== 'linux')
      }),
      /the linux platform.*dev-linux\.yml.*dev-linux-arm64\.yml/
    ],
    [
      'no Linux arm64',
      (m) => ({
        ...m,
        files: m.files.filter((f) => !(f.platform === 'linux' && f.arch === 'arm64')),
        channels: m.channels.filter((c) => c.file !== 'dev-linux-arm64.yml')
      }),
      /linux arm64 AppImage, linux arm64 deb, dev-linux-arm64\.yml/
    ],
    [
      'a Mac of one arch',
      (m) => {
        const drop = (f) => f.platform === 'mac' && f.arch !== 'arm64'
        const files = m.files.filter((f) => !drop(f))
        const mac = files.filter((f) => f.platform === 'mac')
        const yml = makeChannelYml({
          version: m.version,
          releaseDate: m.releaseDate,
          buildId: m.buildId,
          releaseNotes: m.notes.text,
          files: mac.map((f) => ({ url: `${m.folder}/${f.name}`, sha512: f.sha512, size: f.size }))
        })
        return { ...m, files, channels: m.channels.map((c) => (c.platform === 'mac' ? { ...c, yml } : c)) }
      },
      /mac x64 zip, mac universal dmg/
    ]
  ]) {
    const box = sandbox()
    try {
      const result = await edited(box, edit)
      let gathered = false
      const deps = fakePublishDeps(box, {
        gather: async () => {
          gathered = true
          throw new Error('no check should run')
        }
      })
      await assert.rejects(publish(publishOptions(box, result), deps), why, label)
      assert.equal(gathered, false, label)
      assert.deepEqual(
        keys(box.target).filter((k) => !k.startsWith('dev/')),
        [],
        `${label}: no lock, no channel file`
      )
    } finally {
      box.done()
    }
  }
})

test('a real store is never published from a machine that cannot unpack the Windows and Linux apps', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    const missing = [
      { tool: '7zz', hint: 'brew install sevenzip' },
      { tool: 'unsquashfs', hint: 'brew install squashfs' }
    ]
    const lines = []
    const deps = fakePublishDeps(box, { missingUnpackers: () => missing, log: (l) => lines.push(l) })
    await assert.rejects(
      publish(publishOptions(box, result, { target: 's3://tracy-releases-dev/desktop' }), deps),
      /7zz.*brew install sevenzip.*unsquashfs.*brew install squashfs/
    )
    // A test target goes on, and says what will not be checked.
    const out = await publish(publishOptions(box, result), deps)
    assert.equal(out.published, true)
    assert.ok(
      lines.some((l) => /not checked here: 7zz/.test(l)),
      lines.join('\n')
    )
  } finally {
    box.done()
  }
})

// ── minimum version policy: prepare carries it, publish re-checks it (C2) ───────────────────────

const DEV_FILES = ['dev-mac.yml', 'dev.yml', 'dev-linux.yml', 'dev-linux-arm64.yml']

/** The dev feed as an earlier release left it: every channel file at 0.2.0, carrying `policy`. */
async function seedFeed(box, policy, files = DEV_FILES) {
  for (const file of files) {
    const plain = `version: 0.2.0\nreleaseDate: '2026-10-01T00:00:00.000Z'\nbuildId: old\n`
    await box.store.put(file, Buffer.from(policy ? withPolicy(plain, policy) : plain))
  }
}

test('prepare with no policy flag carries the feed policy over as it is, and records what it read', async () => {
  const box = sandbox()
  try {
    const policy = { minimumVersion: '0.2.0', policyRevision: 2 }
    await seedFeed(box, policy)
    const { manifest } = await prepared(box)
    for (const file of DEV_FILES) {
      const etag = (await box.store.get(file)).etag
      assert.deepEqual(manifest.policy.read[file], { policy, revision: 2, etag }, file)
    }
    assert.deepEqual(manifest.policy.next, policy)
    assert.equal(manifest.policy.changed, false)
    for (const c of manifest.channels) assert.deepEqual(readPolicy(c.yml), policy, c.file)
  } finally {
    box.done()
  }
})

/** prepare with these policy flags over a feed carrying `policy`; what it built and froze. */
async function preparePolicy(box, flags, { buildId = 'b1', version = '0.3.0-dev.1' } = {}) {
  const { deps, calls } = fakePrepareDeps(box)
  const run = prepare(prepareOptions({ archs: undefined, buildId, version, policy: flags }), deps)
  return { run, calls }
}

test('raising the minimum with a reason takes the next revision, frozen into every channel file', async () => {
  const box = sandbox()
  try {
    await seedFeed(box, { minimumVersion: '0.2.0', policyRevision: 2 })
    const { run } = await preparePolicy(box, { minVersion: '0.3.0-dev.1', reason: 'token leak in 0.2.x' })
    const { manifest } = await run
    const want = { minimumVersion: '0.3.0-dev.1', policyRevision: 3 }
    assert.deepEqual(manifest.policy.next, want)
    assert.equal(manifest.policy.changed, true)
    assert.equal(manifest.policy.reason, 'token leak in 0.2.x')
    assert.equal(manifest.channels.length, 4)
    for (const c of manifest.channels) assert.deepEqual(readPolicy(c.yml), want, c.file)
    // A first release (no channel file yet) starts at revision 1.
    const fresh = sandbox()
    try {
      const first = await (await preparePolicy(fresh, { minVersion: '0.2.0', reason: 'first lock' })).run
      assert.deepEqual(first.manifest.policy.next, { minimumVersion: '0.2.0', policyRevision: 1 })
      assert.deepEqual(first.manifest.policy.read['dev-mac.yml'], { policy: null, revision: 0, etag: null })
    } finally {
      fresh.done()
    }
  } finally {
    box.done()
  }
})

test('a policy change without its reason, or a loosening without --lower-min-version, stops before building', async () => {
  const cases = [
    ['a raise with no reason', { minVersion: '0.3.0-dev.1' }, /needs --min-version-reason/],
    [
      'a raise with a blank reason',
      { minVersion: '0.3.0-dev.1', reason: '  ' },
      /needs --min-version-reason/
    ],
    [
      'a lower minimum',
      { minVersion: '0.1.0', reason: 'too strict' },
      /loosens the lock.*--lower-min-version/
    ],
    [
      'a later start',
      { minVersion: '0.2.0', minVersionAfter: '2026-12-01T00:00:00Z', reason: 'give a week' },
      /loosens the lock/
    ],
    [
      // an earlier start is a tightening: it needs its reason like a raise.
      'an earlier start with no reason',
      { minVersion: '0.2.0', minVersionAfter: '2026-10-25T00:00:00Z' },
      /needs --min-version-reason/
    ],
    [
      '--lower-min-version on a raise',
      { minVersion: '0.3.0-dev.1', reason: 'x', lower: true },
      /does not loosen/
    ],
    [
      'a date with no minimum',
      { minVersionAfter: '2026-10-25T00:00:00Z', reason: 'x' },
      /come with --min-version/
    ],
    [
      'clear together with a minimum',
      { clear: true, minVersion: '0.2.0', reason: 'x' },
      /--clear-min-version takes no/
    ],
    ['a minimum above this release', { minVersion: '0.4.0', reason: 'x' }, /above 0\.3\.0-dev\.1/]
  ]
  for (const [label, flags, why] of cases) {
    const box = sandbox()
    try {
      await seedFeed(box, {
        minimumVersion: '0.2.0',
        minimumVersionAfter: '2026-11-01T00:00:00Z',
        policyRevision: 2
      })
      const { run, calls } = await preparePolicy(box, flags)
      await assert.rejects(run, why, label)
      assert.equal(calls.build, 0, `${label}: nothing built`)
      assert.deepEqual(
        keys(box.target).filter((k) => k.startsWith('dev/')),
        [],
        `${label}: nothing uploaded`
      )
    } finally {
      box.done()
    }
  }
})

test('lowering, moving the start later and lifting the lock are deliberate: their own flag and a reason', async () => {
  const from = { minimumVersion: '0.2.0', minimumVersionAfter: '2026-11-01T00:00:00Z', policyRevision: 2 }
  for (const [flags, want] of [
    [
      { minVersion: '0.1.0', reason: 'locked out too many', lower: true },
      { minimumVersion: '0.1.0', policyRevision: 3 }
    ],
    [
      { minVersion: '0.2.0', minVersionAfter: '2026-12-01T00:00:00Z', reason: 'a week more', lower: true },
      { minimumVersion: '0.2.0', minimumVersionAfter: '2026-12-01T00:00:00Z', policyRevision: 3 }
    ],
    [{ clear: true, reason: 'locked by mistake' }, { policyRevision: 3 }],
    // an earlier start with its reason is a plain tightening.
    [
      { minVersion: '0.2.0', minVersionAfter: '2026-10-25T00:00:00Z', reason: 'sooner' },
      { minimumVersion: '0.2.0', minimumVersionAfter: '2026-10-25T00:00:00Z', policyRevision: 3 }
    ]
  ]) {
    const box = sandbox()
    try {
      await seedFeed(box, from)
      const { manifest } = await (await preparePolicy(box, flags)).run
      assert.deepEqual(manifest.policy.next, want, JSON.stringify(flags))
      assert.equal(manifest.policy.changed, true)
    } finally {
      box.done()
    }
  }
})

test('prepare refuses a feed whose channel files carry different policies: finish set-minimum first', async () => {
  const box = sandbox()
  try {
    await seedFeed(box, { minimumVersion: '0.2.0', policyRevision: 2 })
    await seedFeed(box, { minimumVersion: '0.2.0', policyRevision: 3 }, ['dev.yml'])
    const { run, calls } = await preparePolicy(box, {})
    await assert.rejects(run, /do not carry one policy.*dev\.yml: minimum 0\.2\.0, revision 3.*--resume/)
    assert.equal(calls.build, 0)
  } finally {
    box.done()
  }
})

/** Every dev channel file on the box's target, rewritten by `edit` (text → text). */
async function rewriteFeed(box, edit, files = DEV_FILES) {
  for (const file of files) {
    const text = (await box.store.get(file)).body.toString()
    await box.store.put(file, Buffer.from(edit(text)))
  }
}

test('a candidate publishes the policy it froze: every channel file carries it, signed', async () => {
  const box = sandbox()
  try {
    await seedFeed(box, { minimumVersion: '0.2.0', policyRevision: 2 })
    const { run } = await preparePolicy(box, { minVersion: '0.3.0-dev.1', reason: 'token leak in 0.2.x' })
    const result = await run
    await publish(publishOptions(box, result), fakePublishDeps(box))
    for (const file of DEV_FILES) {
      const text = (await box.store.get(file)).body.toString()
      assert.deepEqual(readPolicy(text), { minimumVersion: '0.3.0-dev.1', policyRevision: 3 }, file)
      const signature = (await box.store.get(`${file}.sig`)).body.toString()
      assert.deepEqual(verifyFeed({ channelFile: file, text, signature, publicKeys: PINNED }), { ok: true })
    }
  } finally {
    box.done()
  }
})

test('a candidate prepared before the feed policy changed is refused at publish — raised, lowered, or only rewritten', async () => {
  const from = { minimumVersion: '0.1.0', policyRevision: 2 }
  for (const [label, edit, why] of [
    [
      'raised since prepare',
      (t) => withPolicy(t, { minimumVersion: '0.2.0', policyRevision: 3 }),
      /dev-mac\.yml: prepare read etag .*minimum 0\.1\.0, revision 2.*the feed has etag .*minimum 0\.2\.0, revision 3/
    ],
    [
      // the case the revision exists for: a lock lowered to rescue people must not be raised back.
      'lowered since prepare',
      (t) => withPolicy(t, { minimumVersion: '0.0.1', policyRevision: 3 }),
      /minimum 0\.0\.1, revision 3/
    ],
    [
      'the same policy, other bytes',
      (t) => t.replace('buildId: old', 'buildId: other'),
      /dev-mac\.yml: prepare read etag/
    ]
  ]) {
    const box = sandbox()
    try {
      await seedFeed(box, from)
      const result = await (await preparePolicy(box, {})).run
      await rewriteFeed(box, edit)
      const before = Object.fromEntries(
        await Promise.all(DEV_FILES.map(async (f) => [f, (await box.store.get(f)).body.toString()]))
      )
      // No flag gets past it: not a waiver of the checks either.
      const run = publish(
        publishOptions(box, result, { waive: ['version above feed'] }),
        fakePublishDeps(box)
      )
      await assert.rejects(run, why, label)
      await assert.rejects(
        publish(publishOptions(box, result), fakePublishDeps(box)),
        /re-run prepare/,
        label
      )
      for (const f of DEV_FILES)
        assert.equal((await box.store.get(f)).body.toString(), before[f], `${label}: ${f} untouched`)
      assert.equal(await box.store.get('dev-mac.yml.sig'), null, `${label}: no signature written`)
      assert.equal(await box.store.get('.publish.lock'), null, `${label}: lock released`)
    } finally {
      box.done()
    }
  }
})

test('a channel file that appeared or went away since prepare also refuses the candidate', async () => {
  const box = sandbox()
  try {
    const result = await (await preparePolicy(box, {})).run
    await seedFeed(box, { minimumVersion: '0.2.0', policyRevision: 1 }, ['dev-linux.yml'])
    await assert.rejects(
      publish(publishOptions(box, result), fakePublishDeps(box)),
      /dev-linux\.yml: prepare read no file, the feed has etag .*minimum 0\.2\.0, revision 1/
    )
  } finally {
    box.done()
  }
})

test('a manifest from before the policy publishes only over a feed that carries none', async () => {
  const box = sandbox()
  try {
    const result = await edited(box, ({ policy: _policy, ...m }) => m)
    await seedFeed(box, { minimumVersion: '0.2.0', policyRevision: 2 }, ['dev-mac.yml'])
    await assert.rejects(
      publish(publishOptions(box, result), fakePublishDeps(box)),
      /prepared before the minimum version policy.*dev-mac\.yml carries minimum 0\.2\.0, revision 2/
    )
    await box.store.remove('dev-mac.yml')
    const out = await publish(publishOptions(box, result), fakePublishDeps(box))
    assert.equal(out.published, true)
  } finally {
    box.done()
  }
})

test('a manifest whose frozen channel file carries another policy than it records is refused', async () => {
  const box = sandbox()
  try {
    await seedFeed(box, { minimumVersion: '0.2.0', policyRevision: 2 })
    const result = await (await preparePolicy(box, { minVersion: '0.3.0-dev.1', reason: 'token leak' })).run
    // The Mac file (frozen as text, never rebuilt) put back to the old lock; the record left as made.
    const m = structuredClone(result.manifest)
    const mac = m.channels.find((c) => c.platform === 'mac')
    mac.yml = withPolicy(mac.yml.replace(/^minimumVersion: .*\npolicyRevision: .*\n/m, ''), {
      minimumVersion: '0.2.0',
      policyRevision: 2
    })
    assert.throws(
      () => readManifest(Buffer.from(JSON.stringify(m))),
      /frozen dev-mac\.yml carries minimum 0\.2\.0, revision 2, the manifest minimum 0\.3\.0-dev\.1, revision 3/
    )
  } finally {
    box.done()
  }
})

// ── set-minimum: change the policy of a live channel, nothing built (C3) ─────────────────────────

/** The dev feed at 0.2.0 carrying `policy`, every file signed with the test feed key. */
async function seedSignedFeed(box, policy, files = DEV_FILES) {
  await seedFeed(box, policy, files)
  await signAgain(box, files)
}

/** Sign these channel files again, as they are now, with the test feed key. */
async function signAgain(box, files) {
  for (const file of files) {
    const text = (await box.store.get(file)).body
    await box.store.put(
      `${file}.sig`,
      Buffer.from(signFeed({ channelFile: file, text, privateKey: FEED_KEY.privateKey }))
    )
  }
}

/** set-minimum's fakes: the box's store, the test feed key, a fixed clock. */
const setMinimumDeps = (box, over = {}) => ({
  store: box.store,
  feedSigningKey: () => FEED_KEY.privateKey,
  pinnedKeys: PINNED,
  now: () => new Date('2026-10-11T12:00:00.000Z'),
  log: () => {},
  ...over
})

/** Does every present channel file verify with its .sig, under the pinned key, as an app checks? */
async function feedVerdicts(box, files = DEV_FILES) {
  const out = {}
  for (const file of files) {
    const text = (await box.store.get(file))?.body
    const signature = (await box.store.get(`${file}.sig`))?.body.toString()
    out[file] = text ? verifyFeed({ channelFile: file, text, signature, publicKeys: PINNED }).ok : 'absent'
  }
  return out
}

test('set-minimum moves every channel file of the channel to the next policy revision, signed, and logs why', async () => {
  const box = sandbox()
  try {
    await seedSignedFeed(box, { minimumVersion: '0.1.0', policyRevision: 2 })
    const out = await setMinimum(
      { channel: 'dev', target: box.target, minVersion: '0.2.0', reason: 'token leak in 0.1.x' },
      setMinimumDeps(box)
    )
    const want = { minimumVersion: '0.2.0', policyRevision: 3 }
    assert.deepEqual(out.policy, want)
    for (const file of DEV_FILES)
      assert.deepEqual(readPolicy((await box.store.get(file)).body.toString()), want, file)
    assert.deepEqual(await feedVerdicts(box), Object.fromEntries(DEV_FILES.map((f) => [f, true])))
    const log = (await box.store.get('dev/policy-log.jsonl')).body.toString().trim().split('\n')
    assert.equal(log.length, 1)
    const entry = JSON.parse(log[0])
    assert.equal(entry.at, '2026-10-11T12:00:00.000Z')
    assert.deepEqual(entry.from, { minimumVersion: '0.1.0', policyRevision: 2 })
    assert.deepEqual(entry.to, want)
    assert.equal(entry.revision, 3)
    assert.equal(entry.reason, 'token leak in 0.1.x')
    assert.equal(typeof entry.host, 'string')
    assert.equal(await box.store.get('.publish.lock'), null)
  } finally {
    box.done()
  }
})

test('set-minimum stopped between a channel file and its signature is finished by --resume, every file verifying', async () => {
  const box = sandbox()
  try {
    await seedSignedFeed(box, { minimumVersion: '0.1.0', policyRevision: 2 })
    const command = { channel: 'dev', target: box.target, minVersion: '0.2.0', reason: 'token leak in 0.1.x' }
    // The store fails right after the second channel file is written, before its signature.
    const puts = []
    const failing = {
      ...box.store,
      put: async (key, body, opts) => {
        if (key === 'dev.yml.sig') throw new Error('connection reset (fake)')
        puts.push(key)
        return box.store.put(key, body, opts)
      }
    }
    await assert.rejects(setMinimum(command, setMinimumDeps(box, { store: failing })), /connection reset/)
    assert.deepEqual(
      puts.filter((k) => k !== '.publish.lock'),
      ['dev-mac.yml', 'dev-mac.yml.sig', 'dev.yml']
    )
    assert.equal(await box.store.get('.publish.lock'), null, 'the lock is released')
    // What a client sees now: dev.yml is new but its signature is the old one — refused, never taken.
    assert.deepEqual(await feedVerdicts(box), {
      'dev-mac.yml': true,
      'dev.yml': false,
      'dev-linux.yml': true,
      'dev-linux-arm64.yml': true
    })
    // Run again without --resume: refused, with every file's state and the way out.
    await assert.rejects(
      setMinimum(command, setMinimumDeps(box)),
      /not in one state.*dev\.yml: minimum 0\.2\.0, revision 3, signature does not verify.*dev-linux\.yml: minimum 0\.1\.0, revision 2.*--resume/
    )
    const out = await setMinimum({ ...command, resume: true }, setMinimumDeps(box))
    assert.deepEqual(out.written, ['dev.yml', 'dev-linux.yml', 'dev-linux-arm64.yml'])
    assert.deepEqual(await feedVerdicts(box), Object.fromEntries(DEV_FILES.map((f) => [f, true])))
    for (const file of DEV_FILES)
      assert.deepEqual(
        readPolicy((await box.store.get(file)).body.toString()),
        { minimumVersion: '0.2.0', policyRevision: 3 },
        file
      )
    const log = (await box.store.get('dev/policy-log.jsonl')).body
      .toString()
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    assert.equal(log.length, 1, 'the stopped run logged nothing; the finishing run logs once')
    assert.equal(log[0].resumed, true)
    assert.deepEqual(log[0].from, { minimumVersion: '0.1.0', policyRevision: 2 })
  } finally {
    box.done()
  }
})

test('--resume never writes a policy older than one a channel file already carries (replay)', async () => {
  const box = sandbox()
  try {
    // An old run reached dev-mac.yml with revision 3; a newer run since put revision 4 on dev.yml.
    await seedSignedFeed(box, { minimumVersion: '0.1.0', policyRevision: 2 })
    await seedSignedFeed(box, { minimumVersion: '0.2.0', policyRevision: 3 }, ['dev-mac.yml'])
    await seedSignedFeed(box, { minimumVersion: '0.1.5', policyRevision: 4 }, ['dev.yml'])
    const before = await box.store.get('dev-linux.yml')
    await assert.rejects(
      setMinimum(
        { channel: 'dev', target: box.target, minVersion: '0.2.0', reason: 'old run', resume: true },
        setMinimumDeps(box)
      ),
      /replay refused: dev-mac\.yml carries this policy at revision 3, but dev\.yml already carries minimum 0\.1\.5, revision 4/
    )
    assert.equal((await box.store.get('dev-linux.yml')).etag, before.etag, 'nothing written')
  } finally {
    box.done()
  }
})

test('set-minimum refuses, before writing anything, what it must not do', async () => {
  const base = { channel: 'dev', minVersion: '0.2.0', reason: 'token leak' }
  const cases = [
    ['no reason', { reason: ' ' }, {}, /needs --reason/],
    ['no policy asked for', { minVersion: undefined }, {}, /needs --min-version/],
    [
      'a lower minimum without its flag',
      { minVersion: '0.0.5' },
      {},
      /loosens the lock.*--lower-min-version/
    ],
    [
      'a key the apps do not pin',
      {},
      { feedSigningKey: () => generateKeyPairSync('ed25519').privateKey },
      /not one the apps pin/
    ],
    [
      'a dev build on stable',
      { channel: 'stable', minVersion: '0.2.0-dev.1' },
      {},
      /stable channel file|no stable channel file/
    ],
    [
      'the wrong real store',
      { channel: 'stable', target: 's3://tracy-releases-dev/desktop' },
      {},
      /serves dev only/
    ]
  ]
  for (const [label, over, depsOver, why] of cases) {
    const box = sandbox()
    try {
      await seedSignedFeed(box, { minimumVersion: '0.1.0', policyRevision: 2 })
      const before = await feedTexts(box)
      await assert.rejects(
        setMinimum({ ...base, target: box.target, ...over }, setMinimumDeps(box, depsOver)),
        why,
        label
      )
      assert.deepEqual(await feedTexts(box), before, `${label}: nothing written`)
      assert.equal(await box.store.get('.publish.lock'), null, `${label}: no lock left`)
    } finally {
      box.done()
    }
  }
  // A minimum one platform's file cannot satisfy (it still offers 0.2.0): nothing written anywhere.
  const box = sandbox()
  try {
    await seedSignedFeed(box, { minimumVersion: '0.1.0', policyRevision: 2 })
    await rewriteFeed(box, (t) => t.replace('version: 0.2.0', 'version: 0.3.0'), ['dev-mac.yml', 'dev.yml'])
    await signAgain(box, ['dev-mac.yml', 'dev.yml'])
    const before = await feedTexts(box)
    await assert.rejects(
      setMinimum(
        { ...base, minVersion: '0.3.0', target: box.target },
        setMinimumDeps(box, { store: box.store })
      ),
      /0\.3\.0 is above 0\.2\.0/
    )
    assert.deepEqual(await feedTexts(box), before)
    // …and a held lock is another writer's: refused, left alone.
    await box.store.put('.publish.lock', Buffer.from('{"host":"elsewhere"}'))
    await assert.rejects(
      setMinimum({ ...base, target: box.target }, setMinimumDeps(box)),
      /holds the lock.*elsewhere/
    )
    assert.notEqual(await box.store.get('.publish.lock'), null)
  } finally {
    box.done()
  }
})

/** Each dev channel file's text (null when absent). */
async function feedTexts(box) {
  const out = {}
  for (const f of DEV_FILES) out[f] = (await box.store.get(f))?.body.toString() ?? null
  return out
}

test('set-minimum skips a channel file that is not there and says so; a policy already in force writes nothing', async () => {
  const box = sandbox()
  try {
    await seedSignedFeed(box, { minimumVersion: '0.1.0', policyRevision: 2 }, [
      'dev-mac.yml',
      'dev.yml',
      'dev-linux.yml'
    ])
    const lines = []
    const command = { channel: 'dev', target: box.target, minVersion: '0.2.0', reason: 'token leak' }
    const out = await setMinimum(command, setMinimumDeps(box, { log: (l) => lines.push(l) }))
    assert.deepEqual(out.written, ['dev-mac.yml', 'dev.yml', 'dev-linux.yml'])
    assert.ok(
      lines.some((l) => /dev-linux-arm64\.yml is not there — skipped/.test(l)),
      lines.join('\n')
    )
    assert.equal(await box.store.get('dev-linux-arm64.yml'), null)
    const entry = JSON.parse((await box.store.get('dev/policy-log.jsonl')).body.toString())
    assert.deepEqual(entry.skipped, ['dev-linux-arm64.yml'])
    // The same command again: in force already, nothing written, nothing logged.
    const again = await setMinimum(command, setMinimumDeps(box))
    assert.equal(again.changed, false)
    assert.equal((await box.store.get('dev/policy-log.jsonl')).body.toString().trim().split('\n').length, 1)
  } finally {
    box.done()
  }
})

test('a candidate prepared before a set-minimum is refused at publish: the lock just set is never undone by it', async () => {
  for (const [label, command] of [
    ['raised', { minVersion: '0.2.0', reason: 'token leak' }],
    ['lowered', { minVersion: '0.0.1', reason: 'locked out too many', lower: true }]
  ]) {
    const box = sandbox()
    try {
      await seedSignedFeed(box, { minimumVersion: '0.1.0', policyRevision: 2 })
      const result = await (await preparePolicy(box, {})).run
      await setMinimum({ channel: 'dev', target: box.target, ...command }, setMinimumDeps(box))
      const before = await feedTexts(box)
      await assert.rejects(
        publish(publishOptions(box, result), fakePublishDeps(box)),
        /dev-mac\.yml: prepare read .*revision 2.*revision 3.*re-run prepare/,
        label
      )
      assert.deepEqual(await feedTexts(box), before, `${label}: the feed keeps the lock set-minimum wrote`)
      // A new prepare carries the new lock, and publishes.
      const fresh = await (await preparePolicy(box, {}, { buildId: 'b2' })).run
      assert.equal(fresh.manifest.policy.next.policyRevision, 3, label)
      await publish(publishOptions(box, fresh), fakePublishDeps(box))
      assert.equal(readPolicy((await box.store.get('dev.yml')).body.toString()).policyRevision, 3, label)
    } finally {
      box.done()
    }
  }
})

test('a release that changes the policy logs it like set-minimum does; one that carries it over logs nothing', async () => {
  const box = sandbox()
  try {
    await seedFeed(box, { minimumVersion: '0.1.0', policyRevision: 2 })
    const carried = await (await preparePolicy(box, {})).run
    await publish(publishOptions(box, carried), fakePublishDeps(box))
    assert.equal(await box.store.get('dev/policy-log.jsonl'), null)
    const raised = await (
      await preparePolicy(
        box,
        { minVersion: '0.2.0', reason: 'token leak in 0.1.x' },
        { buildId: 'b2', version: '0.3.0-dev.2' }
      )
    ).run
    await publish(publishOptions(box, raised), fakePublishDeps(box))
    const entry = JSON.parse((await box.store.get('dev/policy-log.jsonl')).body.toString())
    assert.equal(entry.command, 'publish')
    assert.deepEqual(entry.from, { minimumVersion: '0.1.0', policyRevision: 2 })
    assert.deepEqual(entry.to, { minimumVersion: '0.2.0', policyRevision: 3 })
    assert.equal(entry.reason, 'token leak in 0.1.x')
    assert.equal(entry.version, '0.3.0-dev.2')
    assert.equal(entry.buildId, 'b2')
  } finally {
    box.done()
  }
})

// ── release notes from the changelog page (E5) ──────────────────────────────────────────────────

test('a stable minor release ships the Highlights of its page as committed at the release sha', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box)
    const result = await prepare(
      prepareOptions({ variant: 'stable', version: '0.3.0', notes: undefined }),
      deps
    )
    assert.deepEqual(calls.pages, [{ sha: SHA, file: `${PAGE_DIR}/0.3.md` }])
    const m = result.manifest
    assert.equal(m.notes.text, '- Sign-in now returns to the app.')
    assert.equal(m.notes.source, `docs changelog/desktop/0.3.md#highlights@${SHA}`)
    assert.equal(m.notes.contentSha256, sha256(Buffer.from('- Sign-in now returns to the app.')))
    for (const c of m.channels)
      assert.match(c.yml, /^releaseNotes: \|-\n {2}- Sign-in now returns to the app\.$/m)
  } finally {
    box.done()
  }
})

test('the manifest lists the Highlights that have no picture or clip, with the reason the page gives', async () => {
  const box = sandbox()
  try {
    const { deps } = fakePrepareDeps(box)
    const { manifest } = await prepare(
      prepareOptions({ variant: 'stable', version: '0.3.0', notes: undefined }),
      deps
    )
    assert.deepEqual(manifest.notes.noMedia, [
      {
        highlight: 'Sign-in now returns to the app.',
        reason: 'a redirect back to the app, nothing a still would show'
      }
    ])
    // The comment is the page's only: the notes and their hash are the bullet alone.
    assert.equal(manifest.notes.text, '- Sign-in now returns to the app.')
  } finally {
    box.done()
  }
})

test('stable X.Y.0 with a Highlight that has no picture, no clip and no no-media comment is refused before building', async () => {
  const box = sandbox()
  try {
    const bare = PAGE_03.replace(/\n {2}<!-- no-media:[^\n]*/, '')
    const { deps, calls } = fakePrepareDeps(box, {
      readPage: (_sha, file) => (file === `${PAGE_DIR}/0.3.md` ? bare : null)
    })
    await assert.rejects(
      prepare(prepareOptions({ variant: 'stable', version: '0.3.0', notes: undefined }), deps),
      /stable 0\.3\.0 ships the Highlights of .*0\.3\.md.*1 of them has no image or clip.*"Sign-in now returns to the app\."/
    )
    assert.equal(calls.checkout, 0)
    assert.equal(calls.build, 0)
    assert.deepEqual(keys(box.target), [])
    const lines = []
    const dev = fakePrepareDeps(box, {
      readPage: (_sha, file) => (file === `${PAGE_DIR}/0.3.md` ? bare : null),
      log: (line) => lines.push(line)
    })
    const { manifest } = await prepare(prepareOptions({ notes: undefined }), dev.deps)
    assert.equal(manifest.notes.text, '- Sign-in now returns to the app.')
    assert.deepEqual(manifest.notes.noMedia, [])
    assert.ok(
      lines.some((l) => /WARNING .*0\.3\.md.*1 Highlight has no image or clip/.test(l)),
      lines.join('\n')
    )
  } finally {
    box.done()
  }
})

test('a stable patch release ships its own section of the page, not the minor launch text', async () => {
  const box = sandbox()
  try {
    const { deps } = fakePrepareDeps(box, { packageVersion: () => '0.3.1' })
    const { manifest } = await prepare(
      prepareOptions({ variant: 'stable', version: '0.3.1', notes: undefined }),
      deps
    )
    assert.equal(manifest.notes.text, '- Windows remember their size.')
    assert.equal(manifest.notes.source, `docs changelog/desktop/0.3.md#0.3.1@${SHA}`)
    assert.equal(manifest.notes.contentSha256, sha256(Buffer.from('- Windows remember their size.')))
  } finally {
    box.done()
  }
})

test('stable without notes for its version on the page at that sha is refused before building, naming file and section', async () => {
  const box = sandbox()
  try {
    for (const [version, pages, why] of [
      [
        '0.4.0',
        PAGES,
        /## Highlights.*changelog\/desktop\/0\.4\.md.*no apps\/tracy-docs\/src\/content\/docs\/changelog\/desktop\/0\.4\.md/
      ],
      ['0.3.2', PAGES, /## 0\.3\.2.*changelog\/desktop\/0\.3\.md.*no "## 0\.3\.2"/],
      [
        '0.3.0',
        {
          [`${PAGE_DIR}/0.3.md`]: PAGE_03.replace(
            '- Windows remember their size.',
            '- Bump dsh-passwords 2.7.7'
          )
        },
        /third party.*Bump dsh-passwords/
      ]
    ]) {
      const { deps, calls } = fakePrepareDeps(box, {
        packageVersion: () => version,
        readPage: (_sha, file) => pages[file] ?? null
      })
      await assert.rejects(
        prepare(prepareOptions({ variant: 'stable', version, notes: undefined }), deps),
        why
      )
      assert.equal(calls.checkout, 0, version)
      assert.equal(calls.build, 0, version)
    }
    assert.deepEqual(keys(box.target), [])
  } finally {
    box.done()
  }
})

test('a --notes file is for a dev build only: stable is refused', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box)
    await assert.rejects(
      prepare(prepareOptions({ variant: 'stable', version: '0.3.0' }), deps),
      /stable release takes its notes from the changelog page only/
    )
    assert.equal(calls.build, 0)
  } finally {
    box.done()
  }
})

test('a dev build reads the page section of the release it leads to, and without one warns and ships the PR notes', async () => {
  const box = sandbox()
  try {
    const lines = []
    const { deps } = fakePrepareDeps(box, { log: (line) => lines.push(line) })
    const fromPage = await prepare(prepareOptions({ notes: undefined, version: '0.3.0-dev.1' }), deps)
    assert.equal(fromPage.manifest.notes.text, '- Sign-in now returns to the app.')
    assert.match(fromPage.manifest.notes.source, /^docs changelog\/desktop\/0\.3\.md#highlights@/)
    const other = fakePrepareDeps(box, { packageVersion: () => '0.4.0', log: (line) => lines.push(line) })
    const fromPrs = await prepare(
      prepareOptions({ notes: undefined, version: '0.4.0-dev.1', buildId: 'b2' }),
      other.deps
    )
    assert.equal(fromPrs.manifest.notes.text, 'Sign-in now returns to the app.')
    assert.equal(fromPrs.manifest.notes.source, 'PRs into develop merged >2026-10-01')
    assert.deepEqual(
      fromPrs.manifest.notes.prs.map((p) => p.number),
      [1014]
    )
    assert.ok(
      lines.some((l) => /WARNING.*no apps\/tracy-docs\/.*0\.4\.md.*PR notes/.test(l)),
      lines.join('\n')
    )
  } finally {
    box.done()
  }
})

// ── publish waits for the docs host (E8) ────────────────────────────────────────────────────────

/** A docs host (any origin) serving these pages: `/changelog/desktop/X.Y/` and `/changelog/desktop/X.Y.md`. */
function docsServing(pages, seen = []) {
  return async (url) => {
    seen.push(url)
    const found = /\/changelog\/desktop\/(\d+\.\d+)(\/|\.md)$/.exec(new URL(url).pathname)
    const page = found && pages[`${PAGE_DIR}/${found[1]}.md`]
    if (!page) return { status: 404, text: 'not found' }
    return found[2] === '/'
      ? { status: 200, text: '<!doctype html><title>Tracy Cowork</title>' }
      : { status: 200, text: page.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\n/g, '\r\n') }
  }
}

/** Publish fakes for a stable candidate that may go all the way: its key and a tag that works. */
const stableDeps = (box, over = {}) =>
  fakePublishDeps(box, {
    credentialsFor: () => ({ accessKeyId: 'a', secretAccessKey: 's' }),
    tag: async () => {},
    ...over
  })

test('a stable publish first finds its notes served by the docs host, page and markdown, then moves the feed', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box, { variant: 'stable', version: '0.3.0' })
    const seen = []
    await publish(publishOptions(box, result), stableDeps(box, { fetchDocs: docsServing(PAGES, seen) }))
    assert.ok(await box.store.get('stable-mac.yml'))
    assert.deepEqual(seen, [
      'https://docs.tracy.ai/changelog/desktop/0.3/',
      'https://docs.tracy.ai/changelog/desktop/0.3.md'
    ])
  } finally {
    box.done()
  }
})

test('a stable publish is refused, nothing written, until the docs host serves the notes it froze', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box, { variant: 'stable', version: '0.3.0' })
    const before = keys(box.target).sort()
    const edited = {
      [`${PAGE_DIR}/0.3.md`]: PAGE_03.replace(
        '## Highlights\n- Sign-in now returns to the app.\n',
        '## Highlights\n- Sign-in is faster.\n'
      )
    }
    for (const [fetchDocs, why] of [
      [docsServing({}), /deploy docs first.*changelog\/desktop\/0\.3\/.*404/],
      [
        async (url) => (url.endsWith('/') ? { status: 200, text: 'ok' } : { status: 404, text: '' }),
        /deploy docs first.*0\.3\.md.*404/
      ],
      [docsServing(edited), /deploy docs first.*0\.3\.md.*not the notes this candidate froze/],
      [
        async () => {
          throw new Error('getaddrinfo ENOTFOUND')
        },
        /deploy docs first.*ENOTFOUND/
      ]
    ]) {
      await assert.rejects(publish(publishOptions(box, result), stableDeps(box, { fetchDocs })), why)
      assert.deepEqual(keys(box.target).sort(), before)
    }
  } finally {
    box.done()
  }
})

test("--skip-docs-check is for dev only; the docs origin is the one given, else the channel's own", async () => {
  const box = sandbox()
  try {
    const stable = await prepared(box, { variant: 'stable', version: '0.3.0' })
    await assert.rejects(
      publish(publishOptions(box, stable, { skipDocsCheck: true }), stableDeps(box)),
      /--skip-docs-check is for a dev publish only/
    )
    assert.equal(await box.store.get('stable-mac.yml'), null)
    const seen = []
    await publish(
      publishOptions(box, stable, { docsOrigin: 'http://docs.tracy.test:8080/' }),
      stableDeps(box, { fetchDocs: docsServing(PAGES, seen) })
    )
    assert.equal(seen[0], 'http://docs.tracy.test:8080/changelog/desktop/0.3/')

    // A dev candidate with page notes is checked on the dev docs host, unless told to skip it.
    const dev = await prepared(box, { notes: undefined, version: '0.3.0-dev.1' })
    const devSeen = []
    await publish(publishOptions(box, dev), fakePublishDeps(box, { fetchDocs: docsServing(PAGES, devSeen) }))
    assert.equal(devSeen[0], 'https://docs.tracy.site/changelog/desktop/0.3/')
    const skipped = await prepared(box, { notes: undefined, version: '0.3.0-dev.2', buildId: 'b2' })
    await publish(
      publishOptions(box, skipped, { skipDocsCheck: true }),
      fakePublishDeps(box, { fetchDocs: async () => assert.fail('fetched with --skip-docs-check') })
    )
    // Notes from a --notes file or the PRs live on no page: there is nothing to look for.
    const fromFile = await prepared(box, { version: '0.3.0-dev.3', buildId: 'b3' })
    await publish(
      publishOptions(box, fromFile),
      fakePublishDeps(box, { fetchDocs: async () => assert.fail('fetched for notes that are on no page') })
    )
  } finally {
    box.done()
  }
})

test('a real store checks the docs host of its own channel only: a stand set in DOCS_ORIGIN never stands in for it', async () => {
  const box = sandbox()
  try {
    const stable = await prepared(box, { variant: 'stable', version: '0.3.0' })
    await assert.rejects(
      publish(
        publishOptions(box, stable, {
          target: 's3://tracy-releases/desktop',
          docsOrigin: 'http://docs.tracy.test:8080'
        }),
        stableDeps(box, { fetchDocs: async () => assert.fail('fetched another docs host for a real store') })
      ),
      /tracy-releases.*docs at https:\/\/docs\.tracy\.ai.*http:\/\/docs\.tracy\.test:8080/
    )
    assert.equal(await box.store.get('stable-mac.yml'), null)
  } finally {
    box.done()
  }
})

test('the build gets the notes the release froze, to write into the bundle (D1)', async () => {
  const box = sandbox()
  try {
    const { deps, calls } = fakePrepareDeps(box, { packageVersion: () => '0.3.1' })
    const { manifest } = await prepare(
      prepareOptions({ variant: 'stable', version: '0.3.1', notes: undefined }),
      deps
    )
    assert.equal(calls.releaseNotes, '- Windows remember their size.')
    assert.equal(calls.releaseNotes, manifest.notes.text)
  } finally {
    box.done()
  }
})

// ── where the Windows + Linux files come from ────────────────────────────────────────────────────

test('the manifest records the draft release the Windows/Linux files came from', async () => {
  const box = sandbox()
  try {
    const result = await prepared(box)
    assert.deepEqual(result.manifest.platforms.win.run, {
      id: '77',
      url: 'https://github.com/TracyHQ/tch/actions/runs/77',
      event: 'workflow_dispatch',
      release: 'desktop-win-linux-77'
    })
    assert.deepEqual(result.manifest.platforms.linux.run, result.manifest.platforms.win.run)
  } finally {
    box.done()
  }
})

test('installers packed by hand carry their reason into the manifest and the log', async () => {
  const box = sandbox()
  try {
    const lines = []
    const { deps } = fakePrepareDeps(box, {
      winLinux: async (c) => {
        const got = fakeWinLinuxRun(box, c)
        return {
          ...got,
          run: { id: `manual-${c.buildId}`, url: null, event: 'manual', reason: 'artifact quota hit' }
        }
      },
      log: (line) => lines.push(line)
    })
    const result = await prepare(prepareOptions({ archs: undefined }), deps)
    assert.deepEqual(result.manifest.platforms.win.run, {
      id: `manual-${result.manifest.buildId}`,
      url: null,
      event: 'manual',
      reason: 'artifact quota hit'
    })
    assert.ok(lines.some((l) => /packed by hand.*artifact quota hit/.test(l)))
  } finally {
    box.done()
  }
})

test('one source of Windows/Linux files: a run, or a folder packed by hand that a real store takes only with a reason', () => {
  const dispatched = { run: { trigger: 'workflow_dispatch' } }
  const pushed = { run: { trigger: 'push' } }
  const manual = { run: { trigger: 'manual' } }
  // A run: a real store takes only a release dispatch.
  checkWinLinuxSource({ runId: '1', record: dispatched, realStore: true })
  checkWinLinuxSource({ runId: '1', record: pushed, realStore: false })
  assert.throws(
    () => checkWinLinuxSource({ runId: '1', record: pushed, realStore: true }),
    /started by push, not by a release dispatch/
  )
  // A folder: any test target; a real store only with a stated reason.
  checkWinLinuxSource({ dir: '/x', record: manual, realStore: false })
  checkWinLinuxSource({ dir: '/x', record: manual, realStore: true, manualReason: 'quota hit 12/10' })
  assert.throws(
    () => checkWinLinuxSource({ dir: '/x', record: manual, realStore: true }),
    /--allow-manual-win-linux/
  )
  assert.throws(
    () => checkWinLinuxSource({ dir: '/x', record: manual, realStore: true, manualReason: '  ' }),
    /reason/
  )
  // Never both, and the reason only with a folder.
  assert.throws(() => checkWinLinuxSource({ runId: '1', dir: '/x', record: manual }), /one/)
  assert.throws(
    () => checkWinLinuxSource({ runId: '1', record: dispatched, realStore: true, manualReason: 'x' }),
    /--win-linux-dir/
  )
})

test('a publish to a real store deletes the draft release it came from; a test target keeps it', async () => {
  const box = sandbox()
  try {
    const dev = await prepared(box)
    const discarded = []
    await publish(
      publishOptions(box, dev),
      fakePublishDeps(box, { discardWinLinux: async (run) => void discarded.push(run) })
    )
    assert.deepEqual(discarded, [], 'a test target may be followed by the real one, from the same run')

    const lines = []
    const result = await publish(
      publishOptions(box, await prepared(box, { version: '0.3.0-dev.2', buildId: 'b2' }), {
        target: 's3://tracy-releases-dev/desktop'
      }),
      fakePublishDeps(box, {
        discardWinLinux: async (run) => void discarded.push(run),
        log: (l) => lines.push(l)
      })
    )
    assert.equal(result.published, true)
    assert.deepEqual(
      discarded.map((r) => r.release),
      ['desktop-win-linux-77']
    )

    // A draft that cannot be deleted is said, never a failed publish: the feed is already live.
    const again = await publish(
      publishOptions(box, await prepared(box, { version: '0.3.0-dev.3', buildId: 'b3' }), {
        target: 's3://tracy-releases-dev/desktop'
      }),
      fakePublishDeps(box, {
        discardWinLinux: async () => {
          throw new Error('HTTP 403')
        },
        log: (l) => lines.push(l)
      })
    )
    assert.equal(again.published, true)
    assert.ok(lines.some((l) => /draft release desktop-win-linux-77.*HTTP 403/.test(l)))
  } finally {
    box.done()
  }
})
