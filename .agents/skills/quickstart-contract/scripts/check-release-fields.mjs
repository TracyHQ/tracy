#!/usr/bin/env node
// K2+K3: the version and release name a contract was captured for must match the quickstart it
// claims to describe. Two modes, exactly one per run:
//   --pack <dir>     the local pack the contract was captured from (before publishing)
//   --release <tag>  the published release on JoomlArt-Products/ja-products (after publishing)
// A source that cannot be reached is a failure, never a skip: a skipped check reads as a pass.
//
// Usage: node check-release-fields.mjs --contract <dir with manifest.json> (--pack <dir> | --release <tag>)
// Prints one JSON line on stdout; exit 0 = pass, 1 = fail or source unreachable.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const RELEASE_REPO = 'JoomlArt-Products/ja-products'

function finish(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(result.ok ? 0 : 1)
}

function fail(message) {
  process.stderr.write(`check-release-fields: ${message}\n`)
  finish({ ok: false, error: message })
}

// null, arrays and scalars are valid JSON but carry no fields; reading one must fail, not throw.
function parseObject(text, path) {
  const value = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} is not a JSON object`)
  }
  return value
}

function readJson(path) {
  try {
    return parseObject(readFileSync(path, 'utf8'), path)
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`)
  }
}

// One comparison row: every listed value must be equal to the first, character for character.
function same(field, values) {
  const [first] = Object.values(values)
  return { field, values, ok: Object.values(values).every((v) => typeof v === 'string' && v === first) }
}

let args
try {
  ;({ values: args } = parseArgs({
    options: { contract: { type: 'string' }, pack: { type: 'string' }, release: { type: 'string' } }
  }))
} catch (error) {
  fail(error.message)
}
if (!args.contract) fail('--contract is required')
if (Boolean(args.pack) === Boolean(args.release)) fail('give exactly one of --pack or --release')

const quickstart = readJson(join(args.contract, 'manifest.json')).quickstart ?? {}
const checks = []

if (args.pack) {
  const packManifest = readJson(join(args.pack, 'manifest.json'))
  const setting = readJson(join(args.pack, 'tracy_setting.json'))
  checks.push(
    same('version', {
      'contract quickstart.version': quickstart.version,
      'pack manifest.json version': packManifest.version,
      'pack tracy_setting.json version': setting.version
    }),
    same('release', {
      'contract quickstart.release': quickstart.release,
      'pack manifest.json release': packManifest.release
    })
  )
} else {
  const dir = mkdtempSync(join(tmpdir(), 'check-release-fields-'))
  let setting
  try {
    execFileSync(
      'gh',
      ['release', 'download', args.release, '-R', RELEASE_REPO, '-p', 'tracy_setting.json', '-D', dir],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )
    setting = parseObject(readFileSync(join(dir, 'tracy_setting.json'), 'utf8'), 'tracy_setting.json')
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message
    rmSync(dir, { recursive: true, force: true })
    fail(`cannot download tracy_setting.json of ${RELEASE_REPO} release ${args.release}: ${detail}`)
  }
  rmSync(dir, { recursive: true, force: true })
  checks.push(
    same('version', {
      'contract quickstart.version': quickstart.version,
      [`release ${args.release} tracy_setting.json version`]: setting.version
    }),
    same('release', { 'contract quickstart.release': quickstart.release, '--release': args.release })
  )
}

const ok = checks.every((c) => c.ok)
if (!ok) {
  for (const c of checks.filter((c) => !c.ok)) {
    process.stderr.write(`check-release-fields: ${c.field} differs: ${JSON.stringify(c.values)}\n`)
  }
}
finish({ ok, mode: args.pack ? 'pack' : 'release', contract: args.contract, checks })
