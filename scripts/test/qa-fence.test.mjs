// Fast tests for the Studio fence (G2): profile rendering, the egress proxy, and the resolver preload.
// The slow half (real sandbox-exec + headless Chrome) runs through `node scripts/qa/fence/fence-check.mjs --mock`.
import assert from 'node:assert/strict'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createEgressProxy } from '../qa/fence/egress-proxy.mjs'
import { LANES, KINDS, laneLayout, profileFor, renderProfile } from '../qa/fence/render.mjs'

const RESOLVE = fileURLToPath(new URL('../qa/testlib/resolve.mjs', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'qa-fence-test-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

const layoutOf = (lane) =>
  laneLayout({
    qaHome: '/Users/x/TCH-local/qa',
    worktrees: '/Users/x/TCH-worktrees',
    runId: '20261003a',
    lane,
    nodeDir: '/opt/node',
    cliBins: ['/opt/claude'],
    realpath: false
  })

/** Every `(subpath "…")` / `(literal "…")` inside the top-level `(allow <op> …)` forms whose op matches. */
function pathsAllowed(text, op) {
  const out = []
  const head = `(allow ${op.replaceAll('\\', '')}`
  let i = text.indexOf(head)
  while (i !== -1) {
    let depth = 0
    let j = i
    for (; j < text.length; j++) {
      if (text[j] === '"') j = text.indexOf('"', j + 1)
      else if (text[j] === '(') depth++
      else if (text[j] === ')' && --depth === 0) break
    }
    for (const p of text.slice(i, j).matchAll(/\((?:subpath|literal) "([^"]+)"\)/g)) out.push(p[1])
    i = text.indexOf(head, j)
  }
  return out
}

describe('profile template', () => {
  test('three lanes x three kinds render, each with the fixed base rules', () => {
    assert.deepEqual(LANES, ['sonnet', 'sol', 'verify'])
    assert.deepEqual(KINDS, ['chrome', 'cli', 'test'])
    for (const lane of LANES) {
      for (const kind of KINDS) {
        const { text } = profileFor({ lane, kind, layout: layoutOf(lane) })
        assert.match(text, /^\(version 1\)\n\(allow default\)/)
        assert.match(text, /\n\(deny file-read\* file-write\*\)\n/)
        assert.match(text, /\n\(deny network\*\)\n/)
        assert.match(text, /\(deny process-info\* \(target others\)\)/)
        assert.match(text, /\(deny signal \(target others\)\)/)
        assert.match(text, /\(deny mach-lookup \(global-name "com.apple.pasteboard.1"\)\)/)
        assert.doesNotMatch(text, /\{\{|\}\}/, `${lane}/${kind} left a placeholder`)
        assert.doesNotMatch(text, /\(subpath "\/Users"\)/)
      }
    }
  })

  test('network: each kind gets exactly the ports of the §3.2 table, per lane', () => {
    const expected = {
      sonnet: { cdp: 9236, proxy: 36900 },
      sol: { cdp: 9237, proxy: 36901 },
      verify: { cdp: 9238, proxy: 36901 }
    }
    for (const lane of LANES) {
      const { cdp, proxy } = expected[lane]
      const out = (kind) =>
        [
          ...profileFor({ lane, kind, layout: layoutOf(lane) }).text.matchAll(
            /\(allow network-outbound \(remote ip "localhost:(\d+)"\)\)/g
          )
        ]
          .map((m) => Number(m[1]))
          .sort()
      assert.deepEqual(out('chrome'), [36080])
      assert.deepEqual(out('cli'), [36080, cdp, proxy].sort())
      assert.deepEqual(out('test'), [36080, cdp].sort())
      const chrome = profileFor({ lane, kind: 'chrome', layout: layoutOf(lane) }).text
      assert.match(
        chrome,
        new RegExp(`\\(allow network-bind network-inbound \\(local ip "localhost:${cdp}"\\)\\)`)
      )
      for (const kind of ['cli', 'test']) {
        assert.doesNotMatch(
          profileFor({ lane, kind, layout: layoutOf(lane) }).text,
          /network-inbound|network-bind/
        )
      }
    }
  })

  test('files: chrome, cli and test read and write only their own column', () => {
    const L = layoutOf('sol')
    const chrome = profileFor({ lane: 'sol', kind: 'chrome', layout: L }).text
    const cli = profileFor({ lane: 'sol', kind: 'cli', layout: L }).text
    const tst = profileFor({ lane: 'sol', kind: 'test', layout: L }).text

    // Chrome: the app, /Library minus Keychains, its own dir, the staging tree. Never the source tree.
    assert.ok(pathsAllowed(chrome, 'file-read\\*').includes('/Applications/Google Chrome.app'))
    assert.ok(pathsAllowed(chrome, 'file-read\\*').includes('/Library'))
    assert.match(chrome, /\(deny file-read\* \(subpath "\/Library\/Keychains"\)\)/)
    assert.ok(pathsAllowed(chrome, 'file-read\\*').includes(L.staging))
    assert.ok(!pathsAllowed(chrome, 'file-read\\*').includes(L.src))
    assert.deepEqual(
      pathsAllowed(chrome, 'file-write\\*').filter((p) => !p.startsWith('/dev/')),
      [L.chromeDir]
    )

    // CLI: source, staging, PR dir, lane key, node, CLI binaries, skills; writes the PR test dir and its home.
    const cliRead = pathsAllowed(cli, 'file-read\\*')
    for (const p of [L.src, L.staging, L.prDir, L.laneKey, L.nodeDir, '/opt/claude', L.skills]) {
      assert.ok(cliRead.includes(p), `cli must read ${p}`)
    }
    assert.ok(!cliRead.includes(L.bases[0]), 'cli must not read the parent-commit trees')
    assert.ok(!cliRead.includes('/Applications/Google Chrome.app'))
    assert.deepEqual(
      pathsAllowed(cli, 'file-write\\*')
        .filter((p) => !p.startsWith('/dev/'))
        .sort(),
      [L.prTestDir, L.cliHome].sort()
    )

    // test: like the CLI plus the parent-commit trees; writes results, its own tmp and its own test
    // folder (scratch files beside the tests); no CLI home.
    const tRead = pathsAllowed(tst, 'file-read\\*')
    for (const p of [L.src, ...L.bases, L.staging, L.laneKey, L.nodeDir])
      assert.ok(tRead.includes(p), `test must read ${p}`)
    assert.ok(!tRead.includes(L.cliHome))
    assert.deepEqual(
      pathsAllowed(tst, 'file-write\\*')
        .filter((p) => !p.startsWith('/dev/'))
        .sort(),
      [L.results, L.testTmp, L.prTestDir].sort()
    )
  })

  test('test/ and tests/ inside the product trees are denied, root-level ones included', () => {
    const L = layoutOf('verify')
    const text = profileFor({ lane: 'verify', kind: 'test', layout: L }).text
    const regexes = [...text.matchAll(/\(deny file-read\* \(regex #"([^"]+)"\)\)/g)].map(
      (m) => new RegExp(m[1])
    )
    assert.ok(regexes.length >= 1)
    const denied = (p) => regexes.some((r) => r.test(p))
    assert.ok(denied(`${L.src}/test/a.test.mjs`))
    assert.ok(denied(`${L.src}/apps/tracy-web/test/x.mjs`))
    assert.ok(denied(`${L.bases[1]}/packages/a/b/tests/y.mjs`))
    assert.ok(!denied(`${L.src}/apps/tracy-web/src/testing.js`))
    assert.ok(!denied(`${L.src}/contest/a.js`))
    assert.ok(!denied(`${L.staging}/test/a.mjs`))
  })

  test('lanes do not see each other', () => {
    const a = profileFor({ lane: 'sonnet', kind: 'cli', layout: layoutOf('sonnet') }).text
    const b = layoutOf('sol')
    for (const p of [b.staging, b.prDir, b.laneKey, b.cliHome, b.chromeDir, b.results]) {
      assert.ok(!a.includes(`"${p}"`), `sonnet cli profile mentions sol path ${p}`)
    }
  })

  test('render writes the profile under r/<runId>/fence and returns its sha256', () => {
    const outDir = join(scratch, 'r', '20261003a', 'fence')
    const r = renderProfile({ lane: 'sonnet', kind: 'test', layout: layoutOf('sonnet'), outDir })
    assert.equal(r.file, join(outDir, 'sonnet-test.sb'))
    const body = readFileSync(r.file)
    assert.equal(r.sha256, createHash('sha256').update(body).digest('hex'))
  })

  test('paths that would break out of an SBPL string are refused', () => {
    for (const bad of ['/tmp/a"b', '/tmp/a\nb', 'relative/path', '/tmp/a\\b']) {
      const L = { ...layoutOf('sol'), staging: bad }
      assert.throws(() => profileFor({ lane: 'sol', kind: 'cli', layout: L }), /path/)
    }
  })

  test('the chrome dir stays short enough for Chrome socket paths', () => {
    for (const lane of LANES) assert.ok(layoutOf(lane).chromeDir.length <= 40, layoutOf(lane).chromeDir)
  })
})

// ---------------------------------------------------------------------------------------------------
// egress proxy

/** Send raw bytes to the proxy, resolve with the first chunk of the reply (or '' on close). */
function rawRequest(port, text) {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(text))
    let buf = ''
    s.on('data', (d) => {
      buf += d
      if (buf.includes('\r\n\r\n')) {
        resolve({ head: buf, socket: s })
      }
    })
    s.on('end', () => resolve({ head: buf, socket: s }))
    s.on('error', reject)
  })
}

async function withProxy(opts, fn) {
  const upstream = net.createServer((c) => c.pipe(c)) // echo
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  const logFile = join(scratch, `proxy-${Math.random().toString(36).slice(2)}.jsonl`)
  const proxy = createEgressProxy({
    port: 0,
    allow: ['api.anthropic.com'],
    logFile,
    resolveUpstream: () => ({ host: '127.0.0.1', port: upstream.address().port }),
    ...opts
  })
  await proxy.listening
  try {
    await fn({ proxy, port: proxy.port, logFile })
  } finally {
    await proxy.close()
    upstream.close()
  }
}

const connectLine = (authority) => `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`

describe('egress proxy', () => {
  test('tunnels CONNECT to an allowed host on 443, and logs it', async () => {
    await withProxy({}, async ({ port, logFile }) => {
      const { head, socket } = await rawRequest(port, connectLine('api.anthropic.com:443'))
      assert.match(head, /^HTTP\/1\.1 200/)
      const echoed = await new Promise((r) => {
        socket.once('data', (d) => r(String(d)))
        socket.write('ping')
      })
      assert.equal(echoed, 'ping')
      socket.destroy()
      await new Promise((r) => setTimeout(r, 50))
      const lines = readFileSync(logFile, 'utf8').trim().split('\n').map(JSON.parse)
      assert.ok(lines.some((l) => l.event === 'allow' && l.target === 'api.anthropic.com:443'))
    })
  })

  const refused = {
    'host not on the list': connectLine('evil.example.com:443'),
    'a sub-domain of an allowed host': connectLine('x.api.anthropic.com:443'),
    'bare IPv4': connectLine('1.1.1.1:443'),
    'bare IPv6': connectLine('[::1]:443'),
    'port other than 443': connectLine('api.anthropic.com:80'),
    'no port': connectLine('api.anthropic.com'),
    'upper-case spelling': connectLine('API.anthropic.com:443'),
    'trailing dot': connectLine('api.anthropic.com.:443'),
    'userinfo in authority': connectLine('user@api.anthropic.com:443'),
    'percent escape in authority': connectLine('api%2eanthropic.com:443'),
    'plain HTTP GET': 'GET http://api.anthropic.com/ HTTP/1.1\r\nHost: api.anthropic.com\r\n\r\n',
    'origin-form GET': 'GET / HTTP/1.1\r\nHost: api.anthropic.com\r\n\r\n'
  }
  for (const [name, req] of Object.entries(refused)) {
    test(`refuses ${name}`, async () => {
      await withProxy({}, async ({ port, logFile }) => {
        const { head, socket } = await rawRequest(port, req)
        socket.destroy()
        assert.doesNotMatch(head, /^HTTP\/1\.1 200/, head)
        await new Promise((r) => setTimeout(r, 30))
        const lines = readFileSync(logFile, 'utf8').trim().split('\n').map(JSON.parse)
        assert.ok(
          lines.some((l) => l.event === 'refuse'),
          'refusal must be logged'
        )
      })
    })
  }

  test('an allowed name that resolves to a private address is refused (default resolver)', async () => {
    const logFile = join(scratch, 'proxy-private.jsonl')
    const proxy = createEgressProxy({
      port: 0,
      allow: ['models.example.com'],
      logFile,
      lookup: async () => [{ address: '10.1.2.3', family: 4 }]
    })
    await proxy.listening
    try {
      const { head, socket } = await rawRequest(proxy.port, connectLine('localhost:443'))
      socket.destroy()
      assert.doesNotMatch(head, /^HTTP\/1\.1 200/)
    } finally {
      await proxy.close()
    }
  })

  test('an idle tunnel is closed after the idle limit', async () => {
    await withProxy({ idleMs: 150 }, async ({ port }) => {
      const { head, socket } = await rawRequest(port, connectLine('api.anthropic.com:443'))
      assert.match(head, /^HTTP\/1\.1 200/)
      const t0 = Date.now()
      await new Promise((r) => socket.on('close', r))
      assert.ok(Date.now() - t0 < 2000)
    })
  })

  test('switching a host off closes its open tunnels and refuses new ones', async () => {
    await withProxy({}, async ({ proxy, port }) => {
      const { head, socket } = await rawRequest(port, connectLine('api.anthropic.com:443'))
      assert.match(head, /^HTTP\/1\.1 200/)
      const closed = new Promise((r) => socket.on('close', r))
      proxy.setOff(['api.anthropic.com'])
      await closed
      const again = await rawRequest(port, connectLine('api.anthropic.com:443'))
      again.socket.destroy()
      assert.doesNotMatch(again.head, /^HTTP\/1\.1 200/)
      proxy.setOff([])
      const back = await rawRequest(port, connectLine('api.anthropic.com:443'))
      back.socket.destroy()
      assert.match(back.head, /^HTTP\/1\.1 200/)
    })
  })

  test('the off-file switch reaches an open tunnel', async () => {
    const offFile = join(scratch, 'proxy-off.txt')
    writeFileSync(offFile, '')
    await withProxy({ offFile, offPollMs: 50 }, async ({ port }) => {
      const { head, socket } = await rawRequest(port, connectLine('api.anthropic.com:443'))
      assert.match(head, /^HTTP\/1\.1 200/)
      const closed = new Promise((r) => socket.on('close', r))
      writeFileSync(offFile, 'api.anthropic.com\n')
      await closed
    })
  })

  test('a bare IP on the allow list is refused at start', () => {
    assert.throws(
      () => createEgressProxy({ port: 0, allow: ['1.2.3.4'], logFile: join(scratch, 'x.jsonl') }),
      /host name/
    )
  })

  test('runs as a command configured only by QA_EGRESS_* variables', async () => {
    const logFile = join(scratch, 'proxy-env.jsonl')
    const denyFile = join(scratch, 'proxy-env-deny.txt')
    writeFileSync(denyFile, 'chatgpt.com\n')
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('../qa/fence/egress-proxy.mjs', import.meta.url))],
      {
        stdio: ['ignore', 'pipe', 'inherit'],
        env: {
          PATH: process.env.PATH,
          QA_EGRESS_LISTEN: '127.0.0.1:0',
          QA_EGRESS_ALLOW: 'api.anthropic.com, chatgpt.com',
          QA_EGRESS_DENY_FILE: denyFile,
          QA_EGRESS_LOG: logFile
        }
      }
    )
    try {
      const line = await new Promise((r) => child.stdout.once('data', (d) => r(String(d))))
      const port = Number(/listening 127\.0\.0\.1:(\d+)/.exec(line)?.[1])
      assert.ok(port > 0, line)
      const off = await rawRequest(port, connectLine('chatgpt.com:443'))
      off.socket.destroy()
      assert.match(off.head, /^HTTP\/1\.1 403/)
      await new Promise((r) => setTimeout(r, 50))
      const lines = readFileSync(logFile, 'utf8').trim().split('\n').map(JSON.parse)
      assert.deepEqual(lines[0].allow, ['api.anthropic.com', 'chatgpt.com'])
      assert.ok(lines.some((l) => l.event === 'refuse' && l.reason === 'switched off'))
    } finally {
      child.kill()
    }
  })

  test('runs as a command: --port --allow --log', async () => {
    const logFile = join(scratch, 'proxy-cli.jsonl')
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../qa/fence/egress-proxy.mjs', import.meta.url)),
        '--port',
        '0',
        '--allow',
        'chatgpt.com',
        '--log',
        logFile
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] }
    )
    try {
      const line = await new Promise((r) => child.stdout.once('data', (d) => r(String(d))))
      const port = Number(/listening 127\.0\.0\.1:(\d+)/.exec(line)?.[1])
      assert.ok(port > 0, line)
      const { head, socket } = await rawRequest(port, connectLine('evil.example.com:443'))
      socket.destroy()
      assert.match(head, /^HTTP\/1\.1 403/)
    } finally {
      child.kill()
    }
  })
})

// ---------------------------------------------------------------------------------------------------
// resolver preload

describe('testlib/resolve.mjs', () => {
  test('names under the stand domain reach loopback without any DNS', async () => {
    const server = http.createServer((req, res) => res.end(req.headers.host))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    try {
      const port = server.address().port
      const { stdout: out } = await promisify(execFile)(
        process.execPath,
        [
          '--import',
          RESOLVE,
          '-e',
          `const dns=require('node:dns');
           Promise.all([
             fetch('http://shop.qa.tracy.test:${port}/').then(r=>r.text()),
             fetch('http://qa.tracy.test:${port}/').then(r=>r.text()),
             dns.promises.lookup('a.qa.tracy.test',{all:true}),
             new Promise(r=>dns.lookup('qa.tracy.test',{family:6},(e,a,f)=>r([e&&e.code,a,f]))),
           ]).then(x=>console.log(JSON.stringify(x)))`
        ],
        { encoding: 'utf8' }
      )
      const [a, b, all, six] = JSON.parse(out)
      assert.equal(a, `shop.qa.tracy.test:${port}`)
      assert.equal(b, `qa.tracy.test:${port}`)
      assert.deepEqual(all, [{ address: '127.0.0.1', family: 4 }])
      assert.deepEqual(six, [null, '127.0.0.1', 4])
    } finally {
      server.close()
    }
  })

  test('look-alike names are not mapped', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--import',
        RESOLVE,
        '-e',
        `const dns=require('node:dns');let n=0;const real=[];
         for (const h of ['qa.tracy.test.evil.example','evilqa.tracy.test','qa.tracy.testx'])
           dns.lookup(h,(e,a)=>{real.push(a==='127.0.0.1'?h:null);if(++n===3)console.log(JSON.stringify(real))})`
      ],
      { encoding: 'utf8', env: { ...process.env, QA_RESOLVE_ONLY: '1' } }
    )
    assert.deepEqual(JSON.parse(out), [null, null, null])
  })
})
