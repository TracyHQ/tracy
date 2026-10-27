import assert from 'node:assert/strict'
import { hkdfSync } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { scratchPool } from './_db.mjs'
import { openSecret } from '../src/lib/secret-box.js'
import { prepareNativeHandoff, finishNativeHandoff } from '../src/widget/native-handoff.js'
import { inspectOwnJob } from '../src/sites/job-inspect.js'
import {
  ConversationConflict,
  conversationStore,
  sealConversationSnapshot,
  seedConversationSnapshot
} from '../src/widget/store.js'

const owner = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const visitor = '00000000-0000-4000-8000-000000000003'
const secret = 'isolated-widget-pg-secret'

test('widget PostgreSQL: real migration, encrypted restart context, owner binding, CAS and SELECT-only build facts', {
  skip: !process.env.TEST_DATABASE_URL
}, async () => {
  const { pool, close } = await scratchPool()
  try {
    for (const name of [
      '001-identity.sql',
      '002-book.sql',
      '009-site-creation.sql',
      '018-site-creation-settled.sql',
      '032-site-public-names.sql',
      '052-site-brief.sql',
      '100-site-create-design-system.sql',
      '126-widget-conversation.sql',
      '127-widget-native-session.sql',
      '147-widget-sign-in.sql'
    ])
      await pool.query(await readFile(new URL('../src/db/migrations/' + name, import.meta.url), 'utf8'))
    await pool.query('insert into account(id,email) values($1,$2),($3,$4)', [
      owner,
      'widget-owner@example.test',
      other,
      'widget-other@example.test'
    ])
    await pool.query(
      "insert into site(site_key,label,host,address,created_at) values('mine.test','mine','local','https://mine.test/','2020-01-01')"
    )
    await pool.query(
      "insert into job(id,site_key,host,kind,state,step,created_at) values('job1','mine.test','local','provision','done','ready','2020-01-02')"
    )
    await pool.query(
      "insert into site_creation(account_id,build_id,payload_hash,state,site_key,job_id) values($1,'build1','fixture-hash','done','mine.test','job1')",
      [owner]
    )
    await pool.query(
      "insert into site_brief(site_key,account_id,platform,brief,state) values('mine.test',$1,'wordpress','{}','applied')",
      [owner]
    )
    await pool.query(
      "insert into site_create_design_system(site_key,account_id,actor,system_id,system_name,state) values('mine.test',$1,'fixture','system1','Fixture system','applied')",
      [owner]
    )
    const client = await pool.connect()
    try {
      await client.query('begin read only')
      const result = await inspectOwnJob(client, { siteKey: 'mine.test', jobId: 'job1', accountId: owner })
      assert.equal(result.status, 200)
      assert.equal(result.body.state, 'done')
      assert.deepEqual(result.body.completion, {
        siteReady: true,
        briefState: 'applied',
        designSystemState: 'applied'
      })
      assert.equal(result.body.links.openWebsite, 'https://mine.test/')
      assert.equal(result.body.freshness.source, 'persisted')
      assert.equal(
        (await inspectOwnJob(client, { siteKey: 'mine.test', jobId: 'job1', accountId: other })).status,
        403
      )
      await client.query('rollback')
    } finally {
      client.release()
    }
    const data = {
      history: [{ role: 'user', text: 'Private conversation survives restart.' }],
      brief: {
        name: 'n'.repeat(2000),
        about: 'Private business brief',
        goal: 'contact',
        style: 'modern',
        platform: 'wordpress'
      },
      selectedTemplate: 'fixture-template',
      templateIds: ['fixture-template'],
      build: { siteKey: 'mine.test', jobId: 'job1' },
      buildId: 'build1',
      authCookie: 'forbidden-session',
      apiKey: 'forbidden-key',
      speechToken: 'forbidden-speech'
    }
    const snapshot = await sealConversationSnapshot(
      { visitorId: visitor, ownerAccountId: owner, data },
      secret
    )
    await seedConversationSnapshot(pool, snapshot, secret, { visitorId: visitor, ownerAccountId: owner })
    const storageKey = Buffer.from(
      hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), 'tracy:widget-conversation:v1:payload', 32)
    ).toString('base64url')
    const decodedEnvelope = await openSecret(snapshot.payload_cipher, storageKey)
    assert.ok(decodedEnvelope.includes('Private conversation survives restart.'))
    for (const raw of ['forbidden-session', 'forbidden-key', 'forbidden-speech'])
      assert.ok(!decodedEnvelope.includes(raw))
    const stored = JSON.stringify((await pool.query('select * from widget_conversation')).rows)
    for (const raw of [
      'Private conversation',
      'Private business',
      'forbidden-session',
      'forbidden-key',
      'forbidden-speech'
    ])
      assert.ok(!stored.includes(raw))
    const first = await conversationStore(pool, secret).read(visitor, owner)
    const restarted = await conversationStore(pool, secret).read(visitor, owner)
    assert.deepEqual(first.data, restarted.data)
    assert.deepEqual(first.data.history, data.history)
    assert.equal(first.data.brief.name.length, 2000)
    assert.equal(first.data.buildId, 'build1')
    const locked = await conversationStore(pool, secret).read(visitor, other)
    assert.equal(locked.locked, true)
    assert.equal(locked.data, undefined)
    const attempts = await Promise.allSettled(
      ['A', 'B'].map((text) =>
        conversationStore(pool, secret).write(
          visitor,
          owner,
          { ...data, history: [{ role: 'user', text }] },
          first.revision
        )
      )
    )
    assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1)
    assert.ok(attempts.find((r) => r.status === 'rejected').reason instanceof ConversationConflict)
    assert.equal((await conversationStore(pool, secret).read(visitor, owner)).revision, 2)
    const nativeStore = conversationStore(pool, secret)
    const nativeVisitor = {
      ...data,
      id: 'native-pg-visitor',
      ownerId: owner,
      revision: 0,
      expires: Date.now() + 10000
    }
    const identity = { visitorId: nativeVisitor.id, ownerAccountId: owner, expectedRevision: 0 }
    nativeVisitor.nativeHandoff = prepareNativeHandoff(nativeVisitor, identity)
    Object.assign(nativeVisitor, await nativeStore.write(nativeVisitor.id, owner, nativeVisitor, 0))
    const nativeSession = nativeVisitor.nativeHandoff.sessionId
    assert.equal(await nativeStore.readContextForSession(nativeSession, owner), null)
    identity.expectedRevision = nativeVisitor.revision
    nativeVisitor.nativeHandoff = finishNativeHandoff(nativeVisitor, identity, {
      sessionId: nativeSession,
      workspaceId: 'workspace-native-pg'
    })
    await nativeStore.write(nativeVisitor.id, owner, nativeVisitor, nativeVisitor.revision)
    assert.deepEqual(
      await conversationStore(pool, secret).readContextForSession(nativeSession, owner),
      nativeVisitor.nativeHandoff.context
    )
    assert.equal(await nativeStore.readContextForSession(nativeSession, other), null)
    const nextYear = Date.now() + 365 * 24 * 60 * 60 * 1000
    await nativeStore.cleanup(nextYear)
    assert.deepEqual(
      await nativeStore.readContextForSession(nativeSession, owner, nextYear),
      nativeVisitor.nativeHandoff.context
    )
    const duplicate = {
      ...nativeVisitor,
      id: 'duplicate-native-pg-visitor',
      nativeHandoff: { ...nativeVisitor.nativeHandoff, visitorId: 'duplicate-native-pg-visitor' }
    }
    await assert.rejects(nativeStore.write(duplicate.id, owner, duplicate, 0), ConversationConflict)
    await pool.query('update widget_conversation set owner_account_id=$1', [other])
    await assert.rejects(
      conversationStore(pool, secret).read(nativeVisitor.id, other),
      /WIDGET_STATE_UNREADABLE/
    )
  } finally {
    await close()
  }
})
