---
id: imported-to-live
title: Put the changes of an imported site on your real website
switch: none:always-available
tab: tracy:my-sites
roles: [owner]
platforms: [wordpress, joomla]
keywords: [imported, import, live site, real site, my website, old host, hosting, go live, replace, move, transfer, push changes, deploy, publish changes, website that, site that, trang that, trang thật, site cu, site cũ, dua len, đưa lên, chuyen len, chuyển lên]
checked: 2026-10-24 @ b6d5c73cd7
---
When you import a site, Tracy works on its own copy. Your real website keeps running on your own hosting, untouched, until you choose one of the two ways below. Tracy does not copy changes onto your old hosting by itself.

**Way 1: run the site on Tracy.** Your domain then opens the Tracy copy, with every change made here.
1. My Sites → the site's "…" menu → Publish, and press Publish.
2. In the same screen, Connect domain: enter the address of your site (for example www.example.com) and add the DNS records Tracy shows at the company that manages your domain. See "Connect your own domain".
3. Once the domain shows Connected, visitors reach the Tracy site. Your old hosting no longer receives them at that address.

**Way 2: move the copy back to your hosting.**
1. First run Sync from live (the site's "…" menu), so what changed on the live site since the import is kept too.
2. My Sites → the site's "…" menu → Export site as ZIP, and download it (an email code confirms the download).
3. Install the ZIP on your hosting with the installer it contains; the README inside gives the steps. This replaces the site on your hosting with the copy. See "Export the site as a ZIP".

**Who:** a site Owner. An Editor can publish, but connecting a domain and exporting need an Owner.

**Good to know:**
- Until you do one of these, your real website does not change.
- Way 2 replaces the files and database on your hosting: keep a backup of your hosting first.
