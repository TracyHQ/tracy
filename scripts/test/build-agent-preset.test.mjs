// The build chat's agent (preset `site-builder`, `buildAgent` in config/mode-matrix.json), TracyHQ/tracy#609.
//
// The tool `tracy_build` does the work (research, templates, plan, edit); the agent passes its results on.
// This test holds what the instructions must say, that the preset mounts the build engine row and no
// site, file or shell tool, and that the generated files in both bundles carry the same text.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const matrix = JSON.parse(readFileSync(join(ROOT, 'config/mode-matrix.json'), 'utf8'))
const agent = matrix.buildAgent
const PRESET_FILES = [
  'packages/bundle/tracy-cowork/presets.patch.yml',
  'packages/bundle/tracy-native/presets.patch.yml'
]

test('the build agent lists the build engine row, and the row is the tool tracy_build for no role or platform', () => {
  assert.deepEqual(agent.tools, [
    'persona',
    'tracy-build-chat',
    'tool-ask-user',
    'compaction-basic',
    'command-compact',
    'tool-result-pruner',
    'tool-web'
  ])
  const row = matrix.tools.find((r) => r.id === 'tracy-build-chat')
  assert.deepEqual(row.tools, ['tracy_build'])
  assert.ok(
    Object.values(row.roles).every((on) => on === false),
    'no role has the build engine'
  )
  assert.deepEqual(row.platforms, {})
})

test('the instructions say what the build chat must do, in plain words with no dashes', () => {
  const p = agent.persona
  for (const must of [
    /a description with no link is a valid start/i,
    /web_search only to find the business's own links/i,
    /tracy_build with action research first/i,
    /never state a fact about the business that a tool did not return/i,
    /never invent services, prices, people, opening hours or contact details/i,
    /ask nothing on your own/i,
    /carries ask, pass it to ask_user_question exactly as given, one question at a time/i,
    /carries review, pass it on exactly as given/i,
    /ask every question the tool gives and no others/i,
    /action templates\. show nothing yourself/i,
    /wait for the owner's choice, then call tracy_build with action plan/i,
    /no ready design fits their business yet/i,
    /add site/i,
    /action edit for a simple change of one value/i,
    /larger change, call tracy_build with action plan again/i,
    /says stopped, say the sentence it gives and stop/i,
    /never turn a system fault into a question for the owner/i,
    /never ask the owner to try again or to fix anything technical/i,
    /never show error text or codes/i,
    /language of the owner's interface/i
  ]) {
    assert.match(p, must)
  }
  // The tools decide which templates fit: no trade is named here. The engine decides how many
  // questions it asks, so the instructions name no number of questions.
  assert.doesNotMatch(p, /sports|gym|fitness|martial/i)
  assert.doesNotMatch(p, /\b(one|two|three|four|five|\d+)\s+questions\b/i)
  assert.doesNotMatch(p, /at most\s+\w+\s+question/i)
  assert.doesNotMatch(p, /[–—]/, 'no em or en dash')
})

test('both bundles carry the generated build agent with the build engine row', () => {
  for (const file of PRESET_FILES) {
    const yml = readFileSync(join(ROOT, file), 'utf8')
    const start = yml.indexOf('- id: preset-site-builder')
    assert.ok(start > 0, file)
    const preset = yml.slice(start)
    assert.match(preset, /- id: tracy-build-chat\n\s+name: '@tracy\/dsh-build-chat'/, file)
    assert.match(preset, /Call tracy_build with action research first\./, file)
    assert.doesNotMatch(preset, /sports businesses/, file)
    for (const banned of ['tool-bash', 'tool-fs', 'tool-skill', 'skill-filesystem', 'tracy-webroot-read']) {
      assert.doesNotMatch(preset, new RegExp(`- id: ${banned}\\n`), `${file}: ${banned}`)
    }
  }
})
