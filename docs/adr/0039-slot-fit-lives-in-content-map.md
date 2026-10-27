# ADR 0039 — Slot fit lives in the content map, measured at capture; a picture's keep flag follows its measured kind

- **Status:** (binding)
- **Date:** 27/10/2026
- **Decided by:** Akemi (COO), 27/10/2026, after a site built from a business brief broke the JA Boxing layout.

## Context

1. **A content map says a slot holds a picture, not what shape.** JA Boxing j6 1.0.5 declares 257 picture slots and 0
   of them say their box, their kind (photo, icon, logo, cut-out) or whether the picture needs a transparent ground. A
   build placed phone portraits whole into wide class cards and icon slots; sections grew up to 133% taller.
2. **Most picture slots were marked kept.** 198 of the 257 carry `customize: "keep"`. They are the slots
   `capture-contract.py --full-coverage` adds (article intro and full pictures, template extra fields such as
   `learning_thumb`, `feature_img`, `exer_img`, user avatars, site-setting logos, ACM fields named like options), and
   that rule marks every slot it adds as kept: right for words (a class time a model writes is an invented fact),
   wrong for a class photo. Without a render the capture cannot tell a class photo from an icon, so it kept them all.
3. **Capture already renders the demo.** The content coverage audit opens every page at desktop and phone width and
   matches 110 of 111 demo pictures to their slots, with the box each is drawn in. It did not keep those boxes.
4. **The build guesses instead.** The picture planner (`pictures/slot-map.mjs`, wave 1) protects a picture by its name
   and treats any PNG not proven opaque as a cut-out; the Claude Cowork write check knows only png, jpg, webp and an
   aspect within 2%.
5. **A released content map cannot change** (ADR 0038, context 8).

## Decision

1. **Slot fit is declared in the content map, on each text and image slot** (`fit`), with `slotFitVersion` and
   `fitGroups` at the top level. The shape is documented in
   `packages/wo/website-opportunities/domain/content-map-fit.mjs`:
   - a picture: `kind` (photo, video-poster, logo, icon, avatar, avatar-group, signature, cutout, decoration, map),
     `replace` (photo, logo, keep: what a build may put there), `transparent` (measured on the demo file), `source`,
     `boxes` per viewport, `aspect` with `tolerance` 0.02, `minWidth` (1.5 x the widest box), `crop` and `focus`;
   - a text: `boxes`, `lines` and `maxChars` per viewport, `maxCharacters` (the smallest), `casing`, and
     `overflow: "rewrite"` (a longer text is written shorter, never cut with an ellipsis);
   - a slot no page shows: `measured: false` (a picture adds what its file says);
   - a group collection: how many items the demo shows, whether its photos share one shape, and `whenFewer: "neutral"`
     (ADR 0037: the layout stays, a missing item takes neutral words).
2. **Slot fit is measured, never written by hand.** The content coverage audit runs with `--fit`: it measures each
   box, each picture file's size and transparency (corner alpha, as `demoTransparency` reads a file) and each text's
   lines and characters per line, and a rule table in the domain (`pictureKindOf`) names the kind.
3. **A picture's keep flag follows its measured kind.** `replace: "keep"` kinds get `customize: "keep"`; photos and
   video stills lose it; a logo keeps what capture said (the business logo replaces it through its own door). The
   capture's blanket keep for pictures is provisional until the fit is measured. The contract check refuses a map whose
   flag and kind disagree. Words keep the capture's rule.
4. **Readers prefer the declaration.** The shared contract reader (`readSlotRoles`) returns `fit` beside the roles; the
   picture planner and the agent demo take a declared kind, transparency and box before any name or file guess.
5. **The contract check validates Slot fit** (gate `slot-roles`): a map that declares it must carry a well-formed fit
   on every text and image slot; a map without it is counted, not refused.
6. **Released contracts are never edited.** Slot fit enters a template's content map with its next contract version.
7. **The Road to live holds Publish for a new release whose content map has no Slot fit, and only warns for a live
   one**, the same mechanism as roles in ADR 0038, as a fourth group of Content coverage.

## Consequences

- The quickstart-contract skill runs the coverage audit with `--fit --write`; the map is written before
  `content-coverage.json`, so the coverage file names the map with its fit.
- JA Boxing gets Slot fit with its next contract version; 1.0.5 and 1.0.6 stay as released.
- Only the Joomla audit exists, so WordPress and EmDash contracts get Slot fit when their audit does.
- The Claude Cowork plugin can return `fit` with its slot list once it ships a contract that has one; its write check
  can then refuse a picture of the wrong shape or an opaque picture in a cut-out slot.
- Decision 7 lands in a follow-up change: until then a release without Slot fit is not held.

## Alternatives rejected

- **Declare fit by hand per template.** Slow, and a person cannot read a box at phone width from the admin.
- **Keep guessing at build time.** A PNG class photo then counts as a cut-out and a JPEG drawn at icon size as a photo.
- **Drop the keep flag from every captured picture.** Icons, signatures and avatar strips would then be replaced.
- **Put fit into released maps.** Every site bound to them would be locked out of editing (ADR 0038, context 8).
