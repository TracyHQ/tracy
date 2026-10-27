#!/usr/bin/env node
/**
 * Draft the changelog page from the ```release-note``` blocks of merged PRs (and the old
 * ```desktop-release-note``` ones; tasks/todo-desktop-update-policy.md E4, E9). The page is the one
 * source of a release's notes (build/release-notes-page.mjs) and covers the whole product, web and
 * desktop app, labelled by the desktop version; a PR line opening with `desktop:` becomes a bullet
 * ending in the ` _(Desktop only)_` badge, any other line a plain bullet. This only writes a DRAFT a
 * person edits and merges before prepare.
 *
 *   node build/draft-release-notes.mjs --version X.Y[.Z] [--since <sha|tag|date>] [--base develop|main]
 *       [--repo <owner/name>] [--force]
 *
 * `--version X.Y` (or `X.Y.0`): a new page `apps/tracy-docs/src/content/docs/changelog/desktop/X.Y.md`
 * — Highlights = the first five notes, Changes = every note grouped by the PR's commit type (feat →
 * New, fix → Fixed, anything else → Other). `--version X.Y.Z`: a `## X.Y.Z` section appended to the
 * existing `X.Y.md` (refused when there is no such page). An existing page or section is never
 * replaced without `--force`. The window is `collect-release-notes.mjs`'s: since the previous
 * `desktop-v*` tag, or `--since`.
 *
 * Prints JSON: the file written, and the PRs a person must look at — `none` (wrote NONE), `missing`
 * (no block) and `rejected` (a note that is not English or names a third party; left out of the
 * draft). Exit 1 when nothing was written, 2 on bad usage.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { collectNotes, fetchMergedPrs, UsageError } from './collect-release-notes.mjs'
import { CHANGELOG_DIR, changelogSection, prefixToBadge } from './release-notes-page.mjs'

export { CHANGELOG_DIR }

/** The kind of change a PR title's commit type says. */
const GROUPS = [
  ['New', /^feat(\(|!|:)/],
  ['Fixed', /^fix(\(|!|:)/]
]
const kindOf = (title) => GROUPS.find(([, re]) => re.test(title))?.[0] ?? 'Other'

/**
 * The notes as page bullets, Desktop only ones with their badge, each line once (two PRs of one fix
 * often carry the same note).
 */
function bulletsOf(notes) {
  const seen = new Set()
  const out = []
  for (const n of notes) {
    const line = prefixToBadge(`- ${n.note.replace(/^-\s+/, '')}`)
    if (seen.has(line)) continue
    seen.add(line)
    out.push({ kind: kindOf(n.title), line })
  }
  return out
}

/** A new minor page. */
function minorPage(page, released, bullets) {
  const changes = ['New', 'Fixed', 'Other']
    .map((kind) => [kind, bullets.filter((b) => b.kind === kind)])
    .filter(([, list]) => list.length > 0)
    .map(([kind, list]) => `### ${kind}\n${list.map((b) => b.line).join('\n')}\n`)
    .join('')
  return [
    '---',
    `title: Tracy Cowork ${page}`,
    `description: What changed in Tracy Cowork ${page}, on the web and in the desktop app.`,
    `version: "${page}"`,
    `released: ${released}`,
    `slug: changelog/desktop/${page}`,
    '---',
    '',
    '## Highlights',
    ...bullets.slice(0, 5).map((b) => b.line),
    '',
    '## Changes',
    changes
  ].join('\n')
}

/** A patch section, `## X.Y.Z` up to (not including) the next section. */
const patchSection = (section, released, bullets) =>
  `## ${section}\nReleased ${released}.\n${bullets.map((b) => b.line).join('\n')}\n`

/**
 * Write the draft for `version` under `root` from the merged PRs given.
 * @param {{ root: string, version: string, prs: object[], force?: boolean, today: string }} input
 *   `today`: YYYY-MM-DD, the day the draft says the release shipped (a person corrects it)
 * @returns {{ file: string, section: string, none: number[], missing: number[], rejected: object[] }}
 */
export function writeDraft({ root, version, prs, force = false, today }) {
  if (!/^\d+\.\d+(\.\d+)?$/.test(version)) throw new UsageError(`--version is X.Y or X.Y.Z, got: ${version}`)
  const { page, section } = changelogSection(/^\d+\.\d+$/.test(version) ? `${version}.0` : version)
  const { notes, rejected, none, missing } = collectNotes(prs)
  const report = { none, missing, rejected }
  const bullets = bulletsOf(notes)
  if (bullets.length === 0)
    throw new DraftError('no PR in the window wrote a release note: write the page by hand', report)
  const file = path.join(root, CHANGELOG_DIR, `${page}.md`)
  if (section === 'Highlights') {
    if (existsSync(file) && !force)
      throw new DraftError(
        `${path.relative(root, file)} exists: edit it, or pass --force to start it again`,
        report
      )
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, minorPage(page, today, bullets))
    return { file, section, ...report }
  }
  if (!existsSync(file))
    throw new DraftError(
      `${path.relative(root, file)} does not exist: a patch section goes into its minor's page`,
      report
    )
  const text = readFileSync(file, 'utf8')
  const own = new RegExp(`^## ${section.replace(/\./g, '\\.')}[ \\t]*\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, 'm')
  const fresh = patchSection(section, today, bullets)
  let next
  if (own.test(text)) {
    if (!force)
      throw new DraftError(
        `${path.relative(root, file)} already has ## ${section}: edit it, or pass --force`,
        report
      )
    next = text.replace(own, fresh)
  } else next = `${text.replace(/\n*$/, '\n')}\n${fresh}`
  writeFileSync(file, next)
  return { file, section, ...report }
}

/** Nothing written, and why — with the PRs a person must look at all the same. */
export class DraftError extends Error {
  constructor(message, report) {
    super(message)
    this.report = report
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const usage =
    'usage: draft-release-notes.mjs --version X.Y[.Z] [--since <sha|tag|date>] [--base develop|main] [--repo <owner/name>] [--force]\n'
  let values
  try {
    ;({ values } = parseArgs({
      options: {
        version: { type: 'string' },
        since: { type: 'string' },
        base: { type: 'string', default: 'develop' },
        repo: { type: 'string' },
        force: { type: 'boolean', default: false }
      },
      strict: true,
      allowPositionals: false
    }))
    if (!values.version) throw new Error('--version is required')
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage}`)
    process.exit(2)
  }
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  try {
    const { repo, window, prs } = fetchMergedPrs({
      since: values.since,
      base: values.base,
      repo: values.repo
    })
    const out = writeDraft({
      root,
      version: values.version,
      prs,
      force: values.force,
      today: new Date().toISOString().slice(0, 10)
    })
    process.stdout.write(
      `${JSON.stringify({ repo, base: values.base, since: window.from, prs: prs.length, file: path.relative(root, out.file), section: out.section, none: out.none, missing: out.missing, rejected: out.rejected }, null, 2)}\n`
    )
    process.stderr.write(
      `draft: wrote ${out.section} of ${path.relative(root, out.file)} — a DRAFT: edit it, then open a docs(changelog) PR\n`
    )
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${usage}`)
      process.exit(2)
    }
    if (error instanceof DraftError) {
      process.stderr.write(`draft: ${error.message}\n${JSON.stringify(error.report, null, 2)}\n`)
      process.exit(1)
    }
    throw error
  }
}
