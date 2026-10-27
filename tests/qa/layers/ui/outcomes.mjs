// Product-screen outcomes: what a person must see on a screen of the running product, one row per
// observable outcome. The bench stories (the rest of this layer) show a component in isolation; a
// row here is a state of a real screen (the Add site wizard in dsh, a sign-in page, /ops) reached
// through real doors.
//
// Every row is PENDING today: this layer has no adapter that opens a product screen on a stand and
// measures it (`PRODUCT_ADAPTER_MISSING`, the same gap the switch `consumer` family names). The row
// still earns its place: it names the outcome, the independent source that states it, and where the
// same behaviour is measured meanwhile (a door scenario of the api layer, or a product test), so the
// day the adapter exists nothing has to be rediscovered. Data only; nothing here is a verdict.

const REG = (name) => `tests/regression/cases/${name}.json`
// The issue's Expected section and checklist, pinned as a copy in the repository.
const ISSUE_993 = 'tests/qa/oracles/signin/issue-993.md'
const CARD = 'packages/site/tracy-add-site/test/e2e/create-brief-sheet.test.mjs'
const API = (key) => `QA-API-scenario-${key}`

const QUESTIONS = {
  source: REG('REG-PR-998-add-site-questions-sheet'),
  owner: 'design review 07/10/2026 (#998, #1001)'
}
const PUBLISH = { source: REG('REG-PR-948-site-publish-flow'), owner: 'PR #948, #988' }
const SIGNIN = { source: ISSUE_993, owner: 'issue #993' }
const WAITLIST = { source: REG('REG-PR-972-ops-waitlist'), owner: 'PR #972' }
const UNDO = { source: REG('REG-PR-970-site-changes-undo'), owner: 'PR #970, #971' }

const row = (key, group, tag, title, oracle, ref, invariant, meanwhile) => ({
  key,
  group,
  tag,
  title,
  oracle: { ...oracle, ref, invariant },
  meanwhile
})

const DOM_TEST = 'packages/core/tracy-core/test/site-publish-dom.test.mjs'
const UNDO_TEST = 'packages/core/tracy-core/test/site-changes-undo-request.test.mjs'
const SWITCHES = {
  source: 'packages/core/tracy-core/src/ui-switches/catalogue.json',
  owner: 'CLAUDE.md §8 (29/09/2026)'
}
const TOOLBAR = { source: REG('REG-PR-971-undo-toolbar-sync'), owner: 'PR #971' }
const PEOPLE_DOCS = {
  source: 'apps/tracy-web/src/api-reference/routes/people.js',
  owner: 'the pinned API reference'
}

/** The four ways the questions sheet closes: each is its own press, so each is its own row. */
const CLOSE_WAYS = [
  ['done', 'Done'],
  ['x', 'the X'],
  ['scrim', 'a click on the scrim'],
  ['escape', 'Escape']
]
/** Each failed sign-in has its own sentence: reason -> [what happened, the door outcome that plays it]. */
const FAILURE_SENTENCES = [
  [
    'cancelled',
    'cancelled at the provider',
    `${API('signin-provider-cancelled')}, ${API('signin-github-cancelled')} (product FAIL on this tree)`
  ],
  [
    'stale-state',
    'a stale, expired or foreign state',
    `${API('signin-provider-state-expired')}, ${API('signin-provider-state-other-browser')}, ${API('signin-github-state-expired')}, ${API('signin-github-state-other-browser')}`
  ],
  [
    'refused-exchange',
    'a code exchange the provider refused',
    `${API('signin-provider-refuses')}, ${API('signin-github-refuses')}`
  ],
  [
    'unverified-email',
    'an address the provider has not verified',
    `${API('signin-provider-unverified-email')}, ${API('signin-github-unverified-email')}`
  ],
  ['malformed-link', 'a malformed /signin link', `${API('signin-link-malformed')}`],
  [
    'provider-not-offered',
    'a provider this deployment does not offer',
    `${API('signin-provider-not-offered')}, ${API('signin-github-not-offered')}`
  ]
]
/** The three sign-in pages whose text touched the card border (#993), one row per page. */
const CARD_PAGES = [
  ['signin-failure-page-layout', 'Sign-in failure page'],
  ['device-confirm-page-layout', 'Device sign-in confirm page'],
  ['device-approved-page-layout', 'Device sign-in approved page']
]

/** @type {ReturnType<typeof row>[]} */
export const OUTCOMES = [
  // ── Add site › Customize your site ───────────────────────────────────────────────────────────
  row(
    'questions-card-nothing-answered',
    'customize-site',
    'empty',
    'Customize your site card with nothing answered: the count of questions, the Optional tag, and a button named Open',
    QUESTIONS,
    "expect: \"[data-questions-card] … reading '4 questions' and 'Receive a site tailored to you.'\"",
    'the card reads "{total} questions" (never "0 answered"); its accessible name ends with Open',
    `${CARD} "the card sits quietly under the address: no popup, Create site ready, and the questions read for this template"`
  ),
  row(
    'questions-card-after-answers',
    'customize-site',
    'success',
    'Customize your site card after answers: "N of M answered", and the button is named Edit',
    QUESTIONS,
    'expect: three single lines and no answers on the card (since #1001)',
    'the card reads "{answered} of {total} answered" and never shows the answers themselves; its accessible name ends with Edit',
    `${CARD} "at <width>px the card is three single lines, before and after answering"`
  ),
  ...CLOSE_WAYS.map(([key, way]) =>
    row(
      `questions-sheet-closed-by-${key}`,
      'customize-site',
      'dialog-recovery',
      `The questions sheet closed by ${way}: the answers are kept and focus returns to the card`,
      QUESTIONS,
      'expect: "Done, the X, a click on [data-questions-scrim] and Escape each close it, keep the answers and give focus back to the card"',
      `${way} closes the sheet; reopened, it shows the answers given before; focus is on the card`,
      `${CARD} "<way> closes the sheet, keeps the answers, and gives focus back to the card"`
    )
  ),
  row(
    'questions-all-skipped',
    'customize-site',
    'empty',
    'Every question skipped: Create site is enabled and makes the site with no brief',
    QUESTIONS,
    'expect: "with nothing answered (or only spaces) the POST /api/sites body has no brief"',
    'Create site is never blocked by the questions and sends no brief when nothing was answered',
    `${CARD} "nothing answered: Create site makes the site at once with no brief, as it always did"`
  ),
  row(
    'questions-answers-sent',
    'customize-site',
    'success',
    'Create site with answers sends them with the hash of the set they answer',
    QUESTIONS,
    'expect: "Create site with answers sends brief = {answers: {…}, questionnaire: <64 hex>}"',
    'the request carries brief.answers and brief.questionnaire; an answer hidden by a condition does not travel',
    `${CARD} "Create site sends the answers with the hash of the set they answer; a hidden answer does not travel"; ${API('create-site-answers-reach-brief')} (PENDING) for the stored brief`
  ),
  row(
    'questions-tier-quickstart',
    'customize-site',
    'success',
    "The sheet asks the template's own questions when its quickstart carries a set",
    QUESTIONS,
    'questions_door: GET /api/sites/questions (tier: the quickstart’s own set)',
    'the questions drawn are the ones the door served for that template, not the CMS set',
    `${API('questions-quickstart-tier')}`
  ),
  row(
    'questions-tier-cms-default',
    'customize-site',
    'success',
    'The sheet asks the CMS default chosen in /ops when the template has no set of its own',
    QUESTIONS,
    'questions_door: GET /api/sites/questions (tier: the CMS default chosen in /ops)',
    'the questions drawn are the set an operator chose for that CMS',
    `${API('questions-cms-default-tier')} (PENDING)`
  ),
  row(
    'questions-tier-standard',
    'customize-site',
    'success',
    'The sheet asks the CMS standard set when neither the template nor /ops names one',
    QUESTIONS,
    'questions_door: GET /api/sites/questions (tier: the CMS standard file)',
    'the questions drawn are the standard file of that CMS',
    `${API('questions-standard-tier')}`
  ),
  row(
    'questions-template-changed-answers-kept',
    'customize-site',
    'dialog-recovery',
    'Template changed after answering: the answers the new set still asks are kept, and the sheet says how many',
    QUESTIONS,
    'expect: "Answers kept for this design: 1. Answers that no longer apply: 1."',
    'an answer whose question id the new set still asks, with a value it still offers, is still there and is counted as kept',
    `${CARD} "a change of template keeps the answers the new set still asks for, says so, and drops the rest"`
  ),
  row(
    'questions-template-changed-answers-dropped',
    'customize-site',
    'dialog-recovery',
    'Template changed after answering: the answers the new set does not ask are gone, and the sheet says how many no longer apply',
    QUESTIONS,
    'expect: "Answers kept for this design: 1. Answers that no longer apply: 1."',
    'an answer the new set does not ask, or whose value it no longer offers, is dropped, counted as no longer applying, and never sent',
    `${CARD} "a change of template keeps the answers the new set still asks for, says so, and drops the rest"`
  ),
  row(
    'questions-platform-changed',
    'customize-site',
    'dialog-recovery',
    'Platform changed after answering: the sheet asks the new CMS’s questions and says which answers no longer apply',
    QUESTIONS,
    'questions_door: GET /api/sites/questions (asked again for the new platform)',
    'after the platform changes the card counts the new set; answers of the old CMS that the new set does not ask are dropped and said so',
    'no product test changes the platform after answering; the door half is the three tier scenarios of the api layer'
  ),
  row(
    'questions-load-failed-card',
    'customize-site',
    'error',
    'The questions fail to load: the card says so and offers Try again',
    QUESTIONS,
    'expect: "A 503 from GET /api/sites/questions shows [data-questions-card=\\"failed\\"] with Try again …"',
    'a failed load is an alert on the card with a retry that asks the door again',
    `${CARD} "when the questions cannot load the card says so, and Create site makes the site at once without a brief"`
  ),
  row(
    'questions-load-failed-create-still-works',
    'customize-site',
    'error',
    'The questions fail to load: Create site stays enabled and makes the site without a brief',
    QUESTIONS,
    'expect: "… and Create site still posts without a brief"',
    'with the questions failed Create site is enabled and the request carries no brief',
    `${CARD} "when the questions cannot load the card says so, and Create site makes the site at once without a brief"`
  ),
  row(
    'questions-stale-answer',
    'customize-site',
    'loading',
    'An older questions answer that arrives after a newer one changes nothing on the card',
    QUESTIONS,
    'selectors.questions_door',
    'the card and sheet show the questions of the template chosen last, whatever order the answers arrive in',
    'no product test: guarded by `live` in packages/site/tracy-add-site/src/client/wizard.tsx'
  ),
  row(
    'rewrite-writes',
    'customize-site',
    'success',
    'AI rewrite, offered on the long-text question only, replaces the sentence with the rewritten one',
    QUESTIONS,
    'selectors.sheet; product test "AI rewrite is offered on the long-text question and not on the others; Undo puts the words back"',
    'the button is on the long-text question and on no other; after a press the field holds the rewritten text',
    `${CARD} (that test); ${API('rewrite-writes')} for the door`
  ),
  row(
    'rewrite-undo',
    'customize-site',
    'dialog-recovery',
    'After an AI rewrite, Undo puts the customer’s own words back',
    QUESTIONS,
    'selectors.sheet; product test "… Undo puts the words back"',
    'Undo appears only after a rewrite and restores the text exactly as typed',
    `${CARD} (that test)`
  ),
  row(
    'rewrite-stale-answer',
    'customize-site',
    'loading',
    'A rewrite that answers after the questions changed is not written into the new set',
    QUESTIONS,
    'selectors.sheet',
    'a rewrite asked for one questionnaire never lands in a field of another, and offers no Undo there',
    'no product test: guarded in packages/site/tracy-add-site/src/client/questions-sheet.tsx'
  ),
  row(
    'rewrite-not-switched-on',
    'customize-site',
    'disabled',
    'AI rewrite on a deployment with no model: a sentence beside the button says it is not switched on, the text unchanged',
    QUESTIONS,
    'selectors.sheet; product test "a rewrite the door refuses with 503 … says so beside the button and leaves the words as typed"',
    'a 503 shows its own sentence, leaves the text as typed, offers no Undo and re-enables the button',
    `${API('rewrite-not-switched-on')} for the door`
  ),
  row(
    'rewrite-limit-reached',
    'customize-site',
    'error',
    'AI rewrite over its hourly limit: a sentence beside the button says to try later, the text unchanged',
    QUESTIONS,
    'selectors.sheet; product test "a rewrite the door refuses with … 429 says so beside the button and leaves the words as typed"',
    'a 429 shows its own sentence, leaves the text as typed, offers no Undo and re-enables the button',
    `${API('rewrite-limit-reached')} for the door`
  ),
  row(
    'rewrite-failed',
    'customize-site',
    'error',
    'AI rewrite failed: a sentence beside the button says it did not work, the text unchanged',
    QUESTIONS,
    'selectors.sheet',
    'a 502 shows its own sentence, leaves the text as typed, offers no Undo and re-enables the button',
    `${API('rewrite-failed')} for the door; the failed sentence in a browser has no product test`
  ),
  ...[
    ['fr', 'French', 'packages/locale/tracy-locales/fr/tracy-add-site.json'],
    ['vi', 'Vietnamese', 'packages/locale/tracy-locale-vi/vi/tracy-add-site.json']
  ].map(([lang, name, file]) =>
    row(
      `questions-in-${lang}`,
      'customize-site',
      'language-theme-viewport',
      `The card and sheet with the interface in ${name}: every word translated, nothing cut`,
      QUESTIONS,
      `spec #730 (every language in Settings › Language complete); ${file}`,
      `with the interface language set to ${lang} the card and sheet show the translated strings and question labels, on one line each`,
      `${CARD} "in <lang> at <width>px line 1 stays one line with the Optional tag whole" (layout only, with injected strings)`
    )
  ),
  // ── Publish and own domain ───────────────────────────────────────────────────────────────────
  row(
    'publish-draft-shows-publish',
    'publish',
    'success',
    'Site settings of a draft site: the state reads Draft and the one button is Publish',
    PUBLISH,
    "selectors: [data-section='domains'] [data-action='live']",
    'a draft site shows Publish and no Back to draft',
    `${API('publish-live-then-back-to-draft')}; ${DOM_TEST} (jsdom)`
  ),
  row(
    'publish-running-shows-no-second-press',
    'publish',
    'loading',
    'While the host works on a publish the section shows the running state and no button to press again',
    PUBLISH,
    "selectors: [data-section='domains']",
    'a running operation shows its state and neither Publish nor Back to draft',
    `${API('publish-double-press')}; ${DOM_TEST} (jsdom)`
  ),
  row(
    'publish-live-shows-back-to-draft',
    'publish',
    'success',
    'Site settings of a live site: the state reads Live and the one button is Back to draft',
    PUBLISH,
    "selectors: [data-section='domains'] [data-action='draft']",
    'a live site shows Back to draft and no Publish',
    `${API('publish-live-then-back-to-draft')}; ${DOM_TEST} (jsdom)`
  ),
  ...['Developer', 'Editor'].map((role) =>
    row(
      `publish-no-button-for-${role.toLowerCase()}`,
      'publish',
      'permission',
      `${role === 'Editor' ? 'An' : 'A'} ${role} sees the publish state and no button they would be refused`,
      PUBLISH,
      'title: "…and no button a role would be refused"',
      `a ${role} seat reads the state and gets no Publish or Back to draft button`,
      `${API('publish-roles')}; packages/site/tracy-my-sites/test/site-publish-dom.test.mjs`
    )
  ),
  row(
    'connect-domain-owner-has-the-button',
    'own-domain',
    'permission',
    'The Owner is offered Connect domain and, after connecting, the TXT value that proves the domain',
    PUBLISH,
    "selectors: [data-card='own-domain'], [data-action='check-dns'|'connect-live'|'remove-domain']",
    'the Owner has the Connect button, the DNS records to set and the check, connect and remove actions',
    `${API('domain-connect-owner')}; ${DOM_TEST}`
  ),
  row(
    'connect-domain-non-owner-sees-state-only',
    'own-domain',
    'permission',
    'A seat that is not the Owner sees the domain and its state, never its proof and no Connect button',
    PUBLISH,
    "selectors: [data-card='own-domain']",
    'an Admin, Developer or Editor has no Connect button and no TXT value; an Admin with a verified domain gets only the publish action',
    `${API('domain-connect-non-owner')}; ${DOM_TEST} "a seat that is not the Owner sees the domain and its state…"`
  ),
  row(
    'connect-domain-switch-off-hides-the-button',
    'own-domain',
    'permission',
    'With the switch site-connect-domain off the Connect button is hidden',
    SWITCHES,
    'switch `site-connect-domain`',
    'the element holding the Connect button is not displayed while the id is in data-tracy-hide',
    `${API('domain-switch-off')}; QA-UI-site-connect-domain-switch-binding / -consumer; ${DOM_TEST} "an operator can hide the way in…"`
  ),
  row(
    'connect-domain-switch-off-keeps-existing-domain',
    'own-domain',
    'permission',
    'With the switch site-connect-domain off a domain the site already has stays visible with its state',
    SWITCHES,
    'switch `site-connect-domain`',
    'the own-domain card of a site that has a domain is outside the hidden element and still drawn',
    `${API('domain-switch-off')}; ${DOM_TEST} "an operator can hide the way in…"`
  ),
  ...[
    ['waiting', 'not there yet', 'waiting, with the record to set', 'domain-dns-missing'],
    ['wrong', 'points somewhere else', 'wrong, with what the lookup found', 'domain-dns-wrong-record'],
    ['verified', 'is right', 'verified', 'domain-dns-right-record']
  ].map(([state, what, shows, door]) =>
    row(
      `domain-card-dns-${state}`,
      'own-domain',
      state === 'verified' ? 'success' : state === 'wrong' ? 'error' : 'loading',
      `The own-domain card when a DNS record ${what}: the record reads ${shows}`,
      PUBLISH,
      `selectors: data-domain-state: ${state}`,
      `the card state is ${state} exactly when the last lookup said so; nothing reads verified before a lookup did`,
      `${API(door)}`
    )
  ),
  row(
    'domain-already-taken-message',
    'own-domain',
    'error',
    'A domain another site holds is refused in the form with a sentence, and nothing is saved',
    PUBLISH,
    'part 2 (own domain)',
    'the form says the name is taken and stays open with what was typed',
    `${API('domain-already-taken')}`
  ),
  row(
    'delete-while-publishing-message',
    'publish',
    'error',
    'Delete site pressed while a publish runs says the site is busy and deletes nothing',
    PUBLISH,
    '"a site is not deleted beside an operation of its own"',
    'the dialog reports the running operation and the site stays in My Sites',
    `${API('delete-while-publishing')}`
  ),
  // ── Sign-in ──────────────────────────────────────────────────────────────────────────────────
  ...[
    ['wrong', 'a wrong code'],
    ['expired', 'an expired code'],
    ['reused', 'a code that was already used']
  ].map(([key, what]) =>
    row(
      `signin-code-step-${key}-code`,
      'sign-in',
      'error',
      `Sign-in page, code step: ${what} shows "That code did not work" as an alert, with the address kept`,
      SIGNIN,
      'Email code: request, wrong code, expired code, reused code',
      `after ${what} the code step is drawn again with the error announced (role=alert), the address kept and nobody signed in`,
      `${API(`signin-code-${key}`)}; product test "POST /verify with a plain form body and a wrong code re-renders step two with role=\\"alert\\""`
    )
  ),
  ...FAILURE_SENTENCES.map(([key, what, doors]) =>
    row(
      `signin-failure-sentence-${key}`,
      'sign-in',
      'error',
      `Sign-in failure page after ${what}: its own sentence, in each interface language`,
      SIGNIN,
      'Every failure page: the right sentence for the reason, in each interface language',
      `${what} reads the sentence of that reason and of no other, translated in en, vi, de, it, fr, nl, zh and es, showing nothing the provider sent`,
      doors
    )
  ),
  ...CARD_PAGES.map(([key, page]) =>
    row(
      key,
      'sign-in',
      'language-theme-viewport',
      `${page}: the text sits inside the padded card, in both themes and on a narrow viewport`,
      SIGNIN,
      'Expected: "All three pages have their text inside a padded card part, in both themes and on a narrow viewport; no nested <main>"',
      'heading and paragraph do not touch the card border; no nested <main>; holds in light and dark and at 390 px',
      'no product test measures it; the bench story sign-in-error is measured by this layer for overflow and console only'
    )
  ),
  row(
    'signin-failure-page-way-back',
    'sign-in',
    'dialog-recovery',
    'The failure page has one link, Back to sign in, and a retry through it ends where the person was going',
    SIGNIN,
    '`next` handling: a retry from the failure page ends where the person was going',
    'following the link and signing in lands on the original destination',
    `${API('signin-failure-page-way-back')}`
  ),
  row(
    'signin-failure-page-off-origin-next',
    'sign-in',
    'error',
    'A sign-in that was going to another origin: the failure page leads back to plain sign in, and the address is nowhere on it',
    SIGNIN,
    '`next` handling: … an off-origin `next` is dropped',
    'the way back carries no destination and the off-origin address is not on the page',
    `${API('signin-failure-page-way-back')}`
  ),
  row(
    'signin-session-kept-after-reload',
    'sign-in',
    'success',
    'A signed-in person stays signed in after a reload',
    SIGNIN,
    'follow-up: "a full sign-in flow, not only the happy path"',
    'a reload shows the same account and no sign-in page',
    `${API('signin-session-after-reload')}`
  ),
  row(
    'signin-signout-returns-to-sign-in',
    'sign-in',
    'success',
    'Sign out returns the person to the sign-in page, and the workspace is no longer reachable without signing in',
    SIGNIN,
    'follow-up: "a full sign-in flow, not only the happy path"',
    'after Sign out the sign-in page is shown and opening the workspace address asks to sign in',
    `${API('signin-signout')}`
  ),
  row(
    'device-confirm-page',
    'sign-in',
    'success',
    'Device sign-in, confirm page: the address that would be signed in, what the requesting device said about itself, and one Approve button',
    PEOPLE_DOCS,
    'GET /signin; issue #993 checklist: "Device sign-in: confirm page, approved page, invalid link"',
    'the page names the address and the device as text and has one button; opening it approves nothing',
    `${API('signin-device-confirm-page')}`
  ),
  row(
    'device-approved-page',
    'sign-in',
    'success',
    'Device sign-in, approved page: after Approve the page says the sign-in was approved for that address, with nothing left to press',
    PEOPLE_DOCS,
    'POST /signin/approve; issue #993 checklist: "Device sign-in: confirm page, approved page, invalid link"',
    'the page names the address, shows no button, and the device that asked is let in',
    `${API('signin-device-approved')}`
  ),
  row(
    'device-invalid-link-page',
    'sign-in',
    'error',
    'Device sign-in, invalid link: an expired or already-approved round says so and offers no Approve button',
    PEOPLE_DOCS,
    'GET /signin (400 when the round expired or was already approved); issue #993 checklist: "invalid link"',
    'the page says the round has expired or was already approved and has no approve form',
    `${API('signin-device-invalid-link')}, ${API('signin-link-malformed')}`
  ),
  // ── Waitlist, undo ───────────────────────────────────────────────────────────────────────────
  row(
    'waitlist-tiles',
    'waitlist',
    'success',
    '/ops › Beta › Waitlist: four tiles (On the list, Turned away, Sent the form, Signed in later) with the counts of the window',
    WAITLIST,
    'S3: "tiles On the list 4 (1 both), Turned away 2, Sent the form 3, Signed in later 1"',
    'the four tiles show the totals the door answered for the window',
    `${API('waitlist-staff-list')}; REG-PR-972 drives the built /ops in Chrome`
  ),
  row(
    'waitlist-rows',
    'waitlist',
    'success',
    '/ops › Waitlist: one row per address, with the form answers, its source, the mail status and a later sign-in',
    WAITLIST,
    'S3: "rows linh, held, old-form, came-in in that order; linh reads … source \'from pricing plan-card\', mail sent"',
    'each address is one row, in the order of the door, with its answers, cleaned source, mail status and sign-in time',
    `${API('waitlist-staff-list')}; REG-PR-972 drives the built /ops in Chrome`
  ),
  row(
    'waitlist-window-switch',
    'waitlist',
    'success',
    '/ops › Waitlist: switching the window to 7 days reads the list again for that window',
    WAITLIST,
    'S3: "switch to 7 days … 7 days still lists four"',
    'the pressed window is the one the tiles and rows are for',
    'REG-PR-972 drives the built /ops in Chrome'
  ),
  row(
    'waitlist-empty-window',
    'waitlist',
    'empty',
    '/ops › Waitlist with nobody in the window: zero on every tile and no row',
    WAITLIST,
    'S3 (the tiles and rows are the door’s answer); product test "waitlist: nobody in the window answers an empty list"',
    'an empty window shows zero totals and never a row; its wording has no approved source yet',
    `${API('waitlist-empty-window')}`
  ),
  row(
    'waitlist-read-only-seat',
    'waitlist',
    'permission',
    '/ops › Waitlist: a read-only staff seat (developer) reads the same list',
    WAITLIST,
    'S4: "four rows for the read-only developer seat"',
    'a developer seat of tracy_admin sees the tiles and every row',
    'REG-PR-972 S4'
  ),
  row(
    'waitlist-not-staff',
    'waitlist',
    'permission',
    '/ops › Waitlist: an account with no staff seat never sees the screen or a row',
    WAITLIST,
    'S5: "403 with an empty body"',
    'an account without a tracy_admin seat gets no screen and no rows',
    `${API('waitlist-not-staff')}`
  ),
  row(
    'undo-one-button',
    'review-undo',
    'success',
    'Site changes: an opened chat row has one undo button',
    UNDO,
    'run.tests: "an opened Chat row has ONE undo button; the dialog says what goes back; Undo calls the engine"',
    'one undo path per chat request: no second "Undo file changes" in its menu or detail',
    `${UNDO_TEST} (node, no browser)`
  ),
  row(
    'undo-dialog-says-what-goes-back',
    'review-undo',
    'dialog-recovery',
    'Site changes: the undo dialog says what goes back, in the words of the chat card, before anything is undone',
    UNDO,
    'run.tests: "an opened Chat row has ONE undo button; the dialog says what goes back; Undo calls the engine"',
    'the dialog names what the undo reverts; nothing is undone until it is confirmed',
    `${UNDO_TEST}; ${API('turn-undo-doors')}`
  ),
  row(
    'undo-blocked',
    'review-undo',
    'error',
    'Site changes: a blocked request says who changed what and when, offers Ask Tracy to revert, and no undo',
    UNDO,
    'run.tests: "blocked: the chat card’s sentence with who, what and when, and Ask Tracy to revert; no undo"',
    'a blocked row has no undo button and reads the sentence with who, what and when',
    UNDO_TEST
  ),
  row(
    'undo-older-request',
    'review-undo',
    'dialog-recovery',
    'Site changes: an older request offers Go back to before this request and names the later requests that go back with it',
    UNDO,
    'run.tests: "an older request: Go back to before this request, scope from-here, the later requests named"',
    'the dialog of an older request lists every later request that is undone with it',
    UNDO_TEST
  ),
  row(
    'undo-row-reads-undone',
    'review-undo',
    'success',
    'After an undo the row reads Undone in place of the files status, with no undo button',
    TOOLBAR,
    'expect: "a request the engine undid: one \\"Undone\\" label in place of the files status, no undo button"',
    'an undone request shows one Undone label and no undo button',
    'packages/ui/tracy-chat-input/test/undo-toolbar.test.mjs, turn-undo-sync.test.mjs'
  ),
  row(
    'undo-row-reads-partly-undone',
    'review-undo',
    'error',
    'After an undo that could not put everything back the row does not read Undone',
    UNDO,
    'no approved wording: the regression cases state the Undone label only; what a partly undone request reads is in product code alone (packages/core/tracy-core/src/site-tabs/UndoRequestDialog.tsx)',
    'a request undone in part is never shown as fully undone',
    'no product test in a browser; the flows layer names it (QA-FLOWS-review-undo-retry-partial-undo)'
  ),
  row(
    'undo-toolbar-follows',
    'review-undo',
    'success',
    'After an undo from Site changes the chat toolbar’s undo button follows without a reload',
    TOOLBAR,
    'expect: "an undo said by another door of this site: the list and the engine read again, no echo"',
    'the toolbar reads the engine again and shows the state after the undo',
    'packages/ui/tracy-chat-input/test/undo-toolbar.test.mjs, turn-undo-sync.test.mjs'
  ),
  row(
    'undo-preview-follows',
    'review-undo',
    'success',
    'After an undo the site preview reloads and shows the site as it was before the request',
    { source: REG('REG-PR-968-undo-preview-reload'), owner: 'PR #968' },
    'expect',
    'the preview reloads once after the undo, with no manual refresh',
    'vendor/tracy/dsh-better-sidebar/tests/refresh-progress.spec.ts'
  )
]

/** Why none of these is measured yet, said once. */
export const OUTCOME_GAP =
  'PRODUCT_ADAPTER_MISSING: this layer measures bench stories and the switch module; no adapter opens a product screen on a stand (dsh plugin page, sign-in page, /ops) and measures it'
