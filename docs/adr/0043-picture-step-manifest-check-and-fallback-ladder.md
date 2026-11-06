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
| `icon` | `{ light, dark, set, weight }` for `icon`: the icon names, the icon set with its version (`@phosphor-icons/core@2.1.1`) and the weight, enough to draw the icon again from data alone. |
| `letters` | The initials, for `initials` (an entry of another source leaves it out). |
| `twinOf` | The source frame, for `twin` (an entry of another source leaves it out). A twin copies its source's file fields, `crop`, `enlarge`, `sharpness`, `darkened`, and its `paint` and `preview` when the source is painted (section 1a). |
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
| `paint` | The colour recipe of `initials`, `icon` and their twins, in colour roles only, never a colour value (section 1a); absent on every other entry. |
| `preview` | `true` on every painted entry: its file is a preview in a neutral palette, not the picture the site gets. Absent otherwise. |
| `backdrop` | On a `drawn` cut-out whose demo picture has one: `{ shape, paint, preview }`, the disc and bands the demo has behind its figure, in shape units and colour roles (section 1a). Absent otherwise. |
| `seen` | One sentence from the looker saying what the picture actually shows. |
| `looker` | The look of the picture (section 3b): `{ verdict: "pass" \| "fail", faults: [...], seen }`, the fault names from the fixed list; `{ verdict: "fail", faults: ["look unreadable"], seen: null, problem }` when the look could not be read twice. Absent when the frame is not looked at (icons, initials, hidden frames). |
| `filledBy` | `{ rung, faults }` when a rung that keeps the frame from being left without a picture filled it (section 4): `redraw-alt` (another composition, `faults` empty) or `best-rejected` (a picture the looker rejected for minor faults only, `faults` naming them). Absent otherwise. |
| `reason` | Why this picture, or why hidden. |

Twins (a kit frame with `twinOf`, the light or dark copy of another frame, and a plan frame with `sameAs`, a second
frame of one item showing the same file) are written with source `twin` and follow their source frame.

The mapping export (a later ticket) turns the manifest into the fill table the existing Joomla write door takes: kit
`block-` ids become content map `module-` keys, values are the `sitePath`s, plus an upload list and the
`siteSettings` section. The bench never uploads.

### 1a. Colour roles: initials and icons are painted when written (owner decision 04/11/2026)

The picture step never bakes a brand colour into an initials tile or an icon. It runs beside the brand step, so the
only accent it knows is the template's (measured on a real run: a padel club's trainer tiles came out in the boxing
template's red), and even the right colour baked into a file goes wrong as soon as the customer changes the Design
system. So the colour of a painted picture is a ROLE, resolved when the site is written.

- **The roles** (`lib/picture-paint/paint.js`, the smallest set that covers the template's demo icons and tiles):
  `accent` (the Design system accent), `on-accent` (words on the accent), `text` (the dark neutral of body text),
  `on-dark` (the light neutral of words on a dark ground), `surface` (the dark surface of the Design system, the
  ground of its dark sections; a cut-out backdrop's disc).
- **Initials**: `paint: { background: "accent", foreground: "on-accent" }`, with `letters`.
- **Icons**: `paint: { light: { glyph, plate }, dark: { glyph, plate } }`, `light` for the entry's `file` and `dark`
  for its `dark` file. A glyph's role is measured from the kit's demo icon: the template accent or close to it is
  `accent`, any other ink the neutral of its lightness; with no demo to read, `accent`. The other theme flips a
  neutral (`text` and `on-dark`) and keeps the accent, unless a kit twin's own demo says otherwise. `plate` is `null`
  or the demo's disc or tile as `{ role, opacity, radius, box, glyph }` (shape and place, never its colour). A twin's
  paint adds `holds: "light" | "dark"`, the variant its file is.
- **Files are previews**: drawn in a neutral stand-in palette (slate accent, white, near black, near white), marked
  `preview: true`. Neutral on purpose: a preview in the template accent reads as a decision on the reading page and
  could be shipped by mistake. The check grades their size and hash as for any file; no rule and no look judges their
  colour (initials and icons are not looked at).
- **The shape check fails** an initials or icon entry without a recipe, a role that is not in the list (a hex value
  above all), a plate that names a colour, a painted entry not marked `preview`, an icon twin without `holds`, and a
  recipe on any other source.
- **What step 9 receives**: the mapping export leaves painted frames out of `changes` and `uploads` and lists them
  in `painted`, one item per frame: `{ frame, key, kind, paint, holds, draw, width, height, preview, previewDark }`,
  `draw` being `{ letters }` or `{ icon, set, weight }` (a twin's from its source). Step 9 chooses: where the slot
  takes HTML, markup that uses the Design system accent variable; where it only takes an image path, a file drawn from
  the brand's colours, recorded so it is drawn again when the Design system changes. `painted` is the one record of a
  painted frame (it replaces the earlier `recolourable` list). A painted template setting keeps its recipe in
  `siteSettings`.
- **The backdrop behind a cut-out figure** (owner decision 04/11/2026): some demo cut-outs bake a graphic into the
  picture behind the figure (JA Boxing's hero figure, `images/joomlart/hero/item-2.png`, 768x800: a near-black disc
  filling the width, centre at 0.5 / 0.52 of the picture, and three red chevron bands at 45 degrees in its lower part,
  speckled darker). The drawn figure is cut out alone and looks bare without it, so code draws it again
  (`cutout-backdrop.js` reads it, `cutout-backdrop-draw.js` draws it). It is read from the frame's demo picture only
  when that picture has transparent corners, a disc of one near-uniform colour filling at least 97 percent of its
  inside, and, for the bands, pixels in the accent's hue on both sides of the figure that line up at one angle; any
  other demo gets no backdrop (`backdrop` absent): code never invents one. The entry's `backdrop` is
  `{ shape: { circle: { x, y, r }, stripes: null | { pattern: "chevron", angle, apex: { x, y }, band, gap, count,
  texture: null | { kind: "speckle", share, shade } } }, paint: { circle, stripes }, preview }`: the disc in fractions
  of the picture (radius of its width), the bands in disc radii from its centre, the disc's role `surface` (or the
  role its colour measures as), the bands' role `accent`. The placed file stays the figure alone (transparent).
  `preview` is a review composite, the figure over the backdrop, `{ file, width, height, sha256, drawnIn, preview:
  true }`: the disc in the neutral palette and, by owner decision, the bands in the template accent so the owner can
  judge them (`drawnIn` names both); it is kept with the run's files and never uploaded. The mapping export places
  the figure as usual and adds a `painted` item of kind `backdrop`, `draw: { backdrop: <shape>, figure: <site path> }`:
  step 9 paints the backdrop in the brand's colours behind the figure. The shape check fails a backdrop on any other
  source, a role that is not in the list, and a preview not marked as one.

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
  block counts on every kept page. Twins, icons, initials and hidden frames are not counted. The only repeat allowed is
  a gallery tile's reuse (section 4): marked `reuse`, not next to the other showing, the cuts sharing at most 30%
  (reuse rung) or not the same cut (any-photo rung).
- **P08 portrait.** The brief asset's `portraitOf` id must be the plan's `person` fact id, or an id that fact names
  for its person. No face recognition anywhere.
- **P09 labels.** The brief asset labels `hasTextOrWatermark` and `showsOtherBusiness` (true, false or null). When a
  label is absent, the vision label names are read instead (`textPresence`, `hasTextOverlay`; `otherBusiness`). A label
  that is null or absent is unknown and fails with "label unknown": the picker never uses an unlabelled photo.
- **P11 icons.** A twin of an icon may hold its source's light or dark file.
- **P12 gallery tiles.** A hidden gallery tile fails unless its row is one the ladder dropped (`rows[].dropped`).
- **P12 demo leftovers.** A placed file whose path equals a kit demo picture path, or whose hash equals a demo hash
  the kit records (`pictureSha256`).

### 3. Code and AI split the work

- **Code** shortlists candidates per frame (big enough, sharp enough, no lettering, no other business), fills
  `any-real` frames from labels (same offering first, unused first, never drawn; a photo that cuts well for a frame
  waiting for the picker on one of the frame's pages is tried last, so a small frame shown on every page does not
  take the only photo a large `specific` frame can be cut from), matches icons from the icon library
  (a cheap text model only ranks the shortlist, never invents a name), cuts every picture around its subject and the
  people's heads (below), measures sharpness at display size, enforces no repeat on a page, copies twins, renders initials, and checks the
  manifest with the picture check.
- **The picker** (one call for the whole site) looks at the owner's photos once, as labelled thumbnails, and chooses a
  photo for every `specific` frame. It never sees the kit's demo pictures.
- **The drawer** (an image model) draws only where a `specific` picture is needed and no owner photo fits, from a fixed
  template with the plan's fields, or extends a real photo sideways for a wide band. It never draws a person frame.
- **Cut-out frames** (#346, section 3d) are drawn by the drawer on a flat plain ground of one known colour, and code
  removes that ground. No model removes a background, and no owner photo is cut out.
- **The looker** (a model of another maker than the picker) checks every finished picture alone, in a fresh context,
  against the plan's words, with a fixed list of fault names (wrong subject, forbidden item, subject cut off, face cut,
  distorted face or body, stray lettering, visible drawing seam; on a cut-out also rough cut-out edge, leftover ground, missing
  part, covers the text), and writes the `seen` sentence. It never sees the picker's reasons.

- **A file is never narrower than the kit's minimum** (card AI, owner decision 06/11/2026). A content map slot's
  `fit.minWidth` is the narrowest file the write door takes (SlotFit checkPicture, `SLOT_IMAGE_TOO_SMALL`). The index
  carries it on the frame; every cut and every drawing for the frame is written at least that wide (`outputSizeFor`),
  and an owner photo region narrower than it is refused (`narrower-than-min-width`), never enlarged to reach it, so the
  ladder moves on to the next photo, the drawing or the rungs after. The mapping export leaves a narrower file out as a
  problem, and the write step's package check (`packageItems` with the content map) names any that still gets through.
- **A cut never takes off a head** (`site-pictures/head-boxes.js`). The brief's face boxes are tight (brow to chin)
  and often a little low, and a person seen from behind has none. The cut keeps whole a head box grown from every
  face box (1.2 face heights above, 0.3 below, 0.3 face widths each side) and, when the labels count more people than
  faces, the top of the subject box (its top 30%, from 5% of the photo above it), where standing people hold their
  heads. When no crop of the frame's shape holds them all, the photo is refused (`cuts-a-face`) and the frame takes
  another photo. Real run 4 measured why: a square gallery cut of a tall photo of two players kept the labelled face
  box flush at its top edge and took off both heads; on its twenty owner photos, 4 of 15 square cuts took off a head
  before, none after. An `any-real` frame may lose as much of a photo as a wide band (`WIDE_MAX_LOSS`), only when the
  labelled subject and every head stay whole. The recorded `crop` is the region cut (one rectangle, used for both).

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
- **An `any-real` frame is never failed for its scene** (spec #336): a gallery, background or atmosphere frame takes
  any real owner photo that fits it, so the message says the frame accepts any real photo of the business, its words
  carry only `match`, `avoid` and `mood` (never `shows` or `mustInclude`), and `wrong subject` is left out of the faults
  it may name. Code drops `wrong subject` for such a frame if the model names it anyway (noted like a name outside the
  list), and a fail that named nothing else passes, so a model slip cannot hide a real photo. Every other fault still
  fails it: a thing to avoid, stray lettering or another business's branding, a distorted face or body, a face cut (a
  person's head or face cut by the frame edge, which fails every picture frame), no clear subject (the crop shows only
  background such as foliage, a fence, a wall, sky or empty ground; distinct from `wrong subject`, which compares the
  picture with the plan's words and is never named for an any-real frame), a crop that leaves no readable subject. Sharpness and darkness under text are code's gates (the sharpness gate when a photo is
  cut, the dark overlay), not the looker's. A `specific` frame keeps the full subject check. Real run 3 measured why:
  every owner photo placed in a six-frame gallery shown on every page was rejected, mostly as `wrong subject`, and the
  site ended with no owner photo. One look per picture stays, with one retry only for an unreadable answer; no voting.
- **Its answer** is `{ verdict, faults, seen }`. The fixed fault list has nine names: the eight the model may name
  (wrong subject, no clear subject, forbidden item, subject cut off, face cut, distorted face or body, stray lettering, visible drawing
  seam) and `look unreadable`, which only code records. A name outside the model's eight is dropped and noted; any fault makes the
  verdict `fail`. The look is stored on the entry as `looker` (above) and its sentence as `seen`.
- **An unreadable look is asked once more.** A failed call or an answer out of form is retried once, both calls
  counted (a file gone from the store is not retried). The answer's token cap (4000) leaves room for a reasoning
  model's thinking, which counts against it (gpt-6-luna measured 300 to 900 reasoning tokens before a 50 token
  answer; a cap of 600 cut about one look in five off); an answer cut off at the cap says so. Still unreadable, the picture fails with `look unreadable`, so L01 never passes a
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
- **Never** for an `any-real` or a `person` frame, and never for icon or logo frames: those frames never reach the
  drawer, whatever waits. A cut-out frame is drawn in its own mode (section 3d).
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

### 3e. Text over a picture and the template overlay (owner decision 04/11/2026)

- **Why.** On JA Boxing the call-to-action band (block-161.2, 1440 x 512) has its heading, notice and button over its
  picture, and the template lays `.acm-cta.style-1:before { background: rgba(0,0,0,.8) }` over whatever picture is
  there. The kit says `overPicture: false` for that frame, so the picture step neither preferred a dark photo nor knew
  that 80% black already darkens it, and the reading page showed the picture without the overlay.
- **Not from the plan, not from the kit.** The plan states what a picture shows, not what the template paints over it;
  the kit and its tool are not changed for this (owner decision 04/11/2026). The answer is picture step data, the
  **frame surface**, computed once per kit version and quickstart installer and kept in the bench's file store
  (`kit-surface/<kit>/<installer sha256>.json`, `frame-surface/1`), joined into the kit's frames when a run is prepared.
- **Text over (`textOver`, `textOverFrom`).** The kit's own word is kept when it says yes (`overPicture`, a frame shown
  as a background, `textOver`). Where it says no, code derives it: the frame's box fits inside its block's measured box
  and covers at least 85% of it, and the block has text (a text slot, demo text, a text row slot or a link). On JA Boxing
  1.0.10 that flips two frames: the hero picture block-156.0 and the band picture block-161.2.
- **Template overlay (`templateOverlay`).** Read from the quickstart installer the contract names (sha256 checked): the
  content map slot gives the ACM field and module, the module's demo data row its layout, the layout's PHP markup the
  element carrying the picture (a tag whose style prints it: that tag; an img src: its parent). The template's
  stylesheets (outside `@media`, or in a min-width query a 1440 page meets) are searched for a covering `::before` or
  `::after` of that element with a colour or gradient background (a gradient counts its clearest stop), or a
  `filter: brightness()` on it or its img. A rule that needs anything the module does not print (a body class, a theme
  attribute, `:hover`) is left out. Result per frame: `{ colour, strength, from }`, `null` (the template paints none)
  or `"unknown"` (the element could not be read: article pictures, icons printed by a helper, a frame with no content
  map slot), never a guess. On JA Boxing (measured on the 1.0.8 installer, the base 1.0.10 is built from; the rule is
  the same in the 1.0.10 template source): 2 frames with an overlay (block-156.0 `.acm-hero.style-1:before` and
  block-161.2 `.acm-cta.style-1:before`, both 80% black), 36 with none, 226 unknown.
- **Use.** A frame with text over its picture and no template overlay of at least 0.45 (`OVERLAY_COVERS`) prefers dark
  photos and gets the dark overlay baked in (section 3c). A frame whose template overlay is at least 0.45 is never
  darkened again and never prefers dark photos. The looker is told when a template overlay covers the picture (do not
  judge its brightness) and, when text sits over it with no overlay, may name `text would not read`; code drops that
  fault on any other look. Every manifest entry records `textOver` and `templateOverlay`; the shape check holds them.
- **Behind the title (`behindTitle`).** The JA Boxing class-article layout (`html/com_content/article/classes.php`)
  copies the article's `.item-image img` into `.bg-mask`, so the article's full text picture also shows dimmed behind the
  page title. Found from the quickstart (a layout whose script does this, a menu item opening a category with that
  layout, a full text article image on a kit page under its path): article-2.6, 14.6, 15.6 and 16.6. Shown on the
  reading page only.
- **Reading page.** `--surface <frame-surface.json>` (scripts/site-pictures-frame-surface.mjs writes it): "Our picture
  in the box" draws the template overlay over the pasted picture, and each card says whether text sits over it.

### 3d. Cut-out frames (#346)

A trial showed a background removal model needs too much memory and never cuts racket strings, so there is none. A
cut-out frame (kind `cutout`) is filled by drawing:

- **Drawn on a plain ground**: a `specific` cut-out frame is drawn through the drawer door in mode `cutout`, the
  template's `cutout` part (`drawing-prompt.md`, hashed with the rest into `prompts.drawing`): one figure, whole, on a
  completely flat ground of one named colour, no shadow, nothing of that colour in the figure. The figure is the hero:
  it fills about 90% of the picture's height with a small margin above and at its sides (it may stand on the bottom
  edge), as an athlete of the sport the wish names, in that sport's sportswear and a confident active stance, under
  strong directional studio light (a rim light is allowed, the ground stays one flat colour, with no cast shadow
  under the feet). It does what the wish says the figure does and how it holds things, and leaves out any place the
  wish names (a cut-out has no place). The first wording asked
  for lots of clear ground and even light, and drew a small, passive figure in flat catalogue light that looked weak
  beside the template's demo figure (run 6, JA Boxing block-165.1). Code chooses the colour from the plan's words: chroma
  green `#00b140`, unless the words name something green (grass, a tennis ball), then magenta `#ff00ff`, then chroma
  blue `#0047bb` (`site-pictures/cutout-ground.js` `groundFor`).
- **The demo picture as a style reference**: when the kit's demo picture of the frame can be read (the frame's
  `picture` path, read from the quickstart installer zip the contract names, checked against its sha256, else from the
  release webroot, `site-pictures/demo-pictures.js`, cached per kit and matched by `pictureSha256` when the kit records
  one), it is attached to the drawing, flattened on light grey and at most 768 px,
  with the template's `style` part: copy only its framing, the figure's scale, the pose energy, the light and the
  attitude; never the person, the sport, the clothes, any equipment, the background graphics or colours. The subject
  comes only from the wish. The call record names the reference by `styleSha256`, and the reference is part of the kept
  drawing's key. No demo picture, no reference: the drawing goes on without one. This is the one place a demo picture
  is sent to a model, and never as content: it never reaches the picker or the looker.
- **Code removes the ground**: the ground as painted is measured on the picture's border near the asked colour; each
  pixel's alpha comes from how much the ground's own channels dominate it (a colour difference key), soft between 0.15
  and 0.85 of the ground's dominance; its colour is unmixed from the ground and the ground's spill suppressed, so the
  edge keeps no fringe of the ground colour. The figure is then contained in the size the frame's picture is written at
  (never cropped, transparent around it) as a PNG with alpha.
- **A ground that cannot be removed cleanly is a failed draw**: less than half the border is the asked ground, more
  than 6% of the picture is only partly removed (a ground that is not plain, a shadow, the ground's colour in the
  figure), less than 5% ground or 3% figure is left, or the figure touches the top, left or right edge (more than 2% of
  that edge). The call is recorded and paid; the redraw is told the matching fault (`leftover ground`, `subject cut
  off`, `missing part`).
- **Recorded**: source `drawn`, a `.png` file, `drawing: { mode: "cutout", attempt }` and
  `cutout: { ground, groundName, measured, groundRemoved: true, soft, figure }` (`figure` the share of the file the
  figure covers). The drawings count in `drawer` and `cost.drawer` like every other drawing. A cut-out is never
  darkened (its transparency stays).
- **Looked at as a cut-out**: the looker sees it over grey and white checks, is told it is a cut-out, whether the site's
  text sits over its box (the kit measured text over the picture, `kindEvidence.overPicture`, or the frame has text over
  it) or beside it, and how much of the box the template's own figure (`1 - kindEvidence.clearShare`) and this one
  cover; it may then name the cut-out faults `rough cut-out edge`, `leftover ground`, `missing part` (a hand, limb or
  held equipment lost) and `covers the text`.
- **Its ladder**: draw, one redraw with the fault names, hidden when the kit allows it (`canHide`), else returned to the
  planner. Never another owner photo, never fewer rows. A `person` or `any-real` cut-out is never drawn: hidden when
  allowed, else returned. No cut-out frame ever keeps the kit's demo figure, and a run without a drawer door hides or
  returns its cut-out frames.
- **The door is mandatory** for a run whose plan has a `specific` cut-out frame, as for a frame for the picker.

### 4. Fix rounds and the fallback ladder

Looker rejections and check failures go back to the picker for the failing frames only, with the fault names. At most
**2 fix rounds**. Then, per frame, a fixed ladder:

1. a `specific` frame is drawn (one redraw with the fault names);
2. an `any-real` frame takes the next photo, then the row count drops or the frame is hidden (a gallery tile is never
   hidden alone: it reuses an owner photo of its page cut to another region, then takes any usable owner photo, and is
   returned only when no photo is left or the brief has fewer than 2);
3. a drawing still rejected is hidden when the kit allows hiding;
4. a frame that cannot be hidden is drawn again in other compositions, then keeps the best picture rejected for minor
   faults only (owner decision 06/11/2026, card AJ: step 8 never leaves a frame the plan wants filled without a picture
   while one can be had);
5. only a frame whose every picture had a hard fault, or that got none, is returned to the planner, and the mapping
   export lists it in `problems` (`the plan wants a picture here and the picture step left it without one: ...`), so
   step 9 reports it as refused instead of leaving the demo picture silently.

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
| reuse | gallery tiles only | an owner photo already shown on the tile's pages, never one shown in a neighbouring tile of the same list (index one apart, or directly above or below when the kit gives the list's columns), cut by code to a region of the frame's shape that shares at most 30% of the smaller cut's area with every other cut of that photo and runs through no head, written and looked at like any cut; at most 2 per tile; the entry says `reuse: { with, overlap }` |
| any photo | gallery tiles only | always fills while the brief has at least 2 usable owner photos: any usable owner photo (used on other pages or already twice), least used first, any region of the frame's shape, keeping only the hard rules: heads whole, never the photo of a neighbouring tile, never the very cut another frame of the page shows, and the photo's main subject kept (real run 6: a tile got a crop of a bush and a fence): the region holds at least half of the labelled subject box or a whole head, or, when no subject is labelled, covers at least half of the photo; a photo with no such region is skipped for the next one (the reuse rung keeps the same rule); looked at like any cut, a rejection followed by the next photo until every photo is tried; the entry says `reuse: { rung: "any-photo", with, overlap }` (the reuse rung writes `rung: "reuse"`) |
| hide | every match but gallery tiles | the frame is hidden when the kit allows hiding and it is not a template setting |
| redraw-alt | `specific`, `specific` cut-out | another composition (`REDRAW_ALT_TRIES`, 2): the template's `recompose` part names every fault seen so far, the frame's shape (`framingOf`: wide, tall or square, and its aspect ratio) and asks for the subject centred and whole with a margin on every side; each try adds its own `take<n>` part (another distance), so no two tries are the same request or the same cached drawing; drawn whole, never extended from a photo; `drawing.attempt` is 3, then 4; the entry says `filledBy: { rung: "redraw-alt", faults: [] }` |
| best-rejected | every match but `person` | the best picture the looker rejected for this frame whose faults are all minor (`MINOR_FAULTS` in `looker-call.js`: subject cut off, visible drawing seam, rough cut-out edge, text would not read; every other fault is hard), fewest faults first, then the latest; an owner photo another frame of its pages now shows is passed over; the frame ends there; the entry says `filledBy: { rung: "best-rejected", faults }` and L01 notes it instead of failing it |
| return | every match | the frame is returned to the planner (`returns`) |

A **gallery tile** is an `any-real` photo frame that is one row of a kit list in which at least two rows hold an image
slot (a gallery, a row of cards); it is read from the kit's list structure, never from `canHide`. It climbs next photo,
fewer rows, reuse, any photo and return, and code that finds no free photo for it leaves it waiting for this ladder instead of
hiding it. Why (owner decision 04/11/2026, run 5): the kit marks gallery tiles `canHide` because the block keeps its
size, but one hidden tile leaves a visible hole in the grid; so the rule lives in the picture step, the kit and its
`canHide` data are unchanged. Owner decision 04/11/2026 (final): no gallery tile ends hidden or returned while the
brief has usable owner photos, so the any-photo rung follows the reuse rung and gives up only the 30% rule. P06 accepts
a photo twice on a page only for a gallery tile marked `reuse`, not next to the other showing: after the reuse rung the
two cuts share at most 30%, after the any-photo rung they are not the same cut; any other repeat still fails. P12
fails a gallery tile hidden alone (one not in a row the ladder dropped, the manifest's `rows`). A tile walks up to 40
looks (the round's pass limit), one photo per pass.

Owner decision 06/11/2026 (card AK, replaces the within-gallery reuse above): one owner photo is never shown twice in
one kit block. The reuse and any-photo rungs skip a photo another frame of the tile's block shows (so the reuse rung
only takes a photo shown by another block of the page), the any-photo cut shares at most 50% with another cut of the
photo (`ANY_PHOTO_MAX_OVERLAP`), and a tile no photo is left for is drawn (rungs draw and redraw, entry `filledBy: {
rung: "draw" }`): the gallery climbs next photo, fewer rows, reuse, any photo, draw, redraw, best-rejected and return.
P06 fails two showings of one photo in one block whatever the cuts, and an any-photo reuse sharing more than 50%; P07
accepts a drawn `any-real` frame only for a gallery tile marked `filledBy.rung` "draw". The mapping export lists a
second showing of one photo in one block as a problem and leaves it out.

A `person` frame climbs only hide and return (no other person's photo, never a drawing). A `specific` cut-out frame
climbs draw, redraw, hide, redraw-alt, best-rejected and return; any other cut-out only hide and return (section 3d).
A `specific` frame climbs redraw-alt and best-rejected after hide, an `any-real` frame and a gallery tile best-rejected
before return. A frame waiting for the drawer
starts at draw; a frame code placed starts at its first rung after the placement; a frame the picker placed climbs only
in the last round (no picker round follows), from draw, when the looker rejects it or it still fails the check. A look
that could not be read is no rejection: the picture fails L01 and the next round asks again. Each rung is recorded in
`ladder` and the entry's reason.

## Consequences

- The picture bench (#336), the mapping export and the write step read one stable manifest shape.
- Every threshold above is a named constant; changing one is a deliberate new checker version.
- Picture quality beyond these rules (does it look right) stays with the owner reading the reading page.
