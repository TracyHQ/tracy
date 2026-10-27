// The release gate that would have stopped tracy-saas 1.0.0 going out unable to say a customer's
// name. Fixtures are written here rather than shared: what is ON DISK in the package is the whole
// question this module answers.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { personalizeProblems, questionProblems, PERSONALIZE_FILES } from '../tools/personalize-gate.mjs'

const LANGS = ['en', 'vi']
const questions = (over = {}) => ({
  schemaVersion: 'tracy-questions/v1',
  owner: 'tracy-new/emdash',
  languages: LANGS,
  questions: [{ id: 'name', kind: 'text', label: { en: 'Business name', vi: 'Tên doanh nghiệp' } }],
  ...over
})
const map = (over = {}) => ({
  schemaVersion: 'tracy-personalize/v1',
  identity: [{ collection: 'site', slug: 'site', field: 'brand_name', value: '{name}' }],
  replace: [{ find: 'Kinetic', with: '{name}' }],
  ...over
})

/** A packed artifact with exactly the files given. */
function artifact(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'packed-'))
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.join(dir, path.dirname(name)), { recursive: true })
    writeFileSync(path.join(dir, name), typeof body === 'string' ? body : JSON.stringify(body, null, 2))
  }
  return dir
}

test('a package with all three files and a filled map passes', () => {
  const dir = artifact({
    'tools/personalize.mjs': '// the kit tool\n',
    'seed/questions.json': questions(),
    'seed/personalize.json': map()
  })
  try {
    assert.deepEqual(personalizeProblems(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the tracy-saas shape — no tool, no questionnaire, no map — is refused by name', () => {
  const dir = artifact({ 'Dockerfile': 'FROM node:24-slim\n', 'tools/qa.mjs': '// …\n' })
  try {
    const problems = personalizeProblems(dir)
    assert.equal(problems.length, 1)
    for (const f of PERSONALIZE_FILES) assert.match(problems[0], new RegExp(f.replace('.', '\\.')))
    assert.match(problems[0], /cannot personalize/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the starters as shipped are not a finished template', () => {
  const dir = artifact({
    'tools/personalize.mjs': '// the kit tool\n',
    'seed/questions.json': questions(),
    'seed/personalize.json': {
      schemaVersion: 'tracy-personalize/v1',
      replace: [{ find: '__THE DEMO BRAND, LONGEST FORM FIRST__', with: '{name}' }]
    }
  })
  try {
    assert.match(personalizeProblems(dir).join(' '), /starter placeholders/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a map that writes nothing is a demo site with the paperwork in order', () => {
  const dir = artifact({
    'tools/personalize.mjs': '// the kit tool\n',
    'seed/questions.json': questions(),
    'seed/personalize.json': { schemaVersion: 'tracy-personalize/v1', identity: [], copy: [] }
  })
  try {
    assert.match(personalizeProblems(dir).join(' '), /names no field to write/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a questionnaire is refused for the three things that break a form quietly', () => {
  assert.deepEqual(questionProblems(JSON.stringify(questions())), [])
  assert.match(
    questionProblems(JSON.stringify(questions({ questions: [{ id: 'sector', label: { en: 'Sector', vi: 'Ngành' } }] }))).join(' '),
    /does not ask the customer's name/
  )
  // A label short of one language is what puts an English line inside a Vietnamese form.
  assert.match(
    questionProblems(JSON.stringify(questions({ questions: [{ id: 'name', label: { en: 'Business name' } }] }))).join(' '),
    /has no vi label/
  )
  assert.match(questionProblems('{oops').join(' '), /not readable JSON/)
})
