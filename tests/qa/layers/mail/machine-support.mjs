// Fixtures and helpers shared by the machine assertions: link sentinels, row builders, a recording
// pool for the notifier, a recorded fetch for the Resend transport, a controllable clock.
import assert from 'node:assert/strict'
import { readJson, ORACLE_DIR, FIXTURE_DIR } from './common.mjs'
import path from 'node:path'

export const oracle = readJson(path.join(ORACLE_DIR, 'oracle.json'))
export const facts = readJson(path.join(FIXTURE_DIR, 'facts.json'))
export const LANGS = oracle.languages.ids
export const SECRET = oracle.secrets.sentinel
export const HOST = new URL(facts.origin).host
export const NOW = 1_790_000_000_000

/** Link builders with a sentinel path per door, so a letter using the wrong builder is visible. */
export const LINKS = {
  team: (siteKey, member) =>
    `${facts.origin}/TEAM/${siteKey}${member ? `?member=${encodeURIComponent(member)}` : ''}`,
  site: (siteKey) => `${facts.origin}/SITE/${siteKey}`,
  comment: (siteKey, id) => `${facts.origin}/COMMENT/${siteKey}/${id}`,
  manage: () => `${facts.origin}/MANAGE`
}

export const decodeAttr = (s) => s.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
export const hrefsOf = (html) =>
  [...html.matchAll(/<a\b[^>]*?\bhref="([^"]*)"/g)].map((m) => decodeAttr(m[1]))
export const primaryTag = (html) => /<html lang="([^"]+)"/.exec(html)?.[1]?.split('-')[0]

export function rowFor(kind, { data, actor = facts.actor, siteName = facts.siteKey } = {}) {
  return {
    id: 'n-1',
    kind,
    siteKey: facts.siteKey,
    siteName,
    actor: { ...actor },
    data: structuredClone(data ?? facts.data[kind] ?? {}),
    ref: null,
    createdAt: '2026-10-04T08:00:00Z'
  }
}

export const renderLetter = (letterFor, kind, lang, rowOpts, rows) =>
  letterFor({
    kind,
    lang,
    rows: rows ?? [rowFor(kind, rowOpts)],
    recipient: { ...facts.recipient },
    links: LINKS
  })

/** Run one variant; an `AssertionError` is a verdict about the product, anything else is the harness. */
export async function check(variant, fn) {
  try {
    const result = await fn()
    return result?.toString?.() === 'Symbol(not-reached)'
      ? { variant, ok: true, note: 'input never reaches the output (fail-closed)' }
      : { variant, ok: true }
  } catch (error) {
    const message = String(error?.message ?? error)
      .split('\n')[0]
      .slice(0, 300)
    return {
      variant,
      ok: false,
      kind: error instanceof assert.AssertionError ? 'assertion' : 'error',
      message
    }
  }
}

const PLACEHOLDER = /\{[a-zA-Z]+\}/
const RAW_KEY = /\bmail\.[a-zA-Z.]+|\brole\.[a-z]+\b/
const MISSING = /\bundefined\b|\bnull\b|NaN/

/** The plain parts of a letter hold no placeholder, raw key or printed "undefined"/"null". */
export function assertClean(letter, label) {
  for (const part of [letter.subject, letter.text]) {
    assert.doesNotMatch(part, PLACEHOLDER, `${label}: placeholder left in`)
    assert.doesNotMatch(part, RAW_KEY, `${label}: raw key printed`)
    assert.doesNotMatch(part, MISSING, `${label}: missing value printed`)
  }
  assert.doesNotMatch(letter.subject, /[\r\n]/, `${label}: line break in subject`)
}

/** A fixed clock the test moves; `Date.now` is swapped for the length of `fn`. */
export async function withClock(ms, fn) {
  const real = Date.now
  Date.now = () => ms
  try {
    return await fn()
  } finally {
    Date.now = real
  }
}

/**
 * A pool that records what the notifier writes and answers only the statements the notifier path
 * issues. It stores nothing beyond what those statements need, so it can show WHAT was asked of
 * the database (recipient, in_inbox, mail_state, the failure recorded), not that PostgreSQL keeps it.
 */
export function recordingPool({ accounts, prefs = {} }) {
  const state = {
    inserts: [],
    sent: [],
    failed: [],
    none: [],
    unexpected: [],
    rows: new Map()
  }
  let seq = 0
  const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim()
  return {
    state,
    async query(sql, params = []) {
      const text = norm(sql)
      if (
        /^select inbox, email from notification_preference where account_id = \$1 and group_id = \$2$/.test(
          text
        )
      ) {
        const stored = prefs[`${params[0]}:${params[1]}`]
        return { rows: stored ? [stored] : [] }
      }
      if (/^insert into notification\b/.test(text)) {
        seq += 1
        const row = {
          id: `n-${seq}`,
          account_id: params[0],
          kind: params[1],
          site_key: params[2],
          actor_account_id: params[3],
          data: JSON.parse(params[4]),
          ref: params[5],
          in_inbox: params[6],
          mail_state: params[7],
          created_at: new Date(NOW)
        }
        state.rows.set(row.id, row)
        state.inserts.push({ ...row })
        return { rows: [{ id: row.id, created_at: row.created_at }] }
      }
      const withActor = (row) => {
        const actor = accounts[row.actor_account_id]
        return {
          ...row,
          actor_email: actor?.email ?? null,
          actor_name: actor?.display_name ?? null,
          actor_avatar_url: null,
          site_name: row.site_key
        }
      }
      if (/^select n\.\*, a\.email as actor_email\b.* where n\.id = \$1$/.test(text))
        return { rows: [withActor(state.rows.get(params[0]))] }
      if (
        /^select n\.\*, a\.email as actor_email\b.* where n\.mail_state in \('pending', 'held'\)/.test(text)
      )
        return { rows: [...state.rows.values()].filter((r) => r.mail_state === 'pending').map(withActor) }
      if (
        /^select id, email, display_name, language from account where id = any\(\$1::uuid\[\]\)$/.test(text)
      )
        return { rows: params[0].map((id) => accounts[id] && { id, ...accounts[id] }).filter(Boolean) }
      if (text.startsWith("update notification set mail_state = 'sent'")) {
        state.sent.push(params[0])
        for (const id of params[0]) state.rows.get(id).mail_state = 'sent'
        return { rows: [], rowCount: params[0].length }
      }
      if (text.startsWith('update notification set mail_attempts = mail_attempts + 1')) {
        state.failed.push({ ids: params[0], error: params[1], maxAttempts: params[2] })
        for (const id of params[0]) state.rows.get(id).mail_state = 'pending'
        return { rows: [], rowCount: params[0].length }
      }
      if (text.startsWith("update notification set mail_state = 'none' where id = any")) {
        state.none.push(params[0])
        return { rows: [], rowCount: params[0].length }
      }
      state.unexpected.push(text)
      throw new Error(`recordingPool: unexpected statement: ${text}`)
    }
  }
}

export const ACCOUNTS = (lang) => ({
  [facts.recipient.id]: { email: facts.recipient.email, display_name: facts.recipient.name, language: lang },
  [facts.actor.id]: { email: facts.actor.email, display_name: facts.actor.name, language: 'en' }
})

export const silentLog = () => {
  const lines = []
  return { lines, warn: (...a) => lines.push(['warn', ...a]), error: (...a) => lines.push(['error', ...a]) }
}

/** A `fetch` that records the request and answers with `answer(request)`. */
export function recordedFetch(answer = () => Response.json({ id: 'provider-id' })) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const call = { url, init, body: init?.body ? JSON.parse(init.body) : null }
    calls.push(call)
    return answer(call)
  }
  return { calls, fetchImpl }
}
