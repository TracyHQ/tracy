#!/usr/bin/env node
/**
 * drop-old-guard — take the old MCP guard off EmDash quickstart sites already running, and give
 * their code back to the site user (ADR 0022).
 *
 *   node provision/emdash/drop-old-guard.mjs                  # dry run: what it would do, per site
 *   node provision/emdash/drop-old-guard.mjs --apply          # do it
 *   node provision/emdash/drop-old-guard.mjs --label <l> ...  # one site only
 *
 * WHY. Tracy Business EmDash 1.4.0–1.4.3 shipped a middleware that refused structural MCP tools to
 * the agent, and an image whose /app belonged to root, so the agent could not edit the site's look
 * and `site.rebuild` could not write dist/. ADR 0022 removed both from the template, but /app is a
 * named volume filled once from the image the site was created with: a site already running keeps
 * the old code until something changes it in place. This does, the way the agent's own rebuild
 * would. Measured 26/09/2026 on the local stand: six sites with /app/src owned by root.
 *
 * WHERE. On a host's docker, next to the sites' web containers (the stand, the dev host, a fleet host).
 * It needs nothing but the docker CLI: every edit runs INSIDE the site's web container with its own
 * node.
 *
 * WHAT, per `<label>-web-1` container whose compose project is `<label>` and whose image is a
 * `tracy/<template>-emdash:<version>` one:
 *   1. /app and everything under it (one filesystem: never the data/, uploads/ or token mounts)
 *      owned by www-data;
 *   2. when `src/lib/content-only.ts` is there: its import and its block cut out of
 *      `src/middleware.ts` (the rest of the file byte for byte — a site may have its own edits), the
 *      file and its test removed, the flag taken out of `template.config.json`, `artifact.json` and
 *      the site folder's `template/artifact.json`; then `astro build` as www-data and a restart.
 * A middleware whose guard is not in the shape this knows is left alone and reported. Every file is
 * copied under /app/.tracy-backup/<stamp>/ first; a failed build puts them back.
 *
 * WHAT IT DOES NOT DO: bring the rest of the template up to date. It only takes the guard out of the
 * site's own file, so a site upgraded this way keeps the rest of its old source (no provenance
 * stamps, no Content API route it did not already have). `redeploy-template.mjs` is the step that
 * puts the current template source in /app and rebuilds.
 *
 * OUTPUT. One line per site: `<selector> <state> <detail>`, the selector being the first 12 hex of
 * sha256(label). Exit 1 when any site FAILED.
 */
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

/** The old template's word for the guard, as its files spell it. */
const OLD = ['content', 'only'].join('-')

/**
 * The middleware without the guard, or null when the guard is not in the shape the 1.4.x template
 * wrote (an import from './lib/…', and one `if` on the MCP POST that calls the refusal).
 * @param {string} source
 * @returns {string | null}
 */
export function dropGuard(source) {
  // Self-contained: it is also sent into the site's container as source text.
  const OLD = ['content', 'only'].join('-')
  const importLine = new RegExp(`^import \\{ [A-Za-z]+Refusal \\} from '\\./lib/${OLD}'\\n`, 'm')
  if (!importLine.test(source)) return null
  const head = "  if (context.request.method === 'POST' && pathname === '/_emdash/api/mcp') {"
  const start = source.indexOf(head)
  if (start < 0) return null
  // The comment lines right above the block belong to it.
  let from = start
  for (;;) {
    const prev = source.lastIndexOf('\n', from - 2)
    const line = source.slice(prev + 1, from - 1)
    if (!/^ {2}\/\//.test(line)) break
    from = prev + 1
  }
  // The block ends at the brace that closes the one it opened.
  let depth = 0
  let end = -1
  for (let i = start + head.length - 1; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) {
      end = i + 1
      break
    }
  }
  if (end < 0 || source[end] !== '\n') return null
  const block = source.slice(start, end)
  if (!/Refusal\(/.test(block)) return null
  const out = (source.slice(0, from) + source.slice(end + 1)).replace(importLine, '')
  return out.includes(OLD) ? null : out
}

/**
 * A config object without the old flag or capability, and whether anything changed.
 * @param {Record<string, unknown>} json
 */
export function dropFlag(json) {
  // Self-contained: it is also sent into the site's container as source text.
  const OLD = ['content', 'only'].join('-')
  const OLD_KEY = ['content', 'Only'].join('')
  let changed = false
  const out = { ...json }
  if (OLD_KEY in out) {
    delete out[OLD_KEY]
    changed = true
  }
  if (Array.isArray(out.capabilities) && out.capabilities.includes(OLD)) {
    out.capabilities = out.capabilities.filter((c) => c !== OLD)
    changed = true
  }
  return { json: out, changed }
}

/** What one site needs: code not owned by www-data, and whether the guard is still in /app. */
function state(c) {
  const owner = docker(['exec', c, 'stat', '-c', '%U', '/app/src']).trim()
  const guard =
    docker(['exec', c, 'sh', '-c', `test -e /app/src/lib/${OLD}.ts && echo yes || echo no`]).trim() === 'yes'
  return { owner, guard }
}

const EDIT = `
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
const { stamp, label, dropGuard: g, dropFlag: f } = JSON.parse(readFileSync(0, 'utf8'))
const dropGuard = new Function('return ' + g)()
const dropFlag = new Function('return ' + f)()
const OLD = ['content', 'only'].join('-')
const bak = '/app/.tracy-backup/' + stamp
mkdirSync(bak, { recursive: true })
const files = ['src/middleware.ts', 'src/lib/' + OLD + '.ts', 'tests/' + OLD + '.test.mjs', 'template.config.json', 'artifact.json']
for (const f of files) if (existsSync('/app/' + f)) { mkdirSync(bak + '/' + f.split('/').slice(0, -1).join('/'), { recursive: true }); copyFileSync('/app/' + f, bak + '/' + f) }
const mw = dropGuard(readFileSync('/app/src/middleware.ts', 'utf8'))
if (mw === null) { console.log('SHAPE'); process.exit(0) }
writeFileSync('/app/src/middleware.ts', mw)
rmSync('/app/src/lib/' + OLD + '.ts', { force: true })
rmSync('/app/tests/' + OLD + '.test.mjs', { force: true })
for (const f of ['/app/template.config.json', '/app/artifact.json']) {
  if (!existsSync(f)) continue
  const r = dropFlag(JSON.parse(readFileSync(f, 'utf8')))
  if (r.changed) writeFileSync(f, JSON.stringify(r.json, null, 2) + '\\n')
}
console.log('EDITED ' + bak)
`

const RESTORE = `
import { cpSync, readFileSync } from 'node:fs'
const bak = readFileSync(0, 'utf8').trim()
cpSync(bak, '/app', { recursive: true })
`

const FOLDER = `
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const { path, dropFlag: f } = JSON.parse(readFileSync(0, 'utf8'))
const dropFlag = new Function('return ' + f)()
if (existsSync(path)) {
  const r = dropFlag(JSON.parse(readFileSync(path, 'utf8')))
  if (r.changed) writeFileSync(path, JSON.stringify(r.json, null, 2) + '\\n')
}
`

function main(argv) {
  let apply = false
  let only = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') apply = true
    else if (argv[i] === '--label') only = argv[++i] ?? null
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('node drop-old-guard.mjs [--apply] [--label <label>]')
      return 0
    } else {
      console.error(`unknown argument: ${argv[i]}`)
      return 2
    }
  }
  let failed = 0
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  for (const label of sites().filter((l) => only === null || l === only)) {
    const c = `${label}-web-1`
    const sel = selector(label)
    try {
      const { owner, guard } = state(c)
      if (owner === 'www-data' && !guard) {
        console.log(`${sel} clean -`)
        continue
      }
      const plan = [
        owner === 'www-data' ? null : `chown /app (was ${owner})`,
        guard ? 'drop guard + rebuild' : null
      ]
        .filter(Boolean)
        .join(', ')
      if (!apply) {
        console.log(`${sel} would ${plan}`)
        continue
      }
      if (owner !== 'www-data')
        docker([
          'exec',
          '-u',
          '0',
          c,
          'sh',
          '-c',
          'find /app -xdev -not -user www-data -exec chown www-data:www-data {} +'
        ])
      if (!guard) {
        console.log(`${sel} done ${plan}`)
        continue
      }
      const free = availableMb()
      if (free !== null && free < MIN_FREE_MB) {
        console.log(
          `${sel} skipped only ${free} MB free on this host; the rebuild needs ${MIN_FREE_MB} — /app ownership done`
        )
        continue
      }
      const edited = inNode(
        c,
        'www-data',
        EDIT,
        JSON.stringify({ stamp, label, dropGuard: dropGuard.toString(), dropFlag: dropFlag.toString() })
      ).trim()
      if (edited === 'SHAPE') {
        console.log(`${sel} skipped middleware guard not in the known shape — left as it is`)
        continue
      }
      const bak = edited.replace(/^EDITED /, '')
      // The image's content api switch goes into the build, or /content.json is dropped (26/09).
      const scalars =
        docker(['inspect', '-f', '{{index .Config.Labels "io.tracy.content-api.scalars"}}', c]).trim() === '1'
      try {
        astroBuild(c, scalars)
      } catch (error) {
        inNode(c, 'www-data', RESTORE, bak)
        throw new Error(
          `build failed, old files restored from ${bak}: ${String(error?.stderr ?? error)
            .trim()
            .slice(-200)}`
        )
      }
      inNode(
        c,
        '0',
        FOLDER,
        JSON.stringify({ path: `/site/${label}/template/artifact.json`, dropFlag: dropFlag.toString() })
      )
      docker(['restart', '-t', '10', c])
      if (!answers(c)) throw new Error('rebuilt and restarted, but the site does not answer on loopback')
      console.log(`${sel} done ${plan}`)
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
