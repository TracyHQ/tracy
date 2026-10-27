#!/usr/bin/env node
/**
 * The Worker's doors, answered on this machine, so a build can be driven from a local lane.
 *
 * WHY THIS EXISTS. A lane serves dsh; the Worker serves the host's ROOT. On the fleet those are
 * the same origin (`cowork.tracy.ai/<siteKey>/` is dsh, `cowork.tracy.ai/auth/me` is the Worker),
 * which is why `dsh-url.ts` in each plugin keeps four paths root-absolute on purpose:
 * `/auth/me`, `/login`, `/api/sites`, `/api/team`. Run a lane on `127.0.0.1:51731` and those four
 * answer 302/404, because nothing is in front of dsh. The Build form then opens a sign-in window
 * at a page that does not exist and waits 120 × 2s at `waitForSignIn()` — four minutes of a
 * spinner and not one error (measured 08/09).
 *
 * So this stands in front of the lane and answers exactly those doors, and proxies everything else
 * — WebSocket included — through to dsh untouched.
 *
 * 🔒 IT BUILDS THE SITE HERE, it does not pretend to. `POST /api/sites` runs `docker compose` on
 * this machine and installs WordPress or Joomla, then reports progress through the same job row
 * the fleet returns (`state`/`step`/`liveUrl`/`adminUrl` — `siteFromJob` in `new-site.mjs`). A
 * fake that answered `done` without a site would send every later stage — seed, theme, the seat
 * door — at a webroot that was never there, and each of those fails further from the cause.
 *
 * TWO SHAPES ARE COPIED FROM THE FLEET DELIBERATELY, because the agent's own tools read them:
 * the compose project is named after the label, so the container is `<label>-web-1` — the name
 * `tracy-subprocess-docker` execs into — and the webroot is bind-mounted at
 * `<sitesRoot>/<label>/.webroot`, the path `siteFolder.mjs` gives a site on the fleet. The
 * compose files themselves are in `dev-fleet-site.mjs`, where a test can read them.
 *
 * TWO CMS, TWO WRITE PATHS. A WordPress site takes `apply` as wp-cli in its container
 * (`applyAction` below, one case per action). A Joomla site takes it the way the fleet does: the
 * official image installs the cowork component alongside Joomla (`JOOMLA_EXTENSIONS_URLS`), and
 * every action is relayed to that component with the site's token — nothing is reimplemented.
 *
 * NOT A FLEET. No traefik, no ingress, no TLS, no seat book: a site here is reachable only at
 * `http://127.0.0.1:<port>`. Stages that ask the seat registry about the new site still need the
 * real Worker.
 *
 * Usage:
 *   node scripts/dev-fleet.mjs                 # listens on 51740, lane at 51731
 *   DEV_FLEET_PORT=… DEV_FLEET_LANE=… DEV_FLEET_EMAIL=… node scripts/dev-fleet.mjs
 *
 * Then open the lane through THIS port instead of the lane's own:
 *   http://127.0.0.1:51740/?token=$(cat tch/profiles/native/.launch-token)
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { join } from 'node:path'
import {
  PLATFORMS,
  componentDoor,
  composeFor,
  platformOf,
  portOf,
  wordpressLanguageCall
} from './dev-fleet-site.mjs'

const PORT = Number(process.env.DEV_FLEET_PORT ?? 51740)
const LANE = new URL(process.env.DEV_FLEET_LANE ?? 'http://127.0.0.1:51731')
const EMAIL = process.env.DEV_FLEET_EMAIL ?? 'dev@localhost'
const SITES_ROOT = process.env.TRACY_SITES_ROOT ?? '/site'
/** Where the first site's HTTP port starts; each new site takes the next free one. */
const PORT_BASE = Number(process.env.DEV_FLEET_SITE_PORT_BASE ?? 8180)

/** Jobs by id. A dev process; when it restarts, a build in flight is gone with it. */
const jobs = new Map()
/** Ports already handed out this run, so two sites never bid for one. */
const taken = new Set()

/**
 * A label the fleet would accept, and that docker compose will take as a project name:
 * lowercase, digits and single dashes.
 * @param {string} raw - whatever the form sent.
 * @returns {string} the normalised label.
 */
function labelOf(raw) {
  const slug = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug === '' ? `site-${Date.now().toString(36)}` : slug
}

/**
 * Run a command and resolve with its exit code and output.
 * @param {string} file - executable.
 * @param {string[]} args - arguments.
 * @param {Record<string, string>} [env] - extra environment.
 * @returns {Promise<{ code: number, out: string }>} the result.
 */
function run(file, args, env = {}) {
  return new Promise((resolve) => {
    // The local daemon, always. `.zshenv` on this machine points DOCKER_HOST at ssh://macmini,
    // and a site built there would be unreachable from the browser this lane runs in.
    const child = spawn(file, args, {
      env: { ...process.env, DOCKER_HOST: '', ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    child.stdout.on('data', (b) => (out += b))
    child.stderr.on('data', (b) => (out += b))
    child.on('close', (code) => resolve({ code: code ?? 1, out }))
  })
}

/**
 * Where a site's cowork token is kept between restarts of this process. OUTSIDE the site folder on
 * purpose: `<sitesRoot>/<label>` is mounted into the site's own container at `/site/<label>`, where
 * the agent's shell can read it, and the token is the write key to that site.
 * @param {string} label - site label.
 * @returns {string} the token file's path.
 */
function tokenPath(label) {
  return join(SITES_ROOT, '.dev-fleet', `${label}.token`)
}

/**
 * The cowork package a fresh Joomla installs alongside itself — read from the SAME manifest the
 * fleet and Tracy Desk read (`lib/cowork-extension.sh` says why not `git ls-remote`), and never
 * below the floor this code was written against. Never throws: a site build must not fail because
 * GitHub is having a minute; the floor URL is a real release.
 * @returns {Promise<string>} a `https` zip URL.
 */
async function coworkPackage() {
  const floor = '0.12.0'
  const prefix = 'https://github.com/TracyHQ/claude-cowork/releases/download/'
  const fallback = `${prefix}joomla-v${floor}/pkg_claudecowork-${floor}.zip`
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/joomla/update.json',
      {
        signal: AbortSignal.timeout(10000)
      }
    )
    if (!res.ok) return fallback
    const manifest = await res.json()
    const pkg = typeof manifest?.package === 'string' ? manifest.package : ''
    return pkg.startsWith(prefix) ? pkg : fallback
  } catch {
    return fallback
  }
}

/**
 * Build one site, reporting each stage into its job row.
 * @param {{ id: string, label: string, platform: string, port: number, state: string, step: string, liveUrl: string | null, adminUrl: string | null }} job - the row to update in place.
 */
async function build(job) {
  const dir = join(SITES_ROOT, job.label)
  const at = (step) => {
    job.step = step
    process.stdout.write(`dev-fleet: [${job.label}] ${step}\n`)
  }
  try {
    job.state = 'running'
    at('folder')
    mkdirSync(join(dir, '.webroot'), { recursive: true })
    const composePath = join(dir, 'compose.yml')
    const extras = job.platform === 'joomla' ? { extensions: await coworkPackage() } : {}
    writeFileSync(composePath, composeFor(job.platform, job.label, job.port, SITES_ROOT, extras))

    at('containers')
    const up = await run('docker', ['compose', '-f', composePath, 'up', '-d', 'web'])
    if (up.code !== 0) throw new Error(up.out.slice(-400))

    if (job.platform === 'joomla') {
      await finishJoomla(job, dir, composePath, at)
      return
    }

    at('wordpress')
    // WordPress unpacks itself into the empty webroot on first boot; wp-cli has nothing to install
    // against until wp-config.php is there. Poll rather than sleep a guessed number of seconds.
    for (let i = 0; i < 60; i++) {
      if (existsSync(join(dir, '.webroot', 'wp-config.php'))) break
      await new Promise((r) => setTimeout(r, 1000))
    }
    at('database')
    // MariaDB initialises its data directory on first boot and refuses connections until it is
    // done — tens of seconds on a cold volume. `wp core install` against it dies with "Error
    // establishing a database connection", which reads like wrong credentials and is not. Ask the
    // server itself, and only then install (measured 08/09: the first site passed only because
    // pulling the images had already given the database its head start).
    let dbReady = false
    for (let i = 0; i < 90; i++) {
      const ping = await run('docker', [
        'compose',
        '-f',
        composePath,
        'exec',
        '-T',
        'db',
        'mariadb-admin',
        'ping',
        '-uroot',
        '-ptracy-dev',
        '--silent'
      ])
      if (ping.code === 0) {
        dbReady = true
        break
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    if (!dbReady) throw new Error('the database never answered')

    const url = `http://127.0.0.1:${String(job.port)}`
    const install = await run('docker', [
      'compose',
      '-f',
      composePath,
      'run',
      '--rm',
      'cli',
      'core',
      'install',
      `--url=${url}`,
      `--title=${job.label}`,
      '--admin_user=admin',
      '--admin_password=admin',
      // WordPress validates this one: `dev@localhost` is refused ("email address is invalid")
      // because `localhost` is not a TLD, and the install dies at the last step with the
      // containers already up. Use the operator's own address when it looks like one.
      `--admin_email=${/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(EMAIL) ? EMAIL : 'admin@example.com'}`,
      '--skip-email'
    ])
    // An install that says the site is already installed is a success for our purpose.
    if (install.code !== 0 && !/already installed/i.test(install.out))
      throw new Error(install.out.slice(-400))

    at('tools')
    // The agent's shell lives in this container, and dsh's own tools shell out to real binaries:
    // Glob dies with `exit 127` (command not found), not with a refusal, when ripgrep is absent.
    // The fleet's image carries git, ripgrep, less, jq and wp for exactly this reason
    // (see `tracy_web_image` in provision/platform/wordpress.sh); `wordpress:apache` does not.
    const tools = await run('docker', [
      'compose',
      '-f',
      composePath,
      'exec',
      '-T',
      'web',
      'bash',
      '-lc',
      'command -v rg >/dev/null && command -v wp >/dev/null || (' +
        'apt-get update -qq && apt-get install -y -qq ripgrep jq less git curl >/dev/null && ' +
        'curl -sSL -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && ' +
        'chmod +x /usr/local/bin/wp)'
    ])
    // Not fatal: a site without ripgrep still serves, and saying so beats failing the build.
    if (tools.code !== 0)
      process.stdout.write(`dev-fleet: [${job.label}] tools not installed — ${tools.out.slice(-200)}\n`)

    job.liveUrl = url
    job.adminUrl = `${url}/wp-admin/`
    job.state = 'done'
    at('done')
  } catch (error) {
    job.state = 'failed'
    process.stdout.write(`dev-fleet: [${job.label}] FAILED — ${String(error).slice(0, 400)}\n`)
  }
}

/**
 * The rest of a Joomla build, after `docker compose up`: the official image installs Joomla and the
 * cowork package itself (`JOOMLA_EXTENSIONS_URLS`), so this waits that out, reads the component's
 * token — the write key every later `apply` here is relayed with — and puts the agent's tools in.
 *
 * Copied from the fleet's `provision/platform/joomla.sh` (`platform_post_up`): the same wait, the
 * same SQL on `tr_extensions`, the same mint when the install left the params empty.
 * @param {{ label: string, port: number, state: string, liveUrl: string | null, adminUrl: string | null }} job
 * @param {string} dir - the site folder.
 * @param {string} composePath - its compose file.
 * @param {(step: string) => void} at - reports a step into the job row.
 */
async function finishJoomla(job, dir, composePath, at) {
  const url = `http://127.0.0.1:${String(job.port)}`
  at('joomla')
  // The installer copies Joomla into the empty webroot, installs it, installs the extensions, and
  // only then starts Apache — so "the site answers" means all of that has happened. Minutes on a
  // cold image; poll, do not guess.
  let installed = false
  for (let i = 0; i < 300; i++) {
    if (existsSync(join(dir, '.webroot', 'configuration.php'))) {
      const answered = await fetch(`${url}/`, { redirect: 'manual', signal: AbortSignal.timeout(3000) })
        .then((r) => r.status < 500)
        .catch(() => false)
      if (answered) {
        installed = true
        break
      }
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (!installed) throw new Error('Joomla never finished installing')

  at('door')
  const token = await mintToken(job.label, composePath)
  if (token === null)
    process.stdout.write(
      `dev-fleet: [${job.label}] no cowork component on this site — every apply will be refused\n`
    )

  at('tools')
  // Same reason as the WordPress path: the agent's shell lives in this container and dsh's tools
  // shell out to real binaries. php is the image's own.
  const tools = await run('docker', [
    'compose',
    '-f',
    composePath,
    'exec',
    '-T',
    'web',
    'bash',
    '-lc',
    'command -v rg >/dev/null || (apt-get update -qq && apt-get install -y -qq ripgrep jq less git curl >/dev/null)'
  ])
  if (tools.code !== 0)
    process.stdout.write(`dev-fleet: [${job.label}] tools not installed — ${tools.out.slice(-200)}\n`)

  job.liveUrl = url
  job.adminUrl = `${url}/administrator/`
  job.state = 'done'
  at('done')
}

/**
 * The cowork component's token on a Joomla site: read out of its params, minted there when the
 * install left them empty (the component compares against its params verbatim, so a value written
 * into params IS the token — `joomla.sh` does the same). Kept at `tokenPath()` for the relay.
 * @param {string} label - site label.
 * @param {string} composePath - the site's compose file.
 * @returns {Promise<string | null>} the token, or null when the component is not installed.
 */
async function mintToken(label, composePath) {
  const sql = (q) =>
    run('docker', [
      'compose',
      '-f',
      composePath,
      'exec',
      '-T',
      'db',
      'mariadb',
      '--skip-ssl',
      '-N',
      '-uroot',
      '-ptracy-dev',
      'joomla',
      '-e',
      q
    ])
  const row = await sql(
    "SELECT element, JSON_UNQUOTE(JSON_EXTRACT(params,'$.token')) FROM tr_extensions WHERE element='com_claudecowork' AND JSON_VALID(params);"
  )
  if (row.code !== 0 || !row.out.includes('com_claudecowork')) return null
  let token = row.out.trim().split(/\s+/).pop() ?? ''
  if (token === '' || token === 'NULL' || token === 'com_claudecowork') {
    token = randomBytes(20).toString('hex')
    const put = await sql(
      `UPDATE tr_extensions SET params = JSON_SET(IF(JSON_VALID(params), params, '{}'), '$.token', '${token}') WHERE element='com_claudecowork';`
    )
    if (put.code !== 0) return null
  }
  mkdirSync(join(SITES_ROOT, '.dev-fleet'), { recursive: true })
  writeFileSync(tokenPath(label), token)
  return token
}

/**
 * The seat door's `apply` on a Joomla site: relayed to the cowork component, exactly as the seat
 * registry does on the fleet (`{ token, action, params }` in, the component's own shape out). No
 * action is reimplemented here — the component carries fifteen content kinds, an undo log and the
 * installer, and a second copy of any of that would drift from the one a customer's site runs.
 * @param {string} label - the site.
 * @param {string} action - action name.
 * @param {Record<string, any>} params - action parameters.
 * @returns {Promise<Record<string, unknown>>} the component's answer.
 */
async function relayToComponent(label, action, params) {
  const dir = join(SITES_ROOT, label)
  const port = existsSync(join(dir, 'compose.yml'))
    ? portOf(readFileSync(join(dir, 'compose.yml'), 'utf8'))
    : null
  if (port === null)
    return { ok: false, code: 'SITE_NOT_FOUND', message: `${label} has no compose file here.` }
  const token = existsSync(tokenPath(label))
    ? readFileSync(tokenPath(label), 'utf8').trim()
    : await mintToken(label, join(dir, 'compose.yml'))
  if (token === null || token === '')
    return {
      ok: false,
      code: 'COMPONENT_NOT_REGISTERED',
      message: `${label} has no cowork component, so nothing can write to it.`
    }
  let res
  try {
    res = await fetch(componentDoor(port), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token, action, params }),
      signal: AbortSignal.timeout(120000)
    })
  } catch (error) {
    return { ok: false, code: 'COMPONENT_UNREACHABLE', message: String(error).slice(0, 200) }
  }
  const raw = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object'
      ? parsed
      : { ok: false, code: 'COMPONENT_BAD_RESPONSE', message: raw.slice(0, 200) }
  } catch {
    return {
      ok: false,
      code: 'COMPONENT_BAD_RESPONSE',
      message: `${String(res.status)}: ${raw.slice(0, 200)}`
    }
  }
}

/**
 * Is this loopback port free right now?
 *
 * Asked of the operating system, not of our own bookkeeping: this process restarts far more often
 * than a site does, and after a restart `taken` is empty while the previous run's containers still
 * hold their ports. Measured 08/09 — the second site died at `docker compose up` with
 * "Bind for 127.0.0.1:8180 failed: port is already allocated".
 * @param {number} port - the port to test.
 * @returns {Promise<boolean>} true when nothing holds it.
 */
function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, '127.0.0.1')
  })
}

/**
 * Run wp-cli inside a site's own web container.
 *
 * Root runs PHP in these images, and wp-cli refuses to run as root without being told — the
 * refusal is a bare "Error: YIKES!" that reads like a broken install. `--allow-root` every time.
 * @param {string} label - site label, which is also the compose project.
 * @param {string[]} args - wp arguments.
 * @returns {Promise<{ code: number, out: string }>} the result.
 */
async function wp(label, args) {
  return run('docker', ['exec', `${label}-web-1`, 'wp', '--allow-root', '--path=/var/www/html', ...args])
}

/**
 * The seat door's `apply`, done for real on this machine.
 *
 * Each action maps to wp-cli in the site's container, and the ANSWER SHAPE is the component's, not
 * ours: `stages.mjs` reads `manifest.platform`, `listed.themes[].stylesheet|name|status`, and takes
 * `ok !== false` as success (`ok()` and `say()` there). A refusal must carry `message`, because the
 * build shows that sentence and nothing else.
 * @param {string} label - the site.
 * @param {string} action - action name.
 * @param {Record<string, any>} params - action parameters.
 * @returns {Promise<Record<string, unknown>>} the answer, in the component's shape.
 */
async function applyAction(label, action, params) {
  const fail = (message) => ({ ok: false, code: action.replace('.', '_') + '_failed', message })

  // A Joomla site answers through its own component; everything below is wp-cli.
  if (platformOf(join(SITES_ROOT, label)) === 'joomla') return relayToComponent(label, action, params)

  switch (action) {
    case 'core.manifest': {
      const version = await wp(label, ['core', 'version'])
      if (version.code !== 0) return fail(version.out.slice(-200))
      const home = await wp(label, ['option', 'get', 'home'])
      return { ok: true, platform: 'wordpress', version: version.out.trim(), url: home.out.trim() }
    }
    case 'theme.list': {
      const listed = await wp(label, ['theme', 'list', '--format=json'])
      if (listed.code !== 0) return fail(listed.out.slice(-200))
      try {
        const rows = JSON.parse(listed.out.slice(listed.out.indexOf('[')))
        return {
          ok: true,
          themes: rows.map((r) => ({
            stylesheet: r.name,
            name: r.title ?? r.name,
            status: r.status,
            active: r.status === 'active'
          }))
        }
      } catch {
        return fail('the site answered with something that is not a theme list')
      }
    }
    case 'plugin.list':
    case 'extension.list': {
      const listed = await wp(label, ['plugin', 'list', '--format=json'])
      if (listed.code !== 0) return fail(listed.out.slice(-200))
      try {
        const rows = JSON.parse(listed.out.slice(listed.out.indexOf('[')))
        return {
          ok: true,
          extensions: rows.map((r) => ({
            element: r.name,
            type: 'plugin',
            status: r.status,
            active: r.status === 'active'
          })),
          plugins: rows
        }
      } catch {
        return fail('the site answered with something that is not a plugin list')
      }
    }
    case 'theme.install':
    case 'extension.install': {
      const from = String(params.url ?? params.slug ?? '')
      if (from === '') return fail('nothing to install: no url and no slug')
      const put = await wp(label, ['theme', 'install', from, '--force'])
      if (put.code !== 0) return fail(put.out.slice(-300))
      return { ok: true }
    }
    case 'theme.activate':
    case 'extension.enable': {
      const slug = String(params.theme ?? params.element ?? 'tracy')
      const on = await wp(label, ['theme', 'activate', slug])
      if (on.code !== 0) return fail(on.out.slice(-300))
      return { ok: true }
    }
    case 'plugin.install': {
      const slug = String(params.slug ?? '')
      const put = await wp(label, ['plugin', 'install', slug])
      if (put.code !== 0) return fail(put.out.slice(-300))
      return { ok: true }
    }
    case 'plugin.activate': {
      const slug = String(params.slug ?? '')
      const on = await wp(label, ['plugin', 'activate', slug])
      if (on.code !== 0) return fail(on.out.slice(-300))
      return { ok: true }
    }
    case 'theme.style': {
      // The real work, not a note that it happened. `docs/references/theme-style-action.md` spells
      // out the four steps — read `styles/<id>.json`, strip `$schema`/`title`, write the user
      // global-styles post, attach its `wp_theme` term, lift the two kses filters — and the theme
      // already carries them as `tracy_apply_inspiration()`. Calling that is exactly what the
      // stage does on a lane it holds. Writing only an option left every page but the front one
      // in the theme's default palette, while the build reported the style as applied (08/09).
      const style = String(params.style ?? '')
      if (!/^[a-z0-9-]+$/.test(style)) return fail(`a style id is a-z, 0-9 and dashes: ${style}`)
      const applied = await wp(label, [
        'eval',
        `if (!function_exists("tracy_apply_inspiration")) { echo "NO_FUNC"; exit; } echo tracy_apply_inspiration("${style}") ? "OK" : "NO_SUCH_STYLE";`
      ])
      if (applied.code !== 0) return fail(applied.out.slice(-300))
      const said = applied.out.trim()
      if (said.includes('NO_FUNC'))
        return { ok: false, code: 'UNKNOWN_ACTION', message: 'this theme has no tracy_apply_inspiration()' }
      if (said.includes('NO_SUCH_STYLE'))
        return { ok: false, code: 'NO_SUCH_STYLE', message: `no style ${style} in the theme` }
      // Kept beside it: the seeder reads this option to know which look the site wears.
      await wp(label, ['option', 'update', 'tracy_style', style, '--autoload=yes'])
      return { ok: true, style }
    }
    case 'content.list': {
      // The seeder asks "is there already a page with this slug?" — `{ name, post_type, limit }`
      // — and reads `items[0].id`. Answering with a different shape is answering a question
      // nobody asked: it then treats every page as new, or as existing, and writes twice.
      const args = ['post', 'list', '--format=json', '--fields=ID,post_name,post_title']
      if (typeof params.post_type === 'string') args.push(`--post_type=${params.post_type}`)
      if (typeof params.name === 'string') args.push(`--name=${params.name}`)
      if (typeof params.limit === 'number') args.push(`--posts_per_page=${String(params.limit)}`)
      const listed = await wp(label, args)
      if (listed.code !== 0) return fail(listed.out.slice(-200))
      try {
        const rows = JSON.parse(listed.out.slice(listed.out.indexOf('[')))
        const items = rows.map((r) => ({ id: r.ID, name: r.post_name, title: r.post_title }))
        return { ok: true, items, content: items }
      } catch {
        return fail('the site answered with something that is not a content list')
      }
    }
    case 'content.update': {
      // Three kinds, the component's own: `post`, `postmeta`, `option`. An id of 0 on a post means
      // CREATE — that is how the seeder makes a page — and the answer must carry the new id, or it
      // stops with "the door wrote <slug> without an id".
      const kind = String(params.kind ?? (params.option !== undefined ? 'option' : 'post'))
      const fields = /** @type {Record<string, any>} */ (params.fields ?? {})

      if (kind === 'option') {
        const name = String(params.key ?? params.option ?? params.name ?? '')
        const raw = fields.value ?? params.value ?? ''
        const value = typeof raw === 'string' ? raw : JSON.stringify(raw)
        const put = await wp(label, ['option', 'update', name, value])
        return put.code === 0 ? { ok: true } : fail(put.out.slice(-300))
      }

      if (kind === 'postmeta') {
        const id = Number(params.id ?? 0)
        const key = String(params.key ?? '')
        const raw = fields.value ?? ''
        const value = typeof raw === 'string' ? raw : JSON.stringify(raw)
        if (!Number.isInteger(id) || id <= 0 || key === '') return fail('postmeta needs a post id and a key')
        const put = await wp(label, ['post', 'meta', 'update', String(id), key, value])
        return put.code === 0 ? { ok: true, id } : fail(put.out.slice(-300))
      }

      const id = Number(params.id ?? 0)
      const flag = (name, value) =>
        value === undefined || value === null
          ? []
          : [`--${name}=${typeof value === 'string' ? value : JSON.stringify(value)}`]
      const common = [
        ...flag('post_title', fields.post_title),
        ...flag('post_content', fields.post_content),
        ...flag('post_excerpt', fields.post_excerpt),
        ...flag('post_status', fields.post_status),
        ...flag('post_date', fields.post_date),
        ...(Array.isArray(fields.post_category) && fields.post_category.length > 0
          ? [`--post_category=${fields.post_category.join(',')}`]
          : [])
      ]
      if (id > 0) {
        const put = await wp(label, ['post', 'update', String(id), ...common])
        return put.code === 0 ? { ok: true, id } : fail(put.out.slice(-300))
      }
      const made = await wp(label, [
        'post',
        'create',
        ...common,
        ...flag('post_name', fields.post_name),
        ...flag('post_type', fields.post_type),
        '--porcelain'
      ])
      if (made.code !== 0) return fail(made.out.slice(-300))
      const newId = Number(made.out.trim().split(/\s+/).pop())
      if (!Number.isInteger(newId) || newId <= 0)
        return fail(`the site created nothing usable: ${made.out.slice(-120)}`)
      return { ok: true, id: newId }
    }

    case 'content.language': {
      // Polylang marks a post's language and pairs it with its twins, the way the Claude Cowork plugin's
      // language fix does it (`wordpressLanguageCall`). The seeder treats a refusal as a warning — so a lane
      // without this door still builds a site, it just leaves every page unlabelled.
      const call = wordpressLanguageCall(params)
      if ('refusal' in call) return { ok: false, error: 'bad_params', message: call.refusal }
      const said = await wp(label, ['eval', call.php])
      if (said.code !== 0) return fail(said.out.slice(-300))
      if (said.out.includes('NO_POLYLANG'))
        return { ok: false, code: 'UNKNOWN_ACTION', message: 'Polylang is not active on this site' }
      if (said.out.includes('LANG_REFUSED:'))
        return {
          ok: false,
          error: 'bad_params',
          message: said.out.slice(said.out.indexOf('LANG_REFUSED:') + 13).trim()
        }
      if (said.out.includes('LANG_FAILED:'))
        return {
          ok: false,
          error: 'write_failed',
          message: said.out.slice(said.out.indexOf('LANG_FAILED:') + 12).trim()
        }
      return { ok: true, id: call.id, lang: call.slug }
    }

    case 'term.upsert': {
      // The category a blog post is filed under. `doorOps.category()` answers null today — no door
      // reads terms by name — so posts land uncategorised and the seeder says so out loud. This is
      // that door: find by name, create when missing, answer the id.
      const taxonomy = String(params.taxonomy ?? 'category')
      const name = String(params.name ?? '')
      if (name === '') return fail('term.upsert needs a name')
      const found = await wp(label, ['term', 'list', taxonomy, `--name=${name}`, '--field=term_id'])
      const have = Number(found.out.trim().split(/\s+/)[0])
      if (Number.isInteger(have) && have > 0) return { ok: true, id: have }
      const made = await wp(label, ['term', 'create', taxonomy, name, '--porcelain'])
      if (made.code !== 0) return fail(made.out.slice(-300))
      const id = Number(made.out.trim().split(/\s+/).pop())
      return Number.isInteger(id) && id > 0 ? { ok: true, id } : fail(made.out.slice(-200))
    }

    case 'media.upload': {
      // `wp media import` takes a URL or a path and answers the attachment id with --porcelain.
      const from = String(params.url ?? params.path ?? params.file ?? '')
      if (from === '') return fail('media.upload needs a url or a path')
      const args = ['media', 'import', from, '--porcelain']
      if (typeof params.title === 'string') args.push(`--title=${params.title}`)
      if (Number(params.post ?? 0) > 0) args.push(`--post_id=${String(params.post)}`)
      const put = await wp(label, args)
      if (put.code !== 0) return fail(put.out.slice(-300))
      const mediaId = Number(put.out.trim().split(/\s+/).pop())
      return Number.isInteger(mediaId) && mediaId > 0
        ? { ok: true, id: mediaId }
        : fail(`the site imported nothing usable: ${put.out.slice(-120)}`)
    }
    default:
      // The component's own words for a verb it does not carry — a readable refusal, which
      // `stages.mjs` treats as a warning rather than a broken build.
      return { ok: false, code: 'unknown_action', message: `dev-fleet does not carry "${action}" yet.` }
  }
}

/** @returns {Promise<number>} the next free loopback port for a site. */
async function nextPort() {
  for (let port = PORT_BASE; port < PORT_BASE + 200; port += 1) {
    if (taken.has(port)) continue
    if (await portFree(port)) {
      taken.add(port)
      return port
    }
  }
  throw new Error('no free port for a site')
}

/**
 * Read a request body as JSON.
 * @param {http.IncomingMessage} req - the request.
 * @returns {Promise<Record<string, unknown>>} parsed body, `{}` when unreadable.
 */
function readJson(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve({})
      }
    })
  })
}

/**
 * Send a JSON answer.
 * @param {http.ServerResponse} res - the response.
 * @param {number} status - HTTP status.
 * @param {unknown} body - JSON-serialisable body.
 */
function json(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

/**
 * Everything this does not answer goes to the lane, headers and body untouched.
 * @param {http.IncomingMessage} req - the request.
 * @param {http.ServerResponse} res - the response.
 */
function proxy(req, res) {
  // SAY WHO THE VIEWER IS TALKING TO. `tracy-site-tools` builds the origin it calls the Apply door
  // on from `x-forwarded-host` / `x-forwarded-proto`, falling back to `host`
  // (`viewerFromHello` in its `site.mjs`). Proxy without these and the lane's own gateway rewrites
  // Host on the next hop, so the plugin calls the Apply door on the BARE dsh port, gets dsh's 404
  // HTML, and the build reports `COWORK_WEB_BAD_RESPONSE` — a JSON parse error standing in for
  // "nobody was listening there" (measured 08/09).
  const headers = {
    ...req.headers,
    'x-forwarded-host': `127.0.0.1:${String(PORT)}`,
    'x-forwarded-proto': 'http'
  }
  const upstream = http.request(
    { hostname: LANE.hostname, port: LANE.port, path: req.url, method: req.method, headers },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    }
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end('dev-fleet: lane unreachable')
  })
  req.pipe(upstream)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${String(PORT)}`)
  const path = url.pathname

  if (path === '/auth/me') {
    json(res, 200, { email: EMAIL })
    return
  }

  if (path === '/login') {
    // The form opens this in a popup BEFORE it checks the session (Chrome blocks window.open after
    // an await), then closes it when `signedIn()` answers true. Closing ourselves keeps a stray
    // window from sitting there when the check is slow.
    const html = `<!doctype html><meta charset="utf-8"><title>dev-fleet</title>
<body style="font:14px system-ui;padding:2rem">Signed in as <b>${EMAIL}</b> (dev-fleet). This window closes itself.
<script>setTimeout(() => window.close(), 300)</script>`
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }

  if (path === '/api/sites' && req.method === 'POST') {
    const body = await readJson(req)
    const platform = String(body.platform ?? 'wordpress')
    if (!PLATFORMS.includes(platform)) {
      json(res, 400, {
        code: 'platform/unsupported',
        message: `dev-fleet builds WordPress and Joomla, not ${platform}.`
      })
      return
    }
    const label = labelOf(body.label)
    const job = {
      id: `job-${Date.now().toString(36)}`,
      label,
      platform,
      port: await nextPort(),
      state: 'queued',
      step: 'queued',
      liveUrl: null,
      adminUrl: null
    }
    jobs.set(job.id, job)
    void build(job)
    json(res, 202, { siteKey: `${label}.localhost`, jobId: job.id })
    return
  }

  const applyRoute = /^\/api\/sites\/([^/]+)\/apply$/.exec(path)
  if (applyRoute !== null && req.method === 'POST') {
    const body = await readJson(req)
    // The site key a lane knows is `<label>.localhost` here; the container is named by the label.
    const label = decodeURIComponent(applyRoute[1]).replace(/\.localhost$/, '')
    const action = String(body.action ?? '')
    const params = /** @type {Record<string, any>} */ (body.params ?? {})
    process.stdout.write(`dev-fleet: [${label}] apply ${action}\n`)
    const answer = await applyAction(label, action, params)
    json(res, answer.ok === false ? 400 : 200, answer)
    return
  }

  const poll = /^\/api\/sites\/[^/]+\/jobs\/([^/]+)$/.exec(path)
  if (poll !== null && req.method === 'GET') {
    const job = jobs.get(poll[1])
    if (job === undefined) {
      json(res, 404, { state: 'failed', step: 'unknown job' })
      return
    }
    json(res, 200, { state: job.state, step: job.step, liveUrl: job.liveUrl, adminUrl: job.adminUrl })
    return
  }

  proxy(req, res)
})

// dsh talks over WebSocket for everything that matters — sessions, chat, the sidebar. Without this
// the page loads and then sits there, which looks like a slow lane rather than a missing upgrade.
server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(Number(LANE.port), LANE.hostname, () => {
    const headers = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join('\r\n')
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`)
    if (head.length > 0) upstream.write(head)
    socket.pipe(upstream)
    upstream.pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(
    `dev-fleet: http://127.0.0.1:${String(PORT)} → lane ${LANE.origin}\n` +
      `dev-fleet: answering /auth/me as ${EMAIL}; /api/sites builds WordPress or Joomla under ${SITES_ROOT}/<label>\n`
  )
})
