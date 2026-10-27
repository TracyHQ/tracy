/**
 * `emdash_tools_image` — the agent's tools layer on an EmDash quickstart image (David, 24/09/2026).
 *
 * `page.look` and `page.text` run chromium inside the site's web container (#154). A quickstart
 * image is built from the template's own Dockerfile and ships no browser, so provision now puts the
 * same layer `web/emdash.Dockerfile` puts on a bare EmDash image on top of it, as `<image>-tools`.
 * What must hold: the layer is built from that Dockerfile with the quickstart image as BASE; a layer
 * already built from the same inputs is reused; a changed Dockerfile or a rebuilt base makes it
 * stale; and any failure leaves the site on the plain image rather than failing the provision.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-tools-image.test.mjs
 *
 * `docker` is a stub on PATH that answers from environment variables and logs every call.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const WEB = fileURLToPath(new URL('../web/', import.meta.url))
const BASE = 'tracy/tracy-business-emdash:1.3.0'

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
case "$*" in
  "image inspect --format {{.Id}} "*)
    [ -n "$FAKE_BASE_ID" ] || exit 1; echo "$FAKE_BASE_ID" ;;
  "image inspect --format {{ index .Config.Labels \\"tracy.web.inputs\\" }} "*)
    [ -n "$FAKE_TOOLS_LABEL" ] || exit 1; echo "$FAKE_TOOLS_LABEL" ;;
  build\\ *) exit "\${FAKE_BUILD_EXIT:-0}" ;;
  *) : ;;
esac
`

/** A scratch dir with the stub docker; `scripts` is where the sourced scripts are read from. */
function host(t, { scripts = SCRIPTS } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-tools-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  writeFileSync(path.join(dir, 'bin/docker'), FAKE_DOCKER)
  chmodSync(path.join(dir, 'bin/docker'), 0o755)
  return { dir, scripts }
}

function tools(h, fake = {}, env = {}) {
  const log = path.join(h.dir, 'docker.log')
  rmSync(log, { force: true })
  const r = spawnSync(
    'bash',
    [
      '-c',
      'set -euo pipefail; . "$1/lib/web-image.sh"; . "$1/provision/emdash/quickstart-restore.sh"; emdash_tools_image "$2"; echo "RESULT=$EMDASH_TOOLS_IMAGE"',
      '_',
      h.scripts,
      BASE
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${h.dir}/bin:${process.env.PATH}`,
        TRACY_FLEET_DIR: path.join(h.dir, 'no-fleet'),
        FAKE_LOG: log,
        FAKE_BASE_ID: 'sha256:base-one',
        FAKE_TOOLS_LABEL: '',
        ...fake,
        ...env
      }
    }
  )
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  const builds = calls.filter((c) => c.startsWith('build '))
  const result = /^RESULT=(.*)$/m.exec(r.stdout)?.[1]
  const label = builds[0]?.match(/--label tracy\.web\.inputs=([0-9a-f]{64})/)?.[1]
  return { ...r, calls, builds, result, label }
}

describe('emdash_tools_image — the agent tools layer on a quickstart image', () => {
  test('a quickstart image with no tools layer yet gets one, built from web/emdash.Dockerfile on top of it', (t) => {
    const r = tools(host(t))
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.result, `${BASE}-tools`)
    assert.equal(r.builds.length, 1)
    const b = r.builds[0]
    assert.match(b, /-f \S*\/web\/emdash\.Dockerfile /)
    assert.match(b, new RegExp(`--build-arg BASE=${BASE.replace(/[.:/]/g, '\\$&')} `))
    assert.match(b, /--build-context tracy-web-files=\S*\/web /)
    assert.ok(r.label, 'the build stamps its inputs, so a later provision can tell it is current')
    assert.match(b, new RegExp(`-t ${BASE.replace(/[.:/]/g, '\\$&')}-tools `))
    assert.match(r.stdout, /==> docker build tracy\/tracy-business-emdash:1\.3\.0-tools \(agent tools\)/)
  })

  test('a layer built from the same inputs is reused: nothing is built again', (t) => {
    const h = host(t)
    const first = tools(h)
    const again = tools(h, { FAKE_TOOLS_LABEL: first.label })
    assert.equal(again.status, 0, again.stderr)
    assert.equal(again.result, `${BASE}-tools`)
    assert.deepEqual(again.builds, [])
    assert.match(again.stdout, /has this template's agent tools — not rebuilding/)
  })

  test('a rebuilt base under the same tag makes the layer stale, and it is built again', (t) => {
    const h = host(t)
    const first = tools(h)
    const rebuilt = tools(h, { FAKE_TOOLS_LABEL: first.label, FAKE_BASE_ID: 'sha256:base-two' })
    assert.equal(rebuilt.builds.length, 1)
    assert.notEqual(rebuilt.label, first.label)
  })

  test('a changed Dockerfile makes the layer stale too', (t) => {
    const h = host(t)
    const first = tools(h)
    // A copy of the scripts beside an edited copy of web/, in the repo's own layout.
    const tree = path.join(h.dir, 'tree')
    cpSync(SCRIPTS, path.join(tree, 'scripts'), { recursive: true })
    cpSync(WEB, path.join(tree, 'web'), { recursive: true })
    writeFileSync(
      path.join(tree, 'web/emdash.Dockerfile'),
      `${readFileSync(path.join(WEB, 'emdash.Dockerfile'), 'utf8')}\nLABEL tracy.test="changed"\n`
    )
    const edited = tools({ ...h, scripts: path.join(tree, 'scripts') }, { FAKE_TOOLS_LABEL: first.label })
    assert.equal(edited.builds.length, 1)
    assert.notEqual(edited.label, first.label)
  })

  test('a build that fails leaves the site on the plain image, says so, and does not fail the provision', (t) => {
    const r = tools(host(t), { FAKE_BUILD_EXIT: '1' })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.result, BASE)
    assert.match(r.stderr, /could not build tracy\/tracy-business-emdash:1\.3\.0-tools/)
  })

  test('no web/ directory beside the scripts: the plain image, and a warning naming what is missing', (t) => {
    const h = host(t)
    const lonely = path.join(h.dir, 'lonely/scripts')
    cpSync(SCRIPTS, lonely, { recursive: true })
    const r = tools({ ...h, scripts: lonely })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.result, BASE)
    assert.deepEqual(r.builds, [])
    assert.match(r.stderr, /no web\/emdash\.Dockerfile beside these scripts/)
  })

  test('a quickstart image that is not on the host gets no layer and no build', (t) => {
    const r = tools(host(t), { FAKE_BASE_ID: '' })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.result, BASE)
    assert.deepEqual(r.builds, [])
  })
})
