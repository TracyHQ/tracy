import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTranslationAnswer, planLanguageTranslation } from '../src/plan-joomla-language.mjs'

const plan = (slots) => ({ locale: 'zh-CN', slots })
const text = (key, source, maxCharacters = 100) => ({ key, type: 'text', source, maxCharacters })

/** A model stand-in: answers every item with a marker in front of the source. */
const echo = async (items) => items.map(({ i, text }) => ({ i, text: `译:${text}` }))

test('only text is sent to a model — a link and a picture are the same in every language', async () => {
  const seen = []
  const slots = [
    text('zh::a', 'Hello'),
    { key: 'zh::b', type: 'url', source: 'index.php?Itemid=3', maxCharacters: 2048 },
    { key: 'zh::c', type: 'image', source: 'images/hero.png', maxCharacters: 2048 }
  ]
  const { translations } = await planLanguageTranslation({
    plan: plan(slots),
    languageName: 'Chinese (Simplified)',
    translate: async (items, system) => {
      seen.push(...items.map((i) => i.text))
      assert.match(system, /Chinese \(Simplified\) \(zh-CN\)/)
      return echo(items)
    }
  })
  assert.deepEqual(seen, ['Hello'])
  assert.deepEqual(Object.keys(translations), ['zh::a'])
})

test('an empty source stays empty, and never costs a model call', async () => {
  // The Claude Cowork plugin refuses a slot that gains or loses occupancy: an empty ACM field is the switch
  // that turns a block of markup off.
  let asked = 0
  const { translations, asked: count } = await planLanguageTranslation({
    plan: plan([text('zh::a', ''), text('zh::b', '   '), text('zh::c', 'Words')]),
    languageName: 'Chinese',
    translate: async (items) => {
      asked += items.length
      return echo(items)
    }
  })
  assert.equal(translations['zh::a'], '')
  assert.equal(translations['zh::b'], '   ')
  assert.equal(translations['zh::c'], '译:Words')
  assert.equal(asked, 1)
  assert.equal(count, 1)
})

test('the model is asked in bounded batches, and every string comes back', async () => {
  const slots = Array.from({ length: 71 }, (_, i) => text(`zh::${i}`, `Line ${i}`))
  const sizes = []
  const { translations } = await planLanguageTranslation({
    plan: plan(slots),
    languageName: 'Chinese',
    translate: async (items) => {
      sizes.push(items.length)
      return echo(items)
    }
  })
  assert.deepEqual(sizes, [30, 30, 11])
  assert.equal(Object.keys(translations).length, 71)
  assert.equal(translations['zh::70'], '译:Line 70')
})

test('a short or misnumbered answer is a failure, never a half-translated site', async () => {
  // Still a failure — but only after the batch has been asked again. A run of 969 strings is ~33
  // model calls, and one dropped entry used to end the edition with everything before it discarded.
  const tries = []
  await assert.rejects(
    () =>
      planLanguageTranslation({
        plan: plan([text('zh::a', 'One'), text('zh::b', 'Two')]),
        languageName: 'Chinese',
        translate: async (items) => {
          tries.push(items.map((item) => item.fix ?? null))
          return [{ i: 0, text: '译:One' }]
        }
      }),
    /incomplete 3 times running/
  )
  assert.equal(tries.length, 3)
  assert.equal(tries[0][0], null)
  assert.match(String(tries[1][0]), /left 1 of 2 entries empty or absent \(i=1\)/)

  await assert.rejects(
    () =>
      planLanguageTranslation({
        plan: plan([text('zh::a', 'One')]),
        languageName: 'Chinese',
        translate: async () => [{ i: 5, text: '译:One' }]
      }),
    /incomplete 3 times running/
  )
  await assert.rejects(
    () =>
      planLanguageTranslation({
        plan: plan([text('zh::a', 'One')]),
        languageName: 'Chinese',
        translate: async () => [{ i: 0, text: '   ' }]
      }),
    /incomplete 3 times running/
  )
})

test('a batch the model drops an entry from is asked again, and nothing is cached until it is whole', async () => {
  const saved = []
  let attempt = 0
  const { translations } = await planLanguageTranslation({
    plan: plan([text('zh::a', 'One'), text('zh::b', 'Two')]),
    languageName: 'Chinese',
    save: (key, value) => saved.push([key, value]),
    translate: async (items) => {
      attempt += 1
      return attempt === 1
        ? [{ i: 0, text: '译:One' }]
        : items.map((item) => ({ i: item.i, text: `译:${item.text}` }))
    }
  })
  assert.equal(attempt, 2)
  assert.deepEqual(translations, { 'zh::a': '译:One', 'zh::b': '译:Two' })
  // Two saves, both from the whole answer: the first, short answer cached nothing.
  assert.equal(saved.length, 2)
})

test('a cached string is reused, and a retried one is not', async () => {
  const cache = { 'zh-CN:100:Hello': '你好' }
  let asked = 0
  const translate = async (items) => {
    asked += items.length
    return echo(items)
  }
  const first = await planLanguageTranslation({
    plan: plan([text('zh::a', 'Hello')]),
    languageName: 'Chinese',
    translate,
    read: (k) => cache[k]
  })
  assert.equal(first.translations['zh::a'], '你好')
  assert.equal(asked, 0)
  // A slot the Claude Cowork plugin refused is asked again even though the cache has an answer for it —
  // the cached answer is the one that was refused.
  const retry = await planLanguageTranslation({
    plan: plan([text('zh::a', 'Hello')]),
    languageName: 'Chinese',
    translate,
    read: (k) => cache[k],
    only: ['zh::a'],
    previous: { 'zh::a': '你好' },
    complaints: { 'zh::a': 'zh::a: is longer than the slot allows' }
  })
  assert.equal(asked, 1)
  assert.equal(retry.translations['zh::a'], '译:Hello')
})

test('a retry keeps every slot it is not retrying', async () => {
  const { translations } = await planLanguageTranslation({
    plan: plan([text('zh::a', 'One'), text('zh::b', 'Two')]),
    languageName: 'Chinese',
    translate: echo,
    only: ['zh::b'],
    previous: { 'zh::a': 'KEEP', 'zh::b': 'REDO' }
  })
  assert.equal(translations['zh::a'], 'KEEP')
  assert.equal(translations['zh::b'], '译:Two')
})

test('the complaint travels with the slot it is about', async () => {
  let sent
  await planLanguageTranslation({
    plan: plan([text('zh::a', 'Plans from $29')]),
    languageName: 'Chinese',
    translate: async (items) => {
      sent = items
      return echo(items)
    },
    only: ['zh::a'],
    complaints: { 'zh::a': 'the figure $29 is missing from the translation' }
  })
  assert.equal(sent[0].fix, 'the figure $29 is missing from the translation')
  assert.equal(sent[0].limit, 100)
})

test('an answer arrives however the model fenced it', () => {
  assert.deepEqual(parseTranslationAnswer('[{"i":0,"text":"你好"}]'), [{ i: 0, text: '你好' }])
  assert.deepEqual(parseTranslationAnswer('```json\n[{"i":0,"text":"你好"}]\n```'), [{ i: 0, text: '你好' }])
  assert.deepEqual(parseTranslationAnswer('```\n[]\n```'), [])
  assert.throws(() => parseTranslationAnswer('{"i":0}'), /not a JSON array/)
})

// Measured 24/09/2026 on `j-56xke6` (Tracy Business, es-ES): one batch came back as broken JSON
// ("Expected ':' after property name") and the whole edition stopped, although a malformed answer
// is the same kind of miss as a dropped entry — the model is asked again and shown what was wrong.
test('an answer that is not valid JSON is asked again, not a lost edition', async () => {
  let attempt = 0
  let fixSeen
  const { translations } = await planLanguageTranslation({
    plan: plan([text('es::a', 'One')]),
    languageName: 'Spanish',
    translate: async (items) => {
      attempt += 1
      if (attempt === 1) return parseTranslationAnswer('[{"i":0 "text":"Uno"}]')
      fixSeen = items[0].fix
      return items.map((item) => ({ i: item.i, text: 'Uno' }))
    }
  })
  assert.equal(attempt, 2)
  assert.deepEqual(translations, { 'es::a': 'Uno' })
  assert.match(fixSeen, /not a valid JSON array/)
})

test('an answer that stays broken fails after three tries and says why', async () => {
  await assert.rejects(
    planLanguageTranslation({
      plan: plan([text('es::a', 'One')]),
      languageName: 'Spanish',
      translate: async () => parseTranslationAnswer('not json')
    }),
    /incomplete 3 times running.*not a valid JSON array/s
  )
})

test('a failure that is not about the answer is not retried as one', async () => {
  let attempt = 0
  await assert.rejects(
    planLanguageTranslation({
      plan: plan([text('es::a', 'One')]),
      languageName: 'Spanish',
      translate: async () => {
        attempt += 1
        throw new Error('OpenRouter 402: insufficient credits')
      }
    }),
    /402/
  )
  assert.equal(attempt, 1)
})

// Measured 24/09/2026 on `j-56xke6` (es-ES): a Spanish line came back at 55 characters for a 52-long
// slot three times running — each retry sent the same `limit` with "over the slot limit of 52" as
// its complaint, and a model that overshoots by a few characters overshoots again. The retry now
// asks for a shorter target, with room under the real limit, and says the number.
test('a slot refused for length is asked again with a tighter limit it is told outright', async () => {
  let sent
  await planLanguageTranslation({
    plan: plan([text('es::a', 'Same-day delivery across all five boroughs', 52)]),
    languageName: 'Spanish',
    translate: async (items) => {
      sent = items
      return items.map((item) => ({ i: item.i, text: 'Entrega el mismo día' }))
    },
    only: ['es::a'],
    complaints: { 'es::a': 'es-ES::a: is 55 characters, over the slot limit of 52' }
  })
  assert.equal(sent[0].limit, 44)
  assert.match(sent[0].fix, /at most 44 characters/)
})

test('a complaint that is not about length keeps the slot limit', async () => {
  let sent
  await planLanguageTranslation({
    plan: plan([text('zh::a', 'Plans from $29', 40)]),
    languageName: 'Chinese',
    translate: async (items) => {
      sent = items
      return echo(items)
    },
    only: ['zh::a'],
    complaints: { 'zh::a': 'the figure $29 is missing from the translation' }
  })
  assert.equal(sent[0].limit, 40)
})

test('the model is told what a "fix" on an item means', async () => {
  let system
  await planLanguageTranslation({
    plan: plan([text('zh::a', 'One')]),
    languageName: 'Chinese',
    translate: async (items, sys) => {
      system = sys
      return echo(items)
    }
  })
  assert.match(system, /"fix": what was wrong with your previous answer/)
})
