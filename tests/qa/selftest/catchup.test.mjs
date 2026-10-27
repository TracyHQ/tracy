// Catch-up with develop (07/10/2026): every outcome the catch-up task named has a case in the layer
// it belongs to, the cases point at each other by ids that exist, every played door scenario has a
// mutant that applies to today's product tree, and the numbers the docs state are the derived ones.
// No docker, no database, no browser: this reads tables and files only.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { applyMutation } from '../layers/api/red.mjs'
import { SCENARIOS, SCENARIO_MUTANTS } from '../layers/api/scenarios.mjs'
import { OUTCOMES } from '../layers/ui/outcomes.mjs'
import { readTextSync } from '../lib/bounded-reader.mjs'

const QA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.join(QA, '..', '..')
const read = (rel) => readTextSync(path.join(REPO, rel))

const apiIds = new Set(SCENARIOS.map((s) => `QA-API-scenario-${s.key}`))
const uiIds = new Set(OUTCOMES.map((o) => `QA-UI-outcome-${o.key}`))
const flowCases = readdirSync(path.join(QA, 'layers/flows/cases'))
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(read(`tests/qa/layers/flows/cases/${f}`)))
const flowIds = new Set(flowCases.map((c) => c.id))
const known = (id) => apiIds.has(id) || uiIds.has(id) || flowIds.has(id)

/**
 * The outcomes the task listed, each with the cases that carry it: the door half (api), the journey
 * (flows) and the screen (ui). A row with no door of its own names only the layers it has.
 */
const REQUIRED = {
  'publish: draft → Publish → Live → Back to draft': [
    'QA-API-scenario-publish-live-then-back-to-draft',
    'QA-FLOWS-publish-happy-draft-live-draft',
    'QA-UI-outcome-publish-draft-shows-publish',
    'QA-UI-outcome-publish-running-shows-no-second-press',
    'QA-UI-outcome-publish-live-shows-back-to-draft'
  ],
  'own domain: Connect domain as Owner': [
    'QA-API-scenario-domain-connect-owner',
    'QA-FLOWS-own-domain-happy-owner-connects-and-goes-live',
    'QA-UI-outcome-connect-domain-owner-has-the-button'
  ],
  'own domain: Connect domain as a non-owner': [
    'QA-API-scenario-domain-connect-non-owner',
    'QA-FLOWS-own-domain-role-change-non-owner-is-refused',
    'QA-UI-outcome-connect-domain-non-owner-sees-state-only'
  ],
  'own domain: switch site-connect-domain off': [
    'QA-API-scenario-domain-switch-off',
    'QA-FLOWS-own-domain-invalid-switch-off-hides-the-way-in',
    'QA-UI-outcome-connect-domain-switch-off-hides-the-button',
    'QA-UI-outcome-connect-domain-switch-off-keeps-existing-domain'
  ],
  'own domain: DNS pending': [
    'QA-API-scenario-domain-dns-missing',
    'QA-FLOWS-own-domain-empty-dns-not-there-yet',
    'QA-UI-outcome-domain-card-dns-waiting'
  ],
  'own domain: DNS wrong record': [
    'QA-API-scenario-domain-dns-wrong-record',
    'QA-FLOWS-own-domain-invalid-dns-wrong-record',
    'QA-UI-outcome-domain-card-dns-wrong'
  ],
  'own domain: DNS right record': [
    'QA-API-scenario-domain-dns-right-record',
    'QA-FLOWS-own-domain-happy-dns-right-record',
    'QA-UI-outcome-domain-card-dns-verified'
  ],
  'own domain: the domain already taken': [
    'QA-API-scenario-domain-already-taken',
    'QA-FLOWS-own-domain-invalid-name-already-taken',
    'QA-UI-outcome-domain-already-taken-message'
  ],
  'publish: delete while publishing': [
    'QA-API-scenario-delete-while-publishing',
    'QA-API-scenario-publish-while-deleting',
    'QA-FLOWS-publish-concurrent-seat-delete-while-publishing',
    'QA-UI-outcome-delete-while-publishing-message'
  ],
  waitlist: [
    'QA-API-scenario-waitlist-staff-list',
    'QA-API-scenario-waitlist-empty-window',
    'QA-API-scenario-waitlist-not-staff',
    'QA-API-scenario-waitlist-relay-wrong-secret',
    'QA-API-scenario-waitlist-form-screen',
    'QA-FLOWS-waitlist-happy-form-relayed-and-listed',
    'QA-UI-outcome-waitlist-tiles',
    'QA-UI-outcome-waitlist-rows',
    'QA-UI-outcome-waitlist-window-switch',
    'QA-UI-outcome-waitlist-empty-window',
    'QA-UI-outcome-waitlist-read-only-seat',
    'QA-UI-outcome-waitlist-not-staff'
  ],
  'mail footer': [
    'QA-FLOWS-mail-footer-happy-footer-on-every-letter',
    'QA-API-scenario-root-keeps-source-and-destination',
    'QA-FLOWS-mail-footer-back-navigation-manage-notifications-signed-out'
  ],
  'review undo': [
    'QA-API-scenario-turn-undo-doors',
    'QA-FLOWS-review-undo-rollback-undo-latest-request',
    'QA-FLOWS-review-undo-invalid-blocked-by-a-later-edit',
    'QA-FLOWS-review-undo-retry-partial-undo',
    'QA-UI-outcome-undo-one-button',
    'QA-UI-outcome-undo-dialog-says-what-goes-back',
    'QA-UI-outcome-undo-blocked',
    'QA-UI-outcome-undo-older-request',
    'QA-UI-outcome-undo-row-reads-undone',
    'QA-UI-outcome-undo-row-reads-partly-undone',
    'QA-UI-outcome-undo-toolbar-follows',
    'QA-UI-outcome-undo-preview-follows'
  ],
  'sign-in source / UTM': [
    'QA-API-scenario-signin-source-recorded',
    'QA-API-scenario-signin-source-cleaned',
    'QA-API-scenario-signin-source-absent',
    'QA-FLOWS-signin-source-happy-campaign-link-by-code'
  ],
  'customize: card with nothing answered': [
    'QA-UI-outcome-questions-card-nothing-answered',
    'QA-FLOWS-customize-site-empty-card-with-nothing-answered'
  ],
  'customize: card after answers': [
    'QA-UI-outcome-questions-card-after-answers',
    'QA-FLOWS-customize-site-happy-card-after-answers'
  ],
  'customize: open and close the sheet with answers kept': [
    'QA-UI-outcome-questions-sheet-closed-by-done',
    'QA-UI-outcome-questions-sheet-closed-by-x',
    'QA-UI-outcome-questions-sheet-closed-by-scrim',
    'QA-UI-outcome-questions-sheet-closed-by-escape',
    'QA-FLOWS-customize-site-back-navigation-close-and-reopen-keeps-answers'
  ],
  'customize: every question skipped and the site still created': [
    'QA-UI-outcome-questions-all-skipped',
    'QA-FLOWS-customize-site-empty-everything-skipped-site-still-created'
  ],
  "customize: answers sent with Create site and reaching the site's brief": [
    'QA-API-scenario-create-site-answers-reach-brief',
    'QA-UI-outcome-questions-answers-sent',
    'QA-FLOWS-customize-site-happy-answers-reach-the-brief'
  ],
  'customize: the three question tiers': [
    'QA-API-scenario-questions-quickstart-tier',
    'QA-API-scenario-questions-cms-default-tier',
    'QA-API-scenario-questions-standard-tier',
    'QA-FLOWS-customize-site-happy-three-question-tiers',
    'QA-UI-outcome-questions-tier-quickstart',
    'QA-UI-outcome-questions-tier-cms-default',
    'QA-UI-outcome-questions-tier-standard'
  ],
  'customize: template or platform changed after answering': [
    'QA-UI-outcome-questions-template-changed-answers-kept',
    'QA-UI-outcome-questions-template-changed-answers-dropped',
    'QA-UI-outcome-questions-platform-changed',
    'QA-FLOWS-customize-site-rollback-template-changed-after-answering'
  ],
  'customize: the questions fail to load and Create site still works': [
    'QA-UI-outcome-questions-load-failed-card',
    'QA-UI-outcome-questions-load-failed-create-still-works',
    'QA-FLOWS-customize-site-dependency-failure-questions-fail-to-load'
  ],
  'customize: AI rewrite writes, undo': [
    'QA-API-scenario-rewrite-writes',
    'QA-UI-outcome-rewrite-writes',
    'QA-UI-outcome-rewrite-undo',
    'QA-UI-outcome-rewrite-stale-answer'
  ],
  'customize: AI rewrite not switched on, limit reached, failed': [
    'QA-API-scenario-rewrite-not-switched-on',
    'QA-API-scenario-rewrite-limit-reached',
    'QA-API-scenario-rewrite-failed',
    'QA-UI-outcome-rewrite-not-switched-on',
    'QA-UI-outcome-rewrite-limit-reached',
    'QA-UI-outcome-rewrite-failed'
  ],
  'customize: the card and sheet in a second interface language': [
    'QA-UI-outcome-questions-in-fr',
    'QA-UI-outcome-questions-in-vi',
    'QA-FLOWS-customize-site-happy-second-interface-language'
  ],
  'sign-in: code requested': ['QA-API-scenario-signin-code-requested'],
  'sign-in: code right': ['QA-API-scenario-signin-code-right', 'QA-FLOWS-signin-code-happy-code-from-sink'],
  'sign-in: code wrong': [
    'QA-API-scenario-signin-code-wrong',
    'QA-FLOWS-signin-code-invalid-wrong-code',
    'QA-UI-outcome-signin-code-step-wrong-code'
  ],
  'sign-in: code expired': [
    'QA-API-scenario-signin-code-expired',
    'QA-FLOWS-signin-code-boundary-expired-code',
    'QA-UI-outcome-signin-code-step-expired-code'
  ],
  'sign-in: code reused': [
    'QA-API-scenario-signin-code-reused',
    'QA-FLOWS-signin-code-repeat-replay',
    'QA-UI-outcome-signin-code-step-reused-code'
  ],
  'sign-in: link opened on another device': [
    'QA-API-scenario-signin-link-other-device',
    'QA-FLOWS-signin-code-concurrent-seat-link-opened-on-another-device'
  ],
  'sign-in: provider success (Google, GitHub)': [
    'QA-API-scenario-signin-provider-success',
    'QA-API-scenario-signin-github-success',
    'QA-FLOWS-signin-oauth-happy-google-success',
    'QA-FLOWS-signin-oauth-happy-github-success'
  ],
  'sign-in: cancelled (Google, GitHub)': [
    'QA-API-scenario-signin-provider-cancelled',
    'QA-API-scenario-signin-github-cancelled',
    'QA-FLOWS-signin-oauth-interrupted-google-cancelled-at-the-provider',
    'QA-FLOWS-signin-oauth-interrupted-github-cancelled-at-the-provider',
    'QA-UI-outcome-signin-failure-sentence-cancelled'
  ],
  'sign-in: stale or expired state (Google, GitHub)': [
    'QA-API-scenario-signin-provider-state-expired',
    'QA-API-scenario-signin-github-state-expired',
    'QA-FLOWS-signin-oauth-boundary-google-expired-state',
    'QA-FLOWS-signin-oauth-boundary-github-expired-state',
    'QA-UI-outcome-signin-failure-sentence-stale-state'
  ],
  'sign-in: state from another browser (Google, GitHub)': [
    'QA-API-scenario-signin-provider-state-other-browser',
    'QA-API-scenario-signin-github-state-other-browser',
    'QA-FLOWS-signin-oauth-concurrent-seat-google-state-from-another-browser',
    'QA-FLOWS-signin-oauth-concurrent-seat-github-state-from-another-browser'
  ],
  'sign-in: provider error, refused code exchange (Google, GitHub)': [
    'QA-API-scenario-signin-provider-refuses',
    'QA-API-scenario-signin-github-refuses',
    'QA-FLOWS-signin-oauth-dependency-failure-google-refused-code-exchange',
    'QA-FLOWS-signin-oauth-dependency-failure-github-refused-code-exchange',
    'QA-UI-outcome-signin-failure-sentence-refused-exchange'
  ],
  'sign-in: unverified email (Google, GitHub)': [
    'QA-API-scenario-signin-provider-unverified-email',
    'QA-API-scenario-signin-github-unverified-email',
    'QA-FLOWS-signin-oauth-invalid-google-unverified-email',
    'QA-FLOWS-signin-oauth-invalid-github-unverified-email',
    'QA-UI-outcome-signin-failure-sentence-unverified-email'
  ],
  'sign-in: provider not offered on this deployment (Google, GitHub)': [
    'QA-API-scenario-signin-provider-not-offered',
    'QA-API-scenario-signin-github-not-offered',
    'QA-FLOWS-signin-oauth-invalid-google-not-offered',
    'QA-FLOWS-signin-oauth-invalid-github-not-offered',
    'QA-UI-outcome-signin-failure-sentence-provider-not-offered'
  ],
  'sign-in: malformed /signin link': [
    'QA-API-scenario-signin-link-malformed',
    'QA-FLOWS-signin-oauth-invalid-malformed-signin-link',
    'QA-UI-outcome-signin-failure-sentence-malformed-link'
  ],
  'sign-in: device confirm page': [
    'QA-API-scenario-signin-device-confirm-page',
    'QA-FLOWS-signin-oauth-happy-device-confirm-page',
    'QA-UI-outcome-device-confirm-page',
    'QA-UI-outcome-device-confirm-page-layout'
  ],
  'sign-in: device approved page': [
    'QA-API-scenario-signin-device-approved',
    'QA-API-scenario-signin-device-approve-refused',
    'QA-FLOWS-signin-oauth-happy-device-approved-page',
    'QA-UI-outcome-device-approved-page',
    'QA-UI-outcome-device-approved-page-layout'
  ],
  'sign-in: invalid device link': [
    'QA-API-scenario-signin-device-invalid-link',
    'QA-FLOWS-signin-oauth-invalid-device-invalid-link',
    'QA-UI-outcome-device-invalid-link-page'
  ],
  'sign-in: the failure page and its way back': [
    'QA-API-scenario-signin-failure-page-way-back',
    'QA-FLOWS-signin-oauth-back-navigation-failure-page-and-its-way-back',
    'QA-UI-outcome-signin-failure-page-layout',
    'QA-UI-outcome-signin-failure-page-way-back',
    'QA-UI-outcome-signin-failure-page-off-origin-next'
  ],
  'sign-in: session kept after reload': [
    'QA-API-scenario-signin-session-after-reload',
    'QA-UI-outcome-signin-session-kept-after-reload'
  ],
  'sign-in: sign-out': [
    'QA-API-scenario-signin-signout',
    'QA-FLOWS-signin-code-cleanup-sign-out',
    'QA-UI-outcome-signin-signout-returns-to-sign-in'
  ]
}

test('every outcome the catch-up task named has a case, in a layer that exists', () => {
  for (const [outcome, ids] of Object.entries(REQUIRED)) {
    assert.ok(ids.length > 0, `${outcome}: no case`)
    for (const id of ids) assert.ok(known(id), `${outcome}: case ${id} does not exist`)
  }
})

test('the pinned #993 checklist is carried item by item, for both providers', () => {
  const checklist = read('tests/qa/oracles/signin/issue-993.md')
  // The words of the checklist a REQUIRED row answers; a reworded issue fails here, not silently.
  const items = {
    'cancelled at the provider': 'sign-in: cancelled (Google, GitHub)',
    'stale/expired state': 'sign-in: stale or expired state (Google, GitHub)',
    'state from another browser': 'sign-in: state from another browser (Google, GitHub)',
    'refused code exchange': 'sign-in: provider error, refused code exchange (Google, GitHub)',
    'unverified email': 'sign-in: unverified email (Google, GitHub)',
    'provider not offered on this deployment':
      'sign-in: provider not offered on this deployment (Google, GitHub)',
    'malformed `/signin` link': 'sign-in: malformed /signin link',
    'confirm page': 'sign-in: device confirm page',
    'approved page': 'sign-in: device approved page',
    'invalid link': 'sign-in: invalid device link'
  }
  for (const [words, outcome] of Object.entries(items)) {
    assert.ok(checklist.includes(words), `the pinned checklist no longer says "${words}"`)
    assert.ok(REQUIRED[outcome]?.length > 0, `${words}: no required outcome`)
  }
  // "Google and GitHub": every provider outcome has a door scenario and a flow case for each of the two.
  for (const [outcome, ids] of Object.entries(REQUIRED).filter(([name]) =>
    name.endsWith('(Google, GitHub)')
  )) {
    assert.ok(
      ids.some((id) => id.startsWith('QA-API-scenario-signin-provider-')),
      `${outcome}: no Google door scenario`
    )
    assert.ok(
      ids.some((id) => id.startsWith('QA-API-scenario-signin-github-')),
      `${outcome}: no GitHub door scenario`
    )
    for (const provider of ['google', 'github'])
      assert.ok(
        ids.some((id) => id.startsWith(`QA-FLOWS-signin-oauth-`) && id.includes(`-${provider}-`)),
        `${outcome}: no ${provider} flow case`
      )
  }
})

test('a product-screen outcome is one outcome: no row lists several states or reasons', () => {
  const groups = new Set()
  for (const o of OUTCOMES) {
    groups.add(o.group)
    // The words that joined several outcomes into one row before the split.
    assert.doesNotMatch(o.key, /-(and|or)-/, `${o.key}: the key joins two outcomes`)
    assert.doesNotMatch(
      o.title,
      /\bwrong, expired or reused\b|\bUndone or Partly undone\b|\bnot switched on, over its limit, or failed\b/,
      `${o.key}: the title lists several outcomes`
    )
  }
  for (const group of ['customize-site', 'publish', 'own-domain', 'sign-in', 'waitlist', 'review-undo'])
    assert.ok(groups.has(group), `no outcome for ${group}`)
  // Each state the task and the checklist name apart has a row of its own.
  for (const key of [
    'signin-code-step-wrong-code',
    'signin-code-step-expired-code',
    'signin-code-step-reused-code',
    'signin-session-kept-after-reload',
    'signin-signout-returns-to-sign-in',
    'waitlist-read-only-seat',
    'waitlist-not-staff',
    'undo-blocked',
    'undo-older-request'
  ])
    assert.ok(uiIds.has(`QA-UI-outcome-${key}`), `the outcome ${key} has no row of its own`)
})

test('a case that points at another layer names a case that exists there', () => {
  const texts = [
    ...flowCases.map((c) => [c.id, c.pendingReason ?? '']),
    ...OUTCOMES.map((o) => [`QA-UI-outcome-${o.key}`, o.meanwhile])
  ]
  let seen = 0
  for (const [from, text] of texts)
    for (const [id] of text.matchAll(/QA-API-scenario-[a-z0-9-]+/g)) {
      seen += 1
      assert.ok(apiIds.has(id), `${from} points at ${id}, which is not an api scenario`)
    }
  assert.ok(seen > 40, `only ${seen} cross-layer pointers were found: the scan is broken`)
})

test('a door scenario is played or says why not, never both and never neither', () => {
  const keys = new Set()
  for (const s of SCENARIOS) {
    assert.ok(!keys.has(s.key), `duplicate scenario ${s.key}`)
    keys.add(s.key)
    assert.equal(typeof s.run === 'function', typeof s.pending !== 'string', `${s.key}: run xor pending`)
    if (s.pending) assert.ok(s.pending.length > 60, `${s.key}: the pending reason says too little`)
    for (const f of ['source', 'ref', 'invariant'])
      assert.ok(s.oracle?.[f]?.length > 0, `${s.key}: oracle.${f} is empty`)
    assert.doesNotMatch(
      s.oracle.source,
      /(^|\/)(AGENTS|CLAUDE)\.md$/,
      `${s.key}: agent guidance is not an oracle`
    )
  }
})

test('every oracle a new case cites is a file of this checkout (an outside source only as a pinned copy)', () => {
  const cited = [
    ...SCENARIOS.map((s) => [`scenario ${s.key}`, s.oracle.source]),
    ...OUTCOMES.map((o) => [`outcome ${o.key}`, o.oracle.source])
  ]
  for (const [from, source] of cited) {
    assert.doesNotMatch(
      source,
      /^https?:|^GitHub issue/i,
      `${from}: ${source} is not a file in the repository`
    )
    assert.ok(existsSync(path.join(REPO, source)), `${from}: oracle source ${source} does not exist`)
  }
  assert.match(read('tests/qa/oracles/signin/issue-993.md'), /cancelled at the provider/)
})

/** Played scenarios with no mutant, each for a stated reason. Anything else must have one. */
const NO_MUTANT = new Map([
  [
    'signin-provider-cancelled',
    'a product FAIL on this tree (issue #993, fix not merged): a FAIL needs no RED proof, and there is no green to break'
  ],
  [
    'signin-github-cancelled',
    'the same product FAIL through GitHub (issue #993, fix not merged): no green to break'
  ]
])

test('every played door scenario is the target of a mutant; the exceptions are named', () => {
  const targeted = new Set(SCENARIO_MUTANTS.flatMap((m) => m.scenarios))
  for (const key of targeted)
    assert.ok(
      SCENARIOS.some((s) => s.key === key && s.run),
      `a mutant targets ${key}, which is not a played scenario`
    )
  for (const s of SCENARIOS.filter((x) => x.run))
    assert.ok(targeted.has(s.key) || NO_MUTANT.has(s.key), `${s.key}: no mutant could prove it RED`)
  for (const key of NO_MUTANT.keys())
    assert.ok(!targeted.has(key), `${key} has a mutant now: drop the exception`)
})

test('every scenario mutant applies exactly once to the product tree of this checkout', () => {
  const ids = new Set()
  for (const m of SCENARIO_MUTANTS) {
    assert.ok(!ids.has(m.id), `duplicate mutant ${m.id}`)
    ids.add(m.id)
    for (const edit of [m, ...(m.also ?? [])]) {
      assert.notEqual(edit.find, edit.replace, `${m.id}: changes nothing`)
      const applied = applyMutation(read(`apps/tracy-web/${edit.file}`), edit)
      assert.ok(applied.ok, `${m.id} (${edit.file}): ${applied.why}`)
    }
  }
})

test('the numbers the docs state are the ones the tables give', () => {
  const played = SCENARIOS.filter((s) => s.run).length
  const line = `api door scenarios: ${SCENARIOS.length} (${played} played, ${SCENARIOS.length - played} pending by name) · ui product-screen outcomes: ${OUTCOMES.length} · flows cases: ${flowCases.length}`
  for (const doc of ['tests/qa/README.md', 'tasks/nhat-ky/2026-10-06-qa-suite.md'])
    assert.ok(read(doc).includes(line), `${doc} does not carry the derived line:\n${line}`)
  assert.match(read('tests/qa/layers/api/README.md'), new RegExp(`${SCENARIOS.length} door scenarios`))
  assert.match(read('tests/qa/layers/ui/README.md'), new RegExp(`${OUTCOMES.length} product-screen outcomes`))
  assert.match(read('tests/qa/layers/flows/README.md'), new RegExp(`${flowCases.length} ca\\b`))
})

test('the journal entry of this branch keeps its required fields and names what is still open', () => {
  const journal = read('tasks/nhat-ky/2026-10-06-qa-suite.md')
  const entries = journal.split(/\n(?=- \*\*)/)
  assert.ok(entries.length >= 3, 'the catch-up entry is missing')
  for (const entry of entries) {
    assert.match(entry, /^- \*\*.+\*\* .*— .+ · #\d+ · `feat\/qa-suite` · \d{2}\/\d{2}\/\d{4}/, 'entry head')
    assert.match(entry, /\*\*Chạm ai:\*\*/, 'entry has no "Chạm ai" line')
  }
  const last = entries.at(-1)
  assert.match(last, /#993/)
  assert.match(last, /PENDING/)
  assert.match(last, /QA-API-scenario-signin-provider-cancelled/, 'the known product FAIL is not named')
})
