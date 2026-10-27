# Delphi — Style Reference
> warm parchment editorial with ember sparks

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Delphi reads like an editorial spread on warm parchment: cream canvas, brown-black ink, a serif display voice, and orange sparks of energy. The product promises digital preservation of human expertise, and the visual language mirrors that — quiet, literary surfaces, generous whitespace, and chrome that feels printed rather than engineered. Color is used sparingly: the page stays achromatic-warm, with a single dark-chestnut button tone and a vivid ember orange reserved for trust signals, highlights, and the conversational heat of the hero's scattered question cards. Components are flat, low-elevation, and rely on thin hairlines and soft 12px corners rather than shadow stacks. Typography carries the personality — a humanist serif at whisper-light weight for headlines, a workhorse sans for body — creating the rhythm of a long-form magazine sitting next to a product interface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#fdf6ee` | Page canvas, hero background, card surfaces on light sections — sets the warm literary tone that distinguishes this from the cool-white default of most SaaS |
| Soft Cream | `#f0e6dc` | Navigation background, secondary surface layer, subtle hover/elevated zones |
| Pure Card | `#ffffff` | Foreground card surface for content blocks, feature panels, and the floating chat testimonials in the hero |
| Ink Black | `#000000` | Primary text, icon strokes, and border lines — used at the highest prominence to anchor every paragraph and heading |
| Charcoal Bark | `#21201c` | Body text on light surfaces where pure black reads too cold against the cream |
| Sepia | `#2b180a` | Headings, button text, emphasized inline elements — dark brown instead of black gives headlines a printed-ink quality |
| Bronze | `#7f6e60` | Muted secondary body text, descriptive captions beneath headings |
| Driftwood | `#94877c` | Tertiary text, nav links, low-emphasis labels, and warm-toned dividers |
| Stone | `#a99d93` | Disabled or lowest-emphasis text, ghost iconography |
| Pebble | `#d9cfc3` | Hairline borders, card edges, and subtle dividers on cream surfaces |
| Chestnut | `#3e2407` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ember Orange | `#f65726` | Accent text, in-card highlights, conversational emphasis — warm vivid orange that ignites against the parchment |
| Saffron Pulse | `#ff5c00` | Orange supporting accent for decorative details and low-frequency emphasis. |
| Peach Glow | `#fed0b3` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Martina Plantijn Light — Display and heading face — a humanist serif that carries the editorial, literary voice of the brand. Light weight (300) is used for the largest display headlines, where the negative letter-spacing tightens the characters into a single confident mark. This font is the most distinctive choice in the system: a serif on a product interface signals thoughtfulness and preservation rather than speed and automation.
- **Substitute:** Cormorant Garamond or Lora (Google Fonts)
- **Weights:** 300, 400, 700
- **Sizes:** 8, 10, 12, 14, 15, 20, 24, 40, 56, 64
- **Line height:** 1.00, 1.20, 1.22, 1.32, 1.34
- **Letter spacing:** -0.0300em at 64px, -0.0220em at 56px, -0.0200em at 40px, -0.0130em at 24px, -0.0120em at 20px

### Inter — Body, navigation, and UI text — the workhorse sans that handles everything below the headlines. Weight 400 is default body, weight 500 for emphasized labels and nav. Tight -0.0100em tracking keeps the small sizes legible without feeling clinical.
- **Substitute:** Inter (Google Fonts — native match)
- **Weights:** 400, 500
- **Sizes:** 10, 13, 14, 15, 17
- **Line height:** 1.00, 1.20, 1.40
- **Letter spacing:** -0.0100em

### Roboto Mono — Used sparingly for inline code-like references (e.g. the '> 50 chats' trigger syntax in feature cards) — a monospace accent that signals system or automation language within editorial copy
- **Weights:** 400
- **Sizes:** 13
- **Line height:** 1.40

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | -0.012px |
| body | — | — | 15px | 1.32 | -0.015px |
| subheading | — | — | 20px | 1.32 | -0.24px |
| heading-sm | — | — | 24px | 1.22 | -0.312px |
| heading | — | — | 40px | 1.2 | -0.8px |
| heading-lg | — | — | 56px | 1 | -1.232px |
| display | — | — | 64px | 1 | -1.92px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20-24px
- **Element gap:** 8-12px

### Border Radius

- **tags:** 8px
- **cards:** 12-16px
- **avatars:** 70px
- **buttons:** 12px
- **smallElements:** 4px

## Components

### Primary Chestnut Button
**Role:** Hero CTA and main conversion action

Chestnut (#3e2407) solid fill, white text, 12px border-radius, horizontal padding ~16px, vertical padding ~10px. The signature detail is the peach (#fed0b3) box-shadow glow that radiates from behind the button — a warm bloom rather than a neutral drop shadow. Inter 15px / 500. This button replaces the conventional blue CTA with a brown that reads as 'considered, premium'.

### Ghost Outline Button
**Role:** Secondary action paired with the primary CTA (e.g. 'See it in action')

Transparent fill, 1px pebble (#d9cfc3) or charcoal border, 12px radius, Inter 15px / 500 in sepia (#2b180a). No background, no shadow — sits in conversation with the filled button.

### Nav Pill Button
**Role:** Top-right 'Get Started' action in the navigation bar

Soft cream (#f0e6dc) background, sepia text, fully rounded 12px radius with generous horizontal padding. Reads as a soft chip rather than a hard button — a gentler approach to navigation conversion.

### Floating Question Card
**Role:** Hero scatter element — miniature testimonial cards that surround the headline

White (#ffffff) surface, 12px border-radius, subtle hairline border or very soft shadow, 12-16px internal padding. Each card stacks: circular 70px avatar, name + role in Inter 12-13px, and a one-sentence question in Inter 14px. These are the signature design moment — they replace a hero illustration with living proof.

### Avatar Bubble
**Role:** Circular profile image used in question cards and feature panels

70px border-radius (effectively a perfect circle), image fill with no border. Appears with a small blue/verified check overlay on certain positions.

### Section Eyebrow Tag
**Role:** Small label above section titles ('Why Delphi', 'Trust')

Pebble-colored text (#d9cfc3) or saffron (#ff5c00) on the cream background, Inter ~12-13px, centered above the heading. Sometimes sits inside a hairline-bordered pill. Functions as a low-volume category marker.

### Feature Side Card
**Role:** Two-column feature blocks (e.g. 'Never Repeat Yourself Again')

Off-white or cream surface, 16px border-radius, generous internal padding (24-32px). Heading in Martina Plantijn Light 24px, body in Inter 15px bronze, optional chat preview or automation trigger rendered as a sub-card at the bottom with a monospaced condition line.

### Trigger Preview Card
**Role:** Inline preview of a Delphi automation trigger inside a feature card

Nested sub-card with 8-12px radius, white or cream fill, small Inter label ('When') in muted gray, a one-line condition in Inter 14px where the variable value is highlighted in ember orange (#f65726), and a '+ Add Action' row below in subdued text.

### Centered Portrait Panel
**Role:** Trust section centerpiece — a single full-color portrait card flanked by two feature cards

Tall card with 16px radius, warm gradient or photographic portrait background, name and role overlay in white sans text near the bottom. The portrait bleeds into a soft fade that merges with the parchment canvas below.

### Verified Badge Dot
**Role:** Small marker indicating a verified expert on avatar bubbles

Cobalt blue circle (~#1da1f2 or similar) with a white check, positioned at the lower-right of the avatar. The only true blue element on the page, making it pop as a system signal.

### Section Headline Block
**Role:** Centered two-line display title for each section

First line in Martina Plantijn Light 56px, second line in lighter or italic weight for contrast — a deliberate two-tone line treatment. Below it, a single paragraph of body copy in Inter ~17px bronze (#7f6e60), centered, max-width ~640px.

## Do's and Don'ts

### Do
- Use Martina Plantijn Light weight 300 with letter-spacing -0.022em for all section and hero headlines — the whisper-light serif is the brand's editorial signature.
- Place the primary CTA on a chestnut (#3e2407) fill with the peach (#fed0b3) glow shadow; never use a conventional blue or green for action buttons.
- Keep page background on Parchment (#fdf6ee); switch to Pure Card (#ffffff) only for cards that need to lift above the canvas.
- Apply 12px radius to buttons and 16px radius to image-bearing cards — 70px only for avatar circles, never for other shapes.
- Reserve saffron (#ff5c00) and ember orange (#f65726) for one or two punctuation moments per viewport — never for large fills or backgrounds.
- Set the hero as a scattered constellation of white question cards around a centered serif headline; do not use a single hero illustration.
- Anchor each section with a centered eyebrow tag above a two-line serif headline; one short paragraph below, no more.

### Don't
- Do not use bright blue, green, or any cool color as a primary CTA fill — chestnut brown is the only button fill color in this system.
- Do not apply heavy drop shadows to cards; the design uses flat surfaces and hairline borders, not elevation stacks.
- Do not set body text in the serif face — Inter handles all copy below 20px, Martina Plantijn only for display.
- Do not use pure black (#000000) as body text on cream — the eye reads it too cold; use sepia (#2b180a) or charcoal bark (#21201c) instead. Black is reserved for nav text and icon strokes.
- Do not introduce gradients on cards or buttons — the page is flat, with the single exception of the portrait panel and the peach button glow.
- Do not exceed two text colors per block (one heading tone, one body tone); the warmth comes from limited palette use, not from variation.
- Do not add rounded-radius values outside the scale of 4px, 8px, 12px, 16px, and 70px — the radii vocabulary is deliberately short.

## Elevation

Delphi uses a deliberately flat elevation model: cards and panels sit on the parchment canvas with a 1px pebble border or no border at all, rather than relying on shadow depth. The single exception is the primary chestnut button, which receives a soft peach (#fed0b3) bloom-shadow — a warm, on-brand glow rather than a neutral drop shadow. This restraint is editorial: the page reads as a printed spread, not as a layered app.

## Surfaces

- **Parchment Canvas** (`#fdf6ee`) — Page-wide background, hero, and section backgrounds
- **Soft Cream** (`#f0e6dc`) — Navigation bar, subtle elevated zones, hover backgrounds
- **Pure Card** (`#ffffff`) — Content cards, feature panels, floating testimonial cards
- **Chestnut Block** (`#3e2407`) — Primary CTA button, dark accent surfaces

## Imagery

Imagery on Delphi is minimal and serves as social proof, not decoration. The hero uses no illustration or product screenshot — instead, the visual energy comes from scattered floating question cards, each containing a circular avatar portrait and a line of quoted expertise. The single full-bleed photographic moment is a centered trust-section portrait (a smiling expert on a warm orange-red background) that bleeds into the canvas via a soft fade. Avatars are tight headshots, not lifestyle photography. The overall feel is 'magazine table of contents' rather than 'product hero' — the people are the visual content, not the product UI.

## Layout

Delphi uses a max-width ~1200px centered container on a full-bleed parchment canvas. The hero is a distinctive constellation layout: a centered serif headline ('Digitize Your Mind') sits in the visual middle, with 8-10 small white question cards scattered loosely around it at varying sizes and positions, creating a sense of orbiting voices. Below the hero, sections follow a consistent rhythm: a centered eyebrow tag ('Why Delphi', 'Trust'), a two-line serif headline, one short body paragraph, then either a 2-column feature grid or a 3-up card row. The 'Trust' section uses a 3-column grid flanking a tall centered portrait card, where the left and right columns contain stacked feature cards. Navigation is a minimal top bar with left-aligned industry/resource links, a centered wordmark, and right-aligned discover/sign-in/get-started actions. No sidebar, no sticky header, no mega-menu.

## Similar Brands

- **Substack** — Same editorial serif-headline + warm-cream-canvas approach, where the product UI is dressed like a long-form publication
- **Notion AI** — Similar light minimalism with warm neutrals and a single non-blue accent for action emphasis
- **Gamma** — Centered serif display headlines floating on a soft warm canvas with subtle scatter-card hero composition
- **Anthropic** — Editorial typography-first homepage where the serif headline carries personality and the product UI stays quiet and warm-toned
