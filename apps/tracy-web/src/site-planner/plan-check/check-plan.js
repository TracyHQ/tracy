// The site plan checker (ADR 0041, decision 6): a pure, read-only port of the approved checker script.
// checkPlan({ plan, kit, brief }) validates a "site-plan/3" plan against a template kit and a business brief and
// returns one result per rule: { id, title, status: pass|fail|skip, cause, causes, failures: [{ where, detail,
// cause }], notes }, plus the pass/fail/skip summary. Inputs are never modified. A missing or oddly shaped field is
// reported as a note ("cannot check: ...") and never throws.
//
// Each rule lives in a rules-*.js file under its approved id; the order of checkR* calls below is the order the
// script ran them, and the result lists rules in the order of RULE_TITLES.
import { indexKit, pageBlockOrder } from './kit-index.js'
import { asDecision, decisionParts, indexBrief, indexPlan, W } from './plan-index.js'
import { createRuleSet, finishRules, obj } from './rule-set.js'
import { checkR10a, checkR10c } from './rules-closure.js'
import { checkR10b } from './rules-closure-parts.js'
import { checkR10g, checkR12 } from './rules-duplicates-channels.js'
import { checkR25 } from './rules-articles.js'
import { checkR02, checkR03 } from './rules-facts.js'
import { checkR01 } from './rules-ids.js'
import { checkR23 } from './rules-kept-rows.js'
import { checkR24 } from './rules-labels.js'
import { checkR10h, checkR19 } from './rules-map-judgement.js'
import { checkR04 } from './rules-menu.js'
import { checkR08, checkR09, checkR11 } from './rules-notices-forms.js'
import { checkR20 } from './rules-page-titles.js'
import { checkR17, checkR18 } from './rules-people-same.js'
import { checkR14R15, checkR16 } from './rules-pictures.js'
import { checkR22 } from './rules-row-pairs.js'
import { checkR05, checkR06, checkR07 } from './rules-rows-limits.js'
import { checkR00 } from './rules-shape.js'
import { checkR10d, checkR10e, checkR13 } from './rules-targets.js'
import { checkR10f } from './rules-trade.js'
import { checkR21 } from './rules-trade-hidden.js'

// The checker's version, stored on every bench run next to the prompt hash. Bump it whenever a rule, a rule title,
// a failure text or the result shape changes, so two runs scored by different checkers are never compared as equal.
export const CHECKER_VERSION = 'site-plan-check/7'

const RUN_ORDER = [
  checkR00,
  checkR01,
  checkR02,
  checkR03,
  checkR04,
  checkR05,
  checkR06,
  checkR07,
  checkR08,
  checkR11,
  checkR09,
  checkR10a,
  checkR10b,
  checkR10c,
  checkR10d,
  checkR10e,
  checkR10f,
  checkR13,
  checkR10g,
  checkR12,
  checkR14R15,
  checkR16,
  checkR17,
  checkR18,
  checkR19,
  checkR20,
  checkR21,
  checkR22,
  checkR23,
  checkR24,
  checkR25,
  checkR10h
]

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

// briefRef (optional): a name the brief is known by (its file name or revision id). R10a only uses it to decide
// whether plan.brief obviously names the brief; it stands in for the brief file path the script compared.
export function checkPlan({ plan, kit, brief, briefRef = '' } = {}) {
  const { R, list } = createRuleSet()
  const inputErrors = [
    [plan, 'plan'],
    [kit, 'kit'],
    [brief, 'brief']
  ]
    .filter(([x]) => !isObject(x))
    .map(([, label]) => `${label} is missing or not a JSON object`)
  if (inputErrors.length) {
    for (const r of Object.values(R)) r.skip(`cannot check: ${inputErrors.join('; ')}`)
    return { inputErrors, ...finishRules(list) }
  }
  const k = indexKit(obj(kit))
  const b = indexBrief(obj(brief))
  const p = indexPlan(obj(plan), k, b)
  const ctx = {
    R,
    plan: obj(plan),
    kit: obj(kit),
    brief: obj(brief),
    briefRef,
    ...k,
    ...b,
    ...p,
    pageBlockOrder,
    decisionParts,
    asDecision,
    W
  }
  for (const check of RUN_ORDER) check(ctx)
  return { inputErrors, ...finishRules(list) }
}

// The failure list a fix round sends back to the planner: one line per failure, in rule order,
// "<rule id> | <rule title> | <where> | <detail>", ending with a newline. Empty when nothing failed.
export function failureListText(result) {
  const lines = []
  for (const r of result?.rules ?? [])
    for (const f of r.failures ?? []) lines.push([r.id, r.title, f.where, f.detail].join(' | '))
  return lines.length ? `${lines.join('\n')}\n` : ''
}
