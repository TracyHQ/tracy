// Render the sandbox-exec profile for one QA lane and one process kind (plan §3.2, §4.3).
//
// Exports:
//   LANES: ['sonnet','sol','verify']        KINDS: ['chrome','cli','test']
//   DEFAULT_PORTS: { gate, lanes: { <lane>: { cdp, proxy } } }
//   PROXY_HOSTS: { <lane>: string[] }       host names the lane's egress proxy may tunnel to
//   laneLayout({ qaHome?, worktrees?, runId, lane, nodeDir?, cliBins?, skills?, base?, chromeRoot?, realpath? })
//     -> Layout  (every path the fence of that lane knows about)
//   profileFor({ lane, kind, layout, ports? }) -> { text }
//   renderProfile({ lane, kind, layout, ports?, outDir }) -> { file, sha256, text }
//   sandboxArgv(profileFile, argv) -> ['/usr/bin/sandbox-exec', '-f', profileFile, ...argv]
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LANES = ['sonnet', 'sol', 'verify']
export const KINDS = ['chrome', 'cli', 'test']

export const DEFAULT_PORTS = {
  gate: 36080,
  lanes: {
    sonnet: { cdp: 9236, proxy: 36900 },
    sol: { cdp: 9237, proxy: 36901 },
    verify: { cdp: 9238, proxy: 36901 }
  }
}

export const PROXY_HOSTS = {
  sonnet: ['api.anthropic.com'],
  sol: ['chatgpt.com'],
  verify: ['chatgpt.com']
}

export const CHROME_APP = '/Applications/Google Chrome.app'
const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'base.sb.tmpl')

/** Canonical path if it exists (the sandbox matches real paths: /tmp is /private/tmp), else as given. */
function canon(p, doRealpath) {
  if (!doRealpath) return p
  try {
    return realpathSync(p)
  } catch {
    if (process.platform === 'darwin' && p.startsWith('/tmp/')) return `/private${p}`
    return p
  }
}

/**
 * Where everything of one lane lives. Paths under r/<runId>/<lane>/ are the lane's own; the Chrome dir is
 * kept short (/private/tmp/qaf-<lane>) because Chrome's socket paths must stay under ~104 characters.
 */
export function laneLayout({
  qaHome = process.env.QA_HOME ?? join(homedir(), 'TCH-local', 'qa'),
  worktrees = join(homedir(), 'TCH-worktrees'),
  runId,
  lane,
  pr = 'current',
  nodeDir = dirname(dirname(realpathSync(process.execPath))),
  cliBins = [],
  skills,
  bases = 2,
  chromeRoot = '/private/tmp',
  realpath = true
}) {
  if (!LANES.includes(lane)) throw new Error(`unknown lane: ${lane}`)
  if (!runId) throw new Error('runId is required')
  const c = (p) => canon(p, realpath)
  const laneDir = c(join(qaHome, 'r', runId, lane))
  const wt = c(worktrees)
  return {
    lane,
    qaHome: c(qaHome),
    src: join(wt, 'qa-src'),
    bases: Array.from({ length: bases }, (_, i) => join(wt, `qa-base-${i + 1}`)),
    tool: join(wt, 'qa-tool'),
    skills: skills ?? join(wt, 'qa-tool', 'vendor', 'tracy', 'mattpocock-skills'),
    resolvePreload: join(wt, 'qa-tool', 'scripts', 'qa', 'testlib', 'resolve.mjs'),
    laneDir,
    staging: join(laneDir, 'staging'),
    prDir: join(laneDir, 'pr', String(pr)),
    prTestDir: join(laneDir, 'pr', String(pr), 'tests'),
    laneKey: join(laneDir, 'lane.key'),
    cliHome: join(laneDir, 'cli'),
    results: join(laneDir, 'results'),
    testTmp: join(laneDir, 'tmp'),
    chromeDir: join(c(chromeRoot), `qaf-${lane}`),
    nodeDir: c(nodeDir),
    cliBins: cliBins.map(c)
  }
}

function checkPath(p) {
  const unsafe =
    typeof p !== 'string' ||
    [...p].some((ch) => ch === '"' || ch === '\\' || ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)
  if (unsafe || !p.startsWith('/')) {
    throw new Error(`fence: unusable path ${JSON.stringify(p)}`)
  }
  return p
}

const subpaths = (list) => list.map((p) => ` (subpath "${checkPath(p)}")`).join('')
const literals = (list) => list.map((p) => ` (literal "${checkPath(p)}")`).join('')
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Deny reading test/ and tests/ anywhere inside the product trees (also at their root). */
function denyTests(trees) {
  return trees.map((t) => `(deny file-read* (regex #"^${reEscape(checkPath(t))}/(.*/)?tests?/"))`).join('\n')
}

const outRule = (ports) =>
  ports.map((p) => `(allow network-outbound (remote ip "localhost:${Number(p)}"))`).join('\n')

/** The §3.2 table as data: what each kind of process reads, writes, and connects to. */
function columns(kind, L, lanePorts, gate) {
  if (kind === 'chrome') {
    return {
      readSub: [L.staging, L.chromeDir],
      readLit: [],
      write: [L.chromeDir],
      denyTrees: [],
      out: [gate],
      chrome: [
        `(allow file-read* (subpath "${CHROME_APP}") (subpath "/Library"))`,
        '(deny file-read* (subpath "/Library/Keychains"))',
        `(allow network-bind network-inbound (local ip "localhost:${Number(lanePorts.cdp)}"))`,
        `(allow network-bind network-inbound network-outbound (subpath "${checkPath(L.chromeDir)}"))`
      ].join('\n')
    }
  }
  if (kind === 'cli') {
    return {
      readSub: [L.src, L.staging, L.prDir, L.nodeDir, ...L.cliBins, L.skills, L.cliHome, L.resolvePreload],
      readLit: [L.laneKey],
      write: [L.prTestDir, L.cliHome],
      denyTrees: [L.src],
      out: [gate, lanePorts.cdp, lanePorts.proxy],
      chrome: ''
    }
  }
  if (kind === 'test') {
    return {
      readSub: [L.src, ...L.bases, L.staging, L.prDir, L.nodeDir, L.results, L.testTmp, L.resolvePreload],
      readLit: [L.laneKey],
      // Tests keep scratch files beside themselves (measured 03/10: 16 reds were EPERM on mkdtemp
      // and open in the test folder); the folder is the lane's own and is not intaken again.
      write: [L.results, L.testTmp, L.prTestDir],
      denyTrees: [L.src, ...L.bases],
      out: [gate, lanePorts.cdp],
      chrome: ''
    }
  }
  throw new Error(`unknown kind: ${kind}`)
}

/** Fill the template for one lane and kind. Pure: no file is written. */
export function profileFor({ lane, kind, layout, ports = DEFAULT_PORTS }) {
  if (!LANES.includes(lane)) throw new Error(`unknown lane: ${lane}`)
  const lanePorts = ports.lanes[lane]
  const col = columns(kind, layout, lanePorts, ports.gate)
  const fill = {
    LANE: lane,
    KIND: kind,
    READ: subpaths(col.readSub) + literals(col.readLit),
    DENY_READ: denyTests(col.denyTrees),
    WRITE: subpaths(col.write),
    OUT: outRule(col.out),
    CHROME_ONLY: col.chrome
  }
  const text = readFileSync(TEMPLATE, 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    if (!(k in fill)) throw new Error(`template placeholder without a value: ${k}`)
    return fill[k]
  })
  return { text: text.replace(/\n{3,}/g, '\n\n') }
}

/** Write the profile to <outDir>/<lane>-<kind>.sb and return its sha256 (recorded in the run folder). */
export function renderProfile({ lane, kind, layout, ports = DEFAULT_PORTS, outDir }) {
  const { text } = profileFor({ lane, kind, layout, ports })
  mkdirSync(outDir, { recursive: true })
  const file = join(outDir, `${lane}-${kind}.sb`)
  writeFileSync(file, text)
  return { file, sha256: createHash('sha256').update(text).digest('hex'), text }
}

export function sandboxArgv(profileFile, argv) {
  return ['/usr/bin/sandbox-exec', '-f', profileFile, ...argv]
}
