// fence-check: prove one lane's fence holds before that lane runs (plan §4.3). No model is used.
//   node fence-check.mjs --mock [--lane sonnet] [--break no-deny-network|read-users|chrome-outside] [--keep] [--json]
//   node fence-check.mjs --lane <lane> --run-id <id>        (real layout and ports; bait and decoys still fake)
// Three groups: files-network-processes (fence-canary.sh, under the `cli` and the `test` profile), cdp
// (fence-cdp.mjs under the `test` profile, driving the lane's fenced Chrome), proxy (CONNECT rows through
// the lane's egress proxy, from inside the `cli` profile). Child scripts write result files; this script
// reads them. Any row off its expectation -> exit 1 and the row is printed with its group.
//
// Exports:
//   runFenceCheck({ mock?, lane?, runId?, breakCase?, keep?, portBase?, qaHome?, worktrees? })
//     -> Promise<{ ok: boolean, rows: Row[], failedGroups: string[], root: string }>
//   Row = { group, name, kind?, expect, ok, detail }
//   BREAK_CASES
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

import { startChrome } from './chrome.mjs'
import { createEgressProxy } from './egress-proxy.mjs'
import { DEFAULT_PORTS, LANES, PROXY_HOSTS, laneLayout, renderProfile } from './render.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const RESOLVE_SRC = join(HERE, '..', 'testlib', 'resolve.mjs')
export const BREAK_CASES = ['no-deny-network', 'read-users', 'chrome-outside']
const GROUPS = ['files-network-processes', 'cdp', 'proxy']

function mutate(text, breakCase) {
  if (breakCase === 'no-deny-network') return text.replace('\n(deny network*)\n', '\n')
  if (breakCase === 'read-users')
    return text.replace('(subpath "/dev")', '(subpath "/dev") (subpath "/Users")')
  return text
}

/** HTTP server that records what reached it; `kind` decides the page it serves. */
function startServer(port, kind) {
  const seen = { connections: 0, requests: [], bare: 0 }
  const server = http.createServer((req, res) => {
    seen.requests.push(req.url)
    req.socket.qaSpoke = true
    if (kind === 'stand') {
      res.setHeader('content-type', 'text/html')
      res.end(
        `<html><body><h1>qa-stand</h1><p id="host">${String(req.headers.host).replace(/[<&]/g, '')}</p><input type="file" id="f"></body></html>`
      )
    } else {
      res.end('decoy')
    }
  })
  const sockets = new Set()
  server.on('connection', (c) => {
    seen.connections++
    sockets.add(c)
    c.on('close', () => {
      sockets.delete(c)
      if (!c.qaSpoke) seen.bare++
    })
  })
  server.on('upgrade', (req, socket) => {
    seen.requests.push(req.url)
    socket.qaSpoke = true
    socket.destroy()
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({ server, seen, sockets }))
  })
}

function startEcho(port) {
  const seen = { connections: 0 }
  const sockets = new Set()
  const server = net.createServer((c) => {
    seen.connections++
    sockets.add(c)
    c.on('close', () => sockets.delete(c))
    c.on('error', () => {})
    c.pipe(c)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({ server, seen, sockets }))
  })
}

function runFenced(profileFile, argv, env, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('/usr/bin/sandbox-exec', ['-f', profileFile, ...argv], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    })
    let err = ''
    child.stderr.on('data', (d) => {
      err += d
    })
    child.stdout.resume()
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {}
    }, timeoutMs)
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stderr: err.slice(-2000) })
    })
  })
}

function judge(expect, code) {
  if (expect === 'deny') return code !== 0
  if (expect === 'eperm') return code === 3
  if (expect === 'refused') return code === 5
  return code === 0
}

function readTsv(file, kind) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [group, name, expect, codeText] = line.split('\t')
      const code = Number(codeText)
      return { group, name, kind, expect, ok: judge(expect, code), detail: `exit ${code}` }
    })
}

function bait(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/** Build the fake trees of a mock run under one short root. */
function buildMock(root, lane, mark) {
  const wt = join(root, 'wt')
  for (const tree of ['qa-src', 'qa-base-1', 'qa-base-2']) {
    bait(join(wt, tree, 'sub', 'src', 'a.txt'), 'source\n')
    bait(join(wt, tree, 'sub', 'test', 't.txt'), `HIDDEN-TEST-${mark}\n`)
    bait(join(wt, tree, 'test', 'root.txt'), `HIDDEN-TEST-${mark}\n`)
  }
  mkdirSync(join(wt, 'qa-tool', 'vendor', 'tracy', 'mattpocock-skills'), { recursive: true })
  const qaHome = join(root, 'h')
  const secrets = [
    join(qaHome, '.env'),
    join(qaHome, 'dsh-home', 'profiles.json'),
    join(qaHome, 'claude-token'),
    join(qaHome, 'codex-auth', 'auth.json'),
    join(qaHome, 'state', 'run.json')
  ]
  for (const s of secrets) bait(s, `BAIT-${mark}\n`)
  const outside = join(root, 'bait', 'secret.txt')
  bait(outside, `BAIT-${mark}\n`)
  return { worktrees: wt, qaHome, secrets, outside }
}

function realSecrets(qaHome) {
  return ['.env', 'dsh-home', 'claude-token', 'codex-auth/auth.json', 'state/run.json'].map((p) =>
    join(qaHome, p)
  )
}

export async function runFenceCheck({
  mock = false,
  lane = 'sonnet',
  runId = mock ? 'mock' : undefined,
  breakCase,
  keep = false,
  portBase = 47000,
  qaHome: qaHomeArg,
  worktrees: worktreesArg
} = {}) {
  if (!LANES.includes(lane)) throw new Error(`unknown lane ${lane}`)
  if (breakCase && !BREAK_CASES.includes(breakCase)) throw new Error(`unknown break case ${breakCase}`)
  if (!runId) throw new Error('--run-id is required outside --mock')
  const mark = randomBytes(6).toString('hex')
  const root = realpathSync(mkdtempSync('/private/tmp/qaf-'))
  const homeReal = homedir()
  const cleanups = []
  const rows = []
  try {
    // ---- layout, bait, ports
    let worktrees
    let qaHome
    let secrets
    let outside
    let ports
    if (mock) {
      ;({ worktrees, qaHome, secrets, outside } = buildMock(root, lane, mark))
      const lanes = {}
      LANES.forEach((l, i) => {
        lanes[l] = { cdp: portBase + 236 + i, proxy: portBase + 900 }
      })
      ports = { gate: portBase + 80, lanes }
    } else {
      worktrees = worktreesArg ?? join(homeReal, 'TCH-worktrees')
      qaHome = qaHomeArg ?? process.env.QA_HOME ?? join(homeReal, 'TCH-local', 'qa')
      secrets = realSecrets(qaHome)
      outside = join(root, 'bait', 'secret.txt')
      bait(outside, `BAIT-${mark}\n`)
      ports = DEFAULT_PORTS
    }
    const decoyPort = portBase + 81
    const upstreamPort = portBase + 901
    const otherLane = LANES.find((l) => l !== lane)
    const otherCdp =
      ports.lanes[otherLane].cdp === ports.lanes[lane].cdp ? portBase + 239 : ports.lanes[otherLane].cdp

    const L = laneLayout({ qaHome, worktrees, runId, lane, chromeRoot: root })
    const other = laneLayout({ qaHome, worktrees, runId, lane: otherLane, chromeRoot: root })
    if (mock) {
      bait(
        join(worktrees, 'qa-tool', 'scripts', 'qa', 'testlib', 'resolve.mjs'),
        readFileSync(RESOLVE_SRC, 'utf8')
      )
      bait(join(other.staging, 'x.txt'), `BAIT-${mark}\n`)
    }
    for (const d of [L.staging, L.prTestDir, L.cliHome, L.results, L.testTmp])
      mkdirSync(d, { recursive: true })
    if (mock) bait(L.laneKey, `lane-key-${mark}\n`)
    const probe = join(L.staging, '.fence-probe')
    mkdirSync(probe, { recursive: true })
    cleanups.push(() => rmSync(probe, { recursive: true, force: true }))
    for (const f of ['fence-canary.sh', 'fence-net.mjs', 'fence-cdp.mjs'])
      copyFileSync(join(HERE, f), join(probe, f))
    writeFileSync(join(probe, 'inside.txt'), 'inside the fence\n')

    // ---- profiles
    const profDir = join(root, 'profiles')
    const prof = {}
    for (const kind of ['chrome', 'cli', 'test']) {
      const r = renderProfile({ lane, kind, layout: L, ports, outDir: profDir })
      writeFileSync(r.file, mutate(r.text, breakCase))
      prof[kind] = r.file
    }

    // ---- fake servers outside the fence
    const servers = []
    const add = async (p) => {
      const s = await p
      servers.push(s)
      cleanups.push(() => {
        for (const c of s.sockets) c.destroy()
        return new Promise((r) => s.server.close(() => r()))
      })
      return s
    }
    if (mock) await add(startServer(ports.gate, 'stand'))
    const decoy = await add(startServer(decoyPort, 'decoy'))
    const otherCdpDecoy = mock || otherCdp >= portBase ? await add(startServer(otherCdp, 'decoy')) : null
    const upstream = await add(startEcho(upstreamPort))
    let proxyPort = ports.lanes[lane].proxy
    if (mock) {
      const proxy = createEgressProxy({
        port: proxyPort,
        allow: PROXY_HOSTS[lane],
        logFile: join(root, 'proxy.jsonl'),
        resolveUpstream: () => ({ host: '127.0.0.1', port: upstreamPort })
      })
      await proxy.listening
      proxyPort = proxy.port
      cleanups.push(() => proxy.close())
    }

    // ---- a process outside the fence to poke at
    const sleeper = spawn('/bin/sleep', ['120'], {
      env: { QA_FENCE_MARK: mark },
      stdio: 'ignore',
      detached: true
    })
    cleanups.push(() => {
      try {
        process.kill(sleeper.pid, 'SIGKILL')
      } catch {}
    })

    // ---- Chrome of the lane
    const chrome = await startChrome({
      lane,
      profileFile: prof.chrome,
      cdpPort: ports.lanes[lane].cdp,
      chromeDir: L.chromeDir,
      procsLog: join(root, 'procs.jsonl'),
      runId,
      fenced: breakCase !== 'chrome-outside'
    })
    cleanups.push(() => chrome.stop())

    const nodeBin = realpathSync(process.execPath)
    const realTmp = execFileSync('/usr/bin/getconf', ['DARWIN_USER_TEMP_DIR'], { encoding: 'utf8' })
      .trim()
      .replace(/\/$/, '')
    const baseEnv = {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      HOME: homeReal,
      HOME_REAL: homeReal,
      PROBE: probe,
      NODE: nodeBin,
      REAL_TMP: realTmp,
      BAIT: outside,
      SRC: L.src,
      LANE_KEY: L.laneKey,
      RESOLVE: L.resolvePreload,
      GATE: String(ports.gate),
      DECOY: String(decoyPort),
      OTHER_CDP: String(otherCdp),
      CDP: String(ports.lanes[lane].cdp),
      PROXY: String(proxyPort),
      PROXY_HOST: PROXY_HOSTS[lane][0],
      UPSTREAM: String(upstreamPort),
      OTHER_PID: String(sleeper.pid),
      OUTER_PID: String(process.pid),
      MARK: mark,
      DOCKER_SOCK: join(homeReal, '.docker', 'run', 'docker.sock'),
      SECRETS: secrets.join('\n'),
      OTHER_LANE: other.laneDir
    }

    // ---- group 1 (+3) under cli and test
    for (const [kind, out, writeOk, tmpOk] of [
      ['cli', join(L.prTestDir, 'canary-cli.tsv'), L.prTestDir, L.cliHome],
      ['test', join(L.results, 'canary-test.tsv'), L.results, L.testTmp]
    ]) {
      const r = await runFenced(
        prof[kind],
        ['/bin/bash', join(probe, 'fence-canary.sh')],
        { ...baseEnv, KIND: kind, OUT: out, WRITE_OK: writeOk, TMP_OK: tmpOk, TMPDIR: tmpOk },
        writeOk,
        240_000
      )
      const got = readTsv(out, kind)
      if (!existsSync(`${out}.done`)) {
        rows.push({
          group: GROUPS[0],
          name: `canary finished (${kind})`,
          kind,
          expect: 'allow',
          ok: false,
          detail: `exit ${r.code} ${r.stderr}`
        })
      }
      rows.push(...got)
    }

    // ---- group 2: CDP, from the test kind
    {
      const out = join(L.results, 'cdp.jsonl')
      const r = await runFenced(
        prof.test,
        [nodeBin, join(probe, 'fence-cdp.mjs')],
        {
          ...baseEnv,
          OUT: out,
          TMPDIR: L.testTmp,
          INSIDE_FILE: join(probe, 'inside.txt'),
          SECRET_FILE: secrets.find((s) => s.endsWith('claude-token')),
          CHROME_DL: join(L.chromeDir, 'dl')
        },
        L.results,
        180_000
      )
      const got = existsSync(out)
        ? readFileSync(out, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => ({ kind: 'test', ...JSON.parse(l) }))
        : []
      rows.push(...got)
      if (!existsSync(`${out}.done`)) {
        rows.push({
          group: 'cdp',
          name: 'cdp probe finished',
          kind: 'test',
          expect: 'allow',
          ok: false,
          detail: `exit ${r.code} ${r.stderr.slice(-300)}`
        })
      }
    }

    // ---- what the decoys saw, and files that must not exist
    const reqs = decoy.seen.requests
    rows.push({
      group: 'cdp',
      name: 'decoy stand saw no browser request',
      expect: 'deny',
      ok: !reqs.some((u) => /probe/.test(u)),
      detail: reqs.join(' ') || 'none'
    })
    rows.push({
      group: GROUPS[0],
      name: 'decoy stand saw no bare connection',
      expect: 'deny',
      ok: decoy.seen.bare === 0,
      detail: `${decoy.seen.bare} bare connections (no HTTP request)`
    })
    if (otherCdpDecoy) {
      rows.push({
        group: GROUPS[0],
        name: 'other lane CDP saw no connection',
        expect: 'deny',
        ok: otherCdpDecoy.seen.connections === 0,
        detail: `${otherCdpDecoy.seen.connections} connections`
      })
    }
    const expectedUpstream = rows.filter((r) => r.group === 'proxy' && r.expect === 'allow').length
    rows.push({
      group: 'proxy',
      name: 'upstream reached only through the proxy',
      expect: 'deny',
      ok: upstream.seen.connections === expectedUpstream,
      detail: `${upstream.seen.connections} connections, ${expectedUpstream} expected`
    })
    const escapes = [
      [GROUPS[0], `/private/tmp/qaf-escape-${mark}`],
      [GROUPS[0], `${realTmp}/qaf-escape-${mark}`],
      [GROUPS[0], `/Users/Shared/qaf-escape-${mark}`],
      [GROUPS[0], join(L.src, 'sub', 'src', 'new')],
      ['cdp', `/private/tmp/qaf-dl-${mark}.bin`],
      ['cdp', join(homeReal, 'Downloads', `qaf-dl-${mark}.bin`)]
    ]
    for (const [group, f] of escapes) {
      const there = existsSync(f)
      if (there && (f.includes(mark) || mock)) rmSync(f, { force: true })
      rows.push({
        group,
        name: `no file appeared: ${f.replace(homeReal, '~')}`,
        expect: 'deny',
        ok: !there,
        detail: there ? 'FOUND' : 'absent'
      })
    }
    try {
      execFileSync('/bin/launchctl', ['remove', `qa.fence.probe.${mark}`], { stdio: 'ignore' })
      rows.push({
        group: GROUPS[0],
        name: 'no launchd job was submitted',
        expect: 'deny',
        ok: false,
        detail: 'job existed, removed'
      })
    } catch {}
  } finally {
    for (const fn of cleanups.reverse()) {
      try {
        await fn()
      } catch {}
    }
    if (!keep) rmSync(root, { recursive: true, force: true })
  }
  const failedGroups = GROUPS.filter((g) => rows.some((r) => r.group === g && !r.ok))
  for (const g of GROUPS) {
    if (!rows.some((r) => r.group === g)) failedGroups.push(`${g} (no rows)`)
  }
  return { ok: failedGroups.length === 0, rows, failedGroups, root }
}

function argValue(args, name) {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  const result = await runFenceCheck({
    mock: args.includes('--mock'),
    lane: argValue(args, '--lane') ?? 'sonnet',
    runId: argValue(args, '--run-id'),
    breakCase: argValue(args, '--break'),
    keep: args.includes('--keep'),
    portBase: Number(argValue(args, '--port-base') ?? 47000)
  })
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const g of GROUPS) {
      const rs = result.rows.filter((r) => r.group === g)
      process.stdout.write(`${g}: ${rs.filter((r) => r.ok).length}/${rs.length} rows hold\n`)
    }
    for (const r of result.rows.filter((x) => !x.ok)) {
      process.stdout.write(
        `FAIL [${r.group}]${r.kind ? ` (${r.kind})` : ''} ${r.name} - expected ${r.expect}, got ${r.detail}\n`
      )
    }
    process.stdout.write(
      result.ok ? 'fence-check: OK\n' : `fence-check: FAILED groups: ${result.failedGroups.join(', ')}\n`
    )
  }
  process.exit(result.ok ? 0 : 1)
}
