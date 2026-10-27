/**
 * Read the workspace membership straight out of `pnpm-workspace.yaml`.
 *
 * WHY THIS IS SHARED AND NOT COPIED. Since 06/09 "is this package part of the tree" is a question
 * two different tools have to answer -- `check-plugin-identity` (is an injected name real?) and
 * `materialize-profile` (which directory do I link?) -- and both answers must come from the same
 * list. `@deepseek-ai/*` and the forked plugins are workspace members now, so that list changes
 * whenever `vendor/` does; two copies of the expander would drift on the first such change, and the
 * drift shows up as one gate going green while the other goes red on the same tree.
 *
 * A hand-rolled expander rather than a glob dependency, on purpose: every pattern this repository
 * uses puts its only wildcard on a whole path segment, and both callers must work BEFORE the
 * install finishes -- that is exactly when no dependency is guaranteed to be there.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * Expand one `packages:` pattern into the directories it names.
 * @param {string} pattern - repo-relative, `/`-separated; `*` matches one whole segment.
 * @param {string} [root] - directory the pattern is relative to, defaulting to the repository root.
 * @returns {string[]} Absolute directories the pattern matches.
 */
export function expandWorkspacePattern(pattern, root = ROOT) {
  let directories = [root]
  for (const segment of pattern.split('/')) {
    if (segment === '') continue
    const next = []
    for (const directory of directories) {
      if (segment === '*') {
        if (!existsSync(directory)) continue
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          if (entry.isDirectory()) next.push(join(directory, entry.name))
        }
      } else if (existsSync(join(directory, segment))) {
        next.push(join(directory, segment))
      }
    }
    directories = next
  }
  return directories
}

/** Cache for {@link workspaceProjects} -- the expansion walks several hundred directories. */
let cache

/**
 * Every workspace project, by the package name it declares.
 * @returns {Map<string, string>} Package name to absolute directory, computed once.
 */
export function workspaceProjects() {
  if (cache !== undefined) return cache
  const projects = new Map()
  const workspaceFile = join(ROOT, 'pnpm-workspace.yaml')
  if (existsSync(workspaceFile)) {
    // A line-wise read, not a YAML parse: this runs before `pnpm install` has necessarily put
    // `js-yaml` on disk, and the `packages:` list is a flat sequence of scalars in every version
    // of this file. Anything richer than that belongs in the YAML the gates read, not here.
    const patterns = readFileSync(workspaceFile, 'utf8')
      .split('\n')
      .map((line) => /^ {2}- (?<pattern>\S+)\s*$/u.exec(line)?.groups?.pattern)
      .filter((pattern) => pattern !== undefined)
    for (const pattern of patterns) {
      for (const directory of expandWorkspacePattern(pattern)) {
        const manifestPath = join(directory, 'package.json')
        if (!existsSync(manifestPath)) continue
        const { name } = JSON.parse(readFileSync(manifestPath, 'utf8'))
        if (typeof name === 'string' && !projects.has(name)) projects.set(name, directory)
      }
    }
  }
  cache = projects
  return projects
}
