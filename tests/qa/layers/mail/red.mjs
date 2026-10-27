// RED proof: recorded mutations of product code, applied to a scratch copy under the system temp
// directory (never inside the repo or the artifact directory), judged by the SAME assertions the
// case runs on the real tree. A mutation that does not apply exactly, an import or boot failure,
// or an assertion that fails for any reason other than an `AssertionError` is not RED.
import { cp, lstat, mkdtemp, open, rm, symlink, mkdir } from 'node:fs/promises'
import { constants as fsConstants, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { REPO_ROOT, SRC_REL, TEST_REL, readRegularFile, sha256, stable, writeAtomic } from './common.mjs'
import { oracle } from './machine-support.mjs'
import { readTextAsync, readTextSync } from '../../lib/bounded-reader.mjs'

const S = SRC_REL
const edit = (file, find, replace, count = 1) => ({ file: `${S}/${file}`, find, replace, count })

const KIND_TABLE = oracle.kinds.table
const LOCKED = new Set(oracle.groups.byId[oracle.groups.lockedId])
const variantKind = (variant) => variant.split(':')[0]
const roleKinds = new Set(
  Object.entries(KIND_TABLE)
    .filter(([, s]) => s.needsRole === true || s.needsRole === 'when-approved')
    .map(([k]) => k)
)
const NOTIFICATION_BUILDERS = [
  'team.invited',
  'workspace-invite',
  'workspace-added',
  'removal-code',
  'whitelist-confirmation'
]
const english = (variant) => variant.endsWith(':en')
/** Letters whose subject names the person who acted (read from letters/team.js and comments.js). */
const SUBJECT_NAMES = new Set([
  'team.join_request',
  'team.join_answered',
  'team.edit_access_request',
  'team.edit_access_answered',
  'team.invite_accepted',
  'team.invite_declined',
  'team.joined',
  'team.left',
  'team.site_restored',
  'team.site_deleted',
  'comment.mention',
  'comment.reply',
  'comment.resolved',
  'comment.reopened'
])

/**
 * `targets`: assertionId -> { only?: string[], skip?: (variant) => boolean }. `only` names the
 * variants that must turn red; otherwise every variant that is not `skip`ped (and not a
 * fail-closed note on the control) must.
 */
export const MUTANTS = [
  {
    id: 'wrong-recipient',
    summary: 'the notifier and the sign-in door address the letter to somebody else',
    edits: [
      edit('notifications/notify.js', 'to: recipient.email,', "to: 'wrong-recipient@tracy.test',"),
      edit(
        'identity/route.js',
        'await mail.send({ to: email, ...mail.signInCodeMail(',
        "await mail.send({ to: 'wrong-recipient@tracy.test', ...mail.signInCodeMail("
      )
    ],
    targets: { 'mail.notify.recipient': {}, 'mail.signin.recipient': {} }
  },
  {
    id: 'drop-escaping',
    summary: 'escapeHtml no longer escapes "<"',
    edits: [edit('lib/html.js', ".replace(/</g, '&lt;')", ".replace(/</g, '<')")],
    targets: {
      'mail.letter.escape': {},
      ...Object.fromEntries(NOTIFICATION_BUILDERS.map((b) => [`mail.direct.escape:${b}`, {}]))
    }
  },
  {
    id: 'drop-expiry',
    summary: 'a sign-in code and a team invitation never expire',
    edits: [
      edit(
        'identity/route.js',
        'if (!row || row.expiresAt < now()) {\n      if (row) await store.deleteCode(email)',
        'if (!row) {\n      if (row) await store.deleteCode(email)'
      ),
      edit('lib/team-invite.js', "return ageS > TEAM_INVITE_TTL_S ? 'expired' : 'live'", "return 'live'")
    ],
    targets: {
      'mail.signin.expiry': { only: ['refused-after-expiry'] },
      'mail.invite.token': { only: ['expired-one-second-later'] }
    }
  },
  {
    id: 'drop-dedupe',
    summary: 'a recipient listed several times gets several rows and letters',
    edits: [
      edit(
        'notifications/notify.js',
        'for (const recipient of new Set(recipients ?? [])) {',
        'for (const recipient of recipients ?? []) {'
      )
    ],
    targets: { 'mail.notify.dedupe': {} }
  },
  {
    id: 'ignore-preference',
    summary: 'the email switch of Settings is ignored',
    edits: [
      edit(
        'notifications/notify.js',
        "const wantsMail = mail === 'send' && prefs.email",
        "const wantsMail = mail === 'send'"
      )
    ],
    targets: { 'mail.notify.preferences': { skip: (v) => LOCKED.has(variantKind(v)) } }
  },
  {
    id: 'drop-unsubscribe-expiry',
    summary: 'an unsubscribe link never lapses',
    edits: [
      edit(
        'lib/unsubscribe-token.js',
        "if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null",
        "if (typeof claims.exp !== 'number') return null"
      )
    ],
    targets: { 'mail.unsubscribe.token': { only: ['refused-after-lifetime'] } }
  },
  {
    id: 'unsubscribe-locked-header',
    summary: 'letters of the locked join-request group carry an unsubscribe header',
    edits: [
      edit(
        'notifications/unsubscribe.js',
        'if (!origin || !group || group.locked || !accountId) return null',
        'if (!origin || !group || !accountId) return null'
      )
    ],
    targets: { 'mail.notify.unsubscribe-header': { skip: (v) => !LOCKED.has(variantKind(v)) } }
  },
  {
    id: 'transport-ignore-status',
    summary: 'a provider error answer counts as sent',
    edits: [edit('mail/transport.js', 'if (!res.ok) throw new Error(`resend answered ${res.status}`)', '')],
    targets: { 'mail.transport.failure': { skip: (v) => !v.startsWith('status-') } }
  },
  {
    id: 'transport-send-reserved',
    summary: 'letters to reserved test domains reach the provider',
    edits: [
      edit(
        'mail/transport.js',
        'if (skipReserved && recipients.some(isUndeliverableAddress)) {',
        'if (false) {'
      )
    ],
    targets: { 'mail.transport.reserved': { skip: (v) => !v.startsWith('reserved:') } }
  },
  {
    id: 'invite-ignore-signature',
    summary: 'a team invitation with a forged signature verifies',
    edits: [edit('lib/team-invite.js', 'if (!ok) return null', '')],
    targets: { 'mail.invite.token': { only: ['tampered'] } }
  },
  {
    id: 'signin-keep-spent-code',
    summary: 'a sign-in code stays valid after it was used',
    edits: [
      edit(
        'identity/route.js',
        "await store.deleteCode(email)\n    await store.touchAccount(email, { admission, via: 'email code' })",
        "await store.touchAccount(email, { admission, via: 'email code' })"
      )
    ],
    targets: { 'mail.signin.replay': { only: ['used-code-refused'] } }
  },
  {
    id: 'swallow-send-failure',
    summary: 'the sign-in door answers success when the mail was not sent',
    edits: [
      edit(
        'identity/route.js',
        'await mail.send({ to: email, ...mail.signInCodeMail(code, requestLanguage(c)) })',
        'await mail.send({ to: email, ...mail.signInCodeMail(code, requestLanguage(c)) }).catch(() => {})'
      )
    ],
    targets: { 'mail.signin.failure': {} }
  },
  {
    id: 'forget-failed-send',
    summary: 'a failed notification send is not recorded for retry',
    edits: [
      edit(
        'notifications/notify.js',
        'await recordMail(pool, ids, { sent: false, error: error?.message ?? String(error) }).catch(() => {})',
        'void 0'
      )
    ],
    targets: { 'mail.notify.failure': {} }
  },
  {
    id: 'notify-the-actor',
    summary: 'the person who acted is notified of their own action',
    edits: [
      edit(
        'notifications/notify.js',
        'if (!recipient || recipient === actor) continue',
        'if (!recipient) continue'
      ),
      edit('notifications/store.js', 'if (row.actor && row.actor === row.recipient) return null', '')
    ],
    targets: { 'mail.notify.no-self': {} }
  },
  {
    id: 'switch-off-locked-group',
    summary: 'the locked join-request group can be switched off in Settings',
    edits: [edit('notifications/preferences.js', 'if (GROUP_BY_ID.get(id)?.locked) continue', '')],
    targets: { 'mail.preferences.groups': { only: ['locked-group-cannot-be-switched-off'] } }
  },
  {
    id: 'regroup-site-changes',
    summary: 'site renames fall out of the Site changes group',
    edits: [
      edit(
        'notifications/preferences.js',
        "kinds: ['team.site_restored', 'team.site_renamed']",
        "kinds: ['team.site_restored']"
      )
    ],
    targets: { 'mail.preferences.groups': { only: ['group:site-changes'] } }
  },
  {
    id: 'sitemail-token-ignores-label',
    summary: 'a site mail token no longer depends on the site label',
    edits: [edit('mail/site-mail/token.js', "update(`${PREFIX}${label}`, 'utf8')", "update(PREFIX, 'utf8')")],
    targets: { 'mail.sitemail.token': { only: ['bound-to-label-and-secret'] } }
  },
  {
    id: 'sitemail-own-cms-relays',
    summary: 'a site in mode own-cms is relayed through Tracy',
    edits: [
      edit(
        'mail/site-mail/policy.js',
        "if (mode === 'off' || mode === 'own-cms') return",
        "if (mode === 'off') return"
      )
    ],
    targets: {}
  },
  {
    id: 'smtp-never-implicit-tls',
    summary: 'port 465 is spoken with STARTTLS instead of implicit TLS',
    edits: [edit('mail/site-mail/smtp.js', "(Number(port) === 465 ? 'implicit' : 'starttls')", "'starttls'")],
    targets: {}
  },
  {
    id: 'bcc-stays-in-message',
    summary: 'the Bcc header is no longer dropped from a relayed message',
    edits: [
      edit(
        'mail/site-mail/message.js',
        "new Set(['bcc', 'sender', 'return-path'])",
        "new Set(['sender', 'return-path'])"
      )
    ],
    targets: {}
  },
  {
    id: 'person-line-drops-address',
    summary: 'a person is named without their address',
    edits: [
      edit(
        'mail/emails.js',
        "return t('mail.n.person', { name: shapedName, email: address })",
        'return shapedName'
      )
    ],
    targets: {}
  },
  {
    id: 'no-unsubscribe-header',
    summary: 'no notification letter carries an unsubscribe header',
    edits: [
      edit(
        'notifications/unsubscribe.js',
        'if (!origin || !group || group.locked || !accountId) return null',
        'return null'
      )
    ],
    targets: { 'mail.notify.unsubscribe-header': { skip: (v) => LOCKED.has(variantKind(v)) } }
  },
  {
    id: 'site-button-to-team',
    summary: 'the "Open site" button opens the Team tab',
    edits: [edit('mail/letters/team.js', 'url: links.site(siteKey)', 'url: links.team(siteKey)', 5)],
    targets: { 'mail.letter.links': { skip: (v) => KIND_TABLE[variantKind(v)]?.button !== 'site' } }
  },
  {
    id: 'comment-button-to-site',
    summary: 'the comment buttons open the site instead of the comment',
    edits: [edit('mail/letters/comments.js', 'links.comment(', 'links.site(', 3)],
    targets: { 'mail.letter.links': { skip: (v) => KIND_TABLE[variantKind(v)]?.button !== 'comment' } }
  },
  {
    id: 'button-on-closed-letter',
    summary: 'a letter that must have no button gets one',
    edits: [
      edit(
        'mail/letters/team.js',
        'function letter(t, { badge, subject, paragraphs, button = null, links }) {',
        "function letter(t, { badge, subject, paragraphs, button = { label: 'View', url: links.site('x.vn') }, links }) {"
      )
    ],
    targets: { 'mail.letter.links': { skip: (v) => KIND_TABLE[variantKind(v)]?.button !== null } }
  },
  {
    id: 'join-request-to-site',
    summary: 'the join-request review link opens the site',
    edits: [
      edit(
        'mail/letters/team.js',
        'reviewUrl: links.team(row.siteKey, actor.email ?? null)',
        'reviewUrl: links.site(row.siteKey)'
      )
    ],
    targets: { 'mail.letter.links': { skip: (v) => variantKind(v) !== 'team.join_request' } }
  },
  {
    id: 'name-keeps-line-breaks',
    summary: 'a person-supplied name keeps its line breaks and reaches the subject',
    edits: [
      edit(
        'mail/emails.js',
        "const collapsed = value.replace(/\\s+/g, ' ').trim()",
        'const collapsed = value.trim()'
      ),
      edit(
        'mail/emails.js',
        "if ([...collapsed].some((ch) => ch.codePointAt(0) < 0x20 || ch.codePointAt(0) === 0x7f)) return ''",
        ''
      )
    ],
    targets: { 'mail.letter.invalid': { skip: (v) => !SUBJECT_NAMES.has(variantKind(v)) } }
  },
  {
    id: 'unbalanced-paragraphs',
    summary: 'a text paragraph of the shared template is never closed',
    edits: [
      edit(
        'mail/notification-mail.js',
        '${unlinkedHtml(p.quote ? quoted(p.text) : p.text)}</p>`',
        '${unlinkedHtml(p.quote ? quoted(p.text) : p.text)}`'
      )
    ],
    targets: {
      'mail.letter.boundary': {},
      ...Object.fromEntries(NOTIFICATION_BUILDERS.map((b) => [`mail.direct.boundary:${b}`, {}]))
    }
  },
  {
    id: 'unconfigured-transport-claims-success',
    summary: 'an unconfigured transport answers as if the letter had been sent',
    edits: [edit('mail/transport.js', '        throw new MailUnavailableError()', '        return')],
    targets: { 'mail.transport.reserved': { only: ['unconfigured-transport-refuses'] } }
  },
  {
    id: 'expire-early',
    summary: 'a sign-in code is refused a minute before it lapses',
    edits: [
      edit(
        'identity/route.js',
        'if (!row || row.expiresAt < now()) {\n      if (row) await store.deleteCode(email)',
        'if (!row || row.expiresAt < now() + 60_000) {\n      if (row) await store.deleteCode(email)'
      )
    ],
    targets: { 'mail.signin.expiry': { only: ['accepted-before-expiry'] } }
  },
  {
    id: 'invite-off-by-one',
    summary: 'an invitation expires at its last second instead of after it',
    edits: [
      edit(
        'lib/team-invite.js',
        "return ageS > TEAM_INVITE_TTL_S ? 'expired' : 'live'",
        "return ageS >= TEAM_INVITE_TTL_S ? 'expired' : 'live'"
      )
    ],
    targets: { 'mail.invite.token': { only: ['live-through-the-last-second'] } }
  },
  {
    id: 'unsubscribe-expire-early',
    summary: 'an unsubscribe link lapses a year early',
    edits: [
      edit(
        'lib/unsubscribe-token.js',
        'claims.exp * 1000 <= now)',
        'claims.exp * 1000 <= now + 365 * 86_400_000)'
      )
    ],
    targets: { 'mail.unsubscribe.token': { only: ['valid-inside-lifetime', 'repeat-is-harmless'] } }
  },
  {
    id: 'unsubscribe-single-use',
    summary: 'an unsubscribe link works only once',
    edits: [
      edit(
        'lib/unsubscribe-token.js',
        'return { accountId: claims.a, groupId: claims.g }',
        'if (globalThis.__qaUsed?.has(token)) return null\n    ;(globalThis.__qaUsed ??= new Set()).add(token)\n    return { accountId: claims.a, groupId: claims.g }'
      )
    ],
    targets: { 'mail.unsubscribe.token': { only: ['repeat-is-harmless'] } }
  },
  {
    id: 'unsubscribe-ignore-signature',
    summary: 'a forged unsubscribe token is accepted',
    edits: [edit('lib/unsubscribe-token.js', 'if (!ok) return null', '')],
    targets: { 'mail.unsubscribe.token': { only: ['tampered-signature', 'swapped-payload'] } }
  },
  {
    id: 'locked-group-obeys-switch',
    summary: 'the locked join-request group obeys a stored switch',
    edits: [
      edit(
        'notifications/preferences.js',
        'if (!group || group.locked) return { ...ON }',
        'if (!group) return { ...ON }'
      )
    ],
    targets: {
      'mail.notify.preferences': { skip: (v) => !LOCKED.has(variantKind(v)) },
      'mail.preferences.groups': { only: ['locked-group-always-on'] }
    }
  },
  ...[
    ['about-you', "      'team.invited',\n", ''],
    ['join-requests', "      'team.join_answered',\n", ''],
    ['teammates', "kinds: ['team.joined', 'team.left']", "kinds: ['team.joined']"],
    ['mentions-replies', "kinds: ['comment.mention', 'comment.reply']", "kinds: ['comment.mention']"],
    ['resolved-reopened', "kinds: ['comment.resolved', 'comment.reopened']", "kinds: ['comment.resolved']"]
  ].map(([group, find, replace]) => ({
    id: `regroup-${group}`,
    summary: `group ${group} loses a kind`,
    edits: [edit('notifications/preferences.js', find, replace)],
    targets: { 'mail.preferences.groups': { only: [`group:${group}`] } }
  })),
  {
    id: 'accept-any-role',
    summary: 'a letter that needs a role is sent with an invented one',
    edits: [
      edit(
        'mail/letters/team.js',
        'return known ? t(`mail.n.asRole.${known}`) : null',
        "return t('mail.n.asRole.editor')"
      )
    ],
    targets: {
      'mail.letter.invalid': { skip: (v) => !roleKinds.has(variantKind(v)) },
      'mail.letter.empty': { skip: (v) => !roleKinds.has(variantKind(v)) }
    }
  },
  {
    id: 'mail-deleted-comment',
    summary: 'a comment deleted since is still mailed',
    edits: [
      edit(
        'mail/letters/comments.js',
        'rows.filter((r) => !r.data?.deleted && r.data?.commentId)',
        'rows.filter((r) => r.data?.commentId)'
      )
    ],
    targets: { 'mail.letter.empty': { skip: (v) => !variantKind(v).startsWith('comment.') } }
  },
  {
    id: 'ignore-language',
    summary: 'every letter is written in English whatever the reader chose',
    edits: [
      edit(
        'lib/i18n/index.js',
        'const id = WEB_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE',
        'const id = DEFAULT_LANGUAGE',
        2
      )
    ],
    targets: {
      'mail.letter.locale': { skip: english },
      'mail.notify.recipient': { skip: english },
      ...Object.fromEntries(
        [
          'team.invited',
          'workspace-invite',
          'workspace-added',
          'removal-code',
          'signin-code',
          'whitelist-beta',
          'whitelist-confirmation'
        ].map((b) => [`mail.direct.locale:${b}`, { skip: english }])
      )
    }
  },
  {
    id: 'leave-slot-open',
    summary: 'the preheader slot of the shared template is never filled',
    edits: [edit('mail/notification-mail.js', ".replace('{{preheader}}', unlinkedHtml(firstText))", '')],
    targets: {
      'mail.letter.shape': {},
      ...Object.fromEntries(NOTIFICATION_BUILDERS.map((b) => [`mail.direct.shape:${b}`, {}]))
    }
  },
  {
    id: 'team-button-to-site',
    summary: 'the "View team" button opens the site instead of the Team tab',
    edits: [
      edit(
        'mail/letters/team.js',
        "url: links.team(siteKey, typeof member === 'string' && member !== '' ? member : null)",
        'url: links.site(siteKey)'
      )
    ],
    targets: {
      'mail.letter.links': {
        skip: (v) =>
          !(KIND_TABLE[variantKind(v)]?.button === 'team' && variantKind(v) !== 'team.join_request')
      }
    }
  },
  {
    id: 'accept-button-to-decline',
    summary: 'the invitation button points at the decline page',
    edits: [
      edit(
        'mail/emails.js',
        "button: { label: t('mail.n.invited.accept'), url },\n    manageUrl,",
        "button: { label: t('mail.n.invited.accept'), url: decline || url },\n    manageUrl,"
      )
    ],
    targets: { 'mail.direct.links:team.invited': {} }
  },
  {
    id: 'safeurl-accepts-anything',
    summary: 'any string, javascript: included, is accepted as a link',
    edits: [
      edit(
        'mail/notification-mail.js',
        "export function safeUrl(value) {\n  if (typeof value !== 'string') return ''",
        "export function safeUrl(value) {\n  if (typeof value === 'string') return value.trim()\n  return ''"
      )
    ],
    targets: { 'mail.direct.invalid:team.invited': {}, 'mail.direct.invalid:whitelist-beta': {} }
  },
  {
    id: 'leak-row-fields',
    summary: 'the actor object and the comment data are printed into the letter',
    edits: [
      edit(
        'mail/letters/team.js',
        'whoFull: personLine(t, actor.name, actor.email)',
        'whoFull: personLine(t, actor.name, actor.email) + JSON.stringify(actor)'
      ),
      edit(
        'mail/letters/comments.js',
        "const quoteOf = (data) => (typeof data.quote === 'string' ? data.quote : '')",
        "const quoteOf = (data) => (typeof data.quote === 'string' ? data.quote : '') + JSON.stringify(data)"
      )
    ],
    targets: {
      'mail.letter.secret': { skip: (v) => ['team.declined', 'team.join_request'].includes(variantKind(v)) }
    }
  },
  {
    id: 'nondeterministic-letter',
    summary: 'a letter differs every time it is rendered',
    edits: [
      edit(
        'mail/notification-mail.js',
        'const text = [\n    heading,',
        'const text = [\n    heading + Math.random(),'
      )
    ],
    targets: {
      'mail.letter.repeat': {},
      ...Object.fromEntries(
        NOTIFICATION_BUILDERS.filter((b) => b !== 'whitelist-confirmation').map((b) => [
          `mail.direct.repeat:${b}`,
          {}
        ])
      )
    }
  }
]

/** assertionId -> [mutantId], derived from the catalogue (generate.mjs and the runner both read it). */
export function mutantsFor(assertionId, mutants = MUTANTS) {
  return mutants.filter((m) => Object.hasOwn(m.targets, assertionId)).map((m) => m.id)
}

/**
 * Copy the product subset into a scratch directory outside the repo and the artifacts. The copy
 * links (does not copy) dependency trees and sibling workspace packages.
 */
export async function makeScratch({ withTests = false } = {}) {
  const base = process.env.QA_MAIL_ARTIFACTS ? path.resolve(process.env.QA_MAIL_ARTIFACTS) : tmpdir()
  await mkdir(base, { recursive: true })
  const dir = await mkdtemp(path.join(base, 'qa-mail-red-'))
  const dispose = () => rm(dir, { recursive: true, force: true })
  try {
    const keep = (src) => !src.split(path.sep).includes('node_modules')
    await cp(path.join(REPO_ROOT, S), path.join(dir, S), { recursive: true, filter: keep })
    await cp(
      path.join(REPO_ROOT, 'apps/tracy-web/package.json'),
      path.join(dir, 'apps/tracy-web/package.json')
    )
    if (withTests)
      await cp(path.join(REPO_ROOT, TEST_REL), path.join(dir, TEST_REL), { recursive: true, filter: keep })
    for (const rel of [
      'apps/tracy-web/node_modules',
      'node_modules',
      'packages',
      'vendor',
      'docs',
      'tch',
      'tests/regression',
      'scripts',
      'package.json',
      'pnpm-workspace.yaml',
      'CONTEXT.md',
      'SYSTEM.md'
    ]) {
      const from = path.join(REPO_ROOT, rel)
      if (!existsSync(from)) continue
      await mkdir(path.dirname(path.join(dir, rel)), { recursive: true })
      await symlink(from, path.join(dir, rel))
    }
  } catch (error) {
    await dispose()
    throw error
  }
  return { dir, dispose }
}

/**
 * An edit may only touch a regular file that was copied into the scratch tree. Scratch links
 * packages/, vendor/, node_modules and others back to the real repo, so every component of the path
 * is checked and a symlink anywhere on it (or a non-regular target) is refused before any write.
 */
async function copiedFileCheck(dir, rel) {
  let at = dir
  const parts = rel.split(/[\\/]/)
  if (path.isAbsolute(rel) || parts.some((p) => p === '' || p === '.' || p === '..'))
    return { problem: `${rel} is not a plain relative path` }
  if (!rel.startsWith(`${SRC_REL}/`))
    return {
      problem: `${rel} is outside the product source ${SRC_REL}/ (tests and package files are not mutation targets)`
    }
  let st
  for (const [i, part] of parts.entries()) {
    at = path.join(at, part)
    try {
      st = await lstat(at)
    } catch (error) {
      return { problem: `${rel} does not exist in the copied product (${error.code ?? error.message})` }
    }
    if (st.isSymbolicLink())
      return { problem: `${rel} goes through a symlink to the real repository (${part})` }
    if (i < parts.length - 1 ? !st.isDirectory() : !st.isFile())
      return { problem: `${rel} is not a regular file inside the copied product` }
  }
  return { problem: null, dev: st.dev, ino: st.ino }
}

/**
 * Write through a descriptor opened without following a final symlink and proven to be the very file
 * checked a moment ago (same device and inode). A path component swapped for a symlink after the check
 * opens some other file; that is caught on the descriptor, before anything is truncated or written.
 * Every byte is written (a short write continues from `bytesWritten`) and the file's size is read back,
 * so a mutation is never recorded with the hash of text that did not reach the disk.
 * @param {string} file - the checked path.
 * @param {string} text - the full new content.
 * @param {{dev: number, ino: number}} expect - identity measured by the check.
 * @param {{openFile?: typeof open}} [io] - the opener (a test injects a short-writing descriptor).
 * @returns {Promise<string|null>} why the write was refused, or null once every byte is on disk.
 */
export async function writeChecked(file, text, expect, { openFile = open } = {}) {
  let handle
  try {
    handle = await openFile(file, fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW)
  } catch (error) {
    return `cannot be opened for writing without following a link (${error.code ?? error.message})`
  }
  try {
    const st = await handle.stat()
    if (!st.isFile() || st.dev !== expect.dev || st.ino !== expect.ino)
      return 'is no longer the file that was checked (replaced after the check)'
    await handle.truncate(0)
    const bytes = Buffer.from(text, 'utf8')
    let done = 0
    while (done < bytes.length) {
      const { bytesWritten } = await handle.write(bytes, done, bytes.length - done, done)
      if (!(bytesWritten > 0)) return `write stopped after ${done} of ${bytes.length} bytes`
      done += bytesWritten
    }
    const size = (await handle.stat()).size
    if (size !== bytes.length) return `holds ${size} bytes after writing ${bytes.length}`
    return null
  } finally {
    await handle.close()
  }
}

/** Apply a mutant's edits; every edit must match exactly `count` times or nothing is mutated. */
export async function applyMutant(dir, mutant, { beforeWrite } = {}) {
  const applied = []
  const staged = []
  for (const e of mutant.edits) {
    const checked = await copiedFileCheck(dir, e.file)
    if (checked.problem) return { ok: false, reason: `edit refused: ${checked.problem}`, applied }
    const file = path.join(dir, e.file)
    const before = await readTextAsync(file)
    const found = before.split(e.find).length - 1
    if (found !== (e.count ?? 1))
      return {
        ok: false,
        reason: `edit did not apply exactly: ${e.file} matched ${found}, expected ${e.count ?? 1}`,
        applied
      }
    staged.push({ file, before, after: before.replaceAll(e.find, e.replace), e, id: checked })
  }
  await beforeWrite?.()
  for (const s of staged) {
    const wrote = await writeChecked(s.file, s.after, s.id)
    if (wrote !== null) return { ok: false, reason: `edit refused: ${s.e.file} ${wrote}`, applied }
    applied.push({
      file: s.e.file,
      find: s.e.find,
      replace: s.e.replace,
      before: sha256(s.before),
      after: sha256(s.after)
    })
  }
  return { ok: true, applied }
}

/**
 * What a mutant did to one assertion, in variant terms: the variants the mutant was expected to
 * turn red, and the ones that did fail with an `AssertionError`. Case-level judgement (a case owns
 * a slice of the variants) is `caseRed`.
 */
export function judge({ control, mutant, target = {} }) {
  const controlGreen = control.status === 'green'
  const reachable = control.variants.filter((v) => !v.note).map((v) => v.variant)
  const outside = (target.only ?? []).filter((v) => !reachable.includes(v))
  const expected = (target.only ?? reachable).filter((v) => !target.skip?.(v))
  const failed = mutant.failing.filter((f) => f.kind === 'assertion').map((f) => f.variant)
  const errored = mutant.status === 'error'
  const missing = expected.filter((v) => !failed.includes(v))
  let why = null
  if (!controlGreen) why = `control is ${control.status}, not green`
  else if (outside.length > 0)
    why = `the mutant targets ${outside.length} variant(s) the control never reached, first: ${outside[0]}`
  else if (expected.length === 0) why = 'the mutant reaches no variant of this assertion'
  else if (errored)
    why = `assertion errored on the mutant (not an assertion failure): ${mutant.failing.find((f) => f.kind === 'error')?.message}`
  else if (missing.length > 0)
    why = `${missing.length} of ${expected.length} variants stayed green on the mutant, first: ${missing[0]}`
  return { ok: why === null, why, expected, failed, controlGreen, errored }
}

const matchesFilter = (variant, filter) =>
  !filter || filter.some((p) => variant === p || variant.startsWith(p))

/** Does a recorded proof show RED for the slice of variants a case owns? */
export function caseRed(proof, filter) {
  if (!proof.copyOk || !proof.controlGreen || proof.errored) return false
  const own = proof.expected.filter((v) => matchesFilter(v, filter))
  return own.length > 0 && own.every((v) => proof.failed.includes(v))
}

/**
 * Verify a proof from its log, read ONCE through a safe descriptor: the right assertion and mutant,
 * a green control and a green unmutated copy, a mutant that failed only with assertions, the
 * expected variants equal to what the control reached minus what the mutant's target skips, and
 * edits that match the mutation definition exactly (count, file, before/after hashes). The variants
 * returned come from that same verified snapshot; a missing, replaced or altered log is no proof.
 * @returns {{ problem: string|null, variants: Set<string> }}
 */
export function verifyProof(proof, { outDir, assertionId, productRoot = REPO_ROOT, mutants = MUTANTS }) {
  const refuse = (problem) => ({ problem, variants: new Set() })
  if (!proof || typeof proof.log !== 'string' || proof.log === '') return refuse('the proof names no log')
  if (path.isAbsolute(proof.log) || proof.log.split(path.sep).includes('..'))
    return refuse('the proof log is outside the output directory')
  let entry
  try {
    const text = readRegularFile(path.join(outDir, proof.log), 'proof log')
    if (text === null) return refuse(`the proof log ${proof.log} is missing`)
    entry = JSON.parse(text)
  } catch (error) {
    return refuse(`the proof log ${proof.log} is unreadable: ${error.message}`)
  }
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry))
    return refuse('the proof log is not an object')
  if (entry.assertionId !== assertionId)
    return refuse(`the log is for ${entry.assertionId}, not ${assertionId}`)
  if (entry.mutant !== proof.mutant)
    return refuse(`the log is for mutant ${entry.mutant}, not ${proof.mutant}`)
  if (entry.judged !== 'RED') return refuse(`the log judged ${entry.judged}`)
  if (entry.control?.status !== 'green' || entry.copyControl !== 'green')
    return refuse('the log does not show a green control and a green unmutated copy')
  const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')
  if (!Array.isArray(entry.mutantFailures) || entry.mutantFailures.length === 0)
    return refuse('the log shows no failing variant on the mutant')
  if (entry.mutantFailures.some((f) => f === null || typeof f !== 'object' || f.kind !== 'assertion'))
    return refuse('the mutant failed with a non-assertion error')
  const mutant = mutants.find((m) => m.id === proof.mutant)
  if (!mutant) return refuse(`mutant ${proof.mutant} is not a recorded mutation`)
  if (!Object.hasOwn(mutant.targets, assertionId))
    return refuse(`mutant ${proof.mutant} does not target ${assertionId}`)
  if (!strings(entry.controlVariants) || !strings(entry.expectedRed))
    return refuse('the log does not record the control variants and the expected variants')
  const target = mutant.targets[assertionId] ?? {}
  const reachable = new Set(entry.controlVariants)
  const unreached = (target.only ?? []).filter((v) => !reachable.has(v))
  if (unreached.length > 0)
    return refuse(`the mutant targets variant ${unreached[0]}, which the control run never reached`)
  const wanted = (target.only ?? [...reachable]).filter((v) => !target.skip?.(v))
  const claimed = new Set(entry.expectedRed)
  if (wanted.length === 0 || wanted.length !== claimed.size || wanted.some((v) => !claimed.has(v)))
    return refuse('the expected variants are not the control variants the mutant targets')
  const failed = new Set(entry.mutantFailures.map((f) => f.variant))
  if (wanted.some((v) => !failed.has(v)))
    return refuse('the log does not show every expected variant failing')
  if (!Array.isArray(entry.mutantEdits) || entry.mutantEdits.length === 0)
    return refuse('the log records no edit')
  if (entry.mutantEdits.length !== mutant.edits.length)
    return refuse('the log records a different number of edits than the mutation defines')
  for (const [i, e] of entry.mutantEdits.entries()) {
    const planned = mutant.edits[i]
    if (e === null || typeof e !== 'object' || e.file !== planned.file)
      return refuse(`the log edit ${i + 1} is not of ${planned.file}`)
    let content
    try {
      content = readTextSync(path.join(productRoot, e.file))
    } catch {
      return refuse(`the edited file ${e.file} cannot be read`)
    }
    if (sha256(content) !== e.before)
      return refuse(`${e.file} changed since the control run (edit hash mismatch)`)
    const found = content.split(planned.find).length - 1
    if (found !== (planned.count ?? 1))
      return refuse(
        `the edit of ${e.file} matches ${found} times on the current file, not ${planned.count ?? 1}`
      )
    const after = sha256(content.replaceAll(planned.find, planned.replace))
    if (after !== e.after)
      return refuse(
        `the logged "after" hash of ${e.file} is not what the recorded edit produces on the current file`
      )
    if (e.after === e.before) return refuse(`the edit of ${e.file} changes nothing`)
  }
  return { problem: null, variants: new Set(wanted) }
}

/** @returns {string|null} why the proof is refused, or null */
export const proofProblem = (proof, ctx) => verifyProof(proof, ctx).problem

/** The variants a verified proof shows red, taken from the single snapshot `verifyProof` read. */
export const proofVariants = verifyProof

/**
 * Prove RED for a set of assertions.
 * @param {{
 *   assertionIds: string[], mutants?: object[], run: (id: string, root: string) => Promise<object>,
 *   outDir: string, controlRoot?: string, mutantFilter?: string[]
 * }} o
 */
export async function proveRed({ assertionIds, mutants = MUTANTS, run, outDir, controlRoot = REPO_ROOT }) {
  const wanted = new Set(assertionIds)
  const control = new Map()
  for (const id of wanted) control.set(id, await run(id, controlRoot))

  const relevant = mutants.filter((m) => Object.keys(m.targets).some((id) => wanted.has(id)))
  const scratchControl = await makeScratch()
  const proofs = new Map()
  const mutantRecords = []
  try {
    // The unmutated scratch copy must be green too, or the copy itself is what is under test.
    const copyControl = new Map()
    for (const id of wanted)
      if (relevant.some((m) => m.targets[id])) copyControl.set(id, await run(id, scratchControl.dir))
    for (const m of relevant) {
      const scratch = await makeScratch()
      try {
        const applied = await applyMutant(scratch.dir, m)
        const record = {
          mutant: m.id,
          summary: m.summary,
          applied: applied.ok,
          reason: applied.reason ?? null,
          edits: applied.applied
        }
        if (!applied.ok) {
          mutantRecords.push(record)
          for (const id of Object.keys(m.targets).filter((i) => wanted.has(i)))
            pushProof(proofs, id, { mutant: m.id, ok: false, why: applied.reason })
          continue
        }
        for (const [id, target] of Object.entries(m.targets).filter(([i]) => wanted.has(i))) {
          const mutantResult = await run(id, scratch.dir)
          const verdict = judge({ control: control.get(id), mutant: mutantResult, target })
          const copyOk = copyControl.get(id)?.status === 'green'
          const log = path.join('red', m.id, `${id.replaceAll(/[^a-zA-Z0-9.:-]/g, '_')}.json`)
          const entry = {
            assertionId: id,
            mutant: m.id,
            copyControl: copyControl.get(id)?.status,
            control: { status: control.get(id).status, variants: control.get(id).variants.length },
            controlVariants: control
              .get(id)
              .variants.filter((v) => !v.note)
              .map((v) => v.variant),
            mutantStatus: mutantResult.status,
            expectedRed: verdict.expected ?? [],
            judged: verdict.ok && copyOk ? 'RED' : 'NOT-RED',
            why: verdict.ok ? (copyOk ? null : 'the unmutated scratch copy is not green') : verdict.why,
            mutantFailures: mutantResult.failing.slice(0, 200),
            mutantEdits: applied.applied.map((a) => ({ file: a.file, before: a.before, after: a.after }))
          }
          writeAtomic(path.join(outDir, log), stable(entry))
          pushProof(proofs, id, {
            mutant: m.id,
            ok: entry.judged === 'RED',
            why: entry.why,
            log,
            expected: verdict.expected,
            failed: verdict.failed,
            controlGreen: verdict.controlGreen,
            errored: verdict.errored,
            copyOk
          })
        }
        mutantRecords.push(record)
      } finally {
        await scratch.dispose()
      }
    }
  } finally {
    await scratchControl.dispose()
  }
  writeAtomic(path.join(outDir, 'red', 'mutants.json'), stable(mutantRecords))
  return { control, proofs, mutantRecords }
}

function pushProof(map, id, proof) {
  if (!map.has(id)) map.set(id, [])
  map.get(id).push(proof)
}
