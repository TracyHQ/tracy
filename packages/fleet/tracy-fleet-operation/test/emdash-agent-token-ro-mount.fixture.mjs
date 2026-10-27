#!/usr/bin/env node
/**
 * REAL-LINUX proof of the #155 agent-token custody that a Mac unit test cannot give: a root-owned
 * 0600 token file, SINGLE-FILE bind-mounted READ-ONLY into the web container at the exact /run path
 * render-compose emits (`/run/tracy-agent.token`), is unreadable and unreplaceable by the container's
 * own agent seats (www-data AND nobody), readable only by a root `docker exec` (the site-tools MCP
 * transport), updatable IN PLACE by the host with the change visible live and PERSISTENT across a
 * container restart — and the mount is a genuine read-only FILE bind (docker inspect: Type=bind,
 * RW=false), not a directory or a Mac-remapped host mount.
 *
 * The last case proves the OPPOSITE half, which the recovery procedure and `migrate-token-mount.mjs`
 * both depend on: a token REPLACED by `mv` is invisible to the running container — it keeps serving
 * the old secret behind a mount that still inspects perfectly — until the container is created again.
 *
 * And a COMPOSE DRIFT case (Hano, 23/09/2026): a running container holds the protected bind while the
 * site's compose file has lost the mount entry. The shipping door (`readAgentTokenCustody`, the
 * decision behind `POST /_host/agent-token`) and the shipping helper (`mint-agent-token.sh`) both run
 * against that site directory on the Linux fs and must refuse TOKEN_CUSTODY_UNKNOWN — no mint, no
 * container call, the host token's bytes and inode unchanged, no `data/` copy — while the mounted
 * reader keeps authenticating with the same credential. Neither makes a runtime mount check; this
 * fixture observes the container only to prove the refusal left it whole.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-agent-token-ro-mount.fixture.mjs
 *
 * WHY a Docker VOLUME as the "host" filesystem, then a SINGLE-FILE bind off its Mountpoint: Docker
 * Desktop remaps the ownership of a Mac-host bind, so `stat` on such a file would show a fabricated
 * owner and prove nothing about root:0600. The token instead lives on the Linux VM's own ext4 (a
 * named volume); `docker volume inspect` gives its Mountpoint, and the web container consumes the one
 * file under it as `--mount type=bind,src=<Mountpoint>/tracy-agent.token,dst=/run/tracy-agent.token,
 * readonly` — the same single read-only FILE bind render-compose gives the real
 * `./tracy-agent.token:/run/tracy-agent.token:ro`.
 *
 * WHY the real helpers write it: the token is prepared and stored by the SHIPPING custody helpers
 * (`_emdash_prepare_token_file` / `_emdash_store_agent_token` from platform/emdash.sh), run as root
 * inside a cached container — so root:0600 is a real chown/chmod the helper reads back with stat, not
 * a claim this fixture fabricates.
 *
 * Uses ONLY a cached image (node:22.17.0 — skips if absent, `--pull never`) and resources named for
 * THIS invocation (pid + random suffix). It removes only its OWN container and volume, at end only —
 * never a fixed name a concurrent run could own. Every docker call is time-bounded.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

// 🔒 THE SHIPPING VERIFIER ITSELF, not a paraphrase of it. `migrate-token-mount.mjs` decides
// stale-vs-current by digesting the file the CONTAINER holds and comparing it with the digest of
// the token the HOST holds; running those exact three functions here is what makes this fixture a
// regression over the migration rather than over Docker's semantics.
import {
  mountDigestArgv,
  readDigestResult,
  tokenDigest
} from '../scripts/provision/emdash/migrate-token-mount.mjs'
import { emdashCompose } from './token-custody-cases.mjs'

const IMAGE = 'node:22.17.0' // cached; NEVER pulled (--pull never below)
const TIMEOUT = 60000 // every docker call is bounded
// Unique to THIS invocation — pid AND random — so two concurrent runs never share, and cleanup can
// only ever touch what this process created.
const RUN = `${process.pid}-${randomBytes(4).toString('hex')}`
const WEB = `tch-fleet-emd155-web-${RUN}`
const WEB2 = `tch-fleet-emd155-web2-${RUN}` // the RECREATED container of the stale-inode case
const VOL = `tch-fleet-emd155-vol-${RUN}`
const DRIFT_WEB = `tch-fleet-emd155-drift-web-${RUN}` // the compose-drift case's own container
const DRIFT_VOL = `tch-fleet-emd155-drift-vol-${RUN}` // … and its own site directory
// The repository, mounted read-only into throwaway containers so the SHIPPING door and helper run
// on the Linux fs against the drift site. Nothing in it is written.
const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const TOKEN = '/run/tracy-agent.token' // the RO mount target, exactly render-compose's path
const FILE = 'tracy-agent.token' // the file the shipping helper names under SITE_DIR
const PAT1 = 'ec_pat_FIXTURE0123456789abcd' // dummy, ec_pat_ + >=16 [A-Za-z0-9_-]; NOT a real PAT
const PAT2 = 'ec_pat_ROTATED9876543210zyxw' // dummy rotation target
const PAT3 = 'ec_pat_REPLACEDinode0123456' // dummy, written by a `mv` (a NEW inode)

// The SHIPPING custody helpers, sliced out of platform/emdash.sh by the same boundaries the unit test
// uses — so the fixture prepares/stores the token with the code that provision runs, not a paraphrase.
const EMDASH = fileURLToPath(new URL('../scripts/provision/platform/emdash.sh', import.meta.url))
function helperSource() {
  const src = readFileSync(EMDASH, 'utf8')
  const start = src.indexOf('_emdash_agent_token_file()')
  const end = src.indexOf('platform_compose() {')
  assert.ok(start !== -1 && end !== -1 && end > start, 'could not locate the token helpers in emdash.sh')
  return src.slice(start, end)
}

const d = (...args) => spawnSync('docker', args, { encoding: 'utf8', timeout: TIMEOUT })
const dOK = (...args) => {
  const r = d(...args)
  assert.equal(r.status, 0, `docker ${args.join(' ')} failed (status ${r.status}): ${r.stderr || r.stdout}`)
  return r.stdout
}
/** docker exec as a chosen uid:gid; returns {status, stdout, stderr}. */
const execAs = (uid, ...cmd) => d('exec', '-u', `${uid}:${uid}`, WEB, ...cmd)

/**
 * Run the migration's OWN mounted-reader verifier against a container and fold the answer with its
 * OWN reader — `{ok:true,digest}` or `{ok:false,reason}`. The shape it hands `migrate-token-mount.mjs`
 * is the shape asserted below, so a change to either half shows up here.
 */
function mountedDigest(container) {
  const r = d(...mountDigestArgv(container))
  return readDigestResult({ code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: false })
}

/** Prepare+store the token on the volume with the REAL helpers, as root, in a cached container. */
function mintOnVolume(pat) {
  const script = `set -euo pipefail\nSITE_DIR=/priv\n${helperSource()}\n_emdash_store_agent_token '${pat}'\n`
  dOK('run', '--rm', '--pull', 'never', '-v', `${VOL}:/priv`, IMAGE, 'bash', '-c', script)
}

const dockerUp = () => d('version', '--format', '{{.Server.Version}}').status === 0
const imageCached = () => d('image', 'inspect', IMAGE).status === 0
const available = dockerUp() && imageCached()

/** Remove only THIS run's container and volume. Never a fixed name — a concurrent run keeps its own. */
function cleanupOwn() {
  d('rm', '-f', WEB)
  d('rm', '-f', WEB2)
  d('rm', '-f', DRIFT_WEB)
  d('volume', 'rm', VOL)
  d('volume', 'rm', DRIFT_VOL)
}

before(() => {
  if (!available) return
  dOK('volume', 'create', VOL)
  // "host" side: the shipping helpers write the protected token onto the VM's ext4 as real root:0600.
  mintOnVolume(PAT1)
  // The single FILE under the volume's Mountpoint, bound READ-ONLY at the exact render-compose path.
  const mountpoint = dOK('volume', 'inspect', '-f', '{{.Mountpoint}}', VOL).trim()
  dOK(
    'run',
    '-d',
    '--name',
    WEB,
    '--pull',
    'never',
    '--mount',
    `type=bind,src=${mountpoint}/${FILE},dst=${TOKEN},readonly`,
    IMAGE,
    'sleep',
    '600'
  )
})

after(() => {
  if (available) cleanupOwn()
})

test("the mount is a real read-only FILE bind at render-compose's path", {
  skip: available ? false : 'docker or cached node image unavailable'
}, () => {
  const mounts = JSON.parse(dOK('inspect', '-f', '{{json .Mounts}}', WEB))
  const m = mounts.find((x) => x.Destination === TOKEN)
  assert.ok(m, `no mount at ${TOKEN}: ${JSON.stringify(mounts)}`)
  assert.equal(m.Type, 'bind', 'the token must be a bind mount, not a fresh volume/dir')
  assert.equal(m.RW, false, 'the token bind must be read-only (RW=false)')
})

test('real-Linux RO bind: agent seats cannot read/replace/symlink; root can read', {
  skip: available ? false : 'docker or cached node image unavailable'
}, async (t) => {
  await t.test('the file is a root-owned 0600 regular file on the Linux fs', () => {
    const out = dOK('exec', '-u', '0', WEB, 'stat', '-c', '%u %g %a %F', TOKEN).trim()
    assert.equal(out, '0 0 600 regular file')
  })

  for (const [name, uid] of [
    ['www-data', 33],
    ['nobody', 65534]
  ]) {
    await t.test(`${name} (uid ${uid}) cannot READ the token`, () => {
      const r = execAs(uid, 'cat', TOKEN)
      assert.notEqual(r.status, 0, `${name} read must be denied`)
      assert.doesNotMatch(r.stdout, /ec_pat_/, `${name} read leaked the token`)
      assert.match(r.stderr, /Permission denied|Read-only/)
    })
    await t.test(`${name} (uid ${uid}) cannot REPLACE the token in place`, () => {
      const r = execAs(uid, 'sh', '-c', `printf pwn > ${TOKEN}`)
      assert.notEqual(r.status, 0, `${name} replace must be denied`)
    })
    await t.test(`${name} (uid ${uid}) cannot SYMLINK-swap the token`, () => {
      const r = execAs(uid, 'sh', '-c', `ln -sf /etc/passwd ${TOKEN}`)
      assert.notEqual(r.status, 0, `${name} symlink swap must be denied`)
    })
  }

  await t.test('root CAN read the token (the MCP transport path)', () => {
    assert.equal(dOK('exec', '-u', '0', WEB, 'cat', TOKEN).trim(), PAT1)
  })

  await t.test('even root cannot write the RO-bound token from inside the container', () => {
    const r = d('exec', '-u', '0', WEB, 'sh', '-c', `printf x > ${TOKEN}`)
    assert.notEqual(r.status, 0, 'the :ro mount must reject a write even by container root')
  })
})

test('real-Linux RO bind: a host in-place update is visible live and survives a restart', {
  skip: available ? false : 'docker or cached node image unavailable'
}, async (t) => {
  const inodeBefore = dOK('exec', '-u', '0', WEB, 'stat', '-c', '%i', TOKEN).trim()

  // "host" rewrites the token IN PLACE via the shipping store helper (`>` truncates → same inode).
  mintOnVolume(PAT2)

  await t.test('the live container sees the new value at the same inode (no recreate)', () => {
    assert.equal(dOK('exec', '-u', '0', WEB, 'cat', TOKEN).trim(), PAT2)
    assert.equal(
      dOK('exec', '-u', '0', WEB, 'stat', '-c', '%i', TOKEN).trim(),
      inodeBefore,
      'the bind went stale — the token was replaced, not written in place'
    )
  })

  await t.test('the value persists across a container restart', () => {
    dOK('restart', '-t', '3', WEB)
    assert.equal(dOK('exec', '-u', '0', WEB, 'cat', TOKEN).trim(), PAT2)
    // and it is still unreadable to the agent seat after the restart.
    assert.notEqual(execAs(33, 'cat', TOKEN).status, 0)
  })
})

// ── the OTHER half: a token REPLACED rather than rewritten, and what it takes to see it again ────
//
// This is the premise `migrate-token-mount.mjs`'s mounted digest is built on, and the reason the
// staged recovery insists on an in-place write. A `mv` over the token gives it a new inode; the
// running container is bound to the old one and goes on serving the OLD secret behind a mount that
// `docker inspect` still reports as the right source, the right destination and `ro`. Only creating
// the container again makes Docker resolve the path a second time.
test('real-Linux RO bind: a REPLACED token is invisible to the running container until it is recreated', {
  skip: available ? false : 'docker or cached node image unavailable'
}, async (t) => {
  const mountpoint = dOK('volume', 'inspect', '-f', '{{.Mountpoint}}', VOL).trim()
  const inodeBefore = dOK('exec', '-u', '0', WEB, 'stat', '-c', '%i', TOKEN).trim()

  // The host repair that looks right and is not: write a temp file and rename it over the token —
  // what `mint-agent-token.sh` does on a site WITHOUT the protected mount, and what a hurried
  // hand-repair does on one that has it.
  dOK(
    'run',
    '--rm',
    '--pull',
    'never',
    '-v',
    `${VOL}:/priv`,
    IMAGE,
    'bash',
    '-c',
    `set -euo pipefail\numask 077\nprintf '%s\\n' '${PAT3}' > /priv/${FILE}.tmp\nchmod 600 /priv/${FILE}.tmp\nmv /priv/${FILE}.tmp /priv/${FILE}\n`
  )

  await t.test('the host file really is a different inode now', () => {
    const out = dOK(
      'run',
      '--rm',
      '--pull',
      'never',
      '-v',
      `${VOL}:/priv`,
      IMAGE,
      'stat',
      '-c',
      '%i',
      `/priv/${FILE}`
    ).trim()
    assert.notEqual(out, inodeBefore, 'the mv did not replace the inode — this case proves nothing')
  })

  await t.test('the RUNNING container still serves the OLD secret behind a mount that inspects fine', () => {
    assert.equal(dOK('exec', '-u', '0', WEB, 'cat', TOKEN).trim(), PAT2)
    assert.equal(dOK('exec', '-u', '0', WEB, 'stat', '-c', '%i', TOKEN).trim(), inodeBefore)
    const m = JSON.parse(dOK('inspect', '-f', '{{json .Mounts}}', WEB)).find((x) => x.Destination === TOKEN)
    assert.equal(m.Type, 'bind')
    assert.equal(m.RW, false, 'the stale mount still inspects as a correct read-only bind')
  })

  // 🔒 THE FINDING THIS CASE EXISTS FOR (#155, P2). Source path and `ro` are BOTH still correct, so
  // an inspect-only check takes the no-op branch and finalize then revokes the credential the reader
  // is actually presenting. The only thing that can tell is the file the container holds — which is
  // what the migration's own verifier reads.
  await t.test('the shipping mounted-reader verifier SEES the stale credential (inspect cannot)', () => {
    const mounted = mountedDigest(WEB)
    assert.equal(mounted.ok, true, `the verifier could not read the mount: ${mounted.reason}`)
    assert.equal(mounted.digest, tokenDigest(PAT2), 'the reader is not holding the pre-mv credential')
    assert.notEqual(
      mounted.digest,
      tokenDigest(PAT3),
      'the mounted reader appears to hold the staged token — this case proves nothing'
    )
  })

  await t.test('creating the container again rebinds the path and the new secret is read', () => {
    dOK(
      'run',
      '-d',
      '--name',
      WEB2,
      '--pull',
      'never',
      '--mount',
      `type=bind,src=${mountpoint}/${FILE},dst=${TOKEN},readonly`,
      IMAGE,
      'sleep',
      '600'
    )
    assert.equal(dOK('exec', '-u', '0', WEB2, 'cat', TOKEN).trim(), PAT3)
    // and the recreated container keeps the custody: the agent's own seat still cannot read it.
    assert.notEqual(d('exec', '-u', '33:33', WEB2, 'cat', TOKEN).status, 0)
  })

  // The other end of the same check: after the rebind the SAME verifier must agree with the staged
  // credential, otherwise "recreate then verify" would refuse a mount it had just repaired.
  await t.test('after the rebind the shipping verifier agrees with the staged credential', () => {
    const mounted = mountedDigest(WEB2)
    assert.equal(mounted.ok, true, `the verifier could not read the rebound mount: ${mounted.reason}`)
    assert.equal(mounted.digest, tokenDigest(PAT3))
  })

  // A DELETE-and-recreate on the host is the same class of stale bind, and it is the one where an
  // inspect-only check looks healthiest: the source path exists again, with the right mode. The
  // running container is bound to an inode that no longer has a name, and the verifier still reads
  // it — so the refusal is on evidence, not on a missing file.
  await t.test('a DELETED-and-recreated host token leaves the same invisible staleness', () => {
    dOK(
      'run',
      '--rm',
      '--pull',
      'never',
      '-v',
      `${VOL}:/priv`,
      IMAGE,
      'bash',
      '-c',
      `set -euo pipefail\numask 077\nrm -f /priv/${FILE}\nprintf '%s\\n' '${PAT1}' > /priv/${FILE}\nchmod 600 /priv/${FILE}\n`
    )
    const m = JSON.parse(dOK('inspect', '-f', '{{json .Mounts}}', WEB)).find((x) => x.Destination === TOKEN)
    assert.equal(m.RW, false, 'the bind still inspects as a correct read-only bind')
    const mounted = mountedDigest(WEB)
    assert.equal(mounted.ok, true, `the verifier could not read the mount: ${mounted.reason}`)
    // The container is still on the ORIGINAL inode, so it holds PAT2 — not the host's new PAT1.
    assert.equal(mounted.digest, tokenDigest(PAT2))
    assert.notEqual(mounted.digest, tokenDigest(PAT1), 'the delete/recreate was visible — nothing proven')
  })
})

// ── COMPOSE DRIFT: a running protected bind, and a compose file that no longer declares it ─────
//
// The P1 of Astra's 23/09/2026 review: both classifiers read such a compose as `none`, the absent
// `data/` copy then looked like a half-healed legacy site, and the helper revoked the mounted
// credential, `mv`d a new inode over the bound file and wrote the readable copy back. Under Hano's
// fail-closed rule the host evidence disagrees (no mount declared, protected host token present), so
// the door and the helper refuse and touch nothing — asserted here on the real Linux fs, with the
// container's own reader as the witness that it still presents the same credential.
const DRIFT_LABEL = 'drift-site'
// The exact files render-compose.sh writes (the matchers accept nothing else since 23/09/2026):
// the protected site's, and the pre-#155 one its compose "lost the entry" back to.
const DRIFT_SITE_DIR = `/srv/tracy/${DRIFT_LABEL}`
const PROTECTED_COMPOSE = emdashCompose(DRIFT_SITE_DIR, { token: 'generator' })
const DRIFTED_COMPOSE = emdashCompose(DRIFT_SITE_DIR)
const MALFORMED_COMPOSE = DRIFTED_COMPOSE.replace('services:\n', 'services: invalid\n')

/** Run bash in a throwaway container with the drift site at /srv/tracy/<label> and the repo at /repo. */
function onDriftSite(script) {
  return d(
    'run',
    '--rm',
    '--pull',
    'never',
    '-v',
    `${DRIFT_VOL}:/srv/tracy/${DRIFT_LABEL}`,
    '-v',
    `${REPO}:/repo:ro`,
    IMAGE,
    'bash',
    '-c',
    script
  )
}
const siteState = () => {
  const r = onDriftSite(
    `cd /srv/tracy/${DRIFT_LABEL}; stat -c '%i %u %g %a' tracy-agent.token; cat tracy-agent.token; ` +
      `if [ -e data/tracy-agent.token ]; then echo LEGACY_COPY; else echo NO_LEGACY_COPY; fi`
  )
  assert.equal(r.status, 0, r.stderr)
  const [meta, token, legacy] = r.stdout.trim().split('\n')
  return { meta, token, legacy }
}
/** The SHIPPING helper, with a `docker` on PATH that records every call and fails it. */
const runHelper = () =>
  onDriftSite(
    [
      'set +e',
      'mkdir -p /tmp/bin',
      `printf '#!/bin/sh\\necho "$*" >> /tmp/docker.log\\nexit 1\\n' > /tmp/bin/docker`,
      'chmod +x /tmp/bin/docker',
      `PATH=/tmp/bin:$PATH TRACY_PRIVATE_ROOT=/srv/tracy TRACY_SITES_ROOT=/srv/sites TRACY_SRV= bash /repo/packages/fleet/tracy-fleet-operation/scripts/provision/mint-agent-token.sh --label ${DRIFT_LABEL} 2>&1`,
      'echo "EXIT=$?"',
      'echo "DOCKER_CALLS=$(cat /tmp/docker.log 2>/dev/null | wc -l)"'
    ].join('\n')
  )
/** The SHIPPING door's decision (`readAgentTokenCustody`), as `POST /_host/agent-token` makes it. */
const runDoor = () =>
  onDriftSite(
    `node --input-type=module -e "const { readAgentTokenCustody } = await import('/repo/apps/tracy-host/src/webroot.js'); ` +
      `console.log(JSON.stringify(await readAgentTokenCustody({ label: '${DRIFT_LABEL}', config: { privateRoot: '/srv/tracy' } })))"`
  )

test('real-Linux compose drift: a running protected bind whose compose lost the entry is refused, not repaired', {
  skip: available ? false : 'docker or cached node image unavailable'
}, async (t) => {
  dOK('volume', 'create', DRIFT_VOL)
  // The site as provision leaves it: root:0600 token by the shipping helpers, EmDash's SQLite, and
  // the compose render-compose emits for a protected site.
  const setup =
    `set -euo pipefail\nSITE_DIR=/priv\n${helperSource()}\n_emdash_store_agent_token '${PAT1}'\n` +
    `mkdir -p /priv/data\nprintf 'SQLite format 3' > /priv/data/data.db\n` +
    `cat > /priv/docker-compose.yml <<'YAML'\n${PROTECTED_COMPOSE}YAML\n`
  dOK('run', '--rm', '--pull', 'never', '-v', `${DRIFT_VOL}:/priv`, IMAGE, 'bash', '-c', setup)
  const mountpoint = dOK('volume', 'inspect', '-f', '{{.Mountpoint}}', DRIFT_VOL).trim()
  dOK(
    'run',
    '-d',
    '--name',
    DRIFT_WEB,
    '--pull',
    'never',
    '--mount',
    `type=bind,src=${mountpoint}/${FILE},dst=${TOKEN},readonly`,
    IMAGE,
    'sleep',
    '600'
  )
  const before = siteState()
  assert.match(before.meta, /^\d+ 0 0 600$/, `the host token is not root:0600 (${before.meta})`)
  assert.equal(before.token, PAT1)
  const mountedBefore = mountedDigest(DRIFT_WEB)
  assert.equal(mountedBefore.ok, true, mountedBefore.reason)
  assert.equal(mountedBefore.digest, tokenDigest(PAT1))

  // Control: with the compose still declaring the bind, the door answers and the helper is a no-op —
  // so the refusals below are caused by the drift, not by this fixture's site.
  await t.test('control: the intact protected compose is answered and not re-minted', () => {
    const door = runDoor()
    assert.equal(door.status, 0, door.stderr)
    assert.deepEqual(JSON.parse(door.stdout.trim()), { token: PAT1, complete: true })
    const helper = runHelper()
    assert.match(helper.stdout, /EXIT=0/, helper.stdout)
    assert.match(helper.stdout, /DOCKER_CALLS=0/)
  })

  // 🔒 OWNER AND MODE ON A REAL ROOT HOST (Astra review, 23/09/2026): the bind hands the container
  // the file's own owner and mode, so a 0644 token or one owned by www-data (uid 33) is readable by
  // the site's shell. With the compose intact, the door and the helper must both refuse such a file
  // at the real default (root, no TRACY_TOKEN_OWNER_UID) — and leave it exactly as it was.
  for (const [name, spoil, restore] of [
    ['mode 0644', 'chmod 0644', 'chmod 0600'],
    ['owned by www-data (uid 33)', 'chown 33:33', 'chown 0:0']
  ]) {
    await t.test(`a protected token ${name} is refused by the door and the helper, and not touched`, () => {
      const file = `/srv/tracy/${DRIFT_LABEL}/tracy-agent.token`
      const spoiled = onDriftSite(`${spoil} ${file}`)
      assert.equal(spoiled.status, 0, spoiled.stderr)
      try {
        const state = siteState()
        const door = runDoor()
        assert.equal(door.status, 0, door.stderr)
        assert.deepEqual(JSON.parse(door.stdout.trim()), { token: null, complete: false, custody: 'unknown' })
        const helper = runHelper()
        assert.match(helper.stdout, /^TRACY_ERROR TOKEN_CUSTODY_UNKNOWN$/m, helper.stdout)
        assert.match(helper.stdout, /EXIT=8/)
        assert.match(helper.stdout, /DOCKER_CALLS=0/, 'the helper asked the container to mint')
        assert.doesNotMatch(helper.stdout, /ec_pat_/, 'a PAT reached the helper output')
        assert.deepEqual(siteState(), state, 'the refused token file was changed')
      } finally {
        const restored = onDriftSite(`${restore} ${file}`)
        assert.equal(restored.status, 0, restored.stderr)
      }
      assert.deepEqual(siteState(), before)
    })
  }

  // The drift: only the compose file changes; the container keeps the bind it was created with.
  const drift = onDriftSite(
    `cat > /srv/tracy/${DRIFT_LABEL}/docker-compose.yml <<'YAML'\n${DRIFTED_COMPOSE}YAML\n`
  )
  assert.equal(drift.status, 0, drift.stderr)

  await t.test('the door refuses TOKEN_CUSTODY_UNKNOWN and hands out no token', () => {
    const door = runDoor()
    assert.equal(door.status, 0, door.stderr)
    assert.deepEqual(JSON.parse(door.stdout.trim()), { token: null, complete: false, custody: 'unknown' })
  })

  await t.test('the helper exits 8 TOKEN_CUSTODY_UNKNOWN before any container call', () => {
    const helper = runHelper()
    assert.match(helper.stdout, /^TRACY_ERROR TOKEN_CUSTODY_UNKNOWN$/m, helper.stdout)
    assert.match(helper.stdout, /EXIT=8/)
    assert.match(helper.stdout, /DOCKER_CALLS=0/, 'the helper asked the container to mint')
    assert.doesNotMatch(helper.stdout, /ec_pat_/, 'a PAT reached the helper output')
  })

  // A drift to a file compose cannot even parse (`services: invalid` above an indented `web:`),
  // which a line parser once read as `none`: refused the same way, nothing touched.
  await t.test('a malformed compose is refused by the door and the helper, and nothing is touched', () => {
    const state = siteState()
    const bad = onDriftSite(
      `cat > /srv/tracy/${DRIFT_LABEL}/docker-compose.yml <<'YAML'\n${MALFORMED_COMPOSE}YAML\n`
    )
    assert.equal(bad.status, 0, bad.stderr)
    try {
      const door = runDoor()
      assert.equal(door.status, 0, door.stderr)
      assert.deepEqual(JSON.parse(door.stdout.trim()), { token: null, complete: false, custody: 'unknown' })
      const helper = runHelper()
      assert.match(helper.stdout, /^TRACY_ERROR TOKEN_CUSTODY_UNKNOWN$/m, helper.stdout)
      assert.match(helper.stdout, /EXIT=8/)
      assert.match(helper.stdout, /DOCKER_CALLS=0/, 'the helper asked the container to mint')
      assert.deepEqual(siteState(), state, 'the refused token file was changed')
    } finally {
      const back = onDriftSite(
        `cat > /srv/tracy/${DRIFT_LABEL}/docker-compose.yml <<'YAML'\n${DRIFTED_COMPOSE}YAML\n`
      )
      assert.equal(back.status, 0, back.stderr)
    }
  })

  await t.test('nothing moved: same inode, owner, mode and bytes; no data/ copy', () => {
    assert.deepEqual(siteState(), { ...before, legacy: 'NO_LEGACY_COPY' })
    assert.equal(before.legacy, 'NO_LEGACY_COPY')
  })

  await t.test('the running container still presents the same credential through its bind', () => {
    const mounted = mountedDigest(DRIFT_WEB)
    assert.equal(mounted.ok, true, mounted.reason)
    assert.equal(mounted.digest, tokenDigest(PAT1))
    assert.equal(
      dOK('exec', '-u', '0', DRIFT_WEB, 'stat', '-c', '%i', TOKEN).trim(),
      before.meta.split(' ')[0]
    )
    const m = JSON.parse(dOK('inspect', '-f', '{{json .Mounts}}', DRIFT_WEB)).find(
      (x) => x.Destination === TOKEN
    )
    assert.equal(m.RW, false)
  })
})
