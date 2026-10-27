/**
 * Discover the DSH client bundles installed on this machine that own locale
 * namespaces.
 *
 * Discovery mirrors the contract `@deepseek-ai/dsh-client-modules` applies at
 * boot: a package takes part in the browser when its manifest declares
 * `dsh.client.platform === "web"` and exports `./client`. A bundle matters to a
 * language pack only when that client code calls `locale.register(`.
 *
 * When the install and the profile both ship a package, selection follows the
 * Desktop overlay rule from `lib/package-overlay.js`: the profile copy wins only
 * on a strictly greater version, otherwise the install copy does. Auditing the
 * wrong copy would compare translations against text the app never renders.
 *
 * @module tools/lib/discover
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import { compare, valid } from './semver.mjs'

/** Read one CLI flag written as `--name value` or `--name=value`. */
export function flag(name, argv = process.argv.slice(2)) {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`))
  if (inline !== undefined) return inline.slice(name.length + 3)
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}

/**
 * Where a DSH Desktop install keeps its unpacked resources. A plain `dsh` CLI
 * install has no such directory — its packages live in the profile store, which
 * the profile roots already cover.
 */
function installRoots() {
  const explicit = flag('install') ?? process.env.DSH_INSTALL
  if (explicit !== undefined) return existsSync(explicit) ? [explicit] : []
  const byPlatform = {
    win32: [join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DSH Desktop', 'resources', 'app.asar.unpacked')],
    darwin: ['/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked'],
    linux: [
      '/opt/DSH Desktop/resources/app.asar.unpacked',
      '/usr/lib/dsh-desktop/resources/app.asar.unpacked',
    ],
  }
  return (byPlatform[platform()] ?? []).filter((dir) => existsSync(dir))
}

/** The profile whose mounted plugins define what needs translating. */
export function profileName() {
  return flag('profile') ?? process.env.DSH_PROFILE ?? 'desktop'
}

/** DSH's home directory, where profiles live. */
export function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/**
 * Roots that may hold packages taking part in the browser. `install` is the
 * Desktop installation graph; `profile` is the active profile and the shared
 * profile store it resolves through.
 */
function searchRoots() {
  const roots = installRoots().map((dir) => ({ label: 'install', dir }))
  roots.push({ label: 'profile', dir: join(dshHome(), 'profiles', profileName()) })
  roots.push({ label: 'profile', dir: join(dshHome(), 'profiles') })
  return roots.filter((entry) => existsSync(entry.dir))
}

/** Resolve `exports["./client"]`, which may be a string or a conditions object. */
function clientExport(manifest) {
  const entry = manifest.exports?.['./client']
  if (typeof entry === 'string') return entry
  if (typeof entry?.default === 'string') return entry.default
  return undefined
}

/** Read a package manifest, or undefined when absent or unparsable. */
function readManifest(dir) {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) return undefined
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return undefined }
}

/**
 * Package directories worth examining under one root: the root itself, its
 * direct `node_modules` children, and one level into each `@scope`.
 */
function packageDirs(rootDir) {
  const dirs = [rootDir]
  const modules = join(rootDir, 'node_modules')
  if (!existsSync(modules)) return dirs
  for (const name of readdirSync(modules)) {
    const dir = join(modules, name)
    try { if (!statSync(dir).isDirectory()) continue } catch { continue }
    if (!name.startsWith('@')) { dirs.push(dir); continue }
    try { for (const scoped of readdirSync(dir)) dirs.push(join(dir, scoped)) } catch { /* unreadable scope */ }
  }
  return dirs
}

/**
 * Choose between two copies of the same package the way the Desktop shell does:
 * the profile copy wins only when its version is strictly greater, so a stale
 * copy in the shared store cannot shadow the installed one.
 * @param existing - the candidate already found.
 * @param incoming - the newly found candidate.
 * @returns whichever copy the runtime would load.
 */
function preferred(existing, incoming) {
  if (existing.source === incoming.source) return existing
  const install = existing.source === 'install' ? existing : incoming
  const profile = existing.source === 'profile' ? existing : incoming
  if (!valid(profile.version) || !valid(install.version)) return install
  return compare(profile.version, install.version) > 0 ? profile : install
}

/**
 * Every installed package shipping a web client bundle that registers locales.
 * @param options.exclude - package name to skip, normally this pack itself.
 * @returns a Map of package name to `{ package, version, bundle, source }`.
 */
export function discover({ exclude } = {}) {
  const found = new Map()
  for (const { label, dir: rootDir } of searchRoots()) {
    for (const dir of packageDirs(rootDir)) {
      const manifest = readManifest(dir)
      if (manifest?.name === undefined || manifest.name === exclude) continue
      if (manifest.dsh?.client?.platform !== 'web') continue
      const relative = clientExport(manifest)
      if (relative === undefined) continue
      const bundle = join(dir, relative)
      if (!existsSync(bundle)) continue
      let text
      try { text = readFileSync(bundle, 'utf8') } catch { continue }
      if (!text.includes('locale.register(')) continue
      const candidate = { package: manifest.name, version: manifest.version ?? null, bundle, source: label }
      const existing = found.get(manifest.name)
      found.set(manifest.name, existing === undefined ? candidate : preferred(existing, candidate))
    }
  }
  return found
}

/** Identify the install the baseline was captured from, for provenance. */
export function installIdentity() {
  for (const dir of installRoots()) {
    const manifest = readManifest(dir)
    if (manifest?.name !== undefined) return { package: manifest.name, version: manifest.version ?? null, dir }
  }
  return { package: null, version: null, dir: null }
}
