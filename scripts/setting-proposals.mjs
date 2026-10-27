#!/usr/bin/env node
/**
 * Every release with no `tracy_setting.json`, proposed at once — 79 rows a person can read in a
 * sitting, and then write in one go.
 *
 *   OPS_ORIGIN=https://cowork.tracy.ai OPS_COOKIE_FILE=~/.tracy-ops-cookie \
 *     node scripts/setting-proposals.mjs --dry-run [--only <substring>] [--limit N]
 *   … same, with --write, to write every proposal the dry run showed
 *
 * WHY A SCRIPT WHEN THE SCREEN ALREADY HAS THE BUTTON. The button is right for one release and
 * wrong for 79: the value of a batch is seeing all the rows TOGETHER, where a wrong default stands
 * out as a column of 79 identical values rather than as one plausible field on one sheet. So this
 * prints them, and what it prints is what the doors would write — it composes nothing of its own.
 *
 * 🔒 IT GOES THROUGH THE DOORS, NOT AROUND THEM. Every proposal is a GET and every write is a POST
 * to the running deployment, carrying an operator's own session — so the same admission, the same
 * origin check and the same validator apply, and the release history says which person's press
 * wrote each file. A script with a GitHub token of its own would be a second way in, answerable to
 * nobody, and the first thing anyone would reach for the next time the doors said no.
 *
 * 🔒 `--dry-run` IS THE DEFAULT AND `--write` IS TYPED OUT. Reading 79 packages is minutes of
 * downloading and changes nothing; writing changes 79 releases customers can see.
 */
import { readFileSync } from 'node:fs'

/** Which releases a batch may act on, and why each of the others is not one of them. */
export function toVisit(releases, { only = null } = {}) {
  const visit = []
  const skip = []
  for (const r of releases) {
    if (only && !r.tag.includes(only)) continue
    const why =
      r.kind === 'design-pack'
        ? 'a design pack, not a quickstart'
        : r.tracy === 'ready'
          ? 'already Ready'
          : r.platform !== 'joomla'
            ? 'not Joomla'
            : r.github === 'draft'
              ? 'a draft'
              : null
    if (why) skip.push({ tag: r.tag, why })
    else visit.push(r)
  }
  return { visit, skip }
}

/**
 * One release's proposal as a line to read, with the guesses marked.
 *
 * Marked rather than merely present: 79 lines each carrying an unmarked `1.0.0` read as 79 versions
 * somebody looked up, which is the exact misreading this whole feature is built to avoid.
 */
export function lineFor({ tag, document: doc, fields, problems }) {
  if (!doc) return `${tag}\n    would NOT be written: ${problems.join('; ')}`
  const mark = (key, value) => `${value}${fields?.[key]?.source === 'default' ? ' (default)' : ''}`
  const installer = doc.install?.installer
  return [
    tag,
    `    label    ${mark('label', doc.label)}`,
    `    version  ${mark('version', doc.version)}   cms ${mark('cms', doc.cms)}   template ${doc.template ?? '—'}`,
    `    install  ${installer?.file ?? '—'}  sha256 ${installer?.sha256 ?? '—'}`
  ].join('\n')
}

// ── talking to a running deployment ───────────────────────────────────────────────────────────

const flag = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback)
}

function session() {
  const origin = process.env.OPS_ORIGIN
  const file = process.env.OPS_COOKIE_FILE
  if (!origin || !file)
    throw new Error(
      'Set OPS_ORIGIN to the deployment and OPS_COOKIE_FILE to a file holding a staff session cookie (tracy_sess=…) from it.'
    )
  return { origin, cookie: readFileSync(file.replace(/^~/, process.env.HOME ?? '~'), 'utf8').trim() }
}

async function call({ origin, cookie }, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      cookie,
      accept: 'application/json',
      // The doors refuse a write whose Origin is not the deployment's own — the same rule a
      // browser is held to, and this script is not exempt from it.
      ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const text = await response.text()
  let doc = null
  try {
    doc = JSON.parse(text)
  } catch {
    doc = null
  }
  return { status: response.status, doc, text }
}

async function main() {
  const write = process.argv.includes('--write')
  const only = flag('only')
  const limit = Number(flag('limit', '0')) || Infinity
  const who = session()

  const listed = await call(who, '/api/ops/quickstarts')
  if (listed.status !== 200)
    throw new Error(`the list answered ${listed.status}: ${listed.text.slice(0, 200)}`)
  const { visit, skip } = toVisit(listed.doc.releases, { only })
  for (const s of skip) process.stdout.write(`skipped ${s.tag}: ${s.why}\n`)
  process.stdout.write(
    `\n${visit.length} release(s) with no tracy_setting.json${write ? '' : ' — dry run'}\n\n`
  )

  let written = 0
  let refused = 0
  for (const release of visit.slice(0, limit)) {
    const at = `?tag=${encodeURIComponent(release.tag)}`
    // eslint-disable-next-line no-await-in-loop -- one 50 MB package at a time, on purpose.
    const proposal = await call(who, `/api/ops/quickstart/setting-proposal${at}`)
    if (proposal.status !== 200) {
      refused += 1
      process.stdout.write(`${release.tag}\n    ${proposal.doc?.error}: ${proposal.doc?.reason ?? ''}\n\n`)
      continue
    }
    process.stdout.write(`${lineFor(proposal.doc)}\n\n`)
    if (!write || !proposal.doc.document) {
      if (write) refused += 1
      continue
    }
    // eslint-disable-next-line no-await-in-loop -- same.
    const done = await call(who, `/api/ops/quickstart/setting${at}`, {
      method: 'POST',
      body: proposal.doc.document
    })
    if (done.status === 200 && done.doc?.tracy === 'ready') {
      written += 1
      process.stdout.write(`    written — ${release.tag} is Ready\n\n`)
    } else {
      refused += 1
      process.stdout.write(`    NOT written: ${done.status} ${JSON.stringify(done.doc)}\n\n`)
    }
  }
  process.stdout.write(
    write ? `${written} written, ${refused} refused.\n` : 'nothing was written — pass --write.\n'
  )
  if (refused > 0) process.exitCode = 1
}

if (process.argv[1]?.endsWith('setting-proposals.mjs'))
  main().catch((e) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  })
