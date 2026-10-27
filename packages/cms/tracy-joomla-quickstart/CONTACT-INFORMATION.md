# Shared Contact Information — local Apple demo

Implemented 2026-09-12 on `http://127.0.0.1:8212`, Docker context `desktop-linux`, container
`t4-skill-j6-web-1` (`aa4951c046a8`), webroot `/var/www/html`, Docker VM mount
`/site/t4-skill-j6/.webroot`. This is a local site change, not a repackaged quickstart release.

## Implementation and editing

JA ACM block `contact-information`, style 1, replaces only the content module in the final footer
row. The four existing columns at `footnav-1` through `footnav-4` remain unchanged. Module 175,
`[Tracy Apple] Footer - Contact information`, supplies both the footer and Contact aside. Edit
heading, email, email label, note, social heading and repeatable network name/profile URL fields
in Joomla's Module Manager. One instance keeps both placements consistent. Module language labels
are installed in both template and site English INI files.

`acm/contact-information/` contains the reusable block. Its grid adapts to its containing column;
colors, font stacks, type scale and spacing come from Apple tokens. Title maps to the contract's
card role (28px desktop, 20px mobile), social heading to compact-card (21px). Text and URL output
are escaped; social links accept HTTPS only. Missing destinations render disabled text. A reserved
`.example` email is displayed as a demo, without a mailto action. No actual recipient or social
account was supplied for this task.

`build-contact-information.mjs` generates the initial scalar seed from shared content facts.
`install-contact-information.php` records a DB backup and converts the existing Custom module in
the `footer` position. It does not modify the Footnav row, its four modules, or any layout JSON.
It refuses to overwrite an already-installed Contact Information instance.

`overrides/com_contact/contact/default.php` replaces the Miscellaneous Information branch with
native ModuleHelper rendering of `contact-information`. Misc is a core Contact field, not an
extension that can be uninstalled. Contact 1's misc content is cleared and show_misc disabled;
legacy JoomlArt Facebook/Twitter destinations are cleared and show_links disabled. Core Contact
and its form remain installed. Onepage's separate bespoke footer is outside these shared layouts.

## Installation inputs and rollback

Build a seed:

```sh
node packages/cms/tracy-joomla-quickstart/build-contact-information.mjs /tmp/contact-seed.json
```

Copy the ACM directory to `templates/tracy/acm/contact-information/`, the override to
`templates/tracy/html/com_contact/contact/default.php`, and merge its INI strings into both
`templates/tracy/language/en-GB/en-GB.tpl_tracy.ini` and `language/en-GB/en-GB.tpl_tracy.ini`.
Run the installer inside the authorized Joomla container with seed, a new backup filename, and
webroot arguments. Clear the T4 optimize cache before checking the live pages.

Local backups inside the container:
- `/tmp/contact-information-before-20260912.tgz`: override, manifest, language files.
- `/tmp/contact-information-before-20260912.json`: previous module records/assignments, Contact
  misc/params and assignments. Restore these fields to roll back. Do not overwrite unrelated
  later edits. `/tmp/contact-information-before-corrected-20260912.json` is the backup from the
  corrected local installation.

## Verification and limits

Chrome live inspection, scoped to Home and Contact: 1440×900 and 390×844, light and dark, eight
page/viewport/theme cases. Contact has two rendered blocks, Home one. All cases: fonts loaded,
no horizontal overflow, 32px block gap, heading 28px desktop / 20px mobile, social heading 21px;
foreground rgb(29,29,31) light / rgb(248,248,248) dark. No Miscellaneous panel remains. Screenshots
were visually inspected for Contact desktop light/mobile dark and Home footer desktop/mobile light.
Viewport override was reset and theme restored to light. No contact form was submitted.

These are focused browser measurements, not a full 632-case design audit or an admin-save
roundtrip. PHP syntax, targeted JS lint, content/design schema validation and seed parity pass.
`pnpm build:check` ran; boot graph passed, but the full suite has unrelated failures: unused `Cms`
in `packages/dev/tracy-design/src/mockups/ops-build-config/tools.tsx`, and the host provision test
waiting for a job timed out. Log: `/tmp/contact-info-build-check.log`.

Content contract revision 3: `b54fc5f3117b836fbdb1bbe0ada8bf0fd885827f261729a33048681954874a10`.
Design contract revision 3: `e7cc2cdb9c94f1d5d1a8505f432731d3c5da358114521365a7b36eeefb9e4bee`.
The site plan now reads contact.notice from the ACM aside and email from both placements;
140 surfaces / 748 fields compile. Earlier content/design observations retain their original
hashes and are historical, not acceptance evidence for these revised contracts. Re-observe when
running the next full audit. Real email/social destinations remain to be supplied and recorded.
