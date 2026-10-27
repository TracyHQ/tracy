/**
 * `PROBE_SCRIPT` over a REAL pipe with a FAKE chromium (a node stub speaking CDP on fd 3/4) — the
 * transport is real (`node -e`, the two extra fds, flush before exit, the process group); the browser
 * is not. Real rendering is proven only on a stand.
 *
 *   node --test packages/site/tracy-site-build-core/test/design-probe.test.mjs
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

import { parseStyles, PROBE_SCRIPT } from '../src/host/design-probe.mjs'

const execFileP = promisify(execFile)

const FAKE_CHROMIUM = `#!/usr/bin/env node
const fs=require('fs');
if(process.env.TRACY_TEST_DIE==='1')process.exit(0);
const wrAll=(str)=>{const b=Buffer.from(str);let off=0;while(off<b.length){try{off+=fs.writeSync(4,b,off,b.length-off)}catch(e){if(e.code==='EAGAIN')continue;return}}};
const send=(o)=>wrAll(JSON.stringify(o)+'\\0');
const onMsg=(m)=>{const reply=(result)=>send({id:m.id,result});switch(m.method){
  case 'Target.createTarget':return reply({targetId:'T'});
  case 'Target.attachToTarget':return reply({sessionId:'S'});
  case 'Page.enable':return reply({});
  case 'Page.navigate':return reply(process.env.TRACY_TEST_NAV_ERR?{frameId:'MF',errorText:process.env.TRACY_TEST_NAV_ERR}:{frameId:'MF'});
  case 'Runtime.evaluate':return reply({result:{value:JSON.parse(process.env.TRACY_TEST_PROBE||'null')}});
  default:return reply({});
}};
let buf=Buffer.alloc(0);const rs=fs.createReadStream(null,{fd:3});rs.on('error',()=>{});
rs.on('data',(d)=>{buf=Buffer.concat([buf,d]);let i;while((i=buf.indexOf(0))!==-1){let m=null;try{m=JSON.parse(buf.slice(0,i))}catch{}buf=buf.slice(i+1);if(m)onMsg(m)}});
`

let dir = ''
let fake = ''
test.before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tracy-design-probe-'))
  fake = join(dir, 'chromium')
  writeFileSync(fake, FAKE_CHROMIUM)
  chmodSync(fake, 0o755)
})
test.after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

const probe = (env = {}) =>
  execFileP(process.execPath, ['-e', PROBE_SCRIPT, fake, 'http://127.0.0.1:9/', '20', '4000'], {
    env: { ...process.env, ...env },
    maxBuffer: 16 * 1024 * 1024
  })

test('the probe evaluates STYLE_PROBE in the page and hands back the samples after OK <url>', async () => {
  const value = {
    href: 'http://127.0.0.1:9/',
    seen: 3,
    samples: [{ prop: 'color', value: 'rgb(1, 2, 3)', count: 3, where: ['p'] }]
  }
  const { stdout } = await probe({ TRACY_TEST_PROBE: JSON.stringify(value) })
  const r = parseStyles(stdout)
  assert.equal(r.ok, true)
  assert.equal(r.finalUrl, 'http://127.0.0.1:9/')
  assert.deepEqual(r.probe, value)
})

test('a navigation error, a probe that returns nothing, and a chromium that dies are each named, never a blank OK', async () => {
  const nav = parseStyles(
    (await probe({ TRACY_TEST_NAV_ERR: 'net::ERR_CONNECTION_REFUSED', TRACY_TEST_PROBE: 'null' })).stdout
  )
  assert.deepEqual(nav, { ok: false, kind: 'error', error: 'net::ERR_CONNECTION_REFUSED' })
  const empty = parseStyles((await probe({ TRACY_TEST_PROBE: 'null' })).stdout)
  assert.equal(empty.ok, false)
  assert.match(empty.error, /returned nothing/)
  const died = await probe({ TRACY_TEST_DIE: '1' }).catch((e) => e)
  const out = parseStyles(died.stdout ?? '')
  assert.equal(out.ok, false)
  assert.equal(out.kind, 'no-browser')
})

test('parseStyles refuses a payload without samples and reads the markers', () => {
  assert.equal(parseStyles('TRACY_STYLES OK http://x/\n{"href":"http://x/"}').ok, false)
  assert.deepEqual(parseStyles('TRACY_STYLES NOCHROME spawn ENOENT'), {
    ok: false,
    kind: 'no-browser',
    error: 'spawn ENOENT'
  })
  assert.deepEqual(parseStyles(''), { ok: false, kind: 'error', error: 'the probe wrote nothing' })
})
