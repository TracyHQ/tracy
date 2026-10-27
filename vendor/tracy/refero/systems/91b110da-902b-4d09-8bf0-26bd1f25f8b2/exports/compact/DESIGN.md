# Copilot Money — Style Reference
> Scattered neon tags over a midnight vault — a black canvas where a few candy-colored labels drift at playful angles, each glowing like an airport departure sign.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Copilot Money is a midnight-canvas finance app where the interface stays dark, quiet, and nearly monochrome while a playful parade of candy-colored category tags — groceries, baby, wedding, home — float at jaunty angles around the hero, providing the only visual noise the page allows. Typography is the other signature: body copy at weight 100 in Matter Variable Thin creates a whisper-thin, almost-printed-on-vellum feeling, while Jokker display headings at 148px deliver structural authority through sheer scale rather than weight. A single vivid blue (#1c6cff) punctuates the darkness as the only call to action. Surfaces are given depth through layered inset shadows rather than drop shadows — a neomorphic approach that keeps the UI feeling pressed into the dark plane rather than floating above it.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Canvas | `#000814` | Page background, hero canvas, base layer of the dark plane |
| Deep Surface | `#010d1e` | First elevated surface tier above the canvas — cards, panels, nav wells |
| Indigo Surface | `#001533` | Second elevated surface — deeper blue tint for nested containers and highlighted panels |
| Cobalt Surface | `#00215e` | Glow-tier surface for featured blocks, highlighted links, and deep elevation wells |
| Paper White | `#ffffff` | Primary headings, body text, icon strokes, ghost-button borders, logo glyph |
| Fog | `#ccced0` | Muted secondary text, subtle hairline borders on quiet surfaces |
| Mist | `#999ca1` | Helper text, tertiary captions, low-emphasis metadata |
| Steel Border | `#11263b` | Hairline border tone — divides dark surfaces at low contrast |
| Signal Blue | `#1c6cff` | Filled primary action buttons, active nav, brand mark tint — the one chromatic accent on a dark page |
| Tag Coral | `#ff4433` | Category tag fill — groceries, food, lifestyle tags in the floating constellation |
| Tag Lime | `#00cc4b` | Category tag fill — green budget / income / positive-flow labels |
| Tag Tangerine | `#ff8833` | Category tag fill — home, utilities, warm-life-event tags |
| Tag Hot Pink | `#ff33aa` | Category tag fill — personal, family, baby, gift tags |
| Tag Violet | `#9019e6` | Category tag fill — entertainment, nightlife, going-out tags |
| Tag Sunflower | `#ffcc02` | Category tag fill — savings, goals, highlight tags |
| Tag Sky | `#00acfe` | Category tag fill — travel, subscription, digital tags |
| Tag Ember | `#ea687c` | Category tag fill — warm pink-red for fashion, health, personal care |
| Tag Olive | `#94ae43` | Category tag fill — organic, grocery-adjacent, eco tags |
| Tag Slate | `#5c6f8a` | Category tag fill — neutral-toned category tags (transit, bills, misc) |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Jokker — Display headings only. The 148px Jokker Semibold (line-height 0.90, tracking -0.02em) is the hero — a custom condensed display face whose tight verticals and sharp terminals give the dark page its editorial weight. Using a display face (not a body sans) for the headline is the signature: headlines announce rather than describe. Substitute: ABC Monument Grotesk, Söhne Breit, or Space Grotesk Bold.
- **Substitute:** ABC Monument Grotesk or Söhne Breit
- **Weights:** 500, 600
- **Sizes:** 12px, 13px, 14px, 16px, 18px, 22px, 24px, 32px, 64px, 148px
- **Line height:** 0.90, 1.09, 1.10, 1.20
- **Letter spacing:** -0.02em at 148px, -0.01em at 64px
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### Matter Variable Thin — All body copy, subheadings, and supporting text. Weight 100 across the entire body scale is anti-convention — most dark UIs use weight 400-500 to fight low contrast, but Matter Thin lets the page feel printed on dark vellum. The 38px and 56px sizes act as secondary display tiers, still at weight 100, reinforcing the 'whisper, don't shout' voice. Substitute: Inter Thin, Söhne Leicht, or IBM Plex Sans Thin.
- **Substitute:** Inter Thin or Söhne Leicht
- **Weights:** 100
- **Sizes:** 11px, 12px, 13px, 14px, 15px, 16px, 18px, 22px, 38px, 56px
- **Line height:** 1.20, 1.30, 1.40, 1.60
- **Letter spacing:** -0.01em to -0.02em at 22-56px; 0 to 0.02em below 16px
- **OpenType features:** `"ss07", "blwf", "cv03", "cv04", "cv09", "cv11", "ss07", "blwf", "cv03", "cv04", "cv09", "cv11"`

### Matter-TRIAL SemiBold — All-caps eyebrow labels and section markers. The 0.04em tracking is the key — it forces the all-caps treatment to read as signage, not shouting. Appears above section content as a small 'kicker' line.
- **Substitute:** Inter SemiBold or Söhne Halbfett
- **Weights:** 670
- **Sizes:** 28px
- **Line height:** 1.00
- **Letter spacing:** 0.04em (1.12px at 28px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| body-sm | — | — | 14px | 1.4 | -0.14px |
| body | — | — | 16px | 1.4 | -0.16px |
| body-lg | — | — | 18px | 1.6 | -0.18px |
| subheading | — | — | 24px | 1.4 | -0.24px |
| eyebrow | — | — | 28px | 1 | 1.12px |
| heading-sm | — | — | 38px | 1.3 | -0.76px |
| heading | — | — | 56px | 1.2 | -1.12px |
| heading-lg | — | — | 64px | 1.1 | -0.64px |
| display | — | — | 148px | 0.9 | -2.96px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 20px
- **cards:** 24px
- **pills:** 9999px
- **images:** 8px
- **buttons:** 16px
- **largeContainers:** 40px

## Components

### Announcement Bar
**Role:** Slim full-width strip pinned above the nav

Filled Signal Blue (#1c6cff) background, 40px height, centered white text at 12px / weight 100, often includes a '>' chevron link. Dismissable with a small × on the right edge.

### Navigation Header
**Role:** Sticky top nav on all pages

Sits on Midnight Canvas (#000814) with no visible background fill — transparent. Logo (paper plane glyph in a white 16px-radius square) + wordmark 'Copilot Money' at left, centered nav links (Features, Pricing, Reviews) at 14px Matter weight 100, and right-side actions: a 'Log in' text link plus a white 'Get started' filled button. Total height ~64px.

### Primary CTA Button
**Role:** The single dominant call-to-action

Filled Signal Blue (#1c6cff) background, white text at 14-16px weight 100, 16px border-radius, padding 12px 20px. Icon variant includes a small paper-plane glyph inside a slightly lighter-blue square to the left of the label. No hover lift; the button is flat and confident.

### Ghost / Outlined Button
**Role:** Secondary action in the nav

Transparent fill, 1px white border, white text at 14-16px weight 100, 16px border-radius, padding 12px 20px. Sits beside the primary CTA without competing for attention.

### Category Tag / Pill
**Role:** The signature floating decorative element

Filled with one of the accent tag colors (Coral, Lime, Tangerine, Hot Pink, Violet, Sunflower, Sky, Ember, Olive, Slate), 20px border-radius (pill-ish rectangle, not a full pill), white text at 12-14px weight 100, 8px 16px padding, with a small emoji or icon prefix. Tags are rotated at random angles (-12° to +12°) and float around hero text — they are never on a strict grid.

### Award Badge
**Role:** Social proof — App Store accolades

Thin white 1px outline forming a laurel wreath shape, with centered title text ('Editor's Choice', 'Best of the App Store', 'Apple Design Award') at 11-12px weight 100 inside. 40px height, varies in width. Used in a horizontal row of 4-5 badges.

### Brand Mark
**Role:** Logo glyph used in nav and app icon contexts

White paper-plane icon inside a 16px-radius white-filled square. The square is the mark; the wordmark 'Copilot Money' sits to its right in Jokker Medium 16px.

### Display Heading
**Role:** Hero and section-opener headlines

Jokker Semibold at 64-148px, line-height 0.90, letter-spacing -0.02em, color Paper White. The 148px size is reserved for the hero only; section heads drop to 56-64px. Never used at weights below 500 — the display face is the moment the page is allowed to use weight.

### Body Text Block
**Role:** All paragraph and supporting copy

Matter Variable Thin (weight 100) at 16-18px, line-height 1.40-1.60, color Paper White. Secondary paragraphs may use Fog (#ccced0). The thin weight means line-length should stay under 60ch for legibility.

### Eyebrow / Kicker Label
**Role:** All-caps section markers above content

Matter-TRIAL SemiBold at 28px, line-height 1.00, letter-spacing 0.04em, uppercase, color Paper White or Signal Blue. Wide tracking is the signature — it reads as signage, not as a heading.

### Section Container
**Role:** Full-width bands separating page sections

Centered content with max-width 1200px, horizontal padding 24-40px. Vertical section gap 80-120px. Background alternates between Midnight Canvas and Deep Surface (#010d1e) to create banding without using borders.

### Neomorphic Card
**Role:** Feature blocks, content wells, interactive panels

Background Deep Surface (#010d1e), 24px border-radius, 24px padding. Depth comes from the dual inset shadow stack (white inner top-right + black inner bottom-left) rather than a drop shadow. Border 1px Steel (#11263b) at 0.3 opacity for hairline definition on the dark surface.

## Do's and Don'ts

### Do
- Use weight 100 Matter for every piece of body and supporting copy — the whisper-thin voice is the brand
- Reserve weight 500+ exclusively for Jokker display headings and the eyebrow label face — never bold body text
- Apply -0.02em letter-spacing on display sizes (56px and above) and 0.04em on all-caps eyebrows
- Use #1c6cff as the only filled chromatic action on the page — never introduce a second brand color for buttons
- Float category tags at random rotation angles between -12° and +12° around hero content; never align them to a grid
- Build all elevation from inset shadows (white inner top-right + black inner bottom-left) — never use drop shadows
- Keep section backgrounds as tonal shifts between #000814, #010d1, and #001533 — use color, not borders, to separate bands

### Don't
- Don't use weight 400-500 for body text — the thin weight is non-negotiable, even at small sizes
- Don't use drop shadows on cards, modals, or nav wells — depth is communicated by inset lighting only
- Don't place colored category tags on a light surface — the candy colors only work against midnight
- Don't introduce additional brand colors for CTAs, badges, or accents — #1c6cff is the sole chromatic voice
- Don't align the floating category tags to a strict grid or use identical rotation angles — the playful asymmetry is the signature
- Don't use Jokker for body copy or Matter Thin for the hero headline — the two faces own separate registers
- Don't add decorative gradients to backgrounds — the canvas stays flat midnight; the only gradient lives in the inline gradient highlight element

## Elevation

- **Cards & Panels:** `rgba(255, 255, 255, 0.08) 4px 4px 8px 0px inset, rgba(255, 255, 255, 0.16) 4px 4px 16px -4px inset`
- **Pressed / Active States:** `rgba(0, 0, 0, 0.2) -4px -4px 16px -4px inset`
- **Glow Highlight:** `rgba(38, 113, 217, 0.08) 0px 0px 12px 0px inset, rgba(0, 0, 0, 0.32) 0px -4px 8px 0px inset`

## Surfaces

- **Canvas** (`#000814`) — Full-page background — the midnight plane everything else sits inside
- **Deep Surface** (`#010d1`) — Cards, nav wells, first elevation step off the canvas
- **Indigo Surface** (`#001533`) — Nested panels, expanded menu backgrounds
- **Cobalt Surface** (`#00215`) — Featured blocks, highlighted link backgrounds, deep wells

## Imagery

The site uses almost no traditional imagery. Instead, the signature visual element is a constellation of 3D-rendered, candy-colored category tags (GROCERIES, BABY, WEDDING, HOME, DANCING, DATE NIGHT) that float at jaunty rotation angles around hero text. Each tag is a rounded-rectangle pill with a subtle inner highlight suggesting soft 3D volume, filled with a saturated brand color and stamped with a small emoji icon. The tags read as scattered luggage labels or sticky notes pinned to a dark wall. App Store award badges (laurel-wreath outlined in thin white) appear as flat line-art social proof. No photography, no illustrations, no product screenshots in the hero — the floating tags ARE the hero image. Iconography is line-art monochrome (paper plane logo, nav chevrons, close ×, arrow links) at ~16-20px.

## Layout

Centered, max-width 1200px container with generous 80-120px vertical section gaps. The hero is a full-bleed dark canvas with a single centered display headline stack — large white heading, muted white subtext paragraph, single blue CTA — surrounded by scattered tilted category tags that drift outside the content column into the negative space. Navigation is a transparent sticky bar flush with the top of the page, no visible background, breaking up only with the brand mark, centered nav links, and right-side login + CTA pair. A secondary full-bleed dark band hosts a centered paragraph of 'navigate your finances with confidence' body copy beneath a centered logo mark. Award badges sit in a single horizontal row, centered, beneath the hero. The rhythm throughout is: full-width dark band → centered narrow text column → optional scattered decorations → next band. No 2-column text+image splits, no card grids in the hero region — the page is editorial, not dashboard-like.

## Similar Brands

- **Monarch Money** — Same dark-midnight canvas with a single saturated accent color, generous spacing, and large-radius cards — but Copilot adds the playful floating tag constellation
- **Arc Browser** — Dark-canvas UI with scattered colorful decorative elements (Arc's folder icons, Copilot's category tags) that break grid alignment and inject personality
- **Things 3** — Playful use of small colorful category tags/pills against a dark background, prioritizing visual personality over dashboard density
- **Linear** — Confident dark UI with a single chromatic action color and editorial-scale typography, though Linear is far more austere and Copilot adds the candy-colored tag motif
- **Cash App** — Dark base with vivid accent color, rounded oversized type, and a friendly non-corporate tone — the closest fintech peer in personality if not in surface treatment
