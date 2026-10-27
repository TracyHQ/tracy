/**
 * REG-PR-1015-plan-model-per-conversation: a conversation's model is decided once, on the customer's
 * connected plan when the profile offers plans, and never falls back to Tracy's model; the desktop
 * app writes those plan routes only into its own dsh, and the fleet gate refuses them anywhere else.
 * Runs the in-process suites (no stand, no database) and requires each test carrying an expectation.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const policy = nodeTest(['packages/ui/tracy-mode-picker/test/session-models.test.mjs'])
c.tapClean('S1', policy)
for (const name of [
  'without customerRoutes every conversation runs on the deployment default, credentials unread',
  'T5: a new conversation runs on the connected plan; with none connected, on the default',
  'T5: decided once per conversation — connecting later does not move a running one',
  'T6: a conversation on a plan that went away stops with "reconnect", never on the default',
  'a conversation that already ran keeps its logged route after a restart',
  'the door accepts only the conversation’s own model'
])
  c.passes('S1', policy, name)

const app = nodeTest(['packages/desktop/tracy-desktop/test/plan-profile.test.mjs'])
c.tapClean('S2', app)
for (const name of [
  'connecting on: settings come up, the plan card is limited to the allowed vendors, routes follow their order',
  'connecting off, no vendor, or nothing readable: nothing is added',
  'a server that does not answer: the last copy read is used; with none, nothing'
])
  c.passes('S2', app, name)

const gate = nodeTest(['scripts/test/image-profile.test.mjs'], { extra: ['--import', 'tsx'] })
c.tapClean('S3', gate)
for (const where of ['fleet patch', 'native bundle', 'cowork bundle'])
  c.passes(
    'S3',
    gate,
    `customer plan routes on the model policy in the ${where} are caught, as a row or as an insert`
  )
c.done()
