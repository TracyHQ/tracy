// How long a voice turn took (`src/client/voice-trace.mjs`): which spans leave the page, and how they
// are sent so a page closing still sends them, never in the person's way.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  TRACE_FLAGS,
  TRACE_PATH,
  TRACE_SPANS,
  sendTrace,
  traceId,
  traceRecord
} from '../src/client/voice-trace.mjs'

const marks = (over = {}) => ({
  id: 't-1',
  speechEnd: 1000,
  commit: 1650,
  sent: 2000,
  ack: 2100.4,
  ackCached: true,
  reply: 4500,
  replyLine: 'Done: the button is green.',
  error: false,
  interrupted: false,
  pressed: false,
  ...over
})

test('a turn is its spans between marks of one clock, whole milliseconds, and its flags as 0 or 1 — nothing else', () => {
  const record = traceRecord(marks())
  assert.deepEqual(record, {
    id: 't-1',
    speechToCommit: 650,
    commitToSent: 350,
    sentToAck: 100,
    sentToReply: 2500,
    speechToReply: 3500,
    ackCached: 1,
    error: 0,
    interrupted: 0,
    pressed: 0
  })
  assert.deepEqual(Object.keys(record), ['id', ...TRACE_SPANS, ...TRACE_FLAGS])
  assert.ok(!JSON.stringify(record).includes('green'), 'the words never leave with it')
})

test('a mark never reached leaves its spans out; marks out of order are no span; an error is never also “cut off”', () => {
  const cut = traceRecord(marks({ reply: null, interrupted: true }))
  assert.equal('sentToReply' in cut, false)
  assert.equal('speechToReply' in cut, false)
  assert.equal(cut.interrupted, 1)
  const unsent = traceRecord(marks({ sent: null, ack: null, reply: null, error: true, interrupted: true }))
  assert.deepEqual(unsent, {
    id: 't-1',
    speechToCommit: 650,
    ackCached: 0,
    error: 1,
    interrupted: 0,
    pressed: 0
  })
  assert.equal('speechToCommit' in traceRecord(marks({ commit: 900 })), false, 'before the speech ended')
  assert.equal(traceRecord(marks({ ack: null })).ackCached, 0, 'no "got it" heard: nothing cached to say')
  assert.equal(traceRecord(marks({ speechEnd: null })).speechToReply, undefined)
  assert.notEqual(traceId(), traceId())
})

test('sent with a fetch that outlives the page; by sendBeacon when that fetch cannot go; never throws', async () => {
  const calls = []
  sendTrace(
    { id: 'a', speechToReply: 1200 },
    {
      fetchImpl: async (url, init) => {
        calls.push({ url, init })
        return new Response(null, { status: 204 })
      },
      beacon: () => assert.fail('the fetch went')
    }
  )
  assert.equal(calls[0].url, TRACE_PATH)
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.keepalive, true)
  assert.equal(calls[0].init.credentials, 'same-origin')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].init.body), { id: 'a', speechToReply: 1200 })
  const beacons = []
  const beacon = (url, body) => beacons.push({ url, body }) > 0
  sendTrace({ id: 'b' }, { fetchImpl: async () => Promise.reject(new TypeError('offline')), beacon })
  await new Promise((resolve) => setImmediate(resolve))
  sendTrace(
    { id: 'c' },
    {
      fetchImpl: () => {
        throw new TypeError('keepalive refused')
      },
      beacon
    }
  )
  assert.deepEqual(
    beacons.map((b) => [b.url, JSON.parse(b.body).id]),
    [
      [TRACE_PATH, 'b'],
      [TRACE_PATH, 'c']
    ]
  )
  assert.doesNotThrow(() =>
    sendTrace(
      { id: 'd' },
      {
        fetchImpl: () => {
          throw new Error('x')
        },
        beacon: () => {
          throw new Error('y')
        }
      }
    )
  )
})
