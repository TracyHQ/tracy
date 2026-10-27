# International Magic — Style Reference
> midnight gallery wall — a single spotlight, a piece of work, and a wall of black velvet

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

International Magic presents itself inside a near-black void where only the work is allowed to speak. The entire interface is achromatic — off-white type on charcoal canvas, with gray as the only variable — so attention collapses onto whatever the agency is showing. Layouts are sparse, centered, and vertical, with enormous breathing room between sections; navigation sits as three quiet words in a single line at the very top. Components are soft and rounded: 24px on device and work containers, 9999px on buttons and badges, and one large diffuse shadow that gently lifts content from the darkness rather than locking it down with sharp edges. The custom Wand UI Pro typeface carries almost the entire brand voice — its negative tracking at display sizes and slightly widened tracking on micro-labels create the same contrast as the page: quiet at scale, deliberate at small.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#0a0a0a` | Page background, primary canvas — the dark field that holds every piece of work |
| Chalk | `#f7f7f7` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |
| Ivory | `#ebebeb` | Button labels and button borders — marginally warmer than Chalk, used on neutral pill buttons to feel pressed but not clinical |
| Ash | `#7c7c7c` | Secondary link and body text, subdued dividers — mid-gray for de-emphasized type that still needs to read |
| Graphite | `#4d4d4d` | Heading borders and low-emphasis heading text — darker mid-gray that recedes behind primary Chalk type |
| Smoke | `#707070` | Badge text — sits between Ash and Charcoal, calm and unreadable as ornament |
| Steel | `#616161` | Badge borders — paired with Smoke text for outlined tag affordance |
| Charcoal | `#585858` | Elevated surface for the single neutral filled button — barely lighter than Void so the button whispers rather than shouts |

## Typography

### Wand UI Pro — Sole typeface — used for everything from 96px display headlines down to 10px badge labels. The 475 and 550 weights are the workhorses; 650 is reserved for emphasis. The font is custom but has the personality of a contemporary geometric grotesk with subtle humanist warmth, tight apertures, and a tall x-height.
- **Substitute:** General Sans, Switzer, or Inter (with stylistic alternates enabled)
- **Weights:** 400, 475, 500, 550, 650
- **Sizes:** 10, 11, 15, 16, 32, 96
- **Line height:** 1.00–1.60
- **Letter spacing:** -1.632px at 96px, -0.384px at 32px, -0.16px at 16px, +0.25px at 10px
- **OpenType features:** `"ordn" on, "ss01" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.4 | 0.25px |
| body-lg | — | — | 16px | 1.6 | -0.16px |
| heading | — | — | 32px | 1.25 | -0.384px |
| display | — | — | 96px | 1 | -1.632px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 640px
- **Section gap:** 120px
- **Card padding:** 16px
- **Element gap:** 12px

### Border Radius

- **cards:** 24px
- **badges:** 9999px
- **buttons:** 9999px
- **smallContainers:** 16px

## Components

### Top Bar Navigation
**Role:** Site-wide header

Three text links in a single horizontal row centered at the very top of the page. 11px Wand UI Pro at 550 weight in Chalk (#f7f7f7), with the center item (the brand wordmark) set slightly larger or on its own line. No background fill, no border, no logo mark — the header is a sentence, not a bar.

### Display Headline (Centered)
**Role:** Hero / project title

96px Wand UI Pro at 400 weight, Chalk (#f7f7f7), line-height 1.0, letter-spacing -1.632px. Centered in a 640px column. Used for the single project name on each page. The whisper-weight at display size is the signature — it lets the headline sit on the dark canvas without competing with the work.

### Subtitle (Centered, Muted)
**Role:** Supporting label below display

15–16px Wand UI Pro at 400 weight, Ash (#7c7c7c) or Graphite (#4d4d4d), letter-spacing -0.16px. Sits 8–12px below the display headline, also centered.

### AD Badge
**Role:** Project type / category tag

10px Wand UI Pro at 475 weight, letter-spacing +0.25px, Smoke text (#707070) on Void with a 1px Steel (#616161) border. 9999px radius. Compact 4px 8px padding. Outlined pill, never filled.

### Subscribe Button (Outlined Ghost)
**Role:** Primary action on content pages

15px Wand UI Pro at 475 weight, Ivory (#ebebeb) text and 1px Ivory border on transparent / Void background. 9999px radius. 8px 20px padding. Sits centered below hero content. The ghost treatment keeps it present without breaking the dark monochrome.

### Subscribe Button (Filled Neutral)
**Role:** Alternative primary action on lighter frames

15px Wand UI Pro at 475 weight, Ivory (#ebebeb) text on Charcoal (#585858) fill. 9999px radius. 8px 24px padding. Used when the page needs the button to feel pressed against a near-white section.

### Phone / Device Mockup Frame
**Role:** Hero visual container for video or app work

Vertical device frame with 24px outer radius, placed inside a 64px×72px ambient shadow at 25% black. The frame itself holds video content and sits centered in the 640px column with at least 80px of breathing room above.

### Portrait Thumbnail Card
**Role:** Small creator / contributor tile

20–24px radius square containing a circular-cropped portrait. No border, no shadow, no caption overlay — the image alone sits on the Void. Positioned at lower-left of the content stack with a 12px gap to the next element.

### Section Divider (Invisible)
**Role:** Vertical rhythm separator

Not a line — just 120px of empty Void between sections. The page uses negative space as its only divider.

## Do's and Don'ts

### Do
- Keep every screen fully achromatic — palette is Void, Chalk, and three mid-grays; no chromatic accents.
- Center all content in a 640px column and let 120px of Void separate every section.
- Use the 24px radius on any container that holds a piece of work (device, video, image), and 9999px radius on any tag, badge, or button.
- Lift featured work with the single ambient shadow `0px 64px 72px 0px rgba(0,0,0,0.25)` — never stack a second tier.
- Set display headlines at 96px / weight 400 / letter-spacing -1.632px; the whisper weight is the brand.
- Use `ordn` and `ss01` font features wherever Wand UI Pro appears — they are part of the voice.
- Treat the top bar as a sentence, not a bar: three words, 11px / 550, no background, no border.

### Don't
- Don't introduce any hue — no blue, no red, no warm grays with chroma. The page is 0% colorful by design.
- Don't add a filled primary-color CTA. Actions stay ghost (outlined Ivory) or neutral-charcoal.
- Don't use sharp 0–4px corners on device or card surfaces — the 24px radius is what makes the dark canvas feel soft.
- Don't crowd sections. If vertical space between blocks drops below 80px, the void stops working.
- Don't use weights above 650 in Wand UI Pro; the type system caps there and going heavier breaks the quiet voice.
- Don't add secondary shadows, colored shadows, or border-glow effects to lift work — the 64/72/25% ambient shadow is the only elevation.
- Don't left-align hero content. Every headline, subtitle, badge, and CTA in the main column is centered.

## Elevation

- **Work / device mockup containers:** `0px 64px 72px 0px rgba(0, 0, 0, 0.25)`

## Surfaces

- **Void** (`#0a0a0a`) — Base page canvas
- **Charcoal** (`#585858`) — Raised neutral button surface

## Imagery

Imagery is sparse and high-contrast: the agency shows its work through vertical phone-screen video captures and tight portrait crops, never through full-bleed lifestyle photography. All visuals sit on pure Void with no background context — the frame is a window, not a scene. Portraits are circular-cropped and unedited, video stills are raw phone captures, and no decorative illustration or abstract graphic appears anywhere. The visual density is low: a single device mockup, a single thumbnail, and otherwise the page is type and empty space. Iconography is absent in the main column; the only iconography-adjacent elements are minimal player controls (play, fullscreen) rendered as thin pill outlines.

## Layout

Every page is a single centered column capped at roughly 640px, floating inside a full-bleed Void canvas. There is no grid system, no multi-column rows, and no sidebar — each screen is a vertical stack: three-word top nav → empty space → centered display headline + subtitle + badge → large breathing gap → one device or image mockup → optional portrait thumbnail offset to the lower left → ghost CTA at the bottom. Section rhythm is defined entirely by vertical whitespace (120px between blocks) rather than background bands or dividers. Navigation is the only chrome: no sticky header, no mega-menu, no footer. The hero is always the same — type floating in the dark with no background image, animation, or video autoplay at the top of the page.

## Similar Brands

- **Locomotive Mtl** — Same dark-canvas + whisper-weight type + generous vertical breathing room, with work presented as a single centered artifact
- **Resn** — Achromatic black gallery layout where each screen is one featured piece lifted by a soft ambient shadow
- **Manual** — Sparse agency site with no accent color, no background sections, and center-aligned type on pure dark
- **Work & Co** — Minimal three-word nav, single-column hero, and the same restraint of letting work carry the page
- **Ueno** — Dark creative-agency homepages that treat the void as a frame and use one soft shadow to float the work
