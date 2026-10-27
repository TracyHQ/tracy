/**
 * One table of the Template Customization Question Readiness check over many releases: a row per
 * release (template, CMS, version, tag) and a column per rule id. Pure, so the runner
 * (`scripts/template-customization-question-readiness.mjs --all`) and its test share it.
 *
 * The rule columns are the ids the reports carry, in the order they first appear, so a rule
 * registered later in `RULES` becomes a column without touching this file. A release the check
 * could not read at all is a row with `error` and no cell. `template` is the gallery's card id when
 * the outcome carries one, else the setting's own `template`.
 */

/** What a cell shows for each status. */
export const CELL = /** @type {Record<string, string>} */ ({
  pass: 'pass',
  fail: 'fail',
  'live-only': 'live-only',
  'not-applicable': 'n-a'
})

/**
 * @typedef {{ id: string, status: string, message: string, fix: string | null, owner: string, details?: string[] }} RuleResult
 * @typedef {{ tag: string, template?: string | null, report?: { template: string | null, cms: string, version: string, results: RuleResult[] }, error?: string }} ReleaseOutcome
 * @typedef {{
 *   template: string | null, cms: string | null, version: string | null, tag: string,
 *   cells: Record<string, string>, error: string | null, results: RuleResult[]
 * }} TableRow
 */

/**
 * @param {ReleaseOutcome[]} outcomes one per release, in the order to print
 * @returns {{ ruleIds: string[], rows: TableRow[] }}
 */
export function buildReadinessTable(outcomes) {
  /** @type {string[]} */
  const ruleIds = []
  for (const o of outcomes)
    for (const r of o.report?.results ?? []) if (!ruleIds.includes(r.id)) ruleIds.push(r.id)
  const rows = outcomes.map((o) => {
    /** @type {Record<string, string>} */
    const cells = {}
    for (const r of o.report?.results ?? []) cells[r.id] = CELL[r.status] ?? r.status
    return {
      template: o.template ?? o.report?.template ?? null,
      cms: o.report?.cms ?? null,
      version: o.report?.version ?? null,
      tag: o.tag,
      cells,
      error: o.error ?? null,
      results: o.report?.results ?? []
    }
  })
  return { ruleIds, rows }
}

/** One Markdown cell: no line break, no column separator. */
const cell = (/** @type {unknown} */ v) =>
  String(v ?? '')
    .replaceAll('|', '\\|')
    .replaceAll(/\s+/g, ' ')
    .trim()

/**
 * The table as Markdown, then one line per failure (and per unreadable release) saying why.
 * @param {ReturnType<typeof buildReadinessTable>} table
 */
export function renderReadinessTable({ ruleIds, rows }) {
  const head = ['template', 'cms', 'version', 'tag', ...ruleIds]
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`]
  for (const r of rows) {
    const rules = ruleIds.map((id) => (r.error ? 'error' : (r.cells[id] ?? '')))
    lines.push(
      `| ${[r.template ?? '?', r.cms ?? '?', r.version ?? '?', r.tag, ...rules].map(cell).join(' | ')} |`
    )
  }
  const why = []
  for (const r of rows) {
    if (r.error) why.push(`- **${r.tag}**: could not be checked: ${cell(r.error)}`)
    for (const x of r.results.filter((x) => x.status === 'fail'))
      why.push(
        `- **${r.tag}** ${x.id} (owner: ${x.owner}): ${cell(x.message)}${x.fix ? ` Fix: ${cell(x.fix)}` : ''}`
      )
  }
  const count = (/** @type {string} */ id, /** @type {string} */ mark) =>
    rows.filter((r) => r.cells[id] === mark).length
  const totals = ruleIds.map(
    (id) =>
      `- ${id}: ${Object.values(CELL)
        .map((m) => `${count(id, m)} ${m}`)
        .join(', ')}`
  )
  return [
    ...lines,
    '',
    `Releases: ${rows.length}, unreadable: ${rows.filter((r) => r.error).length}`,
    ...totals,
    ...(why.length ? ['', '## Why', '', ...why] : [])
  ].join('\n')
}
