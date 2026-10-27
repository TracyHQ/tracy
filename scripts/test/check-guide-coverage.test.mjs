// The guide-coverage gate: red for each way a feature can ship without the assistants being told.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkGuide } from '../check-guide-coverage.mjs'

const article = (over = {}) => ({
  id: 'own-domain',
  title: 'T',
  switchId: 'site-connect-domain',
  noSwitchReason: null,
  tab: 'tracy:site-publish',
  roles: [],
  platforms: [],
  keywords: [],
  checked: '2026-10-21 @ 6ecf4261ee',
  body: 'x',
  ...over
})
const SW = [{ id: 'site-connect-domain' }, { id: 'tab-team', tabs: ['tracy:team'] }]

test('a switch with an article, and one with a reasoned exemption, is clean', () => {
  assert.deepEqual(checkGuide(SW, [article()], { 'tab-team': 'layout' }), [])
})

test('a new switch with neither an article nor an exemption is red, and says what to do', () => {
  const problems = checkGuide([...SW, { id: 'new-feature' }], [article()], { 'tab-team': 'layout' })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /switch "new-feature" has no guide article and no exemption/)
  assert.match(problems[0], /guide\/articles\/<id>\.md/)
})

test('an exemption with no reason does not count', () => {
  assert.match(checkGuide(SW, [article()], { 'tab-team': '  ' })[0], /tab-team/)
})

test('a locked switch needs nothing: nobody can press it', () => {
  assert.deepEqual(
    checkGuide([...SW, { id: 'dsh-open-in-app', locked: 'x' }], [article()], { 'tab-team': 'layout' }),
    []
  )
})

test('an article for a switch the catalogue does not have is red', () => {
  const problems = checkGuide(SW, [article(), article({ id: 'x', switchId: 'gone' })], {
    'tab-team': 'layout'
  })
  assert.match(problems.join('\n'), /names switch "gone", which is not in the catalogue/)
})

test('a switch claimed by an article must not also be exempt (the stale row is a lie)', () => {
  assert.match(
    checkGuide(SW, [article()], { 'site-connect-domain': 'no', 'tab-team': 'layout' })[0],
    /drop the exemption/
  )
})

test('an exemption for a switch that no longer exists is red', () => {
  assert.match(
    checkGuide(SW, [article()], { 'tab-team': 'layout', retired: 'old' })[0],
    /"retired".*not in the catalogue/
  )
})

test('an article with no switch must say why; a tab Tracy does not open is red; checked needs a commit', () => {
  const bare = article({ id: 'p', switchId: '', noSwitchReason: null })
  assert.match(checkGuide(SW, [article(), bare], { 'tab-team': 'l' }).join(), /no switch and gives no reason/)
  assert.match(
    checkGuide(SW, [article({ tab: 'tracy:nowhere' })], { 'tab-team': 'l' }).join(),
    /not a tab Tracy opens/
  )
  assert.match(
    checkGuide(SW, [article({ checked: 'yesterday' })], { 'tab-team': 'l' }).join(),
    /"checked" must be/
  )
})
