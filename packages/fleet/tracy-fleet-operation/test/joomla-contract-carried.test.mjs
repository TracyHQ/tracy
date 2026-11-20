/**
 * A contract profile no Claude Cowork plugin release carries (an AI quickstart's blank site contract) travels with the
 * quickstart entry, and the provisioner puts it into the component before the plugin's own fetch and the bind.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/joomla-contract-carried.test.mjs
 *
 * `quickstart.py --contract-profile` is RUN against a catalog of its own (invented profile, invented ids);
 * `joomla_place_contract_profile` is sourced from the real joomla.sh with a `docker` stand-in, as in
 * `joomla-contract-fetch.test.mjs`.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const JOOMLA_SH = `${PROVISION}platform/joomla.sh`
const JOOMLA_SRC = readFileSync(JOOMLA_SH, 'utf8')
const SCRATCH = process.env.TRACY_TEST_ARTIFACTS_DIR || os.tmpdir()
const TAG = 'local/ai-quickstart/example-ring/j6'
const ID = 'example-ring-blank/j6/2.0.1'

const fileOf = (text) => ({
  text,
  bytes: Buffer.byteLength(text),
  sha256: createHash('sha256').update(text).digest('hex')
})

/** An entry sealed by `ID` that carries its profile; `change` edits it before it is written. */
function entryOf(change = (e) => e) {
  return change({
    platform: 'joomla',
    version: '2.0.1',
    contract: ID,
    contractProfile: {
      id: ID,
      files: {
        'manifest.json': fileOf('{"id":"example-ring-blank/j6/2.0.1"}\n'),
        'content-map.json': fileOf('{"entities":[]}\n')
      }
    }
  })
}

/** Runs `quickstart.py --contract-profile` on a one-entry catalog; answers the run and the files written. */
function place(entry) {
  const root = mkdtempSync(path.join(SCRATCH, 'contract-carried-'))
  try {
    const catalog = path.join(root, 'quickstarts.json')
    writeFileSync(catalog, JSON.stringify({ [TAG]: entry }))
    const out = path.join(root, 'profile')
    const run = spawnSync('python3', [`${PROVISION}quickstart.py`, '--id', TAG, '--contract-profile', out], {
      encoding: 'utf8',
      env: { ...process.env, TRACY_QUICKSTARTS_JSON: catalog }
    })
    const written = existsSync(out)
      ? Object.fromEntries(readdirSync(out).map((n) => [n, readFileSync(path.join(out, n), 'utf8')]))
      : null
    return { ...run, written }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('the carried profile is written file by file, and its id is printed', () => {
  const run = place(entryOf())
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout.trim(), ID)
  assert.deepEqual(run.written, {
    'content-map.json': '{"entities":[]}\n',
    'manifest.json': '{"id":"example-ring-blank/j6/2.0.1"}\n'
  })
})

test('an entry that carries no profile answers exit 4 and writes nothing: the plugin fetches it, as before', () => {
  const run = place(
    entryOf((e) => {
      delete e.contractProfile
      return e
    })
  )
  assert.equal(run.status, 4)
  assert.equal(run.written, null)
})

test('a file that does not match its sha256 or size stops the write, and no file is left behind', () => {
  const run = place(
    entryOf((e) => {
      e.contractProfile.files['content-map.json'].text = '{"entities":["changed"]}\n'
      return e
    })
  )
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /content-map\.json does not match its size and sha256/)
  assert.equal(run.written, null)
})

test('a profile that is not the contract the entry is sealed by is refused', () => {
  const run = place(
    entryOf((e) => {
      e.contract = 'example-ring/j6/2.0.1'
      return e
    })
  )
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /is not the contract this quickstart is sealed by/)
  assert.equal(run.written, null)
})

test('a file name that is a path, or a profile with no manifest, is refused', () => {
  const path_ = place(
    entryOf((e) => {
      e.contractProfile.files['../escape.json'] = fileOf('{}\n')
      return e
    })
  )
  assert.notEqual(path_.status, 0)
  assert.match(path_.stderr, /not a plain \.json name/)
  const bare = place(
    entryOf((e) => {
      delete e.contractProfile.files['manifest.json']
      return e
    })
  )
  assert.notEqual(bare.status, 0)
  assert.match(bare.stderr, /no manifest\.json/)
})

/** Sources joomla.sh with `docker` and `python3` stand-ins; `PY_MODE` picks what the profile writer answers. */
const shell = (body, pyMode = 'ok') => {
  const dir = mkdtempSync(path.join(SCRATCH, 'joomla-carried-'))
  try {
    const script = `
      set -euo pipefail
      tracy_web_image() { echo "$2"; }
      docker() { printf '%s\\n' "$*" >> "$FAKE_DIR/docker.log"; cat > /dev/null; }
      python3() {
        printf '%s\\n' "$*" >> "$FAKE_DIR/python.log"
        case "$PY_MODE" in ok) echo "$ID" ;; absent) return 4 ;; *) echo 'bad sha' >&2; return 1 ;; esac
      }
      . "$JOOMLA_SH"
      QUICKSTART="$TAG"
      ${body}
    `
    const r = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      timeout: 30000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        JOOMLA_SH,
        HERE: PROVISION.replace(/\/$/, ''),
        SITE_DIR: dir,
        FAKE_DIR: dir,
        PY_MODE: pyMode,
        ID,
        TAG
      }
    })
    if (r.error) throw r.error
    const read = (name) =>
      existsSync(path.join(dir, name)) ? readFileSync(path.join(dir, name), 'utf8') : ''
    return {
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      docker: read('docker.log'),
      python: read('python.log')
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a carried profile is copied into the web container and placed under lib/contracts/<id> as root', () => {
  const out = shell(`joomla_place_contract_profile ${ID}; echo "rc=$?"`)
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /rc=0/)
  assert.match(out.stdout, new RegExp(`contract profile ${ID}: carried by this quickstart, put on disk`))
  assert.match(out.python, new RegExp(`--id ${TAG} --contract-profile `))
  // The in-container script spans lines; each call starts with `compose`.
  const calls = out.docker.split(/\n(?=compose )/)
  assert.equal(calls.length, 2)
  assert.match(calls[0], /^compose cp .+\/\. web:\/tmp\/tracy-contract-profile$/)
  assert.match(calls[1], new RegExp(`^compose exec -T -e TRACY_CONTRACT_ID=${ID} web sh -c `))
  assert.match(calls[1], /lib\/contracts\/\$TRACY_CONTRACT_ID/)
})

test('no carried profile is a no-op; a bad one stops the provision before anything reaches the container', () => {
  const none = shell(`joomla_place_contract_profile ${ID}; echo "rc=$?"`, 'absent')
  assert.equal(none.status, 0, none.stderr)
  assert.match(none.stdout, /rc=0/)
  assert.equal(none.docker, '')
  const bad = shell(`joomla_place_contract_profile ${ID} || { echo stopped; exit 7; }`, 'bad')
  assert.equal(bad.status, 7)
  assert.match(
    bad.stderr,
    new RegExp(`!! contract profile ${ID}: the profile this quickstart carries did not check out`)
  )
  assert.equal(bad.docker, '')
  const unsafe = shell(`joomla_place_contract_profile 'x/j6"; rm -rf /'`)
  assert.notEqual(unsafe.status, 0)
  assert.equal(unsafe.python, '')
})

test('the card road places a carried profile after the component install, before the fetch and the bind', () => {
  const card = JOOMLA_SRC.indexOf('card_contract="$(joomla_card_contract)" || return 1')
  const placeAt = JOOMLA_SRC.indexOf('joomla_place_contract_profile "$card_contract" || return 1', card)
  const fetchAt = JOOMLA_SRC.indexOf('joomla_fetch_contract "$card_contract" || return 1', card)
  const bindAt = JOOMLA_SRC.indexOf('joomla_bind_contract "$card_contract"', card)
  assert.ok(
    card > 0 && placeAt > card && fetchAt > placeAt && bindAt > fetchAt,
    'install → place → fetch → bind'
  )
})
