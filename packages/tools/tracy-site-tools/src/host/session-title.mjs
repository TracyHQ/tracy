/**
 * The conversation's title: dsh's `sessionTitle` provider, as Tracy's composition asks for it.
 *
 * WHY THIS REPLACES dsh's `session-title-llm` ROW (`@tracy/dsh-native-bundle` cordis.patch.yml turns
 * it off). dsh's first-prompt provider hands the title model the first user message's whole text as
 * "the human message". A Browser-tab comment is ONE user message: the person's request, then a fenced
 * `tracy-element` block per picked element (the PAGE's words and the resolver's labels) and a long line
 * of Tracy's instructions naming `tracy_site` (`tracy-chat-input` `comment-turn.mjs`). Measured 29/09 on
 * the local stand, 194 model titles: 5 came back in Chinese, all 5 from such turns with English
 * requests (acceptance F13: "更新主页服务文本与标题" for "Change this heading to: Core services…").
 *
 * Two changes, nothing else:
 *   1. The model reads the PERSON'S WORDS (`personWords`, the same cut every comment rule here reads),
 *      so the page's text and Tracy's hint never count as what the customer wrote.
 *   2. A title in a CJK script the person's words do not use is refused. The provider then throws,
 *      dsh logs `automatic title generation failed` and keeps the deterministic title it already
 *      wrote from the first words the person typed (`session-title` `fallbackSessionTitle`) — so the
 *      title is always in the person's language, never a guess. The model is told the rule too; the
 *      check is what makes it hold, since a model's language choice is not a guarantee.
 *
 * Everything else is dsh's policy (`@deepseek-ai/dsh-session-title-llm` `generateSessionTitleWithLlm`,
 * the base bundle's row): the main request's route, the system prompt's shape, 5 words or 10 CJK
 * characters, 64 output tokens, 60 s. It is not imported: this plugin declares no `@deepseek-ai/dsh-*`
 * dependency and the image copies its folder without an install (`types.ts`, `build-host.mjs`).
 */

import { randomUUID } from 'node:crypto'

import { personWords } from './prompter.mjs'

/** The id dsh records on every title this provider writes (`session/title` `source.provider`). */
export const TITLE_PROVIDER_ID = 'tracy-site-tools:session-title'

const TARGET_WORDS = 5
const TARGET_CJK_CHARACTERS = 10
const MAX_OUTPUT_TOKENS = 64
const TIMEOUT_MS = 60_000
/** The person's words beyond this many UTF-8 bytes add nothing to a five-word title. */
const MAX_INPUT_BYTES = 4096

const SYSTEM = [
  'Create a concise title for an AI assistant conversation from the supplied human messages.',
  'Return only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.',
  'Write the title in the same language the human messages are written in. Never translate them: English messages get an English title, Vietnamese messages a Vietnamese title.',
  `Aim for about ${TARGET_WORDS} words in non-CJK languages or ${TARGET_CJK_CHARACTERS} CJK characters.`
].join('\n')

/** The CJK scripts a model may drift into; a title may use one only if the person's words do. */
const CJK_SCRIPTS = [
  ['Chinese characters', /\p{Script=Han}/u],
  ['Japanese kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['Korean Hangul', /\p{Script=Hangul}/u]
]

/**
 * The CJK scripts `title` uses that `words` does not — empty when the title may stand. Japanese
 * writes with kanji, so words in kana admit Chinese characters.
 * @param {string} title
 * @param {string} words
 * @returns {string[]}
 */
export function foreignScripts(title, words) {
  const kana = CJK_SCRIPTS[1][1].test(words)
  return CJK_SCRIPTS.filter(
    ([name, re]) => re.test(title) && !re.test(words) && !(kana && name === 'Chinese characters')
  ).map(([name]) => name)
}

/** Cut `text` to at most `max` UTF-8 bytes without splitting a character. */
function capBytes(text, max) {
  if (Buffer.byteLength(text, 'utf8') <= max) return text
  let out = ''
  for (const ch of text) {
    if (Buffer.byteLength(out + ch, 'utf8') > max) break
    out += ch
  }
  return out
}

/**
 * The first message the person put words in (a comment of only a picked element has none).
 * @param {readonly { seq: number, text: string }[]} messages
 * @returns {{ seq: number, text: string } | undefined}
 */
function firstWords(messages) {
  for (const message of messages) {
    const text = personWords(message?.text ?? '').trim()
    if (text !== '') return { seq: message.seq, text }
  }
  return undefined
}

/**
 * The provider object dsh's `sessionTitle.register` takes.
 * @param {{ stream: (options: Record<string, unknown>) => AsyncIterable<Record<string, any>> }} llm - `ctx.llm`.
 */
export function sessionTitleProvider(llm) {
  return {
    id: TITLE_PROVIDER_ID,
    automatic: 'first-prompt',
    /**
     * @param {{ session: { id: string }, messages: readonly { seq: number, text: string }[], route?: { provider: string, model: string }, signal: AbortSignal }} request
     */
    async generate(request) {
      request.signal.throwIfAborted()
      const source = firstWords(request.messages)
      if (source === undefined) throw new Error('session-title: no words of the person to title')
      const route = request.route
      if (route === undefined) throw new Error('session-title: no logged request route is available')
      const words = capBytes(source.text, MAX_INPUT_BYTES)
      const message = {
        id: randomUUID(),
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Generate the conversation title from this JSON array of human messages:\n${JSON.stringify([{ seq: source.seq, text: words }])}`
          }
        ],
        source: { kind: 'user' }
      }
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)])
      let said = ''
      let blockText = ''
      for await (const chunk of llm.stream({
        provider: route.provider,
        model: route.model,
        system: SYSTEM,
        messages: [message],
        maxTokens: MAX_OUTPUT_TOKENS,
        sessionId: request.session.id,
        purpose: 'session-title',
        signal
      })) {
        if (chunk.type === 'text-delta') said += typeof chunk.text === 'string' ? chunk.text : ''
        else if (chunk.type === 'block-end' && chunk.block?.type === 'text')
          blockText += chunk.block.text ?? ''
        else if (chunk.type === 'finish' && chunk.reason?.kind !== 'stop') {
          const failure = chunk.reason?.failure
          throw new Error(
            `session-title: ${failure?.code ?? chunk.reason?.kind ?? 'unknown'} ${failure?.message ?? ''}`.trim()
          )
        }
      }
      const title = (said !== '' ? said : blockText).replace(/\s+/g, ' ').trim()
      if (title === '') throw new Error('session-title: the model answered nothing')
      const foreign = foreignScripts(title, words)
      if (foreign.length > 0) {
        throw new Error(
          `session-title: the model's title is in ${foreign.join(', ')}, which the person's words are not written in`
        )
      }
      return { title, messageSeqs: [source.seq], model: { provider: route.provider, model: route.model } }
    }
  }
}

/**
 * Register the provider once dsh's title service and model runtime are both there. `ctx.inject`
 * rather than the plugin's `inject`: a composition without them keeps every tool here, it only
 * loses the model-made title (the same optional reading as `ctx.get` elsewhere in this plugin).
 * @param {{ inject: (names: string[], callback: (ctx: any) => void) => unknown }} ctx
 */
export function installSessionTitle(ctx) {
  ctx.inject(['sessionTitle', 'llm'], (scoped) => {
    scoped.sessionTitle.register(sessionTitleProvider(scoped.llm))
  })
}
