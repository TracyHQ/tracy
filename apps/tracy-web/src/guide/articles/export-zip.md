---
id: export-zip
title: Export the site as a ZIP
switch: none:always-available
tab: tracy:site-publish
roles: [owner]
platforms: [wordpress, joomla, emdash]
keywords: [export, zip, download, move site, migrate, copy site, backup file, installer, xuat, xuất, tai ve, tải về, chuyen site, chuyển site]
checked: 2026-10-24 @ b6d5c73cd7
---
Export gives you one ZIP with the site's files and database and a README with the steps to move the site to another host.

**Where:** the site's Publish tab (My Sites → the site's "…" menu → Publish), choose "Download a ZIP", then Continue. "Export site as ZIP" in the same "…" menu opens this path directly.

**Who:** only a site Owner.

**Steps:**
1. On the Download step, press Prepare ZIP. Tracy makes a fresh backup of files and database, then packs the ZIP.
2. Press Send code. Tracy emails you a 6-digit code to verify the download (it expires in 10 minutes; Resend code if needed).
3. Enter the code and press Download.

**Good to know:**
- Up to 1 GiB. Files over 50 MB are included.
- The ZIP contains personal data and the site's secrets. Keep it private.
- The ZIP has an installer. If the database of the new host is on a different server, the installer asks for an Install code, shown on the Download step and emailed once after the first download. EmDash exports have no install code.
- The preparing goes on while you look at another step.
- An imported WordPress or Joomla site that can sync from its live original has a "Latest changes" step before Download: Sync now brings the live site's latest changes into the copy, and the ZIP is then prepared by itself.
