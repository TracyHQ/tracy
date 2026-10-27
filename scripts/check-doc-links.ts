/**
 * Every relative link in the docs must point at a file that exists.
 *
 * WHY, MEASURED RATHER THAN PRECAUTIONARY. TCH's `CLAUDE.md` is an **index**: it holds no rules, it POINTS
 * to them with lines like `**MUST READ**: [path](path)`. An index with broken pointers is worse than no
 * index — an agent follows it, finds nothing, then **invents a replacement rule**.
 *
 * On 2026-08-30, while this doc layer was being written, `packages/locale/tracy-locale-vi/README.md` had
 * **7/7 broken links**: it had been copied from `tracy-infra` and every path still pointed into that repo's
 * tree. Worse than broken, it described a mechanism TCH no longer uses (`patch-dsh-locale.mjs`, deleted when
 * alpha.1 was settled) — so readers not only failed to find the file but went looking for something decided
 * not to exist. No gate saw it all that time.
 *
 * Only file EXISTENCE is checked, not anchors — the same scope as the `tracy-desk` and `tracy-infra` versions.
 */
import { gitIgnoredFiles } from './lib/git-ignored.mjs'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { absentExclusion } from './lib/public-tree.mjs'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * Scanned folders.
 *
 * `.claude` is here so "read SKILL.md directly" pointers verify themselves too. `tasks/` is **deliberately
 * out**: plans and handoffs talk about files that do NOT exist yet — that is their purpose — so guarding
 * them would turn every plan into a red gate.
 */
const SCAN_DIRS = ['docs', 'packages', 'scripts', '.claude']

/**
 * `vendor/` stays out: READMEs there are upstream's prose pointing into upstream's tree. Fixing them to go
 * green would be editing other people's code (BOUNDARY RULE #5). `tch/` is $DSH_HOME, not docs.
 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'vendor', 'tch', 'data', '.teamshare'])

const LINK = /\[(?:[^\]]*)\]\(([^)]+)\)/g

/**
 * The three root docs describe the system as it is today, so they cite a file and a function or
 * route name, never a line number: `route.js:1476` points at the wrong line after the next edit
 * and no gate notices (CONTEXT.md carried a dozen of them, all stale, when it was rewritten on
 * 05/10/2026). History lives in `tasks/` and ADRs, where a line number pinned to its date is fine.
 */
const NO_LINE_NUMBER_DOCS = new Set(['CONTEXT.md', 'SYSTEM.md', 'CLAUDE.md'])
const LINE_PINNED = /[\w./-]+\.(?:ts|tsx|js|mjs|cjs|json|ya?ml|sh|md|py|php|css)(?::\d+)/g

/** Every `.md` file at the repo root and under `SCAN_DIRS`. */
function markdownFiles(): string[] {
  const out: string[] = []

  for (const entry of readdirSync(ROOT)) {
    if (entry.endsWith('.md') && statSync(join(ROOT, entry)).isFile()) out.push(join(ROOT, entry))
  }

  const walk = (dir: string): void => {
    // An agent worktree has its own repository-relative links and its own gates.
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
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full)
      else if (entry.endsWith('.md')) out.push(full)
    }
  }
  for (const dir of SCAN_DIRS) walk(join(ROOT, dir))

  return out
}

const files = markdownFiles()
const ignored = gitIgnoredFiles(ROOT, files)
const broken: string[] = []
/** Links into what the public export leaves out, in a tree that is that export: not broken. */
const internal = new Set<string>()
const pinned: string[] = []
// An overlay file replaces the file at the same path in the public export, so its links resolve from there.
const OVERLAY = join(ROOT, 'scripts', 'opensource', 'overlay') + sep
const linkBase = (file: string) => (file.startsWith(OVERLAY) ? join(ROOT, file.slice(OVERLAY.length)) : file)

for (const file of files) {
  if (ignored.has(file)) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  // Code blocks are EXAMPLES, not links.
  //
  // A doc teaching how to write links must be able to write one down, and that link points at the
  // reader's place, not the repo's. `tracy-file-links/SKILL.md` does exactly that —
  // `[footer-375.png](/site/<label>/…)` is the pattern for a path ON A LANE — and this gate flagged it
  // as broken. A gate that fires at docs about itself is a gate people ask exceptions from, and enough of
  // them make it meaningless. Same stance as `check-vocabulary` sparing comments that discuss a banned word.
  //
  // Only triple-backtick fences at line start are tracked — enough for this repo's markdown, without a
  // parser for a yes/no question.
  let inFence = false
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    if (NO_LINE_NUMBER_DOCS.has(relative(ROOT, file))) {
      for (const match of line.matchAll(LINE_PINNED)) {
        pinned.push(`${relative(ROOT, file)}:${String(index + 1)}  ${match[0]}`)
      }
    }
    for (const match of line.matchAll(LINK)) {
      const target = match[1].trim()
      if (/^(https?:|mailto:|#)/.test(target)) continue
      // A placeholder in a doc, e.g. `[x](docs/<name>.md)`.
      if (target.includes('<') || target.includes('>')) continue
      const withoutAnchor = target.split('#')[0]
      if (withoutAnchor === '') continue
      const resolved = resolve(dirname(linkBase(file)), withoutAnchor)
      if (!existsSync(resolved)) {
        const excluded = absentExclusion(relative(ROOT, resolved).split(sep).join('/'))
        if (excluded !== null) {
          internal.add(excluded)
          continue
        }
        broken.push(`${relative(ROOT, file)}:${String(index + 1)}  ${target}  →  ${relative(ROOT, resolved)}`)
      }
    }
  })
}

if (pinned.length > 0) {
  process.stderr.write(`Line numbers in a root doc (${String(pinned.length)}):\n\n`)
  for (const line of pinned) process.stderr.write(`  ${line}\n`)
  process.stderr.write('\nName the function, route or key instead; line numbers go stale silently.\n')
  process.exit(1)
}

if (broken.length > 0) {
  process.stderr.write(`Broken links (${String(broken.length)}):\n\n`)
  for (const line of broken) process.stderr.write(`  ${line}\n`)
  process.stderr.write('\nFix the link, or create the file it promises.\n')
  process.exit(1)
}

if (internal.size > 0) {
  process.stdout.write(
    `Links into internal paths not in this tree (public export), not checked: ${[...internal].join(', ')}\n`
  )
}

process.stdout.write(`Doc links: ${String(files.length - ignored.size)} files, no broken links.\n`)
