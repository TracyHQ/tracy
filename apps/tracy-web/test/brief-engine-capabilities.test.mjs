import assert from 'node:assert/strict'
import test from 'node:test'
import { composeBriefEngines } from '../src/sites/brief-engines/compose.js'
import { delegateEngine } from '../src/sites/brief-engines/delegate.js'
import { createEmdashEngine } from '../src/sites/brief-engines/emdash.js'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { createWordpressEngine } from '../src/sites/brief-engines/wordpress.js'

const trades = [
  { name: 'Willow Crumb Bakery', trade: 'bakery' },
  { name: 'Juniper Dental Studio', trade: 'dental clinic' }
]

for (const business of trades) {
  test(`${business.trade}: production composition preserves every CMS engine capability`, async () => {
    const options = { models: async () => ({}), siteAccess: async () => ({}) }
    const inner = {
      wordpress: createWordpressEngine(options),
      joomla: createJoomlaEngine(options),
      emdash: createEmdashEngine(options)
    }
    const hiddenCapability = Symbol('future engine capability')
    for (const engine of Object.values(inner)) {
      engine.inspectFutureCapability = function (ctx) {
        assert.equal(this, engine, 'delegation retains the inner method receiver')
        return ctx.brief.business
      }
      Object.defineProperty(engine, hiddenCapability, {
        value() {
          assert.equal(this, engine)
          return business.trade
        }
      })
    }
    const composed = composeBriefEngines(inner, {
      woContent: { quickstartFor: async () => null }
    })
    assert.deepEqual(Object.keys(composed), Object.keys(inner))
    for (const [platform, engine] of Object.entries(inner)) {
      for (const key of Reflect.ownKeys(engine)) {
        assert.equal(typeof composed[platform][key], typeof engine[key], `${platform}: ${String(key)}`)
        assert.ok(key in composed[platform], `${platform}: discoverable ${String(key)}`)
        assert.ok(Reflect.ownKeys(composed[platform]).includes(key))
      }
      const ctx = { platform, brief: { business } }
      assert.deepEqual(composed[platform].inspectFutureCapability(ctx), business)
      assert.equal(composed[platform][hiddenCapability](), business.trade)
    }
  })
}

test('delegation preserves inherited receivers, late capabilities, metadata and explicit overrides', () => {
  class InnerEngine {
    #value = 'inner state'
    prepare() {
      return this.#value
    }
  }
  const inner = new InnerEngine()
  const adapted = delegateEngine(inner, { apply: () => 'adapter write' })
  inner.apply = () => 'inner write'
  inner.metadata = { version: 1 }
  assert.equal(adapted.prepare(), 'inner state')
  assert.equal(adapted.prepare, adapted.prepare, 'delegated methods retain stable identities')
  assert.equal(adapted.apply(), 'adapter write')
  assert.equal(adapted.metadata, inner.metadata)
  const outer = delegateEngine(adapted, { normalize: () => 'outer normalize' })
  inner.inspectNewCapability = function () {
    assert.equal(this, inner)
    return this.metadata.version
  }
  assert.equal(outer.inspectNewCapability(), 1)
  assert.equal(outer.prepare(), 'inner state')
  assert.equal(outer.apply(), 'adapter write')
  assert.equal(outer.normalize(), 'outer normalize')
  assert.ok('inspectNewCapability' in outer)
  assert.ok(Object.keys(outer).includes('inspectNewCapability'))
})
