import assert from 'node:assert/strict'
import { test } from 'node:test'
import createTracyBuilder from '../src/plugins/builders/tracy.js'
import { toDemoRequestV2 } from '../src/plugins/builders/tracy-request.js'
import { startFakeTracy } from './tracy-fake.mjs'

for (const refusal of ['SCHEMA_UNSUPPORTED', 'INVALID_DEMO_REQUEST', 'PHOTOS_UNUSABLE']) {
  test(`a persisted v2 submission handles ${refusal} without reusing a key for a different body`, async () => {
    const host = await startFakeTracy({ listen: false })
    host.state.profileRefusal = refusal
    host.state.grants.set('grant', { live: true })
    host.state.access.set('token', { grant: 'grant', expiresAt: Date.now() + 60_000 })
    let row = {
      id: 'row',
      request: toDemoRequestV2({ name: 'Corner Cafe' }, null),
      idempotency_key: 'original-key',
      status: 'submitting',
      attempts: 0
    }
    const logs = []
    let loseReply = true
    const builder = createTracyBuilder({
      pool: {
        async query(sql, params) {
          if (sql.startsWith('select * from wo_tracy_demo')) return { rows: [structuredClone(row)] }
          assert.ok(sql.startsWith('update wo_tracy_demo set '), sql)
          for (const match of sql.split('where')[0].matchAll(/(\w+) = \$(\d+)/g)) {
            if (match[1] !== 'id') row[match[1]] = params[Number(match[2]) - 1]
          }
          return { rows: [structuredClone(row)] }
        }
      },
      connection: {
        async call(path, init) {
          assert.equal(
            init.headers['idempotency-key'],
            row.idempotency_key,
            'the new key is saved before sending'
          )
          assert.deepEqual(init.body, row.request, 'the body is saved before sending')
          const response = await host.fetch(path, {
            method: init.method,
            headers: { ...init.headers, authorization: 'Bearer token', 'content-type': 'application/json' },
            body: JSON.stringify(init.body)
          })
          if (init.body.schema.endsWith('/v1') && loseReply) {
            loseReply = false
            throw Object.assign(new Error('Reply lost'), { code: 'TRACY_UNAVAILABLE' })
          }
          return response
        }
      },
      log: { warn: (...args) => logs.push(args), error: (...args) => assert.fail(JSON.stringify(args)) }
    })
    await builder.tick()
    if (refusal === 'PHOTOS_UNUSABLE') {
      assert.equal(host.state.submissions.length, 1)
      assert.equal(row.status, 'refused')
      return
    }
    assert.equal(row.status, 'submitting')
    assert.equal(host.state.submissions.length, 2)
    await builder.tick()
    const [first, second, retry] = host.state.submissions
    assert.notEqual(first.key, second.key)
    assert.equal(first.body.schema, 'website-opportunities/demo-request/v2')
    assert.equal(second.body.schema, 'website-opportunities/demo-request/v1')
    assert.equal(second.body.business.name, 'Corner Cafe')
    assert.deepEqual(retry, second)
    assert.equal(host.state.demos.size, 1)
    assert.equal(row.status, 'queued')
    assert.ok(logs.some((args) => args.join(' ').includes('v1')))
  })
}
