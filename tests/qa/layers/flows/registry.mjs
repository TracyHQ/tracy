// The flow table: what the layer is responsible for and how each obligation is served.
// Data only. `generate.mjs` turns it, together with what it extracts from the code
// (tests/e2e-dev JOURNEYS, CONTEXT.md §6 capabilities, the doors the journeys call), into
// denominator.json and cases/*.json. Nothing here is a verdict.
//
// Scenario kinds:
//   scripted  — run by this layer's own driver (scenarios.mjs) against the stand; needs a
//               red proof (a recorded mutation of product code, fixtures/flows/mutations.json)
//   legacy    — served by one journey of tests/e2e-dev through the adapter (adapter/legacy.mjs)
//   pilot     — served by the generalised publish pilot driver (drivers/)
//   pending   — not scripted; named, with the reason

/** Tags every item must carry (plan §3, "Every item") and the flow tags (plan §3, "Flow"). */
export const COMMON_TAGS = Object.freeze([
  'happy',
  'empty',
  'invalid',
  'boundary',
  'dependency-failure',
  'repeat',
  'cleanup'
])
export const FLOW_TAGS = Object.freeze([
  'new-returning',
  'role-change',
  'double-submit',
  'reload-resume',
  'back-navigation',
  'retry',
  'concurrent-seat',
  'interrupted',
  'rollback',
  'cleanup'
])
export const ALL_FLOW_TAGS = Object.freeze([...new Set([...COMMON_TAGS, ...FLOW_TAGS])])

const CTX = 'CONTEXT.md'
const sc = (tag, variant, kind, ref, extra = {}) => ({ tag, variant, kind, ref, ...extra })
const pending = (tag, variant, reason) => sc(tag, variant, 'pending', null, { reason })
/** Where the door half of a flow outcome is played for real: a door scenario of the api layer. */
const API = (key) => `the door outcome is played in the api layer (QA-API-scenario-${key})`
const REG = (name) => `tests/regression/cases/${name}.json`
// The issue's Expected section and checklist, pinned as a copy in the repository.
const ISSUE_993 = 'tests/qa/oracles/signin/issue-993.md'

/**
 * @type {{ key: string, title: string, capability: string, journeys: string[],
 *   oracle: { source: string, ref: string, invariant: string },
 *   effects: Record<string, any>, scenarios: ReturnType<typeof sc>[] }[]}
 */
export const FLOWS = [
  {
    key: 'signin-code',
    title: 'Sign in by emailed code',
    capability: 'identity',
    journeys: ['J0', 'J1'],
    oracle: {
      source: 'apps/tracy-web/src/api-reference/routes/people.js',
      ref: 'POST /login, POST /verify, GET /auth/me (pinned API reference)',
      invariant:
        'a code read from the mail sink, posted to /verify, sets one session cookie that /auth/me names; a wrong or replayed code sets none'
    },
    effects: { reads: ['mail-sink', 'db'], writes: ['account', 'session'], mail: true },
    scenarios: [
      sc('happy', 'code-from-sink', 'scripted', 'signin-happy'),
      sc('invalid', 'wrong-code', 'scripted', 'signin-wrong-code'),
      sc('repeat', 'replay', 'scripted', 'signin-replay'),
      sc('new-returning', 'both', 'scripted', 'signin-new-returning'),
      pending(
        'dependency-failure',
        'no-mailbox',
        'a missing or unreadable mail sink is reported ENV with its probe (layer selftest), not a product case'
      ),
      sc('happy', 'legacy-cookie', 'legacy', 'J0'),
      sc('happy', 'legacy-code-half', 'legacy', 'J1'),
      pending(
        'boundary',
        'code-length',
        'not scripted: 5- and 7-digit codes need the spec of the verify door'
      ),
      pending(
        'reload-resume',
        'cookie-persists',
        'not scripted: J12 covers a reload in a browser, which needs the local browser transport'
      ),
      pending('double-submit', 'two-verify', 'not scripted'),
      pending('interrupted', 'abandoned-login', 'not scripted'),
      pending(
        'boundary',
        'expired-code',
        `not scripted on a stand (a stand has no clock to move): ${API('signin-code-expired')}`
      ),
      pending(
        'concurrent-seat',
        'link-opened-on-another-device',
        'no approved expectation: the sign-in letter carries a code and no link, and the verify door binds a code to no device (QA-API-scenario-signin-link-other-device); the device sign-in pages need two browser contexts'
      ),
      pending('cleanup', 'sign-out', `not scripted on a stand: ${API('signin-signout')}`),
      pending(
        'new-returning',
        'waitlisted-address',
        'not scripted: needs the beta gate on and its membership service; covered by the product tests of apps/tracy-web/test/error-next-step.test.mjs (F-S1-013)'
      ),
      pending('empty', 'no-email', 'not scripted')
    ]
  },
  {
    key: 'signin-oauth',
    title: 'Sign in with OAuth',
    capability: 'identity',
    journeys: [],
    oracle: {
      source: ISSUE_993,
      ref: 'Google and GitHub: success, cancelled at the provider, stale/expired state, state from another browser, refused code exchange, unverified email, provider not offered on this deployment, malformed /signin link',
      invariant:
        'sign-in by a provider reaches the same session as the code; every way it can fail signs nobody in and leads back to sign in'
    },
    effects: { reads: [], writes: ['session'], mail: false },
    // One row per provider and outcome of the #993 checklist: a PENDING that names "a provider" would
    // not say which of the two exchanges was ever played.
    scenarios: [
      pending(
        'happy',
        'google-success',
        `not scripted: no OAuth provider credentials or callback exist on a local stand, and none was probed; ${API('signin-provider-success')}, with a provider double`
      ),
      pending(
        'happy',
        'github-success',
        `not scripted: no GitHub OAuth app exists for a local stand, and none was probed; ${API('signin-github-success')}, with a provider double`
      ),
      pending(
        'interrupted',
        'google-cancelled-at-the-provider',
        `not scripted on a stand (needs Google's own cancel screen): ${API('signin-provider-cancelled')} — a product FAIL on this tree, the fix of #993 is not merged`
      ),
      pending(
        'interrupted',
        'github-cancelled-at-the-provider',
        `not scripted on a stand (needs GitHub's own cancel screen): ${API('signin-github-cancelled')} — a product FAIL on this tree, the fix of #993 is not merged`
      ),
      pending(
        'boundary',
        'google-expired-state',
        `not scripted on a stand (a stand has no clock to move): ${API('signin-provider-state-expired')}`
      ),
      pending(
        'boundary',
        'github-expired-state',
        `not scripted on a stand (a stand has no clock to move): ${API('signin-github-state-expired')}`
      ),
      pending(
        'concurrent-seat',
        'google-state-from-another-browser',
        `not scripted on a stand (needs a second browser context and a provider): ${API('signin-provider-state-other-browser')}`
      ),
      pending(
        'concurrent-seat',
        'github-state-from-another-browser',
        `not scripted on a stand (needs a second browser context and a provider): ${API('signin-github-state-other-browser')}`
      ),
      pending(
        'dependency-failure',
        'google-refused-code-exchange',
        `not scripted on a stand (a real provider cannot be made to refuse on demand): ${API('signin-provider-refuses')}`
      ),
      pending(
        'dependency-failure',
        'github-refused-code-exchange',
        `not scripted on a stand (a real provider cannot be made to refuse on demand): ${API('signin-github-refuses')}`
      ),
      pending(
        'invalid',
        'google-unverified-email',
        `not scripted on a stand (needs a Google account with an unverified address): ${API('signin-provider-unverified-email')}`
      ),
      pending(
        'invalid',
        'github-unverified-email',
        `not scripted on a stand (needs a GitHub account with an unverified primary address): ${API('signin-github-unverified-email')}`
      ),
      pending(
        'invalid',
        'google-not-offered',
        `not scripted on a stand: ${API('signin-provider-not-offered')}`
      ),
      pending(
        'invalid',
        'github-not-offered',
        `not scripted on a stand: ${API('signin-github-not-offered')}`
      ),
      pending(
        'invalid',
        'malformed-signin-link',
        `not scripted on a stand (the stand driver has no step that opens a page as a navigation and reads it): ${API('signin-link-malformed')}`
      ),
      pending(
        'back-navigation',
        'failure-page-and-its-way-back',
        `not scripted on a stand: ${API('signin-failure-page-way-back')}; the look of the page (padding, both themes, narrow viewport, each language) is a ui-layer outcome and needs a browser`
      ),
      pending(
        'happy',
        'device-confirm-page',
        `not scripted: on a stand the round is opened by a site's dsh and the page is read in a browser, and the stand driver has neither; ${API('signin-device-confirm-page')}`
      ),
      pending(
        'happy',
        'device-approved-page',
        `not scripted: needs the dsh that opened the round to be let in after the press, in a second browser context; ${API('signin-device-approved')}, ${API('signin-device-approve-refused')}`
      ),
      pending(
        'invalid',
        'device-invalid-link',
        `not scripted on a stand (a stand has no clock to move past the round's fifteen minutes): ${API('signin-device-invalid-link')}`
      )
    ]
  },
  {
    key: 'team-invite',
    title: 'Invite, accept, decline, revoke',
    capability: 'team',
    journeys: ['J6'],
    oracle: {
      source: 'docs/adr/0001-seat-door-and-enforcement-boundary.md',
      ref: 'seat book and ADR 0028: an Owner or an Editor invites, as Viewer or Editor; a Viewer invites nobody',
      invariant:
        'an invitation exists for the invited address only; accept makes the seat, decline and revoke leave none; a viewer cannot invite'
    },
    effects: { reads: ['db'], writes: ['seat'], mail: true },
    scenarios: [
      sc('happy', 'invite-accept', 'scripted', 'team-invite-accept'),
      sc('happy', 'invite-decline', 'scripted', 'team-invite-decline'),
      sc('rollback', 'revoke', 'scripted', 'team-revoke'),
      sc('invalid', 'viewer-invites', 'scripted', 'team-viewer-cannot-invite'),
      sc('invalid', 'role-not-in-list', 'scripted', 'team-invalid-role'),
      sc('repeat', 'accept-twice', 'scripted', 'team-accept-twice'),
      sc('happy', 'legacy-team', 'legacy', 'J6'),
      pending(
        'boundary',
        'email-count',
        'not scripted: the limit must come from the spec, not from the code'
      ),
      pending('double-submit', 'invite-twice', 'not scripted'),
      pending('concurrent-seat', 'two-invites', 'not scripted'),
      pending('dependency-failure', 'mail-transport', 'not scripted: belongs to the mail layer')
    ]
  },
  {
    key: 'team-role',
    title: 'Change a role and remove a person',
    capability: 'team',
    journeys: ['J6'],
    oracle: {
      source: 'docs/adr/0001-seat-door-and-enforcement-boundary.md',
      ref: 'seat book',
      invariant:
        'the new role is in the seat book and in what the seat can do; a removed seat loses the site at once'
    },
    effects: { reads: ['db'], writes: ['seat'], mail: false },
    scenarios: [
      sc('role-change', 'owner-changes-role', 'scripted', 'team-role-change'),
      sc('rollback', 'removed-loses-site', 'scripted', 'team-removed-loses-site'),
      sc('role-change', 'legacy-team', 'legacy', 'J6'),
      pending('concurrent-seat', 'role-change-while-open', 'not scripted')
    ]
  },
  {
    key: 'add-site',
    title: 'Add a site (WordPress, Joomla, EmDash)',
    capability: 'build',
    journeys: ['J2a', 'J2b'],
    oracle: {
      source: CTX,
      ref: '§6 Build a new site',
      invariant:
        'POST /api/sites yields a job that reaches done and a site that answers from outside; the row exists in the database'
    },
    effects: { reads: ['db', 'http'], writes: ['site', 'containers'], mail: false, containers: true },
    scenarios: [
      sc('happy', 'wordpress', 'scripted', 'add-site-wordpress'),
      sc('happy', 'joomla', 'scripted', 'add-site-joomla'),
      sc('happy', 'emdash', 'scripted', 'add-site-emdash'),
      sc('invalid', 'bad-label', 'scripted', 'add-site-bad-label'),
      sc('happy', 'legacy-api', 'legacy', 'J2b'),
      sc('happy', 'legacy-wizard', 'legacy', 'J2a'),
      pending('double-submit', 'same-build-id', 'not scripted'),
      pending(
        'boundary',
        'label-length',
        'not scripted: the label rule is in the legacy env, not an approved spec'
      ),
      pending('interrupted', 'host-restart-mid-build', 'not scripted')
    ]
  },
  {
    key: 'import-site',
    title: 'Import an existing site',
    capability: 'build',
    journeys: ['J2c'],
    oracle: {
      source: CTX,
      ref: '§6 Build a new site',
      invariant: 'a source site is imported with its content'
    },
    effects: { reads: ['http'], writes: ['site'], mail: false, containers: true },
    scenarios: [
      pending(
        'happy',
        'import',
        'ENV: the suite owns no source site to import (tests/e2e-dev/run.mjs marks J2c notCovered)'
      )
    ]
  },
  {
    key: 'build-resume',
    title: 'Build, retry, resume',
    capability: 'build',
    journeys: ['J2b'],
    oracle: {
      source: CTX,
      ref: '§6 Build a new site',
      invariant: 'a failed or interrupted build can be retried and resumes to done without a second site'
    },
    effects: { reads: ['db'], writes: ['site'], mail: false, containers: true },
    scenarios: [
      pending('retry', 'failed-job', 'not scripted: needs a recorded fault injection in the host'),
      pending('reload-resume', 'poll-after-reload', 'not scripted'),
      pending('interrupted', 'host-restart', 'not scripted')
    ]
  },
  {
    key: 'publish',
    title: 'Publish and back to draft',
    capability: 'publish',
    journeys: ['J10'],
    oracle: {
      source: 'tests/regression/cases/REG-PR-948-site-publish-flow.json',
      ref: 'FLAG, GUARD, ROLES, UNCONFIRMED, CLOSINGLINE (the product tests the case names); CONTEXT.md §6 has no publish row',
      invariant:
        'publish flips the site to live only after the host job is done and said so, back to draft reverses it; state read from the database and from outside'
    },
    effects: { reads: ['db', 'http'], writes: ['site-state'], mail: false, containers: true },
    scenarios: [
      sc('happy', 'pilot', 'pilot', 'publish-pilot'),
      sc('happy', 'legacy-draft-switch', 'legacy', 'J10'),
      pending(
        'rollback',
        'back-to-draft',
        'not scripted outside the pilot; the go-live/ingress stub proves a mechanism only, not infrastructure'
      ),
      pending(
        'happy',
        'draft-live-draft',
        `not scripted on a stand: ${API('publish-live-then-back-to-draft')}; end to end needs the go-live road of a host (mail egress, ingress), which a local stand stubs`
      ),
      pending('double-submit', 'publish-twice', `not scripted on a stand: ${API('publish-double-press')}`),
      pending('role-change', 'who-may-publish', `not scripted on a stand: ${API('publish-roles')}`),
      pending(
        'dependency-failure',
        'host-does-not-answer',
        `not scripted on a stand: ${API('publish-host-unreachable')}; the late answer found by asking again is covered by the product test "the answer that never arrived is found by asking again" (apps/tracy-web/test/site-publish.test.mjs)`
      ),
      pending(
        'concurrent-seat',
        'delete-while-publishing',
        `not scripted on a stand: ${API('delete-while-publishing')} and ${API('publish-while-deleting')}`
      ),
      pending(
        'interrupted',
        'host-restart-mid-publish',
        'pilot case that needs the go-live stubs, which are not shipped here'
      )
    ]
  },
  {
    key: 'own-domain',
    title: "Connect the site's own domain",
    capability: 'publish',
    journeys: [],
    oracle: {
      source: REG('REG-PR-948-site-publish-flow'),
      ref: "part 2: the site's own domain through the same operation; DNS shown only as measured",
      invariant:
        'only the Owner connects a domain; DNS reads as the lookup returned it; a domain is connected only after the host job routed it and a probe of the domain answered as the site; a bare domain and a name another site holds are refused'
    },
    effects: {
      reads: ['db', 'http', 'dns'],
      writes: ['site-name', 'site-state'],
      mail: false,
      containers: true
    },
    scenarios: [
      pending(
        'happy',
        'owner-connects-and-goes-live',
        `not scripted on a stand: needs a DNS server and an ingress the stand owns (never real DNS); the product's own stand test does it (apps/tracy-web/test/e2e/site-own-domain.test.mjs). ${API('domain-connect-owner')}`
      ),
      pending(
        'role-change',
        'non-owner-is-refused',
        `not scripted on a stand: ${API('domain-connect-non-owner')}`
      ),
      pending(
        'invalid',
        'switch-off-hides-the-way-in',
        `not scripted: the switch hides the Connect button by CSS on the page (packages/site/tracy-site-tabs/src/client/site-tabs-rules.css), which needs a browser on a stand; ${API('domain-switch-off')} and the ui layer's switch cases for site-connect-domain cover the door and the binding`
      ),
      pending(
        'empty',
        'dns-not-there-yet',
        `not scripted on a stand: ${API('domain-dns-missing')}, against a stub resolver`
      ),
      pending(
        'invalid',
        'dns-wrong-record',
        `not scripted on a stand: ${API('domain-dns-wrong-record')}, against a stub resolver`
      ),
      pending(
        'happy',
        'dns-right-record',
        `not scripted on a stand: ${API('domain-dns-right-record')}, against a stub resolver`
      ),
      pending('invalid', 'name-already-taken', `not scripted on a stand: ${API('domain-already-taken')}`),
      pending(
        'rollback',
        'remove-connected-domain',
        'not scripted: removing a connected domain is a host operation (drop-domain) whose half-done states are covered by the product test "a cleanup that half succeeded is recorded as half done" (apps/tracy-web/test/site-publish.test.mjs)'
      ),
      pending(
        'interrupted',
        'late-dns-answer',
        'not scripted: a lookup that returns after the name was removed or saved again is covered by the product tests "a lookup that comes back after the name was removed…" and "two Check DNS of one reservation that end in the other order…" (apps/tracy-web/test/site-address.test.mjs)'
      )
    ]
  },
  {
    key: 'waitlist',
    title: 'Waitlist: turned away at sign-in, the form, and the staff list',
    capability: 'identity',
    journeys: [],
    oracle: {
      source: REG('REG-PR-972-ops-waitlist'),
      ref: 'S1–S5',
      invariant:
        'one row per address turned away or sent through the form, with the form answers, its source, the mail status and a later sign-in; staff only'
    },
    effects: { reads: ['db'], writes: ['waitlist'], mail: true },
    scenarios: [
      pending('happy', 'form-relayed-and-listed', `not scripted on a stand: ${API('waitlist-staff-list')}`),
      pending('empty', 'nobody-in-the-window', `not scripted on a stand: ${API('waitlist-empty-window')}`),
      pending('role-change', 'not-staff', `not scripted on a stand: ${API('waitlist-not-staff')}`),
      pending(
        'invalid',
        'relay-without-secret',
        `not scripted on a stand: ${API('waitlist-relay-wrong-secret')}`
      ),
      pending(
        'new-returning',
        'turned-away-then-signs-in-later',
        'not scripted: a turned-away address needs the beta gate on and its membership service (aMember), which a local stand does not have; the product test "waitlist: one row per address, turned away and the form joined, newest first; staff only" (apps/tracy-web/test/ops-beta.test.mjs) covers the list'
      ),
      pending(
        'happy',
        'the-form-itself',
        'not in this repository: the whitelist form is the tracy.ai WordPress page (BETA_WAITLIST_URL); there is no local screen to drive'
      ),
      pending(
        'happy',
        'staff-screen',
        'not scripted: /ops/waitlist is the harness SPA (packages/web/tracy-harness/src/beta/Waitlist.tsx) and needs its build and a browser; REG-PR-972 drives it with Chrome'
      )
    ]
  },
  {
    key: 'mail-footer',
    title: 'Mail footer: Terms · Privacy · tracy.ai, and the way back from Manage notifications',
    capability: 'inbox',
    journeys: [],
    oracle: {
      source: REG('REG-PR-973-mail-footer-terms'),
      ref: 'expect',
      invariant:
        'every letter ends Terms · Privacy · tracy.ai; a signed-out click on Manage notifications keeps its destination through sign-in'
    },
    effects: { reads: ['mail-sink'], writes: [], mail: true },
    scenarios: [
      pending(
        'happy',
        'footer-on-every-letter',
        'not a flow: the rendered footer of each letter is judged in the mail layer (every QA-MAIL-<kind>-happy-links case counts the two tracy.ai links and nothing else)'
      ),
      pending(
        'back-navigation',
        'manage-notifications-signed-out',
        `not scripted on a stand: ${API('root-keeps-source-and-destination')}`
      ),
      pending(
        'reload-resume',
        'lands-on-settings-after-sign-in',
        'not scripted: after sign-in the Settings panel opening on Notifications is a dsh screen and needs a browser on a stand'
      )
    ]
  },
  {
    key: 'review-undo',
    title: 'Undo a chat request from the chat card, the toolbar and Site changes',
    capability: 'site-changes',
    journeys: [],
    oracle: {
      source: REG('REG-PR-970-site-changes-undo'),
      ref: 'doorUndo, view; REG-PR-968 (note for the agent, preview reload), REG-PR-971 (toolbar)',
      invariant:
        'the latest request is undone through one button; an older one goes back from there; a blocked one says why and offers no undo; the next turn is told once'
    },
    effects: { reads: ['http', 'db'], writes: ['site-file', 'site-db'], mail: false, model: true },
    scenarios: [
      pending(
        'rollback',
        'undo-latest-request',
        `not scripted: an undo needs a turn the agent really made (model credentials) and the host's turn moments; ${API('turn-undo-doors')} says what the door half still lacks`
      ),
      pending(
        'rollback',
        'go-back-to-an-older-request',
        'not scripted: same prerequisites; the rule (newer turn first, NOT_LATEST for scope turn) is covered by the product test "going back two turns undoes the newer turn first" (apps/tracy-web/test/turn-undo-route.test.mjs)'
      ),
      pending(
        'invalid',
        'blocked-by-a-later-edit',
        'not scripted: same prerequisites; covered by the product test "an admin edit after the turn: POST is refused BLOCKED and writes nothing"'
      ),
      pending(
        'repeat',
        'undo-twice',
        'not scripted: a second press answers NOTHING_TO_UNDO (apps/tracy-web/src/sites/turn-undo.js); no stand turn to press on'
      ),
      pending(
        'retry',
        'partial-undo',
        'not scripted: a partly undone turn (complete:false) needs a host fault injected mid-restore'
      ),
      pending(
        'reload-resume',
        'toolbar-and-preview-follow',
        'not scripted: the toolbar state and the preview reload are browser events (REG-PR-971, REG-PR-968-undo-preview-reload)'
      )
    ]
  },
  {
    key: 'signin-source',
    title: 'Sign-in source: where a first sign-in came from',
    capability: 'identity',
    journeys: [],
    oracle: {
      source: REG('REG-PR-936-sign-in-source'),
      ref: 'S1–S6',
      invariant:
        'a first sign-in records the cleaned utm_* of the link it came from, through every way in, and nothing when there is none'
    },
    effects: { reads: ['db', 'mail-sink'], writes: ['account'], mail: true },
    scenarios: [
      pending('happy', 'campaign-link-by-code', `not scripted on a stand: ${API('signin-source-recorded')}`),
      pending('invalid', 'tampered-source', `not scripted on a stand: ${API('signin-source-cleaned')}`),
      pending('empty', 'no-source', `not scripted on a stand: ${API('signin-source-absent')}`),
      pending(
        'back-navigation',
        'root-link-keeps-its-source',
        `not scripted on a stand: ${API('root-keeps-source-and-destination')}`
      ),
      pending(
        'new-returning',
        'second-sign-in-changes-nothing',
        'not scripted: covered by the product test "a second sign-in with another utm changes nothing about the first" (apps/tracy-web/test/sign-in-source.test.mjs)'
      ),
      pending(
        'happy',
        'through-google-and-the-demo-banner',
        'not scripted: needs a provider and the demo page (REG-PR-936 S3, S6 drive Chrome against a stand with stubs)'
      )
    ]
  },
  {
    key: 'customize-site',
    title: 'Add site › Customize your site',
    capability: 'build',
    journeys: [],
    oracle: {
      source: REG('REG-PR-998-add-site-questions-sheet'),
      ref: 'expect',
      invariant:
        'the questions are optional: the card and sheet keep the answers, Create site is never blocked, and it sends the answers or no brief'
    },
    effects: { reads: ['http'], writes: ['site', 'site-brief'], mail: false, model: true, containers: true },
    scenarios: [
      pending(
        'empty',
        'card-with-nothing-answered',
        'not scripted: the card is a dsh plugin screen (packages/site/tracy-add-site/src/client/questions-sheet.tsx) and needs a browser on a stand; the product browser test "the card sits quietly under the address…" (test/e2e/create-brief-sheet.test.mjs) covers it over a fetch double'
      ),
      pending(
        'happy',
        'card-after-answers',
        'not scripted: same screen; the count is `briefProgress` (site-brief.mjs), covered by the product test "progress counts the questions shown now…"'
      ),
      pending(
        'back-navigation',
        'close-and-reopen-keeps-answers',
        'not scripted: same screen; covered by the product browser test "closes the sheet, keeps the answers, and gives focus back to the card"'
      ),
      pending(
        'empty',
        'everything-skipped-site-still-created',
        'not scripted: needs the wizard in a browser and a host that builds; the product browser test "nothing answered: Create site makes the site at once with no brief" covers the request'
      ),
      pending(
        'happy',
        'answers-reach-the-brief',
        `not scripted: ${API('create-site-answers-reach-brief')} says what is missing`
      ),
      pending(
        'happy',
        'three-question-tiers',
        `not scripted on a stand: ${API('questions-quickstart-tier')}, ${API('questions-standard-tier')}; the CMS default tier is PENDING there (QA-API-scenario-questions-cms-default-tier)`
      ),
      pending(
        'rollback',
        'template-changed-after-answering',
        'not scripted: same screen; the rule is `carryAnswers` (site-brief.mjs), covered by the product tests "a new set keeps the answers whose question it still asks…" and "a change of template keeps the answers the new set still asks for, says so, and drops the rest"'
      ),
      pending(
        'dependency-failure',
        'questions-fail-to-load',
        'not scripted: same screen; covered by the product browser test "when the questions cannot load the card says so, and Create site makes the site at once without a brief"'
      ),
      pending(
        'interrupted',
        'stale-questions-answer',
        'not scripted, and no product test either: an older questions answer landing after a newer one is guarded by `live` in wizard.tsx; it needs a browser with delayed responses'
      ),
      pending(
        'happy',
        'ai-rewrite-writes-and-undo',
        `not scripted: the Undo button is on the sheet (browser); ${API('rewrite-writes')}`
      ),
      pending(
        'dependency-failure',
        'ai-rewrite-not-on-limit-failed',
        `not scripted on a stand: ${API('rewrite-not-switched-on')}, ${API('rewrite-limit-reached')}, ${API('rewrite-failed')}; the sentences beside the button need a browser`
      ),
      pending(
        'happy',
        'second-interface-language',
        'not scripted: the translated card and sheet need a browser with the interface language set; the strings exist in packages/locale/tracy-locale-vi/vi/tracy-add-site.json and packages/locale/tracy-locales/fr/tracy-add-site.json, and the product browser test checks layout only, not the words'
      )
    ]
  },
  {
    key: 'agent-edit',
    title: 'Agent edits a file or content',
    capability: 'chat-edit',
    journeys: ['J4a', 'J4b'],
    oracle: {
      source: CTX,
      ref: '§6 Edit by chat',
      invariant: 'after the agent turn the file bytes / database value changed as asked, read from outside'
    },
    effects: { reads: ['http', 'db'], writes: ['site-file', 'site-db'], mail: false, model: true },
    scenarios: [
      sc('happy', 'file', 'legacy', 'J4a'),
      sc('happy', 'content', 'legacy', 'J4b'),
      pending(
        'dependency-failure',
        'no-model-credentials',
        'missing model credentials are probed at run time → ENV'
      ),
      pending('interrupted', 'cancel-turn', 'not scripted')
    ]
  },
  {
    key: 'site-changes-undo',
    title: 'Site changes, diff, undo',
    capability: 'site-changes',
    journeys: ['J4a', 'J4b'],
    oracle: {
      source: 'docs/adr/0024-backup-is-a-complete-restore-point.md',
      ref: 'ADR 0024; CONTEXT.md §6',
      invariant: 'undo puts the file/value back to its bytes before the turn'
    },
    effects: { reads: ['http', 'db'], writes: ['site-file', 'site-db'], mail: false, model: true },
    scenarios: [
      sc('rollback', 'undo-file', 'legacy', 'J4a'),
      sc('rollback', 'undo-content', 'legacy', 'J4b'),
      pending('empty', 'no-changes', 'not scripted')
    ]
  },
  {
    key: 'backup-restore',
    title: 'Backup and restore',
    capability: 'site-changes',
    journeys: ['J4c'],
    oracle: {
      source: 'docs/adr/0024-backup-is-a-complete-restore-point.md',
      ref: 'ADR 0024',
      invariant: 'restore puts back both the files and the database of the backup'
    },
    effects: { reads: ['http', 'db'], writes: ['site-file', 'site-db'], mail: false, model: true },
    scenarios: [
      sc('rollback', 'restore-everything', 'legacy', 'J4c'),
      pending('invalid', 'unknown-version', 'not scripted')
    ]
  },
  {
    key: 'comment-resolve',
    title: 'Comment, Tracy writes, resolve',
    capability: 'comments',
    journeys: ['J5'],
    oracle: {
      source: 'docs/adr/0025-close-comment-on-write-evidence.md',
      ref: 'ADR 0025',
      invariant: 'a comment is closed only when a write is recorded for it'
    },
    effects: { reads: ['db'], writes: ['comment'], mail: false, model: true },
    scenarios: [
      sc('happy', 'comment-thread', 'legacy', 'J5'),
      pending(
        'invalid',
        'resolve-without-write',
        'not scripted: needs the evidence contract of ADR 0025 as a fixture'
      ),
      pending('concurrent-seat', 'two-readers', 'not scripted')
    ]
  },
  {
    key: 'inbox',
    title: 'Inbox between two people',
    capability: 'inbox',
    journeys: ['J7'],
    oracle: {
      source: 'docs/adr/0026-inbox-and-email-notifications.md',
      ref: 'ADR 0026',
      invariant: 'a row for the other person only; none for the actor and none for Tracy'
    },
    effects: { reads: ['db'], writes: ['notification'], mail: false },
    scenarios: [
      sc('happy', 'two-people', 'legacy', 'J7'),
      pending('empty', 'no-rows', 'not scripted'),
      pending('concurrent-seat', 'two-tabs', 'not scripted')
    ]
  },
  {
    key: 'settings',
    title: 'Settings',
    capability: 'settings',
    journeys: ['J8'],
    oracle: {
      source: CTX,
      ref: '§6 Eight interface languages',
      invariant: 'a setting does what it says, not only stores a value'
    },
    effects: { reads: ['http'], writes: ['setting'], mail: false },
    scenarios: [
      sc('happy', 'language', 'legacy', 'J8'),
      pending('invalid', 'unknown-language', 'not scripted')
    ]
  },
  {
    key: 'delete-site',
    title: 'Delete a site',
    capability: 'build',
    journeys: ['J2b', 'J12'],
    oracle: {
      source: CTX,
      ref: '§6 Build a new site; ADR 0014 §3',
      invariant:
        'after delete the database row is gone, the site answers nothing from outside and no container or volume of its label is left'
    },
    effects: {
      reads: ['db', 'http', 'docker'],
      writes: ['site', 'containers'],
      mail: false,
      containers: true
    },
    scenarios: [
      sc('cleanup', 'delete-proof', 'scripted', 'delete-site-gone'),
      sc('cleanup', 'legacy-lifecycle', 'legacy', 'J12'),
      pending('repeat', 'delete-twice', 'not scripted'),
      pending('rollback', 'delete-then-recreate-label', 'not scripted')
    ]
  },
  {
    key: 'two-seats',
    title: "Two seats on two sites cannot see each other's site",
    capability: 'isolation',
    journeys: ['J11'],
    oracle: {
      source: 'docs/adr/0014-one-dsh-per-host-commands-in-web-container.md',
      ref: 'ADR 0014 §3; CONTEXT.md',
      invariant:
        "the doors of site B refuse a seat that holds only site A, and the other way round; a site's public page is not a leak"
    },
    effects: { reads: ['http', 'db'], writes: ['site'], mail: false, containers: true },
    scenarios: [
      sc('concurrent-seat', 'a-cannot-read-b', 'scripted', 'two-seats-isolation'),
      sc('happy', 'legacy-rights', 'legacy', 'J11'),
      pending(
        'dependency-failure',
        'egress-fence',
        'not scripted: a local stand has the egress fence off; J11 does not try the real fence'
      )
    ]
  },
  {
    key: 'my-sites-design',
    title: 'My Sites, start screen, design inspiration link',
    capability: 'build',
    journeys: ['J3', 'J9'],
    oracle: {
      source: CTX,
      ref: '§6',
      invariant: "the list and cards reflect the account's sites and the seat book"
    },
    effects: { reads: ['http'], writes: [], mail: false },
    scenarios: [sc('happy', 'my-sites', 'legacy', 'J9'), sc('happy', 'start-screen', 'legacy', 'J3')]
  },
  {
    key: 'deploy-smoke',
    title: 'Deploy smoke',
    capability: 'infra',
    journeys: ['J13'],
    oracle: {
      source: 'tests/e2e-dev/journeys/J13.test.mjs',
      ref: 'health script of the stack',
      invariant: 'the stack reports healthy and says what it runs'
    },
    effects: { reads: ['docker'], writes: [], mail: false },
    scenarios: [
      pending(
        'happy',
        'legacy-deploy',
        'PENDING: TEST_INVALID — J13 reads a dev host over ssh and check-server.sh; no local equivalent in this layer'
      )
    ]
  },
  {
    key: 'brand-inspiration',
    title: 'Brand and Design inspiration',
    capability: 'brand',
    journeys: [],
    oracle: { source: CTX, ref: '§6 Brand', invariant: 'a brand is built or taken from the community store' },
    effects: { reads: [], writes: [], mail: false },
    scenarios: [pending('happy', 'brand', 'not scripted: no journey and no approved flow contract')]
  },
  {
    key: 'assistant-readonly',
    title: 'AI assistant is read-only',
    capability: 'assistant',
    journeys: [],
    oracle: {
      source: CTX,
      ref: '§6 AI assistant (`/help`)',
      invariant: 'the assistant answers and guides but changes nothing'
    },
    effects: { reads: [], writes: [], mail: false, model: true },
    scenarios: [
      pending('happy', 'assistant', 'not scripted: needs model credentials and a before/after state fixture')
    ]
  }
]

/** What each journey of tests/e2e-dev is, for the manifest requirement text. */
export const JOURNEY_TITLES = {
  J0: 'identity smoke',
  J1: 'sign-in by emailed code',
  J2a: 'add a site through the wizard',
  J2b: 'add a site through the API',
  J2c: 'import a site',
  J3: 'start screen',
  J4a: 'agent edits a file, diff, undo',
  J4b: 'agent edits content, revert',
  J4c: 'backup, change, restore',
  J5: 'comment between two people',
  J6: 'team: invite, role, remove',
  J7: 'inbox of two people',
  J8: 'settings',
  J9: 'My Sites and design inspiration link',
  J10: 'stranger and draft/published switch',
  J11: 'rights and isolation',
  J12: 'session and site life cycle',
  J13: 'deploy smoke'
}
