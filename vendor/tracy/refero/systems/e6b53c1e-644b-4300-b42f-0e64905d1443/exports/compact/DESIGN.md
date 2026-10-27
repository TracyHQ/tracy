# Relief — Style Reference
> Cream-paper harbor under flat sky-blue

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Relief uses a warm nautical-sky language: a cream canvas (#f9f7f0) replaces the default stark white, and a single vivid sky blue (#2e96ff) carries every interactive moment. Information architecture flips the usual light-card-on-white pattern — deep navy (#134f26f) feature and testimonial cards sit on cream like buoys on sand, creating bold visual blocks. The headline font Gilroy runs at tight -0.018em tracking across every size, giving text a compact, rounded confidence. Buttons earn their weight not from gradients or glow, but from a chunky 7px solid blue drop-shadow that makes the sky-blue fill appear to physically lift off the page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Warm Cream | `#f9f7f0` | Page canvas — the entire site rests on this off-white, never pure #ffffff. Removes clinical SaaS sterility; reads as approachable, paper-like |
| Snow | `#ffffff` | Elevated card surfaces, input fields, and light-bordered elements |
| Ink | `#333333` | Primary body and UI text — the dominant neutral for readable copy across cards, paragraphs, and labels |
| Charcoal | `#212121` | Heavier text instances, emphasis copy |
| Fog | `#d0d5dd` | Hairline borders and dividers between sections and cards |
| Slate | `#616c8a` | Muted secondary text, body copy in lighter contexts, de-emphasized metadata |
| Slate Border | `#40444e` | Stronger borders and link outlines where extra weight is needed |
| Deep Harbor | `#13426f` | Feature card fills, testimonial card fills, heading text — the dominant dark surface that anchors content blocks against the cream |
| Sky Pop | `#2e96ff` | Primary action buttons, active states, key emphasis text — the single chromatic accent that drives every interaction |
| Deep Wave | `#0254a5` | Outlined link and action border — a darker navy for ghost-style interactive elements that need to read on cream |
| Sky Tint | `#bde1f9` | Badge and trust-pill backgrounds, soft highlight washes behind icons and social proof |
| Sky Wash | `#cde7fb` | Button shadow tone — the same hue family used for the chunky pop shadow under sky-blue buttons |
| Info Mist | `#73b9ff` | Blue decorative accent for icons, marks, and small graphic details |
| Sky Mid | `#50a7ff` | Decorative illustration fills, mid-tone in 3D hero artwork |

## Typography

### Gilroy — Single-family type system — Gilroy runs at every size from 12px captions to 58px hero headlines. Rounded geometric forms give the brand its friendly financial tone without the stiffness of a grotesque. Weight 700 is the working default for headings and buttons; weight 500 carries UI labels.
- **Substitute:** Montserrat, Nunito, Manrope
- **Weights:** 400, 500, 600, 700, 800
- **Sizes:** 12, 14, 16, 18, 20, 32, 40, 49, 53, 58
- **Line height:** 0.94 (display), 1.10–1.29 (headings), 1.40–1.70 (body)
- **Letter spacing:** -0.018em across all sizes — uniform tight tracking gives Gilroy a compact, deliberate feel regardless of scale
- **OpenType features:** `"ss01" on (where available)`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.22px |
| body-sm | — | — | 14px | 1.5 | -0.25px |
| body | — | — | 16px | 1.6 | -0.29px |
| subheading | — | — | 18px | 1.5 | -0.32px |
| heading-sm | — | — | 20px | 1.4 | -0.36px |
| heading | — | — | 32px | 1.29 | -0.58px |
| heading-lg | — | — | 40px | 1.2 | -0.72px |
| display | — | — | 58px | 1.1 | -1.04px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 56-80px
- **Card padding:** 28px
- **Element gap:** 14px

### Border Radius

- **hero:** 49px
- **cards:** 18-30px
- **badges:** 40-100px (pill)
- **buttons:** 40-70px (pill)

## Components

### Primary CTA Button
**Role:** Main conversion action — appears in hero, feature sections, and sticky header

Fill #2e96ff, text #ffffff, Gilroy 700, 16px. Padding 14px 28px. Border-radius 40-70px (pill). Signature shadow rgba(154,207,246,0.5) 0px 7px 0px 0px — a flat solid blue offset 7px below the button, not a soft blur, making the button appear physically raised off the cream canvas.

### Header CTA Button
**Role:** Persistent action in the top-right of every screen

Same as Primary CTA Button but slightly more compact — padding 10-14px 28px, radius 40px. Always sky-blue with white text and the same 7px sky-blue pop shadow.

### Ghost Outline Button
**Role:** Secondary action where the primary is also present

Transparent fill or #ffffff, border 1-2px #ffffff or #d0d5dd, text #ffffff or #333333 depending on surface. Radius 40px (pill). Padding 10-14px 28px. No shadow.

### Feature Card
**Role:** Three-up grid card explaining a product step (Download, Link, Find savings)

Fill #13426f (deep navy), text #ffffff. Padding 28px. Border-radius 18-26px. Subtle shadow rgba(0,0,0,0.05) 0px 3px 0px 0px. Contains a heading in Gilroy 700 20-32px and a 3D nautical illustration. Sits directly on the cream canvas — no border needed because the navy/cream contrast is already strong.

### Testimonial Card
**Role:** User review in horizontal scroll row

Fill #13426f, text #ffffff. Padding 28px. Border-radius 18-30px. Five yellow star glyphs at top, review title in Gilroy 700 ~18px, body copy in Gilroy 400 14-16px, author name at bottom. No shadow. Width is variable to create the marquee feel.

### Trust Badge Pill
**Role:** Social-proof chip above the hero headline (e.g. 'Trusted by 160,000+ people')

Fill #bde1f9 (sky tint), text #13426f or #333333. Padding 8-11px vertical, 20-21px horizontal. Border-radius 40-100px (full pill). Gilroy 600-700, 12-14px. Often contains small avatar dots and a label.

### Hero Phone Mockup
**Role:** Product visualization floating in the center of the hero

White phone frame, ~280-320px wide, border-radius 26-30px on frame. Screen fill #ffffff. Inside: dark heading text, a large sky-blue savings number (~$5,550 in Gilroy 700 32-40px), a small sublabel, and a 3D illustration of coins and a piggy bank in a life preserver. Sits on a light-blue sky background with floating clouds and a sailboat.

### Press Logo Bar
**Role:** Row of media-outlet logos under the savings headline

Four to five monochrome wordmarks in #333333 or #13426f, horizontally centered, 24-32px tall, even column gaps. No logos, no dividers — just spacing rhythm on the cream band.

### Stat Headline Band
**Role:** Full-width cream section highlighting a key number (e.g. 'Over $6 billion in savings found')

Fill #f9f7f0 (or slightly warmer cream). Centered text: the number or key word rendered in #2e96ff sky blue, the rest in #13426f deep navy. Gilroy 700 at 40-49px. Padding 56-80px vertical.

### Section Divider
**Role:** Visual break between content blocks

Often a full-bleed light-blue sky band (#dfe5eb or similar) carrying illustrations, then back to cream. Functions as a scene change rather than a line — no thin divider rules are used.

### FAQ Accordion Item
**Role:** Expandable question/answer at the bottom of long pages

Border-bottom 1px #d0d5dd between items. Question in Gilroy 600 18-20px #13426f, answer in Gilroy 400 16px #333333. No card chrome — sits directly on the cream canvas with just the hairline rule.

### App Store Pill
**Role:** Download link to the App Store

Fill #2e96ff, text #ffffff, border-radius 40-70px (pill). Padding 14px 28px. Gilroy 700 14-16px. Same sky-blue pop-shadow treatment as the primary CTA.

## Do's and Don'ts

### Do
- Use #f9f7f0 cream as the page canvas — never pure white for the body background. Cream is the signature of the brand's approachable tone.
- Apply the 7px solid sky-blue pop shadow to every primary CTA: rgba(154,207,246,0.5) 0px 7px 0px 0px. Never use a CSS blur for button elevation.
- Use 40-70px pill radius on all buttons and badges. No squared corners on interactive elements.
- Place dark navy (#13426f) content cards directly on the cream canvas. The navy/cream contrast is the primary visual block pattern — skip white-card-on-cream.
- Set letter-spacing to -0.018em on every Gilroy size. The tight tracking is uniform from 12px captions to 58px displays.
- Use sky-blue (#2e96ff) as the sole chromatic accent. Reserve it for CTAs, active states, and the key word in stat headlines — never for large background fills or decorative shapes beyond the hero scene.
- Pad feature and testimonial cards to 28px and give them 18-26px radius. Pair with 14-18px heading-to-body gap.

### Don't
- Don't use a soft blurred drop-shadow anywhere — the system uses flat solid offset shadows only, or none at all.
- Don't introduce new brand colors outside the sky-blue / deep-navy / cream / ink palette. Greens, pinks, purples are illustration-only.
- Don't use 0-8px radius on buttons or cards. The system is consistently soft and rounded — sharp corners break the toy-like feel.
- Don't put dark navy text on the cream canvas for body copy. Use #333333 for body, reserve #13426f for headings and card surfaces.
- Don't render body backgrounds as #ffffff. The cream #f9f7f0 is the canvas; #ffffff is only for elevated card surfaces floating above it.
- Don't use 600+ weights for Gilroy captions and body-sm text. Body copy stays at 400-500; 700+ is for headings, buttons, and emphasis only.
- Don't add secondary or tertiary buttons that aren't a pill. Square or slightly-rounded buttons read as a different system.

## Elevation

- **Primary CTA Button:** `rgba(154, 207, 246, 0.5) 0px 7px 0px 0px — flat solid offset, not a soft blur`
- **Secondary Pop Button:** `rgba(154, 207, 246, 0.5) 0px 5px 0px 0px`
- **Feature Card:** `rgba(0, 0, 0, 0.05) 0px 3px 0px 0px — barely-there flat offset`

## Surfaces

- **Warm Cream** (`#f9f7f0`) — Page canvas — the base layer every section sits on
- **Snow** (`#ffffff`) — Elevated cards and input fields floating above cream
- **Deep Harbor** (`#13426f`) — Dark content blocks — feature cards, testimonial cards, dark hero panels
- **Sky Pop** (`#2e96ff`) — Interactive accent — CTA buttons, active indicators
- **Sky Tint** (`#bde1f9`) — Highlight washes — badge backgrounds, soft icon halos

## Imagery

The site is entirely illustration-driven — no photography. 3D isometric renders in a soft, slightly claymation style: a blue sailboat, a pink piggy bank in a red life preserver, a gold coin, a navy anchor with chains, an orange life buoy. Color treatment is bright but not neon — the palette stays within the sky-blue, navy, warm cream, and gold range so illustrations feel part of the system, not imported. The hero composes these as a floating scene: phone mockup centered, illustrations orbiting around it on a sky-blue background with white cloud puffs. Icons throughout are filled, not outlined, in solid navy or sky-blue. The illustrations are decorative atmosphere and product showcase — they do not explain content, they set emotional tone (escape, freedom, rescue).

## Layout

Full-bleed bands that alternate between warm cream (#f9f7f0) and a light sky-blue (#dfe5eb). Hero is a centered stack on sky-blue: trust badge, 58px headline, 18px subtext, 40px CTA, then a phone mockup floating over water with a sailboat illustration at the left edge. Feature grid is a 3-column row of dark navy cards on cream. Testimonials are a horizontal scroll/marquee of navy cards. Sections are separated by generous 56-80px vertical gaps, not hairlines — the color change is the divider. Max content width ~1200px centered. Navigation is minimal: logo left, single pill button right, no menu links visible in the hero flow. Below-the-fold sections keep the centered, single-column rhythm rather than complex multi-column layouts.

## Similar Brands

- **Albert (albert.com)** — Same warm cream canvas with a single bold accent color and rounded geometric type — financial product that feels friendly rather than corporate.
- **Cleo (web.meetcleo.com)** — Playful illustrated 3D style, cream/neutral background, bold pill-shaped CTAs, and a single bright accent driving all interaction moments.
- **Acorns** — Soft rounded forms, pill buttons with chunky solid offset shadows, and a single green accent against neutral surfaces — same toy-like elevation language.
- **Chime** — Clean light theme with a vivid single-accent blue, large rounded type, and pill-shaped primary actions over a soft off-white canvas.
