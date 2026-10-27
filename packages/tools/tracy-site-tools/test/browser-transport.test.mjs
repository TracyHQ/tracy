import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import { BROWSER_SCRIPT, parseBrowser } from '../src/host/exec.mjs'

const execFileP = promisify(execFile)

// ── a REAL-PIPE transport test for BROWSER_SCRIPT with a FAKE chromium — NOT real-browser evidence ──
//
// SCOPE, stated plainly: the `chromium` spawned here is a FAKE — a small node stub that speaks the
// DevTools pipe protocol on fd 3/4 and hands back a scripted DOM. This is NOT a real browser render;
// it proves nothing about how chromium parses or lays out a page. What IS real and under test is the
// TRANSPORT the shipped BROWSER_SCRIPT runs around it: a real `node -e` process, a real OS pipe to
// execFile (the shape dockerExec runs), the real flush-before-exit, the real per-call profile dir and
// process group. That is the one thing point 1 is about — process.exit dropping a large DOM stdout had
// only buffered — which the vm fakes in exec.test.mjs cannot show. Real chromium rendering is proven
// only by exec-fixture.mjs against a cached image. maxBuffer=16MiB matches the host's page.text.

/** A fake `chromium` executable: reads CDP on fd 3, writes on fd 4, hands back a scripted DOM. */
const FAKE_CHROMIUM = `#!/usr/bin/env node
const fs=require('fs');
const prof=(process.argv.find(a=>a.startsWith('--user-data-dir='))||'').slice('--user-data-dir='.length);
if(process.env.TRACY_TEST_PROFILE_LOG&&prof){try{fs.appendFileSync(process.env.TRACY_TEST_PROFILE_LOG,prof+'\\n')}catch{}}
if(process.env.TRACY_TEST_ARGV_LOG){try{fs.writeFileSync(process.env.TRACY_TEST_ARGV_LOG,process.argv.join('\\n'))}catch{}}
if(process.env.TRACY_TEST_DIE==='1')process.exit(0); // an early-dying chromium: the pipe closes at once
// The DOM arrives as a FILE PATH, never inline: Linux MAX_ARG_STRLEN (~128KiB) caps each env string,
// so a >256KiB payload in an env var makes execve return E2BIG. Read the fixture file the host wrote.
const DOM=process.env.TRACY_TEST_DOM_FILE?fs.readFileSync(process.env.TRACY_TEST_DOM_FILE,'utf8'):'<html></html>';
const FINAL=process.env.TRACY_TEST_FINAL||'about:blank';
const wrAll=(str)=>{const b=Buffer.from(str);let off=0;while(off<b.length){try{off+=fs.writeSync(4,b,off,b.length-off)}catch(e){if(e.code==='EAGAIN')continue;return}}};
const send=(o)=>wrAll(JSON.stringify(o)+'\\0');
const onMsg=(m)=>{const reply=(result)=>send({id:m.id,result});switch(m.method){
  case 'Target.createTarget':return reply({targetId:'T'});
  case 'Target.attachToTarget':return reply({sessionId:'S'});
  case 'Page.enable':return reply({});
  case 'Page.getFrameTree':return reply({frameTree:{frame:{id:'MF'}}});
  case 'Fetch.enable':return reply({});
  case 'Fetch.continueRequest':case 'Fetch.failRequest':return reply({});
  case 'Page.navigate':return reply({frameId:'MF'});
  case 'Runtime.evaluate':{const e=m.params.expression;const value=e.includes('outerHTML')?JSON.stringify({href:FINAL,html:DOM}):FINAL;return reply({result:{value}});}
  case 'Page.captureScreenshot':return reply({data:Buffer.from('PNG').toString('base64')});
  default:return reply({});
}};
let buf=Buffer.alloc(0);const rs=fs.createReadStream(null,{fd:3});rs.on('error',()=>{});
rs.on('data',(d)=>{buf=Buffer.concat([buf,d]);let i;while((i=buf.indexOf(0))!==-1){let m=null;try{m=JSON.parse(buf.slice(0,i))}catch{}buf=buf.slice(i+1);if(m)onMsg(m)}});
`

let dir = ''
let fakeBin = ''
let domSeq = 0
test.before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tracy-browser-transport-'))
  fakeBin = join(dir, 'chromium')
  writeFileSync(fakeBin, FAKE_CHROMIUM)
  chmodSync(fakeBin, 0o755)
})
test.after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

const ORIGIN = 'http://127.0.0.1:9'
const URL_ = 'http://127.0.0.1:9/'

/** Run the shipped BROWSER_SCRIPT with the fake chromium on PATH, as the host would via execFile. */
function render({ dom, extraEnv = {}, mode = 'dom', file = '' } = {}) {
  const env = {
    ...process.env,
    PATH: `${dir}:${process.env.PATH}`,
    TRACY_TEST_FINAL: URL_,
    ...extraEnv
  }
  if (dom !== undefined) {
    // The DOM travels on a FILE PATH, never inline in an env var: Linux MAX_ARG_STRLEN (~128KiB) caps
    // each env string, so a >256KiB payload in TRACY_TEST_DOM makes execve return E2BIG (Mac's larger
    // limit hides it). A uniquely-named fixture under the existing test dir keeps concurrent renders
    // from colliding; test.after removes the dir. The byte-for-byte round-trip is unchanged — only the
    // hand-off from host to fake chromium moves from env to file.
    const domFile = join(dir, `dom-${process.pid}-${domSeq++}.html`)
    writeFileSync(domFile, dom)
    env.TRACY_TEST_DOM_FILE = domFile
  }
  return execFileP(process.execPath, ['-e', BROWSER_SCRIPT, mode, URL_, ORIGIN, file, '20', '4000', '2000'], {
    // fast, quiet, and the DOM behind a file path (never on argv, matching the transport's own contract).
    env,
    maxBuffer: 16 * 1024 * 1024
  })
}

test('🔒 a >256KiB DOM survives the pipe intact — process.exit does not truncate the OK body', async () => {
  // A big head, then the end marker LAST: if the flush were dropped, the tail (the marker) is what a
  // ~64KiB pipe truncation would lose first. The whole thing must come back.
  const marker = '<!--TRACY-END-OF-DOCUMENT-MARKER-->'
  const dom = `<html><body>${'x'.repeat(300 * 1024)}${marker}</body></html>`
  assert.ok(Buffer.byteLength(dom) > 256 * 1024)
  const { stdout } = await render({ dom })
  const parsed = parseBrowser(stdout)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.finalUrl, URL_)
  assert.ok(parsed.dom.endsWith(`${marker}</body></html>`), 'the tail of a large DOM must not be cut off')
  assert.equal(parsed.dom, dom, 'the DOM comes back byte-for-byte, not truncated')
})

test('a modest DOM round-trips and exits 0', async () => {
  const { stdout } = await render({ dom: '<html><body>hello</body></html>' })
  assert.deepEqual(parseBrowser(stdout), { ok: true, finalUrl: URL_, dom: '<html><body>hello</body></html>' })
})

test('🔒 concurrent runs (fake-CDP stubs) each use a UNIQUE profile dir and clean it up — no shared state', async () => {
  const log = join(dir, 'profiles.log')
  writeFileSync(log, '')
  const N = 6
  const outs = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      render({ dom: `<html>site-${i}</html>`, extraEnv: { TRACY_TEST_PROFILE_LOG: log } })
    )
  )
  // every concurrent render returned its OWN document — no cross-talk.
  outs.forEach(({ stdout }, i) => {
    const p = parseBrowser(stdout)
    assert.equal(p.ok, true)
    assert.equal(p.dom, `<html>site-${i}</html>`)
  })
  const profiles = readFileSync(log, 'utf8').split('\n').filter(Boolean)
  assert.equal(profiles.length, N)
  assert.equal(new Set(profiles).size, N, 'each invocation got a distinct --user-data-dir')
  for (const p of profiles) assert.ok(!existsSync(p), `profile ${p} must be removed on exit`)
})

test('🔒 an early-dying chromium yields NOCHROME and exits cleanly — no unhandled EPIPE crash', async () => {
  // The pipe closes before any CDP reply; the script must report NOCHROME, not throw on the write.
  const { stdout } = await render({ extraEnv: { TRACY_TEST_DIE: '1' } })
  const parsed = parseBrowser(stdout)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.kind, 'no-browser')
})

test('🔒 a TRACY_RESOLVER_RULE env value becomes a chromium launch flag (canonical-port routing)', async () => {
  // #154: the host passes the one host-resolver rule as an env value; the script must add it to
  // chromium's own flags so the canonical public authority routes back onto the container loopback.
  const argvLog = join(dir, 'argv.log')
  const rule = '--host-resolver-rules=MAP tracy-site.probe.invalid:51710 127.0.0.1:80'
  const { stdout } = await render({
    dom: '<html></html>',
    extraEnv: { TRACY_RESOLVER_RULE: rule, TRACY_TEST_ARGV_LOG: argvLog }
  })
  assert.equal(parseBrowser(stdout).ok, true)
  const flags = readFileSync(argvLog, 'utf8').split('\n')
  assert.ok(flags.includes(rule), `chromium was not launched with the resolver rule; got: ${flags.join(' ')}`)
})

test('a render with NO resolver rule launches chromium without a host-resolver flag', async () => {
  const argvLog = join(dir, 'argv-none.log')
  const { stdout } = await render({ dom: '<html></html>', extraEnv: { TRACY_TEST_ARGV_LOG: argvLog } })
  assert.equal(parseBrowser(stdout).ok, true)
  const flags = readFileSync(argvLog, 'utf8').split('\n')
  assert.ok(!flags.some((f) => f.startsWith('--host-resolver-rules=')), 'no resolver flag when none is given')
})

test('shot mode: on-origin, the PNG is written and OK carries the final URL', async () => {
  const shotFile = join(dir, 'shot.png')
  const { stdout } = await render({ mode: 'shot', file: shotFile, dom: '<html></html>' })
  assert.deepEqual(parseBrowser(stdout), { ok: true, finalUrl: URL_, dom: '' })
  assert.ok(existsSync(shotFile))
})
