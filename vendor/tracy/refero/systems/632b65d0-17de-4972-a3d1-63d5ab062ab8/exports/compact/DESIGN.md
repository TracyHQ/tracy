# Portal — Style Reference
> violet singularity tearing through obsidian — a heavy, weight-900 headline, #b296f8 glow, and a 10px corner in the dark.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Portal is a dark-mode gaming/AI brand system built around a single vivid violet accent that reads as a dimensional energy source cutting through obsidian surfaces. The visual logic is theatrical: nearly-black canvas (#000000), near-black surface layers (#0f0f13, #1d1d1d), hairline charcoal borders (#292929), and one vivid lavender (#b296f8) that appears as a portal-glow on icons, strokes, button fills, and shadow tints. Typography is heavily weighted (Suisse Intl 900) for display headlines — the voice is monumental, not quiet — paired with compact body text in the 400/500 range. Components share a single 10px radius and gain dimensionality from violet-tinted shadows (rgba(178,150,248,0.20) 0px 25px 50px -12px) rather than neutral elevation, making even flat cards feel like they emit light. Badge variants encode status through saturated border + desaturated fill pairs (green, blue, violet, pink), giving multi-category taxonomy without diluting the brand violet.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Page canvas, hero backgrounds, deepest surface — the obsidian backdrop against which the brand violet glows |
| Obsidian Surface | `#0f0f13` | Elevated card surfaces, button fills for neutral/ghost controls, hero overlays |
| Carbon Border | `#292929` | Hairline borders across cards, nav, body, links, and lists — the structural grid in a single near-black tone |
| Graphite Card Edge | `#1d1d1d` | Card-specific border tone, one step lighter than Carbon to create layered card edges |
| Ash Mist | `#2a2a36` | Subtle violet-tinted dark border for sections and footer dividers — the only near-gray with hue |
| Platinum Text | `#e6e6e6` | Primary body and UI text, nav links, card text, icon strokes — soft white for long-form reading on black |
| Foil Highlight | `#ffffff` | Display headings, brand mark, button labels on dark — pure white reserved for the loudest type moments |
| Steel Muted | `#9e9e9e` | Muted helper text, secondary list items, dimmed icon strokes — quiet copy in the body |
| Portal Violet | `#b296f8` | Primary action buttons, icon strokes, accent text, shadow tint — the singular brand signal; lavender that reads as dimensional energy |
| Wisteria | `#594b7c` | Muted violet border for accent rules and decorative dividers |
| Indigo Plum | `#4b3f71` | Violet badge border for category tags in the violet family |
| Lavender Mist | `#ede9fe` | Violet badge text fill — desaturated lavender for readable on-dark violet tag content |
| Fuchsia Ink | `#571c60` | Pink/magenta badge border for editorial or community-event categories |
| Verdant Edge | `#0e4f26` | Green outline accent for tags, dividers, and focused UI edges. Use as a supporting accent, not as a status color |
| Mint Whisper | `#dcfce7` | Success badge text — soft mint for green category labels on dark |
| Cobalt Vein | `#264264` | Blue outline accent for tags, dividers, and focused UI edges. Use as a supporting accent, not as a status color |
| Deep Tide | `#06425d` | Blue outline accent for tags, dividers, and focused UI edges. Use as a supporting accent, not as a status color |
| Ice Blue | `#dbeafe` | Info badge text — desaturated sky for blue category labels on dark |

## Typography

### Suisse Intl — Sole typeface. Weight 900 at 72px/48px for display and section headings is the signature — the brand does not whisper at scale, it announces. Weight 600 for sub-headings and nav, weight 500 for emphasized body, weight 400 for body and supporting copy. The lineHeight 1.00–1.11 at display sizes is unusually tight and signals confidence; body sits at 1.43–1.56 for compact reading. Letter-spacing tracks the hierarchy: -0.025em pulls display tight, 0.05em relaxes body, 0.20em stretches labels and badges wide.
- **Substitute:** Inter (closest free analog with similar geometric grotesque proportions) or Space Grotesk
- **Weights:** 400, 500, 600, 900
- **Sizes:** 12px, 14px, 16px, 18px, 36px, 48px, 72px
- **Line height:** 1.00, 1.11, 1.33, 1.43, 1.50, 1.56
- **Letter spacing:** -0.025em at 72px/48px display, 0.05em at 16px/18px body, 0.20em at 12px labels and badges

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.2px |
| body-sm | — | — | 14px | 1.43 | 0.05px |
| body | — | — | 16px | 1.5 | 0.05px |
| subheading | — | — | 18px | 1.56 | 0.05px |
| heading-sm | — | — | 36px | 1.11 | -0.025px |
| heading | — | — | 48px | 1.11 | -0.025px |
| display | — | — | 72px | 1 | -0.025px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **nav:** 10px
- **cards:** 10px
- **badges:** 10px
- **inputs:** 10px
- **buttons:** 10px

## Components

### Primary Action Button
**Role:** Filled violet CTA — the only chromatic button

Background #b296f8, text #ffffff, Suisse Intl 500 at 14px, padding 16px 24px, radius 10px, subtle rgba(0,0,0,0.05) 0px 1px 2px 0px shadow. The lavender fill against the obsidian canvas is the brand's single most recognizable moment.

### Ghost Button
**Role:** Secondary action on dark hero/sections

Transparent background, 1px border in #292929, text #e6e6e6, Suisse Intl 500 at 14px, padding 16px 24px, radius 10px. Reads as a quieter alternative that respects the violet primary.

### Nav Link
**Role:** Top-bar navigation item

Suisse Intl 400 at 14px, color #e6e6e6, no underline, 10px radius reserved for any pill-style link. Spacing 8px between items.

### Brand Mark
**Role:** Logo in header

White mark on dark header, 10px radius container, paired with 'Portal' wordmark in Foil Highlight #ffffff, weight 600.

### Announcement Bar
**Role:** Slim banner above header

Full-width dark band (#0f0f13), body text in #e6e6e6 at 14px, optional close icon, 8px vertical padding.

### Feature Card
**Role:** Three-column 'What We Do' card with image and copy

Background #0f0f13, 1px border in #1d1d1d, radius 10px, padding 16px, violet-tinted shadow rgba(178,150,248,0.20) 0px 25px 50px -12px. Image fills the top edge with no separate radius (image corners are clipped by card radius). Title in Suisse Intl 600 at 18px #ffffff, body in 400 at 16px #e6e6e6.

### Card with Glow
**Role:** Same as Feature Card — the shadow is the differentiator

Identical dimensions to Feature Card, defined by the violet-tinted shadow rather than any visual border treatment. The glow makes the card feel like it is emitting portal energy.

### Hero Overlay Card
**Role:** Text box layered over hero image

Semi-transparent panel containing hero headline and CTAs, 10px radius, no border. Sits on the hero illustration with the dark hero image as background.

### Success Badge
**Role:** Live/active/shipped status tag

Transparent fill, 1px border #0e4f26, text #dcfce7, Suisse Intl 500 at 12px, letter-spacing 0.20em, padding 2px 10px, radius 10px. Deep-green border + mint text reads as a quiet 'shipped' state.

### Info Badge
**Role:** Data/system/category tag — blue family

Transparent fill, 1px border #264264, text #dbeafe, Suisse Intl 500 at 12px, letter-spacing 0.20em, padding 2px 10px, radius 10px. Alternate variant uses #06425d border for deeper-blue categories.

### Violet Badge
**Role:** Brand-aligned category tag

Transparent fill, 1px border #4b3f71, text #ede9fe, Suisse Intl 500 at 12px, letter-spacing 0.20em, padding 2px 10px, radius 10px. Echoes the brand violet at lower saturation for taxonomy without competing with the primary.

### Pink Badge
**Role:** Editorial/community-event tag

Transparent fill, 1px border #571c60, text #ede9fe, Suisse Intl 500 at 12px, letter-spacing 0.20em, padding 2px 10px, radius 10px. Magenta signals a different category without breaking the system.

### Section Eyebrow Label
**Role:** All-caps label above section heading (e.g. 'WHAT WE DO')

Suisse Intl 500 at 12px, letter-spacing 0.20em, color #9e9e9e. Wide tracking on muted text creates a clear hierarchy entry point.

### Display Heading
**Role:** Hero and section titles

Suisse Intl 900 at 48–72px, color #ffffff, letter-spacing -0.025em, line-height 1.00–1.11. The 900 weight is the voice — it does not whisper.

## Do's and Don'ts

### Do
- Use #b296f8 as the only chromatic fill for action buttons; pair with #ffffff text and 10px radius.
- Set display headings in Suisse Intl 900 at 48–72px with -0.025em letter-spacing and line-height 1.00–1.11; the weight 900 is non-negotiable for the brand voice.
- Give every card the violet-tinted shadow rgba(178,150,248,0.20) 0px 25px 50px -12px — the glow is the elevation system, not a generic gray drop-shadow.
- Use the badge family with transparent fill, 1px saturated border, desaturated pastel text, 12px text, 0.20em letter-spacing, and 10px radius — keep all four color families (green/blue/violet/pink) in active rotation.
- Use the single 10px radius uniformly across cards, buttons, badges, and nav; do not introduce secondary radii.
- Keep the canvas at #000000 and elevated surfaces at #0f0f13; use #292929 and #1d1d1d as the only border tones.
- Track body text at 0.05em and small labels/badges at 0.20em; tighten display type to -0.025em — the three tracking values form a recognizable rhythm.

### Don't
- Do not introduce a second accent color — the brand is monochromatic dark with one violet signal.
- Do not use weight 400–600 for display headings; the 900 weight at large sizes is the signature.
- Do not apply neutral gray drop-shadows to cards; the violet-tinted shadow is the only elevation pattern.
- Do not use radii other than 10px; the system has one radius and it must remain singular.
- Do not place light text on light badge fills or dark text on dark borders — the badge pattern is always: dark saturated border + desaturated pastel text.
- Do not use #ffffff for body copy; reserve it for display headings and brand marks only. Body uses #e6e6e6.
- Do not soften the section gap below 48px; the compact-but-breathing rhythm is part of the identity.

## Elevation

- **Card:** `rgba(178, 150, 248, 0.2) 0px 25px 50px -12px`
- **Button:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`

## Surfaces

- **Void** (`#000000`) — Page canvas and hero backgrounds
- **Obsidian** (`#0f0f13`) — Elevated cards, button fills, hero overlays
- **Carbon Edge** (`#1d1d1d`) — Card border layer, creating perceptible card edges on the void
- **Portal Glow** (`#b296f8`) — Brand accent surface — action buttons and the violet shadow halo around cards

## Imagery

Imagery is hero-driven and full-bleed: a cinematic, anime/comic-style illustration of a dimensional portal — a hexagonal violet-and-white vortex tearing through an urban alleyway, with a silhouetted figure at its base. Illustrations are atmospheric, not product-screenshots; the portal itself is the recurring visual motif. Card imagery inside content sections shows tool interfaces, creator workflow scenes, and team/collaboration moments in the same painterly violet-and-indigo palette. Iconography is line-based, stroked in #b296f8 or #e6e6e6 with consistent thin-to-medium stroke weight. The page is image-heavy in the hero and image-light in the body sections, where 3-column feature cards with illustrations carry the visual weight.

## Layout

Full-bleed dark canvas with a max-width 1200px content container. The hero is a full-viewport-height illustrated scene with an overlaid text block in the upper-left area containing eyebrow, headline, subtext, and two CTAs (filled violet + ghost). Below the hero, the body lives in 48px-rhythm sections: a 3-column feature card grid with 16px gaps, then likely alternating text-and-image rows. Navigation is a top bar with logo left, links center, and a contact CTA right. An announcement bar sits above the nav. The layout alternates between image-rich (hero) and text-rich (sections) blocks, using generous 48px vertical breathing room between sections to keep the compact density from feeling cramped.

## Similar Brands

- **Runway** — Same dark canvas + single vivid accent signal + heavy display weight for AI-product marketing pages
- **Stability AI** — Same full-bleed cinematic hero illustration and violet-leaning generative-AI palette
- **Midjourney** — Same theatrical dark-mode design language where the product imagery IS the hero and text stays quiet
- **Inworld AI** — Same gaming/AI crossover vibe with violet dimensional branding and dark technical surfaces
- **Decart** — Same compact dark UI with a single lavender accent, weight-900 display type, and 10px-radius component family
