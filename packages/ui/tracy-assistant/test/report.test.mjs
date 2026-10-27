/** The problem report (`src/client/report.ts`): when it is offered and what it may contain. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportText, wantsReport } from '../src/client/report.ts'
import { en } from '../src/client/strings.ts'
import { createHelp } from '../src/client/help.ts'

const t = (key) => en[key]
const env = {
  site: 'shop.tracy.site',
  sessionId: 'sess-9',
  userAgent: 'Mozilla/5.0 Test',
  now: new Date('2026-10-07T08:30:00Z'),
  timeZone: 'Asia/Ho_Chi_Minh'
}

test('wantsReport matches a request to report a problem in the interface languages, not a question about errors', () => {
  for (const yes of [
    'I want to report a bug',
    'report a problem please',
    'Tôi muốn báo lỗi',
    'Fehler melden',
    'je veux signaler un bug',
    'vorrei segnalare un problema',
    'ik wil een fout melden',
    '我想报告一个问题',
    'quiero reportar un error'
  ])
    assert.ok(wantsReport(yes), yes)
  for (const no of [
    'what is an error page?',
    'how do I undo a change?',
    'is my site published?',
    'giá bao nhiêu'
  ])
    assert.ok(!wantsReport(no), no)
})

test('the report holds the chosen fields and the person’s words, and "none" for what it does not know', () => {
  const text = reportText(env, 'the footer   phone  is wrong', t)
  assert.match(text, /^Problem report\nSite: shop\.tracy\.site\nTime: 2026-10-07 08:30 UTC/)
  assert.match(text, /Agent session: sess-9/)
  assert.match(text, /Browser: Mozilla\/5\.0 Test/)
  assert.match(text, /What went wrong: the footer phone is wrong$/)
  const bare = reportText({ ...env, site: null }, '', t)
  assert.match(bare, /Site: none/)
  assert.match(bare, /What went wrong: none/)
})

test('a long description is cut, and nothing but those fields is in the report', () => {
  const text = reportText(env, 'x'.repeat(5000), t)
  assert.ok(text.length < 900)
  assert.equal(text.split('\n').length, 6)
})

test('asking to report a problem puts a report on the row; an ordinary question does not', async () => {
  const rows = new Map()
  const fetch = async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })
  const help = createHelp({
    sessionId: 's1',
    rows: { upsert: (r) => rows.set(r.id, r), remove: (id) => rows.delete(id), tailSeq: () => 0 },
    fetch,
    site: () => 'shop.tracy.site',
    report: { t, env: () => ({ userAgent: 'UA', now: new Date('2026-10-07T00:00:00Z'), timeZone: 'UTC' }) }
  })
  help.ask('I want to report a bug: the menu is gone')
  help.ask('what is Site changes?')
  await new Promise((r) => setTimeout(r, 0))
  const list = [...rows.values()]
  assert.match(list[0].data.report, /Site: shop\.tracy\.site/)
  assert.match(list[0].data.report, /Agent session: s1/)
  assert.equal(list[1].data.report, undefined)
})
