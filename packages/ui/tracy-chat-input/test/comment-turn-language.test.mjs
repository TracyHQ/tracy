/**
 * F4 (stage-5 acceptance, 29/09, T7): a turn of one English and one Vietnamese comment got two
 * Vietnamese answers, and three English comments later in the same session were answered in
 * Vietnamese; one answer printed "Reply in English since they wrote English:". Each block now names
 * its comment's language when `messageLanguage` (`@tracy/core/language`) is sure (`lang="…"`, the head's LAST attribute, so
 * every reader that opens on `n` / `reply-to` is untouched), and the reply-language sentence is per
 * comment, names the language of the rest of the answer, and forbids narrating itself.
 * F14 (same acceptance): replies showed `NO_BROWSER` and "apply.revert with apply_id replace-…" to the
 * customer; the files sentence now forbids tool names, codes and ids and says how a content undo is said.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCommentTurn,
  COMMENT_REPLY_LANGUAGE,
  COMMENT_TURN_LIMIT,
  COMMENT_WRITES_ONLY,
  LOCATE_HINT,
  parseCommentTurn
} from '../src/client/comment-turn.mjs'

const ELEMENT = {
  url: 'http://capiwl1643.tracy.test:8080/',
  selector: 'p',
  label: 'Home › hero.eyebrow',
  text: 'Established 2004'
}
const LOCATE = {
  status: 'resolved',
  levels: [{ kind: 'field', id: 'c38#bd6/hero.eyebrow', label: 'Home › hero.eyebrow', writable: true }]
}
const heads = (/** @type {string} */ turn) =>
  turn.split('\n').filter((line) => line.startsWith('<mentioned-element') || line.startsWith('<page'))

test('F4: each block names its own comment’s language, last in its head', () => {
  const turn = buildCommentTurn({
    items: [
      { n: 40, text: 'Change this label to: EST. ALPHA', element: ELEMENT, locate: LOCATE },
      // Three elements (round 3: comments on ONE element share one block).
      {
        n: 41,
        text: 'Đổi chữ này thành: Thành lập 2004',
        element: { ...ELEMENT, selector: 'p.b' },
        locate: LOCATE
      },
      { n: 42, text: 'doi chu nay', element: { ...ELEMENT, selector: 'p.c' }, locate: LOCATE },
      {
        n: 43,
        text: 'Make this whole page calmer',
        element: null,
        url: 'http://capiwl1643.tracy.test:8080/about/'
      }
    ]
  })
  const [en, vi, unsure, page] = heads(turn)
  assert.match(en, /^<mentioned-element n="40" .* lang="en">$/)
  assert.match(vi, /^<mentioned-element n="41" .* lang="vi">$/)
  assert.doesNotMatch(unsure, /lang=/, 'not sure → no tag')
  assert.match(page, /^<page n="43" .* lang="en">$/)
})

test('F4: a reply is tagged by its own words, not by the thread before it', () => {
  const turn = buildCommentTurn({
    items: [
      {
        n: 46,
        text: 'I still want EST. ALPHA, keep it',
        element: ELEMENT,
        locate: LOCATE,
        replyTo: 43,
        thread: [{ author: 'capi-e2e-owner', at: 0, text: 'Đổi nhãn này thành: EST. ALPHA', status: 'done' }]
      }
    ],
    now: 60_000
  })
  assert.match(heads(turn)[0], /^<mentioned-element n="46" reply-to="43" .* lang="en">$/)
})

test('F4: a one-comment turn is tagged too', () => {
  const turn = buildCommentTurn({
    text: 'Change this label to: EST. ALPHA',
    element: ELEMENT,
    locate: LOCATE
  })
  assert.match(heads(turn)[0], / lang="en">$/)
})

test('F4: the tag changes nothing a reader gives back', () => {
  const items = [
    { n: 40, text: 'Change this label to: EST. ALPHA', element: ELEMENT, locate: LOCATE },
    { n: 41, text: 'Đổi chữ này thành: Thành lập 2004', element: ELEMENT, locate: LOCATE }
  ]
  const tagged = buildCommentTurn({ items })
  const untagged = tagged.replace(/ lang="[a-z]{2}">/g, '>')
  assert.notEqual(tagged, untagged)
  assert.deepEqual(parseCommentTurn(tagged), parseCommentTurn(untagged))
})

test('F4: the language sentence is per comment, names the rest of the answer’s language, and forbids narrating it', () => {
  assert.equal(
    COMMENT_REPLY_LANGUAGE,
    "Answer each item in the language it was written in (its block's `lang`, else its words) and the rest of your answer in the last item's, whatever this conversation or the site used before; never say which language you use or why."
  )
  const turn = buildCommentTurn({
    text: 'Change this label to: EST. ALPHA',
    element: ELEMENT,
    locate: LOCATE
  })
  assert.ok(turn.includes(COMMENT_REPLY_LANGUAGE))
  assert.doesNotMatch(COMMENT_REPLY_LANGUAGE, /person wrote/)
})

test('F14: the reply shows no tool name, code or id; a content undo is said in plain words', () => {
  assert.ok(
    COMMENT_WRITES_ONLY.endsWith(
      'In your reply use plain words: never a selector, id, mark, tool or action name, error code or receipt id (not `NO_BROWSER`, not `apply.revert`) — a change, a look change too, is undone by asking you, so say that.'
    )
  )
})

test('F4 + F14: the budget grew by what the full hint grew, plus one `lang` tag, so the page data keeps its room', () => {
  // 1,722: the full one-comment hint before (29/09 evening, G1); 3,087: the limit then; 10: ` lang="en"`.
  // Stage 6 changed the hint twice (Rule 7: 2,066 → 1,876; acceptance F5 + F7: → 2,569) and moved the
  // limit to hold this same page-data room (`comment-turn-people.test.mjs`).
  assert.equal(COMMENT_TURN_LIMIT - LOCATE_HINT.length, 3087 + 10 - 1722)
})

// Stage-6 acceptance e2e v4 (SEND-v4-new-9, 30/09): blocks for elements on /ru/ and /zh-cn/ read
// `lang="en"`. Checked: `lang` is the language of the PERSON'S WORDS (what the reply follows), never of
// the element or the page — those comments were written in English, and Tracy rightly answered in English
// (SEND-v4-new-8, 7 of 7). The page's own language is not what `lang` says.
test('SEND-v4-new-9: `lang` follows the person’s words, not the element’s text or the page’s language', () => {
  const ru = {
    url: 'http://e3sw0330.tracy.test/ru/',
    selector: 'h1',
    label: 'Heading',
    text: 'Строим основание для заводов нового поколения'
  }
  const zh = {
    url: 'http://e3sw0330.tracy.test/zh-cn/',
    selector: 'h1',
    label: 'Heading',
    text: '为新一代工厂奠定基础'
  }
  const turn = buildCommentTurn({
    items: [
      { n: 1, text: 'Make this heading shorter please', element: ru, locate: null },
      {
        n: 2,
        text: 'Сделайте этот заголовок короче, пожалуйста, ещё',
        element: { ...ru, selector: 'h2' },
        locate: null
      },
      { n: 3, text: 'Change the title to something calmer', element: zh, locate: null },
      { n: 4, text: '把这个标题改短一点', element: { ...zh, selector: 'h2' }, locate: null }
    ]
  })
  assert.deepEqual(
    heads(turn).map((h) => /lang="([a-z]+)"/.exec(h)?.[1]),
    ['en', 'ru', 'en', 'zh']
  )
})
