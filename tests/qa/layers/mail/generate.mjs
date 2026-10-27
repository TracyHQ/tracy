#!/usr/bin/env node
// Generates denominator.json and cases/*.json of the mail layer from the product code and the
// oracle. Nothing in them is typed by hand per item: items come from LETTER_KINDS, WEB_LANGUAGES,
// NOTIFICATION_GROUPS, MODES and the exports of the mail builders; cases come from the tables below.
//
//   node tests/qa/layers/mail/generate.mjs           rewrite denominator.json and cases/
//   node tests/qa/layers/mail/generate.mjs --check   fail (exit 1) when the files differ from a fresh generation
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CASES_DIR,
  LAYER_DIR,
  REPO_ROOT,
  SRC_REL,
  UsageError,
  hashFile,
  loadProduct,
  parseFlags,
  stable,
  writeAtomic
} from './common.mjs'
import { MAX_LAYER_FILE_BYTES, readBoundedSync, readTextSync } from '../../lib/bounded-reader.mjs'
import { assertDenominator, DENOMINATOR_SCHEMA_ID, isReference, NaTable } from '../../lib/denominator.mjs'
import { docRel } from '../../lib/doc-source.mjs'
import { BUILDER_NAMES } from './machine.mjs'
import { oracle } from './machine-support.mjs'
import { SUITES, describeSuite } from './legacy.mjs'

export const GENERATE_COMMAND = 'node tests/qa/layers/mail/generate.mjs'
export const COMMON_TAGS = [
  'happy',
  'empty',
  'invalid',
  'boundary',
  'dependency-failure',
  'repeat',
  'cleanup'
]
export const MAIL_TAGS = [
  'recipient',
  'locale',
  'escape',
  'token-expired',
  'token-replay',
  'transport-failure',
  'deduplicate',
  'preferences',
  'unsubscribe',
  'no-secret-leak'
]
export const ALL_TAGS = [...COMMON_TAGS, ...MAIL_TAGS]

const ADR = 'docs/adr/0026-inbox-and-email-notifications.md'
const INPUT_FILES = [
  `${SRC_REL}/mail/letters/index.js`,
  `${SRC_REL}/mail/letters/team.js`,
  `${SRC_REL}/mail/letters/comments.js`,
  `${SRC_REL}/mail/emails.js`,
  `${SRC_REL}/mail/confirmation-mail.js`,
  `${SRC_REL}/mail/notification-mail.js`,
  `${SRC_REL}/mail/transport.js`,
  `${SRC_REL}/mail/site-mail/policy.js`,
  `${SRC_REL}/lib/i18n/index.js`,
  `${SRC_REL}/notifications/preferences.js`
]

const KNOWN_MAIL_FILES = new Set([
  'confirmation-mail.js',
  'emails.js',
  'notification-mail.js',
  'transport.js',
  'letters',
  'site-mail',
  'templates'
])
const MAPPED_BUILDER_EXPORTS = {
  teamInviteMail: 'team.invited',
  inviteMail: 'workspace-invite',
  addedToWorkspace: 'workspace-added',
  removalCodeMail: 'removal-code',
  signInCodeMail: 'signin-code',
  betaMail: 'whitelist-beta',
  confirmationMail: 'whitelist-confirmation',
  joinRequestMail: 'letter:team.join_request'
}
const HELPER_EXPORTS = new Set(['personLine', 'shortName', 'siteName'])

const na = (reason, source) => ({ reason, source })
const PURE = na(
  'pure renderer: returns strings, owns no file, socket, timer or process',
  `${SRC_REL}/mail/notification-mail.js (module header: "Pure")`
)
const NO_SIGNED_LINK = na(
  'the letter carries no signed or single-use link; its links are plain URLs built by the deployment',
  `${SRC_REL}/mail/letters/team.js (header: team.invited alone carries a signed accept link)`
)
const NOT_A_NOTIFICATION = na(
  'not a notification letter: it never goes through the notifier, so no preference or unsubscribe header applies',
  `${SRC_REL}/notifications/unsubscribe.js (header: sign-in code, whitelist, beta and the invitation itself never carry the header)`
)
const NO_FREE_TEXT = na(
  'no free text reaches the letter: the only inputs are shape-validated (code, URL)',
  `${SRC_REL}/mail/emails.js (asCode, safeUrl: a value of the wrong shape is dropped or throws)`
)

// ---------------------------------------------------------------------------------------------

function sourceHashes(root) {
  return Object.fromEntries(
    [...INPUT_FILES, ...Object.values(oracle.sources).map((s) => s.path)]
      .sort()
      .map((rel) => [rel, hashFile(path.join(root, docRel(root, rel)))])
  )
}

async function extract(root) {
  const { LETTER_KINDS } = await loadProduct(root, 'mail/letters/index.js')
  const { WEB_LANGUAGES } = await loadProduct(root, 'lib/i18n/index.js')
  const { NOTIFICATION_GROUPS } = await loadProduct(root, 'notifications/preferences.js')
  const { MODES } = await loadProduct(root, 'mail/site-mail/policy.js')
  const emails = await loadProduct(root, 'mail/emails.js')
  const confirmation = await loadProduct(root, 'mail/confirmation-mail.js')
  const mailEntries = readdirSync(path.join(root, SRC_REL, 'mail')).sort()
  return {
    kinds: [...LETTER_KINDS],
    languages: [...WEB_LANGUAGES],
    groups: NOTIFICATION_GROUPS.map((g) => ({ id: g.id, locked: g.locked, kinds: [...g.kinds] })),
    modes: [...MODES],
    builderExports: [...Object.keys(emails), ...Object.keys(confirmation)]
      .filter((n) => typeof (emails[n] ?? confirmation[n]) === 'function')
      .sort(),
    mailEntries
  }
}

function unresolvedFor(x, root) {
  const out = []
  const oracleKinds = Object.keys(oracle.kinds.table)
  for (const k of x.kinds)
    if (!oracleKinds.includes(k))
      out.push({
        source: 'letters/index.js LETTER_KINDS',
        detail: `kind ${k} has no row in the oracle: its button and facts are unspecified`
      })
  for (const k of oracleKinds)
    if (!x.kinds.includes(k))
      out.push({ source: 'oracle kinds', detail: `kind ${k} is in the oracle but has no renderer` })
  if (JSON.stringify([...x.languages].sort()) !== JSON.stringify([...oracle.languages.ids].sort()))
    out.push({
      source: 'lib/i18n WEB_LANGUAGES',
      detail: `code languages ${x.languages.join(',')} differ from the oracle ${oracle.languages.ids.join(',')}`
    })
  for (const name of x.builderExports)
    if (!Object.hasOwn(MAPPED_BUILDER_EXPORTS, name) && !HELPER_EXPORTS.has(name))
      out.push({
        source: 'mail/emails.js exports',
        detail: `exported function ${name} is not mapped to a denominator item`
      })
  for (const entry of x.mailEntries)
    if (!KNOWN_MAIL_FILES.has(entry))
      out.push({ source: 'src/mail', detail: `${entry} is not part of the known mail surface` })
  const mappedKinds = new Set(Object.values(MAPPED_BUILDER_EXPORTS))
  for (const b of BUILDER_NAMES)
    if (!mappedKinds.has(b) && b !== 'team.invited')
      out.push({ source: 'machine.mjs BUILDERS', detail: `builder ${b} has no mapped export` })
  for (const [key, source] of Object.entries(oracle.sources)) {
    const now = hashFile(path.join(root, docRel(root, source.path)))
    if (now !== source.sha256)
      out.push({
        source: `oracle ${key}`,
        detail: `${source.path} changed since the oracle was pinned (${source.sha256.slice(0, 12)} -> ${now.slice(0, 12)}): re-read it before trusting the expectations`
      })
  }
  for (const note of oracle.unresolved) out.push({ source: 'oracle', detail: note })
  out.push({
    source: 'site-mail modes',
    detail: `MODES (${x.modes.join(', ')}) has no oracle independent of the code; the mode items stay open until a spec names them`
  })
  out.push({
    source: 'rule:no-agent-notification',
    detail:
      'ADR 0026 decision 3 (no notification about an agent action) is checked at no event door: it needs a fixture that drives the door with an agent actor, and R2 (no letter to the person who acted) is a different rule and is not credited for it'
  })
  out.push({
    source: 'mail doors',
    detail:
      'which doors mail which letters (seats, workspaces, ops, beta, comments) is not extracted by an AST pass; only the builders are. Door-level routing is covered by the adapted suites, not credited here'
  })
  return out
}

// ---------------------------------------------------------------------------------------------

function buildItems(x) {
  const items = []
  const add = (id, kind, na = {}) => items.push({ id, kind, requiredTags: ALL_TAGS, na })
  for (const kind of x.kinds)
    for (const lang of x.languages)
      add(`letter:${kind}:${lang}`, 'notification-letter', {
        cleanup: PURE,
        'token-expired': NO_SIGNED_LINK,
        'token-replay': NO_SIGNED_LINK
      })
  const directNa = {
    'team.invited': { cleanup: PURE, preferences: NOT_A_NOTIFICATION, unsubscribe: NOT_A_NOTIFICATION },
    'workspace-invite': {
      cleanup: PURE,
      preferences: NOT_A_NOTIFICATION,
      unsubscribe: NOT_A_NOTIFICATION,
      'token-expired': na(
        'the invitation has no link of its own; acceptance is the signed-in /me/workspaces/:id/accept door',
        `${SRC_REL}/mail/emails.js (workspaceInviteMail docblock)`
      ),
      'token-replay': na(
        'the invitation has no link of its own; acceptance is the signed-in /me/workspaces/:id/accept door',
        `${SRC_REL}/mail/emails.js (workspaceInviteMail docblock)`
      )
    },
    'workspace-added': {
      cleanup: PURE,
      preferences: NOT_A_NOTIFICATION,
      unsubscribe: NOT_A_NOTIFICATION,
      'token-expired': na(
        'the letter has no link of its own',
        `${SRC_REL}/mail/emails.js (workspaceInviteMail docblock)`
      ),
      'token-replay': na(
        'the letter has no link of its own',
        `${SRC_REL}/mail/emails.js (workspaceInviteMail docblock)`
      )
    },
    'removal-code': { cleanup: PURE, preferences: NOT_A_NOTIFICATION, unsubscribe: NOT_A_NOTIFICATION },
    'signin-code': {
      cleanup: PURE,
      preferences: NOT_A_NOTIFICATION,
      unsubscribe: NOT_A_NOTIFICATION,
      escape: NO_FREE_TEXT
    },
    'whitelist-beta': {
      cleanup: PURE,
      preferences: NOT_A_NOTIFICATION,
      unsubscribe: NOT_A_NOTIFICATION,
      escape: NO_FREE_TEXT
    },
    'whitelist-confirmation': {
      cleanup: PURE,
      preferences: NOT_A_NOTIFICATION,
      unsubscribe: NOT_A_NOTIFICATION,
      'token-expired': na(
        'the confirmation carries no link that grants anything',
        `${SRC_REL}/mail/confirmation-mail.js`
      ),
      'token-replay': na(
        'the confirmation carries no link that grants anything',
        `${SRC_REL}/mail/confirmation-mail.js`
      )
    }
  }
  for (const b of BUILDER_NAMES)
    for (const lang of x.languages) add(`direct:${b}:${lang}`, 'direct-letter', directNa[b])
  const inert = {
    escape: na('structured data and bearer tokens, not rendered HTML', 'no HTML is produced by this item'),
    locale: na('not reader-facing text', 'no copy is produced by this item'),
    preferences: NOT_A_NOTIFICATION,
    unsubscribe: NOT_A_NOTIFICATION
  }
  add('flow:signin-otp', 'flow', {
    cleanup: na(
      'state lives in the injected in-memory store of the test; nothing outlives it',
      `${SRC_REL}/identity/store.js (memoryIdentityStore)`
    ),
    preferences: NOT_A_NOTIFICATION,
    unsubscribe: NOT_A_NOTIFICATION
  })
  add('flow:team-invite-token', 'token', {
    ...inert,
    cleanup: PURE,
    'transport-failure': na('signing and verifying are local computations', `${SRC_REL}/lib/team-invite.js`),
    deduplicate: na(
      'a token is not stored; the seat row is the table of grants',
      `${SRC_REL}/lib/team-invite.js (header: WHY A TOKEN AND NOT A ROW)`
    )
  })
  add('flow:unsubscribe-token', 'token', {
    ...inert,
    cleanup: PURE,
    'transport-failure': na(
      'signing and verifying are local computations',
      `${SRC_REL}/lib/unsubscribe-token.js`
    ),
    deduplicate: na(
      'a token is not stored; it needs no one-shot bookkeeping',
      `${SRC_REL}/lib/unsubscribe-token.js (header)`
    )
  })
  add('flow:notifier-retry', 'flow', {
    ...inert,
    'token-expired': na('no token', `${SRC_REL}/notifications/store.js`),
    'token-replay': na('no token', `${SRC_REL}/notifications/store.js`)
  })
  for (const g of x.groups)
    add(`preference-group:${g.id}`, 'preference-group', {
      escape: inert.escape,
      locale: inert.locale,
      cleanup: na(
        'rows are written by the Settings door under test elsewhere',
        `${SRC_REL}/notifications/preferences.js`
      ),
      'token-expired': na('no token', `${SRC_REL}/notifications/preferences.js`),
      'token-replay': na('no token', `${SRC_REL}/notifications/preferences.js`)
    })
  const transportNa = {
    escape: na('the provider body is JSON built from already-rendered parts', `${SRC_REL}/mail/transport.js`),
    locale: na('transport does not choose words', `${SRC_REL}/mail/transport.js`),
    'token-expired': na('no token', `${SRC_REL}/mail/transport.js`),
    'token-replay': na('no token', `${SRC_REL}/mail/transport.js`),
    cleanup: na(
      'stateless wrapper over fetch; a timer or socket belongs to fetch',
      `${SRC_REL}/mail/transport.js`
    ),
    preferences: NOT_A_NOTIFICATION
  }
  add('transport:resend', 'transport', transportNa)
  add('transport:console', 'transport', { ...transportNa, unsubscribe: NOT_A_NOTIFICATION })
  const siteNa = {
    locale: na(
      "a site letter is the customer's own message; Tracy does not translate it",
      `${SRC_REL}/mail/site-mail/message.js`
    ),
    preferences: NOT_A_NOTIFICATION,
    unsubscribe: NOT_A_NOTIFICATION
  }
  for (const mode of x.modes) add(`site-mail:mode:${mode}`, 'site-mail', siteNa)
  add('site-mail:token', 'token', {
    escape: na('a hex token', `${SRC_REL}/mail/site-mail/token.js`),
    locale: siteNa.locale,
    preferences: NOT_A_NOTIFICATION,
    unsubscribe: NOT_A_NOTIFICATION,
    cleanup: PURE,
    'transport-failure': na('pure HMAC', `${SRC_REL}/mail/site-mail/token.js`),
    deduplicate: na('nothing is stored', `${SRC_REL}/mail/site-mail/token.js (header: Nothing stores it)`)
  })
  for (const name of ['message-rewrite', 'smtp-send', 'relay-route', 'domains'])
    add(`site-mail:${name}`, 'site-mail', siteNa)
  // ADR 0026 decision 3: an agent's own action creates no notification. This is not the R2
  // no-self rule (the recipient is not the actor); it has to be shown at the door that records the
  // event, driven with an agent actor. No such fixture exists yet, so no case claims it: it stays open.
  // Only tags that describe the content or delivery of a letter are N-A: under this rule an agent's
  // action produces no letter at all. Every tag that describes the event door (happy, empty,
  // invalid, boundary, dependency-failure, repeat, cleanup, recipient, deduplicate, preferences)
  // stays open until a case drives the door with an agent actor.
  const noLetter = na(
    'under this rule the agent action produces no letter to have this property',
    `${ADR} decision 3`
  )
  const LETTER_ONLY = [
    'locale',
    'escape',
    'token-expired',
    'token-replay',
    'transport-failure',
    'unsubscribe',
    'no-secret-leak'
  ]
  add('rule:no-agent-notification', 'rule', Object.fromEntries(LETTER_ONLY.map((t) => [t, noLetter])))
  return items
}

// ---------------------------------------------------------------------------------------------
// Cases. `a#p1|p2` in assertionIds means: the slice of the assertion's variants that start with p1 or p2.
// ---------------------------------------------------------------------------------------------

const READS = [`${SRC_REL}/mail`, `${SRC_REL}/notifications`, `${SRC_REL}/lib`, `${SRC_REL}/identity`]
const MACHINE = { reads: READS, writes: [], mail: false, model: false, containers: false }
const ENV_DB = { reads: [], writes: [], mail: false, model: false, containers: false }

function oracleRef(source, ref, invariant) {
  return { source, ref, invariant }
}
const O = {
  adr: (ref, invariant) => oracleRef(ADR, ref, invariant),
  letters: (invariant) =>
    oracleRef(
      `${SRC_REL}/mail/letters/team.js and comments.js header comments (approved copy, spec #809)`,
      'per-kind button, facts and "never mailed" rules',
      invariant
    ),
  policy: (ref, invariant) => oracleRef(`${SRC_REL}/lib/policy.js`, ref, invariant),
  oracleFile: (ref, invariant) => oracleRef('tests/qa/oracles/mail/oracle.json', ref, invariant),
  rfc: (ref, invariant) => oracleRef(ref, ref, invariant)
}

function makeCase({
  key,
  tags,
  variant = null,
  itemIds,
  assertionIds,
  requirement,
  oracle: o,
  effects = MACHINE,
  prerequisites = [],
  legacyIds = []
}) {
  const id = `QA-MAIL-${key}-${tags.length ? tags[0] : 'suite'}${variant ? `-${variant}` : ''}`
  return {
    id,
    itemIds,
    requirement,
    oracle: o,
    edgeTags: tags,
    targets: ['local'],
    effects,
    prerequisites,
    assertionIds,
    redProof: null,
    legacyIds
  }
}

function letterCases(x) {
  const cases = []
  for (const kind of x.kinds) {
    const items = x.languages.map((l) => `letter:${kind}:${l}`)
    const slice = `#${kind}:`
    const spec = oracle.kinds.table[kind] ?? {}
    const add = (tags, variant, assertion, requirement, o, extra = {}) =>
      cases.push(
        makeCase({
          key: kind,
          tags,
          variant,
          itemIds: items,
          assertionIds: [`${assertion}${slice}`],
          requirement,
          oracle: o,
          ...extra
        })
      )
    const hostile = 'markup in user-supplied text is escaped in HTML'
    add(
      ['happy'],
      'shape',
      'mail.letter.shape',
      `${kind} (${spec.case ?? '?'}) renders subject, HTML and text in all eight languages with no placeholder, raw key or printed hole`,
      O.adr(
        'decision 5, 7',
        'Every letter is complete in each language and rendered on the shared template; a sentence with a hole in it is never sent.'
      )
    )
    add(
      ['happy'],
      'links',
      'mail.letter.links',
      `${kind} links absolutely to the deployment: ${spec.button ? `its button opens the ${spec.button} door` : 'no button'}, plus the manage link`,
      O.letters(`button: ${spec.button ?? 'none'}; footer carries Manage notifications`)
    )
    add(
      ['empty'],
      null,
      'mail.letter.empty',
      `${kind} with missing facts sends nothing or a clean letter, never a hole`,
      O.letters(
        'a letter that would need a missing fact sends nothing; a comment deleted since is never mailed (R3)'
      )
    )
    add(
      ['invalid'],
      null,
      'mail.letter.invalid',
      `${kind} refuses an unknown role, wrong-typed facts and header injection`,
      O.letters('the seat book allows four roles only; a letter needing one sends nothing otherwise'),
      { legacyIds: [] }
    )
    add(
      ['boundary'],
      null,
      'mail.letter.boundary',
      `${kind} stays well-formed for one-character, 10,000-character and Unicode facts`,
      O.rfc(
        'RFC 5322 section 2.2.3 (no line break in a header value)',
        'subject has no CR/LF; the HTML document is complete'
      )
    )
    add(
      ['repeat'],
      null,
      'mail.letter.repeat',
      `${kind} renders identically twice and leaves its input unchanged`,
      O.adr('decision 7', 'a held or retried letter is rendered again at send time and must read the same')
    )
    add(
      ['locale'],
      null,
      'mail.letter.locale',
      `${kind} reads in each of the eight languages and any other language reads as English`,
      O.adr(
        'decision 5',
        'the 8 interface languages; every other value (ja, zh-TW, empty, garbage) is English'
      )
    )
    add(
      ['escape'],
      null,
      'mail.letter.escape',
      `${kind}: ${hostile}`,
      O.oracleFile(
        'hostile',
        'a letter must not carry live markup from a person-supplied name, quote or site address'
      )
    )
    add(
      ['no-secret-leak'],
      null,
      'mail.letter.secret',
      `${kind} prints no field the renderer was not meant to print`,
      O.oracleFile(
        'secrets',
        'no secret, token or password of the row or the actor reaches any part of the letter'
      )
    )
    add(
      ['recipient', 'locale'],
      'routing',
      'mail.notify.recipient',
      `${kind}: the notifier addresses the letter to the recipient, never the actor, in the recipient's language`,
      O.adr('decision 5, R2', 'language of the recipient: chosen, else English; one letter per recipient')
    )
    add(
      ['recipient'],
      'no-self',
      'mail.notify.no-self',
      `${kind}: nobody is notified of their own action`,
      O.adr('R2 and decision 3', 'never notify the person who acted')
    )
    add(
      ['dependency-failure', 'transport-failure'],
      null,
      'mail.notify.failure',
      `${kind}: a failed send stays owed, is retried once, and is never reported as sent`,
      O.adr('decision 7', 'a failed send is retried; five attempts at most; the door is never undone by it')
    )
    add(
      ['deduplicate'],
      null,
      'mail.notify.dedupe',
      `${kind}: a recipient listed several times gets one row and one letter`,
      O.adr('decision 4', 'one row per recipient')
    )
    add(
      ['preferences'],
      null,
      'mail.notify.preferences',
      `${kind}: the recipient's Settings choice for its group is honoured; the locked group is not switchable`,
      O.adr('decision 1, 8', 'a channel the person turned off is dropped; Join requests is locked on')
    )
    add(
      ['unsubscribe'],
      null,
      'mail.notify.unsubscribe-header',
      `${kind}: carries a working one-click unsubscribe for its own group, none in the locked group`,
      O.oracleFile('groups', 'RFC 8058 headers for switchable groups only')
    )
  }
  return cases
}

const DIRECT_REQ = {
  'team.invited': 'the invitation letter (T1)',
  'workspace-invite': 'the workspace invitation to a person without an account',
  'workspace-added': 'the workspace invitation to a person with an account',
  'removal-code': 'the Tracy-staff removal code letter',
  'signin-code': 'the sign-in code letter',
  'whitelist-beta': 'the whitelist (beta) letter',
  'whitelist-confirmation': 'the whitelist confirmation letter'
}

function directCases(x) {
  const cases = []
  for (const b of BUILDER_NAMES) {
    const items = x.languages.map((l) => `direct:${b}:${l}`)
    const what = DIRECT_REQ[b]
    const add = (tags, variant, assertion, requirement, o, extra = {}) =>
      cases.push(
        makeCase({
          key: b,
          tags,
          variant,
          itemIds: extra.itemIds ?? items,
          assertionIds: [assertion],
          requirement,
          oracle: o,
          ...extra
        })
      )
    const shape = O.adr(
      'decision 7 and templates/README.md',
      'every Tracy letter wears the shared layout and one-line footer; each language is complete'
    )
    add(
      ['happy'],
      'shape',
      `mail.direct.shape:${b}`,
      `${what} renders every part in all eight languages and prints what it must`,
      shape
    )
    add(
      ['happy'],
      'links',
      `mail.direct.links:${b}`,
      `${what} carries only absolute links${b === 'team.invited' ? ' to the accept and decline pages, token included' : ''}`,
      O.adr('decision 7', 'a mail keeps only the links that do something')
    )
    add(
      ['empty'],
      null,
      `mail.direct.empty:${b}`,
      `${what} with names, sites or a website missing steps down to a plainer sentence`,
      O.rfc('emails.js docblocks (steps down through what is known)', 'no hole, no "undefined"')
    )
    add(
      ['invalid'],
      null,
      `mail.direct.invalid:${b}`,
      `${what} rejects a bad URL, role or code shape`,
      O.rfc(
        'OWASP: only http(s) URLs in href',
        'javascript:, credentials and non-http schemes never reach an attribute'
      )
    )
    add(
      ['boundary'],
      null,
      `mail.direct.boundary:${b}`,
      `${what} stays well-formed for very long names and long site lists`,
      O.rfc('RFC 5322 section 2.2.3', 'subject has no CR/LF; HTML complete')
    )
    add(
      ['repeat'],
      null,
      `mail.direct.repeat:${b}`,
      `${what} renders identically twice`,
      O.adr('decision 7', 'rendering is a pure function of its input')
    )
    add(
      ['locale'],
      null,
      `mail.direct.locale:${b}`,
      `${what} reads in eight languages; others read as English`,
      O.adr('decision 5', 'the 8 interface languages, else English')
    )
    add(
      ['no-secret-leak'],
      null,
      `mail.direct.secret:${b}`,
      `${what} prints no unrelated secret passed alongside its input`,
      O.oracleFile('secrets', 'no secret reaches the letter')
    )
    if (BUILDER_NAMES.length && !['signin-code', 'whitelist-beta'].includes(b))
      add(
        ['escape'],
        null,
        `mail.direct.escape:${b}`,
        `${what}: markup in a person-supplied name is escaped`,
        O.oracleFile('hostile', 'no live markup from user text')
      )
  }
  // the sign-in door
  const signinItems = [...x.languages.map((l) => `direct:signin-code:${l}`), 'flow:signin-otp']
  const flow = (tags, variant, assertionIds, requirement, o, extra = {}) =>
    cases.push(
      makeCase({
        key: 'signin-otp',
        tags,
        variant,
        itemIds: extra.itemIds ?? ['flow:signin-otp'],
        assertionIds,
        requirement,
        oracle: o,
        ...extra
      })
    )
  flow(
    ['recipient', 'locale', 'no-secret-leak'],
    'letter',
    ['mail.signin.recipient'],
    'the code goes to exactly the address asked for, in the request language, with its lifetime and no session secret',
    O.policy('CODE_TTL_MS', 'ten minutes printed in the letter; the code leads the subject'),
    { itemIds: signinItems }
  )
  flow(
    ['happy', 'token-expired'],
    'accept-before',
    ['mail.signin.expiry#accepted-before-expiry'],
    'a code is accepted just before it lapses',
    O.oracleFile('lifetimes.otpMs', '10 minutes')
  )
  flow(
    ['token-expired'],
    'refuse-after',
    ['mail.signin.expiry#refused-after-expiry'],
    'a code is refused after it lapses and issues no session',
    O.oracleFile('lifetimes.otpMs', '10 minutes')
  )
  flow(
    ['token-replay'],
    'spent',
    [
      'mail.signin.replay#used-code-refused|too-many-wrong-guesses-spend-the-code|code-of-another-address-refused'
    ],
    'a code that was used, guessed against too often, or belongs to another address is refused',
    O.oracleFile('lifetimes.otpMaxAttempts', 'five wrong codes spend the code; a used code is gone')
  )
  flow(
    ['deduplicate'],
    'replaced',
    ['mail.signin.replay#replaced-code-refused'],
    'asking again replaces the code: the first one is refused',
    O.policy('MAX_ATTEMPTS and putCode', 'one live code per address')
  )
  flow(
    ['dependency-failure', 'transport-failure'],
    null,
    ['mail.signin.failure'],
    'a mail that could not be sent is not reported as sent',
    O.rfc(`${SRC_REL}/mail/transport.js header (#804)`, 'each door reports the failure it knows how to show')
  )
  // invitation token
  const inv = (tags, variant, a, req, o, extra = {}) =>
    cases.push(
      makeCase({
        key: 'team-invite-token',
        tags,
        variant,
        itemIds: extra.itemIds ?? ['flow:team-invite-token'],
        assertionIds: a,
        requirement: req,
        oracle: o,
        ...extra
      })
    )
  inv(
    ['happy'],
    'roundtrip',
    ['mail.invite.token#roundtrip'],
    'a signed invitation reads back its email (lowercased), role, sites and issue time',
    O.rfc(`${SRC_REL}/lib/team-invite.js header`, 'the token names the person and the sites')
  )
  inv(
    ['boundary'],
    'last-second',
    ['mail.invite.token#live-through-the-last-second'],
    'the invitation is live through the last second of its seven days',
    O.oracleFile('lifetimes.inviteSeconds', '604800 s, last second included')
  )
  inv(
    ['token-expired'],
    null,
    ['mail.invite.token#expired-one-second-later'],
    'one second later it is expired',
    O.oracleFile('lifetimes.inviteSeconds', '604800 s')
  )
  inv(
    ['invalid'],
    'future',
    ['mail.invite.token#future-token-invalid'],
    'a token issued in the future is refused',
    O.rfc(`${SRC_REL}/lib/team-invite.js teamInviteAge`, 'never a longer life than the policy')
  )
  inv(
    ['invalid'],
    'forged',
    ['mail.invite.token#tampered'],
    'a forged, re-signed, truncated or non-string token verifies as nothing',
    O.rfc(`${SRC_REL}/lib/team-invite.js verifyTeamInvite`, 'null, never a reason')
  )
  inv(
    ['empty'],
    'no-secret',
    ['mail.invite.token#no-secret-no-token'],
    'no secret, no token',
    O.rfc(`${SRC_REL}/lib/team-invite.js signTeamInvite`, 'throws TypeError')
  )
  inv(
    ['happy'],
    'links',
    ['mail.invite.link'],
    'the mail carries the accept and decline URLs with the token, absolute, and prints the seven-day life',
    O.oracleFile('lifetimes.inviteSeconds', 'seven days'),
    { itemIds: [...x.languages.map((l) => `direct:team.invited:${l}`), 'flow:team-invite-token'] }
  )
  inv(
    ['token-replay'],
    'accepted-twice',
    ['env:postgres'],
    'a repeated acceptance grants no second seat, audit or notification',
    O.adr('decision 4', 'the seat row is the table of grants'),
    {
      effects: ENV_DB,
      prerequisites: ['QA_STAND_DATABASE_URL'],
      itemIds: ['flow:team-invite-token', ...x.languages.map((l) => `direct:team.invited:${l}`)]
    }
  )
  // unsubscribe token
  const uns = (tags, variant, a, req, o) =>
    cases.push(
      makeCase({
        key: 'unsubscribe-token',
        tags,
        variant,
        itemIds: ['flow:unsubscribe-token'],
        assertionIds: a,
        requirement: req,
        oracle: o
      })
    )
  uns(
    ['happy'],
    'valid',
    ['mail.unsubscribe.token#valid-inside-lifetime'],
    'a fresh token names its account and group',
    O.policy('UNSUBSCRIBE_TTL_S', 'ninety days')
  )
  uns(
    ['token-expired'],
    null,
    ['mail.unsubscribe.token#refused-after-lifetime'],
    'a token older than ninety days is refused',
    O.oracleFile('lifetimes.unsubscribeSeconds', '90 days')
  )
  uns(
    ['token-replay', 'repeat'],
    null,
    ['mail.unsubscribe.token#repeat-is-harmless'],
    'pressing the link again is harmless: the token is not consumed',
    O.rfc(`${SRC_REL}/lib/unsubscribe-token.js header`, 'repeating it is harmless; no one-shot bookkeeping')
  )
  uns(
    ['invalid'],
    null,
    ['mail.unsubscribe.token#tampered-signature|swapped-payload|wrong-or-missing-secret|malformed'],
    'tampered, re-targeted, wrong-secret and malformed tokens read as nothing',
    O.rfc(`${SRC_REL}/lib/unsubscribe-token.js header`, 'forged, expired or shaped wrong is null')
  )
  // site mail token
  const sm = (tags, variant, a, req, o) =>
    cases.push(
      makeCase({
        key: 'site-mail-token',
        tags,
        variant,
        itemIds: ['site-mail:token'],
        assertionIds: a,
        requirement: req,
        oracle: o
      })
    )
  const smo = O.rfc(
    `${SRC_REL}/mail/site-mail/token.js header`,
    'hex(HMAC-SHA256(host secret, "site-mail:v1:" + label)); nothing stores it'
  )
  sm(
    ['happy', 'repeat'],
    'shape',
    ['mail.sitemail.token#shape-and-determinism'],
    'the token is 64 lowercase hex characters and stable',
    smo
  )
  sm(
    ['invalid'],
    'binding',
    ['mail.sitemail.token#bound-to-label-and-secret|malformed-is-false-not-a-throw'],
    'a token verifies only for its own label and host secret; malformed input is false, not a throw',
    smo
  )
  sm(
    ['token-expired', 'token-replay'],
    null,
    ['mail.sitemail.token#no-lifetime-and-not-single-use'],
    'the token has no lifetime and is not single-use, as designed',
    smo
  )
  // preferences groups
  for (const g of x.groups) {
    const kinds = oracle.groups.byId[g.id] ?? g.kinds
    const prefix = kinds.map((k) => `${k}:`).join('|')
    cases.push(
      makeCase({
        key: `preference-group-${g.id}`,
        tags: ['happy'],
        variant: 'definition',
        itemIds: [`preference-group:${g.id}`],
        assertionIds: [`mail.preferences.groups#group:${g.id}|six-groups`],
        requirement: `group ${g.id} lists the kinds the ADR gives it${g.locked ? ' and is locked on' : ''}`,
        oracle: O.adr('decision 8', 'six groups; Join requests locked')
      })
    )
    // A kind whose group no source names (oracle `groups.assumed`) is not graded against that group's
    // switches: its own case binds to no catalogue row, so it stays PENDING with the reason.
    const assumed = kinds.filter((k) => oracle.groups.assumed.includes(k))
    const named = kinds.filter((k) => !assumed.includes(k))
    if (named.length)
      cases.push(
        makeCase({
          key: `preference-group-${g.id}`,
          tags: ['preferences'],
          itemIds: [`preference-group:${g.id}`],
          assertionIds: [`mail.notify.preferences#${named.map((k) => `${k}:`).join('|')}`],
          requirement: `the switches of group ${g.id} decide what is written and mailed`,
          oracle: O.adr(
            'decision 1, 8',
            'a channel switched off is dropped; the locked group is not switchable'
          )
        })
      )
    if (assumed.length)
      cases.push(
        makeCase({
          key: `preference-group-${g.id}`,
          tags: ['preferences'],
          variant: 'assumed',
          itemIds: [`preference-group:${g.id}`],
          assertionIds: [`mail.notify.preferences#${assumed.map((k) => `${k}:`).join('|')}`],
          requirement: `the switches of group ${g.id} decide what is written and mailed for ${assumed.join(', ')}`,
          oracle: O.oracleFile(
            'groups.assumed',
            `no source names the group of ${assumed.join(', ')}; ${g.id} is assumed, so its switches are not graded`
          )
        })
      )
    cases.push(
      makeCase({
        key: `preference-group-${g.id}`,
        tags: ['unsubscribe'],
        itemIds: [`preference-group:${g.id}`],
        assertionIds: [`mail.notify.unsubscribe-header#${prefix}`],
        requirement: `letters of group ${g.id} ${g.locked ? 'carry no' : 'carry a working'} unsubscribe header`,
        oracle: O.oracleFile('groups', 'RFC 8058 headers for switchable groups only')
      })
    )
  }
  cases.push(
    makeCase({
      key: 'preference-groups',
      tags: ['invalid', 'empty'],
      itemIds: x.groups.map((g) => `preference-group:${g.id}`),
      assertionIds: [
        'mail.preferences.groups#parse-changes-invalid|unknown-kind-always-on|locked-group-always-on|locked-group-cannot-be-switched-off'
      ],
      requirement:
        'a bad Settings body is refused, an unlisted kind is always on, a locked group cannot be switched off',
      oracle: O.adr('decision 8', 'a kind in no group is always on; Join requests is locked')
    })
  )
  // transport
  const tr = (key, tags, variant, a, req, o, items) =>
    cases.push(
      makeCase({ key, tags, variant, itemIds: [items], assertionIds: a, requirement: req, oracle: o })
    )
  const resend = O.rfc(
    'Resend API contract: POST https://api.resend.com/emails with Bearer key; Idempotency-Key header; RFC 8058 headers',
    'fields pass through unchanged; the key travels only in the Authorization header'
  )
  tr(
    'transport-resend',
    ['happy', 'recipient', 'deduplicate', 'unsubscribe', 'no-secret-leak'],
    'payload',
    ['mail.transport.payload#fields-pass-through'],
    'every field reaches the provider unchanged, the idempotency key is sent, the API key stays out of the body',
    resend,
    'transport:resend'
  )
  tr(
    'transport-resend',
    ['empty'],
    'minimal',
    ['mail.transport.payload#no-key-no-ack'],
    'a letter with no optional parts sends none of them',
    resend,
    'transport:resend'
  )
  tr(
    'transport-resend',
    ['boundary'],
    'recipient-list',
    ['mail.transport.payload#recipient-list-unchanged'],
    'a recipient list is passed through as a list',
    resend,
    'transport:resend'
  )
  tr(
    'transport-resend',
    ['dependency-failure', 'transport-failure'],
    'provider-status',
    ['mail.transport.failure#status-'],
    'a provider error answer rejects instead of counting as sent',
    O.adr('decision 7', 'a failed send is retried, never counted as sent'),
    'transport:resend'
  )
  tr(
    'transport-resend',
    ['invalid'],
    'provider-answer',
    ['mail.transport.failure#malformed-acknowledgement|network-failure|abort-signal-reaches-fetch'],
    'a malformed acknowledgement or a network error rejects; the abort signal reaches fetch',
    O.adr('decision 7', 'never reported as sent'),
    'transport:resend'
  )
  tr(
    'transport-resend',
    ['invalid', 'recipient'],
    'reserved-domains',
    ['mail.transport.reserved#reserved:|deliverable:'],
    'reserved test domains are not sent; real ones are',
    O.oracleFile('reservedDomains', 'RFC 2606 / 6761'),
    'transport:resend'
  )
  tr(
    'transport-console',
    ['dependency-failure', 'transport-failure', 'no-secret-leak'],
    'unconfigured',
    ['mail.transport.reserved#unconfigured-transport-refuses'],
    'outside local preview an unconfigured transport rejects and its log line names neither recipient nor content',
    O.rfc(
      `${SRC_REL}/mail/transport.js header (#804)`,
      'rejects; the one line written names nothing the letter carries'
    ),
    'transport:console'
  )
  // retry schedule and persistence (needs PostgreSQL)
  cases.push(
    makeCase({
      key: 'notifier-retry',
      tags: ['repeat', 'transport-failure'],
      variant: 'backoff',
      itemIds: ['flow:notifier-retry'],
      assertionIds: ['env:postgres'],
      requirement:
        'failed mail backs off 5, 10, 20 and 40 minutes on the database clock and is failed after the fifth attempt',
      oracle: O.oracleFile('retry', '5, 10, 20, 40 minutes; failed past 5'),
      effects: ENV_DB,
      prerequisites: ['QA_STAND_DATABASE_URL']
    })
  )
  cases.push(
    makeCase({
      key: 'notifier-retry',
      tags: ['deduplicate'],
      variant: 'concurrent',
      itemIds: ['flow:notifier-retry'],
      assertionIds: ['env:postgres'],
      requirement: 'two concurrent delivery runs do not send the same owed letter twice',
      oracle: O.adr('decision 7', 'one letter per owed row'),
      effects: ENV_DB,
      prerequisites: ['QA_STAND_DATABASE_URL']
    })
  )
  return cases
}

function manualCases(x) {
  const cases = []
  for (const kind of x.kinds) {
    cases.push(
      makeCase({
        key: kind,
        tags: [],
        variant: 'visual',
        itemIds: ['en', 'vi'].map((l) => `letter:${kind}:${l}`),
        assertionIds: [`manual:contact-sheet:${kind}`],
        requirement: `a person looks at ${kind} in English and Vietnamese: layout, clipping, wording and tone`,
        oracle: oracleRef(
          'approved copy (spec #809); tests/qa/oracles/mail',
          'contact sheet',
          'only a person can accept look and wording'
        ),
        effects: { reads: [], writes: [], mail: false, model: false, containers: false },
        prerequisites: ['playwright-chromium']
      })
    )
  }
  for (const b of BUILDER_NAMES)
    cases.push(
      makeCase({
        key: b,
        tags: [],
        variant: 'visual',
        itemIds: ['en', 'vi'].map((l) => `direct:${b}:${l}`),
        assertionIds: [`manual:contact-sheet:${b}`],
        requirement: `a person looks at ${DIRECT_REQ[b]} in English and Vietnamese`,
        oracle: oracleRef(
          'reviewed templates (templates/README.md)',
          'contact sheet',
          'only a person can accept look and wording'
        ),
        effects: { reads: [], writes: [], mail: false, model: false, containers: false },
        prerequisites: ['playwright-chromium']
      })
    )
  cases.push(
    makeCase({
      key: 'deliverability',
      tags: [],
      variant: 'inbox',
      itemIds: [],
      assertionIds: ['manual:deliverability'],
      requirement:
        'a real Gmail, Outlook and spam-folder check of the sender, SPF/DKIM/DMARC and how each client draws the letter',
      oracle: oracleRef(
        `${SRC_REL}/mail/templates/README.md`,
        'live Gmail/Outlook and mobile acceptance belongs to a later rollout',
        'outside the machine'
      ),
      effects: { reads: [], writes: [], mail: true, model: false, containers: false },
      prerequisites: ['real inbox']
    })
  )
  return cases
}

function suiteCases(x) {
  return SUITES.map((name) => {
    const d = describeSuite(name)
    const items = name.startsWith('site-mail')
      ? x.modes
          .map((m) => `site-mail:mode:${m}`)
          .concat([
            'site-mail:message-rewrite',
            'site-mail:smtp-send',
            'site-mail:relay-route',
            'site-mail:domains',
            'site-mail:token'
          ])
      : []
    return {
      ...makeCase({
        key: `suite.${name}`,
        tags: [],
        variant: null,
        itemIds: items,
        assertionIds: [`suite:${name}`],
        requirement: `the existing suite ${d.file} passes test by test with nothing skipped (observed green; the tests named for it in legacy-red.mjs are also observed red under their recorded mutation)`,
        oracle: oracleRef(
          d.file,
          'the suite itself',
          'a suite is an adapted regression, not an independent oracle: its verdict stays PENDING (or FAIL/ENV on evidence); green tests and per-test RED under a mutation are recorded as observations'
        ),
        effects: { reads: [d.file], writes: [], mail: false, model: false, containers: false },
        prerequisites: d.needs.map((n) => (n === 'postgres' ? 'QA_STAND_DATABASE_URL' : 'loopback-socket')),
        legacyIds: d.legacyIds
      }),
      id: `QA-MAIL-suite.${name}`
    }
  })
}

export async function generate(root = REPO_ROOT) {
  const x = await extract(root)
  // An N-A whose source is not a file is a claim without evidence: the tag stays required (and open), and
  // the claim is listed under `unresolved` instead of being counted as not applicable.
  const unsourced = new Map()
  const items = buildItems(x).map((item) => {
    const na = {}
    for (const [tag, n] of Object.entries(item.na)) {
      if (isReference(n.source.split(' ')[0])) na[tag] = n
      else unsourced.set(`${n.reason} (${n.source})`, (unsourced.get(`${n.reason} (${n.source})`) ?? 0) + 1)
    }
    return { ...item, na }
  })
  const cases = [...letterCases(x), ...directCases(x), ...manualCases(x), ...suiteCases(x)]
  const seen = new Set()
  for (const c of cases) {
    if (seen.has(c.id)) throw new Error(`duplicate case id ${c.id}`)
    seen.add(c.id)
  }
  const itemIds = new Set(items.map((i) => i.id))
  for (const c of cases)
    for (const id of c.itemIds) if (!itemIds.has(id)) throw new Error(`${c.id} names unknown item ${id}`)
  const coverageOf = (item) => {
    const covered = new Set(cases.filter((c) => c.itemIds.includes(item.id)).flatMap((c) => c.edgeTags))
    return {
      covered: [...covered].sort(),
      open: item.requiredTags.filter((t) => !covered.has(t) && !item.na[t])
    }
  }
  // The file follows the shared contract: each N-A reason once in `naReasons` (its source is the file the
  // reason names; the words after the file say where in it), a tag either owed or N-A, facts under `meta`.
  const reasons = new NaTable()
  const naKey = ({ reason, source }) => {
    const [file, ...where] = source.split(' ')
    return reasons.add(where.length > 0 ? `${reason} ${where.join(' ')}` : reason, file)
  }
  const denominator = assertDenominator(
    {
      schema: DENOMINATOR_SCHEMA_ID,
      layer: 'mail',
      source: 'apps/tracy-web/src/mail, notifications, identity and lib (extracted by import, not typed)',
      revision: oracle.revision,
      command: GENERATE_COMMAND,
      items: items.map((i) => ({
        id: i.id,
        kind: i.kind,
        requiredTags: i.requiredTags.filter((t) => !i.na[t]),
        na: Object.fromEntries(Object.entries(i.na).map(([tag, n]) => [tag, naKey(n)])),
        meta: { planned: coverageOf(i) }
      })),
      naReasons: reasons.table(),
      unresolved: [
        ...unresolvedFor(x, root).map((u) => ({ source: u.source, reason: u.detail })),
        ...[...unsourced].map(([claim, count]) => ({
          source: 'generate.mjs N-A table',
          reason: `N-A claimed without a source file, so ${count} obligation(s) stay required: ${claim}`
        }))
      ],
      details: {
        generatedFrom: sourceHashes(root),
        counts: {
          items: items.length,
          byKind: Object.fromEntries(
            [...new Set(items.map((i) => i.kind))].map((k) => [k, items.filter((i) => i.kind === k).length])
          ),
          rendererVariants: items.filter((i) => i.kind === 'notification-letter').length,
          cases: cases.length,
          requiredObligations: items.reduce((n, i) => n + i.requiredTags.length, 0),
          notApplicable: items.reduce((n, i) => n + Object.keys(i.na).length, 0),
          plannedCovered: items.reduce(
            (n, i) => n + coverageOf(i).covered.filter((t) => i.requiredTags.includes(t)).length,
            0
          ),
          open: items.reduce((n, i) => n + coverageOf(i).open.length, 0)
        }
      }
    },
    'mail'
  )
  return { denominator, cases }
}

const caseFile = (c) => `${c.id.replaceAll(/[^A-Za-z0-9._-]/g, '_')}.json`

function renderRaw({ denominator, cases }) {
  const files = new Map([[path.join(LAYER_DIR, 'denominator.json'), stable(denominator)]])
  for (const c of cases) files.set(path.join(CASES_DIR, caseFile(c)), stable(c))
  return files
}

/**
 * The files exactly as the repository formatter leaves them, so the lint gate and `--check` agree.
 * They are written to a scratch folder inside the layer (the formatter reads the repository's own
 * configuration only for paths under it), formatted in one pass and read back.
 */
export async function render(generated) {
  const raw = renderRaw(generated)
  const base = process.env.QA_MAIL_ARTIFACTS ? path.resolve(process.env.QA_MAIL_ARTIFACTS) : os.tmpdir()
  mkdirSync(base, { recursive: true })
  const scratch = mkdtempSync(path.join(base, 'gen-'))
  try {
    const names = new Map()
    let n = 0
    for (const [file, content] of raw) {
      const name = `${String(n++).padStart(4, '0')}.json`
      names.set(file, name)
      writeFileSync(path.join(scratch, name), content)
    }
    const r = spawnSync(
      path.join(REPO_ROOT, 'node_modules/.bin/biome'),
      ['format', '--write', `--config-path=${REPO_ROOT}`, scratch],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8'
      }
    )
    if (r.status !== 0) throw new Error(`biome format failed: ${r.stderr || r.stdout}`)
    return new Map([...names].map(([file, name]) => [file, readTextSync(path.join(scratch, name))]))
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export function currentFiles() {
  const files = new Map()
  const den = path.join(LAYER_DIR, 'denominator.json')
  const denText = readBoundedSync(den, { maxBytes: MAX_LAYER_FILE_BYTES, allowMissing: true })
  if (denText !== null) files.set(den, denText.toString('utf8'))
  if (existsSync(CASES_DIR))
    for (const f of readdirSync(CASES_DIR).filter((n) => n.endsWith('.json')))
      files.set(
        path.join(CASES_DIR, f),
        readBoundedSync(path.join(CASES_DIR, f), { maxBytes: MAX_LAYER_FILE_BYTES }).toString('utf8')
      )
  return files
}

export function diff(expected, actual) {
  const problems = []
  for (const [file, content] of expected) {
    if (!actual.has(file)) problems.push(`missing: ${path.relative(REPO_ROOT, file)}`)
    else if (actual.get(file) !== content) problems.push(`differs: ${path.relative(REPO_ROOT, file)}`)
  }
  for (const file of actual.keys())
    if (!expected.has(file)) problems.push(`stale: ${path.relative(REPO_ROOT, file)}`)
  return problems
}

async function main(argv) {
  const flags = parseFlags(argv, { check: 'bool' })
  const files = await render(await generate())
  if (flags.check) {
    const problems = diff(files, currentFiles())
    if (problems.length > 0) {
      console.error(
        `generated files are out of date (run: ${GENERATE_COMMAND})\n${problems.slice(0, 20).join('\n')}`
      )
      return 1
    }
    console.log(`up to date: ${files.size} files`)
    return 0
  }
  mkdirSync(CASES_DIR, { recursive: true })
  for (const f of readdirSync(CASES_DIR).filter((n) => n.endsWith('.json'))) rmSync(path.join(CASES_DIR, f))
  for (const [file, content] of files) writeAtomic(file, content)
  console.log(`wrote ${files.size} files`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof UsageError ? error.message : error)
      process.exit(error instanceof UsageError ? 2 : 1)
    }
  )
}
