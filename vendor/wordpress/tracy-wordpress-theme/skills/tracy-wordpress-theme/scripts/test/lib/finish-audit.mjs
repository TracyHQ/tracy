// Fixtures for the finish audit receipt (lib/audit-receipt.mjs): an interaction record with full coverage and a receipt written through
// the one shared helper, so a gate fixture states what a clean audit of its dossier is without running the live audit.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { issueReceipt } from '../../lib/audit-receipt.mjs'
import { CHECKS, INTERACTION_TOOL, TIERS, owedCases } from '../../visual/interaction-page-contract.mjs'

export const DECISIONS_TEXT = '- D-1: the decorative elements p.x (p x) and p.y (p y) are accepted as decoration.\n'

/** An interaction record as the current probe writes it for a clean run: every owed case measured, nothing found. */
export function interactionRecord({ pages, site = 'http://site.test', source = 'http://source.test', chromePages = null, mutate = null }) {
  const record = {
    tool: INTERACTION_TOOL,
    status: 'run',
    thresholds: { geometryPx: 2, minTargetPx: 24, minContrast: 4.5 },
    tiers: JSON.parse(JSON.stringify(TIERS)),
    origins: { site, source },
    chromePages: chromePages ?? [pages[0]],
    pages: [...pages],
    checks: [...CHECKS],
    examined: 40,
    findings: [],
    notMeasured: [],
    blocking: false
  }
  record.coverage = owedCases({ pages, chromePages: record.chromePages }).map((c) => ({ ...c, measured: true }))
  record.obligations = []
  record.outcomes = []
  record.discoveries = record.coverage.filter((c) => c.check === 'drawer' || c.check === 'form').map((c) => ({ ...c, complete: true, count: 0 }))
  if (mutate) mutate(record)
  return record
}

export function writeInteraction(dir, opts) {
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'interaction.json')
  writeFileSync(file, `${JSON.stringify(interactionRecord(opts), null, 2)}\n`)
  return file
}

/**
 * A clean current receipt of `dossier` (DECISIONS.md is written when missing). `runs`: directories whose interaction.json is covered
 * (written clean there when absent); `pages` are the routes those records cover. Returns the report.
 */
export function cleanAudit({ dossier, site = 'http://site.test', source = 'http://source.test', routes = ['/'], runs = [], pages = ['/'], theme = null, scope = theme ? 'patch' : 'visual', at, record = {}, ok, checks, mutate = null }) {
  mkdirSync(dossier, { recursive: true })
  if (!existsSync(path.join(dossier, 'DECISIONS.md'))) writeFileSync(path.join(dossier, 'DECISIONS.md'), DECISIONS_TEXT)
  const files = runs.map((d) => (existsSync(path.join(d, 'interaction.json')) ? path.join(d, 'interaction.json') : writeInteraction(d, { pages, site, source, ...record })))
  return issueReceipt({ dossier, site, source, routes, interaction: scope === 'patch' ? [] : files, theme, scope, ...(at ? { at } : {}), ...(ok === undefined ? {} : { ok }), ...(checks ? { checks } : {}), mutate })
}
