---
id: sync-to-live
title: Sync to live (imported sites)
switch: site-sync-to-live
tab: tracy:site-publish
roles: [owner]
platforms: [wordpress, joomla]
keywords: [sync to live, push, publish changes, send to live site, update live site, undo, đồng bộ lên site thật, đẩy lên]
checked: 2026-10-25 @ 6a17a05ed5
---
For an imported WordPress or Joomla site, Tracy works on its own copy. Sync to live sends the content changes Tracy made on the copy (posts, pages, articles, categories, menus, modules and similar records) to the live site. Only the site's Owner can do it, and only from the screen: Tracy does not do it from the chat.

**Where:** My Sites → the site's "…" menu → Sync to live, which opens the site's Publish tab on it. In the Publish tab itself, choose "Send changes to your live site". Two steps: Review, then Send.

**What happens:**
1. Preview: Tracy first brings in what changed on the live site, then lists what it would send, grouped as Will add, Will change and Will remove. Nothing is written yet.
2. Removals are sent only when the Owner ticks their box; on the live site they go to the trash.
3. After Confirm, Tracy writes each change only where the live site still has what it had at the last sync. A place someone changed on the live site since is not overwritten: the result lists it as not sent.
4. Undo sync to live puts back what the push changed, except where the live site was changed again since.

**Good to know:**
- Theme or template files, CSS, site settings and users are not sent yet; the preview lists them under "Not supported yet".
- A preview can be used for 30 minutes; after that, preview again.
- At most 200 changes go in one push; the rest go the next time.
- If Tracy is changing the site right now, or a Sync from live is running, wait and try again.
