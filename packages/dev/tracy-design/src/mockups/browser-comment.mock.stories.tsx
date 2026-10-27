/**
 * These stories are the ONLY source of truth for the Browser comment UI. Anything not drawn here is removed. Git
 * history holds the old ones.
 *
 * Mockups/Browser comment: Edit mode in Tracy's Browser tab and the comments people leave on a site. Mode A drawing
 * (Tailwind in Storybook); the product is mode B plain CSS in better-sidebar (`vendor/tracy/dsh-better-sidebar`,
 * `CommentLayer.tsx`, `BrowserView.tsx`) and tracy-chat-input (`CommentsView.tsx`). The tab strip and address bar use
 * better-sidebar's own stylesheet; the customer page is a stand-in for the Northgate site. Cleaned 29/09: every
 * story that drew a status word ("Updated", "Tracy asked"), a numbered pin, a Tracy line on a comment, "Answer in
 * chat", the strip under the address bar or a not-chosen toolbar was deleted, with its helpers and screenshots.
 *
 * BUTTON NAMES (01/10/2026, option D1; TCH `tasks/todo-comment-people.md` rule 10): the people action is
 * "Note for team", the agent action "Ask Tracy to edit" (new-place popover, thread card, the "Add a comment…" box, a
 * reopened comment), the bulk one "Ask Tracy to edit all (N)" ("Ask Tracy (N)" in a narrow head). The owner had approved
 * "Add comment", "Send to Tracy" and "Send all (N) to Tracy"; the stories below use the new names. "Reply", the keys
 * and which button is primary are unchanged.
 *
 * STANDS FROM EARLIER APPROVALS (27/09 and 29/09):
 *   - Mode bar (27/09): at the address bar's right end, the zoom value (50 · 75 · 100 · 125 · 150 · 200 %,
 *     default 100 %) and Interactive | Edit. The mode is a property of the TAB and persists; `?mode=edit` /
 *     `?mode=interactive` on the site URL sets it, and the tab strips the param before loading the frame (the tab's
 *     copy link puts it back). Zoom applies to the frame, per tab; the outline must sit on the element at every zoom.
 *     Below a 360 px frame the zoom chip is hidden. Stories Interactive · Edit · Picked · Zoomed75.
 *   - Picking: a dashed outline follows the pointer in Edit; a click draws the solid outline and opens the popover.
 *     A new pick has NO pin, only the outline (Claude Design `cd0.png`). Provenance never shows on screen; it goes to
 *     Tracy with the message.
 *   - Toolbar (option B2, approved 29/09): the copy-link button in Go's slot beside the address, Go removed (Refresh
 *     reloads, Enter in the address still navigates); after a click its own tooltip reads "Link copied" for about
 *     1.5 s. Story ToolbarCopyLinkCopied.
 *
 * ROUND 5 (30/09, acceptance e2e v3, decided by the agent overnight; TCH `tasks/todo-comment-people.md` rule
 * 20, fork side): a failed save never loses words (PopoverSaveFailedKeepsWords); a count near the server's limit and disabled
 * buttons past it (PopoverCountOverLimit); a long card scrolls its messages, reply box pinned (ThreadCardLongScrolls); a
 * deleted first message under replies stays a thread, and two people of one name are told apart
 * (ThreadCardTombstoneAndTwins); pins on one element fan out (StackedPinsFanOut).
 *
 * UI FINE-TUNE (30/09 morning; TCH `tasks/todo-comment-people.md` §"UI fine-tune 30/09", acceptance U1–U40 in
 * `tasks/evidence/comment-people/test-plan-ui-finetune.md`). These rules replace the older ones below where they differ:
 *   A. A Comments tab row has ONE avatar, on its name line; the element chip has none (icon + quote only).
 *   B. The meta line is always `<name> · <time> · <path>` (never the site's name); the page the Browser tab shows reads
 *      `Current page`. It never wraps and nothing is added or removed, so a row keeps its height when the page shown
 *      changes (the path gives way first, then the name, never the time).
 *   C. The sub-filter `Current page (n) | All pages (n)` sits at the top of the tab, ABOVE the Delete all / Send all
 *      row; n = open comments. Default `Current page`, remembered per person on that browser. `Delete all` (short label,
 *      no scope, no count) and `Ask Tracy to edit all (N)` act on what the filter shows (All pages = the whole site; the 10 s
 *      Undo stays). On All pages the page shown's rows read `Current page` with a stronger background and a bar at the
 *      left; order stays by last activity. "Comments N" and the tab's count = open comments of the page shown. A page
 *      with none: `No open comments on this page`, with shortcuts to its resolved ones and `N on other pages`.
 *   D. Resolved is hidden by default: a small line at the end of Open, `Show N resolved comments` ↔ `Hide resolved
 *      comments`, following the filter, not remembered across reloads. Delete all never deletes a hidden resolved
 *      comment. A Resolve while hidden folds the row into `Resolved. Undo` in its place for about 5 s.
 *   Stories CommentsTabFilterCurrentPage · CommentsTabFilterAllPages · CommentsTabResolvedShown ·
 *   CommentsTabResolvedUndo · CommentsTabPageEmpty.
 *
 * UI FINE-TUNE ROUND 2 (30/09 noon; §"UI fine-tune 30/09 — round 2" items 5–7, U41–U48). These replace the rules
 * above and below where they differ:
 *   E. `Show N resolved comments` / `Hide resolved comments` below the rows is centred in the tab (U41).
 *   F. (ROUND 3, 30/09 evening; replaces the round-2 notice line and its bar) On Delete all NOTHING in the head
 *      row (OPEN · Delete all · Send all, 36 px) moves or changes size: `OPEN` reads `5 DELETED` in the same label
 *      style and slot (and `RESOLVED` reads `N DELETED` when the Resolved group shown is part of it); the Delete all
 *      button itself reads `Undo (10)` counting down to 0 — same style, colour, size and place, the undo icon for the
 *      trash; `Ask Tracy to edit all (N)` stays, dimmed and not clickable. No bar. The rows stay where they were, dimmed
 *      and not clickable, for the 10 s; the page's pins and every count drop at once; at 0 the clear is sent and the
 *      empty state shows; Undo brings label, button, Send all, rows and pins back. The label never wraps: in a narrow
 *      column it ellipsizes and is the first thing to hide. Every Undo window of this kind is 10 s, ⋮ Delete's too.
 *   G. Every number counts THREADS: the filter's two numbers, the tab's count, "Comments N", `Ask Tracy to edit all (N)`
 *      (the filter's own number; replies still go with their thread) and the checklist foot `4 of 5 comments`. The
 *      thread card's Send reads `Ask Tracy to edit`, no number. This reverses rule 12b's "count messages".
 *   H. On All pages, consecutive Current page rows read as ONE band: the left bar and the background run unbroken, a
 *      hairline between rows keeps each comment apart; a lone row is unchanged; no row moves (U6, U7). In a narrow column
 *      `OPEN` gives way first, then `Ask Tracy to edit all (N)` reads `Ask Tracy (N)`: the head row never overflows (U39).
 *   Stories CommentsTabDeleteAllCountdown · CommentsTabCurrentPageBand (and the counts in every Comments tab story).
 *
 * ⏳ PENDING REVIEW (29/09 evening; after Claude Design's comments, `cd0.png` `cd1.png` `cd2.png` `images/6.png`
 * `p5_0.png` `p5_1.png`). Rules:
 *   1. ONE rule: "Ask Tracy to edit" never CREATES a comment, and existing comments always stay until someone resolves
 *      them. Only "Note for team" and Reply make comments, which are people to people. Tracy's answer lives in the chat,
 *      never on a comment.
 *   2. The popover (PopoverTwoButtonsEmpty · PopoverTwoButtonsTyped · PopoverEditPending): a header row with the title
 *      "Comment" and the ✕ at the top right; the text box, placeholder "Describe what should change…"; "Note for team"
 *      (outline, a click only, no key: keeps it on the page as a comment) and "Ask Tracy to edit ↵" (primary: gives the
 *      words to Tracy in the chat, no comment made). KEYS (29/09 22:40, every box a person types a comment in):
 *      Enter = the box's ↵ button, Shift+Enter = new line; no ⇧↵ / ⌘↵ / ⇧⌘↵ anywhere. Enter while an input method
 *      composes (Vietnamese Telex/VNI, CJK) only ends the composition; Enter in an empty box does nothing. Only the ↵
 *      button shows its key, small and muted; tooltips "Note for team", "Ask Tracy to edit (Enter)", the same on Windows
 *      and Linux. Both disabled while empty. No "+ Add another": to comment again, point at another place. A comment
 *      reopened (⋮ Edit): "Save ↵" (Enter saves; tooltip "Save (Enter)") + "Ask Tracy to edit" (a click only) and a small
 *      "Delete" link. 340 px wide; compact is not redrawn here.
 *   3. Pins: the AUTHOR's bubble, the initial in a 22 px round badge whose bottom-left corner points at the block's
 *      top-left, filled in the author's colour; no number, no status. A reply has no bubble: it lives in its parent's
 *      thread card.
 *   4. Seats (no roles): everyone with a seat reads every comment and reply, and may Reply, Ask Tracy to edit and Resolve
 *      ANY comment. Only editing and deleting a message stay with its author (the ⋮ menu: Edit and Delete on your own,
 *      Copy link on every message). There is NO Reopen: a reply reopens a resolved comment. ONE word, one look, one
 *      action for removing comments (22:45): ⋮ "Delete" on your own message and the Comments tab's "Delete all"
 *      are both red text with the same trash icon, and both are a soft delete with Undo for 10 s (UI fine-tune round
 *      2, rule 6, 30/09 — it was 6 s); nothing reaches the server until the time is up (or the page hides). The
 *      notice stands IN PLACE of what was clicked (23:05), never as a floating toast or a line elsewhere: after
 *      ⋮ Delete the message's spot in the thread card reads "Deleted · Undo (10)"; after Delete all the Open head keeps
 *      every slot and size (round 3, 30/09): "OPEN" reads "N deleted", Delete all itself reads "Undo (10)" and
 *      Send all stays, dimmed; the rows stay in place, dimmed and inert; then the head comes back. The number counts
 *      the seconds down, 10 → 1; no countdown bar (round 3). A Delete all the server refuses brings the rows back and
 *      says "Could not delete. Try again." under the head (e2e v7 INTH-1). Counts (the tab badge, "Comments N") drop
 *      at once. (The drawings below still show the ✕ icon and a grey "Delete all": not redrawn.)
 *   5. After ANY Ask Tracy to edit the left column switches to its Chat tab: the person's message with one chip per element
 *      (author's bubble + the element's quote), then Tracy's reply with its `- ✓` lines. Comments show nothing extra
 *      about a send. Stories PopoverSendToChat · ChatMessageFromPage · ThreadCardSendToChat.
 *   6. Replying happens ONLY in the thread card on the page (21:00). A click on a comment's bubble, or on its row
 *      in the Comments tab, opens its thread card at the pin (a whole-page comment's card at the page frame's top
 *      corner): people messages only, ⋮ per message (Edit opens the edit popover, PopoverEditPending); a small text
 *      "Resolve" on the first message's head row, beside its ⋮ (the Comments tab row's quick Resolve, 23:08);
 *      "Reply…", then "Reply" (a click only: a people reply, nothing to Tracy) and "Ask Tracy to edit ↵" (Enter: the typed
 *      words plus the whole thread as one chat message; the words do NOT become a reply). No ✕: Esc or a click outside
 *      closes it. While any box is open (this card, a popover), the first click outside it — on the page or a pin — only
 *      closes it; with words typed it does not close but flashes and keeps the focus (23:08). Stories
 *      ThreadCardSendToChat · CommentsTabRowOpensCard.
 *   7. Comments tab = overview and navigation (CommentsTabPeopleOnly · CommentsTabRowOpensCard · PageCommentBox ·
 *      CommentsTabPeopleOnlyEmpty): people comments only, groups Open and Resolved; a row = avatar in the author's
 *      colour, name, time, chip, text, "N replies" collapsed, a quick Resolve; a click scrolls the page to the element
 *      and opens its card. No reply box, no Reply link, no Edit, no status words, no Tracy lines. The Open head: "Delete
 *      all" (21:10, named so 22:45; 23:20: soft-DELETES EVERY comment on this page — open AND resolved, with their
 *      replies — everyone's, not a resolve; the rows hidden and the number in the notice include the Resolved group, and
 *      Undo brings them all back; tooltip "Delete every comment on this page" (was "every open comment", 22:45); for 10 s the head reads
 *      "N deleted" and "Undo (10)" in its own slots, counting down, rule 4) and "Ask Tracy to edit all (N)"
 *      (rule 9). The ONE place to type in the tab is the "Add a comment…" box at the bottom,
 *      for the whole page, with the same two buttons and keys: "Note for team" (a click: a people comment with a "Whole
 *      page" chip, in Open) and "Ask Tracy to edit ↵" (Enter: a chat message with that chip). The empty hint: "Switch the Browser tab to Edit and
 *      click anything on the page. Note for team leaves a note for your team here. Ask Tracy to edit gives it to Tracy in the
 *      chat to change."
 *   8. The toolbar (20:49; 01/10/2026, toolbar option A): after Interactive | Edit, ONE ghost button
 *      "Comments", the button always there; its count (open comments of the page shown, all authors) is a terracotta
 *      badge with white figures, drawn ONLY when above 0 — no "0" (01/10, replacing "Comments 0" at zero); a
 *      click opens the Comments tab (the chat column first when closed). No ▾ arrow and no menu. Compact: the icon with
 *      the badge on its corner. Stories ToolbarCommentsButton · ToolbarCommentsButtonZero · ToolbarCommentsButtonCompact.
 *   9. "Ask Tracy to edit all (N)", ONLY at the head of the Comments tab's Open group: N = the open
 *      comments NEVER sent to Tracy (the server tracks sends; nothing shows on a comment), so a second press offers only
 *      the new ones. A press opens a checklist of those N (avatar + name, chip, first line), all ticked; the person
 *      unticks people-only talk; "Ask Tracy to edit ↵" (Enter, no extra hotkey) sends the ticked ones as ONE chat
 *      message, "Cancel" closes. Story
 *      SendNChecklist. Kept in `SendAllToTracy` and `SendChecklist` so it is easy to change or drop.
 *  10. Progress lives on Refresh, never on the page (so a comment's bubble and Tracy's work never overlap). For the
 *      sender: just sent = the icon spins + chip "Tracy is working" for 3 s (RefreshWorking); a long task = it keeps
 *      spinning, no chip (RefreshWorkingLong); done and the page reloaded itself = icon still + chip "New version
 *      updated" for exactly 3 s (RefreshNewVersionUpdated); done but the page could not reload (typing in a popover or
 *      reply box, on another page, or the reload failed) = terracotta button + chip "New version ready" until clicked,
 *      a click reloads keeping the scroll (RefreshNewVersionReady). Everyone else with the page open: no spinner, state
 *      "New version ready" when Tracy's change lands, never an automatic reload. Compact: RefreshWorkingCompact ·
 *      RefreshNewVersionReadyCompact.
 *  11. Files (29/09 23:50; contract `tasks/evidence/comment-people/attachments-contract.md`): every box has a
 *      paperclip at its foot's left, the dsh composer's own icon, in the outline look of the page box's. It opens a
 *      file picker (many files); files can also be dropped on the box (it lights up while they are dragged over it) or
 *      pasted into its text. They show as chips under the text: a thumbnail for an image, name + size otherwise, ✕
 *      to remove; a refused file is said in the box in plain words ("team-video.mov is too large — files can be up
 *      to 21 MB"). "Note for team" / "Reply" keep the files with the comment; "Ask Tracy to edit" sends them with the chat
 *      message. The edit popover starts with the comment's kept files. The thread card shows each message's files:
 *      a thumbnail per image, name + size per other file; a click opens it in a new tab. No paperclip when the server
 *      keeps no files. A file dropped anywhere else in the Browser tab while a box is open is ignored. Stories
 *      PopoverTwoButtonsTyped · PopoverEditPending · ThreadCardSendToChat.
 *  12. ROUND 3 (tested on the local stand, 30/09; overrides 7, 9 and the page box's keys where they differ):
 *      a. "Delete all" and "Ask Tracy to edit all (N)" stay put at the head of Open whenever the tab lists a comment:
 *         they never appear, vanish or jump as rows and threads are clicked. With nothing to act on a button is
 *         disabled, never gone: "Ask Tracy to edit all (0)" with no open comment, "Delete all" with no comment on the
 *         page shown. Stories CommentsTabPeopleOnly · CommentsTabNothingOpen.
 *      b. N = every MESSAGE of the open threads (each open comment plus its replies, the whole site, sent before or
 *         not): a send carries the whole thread, so a thread with one reply counts 2 (bug 3, 30/09: it read
 *         "Send 1"). The checklist keeps one row per thread, all ticked (kept from rule 9), and its foot counts the
 *         messages the ticked rows carry, "6 of 7 messages", so all ticked reads the button's N. Tooltip "Give every
 *         open comment and reply to Tracy in the chat". Story SendNChecklist.
 *      e. A chat bubble sent from a thread card shows EVERY line of the thread, the newest reply included
 *         (bug 4: it showed the two oldest and hid the newest behind "Show all N"). Only past 12 lines does it fold,
 *         keeping the NEWEST 12 in view with "Show all N" above them. Story ThreadCardSendToChat.
 *      f. The words typed in a thread card are printed for Tracy under the SENDER's name (the signed-in seat), never
 *         the comment author's; two people with one name get the start of their e-mail after it.
 *      c. A send of several comments is one chip per comment; comments pinned on the SAME element are ONE chip that
 *         carries all of them as a thread, oldest first, each with its author (and time), its replies under it.
 *         Story ChatMessageSendAllGrouped.
 *      d. The page box ("Add a comment…") grows with its words up to about eight lines, then scrolls, and shrinks
 *         back; its keys are dsh's chat composer's: Enter, Ctrl+Enter or ⌘+Enter = Ask Tracy to edit; Shift+Enter a new
 *         line; an input method's Enter and a held-down Enter never send; Enter in an empty box does nothing. "Add
 *         comment" stays a click. Story PageCommentBoxLong.
 *  13. ROUND 4 (acceptance v2, 30/09; decided by the agent overnight; overrides rule 6's "Esc closes it"):
 *      a. Words typed are never lost silently. With words in a box (a new popover; an edit popover whose words differ
 *         from what is saved or that has new files; a thread card's reply), Esc, Interactive, an address typed in the
 *         bar, Back / Forward, or a Comments-tab row leading to another page first FLASHES the box and keeps it; a
 *         second such attempt within 3 s goes ahead and drops the words. An empty box closes at once. A click outside
 *         still only flashes. A navigation the tab cannot stop (a link or Back inside the page) keeps the box and its
 *         words: by its element on the new page when it has it, else at the frame's top corner.
 *      b. Refresh with a popover open: the page comes back with the picked element's solid outline and the popover by it.
 *      c. The wheel over a popover or a thread card scrolls the page, unless the box under the pointer can still
 *         scroll that way itself (it scrolls first).
 *      d. A pick lands on content: the smallest box under the pointer that has words, an image or a control — never
 *         an empty wrapper or a CSS icon span; a transparent layer over the page is looked under.
 *  14. ROUND 5 (acceptance v3, 30/09; decided by the agent overnight; runtime 14; plan rule 21):
 *      a. The popover, the pins and the thread card stay on their element while the page scrolls by the wheel
 *         (over the page or over a box), measured frame by frame: in Edit the page scrolls in lockstep with them.
 *         Keyboard scrolling, a dragged scrollbar and the page's own animated scrolls still trail by a frame.
 *      b. A pick is named by what it is, the innermost name: its words; else the page's name for it (a button's or
 *         link's label, an image's alt, its caption, `image near "<heading above>"`, `embedded video "<title>" ·
 *         <host>`); a record's name (`Menu item "Services"`) only when the record IS the element — never the page,
 *         article or shared part it sits on (`page "Home"`, `shared "Header"`). A hashed file name reads `image`.
 *      c. Icons pick their button or link; iframes (video, map), disabled buttons and open shadow roots are
 *         pickable; an invisible slide and Tracy's own badge never are.
 *      d. What the page does not show is not drawn over: an element a nested box scrolled away, a closed tab, menu,
 *         offcanvas or accordion, an invisible slide or a removed node has no outline and no pin; its popover or
 *         thread card waits at the frame's top corner with its words, and returns with the element. An element whose
 *         corner lies under a fixed bar (WordPress's admin bar) or an open menu has no pin; the outline paints under a
 *         bar the page paints above the element, and inside an open modal dialog.
 *      e. Layout that moves without a scroll (an image loads, a slide turns, a menu closes) is followed; the page's
 *         own focus() cannot take typing out of an open box; Interactive | Edit never takes the focus from the page
 *         (a WordPress mobile menu opened in Interactive stays open to pick from in Edit); a route change inside a
 *         single-page site moves the address bar and the pins.
 *  15. ROUND 8 (acceptance v5 JS area, 30/09; decided by the agent overnight; runtime 15; plan rule 21;
 *      overrides 14d's "waits at the frame's top corner" for an element that was seen):
 *      a. A box whose element becomes hidden while it is open (a hover menu that closes as the pointer travels to
 *         the popover, an offcanvas, a WordPress mobile menu that closes when the popover takes the focus) STAYS
 *         where it last stood by the element — never jumps. The page's outline goes; the box's head names the
 *         element after its title, muted, one line: "Comment  Newsletter (hidden now)". It returns to the element
 *         when the page shows it again. The frame's top corner is only for a box opened on an element never seen in
 *         this page load (from the Comments tab on a closed menu, a new page), still with its words. The same for
 *         the edit popover and the thread card (the name on a line above its messages).
 *      b. A click the page reports where the box stands, or stood less than 700 ms ago, is a click aimed at the box,
 *         not outside it: nothing closes or flashes, the box takes the focus.
 *      c. The page cannot take the typing out of an open box by any route (focus, a kept reference to it,
 *         window.focus, select, setSelectionRange); if the frame takes the focus anyway, it goes back to the box.
 *      d. A chip keeps the element's name after a save (canvas, embedded video, icon-only button).
 *      e. Not shown, so no outline and no pin: clip-path or clip that leaves nothing, inside content-visibility
 *         hidden, a one-pixel screen-reader-only box, and an element under a clipping box's border only.
 *  16. ROUND 10 (acceptance v5 pick area, 30/09; decided by the agent overnight; runtime 16; plan rule 21):
 *      a. A click picks what is AT the pointer: a line of the element's own words holding the point, an image, a
 *         control. Empty space picks the smallest box around it (a block, a card, a section) — never html, body or
 *         a wrapper as big as the page ("Skip to content" is gone); nothing around it, nothing picked.
 *      b. A double-click in Edit is one pick: the second click never reaches the page (no link, no selected word).
 *      c. Up to 60 pins on a page (12 on an older theme); the comments the page cannot find never take a pin's slot;
 *         the rest by last activity, newest first.
 *      d. The wheel over a pin scrolls the page; over a popover, card or pin it scrolls the box the element sits in
 *         (a nested list) before the page.
 *
 * TODAY → AFTER STAGE 6 (for the coding agents: what to remove and what replaces it)
 *   Surface               | Today (product 29/09)                                  | After stage 6 (these stories)
 *   ----------------------+--------------------------------------------------------+-----------------------------------------------
 *   New-place popover     | textarea, ✕ bottom left, "+ Add another" (⌘⇧↵), ⌘↵     | header "Comment" + ✕ top right; "Note for team"
 *                         | hint, "Send (N) to Tracy"; placeholder "What should     | (click) + "Ask Tracy to edit ↵" (Enter); "Describe
 *                         | change here?"                                          | what should change…" (Picked, PopoverTwo…)
 *   Edit popover          | ✕ · Remove · ⌘↵ · Save                                 | from the card's ⋮ Edit: "Save ↵" (Enter), "Ask
 *                         |                                                        | Tracy to edit" (click), small "Delete" (PopoverEditPending)
 *   Pin click             | opens the edit popover (pending) or nothing            | opens the thread card at the pin
 *   Pins                  | numbered discs by server n, coloured by status         | author's bubble, filled, no number, no status;
 *                         | (grey, terracotta, green, amber, red)                  | a new pick has no pin, only the outline
 *   Comments tab          | Pending / Sent groups, status words (Updated, Tracy     | Open / Resolved, people comments only, rows are
 *                         | asked…), Tracy's question + "Answer in chat", Reply    | overview + navigation (click = open the card),
 *                         | and Edit links, Reopen, ticks + selection bar,         | "N replies", quick Resolve, "Delete all" (soft
 *                         | "Resolve all updated", head "Send N to Tracy"          | delete, Undo 10 s) + "Ask Tracy to edit all (N)"
 *                         |                                                        | (checklist, never-sent only)
 *   Reply box             | in the Comments tab, "Send" + "Cancel"; Send makes a   | only in the thread card: "Reply" (click, people
 *                         | reply that goes to Tracy                               | reply) + "Ask Tracy to edit ↵" (Enter, to the chat)
 *   Page comment box      | "Add a comment…" + Send, straight to Tracy             | same box, "Note for team" (click, Whole page chip)
 *                         |                                                        | + "Ask Tracy to edit ↵" (Enter) (PageCommentBox)
 *   Keys in these boxes   | ⇧↵ people action, ⌘↵ / Ctrl+↵ Send to Tracy, Enter    | Enter = the ↵ button (Ask Tracy to edit; Save in
 *                         | a new line (29/09 evening)                             | the edit popover), Shift+Enter a new line,
 *                         |                                                        | none during IME composition (22:40)
 *   Removing comments     | ⋮ Delete at once (✕ icon); "Clear all" + "Cleared N    | ⋮ "Delete" and "Delete all": red, trash icon,
 *                         | comments · Undo" at the list's end                     | Undo 10 s IN PLACE: "Deleted · Undo" in the
 *                         |                                                        | message's spot / the Open head reads "N
 *                         |                                                        | deleted" · "Undo (10)", counting down, no
 *                         |                                                        | bar; Delete all takes resolved ones too; the
 *                         |                                                        | badge drops at once
 *   Toolbar button        | Comments split: count = own not sent + asked,          | ONE button "Comments N", N = every open comment
 *                         | terracotta when above 0; ▾ menu Send N / Open          | on the site, grey; no ▾, no menu
 *   Sending               | Send stores comments as sent, statuses via             | Send never creates or removes a comment; it is
 *                         | `tracy:comment-status`, pins change colour             | a chat message with element chips; the left
 *                         |                                                        | column switches to Chat
 *   Progress / refresh    | pin colours per status; the other seat soft-reloads    | on Refresh only: spin + "Tracy is working",
 *                         | on its own                                             | "New version updated", "New version ready";
 *                         |                                                        | nothing on the page, no automatic reload
 */
import {
  Button,
  Checkbox,
  cn,
  NativeSelect,
  NativeSelectOption,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  AlignLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  Hash,
  Image as ImageIcon,
  Link2,
  Loader2,
  Menu,
  MessageSquare,
  MoreVertical,
  MousePointer2,
  MousePointerClick,
  Newspaper,
  Paperclip,
  Pencil,
  Plus,
  RotateCw,
  RotateCcw,
  Trash2,
  Type,
  X
} from 'lucide-react'
import { createContext, Fragment, useContext } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'

import css from '../../../../../vendor/tracy/dsh-better-sidebar/src/client/sidebar.module.css'

const meta: Meta = {
  title: 'Mockups/Browser comment',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

/** The aliases better-sidebar's stylesheet reads, mapped onto the bench's tokens. */
const ALIASES = {
  '--dsw-alias-bg-base': 'var(--background)',
  '--dsw-alias-bg-layer-1': 'var(--card)',
  '--dsw-alias-border-l1': 'var(--border)',
  '--dsw-alias-border-l2': 'var(--border)',
  '--dsw-alias-label-primary': 'var(--foreground)',
  '--dsw-alias-label-secondary': 'var(--muted-foreground)',
  '--dsw-alias-label-tertiary': 'var(--muted-foreground)',
  '--dsw-alias-interactive-bg-active': 'var(--muted)',
  '--dsw-alias-interactive-bg-hover': 'var(--accent)',
  '--dsw-alias-brand-primary': 'var(--primary)',
  '--dsw-font-xxs-12': '400 12px/16px ui-sans-serif, system-ui, sans-serif',
  '--dsw-font-xxxs-11': '400 11px/14px ui-sans-serif, system-ui, sans-serif',
  '--dsw-font-xxxs-strong-11': '600 11px/14px ui-sans-serif, system-ui, sans-serif'
} as Record<string, string>

// ── What the person pointed at ───────────────────────────────────────────────────────────────

/** Which element on the stand-in page is outlined. */
type Target = 'menu-item' | 'stat' | 'heading' | 'image' | 'lead'

interface Pick {
  target: Target
  /**
   * The chip above the chat turn, in plain words only — never an HTML tag. The record's own label
   * when the system is sure, otherwise a quoted excerpt of the element's text.
   */
  chip: string
  request: string
}

// Sure: the value index and the render stamp agree on menu item #104.
const MENU_ITEM: Pick = {
  target: 'menu-item',
  chip: 'Menu item "Services"',
  request: 'Make only this menu item orange (#c8643b).'
}

// Unsure: the figure is typed into a block, no record label to show — the chip quotes the text.
const STAT: Pick = {
  target: 'stat',
  chip: '"13 subsidiaries"',
  request: 'We have 14 subsidiaries now.'
}

/** What the picker shows on the page. `off` = Interactive; every other value is Edit mode. */
type Mode = 'off' | 'hover' | 'selected' | 'sent'

/** Zoom values the address bar offers, in percent. */
const ZOOMS = [50, 75, 100, 125, 150, 200] as const
type Zoom = (typeof ZOOMS)[number]

// ── Pieces ───────────────────────────────────────────────────────────────────────────────────

/** Type that the customer page's own CSS must not restyle. */
const UI_FONT: CSSProperties = {
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  letterSpacing: 'normal',
  textTransform: 'none',
  fontWeight: 400
}

// ── PROPOSAL: compact mode ───────────────────────────────────────────────────────────────────

/**
 * The Browser tab FRAME's clientWidth when it is below `COMPACT_BELOW`; `null` = wide, i.e. every
 * approved story. Only the proposal's components read it, so the wide stories never change.
 */
const Compact = createContext<number | null>(null)

/**
 * Which toolbar the address bar draws. `null` = the drawing approved 27/09 (Go, no copy button), so every older story
 * stays as approved. `b` = copy in Go's slot, Go gone, the Comments button after Edit (rule 8).
 */
interface ToolbarDraw {
  option: 'b'
  /** The Comments button's count; the button is always shown, its badge only above 0 (01/10/2026). */
  comments?: number
  /** The copy button's tooltip open, reading "Link copied" (the 1.5 s after a click). */
  copied?: boolean
  /**
   * 29/09 (after 21:40): ALL progress of a turn sent from the page shows on Refresh, never on the page.
   * `working` = icon spins + chip "Tracy is working" (first 3 s) · `working-long` = icon spins, no chip ·
   * `updated` = the page reloaded itself: still icon + chip "New version updated" (exactly 3 s) · `ready` = could not reload, or
   * another person's view: terracotta button + chip "New version ready" until clicked.
   */
  refresh?: 'working' | 'working-long' | 'updated' | 'ready'
}
const Toolbar = createContext<ToolbarDraw | null>(null)

/** The toolbar every story draws unless it says otherwise: copy in Go's slot, "Comments" with no count. */
const DEFAULT_TOOLBAR: ToolbarDraw = { option: 'b', comments: 0 }

/** Measured on the frame, not the window: under 600 px the wide popover would cover over 64 % of it. */
const COMPACT_BELOW = 600

/** Side padding of the stand-in page at phone-like widths. */
const PAGE_PAD = 16

// ── The two-button popover (rule 2) ──────────────────────────────────────────────────────────

/**
 * What the popover draws. `edit` = a comment reopened (Save · Ask Tracy to edit · Delete) instead of a new pick (Add
 * comment · Ask Tracy to edit). `tip` = which button is drawn hovered, its tooltip open.
 */
interface TwoPopover {
  edit?: boolean
  tip?: 'add' | 'send'
  /** Files in the box, drawn as chips under the text (rule 11). */
  files?: StoryFile[]
  /** A file the box refused, said in plain words under the chips. */
  refused?: string
  /** Round 5 (TH-2): the count near the limit, e.g. "3700 of 4000 characters"; `over` draws it red and disables both buttons. */
  count?: { text: string; over?: boolean }
  /** Round 5 (TH-2): a failed save put this box back; the plain words why, under the text. */
  error?: string
}

/** A file on a box or a message: a coloured square stands in for an image's thumbnail. */
interface StoryFile {
  name: string
  size: string
  /** The thumbnail's fill for an image; absent = any other file (name + size). */
  image?: string
}

/**
 * Files as chips (rule 11): a 40 px thumbnail for an image, name + size otherwise. In a box each has a ✕; on a
 * message in the thread card they are links that open the file in a new tab.
 */
function FileChips({ files, removable }: { files: StoryFile[]; removable: boolean }) {
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {files.map((f) => (
        <span
          key={f.name}
          className={cn(
            'relative inline-flex h-10 items-center overflow-hidden rounded-md border border-border bg-card',
            f.image ? 'w-10' : cn('pl-2', removable ? 'pr-6' : 'pr-2')
          )}
          title={`${f.name} · ${f.size}`}
        >
          {f.image ? (
            <span className={cn('size-full', f.image)} />
          ) : (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="max-w-40 truncate text-[12px]">{f.name}</span>
              <span className="text-[11px] text-muted-foreground">{f.size}</span>
            </span>
          )}
          {removable && (
            <span
              className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-background/85 text-muted-foreground"
              aria-label={`Remove ${f.name}`}
            >
              <X size={10} />
            </span>
          )}
        </span>
      ))}
    </span>
  )
}

/** The paperclip at a box's foot's left (rule 11): the page box's outline icon button. */
function AttachButton() {
  return (
    <Button
      size="icon"
      variant="outline"
      className="size-7 shrink-0 text-muted-foreground"
      aria-label="Attach files"
    >
      <Paperclip size={13} />
    </Button>
  )
}

/**
 * The key hint after a button's label, small and muted (29/09 evening). Since 22:40 only the button Enter
 * presses shows one, "↵", the same on every system; the checklist's Send too (Enter, no extra hotkey).
 */
function KeyHint({ keys }: { keys: string }) {
  return <span className="ml-1.5 font-normal text-[11px] opacity-60">{keys}</span>
}

/** A button with its tooltip drawn open (hover), or the bare button. */
function Tipped({ tip, open, children }: { tip: string; open: boolean; children: ReactElement }) {
  if (!open) return children
  return (
    <Tooltip open>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom">{tip}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The comment popover (Claude Design `cd0.png` / `cd1.png`, rule 2): header "Comment" + ✕ at the top right; the text
 * box; "Note for team" (a click: keeps it on the page as a comment) and "Ask Tracy to edit ↵" (Enter: gives the words to
 * Tracy in the chat; no comment is made), only the ↵ button with its key, small and muted; both disabled while empty.
 * A comment reopened: "Save ↵" (Enter) instead of "Note for team", "Ask Tracy to edit" a click, and a small "Delete" at the
 * foot's left.
 */
function PopoverTwo({
  note,
  align,
  above,
  edit = false,
  tip,
  files = [],
  refused,
  count,
  error
}: TwoPopover & { note: string; align: 'left' | 'right'; above: boolean }) {
  const empty = note.trim() === '' || count?.over === true
  // 29/09 21:30: sending hands the work over, it does not only ask. Rule j: only the words typed here go.
  // 29/09 22:40: Enter presses Ask Tracy to edit in a new pick and Save in a reopened one; the other is a click.
  const sendTip = edit ? 'Ask Tracy to edit' : 'Ask Tracy to edit (Enter)'
  const firstTip = edit ? 'Save (Enter)' : 'Note for team'
  return (
    <div
      className={cn(
        'absolute z-30 w-[340px] rounded-lg border border-border bg-popover px-3 pt-2 pb-3 text-left text-popover-foreground shadow-lg',
        above ? 'bottom-[calc(100%+12px)]' : 'top-[calc(100%+12px)]',
        align === 'right' ? '-right-1.5' : '-left-1.5'
      )}
      style={UI_FONT}
      data-popover="two"
      role="dialog"
      aria-label="Comment"
    >
      <div className="flex h-8 items-center justify-between">
        <span className="font-medium text-muted-foreground text-sm">Comment</span>
        <Button
          size="icon"
          variant="ghost"
          className="-mr-1.5 size-7 text-muted-foreground"
          aria-label="Close"
          title="Close (Esc)"
        >
          <X size={14} />
        </Button>
      </div>
      <Textarea
        autoFocus
        placeholder="Describe what should change…"
        defaultValue={note}
        rows={3}
        className={cn('mt-1 text-sm', !empty && 'border-primary/60')}
      />
      {count && (
        <span
          className={cn(
            'mt-1 block text-right text-[11px] tabular-nums',
            count.over ? 'font-semibold text-amber-600' : 'text-muted-foreground'
          )}
        >
          {count.text}
        </span>
      )}
      {files.length > 0 && <FileChips files={files} removable />}
      {refused && <span className="mt-1.5 block text-[11px] text-amber-600">{refused}</span>}
      {error && <span className="mt-1.5 block text-[11px] text-amber-600">{error}</span>}
      <div className="mt-3 flex items-center gap-1.5">
        <AttachButton />
        {edit && (
          <Button variant="link" size="sm" className="h-7 px-0 text-destructive text-xs">
            Delete
          </Button>
        )}
        <span className="ml-auto flex items-center gap-2">
          <Tipped tip={firstTip} open={tip === 'add'}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-[13px]"
              disabled={empty}
              title={tip ? undefined : firstTip}
            >
              {edit ? 'Save' : 'Note for team'}
              {edit && <KeyHint keys="↵" />}
            </Button>
          </Tipped>
          <Tipped tip={sendTip} open={tip === 'send'}>
            <Button
              size="sm"
              className="h-8 px-3 text-[13px]"
              disabled={empty}
              title={tip ? undefined : sendTip}
            >
              Ask Tracy to edit
              {!edit && <KeyHint keys="↵" />}
            </Button>
          </Tipped>
        </span>
      </div>
    </div>
  )
}

// ── Authors, pins, menus (rules 3 and 4) ─────────────────────────────────────────────────────

/** Who wrote a comment. The colour is the AUTHOR's; it is kept off terracotta, the primary action colour. */
interface Author {
  name: string
  initial: string
  /** The bubble's and the avatar's fill. */
  fill: string
}

const LEE: Author = { name: 'Lee', initial: 'L', fill: 'bg-sky-600' }
const MAI: Author = {
  name: 'Mai',
  initial: 'M',
  fill: 'bg-violet-600'
}

/**
 * The pin as the author's bubble (Claude Design, `cd2.png`): a 22 px round badge with its bottom-left corner
 * pointed at the block's top-left corner, the author's initial inside. A new pick or a comment being written or
 * reopened: OUTLINED in the author's colour on the page background. A people comment (21:00): FILLED, no status mark
 * (Tracy's work is in the chat, not on the pin). No number anywhere.
 */
function AvatarPin({ author, dim = false, fan = 0 }: { author: Author; dim?: boolean; fan?: number }) {
  return (
    <span
      className={cn(
        'absolute -top-8 -left-2 z-20 flex size-[22px] items-center justify-center rounded-full rounded-bl-none font-semibold text-[11px] text-white shadow-sm ring-2 ring-background',
        author.fill,
        dim && 'opacity-40'
      )}
      // Round 5 (SEND-new-1): a further pin on the same element moves 14 px right per pin, oldest leftmost.
      style={fan === 0 ? UI_FONT : { ...UI_FONT, marginLeft: fan * 14 }}
      aria-label={`${author.name}'s comment`}
    >
      {author.initial}
    </span>
  )
}

function ThreadMenu({ own }: { own: boolean }) {
  return (
    <span
      role="menu"
      className="absolute top-6 right-0 z-40 flex w-[132px] flex-col rounded-md border border-border bg-popover p-1 text-popover-foreground text-xs shadow-lg"
    >
      {own && (
        <>
          <span role="menuitem" className="flex items-center gap-2 rounded-sm bg-accent px-2 py-1.5">
            <Pencil size={12} className="text-muted-foreground" />
            Edit
          </span>
          <span role="menuitem" className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-destructive">
            <X size={12} />
            Delete
          </span>
        </>
      )}
      <span role="menuitem" className="flex items-center gap-2 rounded-sm px-2 py-1.5">
        <Link2 size={12} className="text-muted-foreground" />
        Copy link
      </span>
    </span>
  )
}

/** The chat's echo of an avatar pin: the author's initial in the same bubble, small. */
function AuthorDot({ author }: { author: Author }) {
  return (
    <span
      className={cn(
        'relative flex size-4 shrink-0 items-center justify-center rounded-full rounded-bl-none font-semibold text-[9px] text-white',
        author.fill
      )}
    >
      {author.initial}
    </span>
  )
}

/** Dashed outline while pointing; solid outline + the two-button popover once picked; no pin on a new pick. */
function Outline({
  mode,
  block = false,
  align = 'left',
  above = false,
  popover = true,
  children
}: {
  mode: Mode
  block?: boolean
  align?: 'left' | 'right'
  above?: boolean
  /** The popover belongs to the parent page, not the frame, so a zoomed frame is drawn without it. */
  popover?: boolean
  children: ReactNode
}) {
  return (
    <span className={cn('relative', block ? 'block' : 'inline-block')}>
      {children}
      {mode !== 'sent' && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -inset-1.5 z-10 rounded-sm border-2 border-primary',
            mode === 'hover' ? 'border-dashed' : 'bg-primary/10'
          )}
        />
      )}
      {/* A new pick has no pin: only the outline and the popover (Claude Design `cd0.png`). */}
      {mode === 'selected' && popover && <PopoverTwo note="" align={align} above={above} />}
    </span>
  )
}

// ── PROPOSAL: many pins, one send ────────────────────────────────────────────────────────────

/**
 * One pin. `open` = a new pick, popover open: outline only, NO bubble · `comment` = a people comment: the author's
 * filled bubble · `editing` = a comment reopened: its bubble, the solid outline and the popover · `dim` = another
 * comment is being edited.
 */
type PinState = 'open' | 'comment' | 'editing' | 'dim'

interface MultiPin {
  n: number
  target: Target
  /** Chat chip, same rule as `Pick.chip`: the record's label when sure, else the element's own text. */
  chip: string
  note: string
  state: PinState
  above?: boolean
  /** The open popover (`PopoverTwo`): a new pick or a comment reopened. */
  two?: TwoPopover
  /** The comment's author: the pin is their bubble (`AvatarPin`), no number. */
  author: Author
}

function PinBox({
  pin,
  block = false,
  align = 'left',
  children
}: {
  pin: MultiPin
  block?: boolean
  align?: 'left' | 'right'
  children: ReactNode
}) {
  const open = pin.state === 'open' || pin.state === 'editing'
  return (
    <span className={cn('relative', block ? 'block' : 'inline-block')}>
      {children}
      {open && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1.5 z-10 rounded-sm border-2 border-primary bg-primary/10"
        />
      )}
      {pin.state !== 'open' && <AvatarPin author={pin.author} dim={pin.state === 'dim'} />}
      {open && pin.two && (
        <PopoverTwo note={pin.note} align={align} above={pin.above ?? false} {...pin.two} />
      )}
    </span>
  )
}

// ── Chat column ──────────────────────────────────────────────────────────────────────────────

function Chat({ turn, tabs }: { turn?: ReactNode; tabs?: number }) {
  const frame = useContext(Compact)
  return (
    <aside
      className={
        frame
          ? 'flex min-w-0 flex-1 flex-col border-border border-r bg-background'
          : 'flex w-[340px] shrink-0 flex-col border-border border-r bg-background'
      }
    >
      {tabs === undefined ? (
        <div className="border-border border-b px-4 py-3 font-medium text-sm">northgate-ind.ru · Joomla</div>
      ) : (
        // 21:40: after any Ask Tracy to edit the column switches to Chat, so the person sees the message and Tracy.
        <div className="flex flex-col gap-2 border-border border-b px-4 pt-3" data-chat-tabs="">
          <span className="font-medium text-sm">northgate-ind.ru · Joomla</span>
          <div className="flex gap-4 text-sm">
            <span className="-mb-px border-primary border-b-2 px-0.5 pb-2 font-medium">Chat</span>
            <span className="-mb-px flex items-center gap-1.5 border-transparent border-b-2 px-0.5 pb-2 text-muted-foreground">
              Comments
              <span className="rounded-full bg-muted px-1.5 font-semibold text-[10px] text-muted-foreground leading-4">
                {tabs}
              </span>
            </span>
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 overflow-auto p-4 text-sm">
        <p className="text-muted-foreground">
          The site is live. Tell me what to change, or switch the Browser tab to Edit and point at it.
        </p>
        {turn}
      </div>
      <div className="m-3 flex items-end gap-2 rounded-lg border border-border p-2">
        <Textarea
          className="min-h-9 flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
          placeholder="Message or run a task"
          rows={1}
        />
        <Button size="icon" className="size-8 rounded-full" aria-label="Send">
          <ArrowUp size={16} />
        </Button>
      </div>
    </aside>
  )
}

// ── Side card: tab strip + Browser tab ───────────────────────────────────────────────────────

function TabStrip() {
  const tabs: { id: string; title: string; icon: ReactNode; active?: boolean }[] = [
    { id: 'editor', title: 'Files', icon: <FolderOpen size={14} /> },
    { id: 'browser', title: 'Browser', icon: <Globe size={14} />, active: true }
  ]
  return (
    <div className={css.tabBar}>
      <div className={css.tabList}>
        {tabs.map((tab) => (
          <div key={tab.id} className={cn(css.tab, tab.active && css.tabActive)}>
            {tab.icon}
            <span className={css.tabTitle}>{tab.title}</span>
            <button type="button" className={css.tabClose} aria-label="Close">
              <X size={12} />
            </button>
          </div>
        ))}
        <button type="button" className={css.tabBarPlus} aria-label="New tab">
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

/** Right end of the address bar, like Claude Design: zoom value, then Interactive | Edit. */
function ModeBar({ edit, zoom, showTip }: { edit: boolean; zoom: Zoom; showTip: boolean }) {
  // Selected segment filled; the other stays flat.
  const segment =
    'h-7 gap-1.5 px-2 text-xs text-muted-foreground aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground aria-pressed:hover:text-background'
  const frame = useContext(Compact)
  if (frame)
    // Compact: the zoom chip and both segments as icons only; each name moves to its tooltip.
    return (
      <div className="flex shrink-0 items-center gap-1">
        <NativeSelect
          size="sm"
          value={String(zoom)}
          onChange={() => {}}
          aria-label="Zoom"
          className="text-xs"
        >
          {ZOOMS.map((z) => (
            <NativeSelectOption key={z} value={z}>
              {z}%
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[edit ? 'edit' : 'interactive']}
          aria-label="Mode"
        >
          <ToggleGroupItem
            value="interactive"
            aria-label="Interactive"
            title="Interactive"
            className={cn(segment, 'px-1.5')}
          >
            <MousePointer2 size={14} />
          </ToggleGroupItem>
          <ToggleGroupItem value="edit" aria-label="Edit" title="Edit" className={cn(segment, 'px-1.5')}>
            <Pencil size={13} />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    )
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <NativeSelect size="sm" value={String(zoom)} onChange={() => {}} aria-label="Zoom" className="text-xs">
        {ZOOMS.map((z) => (
          <NativeSelectOption key={z} value={z}>
            {z}%
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[edit ? 'edit' : 'interactive']}
        aria-label="Mode"
      >
        <Tooltip open={showTip || undefined}>
          <TooltipTrigger
            render={
              <ToggleGroupItem value="interactive" aria-label="Interactive" className={segment}>
                <MousePointer2 size={14} />
              </ToggleGroupItem>
            }
          />
          <TooltipContent side="bottom">Interactive: use the site as a visitor</TooltipContent>
        </Tooltip>
        <ToggleGroupItem value="edit" aria-label="Edit" className={segment}>
          <Pencil size={13} />
          Edit
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

/**
 * APPROVED 29/09 (option B2): "Copy link to this page in this mode". After a click its OWN tooltip reads
 * "Link copied" for about 1.5 s, then goes back; no row under the bar (today: a yellow "Link copied" line for 2 s).
 */
function CopyLinkButton({ copied = false }: { copied?: boolean }) {
  const button = (
    <button
      type="button"
      className={css.iconButton}
      aria-label="Copy link to this page in this mode"
      title={copied ? undefined : 'Copy link to this page in this mode'}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
  if (!copied) return button
  return (
    <Tooltip open>
      <TooltipTrigger render={button} />
      <TooltipContent side="bottom">Link copied</TooltipContent>
    </Tooltip>
  )
}

/** What each Refresh state says under the button; `working-long` says nothing. */
const REFRESH_CHIP: Record<NonNullable<ToolbarDraw['refresh']>, string | null> = {
  working: 'Tracy is working',
  'working-long': null,
  updated: 'New version updated',
  ready: 'New version ready'
}

/**
 * Refresh as the one place a turn's progress shows (29/09, after Claude Design `images/6.png`, `p5_1.png`):
 * spinning while Tracy works (chip for the first 3 s), still with "New version updated" (exactly 3 s) once the page reloaded itself,
 * terracotta with "New version ready" (until clicked) when it could not reload or for another person's view. The chip
 * is dark, under the button, its arrow on the button's centre.
 */
function RefreshState({ state }: { state: NonNullable<ToolbarDraw['refresh']> }) {
  const chip = REFRESH_CHIP[state]
  const spin = state === 'working' || state === 'working-long'
  const ready = state === 'ready'
  return (
    <span className="relative flex shrink-0">
      <button
        type="button"
        className={css.iconButton}
        // Inline, so better-sidebar's own `.iconButton` background cannot win over the fill.
        style={
          ready
            ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: 6 }
            : undefined
        }
        aria-label={chip ? `Refresh: ${chip}` : 'Refresh: Tracy is working'}
        data-refresh={state}
      >
        <RotateCw size={14} className={spin ? 'animate-spin' : undefined} />
      </button>
      {chip && (
        <span
          className="absolute top-[calc(100%+8px)] -left-1.5 z-40 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 font-medium text-[12px] text-background shadow-md"
          style={UI_FONT}
          role="status"
        >
          <span
            aria-hidden
            className="absolute -top-1 left-[16px] size-2 -translate-x-1/2 rotate-45 bg-foreground"
          />
          {chip}
        </span>
      )}
    </span>
  )
}

/**
 * The Comments button (29/09 20:49, rule 8; 01/10/2026, toolbar option A): ONE ghost button "Comments";
 * the count of open comments is a terracotta badge drawn only above 0 (no "0"). A click opens the Comments tab (the
 * chat column opens first when closed). No ▾ menu: "Ask Tracy to edit all (N)" lives only in the Comments tab. Compact: the
 * icon with the badge on its corner; the word in the tooltip and `aria-label`.
 */
function CommentsButton({ count }: { count: number }) {
  const frame = useContext(Compact)
  return (
    <button
      type="button"
      className={cn(
        'relative flex h-8 shrink-0 items-center gap-1.5 rounded-md text-xs hover:bg-accent',
        frame ? 'w-8 justify-center' : 'px-2 font-medium'
      )}
      aria-label={`Comments, ${count}`}
      title="Comments"
    >
      <MessageSquare size={14} />
      {!frame && 'Comments'}
      {count > 0 && (
        <span
          className={cn(
            'flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 font-semibold text-[11px] text-primary-foreground leading-[18px]',
            frame && 'absolute -top-0.5 -right-1 min-w-4 px-1 text-[10px] leading-4 ring-2 ring-card'
          )}
          style={UI_FONT}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function BrowserBar({ edit, zoom, showTip }: { edit: boolean; zoom: Zoom; showTip: boolean }) {
  // PROPOSAL, compact only: Forward and Go step aside (Enter still goes) so the URL keeps some room.
  const frame = useContext(Compact)
  const toolbar = useContext(Toolbar)
  return (
    <div className={css.browserBar}>
      <button type="button" className={css.iconButton} aria-label="Back" disabled>
        <ChevronLeft size={14} />
      </button>
      {!frame && (
        <button type="button" className={css.iconButton} aria-label="Forward" disabled>
          <ChevronRight size={14} />
        </button>
      )}
      {toolbar?.refresh ? (
        <RefreshState state={toolbar.refresh} />
      ) : (
        <button type="button" className={css.iconButton} aria-label="Refresh">
          <RotateCw size={14} />
        </button>
      )}
      {/* The URL WITHOUT `?mode=` — the tab strips it before loading the frame. */}
      <input className={css.browserInput} value="https://northgate-ind.ru/" readOnly spellCheck={false} />
      {toolbar?.option === 'b' ? (
        // Option B: copy takes Go's slot, in every width; Go is gone (Enter in the address still navigates).
        <CopyLinkButton copied={toolbar.copied} />
      ) : (
        !frame && (
          <button type="button" className={css.iconButton} aria-label="Go">
            <Link2 size={14} />
          </button>
        )
      )}
      <button type="button" className={css.iconButton} aria-label="Open in browser">
        <ExternalLink size={14} />
      </button>
      {/* NEW: the only addition to the bar. */}
      <ModeBar edit={edit} zoom={zoom} showTip={showTip} />
      {toolbar?.option === 'b' && <CommentsButton count={toolbar.comments ?? 0} />}
    </div>
  )
}

// ── The customer page stand-in ───────────────────────────────────────────────────────────────

const NAV = ['Home', 'About', 'Services', 'Projects', 'News', 'Contact']
const STATS = [
  ['13 subsidiaries', 'across the Volga region'],
  ['4,200 people', 'engineers and field crews'],
  ['27 years', 'of industrial building']
] as const

function CustomerPage({
  mode,
  p,
  popover,
  pins
}: {
  mode: Mode
  p: Pick
  popover: boolean
  /** PROPOSAL: several pins at once; when given, `p` outlines nothing. */
  pins?: MultiPin[]
}) {
  const target = mode === 'off' || pins ? null : p.target
  const wrap = (
    t: Target,
    node: ReactNode,
    opts: { block?: boolean; align?: 'left' | 'right'; above?: boolean } = {}
  ) => {
    const pin = pins?.find((x) => x.target === t)
    if (pin)
      return (
        <PinBox pin={pin} block={opts.block} align={opts.align}>
          {node}
        </PinBox>
      )
    return target === t ? (
      <Outline mode={mode} popover={popover} {...opts}>
        {node}
      </Outline>
    ) : (
      node
    )
  }
  return (
    <div
      className={cn(
        'relative h-full overflow-hidden bg-[#f4efe6] text-[#201e1d]',
        mode === 'hover' && 'cursor-crosshair'
      )}
    >
      <div className="flex items-center justify-between bg-[#3f5a45] px-6 py-2 text-[12px] text-white/90">
        <span>Hotline: 8 800 550-67-90 · sales@northgate-ind.ru</span>
        <span className="flex items-center gap-3">
          <span>Careers</span>
          <span>Investors</span>
          <span className="rounded bg-white/10 px-2 py-0.5">My profile</span>
        </span>
      </div>
      <div className="flex items-center justify-between border-black/10 border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center bg-[#3f5a45] font-bold text-sm text-white">
            NG
          </span>
          <span className="font-bold text-base tracking-tight">NORTHGATE INDUSTRIAL</span>
        </div>
        <nav className="flex items-center gap-5 text-[14px]">
          {NAV.map((label) => (
            <span key={label}>
              {label === 'Services' ? (
                wrap('menu-item', <span>{label}</span>, { align: 'right' })
              ) : (
                <span>{label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
      <div className="px-8 py-8">
        <h1 className="max-w-2xl font-serif text-4xl leading-tight">
          {wrap('heading', 'Industrial construction, from foundation to handover', { block: true })}
        </h1>
        <p className="mt-3 max-w-xl text-[14px] text-black/70">
          {wrap('lead', 'Plants, warehouses and heavy machine foundations for manufacturers across Russia.', {
            block: true
          })}
        </p>
        <div className="mt-8 grid max-w-2xl grid-cols-3 gap-6 border-black/10 border-t pt-6">
          {STATS.map(([figure, line]) => (
            <div key={figure}>
              <p className="font-serif text-2xl">
                {figure === '13 subsidiaries' ? wrap('stat', <span>{figure}</span>) : figure}
              </p>
              <p className="mt-1 text-[12px] text-black/60">{line}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 grid max-w-3xl grid-cols-2 gap-5">
          {['news-1.png', 'news-2.png'].map((img) => {
            const tile = (
              <div className="flex h-[120px] items-center justify-center rounded bg-[#2b2f2c] text-[11px] text-white/60">
                {img}
              </div>
            )
            return (
              <Fragment key={img}>
                {img === 'news-1.png' ? wrap('image', tile, { block: true }) : tile}
              </Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * The same Northgate page as a narrow frame renders it: the site's own small-screen layout (menu
 * button, stacked blocks). Only the compact proposal stories use it.
 */
function CompactPage({ pins }: { pins: MultiPin[] }) {
  const wrap = (t: Target, node: ReactNode) => {
    const pin = pins.find((x) => x.target === t)
    return pin ? (
      <PinBox pin={pin} block>
        {node}
      </PinBox>
    ) : (
      node
    )
  }
  return (
    <div className="relative h-full overflow-hidden bg-[#f4efe6] text-[#201e1d]">
      <div
        className="flex items-center justify-between border-black/10 border-b py-3"
        style={{ paddingInline: PAGE_PAD }}
      >
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center bg-[#3f5a45] font-bold text-white text-xs">
            NG
          </span>
          <span className="font-bold text-sm tracking-tight">NORTHGATE</span>
        </div>
        <Menu size={20} />
      </div>
      <div className="py-6" style={{ paddingInline: PAGE_PAD }}>
        <h1 className="font-serif text-2xl leading-tight">
          {wrap('heading', 'Industrial construction, from foundation to handover')}
        </h1>
        <p className="mt-2 text-[13px] text-black/70">
          Plants, warehouses and heavy machine foundations for manufacturers across Russia.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3 border-black/10 border-t pt-4">
          {STATS.map(([figure]) => (
            <p key={figure} className="font-serif text-base leading-tight">
              {figure}
            </p>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3">
          {wrap(
            'image',
            <div className="flex h-[110px] items-center justify-center rounded bg-[#2b2f2c] text-[11px] text-white/60">
              news-1.png
            </div>
          )}
          <div className="flex h-[110px] items-center justify-center rounded bg-[#2b2f2c] text-[11px] text-white/60">
            news-2.png
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Where the frame sits. At 100 % the page fills it; at any other zoom the frame is drawn at that scale
 * on a neutral backdrop, and the outline and pin scale WITH the page — they must stay on the element.
 * The hint pill is the parent's, so it never scales.
 */
function Stage({
  mode,
  p,
  zoom,
  pins,
  overlay
}: {
  mode: Mode
  p: Pick
  zoom: Zoom
  pins?: MultiPin[]
  overlay?: ReactNode
}) {
  const scale = zoom / 100
  const frame = useContext(Compact)
  return (
    <div
      className={cn('relative min-h-0 flex-1 overflow-hidden', scale !== 1 && 'bg-muted')}
      data-frame={frame ? '' : undefined}
    >
      <div
        className={cn('absolute inset-0 origin-top', scale !== 1 && 'shadow-md ring-1 ring-border')}
        style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
      >
        {frame ? (
          <CompactPage pins={pins ?? []} />
        ) : (
          <CustomerPage mode={mode} p={p} popover={scale === 1} pins={pins} />
        )}
      </div>
      {overlay}
      {mode === 'hover' && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-[12px] text-background shadow-lg">
          <MousePointerClick size={13} />
          Click anything on the page to edit
          <span className="opacity-60">· Esc for Interactive</span>
        </div>
      )}
    </div>
  )
}

function Frame({
  mode,
  p,
  zoom = 100,
  showTip = false,
  pins,
  toolbar,
  turn,
  overlay,
  frame,
  column,
  chatTabs,
  height
}: {
  mode: Mode
  p: Pick
  zoom?: Zoom
  showTip?: boolean
  /** PROPOSAL: force the Browser tab frame to this width; below `COMPACT_BELOW` it draws compact. */
  frame?: number
  pins?: MultiPin[]
  /** Proposal 29/09: which toolbar to draw (`ToolbarDraw`); absent = the approved 27/09 bar. */
  toolbar?: ToolbarDraw
  turn?: ReactNode
  overlay?: ReactNode
  /** A different view in the chat column (the Comments tab) instead of the chat. */
  column?: ReactNode
  /** 21:40: the chat column drawn with its Chat | Comments tabs, Chat active; the number is the Comments badge. */
  chatTabs?: number
  /** A taller frame than the default 760 px, so a longer list fits unscrolled. */
  height?: number
}) {
  const compact = frame !== undefined && frame < COMPACT_BELOW ? frame : null
  return (
    <Compact.Provider value={compact}>
      <Toolbar.Provider value={toolbar ?? DEFAULT_TOOLBAR}>
        <TooltipProvider>
          <div className="flex h-[760px] bg-background" style={height ? { height } : undefined}>
            {column ?? <Chat turn={turn} tabs={chatTabs} />}
            <section
              className={frame ? 'flex shrink-0 flex-col p-2' : 'flex min-w-0 flex-1 flex-col p-2'}
              // The frame is the card's content box: 8 px padding and 1 px border on each side around it.
              style={{ ...(ALIASES as CSSProperties), ...(frame ? { width: frame + 18 } : {}) }}
            >
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
                <TabStrip />
                <div className={css.browser}>
                  <BrowserBar edit={mode !== 'off'} zoom={zoom} showTip={showTip} />
                  <Stage mode={mode} p={p} zoom={zoom} pins={pins} overlay={overlay} />
                </div>
              </div>
            </section>
          </div>
        </TooltipProvider>
      </Toolbar.Provider>
    </Compact.Provider>
  )
}

/**
 * Interactive selected: the site behaves as for a visitor; the tooltip names the mode. No pins in Interactive.
 */
export const Interactive: Story = { render: () => <Frame mode="off" p={MENU_ITEM} showTip /> }

/**
 * Edit selected, the pointer over a menu item: a dashed outline follows the pointer; the hint names Esc.
 */
export const Edit: Story = { render: () => <Frame mode="hover" p={MENU_ITEM} /> }

/**
 * Clicked in Edit: the solid outline and the two-button popover, empty. A new pick has no pin (rule 2).
 */
export const Picked: Story = { render: () => <Frame mode="selected" p={MENU_ITEM} /> }

/**
 * Edit at 75 %: the frame is drawn smaller and the solid outline still sits on "Services".
 */
export const Zoomed75: Story = { render: () => <Frame mode="selected" p={MENU_ITEM} zoom={75} /> }

// ── Fixture comments ─────────────────────────────────────────────────────────────────────────

// Pin 1: the heading. The chip quotes the element's CURRENT text (chip rule), not the new wording.
const HEADING_PIN: MultiPin = {
  n: 1,
  target: 'heading',
  chip: '"Industrial construction, from…"',
  note: "Change to 'Building the groundwork for Russia's industry'",
  state: 'comment',
  author: LEE
}

// Pin 2: the first image block. The fixture page has no hero image; this block stands in for it.
const IMAGE_PIN: MultiPin = {
  n: 2,
  target: 'image',
  chip: 'Image "news-1.png"',
  note: 'A construction site with modern machines',
  state: 'comment',
  author: LEE
}

/** What kind of block a comment points at: picks the chip's icon. */
type Kind = 'heading' | 'image' | 'text' | 'figure' | 'menu-item' | 'article' | 'page'

// The lead line under the heading, as a chip quotes it.
const LEAD = { chip: '"Plants, warehouses and heavy…"', note: 'Say we also build cold storage.' }

function KindIcon({ kind }: { kind: Kind }) {
  const Icon = {
    heading: Type,
    image: ImageIcon,
    text: AlignLeft,
    figure: Hash,
    'menu-item': Link2,
    article: Newspaper,
    page: Globe
  }[kind]
  return <Icon size={11} className="shrink-0 text-muted-foreground" />
}

function GroupTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'px-1 pt-2.5 pb-0.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide',
        className
      )}
    >
      {children}
    </p>
  )
}

// ── The toolbar and the popover ──────────────────────────────────────────────────────────────

/**
 * Just after a click on the copy button (in Go's slot): its own tooltip reads "Link copied" for about 1.5 s,
 * its icon a tick; then "Copy link to this page in this mode" again. No row under the bar.
 */
export const ToolbarCopyLinkCopied: Story = {
  render: () => <Frame mode="off" p={MENU_ITEM} toolbar={{ option: 'b', comments: 0, copied: true }} />
}

// ── PENDING REVIEW (29/09 evening): the two-button popover ─────────────────────────────────────────
// Drawn after Claude Design's comment popover (29/09 ~19:00). Rules in the file header.

/**
 * PENDING REVIEW. A new pick, nothing typed: "Comment" and the ✕ in the header, the text box, "Note for team" and
 * "Ask Tracy to edit ↵" both disabled. No pin, only the outline (rule 2).
 */
export const PopoverTwoButtonsEmpty: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[
        { n: 1, target: 'menu-item', chip: MENU_ITEM.chip, note: '', state: 'open', author: LEE, two: {} }
      ]}
      toolbar={{ option: 'b', comments: 0 }}
    />
  )
}

/**
 * PENDING REVIEW. Two comments of Lee's already on this page (filled bubbles), a third pick typed; "Ask Tracy to edit"
 * hovered, its tooltip "Ask Tracy to edit (Enter)": only these words go, no comment is made; Enter does the same. "Add
 * comment" (a click) would keep them as a third comment. Shift+Enter is a new line. Toolbar "Comments 2", grey. Two
 * files in the box (a photo as its thumbnail, a PDF as name + size), a third refused as too large, the paperclip at
 * the foot's left (rule 11).
 */
export const PopoverTwoButtonsTyped: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[
        { ...HEADING_PIN },
        { ...IMAGE_PIN },
        {
          n: 3,
          target: 'menu-item',
          chip: MENU_ITEM.chip,
          note: MENU_ITEM.request,
          state: 'open',
          author: LEE,
          two: {
            tip: 'send',
            files: [
              { name: 'menu-now.png', size: '240 KB', image: 'bg-lime-700' },
              { name: 'brand-colours.pdf', size: '1.3 MB' }
            ],
            refused: 'team-video.mov is too large. Files can be up to 21 MB'
          }
        }
      ]}
      toolbar={{ option: 'b', comments: 2 }}
    />
  )
}

/**
 * PENDING REVIEW. Lee chose Edit in the ⋮ menu of his own message in the heading's thread card: the same popover
 * with its words, "Save ↵" (Enter saves), "Ask Tracy to edit" (a click) and a small red "Delete"; the other bubbles are
 * dimmed meanwhile.
 * Today's product edit popover has ✕ · Remove · ⌘↵ · Save. The comment's kept photo is in the box as a chip: ✕
 * removes it on Save, the paperclip adds more (rule 11).
 */
export const PopoverEditPending: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[
        {
          ...HEADING_PIN,
          state: 'editing',
          two: { edit: true, files: [{ name: 'hero-new.png', size: '482 KB', image: 'bg-sky-600' }] }
        },
        { ...IMAGE_PIN, state: 'dim' },
        {
          n: 3,
          target: 'menu-item',
          chip: MENU_ITEM.chip,
          note: MENU_ITEM.request,
          state: 'dim',
          author: LEE
        }
      ]}
      toolbar={{ option: 'b', comments: 3 }}
    />
  )
}

/** The author's avatar in the author's colour (the same colour as their bubble on the page). */
function AuthorAvatar({ author }: { author: Author }) {
  return (
    <span
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full font-semibold text-[10px] text-white',
        author.fill
      )}
      style={UI_FONT}
    >
      {author.initial}
    </span>
  )
}

// ── PENDING REVIEW (29/09 21:00): Ask Tracy to edit goes to the chat; comments are people only ──────────
// Verified on Claude Design: a comment sent to Claude never appears in its Comments panel; it becomes a chat
// message the agent works on. Header of the file, rules 1 to 10.

/** One element quoted in a chat message: the author's bubble + the element's quote, then the words about it. */
interface ChatItem {
  author: Author
  chip: string
  kind: Kind
  text: string
  /**
   * Round 3 (rule 12c): several comments on this ONE element sent together — the chip carries them all as a
   * thread, oldest first (each comment, then its replies), instead of `text`.
   */
  thread?: { author: Author; age: string; text: string }[]
}

/** The chip of one element in a chat message: no number, no status. */
function ElementChip({ item }: { item: ChatItem }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <AuthorDot author={item.author} />
      <KindIcon kind={item.kind} />
      <span className="truncate text-foreground">{item.chip}</span>
    </span>
  )
}

/**
 * The chat turn a Ask Tracy to edit makes: the person's message, one chip per element (each with the words about it), and
 * the whole thread quoted when it came from a thread card; then Tracy's reply, still running or with its `- ✓` lines.
 */
function ChatFromPage({
  items,
  words,
  thread,
  reply
}: {
  items: ChatItem[]
  /** Words typed in a thread card's reply box, sent with the thread. */
  words?: string
  thread?: { author: Author; text: string }[]
  reply: 'working' | string[]
}) {
  return (
    <>
      <div
        className="ml-6 flex flex-col items-start gap-2 rounded-lg bg-muted px-3 py-2"
        data-chat-from-page=""
      >
        {items.map((item, i) => (
          <div key={i} className="flex w-full flex-col items-start gap-1">
            <ElementChip item={item} />
            {item.thread ? (
              <div className="flex w-full flex-col gap-0.5 border-border border-l-2 pl-2 text-[12px] text-muted-foreground">
                <span className="font-medium">Thread</span>
                {item.thread.map((m, j) => (
                  <span key={j}>
                    <span className="font-medium text-foreground">{m.author.name}</span>{' '}
                    <span className="text-[11px]">{m.age}</span>: {m.text}
                  </span>
                ))}
              </div>
            ) : (
              !words && <span>{item.text}</span>
            )}
          </div>
        ))}
        {words && <span>{words}</span>}
        {thread && (
          <div className="flex w-full flex-col gap-0.5 border-border border-l-2 pl-2 text-[12px] text-muted-foreground">
            <span className="font-medium">Thread</span>
            {thread.map((m, i) => (
              <span key={i}>
                <span className="font-medium text-foreground">{m.author.name}:</span> {m.text}
              </span>
            ))}
          </div>
        )}
      </div>
      {reply === 'working' ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 size={14} className="shrink-0 animate-spin" />
          <span>Working…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span>Done. Here is what changed:</span>
          <ul className="flex flex-col gap-1 text-[13px]">
            {reply.map((line, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <Check size={14} className="mt-[2px] shrink-0 text-success" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

interface PeopleMessage {
  author: Author
  age: string
  text: string
  menu?: boolean
  /** Files kept with the message (rule 11). */
  files?: StoryFile[]
  /** Round 5 (TH-4): a first message deleted under live replies, drawn "Comment deleted", muted. */
  tombstone?: boolean
}

/**
 * The thread card of a people comment (21:00): messages are people's only, no Tracy line. A small text "Resolve" on the
 * first message's head row, beside its ⋮ (anyone; not on a resolved comment; 23:08: the same quick Resolve as a
 * Comments tab row). Under the reply box: "Reply" (a click: a people reply, stays in the thread) and "Ask Tracy to edit ↵" (Enter: the typed words
 * plus the whole thread go to the chat as one message; the words do NOT become a reply). Both disabled while empty.
 * After a send, the comment stays as it was, and the left column switches to Chat (rule 5).
 */
function PeopleThreadCard({
  messages,
  viewer,
  reply,
  replyFiles = [],
  resolved,
  above = false,
  listHeight,
  error
}: {
  messages: PeopleMessage[]
  viewer: Author
  reply?: string
  /** Files in the reply box (rule 11). */
  replyFiles?: StoryFile[]
  resolved?: string
  above?: boolean
  /**
   * Round 5 (TH-5): the height the card leaves its message list — the list scrolls inside, opened at the newest,
   * while the reply box and its buttons stay at the card's foot.
   */
  listHeight?: number
  /** Round 5 (TH-2): a failed Reply came back into this box; the plain words why. */
  error?: string
}) {
  const empty = (reply ?? '').trim() === ''
  return (
    <span
      className={cn(
        'absolute -left-1.5 z-30 flex w-[340px] flex-col gap-2.5 rounded-lg border border-border bg-popover px-3.5 pt-3 pb-3.5 text-left text-popover-foreground shadow-lg',
        above ? 'bottom-[calc(100%+12px)]' : 'top-[calc(100%+12px)]'
      )}
      style={UI_FONT}
      role="dialog"
      aria-label="Comment thread"
      data-thread=""
    >
      <span
        className={cn('flex flex-col gap-2.5', listHeight !== undefined && '-mr-1.5 overflow-y-auto pr-1.5')}
        style={listHeight === undefined ? undefined : { maxHeight: listHeight }}
        ref={(el) => {
          if (el !== null && listHeight !== undefined) el.scrollTop = el.scrollHeight
        }}
        data-thread-list=""
      >
        {messages.map((m, i) => (
          <span key={i} className="relative flex flex-col gap-0.5">
            <span className="flex min-w-0 items-baseline gap-1.5 pr-6">
              <span className="min-w-0 truncate font-medium text-[13px]">{m.author.name}</span>
              <span className="shrink-0 whitespace-nowrap text-[12px] text-muted-foreground">{m.age}</span>
              {/* 23:08: the Comments tab row's quick Resolve, beside the first message's ⋮. */}
              {i === 0 && !resolved && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 shrink-0 self-center px-1.5 text-muted-foreground text-xs"
                >
                  Resolve
                </Button>
              )}
            </span>
            {m.tombstone ? (
              <span className="text-[13px] text-muted-foreground italic leading-snug">Comment deleted</span>
            ) : (
              <span className="text-[13px] leading-snug">{m.text}</span>
            )}
            {m.files && <FileChips files={m.files} removable={false} />}
            <button
              type="button"
              aria-label="More"
              className={cn(
                'absolute top-0 right-0 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent',
                m.menu && 'bg-accent'
              )}
            >
              <MoreVertical size={14} />
            </button>
            {m.menu && <ThreadMenu own={m.author === viewer} />}
          </span>
        ))}
        {resolved && (
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Check size={13} />
            {resolved} · a reply reopens it
          </span>
        )}
      </span>
      <Textarea
        placeholder="Reply…"
        defaultValue={reply}
        rows={1}
        className="min-h-9 border-primary/60 text-sm"
      />
      {replyFiles.length > 0 && <FileChips files={replyFiles} removable />}
      {error && <span className="block text-[11px] text-amber-600">{error}</span>}
      <span className="flex items-center gap-2">
        <AttachButton />
        <span className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 px-3 text-[13px]" disabled={empty}>
            Reply
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-[13px]"
            disabled={empty}
            title="Ask Tracy to edit (Enter)"
          >
            Ask Tracy to edit
            <KeyHint keys="↵" />
          </Button>
        </span>
      </span>
    </span>
  )
}

/** A people comment in the Comments tab (21:00): no status word, no Tracy line. */
interface PeopleRow {
  id: string
  author: Author
  age: string
  kind: Kind
  chip: string
  note: string
  replies?: { author: Author; age: string; text: string }[]
  /** UI fine-tune: the path of another page ("/news"); absent = the page the Browser tab shows. */
  page?: string
  resolvedBy?: string
  /** The row was just clicked: highlighted, and its thread card is open on the page. */
  active?: boolean
  /** Round 5 (TH-4): its root was deleted while replies stand under it — "Comment deleted", no words. */
  deleted?: boolean
  /** Round 5 (TH-6): the name the row prints, when two people share a display name ("Sam Tester (sam.b)"). */
  shownName?: string
}

/**
 * A Comments tab row (21:00; UI fine-tune 30/09): the tab is an overview and navigation, replying happens only in
 * the thread card at the pin. A row: ONE avatar, the meta line `<name> · <time> · <path | Current page>` (one line, never
 * wraps), the quick Resolve (anyone, open rows), the chip (icon + quote, no avatar), text, "N replies" collapsed. On All
 * pages a row of the page shown (`here`) has a stronger background and a bar at its left, drawn as an inset shadow so
 * nothing moves. No Reply link, no Edit, no reply box. A click on the row opens its thread card at the pin.
 */
function PeopleItem({
  row,
  here = false,
  hereAbove = false,
  hereBelow = false,
  frozen = false
}: {
  row: PeopleRow
  here?: boolean
  /** Round 2 (point 6): the row above is a Current page row too, so the band runs on unbroken. */
  hereAbove?: boolean
  hereBelow?: boolean
  /** Round 2, rule 6: Delete all's 10 s window, the row stays in place, dimmed and not clickable. */
  frozen?: boolean
}) {
  const resolved = row.resolvedBy !== undefined
  const replies = row.replies?.length ?? 0
  return (
    <div
      className={cn(
        'flex cursor-pointer flex-col gap-1 rounded-md py-2 pr-2 pl-1 hover:bg-muted/60',
        row.active && 'bg-primary/10 hover:bg-primary/10',
        here && 'bg-primary/[0.07] shadow-[inset_2px_0_0_var(--primary)] hover:bg-primary/10',
        here &&
          hereAbove &&
          'rounded-t-none shadow-[inset_2px_0_0_var(--primary),inset_0_1px_0_color-mix(in_srgb,var(--primary)_22%,transparent)]',
        here && hereBelow && 'rounded-b-none',
        resolved && 'opacity-70',
        frozen && 'pointer-events-none cursor-default opacity-45'
      )}
      data-row={row.id}
      aria-disabled={frozen || undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        <AuthorAvatar author={row.author} />
        <span className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden whitespace-nowrap">
          <span className="min-w-[2.5em] shrink truncate font-medium text-[13px]">
            {row.shownName ?? row.author.name}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">·</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{row.age}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">·</span>
          <span
            className={cn(
              'min-w-0 shrink-[1000] truncate text-[11px]',
              here ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
          >
            {row.page ?? 'Current page'}
          </span>
        </span>
        {!resolved && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 shrink-0 px-1.5 text-muted-foreground text-xs"
          >
            Resolve
          </Button>
        )}
      </div>
      <RowChip kind={row.kind} chip={row.chip} />
      {row.deleted ? (
        <span className="text-[13px] text-muted-foreground italic leading-snug">Comment deleted</span>
      ) : (
        // Round 5 (TH-10): folded to four lines; "Show more" under a longer one.
        <>
          <span className="line-clamp-4 whitespace-pre-line text-[13px] leading-snug">{row.note}</span>
          {row.note.length > 240 && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-1.5 h-6 self-start px-1.5 text-muted-foreground text-xs"
            >
              Show more
            </Button>
          )}
        </>
      )}
      {replies > 0 && (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MessageSquare size={11} />
          {replies === 1 ? '1 reply' : `${replies} replies`}
        </span>
      )}
    </div>
  )
}

/** The chip on a Comments tab row (UI fine-tune rule A): the element's icon and quote, NO avatar. */
function RowChip({ kind, chip }: { kind: Kind; chip: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <KindIcon kind={kind} />
      <span className="truncate text-foreground">{chip}</span>
    </span>
  )
}

/** U33: a comment resolved while Resolved is hidden folds into one line in its place for about 5 s. */
function ResolvedUndoLine() {
  return (
    <p className="flex items-baseline gap-1.5 px-1 py-2 text-[12px] text-muted-foreground" role="status">
      <span>Resolved.</span>
      <button type="button" className="font-medium text-foreground underline underline-offset-2">
        Undo
      </button>
    </p>
  )
}

/**
 * "Ask Tracy to edit all (N)" at the head of Open (round 3, 30/09; rule 12b; round 2 rule 7): N = the open THREADS the
 * filter shows (the filter's own number), sent before or not; their replies still go with them. Always drawn beside Delete all; "Ask Tracy to edit all (0)" and disabled with nothing open. A press opens the
 * checklist (`SendChecklist`) instead of sending at once. Kept apart with the checklist so both are easy to change.
 */
function SendAllToTracy({ count, disabled = false }: { count: number; disabled?: boolean }) {
  return (
    <Button
      size="sm"
      className="h-6 shrink-0 gap-1 px-2 text-xs"
      disabled={disabled || count === 0}
      title="Give every open comment and reply to Tracy in the chat"
    >
      <ArrowUp size={12} />
      Ask Tracy to edit all ({count})
    </Button>
  )
}

/**
 * The checklist "Ask Tracy to edit all (N)" opens (~21:50; round 3: all N open comments), under the Open head, each
 * with its author's avatar and name, its chip and the first line of its text, ALL ticked. The person unticks what is
 * only talk between people, then "Ask Tracy to edit ↵" (Enter: no extra hotkey) gives the ticked ones to Tracy as ONE
 * chat message (then the left
 * column switches to Chat); "Cancel" closes it. Send is disabled with nothing ticked.
 */
function SendChecklist({ rows, unticked }: { rows: PeopleRow[]; unticked: string[] }) {
  const ticked = rows.filter((r) => !unticked.includes(r.id)).length
  // Round 2, rule 7: rows are threads and the foot counts threads, so all ticked reads the button's N.
  return (
    <div
      className="absolute top-[118px] right-3 left-3 z-30 flex flex-col gap-1 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
      style={UI_FONT}
      role="dialog"
      aria-label="Ask Tracy to edit"
      data-checklist=""
    >
      <span className="font-medium text-sm">Ask Tracy to edit</span>
      <span className="text-[12px] text-muted-foreground">Untick what is only for your team.</span>
      <div className="mt-1 flex flex-col">
        {rows.map((r) => {
          const on = !unticked.includes(r.id)
          return (
            <label
              key={r.id}
              className={cn('flex items-start gap-2 rounded-md px-1 py-1.5', !on && 'opacity-60')}
            >
              <Checkbox checked={on} aria-label={`Send ${r.author.name}'s comment`} className="mt-0.5" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <AuthorAvatar author={r.author} />
                  <span className="font-medium text-[12px]">{r.author.name}</span>
                  <span className="min-w-0 truncate text-[11px] text-muted-foreground">{r.chip}</span>
                </span>
                <span className="truncate text-[12px]">{r.note}</span>
              </span>
            </label>
          )
        })}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {ticked} of {rows.length} comments
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 px-3 text-[13px] text-muted-foreground">
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-[13px]"
            disabled={ticked === 0}
            title="Ask Tracy to edit (Enter)"
          >
            Ask Tracy to edit
            <KeyHint keys="↵" />
          </Button>
        </span>
      </div>
    </div>
  )
}

/**
 * The "Add a comment…" box at the bottom of the Comments tab (20:55), for the whole page: "Note for team" (a click) makes a
 * people comment on the page (it shows in Open with a "Whole page" chip); "Ask Tracy to edit ↵" (Enter) gives the words to Tracy
 * as a chat message with a "Whole page" chip. Two rows: the text, then attach and the two buttons, disabled while empty.
 */
function PageCommentComposer({
  text,
  maxChars = 4000,
  failed
}: {
  text: string
  maxChars?: number
  failed?: string
}) {
  // Round 5 (TH-2): the door's limit (the list's limits.maxChars) is counted from 90 % and refused past it.
  const count = text.trim().length
  const over = count > maxChars
  const empty = text.trim() === '' || over
  return (
    <div className="m-3 flex flex-col gap-1.5 rounded-lg border border-border p-2" data-page-composer="">
      {/* Round 3 (rule 12d): grows with its words to about eight lines (160 px), then scrolls. */}
      <Textarea
        className="field-sizing-content max-h-40 min-h-9 resize-none overflow-y-auto border-0 px-1 py-1 text-sm shadow-none focus-visible:ring-0"
        placeholder="Add a comment…"
        defaultValue={text}
        rows={1}
      />
      {over && (
        <span className="text-[12px] text-destructive leading-4">
          Too long to save. Keep it to {maxChars} characters or fewer.
        </span>
      )}
      {failed && <span className="text-[12px] text-destructive leading-4">{failed}</span>}
      <span className="flex items-center gap-1.5">
        <Button
          size="icon"
          variant="outline"
          className="size-7 shrink-0 text-muted-foreground"
          aria-label="Attach files"
        >
          <Paperclip size={13} />
        </Button>
        {count >= Math.floor(maxChars * 0.9) && (
          <span
            className={cn(
              'mx-1 text-[11px] tabular-nums',
              over ? 'font-medium text-destructive' : 'text-muted-foreground'
            )}
          >
            {count} / {maxChars}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 px-2 text-xs"
          disabled={empty}
          title="Note for team"
        >
          Note for team
        </Button>
        <Button size="sm" className="h-7 px-2 text-xs" disabled={empty} title="Ask Tracy to edit (Enter)">
          Ask Tracy to edit
          <KeyHint keys="↵" />
        </Button>
      </span>
    </div>
  )
}

/**
 * The Comments tab, people comments only (21:00; UI fine-tune 30/09): the sub-filter at the top, the Open head (Delete
 * all + Send all acting on what the filter shows), the rows (newest activity first), the small resolved line at the end
 * of Open, and the Resolved group only while shown. The badge is neutral: open comments of the page shown.
 */
function PeopleCommentsTab({
  open = [],
  resolved = [],
  badge,
  sentIds = [],
  checklist,
  composer = '',
  composerMax,
  composerFailed,
  filter = 'page',
  showResolved = false,
  resolvingIds = [],
  deleting
}: {
  open?: PeopleRow[]
  resolved?: PeopleRow[]
  /** The tab's count; by default the open comments of the page shown (U16). */
  badge?: number
  /** Open comments already sent to Tracy once (invisible on the rows); since round 3 "Send all" counts them too. */
  sentIds?: string[]
  /** Kept for older stories; Delete all now acts on what is on screen. */
  onPage?: number
  /** The "Ask Tracy to edit all (N)" checklist drawn open: the ids left unticked. */
  checklist?: { unticked: string[] }
  /** Words typed in the "Add a comment…" box at the bottom. */
  composer?: string
  /** Round 5: the door's length limit, and the plain words after a failed add or send. */
  composerMax?: number
  composerFailed?: string
  /** UI fine-tune: the sub-filter's side (default Current page). */
  filter?: 'page' | 'all'
  /** UI fine-tune: the Resolved group drawn (hidden by default, never remembered). */
  showResolved?: boolean
  /** UI fine-tune (U33): rows folded into "Resolved. Undo" for their 5 s. */
  resolvingIds?: string[]
  /**
   * Rule F (round 3, 30/09): Delete all pressed, `left` seconds of the 10 s Undo window remain. In the head row
   * OPEN reads "N deleted" and Delete all reads "Undo (left)", nothing moves; the rows stay where they were, dimmed; the
   * counts already dropped.
   */
  deleting?: { left: number }
}) {
  void sentIds
  const here = (r: PeopleRow) => r.page === undefined
  const inFilter = (r: PeopleRow) => filter === 'all' || here(r)
  const shownOpen = open.filter(inFilter)
  const shownResolved = resolved.filter(inFilter)
  const counts = { page: open.filter(here).length, all: open.length }
  const elsewhere = counts.all - counts.page
  const siteEmpty = open.length + resolved.length === 0
  const visible = shownOpen.length + (showResolved ? shownResolved.length : 0)
  // Round 2, rule 7: every number counts threads; Send all reads the filter's own number.
  const sendAll = shownOpen.length
  // Rule 6: during the window what was on screen is gone from every count.
  const gone = deleting
    ? new Set([...shownOpen, ...(showResolved ? shownResolved : [])].map((r) => r.id))
    : null
  const live = (r: PeopleRow) => gone === null || !gone.has(r.id)
  const liveCounts = { page: open.filter((r) => here(r) && live(r)).length, all: open.filter(live).length }
  // ONE toggle, centred below the rows or the empty state (round 2 rule 5; 30/09 screenshot).
  const toggle =
    shownResolved.length === 0 ? null : (
      <Button
        variant="ghost"
        size="sm"
        // Round 2, rule 5 (U41): below the rows, centred in the tab.
        className="h-6 self-center px-1.5 text-muted-foreground text-xs"
        aria-expanded={showResolved}
        disabled={deleting !== undefined}
      >
        {showResolved
          ? 'Hide resolved comments'
          : shownResolved.length === 1
            ? 'Show 1 resolved comment'
            : `Show ${shownResolved.length} resolved comments`}
      </Button>
    )
  const band = (r: PeopleRow | undefined) => r !== undefined && filter === 'all' && here(r)
  const row = (r: PeopleRow, i: number, list: PeopleRow[]) =>
    resolvingIds.includes(r.id) ? (
      <ResolvedUndoLine key={r.id} />
    ) : (
      <PeopleItem
        key={r.id}
        row={r}
        here={band(r)}
        hereAbove={band(r) && band(list[i - 1])}
        hereBelow={band(r) && band(list[i + 1])}
        frozen={deleting !== undefined}
      />
    )
  return (
    <aside
      className="relative flex w-[340px] shrink-0 flex-col border-border border-r bg-background"
      data-tab="comments-people"
    >
      {checklist && shownOpen.length > 0 && <SendChecklist rows={shownOpen} unticked={checklist.unticked} />}
      <div className="flex flex-col gap-2 border-border border-b px-4 pt-3">
        <span className="font-medium text-sm">northgate-ind.ru · Joomla</span>
        <div className="flex gap-4 text-sm">
          <span className="-mb-px border-transparent border-b-2 px-0.5 pb-2 text-muted-foreground">Chat</span>
          <span className="-mb-px flex items-center gap-1.5 border-primary border-b-2 px-0.5 pb-2 font-medium">
            Comments
            <span className="rounded-full bg-muted px-1.5 font-semibold text-[10px] text-muted-foreground leading-4">
              {badge ?? liveCounts.page}
            </span>
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-auto px-3 pb-3">
        {siteEmpty ? (
          <div className="m-auto flex max-w-[260px] flex-col items-center gap-2 text-center">
            <MessageSquare size={20} className="text-muted-foreground" />
            <p className="font-medium text-sm">No comments yet</p>
            <p className="text-[13px] text-muted-foreground leading-snug">
              Switch the Browser tab to Edit and click anything on the page. Note for team leaves a note for
              your team here. Ask Tracy to edit gives it to Tracy in the chat to change.
            </p>
          </div>
        ) : (
          <>
            {/* UI fine-tune rule C: the sub-filter first, the whole row, above the head (U10, U39). */}
            <div className="mt-2 flex gap-0.5 rounded-lg bg-muted p-0.5" role="group" data-filter="">
              {(['page', 'all'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  aria-pressed={filter === side}
                  className={cn(
                    'h-6 min-w-0 flex-1 truncate rounded-md px-2 text-[12px] text-muted-foreground',
                    filter === side && 'bg-background font-medium text-foreground shadow-sm'
                  )}
                >
                  {side === 'page' ? `Current page (${liveCounts.page})` : `All pages (${liveCounts.all})`}
                </button>
              ))}
            </div>
            {/* Round 3 (rule 12a): the head and both buttons stay whenever the tab lists a comment. Rule F (round 3,
                30/09): during Delete all's window NOTHING in this row moves or changes size — OPEN reads "N
                deleted" in its slot, Delete all itself reads "Undo (N)" counting down, Send all stays, dimmed. */}
            <div
              className="flex h-9 items-center justify-between gap-2 pt-1.5"
              data-deleting={deleting ? '' : undefined}
            >
              {/* The label never wraps: it ends in "…", then is the first thing to go (the buttons never wrap). */}
              <GroupTitle className="min-w-0 truncate">
                {deleting ? `${shownOpen.length} deleted` : 'Open'}
              </GroupTitle>
              <span className="mt-1.5 flex shrink-0 items-center gap-1">
                {/* Delete all: soft-DELETES what is on screen, everyone's; short label, no scope, no count. During
                    the window the same button is Undo: the undo icon for the trash, one width whatever it reads. */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-destructive text-xs hover:text-destructive"
                  disabled={!deleting && visible === 0}
                  title={deleting ? 'Undo' : 'Delete every comment shown here'}
                >
                  {deleting ? <RotateCcw size={11} /> : <Trash2 size={11} />}
                  <span className="inline-grid tabular-nums [&>*]:[grid-area:1/1]">
                    <span>{deleting ? `Undo (${deleting.left})` : 'Delete all'}</span>
                    <span className="invisible" aria-hidden="true">
                      Delete all
                    </span>
                    <span className="invisible" aria-hidden="true">
                      Undo (10)
                    </span>
                  </span>
                </Button>
                <SendAllToTracy count={sendAll} disabled={deleting !== undefined} />
              </span>
            </div>
            {shownOpen.length === 0 ? (
              // U17: nothing open here; the way to the other pages. The resolved toggle is the SAME centred one
              // as below the rows (30/09 screenshot).
              <>
                <div className="flex flex-col items-start gap-0.5 px-1 pt-3 pb-1">
                  <p className="text-[13px] text-muted-foreground">
                    {filter === 'page' ? 'No open comments on this page' : 'No open comments'}
                  </p>
                  <span className="-ml-1.5 flex flex-wrap gap-1">
                    {filter === 'page' && elsewhere > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 px-1.5 text-muted-foreground text-xs">
                        {elsewhere} on other pages
                      </Button>
                    )}
                  </span>
                </div>
                {toggle}
              </>
            ) : (
              <>
                {shownOpen.map(row)}
                {toggle}
              </>
            )}
            {showResolved && shownResolved.length > 0 && (
              <>
                <GroupTitle>{deleting ? `${shownResolved.length} deleted` : 'Resolved'}</GroupTitle>
                {shownResolved.map(row)}
              </>
            )}
          </>
        )}
      </div>
      <PageCommentComposer text={composer} maxChars={composerMax} failed={composerFailed} />
    </aside>
  )
}

// Mai's people comment on the heading, left open on the site in every 21:00 story.
const MAI_HEADING: MultiPin = { ...HEADING_PIN, state: 'comment', author: MAI }

const LEE_MENU: ChatItem = { author: LEE, chip: MENU_ITEM.chip, kind: 'menu-item', text: MENU_ITEM.request }
const LEE_LEAD: ChatItem = {
  author: LEE,
  chip: LEAD.chip,
  kind: 'text',
  text: LEAD.note
}

/**
 * U1 — PENDING REVIEW (21:00). Lee typed in the popover on "Services" and pressed Enter, "Ask Tracy to edit ↵" (the popover of
 * PopoverTwoButtonsTyped). The popover closed and NO pin stays: a send is never stored as a comment. Nothing is drawn
 * at the element: the progress is on Refresh, spinning with its chip "Tracy is working" (rule 10). The left column
 * switches to its Chat tab (rule 5) and shows the new user message: the element chip (Lee's bubble + "Menu item "Services"") and his words; Tracy is on it.
 * Mai's people comment on the heading stays, a plain filled bubble (no status dot). Toolbar "Comments 1" in grey: the
 * open comments on this site, all authors (the count still to be confirmed).
 */
export const PopoverSendToChat: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[MAI_HEADING]}
      turn={<ChatFromPage items={[LEE_MENU]} reply="working" />}
      chatTabs={1}
      toolbar={{ option: 'b', comments: 1, refresh: 'working' }}
    />
  )
}

/**
 * U2 — PENDING REVIEW (21:00). The chat message's shape, after Lee sent his two comments with the toolbar's "Send 2 to
 * Tracy": ONE chat message with two element chips, each followed by the words about it; Tracy's reply below with its
 * `- ✓ updated: …` lines. Those two comments STAY (21:20: Ask Tracy to edit never removes a comment): their bubbles stay on
 * the page and their rows are unchanged (21:40: nothing extra on a comment). The left column shows its Chat tab, as
 * after any send. The turn ended and the page reloaded itself, so Refresh is still with its chip "New version updated"
 * for exactly 3 s (rule 10). Toolbar "Comments 3" (every open comment on this site), grey.
 */
export const ChatMessageFromPage: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[
        MAI_HEADING,
        {
          n: 2,
          target: 'menu-item',
          chip: MENU_ITEM.chip,
          note: MENU_ITEM.request,
          state: 'comment',
          author: LEE
        },
        {
          n: 3,
          target: 'lead',
          chip: LEAD.chip,
          note: LEAD.note,
          state: 'comment',
          author: LEE
        }
      ]}
      turn={
        <ChatFromPage
          items={[LEE_MENU, LEE_LEAD]}
          reply={[
            'updated: the "Services" menu item is orange (#c8643b), the rest of the menu is unchanged',
            'updated: the lead line now reads "Plants, warehouses, cold storage and heavy machine foundations…"'
          ]}
        />
      }
      chatTabs={3}
      toolbar={{ option: 'b', comments: 3, refresh: 'updated' }}
    />
  )
}

/**
 * U3 — PENDING REVIEW (21:00). In the thread card of Mai's comment on the figure, Lee typed "Update it on both pages,
 * please." and pressed Enter, "Ask Tracy to edit ↵": his words and the whole thread (Mai's comment, Lee's earlier reply) went to
 * the chat as ONE message; the words did NOT become a reply. The thread keeps its messages and shows nothing extra (21:40); the
 * comment stays until someone resolves it, and the left column has switched to Chat. The reply box is empty again; "Reply" (a click) would have added a people reply instead. Refresh spins with "Tracy is
 * working" (rule 10); nothing is drawn on the page. Mai's report and Lee's screenshot show under their messages (a
 * file as name + size, a photo as its thumbnail; a click opens it in a new tab) and went to the chat with the message;
 * the paperclip sits at the reply box's foot (rule 11).
 */
export const ThreadCardSendToChat: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      height={820}
      pins={[MAI_HEADING]}
      overlay={
        <div className="absolute top-[365px] left-[32px] z-30">
          <span className="relative block">
            <PeopleThreadCard
              viewer={LEE}
              messages={[
                {
                  author: MAI,
                  age: '20m ago',
                  text: STAT.request,
                  files: [{ name: 'annual-report-2026.pdf', size: '2.5 MB' }]
                },
                {
                  author: LEE,
                  age: '6m ago',
                  text: 'The About page says 13 as well.',
                  files: [{ name: 'about-page.png', size: '910 KB', image: 'bg-orange-700' }]
                }
              ]}
            />
          </span>
        </div>
      }
      turn={
        <ChatFromPage
          items={[{ author: MAI, chip: STAT.chip, kind: 'figure', text: STAT.request }]}
          words="Update it on both pages, please."
          thread={[
            { author: MAI, text: STAT.request },
            { author: LEE, text: 'The About page says 13 as well.' }
          ]}
          reply="working"
        />
      }
      chatTabs={2}
      toolbar={{ option: 'b', comments: 2, refresh: 'working' }}
    />
  )
}

const PEOPLE_OPEN: PeopleRow[] = [
  {
    id: 'p5',
    author: LEE,
    age: '9m ago',
    kind: 'menu-item',
    chip: MENU_ITEM.chip,
    note: MENU_ITEM.request
  },
  {
    id: 'p6',
    author: LEE,
    age: '8m ago',
    kind: 'text',
    chip: LEAD.chip,
    note: LEAD.note
  },
  {
    id: 'p1',
    author: MAI,
    age: '20m ago',
    kind: 'figure',
    chip: STAT.chip,
    note: STAT.request,
    replies: [
      { author: LEE, age: '6m ago', text: 'The About page says 13 as well.' },
      { author: MAI, age: '4m ago', text: 'Good catch, both then.' }
    ]
  },
  {
    id: 'p2',
    author: MAI,
    age: '25m ago',
    kind: 'heading',
    chip: HEADING_PIN.chip,
    note: 'Can we make this heading shorter? It wraps on phones.'
  },
  {
    id: 'p3',
    author: LEE,
    age: 'just now',
    kind: 'image',
    chip: IMAGE_PIN.chip,
    note: 'Mai, do we have a better photo for this one?'
  }
]

const PEOPLE_RESOLVED: PeopleRow[] = [
  {
    id: 'p4',
    author: LEE,
    age: '1h ago',
    kind: 'article',
    chip: '"Four typical mistakes in foundation…"',
    note: 'Put the author photo next to the byline.',
    page: '/news',
    resolvedBy: 'Mai'
  }
]

/**
 * U4 — PENDING REVIEW. The Comments tab: an overview and navigation of PEOPLE comments (rule 7). A row: avatar in the
 * author's colour, name, time, chip (author's bubble + quote), text, "N replies" collapsed, a quick Resolve; no status
 * words, no Tracy lines, no Reply, no Edit. A click on a row opens its thread card on the page (CommentsTabRowOpensCard).
 * Comments sent to Tracy before (Mai's figure thread, Lee's menu and lead comments) look exactly like the others. The
 * Open head: "Delete all" (soft-deletes every open comment on this page, everyone's; the head reads "Deleted N comments · Undo" for
 * 10 s, round 2) and "Ask Tracy to edit all (5)" (round 2, rule G: N = the open threads — five comments, the two replies under
 * Mai's figure riding along — sent before or not; a press
 * opens the checklist, SendNChecklist). Both stay put whatever row is clicked (CommentsTabNothingOpen: disabled). Resolved group: the same rows without Resolve — no "Resolved by" line
 * (23:45: the thread card on the page says who resolved it); a reply in the card reopens. Badge and toolbar: 5
 * open comments on this site, grey. On the page: plain author bubbles. The "Add a comment…" box at the bottom is for the
 * whole page (PageCommentBox).
 */
export const CommentsTabPeopleOnly: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      height={1060}
      pins={[
        { ...HEADING_PIN, state: 'comment', author: MAI },
        { n: 2, target: 'stat', chip: STAT.chip, note: STAT.request, state: 'comment', author: MAI },
        { ...IMAGE_PIN },
        {
          n: 4,
          target: 'menu-item',
          chip: MENU_ITEM.chip,
          note: MENU_ITEM.request,
          state: 'comment',
          author: LEE
        },
        {
          n: 5,
          target: 'lead',
          chip: LEAD.chip,
          note: LEAD.note,
          state: 'comment',
          author: LEE
        }
      ]}
      toolbar={{ option: 'b', comments: 5 }}
      column={
        <PeopleCommentsTab
          open={PEOPLE_OPEN}
          resolved={PEOPLE_RESOLVED}
          badge={5}
          sentIds={['p1', 'p5', 'p6']}
        />
      }
    />
  )
}

/**
 * U5 — PENDING REVIEW (21:00). No comment yet: the hint says what each button does, "Note for team leaves a note for your
 * team here. Ask Tracy to edit gives it to Tracy in the chat to change." (21:30: sending hands work over). Badge 0.
 */
export const CommentsTabPeopleOnlyEmpty: Story = {
  render: () => (
    <Frame mode="off" p={MENU_ITEM} toolbar={{ option: 'b', comments: 0 }} column={<PeopleCommentsTab />} />
  )
}

// ── UI FINE-TUNE (30/09 morning): filter, one meta line, Resolved hidden (header rules A to D) ─────

/** Open comments on two other pages of the site, for the All pages stories. */
const PEOPLE_SERVICES: PeopleRow = {
  id: 's1',
  author: MAI,
  age: '3m ago',
  kind: 'heading',
  chip: '"Our services"',
  note: 'Add cold storage to this list.',
  page: '/services/'
}
const PEOPLE_ABOUT: PeopleRow = {
  id: 'a1',
  author: LEE,
  age: '12m ago',
  kind: 'text',
  chip: '"Founded in 1994…"',
  note: 'The year is 1996, see the company register.',
  page: '/about/'
}
/** Every open comment of the site, newest activity first (the page shown is not pushed to the top, U15). */
const PEOPLE_ALL_OPEN: PeopleRow[] = [
  PEOPLE_OPEN.find((r) => r.id === 'p3')!,
  PEOPLE_SERVICES,
  PEOPLE_OPEN.find((r) => r.id === 'p6')!,
  PEOPLE_OPEN.find((r) => r.id === 'p5')!,
  PEOPLE_ABOUT,
  ...PEOPLE_OPEN.filter((r) => ['p1', 'p2'].includes(r.id))
]
/** A comment resolved on the page shown, plus Lee's resolved one on /news. */
const PEOPLE_RESOLVED_HERE: PeopleRow = {
  id: 'p7',
  author: MAI,
  age: '40m ago',
  kind: 'image',
  chip: IMAGE_PIN.chip,
  note: 'Swap this photo for the new plant.',
  resolvedBy: 'Lee'
}
const FINETUNE_PINS: MultiPin[] = [
  { ...HEADING_PIN, state: 'comment', author: MAI },
  { n: 2, target: 'stat', chip: STAT.chip, note: STAT.request, state: 'comment', author: MAI },
  { ...IMAGE_PIN },
  { n: 4, target: 'menu-item', chip: MENU_ITEM.chip, note: MENU_ITEM.request, state: 'comment', author: LEE },
  { n: 5, target: 'lead', chip: LEAD.chip, note: LEAD.note, state: 'comment', author: LEE }
]

/**
 * FT-1 (rules A to D). The tab on first open: `Current page (5) | All pages (7)` at the top, `Current page` chosen,
 * above the Delete all / Send all row. Every row has one avatar, the meta line `<name> · <time> · Current page`, a chip
 * without avatar. At the end of Open the small line `Show 1 resolved comment` (the one on /news is not on this page).
 * "Comments 5" on the toolbar and the tab = open comments of this page (U16).
 */
export const CommentsTabFilterCurrentPage: Story = {
  render: () => (
    <Frame
      mode="off"
      p={MENU_ITEM}
      height={1060}
      pins={FINETUNE_PINS}
      toolbar={{ option: 'b', comments: 5 }}
      column={
        <PeopleCommentsTab open={PEOPLE_ALL_OPEN} resolved={[PEOPLE_RESOLVED_HERE, ...PEOPLE_RESOLVED]} />
      }
    />
  )
}

/**
 * FT-2 (rule C). All pages: every open comment of the site in activity order. Rows of the page the Browser tab shows
 * read `Current page`, with a stronger background and a bar at their left; the others name their path (`/services/`,
 * `/about/`), never the site's name. Send all counts the whole site (7 threads, round 2 rule G). Adjacent Current page
 * rows read as one band (rule H). Clicking a row of another page moves
 * the Browser tab there and only moves the emphasis: no row changes height, the list keeps its order (U6, U7, U15).
 */
export const CommentsTabFilterAllPages: Story = {
  render: () => (
    <Frame
      mode="off"
      p={MENU_ITEM}
      height={1180}
      pins={FINETUNE_PINS}
      toolbar={{ option: 'b', comments: 5 }}
      column={
        <PeopleCommentsTab
          filter="all"
          open={PEOPLE_ALL_OPEN}
          resolved={[PEOPLE_RESOLVED_HERE, ...PEOPLE_RESOLVED]}
        />
      }
    />
  )
}

/**
 * FT-3 (rule D). `Show 1 resolved comment` pressed: the Resolved group appears under Open and the line reads `Hide
 * resolved comments`. Delete all now also takes the resolved one shown. After a reload the group is hidden again.
 */
export const CommentsTabResolvedShown: Story = {
  render: () => (
    <Frame
      mode="off"
      p={MENU_ITEM}
      height={1180}
      pins={FINETUNE_PINS}
      toolbar={{ option: 'b', comments: 5 }}
      column={
        <PeopleCommentsTab
          showResolved
          open={PEOPLE_ALL_OPEN}
          resolved={[PEOPLE_RESOLVED_HERE, ...PEOPLE_RESOLVED]}
        />
      }
    />
  )
}

/**
 * FT-4 (rule D, U33). Resolve pressed on Mai's heading comment while Resolved is hidden: its row folds into one line
 * `Resolved. Undo` in its place for about 5 s, then goes; Undo brings the row back where it was.
 */
export const CommentsTabResolvedUndo: Story = {
  render: () => (
    <Frame
      mode="off"
      p={MENU_ITEM}
      height={1000}
      pins={FINETUNE_PINS}
      toolbar={{ option: 'b', comments: 5 }}
      column={
        <PeopleCommentsTab
          resolvingIds={['p2']}
          open={PEOPLE_ALL_OPEN}
          resolved={[PEOPLE_RESOLVED_HERE, ...PEOPLE_RESOLVED]}
        />
      }
    />
  )
}

/**
 * FT-5 (rule C, U17). The page shown has no open comment, other pages have 2: `No open comments on this page`, with
 * the shortcuts `Show 1 resolved comment` and `2 on other pages` (a click switches the filter to All pages). The filter
 * and both buttons stay, disabled, so nothing moves (U28).
 */
export const CommentsTabPageEmpty: Story = {
  render: () => (
    <Frame
      mode="off"
      p={MENU_ITEM}
      toolbar={{ option: 'b', comments: 0 }}
      column={<PeopleCommentsTab open={[PEOPLE_SERVICES, PEOPLE_ABOUT]} resolved={[PEOPLE_RESOLVED_HERE]} />}
    />
  )
}

/**
 * FT2-1 (rule F, round 3; U42–U45). Delete all pressed 3 s ago on Current page: in the head row, unmoved, `OPEN` reads
 * `5 DELETED` and Delete all reads `Undo (7)`, Ask Tracy to edit all (5) dimmed; the five rows stay where they were, dimmed and not clickable;
 * the resolved line holds still (disabled). The counts and the page's pins dropped at once (`Current page (0)`, the tab's
 * count 0, "Comments 0"). At 0 the clear is sent and the empty state shows; Undo brings rows, head and pins back.
 */
export const CommentsTabDeleteAllCountdown: Story = {
  render: () => (
    <Frame
      mode="off"
      p={MENU_ITEM}
      height={1060}
      pins={[]}
      toolbar={{ option: 'b', comments: 0 }}
      column={
        <PeopleCommentsTab
          deleting={{ left: 7 }}
          open={PEOPLE_ALL_OPEN}
          resolved={[PEOPLE_RESOLVED_HERE, ...PEOPLE_RESOLVED]}
        />
      }
    />
  )
}

/**
 * FT2-2 (round 2, rule H; point 6). All pages with the Resolved group shown: the Current page rows that follow each
 * other (p6 and p5; p1 and p2) read as ONE band, the bar and the background unbroken, a hairline between rows; a lone
 * Current page row (the newest, p3, and the resolved one) keeps its own rounded look. No row's height or place differs
 * from CommentsTabFilterAllPages.
 */
export const CommentsTabCurrentPageBand: Story = {
  render: () => (
    <Frame
      mode="off"
      p={MENU_ITEM}
      height={1280}
      pins={FINETUNE_PINS}
      toolbar={{ option: 'b', comments: 5 }}
      column={
        <PeopleCommentsTab
          filter="all"
          showResolved
          open={PEOPLE_ALL_OPEN}
          resolved={[PEOPLE_RESOLVED_HERE, ...PEOPLE_RESOLVED]}
        />
      }
    />
  )
}

// ── PENDING REVIEW (29/09): a turn's progress lives on Refresh (rule 10) ─────────────────────────────

const LEE_MENU_PIN: MultiPin = {
  n: 2,
  target: 'menu-item',
  chip: MENU_ITEM.chip,
  note: MENU_ITEM.request,
  state: 'open',
  author: LEE,
  two: {}
}

/**
 * W1 — PENDING REVIEW. State 1, just sent: Refresh's icon spins and the dark chip "Tracy is working" shows under it for
 * 3 s, then hides (W2). Nothing on the page; the left column is on Chat with the new message.
 */
export const RefreshWorking: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[MAI_HEADING]}
      turn={<ChatFromPage items={[LEE_MENU]} reply="working" />}
      chatTabs={1}
      toolbar={{ option: 'b', comments: 1, refresh: 'working' }}
    />
  )
}

/** W2 — PENDING REVIEW. State 2, a long task: after the 3 s the chip is gone; the icon keeps spinning. */
export const RefreshWorkingLong: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[MAI_HEADING]}
      turn={<ChatFromPage items={[LEE_MENU]} reply="working" />}
      chatTabs={1}
      toolbar={{ option: 'b', comments: 1, refresh: 'working-long' }}
    />
  )
}

/**
 * W3 — PENDING REVIEW. State 3, done and the page reloaded itself (keeping the scroll): the icon stops and the chip
 * "New version updated" shows for exactly 3 s, then Refresh is back to normal. Tracy's reply is in the chat.
 */
export const RefreshNewVersionUpdated: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[MAI_HEADING]}
      turn={
        <ChatFromPage
          items={[LEE_MENU]}
          reply={['updated: the "Services" menu item is orange (#c8643b), the rest of the menu is unchanged']}
        />
      }
      chatTabs={1}
      toolbar={{ option: 'b', comments: 1, refresh: 'updated' }}
    />
  )
}

/**
 * W4 — PENDING REVIEW. State 4: the turn is done but the page could not reload,
 * because Lee is typing a new comment in a popover (a reload would lose it; the other reasons: he is on another page
 * than the one Tracy changed, or the reload failed). Refresh is terracotta, icon still, with the chip "New version
 * ready" until he clicks it; a click reloads keeping the scroll. Everyone else with this page open sees exactly this
 * too, never a spinner and never an automatic reload.
 */
export const RefreshNewVersionReady: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[MAI_HEADING, { ...LEE_MENU_PIN, note: 'And the same orange for the button in the footer.' }]}
      turn={
        <ChatFromPage
          items={[LEE_LEAD]}
          reply={[
            'updated: the lead line now reads "Plants, warehouses, cold storage and heavy machine foundations…"'
          ]}
        />
      }
      chatTabs={1}
      toolbar={{ option: 'b', comments: 1, refresh: 'ready' }}
    />
  )
}

/** W5 — PENDING REVIEW. State 1 in a compact frame (380 px): the same spinning icon and chip, inside the frame. */
export const RefreshWorkingCompact: StoryObj<{ frame: number }> = {
  args: { frame: 380 },
  render: ({ frame }) => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      frame={Number(frame)}
      pins={[MAI_HEADING]}
      toolbar={{ option: 'b', comments: 1, refresh: 'working' }}
    />
  )
}

/** W6 — PENDING REVIEW. State 4 in a compact frame (380 px): terracotta Refresh and "New version ready", inside the frame. */
export const RefreshNewVersionReadyCompact: StoryObj<{ frame: number }> = {
  args: { frame: 380 },
  render: ({ frame }) => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      frame={Number(frame)}
      pins={[MAI_HEADING]}
      toolbar={{ option: 'b', comments: 1, refresh: 'ready' }}
    />
  )
}

// ── PENDING REVIEW (29/09): "Ask Tracy to edit all (N)" and its checklist (rule 9) ─────────────────────────

/**
 * X5 — PENDING REVIEW. "Ask Tracy to edit all (7)" pressed: the checklist of the five open threads (seven messages, rule 12b), each with
 * its author, chip and first line, all ticked except Lee's "Mai, do we have a better photo for this one?", which is
 * talk between people, so the foot reads "6 of 7 messages". "Ask Tracy to edit ↵" (Enter, also from a focused checkbox; Space ticks) gives the four ticked ones
 * to Tracy as one chat message; "Cancel" closes.
 * "Delete all" beside it soft-deletes every comment on this page instead (Undo for 10 s); it never sends.
 */
export const SendNChecklist: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      height={1060}
      pins={[
        { ...HEADING_PIN, author: MAI },
        { n: 2, target: 'stat', chip: STAT.chip, note: STAT.request, state: 'comment', author: MAI },
        { ...IMAGE_PIN },
        {
          n: 4,
          target: 'menu-item',
          chip: MENU_ITEM.chip,
          note: MENU_ITEM.request,
          state: 'comment',
          author: LEE
        },
        { n: 5, target: 'lead', chip: LEAD.chip, note: LEAD.note, state: 'comment', author: LEE }
      ]}
      toolbar={{ option: 'b', comments: 5 }}
      column={
        <PeopleCommentsTab
          open={PEOPLE_OPEN}
          resolved={PEOPLE_RESOLVED}
          badge={5}
          checklist={{ unticked: ['p3'] }}
        />
      }
    />
  )
}

// ── PENDING REVIEW (29/09 20:49): the Comments button, one button, no menu (rule 8) ──────────────

/** Y1 — Five open comments on the page (all authors): "Comments" with a terracotta 5. A click opens the Comments tab. */
export const ToolbarCommentsButton: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[
        MAI_HEADING,
        { n: 2, target: 'stat', chip: STAT.chip, note: STAT.request, state: 'comment', author: MAI },
        { ...IMAGE_PIN },
        {
          n: 4,
          target: 'menu-item',
          chip: MENU_ITEM.chip,
          note: MENU_ITEM.request,
          state: 'comment',
          author: LEE
        },
        { n: 5, target: 'lead', chip: LEAD.chip, note: LEAD.note, state: 'comment', author: LEE }
      ]}
      toolbar={{ option: 'b', comments: 5 }}
    />
  )
}

/** Y2 — No open comment on the page: "Comments" with no count (01/10/2026: the grey "0" is gone). */
export const ToolbarCommentsButtonZero: Story = {
  render: () => <Frame mode="off" p={MENU_ITEM} toolbar={{ option: 'b', comments: 0 }} />
}

/** Y3 — Compact (frame 380 px): the icon with the terracotta count as a corner badge. `frame` is an arg. */
export const ToolbarCommentsButtonCompact: StoryObj<{ frame: number }> = {
  args: { frame: 380 },
  render: ({ frame }) => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      frame={Number(frame)}
      pins={[MAI_HEADING]}
      toolbar={{ option: 'b', comments: 5 }}
    />
  )
}

// ── PENDING REVIEW (29/09 20:55): the same two buttons in the reply box and the page comment box ───

/**
 * Z2 — PENDING REVIEW. The "Add a comment…" box at the bottom of the Comments tab, for the whole page, typed: "Note for team"
 * (a click) makes a people comment on the page, like Mai's already in Open with its "Whole page · /" chip; "Send to
 * Tracy ↵" (Enter) gives the words to Tracy as a chat message with the same chip. Today the box sends straight to Tracy: that goes away.
 */
export const PageCommentBox: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[MAI_HEADING]}
      toolbar={{ option: 'b', comments: 2 }}
      column={
        <PeopleCommentsTab
          badge={2}
          composer="The phone number in the top bar is old: use 8 800 550-67-91."
          open={[
            {
              id: 'g1',
              author: MAI,
              age: '10m ago',
              kind: 'page',
              chip: 'Whole page · /',
              note: 'The page feels long on phones; can we drop one of the two news tiles?'
            },
            {
              id: 'g2',
              author: MAI,
              age: '25m ago',
              kind: 'heading',
              chip: HEADING_PIN.chip,
              note: 'Can we make this heading shorter? It wraps on phones.'
            }
          ]}
        />
      }
    />
  )
}

/**
 * Z3 — PENDING REVIEW (21:00). Lee clicked the row of Mai's comment on the figure in the Comments tab: the row is
 * highlighted, the page scrolled to "13 subsidiaries", and the comment's thread card is open at its pin on the right,
 * where replying happens (Resolve by the first message's ⋮, then "Reply…", "Reply", "Ask Tracy to edit ↵"). The tab
 * itself has no reply box.
 */
export const CommentsTabRowOpensCard: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      height={900}
      pins={[
        MAI_HEADING,
        { n: 2, target: 'stat', chip: STAT.chip, note: STAT.request, state: 'comment', author: MAI },
        { ...IMAGE_PIN }
      ]}
      overlay={
        <div className="absolute top-[365px] left-[32px] z-30">
          <span className="relative block">
            <PeopleThreadCard
              viewer={LEE}
              messages={[
                { author: MAI, age: '20m ago', text: STAT.request },
                { author: LEE, age: '6m ago', text: 'The About page says 13 as well.' },
                { author: MAI, age: '4m ago', text: 'Good catch, both then.' }
              ]}
            />
          </span>
        </div>
      }
      toolbar={{ option: 'b', comments: 3 }}
      column={
        <PeopleCommentsTab
          badge={3}
          sentIds={['p1']}
          open={PEOPLE_OPEN.filter((r) => ['p1', 'p2', 'p3'].includes(r.id)).map((r) =>
            r.id === 'p1' ? { ...r, active: true } : r
          )}
        />
      }
    />
  )
}

// ── PENDING REVIEW (30/09): round 3 after the test on the local stand (rule 12) ──────────────

/**
 * R3-1 — PENDING REVIEW. Nothing open, one resolved comment on another page (/news), and the Browser tab on the home
 * page: the Open head keeps its place and both buttons, disabled, "Delete all" (nothing on this page to delete) and
 * "Ask Tracy to edit all (0)". Nothing appears or vanishes as rows are clicked (rule 12a).
 */
export const CommentsTabNothingOpen: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      toolbar={{ option: 'b', comments: 0 }}
      column={<PeopleCommentsTab badge={0} resolved={PEOPLE_RESOLVED} onPage={0} />}
    />
  )
}

/**
 * R3-2 — PENDING REVIEW. The "Add a comment…" box with a long message: it grew line by line to about eight lines
 * (160 px) and now scrolls inside; deleting words shrinks it back. Enter, Ctrl+Enter or ⌘+Enter sends to Tracy,
 * Shift+Enter is a new line, an input method's Enter only ends the composition, a held-down Enter sends once
 * (rule 12d, the keys of dsh's chat composer). "Note for team" is a click.
 */
export const PageCommentBoxLong: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[MAI_HEADING]}
      toolbar={{ option: 'b', comments: 1 }}
      column={
        <PeopleCommentsTab
          badge={1}
          composer={[
            'The contact block needs a clean-up before Monday:',
            '1. The phone in the top bar is old: use 8 800 550-67-91.',
            '2. The e-mail should be sales@northgate-ind.ru.',
            '3. The address moved to 14 Promyshlennaya St.',
            '4. Office hours are 9:00 to 18:00, Monday to Friday.',
            '5. Drop the fax line, nobody uses it.',
            '6. Add the WhatsApp number from the brochure.',
            '7. The map pin should point at the new address.',
            '8. Keep the old address in the footer until December.'
          ].join('\n')}
          open={[
            {
              id: 'g2',
              author: MAI,
              age: '25m ago',
              kind: 'heading',
              chip: HEADING_PIN.chip,
              note: 'Can we make this heading shorter? It wraps on phones.'
            }
          ]}
        />
      }
    />
  )
}

/**
 * R3-3 — PENDING REVIEW. "Ask Tracy to edit all (4)" (three comments and one reply) with everything ticked: ONE chat message, one chip per comment — and the
 * two comments pinned on the SAME heading (Mai's, Lee's reply to it, then Lee's own later comment) are ONE chip carrying
 * them all as a thread, oldest first, each with its author and time, so Tracy reads them as one conversation and
 * answers them together. Lee's comment on the lead line keeps its own chip (rule 12c).
 */
export const ChatMessageSendAllGrouped: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[
        MAI_HEADING,
        { n: 3, target: 'lead', chip: LEAD.chip, note: LEAD.note, state: 'comment', author: LEE }
      ]}
      turn={
        <ChatFromPage
          items={[
            {
              author: MAI,
              chip: HEADING_PIN.chip,
              kind: 'heading',
              text: '',
              thread: [
                {
                  author: MAI,
                  age: '30m ago',
                  text: 'Can we make this heading shorter? It wraps on phones.'
                },
                { author: LEE, age: '20m ago', text: 'Agreed, keep it under 40 characters.' },
                { author: LEE, age: '10m ago', text: 'And drop the word "Industrial".' }
              ]
            },
            LEE_LEAD
          ]}
          reply="working"
        />
      }
      chatTabs={1}
      toolbar={{ option: 'b', comments: 3, refresh: 'working' }}
    />
  )
}

// ── PENDING REVIEW (30/09): round 5 after the stage-6 acceptance e2e v3 (agent decisions, made overnight) ──────────────

/**
 * R5-1 — PENDING REVIEW. The Comments tab after round 5: Mai deleted her comment on the heading while two replies stood
 * under it — the row stays, "Comment deleted", still open, counted and sendable (TH-4); two people named "Sam Tester"
 * are told apart by the start of their e-mail (TH-6), as the turn to Tracy already does; a 1,000-character comment
 * is folded to four lines with "Show more" (TH-10).
 */
export const CommentsTabRound5: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      height={900}
      pins={[MAI_HEADING]}
      toolbar={{ option: 'b', comments: 3 }}
      column={
        <PeopleCommentsTab
          badge={3}
          open={[
            {
              id: 'r5-1',
              author: MAI,
              age: '20m ago',
              kind: 'heading',
              chip: HEADING_PIN.chip,
              note: '',
              deleted: true,
              replies: [
                { author: LEE, age: '12m ago', text: 'Shorter, yes.' },
                { author: MAI, age: '8m ago', text: 'Five words max.' }
              ]
            },
            {
              id: 'r5-2',
              author: LEE,
              shownName: 'Lee (lee)',
              age: '6m ago',
              kind: 'text',
              chip: LEAD.chip,
              note: `The lead paragraph needs a rewrite before Monday. ${'It should say who we build for, where, and how fast we hand over; the current text reads like a brochure from 2012 and repeats the heading. '.repeat(6)}`
            },
            {
              id: 'r5-3',
              author: { ...LEE, name: 'Lee' },
              shownName: 'Lee (lee.nguyen)',
              age: '2m ago',
              kind: 'menu-item',
              chip: MENU_ITEM.chip,
              note: MENU_ITEM.request
            }
          ]}
        />
      }
    />
  )
}

/**
 * R5-2 — PENDING REVIEW. The "Add a comment…" box past the door's limit (TH-2): the count shows from 90 % of
 * `limits.maxChars` (4,000), red past it with "Too long to save. Keep it to 4000 characters or fewer.", and both buttons are
 * disabled. After a failed add or send the words come back into the box with plain words (story R5-3).
 */
export const PageCommentBoxTooLong: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      toolbar={{ option: 'b', comments: 0 }}
      column={<PeopleCommentsTab badge={0} composer={`Please rewrite the whole page. ${'x'.repeat(4000)}`} />}
    />
  )
}

/** R5-3 — PENDING REVIEW. A send that failed: the words are back in the box, and the box says so in plain words. */
export const PageCommentBoxFailed: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      toolbar={{ option: 'b', comments: 0 }}
      column={
        <PeopleCommentsTab
          badge={0}
          composer="The phone number in the top bar is old: use 8 800 550-67-91."
          composerFailed="Not sent to Tracy. Your text is back in the box. Try again."
        />
      }
    />
  )
}

// ── Round 5 (30/09, acceptance e2e v3; decided by the agent overnight — TCH `tasks/todo-comment-people.md`
//    rule 20) ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Two people who share a display name (e2e v3 T06): the page adds the part of the email before @. */
const SAM_A: Author = { name: 'Sam Tester (e2e3-thread-a)', initial: 'S', fill: 'bg-emerald-600' }
const SAM_B: Author = { name: 'Sam Tester (e2e3-thread-b)', initial: 'S', fill: 'bg-pink-600' }

/**
 * Rule 20 (TH-2): a count shows from 90 % of the server's limit (`limits.maxChars`, 4000); past it the count turns the
 * warning colour and "Note for team" and "Ask Tracy to edit" are disabled (Enter does nothing). The words stay.
 */
export const PopoverCountOverLimit: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[
        {
          n: 1,
          target: 'menu-item',
          chip: MENU_ITEM.chip,
          note: 'Rewrite the services list so each item says what we do, for whom and how fast we answer…',
          state: 'open',
          author: LEE,
          two: { count: { text: '4012 of 4000 characters', over: true } }
        }
      ]}
      toolbar={{ option: 'b', comments: 0 }}
    />
  )
}

/**
 * Rule 20 (TH-2): the save was refused or never answered. The popover comes back on its element with the words and
 * files as they were, and says why in plain words under the text (never the door's developer sentence); typing again
 * clears the line. Unknown causes read "Could not save. Your words are kept. Try again."
 */
export const PopoverSaveFailedKeepsWords: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      pins={[
        {
          n: 1,
          target: 'menu-item',
          chip: MENU_ITEM.chip,
          note: MENU_ITEM.request,
          state: 'open',
          author: LEE,
          two: { error: 'Could not reach the server. Check your connection, then try again.' }
        }
      ]}
      toolbar={{ option: 'b', comments: 0 }}
    />
  )
}

/**
 * Rule 20 (TH-5): a long thread. The card stays inside the frame; its message list scrolls inside it, opened at the
 * newest message, and the reply box with Reply · Ask Tracy to edit stays at the card's foot. A failed Reply came back into
 * the box with its words (TH-2).
 */
export const ThreadCardLongScrolls: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      height={820}
      pins={[MAI_HEADING]}
      toolbar={{ option: 'b', comments: 1 }}
      overlay={
        <div className="absolute top-[365px] left-[32px] z-30">
          <span className="relative block">
            <PeopleThreadCard
              viewer={LEE}
              listHeight={260}
              reply="Agreed, ship it with the new figure."
              error="Too many saves in a short time. Wait a minute, then try again."
              messages={[
                { author: MAI, age: '1h ago', text: STAT.request },
                ...Array.from({ length: 21 }, (_, i) => ({
                  author: i % 2 === 0 ? LEE : MAI,
                  age: `${String(50 - i * 2)}m ago`,
                  text: `R${String(i + 1).padStart(2, '0')} reply about the subsidiaries figure`
                }))
              ]}
            />
          </span>
        </div>
      }
    />
  )
}

/**
 * Rule 20 (TH-4, TH-6): the first message was deleted while replies stand under it: the thread stays (pin, "Comments
 * N", its row) and its top reads "Comment deleted", muted, with Resolve still there. Two people named "Sam Tester" read
 * "Sam Tester (e2e3-thread-a)" / "(e2e3-thread-b)" in the card, the pin's tooltip and "Resolved by", each in the
 * colour of their own account. A long name gives way (ellipsis), never the time.
 */
export const ThreadCardTombstoneAndTwins: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      height={720}
      pins={[{ ...HEADING_PIN, state: 'comment', author: SAM_A }]}
      toolbar={{ option: 'b', comments: 1 }}
      overlay={
        <div className="absolute top-[365px] left-[32px] z-30">
          <span className="relative block">
            <PeopleThreadCard
              viewer={LEE}
              messages={[
                { author: SAM_A, age: '40m ago', text: '', tombstone: true },
                { author: SAM_B, age: '32m ago', text: 'Still needed: the heading should say 14.' },
                { author: SAM_A, age: '5m ago', text: 'OK, keeping it open.' }
              ]}
            />
          </span>
        </div>
      }
    />
  )
}

/**
 * Rule 20 (SEND-new-1): two comments on one element. Their bubbles fan out 14 px, oldest leftmost, so each can be
 * clicked; the chat still gets ONE grouped chip for them (rule 15).
 */
export const StackedPinsFanOut: Story = {
  render: () => (
    <Frame
      mode="selected"
      p={MENU_ITEM}
      toolbar={{ option: 'b', comments: 2 }}
      overlay={
        <div className="absolute top-[365px] left-[32px] z-30">
          <span className="relative block">
            <AvatarPin author={LEE} />
            <AvatarPin author={MAI} fan={1} />
          </span>
        </div>
      }
    />
  )
}
