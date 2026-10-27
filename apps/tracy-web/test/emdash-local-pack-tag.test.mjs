/**
 * A local EmDash pack is tagged `local/<template>/<cms>` (`local-releases.js`). Every reader that takes the EmDash
 * template id from the FIRST segment of a release tag must read it off the tag the pack stands for, or a local
 * `tracy-business` pack reads as template "local": no personalize tool (the answers are never applied), no brand
 * writer, no site model and no where-map.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { briefSupported } from '../src/lib/brief-support.js'
import { emdashToolFor } from '../src/lib/emdash-tool.js'
import { emdashTemplateIdOf } from '../src/lib/local-releases.js'
import { emdashTemplate } from '../src/sites/content-profile.js'
import { whereMapFor } from '../src/sites/content-where.js'

const LOCAL = 'local/tracy-business/emdash-0.x'
const PUBLISHED = 'tracy-business/emdash-0.x'

test('the EmDash template id of a local pack is the one of the release it stands for', () => {
  assert.equal(emdashTemplateIdOf(LOCAL), 'tracy-business')
  assert.equal(emdashTemplateIdOf(PUBLISHED), 'tracy-business')
  assert.equal(emdashTemplateIdOf(''), '')
  assert.equal(emdashTemplateIdOf(null), '')
})

test('a local tracy-business pack finds the template personalize tool, as its release does', () => {
  const local = emdashToolFor(LOCAL)
  assert.ok(local, 'a local pack of a template that ships the tool gets the tool')
  assert.deepEqual(local, emdashToolFor(PUBLISHED))
  assert.equal(emdashToolFor('local/some-packed/emdash-0.x'), null)
})

test('Apply is offered for a local EmDash pack of a template that ships the tool', () => {
  assert.equal(briefSupported({ platform: 'emdash', tag: LOCAL }, /** @type {any} */ ({})), true)
})

test('a site built from a local EmDash pack reads its template model and where-map', () => {
  // Compared by identity (the model is cached per template id): a deep diff of a whole site model is minutes long.
  assert.ok(emdashTemplate(LOCAL) !== null, 'the template model is found')
  assert.ok(
    emdashTemplate(LOCAL) === emdashTemplate(PUBLISHED),
    'the same model as the release it stands for'
  )
  const map = { platform: 'emdash', quickstart: 'tracy-business', versions: ['1.2.3'] }
  const site = (tag) => ({ platform: 'emdash', quickstart_tag: tag, quickstart_version: '1.2.3' })
  assert.equal(whereMapFor(site(LOCAL), [map]), map)
  assert.equal(whereMapFor(site(PUBLISHED), [map]), map)
})
