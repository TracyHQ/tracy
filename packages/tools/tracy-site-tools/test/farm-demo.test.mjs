// A template demo folded into the host's demo farm (fleet scripts/lib/demo-farm.sh): its
// `<label>-web-1` is a forwarder labelled `tracy.runtime=farm`, so every site-tool exec into it is
// answered with FARM_DEMO_REFUSAL instead (src/host/index.ts `farmGuardedExec`).
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  execContainerOf,
  FARM_DEMO_REFUSAL,
  farmRefusedResult,
  isFarmForwarder,
  mcpArgv
} from '../src/host/exec.mjs'

test('the container an exec argv names is found, and nothing else is', () => {
  assert.equal(execContainerOf(mcpArgv({ container: 'demo-a-web-1' })), 'demo-a-web-1')
  assert.equal(
    execContainerOf(['exec', '-u', 'www-data', '-w', '/var/www/html', 'shop-web-1', 'php', '-r', 'x']),
    'shop-web-1'
  )
  assert.equal(execContainerOf(['inspect', 'shop-web-1']), null, 'not an exec')
  assert.equal(execContainerOf(['exec', '-i', 'tracy-demos-web', 'sh']), null, 'never a farm container')
})

test('a forwarder labelled farm is refused by name; the answer is asked once a minute per container', async () => {
  let asked = 0
  const inspect = async (c) => {
    asked++
    return c === 'folded-x-web-1' ? 'farm' : ''
  }
  assert.equal(await isFarmForwarder('folded-x-web-1', inspect), true)
  assert.equal(await isFarmForwarder('folded-x-web-1', inspect), true)
  assert.equal(await isFarmForwarder('persite-x-web-1', inspect), false)
  assert.equal(asked, 2)
  assert.equal(
    await isFarmForwarder('broken-x-web-1', async () => Promise.reject(new Error('no daemon'))),
    false
  )
  const refused = farmRefusedResult()
  assert.equal(refused.code, 126)
  assert.equal(refused.stderr.trim(), FARM_DEMO_REFUSAL)
  assert.match(FARM_DEMO_REFUSAL, /^FARM_DEMO: .*unfold/)
})
