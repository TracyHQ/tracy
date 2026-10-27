/**
 * `tracy_design_check` on a site whose container has no browser (every Joomla site: `joomla:6-apache`
 * ships neither node nor chromium): dsh's own browser measures the page instead, and every byte it
 * loads still comes from that ONE site's container, over the container's own curl.
 *
 *   node --test packages/tools/tracy-site-tools/test/design-check-host-browser.test.mjs
 *
 * Three layers: the pure target/command builders, the fallback decision (`measurePage`), and the
 * shipped BROWSER_SCRIPT in host mode run as a real `node -e` process against a FAKE chromium and a
 * FAKE `docker` (real-browser evidence is `tasks/evidence/design-check/`, not this file).
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import { measurePage } from '../src/host/design-check-tool.mjs'
import {
  BROWSER_SCRIPT,
  hostBrowserCommand,
  hostBrowserTarget,
  hostChromeOf,
  parseBrowser
} from '../src/host/exec.mjs'

const execFileP = promisify(execFile)

// ── the pure half ────────────────────────────────────────────────────────────────────────────────

test('host target: the loopback page keeps its address and is served from the container port it named', () => {
  const t = hostBrowserTarget({
    url: 'http://127.0.0.1/about',
    origin: 'http://127.0.0.1',
    container: 'northgate-web-1',
    resolverRule: '',
    via: ''
  })
  assert.deepEqual(t, {
    url: 'http://127.0.0.1/about',
    origin: 'http://127.0.0.1',
    container: 'northgate-web-1',
    via: '127.0.0.1:80'
  })
  assert.equal(
    hostBrowserTarget({
      url: 'http://127.0.0.1:8080/',
      origin: 'http://127.0.0.1:8080',
      container: 'a-web-1',
      resolverRule: '',
      via: ''
    })?.via,
    '127.0.0.1:8080'
  )
})

test('host target: a public-origin route keeps its via; a canonical port is served from the port the rule dials', () => {
  assert.deepEqual(
    hostBrowserTarget({
      url: 'https://acme.tracy.ai/',
      origin: 'https://acme.tracy.ai',
      container: 'acme-web-1',
      resolverRule: '--host-resolver-rules=MAP acme.tracy.ai ~NOTFOUND',
      via: '127.0.0.1:80'
    }),
    {
      url: 'https://acme.tracy.ai/',
      origin: 'https://acme.tracy.ai',
      container: 'acme-web-1',
      via: '127.0.0.1:80'
    }
  )
  assert.equal(
    hostBrowserTarget({
      url: 'http://tracy-site.probe.invalid:51710/',
      origin: 'http://tracy-site.probe.invalid:51710',
      container: 'demowp-web-1',
      resolverRule: '--host-resolver-rules=MAP tracy-site.probe.invalid:51710 127.0.0.1:80',
      via: ''
    })?.via,
    '127.0.0.1:80'
  )
})

test('🔒 host target: anything it cannot pin to the named container loopback is null, never a guess', () => {
  assert.equal(hostBrowserTarget(null), null)
  assert.equal(
    hostBrowserTarget({
      url: 'http://x/',
      origin: 'http://x',
      container: 'x-web-1',
      resolverRule: '--host-resolver-rules=MAP x 10.0.0.5:80',
      via: ''
    }),
    null
  )
  assert.equal(
    hostBrowserTarget({
      url: 'http://127.0.0.1/',
      origin: 'http://127.0.0.1',
      container: 'x-web-1',
      resolverRule: '',
      via: '10.0.0.5:80'
    }),
    null
  )
  assert.equal(
    hostBrowserTarget({
      url: 'http://127.0.0.1/',
      origin: 'http://127.0.0.1',
      container: 'bad name',
      resolverRule: '',
      via: ''
    }),
    null
  )
})

test('host command: dsh node runs the shipped script in styles mode; the route rides in env, never in script text', () => {
  const target = {
    url: 'http://127.0.0.1/',
    origin: 'http://127.0.0.1',
    container: 'northgate-web-1',
    via: '127.0.0.1:80'
  }
  const c = hostBrowserCommand({
    chrome: '/usr/local/bin/tracy-chrome',
    target,
    dockerHost: 'tcp://docker-proxy:2375'
  })
  assert.equal(c.file, process.execPath)
  assert.deepEqual(c.args, ['-e', BROWSER_SCRIPT, 'styles', 'http://127.0.0.1/', 'http://127.0.0.1', ''])
  assert.deepEqual(c.env, {
    TRACY_CHROME: '/usr/local/bin/tracy-chrome',
    TRACY_SERVE_CONTAINER: 'northgate-web-1',
    TRACY_PUBLIC_VIA: '127.0.0.1:80',
    DOCKER_HOST: 'tcp://docker-proxy:2375'
  })
  assert.equal('DOCKER_HOST' in hostBrowserCommand({ chrome: 'c', target, dockerHost: null }).env, false)
})

test('host chrome: the image wrapper, else the OpenDesign env path, else none', () => {
  const has = (set) => (p) => set.includes(p)
  assert.equal(hostChromeOf({}, has(['/usr/local/bin/tracy-chrome'])), '/usr/local/bin/tracy-chrome')
  assert.equal(hostChromeOf({ OD_BROWSER_EXECUTABLE_PATH: '/opt/c' }, has(['/opt/c'])), '/opt/c')
  assert.equal(hostChromeOf({ OD_BROWSER_EXECUTABLE_PATH: '/opt/c' }, has([])), null)
})

// ── the fallback decision ─────────────────────────────────────────────────────────────────────────

const PROBE = {
  href: 'http://127.0.0.1/',
  seen: 3,
  samples: [{ prop: 'color', value: 'rgb(0, 0, 0)', count: 3, where: ['p'] }]
}
const okRun = (probe = PROBE) => ({
  code: 0,
  stdout: `TRACY_BROWSER OK ${probe.href}\n${JSON.stringify(probe)}`,
  stderr: '',
  timedOut: false
})
const noNode = {
  code: 127,
  stdout: '',
  stderr: 'OCI runtime exec failed: exec: "timeout": executable file not found in $PATH',
  timedOut: false
}
const target = {
  url: 'http://127.0.0.1/',
  origin: 'http://127.0.0.1',
  container: 'northgate-web-1',
  resolverRule: '',
  via: ''
}

test('a container with its own browser is measured there, and dsh never starts its own', async () => {
  let host = 0
  const m = await measurePage({
    target,
    runInContainer: async () => okRun(),
    runOnHost: async () => (host++, okRun()),
    hostChrome: '/c'
  })
  assert.deepEqual(m, { ok: true, probe: PROBE, browser: 'site' })
  assert.equal(host, 0)
})

test('🔒 no browser in the container: dsh measures with its own, pinned to that container', async () => {
  /** @type {any[]} */
  const seen = []
  const m = await measurePage({
    target,
    runInContainer: async () => noNode,
    runOnHost: async (t, chrome) => (seen.push([t, chrome]), okRun()),
    hostChrome: '/usr/local/bin/tracy-chrome'
  })
  assert.deepEqual(m, { ok: true, probe: PROBE, browser: 'host' })
  assert.deepEqual(seen, [
    [
      {
        url: 'http://127.0.0.1/',
        origin: 'http://127.0.0.1',
        container: 'northgate-web-1',
        via: '127.0.0.1:80'
      },
      '/usr/local/bin/tracy-chrome'
    ]
  ])
})

test('no browser anywhere: a skip that says both places were looked at', async () => {
  const m = await measurePage({
    target,
    runInContainer: async () => noNode,
    runOnHost: async () => okRun(),
    hostChrome: null
  })
  assert.deepEqual(m, { ok: false, why: 'no browser in this site container, and none in dsh' })
})

test('🔒 the host browser keeps the off-site verdict: a page that left the site is a skip, not a measurement', async () => {
  const m = await measurePage({
    target,
    runInContainer: async () => noNode,
    runOnHost: async () => ({
      code: 0,
      stdout: 'TRACY_BROWSER OFFSITE https://evil.example/',
      stderr: '',
      timedOut: false
    }),
    hostChrome: '/c'
  })
  assert.deepEqual(m, { ok: false, why: 'the page left the site for https://evil.example/' })
})

test('a host browser that did not finish cleanly is a skip, never half a probe', async () => {
  const cut = { ...okRun(), code: 1 }
  const m = await measurePage({
    target,
    runInContainer: async () => noNode,
    runOnHost: async () => cut,
    hostChrome: '/c'
  })
  assert.deepEqual(m, { ok: false, why: 'the browser did not finish cleanly' })
})

// ── BROWSER_SCRIPT in host mode, real process, fake chromium + fake docker ────────────────────────

/**
 * A fake chromium: logs every CDP message it receives, and once navigated pauses the requests named
 * in TRACY_TEST_PAUSE (JSON), then answers the styles probe once every paused request was settled.
 * The probe WAITS for that (an event, not the script's settle timer): answered at once, a runner too
 * loaded to finish the fake `docker` inside the 300 ms settle saw the stylesheet unserved (1 in 3).
 */
const FAKE_CHROMIUM = `#!/usr/bin/env node
const fs=require('fs');
if(process.env.TRACY_TEST_ARGV_LOG)fs.writeFileSync(process.env.TRACY_TEST_ARGV_LOG,process.argv.join('\\n'));
const LOG=process.env.TRACY_TEST_CDP_LOG;const PAUSE=JSON.parse(process.env.TRACY_TEST_PAUSE||'[]');
const FINAL=process.env.TRACY_TEST_FINAL;
const wrAll=(s)=>{const b=Buffer.from(s);let o=0;while(o<b.length){try{o+=fs.writeSync(4,b,o,b.length-o)}catch(e){if(e.code==='EAGAIN')continue;return}}};
const send=(o)=>wrAll(JSON.stringify(o)+'\\0');
let open=0,probe=null;
const onMsg=(m)=>{if(LOG)fs.appendFileSync(LOG,JSON.stringify(m)+'\\n');const reply=(result)=>send({id:m.id,result});switch(m.method){
  case 'Target.createTarget':return reply({targetId:'T'});
  case 'Target.attachToTarget':return reply({sessionId:'S'});
  case 'Page.getFrameTree':return reply({frameTree:{frame:{id:'MF'}}});
  case 'Page.navigate':{reply({frameId:'MF'});PAUSE.forEach((p,i)=>{open++;send({method:'Fetch.requestPaused',sessionId:'S',params:Object.assign({requestId:'r'+i,frameId:'MF',request:{method:'GET',headers:{Accept:'*/*'}}},p)})});return}
  case 'Fetch.fulfillRequest':case 'Fetch.failRequest':case 'Fetch.continueRequest':open--;reply({});if(open===0&&probe){probe();probe=null}return;
  case 'Runtime.evaluate':{const answer=()=>reply({result:{value:{href:FINAL,seen:1,samples:[],open}}});if(open>0){probe=answer;return}return answer()}
  default:return reply({});
}};
let buf=Buffer.alloc(0);const rs=fs.createReadStream(null,{fd:3});rs.on('error',()=>{});
rs.on('data',(d)=>{buf=Buffer.concat([buf,d]);let i;while((i=buf.indexOf(0))!==-1){let m=null;try{m=JSON.parse(buf.slice(0,i))}catch{}buf=buf.slice(i+1);if(m)onMsg(m)}});
`

/** A fake `docker`: logs its argv (one JSON line per call) and answers like `curl -i` would. */
const FAKE_DOCKER = `#!/usr/bin/env node
const fs=require('fs');fs.appendFileSync(process.env.TRACY_TEST_DOCKER_LOG,JSON.stringify(process.argv.slice(2))+'\\n');
process.stdout.write('HTTP/1.1 200 OK\\r\\nContent-Type: text/css\\r\\nContent-Length: 17\\r\\nX-Site: own\\r\\n\\r\\nbody{color:#000}\\n');
`

let dir = ''
test.before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tracy-host-browser-'))
  writeFileSync(join(dir, 'chromium'), FAKE_CHROMIUM)
  writeFileSync(join(dir, 'docker'), FAKE_DOCKER)
  chmodSync(join(dir, 'chromium'), 0o755)
  chmodSync(join(dir, 'docker'), 0o755)
})
test.after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

const ORIGIN = 'http://127.0.0.1'
let seq = 0
/** Run the shipped script as the host command would, with the fakes first on PATH. */
async function hostRun({ pause = [], env = {} } = {}) {
  const n = seq++
  const logs = {
    cdp: join(dir, `cdp-${n}.log`),
    docker: join(dir, `docker-${n}.log`),
    argv: join(dir, `argv-${n}.log`)
  }
  writeFileSync(logs.cdp, '')
  writeFileSync(logs.docker, '')
  const c = hostBrowserCommand({
    chrome: join(dir, 'chromium'),
    target: { url: `${ORIGIN}/`, origin: ORIGIN, container: 'northgate-web-1', via: '127.0.0.1:80' },
    dockerHost: null
  })
  const { stdout } = await execFileP(c.file, [...c.args, '300', '8000', '2000'], {
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      TRACY_TEST_CDP_LOG: logs.cdp,
      TRACY_TEST_DOCKER_LOG: logs.docker,
      TRACY_TEST_ARGV_LOG: logs.argv,
      TRACY_TEST_FINAL: `${ORIGIN}/`,
      TRACY_TEST_PAUSE: JSON.stringify(pause),
      ...c.env,
      ...env
    }
  })
  const lines = (f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  return {
    stdout,
    cdp: lines(logs.cdp),
    docker: lines(logs.docker),
    argv: existsSync(logs.argv) ? readFileSync(logs.argv, 'utf8').split('\n') : []
  }
}

test('🔒 host mode: the page and its stylesheets come from the container own curl, as www-data, with the page Host', async () => {
  const r = await hostRun({
    pause: [
      { resourceType: 'Document', request: { method: 'GET', url: `${ORIGIN}/`, headers: {} } },
      {
        resourceType: 'Stylesheet',
        frameId: 'MF',
        request: { method: 'GET', url: `${ORIGIN}/media/site.css?v=2`, headers: { Accept: 'text/css' } }
      }
    ]
  })
  assert.equal(parseBrowser(r.stdout).ok, true, r.stdout)
  assert.equal(r.docker.length, 2)
  const css = r.docker.find((a) => a.at(-1).endsWith('/media/site.css?v=2'))
  assert.ok(css, JSON.stringify(r.docker))
  assert.deepEqual(css.slice(0, 5), ['exec', '-u', 'www-data', 'northgate-web-1', 'curl'])
  assert.equal(css.at(-1), 'http://127.0.0.1:80/media/site.css?v=2')
  assert.ok(css.includes('Host: 127.0.0.1'))
  const fulfilled = r.cdp.filter((m) => m.method === 'Fetch.fulfillRequest')
  assert.equal(fulfilled.length, 2)
  const f = fulfilled.find((m) => m.params.requestId === 'r1')
  assert.equal(f.params.responseCode, 200)
  assert.equal(Buffer.from(f.params.body, 'base64').toString(), 'body{color:#000}\n')
  assert.ok(f.params.responseHeaders.some((h) => h.name === 'X-Site' && h.value === 'own'))
  assert.ok(!f.params.responseHeaders.some((h) => h.name.toLowerCase() === 'content-length'))
})

test('🔒 host mode: nothing from another origin and nothing but documents and stylesheets is fetched — failed, not continued', async () => {
  const r = await hostRun({
    pause: [
      {
        resourceType: 'Stylesheet',
        request: { method: 'GET', url: 'http://docker-proxy:2375/containers/json', headers: {} }
      },
      { resourceType: 'Image', request: { method: 'GET', url: 'http://10.0.0.5/x.png', headers: {} } },
      { resourceType: 'Image', request: { method: 'GET', url: `${ORIGIN}/logo.png`, headers: {} } },
      { resourceType: 'Script', request: { method: 'GET', url: `${ORIGIN}/app.js`, headers: {} } },
      { resourceType: 'Stylesheet', request: { method: 'POST', url: `${ORIGIN}/x.css`, headers: {} } }
    ]
  })
  assert.equal(parseBrowser(r.stdout).ok, true, r.stdout)
  assert.equal(r.docker.length, 0)
  assert.equal(r.cdp.filter((m) => m.method === 'Fetch.continueRequest').length, 0)
  assert.equal(r.cdp.filter((m) => m.method === 'Fetch.failRequest').length, 5)
})

test('🔒 host mode: a main-frame document off the site still ends OFFSITE', async () => {
  const r = await hostRun({
    pause: [
      { resourceType: 'Document', request: { method: 'GET', url: 'https://evil.example/', headers: {} } }
    ]
  })
  assert.deepEqual(parseBrowser(r.stdout), { ok: false, kind: 'offsite', error: 'https://evil.example/' })
  assert.equal(r.docker.length, 0)
})

test('🔒 host mode: chromium resolves no name, dials only a dead proxy, and runs no page script', async () => {
  const r = await hostRun({ env: { TRACY_RESOLVER_RULE: '--host-resolver-rules=MAP x 127.0.0.1:80' } })
  assert.equal(parseBrowser(r.stdout).ok, true, r.stdout)
  assert.ok(r.argv.includes('--host-resolver-rules=MAP * ~NOTFOUND'), r.argv.join(' '))
  assert.ok(r.argv.includes('--proxy-server=http://127.0.0.1:9'))
  assert.ok(r.argv.includes('--proxy-bypass-list=<-loopback>'))
  assert.ok(
    !r.argv.includes('--host-resolver-rules=MAP x 127.0.0.1:80'),
    'the in-container resolver rule is not used on the host'
  )
  const i = r.cdp.findIndex((m) => m.method === 'Emulation.setScriptExecutionDisabled')
  assert.ok(i !== -1 && r.cdp[i].params.value === true)
  assert.ok(
    i < r.cdp.findIndex((m) => m.method === 'Page.navigate'),
    'scripts are off before the page is asked for'
  )
})

test('🔒 host mode fails closed: a container name that is not one, or no container port', async () => {
  const bad = await hostRun({ env: { TRACY_SERVE_CONTAINER: 'x;rm -rf' } })
  assert.equal(parseBrowser(bad.stdout).kind, 'error')
  assert.deepEqual(bad.argv, [], 'chromium was never started')
  const noPort = await hostRun({ env: { TRACY_PUBLIC_VIA: '' } })
  assert.equal(parseBrowser(noPort.stdout).kind, 'error')
  const wrongMode = await execFileP(
    process.execPath,
    ['-e', BROWSER_SCRIPT, 'dom', `${ORIGIN}/`, ORIGIN, ''],
    {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        TRACY_SERVE_CONTAINER: 'a-web-1',
        TRACY_PUBLIC_VIA: '127.0.0.1:80'
      }
    }
  )
  assert.equal(parseBrowser(wrongMode.stdout).kind, 'error')
})
