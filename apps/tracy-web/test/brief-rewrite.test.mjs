/**
 * "Rewrite with AI": the length rule is counted on the answer, a miss gets one repair round, and a
 * second miss is a refusal. The model is a scripted double; nothing here says anything about a real
 * one.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cleanAnswer,
  countWords,
  judgeRewrite,
  boundsFor,
  REWRITE_MAX_CHARS,
  REWRITE_MAX_WORDS,
  rewriteBrief,
  rewritePrompt,
  wordLimitFor
} from '../src/lib/brief-rewrite.js'

const MODEL = { apiKey: 'sk-secret-key', baseUrl: 'https://model.example/v1', words: 'm' }
const SOURCE = 'We are a family bakery that sells bread and cakes'

/** A fetch double that answers each call with the next scripted text; records what it was sent. */
function scripted(...texts) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers })
    const text = texts[Math.min(calls.length - 1, texts.length - 1)]
    return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 })
  }
  return { fetchImpl, calls }
}

test('words are counted per language, not by spaces', () => {
  assert.equal(countWords('A family bakery'), 3)
  assert.equal(countWords('  one   two\nthree  '), 3)
  assert.equal(countWords('Một tiệm bánh gia đình'), 5)
  assert.ok(countWords('これは家族のパン屋です') > 1, 'Japanese is not one word')
  assert.equal(countWords(''), 0)
  assert.equal(countWords(undefined), 0)
})

test('a rewrite may be ten words longer than the original, not eleven', () => {
  const source = 'one two three'
  assert.equal(wordLimitFor(countWords(source)), 13)
  assert.deepEqual(judgeRewrite(source, 'one a b c d e f g h i j k l'), { ok: true })
  const over = judgeRewrite(source, 'a b c d e f g h i j k l m n')
  assert.equal(over.ok, false)
  assert.equal(over.why, 'too_many_words')
})

test('a rewrite shorter than the original is fine', () => {
  assert.deepEqual(judgeRewrite(SOURCE, 'A family bakery selling bread and cakes'), { ok: true })
})

test('a rewrite that says nothing new, or nothing, is refused', () => {
  assert.equal(judgeRewrite(SOURCE, SOURCE.toUpperCase()).why, 'same')
  assert.equal(judgeRewrite(SOURCE, '').why, 'empty')
})

test('a rewrite longer than the text box holds is refused', () => {
  const long = Array.from({ length: 40 }, () => 'wonderfully').join(' ')
  assert.equal(long.length > REWRITE_MAX_CHARS, true)
  assert.equal(judgeRewrite(Array.from({ length: 40 }, () => 'x').join(' '), long).why, 'too_long')
})

test('quotes, fences and extra spaces around the answer are stripped', () => {
  assert.equal(cleanAnswer('"A family   bakery."'), 'A family bakery.')
  assert.equal(cleanAnswer('```\nA family bakery.\n```'), 'A family bakery.')
  assert.equal(cleanAnswer(undefined), '')
})

test('a good answer comes back as it is, from one call, with the key only in the header', async () => {
  const { fetchImpl, calls } = scripted('A family-run bakery selling fresh bread and cakes')
  const done = await rewriteBrief({ text: SOURCE, model: MODEL, fetchImpl })
  assert.deepEqual(done, {
    ok: true,
    text: 'A family-run bakery selling fresh bread and cakes',
    words: 9,
    sourceWords: 10,
    mode: 'rewrite'
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://model.example/v1/chat/completions')
  assert.match(calls[0].body.messages[0].content, /has 10 words/)
  assert.match(calls[0].body.messages[0].content, /at most 20 words/)
  assert.equal(calls[0].body.messages[1].content, SOURCE)
  assert.equal(JSON.stringify(calls[0].body).includes(MODEL.apiKey), false)
})

test('an answer that is too long gets one repair round with the numbers, then passes', async () => {
  const wordy = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')
  const { fetchImpl, calls } = scripted(wordy, 'A family bakery selling bread and cakes')
  const done = await rewriteBrief({ text: SOURCE, model: MODEL, fetchImpl })
  assert.equal(done.ok, true)
  assert.equal(done.text, 'A family bakery selling bread and cakes')
  assert.equal(calls.length, 2)
  const repair = calls[1].body.messages.at(-1).content
  assert.match(repair, /30 words; the limit is 20/)
  assert.equal(calls[1].body.messages.at(-2).content, wordy, 'the model sees what it wrote')
})

test('two misses in a row is a refusal, never a cut sentence', async () => {
  const wordy = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')
  const { fetchImpl, calls } = scripted(wordy)
  const done = await rewriteBrief({ text: SOURCE, model: MODEL, fetchImpl })
  assert.equal(done.ok, false)
  assert.equal(done.code, 'REWRITE_UNUSABLE')
  assert.equal(calls.length, 2, 'one repair round and no more')
})

test('a model that errors is MODEL_FAILED, and the key is not in the message', async () => {
  const fetchImpl = async () => new Response(`bad key ${MODEL.apiKey} rejected`, { status: 401 })
  const done = await rewriteBrief({ text: SOURCE, model: MODEL, fetchImpl })
  assert.equal(done.ok, false)
  assert.equal(done.code, 'MODEL_FAILED')
  assert.equal(done.message.includes(MODEL.apiKey), false)
  // The provider's own sentence never reaches the browser either (it can echo the prompt).
  assert.equal(done.message.includes('rejected'), false)
})

test('a network error is MODEL_FAILED, and the key is not in the message', async () => {
  const fetchImpl = async () => {
    throw new Error(`connect failed for ${MODEL.apiKey}`)
  }
  const done = await rewriteBrief({ text: SOURCE, model: MODEL, fetchImpl, sleep: () => Promise.resolve() })
  assert.equal(done.code, 'MODEL_FAILED')
  assert.equal(done.message.includes(MODEL.apiKey), false)
})

const json = (meaningful, text) => JSON.stringify({ meaningful, text })

test('a rewrite is never longer than fifty words, even from a long original', () => {
  assert.equal(wordLimitFor(45), REWRITE_MAX_WORDS)
  assert.equal(boundsFor('rewrite', 45).max, 50)
  assert.equal(boundsFor('rewrite', 3).max, 13)
})

test('a sample is about ten words; "again" keeps the length of the text it was given', () => {
  assert.deepEqual(boundsFor('sample', 0), { min: 6, max: 14 })
  assert.deepEqual(boundsFor('again', 20), { min: 18, max: 22 })
  assert.deepEqual(boundsFor('again', 50), { min: 48, max: 50 })
  assert.deepEqual(boundsFor('again', 1), { min: 1, max: 3 })
})

test('an empty box gets one sample sentence of about ten words, asked about the question', async () => {
  const { fetchImpl, calls } = scripted('We make fresh bread and cakes for our neighbours every day')
  const done = await rewriteBrief({
    text: '',
    question: 'What does the company do?',
    model: MODEL,
    fetchImpl
  })
  assert.equal(done.ok, true)
  assert.equal(done.mode, 'sample')
  assert.equal(done.sourceWords, 0)
  assert.equal(done.words, 11)
  assert.equal(calls.length, 1)
  assert.match(calls[0].body.messages[0].content, /What does the company do\?/)
  assert.match(calls[0].body.messages[0].content, /about 10 words/)
})

test('nonsense typed in is told apart by the model and gets a sample, not a rewrite of the nonsense', async () => {
  const { fetchImpl, calls } = scripted(
    json(false, 'We run a small shop that sells handmade soap and candles')
  )
  const done = await rewriteBrief({ text: 'asdf qwer zxcv', model: MODEL, fetchImpl })
  assert.equal(done.ok, true)
  assert.equal(done.mode, 'sample')
  assert.equal(done.words, 11)
  assert.equal(calls.length, 1, 'one call decides and writes')
})

test('text that means something is rewritten within ten more words and fifty in all', async () => {
  const { fetchImpl } = scripted(json(true, 'A family bakery selling fresh bread and cakes'))
  const done = await rewriteBrief({ text: SOURCE, model: MODEL, fetchImpl })
  assert.deepEqual(
    { ok: done.ok, mode: done.mode, text: done.text },
    { ok: true, mode: 'rewrite', text: 'A family bakery selling fresh bread and cakes' }
  )
  const wordy = json(true, Array.from({ length: 60 }, (_, i) => `w${i}`).join(' '))
  const long = await rewriteBrief({
    text: Array.from({ length: 45 }, (_, i) => `x${i}`).join(' '),
    model: MODEL,
    fetchImpl: scripted(wordy).fetchImpl
  })
  assert.equal(long.ok, false, 'sixty words is over fifty, and a second miss is a refusal')
})

test('a second press with no edit keeps the length of the text, in different words', async () => {
  const previous = 'A family bakery selling fresh bread and cakes in town'
  const { fetchImpl, calls } = scripted('Our family bakery sells fresh bread and cakes locally')
  const done = await rewriteBrief({ text: previous, again: true, model: MODEL, fetchImpl })
  assert.equal(done.ok, true)
  assert.equal(done.mode, 'again')
  assert.equal(done.words, 9)
  assert.match(calls[0].body.messages[0].content, /has 10 words/)
  assert.match(calls[0].body.messages[0].content, /between 8 and 12 words/)
  const longer = scripted(Array.from({ length: 25 }, (_, i) => `w${i}`).join(' '))
  const miss = await rewriteBrief({ text: previous, again: true, model: MODEL, fetchImpl: longer.fetchImpl })
  assert.equal(miss.ok, false, 'a length that drifts is refused')
})

test('quotes the owner wrote are kept; only a wrapping pair is stripped', () => {
  assert.equal(cleanAnswer('"Best coffee" is our motto, "ok"'), '"Best coffee" is our motto, "ok"')
  assert.equal(cleanAnswer("'Tis our shop and we love 'em'"), "'Tis our shop and we love 'em'")
  assert.equal(cleanAnswer('"We bake bread daily"'), 'We bake bread daily')
})

test('a rewrite cannot collapse a long text to a word or two', () => {
  const source = 'We are a bakery with fresh bread cakes and coffee served every morning in town'
  const verdict = judgeRewrite(source, 'Bakery', boundsFor('rewrite', countWords(source)))
  assert.equal(verdict.ok, false)
  assert.equal(verdict.why, 'too_few_words')
})

test('the rewrite character cap is the brief answer cap, so the popup and the door cannot drift apart', async () => {
  const { BRIEF_ABOUT_MAX } = await import('../src/lib/site-brief.js')
  assert.equal(REWRITE_MAX_CHARS, BRIEF_ABOUT_MAX)
})

test('a refusal in plain text is not a rewrite: it shares nothing with what the owner wrote', () => {
  const source = 'We bake fresh bread cakes and coffee every morning'
  const bounds = boundsFor('rewrite', countWords(source))
  assert.equal(judgeRewrite(source, "I'm sorry, I can't help with that request.", bounds).why, 'off_topic')
  assert.equal(
    judgeRewrite(source, 'Fresh bread, cakes and coffee are baked here each morning.', bounds).ok,
    true
  )
})

test('a sample with no question is written in the person’s interface language, not always English', () => {
  assert.match(rewritePrompt('', { job: 'sample', language: 'Vietnamese' }), /Write it in Vietnamese/)
  assert.match(rewritePrompt('', { job: 'sample' }), /Write it in English/)
})
