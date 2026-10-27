#!/usr/bin/env node
/**
 * Build the snapshots `/ops/cms` serves — one JSON per environment, from one commit each.
 *
 * WHY A BUILD STEP AND NOT A LIVE READER. The container that serves `/ops` has no `.git`, no
 * checkout and no credentials, and it must never grow any: a web process that can read arbitrary
 * refs is a web process that can be asked to read the wrong one. So the repository is read HERE,
 * where a repository already exists, and what ships is a plain JSON file with its provenance
 * stapled to it.
 *
 * 🔒 THE ENVIRONMENT LIST IS AN ALLOWLIST AND IT LIVES IN CODE. Nothing takes a ref from an
 * argument that a browser could ever influence. `--ref` exists for local experiments and refuses
 * to write under a known environment id.
 *
 * 🔒 ONE SHA PER SNAPSHOT, RESOLVED ONCE. Every section of one file reads the same commit, so a
 * branch that moves halfway through a run cannot produce a snapshot that is half one commit and
 * half another — the kind of file that looks perfectly consistent and describes nothing.
 *
 * Usage:
 *   node scripts/gen-ops-cms-snapshot.mjs --out apps/tracy-web/static/ops-cms
 *   node scripts/gen-ops-cms-snapshot.mjs --env dev --out <dir>
 *   node scripts/gen-ops-cms-snapshot.mjs --ref <any-ref> --label scratch --out <dir>
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractAll } from './ops-cms/extract.mjs'
import { SCHEMA_VERSION, envelope, validate } from './ops-cms/schema.mjs'
import { commitDate, gitTree, resolveRef } from './ops-cms/tree.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The two environments the screen offers, and the branch each one means.
 *
 * `main` is production. Until 15/09/2026 it was not: `main` was the frozen seven-Worker line and
 * production was cut from `main-v3`, which is why this entry once pointed there and said "Not
 * `main`". The branches were renamed that day — the old `main` is `main-old`, and `main-v3` became
 * `main` — so the ref this reads moved with them. A snapshot built after the rename that still asked
 * for `main-v3` would not describe an old branch; it would fail to fetch one that no longer exists,
 * and take the image build down with it. `candidates` is ordered: the first ref that exists wins,
 * and the snapshot records which one answered.
 */
export const ENVIRONMENTS = Object.freeze([
  {
    id: 'dev',
    label: 'Dev',
    candidates: ['origin/develop', 'develop'],
    note: 'The branch day-to-day work lands on.'
  },
  {
    id: 'main',
    label: 'Main',
    candidates: ['origin/main', 'main'],
    note: 'The branch production is cut from: a push to it deploys prod1.'
  }
])

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

/**
 * One environment's snapshot.
 * @returns {Promise<{id: string, file: string, sha: string|null, problems: string[]}>}
 */
async function buildOne({ id, label, candidates, note }, outDir) {
  let ref = null
  let sha = null
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop -- ordered fallback: the first that exists wins.
    const found = await resolveRef(REPO, candidate)
    if (found) {
      ref = candidate
      sha = found
      break
    }
  }
  if (!sha) {
    // A ref that is not here is not an error in the tree — it is an environment this machine
    // cannot answer for, and the screen must say exactly that rather than draw an empty snapshot.
    const body = {
      schemaVersion: SCHEMA_VERSION,
      source: { env: id, label, ref: candidates[0], sha: null, generatedAt: new Date().toISOString() },
      unavailable: `None of ${candidates.join(', ')} exists in this repository, so no snapshot could be built.`
    }
    const file = join(outDir, `${id}.json`)
    writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`)
    return { id, file, sha: null, problems: [body.unavailable] }
  }

  const tree = gitTree({ repo: REPO, sha })
  const sections = await extractAll(tree)
  const snapshot = envelope({
    source: {
      env: id,
      label,
      ref,
      sha,
      shortSha: sha.slice(0, 9),
      committedAt: await commitDate(REPO, sha),
      generatedAt: new Date().toISOString(),
      note
    },
    sections,
    // Nothing here has been observed on a machine. Runtime observations arrive at request time
    // from the host channel; a build step has no business claiming any.
    observations: [],
    notes: [
      'Configuration read from a git tree. Nothing in this file has been observed running.',
      'An artifact URL proves a declaration, never a packaged or downloadable file.'
    ]
  })

  const problems = validate(snapshot)
  const json = `${JSON.stringify(snapshot, null, 2)}\n`
  // The digest covers the served bytes, so the server can prove the file it read is the file that
  // was built rather than trusting a field inside it.
  const digest = createHash('sha256').update(json).digest('hex')
  const file = join(outDir, `${id}.json`)
  writeFileSync(file, json)
  writeFileSync(join(outDir, `${id}.sha256`), `${digest}  ${id}.json\n`)
  return { id, file, sha, problems, digest, bytes: Buffer.byteLength(json) }
}

async function main() {
  const outDir = resolve(REPO, arg('out', 'apps/tracy-web/static/ops-cms'))
  mkdirSync(outDir, { recursive: true })

  const only = arg('env')
  const scratchRef = arg('ref')
  if (scratchRef) {
    const label = arg('label', 'scratch')
    if (ENVIRONMENTS.some((e) => e.id === label)) {
      process.stderr.write(`refusing to write a scratch snapshot under the environment id "${label}"\n`)
      process.exit(2)
    }
    const result = await buildOne({ id: label, label, candidates: [scratchRef], note: 'scratch' }, outDir)
    process.stdout.write(`${result.id}: ${result.sha ?? 'unavailable'} -> ${result.file}\n`)
    process.exit(result.problems.length > 0 && result.sha ? 1 : 0)
  }

  const wanted = only ? ENVIRONMENTS.filter((e) => e.id === only) : ENVIRONMENTS
  if (wanted.length === 0) {
    process.stderr.write(
      `no such environment "${only}"; known: ${ENVIRONMENTS.map((e) => e.id).join(', ')}\n`
    )
    process.exit(2)
  }

  const index = { schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), environments: [] }
  let bad = 0
  for (const env of wanted) {
    // eslint-disable-next-line no-await-in-loop -- two refs, and one at a time keeps the log readable.
    const r = await buildOne(env, outDir)
    index.environments.push({
      id: env.id,
      label: env.label,
      ref: r.sha ? undefined : env.candidates[0],
      sha: r.sha,
      available: Boolean(r.sha),
      digest: r.digest ?? null,
      bytes: r.bytes ?? null
    })
    if (r.problems.length > 0 && r.sha) {
      bad += 1
      process.stderr.write(`${env.id}: ${r.problems.length} schema problem(s)\n`)
      for (const p of r.problems) process.stderr.write(`  - ${p}\n`)
    }
    process.stdout.write(
      `${env.id.padEnd(5)} ${r.sha ? r.sha.slice(0, 9) : 'unavailable'.padEnd(9)}  ${r.bytes ?? 0} bytes  ${r.file}\n`
    )
  }
  writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
  process.stdout.write(`index -> ${join(outDir, 'index.json')}\n`)
  process.exit(bad > 0 ? 1 : 0)
}

await main()
