# Nakedcityfilms — Style Reference
> electric blue headline over cinematic void

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Naked City Films operates as a high-contrast editorial production brand: a flat, shadowless canvas that swings between cool gray daylight and near-black midnight, anchored by a single electric blue (#0004eb) that functions as both voice and verb. Typography is the entire interface — an ultralight-to-medium neo-grotesque pairs against an italic display serif for category labels, creating a magazine-spread rhythm where giant 68px headlines sit beside 13px navigation in the same family. Layout is deliberately asymmetric, floating UI panels over full-bleed cinematic media, with generous negative space used as a compositional element rather than leftover. The system rejects decoration: no shadows, no gradients, no rounded corners — confidence comes from type weight contrast, color commitment, and scale.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Cobalt | `#0004eb` | Headlines, nav links, logo block fill, project category labels, section accents — the only chromatic voice in the system, treated at massive scale (wordmarks, 44–68px type) to dominate every surface it touches |
| Abyssal Ink | `#050516` | Dark section canvases, primary body text on light surfaces, reversed logo lockup — near-black with a barely-perceptible blue cast that keeps it on-brand rather than neutral |
| Bone White | `#ffffff` | Light section canvases, inverted text on dark and blue surfaces, floating card backgrounds over media |
| Concrete Mist | `#e6e6e6` | Primary light-mode page canvas, muted text fills, ghost-surface panels — the cool gray ground that lets the blue detonate |
| Fog Gray | `#979797` | Secondary text, meta labels, placeholders, scrolling ticker background, low-emphasis chrome |

## Typography

### Haas Grotesk — Primary type system for all UI, nav, body, and display. Weight 100 (ultralight) and weight 500 (medium) are used in deliberate tension — ultralight for ambient/nav/micro-copy, medium for headlines and emphasis. The ultralight is anti-convention; most brands use 500–700 for headlines, this system whispers and then SHOUTS with the same family
- **Substitute:** Neue Haas Grotesk, Inter, Helvetica Neue
- **Weights:** 100, 500
- **Sizes:** 12, 13, 16, 18, 26, 44, 68
- **Line height:** 1.00, 1.10, 1.11, 1.20, 1.67, 2.31
- **Letter spacing:** -0.0300em at 44–68px, -0.0150em at 26px, -0.0120em at 18px, -0.0100em at 12–16px

### TRJNDaVinci — Display italic serif for project category labels and editorial accent lines ('Basketball', 'New York Knicks', 'Prompt & Purpose') — the only non-grotesque voice in the system, used sparingly to create a cinematic-magazine credit-roll feel against the geometric body type
- **Substitute:** Playfair Display Italic, Tiempos Headline Italic, Lora Italic
- **Weights:** 500 italic
- **Sizes:** 26, 44, 68
- **Line height:** 1.10, 1.20
- **Letter spacing:** -0.0300em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.67 | -0.12px |
| body | — | — | 16px | 1.67 | -0.16px |
| subheading | — | — | 18px | 1.67 | -0.216px |
| heading-sm | — | — | 26px | 1.11 | -0.39px |
| heading | — | — | 44px | 1.1 | -1.32px |
| display | — | — | 68px | 1 | -2.04px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 70px
- **Card padding:** 20px
- **Element gap:** 12px

### Border Radius

- **cards:** 0px
- **badges:** 0px
- **buttons:** 0px
- **logoBlock:** 0px

## Components

### NKD Logo Lockup
**Role:** Primary brand mark

Custom wordmark: 'NKD' in Haas Grotesk weight 500 in #050516 (light mode) or #ffffff (dark mode), followed by a superscripted blue (#0004eb) square accent. The full extended lockup pairs NKD with 'CITY' set in white weight 500 on an Electric Cobalt (#0004eb) rectangular block of equal cap-height. Zero radius on the blue block. Total lockup is the loudest element on every page.

### Floating Navigation Bar
**Role:** Primary site navigation

Top-aligned nav with NKD center, link groups flanking left ('Talents¹³', 'Studio') and right ('About', 'Contact'). Links in Haas Grotesk weight 100 at 13px, color #0004eb on light canvas / #ffffff on dark canvas. Superscript count badge ('¹³') in weight 500 adds editorial detail. No background fill, no border — floats directly on canvas.

### Editorial Headline Block
**Role:** Primary content statement

Haas Grotesk weight 500 at 44–68px, line-height 1.10–1.20, color #0004eb on light surfaces. Tight tracking (-1.32px to -2.04px) creates dense, magazine-cover compression. Often paired with a gray placeholder bar (#979797) for redacted/forthcoming content. Asymmetric placement — pushed to the right column, not centered.

### Project Card (Dark Mode)
**Role:** Work showcase entry

Full-width card on #050516 canvas. Category label in DaVinci italic at 26px, #0004eb, leading the card. Project title in Haas Grotesk weight 500 at 18–26px, #ffffff, tracking -0.216 to -0.39px. No border, no shadow, no radius — content sits directly on dark surface with generous vertical gap (40–70px) between cards. Asymmetric grid placement, not uniform columns.

### Hero Media Overlay Card
**Role:** Hero section UI

White (#ffffff) rectangular panel floating centered over full-bleed cinematic video. Contains the NKD CITY extended lockup at massive scale and bottom-edge scrolling ticker. No border, no radius, no shadow — the contrast with media is enough to separate it.

### Scrolling Ticker
**Role:** Scroll-prompt marquee

Horizontal repeating text band at the bottom of the hero card. 'scroll down ·' in Haas Grotesk weight 500 at 12–13px, #0004eb on #979797 background, or reversed. Letter-spacing tight (-0.12px), line-height 1.67. Continuous CSS scroll animation.

### Tagline Strip
**Role:** Brand micro-voice

Single-line statement in Haas Grotesk weight 100 at 13px, color #0004eb, positioned bottom-left of light sections. 'Smart stories. Bold execution. No shortcuts.' — serves as a quiet editorial signature, not a CTA.

### Placeholder/Redacted Text Bar
**Role:** Forthcoming content indicator

Solid #979797 rectangle used to mask unreleased project names or statements. Sits inline with editorial headline blocks, same cap-height as surrounding type, creating a deliberate 'classified' or 'censored' visual gesture. This is a signature element, not an error state.

## Do's and Don'ts

### Do
- Use Electric Cobalt (#0004eb) at large scale (26px+) for any primary headline or category label — it is a voice, not a highlight color
- Pair Haas Grotesk weight 100 (ambient) with weight 500 (emphasis) in the same block to create tension within a single family
- Apply tight tracking at scale: -2.04px at 68px, -1.32px at 44px, -0.39px at 26px — looser tracking at display sizes reads as weak
- Alternate between #e6e6e6 light canvas and #050516 dark canvas section-by-section; the swing is the rhythm
- Let media bleed to the viewport edge; overlay UI on top with white or dark cards, never inset imagery into containers
- Use TRJNDaVinci italic at 26px+ exclusively for project categories and editorial accent — never for body or UI labels
- Maintain zero radius on all surfaces, blocks, and cards — the system is architecturally sharp

### Don't
- Do not apply shadows, blurs, or any elevation effects — depth comes from surface contrast only
- Do not round corners on the blue logo block, cards, buttons, or images — the flatness is the identity
- Do not use Electric Cobalt (#0004eb) for small text below 16px — it loses authority at micro scale
- Do not mix the display serif (DaVinci) with body copy or navigation — it belongs only to editorial category labels
- Do not center content unless it is the hero card — the layout language is asymmetric, not balanced
- Do not add gradients, textures, or decorative backgrounds to the blue — it must read as a single flat ink
- Do not use #979797 for primary text or interactive states — it is reserved for meta labels, placeholders, and ticker backgrounds

## Elevation

The design system has zero shadows. Depth is created exclusively through surface contrast — light gray (#e6e6e6) against white (#ffffff), dark (#050516) against the electric blue (#0004eb), and media beneath floating cards. This flatness is a deliberate statement: the brand does not lift off the page, it commits to it. The absence of blur and ambient shadow is what gives the type its power.

## Surfaces

- **Light Canvas** (`#e6e6e6`) — Default page background for editorial sections, text-heavy zones, transition areas
- **Floating Card** (`#ffffff`) — White panels that float above media or sit on the light canvas for maximum contrast and content isolation
- **Dark Mode Canvas** (`#050516`) — Immersive project showcase sections, work reels, dark editorial spreads
- **Full-Bleed Media** (`video/image`) — Cinematic background footage with UI floating as overlay cards

## Imagery

Full-bleed cinematic video and high-resolution photography dominate immersive sections — outdoor lifestyle footage (canoeing on a lake, people in nature) shot in warm golden-hour light, intentionally contrasting with the cool gray UI that floats on top. Imagery is never cropped to UI containers; it always bleeds to the viewport edge, with cards and text overlaid. No product screenshots, no illustrations, no abstract graphics. The visual language is pure documentary cinema: the people, the place, the story.

## Similar Brands

- **Buck** — Same full-bleed cinematic media with minimal flat UI overlay, and commitment to a single saturated accent color against neutral canvas
- **Manual Creative** — Asymmetric editorial layouts, ultralight-to-medium weight contrast within a single geometric sans, and zero-decoration flat surfaces
- **Giant Ant** — Production company portfolio with dark immersive project sections alternating with light editorial canvas, tight typographic system
- **Studio Terri** — Bold single-color accent (electric blue) used at massive type scale, sharp angular layout with no rounded corners or shadows
- **Pentagram** — Editorial magazine-spread rhythm, display italic serif paired with neo-grotesque body, generous negative space used compositionally
