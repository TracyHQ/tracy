import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HELP_ROW_KIND, sentFromChatBox } from '../src/client/start-sent.mjs'

const help = (variant) => ({ kind: HELP_ROW_KIND, data: { variant } })

test('nothing sent: no count, no rows', () => {
  assert.equal(sentFromChatBox(undefined, []), false)
  assert.equal(sentFromChatBox({}, []), false)
  assert.equal(sentFromChatBox({ sent: 0 }, []), false)
})

test("dsh's sent count (a message or any / command) ends the start screen", () => {
  assert.equal(sentFromChatBox({ sent: 1 }, []), true)
  assert.equal(sentFromChatBox({ sent: 7 }, []), true)
})

test('after a reload the count is 0, and a Help question or a bare /help still stands for it', () => {
  assert.equal(sentFromChatBox({ sent: 0 }, [help('turn')]), true)
  assert.equal(sentFromChatBox({ sent: 0 }, [help('greeting')]), true)
})

test('the one-time tip is not something the person sent; rows of another kind do not count', () => {
  assert.equal(sentFromChatBox({ sent: 0 }, [help('tip')]), false)
  assert.equal(sentFromChatBox({ sent: 0 }, [{ kind: 'other-plugin', data: { variant: 'turn' } }]), false)
  assert.equal(sentFromChatBox({ sent: 0 }, [help('tip'), help('turn')]), true)
})
