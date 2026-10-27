/**
 * REG-037: a refusal reaches the person as a sentence with a next step. Runs the three steps of the
 * case: S1 the four `error-next-step` suites, S2 the card markup of the one-card identity pages, S3
 * the same pages measured in a real browser (both themes, 1280px and 360px). Each must exit 0 with
 * 0 failures and 0 skipped, and every test the case names for the cancelled sign-in and the card
 * layout must pass: a renamed or deleted test is a failed check, not a quiet green.
 *
 * `SIGNIN_EVIDENCE_DIR` (optional) is passed on to S3, which then writes its screenshots there.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

const s1 = nodeTest([
  'apps/tracy-web/test/error-next-step.test.mjs',
  'packages/core/tracy-core/test/error-next-step.test.mjs',
  'packages/site/tracy-add-site/test/error-next-step.test.mjs',
  'packages/site/tracy-my-sites/test/error-next-step.test.mjs'
])
c.tapClean('S1', s1)
c.passes(
  'S1',
  s1,
  'My Sites resolution focuses the app tab through its supplied opener without opening a browser page',
  1,
  true
)
for (const name of [
  'F-S1-002: a callback with no state, a mismatched cookie or no code is a page with a way back',
  'F-S1-002: an expired or replayed state is refused with the same page',
  'F-S1-002: a fetch caller keeps the machine answer',
  'F-S1-002: a hostile `next` never becomes the way back',
  'F-S1-002: a sign-in cancelled at Google says so, with a way back',
  'F-S1-002: a sign-in cancelled at GitHub says so, with a way back',
  'F-S1-002: a cancelled sign-in keeps 400 and OAUTH_STATE_INVALID for a fetch caller',
  'F-S1-002: a cancellation consumes the state',
  'F-S1-002: only `error=access_denied`, once and exactly, with no code is a cancellation',
  'F-S1-002: a callback that carries a code is exchanged as before',
  'F-S1-002: `error=access_denied` never gets past the state check',
  'F-S1-002: a cancelled sign-in with a hostile `next` leads back to Tracy only'
])
  c.passes('S1', s1, name, 1)

const s2 = nodeTest(['apps/tracy-web/test/identity-pages-card.test.mjs'])
c.tapClean('S2', s2)
for (const name of [
  'the shell pads the parts of a card, not the card itself',
  'signInFailedPage cancelled google: every word is inside a padded card part, under one main',
  'signInFailedPage cancelled github: every word is inside a padded card part, under one main',
  'signInFailedPage state google: every word is inside a padded card part, under one main',
  'deviceConfirmPage with a device: every word is inside a padded card part, under one main',
  'deviceConfirmPage with no device: every word is inside a padded card part, under one main',
  'deviceApprovedPage approved: every word is inside a padded card part, under one main',
  'deviceApprovedPage refused: every word is inside a padded card part, under one main',
  'deviceApprovedPage approved for the desktop app: every word is inside a padded card part, under one main',
  'deviceApprovedPage refused for the desktop app: every word is inside a padded card part, under one main',
  'desktopConfirmPage with a device: every word is inside a padded card part, under one main',
  'desktopConfirmPage with no device: every word is inside a padded card part, under one main',
  'deviceDeniedPage: every word is inside a padded card part, under one main',
  'every interface language draws the same padded structure',
  'signInFailedPage: the cancelled sentence names the provider by its brand and keeps the way back',
  'signInFailedPage: a reason or a provider it does not know is the state sentence and no name',
  'signInFailedPage: a hostile next never becomes the way back',
  'deviceConfirmPage: the form still posts the nonce to /signin/approve',
  'deviceApprovedPage: approved names the fenced address',
  'desktopConfirmPage: Approve and Deny each post the nonce to their own door',
  'deviceApprovedPage: a desktop round is sent back to the app'
])
  c.passes('S2', s2, name, 1)

const s3 = nodeTest(['apps/tracy-web/test/e2e/signin-cancelled-page.test.mjs'])
c.tapClean('S3', s3, { pass: 9, tests: 9 })
for (const page of [
  'signin-failed',
  'device-confirm',
  'device-confirm-unknown-device',
  'device-approved',
  'device-approved-error',
  'desktop-confirm',
  'desktop-confirm-unknown-device',
  'desktop-approved',
  'device-denied'
])
  c.passes(
    'S3',
    s3,
    `${page}: text sits inside the card in both themes, at 1280px and 360px, with one main`,
    1,
    true
  )

const importProblems = nodeTest(['packages/site/tracy-add-site/test/import-problems.test.mjs'])
c.tapClean('Import problems', importProblems)
c.passes(
  'Import problems',
  importProblems,
  'WordPress plugin-upload access refusals show WordPress install guidance',
  1,
  true
)

c.passes(
  'Import problems',
  importProblems,
  'all resolution cases keep panel actions inside Tracy and web destinations in new tabs',
  1,
  true
)
for (const name of [
  'the website timeout gives three numbered steps without an action inside its guidance',
  'an import already running explains the safeguard once without repeating the Follow it action',
  'a single step is a paragraph while choices keep bullets and multiple steps keep numbers',
  'every interface locale preserves each guidance destination independently of translated wording',
  'semantic links resolve only known destinations and never trust translated URL attributes',
  'join guidance uses only safe local paths and stays text while no join destination exists'
])
  c.passes('Import parity', importProblems, name, 1, true)

const importWizard = nodeTest(['packages/site/tracy-add-site/test/e2e/add-site-wizard.test.mjs'], {
  extra: ['--test-timeout=60000']
})
c.tapClean('Import wizard', importWizard)
c.passes('Import wizard', importWizard, 'wizard renders an import handover and a failed build', 1, true)
c.done()
