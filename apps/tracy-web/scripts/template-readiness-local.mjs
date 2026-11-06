/**
 * The `--local` half of `template-readiness.mjs`: read one release from GitHub through `gh`, download what the two
 * stored checks read into a cache folder of this machine, and run the Customize your site and Design system checks
 * here, with the server's own code (the child runners, the Claude Cowork evidence reader, the asset choices). No rule
 * is added or changed: the results have the shape `template_readiness` stores, so the verdict judges them like /ops.
 *
 * What only a server knows is not judged here and is said so by the caller: DEMO-1 (this server's own demo of the
 * release, which the Add site preview dresses) and the preview door's health.
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { coworkEvidenceOf, needsWebroot, runCheckInChild } from '../src/lib/customize-readiness.js'
import { runDsCheckInChild } from '../src/lib/design-system-readiness.js'
import { digestsOf, readingOf, RELEASES_REPO } from '../src/lib/quickstart-releases.js'
import {
  contentAssetsOf,
  isSmallAsset
} from '../src/lib/template-customization-question-readiness/gallery-cache.js'
import { dsAssetsOf } from '../src/lib/template-design-system-readiness/assets.js'
import { normalizeSetting, validateDesignInspiration, validateSetting } from '../src/lib/tracy-setting.mjs'

const run = promisify(execFile)
const GH_BUFFER = 64 * 1024 * 1024

/** `gh` with its output as text. @param {string[]} args */
async function gh(args) {
  const { stdout } = await run('gh', args, { maxBuffer: GH_BUFFER })
  return stdout
}

/** The token `gh` is signed in with, or null (public assets still read). */
async function ghToken() {
  try {
    return (await gh(['auth', 'token'])).trim() || null
  } catch {
    return null
  }
}

/** Every asset either check reads, by the server's own choices (`sourceFolder` of each check). */
function wantedAssets(setting, names) {
  return new Set([
    ...names.filter(isSmallAsset),
    ...contentAssetsOf(setting, names, { withWebroot: needsWebroot(setting, names) }),
    ...dsAssetsOf(setting, names)
  ])
}

/** Download `names` of the release into `dir`, skipping a file already there with the size GitHub states. */
async function download(tag, assets, names, dir) {
  await mkdir(dir, { recursive: true })
  for (const a of assets.filter((x) => names.has(x.name))) {
    const have = await stat(path.join(dir, a.name)).catch(() => null)
    if (have && have.size === a.size) continue
    // eslint-disable-next-line no-await-in-loop -- one file at a time keeps memory and bandwidth flat.
    await gh(['release', 'download', tag, '-R', RELEASES_REPO, '-p', a.name, '-D', dir, '--clobber'])
  }
}

/** A small JSON asset already downloaded, or null. */
async function jsonIn(dir, name) {
  try {
    return JSON.parse(await readFile(path.join(dir, name), 'utf8'))
  } catch {
    return null
  }
}

/**
 * The release row GitHub gives for `tag` (as `readReleases` returns it) and the two stored checks run here.
 * @param {string} tag
 * @param {{ cacheDir: string, log?: (s: string) => void }} opts
 */
export async function localWorld(tag, { cacheDir, log = () => {} }) {
  const gitRelease = JSON.parse(
    await gh(['api', `repos/${RELEASES_REPO}/releases/tags/${encodeURIComponent(tag)}`])
  )
  const assets = gitRelease.assets ?? []
  const names = assets.map((a) => a.name)
  const dir = path.join(cacheDir, tag.replaceAll('/', '_'))
  await download(tag, assets, new Set(names.filter(isSmallAsset)), dir)
  const doc = await jsonIn(dir, 'tracy_setting.json')
  const problems = doc
    ? validateSetting(doc, { assets: names, digests: digestsOf(assets) })
    : ['no tracy_setting.json']
  const setting = problems.length === 0 ? normalizeSetting(doc) : null
  const card = setting ? await jsonIn(dir, 'tracy_design_inspiration.json') : null
  const cardProblems = card ? validateDesignInspiration(card) : []
  const reading = readingOf(gitRelease, setting, setting ? null : problems.join('; '), {
    inspiration: card && cardProblems.length === 0 ? card : null,
    cardReason: cardProblems.length ? `tracy_design_inspiration.json: ${cardProblems.join('; ')}` : null
  })
  const release = { ...reading, platform: setting?.platform ?? null }
  if (!setting) return { release, readiness: null, dsReadiness: null }
  const version = setting.version
  log(`downloading what the checks read into ${dir}`)
  await download(tag, assets, wantedAssets(setting, names), dir)
  const token = await ghToken()
  const checkedAt = new Date().toISOString()
  const outcome = async (judge) => {
    try {
      return { state: 'done', version, report: await judge(), reason: null, checkedAt }
    } catch (e) {
      return {
        state: 'error',
        version,
        report: null,
        reason: e instanceof Error ? e.message : String(e),
        checkedAt
      }
    }
  }
  log('running Customize your site')
  const readiness = await outcome(async () => {
    const evidence = await coworkEvidenceOf(release, { token, fetchImpl: fetch, cacheDir })
    const file = path.join(cacheDir, `${tag.replaceAll('/', '_')}-cowork-evidence.json`)
    await writeFile(file, JSON.stringify(evidence))
    return runCheckInChild(dir, tag, file)
  })
  log('running Design system')
  const dsReadiness = await outcome(() => runDsCheckInChild(dir, tag))
  return { release, readiness, dsReadiness }
}
