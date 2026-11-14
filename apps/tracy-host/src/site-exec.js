/**
 * Which runtime serves a site, and the docker argv that runs a command in it — the JS twin of
 * `packages/fleet/tracy-fleet-operation/scripts/lib/site-runtime.sh` (`tracy_site_web_exec`,
 * `tracy_site_db_exec`). Same rules, same files; a change to one is a change to the other.
 *
 * A Joomla or WordPress template demo may be folded into the host's demo farm
 * (`scripts/provision/fold.sh`): its PHP then runs in an FPM pool of `tracy-demos-web`, its data in a
 * schema of `tracy-demos-db`, and `<label>-web-1` is only a TCP forwarder with no PHP in it. The one
 * fact that says so is `<privateRoot>/<label>/runtime` holding `farm`; absent = the per-site pair.
 * Anything else in that file is refused, never guessed: an exec into the wrong container of a folded
 * demo lands in a forwarder — or in the shared farm as root, which reaches every demo on the host.
 *
 * Part 1 of the farm adds this module and converts no caller; the callers that still build
 * `['exec', …, `${label}-web-1`, …]` themselves are listed in the part-1 report.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** The marker's name inside a site's private directory. */
export const RUNTIME_MARKER = 'runtime'
/** The farm's containers (`scripts/lib/site-runtime.sh`). */
export const FARM_WEB_CONTAINER = 'tracy-demos-web'
export const FARM_DB_CONTAINER = 'tracy-demos-db'
/** The per-site container's docroot, and the path the farm (and every per-site container) mounts it at too. */
export const SITE_DOCROOT = '/var/www/html'
export const farmDocroot = (label) => `/site/${label}/.webroot`
/** MariaDB clients that get the runtime's `-u<user>` put after them. */
const DB_CLIENTS = new Set(['mariadb', 'mysql', 'mariadb-dump', 'mysqldump', 'mariadb-admin', 'mysqladmin'])
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function checkLabel(label) {
  if (typeof label !== 'string' || !LABEL.test(label)) throw new TypeError(`refused label: ${label}`)
}

/** The farm's directory on this host (`tracy_demos_dir`). */
export function demosDir(privateRoot, env = process.env) {
  return env.TRACY_DEMOS_DIR || path.join(privateRoot, '_demos')
}

/**
 * `'site'` or `'farm'`.
 * @param {string} privateRoot
 * @param {string} label
 */
export async function siteRuntime(privateRoot, label) {
  checkLabel(label)
  const file = path.join(privateRoot, label, RUNTIME_MARKER)
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') return 'site'
    throw new Error(`${file} cannot be read — refusing to guess which runtime serves ${label}`)
  }
  const value = text.replace(/\s+/g, '')
  if (value === 'farm') return 'farm'
  throw new Error(`${file} says '${value}', not 'farm' — refusing to guess which runtime serves ${label}`)
}

/** One value of a site's `.env` (data, never sourced). */
async function dotenv(privateRoot, label, key) {
  const text = await readFile(path.join(privateRoot, label, '.env'), 'utf8').catch(() => '')
  for (const line of text.split('\n')) if (line.startsWith(`${key}=`)) return line.slice(key.length + 1)
  return ''
}

/**
 * The docker argv that runs `cmd` in a site's web context.
 *   site: `exec [-i] -u <user> -w <dir> [-e…] <label>-web-1 cmd…` (dir defaults to /var/www/html)
 *   farm: `exec [-i] -u <user> -w <dir> --env-file <farm>/exec/<label>.env [-e…] tracy-demos-web cmd…`
 *         — /var/www/html[/…] maps to /site/<label>/.webroot[/…]; root and a dir outside
 *         /site/<label> are refused.
 * @param {{ privateRoot: string, label: string, user?: string, workdir?: string,
 *   interactive?: boolean, env?: Record<string, string>, runtime?: 'site'|'farm' }} opts
 * @param {string[]} cmd
 */
export async function siteWebExecArgv(opts, cmd) {
  const { privateRoot, label, user = 'www-data', workdir, interactive = false, env = {} } = opts
  checkLabel(label)
  if (!Array.isArray(cmd) || cmd.length === 0) throw new TypeError('no command')
  const runtime = opts.runtime ?? (await siteRuntime(privateRoot, label))
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`])
  const head = ['exec', ...(interactive ? ['-i'] : [])]
  if (runtime === 'site') {
    return [...head, '-u', user, '-w', workdir ?? SITE_DOCROOT, ...envArgs, `${label}-web-1`, ...cmd]
  }
  if (/^(root|0)(:.*)?$/.test(user)) {
    throw new Error(
      `${label} is served by the demo farm: a root exec there reaches every demo on this host — refused`
    )
  }
  const docroot = farmDocroot(label)
  let dir = workdir ?? docroot
  if (dir === SITE_DOCROOT) dir = docroot
  else if (dir.startsWith(`${SITE_DOCROOT}/`)) dir = `${docroot}/${dir.slice(SITE_DOCROOT.length + 1)}`
  else if (dir !== `/site/${label}` && !dir.startsWith(`/site/${label}/`)) {
    throw new Error(
      `${label} is served by the demo farm: -w ${dir} is outside the demo's own folder — refused`
    )
  }
  const envFile = path.join(demosDir(privateRoot), 'exec', `${label}.env`)
  return [...head, '-u', user, '-w', dir, '--env-file', envFile, ...envArgs, FARM_WEB_CONTAINER, ...cmd]
}

/**
 * The docker argv (and the environment to run docker with) that runs `cmd` against a site's data.
 * The password travels as `MYSQL_PWD` in docker's own environment (`-e MYSQL_PWD` with no value),
 * never as an argument.
 * @param {{ privateRoot: string, label: string, interactive?: boolean, runtime?: 'site'|'farm',
 *   composeText?: string }} opts  composeText: the site's compose file, for the per-site DB name
 * @param {string[]} cmd
 * @returns {Promise<{ args: string[], env: Record<string, string>, database: string }>}
 */
export async function siteDbExec(opts, cmd) {
  const { privateRoot, label, interactive = false } = opts
  checkLabel(label)
  if (!Array.isArray(cmd) || cmd.length === 0) throw new TypeError('no command')
  const runtime = opts.runtime ?? (await siteRuntime(privateRoot, label))
  let container, user, password, database
  if (runtime === 'farm') {
    container = FARM_DB_CONTAINER
    user = await dotenv(privateRoot, label, 'FARM_DB_USER')
    password = await dotenv(privateRoot, label, 'FARM_DB_PASSWORD')
    database = await dotenv(privateRoot, label, 'FARM_DB_NAME')
  } else {
    container = `${label}-db-1`
    user = 'root'
    password = await dotenv(privateRoot, label, 'DB_PASSWORD')
    const compose =
      opts.composeText ??
      (await readFile(path.join(privateRoot, label, 'docker-compose.yml'), 'utf8').catch(() => ''))
    database = /^\s*MARIADB_DATABASE:\s*"?([^"\n]+?)"?\s*$/m.exec(compose)?.[1] ?? ''
  }
  if (!user || !password || !database) throw new Error(`cannot tell the ${runtime} database of ${label}`)
  const [first, ...rest] = cmd
  const command = DB_CLIENTS.has(first) ? [first, `-u${user}`, ...rest] : cmd
  return {
    args: [
      'exec',
      ...(interactive ? ['-i'] : []),
      '-e',
      'MYSQL_PWD',
      '-e',
      `TRACY_DB_NAME=${database}`,
      '-e',
      `TRACY_DB_USER=${user}`,
      container,
      ...command
    ],
    env: { MYSQL_PWD: password },
    database
  }
}
