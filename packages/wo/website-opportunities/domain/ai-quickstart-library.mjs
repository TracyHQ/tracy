// The contract check of the Tracy library (ticket #596, over the AI quickstart contract of #581): blocks Tracy owns,
// declared in the block store format, so the plan composer reads them like any block of a template. Every rule of a
// block store block holds (`blockProblems` of `ai-quickstart-contract.mjs`), plus what makes a block a library block:
// `source: "library"`, and `designVariables`, the template design variables its stylesheet reads, per role.
//
// A design variable binding is `{variables: ["--name", ...], fallback?}`: the first variable the template sets wins.
// `fallback` is allowed only for a role that is not a colour, so no library block ever carries a colour of its own.
import { blockProblems } from './ai-quickstart-contract.mjs'
import { ROLE_VOCABULARY_V3 } from './place-content-roles.mjs'

export const LIBRARY_FILE = 'tracy-library.json'
export const LIBRARY_SCHEMA = 'tracy-ai-quickstart-library/v1'
/** Design roles that are not a colour: only these may end their binding with a literal fallback. */
export const NON_COLOUR_ROLES = Object.freeze(['headingFont', 'bodyFont', 'radius'])

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const isVariable = (value) => typeof value === 'string' && /^--[a-z0-9-]+$/i.test(value)
// A fallback is a length, a number or a font keyword: never something that could name a colour.
const SAFE_FALLBACK = /^(?:0|-?\d*\.?\d+(?:px|rem|em|%)?|serif|sans-serif|monospace|inherit)$/

function designVariablesProblems(bindings, at, report) {
  if (!isObject(bindings) || Object.keys(bindings).length === 0)
    return report(at, 'a library block lists the template design variables it reads, per role')
  for (const [role, binding] of Object.entries(bindings)) {
    const roleAt = `${at}.${role}`
    if (!isObject(binding) || !Array.isArray(binding.variables) || binding.variables.length === 0) {
      report(roleAt, 'a binding is {variables: ["--name", ...], fallback?}')
      continue
    }
    binding.variables.forEach((name, i) => {
      if (!isVariable(name))
        report(`${roleAt}.variables[${i}]`, `${JSON.stringify(name)} is not a CSS variable name`)
    })
    if (binding.fallback === undefined) continue
    if (!NON_COLOUR_ROLES.includes(role))
      report(`${roleAt}.fallback`, 'a colour role has no fallback of its own: only template variables')
    else if (typeof binding.fallback !== 'string' || !SAFE_FALLBACK.test(binding.fallback))
      report(`${roleAt}.fallback`, 'a fallback is a length, a number or a font keyword')
  }
}

/**
 * Check the Tracy library declaration.
 * @param {any} library the parsed `tracy-library.json`
 * @returns {{ok: boolean, blocks: number, problems: Array<{file: string, at: string, message: string}>}}
 */
export function checkLibraryDeclaration(library) {
  const problems = []
  const report = (at, message) => problems.push({ file: LIBRARY_FILE, at, message })
  if (!isObject(library)) {
    report('', 'the Tracy library must be a JSON object')
    return { ok: false, blocks: 0, problems }
  }
  if (library.schema !== LIBRARY_SCHEMA) report('schema', `schema must be "${LIBRARY_SCHEMA}"`)
  if (library.roleVocabularyVersion !== ROLE_VOCABULARY_V3)
    report('roleVocabularyVersion', `roleVocabularyVersion must be "${ROLE_VOCABULARY_V3}"`)
  const blocks = Array.isArray(library.blocks) ? library.blocks : []
  if (blocks.length === 0) report('blocks', 'blocks must list at least one block')
  const ids = new Set()
  blocks.forEach((block, i) => {
    const at = `blocks[${isName(block?.id) ? block.id : i}]`
    if (isName(block?.id) && ids.has(block.id))
      report(`${at}.id`, `block id ${JSON.stringify(block.id)} appears twice`)
    if (isName(block?.id)) ids.add(block.id)
    blockProblems(block, at, report)
    if (!isObject(block)) return
    if (block.source !== 'library') report(`${at}.source`, 'a Tracy library block declares source "library"')
    designVariablesProblems(block.designVariables, `${at}.designVariables`, report)
  })
  return { ok: problems.length === 0, blocks: ids.size, problems }
}
