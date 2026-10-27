#!/usr/bin/env node
/**
 * Gather the release notes: the ```release-note``` block of every PR merged since the previous
 * `desktop-v*` tag (tasks/todo-desktop-release.md §2.4; one label since E9 of
 * tasks/todo-desktop-update-policy.md). Each line is one change people see, on the web or in the
 * desktop app; a line opening with `desktop:` is in the desktop app only (the convention:
 * build/release-notes-page.mjs). The block's old name, ```desktop-release-note```, is still read.
 *
 *   node build/collect-release-notes.mjs [--since <sha|tag|date>] [--base develop|main] [--repo <owner/name>]
 *
 * Prints JSON: `notes` (PR, title, url, line — oldest merge first), `rejected` (PRs whose note is not
 * English, names a third party, or opens with a label other than `desktop:`), `none` (PRs that wrote
 * NONE), `missing` (PRs with no block, e.g. opened before the
 * template had one), and the window searched. Exit 1 when a note is rejected, 2 on bad usage.
 *
 * Read-only: it lists PRs and prints. Freezing the notes into a release manifest is `prepare`'s job.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { nonEnglishLines } from './english.mjs'
import { hasForeignLabel, normalizeLabel } from './release-notes-page.mjs'
import { thirdPartyLines } from './third-party-names.mjs'

// The new name and the old one. Lines of an old ```desktop-release-note``` block carry no label, so
// they count as "everywhere": the old block was filled only when a change showed in the app, but most
// of what it listed is the web the app shows, and nothing in it says which lines the web lacks. A line
// that does open with `desktop:` there is taken at its word, like in the new block.
const BLOCKS = /```(?:release-note|desktop-release-note)[ \t]*\r?\n([\s\S]*?)\r?\n?```/g

/**
 * The release note one PR body carries: the lines of every block in it, old name or new, in order.
 * @param {string | null | undefined} body
 * @returns {{ state: 'note' | 'none' | 'missing', lines: string[] }}
 */
export function extractReleaseNote(body) {
  const blocks = [...(body ?? '').matchAll(BLOCKS)]
  if (blocks.length === 0) return { state: 'missing', lines: [] }
  // A `NONE` line is the template's placeholder wherever it sits: an author who wrote a line under
  // it meant the line, and `NONE` must never be published as a note.
  const lines = blocks
    .flatMap((found) => found[1].split(/\r?\n/))
    .map((line) => line.trim())
    .filter((line) => line !== '' && line.toUpperCase() !== 'NONE')
    .map(normalizeLabel)
  return lines.length === 0 ? { state: 'none', lines: [] } : { state: 'note', lines }
}

/**
 * Sort the notes of many PRs. Pure.
 * @param {{ number: number, title: string, url: string, body?: string | null, mergedAt?: string }[]} prs
 */
export function collectNotes(prs) {
  const ordered = [...prs].sort((a, b) => String(a.mergedAt ?? '').localeCompare(String(b.mergedAt ?? '')))
  const notes = []
  const rejected = []
  const none = []
  const missing = []
  for (const pr of ordered) {
    const { state, lines } = extractReleaseNote(pr.body)
    if (state === 'none') none.push(pr.number)
    else if (state === 'missing') missing.push(pr.number)
    else {
      const bad = lines.filter(
        (line) =>
          nonEnglishLines(line).length > 0 || thirdPartyLines(line).length > 0 || hasForeignLabel(line)
      )
      if (bad.length > 0) rejected.push({ pr: pr.number, url: pr.url, lines: bad })
      else for (const line of lines) notes.push({ pr: pr.number, title: pr.title, url: pr.url, note: line })
    }
  }
  return { ok: rejected.length === 0, notes, rejected, none, missing }
}

/**
 * The previous release: the newest STABLE `desktop-vX.Y.Z` tag. Only stable releases are tagged
 * (§2.2 step 4); a dev-shaped tag, if one ever appears, never starts the window.
 * @param {string[]} tags
 * @returns {string | null}
 */
export function previousTag(tags) {
  const stable = tags
    .map((tag) => ({ tag, m: /^desktop-v(\d+)\.(\d+)\.(\d+)$/.exec(tag) }))
    .filter(({ m }) => m !== null)
    .map(({ tag, m }) => ({ tag, v: m.slice(1).map(Number) }))
    .sort((a, b) => b.v[0] - a.v[0] || b.v[1] - a.v[1] || b.v[2] - a.v[2])
  return stable[0]?.tag ?? null
}

/**
 * Where the search window starts: `--since` when given, else the previous desktop tag.
 * @param {{ tag: { name: string, date: string } | null, since?: { input: string, date: string } }} input
 * @returns {{ from: string, merged: string }} `merged` is the GitHub search qualifier value.
 */
export function searchSince({ tag, since }) {
  // A bare date means "that whole day"; a commit or tag time means "after that commit".
  if (since)
    return {
      from: since.input,
      merged: /^\d{4}-\d{2}-\d{2}$/.test(since.date) ? `>=${since.date}` : `>${since.date}`
    }
  if (tag) return { from: tag.name, merged: `>${tag.date}` }
  throw new Error('no desktop-v* tag yet: pass --since <sha|tag|date> to say where the notes start')
}

/**
 * The PRs merged into `base` in the window `--since` (or the previous desktop tag) opens, with their
 * bodies — what `collectNotes` reads. Runs `git` and `gh` in `cwd`.
 * @param {{ since?: string, base: string, repo?: string, cwd?: string }} input
 * @returns {{ repo: string, window: { from: string, merged: string }, prs: object[] }}
 * @throws {UsageError} when the window cannot be settled or holds too many PRs to list
 */
export function fetchMergedPrs({ since: sinceInput, base, repo: repoInput, cwd }) {
  const sh = (command, args) =>
    execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commitDate = (rev) => sh('git', ['log', '-1', '--format=%cI', rev])
  const latestTag = previousTag(sh('git', ['tag', '--list', 'desktop-v*']).split('\n'))
  const tag = latestTag ? { name: latestTag, date: commitDate(latestTag) } : null
  let since
  if (sinceInput !== undefined) {
    const isDate = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(sinceInput)
    try {
      since = { input: sinceInput, date: isDate ? sinceInput : commitDate(sinceInput) }
    } catch {
      throw new UsageError(`--since ${sinceInput} is neither a date nor a commit here`)
    }
  }
  let window
  try {
    window = searchSince({ tag, since })
  } catch (error) {
    throw new UsageError(error.message)
  }
  const repo = repoInput ?? sh('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])
  const limit = 500
  const prs = JSON.parse(
    sh('gh', [
      'pr',
      'list',
      '--repo',
      repo,
      '--state',
      'merged',
      '--base',
      base,
      '--search',
      `merged:${window.merged}`,
      '--json',
      'number,title,url,body,mergedAt',
      '--limit',
      String(limit)
    ])
  )
  if (prs.length >= limit)
    throw new UsageError(`${prs.length} PRs in the window, the listing limit: narrow it with --since`)
  return { repo, window, prs }
}

/** A bad window or flag: the command line's fault (exit 2), not a refused note. */
export class UsageError extends Error {}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const usage =
    'usage: collect-release-notes.mjs [--since <sha|tag|date>] [--base develop|main] [--repo <owner/name>]\n'
  let values
  try {
    ;({ values } = parseArgs({
      options: {
        since: { type: 'string' },
        base: { type: 'string', default: 'develop' },
        repo: { type: 'string' }
      },
      strict: true,
      allowPositionals: false
    }))
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage}`)
    process.exit(2)
  }
  let fetched
  try {
    fetched = fetchMergedPrs({ since: values.since, base: values.base, repo: values.repo })
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    process.stderr.write(`${error.message}\n`)
    process.exit(2)
  }
  const { repo, window, prs } = fetched
  const out = collectNotes(prs)
  process.stdout.write(
    `${JSON.stringify({ repo, base: values.base, since: window.from, merged: window.merged, prs: prs.length, ...out }, null, 2)}\n`
  )
  process.exit(out.ok ? 0 : 1)
}
