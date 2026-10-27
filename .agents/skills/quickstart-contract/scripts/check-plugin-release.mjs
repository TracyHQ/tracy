#!/usr/bin/env node
// A published Claude Cowork plugin release must carry the contract byte for byte as the tch profile
// has it: Tracy pins a minimum plugin version per contract, and a release that misses or alters the
// three files leaves every site built on that minimum without (or with a different) contract.
//
// Usage: node check-plugin-release.mjs --version <X> --contract-id <slug/j6/ver> --profile <tch profile dir>
// Downloads pkg_claudecowork-<X>.zip of release joomla-v<X> on TracyHQ/claude-cowork, opens the nested
// packages/com_claudecowork.zip and compares administrator/lib/contracts/<id>/{manifest,content-map,
// presentation-lock}.json with the profile. A slim release (after joomla-v0.24.53) packs no profile:
// its component holds administrator/lib/contracts.json (id -> asset, sha256, bytes) and each profile
// is its own asset of the release, <id with "/" -> "--">.zip with the files at its root; that asset is
// downloaded, held to the index's sha256 and bytes, and compared instead. Prints one JSON line on
// stdout; exit 0 = pass, 1 = fail or release unreachable.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const PLUGIN_REPO = 'TracyHQ/claude-cowork'
const FILES = ['manifest.json', 'content-map.json', 'presentation-lock.json']

let dir

function finish(result) {
  if (dir) rmSync(dir, { recursive: true, force: true })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(result.ok ? 0 : 1)
}

function fail(message, extra = {}) {
  process.stderr.write(`check-plugin-release: ${message}\n`)
  finish({ ok: false, error: message, ...extra })
}

function run(command, commandArgs) {
  return execFileSync(command, commandArgs, { stdio: ['ignore', 'ignore', 'pipe'] })
}

let args
try {
  ;({ values: args } = parseArgs({
    options: {
      version: { type: 'string' },
      'contract-id': { type: 'string' },
      profile: { type: 'string' }
    }
  }))
} catch (error) {
  fail(error.message)
}
const { version, profile } = args
const contractId = args['contract-id']
if (!version || !contractId || !profile) fail('--version, --contract-id and --profile are required')
// The id becomes an unzip member path: plain segments only, no wildcards or "..".
if (!/^[a-z0-9-]+\/j\d+\/[0-9.]+$/.test(contractId) || contractId.includes('..'))
  fail(`--contract-id must look like <slug>/j6/<version>, got ${contractId}`)

const tag = `joomla-v${version}`
const asset = `pkg_claudecowork-${version}.zip`
dir = mkdtempSync(join(tmpdir(), 'check-plugin-release-'))

try {
  run('gh', ['release', 'download', tag, '-R', PLUGIN_REPO, '-p', asset, '-D', dir])
} catch (error) {
  fail(
    `cannot download ${asset} of ${PLUGIN_REPO} release ${tag}: ${error.stderr?.toString().trim() || error.message}`
  )
}
if (!existsSync(join(dir, asset))) fail(`release ${tag} has no asset ${asset}`)

try {
  run('unzip', ['-q', '-o', join(dir, asset), 'packages/com_claudecowork.zip', '-d', dir])
} catch (error) {
  fail(`${asset} has no packages/com_claudecowork.zip: ${error.stderr?.toString().trim() || error.message}`)
}

const inner = join(dir, 'packages', 'com_claudecowork.zip')
const members = FILES.map((f) => `administrator/lib/contracts/${contractId}/${f}`)
try {
  run('unzip', ['-q', '-o', inner, ...members, 'administrator/lib/contracts.json', '-d', join(dir, 'inner')])
} catch {
  // unzip exits 11 when some members are missing; the per-file check below names them.
}

// A slim release: the profile is the asset its index names, checked against the index first.
const indexPath = join(dir, 'inner', 'administrator/lib/contracts.json')
let fromAsset
if (existsSync(indexPath) && !members.some((m) => existsSync(join(dir, 'inner', m)))) {
  let row
  try {
    row = JSON.parse(readFileSync(indexPath, 'utf8'))?.contracts?.[contractId]
  } catch (error) {
    fail(`administrator/lib/contracts.json of ${asset} does not read: ${error.message}`)
  }
  if (!row) fail(`${asset} does not list ${contractId} in administrator/lib/contracts.json`)
  fromAsset = String(row.asset ?? '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(fromAsset) || fromAsset.includes('..'))
    fail(`the index names ${contractId}'s asset as "${fromAsset}"`)
  try {
    run('gh', ['release', 'download', tag, '-R', PLUGIN_REPO, '-p', fromAsset, '-D', dir])
  } catch (error) {
    fail(
      `cannot download ${fromAsset} of release ${tag}: ${error.stderr?.toString().trim() || error.message}`
    )
  }
  const bytes = readFileSync(join(dir, fromAsset))
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== row.bytes || digest !== String(row.sha256).toLowerCase())
    fail(
      `${fromAsset} is ${bytes.length} bytes, sha256 ${digest}; the index says ${row.bytes}, ${row.sha256}`
    )
  const into = join(dir, 'inner', `administrator/lib/contracts/${contractId}`)
  // unzip creates one folder level only.
  mkdirSync(into, { recursive: true })
  try {
    run('unzip', ['-q', '-o', join(dir, fromAsset), ...FILES, '-d', into])
  } catch {
    // Missing members are named per file below.
  }
}

const files = FILES.map((name, i) => {
  const packed = join(dir, 'inner', members[i])
  const local = join(profile, name)
  if (!existsSync(local)) return { name, ok: false, problem: 'missing in profile' }
  if (!existsSync(packed))
    return { name, ok: false, problem: fromAsset ? `missing in ${fromAsset}` : 'missing in plugin release' }
  const same = readFileSync(packed).equals(readFileSync(local))
  return { name, ok: same, ...(same ? {} : { problem: 'bytes differ' }) }
})

const ok = files.every((f) => f.ok)
for (const f of files.filter((f) => !f.ok)) {
  process.stderr.write(`check-plugin-release: ${contractId}/${f.name}: ${f.problem}\n`)
}
finish({
  ok,
  release: tag,
  asset,
  ...(fromAsset ? { contractAsset: fromAsset } : {}),
  contractId,
  profile,
  files
})
