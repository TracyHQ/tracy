#!/usr/bin/env node
// determinism.mjs — does every contract page serve the SAME HTML to plain requests?
//
// A page whose HTML changes between two requests on an unchanged site cannot give a reproducible
// visual verdict: its findings flip with no code change, and a stop rule counting them moves by
// noise. Measured 25/09 on Tracy Base wp7: 9/38 pages served different HTML across 5 fetches
// (51 posts shared one post_date, listings sorted by date, MySQL tie order changed per request);
// the raw finding total moved ±30–45 per run on that alone. Such a page is a named seeder/content
// problem (routed to the seeder group), not a visual finding, and round.mjs keeps it out of the
// stop rule.
//
// What is ignored: the per-request tokens WordPress prints (nonces, the Contact Form 7 unit id), and
// any identifier that is a word glued to a run of 4+ digits (`formAcym33991`), and the numbers inside
// identifier attributes (id, for, aria-controls/labelledby/describedby) and inline scripts: plugins mint such ids
// per request — AcyMailing's form on JA Kinetic made 30/30 pages "nondeterministic" under the old
// hand-kept list. Content that moves still shows: a listing in another order changes its text.
// Anything else that differs is reported.
//
//   node scripts/visual/determinism.mjs (--run-root <dossier> | --contract <file>) --site <origin> [--fetches 5] [--out f.json]
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL, resolveContract } from '../lib/canonical.mjs'

/** The served HTML with per-request tokens removed: nonce values (attribute, JSON, hidden input) and the CF7 unit id. */
export function normalizeHtml(html) {
  return String(html ?? '')
    .replace(/<input\b[^>]*\bname=(["'])[^"']*nonce[^"']*\1[^>]*>/gi, '<input nonce>')
    .replace(/([\w-]*nonce[\w-]*)(["']?\s*[:=]\s*)(["'])[^"']*\3/gi, '$1$2$3$3')
    .replace(/wpcf7-f\d+-p\d+-o\d+/g, 'wpcf7-unit')
    .replace(/\b([A-Za-z][A-Za-z_-]*[A-Za-z_-])(\d{4,})\b/g, '$1#')
    // Identifier attributes carry no visible content; their numbers are the plugin's to mint
    // (AcyMailing's `email_field_607`, three digits, a new one each request).
    .replace(/\b(id|for|aria-controls|aria-labelledby|aria-describedby)=(["'])([^"']*)\2/gi, (_, k, q, v) => `${k}=${q}${v.replace(/\d+/g, '#')}${q}`)
    // Numbers inside inline scripts (AcyMailing's `nocache=<unix time>`): code, not what is drawn.
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open, body, close) => `${open}${body.replace(/\d+/g, '#')}${close}`)
}

const htmlHash = (html) => createHash('sha256').update(normalizeHtml(html)).digest('hex').slice(0, 16)

/**
 * Fetch every page `fetches` times. Returns per page the normalised hash of the first fetch (the
 * page's HTML identity for this round) and the number of variants seen; `nondeterministic` lists
 * pages with more than one. A page that could not be fetched is reported with its error.
 */
export async function checkDeterminism({ pages, site, fetches = 5, fetchImpl = fetch, timeoutMs = 30000 }) {
  const t0 = performance.now()
  const out = { fetchesPerPage: fetches, pages: {}, nondeterministic: [], errors: [] }
  for (const p of pages) {
    const hashes = []
    try {
      for (let i = 0; i < fetches; i++) {
        const r = await fetchImpl(new URL(p.path, site).href, { signal: AbortSignal.timeout(timeoutMs) })
        hashes.push(htmlHash(await r.text()))
      }
    } catch (e) {
      out.errors.push({ page: p.id, error: String(e.message).slice(0, 200) })
      out.pages[p.id] = { hash: null, variants: null }
      continue
    }
    const variants = new Set(hashes).size
    out.pages[p.id] = { hash: hashes[0], variants }
    if (variants > 1) out.nondeterministic.push(p.id)
  }
  out.seconds = Math.round((performance.now() - t0) / 100) / 10
  return out
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const argv = process.argv.slice(2)
  const opt = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
  if (!(opt('--run-root') || opt('--contract')) || !opt('--site')) {
    console.error('usage: determinism.mjs (--run-root <dossier> | --contract <file>) --site <origin> [--fetches 5] [--out f.json]')
    process.exit(2)
  }
  const resolved = resolveContract({ runRoot: opt('--run-root'), explicit: opt('--contract'), name: CANONICAL.visual })
  const contract = JSON.parse(readFileSync(resolved.path, 'utf8'))
  const r = await checkDeterminism({ pages: contract.pages, site: opt('--site'), fetches: Number(opt('--fetches', 5)) })
  if (opt('--out')) writeFileSync(opt('--out'), JSON.stringify(r, null, 2) + '\n')
  console.log(JSON.stringify({ pages: contract.pages.length, fetchesPerPage: r.fetchesPerPage, nondeterministic: r.nondeterministic, errors: r.errors, seconds: r.seconds }))
  process.exit(r.nondeterministic.length || r.errors.length ? 1 : 0)
}
