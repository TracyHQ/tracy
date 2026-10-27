/**
 * Fill a dev profile's `node_modules/` from the workspace, the way the image Dockerfile COPYs it.
 *
 * WHY THIS FILE EXISTS. Until 06/09 a profile under `tch/profiles/` fetched its own plugin tree:
 * `package.json` named `@tracy/dsh-native-bundle` and `dsh-better-sidebar` BY VERSION, and dsh ran
 * `pnpm install` inside that directory to pull them from a private registry. That registry is gone,
 * and it should be: a dev machine installing a PUBLISHED build while the source sits next to it is
 * two truths, and the second one drifts in silence.
 *
 * The image answered this first (`packages/fleet/tracy-fleet-operation/dsh/Dockerfile`):
 * the profile declares no plugin dependencies and every plugin package is COPIED straight to
 * `node_modules/<name>`. A profile is `nodeLinker: hoisted`, so a directory sitting there is
 * exactly what pnpm would have produced. This script does the same for a dev machine with one
 * deliberate difference: it SYMLINKS the source tree instead of copying, so `pnpm build` on a
 * plugin is visible to the profile at the next boot.
 *
 * THE CONTRACT IS READ, NEVER RETYPED: the profile's bundles, each bundle's own `dependencies`,
 * its `dsh.bundle.profileDependencies`, and the cordis rows in the profile's own `*.yml`. A name
 * missing here surfaces as HALF AN INTERFACE with no error anywhere (LAW #2's failure mode), so
 * the list has to come off the manifests rather than out of someone's memory.
 *
 * Usage: `node scripts/materialize-profile.mjs [native|web|desktop …]` -- with no arguments it does
 * every profile under `tch/profiles/`.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { workspaceProjects } from './workspace-projects.mjs'

const ROOT = resolve(import.meta.dirname, '..')
// `TCH_PROFILES_DIR` lets a test materialize a throwaway copy instead of the repository's profile.
const PROFILES_DIR = process.env.TCH_PROFILES_DIR ?? join(ROOT, 'tch', 'profiles')

/**
 * Point `node_modules/<name>` at `target`, replacing whatever is there.
 * @param {string} profileModules - the profile's `node_modules` directory.
 * @param {string} name - package name, scope included.
 * @param {string} target - absolute directory to link to.
 */
function link(profileModules, name, target) {
  const destination = join(profileModules, name)
  // A registry dependency npm installed INTO this profile resolves to the destination itself, and
  // linking that would replace a real package with a symlink pointing at its own name -- a loop.
  // The loop is silent: `existsSync(<dest>/package.json)` then answers false forever, so every
  // boot reruns `npm install`, and npm's arborist dies walking it with
  // `Cannot read properties of null (reading 'package')` (measured 08/09, profile `native`).
  if (resolve(target) === resolve(destination)) return
  mkdirSync(dirname(destination), { recursive: true })
  if (existsSync(destination) || isLink(destination)) rmSync(destination, { recursive: true, force: true })
  symlinkSync(relative(dirname(destination), target), destination, 'dir')
}

/**
 * Is this path a symlink, including one whose target is gone?
 *
 * `existsSync` follows the link, so a dangling one answers false and then `symlinkSync` throws
 * EEXIST on top of it -- the state left behind by a package that moved.
 * @param {string} path - path to inspect.
 * @returns {boolean} True when the path itself is a symlink.
 */
function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Materialize one profile.
 * @param {string} profile - directory name under `tch/profiles`.
 * @param {Map<string, string>} projects - every workspace project by name.
 */
function materialize(profile, projects) {
  const profileDir = join(PROFILES_DIR, profile)
  const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const profileModules = join(profileDir, 'node_modules')
  mkdirSync(profileModules, { recursive: true })

  installRegistryDependencies(profile, profileDir, profileModules, manifest, projects)

  const linked = new Set()
  /**
   * Link one package and, when it is a workspace project, everything it declares.
   * @param {string} name - package name.
   * @param {string} fromDir - directory to resolve a non-workspace package from.
   */
  const walk = (name, fromDir) => {
    if (linked.has(name)) return
    // dsh's own packages come from the dsh installation the profile boots against -- linking a
    // second copy here is what gives a plugin its own cordis and a graph that never registers.
    if (name.startsWith('@deepseek-ai/')) return
    const workspaceDir = projects.get(name)
    if (workspaceDir === undefined) {
      const target = resolveFrom(fromDir, name)
      if (target === undefined) return
      linked.add(name)
      link(profileModules, name, target)
      return
    }
    linked.add(name)
    link(profileModules, name, publishedDir(workspaceDir, name))
    const own = JSON.parse(readFileSync(join(workspaceDir, 'package.json'), 'utf8'))
    for (const dependency of Object.keys(own.dependencies ?? {})) walk(dependency, workspaceDir)
    for (const dependency of Object.keys(own.dsh?.bundle?.profileDependencies ?? {})) {
      walk(dependency, workspaceDir)
    }
  }

  for (const bundle of bundles) walk(bundle, profileDir)
  for (const dependency of Object.keys(manifest.dependencies ?? {})) walk(dependency, profileDir)

  // The profile's OWN cordis rows, after the bundles. `tch/profiles/native/cordis.patch.yml` names
  // two plugins no bundle lists (`@tracy/dsh-sandbox-docker`, `@tracy/dsh-subprocess-docker`), and
  // a cordis row pointing at a package that will not resolve is dsh DYING at boot, not a warning:
  // measured 06/09, `ERR_MODULE_NOT_FOUND ... imported from tch/profiles/native/`.
  for (const name of cordisRowNames(profileDir)) walk(name, profileDir)

  process.stdout.write(`materialize-profile: ${profile} — ${String(linked.size)} package(s) linked\n`)
}

/**
 * Install the profile's real npm dependencies, and skip the network when they are already here.
 *
 * ⚠ ORDER: npm runs FIRST, symlinks second. `npm install` treats every directory in node_modules
 * the manifest does not list as extraneous and deletes it -- the image Dockerfile paid for that
 * lesson at exactly this spot ("npm reported removed 5 packages", and `@tracy/` was left an empty
 * directory with nothing saying so).
 *
 * The skip is not an optimisation, it is a capability: `./run.sh` and `./dev.sh` call this on every
 * boot, so an unconditional install would make "no network" mean "no profile boots". Working
 * offline was possible before this file existed and has to stay possible.
 * @param {string} profile - profile name, for the error line.
 * @param {string} profileDir - the profile directory.
 * @param {string} profileModules - its `node_modules`.
 * @param {{dependencies?: Record<string, string>}} manifest - the profile manifest.
 * @param {Map<string, string>} projects - every workspace project by name.
 */
function installRegistryDependencies(profile, profileDir, profileModules, manifest, projects) {
  const wanted = Object.keys(manifest.dependencies ?? {}).filter((name) => !projects.has(name))
  if (wanted.length === 0) return
  if (wanted.every((name) => existsSync(join(profileModules, name, 'package.json')))) return

  const result = spawnSync(
    'npm',
    ['install', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', '--omit=dev'],
    {
      cwd: profileDir,
      stdio: 'inherit',
      env: { ...process.env, npm_config_registry: 'https://registry.npmjs.org' }
    }
  )
  if (result.status !== 0) {
    process.stderr.write(`materialize-profile: ${profile} — npm install failed\n`)
    process.exitCode = 1
  }
}

/**
 * The directory holding the package a consumer actually loads.
 *
 * For nearly every repository that is the package directory itself. The exception is a vendored
 * project whose top level is the DEVELOPMENT repository (`private: true`, no `main`) while the
 * published shape sits in `package/` -- same name, same version, `main: lib/index.js`. Nothing in
 * the tree is shaped that way today (`dsh-mattpocock-skills-deck` was, until it was dropped on
 * 06/09), and the check stays because linking the wrong half kills dsh at boot with
 * `Cannot find package .../index.js` and nothing points here -- measured 06/09.
 * @param {string} directory - the workspace project directory.
 * @param {string} name - package name it declares.
 * @returns {string} The directory to link.
 */
function publishedDir(directory, name) {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  if (manifest.main !== undefined || manifest.exports !== undefined) return directory
  const nested = join(directory, 'package')
  if (!existsSync(join(nested, 'package.json'))) return directory
  const nestedManifest = JSON.parse(readFileSync(join(nested, 'package.json'), 'utf8'))
  return nestedManifest.name === name ? nested : directory
}

/**
 * Package names every cordis row in a directory's `*.yml` names.
 *
 * A regex rather than a YAML parse: a cordis row is `name: <package>` in exactly one shape across
 * this repository, and a materialize step has to run BEFORE the tree is installed -- which is the
 * moment `js-yaml` is least guaranteed to be there.
 * @param {string} directory - directory to scan, not recursive.
 * @returns {string[]} Every name found, in file order.
 */
function cordisRowNames(directory) {
  const names = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.yml')) continue
    for (const line of readFileSync(join(directory, entry.name), 'utf8').split('\n')) {
      const found = /^\s*name:\s*'?(?<name>[@\w][^'\s]*)'?\s*$/u.exec(line)
      if (found?.groups?.name !== undefined) names.push(found.groups.name)
    }
  }
  return names
}

/**
 * Find an installed package directory, using the root installation as the source of truth.
 *
 * A package that is not a workspace member (`schemastery`, and whatever a bundle drags in) is
 * already in the root tree after `pnpm install`. Point at that copy rather than installing a
 * second one: two installs are two versions, and nobody reads the second.
 * @param {string} fromDir - directory whose resolution should be used.
 * @param {string} name - package name.
 * @returns {string | undefined} Absolute directory, or undefined when it is not installed.
 */
function resolveFrom(fromDir, name) {
  try {
    const require = createRequire(join(fromDir, 'noop.js'))
    return dirname(require.resolve(`${name}/package.json`))
  } catch {
    return undefined
  }
}

const requested = process.argv.slice(2)
const profiles =
  requested.length > 0
    ? requested
    : readdirSync(PROFILES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
        .map((entry) => entry.name)

const projects = workspaceProjects()
for (const profile of profiles) materialize(profile, projects)
