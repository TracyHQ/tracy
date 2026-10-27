#!/usr/bin/env node
/**
 * Language gate for the words that land in git history: commit messages, the pull request title
 * and the pull request description must be English.
 *
 * Automated checks catch recognizable foreign text, while reviewers assess ambiguous prose.
 * The range checker also inspects file content; this entry point gives quick metadata feedback.
 *
 * TWO ENTRY POINTS, ONE RULE:
 *   node scripts/check-english-commits.mjs --msg-file <path>   `commit-msg` hook (local, bypassable)
 *   node scripts/check-english-commits.mjs [payload.json]      CI: reads the pull request event
 *
 * Enforcement requires protected branches with required checks, reviews and no bypass actors.
 * `git commit --no-verify` skips this local hook.
 *
 * ONLY NEW COMMITS. CI checks `base..head` of the pull request, never the history behind it:
 * `develop` carries older non-English commits and rewriting them is not this gate's job. Merge
 * commits are checked too: their messages can be edited by a person.
 *
 * Quoting, code fences and HTML comments do not exempt contributor prose. Write English in the
 * message and link to localized data in the files instead. The same rule applies to every author.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { englishProblem } from './lib/english-policy.mjs'

/**
 * Normalize prose without creating markup-based exemptions.
 * @param {string} text - raw message, title or description.
 * @param {{ htmlComments?: boolean }} [options] - compatibility option; comments are always checked.
 * @returns {string} The text that must be English.
 */
export function judgedText(text, { htmlComments = false } = {}) {
  // Keep the argument for callers of the former API; comments are now checked everywhere.
  void htmlComments
  return text.normalize('NFC')
}

/**
 * The first line that violates the deterministic English prose checks.
 * @param {string} text - already passed through `judgedText`.
 * @returns {string | null} That line, trimmed, or null when the text is clean.
 */
export function foreignLine(text) {
  for (const line of text.split('\n')) {
    if (englishProblem(line)) return line.trim()
  }
  return null
}

/**
 * Drop what git adds to the editor buffer: `#` comment lines and the verbose-diff scissors block.
 * @param {string} message - contents of `.git/COMMIT_EDITMSG`.
 * @returns {string} The message the commit will keep.
 */
export function stripGitComments(message) {
  const scissors = message.indexOf('\n# ------------------------ >8 ------------------------')
  const kept = scissors === -1 ? message : message.slice(0, scissors)
  return kept
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
}

/**
 * Violations of one pull request.
 * @param {{ title: string, body: string, commits: Array<{ sha: string, message: string }> }} pull
 * @returns {string[]} One readable line per violation; empty when the pull request is clean.
 */
export function violations({ title, body, commits }) {
  const found = []
  const titleLine = foreignLine(judgedText(title))
  if (titleLine !== null) found.push(`PR title is not in English: "${titleLine}"`)
  const bodyLine = foreignLine(judgedText(body, { htmlComments: true }))
  if (bodyLine !== null) found.push(`PR description is not in English: "${bodyLine}"`)
  for (const commit of commits) {
    const line = foreignLine(judgedText(commit.message))
    if (line !== null) found.push(`commit ${commit.sha.slice(0, 10)} is not in English: "${line}"`)
  }
  return found
}

/**
 * All commits a pull request adds on top of its base, including merges.
 * @param {string} base - base branch tip SHA.
 * @param {string} head - pull request head SHA.
 * @returns {Array<{ sha: string, message: string }>} Oldest first.
 */
export function newCommits(base, head) {
  const raw = execFileSync('git', ['log', '--reverse', '--format=%H%x00%B%x1e', `${base}..${head}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  return raw
    .split('\x1e')
    .map((entry) => entry.replace(/^\n/, ''))
    .filter((entry) => entry.trim() !== '')
    .map((entry) => {
      const [sha, ...message] = entry.split('\x00')
      return { sha, message: message.join('\x00') }
    })
}

function report(found, where) {
  process.stderr.write(`Found text that is not in English in ${where}:\n\n`)
  for (const line of found) process.stderr.write(`  - ${line}\n`)
  process.stderr.write(
    '\nWrite this in English. Backticks and code blocks do not exempt prose.\n' +
      'A commit already made: `git commit --amend` for the last one, an interactive rebase for older ones.\n'
  )
  process.exit(1)
}

function main(argv) {
  if (argv[0] === '--msg-file') {
    const file = argv[1]
    if (file === undefined) {
      process.stderr.write('check-english-commits: --msg-file needs a path\n')
      process.exit(2)
    }
    const message = stripGitComments(readFileSync(file, 'utf8'))
    const line = foreignLine(judgedText(message))
    if (line !== null) report([`the commit message is not in English: "${line}"`], 'this commit message')
    return
  }
  const payloadPath = argv[0] ?? process.env.GITHUB_EVENT_PATH
  if (payloadPath === undefined) {
    process.stderr.write('check-english-commits: no payload — pass a path, or set GITHUB_EVENT_PATH\n')
    process.exit(2)
  }
  const { pull_request: pull } = JSON.parse(readFileSync(payloadPath, 'utf8'))
  if (pull === undefined) {
    process.stderr.write('check-english-commits: the payload is not a pull_request event\n')
    process.exit(2)
  }
  const found = violations({
    title: pull.title ?? '',
    body: pull.body ?? '',
    commits: newCommits(pull.base.sha, pull.head.sha)
  })
  if (found.length > 0) report(found, `pull request #${pull.number}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2))
