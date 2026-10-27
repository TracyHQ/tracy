/**
 * REG-PR-1026-site-notes: site notes are kept by the host beside the step (no agent tool), only from what the
 * customer typed, per site, in a store the agent's file tools do not reach. Runs both test files of the feature;
 * every test the case names must pass and the runs must exit 0 with nothing failed, skipped or cancelled.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

const run = nodeTest(
  [
    'packages/tools/tracy-site-tools/test/site-notes.test.mjs',
    'packages/tools/tracy-site-tools/test/site-notes-wiring.test.mjs'
  ],
  { extra: ['--test-timeout=120000', '--test-force-exit'], timeoutS: 600 }
)
c.tapClean('S1', run)

for (const [tag, name] of [
  ['NOTOOL', '🔒 the agent is given no notes tool: its tools are the ones it had before'],
  [
    'KEPT',
    '🔒 a wish the customer typed is kept by the host, then sent once to the next message and the next conversation'
  ],
  ['NOWAIT', '🔒 the step never waits for the side call'],
  [
    'NOTSAID',
    '🔒 a proposal that does not quote the customer is dropped: the side call cannot invent a wish'
  ],
  ['POINTEDAT', "🔒 words that came in on a page the customer pointed at are not the customer's words"],
  ['ISOLATION', "🔒 another site's conversation is never sent a site's notes"],
  ['FORGERY', '🔒 a note the agent writes by hand into a file is not a note'],
  ['QUOTE', 'words the customer did not write are refused NOT_SAID and nothing is stored'],
  [
    'GATE',
    'the gate opens on the marks of a lasting wish, in the interface languages, and stays shut otherwise'
  ],
  ['REMOVE', 'capture: a removal needs the customer asking for it; one that does is applied'],
  [
    'FAILSAFE',
    'capture: a model that is down, stalls, stops short or answers junk keeps nothing and never throws'
  ],
  ['TOTALCAP', "the notes' text together is capped too"],
  [
    'STOREPATH',
    'the store folder is <sitesRoot>/.site-notes/<label>, and a label that is a path is not a store'
  ]
])
  c.passes(`S2 ${tag}`, run, name)

c.done()
