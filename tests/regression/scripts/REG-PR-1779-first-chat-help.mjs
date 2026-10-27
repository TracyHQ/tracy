/** The onboarding Help boundary: no agent dependency, owner files and durable retry pairing. */
import { cannotRun, checks, nodeTest } from './lib.mjs'
if (!process.env.TEST_DATABASE_URL) cannotRun('Set TEST_DATABASE_URL to an owned PostgreSQL database')
const c = checks()
const server = nodeTest(
  ['apps/tracy-web/test/assistant-files.test.mjs', 'apps/tracy-web/test/api-reference.test.mjs'],
  {
    extra: ['--test-concurrency=1', '--test-timeout=60000']
  }
)
c.tapClean('Stored files and first account', server)
c.passes(
  'First account',
  server,
  'a verified first-time user can ask Help and upload before onboarding creates an account'
)
c.passes(
  'Retry persistence',
  server,
  'partial stream then retry keeps both answers linked to the original question for reload'
)
const ui = nodeTest(
  ['packages/ui/tracy-assistant/test/help-ui.test.mjs', 'packages/ui/tracy-assistant/test/help.test.mjs'],
  { extra: ['--test-concurrency=1', '--test-timeout=20000'] }
)
c.tapClean('Sessionless Help, clickable actions and restored answers', ui)
c.passes(
  'No agent required',
  ui,
  'onboarding bar sends typed questions through existing Help without an agent turn; site keeps native bar'
)
c.passes(
  'Click to act',
  ui,
  'a start action in an answer is text to press that opens its step; with no handler it is plain text'
)
c.done()
