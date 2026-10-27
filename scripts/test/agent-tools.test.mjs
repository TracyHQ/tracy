/**
 * `build-agent-tools.mjs` and the reference it feeds: every action a surface offers says how it reaches
 * the site, and the committed catalogue renders into one OpenAPI document that names every tool.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildAgentToolsOpenApi } from '../../apps/tracy-web/src/api-reference/sources/agent-tools.js'
import { LOCAL_ACTIONS, RELAY_ACTIONS } from '../../packages/tools/tracy-site-tools/src/host/site.mjs'
import {
  SURFACE_ACTIONS,
  siteToolDescription
} from '../../packages/tools/tracy-site-tools/src/host/surface.mjs'
import { build } from '../build-agent-tools.mjs'

const doc = await build()
const site = doc.tools.find((t) => t.name === 'tracy_site')

test('every surface of tracy_site is in the catalogue, with the text the model receives', () => {
  assert.deepEqual(Object.keys(site.surfaces), Object.keys(SURFACE_ACTIONS))
  for (const [surface, actions] of Object.entries(SURFACE_ACTIONS)) {
    assert.deepEqual(
      site.surfaces[surface].actions.map((a) => a.action),
      [...actions]
    )
    assert.equal(
      site.surfaces[surface].description,
      siteToolDescription(surface, { wordpressReadBack: false })
    )
    assert.deepEqual(site.surfaces[surface].parameters.properties.action.enum, [...actions])
  }
})

test('a relayed action keeps its name at the Apply door; a local one is the host, with its road', () => {
  for (const [surface, entry] of Object.entries(site.surfaces))
    for (const a of entry.actions) {
      if (LOCAL_ACTIONS.includes(a.action)) {
        assert.equal(a.door, 'host', `${surface} ${a.action}`)
        assert.ok(a.host, `${surface} ${a.action} says what the host does`)
      } else if (surface === 'emdash' && a.action === 'media.upload') {
        assert.deepEqual(a.emdashTools, ['media_upload'])
      } else {
        assert.ok(RELAY_ACTIONS.includes(a.action))
        assert.equal(a.door, 'apply')
        assert.equal(a.applyAction, a.action)
      }
    }
})

test('content.replace names the door its writes take on each surface', () => {
  const replace = (surface) => site.surfaces[surface].actions.find((a) => a.action === 'content.replace')
  assert.deepEqual(replace('joomla-sealed')?.applyActions, ['content.contract'])
  assert.ok(replace('wordpress')?.applyActions.includes('content.update'))
  assert.ok(replace('emdash')?.emdashTools.includes('content_update'))
})

test('the other plugins’ tools are found by name, with the platforms surface.mjs hides them on', () => {
  const names = doc.otherTools.map((t) => t.name)
  for (const name of ['tracy_site_build_joomla', 'tracy_site_profile', 'tracy_design_propose', 'tracy_brand'])
    assert.ok(names.includes(name), name)
  assert.deepEqual(doc.otherTools.find((t) => t.name === 'tracy_site_build_joomla').platforms, ['joomla'])
})

test('the reference is one OpenAPI 3.1 document naming every tool and surface', () => {
  const api = buildAgentToolsOpenApi()
  assert.equal(api.openapi, '3.1.0')
  assert.deepEqual(api.paths, {})
  const text = api.info.description
  for (const surface of Object.keys(SURFACE_ACTIONS)) {
    assert.ok(text.includes(`on \`${surface}\``), surface)
    assert.ok(api.components.schemas[`tracy_site.${surface}`], surface)
  }
  for (const t of doc.otherTools) assert.ok(text.includes(`\`${t.name}\``), t.name)
  assert.ok(api.components.schemas.tracy_emdash)
})
