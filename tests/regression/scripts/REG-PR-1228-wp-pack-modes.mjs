#!/usr/bin/env node
/**
 * REG-PR-1228: the WordPress mode fix-forward stays fixed, read off the tree:
 *   S1 each of the eight mode-fixed versions has a contract whose webroot part names its own archive, and a
 *      template-profiles.json row,
 *   S2 the mode reader behind STAB-1 and scripts/check-pack-modes.mjs refuses a 0600/0700 webroot and accepts a
 *      0644/0755 one (an archive written here, ustar),
 *   S3 moved to scripts/test/check-pack-modes.test.mjs (the quickstart-contract skill never wraps a restore or
 *      a pack in umask 077), a worker test CI runs whenever the skill changes,
 *   S4 the template-data CI lane: a contract-only diff plans the narrow checks row, a contract plus code diff
 *      plans exactly what it planned without the lane, and an unreadable tree plans every row.
 * Exit 1 with the first broken step; prints one line per step.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { webrootModes } from '../../../apps/tracy-web/src/lib/template-customization-question-readiness/readers/webroot-modes.js'
import { planMatrix } from '../../../scripts/ci/plan-ci.mjs'
import { repoReader } from '../../../scripts/ci/related-tests.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts')
const RELEASES = [
  ['quickstart/ja-essence/wp7', 'ja-essence', '1.0.18'],
  ['quickstart/ja-impact/wp7', 'ja-impact', '1.0.9'],
  ['quickstart/ja-kinetic/wp7', 'ja-kinetic', '1.0.9'],
  ['quickstart/ja-morgan/wp7', 'ja-morgan', '1.1.14'],
  ['quickstart/ja-nova/wp7', 'ja-nova', '1.1.12'],
  ['quickstart/ja-vega/wp7', 'ja-vega', '1.1.14'],
  ['tracy-base/wp7', 'tracy-base', '1.1.4'],
  ['tracy-business/wp7', 'tracy-business', '1.3.6']
]
let failed = false
const step = (name, problems) => {
  console.log(
    `${problems.length ? 'FAIL' : 'PASS'} ${name}${problems.length ? `: ${problems.join('; ')}` : ''}`
  )
  if (problems.length) failed = true
}

const s1 = []
const profiles = JSON.parse(
  readFileSync(path.join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8')
)
for (const [tag, slug, version] of RELEASES) {
  const m = JSON.parse(readFileSync(path.join(CONTRACTS, slug, 'wp7', version, 'manifest.json'), 'utf8'))
  if (m.id !== `${slug}/wp7/${version}` || m.quickstart.version !== version)
    s1.push(`${slug} ${version}: manifest id/version`)
  if (m.quickstart.parts.webroot.file !== `${slug}-wp7-webroot-${version}.tar.gz`)
    s1.push(`${slug} ${version}: webroot part`)
  if (!profiles.releases?.[tag]?.[version]) s1.push(`${tag} ${version}: no profile row`)
}
step('S1 contracts and profile rows of the eight mode-fixed versions', s1)

/** A gzipped ustar of `[name, mode]`; a name ending in `/` is a directory. */
function tarOf(members) {
  const blocks = []
  for (const [name, mode] of members) {
    const dir = name.endsWith('/')
    const body = dir ? Buffer.alloc(0) : Buffer.from('<?php\n')
    const h = Buffer.alloc(512)
    const octal = (v, w) => `${v.toString(8).padStart(w - 1, '0')}\0`
    h.write(name, 0, 100)
    h.write(octal(mode, 8), 100)
    h.write(octal(0, 8), 108)
    h.write(octal(0, 8), 116)
    h.write(octal(body.length, 12), 124)
    h.write(octal(1577836800, 12), 136)
    h.write(dir ? '5' : '0', 156)
    h.write('ustar\u000000', 257)
    h.fill(' ', 148, 156)
    let sum = 0
    for (const b of h) sum += b
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(h, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}
const bad = webrootModes(
  tarOf([
    ['./', 0o700],
    ['./wp-load.php', 0o600]
  ])
)
const good = webrootModes(
  tarOf([
    ['./', 0o755],
    ['./wp-load.php', 0o644]
  ])
)
step('S2 the mode reader refuses 0600/0700 and accepts 0644/0755', [
  ...(bad.wrong.length === 2 ? [] : [`0600/0700 archive: ${bad.wrong.length} wrong`]),
  ...(good.wrong.length === 0 ? [] : [`0644/0755 archive: ${good.wrong.length} wrong`])
])

// S3 (the quickstart-contract skill keeps umask 077 off restores and packs) now lives in the worker
// test scripts/test/check-pack-modes.test.mjs, which CI runs whenever the skill changes.

const allFiles = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\0')
  .filter(Boolean)
const contract = `packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7/1.0.18/manifest.json`
const plan = (changed, readText) =>
  planMatrix({ event: 'pull_request', baseRef: 'develop', changed, allFiles, readText })
const s4 = []
const lane = plan([contract], repoReader(ROOT))
const checks = lane.matrix.include.find((r) => r.group === 'checks')
if (lane.related?.lane !== 'template-data' || !checks?.args.startsWith('--only lint'))
  s4.push('contract-only diff is not in the lane')
if (lane.matrix.include.some((r) => r.group === 'tests 1/2'))
  s4.push('contract-only diff plans the full shards')
const mixed = [contract, 'scripts/check-pack-modes.mjs']
if (JSON.stringify(plan(mixed, repoReader(ROOT)).matrix) !== JSON.stringify(plan(mixed, undefined).matrix))
  s4.push('a mixed diff plans differently with the lane')
const broken = plan([contract], () => {
  throw new Error('EIO')
})
if (!broken.runsAll) s4.push('an unreadable tree does not run every row')
step('S4 the template-data lane is narrow, all-or-nothing and fails closed', s4)

process.exit(failed ? 1 : 0)
