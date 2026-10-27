/**
 * Every reference doc must declare WHAT IT IS ABOUT and WHERE ITS SOURCE CODE IS.
 *
 * WHY — A REAL CASE, MEASURED 2026-08-30. `packages/locale/tracy-locale-vi/README.md` described
 * `patch-dsh-locale.mjs`: the mechanism that patched dsh's locale list. That file was **deleted** when TCH
 * settled on `0.1.2-alpha.1` (alpha.1 has `ctx.locale.addLanguage`, so no patch was needed). The doc stayed,
 * teaching readers to look for something decided not to exist — and no gate saw it, because
 * `check-doc-links` only inspects Markdown links, while that name sat in prose.
 *
 * `sources:` closes exactly that hole: the doc **declares** the code it describes, and the gate checks the
 * paths exist. Delete the code and the gate goes red **on the day of deletion**, at the doc that lies —
 * not weeks later when someone follows it and finds nothing.
 *
 * Idea taken from `CherryHQ/cherry-studio` (`scripts/verify-doc-frontmatter.ts`); the parsing is rewritten
 * with the `js-yaml` already in the repo, no `gray-matter` added.
 *
 * DELIBERATELY NARROW SCOPE: only `docs/references/`. ADRs already have their own header block
 * (Status · Date · Decided by · Enforced in) doing this job their way; forcing frontmatter on them as well
 * is two templates for one purpose. Package READMEs stay out too — they sit right next to the code they
 * describe, so `sources` would always be `.`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { load } from 'js-yaml'

import { absentExclusion } from './lib/public-tree.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const SCOPE = join(ROOT, 'docs/references')

/** The frontmatter a doc must declare. */
interface Frontmatter {
  /** One sentence, one line: what this doc is about. The doc index reads this field. */
  readonly description?: unknown
  /** Paths (relative to the repo root) to the code the doc describes. Checked for existence. */
  readonly sources?: unknown
}

/**
 * Splits off the `---` frontmatter block at the top of the file.
 * @param text - file contents.
 * @returns The parsed YAML block, or null when the file does not start with `---`.
 */
function frontmatter(text: string): Frontmatter | null {
  if (!text.startsWith('---\n')) return null
  const end = text.indexOf('\n---', 4)
  if (end === -1) return null
  const parsed = load(text.slice(4, end))
  return typeof parsed === 'object' && parsed !== null ? (parsed as Frontmatter) : {}
}

/**
 * Checks one doc.
 * @param file - absolute path.
 * @returns The problems, empty when it passes.
 */
function checkFile(file: string): string[] {
  const rel = relative(ROOT, file)
  const data = frontmatter(readFileSync(file, 'utf8'))
  if (data === null) {
    return [
      `${rel}: missing the \`---\` frontmatter block at the top (needs \`description\` and \`sources\`)`
    ]
  }

  const problems: string[] = []

  if (typeof data.description !== 'string' || data.description.trim() === '') {
    problems.push(`${rel}: missing \`description\``)
  } else if (data.description.includes('\n')) {
    problems.push(`${rel}: \`description\` must be on ONE line — the index prints it verbatim`)
  }

  if (!Array.isArray(data.sources) || data.sources.length === 0) {
    problems.push(
      `${rel}: missing \`sources\` — list the paths of the code this doc describes, so deleting that code ` +
        `turns the gate red instead of leaving the doc to lie`
    )
    return problems
  }

  for (const entry of data.sources) {
    if (typeof entry !== 'string') {
      problems.push(`${rel}: \`sources\` takes strings only, got ${typeof entry}`)
      continue
    }
    // A source the public export leaves out (`tasks/`) cannot be checked in that export.
    if (!existsSync(join(ROOT, entry)) && absentExclusion(entry.replace(/\/$/, '')) === null) {
      problems.push(`${rel}: \`sources\` points to something that does not exist — ${entry}`)
    }
  }

  return problems
}

// `SYSTEM.md` sits at the root but describes running code like a reference does, so it declares
// its `sources:` too: deleting what it describes turns this gate red on the same day.
const files = [
  ...readdirSync(SCOPE)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => join(SCOPE, name)),
  join(ROOT, 'SYSTEM.md')
]

const problems = files.flatMap(checkFile)

if (problems.length > 0) {
  process.stderr.write(`Doc frontmatter: ${String(problems.length)} problem(s)\n\n`)
  for (const line of problems) process.stderr.write(`  ${line}\n`)
  process.stderr.write(
    '\n  Template:\n' +
      '    ---\n' +
      '    description: One sentence saying what this doc governs.\n' +
      '    sources:\n' +
      '      - scripts/check-language.ts\n' +
      '      - packages/locale/tracy-locale-vi\n' +
      '    ---\n'
  )
  process.exit(1)
}

process.stdout.write(`Doc frontmatter: ${String(files.length)} files, all with description and sources.\n`)
