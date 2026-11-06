#!/usr/bin/env node
/**
 * Write `src/lib/template-readiness/cowork-plugin-doors.json`: what each released Claude Cowork for Joomla package offers
 * of the doors the write step declares (`src/write-step/plugin-doors.js`), read from the package's own bytes
 * (`plugin-doors-of-package.js`). The readiness verdict's write doors check reads this file, so no check downloads a zip.
 *
 *   node apps/tracy-web/scripts/cowork-plugin-doors.mjs [--from 0.24.80] [--dry-run]
 *
 * The releases read: every Joomla version `quickstarts.json` pins, and every published `joomla-v*` release of
 * TracyHQ/claude-cowork at or above `--from` (the newest one is the version a missing door's fix names). A release
 * already in the file is read again only when the write step declares a door the file has no answer for. A pinned
 * package is held to the sha256 its pin states. Run it after pinning a new plugin version or adding a door.
 * Uses `GITHUB_TOKEN` when set (the release list is public; the token only lifts the rate limit).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { MAX_ARTIFACT_BYTES } from '../src/lib/cowork-contract-evidence.js'
import { coworkNewer, coworkPackageUrl } from '../src/lib/cowork-install.js'
import { evidenceOfPackage } from '../src/lib/template-readiness/plugin-doors-of-package.js'
import { readPins } from '../src/lib/template-readiness/pinned-release.js'
import { WRITE_STEP_DOORS } from '../src/write-step/plugin-doors.js'

const OUT = fileURLToPath(new URL('../src/lib/template-readiness/cowork-plugin-doors.json', import.meta.url))
const RELEASES_API = 'https://api.github.com/repos/TracyHQ/claude-cowork/releases?per_page=100'

const headers = () =>
  process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}

/** Every published Joomla release version of the plugin. */
async function publishedVersions() {
  const out = []
  for (let page = 1; page < 20; page += 1) {
    const res = await fetch(`${RELEASES_API}&page=${page}`, { headers: headers() })
    if (!res.ok) throw new Error(`the release list answered ${res.status}`)
    const list = await res.json()
    for (const r of list)
      if (!r.draft && !r.prerelease && typeof r.tag_name === 'string' && r.tag_name.startsWith('joomla-v'))
        out.push(r.tag_name.slice('joomla-v'.length))
    if (list.length < 100) break
  }
  return out
}

/** The package bytes of one version, held to `sha256` when a pin states it. */
async function packageOf(url, sha256) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error(`${url} is larger than ${MAX_ARTIFACT_BYTES} bytes`)
  const got = createHash('sha256').update(bytes).digest('hex')
  if (sha256 && got !== sha256.toLowerCase())
    throw new Error(`${url} has sha256 ${got}, the pin states ${sha256}`)
  return { bytes, sha256: got }
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { from: { type: 'string', default: '0.24.80' }, 'dry-run': { type: 'boolean' } }
  })
  const evidences = WRITE_STEP_DOORS.map((d) => d.evidence)
  /** @type {Map<string, { url: string, sha256?: string }>} */
  const wanted = new Map()
  for (const entry of Object.values(readPins()))
    if (entry.platform === 'joomla' && typeof entry.cowork?.version === 'string')
      wanted.set(entry.cowork.version, { url: entry.cowork.url, sha256: entry.cowork.sha256 })
  for (const v of await publishedVersions())
    if (!wanted.has(v) && !coworkNewer(values.from, v))
      wanted.set(v, { url: String(coworkPackageUrl('joomla', v)) })

  let old = { releases: {} }
  try {
    old = JSON.parse(readFileSync(OUT, 'utf8'))
  } catch (error) {
    // No file yet: every release is read. A file that does not parse is an error, never a reason to start over quietly.
    if (/** @type {any} */ (error)?.code !== 'ENOENT') throw error
  }
  /** @type {Record<string, any>} */
  const releases = {}
  const versions = [...wanted.keys()].sort((a, b) => (coworkNewer(a, b) ? 1 : coworkNewer(b, a) ? -1 : 0))
  for (const version of versions) {
    const kept = old.releases?.[version]
    const { sha256: pinned } = /** @type {{ sha256?: string }} */ (wanted.get(version))
    // Kept only while it answers every door and is the very package a pin states (a pin never changes bytes in place).
    const same = !pinned || kept?.sha256 === pinned.toLowerCase()
    if (kept && same && evidences.every((e) => typeof kept.evidence?.[e] === 'boolean')) {
      releases[version] = kept
      continue
    }
    const { url, sha256 } = /** @type {{ url: string, sha256?: string }} */ (wanted.get(version))
    const pkg = await packageOf(url, sha256)
    const read = evidenceOfPackage(pkg.bytes, evidences)
    if (read.version !== version) throw new Error(`${url} says it is ${read.version}, not ${version}`)
    releases[version] = { sha256: pkg.sha256, evidence: { ...kept?.evidence, ...read.evidence } }
    process.stdout.write(
      `${version} ${Object.values(read.evidence).filter(Boolean).length}/${evidences.length}\n`
    )
  }
  const doc = { platform: 'joomla', from: values.from, releases }
  if (values['dry-run']) process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
  else writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exit(2)
    }
  )
