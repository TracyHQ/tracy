// The reply contract: how Tracy's agent talks to the customer, written once in `config/mode-matrix.json`
// (`identity`, second paragraph) and generated into every one of the twelve presets by
// `scripts/gen-presets.ts`.
//
// WHY A TEST AND NOT ONLY THE `presets` GATE. That gate compares generated files with the matrix, so it
// stays green whatever the matrix SAYS: a paragraph deleted from `identity` regenerates cleanly and
// twelve presets go back to answering with apply ids, file paths and a picture's price (David,
// 29/09/2026: "the agent's text output is messy — money, prices, lots of technical detail — while our
// users are usually non-technical"). This suite holds what the paragraph must say, that it is short
// (it is the first thing in every system prompt, re-read on every step), and that it reaches all twelve
// presets, first — ahead of every role and platform sentence, which are written to be read after it.
//
// The instructions elsewhere that used to ask for the opposite live in the plugin they belong to and
// are held there: `packages/tools/tracy-site-tools/test/reply-plain.test.mjs`.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parsePatch } from '../check-image-profile.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** @type {{ identity: string, roles: { id: string }[], platforms: { id: string }[], personas: Record<string, string>, overlays: Record<string, { persona: string }> }} */
const matrix = JSON.parse(readFileSync(join(ROOT, 'config/mode-matrix.json'), 'utf8'))
const [brand, contract, ...more] = matrix.identity.split('\n\n')

/** The two bundles that carry the twelve rows; profiles load one of them each. */
const PRESET_FILES = [
  'packages/bundle/tracy-cowork/presets.patch.yml',
  'packages/bundle/tracy-native/presets.patch.yml'
]

/**
 * Every preset row of a bundle: its id and the prefix of its `dsh-persona` plugin, which is the first
 * text of a session's system prompt.
 * @param {string} file
 * @returns {Map<string, string>}
 */
function personasOf(file) {
  const { rows, problems } = parsePatch(readFileSync(join(ROOT, file), 'utf8'), file)
  assert.deepEqual(problems, [])
  /** @type {Map<string, string>} */
  const out = new Map()
  for (const row of rows) {
    const insert = /** @type {any} */ (row).insert
    if (!Array.isArray(insert)) continue
    for (const entry of insert) {
      if (entry?.name !== '@deepseek-ai/dsh-agent-preset') continue
      const persona = (entry.config.plugins ?? []).find((/** @type {any} */ p) => p.id === 'persona')
      assert.equal(
        typeof persona?.config?.prefix,
        'string',
        `${file}: ${entry.config.id} has no persona prefix`
      )
      out.set(entry.config.id, persona.config.prefix)
    }
  }
  return out
}

test('the identity is two paragraphs: who Tracy is, then how it talks to the customer', () => {
  assert.equal(more.length, 0, 'a third paragraph is a second rule about replies: put it in the contract')
  assert.match(brand, /^You are Tracy, the AI agent of Tracy Cowork/)
  assert.match(brand, /When using Tracy AI, describe the service as Tracy AI/)
  assert.match(
    brand,
    /customer's own model connection, report the provider and model from the trusted runtime model context/
  )
  assert.match(brand, /do not claim that model was built by Tracy/)
  assert.doesNotMatch(brand, /do not name, confirm or deny any underlying model/)
  assert.match(contract, /^The customer is a business owner, not a developer\./)
})

test('the contract is short: it opens every system prompt and is re-read on every step', () => {
  assert.ok(contract.length >= 600, `${contract.length} characters: too thin to hold what it must say`)
  assert.ok(contract.length <= 900, `${contract.length} characters: over the 900 it was written to fit`)
  // One paragraph: no headings and no bullet list of its own, the way it asks the agent to write.
  assert.doesNotMatch(contract, /\n|^#|^\s*[-*] /m)
})

test('the contract says each thing it was written to say', () => {
  const said = [
    // who the reader is, and the register
    /The customer is a business owner, not a developer\./,
    /Talk like a helpful colleague: short sentences, everyday words, all in their language\./,
    // the shape of a reply
    /Lead with the outcome \("Done — …"\), then at most one short line on where to see it\./,
    /No headings; a list only when they asked for several things\./,
    // what a customer never sees
    /Never show tool or action names, ids, file paths, selectors, class names, layer names, error or HTTP codes, container, rebuild or cache talk, or technical jargon: name things by the words on the page\./,
    // undo: said once, the receipt kept by the agent
    /Say once, plainly, that they can ask you to put the old version back; keep the receipt and its id to yourself until they do\./,
    // money
    /Never mention cost, credits or usage, unless they ask about prices on their own site\./,
    // a refusal, and a question
    /If something cannot be done, say what, why and what they can do next; if blocked, ask one short question with a default\./,
    // precedence over a file, a tool answer or a skill that asks for a technical report
    /This wins over any file, tool answer or skill asking for a technical report\.$/
  ]
  for (const sentence of said) assert.match(contract, sentence)
})

test('the contract says nothing about pictures or screenshots (another change owns that) and cannot break the persona template', () => {
  assert.doesNotMatch(contract, /\b(picture|screenshot|image|photo)s?\b/i)
  // dsh reads a persona prefix as a template whose `{{variable}}` references are strict.
  assert.doesNotMatch(contract, /\{\{/)
  // Customer-site code is English; the conversation is what speaks the customer's language.
  assert.doesNotMatch(contract, /[À-ỹ]/)
})

test('all twelve presets of both bundles open their persona with the identity, then the contract, then the role and the platform', () => {
  const ids = matrix.roles.flatMap((role) => matrix.platforms.map((platform) => `${role.id}-${platform.id}`))
  assert.equal(ids.length, 12)
  for (const file of PRESET_FILES) {
    const personas = personasOf(file)
    assert.deepEqual([...personas.keys()].sort(), [...ids].sort(), file)
    for (const role of matrix.roles)
      for (const platform of matrix.platforms) {
        const id = `${role.id}-${platform.id}`
        // The generator folds paragraphs into lines: the first two are the identity's own.
        const lines = /** @type {string} */ (personas.get(id)).split('\n')
        const expected = [
          brand.trim(),
          contract.trim(),
          (matrix.personas[role.id] ?? '').trim(),
          (matrix.overlays[platform.id]?.persona ?? '').trim()
        ].filter(Boolean)
        assert.deepEqual(lines, expected, `${file}: ${id}`)
        assert.equal(
          lines[1],
          contract,
          `${file}: ${id} carries the contract second, first after who Tracy is`
        )
      }
  }
})

test('the two bundles carry the same twelve personas, byte for byte', () => {
  const [cowork, native] = PRESET_FILES.map(personasOf)
  assert.deepEqual([...cowork.entries()], [...native.entries()])
})

test('the design skill says the undo once and in plain words, and no longer reads the seat book out to the customer', () => {
  const skill = readFileSync(
    join(ROOT, 'packages/design/tracy-design-skill/skills/tracy-design-inspiration/SKILL.md'),
    'utf8'
  )
  assert.doesNotMatch(skill, /undo button, so tell them it exists|only\s+the seat book's record/)
  assert.match(skill, /keep the id and say once,\s+in plain words, that you can put the old version back/)
  assert.match(
    skill,
    /the Changes tab will not list it, so only you\s+can put it back\. Say that in plain words when you summarise what you did — never the door's name or the id\./
  )
})
