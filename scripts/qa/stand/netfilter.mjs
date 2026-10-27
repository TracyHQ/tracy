#!/usr/bin/env node
/**
 * The QA-EGRESS netfilter chain inside the Docker VM (tasks/todo-daily-qa.md §3.3 part 2).
 *
 *   RULES: string[]                       — the chain, exactly as `iptables -S` prints it
 *   JUMPS: string[]                       — the DOCKER-USER jumps, top of the chain, in order
 *   rulesetHash() -> hex                  — sha256 of RULES + JUMPS (the manifest field)
 *   applyScript() / removeScript() / readScript() -> string   — the sh run inside the helper
 *   apply({docker, runId, image}) -> {ok, stderr}
 *   remove({docker, runId, image}) -> {ok, stderr}
 *   read({docker, runId, image}) -> {ok, text}          — `iptables -S` of both chains
 *   verify({docker, runId, image}) -> {ok, missing: string[], extra: string[], hash}
 *   compare(text) -> {ok, missing, extra, hash}         — pure, for tests and manifest.actual
 *
 * Each call runs ONE throwaway helper container: `docker run --rm --network host --cap-add
 * NET_ADMIN --cap-add NET_RAW --label qa.run=<runId> --entrypoint sh <image> -c <script>`.
 * The helper image must carry iptables; tracy/host:qa does (provision.sh needs it).
 *
 * The rules are lost when Docker restarts, so P0 applies and verifies them every night.
 *
 * CLI: node netfilter.mjs apply|verify|remove|print [--run-id <id>] [--image <ref>]
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { QA, dockerRunner, sha256 } from './qa-stand.mjs'

export const CHAIN = 'QA-EGRESS'
export const DSH_EGRESS = QA.subnets.egress
export const SITES = QA.siteSubnet
export const DEFAULT_IMAGE = `tracy/host:${QA.imageTag}`

export const RULES = Object.freeze([
  `-N ${CHAIN}`,
  `-A ${CHAIN} -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN`,
  // A site's web and db talk to each other (same /24; Docker's isolation chains already drop
  // traffic between two different site bridges).
  `-A ${CHAIN} -s ${SITES} -d ${SITES} -j RETURN`,
  // dsh to the qa-egress proxy, on the egress bridge.
  `-A ${CHAIN} -s ${DSH_EGRESS} -d ${DSH_EGRESS} -j RETURN`,
  `-A ${CHAIN} -j REJECT --reject-with icmp-port-unreachable`
])

// Inserted at position 1 one after the other, so the LAST inserted is the first rule.
export const JUMPS = Object.freeze([
  `-A DOCKER-USER -s ${DSH_EGRESS} -j ${CHAIN}`,
  `-A DOCKER-USER -s ${SITES} -j ${CHAIN}`
])

export const rulesetHash = () => sha256([...RULES, ...JUMPS].join('\n'))

const del = (jump) => `while iptables ${jump.replace(/^-A /, '-D ')} 2>/dev/null; do :; done`

export function applyScript() {
  return [
    'set -eu',
    `iptables -N ${CHAIN} 2>/dev/null || true`,
    `iptables -F ${CHAIN}`,
    ...RULES.slice(1).map((r) => `iptables ${r}`),
    ...JUMPS.map(del),
    // Reverse order of JUMPS, each at position 1: the result reads exactly as JUMPS.
    ...[...JUMPS].reverse().map((j) => `iptables ${j.replace(/^-A DOCKER-USER /, '-I DOCKER-USER 1 ')}`)
  ].join('\n')
}

export function removeScript() {
  return [
    'set -u',
    ...JUMPS.map(del),
    `iptables -F ${CHAIN} 2>/dev/null || true`,
    `iptables -X ${CHAIN} 2>/dev/null || true`
  ].join('\n')
}

export function readScript() {
  return `iptables -S ${CHAIN}; echo '--- DOCKER-USER'; iptables -S DOCKER-USER`
}

function helper(docker, script, { runId, image }) {
  return docker([
    'run',
    '--rm',
    '--network',
    'host',
    '--cap-add',
    'NET_ADMIN',
    '--cap-add',
    'NET_RAW',
    '--label',
    `qa.run=${runId}`,
    '--entrypoint',
    'sh',
    image,
    '-c',
    script
  ])
}

const norm = (line) => line.trim().replace(/\s+/g, ' ')

export function compare(text) {
  const [chainPart, userPart = ''] = text.split(/^--- DOCKER-USER$/m)
  const chain = chainPart.split('\n').map(norm).filter(Boolean)
  const user = userPart
    .split('\n')
    .map(norm)
    .filter((l) => l.startsWith('-A DOCKER-USER'))
  const missing = []
  const extra = []
  for (const r of RULES) if (!chain.includes(r)) missing.push(r)
  for (const r of chain) if (!RULES.includes(r)) extra.push(r)
  if (missing.length === 0 && extra.length === 0 && JSON.stringify(chain) !== JSON.stringify(RULES)) {
    missing.push(`order of ${CHAIN} (want: ${RULES.join(' | ')})`)
  }
  JUMPS.forEach((j, i) => {
    if (!user.includes(j)) missing.push(j)
    else if (user[i] !== j) missing.push(`${j} (at position ${i + 1} of DOCKER-USER)`)
  })
  const ok = missing.length === 0 && extra.length === 0
  return {
    ok,
    missing,
    extra,
    hash: ok ? rulesetHash() : sha256([...chain, ...user.filter((l) => l.endsWith(`-j ${CHAIN}`))].join('\n'))
  }
}

export function apply({ docker = dockerRunner(), runId = 'manual', image = DEFAULT_IMAGE } = {}) {
  const r = helper(docker, applyScript(), { runId, image })
  return { ok: r.code === 0, stderr: r.stderr }
}

export function remove({ docker = dockerRunner(), runId = 'manual', image = DEFAULT_IMAGE } = {}) {
  const r = helper(docker, removeScript(), { runId, image })
  return { ok: r.code === 0, stderr: r.stderr }
}

export function read({ docker = dockerRunner(), runId = 'manual', image = DEFAULT_IMAGE } = {}) {
  const r = helper(docker, readScript(), { runId, image })
  return { ok: r.code === 0, text: r.stdout, stderr: r.stderr }
}

export function verify(opts = {}) {
  const r = read(opts)
  if (!r.ok)
    return {
      ok: false,
      missing: [`cannot read iptables: ${r.stderr.trim().split('\n').pop() ?? ''}`],
      extra: [],
      hash: ''
    }
  return compare(r.text)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2)
  const opt = (f) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : undefined)
  const o = { runId: opt('--run-id') ?? 'manual', image: opt('--image') ?? DEFAULT_IMAGE }
  if (cmd === 'print') {
    console.log(applyScript())
  } else if (cmd === 'apply' || cmd === 'remove') {
    const r = cmd === 'apply' ? apply(o) : remove(o)
    if (!r.ok) console.error(r.stderr)
    process.exit(r.ok ? 0 : 1)
  } else if (cmd === 'verify') {
    const r = verify(o)
    for (const m of r.missing) console.error(`missing: ${m}`)
    for (const e of r.extra) console.error(`extra: ${e}`)
    if (r.ok) console.log(`netfilter: ${CHAIN} intact (${r.hash.slice(0, 12)})`)
    process.exit(r.ok ? 0 : 1)
  } else {
    console.error('usage: netfilter.mjs apply|verify|remove|print [--run-id <id>] [--image <ref>]')
    process.exit(2)
  }
}
