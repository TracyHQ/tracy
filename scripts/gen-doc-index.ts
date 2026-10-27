/**
 * Generates `docs/README.md` — the map of every doc in the repo — and the `--check` gate that keeps it in sync.
 *
 * WHY GENERATED, NOT HAND-WRITTEN. A hand-written index fails in the **quietest** way: it is not
 * wrong, it is only **incomplete**. A new doc is not added, then nobody reads it, then it rots.
 * `tracy-infra` measured that shape on 28/08: **8 of 11 rule docs orphaned** — not one link led to them.
 *
 * `check-doc-links` catches the other direction (pointers into nothing). The two gates close both
 * ends: every link must lead somewhere, and every doc must be linked to.
 *
 * Idea taken from `CherryHQ/cherry-studio` (`scripts/gen-doc-index.ts`, `pnpm docs:index`).
 *
 * WHERE THE DESCRIPTION COMES FROM. The frontmatter `description` if present (`docs/references/` must
 * have one — see `check-doc-frontmatter.ts`); otherwise the H1 title. So adding a reference doc and
 * forgetting its description turns the frontmatter gate red first, and the index never prints an
 * empty row.
 *
 *   pnpm docs:index          rewrites the file
 *   pnpm docs:check-index    red if the file on disk differs from the generated one (the gate runs this)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { load } from 'js-yaml'
import { OVERLAY_DIR, RULES_FILE, matchesRule } from './opensource/export.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'docs/README.md')
const OVERLAY = join(ROOT, OVERLAY_DIR)
/** The public export drops `scripts/opensource/overlay/`, so its index is kept as an overlay too. */
const PUBLIC_OUT = join(OVERLAY, 'docs/README.md')

/** The text of a document in the tree being indexed, or null when it is not in that tree. */
type ReadDoc = (file: string) => string | null

const readOnDisk: ReadDoc = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null)

/** The tree `scripts/opensource/export.mjs` publishes: excluded paths gone, overlays in place. */
function publicReader(): ReadDoc {
  const rules = JSON.parse(readFileSync(join(ROOT, RULES_FILE), 'utf8')) as { exclude?: string[] }
  const exclude = rules.exclude ?? []
  return (file) => {
    const rel = relative(ROOT, file)
    if (exclude.some((rule) => matchesRule(rel, rule))) return null
    return readOnDisk(join(OVERLAY, rel)) ?? readOnDisk(file)
  }
}

/** One index row. */
interface Entry {
  /** Display title. */
  readonly title: string
  /** Path relative to `docs/`. */
  readonly href: string
  /** A one-sentence description. */
  readonly description: string
}

/**
 * Reads the frontmatter `description`, if any.
 * @param text - file contents.
 * @returns The description, or null.
 */
function frontmatterDescription(text: string): string | null {
  if (!text.startsWith('---\n')) return null
  const end = text.indexOf('\n---', 4)
  if (end === -1) return null
  const parsed = load(text.slice(4, end))
  if (typeof parsed !== 'object' || parsed === null) return null
  const value = (parsed as { description?: unknown }).description
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * The first H1 title.
 * @param text - file contents.
 * @returns The title, or null.
 */
function heading(text: string): string | null {
  const found = /^#\s+(.+)$/m.exec(text)
  return found === null ? null : found[1].trim()
}

/**
 * Builds one index row from a file.
 * @param file - absolute path.
 * @returns The index row.
 */
function entryFor(file: string, text: string): Entry {
  const title = heading(text) ?? relative(ROOT, file)
  // The description falls back to the title when there is nothing better: an empty cell looks like a
  // tool bug, while a repeated title is honest — that doc does not describe itself yet.
  const description = frontmatterDescription(text) ?? title
  return { title, href: relative(join(ROOT, 'docs'), file), description }
}

/**
 * Every `.md` file in a folder, sorted.
 * @param dir - absolute path.
 * @returns Absolute paths.
 */
function markdownIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .map((name) => join(dir, name))
}

/** Index rows for the files present in the tree `read` describes. */
function entries(files: readonly string[], read: ReadDoc): Entry[] {
  return files.flatMap((file) => {
    const text = read(file)
    return text === null ? [] : [entryFor(file, text)]
  })
}

/** READMEs next to the code: one row per package and for `workers/`. */
function areaReadmes(): string[] {
  const out: string[] = []
  const packages = join(ROOT, 'packages')
  for (const group of readdirSync(packages).sort()) {
    const groupDir = join(packages, group)
    let names: string[]
    try {
      names = readdirSync(groupDir).sort()
    } catch {
      continue
    }
    for (const name of names) {
      const readme = join(groupDir, name, 'README.md')
      if (existsSync(readme)) out.push(readme)
    }
  }
  const workers = join(ROOT, 'workers/README.md')
  if (existsSync(workers)) out.unshift(workers)
  return out
}

/**
 * A Markdown table.
 * @param entries - the rows.
 * @returns The table block.
 */
function table(entries: readonly Entry[]): string {
  if (entries.length === 0) return '_(none yet)_\n'
  const rows = entries.map((e) => `| [${e.title}](${e.href}) | ${e.description} |`)
  return ['| Document | What it covers |', '|---|---|', ...rows].join('\n') + '\n'
}

function generate(read: ReadDoc): string {
  return [
    '# TCH documentation',
    '',
    '<!-- GENERATED by scripts/gen-doc-index.ts — do not edit by hand; run `pnpm docs:index`. -->',
    '',
    'Every doc in the repo, in one place. The `docs:check-index` gate keeps this table in sync, so a',
    'new doc **cannot** quietly end up with nothing pointing to it.',
    '',
    '## Root rules',
    '',
    table(
      entries(
        ['CONTEXT.md', 'SYSTEM.md', 'CLAUDE.md', 'DESIGN.md'].map((name) => join(ROOT, name)),
        read
      )
    ),
    '## References',
    '',
    table(entries(markdownIn(join(ROOT, 'docs/references')), read)),
    '## Architecture decisions (ADR)',
    '',
    'Numbering rules and the inheritance register: [adr/README.md](adr/README.md).',
    '',
    table(entries(markdownIn(join(ROOT, 'docs/adr')), read)),
    '## READMEs next to the code',
    '',
    'Read the one nearest to what you are editing — they hold local conventions and traps already hit once.',
    '',
    table(entries(areaReadmes(), read))
  ].join('\n')
}

const generated = generate(readOnDisk)
// Only a tree that still carries the overlays (the private source) also keeps the public index.
const generatedPublic = existsSync(OVERLAY) ? generate(publicReader()) : null

const check = process.argv.includes('--check')

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  const currentPublic = generatedPublic === null ? null : (readOnDisk(PUBLIC_OUT) ?? '')
  if (current !== generated || currentPublic !== generatedPublic) {
    process.stderr.write(
      'docs/README.md differs from the generated index.\n' +
        'Run `pnpm docs:index` and commit again — the index is generated, not hand-written.\n'
    )
    process.exit(1)
  }
  const rows = (generated.match(/^\| \[/gm) ?? []).length
  process.stdout.write(`Doc index: ${String(rows)} entries, matches the generated index.\n`)
} else {
  writeFileSync(OUT, generated)
  process.stdout.write(`Wrote ${relative(ROOT, OUT)}.\n`)
  if (generatedPublic !== null) {
    mkdirSync(dirname(PUBLIC_OUT), { recursive: true })
    writeFileSync(PUBLIC_OUT, generatedPublic)
    process.stdout.write(`Wrote ${relative(ROOT, PUBLIC_OUT)}.\n`)
  }
}
