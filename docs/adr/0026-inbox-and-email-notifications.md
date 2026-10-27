---
description: Tracy's notifications (Inbox + email) are only for important person-to-person events — the site's team and comments; the server writes one row per recipient into tracy-web's Postgres, the Inbox polls every 30 seconds, email goes through a retry queue; email in the RECIPIENT's language (chosen → device if one of the 8 → English); 6 groups × 2 channels, the join-request group is locked on; no notifications for agent work; kept 90 days; site name looked up at read time
sources:
  - apps/tracy-web/src/notifications/notify.js
  - apps/tracy-web/src/notifications/store.js
  - apps/tracy-web/src/notifications/route.js
  - apps/tracy-web/src/notifications/preferences.js
  - apps/tracy-web/src/mail/notification-mail.js
  - apps/tracy-web/src/mail/letters/index.js
  - apps/tracy-web/src/db/migrations/055-notification.sql
  - apps/tracy-web/src/db/migrations/056-site-comment-mention.sql
  - apps/tracy-web/src/db/migrations/057-notification-preference.sql
  - apps/tracy-web/src/seats/route.js
  - apps/tracy-web/src/sites/comment-notify.js
  - apps/tracy-web/src/cron.js
  - packages/site/tracy-inbox/src/client/index.tsx
  - packages/ui/tracy-settings/src/client/notifications-section.tsx
---

# 0026 — Notifications: Inbox and email for person-to-person events

**Status:** (binding) · 04/10/2026 · Akemi (PO) decided through four grill rounds on 02–03/10 and the
`develop-impact` review page on 04/10, Claude wrote it. Spec: TracyHQ/tch#809.

## Why an ADR

All three conditions hold: hard to roll back (three new tables, sent emails cannot be recalled),
surprising without context ("why didn't Tracy notify me when it finished?", "why isn't the email in the
sender's language?"), and a real trade-off (see Options dropped). It also **changes a written rule**:
`docs/references/i18n.md` §1c says an email follows the language of the request that caused it —
notification emails do not (item 5).

## Context

Before 809, person-to-person events on a site notified no one, except four team emails (invite,
request to join, approval) written by hand, each in its own style, in the language of whoever clicked.
People mentioned in a comment, people whose comment got a reply, people removed from a site: they did
not know unless they reopened the site themselves. Agencies holding many sites suffered most.

## Decision

1. **Notify only important events, and each event on both channels at once.** One event = one Inbox
   row + one email per recipient (a recipient who turns a channel off in Settings drops that channel).
   No toast, no "just so you know" notification on only one channel.
2. **Scope is the site's team and comments.** Workspace comes later.

   | Code | Event | Recipient |
   |---|---|---|
   | T1 | Invited to a site (with Accept / Decline) | the invitee |
   | T2 | Someone asks to join the site | every Owner and Admin |
   | T2b | Another Owner/Admin has answered that request | the remaining Owners/Admins |
   | T3 · T4 | Request approved · declined | the requester |
   | T5 · T6 | Invitation accepted · declined | the inviter |
   | T7 | Someone joins the site | the whole team except the newcomer and the inviter |
   | T8 | Removed from the site | the removed person |
   | T9 | Role changed | the person whose role changed |
   | T10 | Someone leaves the site | the whole team |
   | T11 | Invitation cancelled | the person who was invited |
   | T12 | Site restored to a backup ("Restore everything"), `team.site_restored` | the whole team except the person who clicked |
   | T13 | Site deleted, `team.site_deleted` | remaining members; the site name is no longer a link |
   | T14 | Site renamed, `team.site_renamed` (only addresses Tracy manages) | the whole team except the person who renamed |
   | C1 | Mentioned with `@` (including names added when editing a comment: only the newly added people) | the mentioned person |
   | C2 | A reply | the original author + everyone who has written in the thread |
   | C3 | Comment marked done · reopened | the comment's author |

   Three rules: **R1** a comment that both mentions and replies gives only one notification, the
   mention type wins; **R2** never notify the person who did it; **R3** a deleted comment keeps its
   Inbox row, shown as "<person> deleted this comment" (sent emails are not recalled).
3. **No notifications for agent work.** Tracy finishes an edit, Tracy marks a comment done (ADR 0025),
   a chat turn ends: no notification is created. The sender is sitting there watching Tracy work, so
   they have already seen the result.
4. **The server writes, one row per recipient.** `notify()` (`notifications/notify.js`) is called right
   at the door that causes the event (saving a comment, approving a request, removing a seat…), never
   from the browser. Each row of the `notification` table (migration 055) is both an Inbox item and a
   letter in the queue (`mail_state` none · pending · held · sent · failed). A row carries `ref` so that
   a finished matter (an invitation answered, a request approved) **settles** every row with the same
   `ref`: the answer buttons disappear for every recipient.
5. **Email in the recipient's language**, not that of the person who caused the event. Order: the
   language that person chose in Settings › Language → the device language if it is one of the 8
   languages of `INTERFACE_LANGUAGES` → English. The language is stored on `account.language` by the
   Inbox's own poll: the plugin sends `?lang=` with exactly the language shown on screen, the server
   stores exactly that value, so the email always matches what that person is reading. Any value outside
   the 8 languages (`ja`, `zh-TW`, empty, garbage) falls back to English. This is a deliberate exception
   to the "email follows the request" rule in `i18n.md` §1c: a notification email arrives when the
   recipient is not present, so the request that caused it speaks someone else's language.
6. **How the Inbox updates:** polls `GET /api/notifications/unread` about every 30 seconds while the tab
   is visible, stops when the tab is hidden, polls immediately when the tab is shown again. No socket.
7. **How email goes out:** Resend, through a retry queue inside the `notification` table itself;
   `cron.js` scans due letters every 30 seconds (`NOTIFICATION_MAIL_MS`, a constant in code, not an
   environment variable). A failed send backs off 5 · 10 · 20 · 40 minutes; after 5 attempts it is
   `failed`. Replies in the same thread (C2): the first letter goes immediately, later letters within 5
   minutes are held (`held`) and merged into one. One shared letter template built from the sign-in
   letter: a per-type header label, one button, a footer of exactly one line "Manage notifications ·
   tracy.ai", no signature, no slogan. The sign-in code letter stays unchanged.
8. **The recipient chooses channels:** Settings › Notifications has 6 groups × 2 channels (Inbox,
   Email), all on by default (`NOTIFICATION_GROUPS` in `preferences.js`, table
   `notification_preference`, migration 057). The "Join requests" group is **locked on** for Owners and
   Admins: a join request nobody answers leaves the site stuck. The sixth group "Site changes" (subline
   "Restores and address changes", Akemi 04/10) holds T12 and T14; T13 is in the "About you" group like
   T8. Types that belong to no group are always on.
9. **The Inbox is a tab in the right column, not tied to a site** (plugin `@tracy/dsh-inbox`, tab
   `tracy:inbox`, same pattern as the My Sites tab), opened from the "Inbox" row right under New session
   (collapsed rail: icon with a count). Three areas by what the reader must do: "Needs your answer" (cards
   with buttons, at most 3 then "Show all"), Comments, Team updates. Clicking a row opens the right place
   (the Team tab at the right person, the page + comment in the Browser tab); Team updates rows only mark
   as read. Shown/hidden through the `tab-inbox` and `tracy-notifications` switches of `/ops` › User
   Interface, not hard-coded.
10. **Kept 90 days** (`RETENTION_DAYS`); older rows are deleted in `cron.js`'s cleanup pass.
11. **Site name looked up at read time.** A row stores the site code (`site_key`); the name shown in the
    Inbox and in email is the site's **current** name, even for old rows, so a renamed site does not
    show its old name everywhere. The server looks up the site's current address on every read; a
    deleted site takes the last name it had; with nothing left, the code is shown.
    `GET /api/notifications` also returns `siteName`; links and click targets still go by code, so they
    do not break after a rename. Only T14 keeps the old name in `data` so it can say
    "Renamed <old> to <new>".
12. **The `@` box lists only people with a seat** on the site (`GET /api/sites/:key/comments/people`),
    and the comment stores the chosen account ids (`site_comment.mentions`, migration 056), not text.

## Options dropped

- **A live socket instead of 30-second polling:** more expensive at today's scale (one connection per
  tab held through the proxy). The table does not change if the push method changes later.
- **The browser writes notifications itself:** someone closing the tab before the write loses the
  notification, and anyone could write notifications for others. The server is the only place that
  knows the event really happened.
- **Email in the language of the person who caused the event** (the old rule of #753): a German inviting
  a Vietnamese person means the Vietnamese person gets a German letter.
- **Notifying agent work:** the sender has already watched Tracy work; an extra notification is noise,
  and dilutes what really needs someone else's answer.
- **Storing the site name in the row at write time:** when the site is renamed, every old row and every
  later merged email shows the old name.
- **An existing dsh / dshmarket / dshfind plugin:** nothing for person-to-person notifications
  (checked 02/10, per ADR 0006 §5).

## Consequences

- Three new migrations: `055-notification.sql`, `056-site-comment-mention.sql`,
  `057-notification-preference.sql`. No backfill: comments and team events before the rollout date have
  no notifications.
- New doors (all in the API docs): `GET /api/notifications`, `GET /api/notifications/unread`,
  `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`,
  `GET|PUT /api/notifications/preferences`, `POST /api/sites/:key/decline`,
  `GET|POST /invite/:token/decline`, `GET /api/sites/:key/comments/people`.
- The four old team emails move to the shared template (the invitation letter keeps the line "The link works for 7 days." from #804); an invitation can now be declined (email and My Sites, My Sites
  with a confirmation step per rule #800).
- `account.language` has a new meaning: the notification email language. A local machine has no
  `RESEND_API_KEY`, so letters are only printed to the console; real email can only be seen on
  `cowork.tracy.site`.
- Adding an event type = adding a `notify()` at the door, a letter function in `mail/letters/`, an
  `act.*` (+ `verb.*`) string in `tracy-inbox`, translated into all 8 languages, and assigning it to a
  group of `NOTIFICATION_GROUPS`.
