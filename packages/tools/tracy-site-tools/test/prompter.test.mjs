/**
 * Whose name a write leaves in.
 *
 * Until 09/09 this plugin answered with `latest` — whoever's browser said hello last. On a lane one
 * person uses that is right by accident; on a shared one it is a coin toss, and the seat book was
 * being asked about the wrong person. It also carried an ORIGIN, which is how a tab opened on the
 * password gate (51731, no /api/sites) poisoned a build's first door call into
 * COWORK_WEB_BAD_RESPONSE while the second, after another hello, went through.
 *
 * The gate now stamps `prompter` onto every prompt and dsh keeps it on the message's source, so the
 * session's own log answers "who typed this" — and it answers per turn, which is what a shared
 * session needs. This is the reading half: pure, so it can be held by a test.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCommentTurn,
  COMMENT_ANSWER_MANY as HINT_ANSWER_MANY,
  COMMENT_ANSWER_ONE as HINT_ANSWER_ONE,
  COMMENT_IMAGE_WORDS as HINT_IMAGE_WORDS,
  COMMENT_LOOK_SCOPE as HINT_LOOK_SCOPE,
  COMMENT_NAMED_BY_PAGE as HINT_NAMED_BY_PAGE,
  COMMENT_WHAT_CHANGED as HINT_WHAT_CHANGED,
  COMMENT_REPLY_LANGUAGE as HINT_REPLY_LANGUAGE,
  COMMENT_THREAD as HINT_THREAD,
  COMMENT_WRITES_ONLY as HINT_WRITES_ONLY,
  parseCommentTurn
} from '../../../ui/tracy-chat-input/src/client/comment-turn.mjs'
import { customerSentence } from '../src/host/normalize.mjs'
import { lookUndoNote } from '../src/host/look-undo.mjs'
import * as prompterModule from '../src/host/prompter.mjs'
import {
  COMMENT_ANSWER_MANY,
  COMMENT_ANSWER_ONE,
  COMMENT_IMAGE_WORDS,
  COMMENT_ITEMS_PLUGIN,
  COMMENT_LOOK_SCOPE,
  COMMENT_NAMED_BY_PAGE,
  COMMENT_REPLY_LANGUAGE,
  COMMENT_THREAD,
  COMMENT_WHAT_CHANGED,
  COMMENT_WRITES_ONLY,
  commentItemsRule,
  customerMessages,
  latestCustomerWords,
  latestPrompter,
  personWords,
  replyLanguageRule,
  relayPlan
} from '../src/host/prompter.mjs'
import { customerSentence as joomlaEvidence } from '../src/host/replace-joomla.mjs'
import { asksRemoval, quotesCustomer } from '../src/host/site-call.mjs'

/** A `user/message` event as dsh writes it, with whatever source the gate stamped. */
const said = (source) => ({ type: 'user/message', data: { source } })

test('the person who typed most recently is the one a write acts for', () => {
  const events = [
    said({ kind: 'user', rpcId: 'r1', prompter: { user: 'sa', email: 'ann@team.test' } }),
    { type: 'assistant/message', data: {} },
    said({ kind: 'user', rpcId: 'r2', prompter: { user: 'sb', email: 'bee@team.test' } })
  ]
  assert.deepEqual(latestPrompter(events), { user: 'sb', email: 'bee@team.test' })
})

test('messages a plugin or a tool wrote are not people, and never win', () => {
  const events = [
    said({ kind: 'user', rpcId: 'r1', prompter: { user: 'sa', email: 'ann@team.test' } }),
    said({ kind: 'plugin', plugin: 'tracy-site-build' }),
    said({ kind: 'tool', callId: 'c1' })
  ]
  assert.deepEqual(latestPrompter(events), { user: 'sa', email: 'ann@team.test' })
})

test('a lane with no gate in front stamps nothing, and this says so rather than inventing one', () => {
  assert.equal(latestPrompter([said({ kind: 'user', rpcId: 'r1' })]), null)
  assert.equal(latestPrompter([]), null)
  assert.equal(latestPrompter(undefined), null)
})

test('a stamp with a name but no address cannot be vouched for — the master account of a gate', () => {
  assert.equal(
    latestPrompter([said({ kind: 'user', rpcId: 'r1', prompter: { user: 'root', email: null } })]),
    null
  )
})

test('a signed write goes out as the person who typed, to the address the lane was told', () => {
  // An assertion is good wherever the seat book listens, so a tab that happened to be opened on the
  // password gate cannot steer it — the failure this whole path was written for.
  const plan = relayPlan({
    prompter: { user: 'sb', email: 'bee@team.test' },
    viewer: { cookie: 'tracy_sess=stale', origin: 'http://127.0.0.1:51731', at: 1 },
    origin: 'https://cowork.tracy.ai'
  })
  assert.deepEqual(plan, { as: 'prompter', email: 'bee@team.test', origin: 'https://cowork.tracy.ai' })
})

test('no prompter falls back to the viewer, exactly as before, and says which it was', () => {
  const viewer = { cookie: 'tracy_sess=abc', origin: 'https://cowork.tracy.ai', at: 1 }
  assert.deepEqual(relayPlan({ prompter: null, viewer, origin: 'https://cowork.tracy.ai' }), {
    as: 'viewer',
    cookie: 'tracy_sess=abc',
    origin: 'https://cowork.tracy.ai'
  })
})

test("a viewer's cookie goes to the configured Tracy origin, never to the hello's host", () => {
  // A viewer's origin is its hello's `x-forwarded-host`/`host`; off the fleet proxy (a direct port, a
  // stand) the caller writes it. The same pin `designGetRequest` keeps (#624).
  const viewer = { cookie: 'tracy_sess=local', origin: 'http://attacker.example', at: 1 }
  const plan = relayPlan({ prompter: null, viewer, origin: 'http://tracy-web:8080' })
  assert.deepEqual(plan, { as: 'viewer', cookie: 'tracy_sess=local', origin: 'http://tracy-web:8080' })
})

test('nowhere configured: nobody is sent anything — neither the person who typed nor the viewer', () => {
  const viewer = { cookie: 'tracy_sess=abc', origin: 'http://attacker.example', at: 1 }
  const prompter = { user: 'sb', email: 'bee@team.test' }
  for (const origin of [null, undefined, '', '   ']) {
    assert.equal(relayPlan({ prompter, viewer, origin }), null)
    assert.equal(relayPlan({ prompter: null, viewer, origin }), null)
  }
})

test('a configured origin is trimmed, as the design record reads it', () => {
  const plan = relayPlan({
    prompter: { user: 'sb', email: 'bee@team.test' },
    viewer: null,
    origin: ' https://cowork.tracy.ai '
  })
  assert.deepEqual(plan, { as: 'prompter', email: 'bee@team.test', origin: 'https://cowork.tracy.ai' })
})

test('a Dutch main-turn prompt names the user’s language instead of English', () => {
  const rule = replyLanguageRule(
    'Wat is de titel van mijn homepagina en hoeveel items staan er in het hoofdmenu?'
  )
  assert.ok(rule)
  assert.match(rule.text, /^Reply in Dutch — the language of the person's latest message/)
})

test('nobody at all is a refusal, not a guess', () => {
  assert.equal(relayPlan({ prompter: null, viewer: null, origin: 'https://cowork.tracy.ai' }), null)
})

test('the customer’s latest words: the last message a person typed, never a reminder, a snapshot or a notice', () => {
  // The order r2's logs show on every turn (wp C02): the customer, then AGENTS.md, dsh's runtime
  // snapshot and Tracy's site context — all `user/message` events, only the first a person.
  const typed = (text) => ({
    type: 'user/message',
    data: { source: { kind: 'user' }, content: [{ type: 'text', text }] }
  })
  const events = [
    typed('Change the phone to 0909 123 456'),
    {
      type: 'user/message',
      data: {
        source: { kind: 'agent-instructions' },
        content: [{ type: 'text', text: '<system-reminder>AGENTS.md' }]
      }
    },
    {
      type: 'user/message',
      data: {
        source: { kind: 'plugin', plugin: 'tracy-site-tools:site-context' },
        content: [{ type: 'text', text: 'site context' }]
      }
    },
    { type: 'tool/call', data: {} }
  ]
  assert.equal(latestCustomerWords(events), 'Change the phone to 0909 123 456')
  assert.equal(
    latestCustomerWords([...events, typed('Delete the testimonials section')]),
    'Delete the testimonials section'
  )
  assert.equal(
    latestCustomerWords([{ type: 'user/message', data: { source: { kind: 'user' }, content: 'plain' } }]),
    'plain'
  )
  assert.equal(latestCustomerWords([]), '')
  assert.equal(latestCustomerWords(undefined), '')
})

/**
 * 🔒 A COMMENT'S BLOCK IS NOT THE CUSTOMER'S WORDS (comment → edit, 27/09/2026). The Browser tab's
 * Comment sends the request, then a fenced `tracy-element` block holding the PAGE's words and the
 * resolver's labels, then Tracy's road hint — built by the chat input's own `buildCommentTurn`, so a
 * change of that format turns this red here. Measured before this: a comment "Make this button red"
 * on a button reading "Delete my account permanently" opened the D6′ body guard and the WordPress
 * replace engine's shrink (`quotesCustomer(turn, turn)`), and CC-16 took page text as the customer's
 * own sentence.
 */
test("🔒 a Browser-tab comment: only the person's request is their words, never the picked element's block", () => {
  const comment = (text, pageText) =>
    buildCommentTurn({
      text,
      element: {
        url: 'https://s.test/en',
        selector: 'a.btn',
        label: 'button',
        text: pageText,
        marks: ['module:428']
      },
      locate: {
        status: 'resolved',
        levels: [{ kind: 'record', id: 'content_a1', label: 'shared "Account"', writable: true }]
      }
    })
  const typed = (text) => ({
    type: 'user/message',
    data: { source: { kind: 'user' }, content: [{ type: 'text', text }] }
  })

  const red = comment('Make this button red', 'Delete my account permanently')
  // The hint's answer to a request about the look (change it yourself since RAISE 2 was lifted,
  // 29/09) is Tracy's words on the hint line, cut with it — "colour, size" never reads as the customer's.
  assert.match(red, /\(colour, size, spacing, font\): change it yourself/)
  assert.equal(personWords(red), 'Make this button red')
  const words = latestCustomerWords([typed(red)])
  assert.equal(words, 'Make this button red')
  // D6′: the page's removal verb opens nothing — not the escape's name, not a quote of the page.
  assert.equal(asksRemoval(words), false)
  assert.equal(quotesCustomer('Delete my account permanently', words), false)
  assert.equal(quotesCustomer(words, words), false, 'the WordPress replace engine asks it this way')
  // A request that does ask for a removal still does.
  const cut = latestCustomerWords([typed(comment('Remove this whole button please', 'Buy now'))])
  assert.equal(asksRemoval(cut), true)
  assert.equal(quotesCustomer('Remove this whole button please', cut), true)

  // CC-16 and the Joomla replace's evidence: the request's sentence, never the page's line.
  const phone = comment('Đổi số hotline thành 8 800 123-45-67', 'Hotline: 8 800 550-67-90')
  const said = latestCustomerWords([typed(phone)])
  assert.equal(customerSentence(said, 'tel:88001234567'), 'Đổi số hotline thành 8 800 123-45-67')
  assert.equal(
    customerSentence(said, 'tel:88005506790'),
    null,
    'the old number is the page, not the customer'
  )
  assert.equal(joomlaEvidence(customerMessages([typed(phone)]), ''), 'Đổi số hotline thành 8 800 123-45-67')

  // Words typed after the block are still theirs; a plain message is untouched, fences and all.
  assert.equal(
    personWords(`${red}\nAlso keep the hover colour.`),
    'Make this button red\n\nAlso keep the hover colour.'
  )
  const code = 'Put this in the footer:\n```html\n<p>Hi</p>\n```'
  assert.equal(personWords(code), code)
  assert.equal(personWords([{ type: 'text', text: red }, { type: 'image' }]), 'Make this button red')

  // Every form of the hint line goes too (28/09): an answer read from part of the site carries its
  // own hint, and a long request — a pasted replacement — gets the short form.
  const partial = buildCommentTurn({
    text: 'Make this button red',
    element: { url: 'https://s.test/en', selector: 'a.btn', label: 'button', text: 'Buy now', marks: [] },
    locate: {
      status: 'resolved',
      incomplete: true,
      levels: [{ kind: 'record', id: 'content_a1', label: 'x' }]
    }
  })
  assert.match(partial, /incomplete="true"/)
  assert.equal(personWords(partial), 'Make this button red')
  const pasted = `Replace it with: ${'new words '.repeat(180).trim()}`
  assert.equal(personWords(comment(pasted, 'Delete my account permanently')), pasted)

  // Two readers of one turn, one answer: the chip's `parseCommentTurn` and `personWords` (which the
  // History tab's moment title also reads) give the same bytes for every hint form.
  // An image with no words, marks or answer (dev 28/09) leaves the block's body empty.
  const image = buildCommentTurn({
    text: 'Cho tao ảnh công trường xây dựng',
    element: { url: 'https://s.test/', selector: 'main img', label: 'hero.webp', text: '', marks: [] },
    locate: null
  })
  assert.equal(personWords(image), 'Cho tao ảnh công trường xây dựng')
  for (const turn of [red, partial, comment(pasted, 'x'), `${red}\nAlso keep the hover colour.`, image])
    assert.equal(personWords(turn), parseCommentTurn(turn)?.request.replace(/\n+/g, '\n\n'))
})

/**
 * 🔒 SEVERAL COMMENTS, ONE TURN (plan "comment multi-pin", H5): N blocks of page words and one
 * Tracy hint, each block under its comment's words (unnumbered since S16, 30/09). Every block and the hint are cut — a page's
 * "Delete my account permanently" in comment 2's block must not become the customer asking for it —
 * and the three readers of "the person's words" (the chip's `parseCommentTurn`, `personWords`, the
 * History title) agree byte for byte, for one comment and for several.
 */
test('several comments: personWords keeps only each comment’s words, the same bytes the chip reads', () => {
  const pin = (n, text, pageText, locate = null) => ({
    n,
    text,
    element: {
      url: `https://s.test/p${n}`,
      selector: 'a.btn',
      label: 'button',
      text: pageText,
      marks: ['module:428']
    },
    locate
  })
  const sure = {
    status: 'resolved',
    levels: [{ kind: 'record', id: 'content_a1', label: 'shared "Account"' }]
  }
  const forms = [
    // Every element looked up: the plain many-comment hint.
    buildCommentTurn({
      items: [
        pin(1, 'Make this button red', 'Buy now', sure),
        pin(2, 'Rename it', 'Delete my account permanently', sure)
      ]
    }),
    // Some element not looked up: the incomplete many-comment hint.
    buildCommentTurn({
      items: [
        pin(1, 'Make this button red', 'Buy now'),
        pin(3, 'Two lines\nhere', 'Delete my account permanently')
      ]
    }),
    // Twelve, trimmed to the budget.
    buildCommentTurn({
      items: Array.from({ length: 12 }, (_, i) =>
        pin(i + 1, `Change ${i + 1}`, 'Delete my account permanently '.repeat(9))
      )
    })
  ]
  for (const turn of forms) {
    const words = personWords(turn)
    assert.doesNotMatch(words, /tracy-element|mentioned-element|tracy_site|Delete my account|Buy now/)
    assert.equal(words, parseCommentTurn(turn)?.request)
    // No number in the person's words (S16), and they open the turn (stand e2e B1: dsh titles a
    // session from its first words).
    assert.doesNotMatch(words, /(^|\n)\d+\. /)
    assert.ok(turn.startsWith(`${words.split('\n\n')[0]}\n\n\`\`\`tracy-element\n`), turn.slice(0, 80))
    assert.equal(
      asksRemoval(
        latestCustomerWords([
          {
            type: 'user/message',
            data: { source: { kind: 'user' }, content: [{ type: 'text', text: turn }] }
          }
        ])
      ),
      false
    )
  }
  assert.equal(personWords(forms[1]), 'Make this button red\n\nTwo lines\nhere')
  // One comment in the list form reads exactly as one comment always has.
  const one = buildCommentTurn({ items: [pin(1, 'Make this button red', 'Delete my account permanently')] })
  assert.equal(personWords(one), 'Make this button red')
  assert.equal(personWords(one), parseCommentTurn(one)?.request)
})

/**
 * A many-item comment turn in the H5 shape (agent T owns the exact bytes, `comment-turn.mjs`): N bare
 * `tracy-element` fences first, each opening `<mentioned-element n="k" …>`, then the numbered words,
 * then one hint line. Only the fence count is read here, so the fixture is written by hand.
 */
const manyItems = (n) =>
  [
    ...Array.from({ length: n }, (_, i) =>
      [
        '```tracy-element',
        `<mentioned-element n="${i + 1}" url="https://s.test/" selector="h2:nth-of-type(${i + 1})" label="heading">`,
        `text: Heading ${i + 1}`,
        '</mentioned-element>',
        '```'
      ].join('\n')
    ),
    ...Array.from({ length: n }, (_, i) => `${i + 1}. Change heading ${i + 1}`),
    'Find each element with `tracy_site` content.locate before you change it.'
  ].join('\n')

test('H6: a turn of two or more numbered comments gets the do-every-item rule; plain words get none', () => {
  const rule = commentItemsRule([{ type: 'text', text: manyItems(3) }])
  assert.ok(rule !== null)
  assert.match(rule.text, /3 numbered requests from the page/)
  assert.match(rule.text, /every one/i)
  assert.match(rule.text, /comment: <n>|comment: n/)
  assert.match(rule.text, /tracy_site or tracy_emdash/, 'an EmDash site writes through tracy_emdash')
  // V2-M1: one write that answers several comments names them all.
  assert.ok(rule.text.includes('`comment: [1, 2]`'), rule.text)
  // V2-H1: a comment is never answered by editing the site's files — that write has no receipt to undo.
  assert.match(rule.text, /only through `?tracy_site`? \/ `?tracy_emdash`? content writes/i)
  assert.match(rule.text, /never edit theme, template, plugin or PHP\/JS\/CSS files/i)
  assert.match(rule.text, /no slot/i)
  assert.ok(rule.text.includes(HINT_WRITES_ONLY), 'the rule and every comment hint say it in the same words')
  assert.match(rule.text, /say why/i)
  assert.match(rule.text, /next/i, 'an item that cannot be done does not stop the list')
  // Stage 6 (Rule 7): the answer is plain words saying which were done and which not — no list grammar.
  assert.ok(rule.text.includes(HINT_ANSWER_MANY), rule.text)
  assert.match(rule.summary, /3/)
  assert.equal(
    commentItemsRule(manyItems(2))?.text.includes('2 numbered requests from the page'),
    true,
    'a string content too'
  )
  // One comment is not a numbered list: it gets the one-comment rule (L8), never the list's.
  assert.doesNotMatch(
    commentItemsRule([{ type: 'text', text: manyItems(1) }])?.text ?? '',
    /numbered requests? from the page\. /
  )
  assert.equal(commentItemsRule([{ type: 'text', text: 'Please change 1. and 2. ```tracy-element' }]), null)
  assert.equal(commentItemsRule(undefined), null)
  assert.equal(COMMENT_ITEMS_PLUGIN, 'tracy-site-tools:comment-items')
})

/** Every shape of the dropped `- n ✓/✗` grammar and its verbs (stage 6, Rule 7). */
const LINE_GRAMMAR = [
  /`- (?:\d+ )?[✓✗]/u,
  /✓ updated/u,
  /✓ answered/u,
  /✓ replied/u,
  /"updated"/u,
  /never "changed"/u,
  /End your answer with/u,
  /markdown list/u,
  /one bullet per number/u,
  /✗ waiting for/u,
  /shows as Failed/u,
  /its own line/u
]

test('Rule 7: no comment rule carries the dropped `- n ✓/✗` line grammar, its verbs or the sentences built on it', () => {
  for (const [name, content] of [
    ['one comment', ONE_COMMENT_TEXT()],
    ['two comments', manyItems(2)],
    ['a lone reply', replyTurn([REPLY_ITEM])]
  ]) {
    const rule = commentItemsRule(content)
    assert.ok(rule !== null, name)
    for (const pattern of LINE_GRAMMAR) assert.doesNotMatch(rule.text, pattern, `${name}: ${pattern}`)
  }
  assert.equal('COMMENT_ANSWERED' in prompterModule, false)
})

test('Rule 7: one comment is answered naturally, several say which were done and which not — in the hint’s own words', () => {
  assert.equal(COMMENT_ANSWER_ONE, HINT_ANSWER_ONE, 'the one-comment rule and hint say it in the same words')
  assert.equal(COMMENT_ANSWER_MANY, HINT_ANSWER_MANY, 'the list rule and hint say it in the same words')
  const one = commentItemsRule(ONE_COMMENT_TEXT())
  assert.ok(one?.text.includes(COMMENT_ANSWER_ONE) && !one.text.includes(COMMENT_ANSWER_MANY), one?.text)
  for (const content of [manyItems(2), replyTurn([REPLY_ITEM])]) {
    const rule = commentItemsRule(content)
    assert.ok(rule?.text.includes(COMMENT_ANSWER_MANY) && !rule.text.includes(COMMENT_ANSWER_ONE), rule?.text)
  }
})

/** One picked element, as the chat input sends it: the turn Tracy has sent since 27/09 (v1 bytes). */
function ONE_COMMENT_TEXT() {
  return ONE_COMMENT
}
const ONE_COMMENT = buildCommentTurn({
  text: 'Make this red',
  element: { url: 'https://s.test/', selector: 'a', label: 'button', text: 'Buy', marks: [] },
  locate: null
})

test('H4: a comment about a whole page (its tracy-page block) counts as a comment of the list', () => {
  const turn = buildCommentTurn({
    items: [
      {
        n: 1,
        text: 'Make this red',
        element: { url: 'https://s.test/', selector: 'a', label: 'button', text: 'Buy', marks: [] },
        locate: null
      },
      { n: 2, text: 'Use the new phone number', element: null, locate: null, url: 'https://s.test/' }
    ]
  })
  const rule = commentItemsRule(turn)
  assert.ok(rule !== null, 'an element block and a page block are two comments')
  assert.match(rule.text, /2 numbered requests from the page/)
  assert.equal(personWords(turn), 'Make this red\n\nUse the new phone number')
  // Numbered prose with at most one block is not a list: at most the one-comment rule.
  assert.doesNotMatch(
    commentItemsRule(`Please look\n1. this\n\n${manyItems(1)}`)?.text ?? '',
    /numbered requests? from the page\. /
  )
  assert.equal(commentItemsRule('1. first thing\n2. second thing'), null)
})

test('a list of comments that are all about a whole page: the rule fires, the page blocks and the hint are not the person’s words', () => {
  const turn = buildCommentTurn({
    items: [
      { n: 3, text: 'Use the new phone number', element: null, locate: null, url: 'https://s.test/' },
      {
        n: 4,
        text: 'Add our address\nto the footer',
        element: null,
        locate: null,
        url: 'https://s.test/about'
      }
    ]
  })
  const rule = commentItemsRule(turn)
  assert.ok(rule !== null)
  assert.match(rule.text, /2 numbered requests from the page/)
  assert.equal(personWords(turn), 'Use the new phone number\n\nAdd our address\nto the footer')
  // One page-wide comment alone is plain words: no rule, words unchanged.
  const one = buildCommentTurn({
    items: [{ n: 3, text: 'Use the new phone number', element: null, url: 'https://s.test/' }]
  })
  assert.equal(one, 'Use the new phone number')
  assert.equal(commentItemsRule(one), null)
  assert.equal(personWords(one), one)
})

/** A reply (plan `tasks/todo-comment-thread.md` § "B addendum"): its turn, as the chat input builds it. */
const replyTurn = (items) =>
  buildCommentTurn({
    now: Date.UTC(2026, 8, 29, 9),
    items
  })
const REPLY_ITEM = {
  n: 6,
  text: 'Shorter still — five words max.',
  element: {
    url: 'https://s.test/',
    selector: 'h1',
    label: 'heading',
    text: 'Industrial construction',
    marks: []
  },
  locate: null,
  replyTo: 1,
  thread: [
    {
      author: 'Lee',
      at: Date.UTC(2026, 8, 29, 8, 50),
      text: 'Change the heading to Groundwork',
      status: 'done'
    },
    { author: 'Akemi', at: Date.UTC(2026, 8, 29, 8, 55), text: 'No, keep the old heading', status: 'saved' }
  ]
}

test('a reply: the rule carries the thread sentence, even for one reply alone, in the hint’s own words', () => {
  assert.equal(COMMENT_THREAD, HINT_THREAD, 'the rule and the hint say it in the same words')
  const alone = commentItemsRule(replyTurn([REPLY_ITEM]))
  assert.ok(alone !== null, 'a lone reply is a numbered comment the rule is about')
  assert.match(alone.text, /1 numbered request from the page\. /)
  assert.ok(alone.text.includes(COMMENT_THREAD), alone.text)
  const two = commentItemsRule(
    replyTurn([REPLY_ITEM, { ...REPLY_ITEM, n: 7, replyTo: undefined, thread: undefined, text: 'Other' }])
  )
  assert.ok(two?.text.includes(COMMENT_THREAD))
  assert.match(two?.text ?? '', /2 numbered requests from the page/)
  // Turns without a reply keep the rule they had.
  assert.ok(!commentItemsRule(manyItems(2))?.text.includes('reply-to'))
})

test('N1: a top-level comment sent with replies under it carries thread lines, so the rule carries the thread sentence', () => {
  const { replyTo: _r, ...top } = REPLY_ITEM
  const turn = replyTurn([
    {
      ...top,
      author: 'Lee',
      thread: [
        {
          author: 'Akemi',
          at: Date.UTC(2026, 8, 29, 8, 58),
          text: 'No, keep it',
          status: 'saved',
          later: true
        }
      ]
    }
  ])
  assert.ok(!turn.includes('reply-to='))
  const rule = commentItemsRule(turn)
  assert.ok(rule?.text.includes(COMMENT_THREAD), rule?.text)
  assert.match(rule?.text ?? '', /1 numbered request from the page\. /)
})

test('N1: the rule says the latest agreed word wins and a dismissed card writes nothing; N8: names, never roles', () => {
  assert.match(COMMENT_THREAD, /a later word nobody disputed wins over an older comment sent late/)
  assert.match(COMMENT_THREAD, /dismissed or comes back with no choice, change nothing/)
  assert.match(COMMENT_THREAD, /never by a role/)
})

test('a reply: its thread lines are not the person’s words (they sit inside the block)', () => {
  const turn = replyTurn([REPLY_ITEM])
  assert.ok(turn.includes('\nthread: Akemi (5m ago): No, keep the old heading\n'))
  assert.equal(personWords(turn), 'Shorter still — five words max.')
  assert.equal(personWords(turn), parseCommentTurn(turn)?.request)
})

test('L8: a ONE-comment turn gets its own rule too — the files sentence and a natural answer, not the list’s', () => {
  const rule = commentItemsRule([{ type: 'text', text: ONE_COMMENT }])
  assert.ok(rule !== null, 'one picked element is a comment turn')
  assert.match(rule.text, /^The person's message carries one request from the page\. /)
  assert.ok(rule.text.includes(HINT_WRITES_ONLY), 'the files sentence rides this rule too')
  assert.ok(rule.text.includes(COMMENT_ANSWER_ONE), rule.text)
  // Not the list's rule: no "do every one" for the lone comment.
  assert.doesNotMatch(rule.text, /numbered requests? from the page\. Do every one/)
  assert.equal(rule.summary, 'Rule for one comment in one message')
})

test('L6: every comment rule — one comment, a list, a lone reply — keeps comment: <that n> on a write that redoes an earlier comment', () => {
  // Stand E2E round 2 (29/09, Joomla V6): only comment 4 was sent; the agent also redid comment 1
  // (failed the turn before) without `comment: 1`, answered with a "Changed" table, and row 1 stayed Failed.
  // Stage 6 keeps the number (the Apply door checks it, contract H1) and drops the `- n ✓` line.
  const earlier =
    'A write that redoes a comment numbered in an earlier turn of this conversation (one that failed, say) still carries `comment: <that n>`.'
  for (const [name, content] of [
    ['one comment', ONE_COMMENT],
    ['two comments', manyItems(2)],
    ['a lone reply', replyTurn([REPLY_ITEM])]
  ]) {
    const rule = commentItemsRule(content)
    assert.ok(rule?.text.includes(earlier), `${name}: ${rule?.text}`)
  }
})

test('L1: every comment rule names the reply language — the person’s, never the site’s — in the hint’s own words', () => {
  // Quickstart smoke 29/09: on EmDash Base the agent answered English comments in Chinese.
  assert.equal(COMMENT_REPLY_LANGUAGE, HINT_REPLY_LANGUAGE, 'the rule and the hint say it in the same words')
  // F4 (stage-5 acceptance): per comment — not the site's, not the conversation's — and never narrated.
  assert.match(COMMENT_REPLY_LANGUAGE, /whatever this conversation or the site used before/)
  assert.match(COMMENT_REPLY_LANGUAGE, /never say which language you use or why/)
  for (const content of [ONE_COMMENT, manyItems(3), replyTurn([REPLY_ITEM])])
    assert.ok(commentItemsRule(content)?.text.includes(COMMENT_REPLY_LANGUAGE))
  // Stage 5's thread rule is untouched, and still the rule's last words when a reply is there.
  assert.ok(commentItemsRule(replyTurn([REPLY_ITEM]))?.text.endsWith(` ${COMMENT_THREAD}`))
})

test('F14: every comment rule forbids tool names, codes and ids in the reply, in the hint’s own words', () => {
  // Stage-5 acceptance: "page.look refused … (NO_BROWSER)" and "undo with apply.revert, apply_id replace-…".
  assert.equal(COMMENT_WRITES_ONLY, HINT_WRITES_ONLY, 'the rule and the hints say it in the same words')
  assert.match(
    COMMENT_WRITES_ONLY,
    /never a selector, id, mark, tool or action name, error code or receipt id/
  )
  assert.match(COMMENT_WRITES_ONLY, /a look change too, is undone by asking you, so say that/)
  for (const content of [ONE_COMMENT, manyItems(3), replyTurn([REPLY_ITEM])])
    assert.ok(commentItemsRule(content)?.text.includes(COMMENT_WRITES_ONLY))
})

test('G1: every comment rule says a look change names its scope and gives its undo, in the chat input hint’s words', () => {
  // 29/09 ~17:00: a look change made in a comment turn gets an undo (`look-undo.mjs`) and the
  // reply line says how far it reaches — the same sentence the hint carries.
  assert.equal(COMMENT_LOOK_SCOPE, HINT_LOOK_SCOPE, 'the rule and the hints say it in the same words')
  for (const rule of [
    commentItemsRule(manyItems(2)),
    commentItemsRule([{ type: 'text', text: manyItems(1) }])
  ])
    assert.ok(rule?.text.includes(`${HINT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`), rule?.text)
  // The look write's result carries the undo id for the agent; since 23/10/2026 (B7) the reply never
  // shows it — customers saw `Undo: look.revert <id>` as it was.
  const note = lookUndoNote({ id: '7f3a9c', files: ['x.css'] })
  assert.match(note, /^undo: 7f3a9c /)
  assert.match(note, /the id is for you, never in the reply/)
  assert.doesNotMatch(note, /Undo: look\.revert/)
})

test('M6: a comment rule on the image road says words drawn inside the picture are ✗ + a question card, in the hint’s words', () => {
  assert.equal(COMMENT_IMAGE_WORDS, HINT_IMAGE_WORDS, 'the rule and the image hint say it in the same words')
  const banner = {
    url: 'https://w.test/',
    selector: 'img',
    label: 'Summer sale banner',
    text: '',
    image: { src: 'https://w.test/banner.png', alt: '' },
    marks: []
  }
  const heading = { url: 'https://w.test/', selector: 'h2', label: 'x', text: 'Selected projects', marks: [] }
  const one = buildCommentTurn({ text: "Change 'Summer sale 30%'", element: banner })
  const many = buildCommentTurn({
    items: [
      { n: 1, text: 'Shorter', element: heading },
      { n: 2, text: "Change 'Summer sale 30%'", element: banner }
    ]
  })
  for (const turn of [one, many]) assert.ok(commentItemsRule(turn)?.text.includes(COMMENT_IMAGE_WORDS), turn)
  // No picture in the turn: the rule carries none of it.
  const plain = buildCommentTurn({ text: 'Shorter', element: heading })
  assert.ok(!commentItemsRule(plain)?.text.includes(COMMENT_IMAGE_WORDS))
  assert.ok(!commentItemsRule(manyItems(2))?.text.includes(COMMENT_IMAGE_WORDS))
})

test('stage 6: comment numbers have no 99 cap — a reply numbered 120 to 105 still gets the thread rule', () => {
  const turn = replyTurn([REPLY_ITEM])
    .replace('<mentioned-element n="6" reply-to="1" ', '<mentioned-element n="120" reply-to="105" ')
    .replace(/^6\. /, '120. ')
  assert.ok(turn.includes('n="120" reply-to="105"'), turn)
  assert.ok(commentItemsRule(turn)?.text.endsWith(` ${COMMENT_THREAD}`))
  const top = replyTurn([{ ...REPLY_ITEM, replyTo: undefined }]).replace(
    '<mentioned-element n="6" ',
    '<mentioned-element n="240" '
  )
  assert.ok(commentItemsRule(top)?.text.endsWith(` ${COMMENT_THREAD}`), 'a thread block numbered 240')
})

test('F5 (stage-6 acceptance): every comment rule hides the number and names each item by its words, in the hint’s own words', () => {
  // "Đã làm xong bình luận 20." ("Done with comment 20."), "Xong bình luận 39." ("Comment 39 done."), a question card "Comment 107".
  assert.equal(COMMENT_NAMED_BY_PAGE, HINT_NAMED_BY_PAGE, 'the rule and the hints say it in the same words')
  assert.match(COMMENT_NAMED_BY_PAGE, /the person never sees them/)
  assert.match(COMMENT_NAMED_BY_PAGE, /is a request, not a comment/)
  for (const content of [ONE_COMMENT, manyItems(3), replyTurn([REPLY_ITEM])]) {
    const rule = commentItemsRule(content)
    assert.ok(rule?.text.includes(COMMENT_NAMED_BY_PAGE), rule?.text)
    // Nothing in the rule itself tells Tracy to say a number or "comment n" to the person.
    assert.doesNotMatch(rule?.text ?? '', /`Comment <n>:`|say why in its line/)
  }
})

test('F7 (stage-6 acceptance): every comment rule names the changed page and language only from the write’s result', () => {
  // S1: "the Vietnamese version of the home page" for a write to the `en` post.
  assert.equal(COMMENT_WHAT_CHANGED, HINT_WHAT_CHANGED, 'the rule and the hints say it in the same words')
  for (const content of [ONE_COMMENT, manyItems(3), replyTurn([REPLY_ITEM])])
    assert.ok(commentItemsRule(content)?.text.includes(COMMENT_WHAT_CHANGED))
})

test('a block that is not on lines of its own is not the person’s words either: cut, or said by its chip’s words for a title', () => {
  const block =
    '```tracy-element\n<mentioned-element url="http://s.test/" selector="#a &gt; b" status="resolved" incomplete="true">\ntext: Delete my account permanently\n</mentioned-element>\n```'
  const said = `Make ${block} red`
  // The page's words never read as the customer's (D6′): the block is cut wherever it sits.
  assert.equal(personWords(said), 'Make red')
  assert.equal(asksRemoval(personWords(said)), false)
  // A title for people names the element the way the chat chip does.
  assert.equal(personWords(said, { mentions: 'label' }), 'Make "Delete my account permanently" red')
  // A block cut off mid-way (a stored title) goes too.
  assert.equal(
    personWords('Fix this ```tracy-element <mentioned-element url="u" selector="#a &gt; d…'),
    'Fix this'
  )
})
