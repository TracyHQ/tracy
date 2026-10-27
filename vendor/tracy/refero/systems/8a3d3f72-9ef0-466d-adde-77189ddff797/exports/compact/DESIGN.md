# Sackville & Co. — Style Reference
> Cobalt zine pressed onto cream — a hand-inked editorial spread where the illustration is the hero and the UI is just typeset text on warm paper.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sackville & Co. reads like an editorial risograph zine pressed onto cream paper: a hand-inked cobalt-blue illustration anchors one half, while the other half breathes as off-white canvas with tight grotesque type and a single oversized oval outlined in blue. The system is intentionally print-coded — flat color, no gradients, no shadows, no filled buttons — and uses a saturated secondary palette (peach, fire-red, marigold, terracotta) as tonal accents in artwork and borders rather than as functional UI fills. Typography carries all the hierarchy: Founders Grotesk at weight 400 with aggressive negative line-heights (0.80–0.90) on display sizes creates the masthead pressure of a magazine cover, while TimesNow SemiLight provides editorial serif contrast for select headings. Everything feels hand-set: thin outlines, generous whitespace, no elevation, no rounded cards — just confident ink on warm paper.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#f3f4ee` | Page canvas, card surfaces — the warm off-white that makes every ink color feel like print |
| Bone White | `#f8f8f8` | Alternate surface wash, subtle section differentiation from the cream canvas |
| Press Black | `#231f20` | Primary text, borders, dividers, icon strokes — the near-black ink that anchors every screen |
| Charcoal Headline | `#383435` | Display heading text — slightly lifted from press black for softer masthead weight |
| Mid Gray | `#9a9a9a` | Muted helper text, hairline borders, secondary metadata |
| Pure Black | `#000000` | Icon fills, maximum-contrast borders, nav accent |
| Cobalt Ink | `#245dc5` | Primary brand color — illustrated duotone wash, outlined action borders, interactive text — saturated blue against cream creates the risograph-print signature |
| Peach Wash | `#ffc6a6` | Secondary illustration accent, decorative borders, warm tonal fill — the cheek-pink of risograph layering |
| Fire Red | `#f04736` | Outlined action borders, emphasis strokes, error-like accent — used as editorial red rather than as a functional error state |
| Vermillion | `#f52302` | Deep red-orange accent for borders and fills — the warmest ink in the riso palette |
| Crimson | `#d42121` | Deep red accent — used sparingly in illustration washes and emphasis borders |
| Marigold | `#feee71` | Yellow accent fill, spot-color highlights, decorative emphasis — the third riso plate |
| Terracotta | `#b45e42` | Warm brown accent for body and heading borders — the earthiest ink in the editorial palette |

## Typography

### FoundersGrotesk — Workhorse type for everything from body to display — single weight 400 with no bold variants means hierarchy is created purely through size, line-height, and letter-spacing, not weight contrast. The aggressive negative line-heights (0.80 at 130px) create magazine-cover masthead pressure. Substitute: Neue Haas Grotesk, Inter, Söhne.
- **Weights:** 400
- **Sizes:** 16px, 22px, 23px, 25px, 26px, 29px, 32px, 34px, 38px, 47px, 50px, 60px, 72px, 85px, 99px, 122px, 130px
- **Line height:** 0.80–2.19 (tight on display: 0.80–0.90 at 72px+; standard 1.15–1.30 on body sizes)
- **OpenType features:** `"liga"`

### TimesNow SemiLight — Editorial serif contrast for select headings and navigation — a humanist serif breaks the grotesque monotony at key moments, creating the magazine-section-divider effect. Substitute: Times Now, Tiempos, Source Serif.
- **Weights:** 400 (SemiLight)
- **Sizes:** 29px, 34px, 60px, 122px, 130px
- **Line height:** 0.80–1.15
- **OpenType features:** `"liga"`

### Sackville Script (hand-drawn wordmark) — Custom hand-inked cursive used only for the brand wordmark — overlaid on illustrations and hero compositions. Not a UI font. No substitute; this is the signature mark.
- **Weights:** 400
- **Sizes:** 
- **Line height:** natural

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.3 | — |
| body | — | — | 22px | 1.3 | — |
| body-lg | — | — | 25px | 1.15 | — |
| subheading | — | — | 29px | 1.15 | — |
| heading-sm | — | — | 34px | 1 | — |
| heading | — | — | 47px | 0.94 | — |
| heading-lg | — | — | 72px | 0.85 | — |
| display | — | — | 99px | 0.85 | — |
| display-lg | — | — | 130px | 0.8 | — |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 43px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **tags:** 0px (square tags only)
- **cards:** 10px
- **buttons:** 50px
- **ovalButtons:** 81px

## Components

### Age-Gate Oval Button (Primary Action)
**Role:** The signature interactive element — a fully oval outlined button that replaces a conventional filled CTA

Oval shape with border-radius 81px, outlined in Cobalt Ink (#245dc5) at ~1.5–2px stroke, transparent fill on the cream canvas. Text inside: FoundersGrotesk 400 at ~38–47px, line-height 0.90–0.94, color Cobalt Ink. No hover fill, no shadow, no border-radius collapse — the outline IS the affordance. Padding approximately 18px vertical, 60–80px horizontal to create the stretched ellipse. This is the only interactive element on the age-gate and it carries the entire page's visual weight.

### Secondary Text Link (I'm Under 21)
**Role:** Text-only fallback option below the primary oval button

No border, no background, no padding. FoundersGrotesk 400 at ~38–47px, line-height 0.90–0.94, color Cobalt Ink (#245dc5). The visual hierarchy between the outlined oval and the bare text creates an implicit choice: the oval is the affirmative action, the text is the passive opt-out.

### Age Verification Eyebrow
**Role:** The question prompt above the age-gate button

FoundersGrotesk 400 at ~16–18px, uppercase or sentence case, color Press Black (#231f20) or Cobalt Ink (#245dc5). No letter-spacing adjustment visible. Acts as a quiet label — the visual weight lives in the response options below.

### Hand-Drawn Wordmark
**Role:** Brand identity mark overlaid on hero illustrations

Custom cursive script reading 'Sackville' — hand-inked, cobalt blue (#245dc5), overlaid at 100% width across the top of hero illustration panels. Not set in a font; this is an asset. Always sits on top of duotone illustration, never on flat surfaces.

### Duotone Illustration Panel
**Role:** Full-bleed editorial artwork that dominates hero and section compositions

Two-color risograph-style illustration using Cobalt Ink (#245dc5) as the dominant plate and Cream Paper (#f3f4ee) as the negative space. Tonal depth is created by hatching density, not additional colors. Optional Peach Wash (#ffc6a6) as a third plate. No borders, no rounded corners — illustrations bleed to panel edges. Aspect ratios vary by composition but always fill at least 50% of the viewport in hero contexts.

### Section Divider Rule
**Role:** Horizontal separator between content sections

1px solid line in Press Black (#231f20), full-width, used sparingly. No decorative styling, no dashed patterns, no double rules. The system trusts the whitespace and the type scale to create section breaks; a divider appears only when a true structural break is needed.

### Product Card
**Role:** E-commerce or collection grid item

Flat surface on the cream canvas — no background fill, no border, no shadow. Corner radius 10px only if a contained image is used. Product imagery fills the card; metadata below in FoundersGrotesk 400 at 16–22px. The card system is image-forward, not frame-forward — the photograph or illustration IS the card, and the type sits beneath it unframed.

### Editorial Headline Block
**Role:** Magazine-style display heading for section titles and hero copy

FoundersGrotesk 400 at 72–130px, line-height 0.80–0.85, color Press Black (#231f20) or Charcoal Headline (#383435). No bold weight, no underline, no color treatment — the size and the negative leading do all the work. Optional TimesNow SemiLight variant for serif contrast on key section openers.

### Riso-Color Border Accent
**Role:** Decorative border in secondary palette colors

Thin (1–2px) solid borders in Peach Wash (#ffc6a6), Fire Red (#f04736), Marigold (#feee71), or Terracotta (#b45e42). Used to frame illustration details, create editorial callouts, or add tonal warmth to card edges. Never used as a functional border on inputs or form elements.

### Navigation Bar
**Role:** Top-level site navigation

Flat on the cream canvas, no background fill, no shadow. Nav items in FoundersGrotesk 400 at ~16–22px, Press Black (#231f20). Active state indicated by a 1px underline or a chromatic accent color (Cobalt Ink). Logo on the left uses the TimesNow SemiLight wordmark variant. Sticky behavior optional; the system is comfortable with scroll-away nav.

## Do's and Don'ts

### Do
- Use Cobalt Ink (#245dc5) as the outlined action border for all primary interactive elements — never fill a button with it; the outline is the brand's signature
- Set display type at 72px+ with line-height 0.80–0.85 to create the magazine-masthead compression that defines the system's editorial weight
- Let the cream canvas (#f3f4ee) show — do not cover it with white surfaces or dark mode equivalents; the warm paper tone is the brand's foundation
- Use the riso accent palette (Peach Wash, Fire Red, Marigold, Vermillion, Terracotta) only in illustration washes, decorative borders, and spot-color emphasis — never as functional UI fills for buttons, badges, or states
- Reserve TimesNow SemiLight for at most one or two heading moments per page — it breaks the grotesque monotony and should feel like a rare editorial interruption
- Keep the wordmark as a hand-drawn asset overlaid on illustration panels — do not re-create it in a web font or place it on flat surfaces without imagery
- Use the 81px radius exclusively for the age-gate oval and any other large interactive prompts — the stretched ellipse is a system signature, not a default

### Don't
- Do not fill any button with Cobalt Ink, Fire Red, or any chromatic color — the system is outlined-action only; filled buttons would break the zine aesthetic
- Do not introduce box-shadows, drop-shadows, or any elevation effects — the design is flat by principle; depth comes from color contrast and illustration density, not from blur or offset
- Do not use a white (#ffffff) canvas — the cream (#f3f4ee) is warmer and is the reason the ink colors read as print rather than screen
- Do not set body text in the serif TimesNow SemiLight — it is a display contrast font only; body copy stays in FoundersGrotesk 400
- Do not apply bold or semibold weights — the type system is single-weight (400) by design; hierarchy is size and line-height, never weight
- Do not round cards or images beyond 10px — the 50px and 81px radii are reserved for buttons and the oval action; everything else stays close to sharp
- Do not add gradients, blurs, or glow effects to any element — the palette is risograph-flat; any smooth tonal transition breaks the print illusion

## Elevation

The system is deliberately flat — no box-shadows, no drop-shadows, no blurs, no glow effects. Depth and hierarchy are achieved entirely through color contrast (ink on cream), illustration density (riso hatching), and typographic scale (tight display leading). This is a print-first design language applied to screen, and elevation would break the illusion that everything is ink pressed onto warm paper.

## Surfaces

- **Cream Paper** (`#f3f4ee`) — Base page canvas — the warm off-white that all content sits on, never replaced by a card background
- **Bone White** (`#f8f8f8`) — Alternate surface wash for sections that need subtle differentiation from the cream canvas
- **Peach Wash** (`#ffc6a6`) — Tonal illustration surface — appears as a background plate in hero artwork, not as a UI card

## Imagery

The visual language is defined by duotone risograph-style illustration rendered primarily in Cobalt Ink (#245dc5) on the cream canvas, with optional Peach Wash (#ffc6a6) and other accent plates for tonal depth. Illustrations are full-bleed, hard-edged, and hand-inked — no gradients, no 3D, no photography on hero compositions. The hand-drawn 'Sackville' cursive wordmark overlays illustration panels as a brand signature. Photography, when used in product contexts, is unframed and sits directly on the cream canvas without borders or cards. The overall density is image-dominant in hero moments and type-dominant in editorial sections.

## Layout

The age-gate uses a full-bleed 50/50 split: the left half is a duotone illustration panel (Cobalt Ink on cream, no border, bleeding to edges), the right half is a text-and-interactive column on the cream canvas. There is no max-width container — the split fills the viewport. The interactive column centers its content vertically and horizontally within its half, with the eyebrow prompt at the top, the outlined oval button in the center, and the secondary text option below. Navigation is minimal and top-positioned. The system does not use a standard SaaS marketing layout (no hero band, no feature grid, no pricing table) — instead, each page reads as an editorial spread with full-bleed illustration panels alternating with text-driven columns. Section gaps are wide (~43px+) and whitespace is treated as a compositional element, not as filler.

## Similar Brands

- **Aesop** — Same editorial restraint on warm off-white canvas, grotesque single-weight typography, and bordered/outlined interactive elements rather than filled buttons — both treat the page as a printed page, not a screen
- **Maison Margiela** — Same riso/zine-print visual code with hand-inked illustration, cream backgrounds, and tight display type that creates magazine-cover pressure
- **A24** — Same flat-color illustration aesthetic with duotone treatment, hand-drawn wordmarks, and a saturated secondary palette used as editorial emphasis rather than functional UI
- **Toast (restaurant OS)** — Same single-weight grotesque typography on a warm neutral canvas, with no shadows, no gradients, and no filled buttons — both trust whitespace and type scale to create hierarchy
