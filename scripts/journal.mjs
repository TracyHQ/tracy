#!/usr/bin/env node
/**
 * The change journal, read back as one list, newest first.
 *
 *   pnpm journal                      # every entry
 *   pnpm journal --since 2026-09-20   # entries dated on or after that day
 *   pnpm journal --days 7             # the last seven UTC calendar days, today included
 *
 * WHY ENTRIES ARE SEPARATE FILES. Until 25/09/2026 every change inserted its entry at the top of
 * `tasks/nhat-ky-main.md`, so any two parallel pull requests edited the same line and the second
 * one needed an extra merge round for the journal alone (about eight in one day). One file per
 * change (`tasks/nhat-ky/YYYY-MM-DD-<slug>.md`) shares no line with any other. This script gives
 * readers back the single chronological list. It writes nothing: a generated summary file would be
 * one shared file again, and conflict again.
 *
 * TWO FOLDERS DURING THE TRANSITION. `changes/` is the English journal that ships with the public
 * tree (format: `changes/README.md`). `tasks/nhat-ky/` is the older internal journal; while it is
 * in the tree its entries are merged into the same list, and once it is gone only `changes/` is read.
 *
 * Order: by the date in the file name, then by file name, both descending. A file whose name does
 * not start with a valid date is not guessed at — it is named on stderr and left out.
 *
 * `tasks/nhat-ky-main.md` keeps the entries written before the change; this script does not read it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Where the entries live, relative to the repository root: the English journal first, then the internal one. */
export const JOURNAL_DIRS = ['changes', 'tasks/nhat-ky']

/** The directory's rules, not an entry. */
const README = 'README.md'

/** `YYYY-MM-DD-<slug>.md`, the only shape of an entry file. */
const ENTRY_NAME = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/

const USAGE = 'usage: pnpm journal [--since YYYY-MM-DD | --days N] [--dir PATH]\n'

/**
 * Whether a `YYYY-MM-DD` string names a real calendar day (so `2026-02-30` is refused).
 * @param {string} day - candidate date.
 * @returns {boolean} true for a real day.
 */
export function isDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const parsed = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day
}

/**
 * Read the command line.
 * @param {string[]} argv - arguments after the script name.
 * @param {Date} now - the clock, injectable so `--days` is testable.
 * @returns {{since: string | null, dir: string | null}} the first day to include (inclusive), or null for all.
 * @throws {Error} on an unknown flag, a missing or malformed value, or `--since` together with `--days`.
 */
export function parseArgs(argv, now) {
  let since = null
  let days = null
  let dir = null
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--since' || flag === '--days' || flag === '--dir') {
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`)
      i++
      if (flag === '--since') {
        if (!isDay(value)) throw new Error(`--since wants a real YYYY-MM-DD day, got "${value}"`)
        since = value
      } else if (flag === '--days') {
        if (!/^[1-9]\d*$/.test(value)) throw new Error(`--days wants a positive whole number, got "${value}"`)
        days = Number(value)
      } else {
        dir = value
      }
    } else {
      throw new Error(`unknown argument "${flag}"`)
    }
  }
  if (since !== null && days !== null) throw new Error('--since and --days cannot be used together')
  if (days !== null) {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    since = new Date(today - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  }
  return { since, dir }
}

/**
 * Split the directory listing into ordered entries and names that are not entries.
 * @param {string[]} names - file names in the journal directory.
 * @param {string | null} since - first day to include, inclusive; null for all.
 * @returns {{entries: {name: string, day: string}[], skipped: string[]}} entries newest first.
 */
export function selectEntries(names, since) {
  const entries = []
  const skipped = []
  for (const name of names) {
    if (name === README) continue
    const match = ENTRY_NAME.exec(name)
    if (match === null || !isDay(match[1])) {
      skipped.push(name)
      continue
    }
    if (since !== null && match[1] < since) continue
    entries.push({ name, day: match[1] })
  }
  entries.sort((a, b) => (a.day === b.day ? b.name.localeCompare(a.name) : b.day.localeCompare(a.day)))
  return { entries, skipped }
}

/**
 * The journal as printed text: each entry's content unchanged, newest first, a blank line between.
 * @param {string | string[]} dirs - absolute path(s) of the journal directories; entries are merged.
 * @param {string | null} since - first day to include, inclusive; null for all.
 * @returns {{text: string, skipped: string[]}} the text and the names that were left out.
 */
export function renderJournal(dirs, since) {
  const all = []
  const skipped = []
  for (const dir of Array.isArray(dirs) ? dirs : [dirs]) {
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
    const selected = selectEntries(names, since)
    all.push(...selected.entries.map((entry) => ({ ...entry, dir })))
    skipped.push(...selected.skipped)
  }
  all.sort((a, b) => (a.day === b.day ? b.name.localeCompare(a.name) : b.day.localeCompare(a.day)))
  // Content is printed byte for byte; only a missing final newline is supplied, so the
  // separator line always starts on a line of its own.
  const text = all
    .map(({ dir, name }) => {
      const content = readFileSync(join(dir, name), 'utf8')
      return content.endsWith('\n') ? content : `${content}\n`
    })
    .join('\n')
  return { text, skipped }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let options
  try {
    options = parseArgs(process.argv.slice(2), new Date())
  } catch (error) {
    process.stderr.write(`journal: ${error instanceof Error ? error.message : String(error)}\n${USAGE}`)
    process.exit(2)
  }
  const dirs =
    options.dir === null
      ? JOURNAL_DIRS.map((dir) => join(ROOT, dir)).filter((dir) => existsSync(dir))
      : [resolve(options.dir)]
  if (dirs.length === 0) {
    process.stderr.write(`journal: no ${JOURNAL_DIRS[0]}/ in this tree; nothing to read\n`)
    process.exit(0)
  }
  const { text, skipped } = renderJournal(dirs, options.since)
  for (const name of skipped) {
    process.stderr.write(`journal: skipped "${name}" — not named YYYY-MM-DD-<slug>.md\n`)
  }
  if (text === '') {
    process.stderr.write(`journal: no entries${options.since === null ? '' : ` since ${options.since}`}\n`)
  }
  process.stdout.write(text)
}
