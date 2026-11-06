# Object template: the 3D cup

The home page shows one 3D object, a cup. The template ships a default cup; a site owner can replace
it with their own file. This sheet says what a replacement file must be. The scene does not repair a
file that breaks these rules.

## The file

| Rule | Value |
| --- | --- |
| Format | glTF 2.0 binary, `.glb`, with every image inside the file |
| Shape | Standing and close to an upright cylinder, like the default cup: 12.7 cm tall, 9.6 cm wide, about 1.3 times taller than wide. The scene fits the object to its frame, and an object wider than a cup is drawn no wider than a cup would be, so it shows small and sits off-balance with the text around it |
| Pieces | One object in one piece, no separately moving parts (a lid that opens is not supported; only the default cup's lid lifts off, in the brewing scene) |
| Up axis | Y up, as in glTF. The template does not stand an object upright: a file lying on its side shows lying on its side, centred, resting on the floor, fitted to the frame |
| Front | Faces +Z, as in glTF. The first view looks at the front |
| Materials | glTF metallic-roughness materials (colour, roughness, normal images) |
| File size | 3 MB recommended, 10 MB maximum. Above 10 MB the site does not load the object and shows the still image instead |
| Image size | Each surface image at most 2048 px wide and high |
| Compression | Optional: meshopt (`EXT_meshopt_compression`) or Draco (`KHR_draco_mesh_compression`) geometry, WebP images (`EXT_texture_webp`). The decoders ship with the template; nothing loads from a CDN |

## The still image

Every object comes with a still image of the same object: transparent background, same angle and
light as the first 3D view. The page shows it whenever it does not draw the 3D scene, and while the
3D object loads: once the object is ready the still fades into it over half a second, the object
coming in at the still's pose.

## How the home page picks the way it shows the cup

The home page has two fields: "Cup model (.glb)" (a file, `model/gltf-binary` only) and "Cup still
image". `src/lib/cup-route.mjs` is the one rule, tested in `tests/cup-route.test.mjs`:

- The 3D scene when the browser has WebGL, the visitor has not asked for reduced motion or data
  saving, and the file is empty (the default cup) or its stored size is 10 MB or less.
- Otherwise the still image: the default still image when the model field is empty, the owner's still
  image when both fields are set. An owner's model with no still image hides the cup rather than show
  the default cup in its place. A file whose size is unknown, or that fails to load, takes this path too.
- The default still image is `src/assets/default-cup-still.webp`, drawn from the default cup (plain
  sleeve, transparent background, in section 1's lean and turn, the cup at 0.62 of the image side
  (`STILL_SHARE`), so the page sizes the image to put it where and as large as the 3D cup stands in
  section 1 on every screen width) by `node tools/capture-default-still.mjs <site origin>`
  against a running site whose "Cup model" field is empty. Run it again when the default cup or the
  scene's first pose changes, then rebuild or `tracy-dev sync` the site. Without the file the still
  path shows an empty stage.

The scene (`src/lib/cup-scene.mjs`) measures every object, stands it on the floor's centre, scales
its longest side to one unit and looks at its front (+Z). It writes the route and the fitted pose on
the stage (`data-cup-route`, `data-cup-pose`); `tests/browser/` reads them in a real browser
(`SITE=<site origin> node --test tests/browser/`, needs a running site). Below 768 px wide it draws
without shadows or antialiasing.

## The brewing scene before the six sections

On the 3D route the home page opens on a brewing scene (`[data-brew]` in `src/views/Home.astro`, about four screens
of scroll): a plain espresso machine on a simple bar counter (warm wood top, the page-coloured wall behind it with
faint brick lines, a thin shelf with two cups and two jars), the cup under the spouts with its lid off. Its first
screen has no shop name (the header shows it): top right, a menu sheet pinned on the wall, drawn (blurred lines,
no readable item, so any shop's menu fits), and under it a small game-like button with the invitation's label
(`intro_cta_label`); the sheet and the button are one link to the invitation's address, clear of the machine.
Scrolling down the machine's shell turns to glass, hot water runs from the copper boiler through the pipe into the
group head and presses through the coffee, two streams of espresso run into the cup while its paper body turns
see-through on the rising coffee, the flow stops, the machine clouds over, the cup slides out, its lid drops straight
on, and the cup flies into section 1's pose as section 1 comes up; scrolling back runs it all backwards. Six fixed
lines in English under the scene say what is happening (`CAPTIONS`, no admin field). Everything is a pure function
of the brewing progress (`src/lib/brew-shot.mjs`, read by `home-scroll.mjs` and tested in `tests/home-scroll.test.mjs`);
the machine and the bar are built from code in `src/lib/brew-scene.mjs` and drawn in the cup's own scene, so there is
one cup from the tray to the last card. Wood, steel, copper, hot water and coffee keep the colours of the things;
the wall is the page colour (`--brew-wall`, `--brew-brick` in `CupStage.astro`), so it fades into the page.

The default cup alone opens in this scene (the lid lifts off, the paper turns see-through on the espresso); from
section 1 on it moves as one piece, as everywhere else. An owner's object is not opened: the coffee runs onto its
top, it never turns see-through. Reduced motion, no WebGL, data saving and a file that fails to load take the still
route, which hides the brewing scene: the page opens on section 1 as before. WebGL lost in the middle of the scene
takes the still route too, and the scene's line under it goes with it. Without script there is no scene at all (a
`<noscript>` rule in `Home.astro`). Below 768 px wide the scene draws
without shadows or antialiasing; the stage stops drawing when it is off the screen.

## The home page's six sections

The stage is sticky behind the six sections of the home page (`src/views/Home.astro`); the timeline in
`src/lib/home-scroll.mjs` (tested in `tests/home-scroll.test.mjs`) gives the cup one pose per section,
held around the middle of the section and eased between two: 1 leaning in front of the shop name ·
2 upright, half a turn, the story either side · 3 in the middle of the four reasons · 4 close, with
the accent halo and the labels (`detail_labels`) pointing at points found on the object's own surface ·
5 shrunk into the first featured card's picture (with no published menu item, section 5 is the shop's
name and tagline, the cup small beside them) · 6 gone with that card. Once landed the cup stands still in
the card, like a picture printed on it: it is placed where the card is in every frame (the scroll
smoothing only paces the flight in) and its idle sway dies away as it lands (the pose's `sway`), so
scrolling on carries it with the card; scrolling back up to section 4 lifts it out again. Every move is on the rig
(place, size, lean, turn), never on a part of the object. One change is the default cup's alone: in section 4 its
paper body fades to frosted glass and shows milk coffee, a few floating ice cubes and a gently rippling top inside
(the pose's `clear`, eased in and out like `sway`; the lid and the sleeve stay paper); an owner's object is drawn as
it is, and the still image keeps the paper cup. The stage writes the section and the pose
asked for (`data-cup-section`, `data-cup-motion`). On the still path only the text scrolls: the still
image stands where the 3D cup stands in section 1 through sections 1–4 (under 1100 px it follows the cup's place and size in each section, and from 768 to 1100 px in section 4 it also steps right, clear of the label list), the labels show as a list
and the first card shows the item's own picture.

To upload a `.glb` through the API, send the field's id as `fieldId` with the file (as the admin
does): EmDash then checks the field's own allowed types; without it the upload is `INVALID_TYPE`.

## The default cup

`public/models/default-cup.glb` is built from code by `node tools/build-cup.mjs`: a takeaway paper
cup with a kraft sleeve and a sip lid, geometry lathed from measured profiles, surface images painted
by the script (no AI, no bought or downloaded assets). Run it again after editing the script; the
output is the same on every run. The sleeve is plain: the area the scene uses to write the shop name
is set by `NAME_AREA` in the script and stored in the sleeve material's `extras.nameArea`. At runtime
the scene prints the site's shop name there (`site.brand_name`, the name the header shows), in a
fixed system face and the sleeve's own ink: one line, shrunk to a floor size, then cut with "…"; an
empty name leaves the sleeve plain. An owner's cup is never printed on, and the still image keeps the
plain sleeve.

## Colours of the scene

The page shows through the scene, so the background is the page's. The floor shadow, the bounce
light (the page around the cup) and the rim light (the accent) are design roles set on the stage
(`--cup-shadow`, `--cup-bounce`, `--cup-rim` in `CupStage.astro`), read again when the visitor
switches light / dark or a design system is worn; the key light is white and the cup's materials are
never tinted. In dark the shadow is the page's own colour, so it never shows as a light patch.
`tests/default-cup.test.mjs` checks the size and image limits in "The file" above.

Features held back for a later version: [kept-for-later.md](kept-for-later.md).
