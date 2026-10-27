/**
 * Self-contained gate: TCH must not depend on a path on any machine's disk.
 *
 * WHY A MACHINE CHECK. This rule was one sentence in the plan (§Principle 4), and a sentence blocks
 * nothing. It was violated all along: `tch/profiles/web/package.json` pointed
 * `link:/Users/<name>/TracyHQ/tracy-infra/...` for four plugins, and everything ran perfectly —
 * on exactly ONE machine. The break only shows on a clean clone, or on the fleet, i.e. as late as possible.
 *
 * THE ONLY ALLOWED WAY OUT IS THE REGISTRY: a version number, not a path.
 *
 * WHAT IS SCANNED. Four file kinds decide what gets pulled into the tree: `package.json` (dependencies),
 * `cordis*.yml` (which packages load as rows), `.npmrc` (where packages come from), and
 * `pnpm-workspace.yaml` — the last is the easiest to forget and the most dangerous: `overrides:` there
 * forces EVERY package in the tree onto another source, and upstream uses exactly that to point at `link:vendor/...`.
 * Source code is NOT scanned — an absolute path in a `.ts` is a different matter, and catching it here
 * would only breed exceptions.
 *
 * TWO LEVELS.
 *   1. A dependency specifier using `link:` / `file:` / `portal:` or starting with `/` `~` `.` —
 *      **always red**, no exceptions. This is the one that actually bit.
 *   2. Any absolute path outside the TCH tree — red, UNLESS it is in ALLOWED_ABSOLUTE with a written
 *      reason. Config values pointing outside are real (a site's webroot), but they must be a visible
 *      decision, not a hole in the gate.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Directories never scanned: generated, not source. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'lib', 'storage'])

/**
 * Subtrees owned by others, skipped by PATH rather than by name.
 *
 * `vendor/` holds two submodules freezing upstream — `deepseek-harness` at `dsh-v0.1.2-alpha.1`
 * and `dsh-passwords` at `v2.6.6` — i.e. the source to rebuild the packages the registry serves, not
 * TCH code. Scanning them asks the wrong question: a trial on 2026-08-30 found 137 violations, among
 * them upstream's `pnpm-workspace.yaml` with `overrides: '@deepseek-ai/cosmokit': 'link:vendor/cosmokit'`
 * and some `cordis.yml` using `!!js` tags that js-yaml here does not load. All of that is their
 * internal business; we do not and should not change it.
 *
 * WHY NOT PUT `'vendor'` IN SKIP_DIRS. That Set matches by name at every level, so it would also
 * blank out a future `vendor` folder under `packages` — which would be OUR code and must be checked
 * like everything else. Here it is exactly one absolute path, and only at the root.
 *
 * THE BOUNDARY IS NOT LOOSENED. TCH consumes these two trees through the REGISTRY — a version number —
 * never through a path: TCH's `pnpm-workspace.yaml` only accepts members at exactly two levels under
 * `packages`, so `vendor/` has no way into the dependency tree. The day a `link:vendor/...` shows up in
 * a TCH file, the gate still catches it as usual, because that file is outside this subtree.
 */
const SKIP_SUBTREES = new Set([join(ROOT, 'vendor')])

/**
 * Absolute paths outside the TCH tree that are allowed — one reason each.
 *
 * Not a convenience list. Adding here accepts that a clean clone on another machine will NOT have
 * that path, and someone will have to fix it by hand. If you cannot write the reason, what needs
 * fixing is the config, not this gate.
 */
const ALLOWED_ABSOLUTE: Array<{ file: string; value: string; why: string }> = [
  {
    file: 'packages/bundle/tracy-native/cordis.patch.yml',
    value: '/opt/tracy',
    why: 'Same reason as the other two bundles: a folder built by the agent IMAGE, a constant of the runtime environment. The `native` profile lacked the skill row until 31/08 — cowork and guest had it, native did not — so the shared skill library could not reach the Site Admin surface.'
  },
  {
    file: 'packages/bundle/tracy-native/cordis.patch.yml',
    value: '/opt/tracy/skills',
    why: 'Tier-300 root of skill-filesystem. When absent the provider skips it rather than failing, so this row is harmless on a dev machine.'
  },
  {
    file: 'packages/bundle/tracy-cowork/cordis.patch.yml',
    value: '/opt/tracy',
    why: 'A folder built by the agent IMAGE (Dockerfile of tracy-fleet-operation), not a path on any one machine. It is a constant of the runtime environment, like /usr/local/lib/node_modules — a clean clone does not need it, and when absent skill-filesystem simply does not see that root.'
  }
]

/** One violation found. */
interface Violation {
  /** Path relative to the repo root. */
  readonly file: string
  /** Sentence describing the violation. */
  readonly message: string
}

/**
 * Dependency specifiers that are banned outright.
 *
 * `~` is only a path when NOT followed by a digit: `~/foo` and `~` are the home folder, while
 * `~18.3.1` is a perfectly valid tilde semver range — and a TIGHTER pin than caret (18.3.x instead
 * of 18.x). The old rule banned both, pushing authors to caret to pass the gate, i.e. the safety
 * gate made versions looser. Caught on 30/08 when a Tracy SPA package (since deleted) pinned
 * `@types/react` with a tilde, exactly as upstream's `apps/web` does.
 */
const BAD_SPECIFIER = /^(link:|file:|portal:|\/|~(?![0-9]))/

/**
 * A specifier pointing at **someone else's latest**, banned outright.
 *
 * This is the TIME axis, not `BAD_SPECIFIER`'s space axis (a path on this disk).
 * `github:owner/repo` resolves to that repo's HEAD **today**: the owner pushing a commit is a
 * release into Tracy, made by an outsider, at a moment nobody here picked, passing none of this
 * repo's gates. Settled on 2026-09-02: pin a version before installing it. Plugins
 * enter the tree as a subtree pinned to one commit — see
 * `docs/adr/0006-plugins-as-pinned-subtrees.md`.
 *
 * A bare tarball URL (`https://…/pkg.tgz`) falls under the same rule: what sits behind an
 * address can change while the version number does not.
 */
const LIVE_REMOTE = /^(github:|gitlab:|bitbucket:|git\+|git:\/\/|https?:\/\/)/

/**
 * Whether a specifier is banned, and why.
 * @param range - the specifier exactly as it sits in the manifest.
 * @returns The clause appended to the violation message, or null when the specifier is fine.
 */
export function bannedSpecifierReason(range: string): string | null {
  if (BAD_SPECIFIER.test(range)) {
    return 'a path on disk. Leaving the TCH tree is only allowed through the registry: a version number.'
  }
  if (LIVE_REMOTE.test(range)) {
    return (
      'a live link to the repo of someone else — it resolves to the latest of that repo, so its owner ' +
      'can release into Tracy. Plugins enter the tree as a subtree pinned to a commit; dependencies ' +
      'enter through the registry with a version number. See ADR 0006.'
    )
  }
  return null
}

/** A Unix or Windows absolute path inside any string. */
const ABSOLUTE_PATH =
  /(?:^|[\s'"=:(])((?:\/(?:Users|home|opt|srv|Volumes|var|tmp|etc)|[A-Za-z]:\\)[^\s'"),;]*)/g

/**
 * Walk the tree, return every file to scan.
 * @returns The absolute path of each file.
 */
function scanFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    // Another checkout is checked against its own root, never against this one's allowlist.
    if (dir !== ROOT && existsSync(join(dir, '.git'))) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      if (SKIP_SUBTREES.has(full)) continue
      if (statSync(full).isDirectory()) walk(full)
      else if (
        entry === 'package.json' ||
        entry === '.npmrc' ||
        entry === 'pnpm-workspace.yaml' ||
        /^cordis.*\.ya?ml$/.test(entry)
      ) {
        out.push(full)
      }
    }
  }
  walk(ROOT)
  return out
}

/**
 * Check every dependency specifier of a manifest.
 * @param rel - relative path of the file.
 * @param manifest - parsed package.json content.
 * @returns Violations found.
 */
function checkDependencies(rel: string, manifest: Record<string, unknown>): Violation[] {
  const found: Violation[] = []
  const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  for (const field of fields) {
    const deps = manifest[field]
    if (deps === null || typeof deps !== 'object') continue
    for (const [name, range] of Object.entries(deps as Record<string, string>)) {
      if (typeof range !== 'string') continue
      const reason = bannedSpecifierReason(range)
      if (reason !== null) {
        found.push({
          file: rel,
          message: `${field}.${JSON.stringify(name)} is ${JSON.stringify(range)} — ${reason}`
        })
      }
    }
  }
  return found
}

/**
 * Find absolute paths leaving the TCH tree in a file's raw content.
 * @param rel - relative path of the file.
 * @param text - file content.
 * @returns Violations found.
 */
function checkAbsolutePaths(rel: string, text: string): Violation[] {
  const found: Violation[] = []
  for (const match of text.matchAll(ABSOLUTE_PATH)) {
    const value = match[1]
    if (value === undefined) continue
    // Inside the TCH tree it is not "leaving" — but it is still an absolute path, so it falls through
    // to the branch below and must be declared. Here only ROOT itself is excluded so the message stays readable.
    if (value.startsWith(ROOT)) continue
    const allowed = ALLOWED_ABSOLUTE.some((entry) => entry.file === rel && value.startsWith(entry.value))
    if (allowed) continue
    found.push({
      file: rel,
      message:
        `absolute path outside the TCH tree: ${value}\n` +
        '    A clean clone on another machine will not have it. If this is a deliberate decision,\n' +
        '    declare it in ALLOWED_ABSOLUTE in scripts/check-self-contained.ts with a reason.'
    })
  }
  return found
}

/** Scan the whole tree and report. */
function main(): void {
  const violations: Violation[] = []
  let scanned = 0

  for (const file of scanFiles()) {
    const rel = relative(ROOT, file)
    const text = readFileSync(file, 'utf8')
    scanned++

    if (file.endsWith('package.json')) {
      let manifest: Record<string, unknown>
      try {
        manifest = JSON.parse(text) as Record<string, unknown>
      } catch (error) {
        violations.push({ file: rel, message: `cannot parse: ${String(error)}` })
        continue
      }
      violations.push(...checkDependencies(rel, manifest))
    }

    if (/cordis.*\.ya?ml$/.test(file) || file.endsWith('pnpm-workspace.yaml')) {
      // Parse to make sure the file is valid; the raw content is what gets searched for paths, since a
      // path can sit under any key, not only `name:`.
      try {
        load(text)
      } catch (error) {
        violations.push({ file: rel, message: `broken YAML: ${String(error)}` })
        continue
      }
    }

    if (file.endsWith('pnpm-workspace.yaml')) {
      const parsed = load(text)
      if (parsed !== null && typeof parsed === 'object') {
        const overrides = (parsed as Record<string, unknown>).overrides
        if (overrides !== null && typeof overrides === 'object') {
          for (const [name, range] of Object.entries(overrides as Record<string, string>)) {
            const reason = typeof range === 'string' ? bannedSpecifierReason(range) : null
            if (reason !== null) {
              violations.push({
                file: rel,
                message:
                  `overrides.${JSON.stringify(name)} is ${JSON.stringify(range)} — ${reason} ` +
                  'And an override forces EVERY package in the tree onto it.'
              })
            }
          }
        }
      }
    }

    violations.push(...checkAbsolutePaths(rel, text))
  }

  if (violations.length > 0) {
    process.stderr.write(`check-self-contained: ${violations.length} violation(s)\n\n`)
    for (const violation of violations) {
      process.stderr.write(`  ${violation.file}: ${violation.message}\n\n`)
    }
    process.exit(1)
  }

  const allowances = ALLOWED_ABSOLUTE.length
  process.stdout.write(
    `check-self-contained: ${scanned} files, clean` +
      (allowances > 0 ? ` (${allowances} declared exceptions)` : '') +
      '.\n'
  )
}

/**
 * Scan only when invoked directly. The test imports this file for `bannedSpecifierReason`, and a
 * scan on import would `process.exit(1)` in the middle of the suite — a break nobody goes
 * looking for.
 */
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
