/**
 * English baseline for the `tracy-chat-input` namespace. This package OWNS the namespace: `en`
 * ships here, Vietnamese arrives from `@tracy/dsh-tracy-locale-vi`. `NS` lives beside `en` so
 * `check-dsh-locale` can find the owner.
 */
export const NS = 'tracy-chat-input'

export const en = {
  'widget.imported': 'Earlier conversation and website brief',
  'widget.importedHint':
    'Imported from your website discovery. Earlier requests are kept as context and are not run again.',
  'widget.contextLoading': 'Loading your earlier conversation…',
  'widget.contextUnavailable':
    'Your earlier conversation could not be loaded. Reload to reconnect before continuing.',
  'widget.you': 'You',
  'widget.siteReady': 'Your website is ready.',
  'widget.openWebsite': 'Open website',
  'widget.continueTracy': 'Continue in Tracy',
  /**
   * The creation workspace (`/new/`): a title, one line under it, and three round cards, nothing
   * else. Approved by Akemi 01/10/2026 (start-screen mockup, Case 1, option A), replacing the two
   * cards approved on Storybook 14/09. The four site chips (`chip.*`) went 21/09, see index.tsx.
   *
   * 🔒 NO QUESTIONS HERE. The set this replaced was four questions ("What can Tracy do…"), written
   * for a lane whose agent held no tools; since ADR 0014 the agent behind this workspace carries a
   * site persona and no site, and a question ends in tool errors on screen (measured 14/09).
   *
   * Each card names what it opens: "Create a new site" and "Import your site" are the two
   * origin cards of the Add site tab (`Create a new site`, `Import existing site`), opened on that
   * card. "Start from a template" opens the Design inspirations tab; the card says it in the words
   * people who build websites use (Akemi 01/10), the tab keeps its own name. Never a number of
   * designs in the copy: the library grows, the sentence would not.
   */
  'start.title': 'Your website, changed just by asking',
  'start.subtitle': 'Skip the admin panel. Type what you want and watch your site change.',
  'start.create': 'Create a new site',
  'start.template': 'Start from a template',
  'start.import': 'Import your site',
  /** Add site's Build from my business (`@tracy/dsh-add-site` `own_title`), shown while its switch is on. */
  'start.business': 'Build it from my business',
  /**
   * A site's workspace, before its first message (Akemi 01/10/2026, start-screen mockup, Case 2,
   * option A): a heading (Akemi 14/10/2026: "Your site, ready to edit", in place of the hero's
   * question, tracy-brand `hero.title`), the site's address under it (data, not a string; a link to
   * the live site since 14/10/2026), and cards named as the tabs and modes they open: the Browser
   * tab's Edit mode, the Comments view, the Site changes tab, Design system and the Team tab.
   */
  'start.site.title': 'Your site, ready to edit',
  /** The host line under the heading links to the live site in a new tab; this names that link. */
  'start.site.openSite': 'Open {host} in a new tab',
  'start.site.edit': 'Edit',
  'start.site.comments': 'Comments',
  'start.site.changes': 'Site changes',
  /** Hover words of the Site changes card's count: what the number is (`changes-count.mjs`). */
  'start.site.changesCount': '{count} changes since you last looked',
  /** The card's title at exactly one: no plural rules in the string tables, so one key per form. */
  'start.site.changesCountOne': '1 change since you last looked',
  /**
   * The Design system card (Akemi U2 A, 12/10/2026), between Site changes and Team: it opens the site's
   * Design system tab, and its end names the system the site wears, or the words below when none.
   */
  'start.site.designSystem': 'Design system',
  'start.site.designSystem.default': 'Template default',
  'start.site.team': 'Team',
  'start.site.team.onlyYou': 'only you',
  /**
   * The same start screen for a Viewer seat (ADR 0028, `seat-role.mjs`): no Edit card, a question to
   * ask instead of a change to make, the chat box's own hint replaced, and a bar above the chat box
   * whose button asks every Owner of the site for edit access.
   */
  'start.site.titleViewer': 'What would you like to know today?',
  'start.site.placeholderViewer': 'Ask about this site',
  'viewer.bar': 'You can view this site and ask about it. Changes need edit access.',
  'viewer.ask': 'Ask for edit access',
  'viewer.ask.sent': 'Request sent to the owners',
  'viewer.ask.signedOut':
    'You are signed out, so the request was not sent. Reload this page to sign in again.',
  /** The seat already edits: the page still shows the Viewer screen it drew on load. */
  'viewer.ask.alreadyEditor': 'You can already edit this site. Reload the page to start editing.',
  'viewer.ask.failed': 'The request was not sent (code {code}). Try again in a moment.',
  /**
   * Shown once, for a few seconds, above the chat box when an Owner makes this Viewer an Editor while
   * the page is open (#1036, `createPromotedNotice`): the screen has just switched to the editing one.
   */
  'viewer.promoted': 'You can now edit this site.',
  // A seat taken back while its page was open (J7.8): the same words as the site tabs' Site URL row.
  'seat.removed': 'You no longer have access to this site. Ask its Owner to invite you again.',
  'seat.removed.mySites': 'Go to My Sites',
  /**
   * A chat message sent from a comment's thread card (acceptance F6, story ThreadCardSendToChat): the
   * thread under its chip, collapsed to two lines (`ChatThread.tsx`).
   */
  'chat.thread': 'Thread',
  'chat.thread.all': 'Show all {count}',
  'chat.thread.less': 'Show less',
  /**
   * The lines the turn card adds under a turn Tracy stopping cut off (#295, `TurnUndoCard.tsx`):
   * the chat above it stops mid-sentence, so the card says so, and Continue asks Tracy to carry on.
   * `title` only when the host's record shows a deploy cut it; `titleRestart` otherwise — a crash or
   * a reboot is no update, and the sentence is true of an update too (#1403 item 11).
   */
  /**
   * What a running turn waits on, under the chat (#1403 item 10, `ChatWaitLine.tsx`). Never who:
   * "another conversation" may be someone this seat does not know.
   */
  'wait.lease': 'Waiting for another conversation to finish changing this site… {seconds} s',
  'wait.previous': 'Saving the changes of your previous request first… {seconds} s',
  'wait.check': 'Checking the page before finishing… {seconds} s',
  'interrupted.title': 'This request was interrupted by a Tracy update.',
  'interrupted.titleRestart': 'This request was interrupted when Tracy restarted.',
  'interrupted.nothing': 'This request was interrupted before it changed anything on your site.',
  'interrupted.loading': 'Checking what this request changed…',
  'interrupted.unknown': 'Tracy could not check what this request changed. Your site may be partly updated.',
  'interrupted.continue': 'Continue',
  'interrupted.continueHint': 'Send or clear the message you are typing first.',
  'interrupted.continueMessage':
    'Continue the request that was interrupted when Tracy restarted. These changes from it are still on the site: {applied}.',
  'interrupted.continueUndone':
    'The request above was interrupted when Tracy restarted, and I undid every change it had made ({undone}). Start it again from the beginning.',
  /**
   * The line under the queue while a Tracy update holds a message, and after it (#517,
   * `DeployHoldNotice.tsx`). Before it, a message sent during an update showed nothing for ten
   * minutes and, after the update, never ran with nobody told. Six states and no more: it waits
   * and will run; the update is over but it has not started yet (and still will, once — never "send
   * it again"); it waits and will run but Tracy could not note it down (still never "send it
   * again"); it did not run; nobody can say — never dressed up as any of the others, and it asks to
   * look first, because the update may have cut it half way; Tracy cannot read what it held at all,
   * so it cannot say whether any message of this conversation was held — said the same way.
   */
  'held.waiting': 'Tracy is updating. Your message will run when the update finishes.',
  'held.delayed':
    'Tracy is taking longer than usual to start after the update. Your message will run as soon as it can.',
  'held.unsaved':
    'Tracy is updating. Your message is still queued and will run when the update finishes, so please do not send it again.',
  'held.failed': 'Your message did not run after the Tracy update. Send it again.',
  'held.unknown':
    'Tracy cannot tell whether your message finished after the update. Check the conversation and your site before sending it again.',
  'held.unreadable':
    'Tracy cannot read its record of messages held during its last update. If a message you sent then has no answer, check the conversation and your site before sending it again.',
  /**
   * The Comments tab of the chat column, stage 6 (stories CommentsTabPeopleOnly · SendNChecklist ·
   * PageCommentBox · CommentsTabPeopleOnlyEmpty, Brian 29/09 evening): people comments only, open or
   * resolved. An Ask Tracy to edit is a chat message, never a comment, so no row carries a status word
   * or a Tracy line. "Resolve", "Delete all", "Note for team" and "Ask Tracy to edit" are the person's
   * words (Akemi 01/10/2026, option D1: they were "Add comment" and "Send to Tracy", which Brian had
   * approved in rule 10). In the "Add a comment…" box Enter is Ask Tracy to edit ({key} = "Enter") and
   * Note for team is a click; in the checklist Enter sends too, and ⌘/Ctrl+Enter like every other box
   * (round 5).
   */
  'comments.tab': 'Comments',
  'comments.emptyTitle': 'No comments yet',
  /**
   * While no Browser tab lists, the tab reads the site's comments from the server (01/10): what it says
   * until the server answers, and when it could not; never "No comments yet", which would be a claim.
   */
  'comments.loading': 'Loading comments…',
  'comments.retry': 'Try again',
  'comments.group.open': 'Open',
  'comments.group.resolved': 'Resolved',
  /** A group label during Delete all's window, in the label's own slot and style (round 3, Brian 30/09). */
  'comments.group.deleted': '{count} deleted',
  'comments.resolve': 'Resolve',
  'comments.replies.one': '1 reply',
  'comments.replies.other': '{count} replies',
  /**
   * UI fine-tune (Brian 30/09 morning): the page filter at the top of the tab, each side with its count;
   * a comment resolved in the Open view reads "Resolved. Undo" in its place for a few seconds.
   */
  'comments.filter': 'Which comments to show',
  /**
   * Comments tab redesign A (Akemi 01/10/2026): each side's number is a round counter of its own beside
   * the words (the chosen side's terracotta), so the words carry no count.
   */
  'comments.filter.page': 'Current page',
  'comments.filter.all': 'All pages',
  /** The same two in a narrow tab (e2e UI fine-tune 2: a 320 px phone), so the counters always show. */
  'comments.filter.pageShort': 'Page',
  'comments.filter.allShort': 'All',
  'comments.resolvedUndo': 'Resolved.',
  /**
   * Layout B and empty state E1 (Akemi 01/10/2026): a page group's name for the root path, the mark on the
   * page the preview shows, the bottom row and the centred empty block; both buttons put the preview in
   * Edit mode.
   */
  'comments.homePage': 'Home',
  'comments.here': 'Current',
  'comments.footerHint': 'Click any block on the page to comment on it.',
  'comments.emptyLine':
    'Click any block on the page to leave a note for your team or ask Tracy to change it.',
  'comments.startCommenting': 'Start commenting',
  /** The checklist's chip of a comment about the whole page: "Whole page · /". */
  'comments.wholePage': 'Whole page',
  /** The kind before an image comment's alt or file in the checklist's chip: `Image · "Team photo"`. */
  'comments.image': 'Image',
  /**
   * Delete all · Undo (Brian 21:10; one word for removing comments since 22:45, "Clear all" retired):
   * a soft delete of every open comment on the page, everyone's.
   */
  'comments.deleteAll': 'Delete all',
  'comments.deleteAllTip': 'Delete every comment shown here',
  'comments.undo': 'Undo',
  /** e2e v7 INTH-1: a Delete all the server refused; the rows are back. */
  'comments.deleteFailed': 'Could not delete. Try again.',
  /**
   * "Ask Tracy to edit all" (round 3, Brian 30/09; redesign A drops its count, Akemi 01/10/2026): every
   * open comment the view shows, then the checklist, all ticked; the short form in a narrow toolbar.
   */
  'comments.sendAllNone': 'Ask Tracy to edit all',
  'comments.sendAllShortNone': 'Ask Tracy',
  'comments.sendAllTip': 'Give every open comment and reply shown here to Tracy in the chat',
  'comments.checklist.hint': 'Untick what is only for your team.',
  /** UI fine-tune round 2, rule 7: rows are threads and the count is threads (the head's N when all ticked). */
  'comments.checklist.ticked': '{count} of {total} comments',
  'comments.checklist.tick': "Send {name}'s comment",
  /** Enter sends in the checklist (⌘/Ctrl+Enter too, round 5; the tooltip names Enter only). */
  'comments.checklist.sendTip': 'Ask Tracy to edit (Enter)',
  'comments.cancel': 'Cancel',
  'comments.sendToTracy': 'Ask Tracy to edit',
  'comments.files.one': '1 file',
  'comments.files.other': '{count} files',
  /** Round 5 (acceptance e2e v3, 30/09): a root deleted while replies stand under it (TH-4). */
  'comments.deletedComment': 'Comment deleted',
  /**
   * Comments list redesign A, L1 (Akemi 01/10/2026, `tasks/comments-list-redesign-plan.md`): the status
   * filter (Open / Resolved, no All; the words are `comments.group.*`), each comment's tag under its words,
   * its short time ("2m"; the full date is the tooltip), the ⋯ menu, the attachment chip that opens the
   * picture full screen, a page group with nothing of that status, and the load failure as a block.
   */
  'comments.statusFilter': 'Show open or resolved comments',
  'comments.tag.note': 'Note',
  'comments.tag.asked': 'Asked Tracy',
  'comments.tag.working': 'Tracy working…',
  'comments.tag.done': 'Done by Tracy',
  /**
   * ADR 0025 (Brian 03–04/10/2026): a comment Tracy resolved on proof of a write — where the resolved
   * list names who resolved it. A reply reopens it, as any resolved comment.
   */
  'comments.tag.tracy': 'Tracy marked this done',
  /**
   * ADR 0025: in "Ask Tracy to edit all", a comment already sent with nothing new since — unticked, with
   * the time it went (`{time}` is the hour and minute in the interface's language).
   */
  'comments.checklist.sent': 'Sent {time}',
  /**
   * ADR 0025: the report under a chat turn sent from comments, drawn from the server's data once the
   * turn ends. "Done" = a site write cited the comment (it is resolved, Tracy's); every other comment is
   * "Couldn't confirm" — never "not done": some writes carry no proof. Each line opens its comment.
   */
  'report.done.one': 'Done: 1 comment',
  'report.done.other': 'Done: {count} comments',
  'report.doneHint': '(reply to a comment if you want more changes)',
  'report.unconfirmed.one': "Couldn't confirm: 1 comment",
  'report.unconfirmed.other': "Couldn't confirm: {count} comments",
  'report.open': 'Show this comment',
  'comments.age.now': 'now',
  'comments.age.minutes': '{count}m',
  'comments.age.hours': '{count}h',
  'comments.age.days': '{count}d',
  'comments.age.weeks': '{count}w',
  'comments.age.years': '{count}y',
  'comments.unread': 'Unread',
  /**
   * The red dot on a Comments count (Lee 04/10/2026: the grey number is the open threads, the dot says
   * some are unread): its tooltip, and the part of the count's accessible name the dot carries, since a
   * CSS dot says nothing to a screen reader. `{count}` is this person's unread open threads there.
   */
  'comments.unread.title': '{count} unread',
  'comments.more': 'More actions',
  'comments.reopen': 'Reopen',
  'comments.markUnread': 'Mark as unread',
  'comments.copyLink': 'Copy link',
  'comments.delete': 'Delete',
  'comments.viewImage': 'View image full screen',
  'comments.closeImage': 'Close',
  'comments.noneHere.open': 'No open comments on this page.',
  'comments.noneHere.resolved': 'No resolved comments on this page.',
  'comments.none.open': 'No open comments.',
  'comments.none.resolved': 'No resolved comments.',
  'comments.loadFailedTitle': 'Could not load comments',
  'comments.loadFailedLine': 'Check your connection, then try again.',
  /**
   * The card under a chat turn that changed the site (`TurnUndoCard.tsx`, plan
   * `tasks/undo-change/plan.md` step 1.3), copy as Akemi approved it on 06/10/2026
   * (`plan-verified.html`, door d1). Undo is the deterministic undo of what Tracy recorded for the
   * turn; "Ask Tracy to revert" is the best-effort request, never called Undo (vocabulary.md).
   */
  'undo.changed': 'Changed on the site',
  'undo.view': 'View',
  'undo.undo': 'Undo',
  'undo.goBack': 'Go back to here',
  'undo.goBackConfirm': 'Go back',
  'undo.cancel': 'Cancel',
  'undo.confirmTitle': 'Undo this request?',
  'undo.confirmGoBackTitle': 'Go back to before this request?',
  'undo.putsBack': 'Puts back: {what}.',
  'undo.alsoLater.one': 'Also undoes {count} later request in this chat.',
  'undo.alsoLater.other': 'Also undoes {count} later requests in this chat.',
  'undo.scope':
    "Puts back the files and page edits Tracy recorded for this request. This can't be redone with one click.",
  'undo.undoing': 'Undoing…',
  'undo.undone': 'Undone',
  'undo.undoneLine': 'The site is back to before this request.',
  'undo.seeChanges': 'See it in Site changes',
  'undo.cannot': "Can't undo this request",
  'undo.working': 'Tracy is working on this site. Undo is available when it finishes.',
  'undo.needsCode': 'Undoing file changes needs an Owner or an Editor.',
  'undo.needsContent': "Undoing page edits needs a role that may edit this site's content.",
  /** The "what changed" line: `Design · 2 files; Content · a post`. Zones as the Site changes tab names them. */
  'undo.files.one': '{count} file',
  'undo.files.other': '{count} files',
  'undo.part.content': 'Content',
  'undo.part.look': 'Design · Additional CSS',
  'undo.more': '+{count} more',
  /**
   * How a changed record is named (`@tracy/core/turn-undo` `targetText`): its kind and title when the
   * host read one, else the kind alone. Never a record id (council D1, 20/10/2026). `postOrPage` and
   * `categoryOrTag` are WordPress's `post` and `term`, which hold more than one thing.
   */
  'undo.named.post': 'post “{title}”',
  'undo.named.page': 'page “{title}”',
  'undo.named.article': 'article “{title}”',
  'undo.named.category': 'category “{title}”',
  'undo.named.tag': 'tag “{title}”',
  'undo.named.menu': 'menu “{title}”',
  'undo.named.menuItem': 'menu item “{title}”',
  'undo.named.module': 'module “{title}”',
  'undo.named.templatePart': 'template part “{title}”',
  'undo.named.template': 'template “{title}”',
  'undo.named.media': 'media file “{title}”',
  'undo.named.setting': 'setting “{title}”',
  'undo.named.field': 'custom field “{title}”',
  'undo.named.profile': 'author profile “{title}”',
  'undo.named.entry': 'entry “{title}”',
  'undo.named.any': '“{title}”',
  'undo.unnamed.post': 'a post',
  'undo.unnamed.page': 'a page',
  'undo.unnamed.postOrPage': 'a page or post',
  'undo.unnamed.article': 'an article',
  'undo.unnamed.category': 'a category',
  'undo.unnamed.tag': 'a tag',
  'undo.unnamed.categoryOrTag': 'a category or tag',
  'undo.unnamed.menu': 'a menu',
  'undo.unnamed.menuItem': 'a menu item',
  'undo.unnamed.module': 'a module',
  'undo.unnamed.templatePart': 'a template part',
  'undo.unnamed.template': 'a template',
  'undo.unnamed.media': 'a media file',
  'undo.unnamed.setting': 'a setting',
  'undo.unnamed.field': 'a custom field',
  'undo.unnamed.profile': 'an author profile',
  'undo.unnamed.entry': 'an entry',
  'undo.unnamed.item': 'an item',
  'undo.zone.design': 'Design',
  'undo.zone.function': 'Function',
  'undo.zone.addons': 'Add-ons',
  'undo.zone.content': 'Media & language files',
  'undo.zone.core': 'Core',
  'undo.zone.system': 'System',
  'undo.zone.other': 'Other files',
  /** Why a turn can't be undone: one sentence from the server's first reason (`reasonWords`). */
  'undo.blocked.contentAdmin':
    "The site's content was edited after it: {what} in {cms} admin by {by} at {time}.",
  'undo.blocked.contentAdminNoBy': "The site's content was edited after it: {what} in {cms} admin at {time}.",
  'undo.blocked.contentTracy':
    "The site's content was changed after it: {what}, by Tracy for {by} at {time}.",
  'undo.blocked.contentTracyNoBy': "The site's content was changed after it: {what}, by Tracy at {time}.",
  'undo.blocked.content': "The site's content was changed after this request.",
  'undo.blocked.look': "The site's Additional CSS was changed after this request.",
  'undo.blocked.files': 'Files it changed were changed again after it: {files}.',
  'undo.blocked.filesNoList': 'Files it changed were changed again after it.',
  'undo.blocked.restored': 'The site was restored to an earlier point after it, at {time}.',
  'undo.blocked.restoredNoTime': 'The site was restored to an earlier point after it.',
  'undo.blocked.notRecordedFiles':
    "Tracy has no record of the file changes it made, so it can't put them back.",
  'undo.blocked.notRecordedContent':
    "Tracy has no record of some page edits it made, so it can't put them back.",
  'undo.blocked.notRecordedLook':
    "Tracy has no record of the Additional CSS it changed, so it can't put it back.",
  'undo.blocked.later': "A later request in this chat can't be undone, so the site can't go back to here.",
  'undo.blocked.shared':
    "This request's changes are mixed with another request's, so it can't be undone on its own.",
  'undo.blocked.built':
    'This request built the site from nothing, so there is no earlier site to go back to. To start over, delete the site in My sites.',
  'undo.blocked.unsealed':
    "When this request started, Tracy couldn't record the site in time, so it can't tell this request's file changes apart from earlier ones.",
  'undo.blocked.other': "Tracy can't undo this request right now (code {code}).",
  /** "Ask Tracy to revert" from the card: the same message the Site changes row sends. */
  'undo.ask': 'Ask Tracy to revert',
  'undo.askMessage': 'Revert “{what}”: only this change.',
  'undo.askThis': 'this request',
  'undo.askSending': 'Sending to Tracy…',
  'undo.askSent': 'Sent to Tracy',
  'undo.askFailed': 'Tracy did not take the request. Try again.',
  'undo.askNoChat': 'Open a chat on this site first, then ask again.',
  /** After an undo that did not end cleanly (`outcomeKey`). Silence is never called a refusal (#802). */
  'undo.result.partial': 'Part of this request was put back. Site changes shows what is still on the site.',
  'undo.result.partialUnsure':
    'Tracy got no clear answer for part of this undo. Check Site changes before you try again.',
  'undo.result.unsure':
    'Tracy got no clear answer, so the site may be partly put back. Check Site changes before you try again.',
  'undo.result.signedOut': 'You are signed out, so nothing was undone. Reload this page to sign in again.',
  'undo.result.role': 'Your role on this site does not allow this undo.',
  'undo.result.busy':
    'Another change is running on this site, so nothing was undone. Try again when it finishes.',
  'undo.result.other': 'Nothing was undone (code {code}). Ask Tracy in the chat to look at it.',
  /**
   * The Undo button on the preview's toolbar (`undo-toolbar.mjs`, toolbar contract §1): the fork draws
   * these words as Tracy sends them, so the toolbar and the card under the chat turn say one thing.
   * The rest of its words are the card's own (`undo.*`).
   */
  'toolbar.tooltip': 'Undo your last request',
  'toolbar.tooltipRequest': 'Undo your last request: “{request}”',
  'toolbar.confirmTitle': 'Undo your last request?',
  'toolbar.blockedTitle': "Can't undo your last request",
  'toolbar.openChanges': 'Open Site changes',
  'toolbar.nothing': 'Nothing to undo in this chat yet.',
  'toolbar.checking': 'Checking what can be undone…',
  'toolbar.toastDone': 'Undone: “{request}”',
  /**
   * The same Undo when the newest change is a design system put on with the Design system button
   * (`undo-toolbar.mjs`, `newestUndoOf`): its undo puts the look before it back.
   */
  'toolbar.dsTooltip': 'Undo the design system “{name}”',
  'toolbar.dsConfirmTitle': 'Undo the design system?',
  'toolbar.dsPutsBack': 'Puts back: {name}.',
  'toolbar.dsPutsBackTemplate': 'Puts back the template’s own look.',
  'toolbar.dsScope': 'Your content stays as it is.',
  'toolbar.dsToastDone': 'Undone: design system “{name}”',
  'toolbar.dsChangedSince':
    'The site’s look changed after this design system was applied, so nothing was undone.',
  /**
   * Voice input (`VoiceInput.tsx`): the microphone beside Send and the row it opens while the person
   * speaks. The hint names who turns the voice into words before the first press (council
   * 15/10/2026). `voice.end.*` are the reasons the server ends a session (`speech/relay.js`);
   * `voice.error.*` the reasons the microphone could not open.
   */
  'voice.start': 'Dictate',
  'voice.startHint': 'Dictate: ElevenLabs turns your voice into text as you speak',
  'voice.cancel': 'Cancel dictation',
  'voice.done': 'Done',
  'voice.starting': 'Starting the microphone…',
  'voice.finishing': 'Finishing…',
  'voice.listening': 'Listening',
  'voice.language': 'Language heard: {name}',
  'voice.dismiss': 'Close',
  'voice.retry': 'Dictate again',
  'voice.error.denied':
    'Tracy cannot use your microphone. Allow it for this page in your browser, then try again.',
  'voice.error.noMicrophone': 'No microphone was found.',
  'voice.error.unsupported': 'This browser cannot record audio.',
  'voice.end.timeLimit': 'Dictation stops after {minutes} minutes. Press the microphone to go on.',
  'voice.end.silence': 'Dictation stopped: nothing was heard for {seconds} seconds.',
  'voice.end.quota': 'You have used your dictation time for today.',
  'voice.end.elsewhere': 'Dictation went on in another tab or window.',
  'voice.end.provider': 'Dictation is not available right now.',
  'voice.end.providerBusy': 'The speech service is busy. Try again in a minute.',
  'voice.end.network': 'Dictation stopped: the connection was lost.',
  'voice.end.unsettled': 'The last words may be missing.',
  // The microphone picked in the Chat/Voice menu was not there; dictation and Voice listen on the default.
  'voice.micFallback': 'Using the default microphone.',
  /**
   * Chat or Voice (`VoiceMode.tsx`, `voice-mode.mjs`): the mode menu in the chat's header, the voice
   * view with its orb, the footer in the chat box's place, and what the view says. `voiceMode.say.*` are SPOKEN: Tracy
   * reads them out loud while it works, so each is a short sentence a person says, with no mark the
   * voice would read. `voiceMode.end.*` say why the conversation paused, `voiceMode.reading.*` why a
   * reply was not read out.
   */
  'voiceMode.mode.menu': 'Chat or voice',
  'voiceMode.mode.chat': 'Chat',
  'voiceMode.mode.chatHint': 'Type your messages.',
  'voiceMode.mode.voice': 'Voice',
  'voiceMode.mode.voiceHint': 'Talk with Tracy. Tracy answers out loud.',
  'voiceMode.tip.title': 'Talk with Tracy here',
  'voiceMode.tip.body':
    'Press here to talk instead of typing. Tracy listens, does the work and answers out loud.',
  'voiceMode.start': 'Start talking',
  'voiceMode.resume': 'Talk again',
  'voiceMode.end': 'End voice conversation',
  'voiceMode.voice': 'Tracy’s voice',
  // The menu's microphone section (`voice-mic.mjs`): the system's own, then the ones the browser names.
  'voiceMode.mic': 'Microphone',
  'voiceMode.micDefault': 'System default',
  'voiceMode.state.starting': 'Starting',
  'voiceMode.state.listening': 'Listening',
  'voiceMode.state.hearing': 'Hearing you',
  'voiceMode.state.working': 'Working',
  'voiceMode.state.speaking': 'Speaking',
  'voiceMode.state.paused': 'Paused',
  'voiceMode.bar.starting': 'Starting the microphone…',
  'voiceMode.bar.listening': 'Listening. Say what to change.',
  'voiceMode.bar.working': 'Tracy is working. You can keep talking.',
  'voiceMode.bar.asking': 'Tracy has a question for you. Answer it on screen.',
  // A plan read out for an approval by voice (`voice-mode.mjs`, switch `voice-plan-approval`). The quoted
  // phrases are what the person says: each translation quotes one `voice-turn-taking.mjs` accepts.
  'voiceMode.bar.plan': 'Say “approve this plan”, or “change the plan” and what to change.',
  'voiceMode.bar.speaking': 'Tracy is answering.',
  'voiceMode.bar.sending': 'Sending',
  'voiceMode.sendNow': 'Send now',
  'voiceMode.dropWords': 'Say it again',
  'voiceMode.stopSpeaking': 'Stop speaking',
  'voiceMode.mute': 'Mute the microphone',
  'voiceMode.unmute': 'Turn the microphone back on',
  'voiceMode.end.idle': 'Paused: nothing was heard for {minutes} minutes.',
  'voiceMode.end.hidden': 'Paused while this tab was in the background.',
  'voiceMode.end.lost': 'Paused: the microphone was disconnected.',
  'voiceMode.end.quota': 'You have used your voice time for today.',
  'voiceMode.end.elsewhere': 'Voice went on in another tab or window.',
  'voiceMode.end.configChanged': 'Voice settings changed. Start Voice again.',
  'voiceMode.end.provider': 'Voice is not available right now.',
  'voiceMode.end.providerBusy': 'The speech service is busy. Try again in a minute.',
  'voiceMode.end.network': 'Paused: the connection was lost.',
  'voiceMode.end.reconnecting': 'The connection dropped. Listening again.',
  'voiceMode.end.notSent': 'Your words could not be sent to Tracy. Say them again.',
  'voiceMode.reading.quota': 'Tracy cannot read replies out loud any more today. They are in the chat.',
  'voiceMode.reading.failed': 'Tracy could not read the reply out loud. It is in the chat.',
  'voiceMode.say.start': 'Okay, on it.',
  'voiceMode.say.start2': 'Sure, starting now.',
  'voiceMode.say.steered': 'Got it. I will work that in now.',
  'voiceMode.say.steered2': 'Noted, I am changing course now.',
  'voiceMode.say.look': 'Looking at your site.',
  'voiceMode.say.words': 'Changing the words.',
  'voiceMode.say.design': 'Changing the look.',
  'voiceMode.say.pictures': 'Working on the pictures.',
  'voiceMode.say.files': 'Making the changes.',
  'voiceMode.say.undo': 'Putting it back as it was.',
  'voiceMode.say.site': 'Working on your site.',
  'voiceMode.say.other': 'Still working on it.',
  'voiceMode.say.other2': 'This one takes a little longer.',
  'voiceMode.say.asking': 'I have a question for you on screen.',
  'voiceMode.say.planReview': 'I have a plan for you to review on screen.',
  // Said after a confirmation card asked again: the words answered neither choice (council 20/10/2026).
  'voiceMode.say.yesOrNo': 'Please say yes or no.',
  // The answer to a confirmation card dropped again after it was asked once more (Tracy's own voice
  // may have been heard): said once, then the card is answered on screen.
  'voiceMode.say.answerOnScreen': 'I could not hear your answer clearly. Please answer on screen.',
  // The plan read for an approval by voice: its title (then its scope, in the plan's own words), how to
  // answer, and what Tracy says once the answer went (council 19/10/2026, A6).
  'voiceMode.say.planRead': 'Here is the plan: {title}.',
  'voiceMode.say.planAsk':
    'To go ahead, say “approve this plan”. To change it, say “change the plan” and what to change.',
  'voiceMode.say.planApproved': 'Plan approved. I am starting on it now.',
  'voiceMode.say.planFeedback': 'Got it. I will change the plan.',
  // "Change the plan" said with nothing to change: the plan keeps waiting (council 20/10/2026, D4).
  'voiceMode.say.planWhat': 'What should I change in the plan?',
  'voiceMode.say.planChanged': 'The plan has changed. Here it is again.',
  'voiceMode.say.rest': 'The rest is in the chat.',
  'voiceMode.say.failed': 'Something went wrong, so I stopped. The details are in the chat.',
  'voiceMode.say.stopped': 'Stopped. Anything already saved stays.',
  // Said once when the person ends Voice by voice ("turn off voice mode", "goodbye"), then the chat shows.
  'voiceMode.say.bye': 'Okay, back to the chat.',
  'voiceMode.stopWork': 'Stop the work',
  'voiceMode.end.notStopped': 'Tracy could not be stopped. Try again.'
} as const

export type StringKey = keyof typeof en
export type Translate = (key: StringKey, params?: Record<string, string | number>) => string

/** Read a string through the injected translator, or fall back to English when dsh hands none. */
export function fallback(
  t: Translate | undefined,
  key: StringKey,
  params?: Record<string, string | number>
): string {
  if (t) return t(key, params)
  return en[key].replace(/\{(\w+)\}/g, (whole, name: string) => String(params?.[name] ?? whole))
}
