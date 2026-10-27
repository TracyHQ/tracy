#!/usr/bin/env node
/**
 * redeploy-template — put the CURRENT template source into EmDash quickstart sites already running,
 * and rebuild them (decision 5 of the comment-to-edit plan, Brian 27/09/2026).
 *
 *   node provision/emdash/redeploy-template.mjs                    # dry run: what it would do, per site
 *   node provision/emdash/redeploy-template.mjs --apply            # do it
 *   node provision/emdash/redeploy-template.mjs --label <l> ...    # one site only
 *   node provision/emdash/redeploy-template.mjs --from <dir> ...   # take the files from an unpacked package
 *   node provision/emdash/redeploy-template.mjs --overwrite-edits  # also replace files the site changed
 *
 * WHY. A site's /app is a named volume, filled ONCE from the image the site was created with. A newer
 * build of the template (provenance stamps for Tracy's comment picker, the Content API route, a fixed
 * view) reaches a new site and never an old one: rebuilding the image changes nothing in a volume
 * that already exists. `drop-old-guard.mjs` only takes the old MCP guard out of a site's own file,
 * so a site upgraded that way kept serving pages without a single stamp. This is the step that does
 * what an agent did by hand on the stand (`r2e2308`, `r2e2302`, 27/09): copy the template's source
 * into /app, `astro build` as the site user with the Content API switch, restart.
 *
 * SOURCE. By default the image the site's compose names, as that tag resolves NOW — the host's
 * current build of that template version. `--from <dir>` takes an unpacked template package on the
 * host instead (only the redeployed entries are read from it, never node_modules).
 *
 * WHAT MOVES. Exactly `REDEPLOYED` below, each entry only when the package has it; an entry the
 * package has replaces the site's copy wholesale, so a file the template dropped leaves the site too.
 * Never data/, uploads/, the token mounts, template.config.json or artifact.json: those hold the
 * customer's content, credentials and the site's own identity.
 *
 * WHEN IT REFUSES (state `skipped`, with the reason):
 *   - package.json or pnpm-lock.yaml differ between the package and the site: the site's
 *     node_modules were installed for the old ones, so the source would build against the wrong
 *     dependencies. That needs a new image, not a redeploy.
 *   - the site changed a file of the redeployed set since it was created (its volume differs from
 *     the image the container was created from), or that image is gone and nobody can tell: a
 *     customer's own look lives in /app/src (ADR 0022) and must not vanish silently. `--overwrite-edits`
 *     replaces them anyway; the backup keeps them either way.
 *   - /app/src is not the site user's: run `drop-old-guard.mjs --apply` first.
 *   - less than MIN_FREE_MB free on the host: the build would be OOM-killed half way.
 *
 * SAFETY. The redeployed set and dist/ are copied under /app/.tracy-backup/<stamp>/ before anything
 * is written; a failed write or build puts both back, so the site restarts on what it served before.
 *
 * OUTPUT. One line per site: `<selector> <state> <detail>`, the selector being the first 12 hex of
 * sha256(label). States: current · would-redeploy · skipped · done · FAILED. Exit 1 when any FAILED.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MIN_FREE_MB,
  answers,
  astroBuild,
  availableMb,
  docker,
  inNode,
  selector,
  sites
} from './site-rebuild.mjs'

/** What a redeploy replaces in /app: the template's source and what its build reads, nothing else. */
export const REDEPLOYED = Object.freeze([
  'src',
  'public',
  'astro.config.mjs',
  'tsconfig.json',
  'tools/content-api',
  'seed/content-api-map.json',
  'seed/site-model.json'
])

/**
 * What the site's node_modules were installed from: a difference here needs a new image. package.json
 * is compared by its dependency fields only (`digestTree`), pnpm-lock.yaml byte for byte.
 */
export const DEPENDENCIES = Object.freeze(['package.json', 'pnpm-lock.yaml'])

/**
 * Never read inside a redeployed entry. Build output and runtime state (dist, .astro, data, uploads)
 * sit at the package root, outside every entry of REDEPLOYED, so they are never read in the first
 * place; excluding those names everywhere would also drop a template's own `src/data/`.
 */
export const SKIPPED_DIRS = Object.freeze(['node_modules'])

/**
 * sha256 of every file under `paths` of `root`, keyed by path relative to `root`. A symlink counts as
 * its target text. Self-contained: it is also sent into containers and images as source text.
 * @param {string} root
 * @param {readonly string[]} paths
 * @returns {Record<string, string>}
 */
export function digestTree(root, paths) {
  const fs = process.getBuiltinModule('node:fs')
  const crypto = process.getBuiltinModule('node:crypto')
  const skip = new Set(['node_modules'])
  /** @type {Record<string, string>} */
  const out = {}
  const walk = (/** @type {string} */ rel) => {
    const abs = `${root}/${rel}`
    let st
    try {
      st = fs.lstatSync(abs)
    } catch {
      return
    }
    if (st.isSymbolicLink()) out[rel] = `link:${fs.readlinkSync(abs)}`
    else if (st.isDirectory()) {
      for (const name of fs.readdirSync(abs).sort()) if (!skip.has(name)) walk(`${rel}/${name}`)
    } else if (st.isFile()) {
      let bytes = fs.readFileSync(abs)
      // The root package.json counts by what installs node_modules, not by its `version` line: a
      // release bumps that line (1.4.3 -> 1.4.5) with the very same dependencies and lockfile.
      if (rel === 'package.json') {
        try {
          const j = JSON.parse(bytes.toString('utf8'))
          const keys = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
          bytes = Buffer.from(
            JSON.stringify([...keys, 'overrides', 'pnpm', 'packageManager'].map((k) => [k, j[k] ?? null]))
          )
        } catch {}
      }
      out[rel] = crypto.createHash('sha256').update(bytes).digest('hex')
    }
  }
  for (const p of paths) walk(p)
  return out
}

/** The entries of `REDEPLOYED` a digest map has at least one file under. */
export function presentEntries(/** @type {Record<string, string>} */ digests, entries = REDEPLOYED) {
  const keys = Object.keys(digests)
  return entries.filter((e) => keys.some((k) => k === e || k.startsWith(`${e}/`)))
}

/** `digests` restricted to files under `entries`. */
const within = (/** @type {Record<string, string>} */ digests, /** @type {string[]} */ entries) =>
  Object.fromEntries(
    Object.entries(digests).filter(([k]) => entries.some((e) => k === e || k.startsWith(`${e}/`)))
  )

/** Paths whose digest differs between two maps, either side missing counting as different. */
export function differing(/** @type {Record<string, string>} */ a, /** @type {Record<string, string>} */ b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort()
}

/**
 * What to do with one site, from three digest maps over REDEPLOYED + DEPENDENCIES: the package to
 * deploy, the site's /app now, and the image the site was created from.
 * `created` is null when that image is no longer on the host: with the containerd image store a
 * rebuilt tag lets the old image go even while a container still runs from it (measured 27/09/2026
 * on the stand: `r2e2302-web-1` created from `b6154755b572`, "No such image"). Local edits are then
 * unknown, which is a refusal, not a pass.
 * @param {{ pkg: Record<string, string>, site: Record<string, string>, created: Record<string, string> | null, overwriteEdits?: boolean }} input
 * @returns {{ action: 'current' | 'skip' | 'redeploy', detail: string, entries: string[], changed: string[], edits: string[] }}
 */
export function planRedeploy({ pkg, site, created, overwriteEdits = false }) {
  const entries = presentEntries(pkg)
  const none = { entries, changed: [], edits: [] }
  if (entries.length === 0)
    return { action: 'skip', detail: 'the package has none of the redeployed files', ...none }
  const deps = DEPENDENCIES.filter((d) => pkg[d] !== site[d])
  if (deps.length)
    return {
      action: 'skip',
      detail: `${deps.join(' and ')} differ from the site's — its node_modules would not match; needs a new image`,
      ...none
    }
  const changed = differing(within(pkg, entries), within(site, entries))
  if (changed.length === 0) return { action: 'current', detail: 'the site already runs this source', ...none }
  const summary = `${changed.length} file(s) in ${entries.join(', ')}`
  if (created === null)
    return overwriteEdits
      ? {
          action: 'redeploy',
          detail: `${summary}; local edits not checked (the image the site was created from is gone)`,
          entries,
          changed,
          edits: []
        }
      : {
          action: 'skip',
          detail:
            'the image the site was created from is gone, so its local edits cannot be told apart — --overwrite-edits replaces them (the backup keeps them)',
          entries,
          changed,
          edits: []
        }
  const edits = differing(within(site, entries), within(created, entries))
  if (edits.length && !overwriteEdits)
    return {
      action: 'skip',
      detail: `the site has local edits in ${edits.length} file(s) (${edits.slice(0, 3).join(', ')}${edits.length > 3 ? ', …' : ''}) — --overwrite-edits replaces them`,
      entries,
      changed,
      edits
    }
  return {
    action: 'redeploy',
    detail: edits.length ? `${summary}, overwriting ${edits.length} local edit(s)` : summary,
    entries,
    changed,
    edits
  }
}

/**
 * Whether the build gets the Content API switch, and why: the image says so in its label, or the
 * container already carries the variable (an image built with ENV, 1.4.5 and later).
 * @param {Record<string, string> | null | undefined} labels
 * @param {string[] | null | undefined} env
 * @returns {{ on: boolean, why: string }}
 */
export function scalarsFor(labels, env) {
  if ((env ?? []).includes('TRACY_CONTENT_API_SCALARS=1')) return { on: true, why: 'container env' }
  if (labels?.['io.tracy.content-api.scalars'] === '1') return { on: true, why: 'image label' }
  return { on: false, why: 'off: neither the image label nor the container env turns it on' }
}

/** The package's files as a tar stream on the host (`--from`), only the entries it has. */
function hostTar(/** @type {string} */ dir, /** @type {string[]} */ entries) {
  const mac = process.platform === 'darwin' ? ['--no-mac-metadata', '--no-xattrs'] : []
  return execFileSync(
    'tar',
    [...mac, ...SKIPPED_DIRS.flatMap((d) => ['--exclude', d]), '-C', dir, '-c', ...entries],
    { env: { ...process.env, COPYFILE_DISABLE: '1' }, maxBuffer: 512 * 1024 * 1024 }
  )
}

/** Digests of an image's /app, read by a throwaway container with no network. */
function imageDigests(/** @type {string} */ image, /** @type {readonly string[]} */ paths) {
  const program = `const f = ${digestTree.toString()}; process.stdout.write(JSON.stringify(f('/app', ${JSON.stringify(paths)})))`
  return JSON.parse(
    docker(['run', '--rm', '--network', 'none', '--entrypoint', 'node', image, '-e', program])
  )
}

/** Digests of the image a container was created from, or null when that image is gone. */
function createdDigests(/** @type {string} */ id, /** @type {readonly string[]} */ paths) {
  try {
    docker(['image', 'inspect', id])
  } catch {
    return null
  }
  return imageDigests(id, paths)
}

/** Digests of a running site's /app. */
function siteDigests(/** @type {string} */ c, /** @type {readonly string[]} */ paths) {
  const program = `const f = ${digestTree.toString()}; process.stdout.write(JSON.stringify(f('/app', ${JSON.stringify(paths)})))`
  return JSON.parse(docker(['exec', c, 'node', '-e', program]))
}

/**
 * Kept in the backup but not removed: a build that fails half way may already have rewritten part
 * of dist/, and the site restarts on whatever dist/ holds, so the old one goes back with the source.
 */
export const KEPT = Object.freeze(['dist'])

/** Back up the entries the package has (and KEPT), then remove the entries, inside the site (as www-data). */
const SWAP = `
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
const { stamp, entries, kept } = JSON.parse(readFileSync(0, 'utf8'))
const bak = '/app/.tracy-backup/' + stamp
for (const e of [...entries, ...kept]) {
  if (!existsSync('/app/' + e)) continue
  mkdirSync(dirname(bak + '/' + e), { recursive: true })
  cpSync('/app/' + e, bak + '/' + e, { recursive: true, verbatimSymlinks: true })
}
mkdirSync(bak, { recursive: true })
for (const e of entries) rmSync('/app/' + e, { recursive: true, force: true })
console.log(bak)
`

/** Put the backup back: the entries as they were, nothing of the package left. */
const RESTORE = `
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
const { bak, entries } = JSON.parse(readFileSync(0, 'utf8'))
for (const e of entries) {
  rmSync('/app/' + e, { recursive: true, force: true })
  if (existsSync(bak + '/' + e)) cpSync(bak + '/' + e, '/app/' + e, { recursive: true, verbatimSymlinks: true })
}
`

function main(argv) {
  let apply = false
  let only = null
  let from = null
  let overwriteEdits = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') apply = true
    else if (argv[i] === '--overwrite-edits') overwriteEdits = true
    else if (argv[i] === '--label') only = argv[++i] ?? null
    else if (argv[i] === '--from') from = argv[++i] ?? null
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log(
        'node redeploy-template.mjs [--apply] [--label <label>] [--from <package dir>] [--overwrite-edits]'
      )
      return 0
    } else {
      console.error(`unknown argument: ${argv[i]}`)
      return 2
    }
  }
  if (from !== null && !existsSync(join(from, 'package.json'))) {
    console.error(`--from ${from}: no package.json there — not an unpacked template package`)
    return 2
  }
  const paths = [...REDEPLOYED, ...DEPENDENCIES]
  const fromDigests = from === null ? null : digestTree(from, paths)
  let failed = 0
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  for (const label of sites().filter((l) => only === null || l === only)) {
    const c = `${label}-web-1`
    const sel = selector(label)
    try {
      const [image, createdId, labelsJson, envJson] = docker([
        'inspect',
        '-f',
        '{{.Config.Image}}\t{{.Image}}\t{{json .Config.Labels}}\t{{json .Config.Env}}',
        c
      ])
        .trim()
        .split('\t')
      const pkg = fromDigests ?? imageDigests(image, paths)
      const plan = planRedeploy({
        pkg,
        site: siteDigests(c, paths),
        created: createdDigests(createdId, paths),
        overwriteEdits
      })
      const scalars = scalarsFor(JSON.parse(labelsJson || 'null'), JSON.parse(envJson || 'null'))
      const source = from === null ? image : from
      if (plan.action === 'current') {
        console.log(`${sel} current ${plan.detail} (${source})`)
        continue
      }
      if (plan.action === 'skip') {
        console.log(`${sel} skipped ${plan.detail}`)
        continue
      }
      const content = `content api ${scalars.on ? `on (${scalars.why})` : scalars.why}`
      if (!apply) {
        console.log(`${sel} would-redeploy ${plan.detail} from ${source}; ${content}`)
        continue
      }
      const owner = docker(['exec', c, 'stat', '-c', '%U', '/app/src']).trim()
      if (owner !== 'www-data') {
        console.log(`${sel} skipped /app/src belongs to ${owner} — run drop-old-guard.mjs --apply first`)
        continue
      }
      const free = availableMb()
      if (free !== null && free < MIN_FREE_MB) {
        console.log(`${sel} skipped only ${free} MB free on this host; the rebuild needs ${MIN_FREE_MB}`)
        continue
      }
      const tar =
        from === null
          ? docker(
              [
                'run',
                '--rm',
                '--network',
                'none',
                '--entrypoint',
                'tar',
                image,
                '-C',
                '/app',
                '-c',
                ...plan.entries
              ],
              {
                encoding: 'buffer'
              }
            )
          : hostTar(from, plan.entries)
      const bak = inNode(
        c,
        'www-data',
        SWAP,
        JSON.stringify({ stamp, entries: plan.entries, kept: KEPT })
      ).trim()
      const restore = () =>
        inNode(c, 'www-data', RESTORE, JSON.stringify({ bak, entries: [...plan.entries, ...KEPT] }))
      try {
        docker(['exec', '-i', '-u', 'www-data', c, 'tar', '-x', '--no-same-owner', '-C', '/app'], {
          input: tar
        })
      } catch (error) {
        restore()
        throw new Error(
          `could not write the package, old files restored from ${bak}: ${String(error?.stderr ?? error)
            .trim()
            .slice(-200)}`
        )
      }
      try {
        astroBuild(c, scalars.on)
      } catch (error) {
        restore()
        throw new Error(
          `build failed, old source and dist/ restored from ${bak}: ${String(error?.stderr ?? error)
            .trim()
            .slice(-200)}`
        )
      }
      docker(['restart', '-t', '10', c])
      if (!answers(c))
        throw new Error(`rebuilt and restarted, but the site does not answer on loopback (backup ${bak})`)
      console.log(`${sel} done ${plan.detail} from ${source}; ${content}; backup ${bak}`)
    } catch (error) {
      failed++
      console.log(
        `${sel} FAILED ${String(error instanceof Error ? error.message : error)
          .replace(/\s+/g, ' ')
          .slice(0, 300)}`
      )
    }
  }
  return failed > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
