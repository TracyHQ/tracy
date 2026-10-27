#!/usr/bin/env node
/**
 * PR description gate: the five answers a reviewer needs before reading the first diff line (the fifth,
 * Web and desktop, is the ADR 0030 rule).
 *
 * WHY A SCRIPT IN THE REPO, NOT `actions/github-script`. The first version embedded this logic straight
 * into the workflow through `actions/github-script@v8`. It **went red on the very PR that opened it**, in
 * the worst way: the job died in ~2 seconds, **no step was recorded**, and the log returned 404 from both
 * `gh run view --log` and the API. Four rounds of digging yielded not one diagnostic line.
 *
 * So what needed fixing was not the regex but the **number of moving parts**: the logic now lives in the
 * repo, runs on bare `node`, and reads the payload from `$GITHUB_EVENT_PATH`. No third-party action, no
 * install layer to block it, and — most important — it **can be run locally** on a saved payload, which the
 * previous version could not:
 *
 *   node scripts/check-pr-description.mjs <path-to-payload.json>
 *
 * 🔒 THE REGEXES FOLLOW THE HEADINGS IN `.github/pull_request_template.md`. Change one word in the template
 * and forget this file, and every later PR goes red for a reason unrelated to its content — the most
 * expensive failure a gate can have. The two files change together.
 */
import { readFileSync } from 'node:fs'

/** The five required sections. `extract` takes the description and returns that section's body. */
const CHECKS = [
  {
    name: 'Before this PR:',
    hint: 'describe the CURRENT behaviour',
    extract: (body) => {
      const what = section(body, '### What this PR does')
      const found = /Before this PR:\s*\n([\s\S]*?)(?=\n\s*After this PR:)/.exec(what)
      return found === null ? '' : found[1]
    }
  },
  {
    name: 'After this PR:',
    hint: 'describe the NEW behaviour',
    extract: (body) => {
      const what = section(body, '### What this PR does')
      const found = /After this PR:\s*\n([\s\S]*)/.exec(what)
      return found === null ? '' : found[1]
    }
  },
  {
    name: 'Why we need it',
    hint: 'why it is worth doing now',
    extract: (body) => section(body, '### Why we need it')
  },
  {
    name: 'How it was verified',
    hint: 'what was actually RUN, not what is probably fine',
    extract: (body) => section(body, '### How it was verified')
  },
  // ADR 0030 (11/10/2026): the web and the desktop app must not differ in features. One line is enough —
  // "Both the same", "Desktop only — web cannot: …" or "N/A — …" — but the author must write it.
  {
    name: 'Web and desktop',
    hint: 'both the same / desktop only because the web cannot: … / N/A — no user-facing surface touched',
    extract: (body) => section(body, '### Web and desktop')
  }
]

/**
 * Extracts a section's body: from after the heading to the next `###` heading, or the end.
 * @param {string} body - the full PR description.
 * @param {string} heading - the heading line to find.
 * @returns {string} The body, or an empty string.
 */
function section(body, heading) {
  const found = new RegExp(`${heading}\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)`).exec(body)
  return found === null ? '' : found[1]
}

/**
 * The template's language checklist line (#754), ticked or not. Only what the author writes after
 * "Why:" counts: the bare line would otherwise make an unfilled "How it was verified" pass.
 */
const LANGUAGE_CHECKLIST =
  /^- \[[ xX]\] Languages: edited `scripts\/locale-debt\.json` or ran `check-interface-languages\.ts --accept-sources`\. Why:/gm

/**
 * What remains after removing the template's HTML comments.
 *
 * Without stripping them an unfilled PR still "has text" and the gate is useless — green on exactly
 * what it exists to block.
 * @param {string} text - the raw body.
 * @returns {string} The real text, whitespace collapsed.
 */
function meaningful(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(LANGUAGE_CHECKLIST, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const payloadPath = process.argv[2] ?? process.env.GITHUB_EVENT_PATH
if (payloadPath === undefined) {
  process.stderr.write('check-pr-description: no payload — pass a path, or set GITHUB_EVENT_PATH\n')
  process.exit(2)
}

const payload = JSON.parse(readFileSync(payloadPath, 'utf8'))
const body = payload.pull_request?.body ?? ''

const missing = CHECKS.filter((check) => meaningful(check.extract(body)) === '')

if (missing.length > 0) {
  process.stderr.write('PR description is incomplete:\n\n')
  for (const check of missing) {
    process.stderr.write(`  - \`${check.name}\` is empty — ${check.hint}.\n`)
  }
  process.stderr.write(
    '\nTemplate: .github/pull_request_template.md\n' +
      'This gate does not read code — it only checks the five answers a reviewer needs before reading the diff.\n'
  )
  process.exit(1)
}

process.stdout.write(`PR description: all ${String(CHECKS.length)} sections present.\n`)
