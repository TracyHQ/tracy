// The optional stable codes of a build plan (Contract B): beside an English sentence or name code writes, a `code`
// (lower case words joined by underscores) and its parameters, so the plan card can translate by code. Every key is
// optional, so a stored plan without them stays valid. The shapes: `build-contract-shapes.mjs`.
import { isObject } from './build-contract-shared.mjs'

const CODE = /^[a-z][a-z0-9_]*$/
const PARAM_NAME = /^[a-z][A-Za-z0-9]*$/
const isCode = (value) => typeof value === 'string' && CODE.test(value)

/** A code is lower case words joined by underscores. */
export function codeProblems(value, at, report) {
  if (value !== undefined && !isCode(value)) report(at, 'a code is lower case words joined by underscores')
}

/** Parameters of a code: an object whose values are short texts, whole numbers or booleans; only beside a code. */
export function paramsProblems(owner, at, report) {
  const params = owner.params
  if (params === undefined) return
  if (owner.code === undefined) report(`${at}.params`, 'parameters belong to a code: give the code too')
  if (!isObject(params)) return report(`${at}.params`, 'parameters are an object of names and values')
  for (const [name, value] of Object.entries(params)) {
    const fine =
      typeof value === 'boolean' ||
      Number.isInteger(value) ||
      (typeof value === 'string' && value.trim() !== '' && [...value].length <= 80)
    if (!PARAM_NAME.test(name) || !fine)
      report(
        `${at}.params.${name}`,
        'a parameter is a camel case name with a short text, a whole number or true or false'
      )
  }
}

/** A list of kinds (`pictures.own.fromKinds`), each lower case words joined by underscores. */
export function kindsProblems(value, at, report) {
  if (value === undefined) return
  if (!Array.isArray(value) || value.some((kind) => !isCode(kind)))
    report(at, 'a list of kinds, each lower case words joined by underscores')
}
