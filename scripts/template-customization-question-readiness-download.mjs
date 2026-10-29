#!/usr/bin/env node
/**
 * Fill a download cache with the releases Design inspiration shows, for the Template Customization
 * Question Readiness check (`template-customization-question-readiness.mjs --all <cacheDir>`).
 *
 *   node scripts/template-customization-question-readiness-download.mjs <cacheDir>
 *     [--only-small] [--with-webroot] [--tag <tag>]... [--api <url>] [--jobs <n>]
 *
 * The gallery is read from `GET <api>` (default https://cowork.tracy.site/api/templates, public);
 * each release's assets go into `releaseCacheDir(cacheDir, tag)` with `gh release download` from
 * `JoomlArt-Products/joomlart-products` (so `gh` must be signed in with read access). By default the
 * small assets (every JSON file, SHA256SUMS) plus what the readers open (`contentAssetsOf`: the demo
 * database or installer zip, the EmDash source zip, the WordPress theme zip); `--only-small` fetches
 * the small ones only; `--with-webroot` adds the webroot tar.gz. A file already in the cache with
 * the size GitHub reports is skipped. `--tag` limits the run to the named releases.
 * `gallery-releases.json` in the cache records every release the gallery showed, in its order
 * (all of them, also when `--tag` limits what is fetched).
 *
 * One asset that fails is reported and the run goes on. Exit code 1 when any asset failed.
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import {
  contentAssetsOf,
  galleryReleases,
  isSmallAsset
} from '../apps/tracy-web/src/lib/template-customization-question-readiness/gallery-cache.js'
import { releaseCacheDir } from '../apps/tracy-web/src/lib/template-customization-question-readiness/release-source.js'
import { RELEASES_REPO } from '../apps/tracy-web/src/lib/quickstart-releases.js'

const run = promisify(execFile)
const GH_BUFFER = 64 * 1024 * 1024

/** @param {string[]} argv */
function parse(argv) {
  const out = {
    cacheDir: /** @type {string | null} */ (null),
    onlySmall: false,
    withWebroot: false,
    tags: /** @type {string[]} */ ([]),
    api: 'https://cowork.tracy.site/api/templates',
    jobs: 4
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--only-small') out.onlySmall = true
    else if (a === '--with-webroot') out.withWebroot = true
    else if (a === '--tag') out.tags.push(argv[++i])
    else if (a === '--api') out.api = argv[++i]
    else if (a === '--jobs') out.jobs = Math.max(1, Number(argv[++i]) || 1)
    else if (!a.startsWith('--') && !out.cacheDir) out.cacheDir = a
    else throw new Error(`unknown argument ${a}`)
  }
  if (!out.cacheDir)
    throw new Error(
      'usage: template-customization-question-readiness-download.mjs <cacheDir> [--only-small] [--with-webroot] [--tag <tag>]...'
    )
  return out
}

/** The size of a cached file, or null when it is not there. */
const sizeOf = (/** @type {string} */ file) =>
  stat(file).then(
    (s) => s.size,
    () => null
  )

/** Every asset of one release, `{ name, size }`. */
async function assetsOf(/** @type {string} */ tag) {
  const { stdout } = await run('gh', ['release', 'view', tag, '-R', RELEASES_REPO, '--json', 'assets'], {
    maxBuffer: GH_BUFFER
  })
  return /** @type {{ name: string, size: number }[]} */ (JSON.parse(stdout).assets)
}

/**
 * Download the named assets of one release that the cache lacks or holds at another size.
 * @param {string} tag
 * @param {string} dir
 * @param {{ name: string, size: number }[]} assets
 * @param {string[]} names
 * @param {{ bytes: number, skipped: number, failures: string[] }} tally
 */
async function fetchAssets(tag, dir, assets, names, tally) {
  for (const name of names) {
    const asset = assets.find((a) => a.name === name)
    if (!asset) continue
    const file = path.join(dir, name)
    // eslint-disable-next-line no-await-in-loop -- one file at a time per release.
    if ((await sizeOf(file)) === asset.size) {
      tally.skipped += 1
      continue
    }
    try {
      // The pattern is a plain name: `gallery-cache.js` lets through no glob character.
      // eslint-disable-next-line no-await-in-loop -- same.
      await run('gh', ['release', 'download', tag, '-R', RELEASES_REPO, '-p', name, '-D', dir, '--clobber'], {
        maxBuffer: GH_BUFFER
      })
      // eslint-disable-next-line no-await-in-loop -- same.
      const got = await sizeOf(file)
      if (got !== asset.size) throw new Error(`size ${got} instead of ${asset.size}`)
      tally.bytes += asset.size
    } catch (e) {
      tally.failures.push(`${tag} ${name}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
    }
  }
}

/** One release: small assets first, then what its setting says the readers open. */
async function fetchRelease(/** @type {string} */ cacheDir, /** @type {string} */ tag, opts, tally) {
  const dir = releaseCacheDir(cacheDir, tag)
  await mkdir(dir, { recursive: true })
  let assets
  try {
    assets = await assetsOf(tag)
  } catch (e) {
    tally.failures.push(`${tag}: release not readable: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    return
  }
  await fetchAssets(tag, dir, assets, assets.map((a) => a.name).filter(isSmallAsset), tally)
  if (opts.onlySmall) return
  let setting
  try {
    setting = JSON.parse(await readFile(path.join(dir, 'tracy_setting.json'), 'utf8'))
  } catch {
    tally.failures.push(`${tag}: no readable tracy_setting.json, content not fetched`)
    return
  }
  const names = contentAssetsOf(
    setting,
    assets.map((a) => a.name),
    { withWebroot: opts.withWebroot }
  )
  await fetchAssets(tag, dir, assets, names, tally)
}

async function main() {
  let args
  try {
    args = parse(process.argv.slice(2))
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    return 2
  }
  const cacheDir = path.resolve(/** @type {string} */ (args.cacheDir))
  const response = await fetch(args.api, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    console.error(`${args.api} answered ${response.status}`)
    return 2
  }
  const { releases, skipped } = galleryReleases(await response.json())
  for (const s of skipped) console.warn(`skipped: ${s}`)
  const chosen = args.tags.length ? releases.filter((r) => args.tags.includes(r.tag)) : releases
  await mkdir(cacheDir, { recursive: true })
  await writeFile(
    path.join(cacheDir, 'gallery-releases.json'),
    `${JSON.stringify({ readFrom: args.api, readAt: new Date().toISOString(), releases }, null, 2)}\n`
  )

  const started = Date.now()
  const tally = { bytes: 0, skipped: 0, failures: /** @type {string[]} */ ([]) }
  const queue = [...chosen]
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      // eslint-disable-next-line no-await-in-loop -- each worker takes one release at a time.
      await fetchRelease(cacheDir, r.tag, args, tally)
      console.log(`done ${r.tag}`)
    }
  }
  await Promise.all(Array.from({ length: args.jobs }, worker))
  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(
    `\n${chosen.length} releases, ${(tally.bytes / 1024 / 1024).toFixed(1)} MB downloaded, ` +
      `${tally.skipped} files already cached, ${seconds}s, ${tally.failures.length} failed`
  )
  for (const f of tally.failures) console.log(`FAILED ${f}`)
  return tally.failures.length ? 1 : 0
}

process.exitCode = await main()
