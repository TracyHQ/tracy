/** Conversation handoffs preserve current intent, explicit edits and final confirmation. */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const controller = nodeTest([
  'packages/ui/tracy-assistant/test/onboarding.test.mjs',
  'packages/site/tracy-add-site/test/chat-draft.test.mjs'
])
c.tapClean('Draft validation, revisions and action races', controller, { pass: 8, noSkip: true })
const browser = nodeTest(
  [
    'packages/site/tracy-add-site/test/e2e/chat-draft.test.mjs',
    'packages/site/tracy-add-site/test/e2e/from-business-links.test.mjs'
  ],
  { timeoutS: 180 }
)
c.tapClean('Editable browser handoffs and corrected lookup seeds', browser, { pass: 8, noSkip: true })
c.done()
