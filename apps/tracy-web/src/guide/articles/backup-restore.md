---
id: backup-restore
title: Backups, undo and restore
switch: tab-changes
tab: tracy:changes
roles: [owner, editor]
platforms: [wordpress, joomla, emdash]
keywords: [backup, restore, undo, revert, go back, previous version, yesterday, rollback, changes, diff, khoi phuc, khôi phục, hoan tac, hoàn tác, sao luu, sao lưu, ban cu, bản cũ]
checked: 2026-10-21 @ 6ecf4261ee
---
Every change Tracy makes to a site is recorded in Site changes, with a Diff of what changed. Any change can be undone, and a Backup of the whole site can be created and restored.

**Where:** the site's Site changes tab (My Sites → "…" → Site changes).

**Undo one change:** open the change in Site changes and undo it. Needs an Owner or an Editor.

**Backups:** a backup is a restore point: the site's files and its database (posts, pages, menus, settings, users, comments, orders). It changes nothing on the site; it keeps the site as it was at that moment.
- Create a backup: Create a backup, in Site changes.
- Every site starts with one: "Initial backup — site as built", the site as it was when Tracy first set it up. Restoring it takes the site back to day one.
- Restore everything: puts files and database back to that backup. Tracy first makes a "Before restore" backup, so the restore can itself be undone.
- Restore content: puts back the database and media only; the template code stays as it is.
- Older backups made before Tracy kept the database may hold files only; the backup's badge says what it holds (Full backup, File backup, Content backup).
- Tracy keeps the newest 20 backups' database copies.
- Download a backup as a zip: Owner only; the zip is kept for 24 hours and needs an email code.

**Who:** Owners and Editors can restore and undo. A Viewer can see changes but not change the site; they ask an Owner or Editor.

**Asking Tracy "go back to yesterday":** pick the backup or change from Site changes yourself; the chat can describe it but the restore itself is done in that tab.
