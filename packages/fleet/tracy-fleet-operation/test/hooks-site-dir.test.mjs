#!/usr/bin/env node
/**
 * The two hook servers turn a relay-sent label into a path under /srv/tracy only through
 * `site_dir()`: one plain folder name, the joined path checked to stay inside the root.
 * `SAFE_ARG` guards a command line and lets `/` and `..` through, so before `site_dir()` a signed
 * `"label": "../outside"` read `/srv/outside/tracy-agent.token` and wrote `core-manifest.json`
 * outside every site.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/hooks-site-dir.test.mjs
 *
 * Each hook file is imported into a Python child with SITES_ROOT and JOB_DIR moved to a temp
 * folder, served on a free port, and called with signed requests. Nothing on this machine is touched.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'hooks')

const DRIVER = `
import base64, hashlib, hmac, importlib.util, json, os, sys, threading, urllib.request, urllib.error
from http.server import HTTPServer
hook, root, jobs, calls = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
spec = importlib.util.spec_from_file_location("hooks", hook)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
m.SITES_ROOT, m.JOB_DIR, m.log = root, jobs, lambda _msg: None
os.environ["FLEET_RELAY_SECRET"] = "s3cret"
server = HTTPServer(("127.0.0.1", 0), m.Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
out = []
for path, payload in calls:
    body = json.dumps(payload).encode()
    sig = hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(f"http://127.0.0.1:{server.server_port}{path}", data=body,
                                 headers={"x-tracy-signature": sig, "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            out.append([r.status, r.read().decode()])
    except urllib.error.HTTPError as e:
        out.append([e.code, e.read().decode()])
server.shutdown()
print(json.dumps(out))
`

/** @param {string} hook @param {string} root @param {string} jobs @param {Array<[string, object]>} calls */
function call(hook, root, jobs, calls) {
  const out = spawnSync(
    'python3',
    ['-B', '-c', DRIVER, join(HOOKS, hook), root, jobs, JSON.stringify(calls)],
    {
      encoding: 'utf8'
    }
  )
  assert.equal(out.status, 0, out.stderr)
  return JSON.parse(out.stdout)
}

const manifest = Buffer.from(JSON.stringify({ platform: 'joomla', extensions: [] })).toString('base64')

for (const hook of ['tracy-hooks.do.py', 'tracy-hooks.contabo.py']) {
  test(`${hook}: a label is one folder inside /srv/tracy, never a way out of it`, (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'hooks-site-dir-'))
    t.after(() => rmSync(tmp, { recursive: true, force: true }))
    const root = join(tmp, 'sites')
    mkdirSync(join(root, 'good-site'), { recursive: true })
    mkdirSync(join(tmp, 'outside'))
    writeFileSync(join(root, 'good-site', 'tracy-agent.token'), 'good-token\n')
    writeFileSync(join(tmp, 'outside', 'tracy-agent.token'), 'stolen\n')

    const write = (label) => ['/site', { kind: 'core-manifest-write', label, contentBase64: manifest }]
    const got = call(hook, root, join(tmp, 'jobs'), [
      ['/agent-token', { label: 'good-site' }],
      ['/agent-token', { label: '../outside' }],
      ['/agent-token', { label: 'good-site/../../outside' }],
      ['/agent-token', { label: 'good-site\n' }],
      write('good-site'),
      write('../outside')
    ])

    assert.equal(got[0][0], 200)
    assert.deepEqual(JSON.parse(got[0][1]), { token: 'good-token' })
    for (const refused of got.slice(1, 4)) assert.deepEqual(refused, [400, 'bad label'])
    assert.equal(got[4][0], 202)
    assert.ok(existsSync(join(root, 'good-site', 'core-manifest.json')))
    assert.deepEqual(got[5], [400, 'refused label'])
    assert.ok(!existsSync(join(tmp, 'outside', 'core-manifest.json')))
  })

  test(`${hook}: a site entry that links outside the root is refused; a root reached through a link still works`, (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'hooks-site-dir-'))
    t.after(() => rmSync(tmp, { recursive: true, force: true }))
    const real = join(tmp, 'real-sites')
    mkdirSync(join(real, 'good-site'), { recursive: true })
    mkdirSync(join(tmp, 'outside'))
    writeFileSync(join(real, 'good-site', 'tracy-agent.token'), 'good-token\n')
    writeFileSync(join(tmp, 'outside', 'tracy-agent.token'), 'stolen\n')
    // The root as a mounted volume might be: a link to the real folder.
    const root = join(tmp, 'sites')
    symlinkSync(real, root)
    symlinkSync(join(tmp, 'outside'), join(real, 'site-a'))

    const write = (label) => ['/site', { kind: 'core-manifest-write', label, contentBase64: manifest }]
    const got = call(hook, root, join(tmp, 'jobs'), [
      ['/agent-token', { label: 'good-site' }],
      ['/agent-token', { label: 'site-a' }],
      write('good-site'),
      write('site-a')
    ])

    assert.equal(got[0][0], 200)
    assert.deepEqual(JSON.parse(got[0][1]), { token: 'good-token' })
    assert.deepEqual(got[1], [400, 'bad label'])
    assert.equal(got[2][0], 202)
    assert.ok(existsSync(join(real, 'good-site', 'core-manifest.json')))
    assert.deepEqual(got[3], [400, 'refused label'])
    assert.ok(!existsSync(join(tmp, 'outside', 'core-manifest.json')))
  })
}

test('tracy-hooks.contabo.py: /go-live refuses a label that climbs out before asking whether the site exists', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'hooks-site-dir-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const root = join(tmp, 'sites')
  mkdirSync(root)
  mkdirSync(join(tmp, 'outside'))
  const got = call('tracy-hooks.contabo.py', root, join(tmp, 'jobs'), [
    ['/go-live', { label: '../outside', op: 'live' }],
    ['/go-live', { label: 'no-such-site', op: 'live' }]
  ])
  assert.deepEqual(got, [
    [400, 'refused label'],
    [404, 'no such site']
  ])
})
