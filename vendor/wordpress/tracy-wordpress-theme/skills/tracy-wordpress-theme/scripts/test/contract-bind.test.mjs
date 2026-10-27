import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { bindingOf, curlPost, ownWpContent, runBindTest, DOOR } from '../quickstart/contract-bind.mjs'

const TOKEN = 'tok-SECRET-0123456789abcdef'
const CONTRACT = 'ja-demo/wp7/1.0.1'
const PLUGIN = { name: 'claude-cowork', status: 'active', version: '2.4.0' }

/** A wp-cli fake: `plugins` is what `plugin list` returns, `token` what the option holds. */
function fakeWp({ plugins = [PLUGIN], token = TOKEN, installFails = false } = {}) {
  const calls = []
  const wp = (args) => {
    calls.push(args.join(' '))
    const [a, b] = args
    if (a === 'plugin' && b === 'install') return installFails ? { status: 1, stdout: '', stderr: 'Error: Could not create directory.' } : { status: 0, stdout: 'Success', stderr: '' }
    if (a === 'plugin' && b === 'list') return { status: 0, stdout: JSON.stringify(plugins), stderr: '' }
    if (a === 'option' && b === 'get') return token ? { status: 0, stdout: token + '\n', stderr: '' } : { status: 1, stdout: '', stderr: 'Error: Could not get' }
    if (a === 'option' && b === 'update') return { status: 0, stdout: 'Success', stderr: '' }
    return { status: 1, stdout: '', stderr: `unexpected ${args.join(' ')}` }
  }
  wp.calls = calls
  return wp
}
/** An HTTP fake answering bind and inspect from the request's own operation. */
function fakePost(answers) {
  const seen = []
  const post = (url, body) => {
    seen.push({ url, body })
    const a = answers[body.params.operation]
    return typeof a === 'string' ? { status: 200, text: a } : { status: 200, text: JSON.stringify(a) }
  }
  post.seen = seen
  return post
}
const drift = (n) => Array.from({ length: n }, (_, i) => ({ code: i < 3 ? 'PRESENTATION_DRIFT' : 'OTHER', message: `file ${i}` }))
const out = () => mkdtempSync(path.join(tmpdir(), 'contract-bind-'))
const run = (o) => runBindTest({ contract: CONTRACT, siteUrl: 'http://stand.test/', out: out(), now: () => new Date('2026-10-04T00:00:00Z'), ...o })
const readJson = (dir, f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
const allText = (dir, r) => [r.lines.join('\n'), ...readdirSync(dir).map((f) => readFileSync(path.join(dir, f), 'utf8'))].join('\n')

test('bound with drift warnings: exit 0, evidence counts the warnings by code', () => {
  const dir = out()
  const wp = fakeWp()
  const post = fakePost({ bind: { ok: true, bound: true }, inspect: { ok: true, warnings: drift(5), entities: [1, 2, 3] } })
  const r = run({ wp, post, out: dir, plugin: '/tmp/cowork.zip' })
  assert.equal(r.code, 0)
  assert.deepEqual(readdirSync(dir).sort(), ['bind-answer.json', 'contract-bind.json', 'inspect-answer.json'])
  assert.deepEqual(readJson(dir, 'contract-bind.json'), {
    tool: 'contract-bind', contract: CONTRACT, pluginVersion: '2.4.0', bound: true, refused: false, alreadyBound: false, error: null, problems: [],
    warnings: 5, warningCodes: { PRESENTATION_DRIFT: 3, OTHER: 2 }, entities: 3, ranAt: '2026-10-04T00:00:00.000Z'
  })
  assert.ok(wp.calls.some((c) => c.startsWith('plugin install /tmp/cowork.zip')))
  assert.ok(wp.calls.includes(`option update claude_cowork_contract ${CONTRACT}`))
  assert.equal(post.seen.length, 2)
  assert.equal(post.seen[0].url, 'http://stand.test' + DOOR)
  assert.deepEqual(post.seen[0].body.params, { operation: 'bind', contract: CONTRACT })
  assert.equal(post.seen[0].body.action, 'content.contract')
  assert.equal(post.seen[1].body.params.operation, 'inspect')
})

test('refused: exit 3, the problems are named, a refusal is not an error', () => {
  const dir = out()
  const problems = Array.from({ length: 7 }, (_, i) => `Slot home-2.s${i}: block s${i} is not in this pattern`)
  const post = fakePost({ bind: { ok: false, error: { code: 'contract_failed', message: 'contract failed', problems } } })
  const r = run({ wp: fakeWp(), post, out: dir })
  assert.equal(r.code, 3)
  const ev = readJson(dir, 'contract-bind.json')
  assert.equal(ev.refused, true)
  assert.equal(ev.bound, false)
  assert.equal(ev.error, 'contract_failed')
  assert.equal(ev.problems.length, 7)
  assert.equal(post.seen.length, 1, 'no inspect after a refusal')
  assert.equal(r.lines.filter((l) => l.startsWith('  Slot')).length, 5, 'the first five problems are printed')
  assert.ok(r.lines.join('\n').includes('Slot home-2.s0'))
})

test('no token: exit 1, a tool failure, never "refused"; nothing is posted', () => {
  const dir = out()
  const post = fakePost({})
  const r = run({ wp: fakeWp({ token: '' }), post, out: dir })
  assert.equal(r.code, 1)
  const ev = readJson(dir, 'contract-bind.json')
  assert.equal(ev.refused, false)
  assert.equal(ev.bound, false)
  assert.match(ev.error, /no token/)
  assert.equal(post.seen.length, 0)
})

test('non-JSON answer: exit 1, not refused', () => {
  const dir = out()
  const r = run({ wp: fakeWp(), post: fakePost({ bind: '<html>502 Bad Gateway</html>' }), out: dir })
  assert.equal(r.code, 1)
  const ev = readJson(dir, 'contract-bind.json')
  assert.equal(ev.refused, false)
  assert.match(ev.error, /no JSON answer/)
})

test('a plugin that is missing or inactive, a failed install and another plugin error are tool failures', () => {
  assert.equal(run({ wp: fakeWp({ plugins: [] }), post: fakePost({}) }).code, 1)
  const inactive = run({ wp: fakeWp({ plugins: [{ ...PLUGIN, status: 'inactive' }] }), post: fakePost({}) })
  assert.equal(inactive.code, 1)
  assert.match(inactive.evidence.error, /not active/)
  const install = run({ wp: fakeWp({ installFails: true }), post: fakePost({}), plugin: 'x.zip' })
  assert.equal(install.code, 1)
  assert.match(install.evidence.error, /uid 33/)
  assert.doesNotMatch(install.evidence.error, /same path/)
  // a local zip the runner may not see (a docker runner): the message names the mount
  const localZip = path.join(mkdtempSync(path.join(tmpdir(), 'contract-bind-plugin-')), 'p.zip')
  writeFileSync(localZip, 'plugin')
  const local = run({ wp: fakeWp({ installFails: true }), post: fakePost({}), plugin: localZip })
  assert.equal(local.code, 1)
  assert.match(local.evidence.error, /the same path/)
  const denied = run({ wp: fakeWp(), post: fakePost({ bind: { ok: false, error: { code: 'unauthorized', message: 'bad token' } } }) })
  assert.equal(denied.code, 1)
  assert.equal(denied.evidence.refused, false)
})

test('the token never reaches stdout, stderr or the evidence files, even when the plugin echoes it', () => {
  for (const [answers, wp] of [
    [{ bind: { ok: true, echo: TOKEN }, inspect: { ok: true, warnings: [], token: TOKEN } }, fakeWp()],
    [{ bind: { ok: false, error: { code: 'contract_failed', message: `bad ${TOKEN}`, problems: [`p ${TOKEN}`] } } }, fakeWp()],
    [{ bind: { ok: false, error: { code: 'unauthorized', message: `token ${TOKEN} refused` } } }, fakeWp()],
    [{ bind: `not json ${TOKEN}` }, fakeWp()]
  ]) {
    const dir = out()
    const r = run({ wp, post: fakePost(answers), out: dir })
    assert.ok(!allText(dir, r).includes(TOKEN), `token leaked (exit ${r.code})`)
  }
})

test('curlPost sends the body on stdin, never in argv, and splits the status off the answer', () => {
  let call
  const spawn = (cmd, args, opts) => {
    call = { cmd, args, input: opts.input }
    return { status: 0, stdout: '{"ok":true}\n200', stderr: '' }
  }
  const r = curlPost('docker run --rm -i curlimages/curl', { spawn })('http://x/y', { token: TOKEN })
  assert.deepEqual(r, { status: 200, text: '{"ok":true}' })
  assert.ok(!call.args.join(' ').includes(TOKEN))
  assert.ok(call.args[1].startsWith('docker run --rm -i curlimages/curl "$@"'))
  assert.equal(JSON.parse(call.input).token, TOKEN)
  assert.throws(() => curlPost('curl', { spawn: () => ({ status: 7, stdout: '', stderr: 'Failed to connect' }) })('http://x', {}), /curl exited 7/)
})

test('CLI: usage errors exit 2 and print no token', () => {
  const script = fileURLToPath(new URL('../quickstart/contract-bind.mjs', import.meta.url))
  const base = ['--wp', 'false', '--site-url', 'http://x', '--out', out()]
  const missing = spawnSync(process.execPath, [script, ...base], { encoding: 'utf8' })
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /--contract is required/)
  const badId = spawnSync(process.execPath, [script, ...base, '--contract', 'nope'], { encoding: 'utf8' })
  assert.equal(badId.status, 2)
  assert.match(badId.stderr, /<slug>\/wp7\/<version>/)
})

// ---------------------------------------------------------------- answers as the real plugin 0.17.4 sends them
// Trimmed copies of answers read from a restored JA Essence 1.0.3 stand (keys and types kept, lists cut).
const REAL = {
  boundBind: {
    ok: true, bound: true, contract: 'ja-essence/wp7/1.0.3', revision: 'b0b9b3280ad43377ef5bae384b198f6402dbdd55f7a8a30462b70625587a1910',
    ids: { 'page-contact': 117, 'page-home-3': 118 },
    warnings: [{ code: 'PRESENTATION_DRIFT', message: 'Theme file changed: wp-content/themes/wp-ja-essence/assets/css/je-detail.css', severity: 'warning' }]
  },
  boundInspect: {
    ok: true, bound: true, contract: 'ja-essence/wp7/1.0.3', revision: 'b0b9b3280ad43377ef5bae384b198f6402dbdd55f7a8a30462b70625587a1910',
    ids: { 'page-contact': 117, 'page-home-3': 118 },
    entities: [
      { key: 'option-blogname', kind: 'option', id: null, language: null, status: null },
      { key: 'page-contact', kind: 'page', id: 117, language: null, status: 'publish' },
      { key: 'page-home-3', kind: 'page', id: 118, language: null, status: 'publish' }
    ],
    slots: { 'site.name': 'JA Essence' }, imageSlots: { 'contact.gallery.image.1': 'wp-content/uploads/2026/10/item-1-3.png' },
    demoTrim: null, sourceLanguage: null, multilingual: null, siteLanguage: null, contractLineage: null, problems: [], missing: [],
    warnings: [
      { code: 'PRESENTATION_DRIFT', message: 'Theme file changed: wp-content/themes/wp-ja-essence/assets/css/je-detail.css', severity: 'warning' },
      { code: 'PRESENTATION_DRIFT', message: 'Theme file changed: wp-content/themes/wp-ja-essence/style.css', severity: 'warning' }
    ]
  },
  // A clean bind carries NO `warnings` key at all, in bind or in inspect.
  cleanBind: { ok: true, bound: true, contract: 'ja-demo/wp7/1.0.1', revision: 'a'.repeat(64), ids: { 'page-home': 5 } },
  cleanInspect: {
    ok: true, bound: true, contract: 'ja-demo/wp7/1.0.1', revision: 'a'.repeat(64), ids: { 'page-home': 5 },
    entities: [{ key: 'option-blogname', kind: 'option', id: null, language: null, status: null }, { key: 'page-home', kind: 'page', id: 5, language: null, status: 'publish' }],
    slots: {}, imageSlots: {}, demoTrim: null, sourceLanguage: null, multilingual: null, siteLanguage: null, contractLineage: null, problems: [], missing: []
  },
  refused: {
    ok: false, error: 'contract_failed', message: 'The restored site does not match the content contract', bound: false, contract: 'ja-essence/wp7/1.0.2',
    problems: [
      'Slot home-2.newsletter.subtext: block newsletter.subtext is not in this pattern',
      'Slot home-2.newsletter.subtext.url: block newsletter.subtext is not in this pattern',
      'Slot layout-1.newsletter.subtext: block newsletter.subtext is not in this pattern'
    ],
    errors: [{ code: 'CONTRACT_FAILED', message: 'Slot home-2.newsletter.subtext: block newsletter.subtext is not in this pattern', field: { slotKey: 'home-2.newsletter.subtext', contentId: null }, severity: 'unrecoverable' }]
  },
  unavailable: {
    ok: false, error: 'contract_unavailable', message: 'This site names a content contract this plugin does not carry: ja-essence/wp7/9.9.9',
    errors: [{ code: 'CONTRACT_FAILED', message: 'This site names a content contract this plugin does not carry: ja-essence/wp7/9.9.9', field: { slotKey: null, contentId: null }, severity: 'unrecoverable' }]
  },
  // The plugin escapes slashes in JSON; a parsed answer reads the same.
  conflict: '{"ok":false,"error":"conflict","message":"This site is already bound to ja-essence\\/wp7\\/1.0.3","errors":[{"code":"CONTRACT_FAILED","message":"This site is already bound to ja-essence\\/wp7\\/1.0.3","field":{"slotKey":null,"contentId":null},"severity":"unrecoverable"}]}'
}

test('real shape: bound with drift warnings (bind carries warnings, inspect carries the entities)', () => {
  const dir = out()
  const r = run({ contract: 'ja-essence/wp7/1.0.3', wp: fakeWp(), post: fakePost({ bind: REAL.boundBind, inspect: REAL.boundInspect }), out: dir })
  assert.equal(r.code, 0)
  const ev = readJson(dir, 'contract-bind.json')
  assert.deepEqual([ev.bound, ev.refused, ev.entities, ev.warnings, ev.warningCodes], [true, false, 3, 2, { PRESENTATION_DRIFT: 2 }])
  assert.match(r.lines[0], /BOUND \(plugin 2\.4\.0\) — 3 entities, 2 warnings \(PRESENTATION_DRIFT 2\)/)
})

test('real shape: bound clean, no warnings key anywhere', () => {
  const dir = out()
  const r = run({ contract: 'ja-demo/wp7/1.0.1', wp: fakeWp(), post: fakePost({ bind: REAL.cleanBind, inspect: REAL.cleanInspect }), out: dir })
  assert.equal(r.code, 0)
  const ev = readJson(dir, 'contract-bind.json')
  assert.deepEqual([ev.bound, ev.entities, ev.warnings, ev.warningCodes], [true, 2, 0, {}])
})

test('real shape: contract_failed is a refusal — exit 3, problems are the plugin\'s strings, no inspect', () => {
  const dir = out()
  const post = fakePost({ bind: REAL.refused })
  const r = run({ contract: 'ja-essence/wp7/1.0.2', wp: fakeWp(), post, out: dir })
  assert.equal(r.code, 3)
  const ev = readJson(dir, 'contract-bind.json')
  assert.deepEqual([ev.refused, ev.bound, ev.error, ev.problems], [true, false, 'contract_failed', REAL.refused.problems])
  assert.equal(post.seen.length, 1)
  assert.deepEqual(readdirSync(dir).sort(), ['bind-answer.json', 'contract-bind.json'])
  assert.equal(r.lines.filter((l) => l.startsWith('  Slot')).length, 3)
})

test('real shape: contract_unavailable is NOT a refusal — exit 1 and the plugin\'s reason is printed', () => {
  const dir = out()
  const r = run({ contract: 'ja-essence/wp7/9.9.9', wp: fakeWp(), post: fakePost({ bind: REAL.unavailable }), out: dir })
  assert.equal(r.code, 1)
  const ev = readJson(dir, 'contract-bind.json')
  assert.deepEqual([ev.refused, ev.bound], [false, false])
  assert.match(ev.error, /contract_unavailable.*does not carry: ja-essence\/wp7\/9\.9\.9/)
  assert.match(r.lines[0], /did not run to an answer/)
})

test('real shape: a second run on a bound site reads the binding through inspect (conflict "already bound to <this contract>")', () => {
  const dir = out()
  const post = fakePost({ bind: REAL.conflict, inspect: REAL.boundInspect })
  const r = run({ contract: 'ja-essence/wp7/1.0.3', wp: fakeWp(), post, out: dir })
  assert.equal(r.code, 0)
  const ev = readJson(dir, 'contract-bind.json')
  assert.deepEqual([ev.bound, ev.alreadyBound, ev.entities, ev.warnings], [true, true, 3, 2])
  assert.equal(post.seen.length, 2)
})

test('real shape: a site bound to ANOTHER contract stays a tool failure, never bound or refused', () => {
  const unavailable = { ok: false, error: 'contract_unavailable', message: 'This site is held to ja-essence/wp7/1.0.3, not ja-essence/wp7/1.0.2' }
  const r = run({ contract: 'ja-essence/wp7/1.0.2', wp: fakeWp(), post: fakePost({ bind: unavailable }) })
  assert.equal(r.code, 1)
  assert.deepEqual([r.evidence.bound, r.evidence.refused, r.evidence.alreadyBound], [false, false, false])
  const other = run({ contract: 'ja-essence/wp7/1.0.2', wp: fakeWp(), post: fakePost({ bind: REAL.conflict }) })
  assert.equal(other.code, 1, 'conflict naming a different contract')
})

// ---------------------------------------------------------------- identity of the artifacts it ran for
const sha = (b) => createHash('sha256').update(b).digest('hex')
/** A pack that readPack accepts: two archives, manifest.json, SHA256SUMS. */
function writePack() {
  const dir = mkdtempSync(path.join(tmpdir(), 'contract-bind-pack-'))
  const manifest = {
    schemaVersion: 'tracy-quickstart/v1', platform: 'wordpress', id: 'ja-demo/wp7', version: '1.0.1', wpVersion: '7.1', theme: { name: 'ja-demo' },
    webroot: { file: 'w.tar.gz', sha256: sha('web') }, database: { file: 'd.sql.gz', sha256: sha('db') }
  }
  writeFileSync(path.join(dir, 'w.tar.gz'), 'web')
  writeFileSync(path.join(dir, 'd.sql.gz'), 'db')
  const m = JSON.stringify(manifest)
  writeFileSync(path.join(dir, 'manifest.json'), m)
  writeFileSync(path.join(dir, 'SHA256SUMS'), `${sha(m)}  manifest.json\n${sha('web')}  w.tar.gz\n${sha('db')}  d.sql.gz\n`)
  return { dir, manifestSha: sha(m) }
}

test('--pack, --theme-zip and a local --plugin zip: contract-bind.json records the pack as restore.json binds it and the zips\' sha256', () => {
  const { dir: pack, manifestSha } = writePack()
  const files = mkdtempSync(path.join(tmpdir(), 'contract-bind-zips-'))
  writeFileSync(path.join(files, 't.zip'), 'theme')
  writeFileSync(path.join(files, 'p.zip'), 'plugin')
  const binding = bindingOf({ pack, themeZip: path.join(files, 't.zip'), plugin: path.join(files, 'p.zip') })
  assert.deepEqual(binding, { pack: { manifest: manifestSha, webrootArchive: sha('web'), databaseArchive: sha('db') }, themeZipSha256: sha('theme'), pluginZipSha256: sha('plugin') })
  const dir = out()
  const post = fakePost({ bind: { ok: true }, inspect: { ok: true, entities: [1] } })
  run({ wp: fakeWp(), post, out: dir, plugin: path.join(files, 'p.zip'), binding })
  assert.deepEqual(readJson(dir, 'contract-bind.json').pack, binding.pack)
  assert.equal(readJson(dir, 'contract-bind.json').themeZipSha256, sha('theme'))
  // a plugin given as a URL cannot be hashed here; no flag, no key
  assert.equal(bindingOf({ plugin: 'https://example.invalid/p.zip' }).pluginZipSha256, null)
  assert.deepEqual(bindingOf({}), {})
})

test('a pack that does not check out is an error, not an identity', () => {
  const { dir } = writePack()
  writeFileSync(path.join(dir, 'w.tar.gz'), 'changed')
  assert.throws(() => bindingOf({ pack: dir }), /SHA256SUMS mismatch/)
})

test('ownWpContent hands wp-content of the restore to the runtime uid through the root runner', () => {
  const calls = []
  const spawn = (cmd, args) => (calls.push([cmd, ...args]), { status: 0, stdout: '', stderr: '' })
  ownWpContent({ runner: 'docker run --user 0:0 img', webroot: '/var/www/html', uid: '33', spawn })
  assert.equal(calls.length, 1)
  assert.match(calls[0][2], /^docker run --user 0:0 img "\$@"$/)
  assert.ok(calls[0].join(' ').includes('chown -R 33:33 "$1"'))
  assert.equal(calls[0].at(-1), '/var/www/html/wp-content')
  assert.throws(() => ownWpContent({ runner: 'r', uid: '0', spawn }), /other than 0/)
  assert.throws(() => ownWpContent({ runner: 'r', spawn: () => ({ status: 1, stdout: '', stderr: 'denied' }) }), /chown of wp-content exited 1/)
})
