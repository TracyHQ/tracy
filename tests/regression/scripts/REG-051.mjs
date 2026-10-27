/**
 * REG-051: one control, one action — the seat DELETE names its kind (revoke / cancel_invite /
 * decline_request). Runs the seat suites (S1), which must exit 0 with 0 failed and 0 skipped, and
 * every test the case names must pass. The question-action half (S2) went with the question
 * generator, removed 10/10/2026.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const KINDS = ['revoke', 'cancel_invite', 'decline_request']

// S1
const s1 = nodeTest([
  'apps/tracy-web/test/seat-actions.test.mjs',
  'apps/tracy-web/test/seats-pages.test.mjs',
  'packages/core/tracy-core/test/roster.test.mjs',
  'packages/core/tracy-core/test/team-actions.test.mjs'
])
c.tapClean('S1', s1)
const s1Names = [
  'an explicit kind that does not match the row is refused and nothing is written',
  'a role change records team.role_change with the role it left and the role it took',
  'an unchanged role, an invalid role and a refused change record nothing',
  'a tab that names its act is told when the row has moved on; a bodyless one keeps its v1 meaning',
  'action.revoke: the confirm step names that act and the write sends {kind: revoke}',
  'action.cancelInvite: the confirm step names that act and the write sends {kind: cancel_invite}',
  'action.declineRequest: the confirm step names that act and the write sends {kind: decline_request}'
]
for (const kind of KINDS) {
  s1Names.push(
    `DELETE {kind: ${kind}} stores ${kind}, answers it, and closes the seat`,
    `a successful ${kind} records team.${kind} with the actor, the site and the target`,
    `DELETE with no body (an older tab) runs the act the row calls for, ${kind}, and stores it as that`,
    `DELETE with no body and content-length: 0 (an older tab) runs the act the row calls for, ${kind}, and stores it as that`
  )
  for (const body of [
    'empty object',
    'a whitespace body',
    'a single space',
    'a newline',
    'a declared length with nothing in it',
    'a chunked body with nothing in it',
    'a kind beside another key',
    'a kind under another name'
  ])
    s1Names.push(
      `DELETE with ${body} is refused where the row calls for ${kind}: nothing removed, recorded or synced`
    )
}
for (const name of s1Names) c.passes('S1', s1, name)

c.done()
