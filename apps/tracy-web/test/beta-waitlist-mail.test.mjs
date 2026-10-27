/**
 * Spam audit 05/10/2026 — the whitelist letter a refused sign-in gets.
 *
 * Gmail sent "Join the Tracy whitelist" to Spam while the sign-in code reached the Inbox. Two of
 * the causes sit in the queue rather than the template: every sign-in attempt mailed the same
 * letter again (six to one address within minutes), and the WordPress link carried the reader's
 * own address as `?email=`. This file holds both shut.
 *
 * WHAT THIS FILE RUNS. The real `createBetaLogin` in memory (no pool) and the real `betaMail`,
 * over a recorded transport and a fixed clock. WHAT IT DOES NOT: no PostgreSQL (the pool path
 * counts the same bucket through `overLimit`), no mail provider.
 *
 *   node --test apps/tracy-web/test/beta-waitlist-mail.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createBetaLogin } from '../src/lib/beta-login.js'
import { createOpsSignal } from '../src/lib/ops-signal.js'
import * as emails from '../src/mail/emails.js'

function harness(waitlistMode, { deliveryFails = false, admission = { status: 'deny' } } = {}) {
  const sent = []
  const codes = []
  const signal = createOpsSignal({ pool: null, config: { environment: 'dev' }, log: { warn() {} } })
  let clock = Date.UTC(2026, 9, 5, 8, 0, 0)
  const login = createBetaLogin({
    access: { decide: async () => admission },
    identity: { putCode: async (code) => void codes.push(code), deleteCode: async () => {} },
    mail: {
      send: async (m) => {
        sent.push(m)
        if (typeof deliveryFails === 'function' ? deliveryFails(sent.length) : deliveryFails)
          throw new Error('DELIVERY_FAILED')
      },
      betaMail: emails.betaMail,
      signInCodeMail: emails.signInCodeMail
    },
    otp: { generateCode: () => String(100000 + codes.length), hashCode: async (code) => code },
    config: {
      sessionSecret: 's'.repeat(32),
      beta: { waitlistMode, waitlistUrl: 'https://tracy.ai/whitelist/' }
    },
    signal,
    now: () => clock,
    log: { warn() {} }
  })
  return { login, sent, codes, events: signal.events, advance: (ms) => (clock += ms) }
}

test('the whitelist letter links to the bare whitelist page, never to the reader’s address', async () => {
  const { login, sent } = harness('wordpress')
  await login.sendOutcome('reader@example.com', { status: 'deny' }, 'email code', 'r1')
  assert.equal(sent.length, 1)
  assert.ok(sent[0].text.includes('https://tracy.ai/whitelist/'))
  assert.doesNotMatch(sent[0].text + sent[0].html, /reader|%40|email=/)
})

test('one whitelist letter per address per day; the next day mails again', async () => {
  const { login, sent, advance } = harness('wordpress')
  for (const id of ['r1', 'r2', 'r3'])
    await login.sendOutcome('reader@example.com', { status: 'deny' }, 'email code', id)
  assert.equal(sent.length, 1)
  // Another address is its own count.
  await login.sendOutcome('other@example.com', { status: 'deny' }, 'email code', 'r4')
  assert.equal(sent.length, 2)
  advance(86_400_000)
  await login.sendOutcome('reader@example.com', { status: 'deny' }, 'email code', 'r5')
  assert.equal(sent.length, 3)
})

test('the "could not check yet" letter is counted apart from the whitelist one', async () => {
  const { login, sent } = harness('wordpress')
  await login.sendOutcome('reader@example.com', { status: 'deny' }, 'email code', 'r1')
  await login.sendOutcome('reader@example.com', { status: 'unavailable' }, 'email code', 'r2')
  assert.equal(sent.length, 2)
  assert.notEqual(sent[0].subject, sent[1].subject)
})

test('S-B1: every blocked decision records once even when waitlist mail is throttled or retried', async () => {
  const { login, sent, events } = harness('wordpress')
  try {
    for (const id of ['attempt-1', 'attempt-2', 'attempt-2'])
      await login.sendOutcome('reader@example.com', { status: 'deny' }, 'email code', id)
    assert.equal(sent.length, 1, 'mail remains limited to one per day')
    assert.equal(events.filter((event) => event.kind === 'beta.waitlist').length, 2)
  } finally {
    await login.stop()
  }
})

test('S-B1: blocked decisions survive mail delivery failure and the throttled retry', async () => {
  const { login, sent, events } = harness('wordpress', { deliveryFails: true })
  try {
    await assert.rejects(
      login.sendOutcome('reader@example.com', { status: 'deny' }, 'email code', 'attempt-1'),
      /DELIVERY_FAILED/
    )
    await login.sendOutcome('reader@example.com', { status: 'deny' }, 'email code', 'attempt-1')
    await login.sendOutcome('reader@example.com', { status: 'deny' }, 'Google', 'attempt-2')
    assert.equal(sent.length, 1, 'the failed delivery still consumes its mail bucket')
    assert.equal(events.filter((event) => event.kind === 'beta.waitlist').length, 2)
  } finally {
    await login.stop()
  }
})

test('S-B1: rapid queued attempts by the same address preserve distinct blocked decisions', async () => {
  const { login, sent, events } = harness('wordpress')
  try {
    await login.enqueue('reader@example.com', 'email code')
    await login.enqueue('reader@example.com', 'GitHub')
    await login.drain()
    assert.equal(sent.length, 1)
    assert.equal(events.filter((event) => event.kind === 'beta.waitlist').length, 2)
  } finally {
    await login.stop()
  }
})

test('S-B1: rapid allowed requests by one email send only the latest sign-in code', async () => {
  const { login, sent, codes } = harness('wordpress', { admission: { status: 'allow' } })
  try {
    await login.enqueue('reader@example.com', 'email code', 'en', { medium: 'old' })
    await login.enqueue('reader@example.com', 'email code', 'en', { medium: 'latest' })
    await login.drain()
    assert.equal(sent.length, 1)
    assert.equal(codes.length, 1)
    assert.equal(codes[0].admission.source.medium, 'latest')
  } finally {
    await login.stop()
  }
})

test('S-B1: older allowed delivery retry cannot replace the code from a completed newer request', async () => {
  const { login, sent, codes, advance } = harness('wordpress', {
    admission: { status: 'allow' },
    deliveryFails: (attempt) => attempt === 1
  })
  try {
    await login.enqueue('reader@example.com', 'email code')
    await login.drain()
    assert.equal(sent.length, 1, 'the old delivery failed once and is queued for retry')
    await login.enqueue('reader@example.com', 'email code')
    await login.drain()
    assert.equal(sent.length, 2, 'the newer request delivered its own code')
    const current = codes.at(-1).codeHash
    advance(30000)
    await login.drain()
    assert.equal(sent.length, 2, 'the superseded retry must send nothing')
    assert.equal(codes.at(-1).codeHash, current, 'the latest delivered code remains valid')
  } finally {
    await login.stop()
  }
})
