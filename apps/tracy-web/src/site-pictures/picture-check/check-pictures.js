// The picture check (ADR 0043): a pure, read-only check of a "site-pictures/1" manifest against the site plan it was
// made for, the template kit (with its content map slots), the brief and the files the picture step wrote. Same
// calling shape and result shape as the plan and copy checks: checkPictures({ pictures, plan, kit, brief, files,
// icons }) returns { meta, inputErrors, summary, rules: [{ id, title, status: pass|fail|skip, cause, causes,
// failures: [{ where, detail, cause }], notes }] }. `files` maps a file path to { sha256, width, height } (an object,
// a Map or a function); `icons` lists the icon library's names and is optional. Inputs are never modified, a
// malformed manifest is reported under P01 and never throws, and the same input gives the same result.
import { failureListText } from '../../lib/failure-list-text.js'
import { readPictures } from '../manifest-shape.js'
import { indexInputs } from './inputs-index.js'
import { createRuleSet, finishRules } from './rule-set.js'
import { checkP03, checkP04, checkP05 } from './rules-files.js'
import { checkP01, checkP02, checkP12, checkP13 } from './rules-frames.js'
import { checkP06, checkP07, checkP08, checkP09, checkP10, checkP11 } from './rules-sources.js'

// Stored on every bench run next to the prompt hashes. Bump it whenever a rule, a rule title, a threshold, a failure
// text or the result shape changes, so two runs scored by different checkers are never compared as equal.
export const CHECKER_VERSION = 'site-pictures-check/4'

// The failure list a fix round sends back: the same text as the copy check's, one line per failure,
// "<rule id> | <rule title> | <where> | <detail>".
export { failureListText }

const RUN_ORDER = [
  checkP01,
  checkP02,
  checkP03,
  checkP04,
  checkP05,
  checkP06,
  checkP07,
  checkP08,
  checkP09,
  checkP10,
  checkP11,
  checkP12,
  checkP13
]
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

export function checkPictures({ pictures, plan, kit, brief, files, icons } = {}) {
  const { R, list } = createRuleSet()
  const { view, problems } = readPictures(pictures)
  const meta = {
    checker: CHECKER_VERSION,
    picturesVersion: isObject(pictures) && typeof pictures.version === 'string' ? pictures.version : null,
    counts: {
      frames: view.entries.filter((e) => e.list === 'frames').length,
      siteSettings: view.entries.filter((e) => e.list === 'siteSettings').length,
      returns: view.returns.length
    }
  }
  for (const p of problems) R.p01.fail(p.where, `${p.where}: ${p.detail}`, 'shape')
  const inputErrors = [
    [plan, 'plan'],
    [kit, 'kit'],
    [brief, 'brief']
  ]
    .filter(([x]) => !isObject(x))
    .map(([, label]) => `${label} is missing or not a JSON object`)
  if (!files) inputErrors.push('files is missing')
  if (inputErrors.length) {
    for (const r of Object.values(R)) r.skip(`cannot check: ${inputErrors.join('; ')}`)
    return { meta, inputErrors, ...finishRules(list) }
  }
  const ctx = { R, view, idx: indexInputs({ plan, kit, brief, files, icons }) }
  for (const check of RUN_ORDER) check(ctx)
  return { meta, inputErrors, ...finishRules(list) }
}
