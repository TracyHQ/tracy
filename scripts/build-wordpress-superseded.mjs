#!/usr/bin/env node
/**
 * Keep `superseded.json` of every WordPress contract profile in step with its base files, and
 * with `--check` refuse when it is not.
 *
 * WHY A MACHINE: a site sealed to a profile stores the profile's base hash. When a released profile
 * is regenerated in place — a slot's limit or input corrected, the presentation lock untouched —
 * every site already sealed to it answers `contract_failed: Installed content contract changed`
 * on every write, after the Claude Cowork plugin updates itself (measured 25/09/2026: Claude Cowork plugin 0.13.6 and
 * 0.13.7 did exactly this to `tracy-business/wp7/1.1.0` and `1.2.0`). The Claude Cowork plugin accepts a
 * binding to an earlier base hash only when `superseded.json` names it AND its presentation lock
 * is these bytes. Nobody remembers to add the old hash by hand; this script does, from the file
 * itself (no git history: CI checks out one commit).
 *
 * Shape (`tracy-quickstart-superseded/wordpress/v1`):
 *   { contract, baseHash, presentationLock, demoTrimHash|null, accepts: [ { baseHash,
 *     presentationLock, demoTrimHash?, receivers?, reason } ] } (vocabulary-allow: published key)
 * `baseHash`/`presentationLock`/`demoTrimHash` describe the CURRENT bytes. Run after the content
 * map, demo-trim map and editions are regenerated: when the base changed, the previous base (and
 * the demo-trim hash that went with it) moves into `accepts`. A changed presentation lock is
 * refused — that is a new profile version, not a correction.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { baseHashOf } from './build-wordpress-editions.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTRACTS =
  process.env.TRACY_WP_CONTRACTS ??
  path.resolve(HERE, '..', 'packages/cms/tracy-wordpress-quickstart/contracts')
const check = process.argv.includes('--check')
const SCHEMA = 'tracy-quickstart-superseded/wordpress/v1'
// Frozen bytes: this text is written into released profiles, which are sealed artifacts. It keeps
// the plugin's pre-rename name (27/09/2026) until a new profile version is released.
const COMMENT =
  'Earlier bytes of this released profile a sealed site may still be bound to. The receiver accepts a binding to one of these base hashes only while presentation-lock.json is the same bytes, and moves the binding to this profile on its next validated write. Regenerate with scripts/build-wordpress-superseded.mjs after the profile; never list a base whose presentation lock differs.' // vocabulary-allow: text of an already released profile

const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/** Every `<design>/wp<major>/<version>` directory holding a manifest. */
function profiles(root) {
  const out = []
  for (const design of existsSync(root) ? readdirSync(root) : []) {
    for (const major of readdirSync(path.join(root, design)).filter((d) => /^wp\d+$/.test(d))) {
      for (const version of readdirSync(path.join(root, design, major))) {
        const dir = path.join(root, design, major, version)
        if (existsSync(path.join(dir, 'manifest.json')))
          out.push({ id: `${design}/${major}/${version}`, dir })
      }
    }
  }
  return out
}

/** The file this profile should carry, given the one it carries now (or null). Throws on a changed lock. */
export function nextSuperseded(id, dir, existing) {
  const baseHash = baseHashOf(dir)
  const presentationLock = sha256(readFileSync(path.join(dir, 'presentation-lock.json')))
  const trimFile = path.join(dir, 'demo-trim-map.json')
  const demoTrimHash = existsSync(trimFile) ? sha256(readFileSync(trimFile)) : null
  const accepts = [...(existing?.accepts ?? [])]
  if (existing && existing.baseHash !== baseHash) {
    if (existing.presentationLock !== presentationLock)
      throw new Error(
        `${id}: the presentation lock changed since ${existing.baseHash.slice(0, 12)} — publish a new profile version instead of correcting this one in place`
      )
    if (!accepts.some((a) => a.baseHash === existing.baseHash)) {
      const entry = {
        baseHash: existing.baseHash,
        presentationLock,
        reason: 'Released in place with other slot write rules; the presentation lock is the same bytes.'
      }
      if (existing.demoTrimHash) entry.demoTrimHash = existing.demoTrimHash
      accepts.push(entry)
    }
  }
  for (const entry of accepts)
    if (entry.presentationLock !== presentationLock)
      throw new Error(`${id}: superseded ${entry.baseHash.slice(0, 12)} names another presentation lock`)
  return {
    schemaVersion: SCHEMA,
    $comment: COMMENT,
    contract: id,
    baseHash,
    presentationLock,
    demoTrimHash,
    accepts: accepts.filter((a) => a.baseHash !== baseHash)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = []
  let written = 0
  for (const { id, dir } of profiles(CONTRACTS)) {
    const file = path.join(dir, 'superseded.json')
    const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
    let next
    try {
      next = nextSuperseded(id, dir, existing)
    } catch (error) {
      problems.push(error.message)
      continue
    }
    const text = JSON.stringify(next, null, 2) + '\n'
    if (existing && readFileSync(file, 'utf8') === text) continue
    if (check)
      problems.push(
        `${id}: superseded.json is ${existing ? 'stale' : 'missing'} — run node scripts/build-wordpress-superseded.mjs`
      )
    else {
      writeFileSync(file, text)
      written++
    }
  }
  if (problems.length) {
    console.error(`WordPress superseded profiles: ${problems.length} problem(s)\n`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log(
    check
      ? 'WordPress superseded profiles: every profile names its current bytes.'
      : `WordPress superseded profiles: ${written} written.`
  )
}
