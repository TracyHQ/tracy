import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { throughDoor } from './_apply-door.mjs'

const slot = {
  key: 'module-1.0',
  entity: 'module-1',
  column: 'content',
  xpath: '/html/body/div/p/text()',
  type: 'text',
  sample: 'Demo',
  maxCharacters: 100
}
const inspect = { ok: true, contract: 'fictional/j6/1.0.0', slots: [slot] }
const call = (operation, extra = {}) => ({
  siteKey: 'fictional',
  action: 'content.contract',
  params: { operation, ...extra }
})

test('the shared helper blocks a refused write before the fake site accepts it', async () => {
  const refused = []
  let writes = 0
  const apply = throughDoor(
    ({ params }) => {
      if (params.operation === 'inspect') return inspect
      writes++
      return { ok: true }
    },
    { contractRefusals: refused }
  )
  await apply(call('inspect'))
  const result = await apply(call('apply', { changes: { [slot.key]: '' } }))
  assert.equal(result.ok, false)
  assert.equal(refused[0].code, 'SLOT_EMPTY_STATE')
  assert.equal(writes, 0)
})

test('the shared helper checks HTML bodies after a record write removed a bound node', async () => {
  const refused = []
  const apply = throughDoor(({ action }) => (action === 'content.contract' ? inspect : { ok: true }), {
    contractRefusals: refused
  })
  await apply(call('inspect'))
  await apply({
    siteKey: 'fictional',
    action: 'content.update',
    params: { kind: 'module', id: 1, fields: { content: '<div>Owner</div>' } }
  })
  const answer = await apply(call('apply', { changes: { [slot.key]: 'Bakery' } }))
  assert.equal(answer.ok, false)
  assert.equal(refused[0].message, 'HTML slot is missing or ambiguous')
})

test('successful uploaded media is available to PHP validation', async () => {
  const { default: sharp } = await import('sharp')
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
  const image = {
    ...slot,
    type: 'image',
    sample: 'images/demo.png',
    fit: { measured: true, aspect: 1 },
    xpath: undefined
  }
  const apply = throughDoor(({ params }) =>
    params.operation === 'inspect' ? { ...inspect, slots: [image] } : { ok: true }
  )
  await apply(call('inspect'))
  await apply({
    siteKey: 'fictional',
    action: 'media.upload',
    params: { path: 'images/own.png', content_b64: bytes.toString('base64') }
  })
  assert.equal((await apply(call('apply', { changes: { [slot.key]: 'images/own.png' } }))).ok, true)
})

test('a default refusal still fails its test when engine code catches or ignores the answer', () => {
  const helper = new URL('./_apply-door.mjs', import.meta.url).href
  const script = `import {test} from 'node:test'; import {throughDoor} from ${JSON.stringify(helper)};
    test('a swallowed plugin refusal', async () => {
      const apply = throughDoor(({params}) => params.operation === 'inspect' ? ${JSON.stringify(inspect)} : {ok:true});
      await apply(${JSON.stringify(call('inspect'))});
      try { await apply(${JSON.stringify(call('apply', { changes: { [slot.key]: '' } }))}); } catch {}
    });`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    timeout: 20_000
  })
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout + result.stderr, /Content cannot remove an occupied slot: module-1\.0/)
})

test('a record write that breaks a binding refuses the next inspect, even with no slot write', async () => {
  const refused = []
  const apply = throughDoor(
    ({ action, params }) =>
      action === 'content.contract' && params.operation === 'inspect' ? inspect : { ok: true },
    {
      contractRefusals: refused,
      contractRows: { 'module-1': { content: '<p>Demo</p>' } }
    }
  )
  assert.equal((await apply(call('inspect'))).ok, true)
  await apply({
    siteKey: 'fictional',
    action: 'content.update',
    params: { kind: 'module', id: 1, fields: { content: '' } }
  })
  const answer = await apply(call('inspect'))
  assert.equal(answer.ok, false)
  assert.equal(refused[0].message, 'Content slot is missing or ambiguous')
})

test('successful PHP patches persist into the next write and inspect', async () => {
  const refused = []
  const heading = { ...slot, xpath: '/html/body/div/h1' }
  const nested = { ...slot, key: 'module-1.1', xpath: '/html/body/div/h1/span/text()' }
  const apply = throughDoor(
    ({ params }) =>
      params.operation === 'inspect' ? { ...inspect, slots: [heading, nested] } : { ok: true },
    {
      contractRefusals: refused,
      contractRows: { 'module-1': { content: '<h1>Demo <span>words</span></h1>' } }
    }
  )
  assert.equal((await apply(call('inspect'))).ok, true)
  assert.equal((await apply(call('apply', { changes: { [slot.key]: 'Owner heading' } }))).ok, true)
  const answer = await apply(call('apply', { changes: { [nested.key]: 'Owner' } }))
  assert.equal(answer.ok, false)
  assert.equal(refused[0].message, 'HTML slot is missing or ambiguous')
})

test('WordPress contract doubles keep their own validator and are not judged by Joomla rules', async () => {
  const apply = throughDoor(({ params }) =>
    params.operation === 'inspect'
      ? { ok: true, contract: 'fictional/wp7/1.0.0', slots: [{ ...slot, key: 'post-1.0', entity: 'post-1' }] }
      : { ok: true }
  )
  await apply(call('inspect'))
  assert.equal((await apply(call('apply', { changes: { 'post-1.0': '' } }))).ok, true)
})
