/**
 * Intake (plan §4.10, §11 G4.2): what a lane left in staging reaches the read-only snapshot only as
 * regular files of the allowed kinds, with no known secret in any spelling.
 */
import assert from 'node:assert/strict'
import {
  appendFileSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { cliTokens, cookieValues, intake, needleForms, scanText } from '../qa/lib/intake.mjs'
import { removeTree } from '../qa/lib/rerun.mjs'

const tmps = []
after(() => {
  for (const d of tmps) removeTree(d)
})
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'qa-intake-'))
  tmps.push(d)
  return d
}

const COOKIE = `v1.${Buffer.from('{"email":"a@sonnet.qa.tracy.test","exp":1}').toString('base64url')}.S1gnatureXyz`
const PLAIN_COOKIE = 'plain-cookie-value-0123456789abcdef'
const CODEX_TOKEN = 'codex-refresh-token-ABCDEFGHIJKLMNOP'
const CLAUDE_TOKEN = 'claude-oauth-token-0123456789ZYXWVU'

function fixture() {
  const root = tmp()
  const staging = join(root, 'staging')
  mkdirSync(join(staging, 'nested'), { recursive: true })
  const ok = (name, text) => writeFileSync(join(staging, name), text)
  ok('pr7-k1.test.mjs', "import { test } from 'node:test'\ntest('reads the page', () => {})\n")
  ok('result.json', '{"caseId":"pr7-k1"}\n')
  ok('notes.md', 'Trang m\u1edbi \u0111\u00e3 c\u00f3.\n') // Vietnamese is fine outside code files
  ok('nested/helper.mjs', 'export const x = 1\n')
  ok('observe.sh', '#!/bin/sh\necho ok\n')
  // refused
  symlinkSync('/etc/hosts', join(staging, 'link.txt'))
  symlinkSync('/etc', join(staging, 'linkdir'))
  ok('original.txt', 'hard\n')
  linkSync(join(staging, 'original.txt'), join(staging, 'hard.txt'))
  ok('package.json', '{}\n')
  ok('tsconfig.json', '{}\n')
  ok('vite.config.mjs', 'export default {}\n')
  ok('.npmrc', 'registry=x\n')
  mkdirSync(join(staging, '.hidden'))
  ok('.hidden/in.mjs', 'export {}\n')
  ok('big.txt', 'x'.repeat(300 * 1024))
  ok('image.png', 'png')
  ok('cookie-raw.mjs', `const c = '${PLAIN_COOKIE}'\n`)
  ok('cookie-b64.txt', `blob: xx${Buffer.from(`A${PLAIN_COOKIE}`).toString('base64')}\n`)
  ok('cookie-hex.json', JSON.stringify({ h: Buffer.from(PLAIN_COOKIE).toString('hex') }))
  ok('session.md', `token ${COOKIE.slice(0, 3)}abcdefghij.klmnopqrst\n`)
  ok('jwt.txt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlLXg\n')
  ok('apikey.mjs', "const k = 'sk-proj-abcdefghijklmnop123'\n")
  ok('codex.txt', `refresh ${CODEX_TOKEN}\n`)
  ok('claude.mjs', `// ${Buffer.from(CLAUDE_TOKEN).toString('base64url')}\n`)
  ok('vn.test.mjs', "// Ki\u1ec3m tra trang\ntest('x', () => {})\n")
  // secrets on disk, outside staging
  const cookies = join(root, 'cookies.jsonl')
  writeFileSync(
    cookies,
    `${JSON.stringify({ t: 'cookie', value: PLAIN_COOKIE })}\n${JSON.stringify({ t: 'cookie', value: COOKIE })}\n`
  )
  const codexHome = join(root, 'codex')
  mkdirSync(codexHome)
  writeFileSync(
    join(codexHome, 'auth.json'),
    JSON.stringify({ tokens: { refresh_token: CODEX_TOKEN, id: 'short' } })
  )
  const claudeFile = join(root, 'claude-token')
  writeFileSync(claudeFile, `${CLAUDE_TOKEN}\n`)
  return { root, staging, cookies, codexHome, claudeFile }
}

test('G4.2 every refused kind stays out of the snapshot, with its reason', () => {
  const f = fixture()
  const needles = [
    ...cookieValues([f.cookies]),
    ...cliTokens({ codexHome: f.codexHome, claudeTokenFile: f.claudeFile })
  ]
  assert.ok(needles.includes(CODEX_TOKEN) && needles.includes(CLAUDE_TOKEN) && needles.includes(PLAIN_COOKIE))
  assert.ok(!needles.includes('short'), 'short strings of auth.json are not needles')
  const snap = join(f.root, 'snap')
  const out = intake({ staging: f.staging, snapshotDir: snap, needles })
  const accepted = out.accepted.map((a) => a.path).sort()
  assert.deepEqual(accepted, [
    'nested/helper.mjs',
    'notes.md',
    'observe.sh',
    'pr7-k1.test.mjs',
    'result.json'
  ])
  const why = Object.fromEntries(out.rejected.map((r) => [r.path, r.reason]))
  assert.deepEqual(why, {
    '.hidden': 'dotfile',
    '.npmrc': 'dotfile',
    'apikey.mjs': 'api-key',
    'big.txt': 'too-large',
    'claude.mjs': 'secret',
    'codex.txt': 'secret',
    'cookie-b64.txt': 'secret',
    'cookie-hex.json': 'secret',
    'cookie-raw.mjs': 'secret',
    'hard.txt': 'hardlink',
    'image.png': 'extension',
    'jwt.txt': 'jwt',
    'link.txt': 'not-regular',
    linkdir: 'not-regular',
    'original.txt': 'hardlink',
    'package.json': 'forbidden-name',
    'session.md': 'session-token',
    'tsconfig.json': 'forbidden-name',
    'vite.config.mjs': 'forbidden-name',
    'vn.test.mjs': 'vietnamese'
  })
  // Reasons never carry the secret itself.
  assert.ok(!JSON.stringify(out).includes(PLAIN_COOKIE))
  // The snapshot holds exactly the accepted files, read-only.
  const listed = []
  const walk = (d, p = '') => {
    for (const e of readdirSync(d, { withFileTypes: true }))
      e.isDirectory() ? walk(join(d, e.name), `${p}${e.name}/`) : listed.push(`${p}${e.name}`)
  }
  walk(snap)
  assert.deepEqual(listed.sort(), accepted)
  assert.throws(() => writeFileSync(join(snap, 'notes.md'), 'x'), /EACCES|EPERM/)
  assert.throws(() => writeFileSync(join(snap, 'new.txt'), 'x'), /EACCES|EPERM/)
})

test('G4.2 a file written to staging after the snapshot never reaches it', () => {
  const f = fixture()
  const snap = join(f.root, 'snap')
  const out = intake({ staging: f.staging, snapshotDir: snap })
  const before = out.accepted.find((a) => a.path === 'pr7-k1.test.mjs')
  appendFileSync(join(f.staging, 'pr7-k1.test.mjs'), `// ${PLAIN_COOKIE}\n`)
  writeFileSync(join(f.staging, 'late.test.mjs'), 'late\n')
  const text = readFileSync(join(snap, 'pr7-k1.test.mjs'), 'utf8')
  assert.ok(!text.includes(PLAIN_COOKIE))
  assert.equal(readdirSync(snap).includes('late.test.mjs'), false)
  assert.equal(before.size, Buffer.byteLength(text))
})

test('G4.2 more than 40 files: the whole PR is refused', () => {
  const root = tmp()
  const staging = join(root, 's')
  mkdirSync(staging)
  for (let i = 0; i < 41; i++) writeFileSync(join(staging, `pr1-k${i}.test.mjs`), 'x\n')
  const out = intake({ staging, snapshotDir: join(root, 'snap') })
  assert.equal(out.accepted.length, 0)
  assert.equal(out.rejected.length, 41)
  assert.ok(out.rejected.every((r) => r.reason === 'too-many-files'))
  const at40 = join(root, 's40')
  mkdirSync(at40)
  for (let i = 0; i < 40; i++) writeFileSync(join(at40, `pr1-k${i}.test.mjs`), 'x\n')
  assert.equal(intake({ staging: at40, snapshotDir: join(root, 'snap40') }).accepted.length, 40)
})

test('G4.2 the scanner finds a value base64-encoded at any offset, and hex in either case', () => {
  const needle = 'secret-value-for-the-scan-42'
  for (let pre = 0; pre < 3; pre++) {
    const blob = Buffer.concat([Buffer.alloc(pre, 7), Buffer.from(needle), Buffer.from('tail')])
    assert.equal(scanText(blob.toString('base64'), { needles: [needle] }), 'secret', `offset ${pre}`)
    assert.equal(scanText(blob.toString('base64url'), { needles: [needle] }), 'secret', `url offset ${pre}`)
  }
  assert.equal(scanText(Buffer.from(needle).toString('hex').toUpperCase(), { needles: [needle] }), 'secret')
  assert.equal(scanText('nothing to see here', { needles: [needle] }), null)
  assert.ok(needleForms(needle).length >= 5)
  assert.equal(scanText('Ki\u1ec3m tra', { code: true }), 'vietnamese')
  assert.equal(scanText('// Ki\u1ec3m tra\nconst a = 1', { code: true }), 'vietnamese')
  assert.equal(scanText("assert.equal(label, 'Ki\u1ec3m tra')", { code: true }), null)
  assert.equal(scanText('Ki\u1ec3m tra', { code: false }), null)
})

test('G4.2 an existing snapshot folder is never reused', () => {
  const f = fixture()
  const snap = join(f.root, 'snap')
  mkdirSync(snap)
  assert.throws(() => intake({ staging: f.staging, snapshotDir: snap }), /already exists/)
})
