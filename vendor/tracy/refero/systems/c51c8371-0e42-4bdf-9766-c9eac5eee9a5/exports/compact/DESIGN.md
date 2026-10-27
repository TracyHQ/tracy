# ElevenReader — Style Reference
> newsprint minimalism with a single color bloom

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ElevenReader runs on a near-monochrome visual language: paper-white canvas, ink-black type, and hairline gray borders doing all the structural work. A single custom display face (WaldenburgHF, bold only) carries every heading at a fixed tight leading, creating a single typographic voice across the whole product surface. The interface stays flat — no shadows, no elevation stacks, no decorative gradients in the UI — with one moment of color appearing as an atmospheric radial wash in the hero (forest green dissolving into lavender) that sets an emotional tone without ever repeating inside components. Pill-shaped controls (9999px radius), large generous gutters, and a single weight contrast (Inter 400 vs 700) keep the system feeling like printed editorial spread — content-first, ornament-last.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Paper | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Mist | `#f2f2f2` | Page canvas, subtle alternating section backgrounds, secondary surface tone behind cards |
| Bone | `#e5e5e5` | Hairline borders, dividers between stacked rows, FAQ item outlines, low-contrast separators |
| Lavender Haze | `#c8d5f4` | Soft atmospheric wash — appears only as a near-gray tinted background band near the hero, never as a functional UI color |
| Graphite | `#767676` | Muted body text, metadata, helper copy — secondary reading layer under Ink headlines |
| Slate | `#6e6e6e` | Tertiary captions, press attribution, supplementary labels |
| Hero Bloom | `radial-gradient(50% 50%, rgb(36, 63, 43) 0%, rgb(66, 141, 116) 54%, rgb(165, 177, 221) 78.5%, rgb(236, 230, 244) 99%)` | Decorative atmospheric radial gradient — forest-green to lavender wash used only behind the hero media block, never repeated in components |

## Typography

### WaldenburgHF — Display and heading face — used exclusively at weight 700 across all heading levels (28/32/48px). This single-weight discipline is the signature: no light/medium variants, no italic. The fixed 1.10 leading and 0.01em tracking make headings sit close and tight, like editorial pull quotes.
- **Substitute:** Bricolage Grotesque (Google) at 800 weight, or Mona Sans at 800
- **Weights:** 700
- **Sizes:** 28px, 32px, 48px
- **Line height:** 1.10
- **Letter spacing:** 0.0100em

### Inter — Body, UI labels, navigation, button text, captions, footer. The 400/700 binary (no 500/600) keeps the system visually restrained — only two text voices exist. Body text reads at 16px/1.40, the standard comfortable reading rhythm; small UI labels drop to 14px/1.43 and 12px/1.60.
- **Substitute:** Inter (same family — it's already Google-hosted)
- **Weights:** 400, 700
- **Sizes:** 12px, 14px, 16px, 18px
- **Line height:** 1.40–1.60 (12px: 1.60, 14px: 1.43, 16px: 1.40, 18px: 1.10)
- **Letter spacing:** 0.0100em
- **OpenType features:** `"ss01" off, "cv11" off`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.6 | 0.12px |
| body-sm | — | — | 14px | 1.43 | 0.14px |
| body | — | — | 16px | 1.4 | 0.16px |
| subheading | — | — | 18px | 1.1 | 0.18px |
| heading-sm | — | — | 28px | 1.1 | 0.28px |
| heading-lg | — | — | 32px | 1.1 | 0.32px |
| display | — | — | 48px | 1.1 | 0.48px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 28px
- **Element gap:** 8px

### Border Radius

- **nav:** 9999px
- **cards:** 16px
- **other:** 8px
- **buttons:** 9999px
- **link-underline:** 2px

## Components

### Filled CTA Button
**Role:** Primary action — trial signup, app download

Pill shape (9999px radius), #000000 background, #ffffff text, Inter 700 at 14px, letter-spacing 0.14px, padding 10px 20px. No border. The black-on-white pill is the only filled control in the system.

### Ghost/Outlined Button
**Role:** Secondary action — 'TRY IT NOW', 'TRY NOW'

Pill shape (9999px radius), #ffffff background, #e5e5e5 hairline border (1px), #000000 text, Inter 700 at 14px, padding 10px 20px. Mirrors the filled CTA's geometry so the two can sit side-by-side as a primary/secondary pair.

### Pill Navigation Link
**Role:** Top nav and footer nav items

Pill shape (9999px), #ffffff background, #000000 text in Inter 400–700 at 14px, padding 8px 16px. Active state uses filled black fill with white text.

### Video Play Button
**Role:** Centered call-to-watch on the hero gradient panel

Pill shape (9999px), #000000 background, #ffffff text 'Watch film' in Inter 700 14px, with a leading 32px-diameter white circle containing a black play triangle. Padding 12px 20px 12px 12px.

### FAQ Accordion Row
**Role:** Expandable question in the FAQ section

Full-width row, 1px #e5e5e5 top/bottom border, no side borders, #ffffff background. Question text in Inter 700 at 16px in #000000, right-aligned '+' icon in #000000 at 16px. Padding 16px 20px. Rows stack vertically with 0px gap between siblings — the border does the separating.

### Press Mention Card
**Role:** Editorial coverage tile in the press strip

No visible card container — text is set directly on #ffffff canvas. Headline in Inter 700 at 16px, #000000, max 3 lines, followed by the publication's logo (green TechCrunch, purple VentureBeat, black Variety, etc.) in their own brand colors. The publication logos are the only color in the page below the hero.

### Phone App Mockup
**Role:** Hero product demonstration

Tall portrait device frame (rounded 30px corners), #ffffff screen surface, showing app UI. Sits centered below the hero headline, visually anchored by the radial gradient wash behind it. The mockup has no drop shadow — it floats on the gradient.

### QR Download Widget
**Role:** Floating app download prompt (left-bottom corner)

Small white card, 16px radius, 1px #e5e5e5 border, 16px padding. Contains brand wordmark in Inter 700, a black-on-white QR code, and a 'GET THE APP' label in Inter 700 12px caps. A small × close button in the top-right.

### Hero Atmospheric Panel
**Role:** Single-use gradient section behind the watch-film CTA

Full-width band filled with a radial gradient from deep forest green (36, 63, 43) through teal (66, 141, 116) to lavender (165, 177, 221) to near-white lilac (236, 230, 244). No border, no radius, no shadow. The only colored surface in the system — intentionally used once.

### Eyebrow Tag
**Role:** Small section identifier above hero headline

Inter 700 at 12px, #000000, uppercase, letter-spacing 0.12px, preceded by a 16px-square icon container with 4px radius.

## Do's and Don'ts

### Do
- Use WaldenburgHF (or substitute Bricolage Grotesque 800) at 28/32/48px with lineHeight 1.10 for every heading — never use Inter for display sizes
- Use 9999px border-radius on every button, nav item, and pill control; reserve 16px for cards and 8px for small inline containers
- Set body text at Inter 400/16px with 1.40 leading and 0.16px letter-spacing — never go below 1.40 leading for 16px text
- Separate FAQ rows and stacked lists with 1px #e5e5e5 borders rather than background tints or gaps
- Use #f2f2f2 for the page canvas and #ffffff for all cards/elevated surfaces — these two values carry the entire surface system
- Render the hero atmospheric gradient (radial, forest-green to lavender) exactly once per page — never repeat it in body sections
- Pair the filled black pill button with a white ghost pill button as the canonical primary/secondary CTA duo

### Don't
- Don't introduce a chromatic accent color for CTAs or interactive states — the system has no distinct action color; all actions read through the black/white pill pair
- Don't use WaldenburgHF at any weight other than 700 — the single-weight discipline is the signature
- Don't apply drop shadows anywhere except a single 1px 0 1 2 rgba(16,24,40,0.05) on the filled CTA — elevation is intentionally absent
- Don't use #c8d5f4 as a functional UI color — it's an atmospheric tint, not a token
- Don't use Inter at 500 or 600 weight — only 400 and 700 exist in the system
- Don't add gaps between FAQ accordion rows — the 1px border IS the separator
- Don't let section gaps fall below 48px — the design relies on generous vertical whitespace to feel editorial

## Elevation

- **Filled CTA Button:** `0px 1px 2px 0px rgba(16, 24, 40, 0.05)`

## Surfaces

- **Canvas** (`#f2f2f2`) — Base page background, used as the negative space between content bands
- **Surface** (`#ffffff`) — Card backgrounds, FAQ rows, button fills (ghost), product mockup screen
- **Tinted Band** (`#f2f5fc`) — Subtle blue-tinted section backgrounds derived from the hero gradient
- **Atmospheric** (`#c8d5f4`) — Lavender haze in the radial gradient — decorative, not interactive

## Imagery

Product mockups dominate: a tall phone-shaped device frame showing the app interface sits at the center of the hero, and a second device frame appears in the watch-film gradient panel. Both mockups use #ffffff screen backgrounds with no device shadow — they float on whatever surface holds them. No photography, no lifestyle imagery, no stock visuals. Press logos (TechCrunch green, VentureBeat purple, Variety black, Bolt U) appear in their native brand colors as the only chromatic content below the hero, serving as social proof. Icons are minimal — a single 16px square, a QR pattern, a play triangle, and ± toggle marks — all rendered in flat #000000 with no decoration.

## Layout

Max-width 1200px centered container with generous side gutters. The page is a single vertical scroll with alternating surface bands: white hero → gradient atmospheric panel → white press strip → white FAQ section. Hero is split asymmetrically — headline and CTAs left-aligned in the upper-left, phone mockup centered below. The gradient panel is a full-bleed horizontal band that breaks the container width to span the viewport. Sections are separated by vertical whitespace (64px+) rather than dividers. FAQ uses a full-width single-column stack. Press mentions flow in a 4-column grid at desktop. Navigation is a minimal top bar: brand wordmark left, two links center, two buttons right — no mega-menu, no sidebar.

## Similar Brands

- **Readwise Reader** — Same editorial-print approach: paper-white canvas, hairline gray dividers, single-weight heading voice, generous whitespace, and zero chromatic UI accents
- **Notion** — Near-monochrome palette with ink-black text, pill-shaped controls, and flat surfaces — ElevenReader pushes the same restraint further with no color and a custom display face
- **Are.na** — Print-like minimalism with a single bold heading weight, 1px gray row separators in lists, and white-on-white layering with no shadows
- **Linear** — Pill-shaped buttons, tight typographic leading, and a near-achromatic interface — but ElevenReader drops Linear's purple accent entirely
- **The Browser Company (Arc)** — Custom display typography for headings, generous vertical rhythm, and a willingness to use one atmospheric gradient as the page's only moment of color
