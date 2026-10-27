/**
 * REG-PR-1134-ds-wizard-words: two bugs of the Design system walkthrough on the local stand
 * (11/10/2026, `tasks/evidence/ds-walkthrough-2026-10-11/` notes 6 and 7):
 *   S1 the Add site wizard keeps the CMS (and origin card and address) picked by hand when its tab
 *      leaves the screen: "Change design" opens Design inspiration in the same column, and coming back
 *      without picking a design used to mount a fresh wizard on Joomla. A new press (a design picked in
 *      the gallery) still moves the pill.
 *   S2 the Design system panel's cards wear the site's own words when the site has no
 *      `design-preview.json` (every site made straight from a quickstart): tracy-web's
 *      `GET /api/sites/:key/design-system/words` reads them off the home page the site serves now —
 *      name, menu, first heading, its lead, the first calls to action, never a language picker, a
 *      theme switch or a menu's "back" — kept two minutes per site, `present: false` when nothing
 *      could be read.
 *   S3 the panel says whose words its cards wear (the site's, from its home page or its Build file;
 *      or each system's sample text when nothing could be read), and the committed bundles carry it.
 *      Since feat/design-system-ui (12/10/2026) the cards show each system's own picture, and the
 *      site's own words are seen in the site preview (its home page wearing the system): S3 guards that.
 * No model, no stand, no database: the doors run on fakes, the client halves are pure.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()

const wiz = nodeTest(['test/wizard-draft.test.mjs', 'test/press-state.test.mjs'], {
  cwd: 'packages/site/tracy-add-site'
})
c.tapClean('add-site tests', wiz)
c.passes('S1', wiz, 'a return from Change design without a pick lands on the CMS and address picked by hand')
c.passes('S1', wiz, 'a new press wins over the draft: a design picked in the gallery moves the pill')
c.passes('S1', wiz, 'a created site forgets the draft: the next Add site is a clean form')
const wizardBundle = readFileSync(join(ROOT, 'packages/site/tracy-add-site/lib/client.js'), 'utf8')
// Minified: the wizard's start reads the kept draft (`initialPress` with `kept` → its platform and origin).
c.check(
  'S1 the committed add-site bundle starts from the kept draft',
  /\{platform:\w+\.platform,design:\w+\?\?\w+,origin:\w+\.origin\}/.test(wizardBundle)
)

const web = nodeTest(['apps/tracy-web/test/design-system-door.test.mjs'], {
  extra: ['--test-name-pattern=^words']
})
c.tapClean('tracy-web words door', web)
c.passes('S2', web, 'words: a home page gives the panel its name, heading, lead and calls to action')
c.passes('S2', web, 'words: kept per site for WORDS_TTL_MS')
c.passes('S2', web, 'words: a failing read, an empty page, or no reader at all is `present: false`')
c.passes('S2', web, 'words: a logo link names the site')

const di = nodeTest(['test/design-system-button.test.mjs'], {
  cwd: 'packages/design/tracy-design-inspiration'
})
c.tapClean('design-inspiration tests', di)
c.passes(
  'S2/S3',
  di,
  "the cards wear the site's own words read off its home page, and say whose words they are"
)
c.passes('S2', di, 'nothing read, a refusal or no connection: no words, and the cards keep the sample text')
const panelBundle = readFileSync(join(ROOT, 'packages/design/tracy-design-inspiration/lib/client.js'), 'utf8')
// Since feat/design-system-ui (12/10/2026, U4 A) the tab's cards show each system's own picture and
// name, so the panel no longer reads the words door; a site's own words are seen in the site preview
// instead: the popup frames the site's own home page wearing the system (tracy-web
// `GET /api/sites/:key/design-system/preview`, nothing written). The words door above still answers.
const site = nodeTest(['apps/tracy-web/test/design-system-site-preview-door.test.mjs'])
c.tapClean('tracy-web site preview door', site)
c.passes(
  'S3',
  site,
  'emdash, a viewer: the site home on its container, the apply bytes in, the worn slot out'
)
c.passes(
  'S3',
  site,
  'wordpress: the site home with its global styles block as the variation makes it, nothing written'
)
const reader = nodeTest(['test/site-preview-reader.test.mjs'], {
  cwd: 'packages/design/tracy-design-inspiration'
})
c.tapClean('site preview reader', reader)
c.passes(
  'S3',
  reader,
  'asks the site door with the system and the template the read answered; a page is ready'
)
c.check('S3 the committed panel bundle reads the site preview door', panelBundle.includes('}/preview?'))
c.check('S3 the committed panel bundle says whose words', panelBundle.includes('ds.words.'))

c.done()
