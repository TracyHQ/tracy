/**
 * Accounts of the machine a quickstart is measured on (a local admin added to the stand) are not demo content: the
 * audit never follows a link to the author page of a user the release's database does not hold, and drops the entry
 * such a user gets on an author list (name, picture text, link). Every user here is invented.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { usersOfDump } from '../content-coverage/lib/db-index.mjs'
import { standUserFilter } from '../content-coverage/lib/stand-users.mjs'

const dumpUsers = ['admin', 'Site Owner', 'Mia_Ross', 'Mia Ross ', 'Theo Blake']

test('a link to the author page of a user missing from the release database is not followed', () => {
  const f = standUserFilter({ users: dumpUsers })
  assert.equal(f.isStandLink('/index.php/team/author/local-tester'), true)
  assert.equal(f.isStandLink('/index.php/team/author/Mia_Ross'), false)
  assert.equal(f.isStandLink('/index.php/team/author/Theo%20Blake'), false)
  assert.equal(f.isStandLink('/index.php/team/author/admin?start=4'), false)
  assert.equal(f.isStandLink('/index.php/classes/rope-basics'), false)
})

test('the entry of such a user on an author list is dropped: its name, its picture text and its links', () => {
  const f = standUserFilter({ users: dumpUsers })
  const items = [
    { kind: 'text', value: 'Mia Ross', href: '/team/author/Mia_Ross' },
    { kind: 'attr', attr: 'alt', value: 'Mia Ross' },
    { kind: 'text', value: 'Local Tester', href: '/team/author/local-tester' },
    { kind: 'attr', attr: 'alt', value: 'Local Tester' },
    { kind: 'link', source: 'a', value: '/team/author/local-tester' },
    { kind: 'text', value: 'Our team' }
  ]
  assert.deepEqual(
    f.dropItems([items]).map((list) => list.map((i) => i.value)),
    [['Mia Ross', 'Mia Ross', 'Our team']]
  )
})

test('without the release database nothing is filtered', () => {
  const f = standUserFilter({ users: null })
  assert.equal(f.isStandLink('/team/author/local-tester'), false)
  const items = [{ kind: 'text', value: 'Local Tester', href: '/team/author/local-tester' }]
  assert.deepEqual(f.dropItems([items]), [items])
})

test('the users of a dump are its users table names and logins, whatever the table prefix', () => {
  const tables = new Map([
    ['#__users', [{ id: '7', username: 'Mia_Ross', name: 'Mia Ross ', email: 'x' }]],
    ['#__action_logs_users', [{ user_id: '7', notify: '0' }]],
    ['wp_users', [{ ID: '1', user_login: 'theo', display_name: 'Theo Blake', user_nicename: 'theo-b' }]]
  ])
  assert.deepEqual(usersOfDump(tables, 'wp_').sort(), [
    'Mia Ross ',
    'Mia_Ross',
    'Theo Blake',
    'theo',
    'theo-b'
  ])
})
