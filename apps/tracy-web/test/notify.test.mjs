// The notifier (spec #809): one row and one email per recipient, never the actor, the email in the
// recipient's language, a failed send kept owed and retried, settings honoured, and C2 replies of
// one thread grouped into one email while a five-minute window is open.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createNotifier } from '../src/notifications/notify.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

// One migrated database for the file, emptied before each test (`fileDb` in `_db.mjs`): a fresh schema
// per test re-ran all of the migrations for every test.
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

async function world(t, { fail = false, preferenceFor } = {}) {
  const { pool } = db
  const sent = []
  let failing = fail
  const notifier = createNotifier({
    pool,
    send: async (mail) => {
      if (failing) throw new Error('resend down')
      sent.push(mail)
    },
    letterFor: ({ kind, lang, rows }) => ({
      subject: `${kind}:${lang}:${rows.length}`,
      text: 't',
      html: '<p>h</p>'
    }),
    ...(preferenceFor ? { preferenceFor } : {}),
    log: { warn() {}, error() {} }
  })
  const account = async (email, language = null) =>
    (
      await pool.query('insert into account (email, language) values ($1, $2) returning id', [
        email,
        language
      ])
    ).rows[0].id
  return { pool, notifier, sent, account, heal: () => (failing = false) }
}

test('one row and one email per recipient, never the actor, in the recipient language', opts, async (t) => {
  const { pool, notifier, sent, account } = await world(t)
  const lee = await account('lee@lab3.example', 'de')
  const akemi = await account('akemi@lab3.example', 'vi')
  const ids = await notifier.notify({
    recipients: [lee, akemi, akemi],
    kind: 'team.joined',
    actor: akemi,
    siteKey: 'kinetic.vn'
  })
  assert.equal(ids.length, 1)
  assert.deepEqual(
    sent.map((m) => [m.to, m.subject]),
    [['lee@lab3.example', 'team.joined:de:1']]
  )
  const { rows } = await pool.query('select mail_state from notification')
  assert.deepEqual(
    rows.map((r) => r.mail_state),
    ['sent']
  )
})

test("mail: 'none' writes the Inbox row and sends nothing", opts, async (t) => {
  const { pool, notifier, sent, account } = await world(t)
  const vincent = await account('vincent@lab3.example')
  await notifier.notify({ recipients: [vincent], kind: 'team.invited', mail: 'none' })
  assert.equal(sent.length, 0)
  assert.equal((await pool.query(`select mail_state from notification`)).rows[0].mail_state, 'none')
})

test('a failed send stays owed and goes out on a later sweep', opts, async (t) => {
  const { pool, notifier, sent, account, heal } = await world(t, { fail: true })
  const lee = await account('lee@lab3.example')
  await notifier.notify({ recipients: [lee], kind: 'team.left' })
  let row = (await pool.query('select * from notification')).rows[0]
  assert.equal(row.mail_state, 'pending')
  assert.equal(row.mail_attempts, 1)
  heal()
  await pool.query("update notification set mail_due_at = now() - interval '1 second'")
  await notifier.deliverDue()
  row = (await pool.query('select * from notification')).rows[0]
  assert.equal(row.mail_state, 'sent')
  assert.equal(sent.length, 1)
})

test(
  'settings: Inbox off hides the row, email off sends nothing, both off writes nothing',
  opts,
  async (t) => {
    const prefs = new Map()
    const { pool, notifier, sent, account } = await world(t, {
      preferenceFor: async (_pool, id) => prefs.get(id) ?? { inbox: true, email: true }
    })
    const [a, b, c] = [await account('a@x.y'), await account('b@x.y'), await account('c@x.y')]
    prefs.set(a, { inbox: false, email: true })
    prefs.set(b, { inbox: true, email: false })
    prefs.set(c, { inbox: false, email: false })
    await notifier.notify({ recipients: [a, b, c], kind: 'comment.mention' })
    const { rows } = await pool.query(
      'select account_id, in_inbox, mail_state from notification order by account_id'
    )
    assert.equal(rows.length, 2)
    assert.equal(rows.find((r) => r.account_id === a).in_inbox, false)
    assert.equal(rows.find((r) => r.account_id === b).mail_state, 'none')
    assert.deepEqual(
      sent.map((m) => m.to),
      ['a@x.y']
    )
  }
)

test('C2: replies of one thread inside the window are held, then sent as one email', opts, async (t) => {
  const { pool, notifier, sent, account } = await world(t)
  const akemi = await account('akemi@lab3.example')
  const event = { recipients: [akemi], kind: 'comment.reply', ref: 'thread:9', group: { windowMinutes: 5 } }
  await notifier.notify(event)
  await notifier.notify(event)
  await notifier.notify(event)
  assert.equal(sent.length, 1, 'the first reply mails at once')
  const held = (await pool.query(`select count(*)::int as n from notification where mail_state = 'held'`))
    .rows[0].n
  assert.equal(held, 2)
  await pool.query(
    `update notification set mail_due_at = now() - interval '1 second' where mail_state = 'held'`
  )
  await notifier.deliverDue()
  assert.deepEqual(
    sent.map((m) => m.subject),
    ['comment.reply:en:1', 'comment.reply:en:2']
  )
})
