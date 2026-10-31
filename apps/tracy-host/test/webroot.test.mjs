import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFile, execFileSync } from 'node:child_process'
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  access,
  stat,
  unlink,
  symlink,
  link,
  lstat,
  chmod,
  rm
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildApp } from '../src/app.js'
import { runTeardownJob } from '../src/provision.js'
import { signHostCall } from '../../tracy-web/src/host/client.js'
import {
  WEBROOT_JOBS,
  validateWebrootBody,
  runWebrootJob,
  runGoLiveJob,
  writeCoreManifest,
  classifyTokenMount,
  siteShape,
  syncProgressLine
} from '../src/webroot.js'
import {
  CUSTODY_CASES,
  HOST_FILE_CASES,
  LABELLED_CUSTODY_CASES,
  LABELLED_SITE_SHAPE_CASES,
  SITE_SHAPE_CASES,
  emdashCompose,
  phpCompose,
  placeCompose
} from '../../../packages/fleet/tracy-fleet-operation/test/token-custody-cases.mjs'

// ---------------------------------------------------------------------------------------------
// validateWebrootBody
// ---------------------------------------------------------------------------------------------

test('validateWebrootBody: accepts a plain webroot-changes body', () => {
  assert.equal(validateWebrootBody({ kind: 'webroot-changes', label: 'lantern' }), null)
})

test('validateWebrootBody: refuses a path that escapes the webroot with ..', () => {
  const error = validateWebrootBody({
    kind: 'webroot-file-show',
    label: 'x',
    path: '../../etc/passwd',
    ref: 'worktree'
  })
  assert.equal(error, 'refused path')
})

test('validateWebrootBody: refuses an absolute path', () => {
  const error = validateWebrootBody({
    kind: 'webroot-write',
    label: 'x',
    path: '/etc/passwd',
    contentBase64: 'aGk='
  })
  assert.equal(error, 'refused path')
})

test('validateWebrootBody: refuses to read a configuration file, by any spelling (plan todo-site-changes Q1)', () => {
  for (const kind of ['webroot-file-diff', 'webroot-file-show']) {
    for (const path of [
      'wp-config.php',
      'blog/wp-config.php.bak',
      'configuration.php',
      '.env',
      'data/data.db'
    ]) {
      const body = { kind, label: 'x', path, ...(kind === 'webroot-file-show' ? { ref: 'worktree' } : {}) }
      assert.equal(validateWebrootBody(body), 'refused path: CONFIG_FILE_BLOCKED', `${kind} ${path}`)
    }
  }
  // Writing one stays the Apply door's and the edit script's business, not this reader's.
  assert.equal(
    validateWebrootBody({ kind: 'webroot-file-diff', label: 'x', path: 'wp-content/themes/x/style.css' }),
    null
  )
})

test('validateWebrootBody: refuses a bad sha', () => {
  const error = validateWebrootBody({ kind: 'webroot-commit', label: 'x', sha: 'not-a-sha' })
  assert.equal(error, 'refused sha')
})

test('validateWebrootBody: accepts a sha in the 7-64 hex charset', () => {
  assert.equal(validateWebrootBody({ kind: 'webroot-commit', label: 'x', sha: 'abc1234' }), null)
})

test('validateWebrootBody: refuses an unknown key', () => {
  const error = validateWebrootBody({ kind: 'webroot-changes', label: 'x', evil: 'true' })
  assert.equal(error, 'refused evil')
})

test('validateWebrootBody: webroot-file-show needs ref: baseline or worktree', () => {
  assert.equal(
    validateWebrootBody({ kind: 'webroot-file-show', label: 'x', path: 'index.php' }),
    'need ref: baseline or worktree'
  )
  assert.equal(
    validateWebrootBody({ kind: 'webroot-file-show', label: 'x', path: 'index.php', ref: 'baseline' }),
    null
  )
})

test('validateWebrootBody: webroot-write needs contentBase64, and refuses an oversized one', () => {
  assert.equal(
    validateWebrootBody({ kind: 'webroot-write', label: 'x', path: 'a.php' }),
    'need contentBase64'
  )
  const huge = 'A'.repeat(Math.floor((8 * 1024 * 1024 * 4) / 3) + 8)
  assert.equal(
    validateWebrootBody({ kind: 'webroot-write', label: 'x', path: 'a.php', contentBase64: huge }),
    'refused contentBase64: too large'
  )
})

test('validateWebrootBody: webroot-backup requires a non-empty single-line title', () => {
  assert.equal(validateWebrootBody({ kind: 'webroot-backup', label: 'x' }), 'refused title')
  assert.equal(
    validateWebrootBody({ kind: 'webroot-backup', label: 'x', title: 'line one\nline two' }),
    'refused title'
  )
  assert.equal(validateWebrootBody({ kind: 'webroot-backup', label: 'x', title: 'Ship it' }), null)
  assert.equal(
    validateWebrootBody({ kind: 'webroot-backup', label: 'x', title: 'Ship it', includeLarge: true }),
    null
  )
  assert.equal(
    validateWebrootBody({ kind: 'webroot-backup', label: 'x', title: 'Ship it', includeLarge: 'yes' }),
    'refused includeLarge'
  )
})

test('validateWebrootBody: webroot-backup takes no GitHub repo — a backup never leaves the host', () => {
  for (const extra of [{ repo: 'Org/repo' }, { siteKey: 'example.com' }]) {
    assert.equal(
      validateWebrootBody({ kind: 'webroot-backup', label: 'x', title: 'Ship it', ...extra }),
      `refused ${Object.keys(extra)[0]}`
    )
  }
})

test('validateWebrootBody: the backup kinds nobody sends are not kinds at all', () => {
  for (const kind of ['webroot-release', 'webroot-release-seal', 'webroot-releases']) {
    assert.equal(WEBROOT_JOBS[kind], undefined, kind)
  }
})

test('validateWebrootBody: webroot-moment requires a single-line title and no other key', () => {
  assert.equal(validateWebrootBody({ kind: 'webroot-moment', label: 'x' }), 'refused title')
  assert.equal(validateWebrootBody({ kind: 'webroot-moment', label: 'x', title: 'did the thing' }), null)
  assert.equal(
    validateWebrootBody({ kind: 'webroot-moment', label: 'x', title: 'did the thing', path: 'a.php' }),
    'refused path'
  )
})

test('validateWebrootBody: webroot-push needs tarballBase64 or deletes', () => {
  assert.equal(validateWebrootBody({ kind: 'webroot-push', label: 'x' }), 'need tarballBase64 or deletes')
  assert.equal(validateWebrootBody({ kind: 'webroot-push', label: 'x', deletes: ['a.php'] }), null)
})

test('validateWebrootBody: webroot-push refuses a delete path that escapes', () => {
  assert.equal(
    validateWebrootBody({ kind: 'webroot-push', label: 'x', deletes: ['../escape'] }),
    'refused deletes'
  )
})

// ---------------------------------------------------------------------------------------------
// WEBROOT_JOBS
// ---------------------------------------------------------------------------------------------

test('WEBROOT_JOBS: thirty kinds, each naming a script under webroot/', () => {
  assert.equal(Object.keys(WEBROOT_JOBS).length, 30)
  for (const [script] of Object.values(WEBROOT_JOBS)) {
    assert.match(
      script,
      /^(webroot-(git|pack|push|edit|backup|sync|live-push)|site-settings|site-address|site-demo-contact)\.sh$/
    )
  }
})

test('validateWebrootBody: webroot-restore-everything takes a backup version and who pressed, nothing else', () => {
  const ok = { kind: 'webroot-restore-everything', label: 'x', version: 4 }
  assert.equal(validateWebrootBody(ok), null)
  assert.equal(validateWebrootBody({ ...ok, byEmail: 'a@b.c', byName: 'A' }), null)
  for (const version of [0, -1, 1.5, '4', null, 1_000_000]) {
    assert.equal(validateWebrootBody({ ...ok, version }), 'refused version', String(version))
  }
  assert.equal(validateWebrootBody({ ...ok, byEmail: 'a@b.c\nx' }), 'refused byEmail')
  assert.equal(validateWebrootBody({ ...ok, sha: 'a'.repeat(40) }), null)
  assert.equal(validateWebrootBody({ ...ok, sha: 'not-a-sha' }), 'refused sha')
  assert.equal(validateWebrootBody({ ...ok, path: 'x' }), 'refused path')
})

const EXPORT_URL =
  'https://store.example/tracy-artifacts/backup-exports/s1/e1.zip?X-Amz-Expires=900&X-Amz-Signature=abc123'

test('validateWebrootBody: webroot-export takes a version, an https upload address and a ceiling, nothing else', () => {
  const ok = { kind: 'webroot-export', label: 'x', version: 4, uploadUrl: EXPORT_URL, maxBytes: 1024 }
  assert.equal(validateWebrootBody(ok), null)
  assert.equal(validateWebrootBody({ ...ok, includeLarge: true }), null)
  assert.equal(validateWebrootBody({ ...ok, includeLarge: 'yes' }), 'refused includeLarge')
  assert.equal(validateWebrootBody({ ...ok, installCode: '042917' }), null)
  for (const installCode of ['42917', '0429170', 42917, '04291a', '', ' 042917']) {
    assert.equal(
      validateWebrootBody({ ...ok, installCode }),
      'refused installCode',
      JSON.stringify(installCode)
    )
  }
  const { maxBytes: _, ...noCeiling } = ok
  assert.equal(validateWebrootBody(noCeiling), null)
  for (const version of [0, -1, 1.5, '4', null, 1_000_000]) {
    assert.equal(validateWebrootBody({ ...ok, version }), 'refused version', String(version))
  }
  for (const uploadUrl of [
    undefined,
    '',
    'http://store.example/x.zip?sig=1',
    'ftp://store.example/x.zip',
    'https://user:pw@store.example/x.zip',
    'https://store.example/x.zip?a=1 b',
    'https://store.example/x.zip?a="1"',
    'https://store.example/x\\.zip',
    'https://store.example/x.zip\nhttps://other',
    `https://store.example/${'a'.repeat(5000)}`,
    'not a url'
  ]) {
    assert.equal(validateWebrootBody({ ...ok, uploadUrl }), 'refused uploadUrl', String(uploadUrl))
  }
  for (const maxBytes of [0, -1, 1.5, '1024', 2 ** 41]) {
    assert.equal(validateWebrootBody({ ...ok, maxBytes }), 'refused maxBytes', String(maxBytes))
  }
  assert.equal(validateWebrootBody({ ...ok, path: 'x' }), 'refused path')
  assert.equal(validateWebrootBody({ ...ok, sha: 'abcdef1' }), 'refused sha')
})

test('validateWebrootBody: webroot-export takes a plain-http upload address only where the host says so (a local stand)', () => {
  const body = {
    kind: 'webroot-export',
    label: 'x',
    version: 4,
    uploadUrl: 'http://minio:9000/b/k.zip?X-Amz-Signature=1'
  }
  assert.equal(validateWebrootBody(body), 'refused uploadUrl')
  assert.equal(validateWebrootBody(body, { exportOverHttp: true }), null)
})

// ---------------------------------------------------------------------------------------------
// runWebrootJob
// ---------------------------------------------------------------------------------------------

function fakeJobs() {
  const store = new Map()
  return {
    async put(id, fields) {
      const current = store.get(id) ?? { id, createdAt: Date.now() }
      const next = { ...current, ...fields, updatedAt: Date.now() }
      store.set(id, next)
      return next
    },
    async get(id) {
      return store.get(id) ?? null
    }
  }
}

async function tmpConfig() {
  return { scriptsDir: await mkdtemp(path.join(tmpdir(), 'tracy-host-webroot-scripts-')) }
}

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

test('runWebrootJob: webroot-changes runs webroot-git.sh --op changes --label <label>', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  let seenArgs = null
  const run = async ({ script, args }) => {
    assert.equal(script, 'bash')
    seenArgs = args
    return { code: 0, tail: ['{"changed":[]}'] }
  }
  await runWebrootJob({
    jobId: 'job1',
    body: { kind: 'webroot-changes', label: 'lantern' },
    config,
    jobs,
    run
  })
  const job = await jobs.get('job1')
  assert.equal(job.state, 'done')
  assert.equal(job.output, '{"changed":[]}')
  assert.ok(seenArgs[0].endsWith('webroot/webroot-git.sh'))
  assert.deepEqual(seenArgs.slice(1), ['--label', 'lantern', '--op', 'changes'])
})

test('runWebrootJob: webroot-pack and webroot-push never receive --op', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  let seenArgs = null
  const run = async ({ args }) => {
    seenArgs = args
    return { code: 0, tail: [] }
  }
  await runWebrootJob({
    jobId: 'job1',
    body: { kind: 'webroot-pack', label: 'lantern' },
    config,
    jobs,
    run
  })
  assert.equal(seenArgs.includes('--op'), false)
})

test('runWebrootJob: a failing script produces a failed job with exitCode and output', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  const run = async () => ({ code: 1, tail: ['boom'] })
  await runWebrootJob({ jobId: 'job1', body: { kind: 'webroot-changes', label: 'x' }, config, jobs, run })
  const job = await jobs.get('job1')
  assert.equal(job.state, 'failed')
  assert.equal(job.exitCode, 1)
  assert.equal(job.output, 'boom')
})

test('runWebrootJob: webroot-write decodes contentBase64 to a temp --content-file that exists during the run and is gone after', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  let contentDuringRun = null
  const run = async ({ args }) => {
    const idx = args.indexOf('--content-file')
    const filePath = args[idx + 1]
    contentDuringRun = await readFile(filePath, 'utf8')
    return { code: 0, tail: [] }
  }
  const contentPath = await runCaptureContentPath({ config, jobs, run })
  assert.equal(contentDuringRun, 'hello webroot')
  assert.equal(await exists(contentPath), false)
})

async function runCaptureContentPath({ config, jobs, run }) {
  let captured = null
  const wrappedRun = async ({ script, args, env }) => {
    const idx = args.indexOf('--content-file')
    captured = args[idx + 1]
    return run({ script, args, env })
  }
  await runWebrootJob({
    jobId: 'job-write',
    body: {
      kind: 'webroot-write',
      label: 'x',
      path: 'index.php',
      contentBase64: Buffer.from('hello webroot').toString('base64')
    },
    config,
    jobs,
    run: wrappedRun
  })
  return captured
}

test('runWebrootJob: the content temp file is removed even when the script fails (finally, not happy-path unlink)', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  let capturedPath = null
  const run = async ({ args }) => {
    const idx = args.indexOf('--content-file')
    capturedPath = args[idx + 1]
    assert.equal(await exists(capturedPath), true)
    return { code: 1, tail: ['failed midway'] }
  }
  await runWebrootJob({
    jobId: 'job-write-fail',
    body: {
      kind: 'webroot-write',
      label: 'x',
      path: 'index.php',
      contentBase64: Buffer.from('secret content').toString('base64')
    },
    config,
    jobs,
    run
  })
  const job = await jobs.get('job-write-fail')
  assert.equal(job.state, 'failed')
  assert.equal(await exists(capturedPath), false)
})

test('runWebrootJob: webroot-write refuses to run the script on invalid base64, and fails the job', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  const run = async () => {
    throw new Error('must not be called')
  }
  await runWebrootJob({
    jobId: 'job-bad-b64',
    body: { kind: 'webroot-write', label: 'x', path: 'a.php', contentBase64: 'not-valid-base64!!' },
    config,
    jobs,
    run
  })
  const job = await jobs.get('job-bad-b64')
  assert.equal(job.state, 'failed')
  assert.equal(job.detail, 'contentBase64 is not base64')
})

test('runWebrootJob: webroot-backup writes a --notes-file from notesBase64, and removes it after the job whether it succeeds or fails', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  let notesPathSeen = null
  let notesContentDuringRun = null
  const run = async ({ args }) => {
    const idx = args.indexOf('--notes-file')
    notesPathSeen = args[idx + 1]
    notesContentDuringRun = await readFile(notesPathSeen, 'utf8')
    return { code: 0, tail: ['backed up'] }
  }
  await runWebrootJob({
    jobId: 'job-backup',
    body: {
      kind: 'webroot-backup',
      label: 'x',
      title: 'v1.0',
      notesBase64: Buffer.from('## Changelog\n- fixed things').toString('base64')
    },
    config,
    jobs,
    run
  })
  assert.equal(notesContentDuringRun, '## Changelog\n- fixed things')
  assert.equal(await exists(notesPathSeen), false)
  const job = await jobs.get('job-backup')
  assert.equal(job.state, 'done')
})

test('runWebrootJob: an export backup asks the script to snapshot large files under its backup lock', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  let seenArgs = []
  await runWebrootJob({
    jobId: 'job-backup-large',
    body: { kind: 'webroot-backup', label: 'x', title: 'Site export', includeLarge: true },
    config,
    jobs,
    run: async ({ args }) => {
      seenArgs = args
      return { code: 0, tail: ['backed up'] }
    }
  })
  assert.ok(seenArgs.includes('--include-large'))
})

test('runWebrootJob: webroot-restore-everything runs webroot-backup.sh --op restore-everything --version N with the presser', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  let seen = null
  const run = async ({ args }) => {
    seen = args
    return { code: 0, tail: ['{"ok":true}'] }
  }
  await runWebrootJob({
    jobId: 'job-restore-all',
    body: {
      kind: 'webroot-restore-everything',
      label: 'x',
      version: 3,
      sha: 'abcdef1',
      byEmail: 'a@b.c',
      byName: 'A'
    },
    config,
    jobs,
    run
  })
  assert.match(seen[0], /webroot-backup\.sh$/)
  assert.deepEqual(seen.slice(1), [
    '--label',
    'x',
    '--op',
    'restore-everything',
    '--sha',
    'abcdef1',
    '--version',
    '3',
    '--by-email',
    'a@b.c',
    '--by-name',
    'A'
  ])
  assert.equal((await jobs.get('job-restore-all')).state, 'done')
})

test('runWebrootJob: webroot-export hands the upload address in the environment, never in argv, and marks the upload step', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  let seen = null
  const steps = []
  const run = async ({ args, env, onLine }) => {
    seen = { args, env }
    await onLine?.('==> export: uploading backup 3 (1234 bytes)')
    steps.push((await jobs.get('job-export')).step)
    return { code: 0, tail: ['{"ok":true,"version":3}'] }
  }
  await runWebrootJob({
    jobId: 'job-export',
    body: {
      kind: 'webroot-export',
      label: 'x',
      version: 3,
      uploadUrl: EXPORT_URL,
      maxBytes: 2048,
      includeLarge: true,
      installCode: '730514'
    },
    config,
    jobs,
    run
  })
  assert.match(seen.args[0], /webroot-backup\.sh$/)
  assert.deepEqual(seen.args.slice(1), [
    '--label',
    'x',
    '--op',
    'export',
    '--version',
    '3',
    '--max-bytes',
    '2048',
    '--include-large'
  ])
  assert.equal(seen.env.TRACY_EXPORT_UPLOAD_URL, EXPORT_URL)
  assert.ok(!seen.args.join(' ').includes('X-Amz-Signature'), 'the address is not on the command line')
  assert.equal(seen.env.TRACY_EXPORT_INSTALL_CODE, '730514')
  assert.ok(!seen.args.join(' ').includes('730514'), 'nor is the install code')
  assert.ok(!JSON.stringify(await jobs.get('job-export')).includes('730514'), 'nor the job record')
  assert.deepEqual(steps, ['webroot-export:uploading'])
  const job = await jobs.get('job-export')
  assert.equal(job.state, 'done')
  assert.ok(!JSON.stringify(job).includes('X-Amz-Signature'), 'nor in the job record')
})

test('runWebrootJob: webroot-backup notes file is removed even when the underlying run() throws', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  let notesPathSeen = null
  const run = async ({ args }) => {
    const idx = args.indexOf('--notes-file')
    notesPathSeen = args[idx + 1]
    throw new Error('spawn exploded')
  }
  await runWebrootJob({
    jobId: 'job-backup-throw',
    body: {
      kind: 'webroot-backup',
      label: 'x',
      title: 'v1.0',
      notesBase64: Buffer.from('notes').toString('base64')
    },
    config,
    jobs,
    run
  })
  assert.equal(await exists(notesPathSeen), false)
  const job = await jobs.get('job-backup-throw')
  assert.equal(job.state, 'failed')
})

test('runWebrootJob: webroot-push writes both a tarball and a deletes file (trailing newline) and cleans both up', async () => {
  const config = await tmpConfig()
  const jobs = fakeJobs()
  let tarPath = null
  let delPath = null
  let delContent = null
  const run = async ({ args }) => {
    tarPath = args[args.indexOf('--tarball') + 1]
    delPath = args[args.indexOf('--deletes-file') + 1]
    delContent = await readFile(delPath, 'utf8')
    return { code: 0, tail: [] }
  }
  await runWebrootJob({
    jobId: 'job-push',
    body: {
      kind: 'webroot-push',
      label: 'x',
      tarballBase64: Buffer.from('fake tar bytes').toString('base64'),
      deletes: ['old.php']
    },
    config,
    jobs,
    run
  })
  assert.equal(delContent, 'old.php\n')
  assert.equal(await exists(tarPath), false)
  assert.equal(await exists(delPath), false)
})

// ---------------------------------------------------------------------------------------------
// writeCoreManifest — core-manifest-write, py:744-777. Not in WEBROOT_JOBS (no script), but the
// same /_host/site door — see webroot.js's module comment for why it was missed the first time.
// ---------------------------------------------------------------------------------------------

function validManifestBase64() {
  return Buffer.from(JSON.stringify({ platform: 'wordpress', extensions: ['seo', 'cache'] })).toString(
    'base64'
  )
}

test('writeCoreManifest: a valid manifest lands core-manifest.json and reports the extension count', async () => {
  const privateRoot = await tmpDir('private-cm')
  await mkdir(path.join(privateRoot, 'lantern'), { recursive: true })
  const result = await writeCoreManifest({
    label: 'lantern',
    contentBase64: validManifestBase64(),
    config: { privateRoot }
  })
  assert.deepEqual(result, { ok: true, extensions: 2 })
  const written = await readFile(path.join(privateRoot, 'lantern', 'core-manifest.json'), 'utf8')
  assert.deepEqual(JSON.parse(written), { platform: 'wordpress', extensions: ['seo', 'cache'] })
  // Atomic: no leftover temp file after a successful write.
  assert.equal(await exists(path.join(privateRoot, 'lantern', 'core-manifest.json.tmp')), false)
})

test('writeCoreManifest: 404 no such site when the site directory does not exist', async () => {
  const privateRoot = await tmpDir('private-cm')
  const result = await writeCoreManifest({
    label: 'ghost',
    contentBase64: validManifestBase64(),
    config: { privateRoot }
  })
  assert.deepEqual(result, { error: 'no such site', status: 404 })
})

test('writeCoreManifest: missing contentBase64 is refused 400', async () => {
  const privateRoot = await tmpDir('private-cm')
  await mkdir(path.join(privateRoot, 'lantern'), { recursive: true })
  const result = await writeCoreManifest({
    label: 'lantern',
    contentBase64: undefined,
    config: { privateRoot }
  })
  assert.equal(result.status, 400)
})

test('writeCoreManifest: an oversized contentBase64 (over 2 MiB) is refused 400', async () => {
  const privateRoot = await tmpDir('private-cm')
  await mkdir(path.join(privateRoot, 'lantern'), { recursive: true })
  const huge = 'A'.repeat(2 * 1024 * 1024 + 1)
  const result = await writeCoreManifest({ label: 'lantern', contentBase64: huge, config: { privateRoot } })
  assert.equal(result.status, 400)
})

test('writeCoreManifest: invalid base64 is refused "not a core manifest"', async () => {
  const privateRoot = await tmpDir('private-cm')
  await mkdir(path.join(privateRoot, 'lantern'), { recursive: true })
  const result = await writeCoreManifest({
    label: 'lantern',
    contentBase64: 'not-valid-base64!!',
    config: { privateRoot }
  })
  assert.deepEqual(result, { error: 'refused contentBase64: not a core manifest', status: 400 })
})

test('writeCoreManifest: valid base64 that decodes to non-manifest JSON is refused "not a core manifest"', async () => {
  const privateRoot = await tmpDir('private-cm')
  await mkdir(path.join(privateRoot, 'lantern'), { recursive: true })
  const notAManifest = Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64')
  const result = await writeCoreManifest({
    label: 'lantern',
    contentBase64: notAManifest,
    config: { privateRoot }
  })
  assert.deepEqual(result, { error: 'refused contentBase64: not a core manifest', status: 400 })
})

test('writeCoreManifest: extensions must be an array, not just any truthy value', async () => {
  const privateRoot = await tmpDir('private-cm')
  await mkdir(path.join(privateRoot, 'lantern'), { recursive: true })
  const bad = Buffer.from(JSON.stringify({ platform: 'wordpress', extensions: 'not-an-array' })).toString(
    'base64'
  )
  const result = await writeCoreManifest({ label: 'lantern', contentBase64: bad, config: { privateRoot } })
  assert.equal(result.status, 400)
})

// ---------------------------------------------------------------------------------------------
// /_host/agent-token — POST /_host/site — POST /_host/address — POST /_host/go-live (route wiring)
// ---------------------------------------------------------------------------------------------

async function tmpDir(name) {
  return mkdtemp(path.join(tmpdir(), `tracy-host-${name}-`))
}

function fakeJobsForApp() {
  const store = new Map()
  return {
    async put(id, fields) {
      const current = store.get(id) ?? { id, createdAt: Date.now() }
      const next = { ...current, ...fields, updatedAt: Date.now() }
      store.set(id, next)
      return next
    },
    async get(id) {
      return store.get(id) ?? null
    }
  }
}

async function baseConfig() {
  return {
    hostName: 'local',
    hostSecret: 'host-secret',
    sitesRoot: await tmpDir('sites'),
    privateRoot: await tmpDir('private'),
    scriptsDir: await tmpDir('scripts'),
    jobsDir: await tmpDir('jobs'),
    logDir: await tmpDir('logs'),
    cloudflare: null,
    // The protected token must be root's (`readAgentTokenCustody`); these suites run unprivileged,
    // so they name their own uid. `readConfig` never sets this, and tracy-host demands 0.
    tokenOwnerUid: process.getuid()
  }
}

async function signedPost(app, secret, urlPath, payload) {
  const body = JSON.stringify(payload)
  const headers = await signHostCall({ secret, path: urlPath, body })
  return app.fetch(new Request(`http://tracy-host.test${urlPath}`, { method: 'POST', headers, body }))
}

async function signedGet(app, secret, urlPath) {
  const headers = await signHostCall({ secret, path: urlPath, body: '' })
  return app.fetch(new Request(`http://tracy-host.test${urlPath}`, { method: 'GET', headers }))
}

// ⚠ A DEADLINE IN SECONDS, NOT A COUNT OF TRIES. It was `tries = 100, delayMs = 5` — about half a
// second of budget on an idle machine, and a WALL-CLOCK deadline in disguise on a busy one. Under
// the full `pnpm build:check` (thousands of tests, plus whatever else the laptop is running) that
// budget ran out and the run went red on a test nothing had touched — measured 11/09: 1177ms to
// burn through all 100 tries, and passing in 137ms the moment it ran alone. A gate that goes red
// for a reason that is not the code teaches people to re-run it, which is how a real red gets
// ignored. Ten seconds costs nothing when the job finishes in milliseconds, which it always does.
async function pollJob(app, secret, jobId, { until, timeoutMs = 10_000, delayMs = 5 } = {}) {
  const deadline = Date.now() + timeoutMs
  let job
  do {
    const res = await signedGet(app, secret, `/_host/jobs/${jobId}`)
    job = await res.json()
    if (until(job)) return job
    await new Promise((r) => setTimeout(r, delayMs))
  } while (Date.now() < deadline)
  throw new Error(`pollJob: gave up after ${timeoutMs}ms; last job was ${JSON.stringify(job)}`)
}

/** A `run` that records every call, and can be told how `mint-agent-token.sh` ends. `write` is
 * what a real successful mint does — the script leaves the token on disk, and this door reads it
 * back from there rather than out of the script's output. */
function fakeMintRun({ code = 0, tail = [], write = null, cfg = null } = {}) {
  const calls = []
  const run = async (args) => {
    calls.push(args)
    if (write && cfg) {
      await mkdir(path.join(cfg.privateRoot, write.label), { recursive: true })
      await writeFile(path.join(cfg.privateRoot, write.label, 'tracy-agent.token'), `${write.token}\n`, {
        mode: 0o600
      })
    }
    return { code, tail }
  }
  return { run, calls }
}

test('POST /_host/agent-token: reads the token file in the temp privateRoot for that label', async () => {
  const cfg = await baseConfig()
  await mkdir(path.join(cfg.privateRoot, 'lantern'), { recursive: true })
  await writeFile(path.join(cfg.privateRoot, 'lantern', '.env'), 'HOST_PORT=51770\nPLATFORM=joomla\n')
  await writeFile(path.join(cfg.privateRoot, 'lantern', 'tracy-agent.token'), 'tok_abc123\n')
  const mint = fakeMintRun()
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'lantern' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { token: 'tok_abc123' })
  assert.deepEqual(mint.calls, [], 'a site that already has its token was minted for anyway')
})

test('POST /_host/content-token: answers the 0600 relay token, never mints, refuses loose custody', async () => {
  const cfg = await baseConfig()
  const token = 'ec_pat_' + 'r'.repeat(43)
  const file = path.join(cfg.privateRoot, 'lantern', 'tracy-content.token')
  await mkdir(path.dirname(file), { recursive: true })
  const mint = fakeMintRun()
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
  const ask = async (label = 'lantern') => {
    const res = await signedPost(app, cfg.hostSecret, '/_host/content-token', { label })
    return [res.status, await res.json()]
  }

  assert.deepEqual(
    await ask(),
    [404, { code: 'NO_CONTENT_API' }],
    'no file is no reader, and nothing is minted'
  )
  await writeFile(file, `${token}\n`, { mode: 0o600 })
  assert.deepEqual(await ask(), [200, { token }])
  await chmod(file, 0o644)
  assert.deepEqual(await ask(), [404, { code: 'NO_CONTENT_API' }], 'a world-readable token is not answered')
  await chmod(file, 0o600)
  await writeFile(file, 'ec_pat_short\n')
  assert.deepEqual(await ask(), [404, { code: 'NO_CONTENT_API' }], 'a malformed token is not answered')
  assert.equal((await ask('../etc'))[0], 400)
  assert.deepEqual(mint.calls, [])
})

test('POST /_host/agent-token: no token file mints one, and answers what landed on disk', async () => {
  const cfg = await baseConfig()
  const mint = fakeMintRun({ cfg, write: { label: 'ghost', token: 'c0ffee'.repeat(6) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'ghost' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { token: 'c0ffee'.repeat(6) })

  assert.equal(mint.calls.length, 1)
  const call = mint.calls[0]
  assert.equal(call.script, 'bash')
  assert.deepEqual(call.args, [
    path.join(cfg.scriptsDir, 'provision/mint-agent-token.sh'),
    '--label',
    'ghost'
  ])
  // 🔒 The script's last line is the site's write key. A logPath here would put it in a file on
  // the host that nothing ever rotates, for every site this door ever heals.
  assert.equal(call.logPath, undefined, 'the mint streamed the token into a log file')
  assert.equal(call.env.TRACY_PRIVATE_ROOT, cfg.privateRoot)
  assert.equal(call.env.TRACY_SITES_ROOT, cfg.sitesRoot)
})

test('POST /_host/agent-token: the script’s own code reaches the caller, one per repair', async () => {
  const cases = [
    ['SITE_UNKNOWN', 404, 'no site directory at /srv/tracy/ghost'],
    ['NOT_JOOMLA', 409, 'no configuration.php at /srv/tracy-sites/ghost/.webroot/configuration.php'],
    ['SITE_DOWN', 409, 'the db service of ghost is not running — start the site first'],
    ['COMPONENT_NOT_INSTALLED', 409, 'no com_claudecowork row in `jos19_extensions`'],
    // EmDash's own: the container was reached and ran the minter, and what came back was not a
    // PAT. A CONFLICT like the four above — the 500 below is for a script that never named itself.
    ['EMDASH_MINT_REFUSED', 409, 'the site did not mint a PAT: SqliteError: readonly database']
  ]
  for (const [code, status, why] of cases) {
    const cfg = await baseConfig()
    const mint = fakeMintRun({
      code: 3,
      tail: ['==> reading the component token', `TRACY_ERROR ${code}`, `!! ${why}`]
    })
    const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
    const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'ghost' })
    assert.equal(res.status, status, code)
    assert.deepEqual(await res.json(), { code, detail: why })
  }
})

test('POST /_host/agent-token: a failure the script did not name is MINT_FAILED, not a 404', async () => {
  const cfg = await baseConfig()
  // A script that died before it could name itself (killed, bash not found, a bug) — the one thing
  // this must not do is answer as if the site simply had no token, which is where it started.
  const mint = fakeMintRun({ code: 1, tail: ['bash: line 1: docker: command not found'] })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'ghost' })
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { code: 'MINT_FAILED', detail: '' })
})

test('POST /_host/agent-token: exit 0 that left no file is a failure, not an empty success', async () => {
  const cfg = await baseConfig()
  const mint = fakeMintRun({ code: 0, tail: [] })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'ghost' })
  assert.equal(res.status, 500)
  assert.equal((await res.json()).code, 'MINT_FAILED')
})

// ---------------------------------------------------------------------------------------------
// /_host/agent-token — CUSTODY, not presence (20/09/2026)
//
// An EmDash site keeps the PAT in two files, and until this door learned that, every site the
// generic EmDash road provisioned read as healthy: the host copy was there, so the door answered
// 200 and the repair standing right behind it never ran. The site's own container had nothing, so
// every `tracy_emdash` call refused `NO_TOKEN`. Measured on `demoemdash1`.
// ---------------------------------------------------------------------------------------------

/** A site directory shaped like EmDash's: `data/data.db` is what both this door and
 * `mint-agent-token.sh` read as "this is an EmDash site", so the two agree without being told. */
async function emdashSite(cfg, label, { host = null, inSite = null, mount = false } = {}) {
  await mkdir(path.join(cfg.privateRoot, label, 'data'), { recursive: true })
  await writeFile(path.join(cfg.privateRoot, label, 'data', 'data.db'), 'SQLite format 3\u0000')
  // 0600, the mode provision stores it with — a wider one is refused as unprovable custody.
  if (host !== null)
    await writeFile(path.join(cfg.privateRoot, label, 'tracy-agent.token'), `${host}\n`, { mode: 0o600 })
  if (inSite !== null)
    await writeFile(path.join(cfg.privateRoot, label, 'data', 'tracy-agent.token'), `${inSite}\n`)
  // The site's own compose file is what says which custody it is under, and since 23/09/2026 only
  // the exact file render-compose.sh writes counts: `mount: true` is a site born after #155, and
  // without it the directory is a pre-#155 site (`emdashCompose`, token-custody-cases.mjs).
  await writeFile(
    path.join(cfg.privateRoot, label, 'docker-compose.yml'),
    emdashCompose(path.join(cfg.privateRoot, label), { token: mount ? 'generator' : 'none' })
  )
}

/** What a refused call must leave exactly as it was: no token out, no mint, host bytes and inode
 * unchanged (or still absent), and no agent-readable `data/` copy. */
async function assertCustodyRefused(app, cfg, label, mint, { host = null, inSite = null } = {}) {
  const siteDir = path.join(cfg.privateRoot, label)
  const tokenFile = path.join(siteDir, 'tracy-agent.token')
  const legacyCopy = path.join(siteDir, 'data', 'tracy-agent.token')
  const before = host === null ? null : await stat(tokenFile)
  for (const attempt of [1, 2]) {
    const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label })
    assert.equal(res.status, 409, `attempt ${attempt}`)
    const body = await res.json()
    assert.equal(body.code, 'TOKEN_CUSTODY_UNKNOWN', `attempt ${attempt}`)
    assert.equal('token' in body, false, 'a token was handed out for a custody nobody could prove')
    assert.doesNotMatch(JSON.stringify(body), /livepat|stale0|agreed/)
  }
  assert.deepEqual(mint.calls, [], 'the legacy repair ran on custody the host could not prove')
  if (host === null) assert.equal(existsSync(tokenFile), false, 'a host token file was created')
  else {
    assert.equal((await stat(tokenFile)).ino, before.ino, 'the host token inode was replaced')
    assert.equal(await readFile(tokenFile, 'utf8'), `${host}\n`)
  }
  if (inSite === null)
    assert.equal(existsSync(legacyCopy), false, 'the agent-readable data/ copy was written')
  else assert.equal(await readFile(legacyCopy, 'utf8'), `${inSite}\n`)
}

// 🔒 FAIL CLOSED (23/09/2026). A compose file that declares no mount while the protected host
// token file `<siteDir>/tracy-agent.token` exists is two pieces of host evidence disagreeing. Its
// likeliest cause is a protected site whose compose lost the mount entry while its container kept
// the bind — where the legacy repair revokes the credential the container reads, `mv`s a new inode
// over the one it holds, and writes the readable copy back. Until this date these three states
// were repaired or answered (`demoemdash1`); now each is refused and nothing is touched.
for (const [name, inSite] of [
  ['the host holds a token the container copy lacks', null],
  ['both copies hold the same token', 'agreed'.repeat(6)],
  ['the two copies name different tokens', 'newpat'.repeat(6)]
]) {
  test(`🔒 POST /_host/agent-token: no mount declared and ${name} — TOKEN_CUSTODY_UNKNOWN, nothing touched`, async () => {
    const cfg = await baseConfig()
    const host = inSite === 'agreed'.repeat(6) ? inSite : 'stale0'.repeat(6)
    await emdashSite(cfg, 'nomount', { host, inSite })
    const mint = fakeMintRun({ cfg, write: { label: 'nomount', token: 'fresh1'.repeat(6) } })
    const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
    await assertCustodyRefused(app, cfg, 'nomount', mint, { host, inSite })
  })
}

test('POST /_host/agent-token: an EmDash site under the PROTECTED mount has no second copy to be missing', async () => {
  const cfg = await baseConfig()
  // A site born after #155: the container reads the host file itself through
  // `./tracy-agent.token:/run/tracy-agent.token:ro`, and provision DELETES the `data/` copy on
  // purpose — that directory is agent-writable. Read as "the container never got it", this door
  // sends the site into `mint-agent-token.sh`, whose legacy repair replaces the inode the running
  // container is holding and writes the readable copy back. Green pairing, dead agent.
  await emdashSite(cfg, 'protected1', { host: 'livepat'.repeat(5), mount: true })
  const mint = fakeMintRun({ cfg, write: { label: 'protected1', token: 'reminted'.repeat(4) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'protected1' })
  assert.equal(res.status, 200)
  assert.deepEqual(mint.calls, [], 'a site under the protected mount was re-minted, revoking a live PAT')
  assert.deepEqual(await res.json(), { token: 'livepat'.repeat(5) })
})

test('🔒 POST /_host/agent-token: a valid protected mount survives repeated calls — inode, bytes, no data/ copy', async () => {
  const cfg = await baseConfig()
  // The three things the legacy repair does, asserted as three things that MUST NOT happen — not
  // just "mint was not called". The container resolved this bind at create time, so the inode is
  // the identity that matters; the bytes are the credential; and the `data/` copy is the readable
  // PAT the mount exists to remove. A door that did any of the three would leave pairing green and
  // `tracy_emdash` refusing (#155).
  await emdashSite(cfg, 'protected2', { host: 'livepat'.repeat(5), mount: true })
  const tokenFile = path.join(cfg.privateRoot, 'protected2', 'tracy-agent.token')
  const legacyCopy = path.join(cfg.privateRoot, 'protected2', 'data', 'tracy-agent.token')
  const before = await stat(tokenFile)
  const mint = fakeMintRun({ cfg, write: { label: 'protected2', token: 'reminted'.repeat(4) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  for (const attempt of [1, 2, 3]) {
    const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'protected2' })
    assert.equal(res.status, 200, `attempt ${attempt}`)
    assert.deepEqual(await res.json(), { token: 'livepat'.repeat(5) }, `attempt ${attempt}`)
  }
  assert.deepEqual(mint.calls, [], 'the repair ran on a site whose custody was already finished')
  const after = await stat(tokenFile)
  assert.equal(
    after.ino,
    before.ino,
    'the token file was replaced — the running container holds the old inode'
  )
  assert.equal(await readFile(tokenFile, 'utf8'), `${'livepat'.repeat(5)}\n`)
  assert.equal(existsSync(legacyCopy), false, 'the agent-readable data/ copy was put back')
})

// A protected bind whose host file was DELETED while the container kept running (Astra review,
// 23/09/2026). The container still reads the old inode; minting writes a new file it never sees and
// revokes the credential it is still presenting — pairing 200, MCP dead. Refuse, name the repair.
test('🔒 POST /_host/agent-token: a protected bind whose host token was DELETED is refused — no mint, no new file, no data/ copy', async () => {
  const cfg = await baseConfig()
  await emdashSite(cfg, 'gonetoken', { host: 'livepat'.repeat(5), mount: true })
  const siteDir = path.join(cfg.privateRoot, 'gonetoken')
  const tokenFile = path.join(siteDir, 'tracy-agent.token')
  await unlink(tokenFile)
  const mint = fakeMintRun({ cfg, write: { label: 'gonetoken', token: 'reminted'.repeat(4) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  for (const attempt of [1, 2]) {
    const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'gonetoken' })
    assert.equal(res.status, 409, `attempt ${attempt}`)
    const body = await res.json()
    assert.equal(body.code, 'TOKEN_CUSTODY_UNKNOWN', `attempt ${attempt}`)
    assert.equal('token' in body, false)
  }
  assert.deepEqual(mint.calls, [], 'the mint ran and would revoke the PAT the container still reads')
  assert.equal(existsSync(tokenFile), false, 'a new token file (an inode the container never sees) appeared')
  assert.equal(existsSync(path.join(siteDir, 'data', 'tracy-agent.token')), false)
})

test('POST /_host/agent-token: a protected bind whose host token is EMPTY still reaches the in-place mint', async () => {
  const cfg = await baseConfig()
  await emdashSite(cfg, 'emptytoken', { host: '', mount: true })
  const mint = fakeMintRun({ cfg, write: { label: 'emptytoken', token: 'freshpat'.repeat(4) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'emptytoken' })
  assert.equal(res.status, 200)
  assert.equal(mint.calls.length, 1)
  assert.deepEqual(await res.json(), { token: 'freshpat'.repeat(4) })
})

test('POST /_host/agent-token: a LEGACY EmDash site with no host token is still minted', async () => {
  const cfg = await baseConfig()
  await emdashSite(cfg, 'legacynone')
  const mint = fakeMintRun({ cfg, write: { label: 'legacynone', token: 'freshpat'.repeat(4) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'legacynone' })
  assert.equal(res.status, 200)
  assert.equal(mint.calls.length, 1, 'a pre-#155 site lost its only repair')
  assert.deepEqual(await res.json(), { token: 'freshpat'.repeat(4) })
})

test('🔒 POST /_host/agent-token: the bind must be a volumes ITEM, not a sentence about one', async () => {
  const cfg = await baseConfig()
  // A compose file that only MENTIONS the mount — in a comment, which is exactly where this
  // custody gets explained — is not a site under it. Read the other way round this door would
  // answer "finished" for a container that never had the file, and the site would stay broken with
  // nothing saying so.
  // No host token: a pre-#155 site, so the one path this proves is the legacy mint.
  await emdashSite(cfg, 'commented')
  await writeFile(
    path.join(cfg.privateRoot, 'commented', 'docker-compose.yml'),
    emdashCompose(path.join(cfg.privateRoot, 'commented')).replace(
      '      - app:/app\n',
      '      # protected custody writes ./tracy-agent.token:/run/tracy-agent.token:ro here\n      - app:/app\n'
    )
  )
  const mint = fakeMintRun({ cfg, write: { label: 'commented', token: 'fresh1'.repeat(6) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'commented' })
  assert.equal(res.status, 200)
  assert.equal(mint.calls.length, 1, 'a comment was read as a mount')
  assert.deepEqual(await res.json(), { token: 'fresh1'.repeat(6) })
})

test('🔒 POST /_host/agent-token: a WRITABLE token bind is not protected custody — refused, never repaired', async () => {
  const cfg = await baseConfig()
  // Drift, not custody: the item is there but without `:ro`, so the agent's own shell can write
  // through it. This door may not read that as "finished" — and it may not run the legacy repair
  // either, because that `mv`s the file the container is bound to. It names the conflict instead.
  await emdashSite(cfg, 'halfmount', { host: 'stale0'.repeat(6) })
  await writeFile(
    path.join(cfg.privateRoot, 'halfmount', 'docker-compose.yml'),
    'services:\n  web:\n    volumes:\n      - ./tracy-agent.token:/run/tracy-agent.token\n'
  )
  const tokenFile = path.join(cfg.privateRoot, 'halfmount', 'tracy-agent.token')
  const before = await stat(tokenFile)
  const mint = fakeMintRun({ cfg, write: { label: 'halfmount', token: 'fresh1'.repeat(6) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'halfmount' })
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.code, 'TOKEN_CUSTODY_UNKNOWN')
  assert.equal('token' in body, false, 'a token was handed out for a custody nobody could prove')
  assert.deepEqual(mint.calls, [], 'a writable bind was sent into the legacy repair')
  assert.equal((await stat(tokenFile)).ino, before.ino)
  assert.equal(existsSync(path.join(cfg.privateRoot, 'halfmount', 'data', 'tracy-agent.token')), false)
})

// ── the LONG-form bind (Astra review, 22/09/2026; exact forms, 23/09/2026) ──────────────────
//
// Compose accepts the same read-only bind as a mapping, and a door that knew only the short form
// once read such a site as legacy and ran the repair. Since 23/09 the answer is neither: the fleet
// never writes this form, so it cannot be proven — 409, no token, no mint, nothing touched.
const LONG_FORM_COMPOSE = (siteDir) =>
  emdashCompose(siteDir, { token: 'generator' }).replace(
    '      - ./tracy-agent.token:/run/tracy-agent.token:ro\n',
    [
      '      - type: bind',
      '        source: ./tracy-agent.token',
      '        target: /run/tracy-agent.token',
      '        read_only: true',
      ''
    ].join('\n')
  )

test('🔒 POST /_host/agent-token: a hand-written LONG-form bind is not a fleet form — refused, no mint, same inode', async () => {
  const cfg = await baseConfig()
  const host = 'livepat'.repeat(5)
  await emdashSite(cfg, 'longform', { host })
  const siteDir = path.join(cfg.privateRoot, 'longform')
  const text = LONG_FORM_COMPOSE(siteDir)
  assert.match(text, /source: \.\/tracy-agent\.token/)
  await writeFile(path.join(siteDir, 'docker-compose.yml'), text)
  const mint = fakeMintRun({ cfg, write: { label: 'longform', token: 'reminted'.repeat(4) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
  await assertCustodyRefused(app, cfg, 'longform', mint, { host })
})

test('POST /_host/agent-token: a flow-mapping token bind cannot be proven — refused, no mint', async () => {
  const cfg = await baseConfig()
  await emdashSite(cfg, 'flowmap', { host: 'livepat'.repeat(5) })
  await writeFile(
    path.join(cfg.privateRoot, 'flowmap', 'docker-compose.yml'),
    'services:\n  web:\n    volumes:\n      - {type: bind, source: ./tracy-agent.token, target: /run/tracy-agent.token, read_only: true}\n'
  )
  const mint = fakeMintRun({ cfg, write: { label: 'flowmap', token: 'reminted'.repeat(4) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'flowmap' })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).code, 'TOKEN_CUSTODY_UNKNOWN')
  assert.deepEqual(mint.calls, [])
})

test('POST /_host/agent-token: a Joomla site never asks the compose question', async () => {
  const cfg = await baseConfig()
  // No EmDash mark, and `.env` proves Joomla. Even a compose file naming the path in an unprovable
  // shape does not change the single-read path Joomla has always had.
  await mkdir(path.join(cfg.privateRoot, 'joomla1'), { recursive: true })
  await writeFile(path.join(cfg.privateRoot, 'joomla1', '.env'), 'HOST_PORT=51770\nPLATFORM=joomla\n')
  await writeFile(path.join(cfg.privateRoot, 'joomla1', 'tracy-agent.token'), `${'joomlapat'.repeat(4)}\n`)
  await writeFile(
    path.join(cfg.privateRoot, 'joomla1', 'docker-compose.yml'),
    'services:\n  web:\n    volumes:\n      - ./tracy-agent.token:/run/tracy-agent.token\n'
  )
  const mint = fakeMintRun()
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'joomla1' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { token: 'joomlapat'.repeat(4) })
  assert.deepEqual(mint.calls, [])
})

// ---------------------------------------------------------------------------------------------
// The door and mint-agent-token.sh, held to one table
// ---------------------------------------------------------------------------------------------

const MINT_SCRIPT = new URL(
  '../../../packages/fleet/tracy-fleet-operation/scripts/provision/mint-agent-token.sh',
  import.meta.url
).pathname

/** One function of `mint-agent-token.sh`, exactly as the script defines it. */
async function mintFunction(name) {
  const source = await readFile(MINT_SCRIPT, 'utf8')
  const fn = new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm').exec(source)
  assert.ok(fn, `${name}() is no longer in mint-agent-token.sh`)
  return fn[0]
}

// 🔒 A FEW SHELLS FOR THE WHOLE TABLE, NOT ONE PER ROW (27/09/2026). These three tests used to start
// one `bash -c` per row, one after another: 477 processes, each then starting the sha256sum, cut,
// awk or grep its function runs. On the busy CI runners (tracy-ci-01, tracy-ci-04; PRs #482 and
// #484) that measured 7.0-7.2 s for the 117 compose shapes, 10.1 s and then more than 15 s for the
// 90 site shapes, and more than 30 s twice for the 270 labelled rows, so the 15 s and 30 s budgets
// failed on machine load alone; the other runners took 2.3-8.1 s for the same tests. The rows now
// go to `SHELL_POOL` bash processes running side by side, and the budget is the suite's own
// `--test-timeout` (package.json `test:workers`). The per-row work cannot shrink: it is the
// script's own.
const SHELL_POOL = 4
const tempRoots = []
after(() => Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true }))))
const execFileAsync = promisify(execFile)
const AGREEMENT_TIMEOUT_MS = 120_000
// A hang guard, not a speed budget: a row that blocks (a FIFO read) kills its batch and is named.
const SHELL_BATCH_TIMEOUT_MS = 60_000

/**
 * Every row's answer from one extracted `mint-agent-token.sh` function, asked in at most
 * `SHELL_POOL` bash processes at once. Each row still runs in its own subshell, so nothing one row
 * sets reaches the next, and each answer ends with a NUL: a shell variable cannot hold one, so no
 * answer can take another row's place.
 * @param {string} functions - the function definitions the call needs, as the script has them.
 * @param {string} call - one row's call, reading that row's arguments as "$1", "$2"...
 * @param {Array<{name: string, argv: string[]}>} rows - every row passes the same number of arguments.
 * @param {string} [awkDir] - a directory put first in PATH, so its `awk` is the one the function runs.
 * @returns {Promise<string[]>} each row's answer, trimmed, in row order.
 */
async function shellAnswers(functions, call, rows, awkDir) {
  const arity = rows[0].argv.length
  assert.ok(
    rows.every((row) => row.argv.length === arity),
    'every row passes the same number of arguments'
  )
  const script = [
    functions,
    'while [ "$#" -gt 0 ]; do',
    `  answer="$(${call})"`,
    `  printf '%s\\0' "$answer"`,
    `  shift ${arity}`,
    'done'
  ].join('\n')
  const size = Math.ceil(rows.length / SHELL_POOL)
  const batches = []
  for (let at = 0; at < rows.length; at += size) batches.push(rows.slice(at, at + size))
  const answers = await Promise.all(
    batches.map(async (batch) => {
      const argv = ['-c', script, 'agreement', ...batch.flatMap((row) => row.argv)]
      const env = awkDir
        ? { ...process.env, PATH: `${awkDir}${path.delimiter}${process.env.PATH}` }
        : process.env
      const out = await execFileAsync('bash', argv, { timeout: SHELL_BATCH_TIMEOUT_MS, env }).then(
        ({ stdout }) => stdout.split('\0'),
        (error) => {
          // The answers that did arrive say which row never did.
          const answered = String(error.stdout ?? '').split('\0').length - 1
          const how = error.killed ? `killed after ${SHELL_BATCH_TIMEOUT_MS} ms` : `exit ${error.code}`
          assert.fail(`script: no answer for ${batch[answered]?.name} (${how}): ${error.stderr ?? ''}`)
        }
      )
      assert.equal(out.pop(), '', 'the script printed something after its last answer')
      assert.equal(out.length, batch.length, 'one answer per row')
      return out.map((answer) => answer.trim())
    })
  )
  return answers.flat()
}

// 🔒 EVERY AWK A SERVER MAY CALL `awk` (30/10/2026). `token_mount_custody` runs whatever `awk` the
// host has: mawk on a stock Debian, GNU awk where someone installed it, busybox awk on a slim image.
// GNU awk 5.2.1 once aborted (exit 2, no answer) on short composes mawk answered, so the table is
// asked of each one this machine has, through an `awk` shim put first in PATH, plus the plain `awk`.
const AWKS = [
  ['gawk', 'gawk', []],
  ['mawk', 'mawk', []],
  ['busybox awk', 'busybox', ['awk']]
]

/** `[name, directory whose awk is that awk]` for each awk of `AWKS` found on PATH. */
async function awkShims() {
  const found = []
  for (const [name, bin, args] of AWKS) {
    const dir = (process.env.PATH ?? '').split(path.delimiter).find((d) => d && existsSync(path.join(d, bin)))
    if (!dir) continue
    const shimDir = await mkdtemp(path.join(tmpdir(), 'tracy-host-awk-'))
    tempRoots.push(shimDir)
    const quoted = [path.join(dir, bin), ...args].map((word) => `'${word}'`).join(' ')
    await writeFile(path.join(shimDir, 'awk'), `#!/bin/sh\nexec ${quoted} "$@"\n`)
    await chmod(path.join(shimDir, 'awk'), 0o755)
    found.push([name, shimDir])
  }
  return found
}

// The door and `mint-agent-token.sh` must agree about every compose file both read: if they split,
// one of them runs (or skips) the legacy repair the other was built to prevent. And agreeing is not
// enough — they once agreed that any source named `tracy-agent.token` was the protected one — so
// each case carries its own expected answer (`token-custody-cases.mjs`), and the script's awk is
// extracted and held to it exactly as the JavaScript is.
test('🔒 the door and mint-agent-token.sh classify every compose shape as the shared table says', {
  timeout: AGREEMENT_TIMEOUT_MS
}, async () => {
  const custody = await mintFunction('token_mount_custody')
  const root = await mkdtemp(path.join(tmpdir(), 'tracy-host-custody-'))
  try {
    const rows = []
    for (const [expected, cases] of Object.entries(CUSTODY_CASES)) {
      for (const [name, compose] of cases) {
        // A directory per row, since every file is written before the shell reads any.
        const siteDir = await mkdtemp(path.join(root, 'tracy-host-custody-'))
        const file = path.join(siteDir, 'docker-compose.yml')
        const text = compose(siteDir)
        await writeFile(file, text)
        rows.push({ name, expect: expected, text, siteDir, argv: [file, siteDir] })
      }
    }
    for (const row of rows) {
      assert.equal(classifyTokenMount(row.text, row.siteDir), row.expect, `door: ${row.name}`)
    }
    for (const [awk, awkDir] of [['awk', undefined], ...(await awkShims())]) {
      const shell = await shellAnswers(custody, 'token_mount_custody "$1" "$2"', rows, awkDir)
      for (const [i, row] of rows.entries()) {
        assert.equal(shell[i], row.expect, `script under ${awk}: ${row.name}`)
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// 🔒 WHAT MAKES A SITE EMDASH IS ASKED OF EVERY MARK, NOT OF `data/data.db` ALONE (Astra review,
// 23/09/2026). The door and `mint-agent-token.sh` must agree: a site one calls Joomla and the other
// EmDash is read with no custody question on one side. Each row carries its own answer.
test('🔒 the door and mint-agent-token.sh answer "is this EmDash" as the shared table says', {
  timeout: AGREEMENT_TIMEOUT_MS
}, async () => {
  const shape = await mintFunction('site_shape')
  const proof = await mintFunction('compose_proves_php')
  const root = await mkdtemp(path.join(tmpdir(), 'tracy-host-shape-'))
  try {
    const rows = []
    for (const row of SITE_SHAPE_CASES) {
      const siteDir = await mkdtemp(path.join(root, 'tracy-host-shape-'))
      row.arrange(siteDir)
      rows.push({ ...row, siteDir, argv: [siteDir] })
    }
    const shell = await shellAnswers(`${proof}\n${shape}`, 'site_shape "$1"', rows)
    for (const [i, row] of rows.entries()) {
      assert.equal(await siteShape(row.siteDir), row.expect, `door: ${row.name}`)
      assert.equal(shell[i], row.expect, `script: ${row.name}`)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// 🔒 A LONG LABEL'S ALIASED NETWORK IS A FLEET FORM (23/09/2026). Since #165 the generator
// writes a `tracy-web-<hash>` alias for any label whose `<label>-web-1` exceeds 63 octets, and the
// matchers derive that alias from the label — so these rows run in a directory named for their own
// label, through the door and the extracted awk alike.
// Every row is written, asked of the door and asked of the script ONCE, all side by side, the first
// time a row's test needs the answers; each row is then its own `test()`, so a red row names itself
// and the file spends its time on the script's own work, not on one row after another.
let labelledForms
function askLabelledForms() {
  labelledForms ??= (async () => {
    const custody = await mintFunction('token_mount_custody')
    const proof = await mintFunction('compose_proves_php')
    const shape = await mintFunction('site_shape')
    const root = await mkdtemp(path.join(tmpdir(), 'tracy-host-labelled-'))
    tempRoots.push(root)
    const composes = await Promise.all(
      LABELLED_CUSTODY_CASES.map(async (row, i) => {
        const siteDir = path.join(root, `custody-${i}`, row.label)
        await mkdir(siteDir, { recursive: true })
        const file = path.join(siteDir, 'docker-compose.yml')
        const text = row.compose(siteDir)
        await writeFile(file, text)
        return { ...row, text, siteDir, argv: [file, siteDir] }
      })
    )
    const shapes = await Promise.all(
      LABELLED_SITE_SHAPE_CASES.map(async (row, i) => {
        const siteDir = path.join(root, `shape-${i}`, row.label)
        await mkdir(siteDir, { recursive: true })
        row.arrange(siteDir)
        return { ...row, siteDir, argv: [siteDir] }
      })
    )
    const [custodyShell, shapeShell, shapeDoor] = await Promise.all([
      shellAnswers(custody, 'token_mount_custody "$1" "$2"', composes),
      shellAnswers(`${proof}\n${shape}`, 'site_shape "$1"', shapes),
      Promise.all(shapes.map((row) => siteShape(row.siteDir)))
    ])
    return { composes, shapes, custodyShell, shapeShell, shapeDoor }
  })()
  return labelledForms
}

describe('🔒 the door and mint-agent-token.sh agree on long-label forms, as the shared table says', () => {
  for (const [i, row] of LABELLED_CUSTODY_CASES.entries()) {
    test(`custody: ${row.name}`, { timeout: AGREEMENT_TIMEOUT_MS }, async () => {
      const f = await askLabelledForms()
      const mine = f.composes[i]
      assert.equal(classifyTokenMount(mine.text, mine.siteDir), row.expect, 'door')
      assert.equal(f.custodyShell[i], row.expect, 'script')
    })
  }
  for (const [i, row] of LABELLED_SITE_SHAPE_CASES.entries()) {
    test(`site shape: ${row.name}`, { timeout: AGREEMENT_TIMEOUT_MS }, async () => {
      const f = await askLabelledForms()
      assert.equal(f.shapeDoor[i], row.expect, 'door')
      assert.equal(f.shapeShell[i], row.expect, 'script')
    })
  }
})

// 🔒 AN EMDASH SITE WHOSE DATABASE IS MISSING IS STILL EMDASH (Astra review, 23/09/2026). The door
// used to read such a site as Joomla/WordPress: the host token was read with no custody question, so
// a wrong or missing compose answered 200 and a FIFO token hung the door. Each row: 409, no token,
// no mint, the host token path untouched.
for (const [name, arrange] of [
  [
    'data/ without data.db, a hand-edited compose, the host token a FIFO',
    async (d, file) => {
      await mkdir(path.join(d, 'data'))
      await writeFile(path.join(d, 'docker-compose.yml'), 'services:\n  web:\n    image: x\n')
      execFileSync('mkfifo', [file])
    }
  ],
  [
    'data/ without data.db, no compose, a regular host token',
    async (d, file) => {
      await mkdir(path.join(d, 'data'))
      await writeFile(file, `${'livepat'.repeat(5)}\n`, { mode: 0o600 })
    }
  ],
  [
    'data a regular file (stat of data.db fails), the generator compose LOST its mount, a regular host token',
    async (d, file) => {
      await writeFile(path.join(d, 'data'), '')
      await writeFile(path.join(d, 'docker-compose.yml'), emdashCompose(d))
      await writeFile(file, `${'livepat'.repeat(5)}\n`, { mode: 0o600 })
    }
  ],
  [
    'data/data.db a directory, a hand-edited compose, a regular host token',
    async (d, file) => {
      await mkdir(path.join(d, 'data', 'data.db'), { recursive: true })
      await writeFile(path.join(d, 'docker-compose.yml'), 'services: {}\n')
      await writeFile(file, `${'livepat'.repeat(5)}\n`, { mode: 0o600 })
    }
  ],
  [
    'no data/ at all, .env naming PLATFORM=emdash, no compose, the host token a FIFO',
    async (d, file) => {
      await writeFile(path.join(d, '.env'), 'HOST_PORT=51770\nPLATFORM=emdash\n')
      execFileSync('mkfifo', [file])
    }
  ],
  [
    'a Joomla-looking directory whose .env is a FIFO, the host token a FIFO',
    async (d, file) => {
      execFileSync('mkfifo', [path.join(d, '.env')])
      execFileSync('mkfifo', [file])
    }
  ],
  // 🔒 NO MARK IS NOT PROOF OF JOOMLA (Astra review, 23/09/2026): an EmDash site that lost `data/`,
  // `uploads/` and its `.env` marks, its compose reduced to `services: {}`, took the Joomla road
  // and was answered with no custody question — or hung on a FIFO.
  [
    'no EmDash mark and no Joomla/WordPress proof, compose `services: {}`, a regular host token',
    async (d, file) => {
      await writeFile(path.join(d, 'docker-compose.yml'), 'services: {}\n')
      await writeFile(file, `${'livepat'.repeat(5)}\n`, { mode: 0o600 })
    }
  ],
  [
    'no EmDash mark and no Joomla/WordPress proof, compose `services: {}`, the host token a FIFO',
    async (d, file) => {
      await writeFile(path.join(d, 'docker-compose.yml'), 'services: {}\n')
      execFileSync('mkfifo', [file])
    }
  ],
  [
    'a proven Joomla site (.env PLATFORM=joomla), the host token a FIFO',
    async (d, file) => {
      await writeFile(path.join(d, '.env'), 'HOST_PORT=51770\nPLATFORM=joomla\n')
      execFileSync('mkfifo', [file])
    }
  ]
]) {
  test(`🔒 POST /_host/agent-token: ${name} — TOKEN_CUSTODY_UNKNOWN, no token, no mint`, {
    timeout: 15000
  }, async () => {
    const cfg = await baseConfig()
    const siteDir = path.join(cfg.privateRoot, 'nodb')
    const file = path.join(siteDir, 'tracy-agent.token')
    await mkdir(siteDir, { recursive: true })
    await arrange(siteDir, file)
    const before = await lstat(file)
    const mint = fakeMintRun({ cfg, write: { label: 'nodb', token: 'reminted'.repeat(4) } })
    const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
    for (const attempt of [1, 2]) {
      const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'nodb' })
      assert.equal(res.status, 409, `attempt ${attempt}`)
      const body = await res.json()
      assert.equal(body.code, 'TOKEN_CUSTODY_UNKNOWN', `attempt ${attempt}`)
      assert.equal('token' in body, false, 'a token was handed out for a custody nobody could prove')
      assert.doesNotMatch(JSON.stringify(body), /livepat|reminted/)
    }
    assert.deepEqual(mint.calls, [], 'the repair ran on a site whose custody was never asked')
    const after = await lstat(file)
    assert.equal(after.ino, before.ino, 'the host token path was replaced')
    assert.equal(
      existsSync(path.join(siteDir, 'data', 'tracy-agent.token')),
      false,
      'a data/ copy was written'
    )
  })
}

test('🔒 classifyTokenMount: without an absolute site directory nothing can be proven', () => {
  const text = emdashCompose('/srv/tracy/site1', { token: 'generator' })
  assert.equal(classifyTokenMount(text, '/srv/tracy/site1'), 'protected')
  assert.equal(classifyTokenMount(emdashCompose('/srv/tracy/site1'), '/srv/tracy/site1'), 'none')
  for (const bad of [undefined, 'relative/site1', '/srv/tracy/../site1', '/srv/tracy/site1/'])
    assert.equal(classifyTokenMount(text, bad), 'unknown', String(bad))
  // The label is the site directory's name: the same file under another directory is not its form.
  assert.equal(classifyTokenMount(text, '/srv/tracy/site2'), 'unknown')
})

// The endpoint half of the same finding: a source that only SHARES the basename, a named volume,
// and the right bind under the wrong service are all a container reading something other than the
// host file. Answering 200 with the host token there is green pairing with a blind agent, and the
// legacy repair would replace the inode and write the readable copy back — so: 409, no token, no
// mint, nothing on disk touched.
// Every shape of the shared table, with and without a host token: with one, the host-file rule
// alone would refuse and could hide a classifier that wrongly answered `none`; without one, only the
// classifier stands between the compose file and the legacy mint.
for (const [name, compose] of CUSTODY_CASES.unknown) {
  for (const host of ['livepat'.repeat(5), null]) {
    test(`🔒 POST /_host/agent-token: ${name} (${host ? 'host token present' : 'no host token'}) is TOKEN_CUSTODY_UNKNOWN — no token, no mint, no write`, async () => {
      const cfg = await baseConfig()
      await emdashSite(cfg, 'wrongsrc', { host })
      const siteDir = path.join(cfg.privateRoot, 'wrongsrc')
      await writeFile(path.join(siteDir, 'docker-compose.yml'), compose(siteDir))
      const mint = fakeMintRun({ cfg, write: { label: 'wrongsrc', token: 'reminted'.repeat(4) } })
      const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
      await assertCustodyRefused(app, cfg, 'wrongsrc', mint, { host })
    })
  }
}

// ── custody the host cannot PROVE (23/09/2026) ──────────────────────────────────────────
// This door fails closed and makes no runtime mount check: what the running container actually
// holds is `emdash/migrate-token-mount.mjs`'s question, not a pairing path's.

for (const [name, host] of [
  ['host token present', 'livepat'.repeat(5)],
  ['host token EMPTY', '']
]) {
  test(`🔒 POST /_host/agent-token: a protected site whose compose LOST the mount entry (${name}) — UNKNOWN, no mint`, async () => {
    const cfg = await baseConfig()
    await emdashSite(cfg, 'lostmount', { host, mount: true })
    // The container created from the old compose still holds the bind; only the file changed.
    await writeFile(
      path.join(cfg.privateRoot, 'lostmount', 'docker-compose.yml'),
      emdashCompose(path.join(cfg.privateRoot, 'lostmount'))
    )
    const mint = fakeMintRun({ cfg, write: { label: 'lostmount', token: 'reminted'.repeat(4) } })
    const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
    await assertCustodyRefused(app, cfg, 'lostmount', mint, { host })
  })
}

test('🔒 POST /_host/agent-token: no mount declared, host token path a dangling symlink — UNKNOWN, no mint', async () => {
  const cfg = await baseConfig()
  await emdashSite(cfg, 'danglink')
  const siteDir = path.join(cfg.privateRoot, 'danglink')
  await symlink(path.join(siteDir, 'nowhere'), path.join(siteDir, 'tracy-agent.token'))
  const mint = fakeMintRun({ cfg, write: { label: 'danglink', token: 'reminted'.repeat(4) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'danglink' })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).code, 'TOKEN_CUSTODY_UNKNOWN')
  assert.deepEqual(mint.calls, [])
  assert.equal(existsSync(path.join(siteDir, 'nowhere')), false)
})

// 🔒 A PROTECTED HOST TOKEN MUST BE ONE REGULAR FILE (Astra review, 23/09/2026). `readAgentToken`
// follows links, so a `tracy-agent.token` symlinked to `data/tracy-agent.token` read as protected and
// answered 200 — with the PAT in the directory the site's own shell reads. A symlink (to the legacy
// copy, or dangling), a hard link to it, or a directory is refused: no token, no mint, nothing moved.
for (const [name, place] of [
  [
    'a symlink to the legacy data/ copy',
    (siteDir, file) => symlink(path.join(siteDir, 'data', 'tracy-agent.token'), file)
  ],
  [
    'a relative symlink to the legacy data/ copy',
    (_siteDir, file) => symlink('data/tracy-agent.token', file)
  ],
  ['a dangling symlink', (siteDir, file) => symlink(path.join(siteDir, 'nowhere'), file)],
  [
    'a hard link to the legacy data/ copy',
    (siteDir, file) => link(path.join(siteDir, 'data', 'tracy-agent.token'), file)
  ],
  ['a directory', (_siteDir, file) => mkdir(file)],
  // A FIFO (or a link to one) used to be OPENED before custody was checked, and `readFile` on a FIFO
  // with no writer waits forever — the door hung instead of answering 409 (Astra review, 23/09/2026).
  ['a FIFO', (_siteDir, file) => execFileSync('mkfifo', [file])],
  [
    'a symlink to a FIFO',
    (siteDir, file) => {
      execFileSync('mkfifo', [path.join(siteDir, 'pipe')])
      return symlink(path.join(siteDir, 'pipe'), file)
    }
  ]
]) {
  test(`🔒 POST /_host/agent-token: protected mount, host token is ${name} — TOKEN_CUSTODY_UNKNOWN, no token, no mint`, {
    timeout: 15000
  }, async () => {
    const cfg = await baseConfig()
    const inSite = 'livepat'.repeat(5)
    await emdashSite(cfg, 'linked', { inSite, mount: true })
    const siteDir = path.join(cfg.privateRoot, 'linked')
    const file = path.join(siteDir, 'tracy-agent.token')
    await place(siteDir, file)
    const before = await lstat(file)
    const mint = fakeMintRun({ cfg, write: { label: 'linked', token: 'reminted'.repeat(4) } })
    const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
    for (const attempt of [1, 2]) {
      const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'linked' })
      assert.equal(res.status, 409, `attempt ${attempt}`)
      const body = await res.json()
      assert.equal(body.code, 'TOKEN_CUSTODY_UNKNOWN')
      assert.equal('token' in body, false, 'the PAT behind a link was handed out as protected custody')
      assert.doesNotMatch(JSON.stringify(body), /livepat/)
    }
    assert.deepEqual(mint.calls, [])
    const after = await lstat(file)
    assert.equal(after.ino, before.ino, 'the host token path was replaced')
    assert.equal(after.isSymbolicLink(), before.isSymbolicLink())
    assert.equal(await readFile(path.join(siteDir, 'data', 'tracy-agent.token'), 'utf8'), `${inSite}\n`)
    assert.equal(existsSync(path.join(siteDir, 'nowhere')), false, 'a write followed the link')
  })
}

// 🔒 A PROTECTED HOST TOKEN MUST BE ROOT'S, MODE 0600 (Astra review, 23/09/2026). The read-only bind
// hands the container the file's own owner and mode, so a token left 0644 — or owned by anyone but
// the required owner — is one the site's www-data shell reads through `/run/tracy-agent.token`. The
// door used to check only that it was one regular file and answered 200. Now: 409, no token, no mint,
// and the file keeps its inode, bytes and mode. The owner case sets `tokenOwnerUid` to a uid that is
// not this process's, which is what a non-root owner looks like to tracy-host running as root.
for (const [name, host, arrange] of [
  ['mode 0644', 'livepat'.repeat(5), (file) => chmod(file, 0o644)],
  ['mode 0640', 'livepat'.repeat(5), (file) => chmod(file, 0o640)],
  ['mode 0400', 'livepat'.repeat(5), (file) => chmod(file, 0o400)],
  ['EMPTY and mode 0644', '', (file) => chmod(file, 0o644)],
  [
    'owned by someone other than the required owner',
    'livepat'.repeat(5),
    (_file, cfg) => {
      cfg.tokenOwnerUid = process.getuid() + 1
    }
  ]
]) {
  test(`🔒 POST /_host/agent-token: protected mount, host token ${name} — TOKEN_CUSTODY_UNKNOWN, no token, no mint`, async () => {
    const cfg = await baseConfig()
    await emdashSite(cfg, 'widemode', { host, mount: true })
    const file = path.join(cfg.privateRoot, 'widemode', 'tracy-agent.token')
    await arrange(file, cfg)
    const mode = (await stat(file)).mode
    const mint = fakeMintRun({ cfg, write: { label: 'widemode', token: 'reminted'.repeat(4) } })
    const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
    await assertCustodyRefused(app, cfg, 'widemode', mint, { host })
    assert.equal((await stat(file)).mode, mode, 'the refused token file had its mode changed')
  })
}

test('POST /_host/agent-token: protected mount with ONE regular host file still answers it (control)', async () => {
  const cfg = await baseConfig()
  await emdashSite(cfg, 'onefile', { host: 'livepat'.repeat(5), mount: true })
  const mint = fakeMintRun({ cfg, write: { label: 'onefile', token: 'reminted'.repeat(4) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'onefile' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { token: 'livepat'.repeat(5) })
  assert.deepEqual(mint.calls, [])
})

for (const host of ['livepat'.repeat(5), null]) {
  const which = host ? 'host token present' : 'no host token'
  for (const [name, breakCompose] of [
    ['MISSING', (file) => unlink(file)],
    ['UNREADABLE (a directory in its place)', async (file) => (await unlink(file), mkdir(file))],
    ['EMPTY', (file) => writeFile(file, '')]
  ]) {
    test(`🔒 POST /_host/agent-token: compose file ${name} (${which}) — UNKNOWN, no mint`, async () => {
      const cfg = await baseConfig()
      await emdashSite(cfg, 'badcompose', { host })
      await breakCompose(path.join(cfg.privateRoot, 'badcompose', 'docker-compose.yml'))
      const mint = fakeMintRun({ cfg, write: { label: 'badcompose', token: 'reminted'.repeat(4) } })
      const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
      await assertCustodyRefused(app, cfg, 'badcompose', mint, { host })
    })
  }
}

test('🔒 POST /_host/agent-token: an absolute source naming THIS site is not the generator’s spelling — refused', async () => {
  const cfg = await baseConfig()
  const host = 'livepat'.repeat(5)
  await emdashSite(cfg, 'abssrc', { host })
  const siteDir = path.join(cfg.privateRoot, 'abssrc')
  await writeFile(
    path.join(siteDir, 'docker-compose.yml'),
    emdashCompose(siteDir, { token: 'generator' }).replace(
      '      - ./tracy-agent.token:',
      `      - ${siteDir}/tracy-agent.token:`
    )
  )
  const mint = fakeMintRun({ cfg, write: { label: 'abssrc', token: 'reminted'.repeat(4) } })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
  await assertCustodyRefused(app, cfg, 'abssrc', mint, { host })
})

// The host-file half of the shared table (`HOST_FILE_CASES`): the compose form AND what sits at
// `<siteDir>/tracy-agent.token` decide together, and the helper is held to the same rows.
for (const row of HOST_FILE_CASES) {
  test(`🔒 POST /_host/agent-token: ${row.name} → ${row.expect}`, async () => {
    const cfg = await baseConfig()
    const label = 'hostrow'
    const livepat = 'livepat'.repeat(5)
    await emdashSite(cfg, label, { host: row.host === 'file' ? livepat : null })
    const siteDir = path.join(cfg.privateRoot, label)
    const tokenFile = path.join(siteDir, 'tracy-agent.token')
    await rm(path.join(siteDir, 'docker-compose.yml'), { force: true })
    placeCompose(siteDir, row)
    if (row.host === 'symlink') {
      await writeFile(path.join(siteDir, 'data', 'tracy-agent.token'), `${livepat}\n`)
      await symlink(path.join(siteDir, 'data', 'tracy-agent.token'), tokenFile)
    }
    if (row.host === 'dangling') await symlink(path.join(siteDir, 'nowhere'), tokenFile)
    const before = row.host === 'absent' ? null : await lstat(tokenFile)
    const mint = fakeMintRun({ cfg, write: { label, token: 'fresh1'.repeat(6) } })
    const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
    const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label })
    const body = await res.json()
    if (row.expect === 'mint') {
      assert.equal(res.status, 200)
      assert.equal(mint.calls.length, 1, 'a proven pre-#155 site lost its only repair')
      assert.deepEqual(body, { token: 'fresh1'.repeat(6) })
      return
    }
    assert.deepEqual(mint.calls, [], 'the mint ran where custody said it must not')
    if (row.expect === 'protected') {
      assert.equal(res.status, 200)
      assert.deepEqual(body, { token: livepat })
    } else {
      assert.equal(res.status, 409)
      assert.equal(body.code, 'TOKEN_CUSTODY_UNKNOWN')
      assert.equal('token' in body, false)
    }
    if (before) {
      const after = await lstat(tokenFile)
      assert.equal(after.ino, before.ino, 'the host token path was replaced')
      assert.equal(after.isSymbolicLink(), before.isSymbolicLink())
    } else assert.equal(existsSync(tokenFile), false, 'a host token file was created')
    if (row.host !== 'symlink')
      assert.equal(
        existsSync(path.join(siteDir, 'data', 'tracy-agent.token')),
        false,
        'the data/ copy was written'
      )
    assert.equal(existsSync(path.join(siteDir, 'nowhere')), false, 'a write followed the link')
  })
}

test('POST /_host/agent-token: a repair that FAILS answers the failure, not the token it still holds', async () => {
  const cfg = await baseConfig()
  // A genuine pre-#155 site (no mount, no host token): the one state still sent to the mint.
  await emdashSite(cfg, 'downsite')
  // 🔒 The failure is the answer, never a token: a door that fell back to anything it could read
  // would restore the green-but-blind pairing this change exists to end.
  const mint = fakeMintRun({
    code: 5,
    tail: [
      'TRACY_ERROR SITE_DOWN',
      '!! the web container downsite-web-1 is not running — start the site first'
    ]
  })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'downsite' })
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.code, 'SITE_DOWN')
  assert.equal('token' in body, false, 'a token was handed back with the failure')
})

test('POST /_host/agent-token: Joomla and WordPress keep the single read they have always had', async () => {
  // The whole point of testing by SHAPE: a site with no `data/data.db` is not asked a second
  // question, so this door costs these two platforms exactly what it cost them yesterday.
  const cfg = await baseConfig()
  await mkdir(path.join(cfg.privateRoot, 'joomlasite'), { recursive: true })
  // The generator's own Joomla form is what proves the platform (no `.env` PLATFORM line here).
  await writeFile(
    path.join(cfg.privateRoot, 'joomlasite', 'docker-compose.yml'),
    phpCompose(path.join(cfg.privateRoot, 'joomlasite'), { flavor: 'joomla' })
  )
  await writeFile(path.join(cfg.privateRoot, 'joomlasite', 'tracy-agent.token'), `${'jtoken'.repeat(6)}\n`)
  const mint = fakeMintRun()
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: 'joomlasite' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { token: 'jtoken'.repeat(6) })
  assert.deepEqual(mint.calls, [], 'a non-EmDash site was re-minted for no reason')
})

test('POST /_host/agent-token: a bad label is refused 400 before touching the filesystem', async () => {
  const cfg = await baseConfig()
  const mint = fakeMintRun()
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: mint.run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/agent-token', { label: '../../etc/passwd' })
  assert.equal(res.status, 400)
  assert.deepEqual(mint.calls, [], 'a refused label still reached the mint script')
})

test('POST /_host/site: 202 then done for a valid webroot-changes job', async () => {
  const cfg = await baseConfig()
  const run = async () => ({ code: 0, tail: ['{"changed":[]}'] })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/site', {
    kind: 'webroot-changes',
    label: 'lantern'
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  const done = await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'done' })
  assert.equal(done.output, '{"changed":[]}')
})

test('POST /_host/site: an unknown kind is refused 400 before any job is created', async () => {
  const cfg = await baseConfig()
  const run = async () => {
    throw new Error('must not be called')
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/site', { kind: 'reskin', label: 'x' })
  assert.equal(res.status, 400)
})

test('POST /_host/site: a body that fails validateWebrootBody is refused 400 before any job is created', async () => {
  const cfg = await baseConfig()
  const run = async () => {
    throw new Error('must not be called')
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/site', {
    kind: 'webroot-commit',
    label: 'x',
    sha: 'not-a-sha'
  })
  assert.equal(res.status, 400)
})

test('POST /_host/site: core-manifest-write, valid — 202 then a done job with output {ok:true, extensions:N}', async () => {
  const cfg = await baseConfig()
  await mkdir(path.join(cfg.privateRoot, 'lantern'), { recursive: true })
  const run = async () => {
    throw new Error('must not be called — core-manifest-write runs no script')
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/site', {
    kind: 'core-manifest-write',
    label: 'lantern',
    contentBase64: validManifestBase64()
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  const done = await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'done' })
  assert.deepEqual(JSON.parse(done.output), { ok: true, extensions: 2 })
  const written = await readFile(path.join(cfg.privateRoot, 'lantern', 'core-manifest.json'), 'utf8')
  assert.deepEqual(JSON.parse(written), { platform: 'wordpress', extensions: ['seo', 'cache'] })
})

test('POST /_host/site: core-manifest-write for a site directory that does not exist is refused 404', async () => {
  const cfg = await baseConfig()
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: async () => ({ code: 0, tail: [] }) })
  const res = await signedPost(app, cfg.hostSecret, '/_host/site', {
    kind: 'core-manifest-write',
    label: 'ghost',
    contentBase64: validManifestBase64()
  })
  assert.equal(res.status, 404)
})

test('POST /_host/site: core-manifest-write refuses non-manifest JSON with 400 refused contentBase64: not a core manifest', async () => {
  const cfg = await baseConfig()
  await mkdir(path.join(cfg.privateRoot, 'lantern'), { recursive: true })
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: async () => ({ code: 0, tail: [] }) })
  const res = await signedPost(app, cfg.hostSecret, '/_host/site', {
    kind: 'core-manifest-write',
    label: 'lantern',
    contentBase64: Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64')
  })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).why, 'refused contentBase64: not a core manifest')
})

test('POST /_host/site: core-manifest-write with a traversal-shaped label is refused 400 before touching the filesystem — same SAFE_LABEL departure as agent-token', async () => {
  const cfg = await baseConfig()
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: async () => ({ code: 0, tail: [] }) })
  const res = await signedPost(app, cfg.hostSecret, '/_host/site', {
    kind: 'core-manifest-write',
    label: '../../etc',
    contentBase64: validManifestBase64()
  })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).why, 'refused label')
})

test('POST /_host/address: NOT_CONFIGURED 501 when config.cloudflare is unset', async () => {
  const cfg = await baseConfig()
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: async () => ({ code: 0, tail: [] }) })
  const res = await signedPost(app, cfg.hostSecret, '/_host/address', {
    label: 'lantern',
    port: 8181,
    hostname: 'lantern.local-sites.tracy.ai'
  })
  assert.equal(res.status, 501)
  assert.deepEqual(await res.json(), { code: 'NOT_CONFIGURED' })
})

test('POST /_host/address: configured, calls ingress_api.py with the Cloudflare env translated from config', async () => {
  const cfg = await baseConfig()
  cfg.cloudflare = { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' }
  let seen = null
  const run = async ({ script, args, env }) => {
    seen = { script, args, env }
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/address', {
    label: 'lantern',
    port: 8181,
    hostname: 'lantern.local-sites.tracy.ai'
  })
  assert.equal(res.status, 200)
  assert.equal(seen.script, 'python3')
  assert.ok(seen.args[0].endsWith('ingress_api.py'))
  assert.deepEqual(seen.args.slice(1), [
    '--hostname',
    'lantern.local-sites.tracy.ai',
    '--port',
    '8181',
    '--replace'
  ])
  assert.equal(seen.env.TRACY_CF_API_TOKEN, 'cf-tok')
  assert.equal(seen.env.TRACY_CF_ACCOUNT_ID, 'acct-1')
  assert.equal(seen.env.TRACY_TUNNEL_ID, 'tun-1')
})

test('POST /_host/address: `dns: true` asks ingress_api.py for the DNS record too — a demo hostname has no wildcard to fall under', async () => {
  const cfg = await baseConfig()
  cfg.cloudflare = { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' }
  let seen = null
  const run = async ({ args }) => {
    seen = args
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/address', {
    label: 'business-joomla',
    port: 8084,
    hostname: 'business-joomla.tracy.ai',
    dns: true
  })
  assert.equal(res.status, 200)
  assert.deepEqual(seen.slice(1), [
    '--hostname',
    'business-joomla.tracy.ai',
    '--port',
    '8084',
    '--replace',
    '--dns'
  ])
  const plain = await signedPost(app, cfg.hostSecret, '/_host/address', {
    label: 'x',
    port: 1,
    hostname: 'x.tracy.ai',
    dns: 'yes'
  })
  assert.equal(plain.status, 400, 'dns is a boolean or absent — a string is refused, not read as true')
})

test('POST /_host/address: `remove: true` takes the rule and the record away, and needs no port — a demo moving off this host', async () => {
  const cfg = await baseConfig()
  cfg.cloudflare = { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' }
  let seen = null
  const run = async ({ args }) => {
    seen = args
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/address', {
    label: 'ja-kinetic-joomla',
    hostname: 'ja-kinetic-joomla.tracy.site',
    remove: true,
    dns: true
  })
  assert.equal(res.status, 200)
  assert.deepEqual(seen.slice(1), ['--hostname', 'ja-kinetic-joomla.tracy.site', '--remove', '--dns'])
  const noPort = await signedPost(app, cfg.hostSecret, '/_host/address', {
    label: 'x',
    hostname: 'x.tracy.ai'
  })
  assert.equal(noPort.status, 400, 'without remove, a port is still required')
  const loose = await signedPost(app, cfg.hostSecret, '/_host/address', {
    label: 'x',
    hostname: 'x.tracy.ai',
    remove: 'yes'
  })
  assert.equal(loose.status, 400, 'remove is a boolean or absent — a string is refused, not read as true')
})

// The tunnel is needed only by an ask that names a domain (`app.js` `goLiveRoute`): a publish or a
// draft at the site's Tracy address runs on a host that never had one. The whole rule, with what is
// recorded and run, is in `site-publish.test.mjs`; here: the door's answer on each side of it.
test('POST /_host/go-live: config.cloudflare unset — 501 NOT_CONFIGURED only for an ask that names a domain', async () => {
  const cfg = await baseConfig()
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: async () => ({ code: 0, tail: [] }) })
  const named = await signedPost(app, cfg.hostSecret, '/_host/go-live', {
    label: 'lantern',
    op: 'live',
    domains: ['shop.example.com']
  })
  assert.equal(named.status, 501)
  assert.deepEqual(await named.json(), { code: 'NOT_CONFIGURED' })
  // No domain: the ask is read on — as far as the site, which this host does not have.
  for (const op of ['live', 'draft']) {
    const plain = await signedPost(app, cfg.hostSecret, '/_host/go-live', {
      label: 'lantern',
      op,
      domains: []
    })
    assert.equal(plain.status, 404, op)
    assert.deepEqual(await plain.json(), { code: 'NOT_FOUND' }, op)
  }
  // With the site there, the same ask is taken.
  await mkdir(path.join(cfg.privateRoot, 'lantern'), { recursive: true })
  const taken = await signedPost(app, cfg.hostSecret, '/_host/go-live', {
    label: 'lantern',
    op: 'live',
    domains: []
  })
  assert.equal(taken.status, 202)
})

test('POST /_host/go-live: configured, 202 with a jobId, then done — go-live.sh gets --label --op --domain*', async () => {
  const cfg = await baseConfig()
  cfg.cloudflare = { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' }
  await mkdir(path.join(cfg.privateRoot, 'lantern'), { recursive: true })
  let seenArgs = null
  let seenEnv = null
  const run = async ({ script, args, env }) => {
    assert.equal(script, 'bash')
    seenArgs = args
    seenEnv = env
    return { code: 0, tail: ['live now'] }
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/go-live', {
    label: 'lantern',
    op: 'live',
    domains: ['example.com', 'www.example.com']
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  const done = await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'done' })
  assert.equal(done.output, 'live now')
  assert.ok(seenArgs[0].endsWith('go-live.sh'))
  assert.ok(seenArgs.includes('--domain'))
  assert.ok(seenArgs.includes('example.com'))
  assert.ok(seenArgs.includes('www.example.com'))

  // 🔒 AND THE THREE NAMES `ingress_api.py` ACTUALLY READS. Measured 11/09 on the dev host: this
  // job ran with a bare `process.env`, so the script printed `need TRACY_CF_API_TOKEN, …`, skipped
  // the customer's domain entirely, and STILL EXITED 0 — a site reported live everywhere except at
  // its own address. `/_host/address` had always translated them; this door had not.
  assert.equal(seenEnv.TRACY_CF_API_TOKEN, 'cf-tok')
  assert.equal(seenEnv.TRACY_CF_ACCOUNT_ID, 'acct-1')
  assert.equal(seenEnv.TRACY_TUNNEL_ID, 'tun-1')
})

test('POST /_host/go-live: op must be live or draft', async () => {
  const cfg = await baseConfig()
  cfg.cloudflare = { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' }
  const run = async () => {
    throw new Error('must not be called')
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/go-live', { label: 'lantern', op: 'sideways' })
  assert.equal(res.status, 400)
})

test('POST /_host/go-live: a domain with shell-hostile characters is refused 400', async () => {
  const cfg = await baseConfig()
  cfg.cloudflare = { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' }
  const run = async () => {
    throw new Error('must not be called')
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/go-live', {
    label: 'lantern',
    op: 'live',
    domains: ['example.com; rm -rf /']
  })
  assert.equal(res.status, 400)
})

test('POST /_host/go-live: a label with no site directory is refused 404 before any job is created — py: os.path.isdir check', async () => {
  const cfg = await baseConfig()
  cfg.cloudflare = { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' }
  const run = async () => {
    throw new Error('must not be called')
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  // privateRoot/ghost was never created.
  const res = await signedPost(app, cfg.hostSecret, '/_host/go-live', {
    label: 'ghost',
    op: 'live',
    domains: []
  })
  assert.equal(res.status, 404)
})

test('POST /_host/go-live: any body key other than label/op/domains is refused 400 — py: unknown-key rejection', async () => {
  const cfg = await baseConfig()
  cfg.cloudflare = { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' }
  await mkdir(path.join(cfg.privateRoot, 'lantern'), { recursive: true })
  const run = async () => {
    throw new Error('must not be called')
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/go-live', {
    label: 'lantern',
    op: 'live',
    domains: [],
    platform: 'wordpress'
  })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).why, 'refused platform')
})

test('site-address validates bounded activation identifiers, URLs and operation', () => {
  const body = {
    kind: 'site-address',
    label: 'lantern',
    operation: 'apply',
    changeId: '0123456789abcdef',
    oldUrl: 'https://old.test/',
    newUrl: 'https://new.test/'
  }
  assert.equal(validateWebrootBody(body), null)
  for (const patch of [
    { changeId: '../escape' },
    { operation: 'delete' },
    { newUrl: 'https://user:secret@new.test/' },
    { newUrl: 'https://new.test/?x=1' },
    { newUrl: 'file:///tmp/a' },
    { extra: true }
  ]) {
    assert.notEqual(validateWebrootBody({ ...body, ...patch }), null)
  }
})

// ── Q2 (plan todo-site-changes): turns ────────────────────────────────────────────────────────

test('validateWebrootBody Q2: a moment and a seal-outside take a turn id of the shape <session>:<turn>', () => {
  const ok = { kind: 'webroot-moment', label: 'x', title: 'Fix the footer' }
  assert.equal(validateWebrootBody({ ...ok, turn: 'session-1a2b:4' }), null)
  for (const turn of ['session 1:4', 'session-1a2b', '../x:1', 'a:b', 7]) {
    assert.equal(validateWebrootBody({ ...ok, turn }), 'refused turn', String(turn))
  }
  assert.equal(validateWebrootBody({ kind: 'webroot-seal-outside', label: 'x' }), null)
  assert.equal(
    validateWebrootBody({ kind: 'webroot-seal-outside', label: 'x', turn: 'session-1a2b:4' }),
    null
  )
  assert.equal(
    validateWebrootBody({ kind: 'webroot-seal-outside', label: 'x', turn: 'nope' }),
    'refused turn'
  )
  assert.equal(validateWebrootBody({ kind: 'webroot-seal-outside', label: 'x', path: 'a' }), 'refused path')
})

test('validateWebrootBody Q2: turn-moments takes 1 to 100 turn ids and nothing else', () => {
  const kind = 'webroot-turn-moments'
  assert.equal(validateWebrootBody({ kind, label: 'x', turns: ['s-1:1', 's-2:9'] }), null)
  assert.equal(validateWebrootBody({ kind, label: 'x' }), 'refused turns')
  assert.equal(validateWebrootBody({ kind, label: 'x', turns: [] }), 'refused turns')
  assert.equal(validateWebrootBody({ kind, label: 'x', turns: ['s-1:1', 'bad'] }), 'refused turns')
  assert.equal(
    validateWebrootBody({ kind, label: 'x', turns: Array.from({ length: 101 }, (_, i) => `s:${i}`) }),
    'refused turns'
  )
  assert.equal(validateWebrootBody({ kind, label: 'x', turns: ['s-1:1'], sha: 'abcdef1' }), 'refused sha')
})

test('validateWebrootBody: undo-check takes 1 to 200 shas and nothing else', () => {
  const kind = 'webroot-undo-check'
  assert.equal(validateWebrootBody({ kind, label: 'x', shas: ['abcdef1', 'abcdef1234567890'] }), null)
  assert.equal(validateWebrootBody({ kind, label: 'x' }), 'refused shas')
  assert.equal(validateWebrootBody({ kind, label: 'x', shas: [] }), 'refused shas')
  assert.equal(validateWebrootBody({ kind, label: 'x', shas: ['abcdef1', 'HEAD~1'] }), 'refused shas')
  assert.equal(
    validateWebrootBody({ kind, label: 'x', shas: Array.from({ length: 201 }, () => 'abcdef1') }),
    'refused shas'
  )
  assert.equal(validateWebrootBody({ kind, label: 'x', shas: ['abcdef1'], sha: 'abcdef1' }), 'refused sha')
})

test('validateWebrootBody Q2: a file diff may name the moment it belongs to, by a sha', () => {
  const base = { kind: 'webroot-file-diff', label: 'x', path: 'wp-content/themes/x/style.css' }
  assert.equal(validateWebrootBody({ ...base, sha: 'abcdef1234' }), null)
  assert.equal(validateWebrootBody({ ...base, sha: 'HEAD~1' }), 'refused sha')
})

test('runWebrootJob Q2: the new jobs reach webroot-git.sh with --turn / --turns / --sha', async () => {
  const config = await tmpConfig()
  const cases = [
    [
      { kind: 'webroot-seal-outside', label: 'lantern', turn: 's-1:2' },
      ['--op', 'seal-outside', '--turn', 's-1:2']
    ],
    [
      { kind: 'webroot-moment', label: 'lantern', title: 'Fix it', turn: 's-1:2' },
      ['--op', 'moment', '--title', 'Fix it', '--turn', 's-1:2']
    ],
    [
      { kind: 'webroot-turn-moments', label: 'lantern', turns: ['s-1:2', 's-1:3'] },
      ['--op', 'turn-moments', '--turns', 's-1:2,s-1:3']
    ],
    [
      { kind: 'webroot-undo-check', label: 'lantern', shas: ['abcdef2', 'abcdef1'] },
      ['--op', 'undo-check', '--shas', 'abcdef2,abcdef1']
    ],
    [
      { kind: 'webroot-file-diff', label: 'lantern', path: 'a.css', sha: 'abcdef1' },
      ['--op', 'file-diff', '--path', 'a.css', '--sha', 'abcdef1']
    ]
  ]
  for (const [body, expected] of cases) {
    let seen = null
    await runWebrootJob({
      jobId: 'j',
      body,
      config,
      jobs: fakeJobs(),
      run: async ({ args }) => {
        seen = args
        return { code: 0, tail: ['{}'] }
      }
    })
    assert.ok(seen[0].endsWith('webroot/webroot-git.sh'), body.kind)
    assert.deepEqual(seen.slice(1, 3), ['--label', 'lantern'])
    for (let i = 0; i < expected.length; i += 2) {
      const at = seen.indexOf(expected[i])
      assert.ok(at > 0, `${body.kind}: ${expected[i]}`)
      if (i > 0 || expected[i] !== '--op')
        assert.equal(seen[at + 1], expected[i + 1], `${body.kind}: ${expected[i]}`)
    }
    assert.equal(seen[seen.indexOf('--op') + 1], expected[1], body.kind)
  }
})

test('POST /_host/go-live on a catch-all host (a shard): an ask that names a domain is taken, and go-live.sh is told catch-all, with no tunnel credentials', async () => {
  const cfg = await baseConfig()
  cfg.tunnelMode = 'catch-all'
  await mkdir(path.join(cfg.privateRoot, 'lantern'), { recursive: true })
  let seenEnv = null
  const run = async ({ env }) => {
    seenEnv = env
    return {
      code: 0,
      tail: ['==> ingress: shop.example.com → tracy-web (catch-all tunnel, no rule written)']
    }
  }
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/go-live', {
    label: 'lantern',
    op: 'live',
    domains: ['shop.example.com']
  })
  assert.equal(res.status, 202)
  for (let i = 0; i < 100 && !seenEnv; i++) await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(seenEnv.TRACY_TUNNEL, 'catch-all')
  assert.equal(seenEnv.TRACY_CF_API_TOKEN, undefined)
})

test('both teardown roads tell teardown.sh catch-all on a catch-all host, and none on a host with no tunnel', async () => {
  const seen = []
  const run = async ({ env }) => {
    seen.push(env.TRACY_TUNNEL)
    return { code: 0, tail: [] }
  }
  const jobs = { put: async () => {}, get: async () => null }
  for (const tunnelMode of ['catch-all', null]) {
    const cfg = { ...(await baseConfig()), tunnelMode }
    await runGoLiveJob({
      jobId: `g-${tunnelMode}`,
      body: { label: 'lantern', op: 'teardown' },
      config: cfg,
      jobs,
      run
    })
    await runTeardownJob({ jobId: `t-${tunnelMode}`, body: { label: 'lantern' }, config: cfg, jobs, run })
  }
  assert.deepEqual(seen, ['catch-all', 'catch-all', 'none', 'none'])
})

test('the routing target stays NOT_CONFIGURED on a catch-all host: a shard points customers at connect.<zone> and never asks', async () => {
  const cfg = await baseConfig()
  cfg.tunnelMode = 'catch-all'
  const app = buildApp({ config: cfg, jobs: fakeJobsForApp(), run: async () => ({ code: 0, tail: [] }) })
  const res = await signedPost(app, cfg.hostSecret, '/_host/routing-target', {})
  assert.equal(res.status, 501)
})

test('validateWebrootBody: a sync takes its folder id, the live door and token, the archive addresses and decisions, nothing else', () => {
  const ok = {
    kind: 'webroot-sync',
    label: 'x',
    syncId: '0f8e2c1a-1111-4222-8333-444455556666',
    endpoint: 'https://shop.example/index.php?option=com_claudecowork&task=api.exec&format=json',
    token: 'live-token-abc123',
    baseWebrootUrl: EXPORT_URL,
    baseDbUrl: EXPORT_URL,
    decisions: { 'db:jos_content:["2"]:title': 'theirs' },
    byEmail: 'lee@example.com',
    byName: 'Lee'
  }
  assert.equal(validateWebrootBody(ok), null)
  assert.equal(validateWebrootBody({ kind: 'webroot-sync-apply', label: 'x', syncId: ok.syncId }), null)
  assert.equal(validateWebrootBody({ ...ok, syncId: '../etc' }), 'refused syncId')
  assert.equal(validateWebrootBody({ ...ok, endpoint: 'http://shop.example/' }), 'refused endpoint')
  assert.equal(
    validateWebrootBody({ ...ok, endpoint: 'http://shop.example/' }, { exportOverHttp: true }),
    null
  )
  assert.equal(validateWebrootBody({ ...ok, token: 'a b' }), 'refused token')
  assert.equal(
    validateWebrootBody({ kind: 'webroot-sync', label: 'x', syncId: ok.syncId, token: 'lonely-token' }),
    'refused token'
  )
  assert.equal(validateWebrootBody({ ...ok, decisions: { a: 'mine' } }), 'refused decisions')
  assert.equal(validateWebrootBody({ ...ok, extra: 1 }), 'refused extra')
  assert.equal(
    validateWebrootBody({
      kind: 'webroot-sync-copy-token',
      label: 'x',
      syncId: ok.syncId,
      copyToken: 'c'.repeat(48)
    }),
    null
  )
  assert.equal(
    validateWebrootBody({ kind: 'webroot-sync-copy-token', label: 'x', syncId: ok.syncId }),
    'refused copyToken'
  )
  assert.equal(validateWebrootBody({ kind: 'webroot-sync-forget', label: 'x', syncId: ok.syncId }), null)
  assert.equal(validateWebrootBody({ ...ok, copyToken: 'c'.repeat(48) }), 'refused copyToken')
  assert.equal(validateWebrootBody({ ...ok, allowHeld: true }), null)
  assert.equal(validateWebrootBody({ ...ok, allowHeld: 'yes' }), 'refused allowHeld')
  // A Sync anyway names the held sync it may take the read and merge of: a sync id, not this one's.
  const held = '1f8e2c1a-1111-4222-8333-444455556666'
  assert.equal(validateWebrootBody({ ...ok, allowHeld: true, resumeSyncId: held }), null)
  assert.equal(
    validateWebrootBody({ ...ok, resumeSyncId: held }),
    'refused resumeSyncId',
    'only with allowHeld'
  )
  assert.equal(validateWebrootBody({ ...ok, allowHeld: true, resumeSyncId: '../x' }), 'refused resumeSyncId')
  assert.equal(
    validateWebrootBody({ ...ok, allowHeld: true, resumeSyncId: ok.syncId }),
    'refused resumeSyncId'
  )
  // The import's fingerprint of the live site: an object, never a string, at most 512 KB.
  assert.equal(validateWebrootBody({ ...ok, baseFingerprint: { version: 1 } }), null)
  assert.equal(validateWebrootBody({ ...ok, baseFingerprint: 'x' }), 'refused baseFingerprint')
  assert.equal(validateWebrootBody({ ...ok, baseFingerprint: [] }), 'refused baseFingerprint')
  assert.equal(
    validateWebrootBody({ ...ok, baseFingerprint: { pad: 'x'.repeat(513 * 1024) } }),
    'refused baseFingerprint'
  )
})

test('runWebrootJob: a sync gets its own folder, its decisions in a file, and the token and addresses only in the environment', async () => {
  const config = {
    ...(await tmpConfig()),
    privateRoot: await mkdtemp(path.join(tmpdir(), 'tracy-host-sync-'))
  }
  const jobs = fakeJobs()
  let seen = null
  const seenProgress = []
  const READ_LINE =
    '{"ok":true,"liveReadAt":"2026-10-23T09:00:00Z","mode":"incremental","timing":{"database":7.6},"seconds":9.8}'
  const run = async ({ args, env, onLine }) => {
    seen = { args, env }
    for (const line of [
      '==> [0s] reading the live site',
      '==> live files: 10 files, 300 bytes',
      READ_LINE,
      '==> [10s] the copy: sealing its files',
      '{"ok":true,"liveReadAt":"x","state":"ready"}',
      '==> [12s] base: built (abc)'
    ]) {
      await onLine?.(line)
      seenProgress.push([...((await jobs.get('job-sync')).progress ?? [])])
    }
    return { code: 0, tail: ['{"ok":true,"state":"applied"}'] }
  }
  const syncId = '0f8e2c1a-1111-4222-8333-444455556666'
  await runWebrootJob({
    jobId: 'job-sync',
    body: {
      kind: 'webroot-sync',
      label: 'x',
      syncId,
      endpoint: 'https://shop.example/index.php?option=com_claudecowork',
      token: 'live-token-abc123',
      decisions: { 'file:a.css': 'theirs' },
      byEmail: 'lee@example.com',
      baseFingerprint: { version: 1, pageSize: 50000 }
    },
    config,
    jobs,
    run
  })
  const dir = path.join(config.privateRoot, 'x', 'sync', 'runs', syncId)
  // The import's fingerprint beside the run, never in the environment (a large one would not fit).
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'base-fingerprint.json'), 'utf8')), {
    version: 1,
    pageSize: 50000
  })
  assert.ok(!Object.values(seen.env).some((v) => String(v).includes('pageSize')))
  assert.match(seen.args[0], /webroot-sync\.sh$/)
  assert.deepEqual(seen.args.slice(1), [
    '--label',
    'x',
    '--op',
    'sync',
    '--dir',
    dir,
    '--decisions',
    path.join(dir, 'decisions.json'),
    '--by-email',
    'lee@example.com',
    '--by-name',
    'lee@example.com'
  ])
  assert.equal(seen.env.TRACY_SYNC_TOKEN, 'live-token-abc123')
  assert.ok(!seen.args.join(' ').includes('live-token-abc123'))
  // Each timed step and the read's own line are in the job as they come; nothing else of the output.
  assert.deepEqual(
    seenProgress.map((p) => p.length),
    [1, 1, 2, 3, 3, 4]
  )
  assert.deepEqual(seenProgress.at(-1), [
    '==> [0s] reading the live site',
    READ_LINE,
    '==> [10s] the copy: sealing its files',
    '==> [12s] base: built (abc)'
  ])
  const job = await jobs.get('job-sync')
  assert.equal(job.progress.length, 4, 'the progress stays with the ended job')
  assert.equal(job.state, 'done')
  assert.ok(!JSON.stringify(job).includes('live-token-abc123'), 'nor in the job record')
})

test('runWebrootJob: a Sync anyway hands the script the held sync’s run folder, in the environment (#1649)', async () => {
  const config = {
    ...(await tmpConfig()),
    privateRoot: await mkdtemp(path.join(tmpdir(), 'tracy-host-sync-anyway-'))
  }
  let env = null
  await runWebrootJob({
    jobId: 'job-anyway',
    body: {
      kind: 'webroot-sync',
      label: 'x',
      syncId: '2f8e2c1a-1111-4222-8333-444455556666',
      allowHeld: true,
      resumeSyncId: '1f8e2c1a-1111-4222-8333-444455556666'
    },
    config,
    jobs: fakeJobs(),
    run: async (input) => {
      env = input.env
      return { code: 0, tail: ['{"ok":true,"state":"applied"}'] }
    }
  })
  assert.equal(env.TRACY_SYNC_ALLOW_HELD, '1')
  assert.equal(
    env.TRACY_SYNC_RESUME_DIR,
    path.join(config.privateRoot, 'x', 'sync', 'runs', '1f8e2c1a-1111-4222-8333-444455556666')
  )
})

test('validateWebrootBody: Sync to live takes its preview or push, the live door and token, and the owner’s word on deletes', () => {
  const door = {
    endpoint: 'https://shop.example/index.php?option=com_claudecowork&task=api.exec&format=json',
    token: 'live-token-abc123'
  }
  const previewId = '0f8e2c1a-1111-4222-8333-444455556666'
  const pushId = '1f8e2c1a-1111-4222-8333-444455556666'
  const preview = { kind: 'webroot-live-push-preview', label: 'x', previewId, ...door }
  assert.equal(validateWebrootBody(preview), null)
  assert.equal(validateWebrootBody({ ...preview, baseWebrootUrl: EXPORT_URL, baseDbUrl: EXPORT_URL }), null)
  assert.equal(validateWebrootBody({ ...preview, previewId: '../x' }), 'refused previewId')
  assert.equal(validateWebrootBody({ ...preview, token: undefined }), 'refused token')
  assert.equal(validateWebrootBody({ ...preview, endpoint: undefined }), 'refused endpoint')
  assert.equal(validateWebrootBody({ ...preview, endpoint: 'http://shop.example/' }), 'refused endpoint')
  assert.equal(validateWebrootBody({ ...preview, pushId }), 'refused pushId')
  assert.equal(validateWebrootBody({ ...preview, baseFingerprint: { version: 2 } }), null)
  assert.equal(validateWebrootBody({ ...preview, baseFingerprint: 'x' }), 'refused baseFingerprint')
  const apply = {
    kind: 'webroot-live-push-apply',
    label: 'x',
    previewId,
    pushId,
    confirm: { deletes: false },
    ...door
  }
  assert.equal(validateWebrootBody(apply), null)
  assert.equal(validateWebrootBody({ ...apply, confirm: undefined }), 'refused confirm')
  assert.equal(validateWebrootBody({ ...apply, confirm: { deletes: 'yes' } }), 'refused confirm')
  assert.equal(validateWebrootBody({ ...apply, confirm: { deletes: true, all: true } }), 'refused confirm')
  // The owner's own OK for PHP files, a boolean beside the one for removals.
  assert.equal(validateWebrootBody({ ...apply, confirm: { deletes: false, php: true } }), null)
  assert.equal(validateWebrootBody({ ...apply, confirm: { deletes: false, php: 'yes' } }), 'refused confirm')
  assert.equal(validateWebrootBody({ ...apply, pushId: undefined }), 'refused pushId')
  assert.equal(validateWebrootBody({ ...apply, baseDbUrl: EXPORT_URL }), 'refused baseDbUrl')
  assert.equal(validateWebrootBody({ ...apply, baseFingerprint: { version: 2 } }), 'refused baseFingerprint')
  const undo = { kind: 'webroot-live-push-undo', label: 'x', pushId, ...door, byEmail: 'lee@example.com' }
  assert.equal(validateWebrootBody(undo), null)
  assert.equal(validateWebrootBody({ ...undo, previewId }), 'refused previewId')
  // The Sync from live after the writes left to tracy-web: `later`, and nothing else.
  assert.equal(validateWebrootBody({ ...apply, settle: 'later' }), null)
  assert.equal(validateWebrootBody({ ...undo, settle: 'later' }), null)
  assert.equal(validateWebrootBody({ ...apply, settle: 'now' }), 'refused settle')
  assert.equal(validateWebrootBody({ ...undo, settle: true }), 'refused settle')
})

test('runWebrootJob: a push hands the script its ids and the owner’s word as flags, the door and token only in the environment', async () => {
  const config = {
    ...(await tmpConfig()),
    privateRoot: await mkdtemp(path.join(tmpdir(), 'tracy-host-push-'))
  }
  const jobs = fakeJobs()
  let seen = null
  const run = async ({ args, env, onLine }) => {
    seen = { args, env }
    for (const line of [
      '==> [0s] Sync from live: reading the live site',
      'noise',
      '==> [9s] writing on the live site'
    ])
      await onLine?.(line)
    return { code: 0, tail: ['{"ok":true,"state":"applied"}'] }
  }
  await runWebrootJob({
    jobId: 'job-push',
    body: {
      kind: 'webroot-live-push-apply',
      label: 'x',
      previewId: '0f8e2c1a-1111-4222-8333-444455556666',
      pushId: '1f8e2c1a-1111-4222-8333-444455556666',
      confirm: { deletes: true, php: true },
      settle: 'later',
      endpoint: 'https://shop.example/index.php?option=com_claudecowork',
      token: 'live-token-abc123',
      byEmail: 'lee@example.com'
    },
    config,
    jobs,
    run
  })
  assert.match(seen.args[0], /webroot-live-push\.sh$/)
  assert.deepEqual(seen.args.slice(1), [
    '--label',
    'x',
    '--op',
    'apply',
    '--preview-id',
    '0f8e2c1a-1111-4222-8333-444455556666',
    '--push-id',
    '1f8e2c1a-1111-4222-8333-444455556666',
    '--confirm-deletes',
    '--confirm-php',
    '--settle-later',
    '--by-email',
    'lee@example.com',
    '--by-name',
    'lee@example.com'
  ])
  assert.equal(seen.env.TRACY_SYNC_ENDPOINT, 'https://shop.example/index.php?option=com_claudecowork')
  assert.equal(seen.env.TRACY_SYNC_TOKEN, 'live-token-abc123')
  assert.ok(!seen.args.join(' ').includes('live-token-abc123'))
  const job = await jobs.get('job-push')
  assert.deepEqual(job.progress, [
    '==> [0s] Sync from live: reading the live site',
    '==> [9s] writing on the live site'
  ])
  assert.equal(job.state, 'done')
  assert.ok(!JSON.stringify(job).includes('live-token-abc123'))
})

test('runWebrootJob: a preview writes the import’s fingerprint beside its own Sync from live run, not in the environment', async () => {
  const config = {
    ...(await tmpConfig()),
    privateRoot: await mkdtemp(path.join(tmpdir(), 'tracy-host-preview-'))
  }
  let seen = null
  const previewId = '0f8e2c1a-1111-4222-8333-444455556666'
  await runWebrootJob({
    jobId: 'job-preview',
    body: {
      kind: 'webroot-live-push-preview',
      label: 'x',
      previewId,
      endpoint: 'https://shop.example/index.php?option=com_claudecowork',
      token: 'live-token-abc123',
      baseFingerprint: { version: 2, pageSize: 50000 }
    },
    config,
    jobs: fakeJobs(),
    run: async ({ args, env }) => {
      seen = { args, env }
      return { code: 0, tail: ['{"ok":true,"state":"ready"}'] }
    }
  })
  const file = path.join(
    config.privateRoot,
    'x',
    'push',
    'previews',
    previewId,
    'sync',
    'base-fingerprint.json'
  )
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { version: 2, pageSize: 50000 })
  assert.ok(!Object.values(seen.env).some((v) => String(v).includes('pageSize')))
  assert.deepEqual(seen.args.slice(1, 7), ['--label', 'x', '--op', 'preview', '--preview-id', previewId])
})

test('demo contact installation accepts only its selected site, never a file or recipient override', () => {
  assert.equal(validateWebrootBody({ kind: 'site-demo-contact', label: 'bistro' }), null)
  for (const key of ['path', 'email', 'contentBase64'])
    assert.equal(
      validateWebrootBody({ kind: 'site-demo-contact', label: 'bistro', [key]: 'x' }),
      `refused ${key}`
    )
})

// ---------------------------------------------------------------------------------------------
// The live read's timing line, as webroot-sync.sh itself prints it
// ---------------------------------------------------------------------------------------------

const SYNC_SCRIPT = new URL(
  '../../../packages/fleet/tracy-fleet-operation/scripts/webroot/webroot-sync.sh',
  import.meta.url
).pathname

test('syncProgressLine keeps the read line the real script prints, and the spaced form of older scripts', async () => {
  const script = await readFile(SYNC_SCRIPT, 'utf8')
  // #219: the read's answer goes to python on stdin (an argv of a large answer hit "Argument list too long").
  const m =
    /printf '%s' "\$pulled" \| python3 -c '(import json,sys\nr = json\.load\(sys\.stdin\)\nprint\(json\.dumps\(\{"ok": True, "liveReadAt"[^']*)' >&2/.exec(
      script
    )
  assert.ok(m, 'webroot-sync.sh prints the read timing line with the snippet this test runs')
  const answer = {
    ok: true,
    liveReadAt: '2026-10-23T09:00:00Z',
    mode: 'incremental',
    seconds: 9.8,
    timing: { database: 7.6 }
  }
  const line = execFileSync('python3', ['-c', m[1]], {
    input: JSON.stringify(answer),
    encoding: 'utf8'
  }).trim()
  assert.equal(syncProgressLine(line), line)
  const spaced =
    '{"ok": true, "liveReadAt": "x", "mode": "incremental", "seconds": 2, "timing": {"database": 1.5}}'
  assert.equal(syncProgressLine(spaced), spaced)
  // Not the read's line: a sync answer with a state, a failed read, and what is not JSON.
  assert.equal(syncProgressLine('{"ok": true, "liveReadAt": "x", "state": "ready"}'), null)
  assert.equal(syncProgressLine('{"ok": false, "liveReadAt": "x", "code": "LIVE_BUSY"}'), null)
  assert.equal(syncProgressLine('{"ok":true,"liveReadAt": oops'), null)
})
