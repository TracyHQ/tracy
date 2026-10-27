/**
 * English baseline for the `tracy-my-sites` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Vietnamese arrives from
 * `@tracy/dsh-tracy-locale-vi`, which registers `(namespace, locale)` pairs separately —
 * `ctx.locale.register` throws on a duplicate pair, so exactly one place may ship each.
 */

/**
 * The namespace this package owns.
 *
 * 🔒 IT LIVES HERE, beside `en`. `check-dsh-locale` finds owners by reading the exported `NS` of
 * each `strings.ts`; declaring it inside `index.tsx` instead makes the namespace invisible to the
 * gate, which then cannot notice a missing translation. `tracy-settings` shipped ten
 * English-only strings that way and nothing said so.
 */
export const NS = 'tracy-my-sites'

export const en = {
  /** Accessible name of a dialog's X button (screen readers, tooltips). */
  'action.close': 'Close',
  /** Tab label in the side card. */
  'tab.title': 'My Sites',
  /**
   * Accessible name of the tab's loading bar (a 2px line under the tab strip, no visible words),
   * and the line the two Settings sections show while they read. It was "Reading your seats…"
   * until #797: "seat" is Tracy's word for the record, not one a customer was ever taught.
   */
  'loading.label': 'Loading',
  /** Shown when the viewer holds no seat anywhere. */
  'state.empty': 'You do not hold a seat on any site yet.',
  /** Shown when the list could not be read; the retry button sits right under it. */
  'state.failed': 'Could not load your sites.',
  /**
   * Shown when nobody is signed in.
   *
   * 🔒 A DEAD END IS NOT AN ANSWER. "Not signed in" states a fact and leaves the reader with
   * nowhere to click; the door has to come with it, which is why this string sits beside
   * `action.signIn` and never appears without it.
   */
  'state.signedOut': 'Sign in to see the sites you hold a seat on.',
  /** Button that opens the sign-in door. */
  'action.signIn': 'Sign in',
  /** Retry button under the failure notice. */
  'action.retry': 'Try again',
  /**
   * The site this window works on.
   *
   * "Managing" rather than "Now chatting" (Akemi, 29/09): the row answers "which site am I working
   * on here", and that is the site the person manages from this window, whatever the chat holds.
   * It is a state, not a control, so it carries no animation and invites no click.
   */
  'badge.current': 'Managing',
  /**
   * Marks a site that has no lane yet.
   *
   * The wording names the state rather than blaming the reader: the seat is real, the machine is
   * not there yet. "Unavailable" would read as though they had lost access.
   *
   * 🔒 Not the W-word the vocabulary bans (`docs/references/vocabulary.md` §4). The banned term
   * is an invented one; "Not ready yet" says the same thing in words the reader already owns.
   */
  'badge.noLane': 'Not ready yet',
  /**
   * Button on a row whose site has an accepted seat and no agent yet. The untranslated term stays
   * (vocabulary §6); the verb says the reader is the one starting it. Pressing IS the retry, so
   * the row needs no separate "try again" control.
   */
  'action.start': 'Start the agent',
  /**
   * Row state between the press and the first answer from the agent's own address. No ellipsis —
   * the stepping dots are drawn by CSS, the same rule that animates "Now chatting".
   */
  'badge.starting': 'Starting',
  /** Beside the button when the press was refused, or the agent did not answer in time. */
  'state.startFailed': 'The agent could not start. Try again.',
  /**
   * Row state of an imported site whose read never reached a build (`importPending` in `/api/sites`):
   * the site has no workspace yet, so the row says so instead of offering Start the agent.
   */
  'badge.importPending': 'Import not finished',
  /** Beside it: opens the import recovery page in the creation workspace, where Retry or Continue waits. */
  'action.finishImport': 'Finish import',
  /** Beside it, for an owner: removes the unfinished import after asking (`RemoveImportDialog`). */
  'action.removeImport': 'Remove',
  /** The Remove button while its answer is on its way. No ellipsis, as with the other busy labels. */
  'action.removingImport': 'Removing',
  'removeImport.title': 'Remove the import of {site}?',
  'removeImport.body':
    'The site and what Tracy copied so far are removed. Nothing changes on your live site.',
  /** A read of the site is still going on Tracy's side: nothing was removed. */
  'removeImport.running': 'Tracy is still copying this site. Try again once the import stops.',
  /** Tracy could not confirm that no read is going, or was busy: nothing was removed. */
  'removeImport.later':
    'Tracy could not remove the import right now. Nothing was removed. Try again in a few minutes.',
  /**
   * The one control on a row holding an invitation nobody has answered.
   *
   * It replaced a badge reading "Invitation pending", which stated the situation and offered
   * nothing — and for a single-site invitation there was nothing else either: that mail carries
   * no link, only "sign in and your invitation will be waiting" (Lee, 04/09). It read "Accept
   * invitation" until Decline joined it (03/10): the pair now names the state together, and the
   * short verb keeps the pair as wide as the one button was.
   */
  'action.accept': 'Accept',
  /** The same button between the press and the seat book's answer. */
  'action.accepting': 'Accepting…',
  /**
   * Beside Accept on a row holding an invitation (Akemi U10 A, 03/10): says "no" to it, and the
   * person who sent it is told (spec #809, T6). Short, like Accept, so the pair keeps the width the
   * one "Accept invitation" button had.
   */
  'action.decline': 'Decline',
  /** The same button between the press and the seat book's answer. */
  'action.declining': 'Declining…',
  /** Marks a seat the viewer asked for; an Owner of that site decides. */
  'badge.asked': 'Waiting for approval',
  /**
   * Hint revealed on hover or focus of a row whose site is not the one being managed; the row
   * opens that site's chat in its own window.
   *
   * "Open Chat" (Akemi, 30/09): the verb says the press opens something, and "Chat" names what it
   * opens (the Chat pane, a conversation with that site's agent), not the site itself, which is
   * what a bare "Open" would suggest on a row named after a website.
   */
  'action.open': 'Open Chat',
  /**
   * Accessible name of a whole row that opens its site (the row itself is the control; the
   * visible "Open Chat" beside the arrow appears on hover and is hidden from screen readers). It
   * starts with the visible words so voice control ("click Open Chat") finds the row, and names
   * the new window, because the page the reader is on stays where it is.
   */
  'row.open': 'Open Chat with {site} in a new tab',
  /** Heading of the site picker under the chat's site chip, and its accessible name. */
  'picker.label': 'Your sites',
  /** Under another site in the picker: a press leaves this page where it is. */
  'picker.newTab': 'Opens in a new tab',
  /** Last row of the picker: the My Sites tab, where invitations, agents and teams are handled. */
  'picker.manage': 'Manage sites',
  /** Shown in the picker while the seat book is read. */
  'picker.loading': 'Reading your sites…',

  // ── The columns: Site · CMS · Role · Team · Created · the menu ─────────────────────────
  /**
   * Column header over the site's address and, on the same line after it, the row's one state:
   * "Managing", "Start the agent", an invitation to accept, the asked badge, and the "Open Chat"
   * hint. Those had a Status column of their own until 01/10 (Akemi).
   */
  'column.site': 'Site',
  /** Column header over the people cluster. */
  'column.team': 'Team',
  /** Screen-reader name of the last, narrow column: the `…` menu. */
  'column.more': 'More',
  /** Column header over the site's CMS (Joomla, WordPress, EmDash), shown as its logo (the name is its tooltip). */
  'column.cms': 'CMS',
  /** The Role column: the seat's role as the Team tab's badge. */
  'column.role': 'Role',
  /** When the site was created, as "3 days ago"; the list is sorted on it, newest first. */
  'column.created': 'Created',
  'role.owner': 'Owner',
  'role.editor': 'Editor',
  'role.viewer': 'Viewer',
  'ago.justNow': 'just now',
  /** Whole phrases with the number inside: a language puts {count} where its grammar wants it
   * ("vor {count} Minuten", "hace {count} minutos"); one singular and one plural per unit. */
  'ago.minute': '{count} minute ago',
  'ago.minutes': '{count} minutes ago',
  'ago.hour': '{count} hour ago',
  'ago.hours': '{count} hours ago',
  'ago.day': '{count} day ago',
  'ago.days': '{count} days ago',
  /** Heading above the table, left of the Add sites button. */
  'list.title': 'Your sites',
  /** Muted line under the heading. */
  'list.lead': 'Every site you own or were invited to. Open one to start working on it.',
  /** Opens the Add site tab, where a new site is made or an existing one is connected. */
  'action.addSites': 'Add sites',
  /** The Team cell when nobody but the viewer sits on the site. */
  'team.onlyYou': 'only you',
  /** Badge on the Team cell: people waiting on the viewer's decision. */
  'team.asked': '{count} asked to join',
  /** Hover title of the Team cell. */
  'team.open': 'Team',
  /** The one verb for adding people, everywhere it appears (Lee, 04/09). */

  // ── The `…` menu on a row (Phase B) ──────────────────────────────────────────────────────
  'action.more': 'More',
  'action.cancel': 'Cancel',
  /** Opens the Browser tab of the side card on the site's own address. */
  'more.live': 'Open live site',
  /** Opens the platform's admin in a real window: an iframe never gets its cookies. */
  'more.admin': 'Open admin',
  'more.copyAddress': 'Copy address',
  /** Confirmation in place of the menu, for two seconds. */
  'more.copied': 'Copied',
  'more.team': 'Team',
  'more.changes': 'Site changes',
  /** Opens the site's Settings tab (Akemi 04/10/2026). */
  'more.settings': 'Site settings',
  // The menu line that opens the site's Publish tab, and the row's publish state.
  'more.publish': 'Publish',
  'more.export': 'Export site as ZIP',
  /** More menu row of an imported site: bring the live site's changes into this copy. */
  'more.syncFromLive': 'Sync from live',
  /** More menu row of an imported site: send Tracy's changes on this copy to the live site. */
  'more.syncToLive': 'Sync to live',
  'publish.status.draft': 'Draft',
  'publish.status.publishing': 'Publishing…',
  'publish.status.live': 'Live',
  /** The site is being deleted; its row stays until the server has finished removing it. */
  'publish.status.deleting': 'Deleting…',
  'more.leave': 'Leave site',
  /** Beside a greyed Leave: this viewer is the only Owner, so somebody must stay. */
  'more.lastOwner': 'last Owner',
  'more.delete': 'Delete site…',
  /**
   * The label above dsh's sidebar rows on a site page, where the one row is the site's own folder
   * (`site-row-menu.tsx`). dsh says "Workspaces" there; a customer was never taught that word.
   */
  'section.site': 'Site',

  // ── Leaving ──────────────────────────────────────────────────────────────────────────────
  /**
   * Decline asks first (develop #800: a step that cannot be undone asks before it runs; Akemi
   * 04/10). The body names who sent the invitation; without one the dialog shows the title alone.
   */
  'decline.title': 'Decline the invitation to {site}?',
  'decline.body': '{inviter} will need to invite you again.',
  'leave.title': 'Leave {site}?',
  'leave.body': 'Your seat is removed, and the agent goes with it. A teammate can invite you back.',
  'leave.confirm': 'Leave the team',
  'leave.working': 'Leaving…',

  // ── Deleting: delete is delete (Lee, 04/09) ──────────────────────────────────────────────
  'delete.title': 'Delete {site} from Tracy',
  'delete.body': 'This cannot be undone.',
  'delete.goesSite': 'The site stops answering and its files are erased.',
  'delete.goesData': 'Its database, its uploads and its whole history go with it.',
  'delete.goesSeats': 'Every seat is revoked. Nobody on the team keeps access.',
  'delete.goesRepo':
    'Tracy tries to delete the repository it created; if GitHub does not confirm the delete, the repository may remain, and the site is deleted anyway. A repository Tracy did not create is left untouched.',
  /**
   * The gate above the input. It NAMES the site rather than referring to it: the reader is about
   * to type a string, and the label is where that string is spelled out for them — "the site's
   * name" makes them go looking for it in the title. `{site}` is rendered bold, so the label and
   * the placeholder below show the same characters in the same order (Lee, 05/09).
   */
  'delete.typeName': 'Type “Delete” to confirm',
  'delete.confirm': 'Delete',
  'delete.working': 'Deleting…',
  /** Full-page cover while the site this page stands in is deleted, until the page moves on. */
  'delete.coverTitle': 'Deleting {site}…',
  /** Second line of that cover: the page is about to leave on its own. */
  'delete.coverDetail': 'Taking you to your next site in a moment.',
  /** The delete was taken and is not finished: the site is still listed, marked "Deleting…". */
  'delete.pending':
    'Tracy is still deleting this site. It stays in My Sites, marked “Deleting…”, until the server has finished removing it. You do not need to delete it again.',

  // ── What a delete left behind (#801): shown when the door did not confirm every part ─────
  /** Title of the notice when the site's row is gone but a part of the teardown was not confirmed. */
  'delete.partialTitle': '{site} was deleted, but the cleanup is not complete',
  /** Above the list of parts. The row is off the book, so there is nothing left to delete again. */
  'delete.partialBody':
    'The site is off your list and cannot be deleted again from here. Tracy could not confirm that these parts are gone:',
  /** The four parts the door reports on, each named by what the person would find left over. */
  'delete.partHost': 'The site’s files and database on the server',
  'delete.partRepo': 'The site’s GitHub repository',
  'delete.partSessions': 'The site’s chat sessions',
  'delete.partSeats': 'The team’s seats at the agent',
  /** Under a part the door reported as not confirmed gone. */
  'delete.stateFailed': 'Removal not confirmed',
  /** Under a part the door's answer did not report on at all. */
  'delete.stateUnknown': 'No result reported',
  /** The door's own reason, shown as sent (a code such as TEARDOWN_FAILED, sometimes with a detail). */
  'delete.reason': 'Reason: {reason}',
  /** The door sent no reason; none is made up. */
  'delete.reasonUnknown': 'Reason: not reported',
  /** What support needs to find the site: its key, which a rename never changes. */
  'delete.resultSiteKey': 'Site key: {key}',
  /** The next step after a partial delete. */
  'delete.partialNext':
    'Contact Tracy support and include the site key and the details above, so what is left can be removed.',
  /** Title of the notice when no readable answer came back: nothing is known either way. */
  'delete.unknownTitle': 'The result of deleting {site} is unknown',
  'delete.unknownBody':
    'Tracy did not get a readable answer. The site may be deleted, partly deleted or unchanged.',
  /** The next step after an unknown result: look first, never delete blindly a second time. */
  'delete.unknownNext':
    'Look at My Sites to see whether the site is still listed. If it is gone or no longer works, contact Tracy support and include the site key instead of deleting it again.',
  /** The notice's one button: it has been read. */
  'delete.resultAcknowledge': 'Got it',

  // ── Refusals the seat book has a name for, on a row's own actions ────────────────────────
  /** Unnamed, or no answer at all: the outcome is not known, so the sentence does not claim one. */
  'error.failed': 'Tracy could not complete that. Reload the page to see what is current, then try again.',
  /** A refusal (4xx) with no sentence of its own: a considered "no", so nothing was changed (#801). */
  'error.refused':
    'Tracy did not do that, and nothing was changed. Reload the page to see what is current, then try again.',
  /** A role too low. Which role is enough differs by action, so the sentence names the way out. */
  'error.notSiteOwner':
    'Your role on this site does not allow this. Ask an Owner of the site to do it, or to change your role.',
  /** No seat at all any more — not a question of role. */
  'error.noSeat':
    'You no longer have a seat on this site. Reload the page to see your current sites, or ask an Owner or an Editor of that site to invite you again.',
  /** The server could not remove the site itself, so the delete stopped there: nothing else went. */
  'error.deleteHostFailed':
    'Tracy could not finish removing this site from its server, so the site was not deleted and nothing else was changed. Try deleting it again. If it fails again, contact Tracy support and include the site key.',
  'error.notRepoOwner': 'That site’s repository is your own, so Tracy cannot delete it for you.',
  'error.lastOwner': 'This is the site’s last Owner. Make someone else an Owner first.',
  'error.rateLimited': 'Too many changes this hour. Try again shortly.',
  /** The invitation was revoked, declined or never there — not a permission the reader lacks. */
  'error.acceptGone':
    'That invitation is no longer open. Ask an Owner or an Editor of that site to invite you again.',
  /** Decline pressed on an invitation already accepted elsewhere: the row is a site of theirs now. */
  'error.declineAccepted':
    'You already accepted this invitation, so this site is one of your sites now. To give up your seat, open its menu and choose Leave site.',
  /** The row is the viewer's own request to join: accepting it themselves is the one thing they may not do. */
  'error.acceptRequested': 'You asked to join this site. An Owner of that site decides.',
  /** The session ended while the tab stood open (#796): the next step is to sign in, so say it. */
  'error.signedOut': 'You have been signed out. Reload the page to sign in, then try again.',

  // ── Settings sections ────────────────────────────────────────────────────────────────
  /** Nav label of the account section. */
  'account.nav': 'Account',
  /** Label of the email row. */
  'account.email': 'Email',
  /** Explains that the address comes from the seat book, not from a local account. */
  'account.emailNote': 'The address you sign in with. Sign out to switch to another one.',
  /** Shown when nobody is signed in — always rendered beside the sign-in button. */
  'account.anonymous': 'Sign in to see which address your seat is issued to.',
  /** Label of the row holding the sign-out button. */
  'account.session': 'Session',
  /** Explains the scope of signing out: this browser, not the seat. */
  'account.sessionNote': 'Signing out ends this browser session only.',
  /** The sign-out button. */
  'account.signOut': 'Sign out',
  /** Nav label of the current-site section. */
  'site.nav': 'This site',
  /** Label of the role row. */
  'site.role': 'Your role',
  /** Explains that roles are held per site. */
  'site.roleNote': 'Roles are held per site, and decide which tools the agent may use.',
  /** Label of the public address row. */
  'site.live': 'Live address',
  /** Row label for the CMS admin door. */
  'site.admin': 'Admin',
  /**
   * The link text names WHERE it opens, not only the destination.
   *
   * The admin page wants a sign-in, and the Browser tab beside this one is an iframe — third-party
   * cookies are blocked, so it can never get in. Saying "opens in a new window" up front is far
   * cheaper than letting someone click into a refused connection.
   */
  'site.adminOpen': 'Open in a new window',
  /** Shown when no site is open. */
  'site.none': 'No site is open.'
} as const

export type Translate = (key: keyof typeof en | string, params?: Record<string, string | number>) => string
