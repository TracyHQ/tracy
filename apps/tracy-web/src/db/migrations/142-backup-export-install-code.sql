-- The install code of a WordPress or Joomla export (19/10/2026, `sites/backup-export.js`): six
-- digits the package's `installer.php` asks for before it sends the site to a database on another
-- server. The package holds only its hash; the Owner reads the code back in the Export dialog and
-- in the email sent after the first download.
--
--   install_code_sealed     the code, sealed with `lib/secret-box.js` (AES-256-GCM under a key
--                           derived from SESSION_SECRET) — never stored in the clear. Null for an
--                           EmDash export, which has no installer.
--   downloaded_at           the first download link issued for the export.
--   install_code_mailed_at  when the code's email was sent: once per export.
alter table backup_export
  add column install_code_sealed text,
  add column downloaded_at timestamptz,
  add column install_code_mailed_at timestamptz;
