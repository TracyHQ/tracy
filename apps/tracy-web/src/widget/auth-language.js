/** Translate public sign-in instructions only. No visitor data or credentials enter this request. */
import { readFile } from 'node:fs/promises'
import { modelForDoor } from '../lib/llm-door.js'
import { speechLanguageCode } from './assets/email-voice.js'

const bundles = JSON.parse(await readFile(new URL('./assets/auth-voice.json', import.meta.url), 'utf8'))
const originals = Object.fromEntries(
  Object.entries(bundles).map(([language, { lexicon: _lexicon, ...guides }]) => [language, guides])
)
export const languageCode = speechLanguageCode
const baseLexicon = bundles.en.lexicon
const normalize = (value) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').trim()
const phrase = (value) =>
  typeof value === 'string' && value.trim() && value.length <= 160 && !/[<>\r\n]/.test(value)
export function validateLanguagePack(raw, language) {
  if (!raw || !raw.guides || !raw.lexicon) return null
  const guides = {},
    lexicon = {},
    source = originals.en
  for (const key of Object.keys(source)) {
    const value = raw.guides[key]
    if (!(typeof value === 'string' && value.trim() && value.length <= 1000 && !/[<>\r\n]/.test(value)))
      return null
    const placeholders = value.match(/\{[^}]+\}/g) || []
    const expected = source[key].match(/\{[^}]+\}/g) || []
    if (JSON.stringify(placeholders.sort()) !== JSON.stringify(expected.sort())) return null
    guides[key] = value
  }
  if (language !== 'en' && ['email', 'code', 'verified'].some((key) => guides[key] === source[key]))
    return null
  for (const key of ['yes', 'no', 'cancel', 'emailPrefix']) {
    if (
      !Array.isArray(raw.lexicon[key]) ||
      !raw.lexicon[key].length ||
      raw.lexicon[key].length > 8 ||
      !raw.lexicon[key].every(phrase)
    )
      return null
    lexicon[key] = raw.lexicon[key].map((x) => x.trim())
  }
  const negatives = [
    ...lexicon.no,
    ...lexicon.cancel,
    ...baseLexicon.no,
    ...baseLexicon.cancel,
    ...bundles.vi.lexicon.no,
    ...bundles.vi.lexicon.cancel
  ]
  const affirmatives = [...baseLexicon.yes, ...bundles.vi.lexicon.yes]
  if (lexicon.yes.some((y) => negatives.some((n) => normalize(y) === normalize(n)))) return null
  if (lexicon.no.some((n) => affirmatives.some((y) => normalize(n) === normalize(y)))) return null
  if (!lexicon.yes.some((word) => normalize(guides.confirmEmail).includes(normalize(word)))) return null
  if (
    !Array.isArray(raw.lexicon.digits) ||
    raw.lexicon.digits.length !== 10 ||
    !raw.lexicon.digits.every(phrase) ||
    new Set(raw.lexicon.digits.map(normalize)).size !== 10
  )
    return null
  lexicon.digits = raw.lexicon.digits
  lexicon.symbols = {}
  for (const symbol of Object.keys(baseLexicon.symbols)) {
    if (!phrase(raw.lexicon.symbols?.[symbol])) return null
    lexicon.symbols[symbol] = raw.lexicon.symbols[symbol]
  }
  const pattern = raw.lexicon.letterPattern
  if (
    !phrase(pattern) ||
    JSON.stringify((pattern.match(/\{[^}]+\}/g) || []).sort()) !== JSON.stringify(['{letter}', '{word}'])
  )
    return null
  lexicon.letterPattern = pattern
  return { language, guides, lexicon }
}
export function authLanguagePacks({ pool, config, admit = async () => true }) {
  const cache = new Map(),
    pending = new Map()
  return async (raw) => {
    const language = languageCode(raw)
    if (!language) throw Error('AUTH_LANGUAGE_INVALID')
    if (bundles[language])
      return { language, guides: originals[language], lexicon: bundles[language].lexicon }
    const saved = cache.get(language)
    if (saved && saved.expires > Date.now()) return saved.pack
    if (pending.has(language)) return pending.get(language)
    if (pending.size >= 4) throw Error('AUTH_LANGUAGE_UNAVAILABLE')
    const task = (async () => {
      if (!(await admit())) throw Error('AUTH_LANGUAGE_UNAVAILABLE')
      const model = await modelForDoor(pool, 'assistant', config)
      if (!model?.apiKey || !model?.baseUrl || !model?.words) throw Error('AUTH_LANGUAGE_UNAVAILABLE')
      const response = await fetch(model.baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${model.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: model.words,
          messages: [
            {
              role: 'system',
              content:
                'Translate the following fixed public sign-in instructions and lexicon into the requested ISO language. Return only JSON with guides and lexicon matching the input structure. Preserve {email}, {spelling}, {letter}, {word} placeholders exactly. Lexicon yes/no/cancel must be distinct exact standalone affirmative/negative/cancel phrases, never instructions; digits must be ten distinct spoken digit names in order 0 through 9; symbols must be their spoken names. Do not add any fields, URLs or actions. This is translation, not an authentication request.'
            },
            {
              role: 'user',
              content: JSON.stringify({ language, guides: originals.en, lexicon: baseLexicon })
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 4000
        }),
        signal: AbortSignal.timeout(20000)
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw Error('AUTH_LANGUAGE_UNAVAILABLE')
      }
      let pack
      try {
        const body = await response.json()
        pack = validateLanguagePack(JSON.parse(body.choices?.[0]?.message?.content), language)
      } catch {}
      if (!pack) throw Error('AUTH_LANGUAGE_UNAVAILABLE')
      if (cache.size >= 128) cache.delete(cache.keys().next().value)
      cache.set(language, { pack, expires: Date.now() + 3600000 })
      return pack
    })()
    pending.set(language, task)
    try {
      return await task
    } finally {
      pending.delete(language)
    }
  }
}
