/**
 * The built host half (`lib/index.js`, what the image runs) registers `tracy_build` only where the `site-builder`
 * preset mounts it (`config.tool: true`), never from the bundle row, so the tool is never registered twice and no other
 * session is sent it (TracyHQ/tracy#609).
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/host-registration.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import * as host from '../lib/index.js'

/** A cordis context double for one scope: what it registered, by kind. */
function scope() {
  const tools = []
  const guards = []
  const ctx = {
    tools: {
      register(tool) {
        if (tools.some((t) => t.name === tool.name))
          throw new Error(`tool "${tool.name}" is already registered`)
        tools.push(tool)
        return () => {}
      },
      guard(check) {
        guards.push(check)
        return () => {}
      }
    },
    effect(run) {
      run()
    },
    get: () => undefined
  }
  return { ctx, tools, guards }
}

test('the bundle row (no config) registers nothing on the host', () => {
  const bundle = scope()
  host.apply(bundle.ctx)
  host.apply(bundle.ctx, {})
  assert.equal(bundle.tools.length, 0)
  assert.equal(bundle.guards.length, 0)
})

test("the preset's mount registers tracy_build and its guard once, in the agent's own scope", () => {
  const global = scope()
  const agent = scope()
  host.apply(global.ctx, {})
  host.apply(agent.ctx, { tool: true })
  assert.deepEqual(
    agent.tools.map((t) => t.name),
    ['tracy_build']
  )
  assert.equal(agent.guards.length, 1)
  assert.equal(global.tools.length, 0)
  assert.equal(typeof agent.tools[0].output.render, 'function')
})

test('the plugin and its cordis row name one identity, and both bundles load it', () => {
  assert.equal(host.name, 'tracy-build-chat')
  assert.deepEqual(host.inject, ['tools'])
  const own = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(own, /- id: tracy-build-chat\n\s+name: '@tracy\/dsh-build-chat'/)
  for (const bundle of ['tracy-native', 'tracy-cowork']) {
    const root = new URL(`../../../bundle/${bundle}/`, import.meta.url)
    const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
    assert.ok(pkg.dependencies['@tracy/dsh-build-chat'], `${bundle}: dependency`)
    const rows = readFileSync(new URL('cordis.patch.yml', root), 'utf8')
    const row = rows.match(/- id: tracy-build-chat\n\s+name: '@tracy\/dsh-build-chat'\n/g)
    assert.equal(row?.length, 1, `${bundle}: exactly one row, with no config`)
    const presets = readFileSync(new URL('presets.patch.yml', root), 'utf8')
    assert.match(
      presets,
      /- id: tracy-build-chat\n\s+name: '@tracy\/dsh-build-chat'\n\s+config:\n\s+tool: true\n/,
      `${bundle}: the site-builder preset mounts the tool`
    )
  }
})
