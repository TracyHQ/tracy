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
| `pending` | `[{ frame, kind, match, waitsFor, reason }]`: frames no step has filled yet, never a demo picture. `waitsFor` names the step: `picker`, `drawer` (no owner photo fits, or the picker answered "none"), `icons` or `cut-out`. A twin of a pending frame is pending for the same step. The picture check counts a pending frame as unfilled (P01). |
| `picks` | `[{ frame, photo, asset, reason }]`: one per frame the picker answers, in the order it was asked: the photo code it chose (or `"none"`, or `null` while unanswered), the brief asset that code names, and its reason. Empty when the run had no picker frame. |
| `refusedPhotos` | `[{ asset, reason }]`: brief assets no frame may take (not a still, lettering, another business, a label that is unknown, blurry, no bytes with its hash). |
| `altNotes` | `[{ frame, alt, seen, agrees, shared, note }]`: the writer's alt next to what the picture actually shows, compared by code (section 3b); filled only when a writer copy file is given to the run. |
| `usage` | `[{ asset, frames }]`: per brief photo, how many frames use it. |
| `cost`, `timing` | Objects keyed by role: `code` (always 0 USD; the time code took), `iconRanking` (the ranking call's cost as the provider reports it, 0 without a call, and its time in milliseconds), `looker` (the sum of the looks' costs as the provider reports them, or at the model's price when it reports none, and the sum of their times; section 3b), `drawer` (the sum of the drawings' costs and times; section 3c), and later background removal. The picker's cost is the cost of the run's turns, one row per call, with the provider balance before and after on the run. |
| `iconRanking` | `{ model, notes }`: the model that ranked the icon names (`null` when the shortlist order decided) and why it did not, when it did not (no `pictureIconRanker` door, the demo icons not read, no usable answer). |
| `drawer` | `{ model, door, promptSha256, count, calls: [{ frame, mode, attempt, sha256, model, ms, costUsd, cached, problem? }] }` (section 3c): the drawer door's model and snapshot (never the key), the drawing template's hash, how many entries are drawn or extended, one record per drawing. `cost.drawer` and `timing.drawer` are their sums. |
| `ladder` | `[{ frame, steps: [{ rung, outcome, detail }] }]`: every rung of the fallback ladder a frame took in the round (section 4), so the manifest says why a frame ended as it did. |
| `rows` | `[{ block, list, rows, from, dropped, reason }]`: lists the ladder made shorter (section 4), with the frames of the dropped rows. |

A frame entry:

| Field | Content |
|---|---|
| `frame` | The kit frame id. |
| `source` | `owner-photo`, `owner-photo-extended` (a real photo extended sideways by the image model), `drawn`, `icon`, `initials`, `hide` or `twin`. |
| `asset` | The brief asset id, for `owner-photo` and `owner-photo-extended`; `null` otherwise. |
| `icon` | `{ light, dark }` icon names, for `icon`. |
| `letters` | The initials, for `initials` (an entry of another source leaves it out). |
| `twinOf` | The source frame, for `twin` (an entry of another source leaves it out). A twin copies its source's file fields, `crop`, `enlarge`, `sharpness`, `darkened` and `recolourable`. |
| `writeDoor` | `"none"`, on every `siteSettings` entry only. |
| `file`, `width`, `height`, `sha256` | The cut file, its pixel size and hash. `null` file for `hide`. |
| `sitePath` | `images/tracy-content/<sha256>.<ext>`: where the write step uploads it. |
| `dark` | `{ file, width, height, sha256, sitePath }`, the dark version of an icon; `null` otherwise. |
| `crop` | `{ x, y, width, height }` on the original, or `null`. |
| `enlarge` | The scale applied to the crop (below 1 shrinks), or `null` when not cut from a photo. |
| `sharpness` | `{ passed, verdict, score, bar, width, reason, version }`, the sharpness gate measured by the step at the display size when the crop was enlarged or the photo is low quality, or `null`. |
| `darkened` | A dark overlay was baked in so the heading over it stays readable. |
| `overlay` | `{ colour, strength, before, after }` when `darkened`: the overlay's colour and opacity, and the picture's mean luminance (0 to 1) before and after. |
| `realPart` | `{ x, y, width, height }` on the file, for `owner-photo-extended`: the part that is the owner's own pixels. |
| `drawing` | `{ mode, attempt }` for `drawn` and `owner-photo-extended`: `scene`, `object` or `outpaint`, and 1 or 2 (the redraw). |
| `recolourable` | Initials and icons the write step may repaint in the brand colours. |
| `seen` | One sentence from the looker saying what the picture actually shows. |
| `looker` | The look of the picture (section 3b): `{ verdict: "pass" \| "fail", faults: [...], seen }`, the fault names from the fixed list; `{ verdict: "fail", faults: ["look unreadable"], seen: null, problem }` when the look could not be read twice. Absent when the frame is not looked at (icons, initials, hidden frames). |
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

### 3a. The picker (#342)

- **One call for the whole site**, through its own model door `picturePicker` (DeepSeek Flash on DeepSeek's own API by
  default, no tools). A run whose plan has no frame for the picker needs no door and calls no model.
- **Its input** is one user message: per frame that waits for the picker, the plan's words (shows, must include,
  avoid, mood, size, the frame's shape) and the code shortlist of photo codes; then each shortlisted owner photo once,
  as a thumbnail of at most 512 px tagged with its code (`P1`, `P2`, ... in the brief's order). Never a demo picture of
  the kit, never a brief asset id. The shortlist is every usable owner photo (section 3's code shortlist, no portrait of
  a person) that is not already shown on a page of the frame and that cuts well for it; each is cut before the call, so
  an answer is applied by lookup. A frame with an empty shortlist never goes to the picker and waits for the drawer.
- **Its answer** is `{ picks: [{ frame, photo, reason }] }`, a code from the frame's list or `"none"`. A pick naming
  another frame, a code outside the list, no reason, or a frame twice is invalid: it is sent back once, alone, and every
  valid pick is applied. `"none"` leaves the frame (and its twins) pending for the drawer.
- **Fix rounds** send back only the check failures of the frames the picker placed or left unanswered. Every other
  failure (frames code decided, frames waiting for the drawer, icons or cut-outs) is kept on the round's check result
  as `notForPicker` and never goes to the picker; when none is left for the picker the run ends.
- **The prompt** is `site-pictures/picker-prompt.md`, loaded once per process with its hash; the hash is recorded on
  the run (`prompts.picker`) and in the manifest's fingerprint. Every call records its cost (the price table) and the
  run records the provider balance before and after.

### 3b. The looker (#343)

- **One call per finished picture**, through its own model door `pictureLooker` (by default `openai/gpt-6-luna`
  through OpenRouter, as the brand step's reviewer), at most 4 at a time, each a fresh conversation: the looker prompt
  as system message and one user message with the plan's words for the frame (shows, mustInclude, avoid, mood) and the
  picture resized to fit the frame's display box (never enlarged). Never the picker's reason, the brief or another
  frame. Looked at: `owner-photo`, `owner-photo-extended` and `drawn`. Not looked at: icons and initials (code made them
  from a fixed library or letters), hidden frames, and twins, which take their source's look.
- **Extended photos** (`owner-photo-extended`, extending comes with #344): when the entry carries `realPart`, a box on
  the finished file, that box is outlined in magenta on the picture and the message says the outlined part is the
  owner's real photo, so the looker looks for a drawing seam at its border.
- **The looker is mandatory, and its model must be of another maker than the picker's** (the maker is the vendor
  prefix of the model id, else the provider). Like the picker's door, an unset, disabled or unreadable looker door, a
  model the provider says cannot read pictures, or the picker's maker refuses the run at its start
  (`SITE_PICTURES_LOOKER_UNSET`, `_DISABLED`, `_UNREADABLE`, `_MODEL_LACKS`, `_SAME_MAKER`) and again when a worker
  claims it, as does a door changed since the start (`SITE_PICTURES_LOOKER_CHANGED`). The run stores the door's
  snapshot as `door.looker`.
- **Its answer** is `{ verdict, faults, seen }`. The fixed fault list has seven names: the six the model may name
  (wrong subject, forbidden item, subject cut off, distorted face or body, stray lettering, visible drawing seam) and
  `look unreadable`, which only code records. A name outside the model's six is dropped and noted; any fault makes the
  verdict `fail`. The look is stored on the entry as `looker` (above) and its sentence as `seen`.
- **An unreadable look is asked once more.** A failed call or an answer out of form is retried once, both calls
  counted (a file gone from the store is not retried); still unreadable, the picture fails with `look unreadable`, so L01 never passes a
  picture nobody looked at. An unreadable look is not kept, so the next round asks again.
- **Rejections join the fix rounds.** A rejection is a failure of rule `L01` (the looker passes every finished picture)
  at the frame, its detail naming the faults and the seen sentence. L01 is added by the bench step to the round's
  picture check result, outside the frozen rules P01 to P13, so `site-pictures-check/1` is unchanged. The result is then
  split as in section 3a: a rejected frame the picker placed goes back in the next fix round with its fault names; any
  other rejection stays in `notForPicker` for the fallback ladder. The shared run loop checks a round synchronously and
  is not changed; the looks run where a checked round is saved (the step wraps its store's `saveRound`).
- **Recorded**: the manifest's `looker` holds the door's model and snapshot (never the key), the looker prompt's hash and
  one record per picture (frame, file hash, model, time, cost, cached). Each readable look is kept in the bench's file
  store by a hash of the picture, its display size, the words, the model and the prompt, so a later round or a resumed
  run pays once per picture.
- **The run's cost holds every role.** The run's `costUsd` adds the looks paid for (cached ones excluded) and the icon
  ranking call to the picker's turns; the round's cost stays the cost of its picker turns, and the split per role is in
  the manifest's `cost` and `timing`.
- **Alt notes**: a run started with a writer copy file (`--copy-file`, `site-copy/1`; only its alts, its hash and its
  name are stored on the run) gets one note per frame with both an alt and a seen sentence. The comparison is code,
  not a model call: both texts are cut into content words (lower case, three letters or more, common little words
  dropped, a plural or -ing ending trimmed); the alt `agrees` when at least one of its words, and at least a third of
  them, are in the seen sentence. The note lists the shared words, so a reader sees why.
- **The prompt** is `site-pictures/looker-prompt.md`, a draft until the owner approves real output, loaded once per
  process with its hash and recorded on the run (`prompts.looker`) and in the manifest's fingerprint.

### 3c. The drawer and dark frames (#344)

- **One call per drawing**, through its own model door `pictureDrawer` (by default
  `google/gemini-3.1-flash-lite-image` through OpenRouter, about 0.034 USD a picture), at most 4 at a time, each a fresh
  conversation with one user message: the fixed template `site-pictures/drawing-prompt.md` filled only from the plan's
  words for the frame (`shows`, `mustInclude`, `avoid`, `mood`, `size`) and nothing else, and the aspect ratio nearest
  the frame's shape as a request setting. The template's hash is recorded on the run (`prompts.drawing`) and in the
  fingerprint; it is a draft until the owner approves real output.
- **Modes**, chosen by code: `outpaint` for a wide band (shape at least 2 wide to 1 tall) when a usable portrait owner
  photo shows the frame's own offering (its `depicts` is one of the wish's facts) and no other frame on its pages shows
  it: the photo is placed in the middle of the band at the band's height (never enlarged), the model extends the grey
  sides, and code pastes the real photo back over the middle of the answer, so the real part is the owner's pixels
  (`realPart`, outlined for the looker, section 3b). Otherwise `object` for a frame whose kit role names an illustration
  or a product, else `scene`. The answer is fitted to the size the frame's picture is written at (the demo file's aspect,
  at least the display box).
- **Never** for an `any-real` or a `person` frame, and never for icon, logo or cut-out frames (background removal is its
  own step, #346): those frames never reach the drawer, whatever waits.
- **The door is mandatory when drawing may be needed**: a run whose plan has a frame for the picker refuses at its start,
  and again when a worker claims it, an unset, disabled or unreadable drawer door or a model its provider says cannot
  draw (`SITE_PICTURES_DRAWER_UNSET`, `_DISABLED`, `_UNREADABLE`, `_MODEL_LACKS`), and a door changed since the start
  (`SITE_PICTURES_DRAWER_CHANGED`). The run stores the door's snapshot as `door.drawer`.
- **Recorded**: each drawing's cost (the provider's figure, else its tokens at the model's price) on the manifest's
  `drawer.calls`, on its file row (`site_picture_file.cost_usd`) and in the run's `costUsd`. Each drawing is kept in the
  bench's file store by a hash of the mode, the text, the real photo, the size, the model and the template, so a later
  round or a resumed run pays once. A failed call is not kept.
- **Dark frames**: a kit frame shown as a background, or marked `textOver`, has text over its picture. Code tries the
  photos whose mean luminance is at most 0.42 first (`DARK_ENOUGH`); a placed, extended or drawn picture still brighter
  gets a black overlay baked in, its opacity the least that brings it to that level, between 0.15 and 0.6, recorded as
  `overlay` with `darkened: true`. The looker sees the darkened picture.

### 4. Fix rounds and the fallback ladder

Looker rejections and check failures go back to the picker for the failing frames only, with the fault names. At most
**2 fix rounds**. Then, per frame, a fixed ladder:

1. a `specific` frame is drawn (one redraw with the fault names);
2. an `any-real` frame takes the next photo, then the row count drops or the frame is hidden;
3. a drawing still rejected is hidden when the kit allows hiding;
4. a frame that cannot be hidden is returned to the planner.

A `person` frame never enters the drawing steps: no confirmed portrait means initials. A demo picture is never kept in
a frame the plan asked to fill.

How it runs (#344, `site-pictures/ladder-step.js`). Every checked round is finished where it is saved (the shared run
loop is unchanged): the frames waiting for the drawer are drawn, dark frames darkened, every picture looked at, and
each rejected frame climbs one rung, after which the changed pictures are looked at again, until no rejected frame can
climb. The rungs, in order:

| Rung | Who climbs it | What it does |
|---|---|---|
| draw | `specific` | the drawer draws or extends (section 3c) |
| redraw | `specific` | once more, the template's redraw part naming the looker's faults |
| next photo | `specific`, `any-real` | code cuts the next owner photo in the any-real order (darker first in a dark frame) not yet tried and not on the frame's pages; at most 2 per frame |
| fewer rows | `specific`, `any-real` | the frame's list row is dropped when the kit lists the list, its rows are not content items of their own, one fewer is still at least its `min` (1 when none), and every frame of the row may hide; the row's frames are hidden and the list's new count is in `rows` |
| hide | every match | the frame is hidden when the kit allows hiding and it is not a template setting |
| return | every match | the frame is returned to the planner (`returns`) |

A `person` frame climbs only hide and return (no other person's photo, never a drawing). A frame waiting for the drawer
starts at draw; a frame code placed starts at its first rung after the placement; a frame the picker placed climbs only
in the last round (no picker round follows), from draw, when the looker rejects it or it still fails the check. A look
that could not be read is no rejection: the picture fails L01 and the next round asks again. Each rung is recorded in
`ladder` and the entry's reason.

## Consequences

- The picture bench (#336), the mapping export and the write step read one stable manifest shape.
- Every threshold above is a named constant; changing one is a deliberate new checker version.
- Picture quality beyond these rules (does it look right) stays with the owner reading the reading page.
