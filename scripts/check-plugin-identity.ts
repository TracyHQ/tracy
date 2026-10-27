/**
 * Hold every Tracy plugin to one name in all three places it is written down.
 *
 * A dsh plugin states its identity three times: the `name` in package.json, the `name` of
 * the cordis row that loads it, and the `id` its browser bundle passes to
 * `__ModuleLoader__.load`. Nothing at runtime reconciles them. When they disagree the
 * failure is silent -- on 2026-08-30 `dsh-github-workbench` shipped a bundle claiming
 * `@dsh-abilities/github-workbench` while the package was named `dsh-github-workbench`,
 * and half the interface simply did not render. No error, no warning, no log line. The
 * bundle built fine, the package installed fine, and the only symptom was absence.
 *
 * That is why this is a build gate and not a convention: a convention cannot fail loudly,
 * and absence is the one symptom nobody notices in a diff.
 */

import { readFileSync, existsSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { load } from 'js-yaml'
import { workspaceProjects } from './workspace-projects.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES_DIR = join(root, 'packages')
/** One workspace package and the identity facts read off it. */
interface Plugin {
  /** Directory holding the package.json. */
  readonly dir: string
  /** Declared package name. */
  readonly name: string
  /**
   * Paths of the bundle patch files from `dsh.bundle.patch`, empty when none is declared. dsh
   * accepts one path or a list (`app-boot/src/profile.ts` `bundlePatchFiles`); a list is what a
   * bundle with a generated preset file declares since dsh 0.1.7-rc.2.
   */
  readonly patchFiles: readonly string[]
  /** True when package.json declares a browser half. */
  readonly declaresClient: boolean
  /** Package names listed in `dsh.client.inject`, empty when none are declared. */
  readonly clientInject: readonly string[]
}

/** A single problem found, in the order it should be reported. */
interface Problem {
  /** Repo-relative file the problem lives in. */
  readonly file: string
  /** What is wrong. */
  readonly message: string
}

/**
 * Every package directory to check: `packages/<group>/<name>`.
 * @returns Absolute directories.
 */
function packageDirs(): string[] {
  const dirs: string[] = []
  if (existsSync(PACKAGES_DIR)) {
    for (const group of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
      if (!group.isDirectory()) continue
      for (const entry of readdirSync(join(PACKAGES_DIR, group.name), { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(join(PACKAGES_DIR, group.name, entry.name))
      }
    }
  }
  return dirs
}

/**
 * Read every package `packageDirs` names.
 * @returns Each package that declares a `dsh` section.
 */
function readPlugins(): Plugin[] {
  const plugins: Plugin[] = []
  for (const dir of packageDirs()) {
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: string
      dsh?: { bundle?: { patch?: string | string[] }; client?: { inject?: string[] } }
    }
    if (manifest.dsh === undefined) continue
    if (typeof manifest.name !== 'string') {
      throw new Error(`${relative(root, manifestPath)} declares a dsh section but no name`)
    }
    plugins.push({
      dir,
      name: manifest.name,
      patchFiles: [manifest.dsh.bundle?.patch ?? []].flat(),
      declaresClient: manifest.dsh.client !== undefined,
      clientInject: manifest.dsh.client?.inject ?? []
    })
  }
  return plugins
}

/**
 * Pull the id out of a client bundle's `__ModuleLoader__.load` call.
 * @param source - the bundle text.
 * @returns The declared id, or undefined when the call is missing or shaped unexpectedly.
 */
function moduleLoaderId(source: string): string | undefined {
  const match = /__ModuleLoader__\.load\(\s*\{\s*id:\s*(['"])(.*?)\1/.exec(source)
  return match?.[2]
}

/**
 * Collect every `name:` value appearing in a parsed cordis patch document.
 *
 * A patch is a list of rows; `- insert:` rows carry a nested list. Both shapes name the
 * package a row loads, so both are walked.
 * @param node - any node of the parsed YAML.
 * @param found - accumulator.
 * @returns Every string found under a `name` key.
 */
function collectRowNames(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRowNames(item, found)
    return found
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'name' && typeof value === 'string') found.push(value)
      else collectRowNames(value, found)
    }
  }
  return found
}

/**
 * Is this package present in the workspace's installed tree?
 *
 * TWO PLACES, BECAUSE PNPM USES TWO. A package that some workspace member depends on directly
 * gets a symlink at `node_modules/<name>`; one that is only a transitive dependency lives solely
 * under `node_modules/.pnpm/<escaped>@<version>/…` and is deliberately NOT hoisted. Checking the
 * first path alone reported four healthy packages as missing on the first run of this check --
 * @deepseek-ai/dsh-client-locale among them, which every locale plugin here injects and which is
 * plainly installed.
 *
 * The `.pnpm` directory name escapes a scope's slash as `+`, and carries a version suffix, so the
 * lookup is a prefix scan rather than an exists() call.
 * @param name - package name as written in a manifest.
 * @returns True when the package is installed by either layout.
 */
function isInstalled(name: string): boolean {
  // SINCE THE REGISTRY WENT AWAY THIS IS NOT THE SAME QUESTION AS "is it under `node_modules`".
  // `@deepseek-ai/*` and the four forked plugins come from `vendor/` as workspace members now, and
  // pnpm links a workspace member straight into the manifest that depends on it -- it never lands
  // in `node_modules/.pnpm/<name>@<version>` and it is only hoisted to the root when the root
  // itself depends on it. Asking the installed tree alone reported six healthy injections as
  // missing on the first install after the move.
  if (workspaceProjects().has(name)) return true
  if (existsSync(join(root, 'node_modules', name, 'package.json'))) return true
  const store = join(root, 'node_modules', '.pnpm')
  if (!existsSync(store)) return false
  const prefix = `${name.replace('/', '+')}@`
  return readdirSync(store).some((entry) => entry.startsWith(prefix))
}

/**
 * Check one plugin's three identity sites.
 * @param plugin - the plugin to check.
 * @param knownNames - every package name in the workspace, for resolving patch rows.
 * @returns Problems found, empty when the plugin is consistent.
 */
function checkPlugin(plugin: Plugin, knownNames: ReadonlySet<string>): Problem[] {
  const problems: Problem[] = []
  const bundlePath = join(plugin.dir, 'lib', 'client.js')
  const hasBundle = existsSync(bundlePath)

  if (plugin.declaresClient && !hasBundle) {
    problems.push({
      file: relative(root, join(plugin.dir, 'package.json')),
      message: `declares dsh.client but ${relative(root, bundlePath)} does not exist`
    })
  }

  // Every name in `dsh.client.inject` must be a package that exists.
  //
  // dsh parses this field into a list of strings and uses it to order client bundles; it never
  // asks whether a name resolves. So a name pointing at a package that is gone contributes no
  // ordering, raises no error, and logs nothing -- it just sits in the manifest looking correct.
  //
  // Three Tracy plugins carried `@deepseek-ai/dsh-client-runtime` for two days after dsh
  // 0.1.2-alpha.1 dropped that package. Nothing anywhere said so. Found by hand on 2026-08-30
  // while chasing an unrelated broken symlink, which is not a repeatable way to find anything.
  for (const dependency of plugin.clientInject) {
    if (knownNames.has(dependency)) continue
    if (isInstalled(dependency)) continue
    problems.push({
      file: relative(root, join(plugin.dir, 'package.json')),
      message:
        `dsh.client.inject names ${JSON.stringify(dependency)}, which is not installed and ` +
        'is not a workspace package. dsh ignores it silently -- the ordering it claims to ' +
        'declare never happens.'
    })
  }

  if (hasBundle) {
    const id = moduleLoaderId(readFileSync(bundlePath, 'utf8'))
    if (id === undefined) {
      problems.push({
        file: relative(root, bundlePath),
        message: 'no __ModuleLoader__.load({ id: ... }) call found -- dsh cannot register this bundle'
      })
    } else if (id !== plugin.name) {
      problems.push({
        file: relative(root, bundlePath),
        message:
          `__ModuleLoader__ id is ${JSON.stringify(id)} but the package is named ` +
          `${JSON.stringify(plugin.name)}. This renders nothing and logs nothing.`
      })
    }
  }

  for (const patchFile of plugin.patchFiles) {
    const patchPath = join(plugin.dir, patchFile)
    if (!existsSync(patchPath)) {
      problems.push({
        file: relative(root, join(plugin.dir, 'package.json')),
        message: `dsh.bundle.patch points at ${patchFile}, which does not exist`
      })
    } else {
      const rowNames = collectRowNames(load(readFileSync(patchPath, 'utf8')))
      for (const rowName of rowNames) {
        // Rows may legitimately name another workspace package -- that is exactly what a
        // bundle package does. What must never happen is naming a @tracy package that does
        // not exist, which loads nothing and says nothing.
        if (rowName.startsWith('@tracy/') && !knownNames.has(rowName)) {
          problems.push({
            file: relative(root, patchPath),
            message: `row loads ${JSON.stringify(rowName)}, which is not a package in this workspace`
          })
        }
      }
      const namesSelfOrOthers = rowNames.length > 0
      if (!namesSelfOrOthers) {
        problems.push({
          file: relative(root, patchPath),
          message: 'declares no row `name:` at all -- nothing will be loaded'
        })
      }
    }
  }

  return problems
}

/** Check every plugin and report, exiting non-zero on the first inconsistency. */
function main(): void {
  const plugins = readPlugins()
  if (plugins.length === 0) {
    process.stderr.write('check-plugin-identity: no dsh packages found under packages/\n')
    process.exit(1)
  }

  const knownNames = new Set(plugins.map((plugin) => plugin.name))
  const problems = plugins.flatMap((plugin) => checkPlugin(plugin, knownNames))

  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`check-plugin-identity: ${problem.file}: ${problem.message}\n`)
    }
    process.exit(1)
  }

  process.stdout.write(`check-plugin-identity: ${plugins.length} plugin(s) consistent\n`)
}

main()
