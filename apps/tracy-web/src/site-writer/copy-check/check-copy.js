// The site copy checker (ADR 0042): a pure, read-only check of a "site-copy/1" file against the site plan it was
// written from, the template kit, the brief and (when the template has one) its content map, whose main menu tree
// gives the dropdown slots (main-menu.js). Same calling shape and result shape as the site plan checker:
// checkCopy({ copy, plan, kit, brief }) returns { meta, inputErrors, summary, rules: [{ id, title, status:
// pass|fail|skip, cause, causes, failures: [{ where, detail, cause }], notes }] }. Inputs are never modified, a
// malformed copy file is reported under W01 and never throws, and the same input gives the same result.
import { readCopy } from './copy-view.js'
import { indexInputs } from './inputs-index.js'
import { createRuleSet, finishRules } from './rule-set.js'
import { checkW09, checkW10, checkW11, checkW08 } from './rules-bans.js'
import { checkW04, checkW05 } from './rules-facts.js'
import { checkW06, checkW07 } from './rules-repeat.js'
import { checkW02, checkW03 } from './rules-slots.js'
import { failureListText } from '../../lib/failure-list-text.js'

// Stored on every bench run next to the prompt hash. Bump it whenever a rule, a rule title, a threshold, a failure
// text or the result shape changes, so two runs scored by different checkers are never compared as equal.
export const CHECKER_VERSION = 'site-copy-check/3'

const RUN_ORDER = [
  checkW02,
  checkW03,
  checkW04,
  checkW05,
  checkW06,
  checkW07,
  checkW08,
  checkW09,
  checkW10,
  checkW11
]
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

export function checkCopy({ copy, plan, kit, brief, contentMap } = {}) {
  const { R, list } = createRuleSet()
  const { view, problems } = readCopy(copy)
  const meta = {
    checker: CHECKER_VERSION,
    copyVersion: isObject(copy) && typeof copy.version === 'string' ? copy.version : null,
    counts: {
      slots: view.slots.length,
      alts: view.alts.length,
      seo: view.seo.length,
      pages: view.pages.length,
      returns: view.returns.length
    }
  }
  for (const p of problems) R.w01.fail(p.where, `${p.where}: ${p.detail}`, 'shape')
  if (!problems.length) R.w01.ok()
  const inputErrors = [
    [plan, 'plan'],
    [kit, 'kit'],
    [brief, 'brief']
  ]
    .filter(([x]) => !isObject(x))
    .map(([, label]) => `${label} is missing or not a JSON object`)
  if (inputErrors.length) {
    for (const [key, r] of Object.entries(R))
      if (key !== 'w01') r.skip(`cannot check: ${inputErrors.join('; ')}`)
    return { meta, inputErrors, ...finishRules(list) }
  }
  const ctx = { R, view, plan, kit, brief, idx: indexInputs({ plan, kit, brief, contentMap }) }
  for (const check of RUN_ORDER) check(ctx)
  return { meta, inputErrors, ...finishRules(list) }
}

export { failureListText }
