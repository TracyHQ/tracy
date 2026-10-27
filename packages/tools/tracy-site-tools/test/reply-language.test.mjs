/**
 * The reply's language, named on every turn a person speaks.
 *
 * Bug 30/09 (local stand, WordPress site on a Russian company's content, `deepseek-flash`, session
 * `session-f3db8d78…`): the first two turns were comments written in English, each block tagged
 * `lang="en"`, the rule said "Answer each item in the language it was written in (its block's
 * `lang`…)", and no Chinese was in the prompt — yet both answers came in Chinese. The site context
 * said "Reply in the customer's language", which on a Russian site read in English by a Vietnamese
 * team names no language at all. Every line pointed at a language; none of them NAMED one. The
 * turn now carries one sentence that does: "Reply in English — …".
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { REPLY_LANGUAGE_PLUGIN, replyLanguageRule } from '../src/host/prompter.mjs'

/** One comment block as the chat input writes it (`comment-turn.mjs`), with its `lang` tag. */
const block = (n, lang, text = 'Промышленное строительство') =>
  [
    '```tracy-element',
    `<mentioned-element n="${n}" url="http://s.test/" selector="h2" status="unchecked"${lang ? ` lang="${lang}"` : ''}>`,
    `text: ${text}`,
    '</mentioned-element>',
    '```'
  ].join('\n')

test('a comment turn tagged lang="en" on a Russian page: reply in English, by name', () => {
  const content = [
    {
      type: 'text',
      text: `4. just answer in one sentence: what is this section? change nothing\n\n${block(4, 'en')}`
    }
  ]
  const rule = replyLanguageRule(content)
  assert.ok(rule)
  assert.match(rule.text, /^Reply in English — the language of the person's latest message/)
  assert.match(rule.text, /not the site's/)
  assert.match(rule.summary, /English/)
})

test('a typed chat message in English on a Chinese site: reply in English', () => {
  const rule = replyLanguageRule('Please make the footer phone number bigger')
  assert.match(rule?.text ?? '', /^Reply in English — /)
})

test('a Vietnamese message: reply in Vietnamese', () => {
  const rule = replyLanguageRule([
    { type: 'text', text: 'Đổi số điện thoại ở chân trang thành 0909 123 456 giúp mình' }
  ])
  assert.match(rule?.text ?? '', /^Reply in Vietnamese — /)
})

test('mixed: an English request quoting Vietnamese words is English', () => {
  const rule = replyLanguageRule('Change the heading "Thành lập 2004" to "Founded in 2004"')
  assert.match(rule?.text ?? '', /^Reply in English — /)
})

test('mixed comment turn: each item its own language, the rest in the last one’s, named', () => {
  const content = `1. Đổi màu nút này sang đỏ\n2. Make this heading shorter\n${block(1, 'vi')}\n${block(2, 'en')}`
  const rule = replyLanguageRule(content)
  assert.match(
    rule?.text ?? '',
    /^Answer each request in its own language \(its block's `lang`\) and the rest of your reply in English/
  )
})

test('a tag wins over the words; words decide when no block carries one', () => {
  // The block's tag is the chat input's reading of the comment alone; the words around it may hold more.
  assert.match(replyLanguageRule(`3. ok\n${block(3, 'vi')}`)?.text ?? '', /^Reply in Vietnamese/)
  assert.match(
    replyLanguageRule(`3. please change this heading\n${block(3, '')}`)?.text ?? '',
    /^Reply in English/
  )
})

test('too short to read: the rule still says whose language, without guessing a name', () => {
  const rule = replyLanguageRule('ok')
  assert.ok(rule)
  assert.match(rule.text, /^Reply in the language of the person's latest message/)
  assert.doesNotMatch(rule.text, /English|Vietnamese|Chinese/)
})

test("words written INTO the site keep the page's language; the rule is never narrated", () => {
  for (const text of [
    'Please change the heading',
    'ok',
    `1. a\n2. b\n${block(1, 'vi')}\n${block(2, 'en')}`
  ]) {
    const rule = replyLanguageRule(text)
    assert.match(
      rule?.text ?? '',
      /Words you write into the site stay in the language of the page they go on, unless the request names another/
    )
    assert.match(rule?.text ?? '', /never say which language you reply in or why/)
  }
})

test('nothing typed is no rule; the producer is its own', () => {
  assert.equal(replyLanguageRule(''), null)
  assert.equal(replyLanguageRule(undefined), null)
  assert.equal(REPLY_LANGUAGE_PLUGIN, 'tracy-site-tools:reply-language')
})

test('one reading (`@tracy/core/language`, which the chat input tags blocks with too): each sample named', () => {
  // Was a parity test between the core reading and the chat input's own copy until that copy went
  // (30/09); the expected names are now written out.
  const samples = [
    ['just answer in one sentence: what is this section? change nothing', 'English'],
    ['Đổi tiêu đề này thành ngắn hơn nhé', 'Vietnamese'],
    ['Сделайте этот заголовок короче', 'Russian'],
    ['Зробіть цей заголовок коротшим, будь ласка, і ще їх', 'Ukrainian'],
    ['把这个标题改短一点', 'Chinese'],
    ['このタイトルを短くしてください', 'Japanese'],
    ['이 제목을 짧게 해 주세요', 'Korean'],
    ['Change "Thành lập 2004" to "Founded in 2004"', 'English'],
    ['Ändere bitte die Überschrift', ''],
    ['ok', '']
  ]
  for (const [text, name] of samples) {
    const rule = replyLanguageRule(text)
    if (name) assert.match(rule?.text ?? '', new RegExp(`^Reply in ${name} — `), text)
    else assert.match(rule?.text ?? '', /^Reply in the language of the person's latest message/, text)
  }
})

test('a conversation keeps its main language for a mixed or unsure message, and follows a message plainly in another', async () => {
  const { chatMainLanguage, replyLanguageRule: rule } = await import('../src/host/prompter.mjs')
  const said = (text) => ({ content: [{ type: 'text', text }] })
  // The main language: the first message that reads clearly, a / command skipped.
  assert.equal(
    chatMainLanguage([said('/help'), said('ok'), said('Đổi màu nền trang chủ sang xanh đậm')]),
    'vi'
  )
  assert.equal(chatMainLanguage([said('/design')]), '')
  // A dictated Vietnamese request with an English clause, in a Vietnamese chat: Vietnamese.
  const mixed = rule('Đổi màu nền trang chủ sang xanh đậm and add a contact button under the headline.', 'vi')
  assert.match(mixed.text, /^Reply in Vietnamese, the language this conversation is in/)
  assert.match(mixed.text, /unless the person asks for another language/)
  assert.equal(mixed.summary, "Reply language: Vietnamese (the conversation's)")
  // Unsure words keep the main language too.
  assert.match(rule('ok', 'vi').text, /^Reply in Vietnamese, the language this conversation is in/)
  // A message plainly in another language is answered in it.
  const english = rule('Make the hero section darker and add a contact button under the headline.', 'vi')
  assert.match(english.text, /^Reply in English — the language of the person's latest message/)
  // No main language yet: the latest message decides, as before.
  assert.match(
    rule('Make the hero section darker please', '').text,
    /^Reply in English — the language of the person's latest message/
  )
})

test('a reply in Vietnamese names Tracy "mình" and the person "bạn", never a guess at gender or age; no other language does', async () => {
  const address = /refer to yourself as "mình" and to the person as "bạn"/
  // Typed, spoken, kept as the conversation's, or the Vietnamese part of a mixed comment turn.
  for (const rule of [
    replyLanguageRule('Đổi số điện thoại ở chân trang thành 0909 123 456 giúp mình'),
    replyLanguageRule('ok', 'vi'),
    replyLanguageRule(
      `1. Đổi màu nút này sang đỏ\n2. Make this heading shorter\n${block(1, 'vi')}\n${block(2, 'en')}`
    )
  ]) {
    assert.match(rule?.text ?? '', address)
    assert.match(
      rule?.text ?? '',
      /unless they clearly ask to be addressed otherwise; never infer their gender or age/
    )
    // Tracy talking to the person: the site's own copy keeps the brand's voice.
    assert.match(
      rule?.text ?? '',
      /not how the site talks: words written into the site keep its brand's own voice/
    )
  }
  for (const rule of [
    replyLanguageRule('Please make the footer phone number bigger'),
    replyLanguageRule('Make the hero section darker and add a contact button under the headline.', 'vi'),
    replyLanguageRule('ok')
  ])
    assert.doesNotMatch(rule?.text ?? '', /mình|bạn/)
  // One place for it: the spoken-reply rule does not say it a second time.
  const { readFileSync } = await import('node:fs')
  const voice = readFileSync(new URL('../src/host/voice-reply.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(voice, /mình|"bạn"|refer to yourself/)
})
