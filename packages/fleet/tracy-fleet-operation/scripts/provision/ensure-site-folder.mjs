#!/usr/bin/env node
/**
 * Build (or top up) the site folder a lane drops its agent into. Runs ON the fleet host.
 *
 * ## Use
 *
 *   ensure-site-folder.mjs <siteFolderPath> <siteKey> [platform] [webrootPath] [origin] [copyAddress] [address]
 *
 * `origin` is `imported` when the webroot was restored from a customer's own server (the import
 * branch of provision.sh); AGENTS.md then says `.webroot/` is Tracy's copy, not the live site.
 *   ensure-site-folder.mjs /srv/tracy/dshwp1/site/dshwp1 dshwp1.tracy.ai joomla /srv/tracy/dshwp1/webroot
 *
 * ## What it does not do, and why that is deliberate
 *
 * It does not create `.webroot/`, and it does not mount anything. `.webroot/` is a bind mount of
 * the running webroot, made when the container starts (by the lane era's `create-lane.sh` until
 * 2026-09-06, by `attach-site.sh` since); an empty directory of
 * that name created here would be indistinguishable from a mount that silently failed — and the
 * agent standing in it would report, fluently, that the site has nothing installed.
 *
 * It does not `git init`, clone, or commit either. Which repository a lane's folder belongs to is
 * the seat book's answer (`POST /sites/<key>/repo`), and a folder that initialises its own git
 * would get a second, unrelated history that pushes nowhere.
 *
 * ## Write-if-missing, without exception
 *
 * A lane is rebuilt far more often than a site is created — recreating a container, moving a lane
 * between hosts, restoring one. Every file here belongs to the team the moment they touch it, so
 * "already there" always wins, and the script says which files it skipped rather than staying
 * quiet about having done nothing.
 */

import { statSync } from 'node:fs'
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { skeletonFiles, topUpAgentsMd } from './siteFolder.mjs'

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/**
 * Which CMS is actually in `.webroot/` — MEASURED, not accepted from the caller.
 *
 * The platform reaches this script as a command-line argument, and on 02/09 it was wrong: `dshwp1`
 * is Joomla and was migrated with `wordpress` on the command line. Nothing failed. The mounts were
 * right either way — the shape only distinguishes "has a webroot" from "has a data.db" — so the
 * only casualty was the sentence in `AGENTS.md`, which then told that site's agent, at the start of
 * every session, that it was working on WordPress.
 *
 * A file whose whole job is to tell the agent where it is must not be able to be confidently wrong.
 * So the webroot is asked directly, by the same two markers `tracy-webroot-read` uses, and the
 * argument is kept only as the fallback for a platform that leaves no file to look at — emdash,
 * whose site is a database.
 *
 * ⚠ THE WEBROOT IS PASSED IN, and it is not `<siteFolder>/.webroot`. This script runs BEFORE the
 * container exists, and `.webroot` is a bind mount that appears only once it does — looking there
 * would find nothing every single time and quietly fall back to the argument, which is precisely
 * the bug this function was written to close. Callers pass the host path they are about to mount.
 *
 * @param webrootPath the directory being mounted as the site, on the host.
 * @param declared what the caller believes, used when the disk cannot say.
 */
export async function detectPlatform(webrootPath, declared = null) {
  if (!webrootPath) return declared
  if (await exists(path.join(webrootPath, 'wp-includes/version.php'))) return 'wordpress'
  if (await exists(path.join(webrootPath, 'configuration.php'))) return 'joomla'
  return declared
}

/**
 * Whether this site is SEALED — read from the content-contract marker with the fence's own rule,
 * so AGENTS.md can never describe an open site the fence has closed, or the other way round.
 *
 * The rule is `hasContentContract` in `tracy-subprocess-docker/src/content-contract.mjs`
 * (which `site-context.mjs` also uses): the marker `<sitesRoot>/.content-contracts/<label>.json`
 * EXISTS → sealed; its contents are never parsed. `test/site-folder.test.mjs` holds the two to the
 * same answer on every fixture.
 *
 * ⚠ RE-STATED HERE, NOT IMPORTED, because of where this file runs. `tracy-host`'s image copies
 * `packages/fleet/tracy-fleet-operation/scripts` alone to `/opt/tracy-fleet` (its Dockerfile) and
 * imports this module from there (`attachSite`); a relative import into `packages/tools/` would
 * resolve to nothing on that host and fail at load, taking provision's site-folder step with it.
 * The parity test is what stops the copy drifting.
 *
 * 🔒 A MARKER THAT CANNOT BE READ SEALS, BECAUSE THE FENCE FAILS CLOSED. Any stat error but "no such
 * file" (`.content-contracts` a regular file → ENOTDIR, an unreadable directory → EACCES) makes the
 * fence throw, and its guard then refuses every tool call on the site. Describing such a site as
 * open would send the agent to doors that are shut — the same choice `site-context.mjs` makes.
 *
 * The site folder IS `<sitesRoot>/<label>` (`lib/roots.sh`: `tracy_site_dir`), so both halves of
 * the marker path come from the folder itself. provision.sh writes the marker in
 * `platform_post_up` (joomla.sh, wordpress.sh), which runs before this script — so a new sealed
 * site is written sealed on its first run, not only on the next top-up.
 *
 * @param {string} siteFolderPath - `<sitesRoot>/<label>`.
 * @returns {boolean}
 */
export function contractSealed(siteFolderPath) {
  const folder = path.resolve(String(siteFolderPath))
  const marker = path.join(path.dirname(folder), '.content-contracts', `${path.basename(folder)}.json`)
  try {
    statSync(marker)
    return true
  } catch (error) {
    return error?.code !== 'ENOENT'
  }
}

export async function ensureSiteFolder(
  siteFolderPath,
  siteKey,
  declared = null,
  webrootPath = null,
  { origin = null, copyAddress = null, address = null } = {}
) {
  const platform = await detectPlatform(webrootPath, declared)
  // MEASURED, like the platform above: never an argument, so no caller can describe a sealed site
  // as open (or the reverse) by passing the wrong word.
  const sealed = contractSealed(siteFolderPath)
  const written = []
  const kept = []
  const toppedUp = []
  for (const [relative, content] of skeletonFiles(siteKey, platform, {
    origin,
    copyAddress,
    address,
    sealed
  })) {
    const target = path.join(siteFolderPath, relative)
    if (await exists(target)) {
      /**
       * THE ONE EXCEPTION TO WRITE-IF-MISSING, and it is narrow by construction. `topUpAgentsMd`
       * rewrites the fenced `tracy:platform` section and, only while each is still byte-for-byte
       * what Tracy shipped, the `.webroot/` paragraph, the start-from paragraph (removed) and the
       * closing note's first line.
       * Everything else in the file — including every word the team wrote — is returned untouched,
       * and the run says which sites it left alone.
       *
       * Without this, a site provisioned before its platform brief existed can never learn it, an
       * EmDash site keeps being told at the start of every session that it has a document root, and
       * a site sealed by a content contract keeps being told its `.webroot/` is open to edit.
       */
      /**
       * THE SECOND EXCEPTION, and it is safer than the first: `.tracy/site.json` is the MACHINE-
       * written identity — nobody hand-edits it, and the comment where it is built says so. It is
       * topped up only by ADDING keys the file lacks; a value already there is never overwritten,
       * so a folder that disagrees with this run keeps its own answer and nothing is lost.
       *
       * Without it, `address` (new on 19/09/2026) would reach only sites provisioned afterwards,
       * and every site already on the fleet would keep leaving its agent to invent one.
       */
      if (relative === '.tracy/site.json') {
        const before = await readFile(target, 'utf8')
        try {
          const had = JSON.parse(before)
          const want = JSON.parse(content)
          const added = Object.keys(want).filter((k) => had[k] === undefined)
          if (added.length > 0) {
            await writeFile(target, `${JSON.stringify({ ...want, ...had }, null, 1)}\n`, 'utf8')
            toppedUp.push(`${relative} (added ${added.join(', ')})`)
            continue
          }
        } catch {
          // Not JSON we wrote. Leave it exactly as it is and say nothing clever about it.
        }
      }

      if (relative === 'AGENTS.md') {
        const before = await readFile(target, 'utf8')
        const { text, changed, notes } = topUpAgentsMd(before, siteKey, platform, {
          origin,
          copyAddress,
          address,
          sealed
        })
        if (changed) {
          await writeFile(target, text, 'utf8')
          toppedUp.push(`${relative} (${notes.join('; ')})`)
          continue
        }
      }
      kept.push(relative)
      continue
    }
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
    written.push(relative)
  }
  if (platform === 'joomla') {
    const tools = await ensureJoomlaTools(siteFolderPath)
    written.push(...tools.written)
    kept.push(...tools.kept)
  }
  const retired = await retireMoved(siteFolderPath)
  return { written, kept, toppedUp, retired }
}

/** The scssphp release the site folders carry; bump with the subtree pin in `vendor/php/scssphp`. */
export const SCSSPHP_VERSION = 'v1.13.0'

const here = path.dirname(new URL(import.meta.url).pathname)

/**
 * Where scssphp's `src/` is on this machine: the tracy-host image (`/opt/tracy-fleet/vendor/scssphp`,
 * beside the provision scripts it COPYs) or a checkout (`vendor/php/scssphp/src`). Null when neither —
 * the site folder then gets the tool without its compiler, and the tool says so when run.
 */
/**
 * Where scssphp's `src/` is, as seen from `provision/`: the image layout first, then the repo. Exported
 * with `fromDir` so `test/site-folder.test.mjs` can hold the image candidate to the Dockerfile's COPY
 * destinations — on 27/09/2026 the first cut resolved one level too high (`/opt/vendor/scssphp`), the
 * repo candidate hid it, and every site on the stand got the tool without its compiler.
 * @param {string} [fromDir]
 */
export function scssphpCandidates(fromDir = here) {
  return [
    // in the tracy-host image: `scripts/` is COPYed to /opt/tracy-fleet and scssphp beside it as
    // /opt/tracy-fleet/vendor/scssphp (apps/tracy-host/Dockerfile) — one level above provision/
    path.resolve(fromDir, '..', 'vendor', 'scssphp'),
    // in the repo: the subtree itself
    path.resolve(fromDir, '..', '..', '..', '..', '..', 'vendor', 'php', 'scssphp', 'src')
  ]
}

export async function scssphpSource() {
  for (const candidate of scssphpCandidates())
    if (await exists(path.join(candidate, 'Compiler.php'))) return candidate
  return null
}

/**
 * A Joomla site's `tools/`: `t4-scss.php` (Tracy's, from `provision/php/`) and `scssphp/` (the
 * compiler it loads). The stock joomla image has no node and no sass, and T4 compiles scss only through
 * a development plugin the quickstarts do not ship — so the agent, asked to change the look, wrote
 * plain CSS beside `darkmode.css` (27/09/2026, `capiv2j`). Written when missing; replaced when the
 * tool's text or the compiler's version differs; a site's own edits to `tools/` are not touched.
 * @param {string} siteFolderPath
 * @returns {Promise<{ written: string[], kept: string[] }>}
 */
export async function ensureJoomlaTools(siteFolderPath) {
  const written = []
  const kept = []
  const toolSource = path.join(here, 'php', 't4-scss.php')
  const toolTarget = path.join(siteFolderPath, 'tools', 't4-scss.php')
  const want = await readFile(toolSource, 'utf8')
  const had = (await exists(toolTarget)) ? await readFile(toolTarget, 'utf8') : null
  if (had === want) kept.push('tools/t4-scss.php')
  else {
    await mkdir(path.dirname(toolTarget), { recursive: true })
    await writeFile(toolTarget, want, 'utf8')
    written.push('tools/t4-scss.php')
  }
  const libTarget = path.join(siteFolderPath, 'tools', 'scssphp')
  const marker = path.join(libTarget, '.tracy-version')
  const version = (await exists(marker)) ? (await readFile(marker, 'utf8')).trim() : null
  if (version === SCSSPHP_VERSION) kept.push('tools/scssphp')
  else {
    const source = await scssphpSource()
    if (source === null) kept.push('tools/scssphp (no scssphp source on this machine — not written)')
    else {
      await rm(libTarget, { recursive: true, force: true })
      await cp(source, libTarget, { recursive: true })
      await writeFile(marker, `${SCSSPHP_VERSION}\n`, 'utf8')
      written.push(`tools/scssphp (${SCSSPHP_VERSION})`)
    }
  }
  return { written, kept }
}

/**
 * Files Tracy shipped to a path it later moved away from, with the exact bytes it shipped.
 *
 * 🔒 A MOVED FILE IS NOT A DELETED FILE, and the difference is whose words are in it. Tracy created
 * `.claude/skills/README.md` on every site and told the team that is where site-specific skills go.
 * dsh scans `.dsh/skills` and `.agents/skills` and has never read `.claude` — so the directory was
 * documentation pointing at nothing, and it stays that way on every site already provisioned unless
 * something retires it. `skeletonFiles` only ever ADDS paths; it has no way to say "this one moved".
 *
 * The guard is byte-equality with what Tracy shipped. Identical means nobody has touched it and it
 * is Tracy's to withdraw; one edited character means a person wrote there, and then it is theirs and
 * it stays — a stale note is cheaper than deleting someone's work. The directory itself is left
 * alone either way: an empty directory misleads nobody, and a skill somebody put there by hand is
 * still their file to move.
 *
 * @param {string} siteFolderPath
 * @returns {Promise<string[]>} the paths actually withdrawn.
 */
async function retireMoved(siteFolderPath) {
  const out = []
  for (const [relative, shipped] of MOVED) {
    const target = path.join(siteFolderPath, relative)
    if (!(await exists(target))) continue
    let current
    try {
      current = await readFile(target, 'utf8')
    } catch {
      continue
    }
    if (current !== shipped) continue
    try {
      await rm(target)
      out.push(relative)
    } catch {
      /* a folder we cannot write is a folder we leave exactly as it is */
    }
  }
  return out
}

/**
 * Path Tracy used to ship, mapped to the bytes it shipped there. A row leaves this table only when
 * every site that could still carry the file is gone, which in practice means never — so rows
 * accumulate, and that is the intended cost of having moved something.
 */
const MOVED = new Map([
  [
    '.claude/skills/README.md',
    'Site-specific skills: one directory per skill (SKILL.md + scripts/), reviewed as code.\n' +
      'Skills from the Tracy registry are not vendored here — they are pinned in\n' +
      '`AgentSetting/skills.json`.\n'
  ]
])

// `import.meta.main` is not available on the Node the fleet hosts run, so compare the paths.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)

if (invokedDirectly) {
  const [folder, siteKey, platform, webroot, origin, copyAddress, address] = process.argv.slice(2)
  if (!folder || !siteKey) {
    console.error(
      'use: ensure-site-folder.mjs <siteFolderPath> <siteKey> [platform] [webrootPath] [origin] [copyAddress] [address]'
    )
    process.exit(2)
  }
  const { written, kept, toppedUp, retired } = await ensureSiteFolder(
    folder,
    siteKey,
    platform || null,
    webroot || null,
    { origin: origin || null, copyAddress: copyAddress || null, address: address || null }
  )
  console.log(
    `ensure-site-folder: ${written.length} written, ${toppedUp.length} topped up, ${retired.length} retired, ${kept.length} already there`
  )
  for (const file of written) console.log(`  + ${file}`)
  for (const file of toppedUp) console.log(`  ~ ${file}`)
  for (const file of retired) console.log(`  - ${file} (moved; the copy was untouched)`)
  for (const file of kept) console.log(`  = ${file}`)
}
