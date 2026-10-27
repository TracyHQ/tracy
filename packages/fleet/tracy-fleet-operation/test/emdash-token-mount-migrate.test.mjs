#!/usr/bin/env node
/**
 * The ONE-SITE #155 token-mount migration (`scripts/provision/emdash/migrate-token-mount.mjs`). What
 * this pins is the migration's contract:
 *
 *   - SELF-CONTAINED STDIN TRANSPORT: the exact source loads over `node --input-type=module -` with no
 *     ERR_MODULE_NOT_FOUND and fires no other CLI.
 *   - RECREATE CHANGES THE CID: the web container is re-discovered by compose labels after every
 *     recreate and its NEW full id / immutable image id / candidate config-hash / exact bind are
 *     re-validated before auth — a captured old id is never trusted.
 *   - REAL DRIFT GUARDS: running config-hash vs resolved file config-hash (#162), image tag resolved to
 *     the running immutable image id, candidate resolved config proven to differ ONLY by the token
 *     mount, everything re-validated under the lock immediately before the swap.
 *   - MINIMAL, BYTE-FAITHFUL PATCH: only the one mount line is added; the file's trailing-newline state
 *     is preserved and a CR/CRLF file is refused rather than normalised.
 *   - BOUNDED REMOTE EXECUTION: the whole inner node is wrapped in an in-container GNU timeout whose
 *     kill grace outlasts a full rollback, and the outer client bound outlasts that.
 *   - HONEST, DRIFT-AWARE ROLLBACK: never clobbers a concurrent bytes-or-mode edit, restores original
 *     bytes+mode from the owned backup, re-resolves + re-proves via the host token, restores the
 *     ORIGINAL mount state, and reports incomplete when it cannot.
 *   - TOKEN SECRECY + INTEGRITY: PAT only ever on stdin, in no argv/report; inode+bytes unchanged.
 *   - AUTH NEEDS A CLEAN TRANSPORT: valid-looking stdout on a failed exec is not proof.
 *   - SELECTOR PRIVACY: an invalid selector is never echoed back.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-token-mount-migrate.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { renderInspectFormat } from './docker-inspect-format.mjs'

import {
  CONTAINER_TOKEN_PATH,
  HOST_EXEC_TIMEOUT_MS,
  HOST_INNER_KILL_S,
  HOST_INNER_TERM_S,
  KIND,
  TOKEN_MOUNT_ITEM,
  authArgv,
  buildCandidateText,
  classifyConfigToken,
  composeUpArgv,
  defaultMigrateFs,
  diffOnlyTokenMount,
  execHostArgv,
  findWebVolumes,
  hostError,
  hostDataDir,
  hostTokenPath,
  INNER_STATUSES,
  innerArgs,
  mountDigestArgv,
  parseInnerReport,
  parseWebPs,
  readAuthResult,
  readDigestResult,
  RECREATE_TIMEOUT_MS,
  resolveSrc,
  runHostMigration,
  runMigration,
  selectorFor,
  siteDir,
  SUCCESS_STATUSES,
  tokenDigest,
  webInspectArgv,
  parseWebInspect,
  healthOk
} from '../scripts/provision/emdash/migrate-token-mount.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/emdash/migrate-token-mount.mjs', import.meta.url))
const ROOT = '/srv/tracy'
const LABEL = 'demo'
const SEL = selectorFor(LABEL)
const SYNTH = 'ec_pat_FIXTUREtoken0123456789abcd' // synthetic PAT only
const STALE_PAT = 'ec_pat_FIXTUREstaleInode00000000' // the credential an old inode still holds
const CIDS = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]
const hashOf = (t) => createHash('sha256').update(String(t)).digest('hex')

// ── compose text + resolved-config fixtures ──────────────────────────────────────────────────────

function composeText({ token = false } = {}) {
  return [
    'services:',
    '  web:',
    '    image: tracy/emdash:1',
    '    restart: unless-stopped',
    '    volumes:',
    '      - app:/app',
    '      - ./data:/app/data',
    '      - ./uploads:/app/uploads',
    ...(token ? [`      ${TOKEN_MOUNT_ITEM}`] : []),
    '    networks: [default, tracy]',
    '    ports:',
    '      - "127.0.0.1:${HOST_PORT}:4321"',
    '',
    'volumes:',
    '  app:',
    ''
  ].join('\n')
}

function resolvedConfig(root, label, { token = false, extra = false } = {}) {
  const sd = siteDir(root, label)
  const volumes = [
    { type: 'volume', source: 'app', target: '/app' },
    { type: 'bind', source: `${sd}/data`, target: '/app/data' },
    { type: 'bind', source: `${sd}/uploads`, target: '/app/uploads' },
    ...(extra ? [{ type: 'bind', source: `${sd}/x`, target: '/x' }] : []),
    ...(token
      ? [{ type: 'bind', source: `${sd}/tracy-agent.token`, target: CONTAINER_TOKEN_PATH, read_only: true }]
      : [])
  ]
  return { services: { web: { image: 'tracy/emdash:1', volumes, networks: { default: null, tracy: null } } } }
}

/**
 * The web container as `docker inspect` prints it, rendered through the format the script actually
 * sent (`renderInspectFormat`). `healthy: null` is an image with NO healthcheck: `.State` then has no
 * `Health` key at all, which is how a real EmDash web container looks (measured on dev, 24/09).
 */
function webInspect(
  format,
  root,
  label,
  { id, imageId = 'sha256:IMG1', token = false, hash = 'h1', healthy = true } = {}
) {
  const mounts = [{ Type: 'bind', Destination: '/app/data', Source: hostDataDir(root, label) }]
  if (token)
    mounts.push({
      Type: 'bind',
      Destination: CONTAINER_TOKEN_PATH,
      Source: hostTokenPath(root, label),
      RW: false
    })
  const labels = {
    'com.docker.compose.project': label,
    'com.docker.compose.service': 'web',
    'com.docker.compose.project.working_dir': siteDir(root, label),
    'com.docker.compose.project.config_files': `${siteDir(root, label)}/docker-compose.yml`,
    'com.docker.compose.config-hash': hash
  }
  const state = { Running: true }
  if (healthy !== null) state.Health = { Status: healthy ? 'healthy' : 'unhealthy' }
  return renderInspectFormat(format, {
    Id: id,
    Image: imageId,
    Config: { Image: 'tracy/emdash:1', Labels: labels },
    State: state,
    Mounts: mounts
  })
}

// ── the stateful fake: docker + fs sharing one file/generation model ───────────────────────────────

function harness(k = {}) {
  const root = k.root ?? ROOT
  const composePath = `${siteDir(root, LABEL)}/docker-compose.yml`
  const initialText = (() => {
    let t = composeText({ token: k.fileToken ?? false })
    if (k.noEof) t = t.replace(/\n$/, '') // an original with NO trailing newline
    if (k.crlf) t = t.replace(/\n/g, '\r\n') // a CRLF file (must be refused, not normalised)
    return t
  })()
  const state = {
    files: { [composePath]: { text: initialText, mode: k.mode ?? 0o644 } },
    hashOverride: {},
    ups: 0,
    tokenReads: 0,
    lockAcquired: false,
    released: false,
    backups: [],
    restores: [],
    // per-generation runtime state; gen 0 is the pre-migration container
    gens: [
      {
        cid: CIDS[0],
        imageId: k.imageIdRun ?? 'sha256:IMG1',
        token: k.preToken ?? false,
        hash: k.hashRun ?? 'h1',
        healthy: k.noHealthcheck ? null : true
      }
    ]
  }
  const hasToken = (p) => (state.files[p]?.text ?? '').includes(CONTAINER_TOKEN_PATH)
  const dbLine = () =>
    (k.db ?? 'active-unique') === 'active-unique'
      ? 'TRACY_EMDASH_DB {"schema":"ok","agent":"active-unique"}\n'
      : `TRACY_EMDASH_DB {"schema":"ok","agent":"${k.db}"}\n`
  const authLine = (kind) =>
    kind === 'ok'
      ? 'TRACY_TMAUTH 200 ok\n'
      : kind === '401'
        ? 'TRACY_TMAUTH 401 rpc-error\n'
        : kind === 'no-token'
          ? 'TRACY_TMAUTH_ERR NO_TOKEN\n'
          : 'TRACY_TMAUTH_ERR SITE transport\n'

  const run = async ({ argv, stdin, timeoutMs }) => {
    run.calls.push({ argv: [...argv], stdin, timeoutMs })
    const ok = (stdout) => ({ code: 0, stdout, stderr: '', timedOut: false })
    // discover web (ps by project/service labels)
    if (argv[0] === 'ps' && argv.includes(`label=com.docker.compose.project=${LABEL}`)) {
      if (k.psEmpty) return ok('')
      if (k.psDup) return ok(`${CIDS[0]}\t${LABEL}\tweb\n${CIDS[1]}\t${LABEL}\tweb\n`)
      const cid = state.gens[state.gens.length - 1].cid
      return ok(`${cid}\t${LABEL}\tweb\n`)
    }
    if (argv[0] === 'inspect') {
      const id = argv.at(-1)
      const g = state.gens.find((x) => x.cid === id)
      if (!g) return { code: 1, stdout: '', stderr: '', timedOut: false }
      return webInspect(argv[2], root, LABEL, {
        id,
        imageId: g.imageId,
        token: g.token,
        hash: g.hash,
        healthy: g.healthy
      })
    }
    if (argv[0] === 'image' && argv[1] === 'inspect') return ok(`${k.imageResolved ?? 'sha256:IMG1'}\n`)
    if (argv[0] === 'compose' && argv.includes('--hash')) {
      const file = argv[argv.indexOf('-f') + 1]
      return ok(`web ${hasToken(file) ? (k.hashCand ?? 'h2') : (k.hashFile ?? 'h1')}`)
    }
    if (argv[0] === 'compose' && argv.includes('json')) {
      const file = argv[argv.indexOf('-f') + 1]
      const cfg = hasToken(file)
        ? (k.configCandidate ?? resolvedConfig(root, LABEL, { token: true }))
        : (k.configOriginal ?? resolvedConfig(root, LABEL, { token: false }))
      return ok(JSON.stringify(cfg))
    }
    if (argv[0] === 'compose' && argv.includes('up')) {
      const idx = state.gens.length // 1 = first recreate, 2 = rollback recreate
      const cid = CIDS[Math.min(idx, CIDS.length - 1)]
      const token =
        idx === 2 && k.rollbackKeepToken
          ? true // simulate a restored container that still shows the mount (mount-state check)
          : idx === 1 && k.postTokenOverride !== undefined
            ? k.postTokenOverride
            : hasToken(composePath)
      const gen = {
        cid,
        imageId: idx === 2 && k.rollbackImageDrift ? 'sha256:IMG9' : (k.imageIdPost ?? 'sha256:IMG1'),
        token,
        hash: hasToken(composePath) ? (k.hashPostOverride ?? k.hashCand ?? 'h2') : (k.hashFile ?? 'h1'),
        healthy: k.noHealthcheck ? null : idx === 1 ? (k.postHealthy ?? true) : !k.rollbackNotReady
      }
      state.gens.push(gen)
      state.ups++
      return { code: k.upCode ?? 0, stdout: '', stderr: '', timedOut: false }
    }
    if (argv[0] === 'exec' && argv.includes('www-data')) return ok(dbLine())
    // The digest of the file the MOUNT actually holds. Answered before the auth branch because it
    // carries no mode keyword — it is the fixed script, recognised by its own marker. `stale` is a
    // container still holding the inode the host token had before it was replaced: the same
    // source path, the same `ro`, a different secret.
    if (argv[0] === 'exec' && String(argv.at(-1)).includes('TRACY_TMDIGEST')) {
      const kind = state.gens.length > 1 ? (k.mountDigestAfter ?? 'matches') : (k.mountDigest ?? 'matches')
      if (kind === 'exec-fail') return { code: 1, stdout: '', stderr: '', timedOut: false }
      if (kind === 'no-token') return ok('TRACY_TMDIGEST_ERR no-token\n')
      return ok(`TRACY_TMDIGEST ${hashOf(kind === 'stale' ? STALE_PAT : SYNTH)}\n`)
    }
    if (argv[0] === 'exec') {
      const mode = argv.at(-1)
      let kind
      if (mode === 'stdin') {
        // The FIRST stdin auth is the pre-mount check; a SECOND is the rollback endpoint proof.
        state.stdinAuths = (state.stdinAuths ?? 0) + 1
        kind = state.stdinAuths >= 2 ? (k.authRollback ?? k.authStdin ?? 'ok') : (k.authStdin ?? 'ok')
      } else {
        kind = k.authMount ?? 'ok'
      }
      const res = ok(authLine(kind))
      if (mode === 'stdin' && k.authStdinExitFail) return { ...res, code: 1 } // valid stdout, failed exec
      if (mode === 'mount' && k.authMountExitFail) return { ...res, code: 1 }
      return res
    }
    return ok('')
  }
  run.calls = []
  run.state = state

  const fs = {
    lstat(p) {
      if (p === root) return { exists: true, isSymbolicLink: false, isDirectory: true }
      if (p === siteDir(root, LABEL)) return { exists: true, isSymbolicLink: false, isDirectory: true }
      if (p === `${siteDir(root, LABEL)}/data/data.db`) return { exists: k.dataDb ?? true, isFile: true }
      return { exists: false }
    },
    readdir(p) {
      return p === root ? (k.dirs ?? [LABEL]) : null
    },
    readHostToken() {
      state.tokenReads++
      if (k.tokenBad) return { ok: false, reason: k.tokenBadReason ?? 'bad-owner' }
      const inode = state.tokenReads >= 2 && k.tokenChangeUnderLock ? 999 : 1234
      return { ok: true, token: SYNTH, inode, hash: 'TOKHASH' }
    },
    readCompose(p) {
      const f = state.files[p]
      if (!f) return { ok: false, reason: 'missing' }
      return { ok: true, text: f.text, mode: f.mode, hash: hashOf(f.text) }
    },
    fileHash(p) {
      if (p === composePath && k.fileHashDriftAfter !== undefined) {
        state.fileHashCalls = (state.fileHashCalls ?? 0) + 1
        if (state.fileHashCalls > k.fileHashDriftAfter) return 'DRIFTED-AFTER'
      }
      if (state.hashOverride[p]) return state.hashOverride[p]
      return hashOf(state.files[p]?.text ?? '')
    },
    statMode(p) {
      return state.files[p]?.mode ?? null
    },
    writeTemp(p, text, mode) {
      state.files[p] = { text, mode }
    },
    backup(src, dst) {
      state.backups.push({ src, dst })
      state.files[dst] = { ...state.files[src] }
    },
    rename(src, dst) {
      state.files[dst] = state.files[src]
      delete state.files[src]
      // Simulate an external chmod of the compose file AFTER our swap (mode drift the rollback must catch).
      if (dst === composePath && k.modeChangeAfterSwap)
        state.files[dst] = { ...state.files[dst], mode: 0o600 }
    },
    restoreCompose(backupPath, dst, mode, staged) {
      state.restores.push({ backupPath, dst })
      state.files[staged] = { ...state.files[backupPath], mode }
      state.files[dst] = state.files[staged]
      delete state.files[staged]
      return true
    },
    remove(p) {
      delete state.files[p]
    },
    acquireLock() {
      state.lockAcquired = true
      return k.lockFree ?? true
    },
    releaseLock() {
      state.released = true
    }
  }
  if (k.concurrentEdit) state.hashOverride[composePath] = 'CONCURRENT-DIFFERENT'
  return { run, fs, state, composePath }
}

const noMutations = (h) => {
  assert.equal(h.state.backups.length, 0, 'a refusal must not back up the compose')
  assert.equal(h.state.lockAcquired, false, 'a refusal must not take the per-site lock')
  assert.equal(
    h.run.calls.some((c) => c.argv[0] === 'compose' && c.argv.includes('up')),
    false,
    'a refusal must not recreate'
  )
}

// ── pure: text patch + structural classification/diff ──────────────────────────────────────────

test('findWebVolumes + buildCandidateText insert EXACTLY one canonical item, nothing else', () => {
  const before = composeText()
  const region = findWebVolumes(before.split('\n'))
  assert.ok(region && region.itemIndent === 6)
  const after = buildCandidateText(before)
  const added = after.split('\n').filter((l) => !before.split('\n').includes(l))
  assert.deepEqual(added, [`      ${TOKEN_MOUNT_ITEM}`])
  assert.equal(buildCandidateText('services:\n  web:\n    image: x\n'), null) // unknown shape → refuse
})

test('buildCandidateText preserves the ORIGINAL trailing-newline state (adds no EOF newline)', () => {
  const withNl = composeText() // ends with '\n'
  assert.equal(withNl.endsWith('\n'), true)
  assert.equal(buildCandidateText(withNl).endsWith('\n'), true)

  const noNl = composeText().replace(/\n$/, '') // no trailing newline
  assert.equal(noNl.endsWith('\n'), false)
  const out = buildCandidateText(noNl)
  assert.equal(out.endsWith('\n'), false, 'must NOT append a final newline that was not there')
  // and the ONLY difference is still exactly the one inserted mount line
  assert.deepEqual(
    out.split('\n').filter((l) => !noNl.split('\n').includes(l)),
    [`      ${TOKEN_MOUNT_ITEM}`]
  )
})

test('classifyConfigToken is structural: absent / equivalent (any spelling) / conflict', () => {
  const sd = siteDir(ROOT, LABEL)
  const exp = hostTokenPath(ROOT, LABEL)
  assert.equal(classifyConfigToken(resolvedConfig(ROOT, LABEL, { token: false }), 'web', sd, exp), 'absent')
  assert.equal(
    classifyConfigToken(resolvedConfig(ROOT, LABEL, { token: true }), 'web', sd, exp),
    'equivalent'
  )
  // a writable token bind is a conflict, never weakened away
  const rw = {
    services: {
      web: {
        volumes: [
          { type: 'bind', source: `${sd}/tracy-agent.token`, target: CONTAINER_TOKEN_PATH, read_only: false }
        ]
      }
    }
  }
  assert.equal(classifyConfigToken(rw, 'web', sd, exp), 'conflict')
  // a duplicate destination is a conflict, not a pick
  const dup = {
    services: {
      web: {
        volumes: [
          { type: 'bind', source: `${sd}/tracy-agent.token`, target: CONTAINER_TOKEN_PATH, read_only: true },
          { type: 'bind', source: `${sd}/other`, target: CONTAINER_TOKEN_PATH, read_only: true }
        ]
      }
    }
  }
  assert.equal(classifyConfigToken(dup, 'web', sd, exp), 'conflict')
})

test('diffOnlyTokenMount proves the candidate adds ONLY the token mount', () => {
  const sd = siteDir(ROOT, LABEL)
  const exp = hostTokenPath(ROOT, LABEL)
  const orig = resolvedConfig(ROOT, LABEL, { token: false })
  assert.deepEqual(diffOnlyTokenMount(orig, resolvedConfig(ROOT, LABEL, { token: true }), 'web', sd, exp), {
    ok: true
  })
  // a candidate that also changes something else is refused
  const r = diffOnlyTokenMount(
    orig,
    resolvedConfig(ROOT, LABEL, { token: true, extra: true }),
    'web',
    sd,
    exp
  )
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'candidate-differs-elsewhere')
})

test('resolveSrc + auth argv/parse shapes', () => {
  assert.equal(resolveSrc('./tracy-agent.token', siteDir(ROOT, LABEL)), hostTokenPath(ROOT, LABEL))
  assert.deepEqual(authArgv({ container: 'c', mode: 'stdin' }).slice(0, 5), ['exec', '-i', '-u', '0', 'c'])
  assert.deepEqual(authArgv({ container: 'c', mode: 'mount' }).slice(0, 4), ['exec', '-u', '0', 'c'])
  // 🔒 a clean transport is required: valid-looking stdout on a failed exec is NOT authenticated.
  assert.equal(
    readAuthResult({ code: 0, stdout: 'TRACY_TMAUTH 200 ok', timedOut: false }).authenticated,
    true
  )
  assert.equal(
    readAuthResult({ code: 1, stdout: 'TRACY_TMAUTH 200 ok', timedOut: false }).authenticated,
    false
  )
  assert.equal(
    readAuthResult({ code: 0, stdout: 'TRACY_TMAUTH 200 ok', timedOut: true }).authenticated,
    false
  )
  assert.equal(
    readAuthResult({ code: 0, stdout: 'TRACY_TMAUTH 401 rpc-error', timedOut: false }).authenticated,
    false
  )
})

test('parseWebPs keeps only full-id rows for the exact project/service', () => {
  assert.deepEqual(parseWebPs(`${CIDS[0]}\t${LABEL}\tweb\ndeadbeef\t${LABEL}\tweb\n`, LABEL), [CIDS[0]])
  assert.deepEqual(parseWebPs(`${CIDS[0]}\tother\tweb\n`, LABEL), [])
})

test('composeUpArgv is web-only: no-deps, no-build, pull never, explicit project dir/file/name', () => {
  const argv = composeUpArgv({
    projectDir: siteDir(ROOT, LABEL),
    composeFile: `${siteDir(ROOT, LABEL)}/docker-compose.yml`,
    project: LABEL
  })
  for (const f of ['--no-deps', '--no-build', '--pull', 'never', '--project-name'])
    assert.ok(argv.includes(f), f)
  assert.equal(argv.at(-1), 'web')
})

// ── refuse before mutating ──────────────────────────────────────────────────────────────────────

test('invalid selector is refused AND never echoed back (privacy)', async () => {
  const h = harness()
  const r = await runMigration({
    selector: '/etc/passwd',
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs
  })
  assert.equal(r.status, 'error')
  assert.equal(r.reason, 'bad-selector')
  assert.equal('selector' in r, false, 'an unvalidated selector must not appear in the report')
  assert.equal(h.run.calls.length, 0)
})

test('a stopped site refuses (web-not-running); nothing mutated', async () => {
  const h = harness({ psEmpty: true })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.reason, 'web-not-running')
  noMutations(h)
})

test('pending env/config (running config-hash != file config-hash) is refused (#162)', async () => {
  const h = harness({ hashRun: 'pending', hashFile: 'h1' })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'refused')
  assert.equal(r.reason, 'config-drift')
  noMutations(h)
})

test('a moved image tag (resolves to a different id than the running image) is refused', async () => {
  const h = harness({ imageResolved: 'sha256:IMG2', imageIdRun: 'sha256:IMG1' })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'refused')
  assert.equal(r.reason, 'image-drift')
  noMutations(h)
})

test('a conflicting compose token mount is refused, not weakened', async () => {
  const sd = siteDir(ROOT, LABEL)
  const conflict = {
    services: {
      web: {
        image: 'tracy/emdash:1',
        volumes: [
          { type: 'bind', source: `${sd}/other.token`, target: CONTAINER_TOKEN_PATH, read_only: true }
        ],
        networks: { tracy: null }
      }
    }
  }
  const h = harness({ configOriginal: conflict })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.reason, 'compose-token-conflict')
  noMutations(h)
})

test('a non-unique admin is refused (read-only DB check as www-data)', async () => {
  const h = harness({ db: 'ambiguous' })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.reason, 'admin-not-unique')
  assert.equal(r.checks.admin, 'ambiguous')
  noMutations(h)
})

test('bad token custody is recovery-required, not migrated', async () => {
  const h = harness({ tokenBad: true, tokenBadReason: 'symlink' })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'recovery-required')
  assert.equal(r.reason, 'custody-symlink')
  noMutations(h)
})

test('a token that does not authenticate is recovery-required; PAT rode stdin only', async () => {
  const h = harness({ authStdin: '401' })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'recovery-required')
  assert.equal(r.reason, 'auth-failed')
  const stdinAuth = h.run.calls.find((c) => c.argv.at(-1) === 'stdin')
  assert.equal(stdinAuth.stdin, SYNTH)
  assert.equal(
    h.run.calls.some((c) => c.argv.some((a) => String(a).includes(SYNTH))),
    false
  )
  noMutations(h)
})

test('auth stdout that LOOKS ok but the exec failed does NOT authenticate', async () => {
  const h = harness({ authStdinExitFail: true })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'recovery-required')
  assert.equal(r.reason, 'auth-failed')
  noMutations(h)
})

// ── dry run + no-op (with the required checks) ──────────────────────────────────────────────────

test('a dry run passes the whole preflight and writes nothing', async () => {
  const h = harness()
  const r = await runMigration({ selector: SEL, apply: false, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'would-apply')
  assert.deepEqual(r.plan, { patch: true, recreate: true })
  noMutations(h)
})

test('a web container with NO healthcheck inspects as health null, not inspect-failed', () => {
  // The fake renders the real template like the Docker CLI 27.5.1 inside tracy-host, where
  // `--via-host` runs this migration: with no healthcheck, a bare `{{json .State.Health}}` AND the
  // #306 `if`-guarded form both fail the whole inspect (measured on dev, 24/09/2026).
  for (const old of [
    '{{json .State.Health}}',
    '{{if .State.Health}}{{json .State.Health}}{{else}}null{{end}}'
  ]) {
    const r = renderInspectFormat(old, { State: { Running: true } })
    assert.equal(r.code, 1, old)
    assert.match(r.stderr, /map has no entry for key "Health"/)
  }

  const argv = webInspectArgv('x')
  assert.doesNotMatch(argv[2], /\.State\.Health/, 'no field access to a key that may be missing')
  const r = webInspect(argv[2], ROOT, LABEL, { id: CIDS[0], healthy: null })
  assert.equal(r.code, 0, r.stderr)
  const parsed = parseWebInspect(r.stdout)
  assert.equal(parsed.id, CIDS[0])
  assert.equal(parsed.running, true)
  assert.equal(parsed.health, null)
  assert.equal(healthOk(parsed), true, 'no healthcheck + running is ready')
})

test('a web container WITH a healthcheck keeps its Health object through the inspect', () => {
  const argv = webInspectArgv('x')
  const healthy = webInspect(argv[2], ROOT, LABEL, { id: CIDS[0], healthy: true })
  assert.equal(healthy.code, 0, healthy.stderr)
  const ok = parseWebInspect(healthy.stdout)
  assert.deepEqual(ok.health, { Status: 'healthy' })
  assert.equal(healthOk(ok), true)
  const unhealthy = webInspect(argv[2], ROOT, LABEL, { id: CIDS[0], healthy: false })
  assert.equal(unhealthy.code, 0, unhealthy.stderr)
  const bad = parseWebInspect(unhealthy.stdout)
  assert.deepEqual(bad.health, { Status: 'unhealthy' })
  assert.equal(healthOk(bad), false, 'unhealthy is not mistaken for "no healthcheck"')
})

test('a dry run on an EmDash site without a healthcheck reaches would-apply', async () => {
  const h = harness({ noHealthcheck: true })
  const r = await runMigration({ selector: SEL, apply: false, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'would-apply', JSON.stringify(r))
  noMutations(h)
})

test('applying on an EmDash site without a healthcheck verifies the recreated container', async () => {
  const h = harness({ noHealthcheck: true })
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    readySleepMs: 0,
    readyAttempts: 2
  })
  assert.equal(r.status, 'applied', JSON.stringify(r))
  assert.equal(r.checks.authAfter, 'authenticated')
})

test('no-op requires admin + custody + BOTH auth transports before claiming already-migrated', async () => {
  const h = harness({
    fileToken: true,
    preToken: true,
    hashRun: 'h2',
    configOriginal: resolvedConfig(ROOT, LABEL, { token: true })
  })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'noop-already-migrated')
  assert.equal(r.checks.admin, 'active-unique')
  assert.equal(r.checks.authBefore, 'authenticated')
  assert.equal(r.checks.authAfter, 'authenticated')
  assert.equal(r.checks.mountedToken, 'matches-host')
  // the mounted-reader auth actually ran
  assert.ok(h.run.calls.some((c) => c.argv.at(-1) === 'mount'))
  noMutations(h)
})

// ── a mount that inspects perfectly and holds the WRONG secret (the stale inode) ─────────────────
//
// Docker resolves a bind source to an inode once, at create time. A host token REPLACED rather
// than rewritten — `mv`, or delete-then-recreate — leaves the running container on the old inode
// behind a mount whose source path, destination and `ro` all still inspect correctly. That is the
// state the staged recovery lands in whenever the new credential is not written in place, and it
// is invisible to every check this tool had: `authBefore` reads the HOST file (the new one, fine)
// and `authMounted` reads the container's (the old one — which authenticates perfectly right up
// until `finalize` revokes it). Two passes, two different secrets, and a report of success.

/** A site whose compose and runtime are both already migrated — the shape that used to no-op. */
const migrated = (k = {}) =>
  harness({
    fileToken: true,
    preToken: true,
    hashRun: 'h2',
    configOriginal: resolvedConfig(ROOT, LABEL, { token: true }),
    ...k
  })

test('a stale mounted inode is NOT already-migrated: the dry run plans a rebind', async () => {
  const h = migrated({ mountDigest: 'stale' })
  const r = await runMigration({ selector: SEL, apply: false, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'would-apply')
  assert.equal(r.checks.mountedToken, 'stale-inode')
  assert.deepEqual(r.plan, { patch: false, recreate: true })
  assert.match(r.note, /force-recreate/)
  noMutations(h)
})

test('applying a rebind force-recreates web, proves the digest after, and writes no token bytes', async () => {
  const h = migrated({ mountDigest: 'stale' })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'applied')
  assert.equal(r.checks.mountedToken, 'stale-inode')
  assert.equal(r.checks.mountedTokenAfter, 'matches-host')
  assert.equal(r.checks.tokenUnchanged, 'yes')
  // 🔒 The compose file is already correct, so its config hash does not change — a plain `up -d`
  // would recreate NOTHING and the bind would still hold the old inode.
  const up = h.run.calls.find((c) => c.argv[0] === 'compose' && c.argv.includes('up'))
  assert.ok(up.argv.includes('--force-recreate'), 'the rebind ran an `up -d` that recreates nothing')
  assert.deepEqual(h.run.state.backups, [], 'a rebind rewrote the compose file')
  assert.equal(h.run.state.files[`${siteDir(ROOT, LABEL)}/docker-compose.yml`].text.includes('force'), false)
})

test('a recreate that does not rebind is a failure, never an applied rebind', async () => {
  // The container came back still reading a different secret. Reporting `applied` here is what
  // would send the operator on to `finalize` and take the site's agent down.
  const h = migrated({ mountDigest: 'stale', mountDigestAfter: 'stale' })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.notEqual(r.status, 'applied')
  assert.equal(r.reason, 'mounted-token-not-rebound')
})

test('a digest that cannot be read is a refusal — this tool claims nothing about a mount it could not open', async () => {
  for (const [kind, reason] of [
    ['no-token', 'mounted-token-no-token'],
    ['exec-fail', 'mounted-token-exec-failed']
  ]) {
    const h = migrated({ mountDigest: kind })
    const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
    assert.equal(r.status, 'refused', kind)
    assert.equal(r.reason, reason)
    noMutations(h)
  }
})

test('mountDigestArgv is a fixed-script root exec, and readDigestResult needs a clean transport', () => {
  const argv = mountDigestArgv('c'.repeat(64))
  assert.deepEqual(argv.slice(0, 4), ['exec', '-u', '0', 'c'.repeat(64)])
  assert.equal(argv.includes('-i'), false, 'the digest reader was handed a stdin the caller does not fill')
  assert.ok(String(argv.at(-1)).includes(CONTAINER_TOKEN_PATH))

  const digest = 'a'.repeat(64)
  assert.deepEqual(readDigestResult({ code: 0, stdout: `TRACY_TMDIGEST ${digest}`, timedOut: false }), {
    ok: true,
    digest
  })
  // valid-looking stdout from a process that then died proves nothing about the file it read
  assert.equal(readDigestResult({ code: 1, stdout: `TRACY_TMDIGEST ${digest}` }).ok, false)
  assert.equal(readDigestResult({ code: 0, stdout: `TRACY_TMDIGEST ${digest}`, timedOut: true }).ok, false)
  assert.equal(readDigestResult({ code: 0, stdout: 'TRACY_TMDIGEST_ERR no-token' }).reason, 'no-token')
  assert.equal(readDigestResult({ code: 0, stdout: 'hello' }).reason, 'unparseable')
  // and the digest is of the CREDENTIAL, so the two sides compare the same input
  assert.equal(tokenDigest(SYNTH), hashOf(SYNTH))
})

test('an already-migrated site whose MOUNTED reader fails auth is recovery-required, not noop', async () => {
  const h = harness({
    fileToken: true,
    preToken: true,
    hashRun: 'h2',
    configOriginal: resolvedConfig(ROOT, LABEL, { token: true }),
    authMount: '401'
  })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'recovery-required')
  assert.equal(r.reason, 'mounted-auth-failed')
})

// ── apply success: new CID, pinned image, candidate hash, exact bind, mounted auth ──────────────

test('apply re-discovers the NEW container after recreate and verifies image/config-hash/bind/auth', async () => {
  const h = harness() // gen1 = CID b..., token true, hash h2, image IMG1
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    readySleepMs: 0,
    readyAttempts: 2
  })
  assert.equal(r.status, 'applied', JSON.stringify(r))
  assert.equal(r.checks.imageAfter, 'pinned')
  assert.equal(r.checks.configHashAfter, 'candidate')
  assert.equal(r.checks.tokenMountAfter, 'ok')
  assert.equal(r.checks.authAfter, 'authenticated')
  assert.equal(r.checks.tokenUnchanged, 'yes')
  assert.equal(h.state.backups.length, 1)
  assert.equal(h.state.released, true)
  // the post-recreate work targeted the NEW cid, never the old one
  const afterUp = h.run.calls.slice(
    h.run.calls.findIndex((c) => c.argv[0] === 'compose' && c.argv.includes('up')) + 1
  )
  assert.ok(
    afterUp.some((c) => c.argv.includes(CIDS[1])),
    'the new CID was inspected/authed'
  )
  assert.equal(
    afterUp.some((c) => c.argv.includes(CIDS[0])),
    false,
    'the OLD CID must not be used after recreate'
  )
  // the mounted-reader auth reads the mount (no stdin)
  const mountAuth = h.run.calls.find((c) => c.argv.at(-1) === 'mount')
  assert.equal(mountAuth.stdin, undefined)
})

test('token secrecy: the PAT is in no argv and in no report field', async () => {
  const h = harness()
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    readySleepMs: 0,
    readyAttempts: 2
  })
  assert.equal(r.status, 'applied')
  assert.doesNotMatch(JSON.stringify(r), new RegExp(SYNTH))
  for (const c of h.run.calls)
    assert.equal(
      c.argv.some((a) => String(a).includes(SYNTH)),
      false
    )
  assert.equal(h.run.calls.filter((c) => c.stdin === SYNTH).length, 1)
})

// ── under-lock revalidation ─────────────────────────────────────────────────────────────────────

test('a concurrent compose edit between preflight and the lock is refused', async () => {
  const h = harness({ concurrentEdit: true })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'refused')
  assert.equal(r.reason, 'compose-changed-since-preflight')
  assert.equal(h.state.backups.length, 0, 'no swap after a detected concurrent edit')
})

test('a token that changes between preflight and the lock is recovery-required', async () => {
  const h = harness({ tokenChangeUnderLock: true })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'recovery-required')
  assert.equal(r.reason, 'token-changed-since-preflight')
})

test('a concurrent apply is refused by the per-site lock', async () => {
  const h = harness({ lockFree: false })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.reason, 'locked')
})

// ── rollback + drift ─────────────────────────────────────────────────────────────────────────────

test('a verify that fails after recreate rolls back and restores the original compose', async () => {
  // the recreate silently does not apply the mount → verify fails → drift-aware rollback
  const h = harness({ postTokenOverride: false })
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    readySleepMs: 0,
    readyAttempts: 1
  })
  assert.equal(r.status, 'rolled-back')
  assert.equal(r.reason, 'verify-failed')
  assert.equal(r.rollback, 'complete')
  assert.equal(h.state.restores.length, 1)
  // the on-disk compose is the original again (no token line)
  assert.doesNotMatch(h.state.files[h.composePath].text, /run\/tracy-agent\.token/)
})

test('a rollback whose restored runtime has DRIFTED is reported incomplete, never a false success', async () => {
  const h = harness({ postTokenOverride: false, rollbackImageDrift: true })
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    readySleepMs: 0,
    readyAttempts: 1
  })
  assert.equal(r.status, 'rollback-incomplete')
  assert.equal(r.rollback, 'restored-runtime-drift')
})

test('a graceful TERM after recreate triggers a drift-aware rollback (lock held throughout)', async () => {
  const h = harness()
  const signal = { aborted: false }
  const checkpoint = (phaseName) => {
    if (phaseName === 'after-recreate') signal.aborted = true
  }
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    signal,
    checkpoint,
    readySleepMs: 0,
    readyAttempts: 1
  })
  assert.equal(r.reason, 'aborted')
  assert.ok(['rolled-back', 'rollback-incomplete'].includes(r.status))
  assert.equal(h.state.released, true, 'the lock is released only AFTER the rollback')
  assert.equal(h.state.restores.length, 1, 'the swap was rolled back')
})

// ── the token file is never touched: real-fs inode/bytes preservation ───────────────────────────

// A docker fake that reads the REAL compose files off disk, so it stays consistent with the real
// atomic write/backup/rename the migration performs (the shared-state harness cannot see real files).
function realDocker(dir) {
  const composePath = path.join(dir, LABEL, 'docker-compose.yml')
  const tokenPath = path.join(dir, LABEL, 'tracy-agent.token')
  const tok = (p) => {
    try {
      return readFileSync(p, 'utf8').includes(CONTAINER_TOKEN_PATH)
    } catch {
      return false
    }
  }
  const gens = [{ cid: CIDS[0], token: false, hash: 'h1', imageId: 'sha256:IMG1', healthy: true }]
  return async ({ argv }) => {
    const ok = (s) => ({ code: 0, stdout: s, stderr: '', timedOut: false })
    if (argv[0] === 'ps' && argv.includes(`label=com.docker.compose.project=${LABEL}`))
      return ok(`${gens[gens.length - 1].cid}\t${LABEL}\tweb\n`)
    if (argv[0] === 'inspect') {
      const id = argv.at(-1)
      const g = gens.find((x) => x.cid === id)
      if (!g) return { code: 1, stdout: '', stderr: '', timedOut: false }
      return webInspect(argv[2], dir, LABEL, {
        id,
        imageId: g.imageId,
        token: g.token,
        hash: g.hash,
        healthy: g.healthy
      })
    }
    if (argv[0] === 'image' && argv[1] === 'inspect') return ok('sha256:IMG1\n')
    if (argv[0] === 'compose' && argv.includes('--hash'))
      return ok(`web ${tok(argv[argv.indexOf('-f') + 1]) ? 'h2' : 'h1'}`)
    if (argv[0] === 'compose' && argv.includes('json'))
      return ok(JSON.stringify(resolvedConfig(dir, LABEL, { token: tok(argv[argv.indexOf('-f') + 1]) })))
    if (argv[0] === 'compose' && argv.includes('up')) {
      const idx = gens.length
      gens.push({
        cid: CIDS[Math.min(idx, 2)],
        token: tok(composePath),
        hash: tok(composePath) ? 'h2' : 'h1',
        imageId: 'sha256:IMG1',
        healthy: true
      })
      return ok('')
    }
    if (argv[0] === 'exec' && argv.includes('www-data'))
      return ok('TRACY_EMDASH_DB {"schema":"ok","agent":"active-unique"}\n')
    // The mounted digest, answered from the REAL token file on disk — this fake's whole point is
    // that the token is a real file nothing writes, so the container reads exactly those bytes.
    if (argv[0] === 'exec' && String(argv.at(-1)).includes('TRACY_TMDIGEST'))
      return ok(`TRACY_TMDIGEST ${hashOf(readFileSync(tokenPath, 'utf8').trim())}\n`)
    if (argv[0] === 'exec') return ok('TRACY_TMAUTH 200 ok\n')
    return ok('')
  }
}

test('apply preserves the token file BYTES and INODE (real fs) — it is never written', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-tokenmount-'))
  try {
    const sd = path.join(dir, LABEL)
    mkdirSync(path.join(sd, 'data'), { recursive: true })
    writeFileSync(path.join(sd, 'docker-compose.yml'), composeText())
    const tokenPath = path.join(sd, 'tracy-agent.token')
    writeFileSync(tokenPath, `${SYNTH}\n`, { mode: 0o600 })
    writeFileSync(path.join(sd, 'data', 'data.db'), 'x')
    const before = statSync(tokenPath)

    // real fs for compose/backup/lock; custody read stubbed (a non-root test cannot own uid 0).
    const fs = {
      ...defaultMigrateFs,
      readHostToken: () => ({ ok: true, token: SYNTH, inode: before.ino, hash: 'TOKHASH' })
    }
    const r = await runMigration({
      selector: selectorFor(LABEL),
      apply: true,
      privateRoot: dir,
      run: realDocker(dir),
      fs,
      readySleepMs: 0,
      readyAttempts: 2
    })
    assert.equal(r.status, 'applied', JSON.stringify(r))

    const after = statSync(tokenPath)
    assert.equal(after.ino, before.ino, 'the token inode changed — a bind mount would go stale')
    assert.equal(readFileSync(tokenPath, 'utf8'), `${SYNTH}\n`, 'the token bytes changed')
    assert.match(readFileSync(path.join(sd, 'docker-compose.yml'), 'utf8'), /run\/tracy-agent\.token:ro/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('apply on a compose with NO trailing newline keeps it that way — only the mount line is added (real fs)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-tokenmount-eof-'))
  try {
    const sd = path.join(dir, LABEL)
    mkdirSync(path.join(sd, 'data'), { recursive: true })
    const composePath = path.join(sd, 'docker-compose.yml')
    const original = composeText().replace(/\n$/, '') // NO trailing newline
    assert.equal(original.endsWith('\n'), false)
    writeFileSync(composePath, original)
    writeFileSync(path.join(sd, 'tracy-agent.token'), `${SYNTH}\n`, { mode: 0o600 })
    writeFileSync(path.join(sd, 'data', 'data.db'), 'x')
    const beforeIno = statSync(path.join(sd, 'tracy-agent.token')).ino

    const fs = {
      ...defaultMigrateFs,
      readHostToken: () => ({ ok: true, token: SYNTH, inode: beforeIno, hash: 'TOKHASH' })
    }
    const r = await runMigration({
      selector: selectorFor(LABEL),
      apply: true,
      privateRoot: dir,
      run: realDocker(dir),
      fs,
      readySleepMs: 0,
      readyAttempts: 2
    })
    assert.equal(r.status, 'applied', JSON.stringify(r))

    const written = readFileSync(composePath, 'utf8')
    assert.equal(written.endsWith('\n'), false, 'a trailing newline was invented')
    // the file is exactly the original with ONE inserted line — nothing else changed
    assert.deepEqual(
      written.split('\n').filter((l) => !original.split('\n').includes(l)),
      [`      ${TOKEN_MOUNT_ITEM}`]
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readHostToken custody rejects a symlink, a missing file and a non-root owner (real fs)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-custody-'))
  try {
    assert.equal(defaultMigrateFs.readHostToken(path.join(dir, 'missing.token')).reason, 'missing')
    const real = path.join(dir, 'real.token')
    writeFileSync(real, `${SYNTH}\n`, { mode: 0o600 })
    symlinkSync(real, path.join(dir, 'link.token'))
    assert.equal(defaultMigrateFs.readHostToken(path.join(dir, 'link.token')).reason, 'symlink')
    if (!(process.getuid && process.getuid() === 0))
      assert.equal(defaultMigrateFs.readHostToken(real).reason, 'bad-owner')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readCompose rejects a symlinked compose file (real fs)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-compose-'))
  try {
    const real = path.join(dir, 'real.yml')
    writeFileSync(real, composeText())
    symlinkSync(real, path.join(dir, 'docker-compose.yml'))
    assert.equal(defaultMigrateFs.readCompose(path.join(dir, 'docker-compose.yml')).reason, 'symlink')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── the stdin transport actually LOADS (the review's reproduced ERR_MODULE_NOT_FOUND) ───────────

test('the reviewed source LOADS over `node --input-type=module -` and reaches its own CLI', () => {
  const source = readFileSync(SCRIPT, 'utf8')
  const res = spawnSync(process.execPath, ['--input-type=module', '-', '--not-a-flag'], {
    input: source,
    encoding: 'utf8'
  })
  assert.equal(res.status, 1)
  assert.match(res.stderr, /MIGRATE_ERROR bad-arguments/)
  assert.doesNotMatch(
    res.stderr,
    /ERR_MODULE_NOT_FOUND|Cannot find module/,
    'the stdin source must be self-contained'
  )
  assert.doesNotMatch(res.stderr, /INVENTORY_ERROR/, 'it must not accidentally run the inventory CLI')
})

test('the source is self-contained: it imports only node built-ins', () => {
  const source = readFileSync(SCRIPT, 'utf8')
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
  for (const spec of imports)
    assert.match(spec, /^node:/, `non-builtin import would break the stdin transport: ${spec}`)
})

// ── via-host transport ──────────────────────────────────────────────────────────────────────────

const HOST_ID = 'a'.repeat(64)
function hostInspect(over = {}) {
  const d = {
    id: JSON.stringify(HOST_ID),
    running: 'true',
    labels: JSON.stringify({
      'com.docker.compose.project': 'tracy',
      'com.docker.compose.service': 'tracy-host'
    }),
    env: JSON.stringify(['PATH=/x', `TRACY_PRIVATE_ROOT=${ROOT}`]),
    mounts: JSON.stringify([{ Type: 'bind', Destination: ROOT, Source: ROOT, RW: true }])
  }
  const f = { ...d, ...over }
  return [f.id, f.running, f.labels, f.env, f.mounts].join('\n')
}

test('innerArgs pins root + selector and adds --apply only when applying; hostError is sanitized', () => {
  assert.deepEqual(innerArgs({ root: ROOT, selector: SEL, apply: false }), [
    '--root',
    ROOT,
    '--selector',
    SEL
  ])
  assert.ok(innerArgs({ root: ROOT, selector: SEL, apply: true }).includes('--apply'))
  assert.equal(hostError('/srv/tracy leak', { selector: SEL }).error, 'host-error')
  // an invalid selector is not echoed in a transport error
  assert.equal('selector' in hostError('no-host-container', { selector: 'bad' }), false)
})

test('runHostMigration validates the host then pipes OUR source with the selector + apply flag', async () => {
  const source = 'REVIEWED SOURCE'
  const calls = []
  const run = async ({ argv, stdin }) => {
    calls.push({ argv: [...argv], stdin })
    if (argv[0] === 'ps')
      return { code: 0, stdout: `${HOST_ID}\ttracy\ttracy-host\n`, stderr: '', timedOut: false }
    if (argv[0] === 'inspect') return { code: 0, stdout: hostInspect(), stderr: '', timedOut: false }
    return {
      code: 0,
      stdout: JSON.stringify({ kind: KIND, version: 1, mode: 'apply', selector: SEL, status: 'applied' }),
      stderr: '',
      timedOut: false
    }
  }
  const report = await runHostMigration({ run, source, selector: SEL, apply: true })
  assert.equal(report.transport, 'via-host')
  assert.equal(report.status, 'applied')
  const exec = calls.find((c) => c.argv[0] === 'exec')
  assert.equal(exec.stdin, source)
  assert.ok(exec.argv.includes('--apply') && exec.argv.includes(SEL))
})

test('runHostMigration fails closed on an unsafe root and never execs', async () => {
  const seen = []
  const run = async ({ argv }) => {
    seen.push(argv[0])
    if (argv[0] === 'ps')
      return { code: 0, stdout: `${HOST_ID}\ttracy\ttracy-host\n`, stderr: '', timedOut: false }
    if (argv[0] === 'inspect')
      return {
        code: 0,
        stdout: hostInspect({ env: JSON.stringify(['PATH=/x']) }),
        stderr: '',
        timedOut: false
      }
    return { code: 0, stdout: '', stderr: '', timedOut: false }
  }
  const report = await runHostMigration({ run, source: 'x', selector: SEL })
  assert.equal(report.error, 'root-unsafe')
  assert.equal(seen.includes('exec'), false)
})

test('parseInnerReport validates kind/version/mode/selector/status, not just the kind', () => {
  const ok = { kind: KIND, version: 1, mode: 'apply', selector: SEL, status: 'applied' }
  assert.equal(parseInnerReport(JSON.stringify(ok), { selector: SEL, apply: true }).status, 'applied')
  // a valid FAILURE report (rolled-back / error) is preserved, not discarded
  assert.equal(
    parseInnerReport(JSON.stringify({ ...ok, status: 'rolled-back' }), { selector: SEL, apply: true }).status,
    'rolled-back'
  )
  assert.equal(
    parseInnerReport(JSON.stringify({ kind: KIND, version: 1, mode: 'apply', error: 'host-exec-failed' }))
      .error,
    'host-exec-failed'
  )
  // rejects: no status/error, wrong kind, wrong version, wrong mode, mismatched/invalid selector
  assert.equal(parseInnerReport(JSON.stringify({ kind: KIND, version: 1 })), null)
  assert.equal(parseInnerReport(JSON.stringify({ ...ok, status: 'made-up' })), null)
  assert.equal(parseInnerReport(JSON.stringify({ ...ok, kind: 'emdash-token-inventory' })), null)
  assert.equal(parseInnerReport(JSON.stringify({ ...ok, version: 2 })), null)
  assert.equal(parseInnerReport(JSON.stringify(ok), { apply: false }), null) // mode mismatch
  assert.equal(parseInnerReport(JSON.stringify({ ...ok, selector: 'nothex' })), null)
  assert.equal(parseInnerReport(JSON.stringify(ok), { selector: 'b'.repeat(64) }), null) // selector mismatch
  assert.equal(parseInnerReport('not json'), null)
})

// ── blocker 2: the host transport preserves a legitimate inner failure report on a nonzero exit ────

test('runHostMigration preserves an inner rolled-back report even when the child exits 1', async () => {
  const inner = {
    kind: KIND,
    version: 1,
    mode: 'apply',
    selector: SEL,
    status: 'rolled-back',
    reason: 'verify-failed',
    rollback: 'complete'
  }
  const run = async ({ argv }) => {
    if (argv[0] === 'ps')
      return { code: 0, stdout: `${HOST_ID}\ttracy\ttracy-host\n`, stderr: '', timedOut: false }
    if (argv[0] === 'inspect') return { code: 0, stdout: hostInspect(), stderr: '', timedOut: false }
    return { code: 1, stdout: JSON.stringify(inner), stderr: '', timedOut: false } // nonzero exit + valid report
  }
  const report = await runHostMigration({ run, source: 'x', selector: SEL, apply: true })
  assert.equal(report.status, 'rolled-back')
  assert.equal(report.reason, 'verify-failed')
  assert.equal(report.transport, 'via-host')
  // and the CLI would still exit nonzero on it
  assert.equal(['noop-already-migrated', 'would-apply', 'applied'].includes(report.status), false)
})

test('runHostMigration rejects a malformed/mismatched inner payload on exit 1 as host-exec-failed', async () => {
  const run = async ({ argv }) => {
    if (argv[0] === 'ps')
      return { code: 0, stdout: `${HOST_ID}\ttracy\ttracy-host\n`, stderr: '', timedOut: false }
    if (argv[0] === 'inspect') return { code: 0, stdout: hostInspect(), stderr: '', timedOut: false }
    // wrong selector — a foreign/confused payload must NOT be trusted
    return {
      code: 1,
      stdout: JSON.stringify({
        kind: KIND,
        version: 1,
        mode: 'apply',
        selector: 'b'.repeat(64),
        status: 'applied'
      }),
      stderr: '',
      timedOut: false
    }
  }
  assert.equal(
    (await runHostMigration({ run, source: 'x', selector: SEL, apply: true })).error,
    'host-exec-failed'
  )
})

test('🔒 a SUCCESS-shaped inner report under a nonzero/absent exit is NOT read as success', async () => {
  // The inner run can be killed (OOM, a `timeout` INSIDE the container hitting 124, a SIGKILL) after it
  // has already printed a report — and none of those set the client-side timedOut flag, which only
  // covers the docker client's own bound. Trusting the payload there turns the CLI green over a
  // migration nobody watched finish.
  const hostRun =
    (exec) =>
    async ({ argv }) => {
      if (argv[0] === 'ps')
        return { code: 0, stdout: `${HOST_ID}\ttracy\ttracy-host\n`, stderr: '', timedOut: false }
      if (argv[0] === 'inspect') return { code: 0, stdout: hostInspect(), stderr: '', timedOut: false }
      return exec
    }
  const inner = (status) => JSON.stringify({ kind: KIND, version: 1, mode: 'apply', selector: SEL, status })
  for (const [status, code] of [
    ['applied', 1],
    ['would-apply', 124], // GNU timeout inside the container
    ['noop-already-migrated', null] // killed by a signal: no exit code at all
  ]) {
    const report = await runHostMigration({
      run: hostRun({ code, stdout: inner(status), stderr: '', timedOut: false }),
      source: 'x',
      selector: SEL,
      apply: true
    })
    assert.equal(report.error, 'host-exec-failed', `${status} @ code=${code}`)
    assert.equal(report.status, undefined, `${status} @ code=${code} must not carry a success status`)
  }
  // …while exit 0 with the same payload is still the success it claims to be
  const ok = await runHostMigration({
    run: hostRun({ code: 0, stdout: inner('applied'), stderr: '', timedOut: false }),
    source: 'x',
    selector: SEL,
    apply: true
  })
  assert.equal(ok.status, 'applied')
  assert.equal(ok.transport, 'via-host')
})

test('SUCCESS_STATUSES is the one list the transport and the CLI exit code share', () => {
  assert.deepEqual(SUCCESS_STATUSES, ['noop-already-migrated', 'would-apply', 'applied'])
  for (const s of SUCCESS_STATUSES) assert.ok(INNER_STATUSES.includes(s))
  const src = readFileSync(SCRIPT, 'utf8')
  // isFailure() must not carry a second hand-written copy of the list
  assert.match(src, /function isFailure[\s\S]*?SUCCESS_STATUSES\.includes\(report\.status\)/)
})

// ── blocker 3: the whole inner node is bounded in-container, and the outer client outlasts it ──────

test('execHostArgv wraps the inner node in GNU timeout (TERM + kill grace) before node', () => {
  const argv = execHostArgv('cid', ['--root', ROOT, '--selector', SEL, '--apply'])
  const t = argv.indexOf('timeout')
  assert.ok(t >= 0 && argv.indexOf('node') > t, 'timeout must wrap node')
  assert.deepEqual(argv.slice(t, t + 6), [
    'timeout',
    '-k',
    String(HOST_INNER_KILL_S),
    '-s',
    'TERM',
    String(HOST_INNER_TERM_S)
  ])
  assert.ok(argv.includes('--input-type=module') && argv.at(-1) === '--apply')
  // the outer client bound must outlast TERM + kill grace so the in-container timeout fires first
  assert.ok(HOST_EXEC_TIMEOUT_MS > (HOST_INNER_TERM_S + HOST_INNER_KILL_S) * 1000)
  // 🔒 the kill grace must outlast a full rollback's ONE compose up, or timeout would KILL it mid-recreate
  assert.ok(HOST_INNER_KILL_S * 1000 >= RECREATE_TIMEOUT_MS, 'kill grace must cover one recreate')
})

test('a TERM during the readiness wait cannot be reported as applied (rolls back instead)', async () => {
  const h = harness()
  const signal = { aborted: false }
  // fire the abort at the FIRST readiness-wait checkpoint, after the recreate — before verify/success
  const checkpoint = (phaseName) => {
    if (phaseName === 'readiness-wait') signal.aborted = true
  }
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    signal,
    checkpoint,
    readySleepMs: 0,
    readyAttempts: 3
  })
  assert.equal(r.reason, 'aborted')
  assert.notEqual(r.status, 'applied')
  assert.equal(h.state.restores.length, 1, 'the swap was rolled back')
})

test('a TERM at the final before-success checkpoint cannot be reported as applied', async () => {
  const h = harness()
  const signal = { aborted: false }
  const checkpoint = (phaseName) => {
    if (phaseName === 'before-success') signal.aborted = true
  }
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    signal,
    checkpoint,
    readySleepMs: 0,
    readyAttempts: 2
  })
  assert.equal(r.reason, 'aborted')
  assert.notEqual(r.status, 'applied')
})

// ── blocker 1: rollback authenticates the ORIGINAL runtime via the host token on stdin ────────────

test('rollback authenticates via the protected host token on stdin (a SECOND stdin auth), HTTP 200', async () => {
  const h = harness({ postTokenOverride: false }) // verify fails → rollback
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    readySleepMs: 0,
    readyAttempts: 1
  })
  assert.equal(r.status, 'rolled-back')
  // TWO stdin auths carried the host token: the pre-mount check AND the rollback endpoint proof.
  const stdinAuths = h.run.calls.filter((c) => c.argv.at(-1) === 'stdin')
  assert.equal(stdinAuths.length, 2)
  for (const c of stdinAuths) assert.equal(c.stdin, SYNTH)
})

test('rollback whose endpoint auth fails (host token rejected) is reported incomplete', async () => {
  const h = harness({ postTokenOverride: false, authRollback: '401' }) // preflight ok, rollback endpoint fails
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    readySleepMs: 0,
    readyAttempts: 1
  })
  assert.equal(r.status, 'rollback-incomplete')
  assert.equal(r.rollback, 'endpoint-unconfirmed')
})

test('rollback asserts the ORIGINAL mount state, not unconditional missing', async () => {
  // verify fails, and the restored container STILL shows a token mount (≠ the original `missing`) →
  // the mount-state check refuses rather than calling it a clean rollback.
  const h = harness({ postTokenOverride: false, rollbackKeepToken: true })
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    readySleepMs: 0,
    readyAttempts: 1
  })
  assert.equal(r.status, 'rollback-incomplete')
  assert.equal(r.rollback, 'restored-mount-unexpected')
})

// ── blocker 4: dry-run proves the actual candidate, and cleans its temp ───────────────────────────

test('dry-run VALIDATES the candidate and refuses an unsafe one, staying read-only', async () => {
  // a candidate whose resolved config differs by more than the token mount must fail the dry run
  const h = harness({ configCandidate: resolvedConfig(ROOT, LABEL, { token: true, extra: true }) })
  const r = await runMigration({ selector: SEL, apply: false, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'refused')
  assert.equal(r.reason, 'candidate-differs-elsewhere')
  // read-only: no lock, no backup, no swap, and the candidate temp was cleaned up
  assert.equal(h.state.lockAcquired, false)
  assert.equal(h.state.backups.length, 0)
  assert.deepEqual(Object.keys(h.state.files), [h.composePath], 'the candidate temp must be removed')
})

test('a clean dry-run proves the candidate then reports would-apply, writing nothing real', async () => {
  const h = harness()
  const r = await runMigration({ selector: SEL, apply: false, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'would-apply')
  assert.equal(r.checks.candidate, 'validated')
  assert.equal(h.state.lockAcquired, false)
  assert.deepEqual(Object.keys(h.state.files), [h.composePath], 'no temp left behind')
})

test('a CRLF compose is refused (not normalised), and the candidate refusal reason has no duplicate prefix', async () => {
  const crlf = harness({ crlf: true })
  const r1 = await runMigration({
    selector: SEL,
    apply: false,
    privateRoot: ROOT,
    run: crlf.run,
    fs: crlf.fs
  })
  assert.equal(r1.status, 'refused')
  assert.equal(r1.reason, 'unsupported-line-endings')
  noMutations(crlf)

  // and the semantic-diff refusal keeps its exact reason (no `candidate-candidate-` doubling)
  const bad = harness({ configCandidate: resolvedConfig(ROOT, LABEL, { token: true, extra: true }) })
  const r2 = await runMigration({ selector: SEL, apply: false, privateRoot: ROOT, run: bad.run, fs: bad.fs })
  assert.equal(r2.reason, 'candidate-differs-elsewhere')
})

// ── blocker 5: revalidate runs AGAIN after candidate resolution, and rollback checks mode too ──────

test('drift appearing AFTER candidate resolution is caught by the second under-lock revalidation', async () => {
  // fileHash(composePath) is fine on the first (pre-candidate) check and drifts on the second (pre-swap)
  const h = harness({ fileHashDriftAfter: 1 })
  const r = await runMigration({ selector: SEL, apply: true, privateRoot: ROOT, run: h.run, fs: h.fs })
  assert.equal(r.status, 'refused')
  assert.equal(r.reason, 'compose-changed-since-preflight')
  assert.equal(h.state.backups.length, 0, 'no swap once the second revalidation catches drift')
})

test('rollback refuses to clobber a compose whose MODE changed under it (not only bytes)', async () => {
  const h = harness({ postTokenOverride: false, modeChangeAfterSwap: true }) // verify fails → rollback
  const r = await runMigration({
    selector: SEL,
    apply: true,
    privateRoot: ROOT,
    run: h.run,
    fs: h.fs,
    readySleepMs: 0,
    readyAttempts: 1
  })
  assert.equal(r.status, 'rollback-incomplete')
  assert.equal(r.rollback, 'concurrent-mode-change-not-clobbered')
  assert.equal(h.state.restores.length, 0, 'a mode-drifted compose must not be restored over')
})
