#!/usr/bin/env node
/**
 * Recover site-chat usage from native V4 logs (active AND archived directories may be passed).
 * Dry-run by default. Apply requires an explicit site list and DATABASE_URL. Never emits words
 * from chats. Only exact (session id, turn, site folder) matches are eligible. Ambiguous copies,
 * unsupported generations and incomplete logs are skipped. Live snapshots are never overwritten.
 *
 * node apps/tracy-web/scripts/backfill-turn-token-usage.mjs --sessions /copy/sessions --sessions /copy/sessions-archive --site example.test [--apply]
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseSessionBytes, newestSessionLog } from '../../../scripts/measure/session-log.mjs'
import { tokenUsageOf } from '../../../packages/site/tracy-site-tabs/src/host/token-usage.mjs'
import { createPool } from '../src/db/index.js'

/** Native V4 only: never interpret an unknown generation as if it were V4. */
export function usageCandidates(roots) {
  const candidates = new Map()
  const report = { files: 0, unsupported: 0, unreadable: 0, ambiguous: 0 }
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
    const name = newestSessionLog(entries.filter((e) => e.isFile()).map((e) => e.name))
    if (name) {
      report.files++
      if (!/^session\.v4\.jsonl(?:\.zstd)?$/.test(name)) {
        report.unsupported++
        return
      }
      try {
        const { header, rows } = parseSessionBytes(readFileSync(path.join(dir, name)), name.endsWith('.zstd'))
        if (header?.version !== 4 || typeof header.id !== 'string' || typeof header.cwd !== 'string') {
          report.unsupported++
          return
        }
        const turns = new Set(rows.filter((e) => e.type === 'turn/end').map((e) => e.data?.turn))
        for (const turn of turns) {
          if (!Number.isSafeInteger(turn) || turn < 1) continue
          const usage = tokenUsageOf(rows, turn)
          if (!usage) continue
          const id = `${header.id}:${turn}`
          const value = { cwd: header.cwd, usage }
          const old = candidates.get(id)
          // Identical copies are harmless; differing copies are not ranked by mtime.
          if (old === false) continue
          if (old && JSON.stringify(old) !== JSON.stringify(value)) {
            candidates.set(id, false)
            report.ambiguous++
          } else candidates.set(id, value)
        }
      } catch {
        report.unreadable++
      }
      return
    }
    for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name))
  }
  for (const root of roots) walk(root)
  return { candidates, report }
}

export async function backfillUsage(pool, roots, sites, apply = false) {
  if (!sites.length) throw new Error('An explicit --site list is required')
  const { candidates, report } = usageCandidates(roots)
  const db = await pool.connect()
  try {
    await db.query(apply ? 'begin' : 'begin read only')
    const { rows } = await db.query(
      `select t.turn_id, t.site_key, t.token_usage, s.label
      from site_turn t join site s on s.site_key = t.site_key
      where t.site_key = any($1::text[])`,
      [sites]
    )
    const result = {
      ...report,
      turns: rows.length,
      matched: 0,
      missing: 0,
      partial: 0,
      existing: 0,
      written: 0,
      tokens: 0
    }
    for (const row of rows) {
      const item = candidates.get(row.turn_id)
      if (!item || item.cwd !== `/site/${row.label}`) {
        result.missing++
        continue
      }
      result.matched++
      result.tokens += item.usage.totalTokens
      if (item.usage.missing > 0) result.partial++
      if (row.token_usage !== null) {
        result.existing++
        continue
      }
      if (apply) {
        const saved = await db.query(
          `update site_turn set token_usage=$3::jsonb
          where turn_id=$1 and site_key=$2 and token_usage is null`,
          [row.turn_id, row.site_key, JSON.stringify(item.usage)]
        )
        result.written += saved.rowCount
      }
    }
    await db.query('commit')
    return { ...result, dryRun: !apply, wouldWrite: result.matched - result.existing }
  } catch (error) {
    await db.query('rollback').catch(() => {})
    throw error
  } finally {
    db.release()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const roots = [],
    sites = []
  let apply = false
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg === '--apply') apply = true
    else if (
      (arg === '--sessions' || arg === '--site') &&
      process.argv[i + 1] &&
      !process.argv[i + 1].startsWith('--')
    )
      (arg === '--sessions' ? roots : sites).push(process.argv[++i])
    else throw new Error(`Unknown or incomplete argument: ${arg}`)
  }
  if (!roots.length || !sites.length || !process.env.DATABASE_URL)
    throw new Error(
      'Requires --sessions DIR, --site SITE and DATABASE_URL; dry-run unless --apply is supplied'
    )
  const pool = createPool(process.env.DATABASE_URL)
  try {
    console.log(JSON.stringify(await backfillUsage(pool, roots, sites, apply)))
  } finally {
    await pool.end()
  }
}
