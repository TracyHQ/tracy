/**
 * Prepare a quickstart image's /app for the site user while building its tools layer, and install
 * the pinned SQLite conditional Cowork support when the EmDash version is compatible.
 *
 * Runs as root from web/emdash.Dockerfile. That Dockerfile also layers bare tracy/emdash images,
 * which have no pnpm-installed /app owned by www-data; every step below checks for the quickstart
 * shape first and leaves anything else untouched.
 *
 * 🔒 EVERYTHING THIS SCRIPT WRITES UNDER /app ENDS UP www-data's. /app is a named volume seeded
 * from the image together with its owners, and the site, its agent and site.rebuild all work in it
 * as www-data. Measured 24/10/2026 on dev: the archive's owner (uid 501, packed on a Mac) and the
 * root-run build left 2,421 foreign entries, so `astro build` failed with EACCES and a `pnpm
 * install` stopped half-way with node_modules emptied. Same rule as the templates' own Dockerfile
 * (packages/cms/tracy-emdash-theme-base/Dockerfile, the last RUN).
 *
 * Paths (and the site user's home, TRACY_SITE_HOME) are overridable only so test/emdash-tools-layer-install.test.mjs can run this on a scratch tree.
 */
import { createHash } from 'node:crypto'
import {
  chownSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
const base = process.env.TRACY_COWORK_SUPPORT_DIR || '/tracy-conditional-receiver' // vocabulary-allow: published artifact path, retained for compatibility.
const app = process.env.TRACY_APP_DIR || '/app'
const owner = process.env.TRACY_APP_OWNER || 'www-data'
// The store pnpm uses for /app, whoever runs it. Inside the volume, so a package added later is a
// hard link rather than a copy and survives a container recreate; under node_modules, so it is
// never part of the site's own files (node_modules is ignored by every template's .gitignore).
const store = `${app}/node_modules/.pnpm-store`

const modulesYaml = `${app}/node_modules/.modules.yaml`
const quickstart = existsSync(modulesYaml) && existsSync(`${app}/pnpm-workspace.yaml`) && ownedBy(app, owner)

if (quickstart) pinPnpmStore()
installConditionalSupport()
if (quickstart) giveAppBack()
if (quickstart) prepareSiteUserHome()

/**
 * The template's build stage ran `pnpm install` as root, so node_modules records root's default
 * store (`/root/.local/share/pnpm/store/v11`), which does not exist in the final image. pnpm as
 * www-data wants another one and refuses with ERR_PNPM_UNEXPECTED_STORE on every `pnpm add`.
 * Name one store in the project's own pnpm config (read whatever HOME the caller has) and record
 * the same one in node_modules, so the two agree.
 */
function pinPnpmStore() {
  const modules = JSON.parse(readFileSync(modulesYaml, 'utf8'))
  const version = path.basename(modules.storeDir || '')
  modules.storeDir = `${store}/${/^v\d+$/.test(version) ? version : 'v11'}`
  writeFileSync(modulesYaml, `${JSON.stringify(modules, null, 2)}\n`)
  const workspace = `${app}/pnpm-workspace.yaml`
  const text = readFileSync(workspace, 'utf8')
  const line = `storeDir: ${store}`
  const kept = text.split('\n').filter((l) => !l.startsWith('storeDir:'))
  writeFileSync(workspace, `${kept.join('\n').replace(/\n*$/, '\n')}${line}\n`)
  console.log(`pnpm store for ${app}: ${store}`)
}

/** The conditional Cowork support, only over the exact EmDash version its archive was built from. */
function installConditionalSupport() {
  const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'))
  const core = realpathSync(`${app}/node_modules/emdash`)
  const current = JSON.parse(readFileSync(`${core}/package.json`, 'utf8'))
  if (current.version !== manifest.version) {
    console.log(`Conditional Cowork support ${manifest.commit} does not replace EmDash ${current.version}`)
    return
  }
  const archive = `${base}/core.tar.gz`
  if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== manifest.sha256)
    throw new Error('Conditional Cowork support artifact checksum mismatch')
  rmSync(`${core}/dist`, { recursive: true, force: true })
  // --no-same-owner: as root, GNU tar otherwise keeps the archive's numeric owners (uid 501).
  execFileSync('tar', ['--no-same-owner', '-xzf', archive, '-C', core])
  copyFileSync(`${base}/manifest.json`, `${app}/tracy-conditional-receiver.json`) // vocabulary-allow: published artifact path, retained for compatibility.
  copyFileSync(`${base}/LICENSE`, `${core}/TRACY-RECEIVER-LICENSE`) // vocabulary-allow: published artifact path, retained for compatibility.
  execFileSync('npm', ['run', 'build'], { cwd: app, stdio: 'inherit' })
  console.log(`Installed ${manifest.contract} at ${manifest.commit}`)
}

/** Hand back to the site user whatever the steps above left owned by someone else. */
function giveAppBack() {
  execFileSync(
    'find',
    [app, '-xdev', '!', '-user', owner, '-exec', 'chown', '-h', `${owner}:${owner}`, '{}', '+'],
    {
      stdio: 'inherit'
    }
  )
}

/**
 * `docker exec -u www-data` (the agent's shell, packages/tools/tracy-subprocess-docker) sets HOME to
 * www-data's passwd home, /var/www, which node's Debian image does not create. Every `pnpm` there
 * goes through Corepack, which first creates `$HOME/.cache/node/corepack` and stopped with EACCES on
 * every EmDash quickstart image, before the store was ever read (measured 24/10/2026 on a 19/10
 * image as well). Create the home for the site user and fetch the project's pinned pnpm into its
 * Corepack cache now, so the agent's first `pnpm` needs neither a writable / nor the network.
 * The fetch is best effort: without it the agent's `pnpm` still works, it only downloads first.
 */
function prepareSiteUserHome() {
  const uid = idOf(owner, '-u')
  const gid = idOf(owner, '-g')
  const home = process.env.TRACY_SITE_HOME || passwdHome(owner)
  if (!home || home === '/') {
    console.log(`No home for ${owner}; pnpm will need HOME set by its caller`)
    return
  }
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true, mode: 0o755 })
    chownSync(home, uid, gid)
  }
  const cache = `${home}/.cache`
  if (!existsSync(cache)) {
    mkdirSync(cache, { mode: 0o755 })
    chownSync(cache, uid, gid)
  }
  try {
    execFileSync('corepack', ['install'], {
      cwd: app,
      uid,
      gid,
      env: { ...process.env, HOME: home, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
      stdio: 'inherit'
    })
  } catch {
    console.log(
      `warning: Corepack could not fetch the project's pnpm for ${owner}; it will download on first use`
    )
  }
}

function idOf(user, flag) {
  return Number(execFileSync('id', [flag, user], { encoding: 'utf8' }).trim())
}

function passwdHome(user) {
  const line = readFileSync('/etc/passwd', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${user}:`))
  return line?.split(':')[5] ?? ''
}

/** False when the user does not exist here at all: then this is not a quickstart image. */
function ownedBy(dir, user) {
  let uid
  try {
    uid = Number(
      execFileSync('id', ['-u', user], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    )
  } catch {
    return false
  }
  return statSync(dir).uid === uid
}
