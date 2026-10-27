/**
 * site-rebuild — what every in-place change to a running EmDash quickstart site needs: find the
 * sites on this host's docker, run a program inside a site's web container, rebuild its dist/ as
 * the site user, and prove it answers again. Shared by `drop-old-guard.mjs` (the old MCP guard) and
 * `redeploy-template.mjs` (the template's current source); neither needs more than the docker CLI.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** The docker CLI, output as text; `input` goes to its stdin. */
export const docker = (
  /** @type {string[]} */ args,
  /** @type {{ input?: string | Buffer, encoding?: BufferEncoding | 'buffer', maxBuffer?: number }} */ opts = {}
) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 512 * 1024 * 1024,
    ...opts
  })

/** The first 12 hex of sha256(label): an Actions log is not the place for a raw label. */
export const selector = (/** @type {string} */ label) =>
  createHash('sha256').update(label).digest('hex').slice(0, 12)

/** Run a small node program inside the container, as `user`, with `input` on stdin. */
export const inNode = (
  /** @type {string} */ c,
  /** @type {string} */ user,
  /** @type {string} */ program,
  input = ''
) => docker(['exec', '-i', '-u', user, c, 'node', '--input-type=module', '-e', program], { input })

/**
 * The EmDash quickstart sites on this host: `<label>-web-1` containers of project `<label>`. The
 * image is read from the container's own config: `docker ps` prints an image ID instead of the tag
 * once that tag has been rebuilt (measured 26/09: four of six sites went missing that way).
 * @returns {string[]}
 */
export function sites() {
  const names = docker(['ps', '--format', '{{.Names}}'])
    .split('\n')
    .filter((n) => n.endsWith('-web-1'))
  if (names.length === 0) return []
  const rows = docker([
    'inspect',
    '-f',
    '{{.Name}}\t{{.Config.Image}}\t{{index .Config.Labels "com.docker.compose.project"}}',
    ...names
  ])
  return rows
    .split('\n')
    .map((l) => l.replace(/^\//, '').split('\t'))
    .filter(
      ([name, image, project]) =>
        name?.endsWith('-web-1') &&
        /^tracy\/[a-z0-9-]+-emdash:/.test(image ?? '') &&
        project === name.slice(0, -6)
    )
    .map(([name]) => name.slice(0, -6))
}

/**
 * Memory this host has free, in MB, or null where it cannot tell (not Linux). `astro build` needs
 * about 1 GB: measured 26/09/2026 on the dev host (24 GB, 520 MB available, no swap) it was OOM-killed
 * (137) mid-bundle — the site kept its old dist/ and answered, but nothing was changed.
 */
export function availableMb() {
  try {
    const m = /^MemAvailable:\s+(\d+) kB/m.exec(readFileSync('/proc/meminfo', 'utf8'))
    return m ? Math.floor(Number(m[1]) / 1024) : null
  } catch {
    return null
  }
}
export const MIN_FREE_MB = 1536

/** The site answers on loopback. */
export function answers(/** @type {string} */ c) {
  for (let i = 0; i < 60; i++) {
    try {
      docker([
        'exec',
        c,
        'node',
        '-e',
        'fetch("http://127.0.0.1:4321/").then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))'
      ])
      return true
    } catch {
      execFileSync('sleep', ['2'])
    }
  }
  return false
}

/**
 * `astro build` in /app as www-data. With `scalars`, the Content API switch goes into the build's
 * environment: the reader is an injected route, so a build without it drops /content.json (26/09).
 */
export function astroBuild(/** @type {string} */ c, /** @type {boolean} */ scalars) {
  docker([
    'exec',
    '-u',
    'www-data',
    '-w',
    '/app',
    '-e',
    'HOME=/tmp',
    ...(scalars ? ['-e', 'TRACY_CONTENT_API_SCALARS=1'] : []),
    c,
    'node_modules/.bin/astro',
    'build'
  ])
}
