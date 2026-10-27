/**
 * REG-PR-1134-ds-button-only: the chat route to a design system is kept but turned OFF (David,
 * 11/10/2026: "for now the only way in is the Design system button"), behind ONE operator switch,
 * `chat-design-system` (default off):
 *   S1 the catalogue: the switch exists, off by default, in the Design system button's group;
 *      `switchesAtTracy` reads it from Tracy's /api/ui and no answer is null (off);
 *   S2 the page: the preview dialog's "Use this inspiration" follows the switch; Create with does not;
 *   S3 the lane: tracy_design_propose and the `choose` door refuse CHAT_DESIGN_SYSTEM_OFF, the library
 *      and the preview copy stay; tracy_site theme.style from the chat is refused before any Apply call;
 *      tracy_design_system reaches the button's door as the person who typed; the site context carries
 *      the OFF line, which names no hidden tool; the new tool is deferred to the design road;
 *   S4 tracy-web: the button's door refuses a conversation's apply (actor grant, or x-tracy-session)
 *      with 403 CHAT_DESIGN_SYSTEM_OFF, never the button's press; switched on, the chat applies through
 *      it; unread, 503;
 *   S5 Help: names the Design system button and the new-site pick, and says the chat route is off.
 * No model reads anything, no stand, no database.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()

// S1
const catalogue = JSON.parse(
  readFileSync(join(ROOT, 'packages/core/tracy-core/src/ui-switches/catalogue.json'), 'utf8')
)
const row = catalogue.switches.find((s) => s.id === 'chat-design-system')
c.check('S1 the switch chat-design-system is in the catalogue', Boolean(row))
c.eq('S1 off by default', row?.defaultOn, false)
c.eq('S1 in the Design system button group', row?.group, 'browser-toolbar')
const core = nodeTest(['test/ui-switches.test.mjs'], { cwd: 'packages/core/tracy-core' })
c.tapClean('S1 core ui-switches tests', core)
c.passes('S1', core, 'chat-design-system: off by default')
c.passes('S1', core, 'switchesAtTracy: a host reads the switches')

// S2 + S3 (design inspiration)
const di = nodeTest(['test/chat-route.test.mjs', 'test/routes.test.mjs'], {
  cwd: 'packages/design/tracy-design-inspiration'
})
c.tapClean('S2/S3 design-inspiration tests', di)
c.passes('S2', di, '"Use this inspiration" is offered only with the chat route on')
c.passes('S2', di, 'the dialog reads the switch through @tracy/core/ui-switches')
c.passes('S3', di, 'chat route off: no proposal, no recorded pick')

// S3 (site tools)
const st = nodeTest(
  [
    'test/chat-design-route.test.mjs',
    'test/chat-design-route-wiring.test.mjs',
    'test/deferred-tools.test.mjs'
  ],
  { cwd: 'packages/tools/tracy-site-tools' }
)
c.tapClean('S3 site-tools tests', st)
c.passes('S3', st, 'switch off (the default): theme.style from the chat is refused')
c.passes('S3', st, "tracy_design_system: the button's door, as the person who typed")
c.passes('S3', st, 'off: the refusal and the context line point at the Design system button')
c.passes('S3', st, 'the site context carries the line only when the caller read the switch off')
c.passes(
  'S3',
  st,
  'off, element edits keep their rule: the slot line stays beside the OFF line on all three CMS'
)

// S4 + S5 (tracy-web)
const web = nodeTest(['test/design-system-door.test.mjs', 'test/assistant.test.mjs'], {
  cwd: 'apps/tracy-web'
})
// assistant.test.mjs's database tests skip without TEST_DATABASE_URL; the ones named below need none.
c.tapClean('S4/S5 tracy-web tests', web, { noSkip: false })
c.passes('S4', web, 'the chat route is closed by default')
c.passes('S4', web, 'the button press is never governed by the chat switch')
c.passes('S4', web, 'switched on, the chat applies through the same door as the button')
for (const cms of ['emdash', 'wordpress', 'joomla'])
  c.passes('S4', web, `${cms}: switched on, a chat apply is a press's twin`)
c.passes('S5', web, 'Help prompt: a design system goes on with the Design system button')

c.done()
