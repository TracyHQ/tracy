# Seline Analytics — Style Reference
> Quiet analyst's desk on warm paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Seline sits on a warm-stone canvas (#fafaf9) with a single vivid cyan as its only chromatic accent — every other color is a neutral pulled from the Tailwind stone scale. Headlines use a custom geometric sans (roobert) at weight 400 with tight negative tracking, giving display copy an unhurried, almost whispered authority that contrasts with the usual SaaS shout. UI surfaces are flat white cards floating over the warm background via a single soft 16px-blur shadow; borders are 1px stone hairlines used generously as the primary structural device instead of heavy dividers or panels. The layout breathes: max-width content centered on generous vertical rhythm, with pill-shaped interactive controls, a mascot sticker illustration for personality, and data dashboard screenshots as proof-of-product. The overall feel is editorial analytics — calm, monochrome, confident — where the blue CTA is the loudest thing on the page by deliberate restraint of everything else.

## Colors

| Name | Value | Role |
|------|-------|------|
| Stone Canvas | `#fafaf9` | Page background — warm off-white that reads as paper, not screen-white |
| Pure White | `#ffffff` | Card surfaces, elevated panels, input fills — flat and shadowless by default |
| Stone Border | `#e8e6e5` | Hairline borders on cards, nav, inputs — the primary structural device, not dividers |
| Stone Muted | `#d6d3d1` | Secondary borders, subtle background tints, decorative separators |
| Ash Gray | `#a8a29e` | Muted helper text, icon strokes, disabled states — readable but recessive |
| Warm Gray | `#78716c` | Body text, nav links, secondary copy — warm-tinted neutral that softens body type |
| Ink Black | `#0c0a09` | Primary headings, emphasized body, strong icons — near-black with a warm cast |
| Soot | `#1c1917` | Dark surface backgrounds for inverted sections, dark dashboard tabs |
| Sky Wash | `#c1e1f7` | Soft highlight wash behind highlighted text spans, decorative blue tint |
| Cyan Signal | `#3ba6f1` | Primary CTA fill, active links, brand icon strokes — the only chromatic voice on the page, used sparingly to make actions feel switched on |
| Cyan Edge | `#3398e1` | Blue accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |

## Typography

### Roobert — Display and heading typeface — custom geometric sans with tight negative tracking (-0.025em at 32px, -0.021em at 52px). Weight 400 at 52px is the signature: anti-convention whisper-weight that creates authority through restraint. Headlines occupy their space without shouting.
- **Substitute:** Inter Tight or Satoshi
- **Weights:** 400, 500
- **Sizes:** 18px, 20px, 32px, 52px
- **Line height:** 1.12, 1.22, 1.25, 1.69
- **Letter spacing:** -0.025em at 32px, -0.021em at 52px, -0.017em at 18px

### Inter — Body, nav, UI, and caption typeface — neutral workhorse for all non-display copy. 14px weight 400 at 1.64 line-height is the dominant body size (freq 1174). Positive tracking (0.004em) at small sizes keeps dense UI legible.
- **Substitute:** Inter
- **Weights:** 400, 500, 600
- **Sizes:** 10px, 12px, 13px, 14px, 15px, 16px, 18px
- **Line height:** 1.33, 1.53, 1.64, 1.69, 2.3
- **Letter spacing:** 0.0030em, 0.0040em, 0.0250em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 2.3 | 0px |
| body-lg | — | — | 16px | 1.69 | 0.048px |
| subheading | — | — | 20px | 1.2 | -0.1px |
| heading-sm | — | — | 32px | 1.25 | -0.8px |
| display | — | — | 52px | 1.12 | -1.092px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 10px
- **icons:** 4px
- **inputs:** 6px
- **buttons:** 9999px
- **feature-card:** 16px

## Components

### Primary CTA Button (filled cyan)
**Role:** Highest-priority conversion action — 'Start free trial', primary sign-ups

Pill shape (9999px radius), fill #3ba6f1, 1px border #3398e1, white text (#ffffff) weight 500, padding 8px 16px. The only chromatic filled element on the page — use once per viewport maximum.

### Secondary Ghost Button
**Role:** Lower-priority action beside primary — 'View live demo', secondary navigation

Pill shape (9999px radius), transparent fill, 1px border #e8e6e5, text #0c0a09 weight 400, padding 8px 16px. Quiet companion to the cyan CTA.

### Navigation Link
**Role:** Top-nav menu items — Pricing, About us, Platform, Resources

No fill, no border, 14px Inter weight 400, color #78716c, padding 0 12px, height 32px. Hovers to #0c0a09. Dropdown caret inline at end.

### Signed-in Avatar Link
**Role:** Top-nav social proof cluster — stack of 4 overlapping circular avatars

24px circles with 2px ring offset, -8px overlap spacing. Sits inline between nav items as proof-of-community. Avatars are real photos, no border.

### Flat Content Card
**Role:** Feature blocks, dashboard previews, testimonial cards

White (#ffffff) fill, 10px radius, 1px border #e8e6e5 (not shadow-dependent), 24px padding. Subtle shadow rgba(0,0,0,0.05) 0px 4px 16px 0px adds lift without weight. The border IS the structure.

### Floating Dashboard Preview
**Role:** Hero product screenshot — the dashboard mockup

16px radius, white fill, shadow rgba(17,12,46,0.12) 0px 12px 45px 0px — the one card allowed to feel elevated/3D. 8px padding internally so the dashboard UI sits within a frame. Grayscale(1) contrast(0.94) filter applied for muted product photography feel.

### Highlighted Text Span
**Role:** Inline emphasis within headlines — 'simple & actionable', 'saves us time'

Text in #3398e1 with a soft #c1e1f7 background highlight (pill-shaped background behind the word). Weight 400. The only inline color treatment — every headline gets one.

### Text Input
**Role:** Newsletter signup, form fields

White fill, 6px radius, 1px border #d6d3d1, placeholder #78716c, padding 4px 12px. Focus ring: 2px #3ba6f1. Minimal, inline with label.

### Mascot Sticker Illustration
**Role:** Brand personality element — the hooded character peeking from behind cards

Grayscale illustration with drop-shadow filter (rgba(0,0,0,0.25) 0px 2px 4px). SVG outline-only treatment. Used once per section as a playful counterweight to the monochrome data UI.

### Logo Wordmark
**Role:** Top-left brand identifier

Small black flame/spark glyph + 'Seline' wordmark in Inter weight 500, 14px, #0c0a09. Compact, sits left of nav.

### Star Rating Display
**Role:** Trust signal above testimonials — '★★★★★ on G2'

Five small star glyphs in #0c0a09 (or warm gray), inline with platform name in 14px Inter #78716c. No card chrome — sits inline in copy flow.

### Testimonial Card
**Role:** Customer quote with attribution

No card chrome. Star row (★ in #0c0a09), 16px quote text in #0c0a09 with inline cyan highlights for emphasized phrases, 32px avatar circle + name (14px weight 500) + role (14px #78716c). Vertical gap 16px between elements.

### Tab Pill Group
**Role:** Feature navigation — Dashboard / Visitors / Journeys / Funnels

Horizontal row of 4 pill-shaped tabs at bottom of dashboard preview. Active tab: #1c1917 fill, white text, 9999px radius. Inactive: transparent, #0c0a09 text, 1px #e8e6e5 border. Switches the dashboard view above.

## Do's and Don'ts

### Do
- Use Roobert at weight 400 for all display and heading sizes — never bump to 600/700 for emphasis, rely on size and the cyan highlight span instead
- Use #fafaf9 as the page background and #ffffff only for card surfaces — never invert this (white on canvas, not the other way around)
- Apply exactly one cyan highlight span (#3398e1 text + #c1e1f7 pill background) per headline to mark the value proposition keyword
- Use 1px #e8e6e5 borders as the primary structural separator inside cards — reserve shadows for product-preview cards only
- Keep buttons pill-shaped (9999px radius) with 8px 16px padding — the cyan filled CTA must be the only chromatic filled element on any screen
- Set body copy at 14px Inter weight 400 with 1.64 line-height — this is the dominant UI rhythm, do not break it
- Let the mascot sticker appear once per section as a personality beat — do not repeat or animate it

### Don't
- Do not introduce new accent colors — the entire palette is stone neutrals plus one cyan; adding green, purple, or red breaks the editorial restraint
- Do not use heavy drop shadows on content cards — the 16px-blur floating preview shadow is reserved for exactly one element per page
- Do not set headlines in Inter — Roobert at the 32px/52px sizes is the brand voice; mixing fonts breaks hierarchy
- Do not use #ffffff as the page background — always #fafaf9; pure white belongs only on elevated card surfaces
- Do not fill buttons with dark/neutral colors for primary actions — the cyan #3ba6f1 is the only correct filled-button color
- Do not add gradients, glassmorphism, or decorative color washes — the design is deliberately flat and paper-textured
- Do not stack multiple cyan highlight spans in one headline — one per headline maximum, the restraint is the point

## Elevation

- **Content card:** `rgba(0, 0, 0, 0.05) 0px 4px 16px 0px`
- **Floating dashboard preview:** `rgba(17, 12, 46, 0.12) 0px 12px 45px 0px`
- **Small icon / decorative chip:** `rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px`
- **Nav / button hairline:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`

## Surfaces

- **Canvas** (`#fafaf9`) — Full-page warm-stone background
- **Card** (`#ffffff`) — Flat content cards, nav, input fills — sits one elevation step above canvas
- **Floating Preview** (`#ffffff`) — Hero dashboard screenshot — only surface allowed the deep 45px-blur shadow
- **Inverted Section** (`#1c1917`) — Dark accent surfaces for tab pills or inverted panels (sparingly used)

## Imagery

Visual language is dominated by product UI screenshots — the dashboard preview is treated as photography, rendered with a grayscale(1) contrast(0.94) filter that mutes the data colors to monochrome. The only human figure is a line-art mascot sticker (hooded character) drawn in outline-only SVG style, placed once per section as a playful counterweight to the analytical content, with a soft drop-shadow for sticker-like depth. Logo and brand glyphs are small black spark/flame marks. Photography is absent — no lifestyle, no team shots, no environment imagery. The object (the dashboard) IS the hero. All decorative icons are 1px-stroke outline style in either #0c0a09 or #3ba6f1, never filled.

## Layout

Page is max-width centered at ~1200px with generous vertical breathing room. Hero is a two-row text block left-aligned with a single highlighted phrase ('simple & actionable') in cyan, followed by a dual-CTA row (cyan pill + ghost pill), then a row of grayscale partner logos, then a star-rating trust line, then a full-width floating dashboard preview that overlaps slightly into the next section. Below the fold: alternating single-column testimonial rows in a 2-column grid, then full-width feature sections with left-aligned text and centered product visuals. Navigation is a minimal top bar — logo left, centered nav links, sign-in + cyan CTA right — with a floating avatar cluster mid-nav as social proof. Section gaps are wide (96px) to create editorial pacing rather than dense information stacking.

## Similar Brands

- **Plausible Analytics** — Same single-accent-on-warm-canvas approach with privacy-focused analytics positioning; both use one vivid color against an almost-monochrome palette
- **Linear** — Same weight-400-at-large-size headline restraint and tight negative letter-spacing on a custom geometric sans
- **Fathom Analytics** — Same minimal analytics-alternative visual language with warm-neutral canvas and one accent color, editorial vertical rhythm
- **Vercel** — Same restrained monochrome palette with a single chromatic accent and pill-shaped interactive controls
- **Cal.com** — Same warm-stone canvas with cyan accent, mascot sticker personality element, and flat product-screenshot hero
