# Bundled Akeeba tools (GPL v3, redistributable) — for the Akeeba quickstart method

akeeba.com gates its packages behind a free-account download manager (not auto-fetchable), so the
versions used + verified by this skill are bundled here so the skill is self-contained.

- `pkg_akeebabackup-10.3.5-core.zip` — Akeeba Backup CORE for Joomla 6 (installable package: component +
  quickicon/system plugins). Install on the SOURCE site to take the `.jpa` backup. (Core = GUI-only backup;
  PRO adds CLI/JSON — see ../../references/akeeba-method.md.)
- `kickstart.php` — Akeeba Kickstart 2025 (standalone restore launcher). Ship alongside the `.jpa`; the
  end-user uploads both to an empty web root, opens kickstart.php → it extracts the archive + runs ANGIE.

Both are GPLv3 (Akeeba Ltd / Nicholas K. Dionysopoulos). Verified working on Joomla 6.1.1.
