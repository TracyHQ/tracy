// Declarations of an AI quickstart mapping file that name what the template prints of its own (ticket #587). Pure.
//   - `look.favicon: {from: "logo", fallback: "initials", path, why}`: the build makes the site icon from the logo
//     the plan gives, or from the business initials when it has none, and writes it at `path` (a file under
//     `templates/`, the place the template or the platform serves as the site icon);
//   - `pages.<type>.record.facts: {<column>: {fact, why}}`: a column of the record a page creates that holds a business
//     fact (the author name of a created article, `created_by_alias`), a closed set per record kind;
//   - `keptLiterals: [{file, values | pattern, why}]`: words a template file writes into every page as code (a list of
//     share networks, the ordinal of a step), kept on every site. `values` lists the words; `pattern` is an anchored
//     regular expression for words the file computes (an ordinal). The file is a path inside the template release;
//     `scripts/ai-quickstart/check.mjs` checks it is one of the files the source contract locks.
// Every reason is said (`why`); a reason that says the words are on no page is refused (they are declared because a
// page shows them). The data fixes of the blank site (`dataFixes`) are checked in `ai-quickstart-data-fixes.mjs`.
import { dataFixProblems } from './ai-quickstart-data-fixes.mjs'
import { NOT_DRAWN_REASON } from './ai-quickstart-mapping-language.mjs'

export const FAVICON_FROM = Object.freeze(['logo'])
export const FAVICON_FALLBACK = Object.freeze(['initials'])
/** The columns of a created record that hold a business fact, per record kind. */
export const RECORD_FACT_COLUMNS = Object.freeze({ article: Object.freeze(['created_by_alias']) })

const FAVICON_KEYS = ['from', 'fallback', 'path', 'why']
const LITERAL_KEYS = ['file', 'values', 'pattern', 'why']
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const isReleasePath = (value) =>
  isName(value) && !value.startsWith('/') && !value.split('/').includes('..') && !value.includes('\\')

/** What is wrong with a reason: none said, or one that says no page shows the words. */
function reasonProblem(why) {
  if (!isName(why)) return 'say why (what prints it, measured or read where)'
  if (NOT_DRAWN_REASON.test(why))
    return 'the words are declared because a page shows them: say what prints them'
  return null
}

const unknownKeys = (entry, keys, at, report) => {
  for (const k of Object.keys(entry))
    if (!keys.includes(k)) report(`${at}.${k}`, `"${k}" is no key here: ${keys.join(', ')}`)
}

function faviconProblems(favicon, report) {
  if (favicon === undefined) return
  const at = 'look.favicon'
  if (!isObject(favicon)) return report(at, 'favicon is {from: "logo", fallback: "initials", path, why}')
  unknownKeys(favicon, FAVICON_KEYS, at, report)
  if (!FAVICON_FROM.includes(favicon.from)) report(`${at}.from`, `from is one of ${FAVICON_FROM.join(', ')}`)
  if (!FAVICON_FALLBACK.includes(favicon.fallback))
    report(`${at}.fallback`, `fallback is one of ${FAVICON_FALLBACK.join(', ')}`)
  if (!isReleasePath(favicon.path) || !/^templates\/[\w-]+\/.+\.(?:ico|png|svg)$/.test(favicon.path))
    report(`${at}.path`, 'path is the icon file under templates/<template>/, an .ico, .png or .svg')
  const problem = reasonProblem(favicon.why)
  if (problem) report(`${at}.why`, problem)
}

function recordFactProblems(pages, factKinds, report) {
  for (const [type, page] of Object.entries(isObject(pages) ? pages : {})) {
    const facts = page?.record?.facts
    if (facts === undefined) continue
    const at = `pages.${type}.record.facts`
    if (!isObject(facts)) {
      report(at, 'facts maps a column of the created record to {fact, why}')
      continue
    }
    const columns = RECORD_FACT_COLUMNS[page.record.kind] ?? []
    for (const [column, entry] of Object.entries(facts)) {
      if (!columns.includes(column))
        report(
          `${at}.${column}`,
          `"${column}" holds no business fact of a created ${page.record.kind}: one of ${columns.join(', ') || 'none'}`
        )
      if (!isObject(entry) || !Object.hasOwn(factKinds, String(entry.fact))) {
        report(
          `${at}.${column}`,
          `a record fact is {fact, why}, fact one of ${Object.keys(factKinds).join(', ')}`
        )
        continue
      }
      unknownKeys(entry, ['fact', 'why'], `${at}.${column}`, report)
      const problem = reasonProblem(entry.why)
      if (problem) report(`${at}.${column}.why`, problem)
    }
  }
}

/** Whether a pattern is anchored and too narrow to keep any words: it refuses the empty string and plain words. */
function patternProblem(pattern) {
  if (!isName(pattern) || !pattern.startsWith('^') || !pattern.endsWith('$'))
    return 'pattern is an anchored regular expression: "^...$"'
  let re
  try {
    re = new RegExp(pattern)
  } catch {
    return 'pattern is no regular expression'
  }
  if (['', 'x', 'any words', 'Read more'].some((probe) => re.test(probe)))
    return 'pattern keeps words of any kind: name only the words the file computes'
  return null
}

function keptLiteralProblems(list, report) {
  if (list === undefined) return
  if (!Array.isArray(list))
    return report('keptLiterals', 'keptLiterals is a list of {file, values | pattern, why}')
  list.forEach((entry, i) => {
    const at = `keptLiterals[${i}]`
    if (!isObject(entry)) return report(at, 'a kept literal is {file, values | pattern, why}')
    unknownKeys(entry, LITERAL_KEYS, at, report)
    if (!isReleasePath(entry.file)) report(`${at}.file`, 'file is a path inside the template release')
    if ((entry.values === undefined) === (entry.pattern === undefined))
      report(
        at,
        'a kept literal names its words: values (the words) or pattern (the words the file computes)'
      )
    else if (entry.values !== undefined) {
      if (!Array.isArray(entry.values) || !entry.values.length || !entry.values.every(isName))
        report(`${at}.values`, 'values lists the words the file writes')
    } else {
      const problem = patternProblem(entry.pattern)
      if (problem) report(`${at}.pattern`, problem)
    }
    const problem = reasonProblem(entry.why)
    if (problem) report(`${at}.why`, problem)
  })
}

/** Every problem of the declarations above. */
export function kitDeclarationProblems(mapping, { report, factKinds }) {
  faviconProblems(mapping?.look?.favicon, report)
  recordFactProblems(mapping?.pages, factKinds ?? {}, report)
  keptLiteralProblems(mapping?.keptLiterals, report)
  dataFixProblems(mapping?.dataFixes, report, reasonProblem)
}
