// The `site-look-css` job (src/look-css.js): turn undo's host half for a WordPress look, whose
// Additional CSS is not a Git file. `check` answers hashes; `undo` writes `c0` back only while the
// site holds `c1`, and marks the entry used as the plugin's own `look.revert` does. Docker is a fake
// that plays the compare-and-set PHP's contract.
//
//   node --test apps/tracy-host/test/look-css.test.mjs
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as plugin from '../../../packages/tools/tracy-site-tools/src/host/look-undo.mjs'
import { signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'
import {
  cssHash,
  LOOK_CSS_KIND,
  LOOK_UNDO_DIR,
  lookCss,
  runLookCssJob,
  UNDO_ID,
  validateLookCssBody,
  WP_CUSTOM_CSS_PHP,
  wpCustomCssArgv
} from '../src/look-css.js'

const LABEL = 'lookwp1'

/** A sites root with one site whose look undo store holds `entries` ({id: {c0, c1, ...}}). */
function site(entries) {
  const sitesRoot = mkdtempSync(path.join(tmpdir(), 'look-css-'))
  const siteRoot = path.join(sitesRoot, LABEL)
  for (const [id, e] of Object.entries(entries)) {
    const dir = path.join(siteRoot, LOOK_UNDO_DIR, id)
    mkdirSync(dir, { recursive: true })
    if (e.c0 !== undefined) writeFileSync(path.join(dir, 'c0'), e.c0, 'utf8')
    if (e.c1 !== undefined) writeFileSync(path.join(dir, 'c1'), e.c1, 'utf8')
    writeFileSync(
      path.join(dir, 'manifest.json'),
      `${JSON.stringify({
        v: 1,
        id,
        at: '2026-10-09T10:00:00.000Z',
        tool: 'look.set',
        files: e.files ?? [],
        ...(e.c0 === undefined
          ? {}
          : {
              customCss: {
                stylesheet: e.stylesheet ?? 'tracy',
                before: 'c0',
                ...(e.existed === false ? { existed: false } : {}),
                ...(e.c1 === undefined ? {} : { after: 'c1' })
              }
            }),
        ...(e.reverted ? { reverted: e.reverted } : {})
      })}\n`
    )
  }
  const manifest = (id) =>
    JSON.parse(readFileSync(path.join(siteRoot, LOOK_UNDO_DIR, id, 'manifest.json'), 'utf8'))
  return { config: { sitesRoot }, siteRoot, manifest }
}

/**
 * A docker that plays `WP_CUSTOM_CSS_PHP`: `css` holds each theme's Additional CSS, a theme with no
 * key has no `custom_css` post (read as `""`), and `remove` deletes the key.
 */
function fakeDocker(css, { garble = false } = {}) {
  const calls = []
  const run = async (input) => {
    calls.push(input)
    assert.equal(input.script, 'docker')
    assert.deepEqual(input.args.slice(0, 5), ['exec', '-i', '-u', 'www-data', `${LABEL}-web-1`])
    assert.equal(input.args.at(-1), WP_CUSTOM_CSS_PHP)
    if (garble) return { code: 1, tail: ['Error: This does not seem to be a WordPress installation.'] }
    const q = JSON.parse(input.stdin)
    const s = q.stylesheet
    const now = css[s] ?? ''
    let answer
    if (q.mode === 'read') answer = { ok: true, stylesheet: s, css: now, exists: s in css, block: true }
    else if (q.expect !== cssHash(now)) answer = { ok: false, conflict: true, stylesheet: s }
    else if (q.mode === 'remove') {
      delete css[s]
      answer = { ok: true, stylesheet: s, css: '', exists: false }
    } else {
      css[s] = q.css
      answer = { ok: true, stylesheet: s, css: q.css }
    }
    return {
      code: 0,
      tail: [
        'Deprecated: PHP said something',
        `TRACY_WP_CSS ${Buffer.from(JSON.stringify(answer)).toString('base64')}`
      ]
    }
  }
  return { run, calls }
}

test('🔒 the PHP, its argv, the store and the id shape are the plugin’s own — the copy cannot drift', () => {
  assert.equal(WP_CUSTOM_CSS_PHP, plugin.WP_CUSTOM_CSS_PHP)
  assert.deepEqual(wpCustomCssArgv('x-web-1'), plugin.wpCustomCssArgv('x-web-1'))
  assert.equal(LOOK_UNDO_DIR, plugin.LOOK_UNDO_DIR)
  assert.equal(String(UNDO_ID), String(plugin.UNDO_ID))
  assert.equal(cssHash('a > b { color: red }\n'), plugin.cssHash('a > b { color: red }\n'))
})

test('check: per id the hashes of before, after and what the site holds now; an entry with no Additional CSS is unknown', async () => {
  const s = site({
    aaaaaa: { c0: '', c1: '.a{}' },
    bbbbbb: { c0: '.a{}', c1: '.a{}\n.b{}', reverted: { at: '2026-10-09T11:00:00.000Z', by: 'look.revert' } },
    cccccc: { files: [{ path: '/x', existed: false }] },
    dddddd: { c0: '.a{}' }
  })
  const docker = fakeDocker({ tracy: '.a{}\n.b{}' })
  const out = await lookCss({
    body: { label: LABEL, mode: 'check', ids: ['aaaaaa', 'bbbbbb', 'cccccc', 'dddddd', 'eeeeee'] },
    config: s.config,
    run: docker.run
  })
  const now = cssHash('.a{}\n.b{}')
  assert.deepEqual(out, {
    ok: true,
    entries: {
      aaaaaa: { before: cssHash(''), after: cssHash('.a{}'), now, reverted: false },
      bbbbbb: { before: cssHash('.a{}'), after: now, now, reverted: true },
      cccccc: { unknown: true },
      dddddd: { unknown: true },
      eeeeee: { unknown: true }
    }
  })
  assert.equal(docker.calls.length, 1, 'one read per theme, whatever the number of ids')
  assert.doesNotMatch(JSON.stringify(out), /\.a\{\}/, 'no CSS text leaves the host')
})

test('undo: c0 goes back while the site holds c1, the entry is marked used, and the plugin’s look.revert then refuses it', async () => {
  const s = site({ abc123: { c0: '/* mine */', c1: '/* mine */\n.x{color:red}' } })
  const css = { tracy: '/* mine */\n.x{color:red}' }
  const docker = fakeDocker(css)
  const out = await lookCss({
    body: { label: LABEL, mode: 'undo', id: 'abc123' },
    config: s.config,
    run: docker.run,
    now: Date.parse('2026-10-09T12:00:00Z')
  })
  assert.deepEqual(out, { ok: true, id: 'abc123', marked: true })
  assert.equal(css.tracy, '/* mine */', 'byte for byte')
  assert.deepEqual(s.manifest('abc123').reverted, { at: '2026-10-09T12:00:00.000Z', by: 'turn-undo' })
  // The plugin's own revert reads the same mark.
  const io = { customCss: { write: async () => assert.fail('nothing may be written') } }
  const again = await plugin.revertLook({ siteRoot: s.siteRoot, undo: 'abc123', io })
  assert.equal(again.ok, false)
  assert.equal(again.code, 'LOOK_UNDO_USED')
  assert.match(again.error, /when its chat request was undone/)
  // And this job does too.
  const twice = await lookCss({
    body: { label: LABEL, mode: 'undo', id: 'abc123' },
    config: s.config,
    run: docker.run
  })
  assert.deepEqual(twice, { ok: false, code: 'LOOK_UNDO_USED' })
  assert.equal(docker.calls.length, 1)
})

test('🔒 undo of a write that CREATED the Additional CSS post: the post is deleted, not emptied — the check then reads it as before (uiweekwp)', async () => {
  const s = site({ abc123: { c0: '', c1: '.x{}', existed: false }, def456: { c0: '', c1: '.y{}' } })
  const css = { tracy: '.x{}' }
  const docker = fakeDocker(css)
  const out = await lookCss({
    body: { label: LABEL, mode: 'undo', id: 'abc123' },
    config: s.config,
    run: docker.run
  })
  assert.deepEqual(out, { ok: true, id: 'abc123', marked: true })
  assert.equal('tracy' in css, false, 'no empty custom_css post is left behind')
  assert.equal(JSON.parse(docker.calls[0].stdin).mode, 'remove')
  assert.equal(JSON.parse(docker.calls[0].stdin).expect, cssHash('.x{}'), 'only while the site holds c1')
  const check = await lookCss({
    body: { label: LABEL, mode: 'check', ids: ['abc123'] },
    config: s.config,
    run: docker.run
  })
  assert.equal(check.entries.abc123.now, check.entries.abc123.before, 'back to what it was')
  // an entry kept before `existed` was recorded cannot tell "none" from "empty": emptied, as before
  css.tracy = '.y{}'
  const old = await lookCss({
    body: { label: LABEL, mode: 'undo', id: 'def456' },
    config: s.config,
    run: docker.run
  })
  assert.deepEqual(old, { ok: true, id: 'def456', marked: true })
  assert.equal(css.tracy, '')
})

test('undo: the Additional CSS changed since (a person saved it) — nothing written, nothing marked', async () => {
  const s = site({ abc123: { c0: '', c1: '.x{}' } })
  const css = { tracy: '.x{}\n.later{}' }
  const out = await lookCss({
    body: { label: LABEL, mode: 'undo', id: 'abc123' },
    config: s.config,
    run: fakeDocker(css).run
  })
  assert.deepEqual(out, { ok: false, code: 'LOOK_UNDO_CHANGED_SINCE' })
  assert.equal(css.tracy, '.x{}\n.later{}', 'the later change stands')
  assert.equal(s.manifest('abc123').reverted, undefined)
})

test('undo: an unknown id, a file look and a write that did not finish are refused unknown; nothing runs', async () => {
  const s = site({ aaaaaa: { files: [{ path: '/x', existed: false }] }, bbbbbb: { c0: '' } })
  const docker = fakeDocker({ tracy: '' })
  for (const id of ['aaaaaa', 'bbbbbb', 'ffffff'])
    assert.deepEqual(
      await lookCss({ body: { label: LABEL, mode: 'undo', id }, config: s.config, run: docker.run }),
      {
        ok: false,
        code: 'LOOK_UNDO_UNKNOWN'
      }
    )
  assert.equal(docker.calls.length, 0)
})

test('the job: done with the answer as one JSON line; wp-cli with no readable answer fails the job with why', async () => {
  const s = site({ abc123: { c0: '', c1: '.x{}' } })
  const jobs = new Map()
  const put = async (id, fields) => jobs.set(id, { ...jobs.get(id), ...fields })
  await runLookCssJob({
    jobId: 'j1',
    body: { kind: LOOK_CSS_KIND, label: LABEL, mode: 'undo', id: 'abc123' },
    config: s.config,
    jobs: { put },
    run: fakeDocker({ tracy: '.x{}' }).run
  })
  assert.equal(jobs.get('j1').state, 'done')
  assert.deepEqual(JSON.parse(jobs.get('j1').output), { ok: true, id: 'abc123', marked: true })
  const t = site({ abc123: { c0: '', c1: '.x{}' } })
  await runLookCssJob({
    jobId: 'j2',
    body: { kind: LOOK_CSS_KIND, label: LABEL, mode: 'undo', id: 'abc123' },
    config: t.config,
    jobs: { put },
    run: fakeDocker({}, { garble: true }).run
  })
  assert.equal(jobs.get('j2').state, 'failed')
  assert.match(jobs.get('j2').detail, /wp-cli in lookwp1-web-1: Error: This does not seem/)
  assert.equal(t.manifest('abc123').reverted, undefined)
})

test('validateLookCssBody: a mode, six-hex ids, nothing else', () => {
  assert.equal(validateLookCssBody({ kind: LOOK_CSS_KIND, label: 'a', mode: 'check', ids: ['abc123'] }), null)
  assert.equal(validateLookCssBody({ kind: LOOK_CSS_KIND, label: 'a', mode: 'undo', id: 'abc123' }), null)
  for (const body of [
    { mode: 'write', id: 'abc123' },
    { mode: 'undo', id: '../../x' },
    { mode: 'undo', id: 'abc123', ids: ['abc123'] },
    { mode: 'check', ids: [] },
    { mode: 'check', ids: ['ABC123'] },
    { mode: 'check', ids: Array.from({ length: 51 }, () => 'abc123') },
    { mode: 'check', ids: ['abc123'], css: 'x' }
  ])
    assert.notEqual(validateLookCssBody(body), null, JSON.stringify(body))
})

function hostConfig(sitesRoot) {
  const dir = (name) => mkdtempSync(path.join(tmpdir(), `look-css-${name}-`))
  return {
    hostName: 'local',
    hostSecret: 'host-secret',
    sitesRoot,
    privateRoot: dir('private'),
    scriptsDir: '/opt/tracy-fleet',
    jobsDir: dir('jobs'),
    logDir: dir('logs'),
    cloudflare: null
  }
}

async function signed(app, method, urlPath, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload)
  const headers = await signHostCall({ secret: 'host-secret', path: urlPath, body })
  return app.fetch(
    new Request(`http://tracy-host.test${urlPath}`, { method, headers, ...(body ? { body } : {}) })
  )
}

test('POST /_host/site site-look-css: 202 then a done job; a bad label or body is refused 400 before anything runs', async () => {
  const s = site({ abc123: { c0: '', c1: '.x{}' } })
  const all = new Map()
  const jobs = {
    put: async (id, fields) => all.set(id, { ...all.get(id), ...fields }),
    get: async (id) => all.get(id) ?? null
  }
  const app = buildApp({
    config: hostConfig(s.config.sitesRoot),
    jobs,
    run: fakeDocker({ tracy: '.x{}' }).run
  })
  const res = await signed(app, 'POST', '/_host/site', {
    kind: LOOK_CSS_KIND,
    label: LABEL,
    mode: 'check',
    ids: ['abc123']
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  let job
  for (let i = 0; i < 200 && job?.state !== 'done'; i++) {
    job = await (await signed(app, 'GET', `/_host/jobs/${jobId}`)).json()
    await new Promise((r) => setTimeout(r, 5))
  }
  assert.equal(job.state, 'done')
  assert.equal(JSON.parse(job.output).entries.abc123.now, cssHash('.x{}'))
  const never = buildApp({
    config: hostConfig(s.config.sitesRoot),
    jobs,
    run: async () => assert.fail('must not run')
  })
  for (const body of [
    { kind: LOOK_CSS_KIND, label: '../a', mode: 'undo', id: 'abc123' },
    { kind: LOOK_CSS_KIND, label: LABEL, mode: 'undo', id: '$(id)' },
    { kind: LOOK_CSS_KIND, label: LABEL, mode: 'undo', id: 'abc123', stylesheet: 'other' }
  ]) {
    const refused = await signed(never, 'POST', '/_host/site', body)
    assert.equal(refused.status, 400, JSON.stringify(body))
  }
})
