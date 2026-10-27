/**
 * "AI rewrite" for a long answer of the Add site popup: what a business owner wrote, said again more
 * clearly, by the model this deployment has (`modelForDoor('web')`). It always writes something back:
 *
 *  - `rewrite` — the owner wrote something that means something: the same facts in better words, at
 *    most `REWRITE_MAX_EXTRA_WORDS` words longer than they wrote.
 *  - `sample` — the owner wrote nothing, or nothing that means anything (keyboard mashing, words that
 *    do not answer the question): one plain sentence of about `SAMPLE_WORDS` words that could answer
 *    the question, for the owner to correct. The model says which of the two it is looking at.
 *  - `again` — the owner pressed the button again on text this door wrote and changed nothing: the
 *    same length as that text (± `AGAIN_SLACK` words), in different words.
 *
 * Whatever the mode, no answer is longer than `REWRITE_MAX_WORDS` words.
 *
 * 🔒 THE LENGTH RULE IS CHECKED HERE, NOT ASKED FOR (the feature's own rule). The prompt states the
 * numbers, and then the answer is counted: a model that missed gets one repair round with the numbers
 * spelled out, and a second miss is a refusal, never a silent cut — a sentence chopped at a word limit
 * is worse than the original. The same goes for the character cap the popup's text box enforces
 * (`REWRITE_MAX_CHARS`, the plugin's `ABOUT_MAX`).
 *
 * 🔒 NO INVENTED FACTS ABOUT THE OWNER. A `rewrite` and an `again` may not add a name, place, number or
 * service the owner did not state; this file cannot check that, so it says so rather than pretend (the
 * owner reads the result before applying it, and the popup offers Undo). A `sample` states no name,
 * place, number or price either: it is a generic sentence, not a claim about this business.
 *
 * Words are counted with `Intl.Segmenter`, not by splitting on spaces, so a Chinese or Japanese
 * sentence (no spaces) is not "one word" with a limit of eleven.
 *
 * ⚠ SAME WIRE AS THE OTHER TEXT DOORS: OpenAI-compatible `POST {baseUrl}/chat/completions`
 * (`public/design-page.js` `apiWords`, `assistant/model.js`). The bearer key is redacted out of
 * every error text this returns — whatever threw is not trusted to be free of it.
 */

import { createSeedModel } from './seed-model.js'

/** How many words longer than the owner's own sentence a rewrite may be. */
export const REWRITE_MAX_EXTRA_WORDS = 10
/** The longest answer this door gives, in words, whatever the owner wrote. */
export const REWRITE_MAX_WORDS = 50
/** The longest rewrite the popup's text box can hold; keep equal to the plugin's `ABOUT_MAX`. */
export const REWRITE_MAX_CHARS = 300
/** The longest sentence this door reads. The box holds 300; a little room for a pasted one. */
export const REWRITE_MAX_INPUT_CHARS = 600
/** The longest question this door reads: it is a label, not an essay. */
export const REWRITE_MAX_QUESTION_CHARS = 200
/** How long a sample answer is, in words, and how far it may stray from that. */
export const SAMPLE_WORDS = 10
export const SAMPLE_SLACK = 4
/** How far "again" may stray from the length of the text it was given. */
export const AGAIN_SLACK = 2

/** Words in `text`, the way a reader counts them in any language. */
export function countWords(text) {
  if (typeof text !== 'string') return 0
  let n = 0
  for (const part of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text))
    if (part.isWordLike) n += 1
  return n
}

/** What the owner typed, cleaned the way the prompt and the count both read it. */
export function cleanSource(text) {
  return typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').slice(0, REWRITE_MAX_INPUT_CHARS) : ''
}

/** The question the owner is answering, on one line and safe to put between quotation marks. */
export function cleanQuestion(text) {
  return typeof text === 'string'
    ? text.replace(/\s+/g, ' ').replace(/["“”]/g, "'").trim().slice(0, REWRITE_MAX_QUESTION_CHARS)
    : ''
}

/** The longest a rewrite of `sourceWords` words may be. */
export function wordLimitFor(sourceWords) {
  return Math.min(sourceWords + REWRITE_MAX_EXTRA_WORDS, REWRITE_MAX_WORDS)
}

/**
 * How many words an answer of this mode may have.
 * @param {'rewrite' | 'sample' | 'again'} mode
 * @param {number} sourceWords - words in what the owner gave
 * @returns {{ min: number, max: number }}
 */
export function boundsFor(mode, sourceWords) {
  if (mode === 'sample') return { min: SAMPLE_WORDS - SAMPLE_SLACK, max: SAMPLE_WORDS + SAMPLE_SLACK }
  if (mode === 'again') {
    const max = Math.min(sourceWords + AGAIN_SLACK, REWRITE_MAX_WORDS)
    return { min: Math.max(1, Math.min(sourceWords, max) - AGAIN_SLACK), max }
  }
  // A rewrite keeps the facts, so it cannot collapse to a word or two: at most a third of the words may go.
  return {
    min: Math.max(1, Math.floor(sourceWords / 3)),
    max: wordLimitFor(sourceWords),
    requireOverlap: true
  }
}

/** Whether two texts have at least one word of three letters or more in common (any script). */
function sharesAWord(a, b) {
  const words = (t) => new Set(t.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
  const left = words(a)
  if (left.size < 2) return true // too little to compare: nothing to hold the answer against
  for (const w of words(b)) if (left.has(w)) return true
  return false
}

/** The model's text as one clean line: no wrapping quotes, no markdown fence, one space between words. */
export function cleanAnswer(text) {
  if (typeof text !== 'string') return ''
  let out = text
    .replace(/^```[a-z]*\s*|\s*```$/gi, '')
    .trim()
    .replace(/\s+/g, ' ')
  // Only a PAIR is wrapping: `"Best coffee" is our motto, "ok"` opens and closes with a quote but
  // is not wrapped in one, and stripping it would eat two of the owner's own marks.
  const PAIRS = { '"': '"', '“': '”', '”': '”', '«': '»', '„': '“', "'": "'" }
  const first = out[0]
  const wrapped =
    out.length >= 2 && PAIRS[first] === out.at(-1) && !out.slice(1, -1).includes(first === '“' ? '”' : first)
  if (wrapped) out = out.slice(1, -1).trim()
  return out
}

/**
 * Whether an answer is acceptable, and why not.
 * @param {string} source - what the owner gave, cleaned
 * @param {string} answer - the model's, cleaned
 * @param {{ min: number, max: number }} [bounds] - words allowed; the `rewrite` bounds when left out
 * @returns {{ ok: true } | { ok: false, why: 'empty' | 'off_topic' | 'same' | 'too_many_words' | 'too_few_words' | 'too_long', words: number }}
 */
export function judgeRewrite(source, answer, bounds = boundsFor('rewrite', countWords(source))) {
  const words = countWords(answer)
  if (answer === '' || words === 0) return { ok: false, why: 'empty', words }
  if (answer.toLowerCase() === source.toLowerCase()) return { ok: false, why: 'same', words }
  if (words > bounds.max) return { ok: false, why: 'too_many_words', words }
  if (words < bounds.min) return { ok: false, why: 'too_few_words', words }
  if (answer.length > REWRITE_MAX_CHARS) return { ok: false, why: 'too_long', words }
  // 🔒 A rewrite says the owner's facts again, so it shares words with them. A refusal or an
  // explanation ("I'm sorry, I can't understand that text") shares none, and must not land in the box.
  if (bounds.requireOverlap && !sharesAWord(source, answer)) return { ok: false, why: 'off_topic', words }
  return { ok: true }
}

/** The part of a prompt that names the question, when there is one. */
const aboutQuestion = (question) => (question ? ` The question is: "${question}".` : '')

/**
 * The system prompt: the job, the limits as numbers, and what not to do.
 * @param {string} source - what the owner gave, cleaned
 * @param {{ job?: 'rewrite' | 'sample' | 'again', question?: string }} [options]
 */
/** The English names of the interface languages, for the one prompt line that needs a language. */
const LANGUAGE_NAMES = {
  en: 'English',
  vi: 'Vietnamese',
  de: 'German',
  it: 'Italian',
  fr: 'French',
  nl: 'Dutch',
  zh: 'Chinese',
  es: 'Spanish'
}

export function rewritePrompt(source, { job = 'rewrite', question = '', language = 'English' } = {}) {
  const sourceWords = countWords(source)
  const asked = aboutQuestion(question)
  const sample = boundsFor('sample', 0)
  if (job === 'sample')
    return [
      'You help a business owner fill in a form about their own business. They have not written anything useful yet.' +
        asked,
      `Write ONE plain, meaningful sentence of about ${SAMPLE_WORDS} words (between ${sample.min} and ${sample.max}) that a small business could give as its answer, for the owner to correct afterwards.`,
      'Invent no name, place, number, price or year.',
      question
        ? 'Write it in the language of the question.'
        : `Write it in ${language}, as a plain description of what a small business does.`,
      `At most ${REWRITE_MAX_CHARS} characters.`,
      'Answer with the sentence only: no quotation marks, no markdown, no preface, no explanation.'
    ].join(' ')
  if (job === 'again') {
    const { min, max } = boundsFor('again', sourceWords)
    return [
      "You rewrite a business owner's short description of their own business so it reads clearly and naturally. The text you are given was already rewritten once: say it again in different words.",
      'Keep every fact and the meaning exactly. Never add a name, place, number, price, year or service that is not in the text.',
      'Write in the same language as the text, and in the first person if it is.',
      `The text has ${sourceWords} words. Your answer must be the same length: between ${min} and ${max} words, and at most ${REWRITE_MAX_CHARS} characters.`,
      'Answer with the rewritten text only: no quotation marks, no markdown, no preface, no explanation.'
    ].join(' ')
  }
  return [
    'You help a business owner answer a question on a form about their own business.' + asked,
    "First decide whether the owner's text is a meaningful answer: real words that say something about their business, in any language, even if short or badly spelled. Random letters, keyboard mashing, or words with nothing to do with the question are NOT meaningful.",
    'If it is meaningful: say the SAME thing in different, better words. Keep every fact and the meaning exactly. Never add a name, place, number, price, year or service that the owner did not write. Write in the same language as the owner, in the first person if they did, otherwise as a plain description.',
    `The owner's text has ${sourceWords} words. A rewrite of it must have at most ${wordLimitFor(sourceWords)} words and at most ${REWRITE_MAX_CHARS} characters; staying close to the original length is better.`,
    `If it is NOT meaningful: write ONE plain, meaningful sentence of about ${SAMPLE_WORDS} words (between ${sample.min} and ${sample.max}) that a small business could give as its answer${question ? ', in the language of the question' : ''}. Invent no name, place, number, price or year.`,
    'Reply with JSON only, no markdown, no explanation: {"meaningful": true or false, "text": "your text"}'
  ].join(' ')
}

/**
 * What the model said, as `{ text, sample }`: `sample` is true when it judged the owner's text
 * meaningless. A reply that is not JSON is read as a plain rewrite of the text; a reply that starts like
 * JSON and is not valid is nothing, so it gets the repair round.
 * @param {string} raw - the model's reply, cleaned
 */
function readReply(raw) {
  if (!raw.startsWith('{')) return { text: raw, sample: false }
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.text === 'string')
      return {
        text: cleanAnswer(parsed.text),
        sample: parsed.meaningful === false || parsed.meaningful === 'false' || parsed.meaningful === 'no'
      }
  } catch {
    // below: not usable
  }
  return { text: '', sample: false }
}

/** One line telling the model how its answer missed, with the numbers. */
function missDetail(verdict, answer, bounds) {
  if (verdict.why === 'too_many_words') return `That has ${verdict.words} words; the limit is ${bounds.max}.`
  if (verdict.why === 'too_few_words')
    return `That has ${verdict.words} words; it needs between ${bounds.min} and ${bounds.max}.`
  if (verdict.why === 'too_long')
    return `That is ${answer.length} characters; the limit is ${REWRITE_MAX_CHARS}.`
  if (verdict.why === 'same') return 'That is the same as the original. Use different words.'
  if (verdict.why === 'off_topic') return "That does not say what the owner's text says. Rewrite THEIR text."
  return 'That was empty or not in the format asked for.'
}

/**
 * Give the owner an answer to put in the box, within the length rule of its mode.
 * @param {{ text?: string, question?: string, again?: boolean,
 *           model: { apiKey: string, baseUrl: string, words: string },
 *           fetchImpl?: typeof fetch, signal?: AbortSignal, language?: string }} input
 *   `again`: the text is what this door wrote last time and the owner has not touched it.
 * @returns {Promise<{ ok: true, text: string, words: number, sourceWords: number, mode: 'rewrite' | 'sample' | 'again' }
 *   | { ok: false, code: 'MODEL_FAILED' | 'REWRITE_UNUSABLE', message: string }>}
 */
export async function rewriteBrief({
  text,
  question,
  again = false,
  model,
  fetchImpl = fetch,
  signal,
  language = 'en',
  sleep
}) {
  const source = cleanSource(text)
  const sourceWords = countWords(source)
  const asked = cleanQuestion(question)
  const languageName = LANGUAGE_NAMES[String(language).slice(0, 2).toLowerCase()] ?? 'English'
  // What the owner gave decides the job; for a text that says something, the model decides whether it
  // is a rewrite or a sample, in the same call.
  const job = sourceWords === 0 ? 'sample' : again ? 'again' : 'rewrite'
  // One call at a time, thinking off (`seed-model.js` says why), the key out of every message.
  const seed = createSeedModel({ model, fetchImpl, concurrency: 1, ...(sleep ? { sleep } : {}) })
  const ask = (messages) =>
    seed
      .chat({ messages, maxTokens: 400, temperature: job === 'rewrite' ? 0.5 : 0.7, signal })
      .then(cleanAnswer)
  const messages = [
    { role: 'system', content: rewritePrompt(source, { job, question: asked, language: languageName }) },
    { role: 'user', content: job === 'sample' ? asked || 'What does your business do?' : source }
  ]
  let reply
  let mode = job
  try {
    let raw = await ask(messages)
    const judge = () => {
      reply = job === 'rewrite' ? readReply(raw) : { text: raw, sample: false }
      mode = reply.sample ? 'sample' : job
      const bounds = boundsFor(mode, sourceWords)
      return { verdict: judgeRewrite(source, reply.text, bounds), bounds }
    }
    let { verdict, bounds } = judge()
    if (!verdict.ok) {
      // One repair round, with the miss named in numbers: the model sees what it wrote and by how
      // much it was wrong, which a bare "too long" does not tell it.
      const detail = missDetail(verdict, reply.text, bounds)
      raw = await ask([
        ...messages,
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: `${detail} Answer again within the limits. ${job === 'rewrite' ? 'Reply with the JSON only.' : 'Answer with the text only.'}`
        }
      ])
      ;({ verdict } = judge())
      if (!verdict.ok)
        return {
          ok: false,
          code: 'REWRITE_UNUSABLE',
          message: 'The model did not give an answer within the length limit.'
        }
    }
  } catch (error) {
    return {
      ok: false,
      code: 'MODEL_FAILED',
      // 🔒 The provider's own sentence stays out of the answer: it can carry the prompt back, the
      // model name and the account's limits, and this message goes to the browser.
      message: 'The model did not answer. Try again in a moment.'
    }
  }
  return { ok: true, text: reply.text, words: countWords(reply.text), sourceWords, mode }
}
