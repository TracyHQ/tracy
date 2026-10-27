/**
 * The Windows + Linux half of a release (`build/release-win-linux.mjs`): prepare asks GitHub for a run
 * of `desktop-win-linux.yml` at the release sha, waits for it, and downloads its installers and build
 * record from the run's DRAFT release (`desktop-win-linux-<run id>`) — never from Actions artifacts,
 * whose org-wide quota blocked release 0.6.0 (12/10/2026). Or it takes them from a run that already
 * finished, or from a folder packed by hand (`localWinLinux`). `gh` is faked: each test answers the
 * commands the adapter sends and records them.
 *
 *   node --test packages/desktop/tracy-desktop/test/release-win-linux.test.mjs
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { WORKFLOW, githubWinLinux, localWinLinux, releaseTagOf } from '../build/release-win-linux.mjs'

const SHA = 'a'.repeat(40)
const INPUT = {
  sha: SHA,
  variant: 'dev',
  version: '0.4.0-dev.3',
  buildId: '20261010T120000Z-aaaaaaa',
  releaseDate: '2026-10-10T12:00:00.000Z',
  feed: 'https://update.tracy.site/desktop'
}
const INFO = {
  schema: 1,
  sha: SHA,
  variant: 'dev',
  version: '0.4.0-dev.3',
  buildId: INPUT.buildId,
  run: { id: '4242', attempt: '1', trigger: 'workflow_dispatch' },
  files: []
}
const INSTALLERS = [
  'Tracy-Cowork-Dev-0.4.0-dev.3-win-x64-setup.exe',
  'Tracy-Cowork-Dev-0.4.0-dev.3-win-arm64-setup.exe',
  'Tracy-Cowork-Dev-0.4.0-dev.3-linux-x64.AppImage',
  'Tracy-Cowork-Dev-0.4.0-dev.3-linux-x64.deb'
]
const JOB = 777
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/**
 * A fake `gh`: `runs` is what `run list` shows after the dispatch, `views` the successive answers of
 * `run view` (the last one repeats). `release download` writes the draft's assets into `--dir` (only
 * those matching `-p`, when given); `annotations` is what the run's job reported (by default the
 * sha256 of the record, as the workflow's notice does); `drafts` maps a tag to its `isDraft`.
 */
function fakeGh({
  runs = [],
  views = [],
  info = INFO,
  noRelease = false,
  annotations,
  drafts = {},
  extra = []
} = {}) {
  const calls = []
  let dispatched = false
  let viewAt = 0
  const record = JSON.stringify(info)
  const notes = annotations ?? [
    { title: 'build-info.json', message: `sha256 ${sha256(record)}`, annotation_level: 'notice' }
  ]
  const gh = async (args) => {
    calls.push(args)
    const [a, b] = args
    if (a === 'workflow' && b === 'run') {
      dispatched = true
      return ''
    }
    if (a === 'run' && b === 'list') return JSON.stringify(dispatched ? runs : [])
    if (a === 'run' && b === 'view') {
      const answer = views[Math.min(viewAt++, views.length - 1)]
      return JSON.stringify(answer)
    }
    if (a === 'api' && /check-runs\/\d+\/annotations$/.test(b)) return JSON.stringify(notes)
    if (a === 'release' && b === 'download') {
      if (noRelease) throw Object.assign(new Error('exit 1'), { stderr: 'release not found' })
      const dir = args[args.indexOf('--dir') + 1]
      const patterns = args.flatMap((x, i) => (args[i - 1] === '-p' ? [x] : []))
      mkdirSync(dir, { recursive: true })
      for (const file of ['build-info.json', ...INSTALLERS, ...extra])
        if (patterns.length === 0 || patterns.includes(file))
          writeFileSync(path.join(dir, file), file === 'build-info.json' ? record : `bytes of ${file}`)
      return ''
    }
    if (a === 'release' && b === 'view') return JSON.stringify({ isDraft: drafts[args[2]] ?? true })
    if (a === 'release' && b === 'delete') return ''
    throw new Error(`unexpected gh ${args.join(' ')}`)
  }
  return { gh, calls }
}

const RUN = {
  databaseId: 4242,
  attempt: 1,
  displayTitle: `desktop win+linux dev 0.4.0-dev.3 ${INPUT.buildId}`,
  url: 'https://github.com/TracyHQ/tch/actions/runs/4242',
  headSha: 'b'.repeat(40),
  event: 'workflow_dispatch',
  jobs: [{ databaseId: JOB, name: 'windows + linux installers' }]
}
const done = (over = {}) => ({ ...RUN, status: 'completed', conclusion: 'success', ...over })

function adapter(gh, over = {}) {
  const workDir = mkdtempSync(path.join(tmpdir(), 'win-linux-'))
  const slept = []
  return {
    workDir,
    slept,
    winLinux: githubWinLinux({
      gh,
      repo: 'TracyHQ/tch',
      workDir,
      sleep: async (ms) => void slept.push(ms),
      log: () => {},
      ...over
    }),
    done: () => rmSync(workDir, { recursive: true, force: true })
  }
}

test('the draft release of a run is named by the run id, which both the workflow and prepare know', () => {
  assert.equal(releaseTagOf(4242), 'desktop-win-linux-4242')
  assert.equal(releaseTagOf('4242'), 'desktop-win-linux-4242')
  assert.throws(() => releaseTagOf('42; rm'), /run id/)
})

test('dispatch asks for exactly the candidate, on main for stable and develop for dev, then waits and downloads the draft', async () => {
  const { gh, calls } = fakeGh({
    runs: [RUN],
    views: [{ ...RUN, status: 'queued' }, { ...RUN, status: 'in_progress' }, done()]
  })
  const a = adapter(gh)
  try {
    const got = await a.winLinux.dispatch(INPUT)
    const run = calls.find((c) => c[0] === 'workflow')
    assert.deepEqual(run, [
      'workflow',
      'run',
      WORKFLOW,
      '--repo',
      'TracyHQ/tch',
      '--ref',
      'develop',
      '-f',
      `sha=${SHA}`,
      '-f',
      'variant=dev',
      '-f',
      'version=0.4.0-dev.3',
      '-f',
      `build_id=${INPUT.buildId}`,
      '-f',
      `release_date=${INPUT.releaseDate}`,
      '-f',
      'feed=https://update.tracy.site/desktop'
    ])
    const download = calls.find((c) => c[0] === 'release' && c[1] === 'download')
    assert.equal(download[2], 'desktop-win-linux-4242')
    assert.equal(
      calls.some((c) => c[0] === 'run' && c[1] === 'download'),
      false,
      'no Actions artifact is ever read'
    )
    assert.equal(got.run.id, '4242')
    assert.equal(got.run.url, RUN.url)
    assert.equal(got.run.release, 'desktop-win-linux-4242')
    assert.deepEqual(got.info, INFO)
    // The installers only — the record is read, not uploaded.
    assert.deepEqual(got.artifacts.map((f) => path.basename(f)).sort(), [...INSTALLERS].sort())
    for (const f of got.artifacts) assert.equal(readFileSync(f, 'utf8'), `bytes of ${path.basename(f)}`)
    assert.ok(a.slept.length >= 2, 'it polled while the run was queued and running')

    const stable = fakeGh({
      runs: [{ ...RUN, displayTitle: `desktop win+linux stable 0.4.0 ${INPUT.buildId}` }],
      views: [done()]
    })
    await adapter(stable.gh).winLinux.dispatch({ ...INPUT, variant: 'stable', version: '0.4.0' })
    const ref = stable.calls.find((c) => c[0] === 'workflow')
    assert.equal(ref[ref.indexOf('--ref') + 1], 'main')
  } finally {
    a.done()
  }
})

test('the run is found by its build id, never by "the newest run"', async () => {
  const other = { ...RUN, databaseId: 9999, displayTitle: 'desktop win+linux dev 0.4.0-dev.3 someone-else' }
  const { gh, calls } = fakeGh({ runs: [other, RUN], views: [done()] })
  const a = adapter(gh)
  try {
    const got = await a.winLinux.dispatch(INPUT)
    assert.equal(got.run.id, '4242')
    assert.ok(calls.some((c) => c[0] === 'run' && c[1] === 'view' && c[2] === '4242'))
  } finally {
    a.done()
  }
})

test('a run that never shows up, fails, or is cancelled stops prepare with its address', async () => {
  const none = adapter(fakeGh({ runs: [] }).gh, { findTimeoutMs: 3, pollMs: 1 })
  try {
    await assert.rejects(
      none.winLinux.dispatch(INPUT),
      /no run of desktop-win-linux\.yml .*20261010T120000Z-aaaaaaa/
    )
  } finally {
    none.done()
  }
  for (const conclusion of ['failure', 'cancelled']) {
    const a = adapter(fakeGh({ runs: [RUN], views: [done({ conclusion })] }).gh)
    try {
      await assert.rejects(a.winLinux.dispatch(INPUT), new RegExp(`${conclusion}.*actions/runs/4242`))
    } finally {
      a.done()
    }
  }
})

test('a dispatch that GitHub refuses (the workflow is not on the default branch yet) says to use a finished run', async () => {
  const gh = async (args) => {
    if (args[0] === 'workflow')
      throw Object.assign(new Error('HTTP 404: Not Found'), {
        stderr: 'could not find any workflows named desktop-win-linux.yml'
      })
    throw new Error('unexpected')
  }
  const a = adapter(gh)
  try {
    await assert.rejects(a.winLinux.dispatch(INPUT), /--win-linux-run/)
  } finally {
    a.done()
  }
})

test('a finished run is taken only when it succeeded; readInfo reads only the record', async () => {
  const { gh, calls } = fakeGh({ views: [done({ event: 'push', headSha: SHA })] })
  const a = adapter(gh)
  try {
    const record = await a.winLinux.readInfo('4242')
    assert.deepEqual(record, INFO)
    const first = calls.find((c) => c[0] === 'release' && c[1] === 'download')
    assert.deepEqual(first.slice(first.indexOf('-p')), ['-p', 'build-info.json'])
    const got = await a.winLinux.fromRun('4242')
    assert.equal(got.run.event, 'push')
    assert.equal(got.artifacts.length, 4)
    assert.equal(
      calls.some((c) => c[0] === 'workflow'),
      false,
      'nothing is dispatched'
    )
  } finally {
    a.done()
  }
  const failed = adapter(fakeGh({ views: [done({ conclusion: 'failure' })] }).gh)
  try {
    await assert.rejects(failed.winLinux.fromRun('4242'), /failure/)
  } finally {
    failed.done()
  }
})

test('a run whose draft release is gone says so and how to get it back', async () => {
  const a = adapter(fakeGh({ views: [done()], noRelease: true }).gh)
  try {
    await assert.rejects(a.winLinux.fromRun('4242'), /desktop-win-linux-4242.*4242.*run it again/s)
  } finally {
    a.done()
  }
})

test('the draft is bound to its run: the record names this run and attempt, and its hash is the one the run reported', async () => {
  // A record from another run (a draft edited by hand, or a stale attempt) is refused.
  for (const [over, want] of [
    [{ info: { ...INFO, run: { ...INFO.run, id: '1' } } }, /names run 1.*not 4242/],
    [{ views: [done({ attempt: 2 })] }, /attempt 1.*attempt 2/]
  ]) {
    const a = adapter(fakeGh({ views: [done()], ...over }).gh)
    try {
      await assert.rejects(a.winLinux.fromRun('4242'), want)
    } finally {
      a.done()
    }
  }
  // The run reported another hash, or none at all: the draft's record was replaced after the build.
  for (const annotations of [
    [{ title: 'build-info.json', message: `sha256 ${'0'.repeat(64)}` }],
    [{ title: 'something else', message: 'hello' }]
  ]) {
    const { gh, calls } = fakeGh({ views: [done()], annotations })
    const a = adapter(gh)
    try {
      await assert.rejects(a.winLinux.fromRun('4242'), /build-info\.json.*sha256/)
      assert.ok(
        calls.some((c) => c[0] === 'api' && c[1] === `repos/TracyHQ/tch/check-runs/${JOB}/annotations`)
      )
    } finally {
      a.done()
    }
  }
})

test('discard deletes the draft of a run, and never a published release', async () => {
  const { gh, calls } = fakeGh()
  const a = adapter(gh)
  try {
    await a.winLinux.discard({ id: '4242', release: 'desktop-win-linux-4242' })
    assert.ok(
      calls.some((c) => c.join(' ') === 'release delete desktop-win-linux-4242 --repo TracyHQ/tch --yes')
    )
    // A manual build has no draft: nothing to do.
    const before = calls.length
    await a.winLinux.discard({ id: 'manual-x', release: undefined })
    assert.equal(calls.length, before)
  } finally {
    a.done()
  }
  const published = fakeGh({ drafts: { 'desktop-win-linux-4242': false } })
  const b = adapter(published.gh)
  try {
    await assert.rejects(b.winLinux.discard({ id: '4242', release: 'desktop-win-linux-4242' }), /not a draft/)
    assert.equal(
      published.calls.some((c) => c[1] === 'delete'),
      false
    )
  } finally {
    b.done()
  }
})

test('a folder packed by hand gives the same shape: its record, its installers, and a run that says manual', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'win-linux-dir-'))
  try {
    const info = { ...INFO, run: { id: null, trigger: 'manual', runner: 'prod1-builder' } }
    writeFileSync(path.join(dir, 'build-info.json'), JSON.stringify(info))
    mkdirSync(path.join(dir, 'out'))
    for (const f of INSTALLERS) writeFileSync(path.join(dir, 'out', f), `bytes of ${f}`)
    const local = localWinLinux(dir)
    assert.deepEqual(local.readInfo(), info)
    const got = local.collect()
    assert.deepEqual(got.run, {
      id: `manual-${INFO.buildId}`,
      url: null,
      event: 'manual',
      dir: path.resolve(dir)
    })
    assert.deepEqual(got.info, info)
    assert.deepEqual(got.artifacts.map((f) => path.basename(f)).sort(), [...INSTALLERS].sort())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const empty = mkdtempSync(path.join(tmpdir(), 'win-linux-dir-'))
  try {
    assert.throws(() => localWinLinux(empty).readInfo(), /build-info\.json/)
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})
