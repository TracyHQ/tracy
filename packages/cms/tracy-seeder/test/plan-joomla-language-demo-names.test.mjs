/**
 * The Joomla batch translation keeps only the customer's names and people's names (LANG-2, TCH #1013, round 6).
 * Measured 11/10/2026 on dev g61 (JA Essence, FULL, Vietnamese): every prompt said "keep brand names", so a model that took the
 * demo's "J!Pages" for a brand kept it in English on every page. The line prompt was aligned in round 6; this is the batch
 * prompt of `planLanguageTranslation`, which writes every slot of a Joomla language edition.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { planLanguageTranslation } from '../src/plan-joomla-language.mjs'

const plan = (slots) => ({ locale: 'vi-VN', slots })
const text = (key, source, maxCharacters = 100) => ({ key, type: 'text', source, maxCharacters })

/**
 * A disobedient model: whatever it is told, it gives back any words holding "J!" unchanged, and translates every other line.
 * It never says what it kept.
 */
function disobedient() {
  const calls = []
  return {
    calls,
    translate: async (items, system) => {
      calls.push({ items, system })
      return items.map(({ i, text }) => ({ i, text: /J!/.test(text) ? text : `VI ${text}` }))
    }
  }
}

test('a demo label the model keeps as a brand ends translated without the demo mark, and the log says so', async () => {
  const model = disobedient()
  const lines = []
  const { translations } = await planLanguageTranslation({
    plan: plan([text('vi::a', 'Home'), text('vi::b', 'J!Pages'), text('vi::c', 'J! Content')]),
    languageName: 'Vietnamese',
    keep: ['Tamarind & Co'],
    translate: model.translate,
    log: (line) => lines.push(line)
  })
  assert.deepEqual(translations, { 'vi::a': 'VI Home', 'vi::b': 'VI Pages', 'vi::c': 'VI Content' })
  assert.ok(
    lines.some((line) => /without the demo's mark/.test(line)),
    lines.join(' | ')
  )
})

test('the batch prompt keeps only the names the customer gave and people names, never brand names', async () => {
  const model = disobedient()
  await planLanguageTranslation({
    plan: plan([text('vi::b', 'J!Pages')]),
    languageName: 'Vietnamese',
    keep: ['Tamarind & Co'],
    translate: model.translate
  })
  for (const { system } of model.calls) {
    assert.doesNotMatch(system, /brand names/i, system)
    assert.match(system, /Tamarind & Co/)
    assert.match(system, /people/i)
  }
})

test('a line the model keeps whatever it is told is accepted after the retries, never a lost edition', async () => {
  const { translations } = await planLanguageTranslation({
    plan: plan([text('vi::a', 'J!'), text('vi::b', 'About')]),
    languageName: 'Vietnamese',
    translate: async (items) =>
      items.map(({ i, text }) => ({ i, text: /J!/.test(text) ? text : `VI ${text}` }))
  })
  assert.deepEqual(translations, { 'vi::a': 'J!', 'vi::b': 'VI About' })
})
