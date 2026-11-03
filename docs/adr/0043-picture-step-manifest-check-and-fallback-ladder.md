# 0043. Picture step: the site-pictures/1 manifest, the picture check and the fallback ladder

Status: (binding) for the manifest shape and the check; the picture bench itself follows in #336.

Builds on [ADR 0041](0041-site-planner-trial-bench-in-ops.md) (the site planner bench and its plan checker) and
[ADR 0042](0042-site-writer-trial-bench-copy-contract-and-check.md) (the writer bench, its copy check and the shared
bench run loop).
Spec: #336. This ADR is the part that stands alone and is frozen first: the file the picture step produces, the
script that grades it, who does which part of the work, and what happens when a frame cannot be filled.

## Context

The site plan describes every picture frame in words only: what it shows, what it must include and avoid, its mood
and size, and whether any real photo will do (`any-real`), a specific scene is needed (`specific`) or one named
person is shown (`person`). Nothing turns those words into files. Earlier attempts placed pictures inside the build
and hit eighteen kinds of defects: demo pictures left behind, the wrong trade in a card, heads cut off, small photos
blown up until blurry, photos with lettering or another business's marks, the same photo twice on a page, invented
faces for staff, drawn people with distorted hands, jagged cut-outs over the headline, and empty hero frames. The
owner's photos rarely fit the template's frames: most are small and portrait while the frames are wide.

## Decisions

### 1. The picture manifest is `site-pictures/1`

One JSON object written by the picture step, beside the picture files it cut. The step writes files only, never to a
site. The shape is defined once, in `apps/tracy-web/src/site-pictures/manifest-shape.js` (`readPictures`), and every
reader uses that module.

| Key | Content |
|---|---|
| `version` | `"site-pictures/1"` |
| `fingerprint` | `{ kit, planSha256, briefSha256, prompts: { picker, drawing, looker } }`: the kit id and 64 character hex hashes of the plan, the brief and the three prompts. |
| `frames` | One entry per planned kit frame id (see below), plus one per twin of a planned frame. |
| `siteSettings` | Template level pictures (the body background painted behind blocks), same fields plus `writeDoor: "none"`: no write door exists yet. |
| `returns` | `[{ frame, reason }]`: frames the step cannot fill (or the kit marks not writable), for the planner. |
| `altNotes` | `[{ frame, alt, seen }]`: the writer's alt next to what the picture actually shows; filled only when a writer copy file is given to the run. |
| `usage` | `[{ asset, frames }]`: per brief photo, how many frames use it. |
| `cost`, `timing` | Objects keyed by role (picker, drawer, looker, background removal, icon ranking). |

A frame entry:

| Field | Content |
|---|---|
| `frame` | The kit frame id. |
| `source` | `owner-photo`, `owner-photo-extended` (a real photo extended sideways by the image model), `drawn`, `icon`, `initials`, `hide` or `twin`. |
| `asset` | The brief asset id, for `owner-photo` and `owner-photo-extended`. |
| `icon` | `{ light, dark }` icon names, for `icon`. |
| `letters` | The initials, for `initials`. |
| `twinOf` | The source frame, for `twin`. |
| `file`, `width`, `height`, `sha256` | The cut file, its pixel size and hash. `null` file for `hide`. |
| `sitePath` | `images/tracy-content/<sha256>.<ext>`: where the write step uploads it. |
| `dark` | `{ file, width, height, sha256, sitePath }`, the dark version of an icon; `null` otherwise. |
| `crop` | `{ x, y, width, height }` on the original, or `null`. |
| `enlarge` | The scale applied to the crop (below 1 shrinks), or `null` when not cut from a photo. |
| `sharpness` | `{ passed, ... }`, the sharpness gate measured by the step at the display size, or `null`. |
| `darkened` | A dark overlay was baked in so the heading over it stays readable. |
| `recolourable` | Initials and icons the write step may repaint in the brand colours. |
| `seen` | One sentence from the looker saying what the picture actually shows. |
| `reason` | Why this picture, or why hidden. |

Twins (a kit frame with `twinOf`, the light or dark copy of another frame, and a plan frame with `sameAs`, a second
frame of one item showing the same file) are written with source `twin` and follow their source frame.

The mapping export (a later ticket) turns the manifest into the fill table the existing Joomla write door takes: kit
`block-` ids become content map `module-` keys, values are the `sitePath`s, plus an upload list and the
`siteSettings` section. The bench never uploads.

### 2. The picture check is `site-pictures-check/1`

A pure module, `checkPictures({ pictures, plan, kit, brief, files, icons })`, in
`apps/tracy-web/src/site-pictures/picture-check/`. Same calling shape and result shape as the plan and copy checks:
`{ meta, inputErrors, summary, rules: [{ id, title, status: pass|fail|skip, cause, causes, failures: [{ where,
detail, cause }], notes }] }`, and the same `failureListText(result)`, one line per failure, `<rule id> | <title> |
<where> | <detail>`. It never throws and reads no file itself:

- `kit` is the template kit with its content map slots under `kit.contentMap.slots` (the content map file beside it),
  which the bench joins before calling the check.
- `files` maps a file path to `{ sha256, width, height }` (an object, a Map or a function): the step measures its own
  files once, so the check and its tests never decode an image.
- `icons` is the list of names in the icon library. It is optional; without it P10 checks only the files and says so
  in a note.

A malformed manifest entry is left out and reported under P01 (cause `shape`); the rules run on the valid entries.
Bump `CHECKER_VERSION` on any change to a rule, a threshold, a failure text or the result shape. The rule set is frozen
before the first paid run.

| Rule | Fails when |
|---|---|
| P01 | a planned frame is not covered exactly once by `frames`, `siteSettings` or `returns`; a frame that is neither planned nor a twin has an entry; the file does not match section 1 |
| P02 | a frame id does not exist in the kit |
| P03 | a file does not exist, its sha256 or pixel size differs from the manifest, or its site path is not named by its hash |
| P04 | the file's aspect differs from the site's demo file aspect by more than 0.02, or the file is smaller than the frame's display box |
| P05 | a picture is enlarged more than 1.5 times; an enlarged picture or a low quality owner photo has no passed sharpness gate; a low quality owner photo fills a frame larger than a small one |
| P06 | one photo is shown twice on one page |
| P07 | an `any-real` frame holds a drawn or extended picture |
| P08 | a `person` frame holds anything but a brief photo labelled as that person's portrait, initials, nothing, or a twin of another frame (judged by P11) |
| P09 | an owner photo's brief labels show lettering or another business, a label is unknown, or the asset is not in the brief |
| P10 | an icon lacks its dark file, or an icon name is not in the library |
| P11 | a twin does not name the frame it follows or holds another file than it (it may be hidden when its source is hidden or returned), or a writable kit twin of a placed frame has no entry |
| P12 | a frame is hidden where the kit does not allow hiding; a placed file is a demo picture of the template |
| P13 | a frame the kit marks not writable holds a picture in `frames`; a `siteSettings` entry is not a picture painted behind blocks |

Thresholds and readings (named constants in the code):

- **P04 aspect reference.** The size of the demo file the site holds for the frame: the content map slot's
  `fit.source` (slot key `module-` for kit id `block-`), else the size in the slot sample's image URL. Not the kit
  frame's display box: a template often shows a crop of a wider file, and the write door compares with the file
  (`ASPECT_TOLERANCE` 0.02). The comparison is the absolute difference of the two width / height ratios, the form
  `drawHeroes` and `drawPicture` (tracy-seeder) use against the demo file; 0.02 is the Joomla plugin's own aspect check.
  Absolute is loose for very wide bands: at an aspect of 4, 0.02 is half a percent of the ratio. A frame with no demo file size (a template setting picture) is noted, not failed. The
  size floor is the kit frame's `width` and `height` on both sides; a file failing both is reported twice.
- **P05 sharpness.** `MAX_ENLARGE` 1.5. The check does not analyse pixels: the picture step measures sharpness at the
  real display size and records the result in `sharpness`; the check reads `enlarge`, `sharpness.passed` and the brief
  asset's `quality`. A `quality: low` owner photo fills only a small frame, whose display box has no side longer than
  `SMALL_FRAME_MAX` (600 px; gallery tiles are about 450), even when the gate passed.
- **P06 identity.** An owner photo is its brief asset, whatever the crop; a drawn picture is its file hash. A shared
  block counts on every kept page. Twins, icons, initials and hidden frames are not counted.
- **P08 portrait.** The brief asset's `portraitOf` id must be the plan's `person` fact id, or an id that fact names
  for its person. No face recognition anywhere.
- **P09 labels.** The brief asset labels `hasTextOrWatermark` and `showsOtherBusiness` (true, false or null). When a
  label is absent, the vision label names are read instead (`textPresence`, `hasTextOverlay`; `otherBusiness`). A label
  that is null or absent is unknown and fails with "label unknown": the picker never uses an unlabelled photo.
- **P11 icons.** A twin of an icon may hold its source's light or dark file.
- **P12 demo leftovers.** A placed file whose path equals a kit demo picture path, or whose hash equals a demo hash
  the kit records (`pictureSha256`).

### 3. Code and AI split the work

- **Code** shortlists candidates per frame (big enough, sharp enough, no lettering, no other business), fills
  `any-real` frames from labels (same offering first, unused first, never drawn), matches icons from the icon library
  (a cheap text model only ranks the shortlist, never invents a name), cuts every picture around its subject and faces,
  measures sharpness at display size, enforces no repeat on a page, copies twins, renders initials, and checks the
  manifest with the picture check.
- **The picker** (one call for the whole site) looks at the owner's photos once, as labelled thumbnails, and chooses a
  photo for every `specific` frame. It never sees the kit's demo pictures.
- **The drawer** (an image model) draws only where a `specific` picture is needed and no owner photo fits, from a fixed
  template with the plan's fields, or extends a real photo sideways for a wide band. It never draws a person frame.
- **Background removal** cuts the owner's photo for cut-out frames; code checks the alpha coverage against the
  subject box.
- **The looker** (a model of another maker than the picker) checks every finished picture alone, in a fresh context,
  against the plan's words, with a fixed list of fault names (wrong subject, forbidden item, subject cut off, distorted
  face or body, stray lettering, visible drawing seam), and writes the `seen` sentence. It never sees the picker's
  reasons.

### 4. Fix rounds and the fallback ladder

Looker rejections and check failures go back to the picker for the failing frames only, with the fault names. At most
**2 fix rounds**. Then, per frame, a fixed ladder:

1. a `specific` frame is drawn (one redraw with the fault names);
2. an `any-real` frame takes the next photo, then the row count drops or the frame is hidden;
3. a drawing still rejected is hidden when the kit allows hiding;
4. a frame that cannot be hidden is returned to the planner.

A `person` frame never enters the drawing steps: no confirmed portrait means initials. A demo picture is never kept in
a frame the plan asked to fill.

## Consequences

- The picture bench (#336), the mapping export and the write step read one stable manifest shape.
- Every threshold above is a named constant; changing one is a deliberate new checker version.
- Picture quality beyond these rules (does it look right) stays with the owner reading the reading page.
