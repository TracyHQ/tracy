/**
 * English baseline for the `tracy-inbox` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Vietnamese arrives from
 * `@tracy/dsh-tracy-locale-vi` and the six other interface languages from `@tracy/dsh-tracy-locales`.
 * `NS` lives beside `en` so `check-dsh-locale` can find the owner.
 *
 * Copy approved by Akemi on 2026-10-03 (spec #809, "Approved copy"). Sentences name the actor as
 * `{actor}`, which the row draws bold; `{asRole}` is one of the `asRole.*` phrases, because the
 * article in front of a role name ("an Editor", "a Viewer") is grammar each language owns.
 */
export const NS = 'tracy-inbox'

export const en = {
  /** Tab label in the side card, the header of the tab, and the row in the left column. */
  'tab.title': 'Inbox',
  /** The one-line lead under the page title (25/10/2026, the My Sites and Team page shell). */
  'page.lead': 'Mentions and updates about the sites you work on.',
  /** Accessible name of the tab's loading bar. */
  'loading.label': 'Loading',
  /** Filter: only notifications not read yet (the default). Its count follows it. */
  'filter.unread': 'Unread',
  /** Filter: every notification kept. */
  'filter.all': 'All',
  /** Accessible name of the two filter buttons as a group. */
  'filter.label': 'Show notifications',
  'action.markAllRead': 'Mark all as read',
  /** On a join request an Owner has not answered yet: opens the Team tab on that person. */
  'action.review': 'Review',
  'action.accept': 'Accept',
  'action.decline': 'Decline',
  'action.answerFailed': 'That did not go through. Try again.',
  'action.loadMore': 'Load more',
  'action.retry': 'Try again',
  /** Accessible name and tooltip of the site chip, which opens the live site. */
  'action.openSite': 'Open {site} in a new tab',
  'state.failed': 'Could not load your notifications.',
  'empty.unread.title': 'You’re all caught up',
  'empty.unread.body': 'Mentions, replies and team updates will appear here.',
  'empty.all.title': 'Nothing here yet',
  /** Under the list, and the second line of the empty All filter. */
  retention: 'Notifications are kept for 90 days.',
  /** First part of the context line of a team row ("Team · Editor · 2 min. ago"). */
  'context.team': 'Team',
  'context.homePage': 'Home page',
  /** Accessible name of the count beside the left-column row. */
  'nav.unread': '{count} unread',
  /** Replaces the quote of a comment that was deleted since (rule R3). */
  'quote.deleted': '{actor} deleted this comment',

  /**
   * The action line under the name (Figma layout): the actor has its own line. Every phrase names
   * the site as `{site}`, which the row draws as a link to the live site (Akemi 04/10, option F;
   * English awaiting approval).
   */
  'act.team.invited': 'Invited you as {asRole} on {site}',
  'act.team.invitedNoRole': 'Invited you to {site}',
  'act.team.joinRequest': 'Asked to join {site}',
  'act.team.joinApproved': 'Approved {requester}’s request to join {site}',
  'act.team.joinDeclined': 'Declined {requester}’s request to join {site}',
  'act.team.approved': 'Approved your request to join {site}',
  'act.team.approvedPassive': 'Your request to join {site} was approved',
  'act.team.declined': 'Your request to join {site} was declined',
  /** ADR 0028 §6: a Viewer asks the Owners for edit access, and hears the answer. */
  'act.team.editAccessRequest': 'Asked for edit access on {site}',
  'act.team.editAccessApproved': 'Approved {requester}’s request for edit access on {site}',
  'act.team.editAccessDeclined': 'Declined {requester}’s request for edit access on {site}',
  'act.team.editAccessGranted': 'Approved your request for edit access on {site}',
  'act.team.editAccessGrantedPassive': 'Your request for edit access on {site} was approved',
  'act.team.editAccessRefused': 'Your request for edit access on {site} was declined',
  'act.team.inviteAccepted': 'Accepted your invitation to {site}',
  'act.team.inviteDeclined': 'Declined your invitation to {site}',
  'act.team.joined': 'Joined {site} as {asRole}',
  'act.team.joinedNoRole': 'Joined {site}',
  'act.team.removed': 'Removed you from {site}',
  /** `{role}` is the bare role name, one of the `role.*` labels below, translated (ADR 0028 §7). */
  'act.team.roleChanged': 'Changed your role on {site} to {role}',
  'act.team.roleChangedPassive': 'Your role on {site} is now {role}',
  'act.team.left': 'Left {site}',
  'act.team.inviteCancelled': 'Cancelled your invitation to {site}',
  'act.team.inviteCancelledPassive': 'Your invitation to {site} is no longer available',
  /** T12–T14 (Akemi 04/10): changes to the whole site. `{oldSite}` is plain text, `{site}` the link. */
  'act.team.siteRestored': 'Restored {site} to the backup “{backup}”',
  'act.team.siteDeleted': 'Deleted {site}',
  'act.team.siteRenamed': 'Renamed {oldSite} to {site}',
  'act.comment.mention': 'Mentioned you on {site}',
  'act.comment.replyYours': 'Replied to your comment on {site}',
  'act.comment.replyThread': 'Replied in a thread you’re in on {site}',
  'act.comment.resolved': 'Resolved your comment on {site}',
  'act.comment.reopened': 'Reopened your comment on {site}',

  /** Section headers (layout "option I"): rows still waiting on the reader come first. */
  'section.answer': 'Needs your answer',
  /** Right of the first section's header. */
  'section.answer.hint': 'Waiting on you',
  'section.comments': 'Comments',
  'section.team': 'Team updates',
  /** Under the first three cards of Needs your answer when there are more; `{count}` is all of them. */
  'section.showAll': 'Show all ({count})',
  /** Under the expanded Needs your answer: back to the first three cards. */
  'section.showFewer': 'Show fewer',

  /**
   * The verb of each team phrase, drawn in the row's category colour in Team updates. Each value
   * must appear word for word inside the matching act.* phrase of the same language (word order
   * differs: German puts the participle last); a verb that is not found leaves the phrase uncoloured.
   */
  'verb.team.invited': 'Invited',
  'verb.team.invitedNoRole': 'Invited',
  'verb.team.joinRequest': 'Asked to join',
  'verb.team.joinApproved': 'Approved',
  'verb.team.joinDeclined': 'Declined',
  'verb.team.approved': 'Approved',
  'verb.team.approvedPassive': 'approved',
  'verb.team.declined': 'declined',
  'verb.team.editAccessRequest': 'Asked for edit access',
  'verb.team.editAccessApproved': 'Approved',
  'verb.team.editAccessDeclined': 'Declined',
  'verb.team.editAccessGranted': 'Approved',
  'verb.team.editAccessGrantedPassive': 'approved',
  'verb.team.editAccessRefused': 'declined',
  'verb.team.inviteAccepted': 'Accepted',
  'verb.team.inviteDeclined': 'Declined',
  'verb.team.joined': 'Joined',
  'verb.team.joinedNoRole': 'Joined',
  'verb.team.removed': 'Removed',
  'verb.team.roleChanged': 'Changed your role',
  'verb.team.roleChangedPassive': 'is now',
  'verb.team.left': 'Left',
  'verb.team.inviteCancelled': 'Cancelled',
  'verb.team.inviteCancelledPassive': 'no longer available',
  'verb.team.siteRestored': 'Restored',
  'verb.team.siteDeleted': 'Deleted',
  'verb.team.siteRenamed': 'Renamed',
  /** The verb of each comment phrase, drawn in the comment colour; same word-for-word rule. */
  'verb.comment.mention': 'Mentioned',
  'verb.comment.replyYours': 'Replied',
  'verb.comment.replyThread': 'Replied',
  'verb.comment.resolved': 'Resolved',
  'verb.comment.reopened': 'Reopened',

  /** After an answered invitation in Team updates: " · Accepted" / " · Declined" (Akemi 04/10). */
  'outcome.accepted': 'Accepted',
  'outcome.declined': 'Declined',
  /** After an answered join request: " · Approved". */
  'outcome.approved': 'Approved',
  /** After a declined join request; its own key so it agrees with "request" (Italian "Rifiutata"). */
  'outcome.requestDeclined': 'Declined',

  /** The role as it reads after "as" in a sentence (ADR 0028: role names are translated). */
  'asRole.owner': 'an Owner',
  'asRole.editor': 'an Editor',
  'asRole.viewer': 'a Viewer',
  /** A role's bare name, as `{role}` in "Changed your role on {site} to {role}". */
  'role.owner': 'Owner',
  'role.editor': 'Editor',
  'role.viewer': 'Viewer'
} as const

export type InboxKey = keyof typeof en

export type Translate = (key: string, params?: Record<string, string | number>) => string
