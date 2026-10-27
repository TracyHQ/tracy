import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hostAgents } from '../src/ops/hosts.js'

test('host inventory keeps failed hosts visible and compares only measured packages', async () => {
  const config = {
    hosts: new Map([
      ['local', {}],
      ['second', {}],
      ['offline', {}]
    ])
  }
  const host = {
    async hostCall(received, name, path, body) {
      assert.equal(received, config)
      assert.equal(path, '/dsh-versions')
      assert.deepEqual(body, {})
      if (name === 'offline') throw new Error('secret internal address')
      return {
        ok: true,
        body: {
          container: { status: 'running' },
          packages: [{ name: '@tracy/example', version: name === 'local' ? '1' : '2' }]
        }
      }
    }
  }
  const result = await hostAgents({ config, host })
  assert.equal(result.hosts.length, 3)
  assert.equal(result.hosts[2].ok, false)
  assert(!JSON.stringify(result).includes('secret internal address'))
  assert.deepEqual(result.drift, { '@tracy/example': { local: '1', second: '2' } })
})

test('missing channel and malformed host responses remain explicit unavailable rows', async () => {
  const config = { hosts: new Map([['local', {}]]) }
  assert.equal((await hostAgents({ config })).hosts[0].ok, false)
  const host = { hostCall: async () => ({ ok: true, status: 200, body: {} }) }
  assert.equal((await hostAgents({ config, host })).hosts[0].ok, false)
})
