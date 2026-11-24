#!/usr/bin/env node
// Whether a packed template can make a customer's copy THEIRS — read from the packed bytes, so the
// answer is about what ships and not about what the working tree happens to hold.
//
// 🔒 WHY THIS IS A GATE. Until 19/09/2026 the kit shipped no personalize tool and asked for no
// questionnaire, so a template could be released without either and nothing was red: the package
// verified, every QA gate passed, the site came up. The cost landed on the customer — Tracy falls
// back to the CMS's own question set when a release carries no `tracy_site_question.json`, so they
// answered a form whose answers had nowhere to go, and the build told them the template has no tool
// for it while their live site kept the demo brand. Measured on tracy-saas 1.0.0.
//
// Used by tools/release.mjs. Pure: reads the artifact, returns sentences, decides nothing.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** The three files a template needs to put a customer's own words in. */
export const PERSONALIZE_FILES = ['tools/personalize.mjs', 'seed/questions.json', 'seed/personalize.json']

/** Text the starters carry so that an unfilled map is a refusal, not a silent demo site. */
const PLACEHOLDERS = ['__THE DEMO BRAND', '__a field', '__page__']

/**
 * @param {string} artifact the packed directory
 * @returns {string[]} what is missing or unfinished; empty means the package can personalize.
 */
export function personalizeProblems(artifact) {
  const missing = PERSONALIZE_FILES.filter((f) => !existsSync(path.join(artifact, f)))
  if (missing.length > 0)
    return [
      `the packed template cannot personalize a customer's copy: ${missing.join(', ')} missing. ` +
        'Copy the kit tool (scripts/tools/personalize.mjs), fill seed/questions.json and ' +
        'seed/personalize.json from assets/seed-starter/, and list all three in distribution.include.'
    ]
  const problems = []
  let map
  try {
    map = JSON.parse(readFileSync(path.join(artifact, 'seed', 'personalize.json'), 'utf8'))
  } catch (error) {
    return [`seed/personalize.json is not readable JSON: ${error instanceof Error ? error.message : String(error)}`]
  }
  const text = JSON.stringify(map)
  if (PLACEHOLDERS.some((p) => text.includes(p)))
    problems.push('seed/personalize.json still holds the starter placeholders; fill it in for this design')
  const rules = ['identity', 'replace', 'copy', 'rewrite'].reduce(
    (n, k) => n + (Array.isArray(map[k]) ? map[k].length : 0),
    0
  )
  if (rules === 0)
    problems.push('seed/personalize.json names no field to write; a customer would get the demo words')
  problems.push(...questionProblems(readFileSync(path.join(artifact, 'seed', 'questions.json'), 'utf8')))
  return problems
}

/**
 * The questionnaire as Tracy will read it off the release (`tracy_site_question.json`, ADR 0017).
 * A label missing in one language is not cosmetic: the form shows English inside another language.
 * @param {string} raw the bytes of seed/questions.json
 * @returns {string[]}
 */
export function questionProblems(raw) {
  let doc
  try {
    doc = JSON.parse(raw)
  } catch (error) {
    return [`seed/questions.json is not readable JSON: ${error instanceof Error ? error.message : String(error)}`]
  }
  const problems = []
  if (doc.schemaVersion !== 'tracy-questions/v1') problems.push('seed/questions.json is not a tracy-questions/v1 document')
  if (!Array.isArray(doc.questions) || doc.questions.length === 0) {
    problems.push('seed/questions.json asks nothing')
    return problems
  }
  const ids = doc.questions.map((q) => q?.id)
  if (new Set(ids).size !== ids.length) problems.push('seed/questions.json repeats a question id')
  if (!ids.includes('name')) problems.push("seed/questions.json does not ask the customer's name")
  if (!Array.isArray(doc.languages) || doc.languages.length === 0) {
    problems.push('seed/questions.json names no language')
    return problems
  }
  for (const q of doc.questions)
    for (const lang of doc.languages)
      if (typeof q?.label?.[lang] !== 'string' || q.label[lang] === '')
        problems.push(`seed/questions.json: question "${String(q?.id)}" has no ${lang} label`)
  return problems
}
