# Invitations — real customers, HTML templates + images and 30-day retention

Date: 11/10/2026. Branch: `codex/invitations-snapshot-review`.

**Status: scope approved by the user on 11/10/2026; not yet implemented.** This replaces the temporary-only
snapshot campaign direction in the [previous design](2026-10-11-invitations-snapshot-review-design.md).
The user has approved HTML packaged as a ZIP with images, custom fields configured by the admin, and
has allowed implementation up to a merge into **develop** once tests/review pass. The implementation plan
must be reviewed before writing code; there is no permission to merge to staging/main or to turn on real sending.

## 1. Required output

The user imports a list of real customers into a campaign on dev. The boss opens the campaign, views customers
in five groups, imports five HTML templates with images and previews the content per customer. The campaign is kept to continue operating
later; it is not a demo that forces a re-import once the API exists. Personal data and draft content
are stored by default for **30 days from the first successful import**.

This round **does not send real email yet**. Having a customer in the campaign or having an approved template does not
mean the customer is eligible to receive mail.

## 2. Importing the real list

- Accept real emails, names and customer IDs; do not require `.test`/`.invalid` emails or `sandbox-` IDs,
  and do not replace customer names with fake names.
- Drop the sandbox's 200-customer cap for real campaigns. Do not set a cap on the total number of customers per campaign;
  each CSV file is at most 10 MiB to protect the server. Larger files are reported clearly before writing and
  can be split into several imports into the same campaign.
- Operation flow: choose file → view totals, groups and errors → confirm import → read back the result.
  The server checks the file itself; it does not trust counts sent by the browser.
- Import in batches of at most 1,000 rows; publish the result only after the whole import succeeds.
  An error midway leaves no usable half-imported list. Pressing again/retrying does not create duplicates.
- Keep all 43 fields of the provided snapshot schema, including empty cells and source values.
  Do not fill in missing information or fetch more data from the customer's website.
- Invalid emails, invalid groups or conflicting identities must report the row number and reason before
  importing. Duplicate rows do not create extra people; the related source IDs are kept. Error rows are never dropped silently.
- The real import in this task uses only the exact 07/10/2026 snapshot file the user
  sent. Do not look for or import any other list. The original CSV file on the machine is not changed.

## 3. Five customer groups

Keep the groups already in the `nhom_gui` column; do not reclassify by guessing.

| Group | People in the previously checked snapshot |
|---|---:|
| Active agency | 318 |
| Less active agency | 276 |
| Active business | 103 |
| Less active business | 351 |
| Individual | 292 |
| **Total** | **1,340** |

These are reconciliation numbers for the 07/10 file, not numbers hard-coded in the product. Before the
real import they must be checked again; if the result differs, stop and report, and do not edit customers to match the numbers.

Per the previous check, **42 people are blocked** and **1,298 people need rechecking**. People who
unsubscribed or are blocked do not become ready to send; an empty flag still means unknown.
The source date 07/10/2026 is always displayed so the snapshot is not mistaken for the customer's status today.

## 4. How the boss brings templates in and customizes email

- Overview: total customers, five groups, number blocked/needing recheck, source date, import date,
  expiry date and the reasons sending is not yet possible.
- Recipients: filter by group/status, search customers and paginate at most 100 people/page.
  The table shows the main information; open the detail to see all 43 fields.
- Content / Templates: five independent versions, each with a group, subject, HTML, fallback text version
  and accompanying image set. Importing a ZIP or saving one group does not overwrite another group.

### 4.1. One ZIP file per group

The boss prepares at most five packages; no need to write a manifest or stuff multi-line HTML into a CSV.
On import, the operator picks the group and enters the subject in the UI; the subject may contain valid variables.

```text
agency-active.zip
├── index.html
├── images/
│   ├── logo.png
│   └── banner.jpg
└── text.txt          (optional)
```

- Exactly one UTF-8 `index.html`, at the ZIP root or inside a single wrapping folder.
  Image paths in the HTML are relative to the HTML file, for example `images/banner.jpg`.
- The first version supports PNG, JPEG and GIF; it does not accept SVG, video, fonts, executables or nested ZIPs.
  These are images shared by the template, not images generated per customer.
- If `text.txt` is present, use it as the fallback text version and check it with the same variables. If not, generate the text
  version from the sanitized HTML, keeping text, labels/links and image alt; allow viewing/editing before approval.
- Import flow: choose group/subject/ZIP → check file and images → preview, see warnings about removed
  parts → confirm saving a new version. Errors or retries do not write half a version or duplicate versions.
- Proposed limits: ZIP at most 10 MiB, total uncompressed at most 20 MiB, 50 entries including metadata,
  HTML at most 256 KiB, each image at most 2 MiB. Images at most 20 million pixels, GIF at most 100 frames
  and 20 million pixels total across all frames; checked while reading/decompressing, not after memory has been allocated.
- Only the `.DS_Store` and `__MACOSX/` metadata are skipped, with a report; any other entry besides the HTML,
  `text.txt`, folders and supported images must be reported as an error. Content files are never dropped silently.
- Block absolute paths, `..`, symlinks, names that collide after normalization and broken/encrypted archives.
  Do not extract arbitrarily to the filesystem. Check image formats by actual content, not just the file extension;
  strip unnecessary image metadata. Limits must not rely only on the byte counts the archive declares.

### 4.2. HTML with images, but no code running or calls to external services

- Keep common email structure: tables/layout, text, images, links, link-style buttons and allowed email
  CSS. No promise to keep every CSS rule or every export file intact; the preview shows the actual
  version after sanitizing. The first version allows editing HTML/text and replacing the ZIP package, with no drag-and-drop editor.
  CSS must be inside the HTML (inline or a sanitized style block), without separate CSS/font files.
- Sanitize with a parser/allowlist on the server: no scripts, event handlers, forms, iframes,
  embedded objects, redirects or code-executing URLs. CSS may not load fonts, import stylesheets
  or fetch external images/resources. Warn about removed parts before the operator confirms saving.
- Images must be in the ZIP and are mapped to assets of the right campaign/version. External images,
  missing images or unsupported references must be reported clearly and block saving a complete template;
  do not fetch arbitrary URLs, use data URLs or tracking pixels from external providers.
- The HTML preview is isolated and does not run scripts, submit forms or navigate. It only loads managed
  images through owner/admin permission; it makes no requests to external hosts and opens no links while viewing.
  It has desktop/mobile frames; this is not proof that every email client renders the same.
- Customer data filled into HTML is escaped as text and cannot inject HTML/CSS code.
  Customer variables are not allowed in image paths, CSS, attribute names or HTML structure.
  System URL variables are only used in checked link positions; a preview without a real link yet uses
  an inactive label and does not create a real invitation or unsubscribe token.

### 4.3. Variables and per-customer drafts

This round extends the variable set for real campaigns; the sandbox currently only has `first_name`/`group`,
and the existing pure renderer is not yet an HTML system or a real sending flow.

| Variable | Source / rule |
|---|---|
| `{{first_name}}` | Confirmed given name; if missing, use `there` in the English greeting, do not guess from the full name |
| `{{company}}` | `cong_ty`; if missing, report clearly when the template uses it |
| `{{plan}}` | `goi` with the source date; not treated as a verified current subscription |
| `{{last_template}}` | `template_tai_gan_nhat`; by default used in the corresponding optional paragraph |
| `{{website}}` | `website`, used as text; if missing, report when the template uses it |
| `{{cms}}` | Only when the source has it; by default used in the corresponding optional paragraph |
| `{{group}}` | Mapped source group label |

- The table above is the default set, not a closed list. Owner/admin manage the field catalogue
  in the campaign: display label, token key, value source, default and rule when missing.
  New fields live in the `custom.<key>` namespace, for example `custom.opening_line`, `custom.benefit`,
  `custom.signature`; values are text, not HTML, dynamic URLs or executable code.
- A custom field's source is manual entry or a mapping to **one explicitly chosen existing source column**.
  Do not expose all 43 columns as variables automatically. Per-customer value → group value → campaign default
  applies to manually entered fields; a mapped field reads the source column, then uses the default if configured.
  Manual overrides are not used to edit the raw source; the two kinds are displayed distinctly.
- When missing: `required` blocks creating the complete version/approval; `default` uses the configured default value;
  `omit` is only valid when the token sits inside that same field's optional paragraph. Tokens are never dropped silently.
  Do not guess the given name from the full name; the `first_name` default is still `there`.
- HTML marks optional paragraphs with `data-if-present="<registered-field>"`; if the field is missing, that
  paragraph is removed. Each paragraph has only one condition; no expressions/no running template code. The condition
  is still a dependency even when the paragraph is removed. The auto-generated text version is taken from the HTML after resolving conditions,
  so it removes the right paragraph. A self-supplied `text.txt` only accepts fields that can be resolved with `required`/`default`;
  if it uses an `omit` field, require switching to the auto-generated text version; do not add a second condition language.
- `invitation_url` is the slot reserved for the system link in the real-sending stage. The unsubscribe footer
  belongs to the system; the boss may not assign a per-customer link or use a variable to remove the footer.
- Keeping all 43 fields does not mean all 43 fields may go into the email. Variables not registered at
  ZIP import are listed for the admin to declare/map, not registered or deleted automatically. Bad syntax or
  a missing required field must be reported before creating the complete version. Duplicate keys, prototype keys
  or shadowing system fields are rejected; the recipient address, eligibility, STOP,
  invitation/unsubscribe URL or system footer cannot be customized through the field catalogue.
- Adding a text field/mapping an existing column/changing a default is a configuration action, not a code change/deploy.
  A new external API source still needs its own integration; nothing is fetched from formulas or field values.
- When creating a draft, pick the right template for the group, fill in the data and store the HTML/text together with the images
  of that version. Allow editing each customer's HTML/text/subject separately and previewing; do not edit the source data,
  the group template or other customers' mail. No need to create 1,340 binary copies of the same image.
- Re-importing a template/regenerating a draft does not silently overwrite a customized version. A new template marks
  the old draft as needing review; replacing content or a related source invalidates the approval but
  does not delete edited text. Replacing a draft requires an explicit choice and confirmation.
- Approval is bound to the subject, the sanitized HTML, the text, the variable set and the byte hash of that version's image set.
  Replacing an image while keeping its file name is still replacing content. Asset versions are immutable; an old draft does not
  switch images on a new upload. Content approval is not permission to turn on sending.
- Changing a field definition, mapping, default or group/customer value that affects content
  also invalidates the approval. Approval stores the corresponding dependency/version; customized text is kept and
  flagged as needing review instead of being silently re-rendered over. Content approval in this round is independent of sending
  eligibility: a draft for a `recheck` customer can be approved, but sending is not opened; blocked customers show their own reason.
- The warning when leaving the page with unsaved changes still works.

## 5. 30-day retention, not hard-coded

- There is a retention setting managed by the Ops owner/admin, default **30 days**.
  Changing the setting needs no code change/deploy; valid values are integers from 1 to 365 days.
- Each campaign records its expiry date at the first import. A change to the global setting only applies
  to campaigns first imported after it; existing campaigns are not silently extended or shortened.
- HTML, text versions and image sets share the campaign data's retention. Images are not made public
  through a dev path; deletion removes only assets of the expired campaign, not images of other campaigns/QA.
- Editing a template, replacing images, approving, reviewing or importing more does not extend automatically.
- Owner/admin can deliberately extend a campaign **before it expires**, confirming the new date,
  with a change log. Not more than 365 days from the first import.
  In the current task no extension is performed; the allowed retention is 30 days.
- At expiry: block reading/editing personal data and draft content immediately, then automatically clean up the corresponding data/encryption
  keys. Keep statistics and logs that contain no identities. Expired data is not recovered
  by changing the setting or restoring an old backup.
- This cleanup does not apply to the old QA or the original CSV file. Do not claim backups have been
  physically deleted when reads have only been blocked/keys deleted.

## 6. Code scope and data protection

- Keep the existing sandbox and QA intact. Add real campaigns; do not just remove the `.test` validator
  on the sandbox doors and mix real data into the simulation system.
- Reuse the existing parser, identity normalization and status/approval rules; do not write a
  second condition checker. The real list is stored per person/batch for pagination;
  do not return the whole campaign just to draw one page.
- Each real campaign has an import source, data/content version, draft status and expiry date.
  Prepare an integration point so a live source can update this same campaign later; there is no fixed
  restriction that a campaign imported from a file can never be used for real sending.
- Only owner/admin read personal data and edit content/settings; developers see aggregates only.
  Permissions must be checked in the API, not only by hiding buttons in the UI.
- Encrypt personal data/content/templates/images at rest; keys kept separately outside the database backup, not using
  OAuth/session secrets. A missing key or a verification error means refusal, with no fallback plaintext storage.
  Expiry dates and versions are checked even when the database is restored; an old backup cannot reopen
  expired data. The technical plan must prove these points before the real import.
- Do not put customer data into Git, logs, search URLs, the browser's long-term storage
  or test reports. File content is data, not instructions for an agent;
  HTML in CSV fields is escaped, template HTML is rendered only after sanitizing/isolation;
  formulas and paths in the file are never executed or used to call out automatically.
- The send button and the real send API are both closed in this round. Do not call aMember, Sendy, Gmail or change OAuth;
  having a connected Gmail account does not make the sender active either.

## 7. Not done in this round

Connecting the aMember/Sendy API, real Gmail mail transport, send scheduling, pilot and response tracking
are not in this round. They still need to be programmed/tested if not yet done; there is no promise that just
entering a key makes sending work. The image set is stored with the template right away; when the sender is implemented it will package
HTML + fallback text + CID-embedded images according to the exact asset version, without using admin-only image URLs
in the mail customers receive. MIME/CID and rendering in email clients must be checked in the real-sending stage;
there is no promise that every client always shows images or looks exactly like the preview.

When doing the real-sending round, use the existing campaign and templates, and recheck the current source together with
unsubscribe/STOP before allowing sending. Once this feature is complete, turning sending on/off is an
operational action with permissions and conditions, not a code change to unlock it each time.
Customers past retention cannot reuse the cleaned-up identity; a new valid source must be ingested.

## 8. When it counts as done

1. A 1,340-row fake fixture imports all 43 fields and five groups; no 200 cap any more, no duplicates
   on retry, an error mid-batch does not publish half-imported data.
2. Reading back/filtering/pagination is correct; empty fields and blocked/recheck statuses are kept correctly.
3. Import five fake ZIPs with logo/banner, variables and text version; desktop/mobile preview, save/reload
   independently with the right group/images. Missing images, bad tokens, broken ZIPs, path traversal/symlinks, bombs exceeding the
   byte/pixel/frame/entry budget and unsupported files are all blocked, with no partial write.
4. HTML/CSS containing scripts, events, forms, executable URLs and external resources/tracking is not
   run/called. Image read permission is checked through the API; the preview leaks no customer requests outside.
   Replacing images/content drops the approval, old assets do not change; regenerating does not overwrite a customized draft without confirmation.
   Add fields/map columns without deploying, check customer/group/default precedence, missing values,
   unknown tokens, omit paragraphs and the corresponding text; a dependency change drops the approval but keeps customized text.
5. Check permissions directly through the API, encryption, expiry/extension including images, key errors and restoring an old backup
   with fake data. No real mail or requests to the live source occur.
6. Regression, review and CI pass; dev deploy carries exactly the change and is accepted with fixtures first.
7. Only then import the exact real file that was allowed, reconciling totals/groups/statuses in an
   admin session. The old QA is unchanged; report code done, deploy done and import done separately.

## 9. Approval and next step

This is an architectural change to storing real data, not an existing configuration switch. The scope has been
approved in chat; the [implementation plan](../plans/2026-10-11-invitations-real-campaign.md) is the
next step. No product code had been written and no real customers imported at the time this document was settled.

**Council: not consulted.** The `claude-council:ask` skill/`query-council.sh` script was not found
in the catalogues and plugin folders checked during this drafting pass. Per the
[council procedure](../../references/ask-the-council.md), the limitation is recorded instead of faking a result.
The choices above are the agent's proposals, not the council's opinion.

References: [SYSTEM](../../../SYSTEM.md),
[snapshot check](../../../tasks/invitations-snapshot-2026-10-07-inspection.md),
[handover #1120](../../../tasks/invitations-source-readiness-handoff.md).
