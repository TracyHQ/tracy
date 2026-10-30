// `tracy_build_check` (#189): the site build rules checked on one page after the agent changed it. The pure half: the
// description, the call and the answer. Fictional businesses of two trades.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BUILD_CHECK_DESCRIPTION,
  BUILD_CHECK_PARAMETERS,
  buildCheckAnswer,
  buildCheckCall,
  buildCheckUnavailable
} from '../src/host/build-check-tool.mjs'
import { DEFERRED_NAMES } from '../src/host/deferred-tools.mjs'
import { PLATFORM_ONLY_TOOLS } from '../src/host/surface.mjs'

test('the description is short and the same for every site', () => {
  assert.ok(BUILD_CHECK_DESCRIPTION.length <= 400, `${BUILD_CHECK_DESCRIPTION.length} characters`)
  assert.ok(BUILD_CHECK_DESCRIPTION.startsWith('tracy_build_check:'))
  for (const word of ['/site/', '.tracy.', 'localhost', 'trk_'])
    assert.ok(!BUILD_CHECK_DESCRIPTION.includes(word), word)
  assert.deepEqual(Object.keys(BUILD_CHECK_PARAMETERS.properties), ['path'])
})

test('it is there from the first step: neither deferred nor platform-only', () => {
  assert.ok(!DEFERRED_NAMES.includes('tracy_build_check'))
  assert.ok(!Object.hasOwn(PLATFORM_ONLY_TOOLS, 'tracy_build_check'))
})

test('the call takes a page address, repairs a full URL or a missing slash, and refuses a path that leaves the site', () => {
  assert.deepEqual(buildCheckCall({ path: '/lessons/' }), {
    ok: true,
    path: '/lessons',
    query: 'path=%2Flessons'
  })
  assert.equal(/** @type {any} */ (buildCheckCall({ path: 'menu' })).path, '/menu')
  assert.equal(
    /** @type {any} */ (buildCheckCall({ path: 'https://harbour-bakery.example/menu?x=1' })).path,
    '/menu'
  )
  assert.equal(/** @type {any} */ (buildCheckCall({})).path, '/')
  for (const bad of ['//evil.example/x', '/a/../b', '/a b'])
    assert.equal(buildCheckCall({ path: bad }).ok, false, bad)
  assert.match(/** @type {any} */ (buildCheckCall({ path: '/a/../b' })).next, /tracy_build_check again/)
})

test('a clean page passes; a page with findings lists them with what to put instead, blockers first as the door sent', () => {
  assert.deepEqual(buildCheckAnswer({ path: '/', findings: [], broken: [] }).pass, true)
  const answer = /** @type {any} */ (
    buildCheckAnswer({
      path: '/classes',
      blockers: 1,
      findings: [
        {
          rule: 'sibling-copy-shape',
          blocks: true,
          kind: 'sibling-copy',
          page: '/classes',
          place: 'card 3 body',
          found: 'Join us.',
          guarantee: 'The cards of one list share one text shape',
          instead: 'rewrite this card to the length and line count of its siblings'
        },
        {
          rule: 'menu-label-is-page-name',
          blocks: false,
          kind: 'main-menu',
          page: null,
          place: null,
          found: 'Learn more'
        }
      ],
      broken: []
    })
  )
  assert.equal(answer.pass, false)
  assert.equal(answer.blockers, 1)
  assert.deepEqual(answer.findings[0], {
    rule: 'sibling-copy-shape',
    blocks: true,
    where: '/classes | card 3 body',
    found: 'Join us.',
    instead: 'rewrite this card to the length and line count of its siblings',
    why: 'The cards of one list share one text shape'
  })
  assert.equal(answer.findings[1].where, 'the whole site')
  assert.match(answer.next, /hard fact .* only from the customer/)
})

test('a check that cannot run says what to do instead, never a bare code', () => {
  const miss = buildCheckUnavailable('BUILD_CHECK_DOOR_MISSING')
  assert.equal(miss.ok, false)
  assert.match(miss.next, /site-build-rules skill/)
})
