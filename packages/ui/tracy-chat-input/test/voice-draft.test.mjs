/**
 * Voice input's words in the draft (`voice-draft.mjs`): shown live at the caret, replaced as the
 * service revises them, never written over the person's own typing, and taken back out by Cancel.
 * A fake editor plays dsh's `inputActions`: a plain string, a revision that moves with content only,
 * and `insertText` refused once the revision is not the caller's.
 *
 *   node --test packages/ui/tracy-chat-input/test/voice-draft.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { draftWriter, glue, spokenText } from '../src/client/voice-draft.mjs'

/** dsh's composer, as far as the writer touches it. */
function editor(text = '', caret = text.length, selectionEnd = caret) {
  const state = { text, rev: 0, caret, selectionEnd, edits: 0 }
  return {
    state,
    actions: {
      captureInsertion: () => ({ start: state.caret, end: state.selectionEnd, draftRev: state.rev }),
      insertText(words, span) {
        if (span.draftRev !== state.rev) return false
        state.text = state.text.slice(0, span.start) + words + state.text.slice(span.end)
        state.caret = state.selectionEnd = span.start + words.length
        state.rev += 1
        state.edits += 1
        return true
      }
    },
    /** The person types at the end. */
    type(more) {
      state.text += more
      state.rev += 1
    }
  }
}

test('phrases join with a space, except in scripts written without one and before closing punctuation', () => {
  assert.equal(
    spokenText(['Make the hero darker.'], 'and add a button'),
    'Make the hero darker. and add a button'
  )
  assert.equal(spokenText([' Xin chào. ', ''], '  '), 'Xin chào.')
  assert.equal(spokenText(['你好。'], '我想改标题'), '你好。我想改标题')
  assert.equal(spokenText(['こんにちは'], 'ボタンを追加'), 'こんにちはボタンを追加')
  assert.equal(glue('done', ', thanks'), 'done, thanks')
  assert.equal(spokenText([], ''), '')
})

test('the words show at the caret and each revision replaces the last one in place', () => {
  const ed = editor('Please ')
  const writer = draftWriter(ed.actions, ed.state.text)
  assert.equal(writer.show('make'), true)
  assert.equal(ed.state.text, 'Please make')
  writer.show('make the hero')
  writer.show('Make the hero darker.')
  assert.equal(ed.state.text, 'Please Make the hero darker.')
  assert.equal(writer.wrote, true)
})

test('one space is put before words that follow a word, and after when text follows the caret', () => {
  const ed = editor('Hello world', 5)
  const writer = draftWriter(ed.actions, ed.state.text)
  writer.show('there')
  assert.equal(ed.state.text, 'Hello there world')
  writer.show('')
  assert.equal(ed.state.text, 'Hello world', 'Cancel gives back the draft exactly')
})

test('an unchanged text is not written again: no extra edit, no extra undo step', () => {
  const ed = editor()
  const writer = draftWriter(ed.actions, '')
  writer.show('hello')
  writer.show('hello')
  assert.equal(ed.state.edits, 1)
})

test('a selection is never replaced: the words go after it, and Cancel leaves it whole', () => {
  const ed = editor('keep this text', 5, 9)
  const writer = draftWriter(ed.actions, ed.state.text)
  writer.show('spoken')
  assert.equal(ed.state.text, 'keep this spoken text')
  writer.show('')
  assert.equal(ed.state.text, 'keep this text')
})

test('the person typed in between: the writer stops for good and never writes over them', () => {
  const ed = editor('')
  const writer = draftWriter(ed.actions, '')
  writer.show('first words')
  ed.type(' and my own')
  assert.equal(writer.show('first words and more'), false)
  assert.equal(writer.detached, true)
  assert.equal(writer.show('anything'), false)
  assert.equal(ed.state.text, 'first words and my own')
})

test('detach stops the writer and keeps what is shown', () => {
  const ed = editor('')
  const writer = draftWriter(ed.actions, '')
  writer.show('kept')
  writer.detach()
  assert.equal(writer.show(''), false)
  assert.equal(ed.state.text, 'kept')
})
