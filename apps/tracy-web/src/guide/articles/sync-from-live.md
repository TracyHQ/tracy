---
id: sync-from-live
title: Sync from live (imported sites)
switch: site-sync-from-live
tab: tracy:site-publish
roles: [owner]
platforms: [wordpress, joomla]
keywords: [sync, live, imported, import, update copy, merge, latest changes, dong bo, đồng bộ]
checked: 2026-10-24 @ b6d5c73cd7
---
For an imported WordPress or Joomla site, Tracy works on its own copy. Sync from live is not available for EmDash sites. Sync from live brings what changed on the live site into the copy; what Tracy changed in the copy stays.

**Where:** My Sites → the site's "…" menu → Sync from live. It is also the "Latest changes" step of the site's Publish tab, before the last step of each way to publish.

**Who:** only a site Owner.

**What happens:** press Sync now. Tracy reads the live site, makes a backup of the copy first, combines the two and puts the result in place. Where both sites changed the same thing, Tracy's version is kept and the step lists those places. Sync again runs it once more later.

**Good to know:**
- Opened from "Sync from live", the step only syncs. Continue then leads to Download, where you press Prepare ZIP when you want the ZIP.
- In "Download a ZIP", a sync pressed on the Latest changes step goes on to prepare the ZIP by itself.
- Skip goes on without syncing.
- If Tracy is changing the site right now, wait a minute or two and try again.
- If both sites added records Tracy cannot keep side by side, nothing is changed until you choose "Sync anyway, keep Tracy's records".
- The backup made first lets you go back.
