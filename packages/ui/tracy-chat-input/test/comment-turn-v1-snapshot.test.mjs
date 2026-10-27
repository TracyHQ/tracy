/**
 * Comment turns already sitting in people's chat history must still parse: `comment-turn-v1.json`
 * holds the one-item turns as the builder writes them today, and the `-2809`, `-2909`,
 * `-2909-look`, `-2909-updated`, `-2909-alt`, `-2909-answered`, `-2909-lookundo`, `-2909-lang`,
 * `-2909-people`, `-2909-named` and `-2310-undoline` files the turns as they were sent before each hint change. The builder itself is
 * free to change its wording (no byte comparison); what must not change is what an old turn parses to.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  buildCommentTurn,
  COMMENT_ANSWER_ONE,
  COMMENT_NAMED_BY_PAGE,
  COMMENT_REPLY_LANGUAGE,
  COMMENT_WHAT_CHANGED,
  COMMENT_LOOK_SCOPE,
  COMMENT_WRITES_ONLY,
  parseCommentTurn
} from '../src/client/comment-turn.mjs'

const cases = JSON.parse(readFileSync(new URL('./fixtures/comment-turn-v1.json', import.meta.url), 'utf8'))
const sent2809 = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2809.json', import.meta.url), 'utf8')
)
const sent2909 = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2909.json', import.meta.url), 'utf8')
)
const sent2909look = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2909-look.json', import.meta.url), 'utf8')
)
const sent2909updated = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2909-updated.json', import.meta.url), 'utf8')
)
const sent2909alt = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2909-alt.json', import.meta.url), 'utf8')
)
const sent2909answered = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2909-answered.json', import.meta.url), 'utf8')
)
const sent2909lookundo = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2909-lookundo.json', import.meta.url), 'utf8')
)
const sent2909lang = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2909-lang.json', import.meta.url), 'utf8')
)
const sent2909people = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2909-people.json', import.meta.url), 'utf8')
)
const sent2909named = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2909-named.json', import.meta.url), 'utf8')
)
const sent2310undoline = JSON.parse(
  readFileSync(new URL('./fixtures/comment-turn-v1-2310-undoline.json', import.meta.url), 'utf8')
)

test('every recorded one-item turn still parses to one item carrying the old element field', () => {
  for (const [name, { turn }] of Object.entries(cases)) {
    const parsed = parseCommentTurn(turn)
    assert.ok(parsed, name)
    assert.equal(parsed.items?.length, 1, name)
    assert.equal(parsed.items[0].n, 1, name)
    assert.deepEqual(parsed.items[0].element, parsed.element, name)
    assert.equal(parsed.items[0].text, parsed.request, name)
  }
})

test('turns sent before 29/09 (no files sentence) or before RAISE 2 was lifted still parse to the same one item', () => {
  for (const [name, { turn }] of [
    ...Object.entries(sent2809),
    ...Object.entries(sent2909),
    ...Object.entries(sent2909look),
    ...Object.entries(sent2909updated),
    ...Object.entries(sent2909alt),
    ...Object.entries(sent2909answered),
    ...Object.entries(sent2909lookundo),
    ...Object.entries(sent2909lang),
    ...Object.entries(sent2909people),
    ...Object.entries(sent2909named),
    ...Object.entries(sent2310undoline)
  ]) {
    const old = parseCommentTurn(turn)
    const now = parseCommentTurn(cases[name].turn)
    assert.ok(old && now, name)
    // What the 2,000 → 2,500 limit (29/09, V3-H2) changes is how much of the element's selector and
    // text a long turn keeps; the item's identity — its number, the page, the name, the marks — and
    // the person's words read the same from an old turn and a new one.
    const identity = ({ n, text, element }) => ({
      n,
      text,
      url: element?.url,
      label: element?.label,
      marks: element?.marks
    })
    assert.deepEqual(old.items.map(identity), now.items.map(identity), name)
    assert.equal(old.request, now.request, name)
  }
})

test('every regenerated one-item turn that carries the full hint says the files sentence; the short form does not', () => {
  let full = 0
  for (const [name, { input }] of Object.entries(cases)) {
    const turn = buildCommentTurn(input)
    const hint = turn.slice(turn.lastIndexOf('\n') + 1)
    if (hint.startsWith('To change its words')) {
      full += 1
      assert.ok(hint.endsWith(`${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`), name)
    }
  }
  assert.ok(full >= 9)
})

test('every one-item hint asks for a natural answer in plain words, in the comment’s language — no reply line (stage 6, Rule 7)', () => {
  let short = 0
  for (const [name, { input }] of Object.entries(cases)) {
    const turn = buildCommentTurn(input)
    const hint = turn.slice(turn.lastIndexOf('\n') + 1)
    if (hint.startsWith('To change its words')) {
      assert.ok(
        hint.includes(
          ` ${COMMENT_ANSWER_ONE} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`
        ),
        name
      )
    } else {
      short += 1
      assert.ok(
        hint.endsWith(
          " Answer in plain words, in its language (`lang`), never naming it; no tool names, codes, ids or numbers; name what changed as the write's result does."
        ),
        name
      )
    }
    assert.doesNotMatch(
      hint,
      /✓ updated|✓ answered|End with one line|the word updated|Report what you did/,
      name
    )
  }
  assert.ok(short >= 1, 'the short form is held too')
})

test('the turns sent during stage 5 carried the reply line the regenerated ones no longer do', () => {
  for (const [name, { turn }] of Object.entries(sent2909people)) {
    assert.match(turn, /`- ✓ updated: …`|End with one line: `- ✓ updated/, name)
    assert.doesNotMatch(cases[name].turn, /✓ updated/, name)
  }
})

test('F5 + F7: the turns sent before the acceptance fix lacked the naming sentences the regenerated ones carry', () => {
  for (const [name, { turn }] of Object.entries(sent2909named)) {
    assert.ok(!turn.includes(COMMENT_NAMED_BY_PAGE) && !turn.includes(COMMENT_WHAT_CHANGED), name)
    const hint = cases[name].turn.slice(cases[name].turn.lastIndexOf('\n') + 1)
    assert.ok(
      hint.startsWith('To change its words')
        ? hint.includes(`${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED}`)
        : hint.includes('no tool names, codes, ids or numbers'),
      name
    )
  }
})

test('B7: the turns sent until 23/10/2026 asked for `Undo: look.revert <id>`; the regenerated ones say it in words', () => {
  for (const [name, { turn }] of Object.entries(sent2310undoline)) {
    if (!cases[name].turn.includes(COMMENT_LOOK_SCOPE)) continue
    assert.match(turn, /Undo: look\.revert/, name)
    assert.doesNotMatch(cases[name].turn, /Undo: look\.revert/, name)
  }
})
