/**
 * Team letters (spec #809 cases T2–T14 and T2b; T12–T14 added 04/10), approved copy A (T11: copy C). Each key is a
 * notification `kind`, each value a renderer as described in `./index.js`. `team.invited` (T1) has
 * no letter here on purpose: its email is the invitation itself (`teamInviteMail`), which carries a
 * signed accept link the log cannot rebuild, so the door writes that row with `mail: 'none'`.
 *
 * What a row holds, per kind (the same fields the Inbox reads; the actor is the person who acted):
 *   team.join_request    {}                                   actor = requester
 *   team.join_answered   {decision, requesterName, requesterEmail, role}  actor = the Owner who answered
 *   team.approved        {role}                               actor = approver
 *   team.declined        {}                                   actor = the Owner (never named in the mail)
 *   team.invite_accepted {role}                               actor = new member
 *   team.invite_declined {}                                   actor = invitee
 *   team.joined          {role, inviterName?, inviterEmail?}  actor = new member
 *   team.removed         {}                                   actor = the Owner
 *   team.role_changed    {from, to}                           actor = the Owner
 *   team.left            {role}                               actor = the person who left
 *   team.invite_cancelled {role}                              actor = the Owner
 *   team.site_restored   {backup, version}                    actor = who pressed Restore everything
 *   team.site_deleted    {siteName}                           actor = the Owner who deleted it
 *   team.site_renamed    {oldSite}                            actor = who changed the address
 *   team.edit_access_request  {}                              actor = the Viewer who asked
 *   team.edit_access_answered {decision, requesterName, requesterEmail, role}  actor = the Owner who answered
 *   team.edit_access_approved {role}                          actor = the Owner who approved
 *   team.edit_access_declined {}                              actor = the Owner (never named in the mail)
 */
import { joinRequestMail, personLine, shortName, siteName } from '../emails.js'
import { notificationMail } from '../notification-mail.js'
import { translator } from '../../lib/i18n/index.js'

/** The seat book's three roles (ADR 0028; `seats/roles.js`, restated: `mail/` may not import it). */
const ROLES = new Set(['owner', 'editor', 'viewer'])

/**
 * Roles retired by ADR 0028 and what each became. A row written before the migration (an email
 * still queued for retry, a 90-day-old Inbox row) can still name one; it reads as its successor.
 */
const RETIRED = { admin: 'editor', developer: 'editor' }

/** A current role for any stored role string, or null. */
const roleOf = (role) =>
  typeof role === 'string' && ROLES.has(role)
    ? role
    : typeof role === 'string' && Object.hasOwn(RETIRED, role)
      ? RETIRED[role]
      : null

/** The facts of the newest row, with the actor's two ways of being named. */
function facts(t, rows) {
  const row = rows[rows.length - 1]
  const actor = row.actor ?? {}
  return {
    row,
    data: row.data ?? {},
    // The address the site has now; `siteKey` stays for the buttons' links.
    site: siteName(t, row.siteName ?? row.siteKey),
    siteKey: row.siteKey,
    who: shortName(t, actor.name, actor.email),
    whoFull: personLine(t, actor.name, actor.email)
  }
}

/**
 * "an Editor" (or the language's own form of "as {role}"); null for a role the book does not know.
 * The seat book's check constraint allows only the three roles, so a null means a malformed row,
 * and a letter that would need it sends nothing rather than a sentence with a hole in it.
 */
function asRole(t, role) {
  const known = roleOf(role)
  return known ? t(`mail.n.asRole.${known}`) : null
}

/** What a role lets the reader do, one sentence, for the letter that tells them they hold it. */
const ROLE_ABOUT = Object.freeze({
  owner: 'mail.n.roleChanged.about.owner',
  editor: 'mail.n.invited.role.editor',
  viewer: 'mail.n.invited.role.viewer'
})

/** One letter on the shared template; the button is optional. */
function letter(t, { badge, subject, paragraphs, button = null, links }) {
  return notificationMail({
    lang: t.lang,
    badge,
    subject,
    paragraphs: paragraphs.filter(Boolean).map((text) => ({ text })),
    button,
    manageUrl: links.manage(),
    inboxNote: true
  })
}

/**
 * "View team": the Team tab of the site, on the person the letter is about when they hold a seat
 * there (`member`, the highlighted row), else the tab alone.
 */
const viewTeam = (t, links, siteKey, member = null) => ({
  label: t('mail.n.viewTeam'),
  url: links.team(siteKey, typeof member === 'string' && member !== '' ? member : null)
})

export const TEAM_LETTERS = Object.freeze({
  /** T2: somebody asked to join; every Owner gets this (ADR 0028). */
  'team.join_request': ({ lang, rows, links }) => {
    const row = rows[rows.length - 1]
    const actor = row.actor ?? {}
    return joinRequestMail({
      requesterEmail: actor.email,
      requesterName: actor.name,
      siteKey: row.siteName ?? row.siteKey,
      reviewUrl: links.team(row.siteKey, actor.email ?? null),
      manageUrl: links.manage(),
      lang
    })
  },

  /** T2b: another Owner answered that request. */
  'team.join_answered': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { data, site, siteKey, who, whoFull } = facts(t, rows)
    const requester = shortName(t, data.requesterName, data.requesterEmail)
    const requesterFull = personLine(t, data.requesterName, data.requesterEmail)
    const approved = data.decision === 'approved'
    const role = asRole(t, data.role)
    if (approved && !role) return null
    return letter(t, {
      badge: 'mail.n.badge.joinRequest',
      subject: t(approved ? 'mail.n.joinAnswered.approvedSubject' : 'mail.n.joinAnswered.declinedSubject', {
        actor: who,
        requester,
        site
      }),
      paragraphs: [
        approved
          ? t('mail.n.joinAnswered.approvedBody', {
              actor: whoFull,
              requester: requesterFull,
              site,
              asRole: role
            })
          : t('mail.n.joinAnswered.declinedBody', { actor: whoFull, requester: requesterFull }),
        t('mail.n.noAction')
      ],
      // An approved requester now holds a seat: the Team tab opens on them.
      button: viewTeam(t, links, siteKey, approved ? data.requesterEmail : null),
      links
    })
  },

  /** T3: the requester is in ("You now have access…"), instead of the invitation mail. */
  'team.approved': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { data, site, siteKey, whoFull } = facts(t, rows)
    const role = asRole(t, data.role)
    if (!role) return null
    return letter(t, {
      badge: 'mail.n.badge.approved',
      subject: t('mail.n.approved.subject', { site }),
      paragraphs: [t('mail.n.approved.body', { actor: whoFull, site, asRole: role })],
      button: { label: t('mail.n.openSite', { site }), url: links.site(siteKey) },
      links
    })
  },

  /** T4: the request was declined. Does not name who declined it; no button. */
  'team.declined': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { site } = facts(t, rows)
    return letter(t, {
      badge: 'mail.n.badge.declined',
      subject: t('mail.n.declined.subject', { site }),
      paragraphs: [t('mail.n.declined.body', { site }), t('mail.n.declined.contact')],
      links
    })
  },

  /** T5: the inviter hears the invitation was accepted. */
  'team.invite_accepted': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { row, data, site, siteKey, who, whoFull } = facts(t, rows)
    const role = asRole(t, data.role)
    if (!role) return null
    return letter(t, {
      badge: 'mail.n.badge.invitation',
      subject: t('mail.n.inviteAccepted.subject', { actor: who, site }),
      paragraphs: [t('mail.n.inviteAccepted.body', { actor: whoFull, site, asRole: role })],
      button: viewTeam(t, links, siteKey, row.actor?.email),
      links
    })
  },

  /** T6: the inviter hears the invitation was declined. */
  'team.invite_declined': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { site, siteKey, who, whoFull } = facts(t, rows)
    return letter(t, {
      badge: 'mail.n.badge.invitation',
      subject: t('mail.n.inviteDeclined.subject', { actor: who, site }),
      paragraphs: [
        t('mail.n.inviteDeclined.body', { actor: whoFull, site }),
        t('mail.n.inviteDeclined.again')
      ],
      button: viewTeam(t, links, siteKey),
      links
    })
  },

  /** T7: a teammate joined. Names the inviter when the seat came from an invitation. */
  'team.joined': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { row, data, site, siteKey, who, whoFull } = facts(t, rows)
    const role = asRole(t, data.role)
    if (!role) return null
    const inviter =
      data.inviterName || data.inviterEmail ? personLine(t, data.inviterName, data.inviterEmail) : null
    return letter(t, {
      badge: 'mail.n.badge.newTeammate',
      subject: t('mail.n.joined.subject', { actor: who, site }),
      paragraphs: [
        t('mail.n.joined.body', { actor: whoFull, site, asRole: role }),
        inviter ? t('mail.n.joined.invitedBy', { inviter }) : null
      ],
      button: viewTeam(t, links, siteKey, row.actor?.email),
      links
    })
  },

  /** T8: the person's seat was removed. No button: there is nothing left for them to open. */
  'team.removed': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { site, who, whoFull } = facts(t, rows)
    return letter(t, {
      badge: 'mail.n.badge.accessRemoved',
      subject: t('mail.n.removed.subject', { site }),
      paragraphs: [
        t('mail.n.removed.body', { actor: whoFull, site }),
        t('mail.n.removed.after', { actor: who })
      ],
      links
    })
  },

  /** T9: the person's role changed. */
  'team.role_changed': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { data, site, siteKey, whoFull } = facts(t, rows)
    const toRole = roleOf(data.to)
    const fromRole = roleOf(data.from)
    // A retired role that became the same one (`admin` to `editor`) is no change worth a letter.
    if (!toRole || !fromRole || toRole === fromRole) return null
    const to = t(`role.${toRole}`)
    return letter(t, {
      badge: 'mail.n.badge.roleChange',
      subject: t('mail.n.roleChanged.subject', { site, role: to }),
      paragraphs: [
        t('mail.n.roleChanged.body', { actor: whoFull, from: t(`role.${fromRole}`), to }),
        t(ROLE_ABOUT[toRole])
      ],
      button: { label: t('mail.n.openSite', { site }), url: links.site(siteKey) },
      links
    })
  },

  /** T10: a teammate left. */
  'team.left': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { data, site, siteKey, who, whoFull } = facts(t, rows)
    const role = asRole(t, data.role)
    if (!role) return null
    return letter(t, {
      badge: 'mail.n.badge.teammateLeft',
      subject: t('mail.n.left.subject', { actor: who, site }),
      paragraphs: [t('mail.n.left.body', { actor: whoFull, site, asRole: role })],
      button: viewTeam(t, links, siteKey),
      links
    })
  },

  /** T11 (copy C): the invitation was cancelled, so the earlier Accept link no longer works. No button. */
  'team.invite_cancelled': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { data, site, who, whoFull } = facts(t, rows)
    const role = asRole(t, data.role)
    if (!role) return null
    return letter(t, {
      badge: 'mail.n.badge.invitation',
      subject: t('mail.n.inviteCancelled.subject', { site }),
      paragraphs: [
        t('mail.n.inviteCancelled.body', { actor: whoFull, site, asRole: role }),
        t('mail.n.inviteCancelled.contact', { actor: who })
      ],
      links
    })
  },

  /** T12: a teammate put the whole site back to a backup; what was saved after it is gone. */
  'team.site_restored': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { data, site, siteKey, who, whoFull } = facts(t, rows)
    const backup = typeof data.backup === 'string' && data.backup.trim() !== '' ? data.backup.trim() : null
    if (!backup) return null
    return letter(t, {
      badge: 'mail.n.badge.restored',
      subject: t('mail.n.restored.subject', { actor: who, site }),
      paragraphs: [t('mail.n.restored.body', { actor: whoFull, site, backup })],
      button: { label: t('mail.n.openSite', { site }), url: links.site(siteKey) },
      links
    })
  },

  /** T13: the Owner deleted the site. No button: there is no site left to open. */
  'team.site_deleted': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { site, who, whoFull } = facts(t, rows)
    return letter(t, {
      badge: 'mail.n.badge.siteDeleted',
      subject: t('mail.n.siteDeleted.subject', { actor: who, site }),
      paragraphs: [t('mail.n.siteDeleted.body', { actor: whoFull, site })],
      links
    })
  },

  /**
   * T14: the site has a new address; `data.oldSite` and `data.newSite` are the two of this step (a row
   * written before `newSite` was kept reads the site's name now).
   */
  'team.site_renamed': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { data, site: now, siteKey, whoFull } = facts(t, rows)
    const oldSite = siteName(t, data.oldSite)
    const site = typeof data.newSite === 'string' && data.newSite !== '' ? siteName(t, data.newSite) : now
    return letter(t, {
      badge: 'mail.n.badge.newAddress',
      subject: t('mail.n.renamed.subject', { oldSite, site }),
      paragraphs: [t('mail.n.renamed.body', { actor: whoFull, oldSite, site })],
      button: { label: t('mail.n.openSite', { site }), url: links.site(siteKey) },
      links
    })
  },

  /** A Viewer asked for edit access (ADR 0028 §6); every Owner gets this, like T2. */
  'team.edit_access_request': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { row, site, siteKey, who, whoFull } = facts(t, rows)
    return letter(t, {
      badge: 'mail.n.badge.editAccess',
      subject: t('mail.n.editAccess.subject', { who, site }),
      paragraphs: [
        t('mail.n.editAccess.opening', { who: whoFull, site, asRole: asRole(t, 'viewer') }),
        t('mail.n.editAccess.how', { asRole: asRole(t, 'editor') }),
        t('mail.n.joinRequest.everyone')
      ],
      // The Team tab, on the person who asked: that is where an Owner approves or declines.
      button: { label: t('mail.n.joinRequest.review'), url: links.team(siteKey, row.actor?.email ?? null) },
      links
    })
  },

  /** Another Owner answered a Viewer's request for edit access (the T2b of that request). */
  'team.edit_access_answered': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { data, site, siteKey, who, whoFull } = facts(t, rows)
    const requester = shortName(t, data.requesterName, data.requesterEmail)
    const requesterFull = personLine(t, data.requesterName, data.requesterEmail)
    const approved = data.decision === 'approved'
    const role = asRole(t, data.role ?? 'editor')
    if (!role) return null
    return letter(t, {
      badge: 'mail.n.badge.editAccess',
      subject: t(
        approved ? 'mail.n.editAccessAnswered.approvedSubject' : 'mail.n.editAccessAnswered.declinedSubject',
        { actor: who, requester, site }
      ),
      paragraphs: [
        approved
          ? t('mail.n.editAccessAnswered.approvedBody', {
              actor: whoFull,
              requester: requesterFull,
              site,
              asRole: role
            })
          : t('mail.n.joinAnswered.declinedBody', { actor: whoFull, requester: requesterFull }),
        t('mail.n.noAction')
      ],
      button: viewTeam(t, links, siteKey, data.requesterEmail),
      links
    })
  },

  /** The Viewer's request for edit access was approved: they are an Editor now. */
  'team.edit_access_approved': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { data, site, siteKey, whoFull } = facts(t, rows)
    const toRole = roleOf(data.role ?? 'editor')
    if (!toRole) return null
    return letter(t, {
      badge: 'mail.n.badge.approved',
      subject: t('mail.n.editAccessApproved.subject', { site }),
      paragraphs: [
        t('mail.n.editAccessApproved.body', { actor: whoFull, site, asRole: asRole(t, toRole) }),
        t(ROLE_ABOUT[toRole])
      ],
      button: { label: t('mail.n.openSite', { site }), url: links.site(siteKey) },
      links
    })
  },

  /** The Viewer's request for edit access was declined. Does not name who declined it; no button. */
  'team.edit_access_declined': ({ lang, rows, links }) => {
    const t = translator(lang)
    const { site } = facts(t, rows)
    return letter(t, {
      badge: 'mail.n.badge.declined',
      subject: t('mail.n.editAccessDeclined.subject', { site }),
      paragraphs: [t('mail.n.editAccessDeclined.body', { site }), t('mail.n.declined.contact')],
      links
    })
  }
})
