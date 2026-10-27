// #1380: opening an invitation unsubscribe link (GET) must change nothing. The page shows a form
// the recipient presses; no script submits it, so a link scanner that runs page scripts cannot
// unsubscribe anyone. Runs without a database: the pool records every query it is handed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { invitationsUnsubscribeRoutes } from '../src/invitations/real-unsubscribe.js'

const origin = 'http://localhost:8080'
const token = 'A'.repeat(43)

function recordingPool() {
  const queries = []
  const query = async (text) => {
    queries.push(String(text?.text ?? text))
    return { rows: [], rowCount: 0 }
  }
  return { queries, query, connect: async () => ({ query, release() {} }) }
}

test('GET /invitations/unsubscribe/:token renders the form, runs no script and writes nothing', async () => {
  const pool = recordingPool()
  const app = invitationsUnsubscribeRoutes({ pool, keys: {}, log: { error() {} } })
  const res = await app.fetch(new Request(`${origin}/invitations/unsubscribe/${token}`))
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /<form id="unsubscribe-form" method="post" action="\/invitations\/unsubscribe\/A{43}">/)
  assert.match(html, /<button type="submit">Unsubscribe<\/button>/)
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /\.submit\(\)/)
  assert.deepEqual(pool.queries, [])
})
