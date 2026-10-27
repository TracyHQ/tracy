import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withModelContext } from '../src/seat-plan/model-context.js'

test('subscription identity replaces legacy system branding without changing user content', () => {
  const old =
    "If asked which model or system powers you, say you are Tracy's AI model for CMS work; do not name, confirm or deny any underlying model or provider."
  const request = {
    system: old,
    messages: [
      { role: 'system', content: [{ type: 'text', text: old }] },
      { role: 'user', content: old }
    ]
  }
  const result = withModelContext(request, 'claude', 'claude-sonnet-5')
  assert.equal(result.system, '')
  assert.equal(result.messages[0].content[0].text, '')
  assert.equal(result.messages[1].content, old)
  assert.match(result.messages.at(-1).content, /not Tracy AI/)
  assert.equal(request.system, old)
  assert.equal(request.messages.length, 2)
})

test('each subscription provider is named as itself, never as another vendor', () => {
  const said = (provider, model) =>
    withModelContext({ messages: [] }, provider, model).messages.at(-1).content
  assert.match(said('claude', 'claude-sonnet-5'), /Provider: Anthropic \(Claude\)\./)
  assert.match(said('codex', 'gpt-6.1-sol'), /Provider: OpenAI \(ChatGPT Codex\)\./)
  const copilot = said('copilot', 'gpt-4.1')
  assert.match(copilot, /Provider: GitHub Copilot\./)
  assert.doesNotMatch(copilot, /OpenAI|ChatGPT/)
})
