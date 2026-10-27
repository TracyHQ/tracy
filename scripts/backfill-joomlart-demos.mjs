#!/usr/bin/env node
/**
 * Write down the demo address JoomlArt already serves for every `quickstart/ja-*` release.
 *
 * WHY A SCRIPT AND NOT A MIGRATION. A migration states a fact about the SHAPE of the database;
 * this states a fact about a machine outside it — that `<slug>.demo.joomlart.com` answers — and
 * that fact was established by measuring, not by reasoning. Measured 16/09/2026: 70 of 70 `ja-*`
 * tags have a folder under `/data/www/site.demo.joomlart.com/public_html/`, 68 of them serve 200,
 * and every name resolves to the same JoomlArt demo host. A migration that asserted this would be asserting
 * something no future run can check.
 *
 * ⚠ IT WRITES ONLY WHAT IT CAN DERIVE, AND ONLY WHERE NOTHING IS PINNED. `defaultDemoLabel(tag,
 * platform, 'joomlart')` is the one rule; a tag the rule declines is skipped rather than guessed.
 * An address a person already pinned is left exactly as they left it.
 *
 *   DATABASE_URL=postgres://… node scripts/backfill-joomlart-demos.mjs [--dry-run]
 */
import { createPool } from '../apps/tracy-web/src/db/index.js'
import { defaultDemoLabel } from '../apps/tracy-web/src/lib/demo-domain.js'

const dry = process.argv.includes('--dry-run')
const url = process.env.DATABASE_URL
if (!url) {
  process.stderr.write('DATABASE_URL is required\n')
  process.exit(1)
}

const pool = createPool(url)
const { rows } = await pool.query(
  "select tag from quickstart_releases where tag like 'quickstart/ja-%' order by tag"
)

let written = 0
let already = 0
let skipped = 0
for (const { tag } of rows) {
  const label = defaultDemoLabel(tag, 'joomla', 'joomlart')
  if (label === null) {
    skipped += 1
    process.stdout.write(`  skip ${tag} — no JoomlArt address rule matches it\n`)
    continue
  }
  if (dry) {
    process.stdout.write(`  would pin ${tag} → https://${label}.demo.joomlart.com/\n`)
    written += 1
    continue
  }
  const done = await pool.query(
    `insert into demo_domain (tag, target, label, updated_by)
     values ($1, 'joomlart', $2, 'backfill-joomlart-demos')
     on conflict (tag, target) do nothing
     returning label`,
    [tag, label]
  )
  if (done.rows.length) written += 1
  else already += 1
}

process.stdout.write(
  `joomlart demos: ${String(written)} pinned, ${String(already)} already there, ${String(skipped)} skipped, of ${String(rows.length)} ja-* releases\n`
)
await pool.end()
