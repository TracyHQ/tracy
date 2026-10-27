/**
 * REG-PR-1171-quickstart-desktop-only: the web landing offers Tracy Desktop beside the zip, and the
 * app is sent to the template the web left waiting. Web and app never differ in features
 * (since 11/10/2026): the nudge is words and layout only.
 * S1: `isDesktopApp` reads the app's user-agent token and nothing else.
 * S2: the download door — every signed-in session streams the zip as before #1171; no session is 401.
 * S3: /new?template=<id> — on the web: Build, Download, then the app offer with the account to use,
 * the template left waiting with its platform; a release with no zip still offers the app; in the
 * app: Build and Download, no offer, the waiting row consumed; the root follows a waiting template
 * in the app only, and a fetch for the root never.
 * S4: migration 091 is present and the download door reads no user agent.
 * In-process with the suite's fakes — no stand, no network; the stand and app runs are the plan's
 * S5/S6 evidence (tasks/evidence/quickstart-desktop-only/).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, nodeTest } from './lib.mjs'
const c = checks()
const WEB = 'apps/tracy-web'
const files = (names) => names.map((n) => `test/${n}`)

const surface = nodeTest(files(['desktop-surface.test.mjs']), { cwd: WEB })
c.tapClean('S1: desktop surface', surface)
c.passes('S1', surface, 'the Tracy Desktop app is recognised by its TracyCowork/<version> token')
c.passes('S1', surface, 'a browser, a missing header and a token without a version are not the app')

const download = nodeTest(files(['quickstart-download.test.mjs']), { cwd: WEB })
c.tapClean('S2: quickstart download door', download, { noSkip: false })
c.passes('S2', download, 'no session → 401, and GitHub is never asked')
c.passes('S2', download, 'signed in → the exact bytes, streamed, with the download headers')

const landing = nodeTest(files(['template-intent.test.mjs']), { cwd: WEB })
c.tapClean('S3: template landing', landing)
c.passes(
  'S3',
  landing,
  'on the web, a signed-in person gets the same Build and Download, then the Tracy Desktop offer'
)
c.passes('S3', landing, 'on the web, a release with no quickstart zip still offers the app, after Build')
c.passes('S3', landing, 'in Tracy Desktop, a signed-in person lands on the page with Build and Download')
c.passes(
  'S3',
  landing,
  'in Tracy Desktop, a signed-in person with a template waiting is sent from the root to its page, once'
)
c.passes('S3', landing, 'in Tracy Desktop, a waiting template that names its platform opens that quickstart')
c.passes(
  'S3',
  landing,
  'on the web, the landing leaves the template waiting for the app, and the root does not follow it'
)
c.passes('S3', landing, 'a fetch for the root is never sent to the template page')

c.check(
  'S4: migration 091-desktop-intent-platform.sql present',
  existsSync(join(ROOT, WEB, 'src/db/migrations/091-desktop-intent-platform.sql'))
)
c.check(
  'S4: the download door reads no user agent',
  !readFileSync(join(ROOT, WEB, 'src/quickstarts/download.js'), 'utf8').includes('desktop-surface')
)
c.done()
