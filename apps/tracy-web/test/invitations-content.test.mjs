import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Hono } from 'hono'
import { invitationsRoutes } from '../src/invitations/route.js'

// Only the storage boundary is replaced. Requests exercise the real authorization,
// revision checks, content validation, renderer and draft transitions.
function fixture() {
  const suppressions = new Set()
  const aliases = []
  let saved = {
    id: randomUUID(),
    name: 'Content fixture',
    revision: 0,
    data: {
      audit: [],
      recipients: Array.from({ length: 5 }, (_, i) => ({
        id: randomUUID(),
        email: `friend${i}@fixture.test`,
        identities: [],
        firstName: 'Sandbox Friend',
        group: `group_${i + 1}`,
        state: 'ready',
        draft: null,
        attempts: [],
        messages: []
      }))
    }
  }
  const query = async (sql, values = []) => {
    if (sql.startsWith('select * from invitations_sandbox_campaign'))
      return { rows: saved.id === values[0] ? [structuredClone(saved)] : [] }
    if (sql === 'select clock_timestamp() as now') return { rows: [{ now: new Date() }] }
    if (
      sql ===
      "select distinct data->'sourceCheck'->>'scopeId' as id from invitations_sandbox_campaign where data ? 'sourceCheck'"
    )
      return { rows: [] }
    if (sql.startsWith('with recursive linked(identity)')) {
      assert.equal(values.length, 1)
      assert.ok(Array.isArray(values[0]))
      const identities = new Set(values[0])
      for (const identity of identities)
        for (const [a, b] of aliases) {
          if (a === identity) identities.add(b)
          if (b === identity) identities.add(a)
        }
      return { rows: [...identities].map((identity) => ({ identity })) }
    }
    if (sql === 'select 1 from invitations_sandbox_suppression where identity=any($1::text[]) limit 1') {
      assert.equal(values.length, 1)
      assert.ok(Array.isArray(values[0]))
      const rowCount = Number(values[0].some((identity) => suppressions.has(identity)))
      return { rows: rowCount ? [{ '?column?': 1 }] : [], rowCount }
    }
    throw new Error(`Unexpected pool query: ${sql}`)
  }
  const pool = {
    query,
    async connect() {
      let pending
      return {
        release() {},
        async query(sql, values = []) {
          if (
            sql === 'begin' ||
            sql === 'rollback' ||
            sql.startsWith('set local ') ||
            sql.includes('pg_advisory_xact_lock')
          )
            return { rows: [] }
          if (sql === 'commit') {
            if (pending) saved = pending
            return { rows: [] }
          }
          if (sql.startsWith('update invitations_sandbox_campaign')) {
            assert.equal(values[0], saved.id)
            pending = { ...saved, revision: values[1], data: structuredClone(values[2]) }
            return { rows: [] }
          }
          return query(sql, values)
        }
      }
    }
  }
  function app(role = 'owner', enabled = true) {
    const app = new Hono()
    app.route(
      '/api/ops/invitations',
      invitationsRoutes({
        pool,
        config: { invitationsSandbox: enabled },
        admit: async () => ({ email: 'owner@fixture.test', role })
      })
    )
    return app
  }
  return {
    get saved() {
      return structuredClone(saved)
    },
    seed(update) {
      update(saved.data)
    },
    suppress(identity, links = []) {
      suppressions.add(identity)
      aliases.push(...links)
    },
    async request(path, input = {}, options = {}) {
      const response = await app(options.role, options.enabled).request(
        `http://localhost/api/ops/invitations/${saved.id}${path}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: options.origin ?? 'http://localhost' },
          body: JSON.stringify({ revision: saved.revision, ...input })
        }
      )
      const text = await response.text()
      return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : text }
    }
  }
}
const content = (group = 'group_1') => ({
  group,
  subject: `[Sandbox] Hello {{first_name}}: ${group}`,
  bodyText: `Hello {{first_name}},\nFictional invitation for {{group}}.\nhttps://invitations.invalid/sandbox\nReply STOP.`
})
async function save(f, group = 'group_1', overrides = {}) {
  const result = await f.request('/content', { ...content(group), ...overrides })
  assert.equal(result.status, 200)
  return result.body
}

test('content versions persist independently across five groups and preview is read-only', async () => {
  const f = fixture()
  for (let i = 1; i <= 5; i++) await save(f, `group_${i}`)
  const original = f.saved
  for (const recipient of original.data.recipients) {
    const result = await f.request('/content-preview', { group: recipient.group, recipientId: recipient.id })
    assert.equal(result.status, 200)
    assert.deepEqual(result.body, {
      subject: `[Sandbox] Hello Sandbox Friend: ${recipient.group}`,
      bodyText: `Hello Sandbox Friend,\nFictional invitation for ${recipient.group}.\nhttps://invitations.invalid/sandbox\nReply STOP.`,
      group: recipient.group,
      templateVersion: 1
    })
  }
  assert.deepEqual(f.saved, original)
  await save(f, 'group_1', { subject: 'Revised fictional invitation' })
  const stored = f.saved.data.content
  assert.equal(stored.length, 5)
  assert.equal(stored[0].activeVersion, 2)
  assert.deepEqual(stored[0].versions[0], original.data.content[0].versions[0])
  assert.equal(stored[0].versions[1].version, 2)
  assert.ok(Date.parse(stored[0].versions[1].createdAt))
  assert.deepEqual(stored.slice(1), original.data.content.slice(1))
  const generated = await f.request('/generate')
  assert.equal(generated.status, 200)
  assert.equal(generated.body.recipients[0].draft.subject, 'Revised fictional invitation')
  for (const recipient of generated.body.recipients.slice(1)) {
    assert.equal(recipient.draft.subject, `[Sandbox] Hello Sandbox Friend: ${recipient.group}`)
    assert.equal(recipient.draft.templateGroup, recipient.group)
    assert.equal(recipient.draft.templateVersion, 1)
  }
})

test('generation requires assigned content atomically and uses the preview renderer', async () => {
  const f = fixture()
  const before = f.saved
  assert.deepEqual(await f.request('/generate'), { status: 409, body: { code: 'template_required' } })
  assert.equal(
    (await f.request('/content-preview', { group: 'group_1', recipientId: before.data.recipients[0].id }))
      .body.code,
    'template_required'
  )
  assert.deepEqual(f.saved, before)
  await save(f)
  const partial = f.saved
  assert.equal((await f.request('/generate')).body.code, 'template_required')
  assert.deepEqual(f.saved, partial)
  const preview = (
    await f.request('/content-preview', { group: 'group_1', recipientId: f.saved.data.recipients[0].id })
  ).body
  const generated = await f.request('/generate', { group: 'group_1' })
  assert.equal(generated.status, 200)
  const draft = generated.body.recipients[0].draft
  assert.equal(draft.subject, preview.subject)
  assert.equal(draft.bodyText, preview.bodyText)
  assert.equal(draft.templateGroup, 'group_1')
  assert.equal(draft.templateVersion, 1)
  assert.ok(generated.body.recipients.slice(1).every((r) => r.draft === null))
  const saved = f.saved
  for (const input of [{ group: null }, { group: 'group_6' }, { replaceExisting: 'true' }]) {
    assert.equal((await f.request('/generate', input)).status, 400)
    assert.deepEqual(f.saved, saved)
  }
})

test('template edits and default generation preserve approved custom drafts; explicit replacement resets approval', async () => {
  const f = fixture()
  await save(f)
  await f.request('/generate', { group: 'group_1' })
  const rid = f.saved.data.recipients[0].id
  await f.request(`/recipients/${rid}/draft`, {
    subject: 'Personal fixture',
    bodyText: 'Personal fictional text'
  })
  let draft = f.saved.data.recipients[0].draft
  assert.equal(draft.templateVersion, 1)
  assert.equal(draft.templateGroup, 'group_1')
  await f.request(`/recipients/${rid}/approve`, { contentHash: draft.contentHash })
  draft = f.saved.data.recipients[0].draft
  assert.equal(draft.approved, true)
  await save(f, 'group_1', { subject: 'New group content' })
  assert.deepEqual(f.saved.data.recipients[0].draft, draft)
  await f.request('/generate', { group: 'group_1' })
  assert.deepEqual(f.saved.data.recipients[0].draft, draft)
  const result = await f.request('/generate', { group: 'group_1', replaceExisting: true })
  assert.equal(result.status, 200)
  const replacement = f.saved.data.recipients[0].draft
  assert.equal(replacement.subject, 'New group content')
  assert.equal(replacement.approved, false)
  assert.equal(replacement.approval, undefined)
  assert.equal(replacement.templateVersion, 2)
  assert.equal(replacement.revision, draft.revision + 1)
})

test('regeneration and customization leave blocked recipients and any attempted snapshot untouched', async () => {
  const f = fixture()
  await save(f)
  const states = [
    'suppressed',
    'conflict',
    'review',
    'simulated',
    'duplicate',
    'sent',
    'send_unknown',
    'future_state'
  ]
  f.seed((data) => {
    const first = data.recipients[0]
    data.recipients = [...states, 'ready', 'draft'].map((state, i) => ({
      ...structuredClone(first),
      id: randomUUID(),
      state,
      draft: {
        subject: 'Existing fixture',
        bodyText: 'Saved text',
        revision: 3,
        approved: true,
        contentHash: 'saved'
      },
      attempts:
        i >= states.length
          ? [{ id: randomUUID(), state: 'sent', snapshot: { subject: 'Immutable sent snapshot' } }]
          : []
    }))
  })
  const old = f.saved.data.recipients
  const result = await f.request('/generate', { replaceExisting: true })
  assert.equal(result.status, 200)
  assert.deepEqual(f.saved.data.recipients, old)
  for (const recipient of old) {
    const edited = await f.request(`/recipients/${recipient.id}/draft`, {
      subject: 'Changed',
      bodyText: 'Changed fixture'
    })
    assert.equal(edited.status, 409)
    assert.equal(
      (await f.request(`/recipients/${recipient.id}/approve`, { contentHash: recipient.draft.contentHash }))
        .status,
      409
    )
  }
  assert.deepEqual(f.saved.data.recipients, old)
})

test('generation rechecks program suppression before creating an otherwise ready draft', async () => {
  const f = fixture()
  const untouched = f.saved.data.recipients.slice(1)
  const recipient = f.saved.data.recipients[0]
  f.suppress('email:earlier@fixture.test', [
    [`email:${recipient.email}`, 'member:sandbox-shared'],
    ['member:sandbox-shared', 'email:earlier@fixture.test']
  ])
  // A suppressed recipient needs no content and cannot receive a generated draft.
  const result = await f.request('/generate', { group: 'group_1' })
  assert.equal(result.status, 200)
  assert.equal(result.body.recipients[0].state, 'suppressed')
  assert.equal(result.body.recipients[0].draft, null)
  assert.deepEqual(result.body.recipients.slice(1), untouched)
})

test('generation clears approval after program suppression while preserving draft content and provenance', async () => {
  for (const replaceExisting of [false, true]) {
    const f = fixture()
    await save(f)
    await f.request('/generate', { group: 'group_1' })
    const recipient = f.saved.data.recipients[0]
    const approved = await f.request(`/recipients/${recipient.id}/approve`, {
      contentHash: recipient.draft.contentHash
    })
    assert.equal(approved.status, 200)
    const before = f.saved.data.recipients[0]
    f.suppress(`email:${recipient.email}`)
    await save(f, 'group_1', { subject: 'Replacement must not be used' })
    const result = await f.request('/generate', { group: 'group_1', replaceExisting })
    assert.equal(result.status, 200)
    const { approval: _approval, ...draft } = before.draft
    assert.deepEqual(result.body.recipients[0], {
      ...before,
      state: 'suppressed',
      draft: { ...draft, approved: false }
    })
  }
})

test('individual customization and approval reject program suppression without writing the campaign', async () => {
  const f = fixture()
  await save(f)
  await f.request('/generate', { group: 'group_1' })
  const recipient = f.saved.data.recipients[0]
  f.suppress('member:sandbox-stopped', [[`email:${recipient.email}`, 'member:sandbox-stopped']])
  const before = f.saved
  assert.deepEqual(
    await f.request(`/recipients/${recipient.id}/draft`, {
      subject: 'Changed fixture',
      bodyText: 'Changed text'
    }),
    { status: 409, body: { code: 'recipient_blocked' } }
  )
  assert.deepEqual(
    await f.request(`/recipients/${recipient.id}/approve`, { contentHash: recipient.draft.contentHash }),
    { status: 409, body: { code: 'recipient_blocked' } }
  )
  assert.deepEqual(f.saved, before)
})

test('content rejects unknown tokens, malformed braces, header controls, oversized and live contact text', async () => {
  const f = fixture()
  const before = f.saved
  for (const override of [
    { subject: '{{company}}' },
    { bodyText: '{{invitation_url}}' },
    { bodyText: '{{ first_name }}' },
    { bodyText: '{{first_name}' },
    { bodyText: '{fixture}' },
    { bodyText: '{{{group}}}' },
    ...['\r', '\n', '\u0000', '\u007f', '\u0085', '\u2028', '\u2029'].map((control) => ({
      subject: `Header${control}injection`
    })),
    { subject: 'x'.repeat(201) },
    { bodyText: 'x'.repeat(16001) },
    { subject: '' },
    { bodyText: 'https://example.com/live' },
    { bodyText: 'friend@example.test.com' },
    { bodyText: 'https://invitations.invalid.evil.test/live' },
    { group: 'group_6' }
  ]) {
    const result = await f.request('/content', { ...content(), ...override })
    assert.equal(result.status, 400, JSON.stringify(override))
    assert.deepEqual(f.saved, before)
  }
})

test('preview validates recipient group and rendered values with existing revision and admission guards', async () => {
  const f = fixture()
  await save(f)
  const input = { group: 'group_1', recipientId: f.saved.data.recipients[0].id }
  assert.equal((await f.request('/content-preview', { ...input, revision: 0 })).status, 409)
  assert.equal((await f.request('/content', { ...content(), revision: 0 })).status, 409)
  assert.equal((await f.request('/content-preview', { ...input, recipientId: randomUUID() })).status, 404)
  assert.equal(
    (await f.request('/content-preview', { ...input, recipientId: f.saved.data.recipients[1].id })).status,
    400
  )
  for (const path of ['/content', '/content-preview', '/generate']) {
    assert.equal((await f.request(path, { ...content(), ...input }, { role: 'developer' })).status, 403)
    assert.equal(
      (await f.request(path, { ...content(), ...input }, { origin: 'https://foreign.invalid' })).status,
      403
    )
    assert.equal((await f.request(path, { ...content(), ...input }, { enabled: false })).status, 404)
  }
  for (const firstName of [
    'Real person <friend@example.com>',
    'https://example.com',
    'Header\r\nBcc: fixture',
    'x'.repeat(201)
  ]) {
    f.seed((data) => {
      data.recipients[0].firstName = firstName
    })
    const before = f.saved
    assert.equal((await f.request('/content-preview', input)).status, 400)
    assert.equal((await f.request('/generate', { group: 'group_1' })).status, 400)
    assert.deepEqual(f.saved, before)
  }
})
