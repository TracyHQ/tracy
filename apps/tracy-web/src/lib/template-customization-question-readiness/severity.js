/**
 * How a report of the Template Customization Question Readiness check weighs on the Road to live
 * step "Customize your site": each failing rule goes into one of two groups, read from ONE data file
 * (`rule-severity.json`), so a rule can move between groups without a code change.
 *
 *   must-fix      the customer answers a question and the site does not change, or breaks.
 *                 Publish waits for every one of them.
 *   worth-fixing  the answer works but leaves a small leftover. It only warns.
 *
 * Pure: no network, no database. The road and the publish door read the same summary.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** @typedef {'must-fix' | 'worth-fixing'} Group */
/** @typedef {{ group: Group, question: string, text: string, reason: string }} RuleSeverity */
/**
 * One failing rule as the road carries it.
 * @typedef {{ rule: string, text: string, question: string, owner: string, message: string, fix: string | null }} FailingRule
 */

const FILE = fileURLToPath(new URL('./rule-severity.json', import.meta.url))

/** The groups a rule may be in, in the order the panel shows them. */
export const GROUPS = Object.freeze(/** @type {Group[]} */ (['must-fix', 'worth-fixing']))

/** @returns {Record<string, RuleSeverity>} */
function load() {
  const doc = JSON.parse(readFileSync(FILE, 'utf8'))
  return doc.rules ?? {}
}

/** Every rule id the file names, with its group, question, plain line and reason. */
export const RULE_SEVERITY = Object.freeze(load())

/**
 * A rule the file does not name counts as must-fix: a new rule holds Publish until somebody decides
 * it is only worth fixing, never the other way round.
 * @param {string} id
 * @returns {RuleSeverity}
 */
export function severityOf(id) {
  return (
    RULE_SEVERITY[id] ?? {
      group: 'must-fix',
      question: 'All questions',
      text: `${id} fails.`,
      reason: 'Not in rule-severity.json yet, so it counts as must-fix.'
    }
  )
}

/** The longest a stored message may be on the road: the panel shows one line, the prompt a few. */
const MESSAGE_MAX = 400

/** What a cut message ends with: the run command in the prompt prints the whole list. */
const MORE = ', and more'

/**
 * A message or fix, at most `MESSAGE_MAX` characters. A longer one is cut after the last whole item
 * of its list (a ", " or "; " outside quotes and brackets), else after the last whole word, so a
 * file path or a quoted word is never cut in two (12/10/2026: "parts/sidebar-article…" told the
 * admin nothing).
 */
const clip = (/** @type {unknown} */ text) => {
  const s = String(text ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim()
  if (s.length <= MESSAGE_MAX) return s
  const room = MESSAGE_MAX - MORE.length
  let depth = 0
  let quoted = false
  let lastItem = -1
  for (let i = 0; i < room; i += 1) {
    const c = s[i]
    // An apostrophe inside a word ("site's") is not a quote.
    if (c === '"' || (c === "'" && !(/\w/.test(s[i - 1] ?? '') && /\w/.test(s[i + 1] ?? ''))))
      quoted = !quoted
    else if (!quoted && (c === '(' || c === '[' || c === '{')) depth += 1
    else if (!quoted && (c === ')' || c === ']' || c === '}')) depth = Math.max(0, depth - 1)
    else if (!quoted && depth === 0 && (c === ',' || c === ';') && s[i + 1] === ' ') lastItem = i
  }
  const word = s.lastIndexOf(' ', room)
  const end = lastItem > 0 ? lastItem : word > 0 ? word : room
  return `${s.slice(0, end).replace(/[\s,;:]+$/, '')}${MORE}`
}

/**
 * The step's numbers and groups from one report.
 *
 * `total` counts the rules the check could decide (pass or fail); a rule only a built site can tell
 * (`live-only`) or one that does not concern this CMS (`not-applicable`) is in neither number.
 * @param {{ results?: { id: string, status: string, message?: string, fix?: string | null, owner?: string }[] } | null | undefined} report
 * A rule whose evidence could not be read (`not-checked`) is in neither number either, but it is
 * listed in `notChecked`: Publish waits for it like a must-fix, since nobody knows it passes.
 * @returns {{ passed: number, total: number, mustFix: FailingRule[], worthFixing: FailingRule[], notChecked: FailingRule[] }}
 */
export function summarizeReadiness(report) {
  return summarizeWith(report, severityOf)
}

/**
 * The same summary with another check's severities: the Template Design System Readiness check
 * (`../template-design-system-readiness/severity.js`) weighs its own report with its own file.
 * @param {Parameters<typeof summarizeReadiness>[0]} report
 * @param {(id: string) => RuleSeverity} severityOfRule
 * @returns {ReturnType<typeof summarizeReadiness>}
 */
export function summarizeWith(report, severityOfRule) {
  const results = Array.isArray(report?.results) ? report.results : []
  let passed = 0
  let total = 0
  /** @type {FailingRule[]} */
  const mustFix = []
  /** @type {FailingRule[]} */
  const worthFixing = []
  /** @type {FailingRule[]} */
  const notChecked = []
  for (const r of results) {
    if (r.status === 'not-checked') {
      const s = severityOfRule(r.id)
      notChecked.push({
        rule: r.id,
        text: s.text,
        question: s.question,
        owner: r.owner ?? 'template',
        message: clip(r.message),
        fix: r.fix ? clip(r.fix) : null
      })
      continue
    }
    if (r.status !== 'pass' && r.status !== 'fail') continue
    total += 1
    if (r.status === 'pass') {
      passed += 1
      continue
    }
    const s = severityOfRule(r.id)
    const item = {
      rule: r.id,
      text: s.text,
      question: s.question,
      owner: r.owner ?? 'template',
      message: clip(r.message),
      fix: r.fix ? clip(r.fix) : null
    }
    if (s.group === 'worth-fixing') worthFixing.push(item)
    else mustFix.push(item)
  }
  return { passed, total, mustFix, worthFixing, notChecked }
}
