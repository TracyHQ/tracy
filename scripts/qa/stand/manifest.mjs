/**
 * Stand manifest: what the stand SHOULD be at commit T, and what it IS (§4.5).
 *
 *   desired({ srcDir, sourceSha, envFile, toolSha, docker? }) -> Manifest
 *   actual({ srcDir, previous?, docker? }) -> Manifest     // previous = last stand.json
 *   diff(desired, actual) -> { field, desired, actual }[]
 *   decide(desired, actual) -> { rebuild: boolean, reasons: string[] }
 *   writeStand(record, { file?, write? })  — default: lib/state.mjs writeJsonAtomic to QA_HOME/state/stand.json
 *
 * Manifest fields:
 *   sourceSha     T, or the tracy.commit label of the running app images ('mixed:…' if they differ)
 *   compose       { service: config-hash } — `docker compose config --hash '*'` vs the
 *                 com.docker.compose.config-hash label of each container; composeHash = sha256
 *   baseImages    { service: image id } for every non-Tracy image compose names
 *   webDefaults   { platform: tag } — the default lines of T's IMAGE_TAGS; actual: tag if present
 *   webDefaultIds { platform: id }  — recorded, not compared (the tag is)
 *   migrations    sorted *.sql of T vs rows of schema_migration
 *   netfilterHash sha256 of the QA-EGRESS ruleset vs what `iptables -S` reads back
 *   toolSha       ~/TCH-local/qa/tool.sha vs the value recorded at the last deploy
 *
 * Rebuild whenever actual ≠ desired(T), new PRs or not; P5, P6 and issues run only when equal.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { compare as compareRules, read as readRules, rulesetHash } from './netfilter.mjs'
import { qaHome, stateDir, writeJsonAtomic } from '../lib/state.mjs'
import { QA, composeArgs, dockerRunner, sha256 } from './qa-stand.mjs'

const APP_SERVICES = Object.freeze({
  'tracy-web': 'tracy/web',
  'tracy-host': 'tracy/host',
  'tracy-dsh': 'tracy/dsh'
})
export const COMPARED = Object.freeze([
  'sourceSha',
  'compose',
  'baseImages',
  'webDefaults',
  'migrations',
  'netfilterHash',
  'toolSha'
])

const ok = (r) => (r.code === 0 ? r.stdout : null)
const lines = (text) =>
  (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

export function readImageTags(srcDir) {
  const file = path.join(srcDir, 'packages', 'fleet', 'tracy-fleet-operation', 'web', 'IMAGE_TAGS')
  const out = {}
  for (const line of lines(readFileSync(file, 'utf8'))) {
    if (line.startsWith('#')) continue
    const i = line.indexOf('=')
    const key = line.slice(0, i)
    if (!key.includes(':')) out[key] = line.slice(i + 1)
  }
  return out
}

export function readMigrations(srcDir) {
  return readdirSync(path.join(srcDir, 'apps', 'tracy-web', 'src', 'db', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

function composeHashes(docker, srcDir, envFile) {
  const out = {}
  for (const l of lines(ok(docker([...composeArgs({ srcDir, envFile }), 'config', '--hash', '*'])))) {
    const [svc, hash] = l.split(/\s+/)
    out[svc] = hash
  }
  return out
}

function composeServices(docker, srcDir, envFile) {
  const json = ok(docker([...composeArgs({ srcDir, envFile }), 'config', '--format', 'json']))
  return json ? (JSON.parse(json).services ?? {}) : {}
}

const imageId = (docker, ref) =>
  (ok(docker(['image', 'inspect', '--format', '{{.Id}}', ref])) ?? '').trim() || null

export function desired({ srcDir, sourceSha, envFile, toolSha, docker = dockerRunner() }) {
  const compose = composeHashes(docker, srcDir, envFile)
  const baseImages = {}
  for (const [svc, def] of Object.entries(composeServices(docker, srcDir, envFile))) {
    if (!APP_SERVICES[svc] && def.image) baseImages[svc] = imageId(docker, def.image)
  }
  const webDefaults = readImageTags(srcDir)
  const webDefaultIds = Object.fromEntries(
    Object.entries(webDefaults).map(([p, tag]) => [p, imageId(docker, tag)])
  )
  return {
    sourceSha,
    compose,
    composeHash: sha256(JSON.stringify(Object.entries(compose).sort())),
    baseImages,
    webDefaults,
    webDefaultIds,
    migrations: readMigrations(srcDir),
    netfilterHash: rulesetHash(),
    toolSha
  }
}

export function actual({ srcDir, previous = null, docker = dockerRunner(), runId = 'manifest' }) {
  const fmt =
    '{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.config-hash"}}\t{{.Image}}\t{{.ID}}'
  const ps = lines(
    ok(docker(['ps', '-a', '--filter', `label=com.docker.compose.project=${QA.project}`, '--format', fmt]))
  )
  const compose = {}
  const containers = {}
  for (const l of ps) {
    const [svc, hash, , id] = l.split('\t')
    compose[svc] = hash
    containers[svc] = id
  }
  const baseImages = {}
  const commits = new Set()
  for (const [svc, id] of Object.entries(containers)) {
    const imgId = (ok(docker(['inspect', '--format', '{{.Image}}', id])) ?? '').trim() || null
    if (APP_SERVICES[svc]) {
      const commit = imgId
        ? (
            ok(docker(['image', 'inspect', '--format', '{{index .Config.Labels "tracy.commit"}}', imgId])) ??
            ''
          ).trim()
        : ''
      commits.add(commit && commit !== '<no value>' ? commit : '')
    } else {
      baseImages[svc] = imgId
    }
  }
  for (const svc of Object.keys(APP_SERVICES)) if (!containers[svc]) commits.add('')
  const sourceSha = commits.size === 1 ? [...commits][0] || null : `mixed:${[...commits].sort().join(',')}`

  const webDefaults = {}
  const webDefaultIds = {}
  for (const [p, tag] of Object.entries(readImageTags(srcDir))) {
    const id = imageId(docker, tag)
    webDefaults[p] = id ? tag : null
    webDefaultIds[p] = id
  }
  const mig = docker([
    'exec',
    QA.postgresContainer,
    'psql',
    '-U',
    'tracy',
    '-d',
    'tracy',
    '-At',
    '-c',
    'select name from schema_migration order by name'
  ])
  const rules = readRules({ docker, runId })
  return {
    sourceSha,
    compose,
    composeHash: sha256(JSON.stringify(Object.entries(compose).sort())),
    baseImages,
    webDefaults,
    webDefaultIds,
    migrations: mig.code === 0 ? lines(mig.stdout).sort() : null,
    netfilterHash: rules.ok ? compareRules(rules.text).hash : null,
    toolSha: previous?.toolSha ?? null
  }
}

const canon = (v) =>
  JSON.stringify(
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v
  )

export function diff(want, have) {
  return COMPARED.filter((f) => canon(want[f]) !== canon(have[f])).map((field) => ({
    field,
    desired: want[field],
    actual: have[field]
  }))
}

export function decide(want, have) {
  const d = diff(want, have)
  return { rebuild: d.length > 0, reasons: d.map((x) => x.field) }
}

export function writeStand(
  record,
  { file = path.join(stateDir(qaHome()), 'stand.json'), write = writeJsonAtomic } = {}
) {
  write(file, record)
}
