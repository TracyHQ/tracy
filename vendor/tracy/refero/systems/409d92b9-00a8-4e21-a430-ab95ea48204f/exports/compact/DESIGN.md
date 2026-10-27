# Pastel — Style Reference
> Quiet paper notebook with one vivid ink stamp

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Pastel is a quiet, paper-warm canvas interrupted by one vivid blue stamp. The interface is nearly monochrome — deep near-black text on a stone-white background, with cool gray-blue borders doing the structural work that shadows do elsewhere. A single cobalt accent surfaces only at decision points: the primary CTA, active link, and a few brand marks. The unusual 8.8px corner radius is the signature — softer than a 6px tech feel, tighter than a 12px consumer feel, it signals 'serious tool, friendly enough'. Figtree carries negative tracking at every size, pulling headlines into compact, confident shapes rather than letting them sprawl. Density is generous; whitespace is treated as a structural element, not a luxury. Components are flat with hairline borders, never elevated with shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper Stone | `#f5f5f4` | Light supporting surface for subtle backgrounds and section separation. |
| Chalk | `#e6e3e2` | Secondary card surface, subtle section bands one step above canvas |
| Ink Black | `#111111` | Primary headings, body text, icon strokes — the dominant text and graphic color across all contexts |
| Graphite | `#222222` | Secondary headings, card titles, slightly softer than Ink Black for hierarchical depth |
| Fog Gray | `#78716b` | Muted helper text, icon hints, tertiary metadata — warm gray that sits naturally on Paper Stone |
| Smoke | `#646464` | Secondary icon color, disabled-adjacent UI elements |
| Ice Line | `#d1dee8` | Hairline borders, card outlines, structural dividers — cool blue-tinted gray that distinguishes borders from text |
| Ash | `#d7d3d1` | Subtle link underlines, very light decorative borders |
| Charcoal Block | `#45403c` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Pure White | `#ffffff` | Button text on dark or accent surfaces, inverse text on dark blocks |
| Cobalt Stamp | `#165dfb` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |

## Typography

### Figtree — Sole display and text family. 58px/45px/35px carry weight 500–600 for headlines with -0.016em tracking that pulls characters tight; 18–21px at weight 400–500 is the body and subheading range; 14–16px at weight 400–500 is caption and small UI. Negative letter-spacing scales with size — tighter at display, near-zero at body. The geometric humanist shapes of Figtree (rounded but not soft) match the 8.8px corner radius system.
- **Substitute:** DM Sans, Plus Jakarta Sans
- **Weights:** 400, 500, 600
- **Sizes:** 14, 16, 18, 21, 35, 45, 58
- **Line height:** 1.07, 1.25, 1.29, 1.33, 1.37, 1.43, 1.50, 1.70
- **Letter spacing:** -0.0160em at 58px display, -0.0140em at 45px heading, -0.0160em at 35px, normal at 18px and below

### Inter — Secondary micro-copy context only (appears in 6 instances at 14px) — treat as fallback/utility, not a display voice. Figtree handles all visible brand communication.
- **Substitute:** system-ui sans-serif
- **Weights:** 400
- **Sizes:** 14
- **Line height:** 1.57
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| body-lg | — | — | 18px | 1.5 | 0px |
| subheading | — | — | 21px | 1.5 | 0px |
| heading-sm | — | — | 35px | 1.25 | -0.56px |
| heading | — | — | 45px | 1.25 | -0.63px |
| display | — | — | 58px | 1.1 | -0.93px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 50-80px
- **Card padding:** 20-24px
- **Element gap:** 12-20px

### Border Radius

- **cards:** 8.8px
- **badges:** 8.8px
- **images:** 8.8px
- **buttons:** 8.8px
- **brand-mark:** 120px
- **decorative:** 15px

## Components

### Cobalt Primary Button
**Role:** The only filled chromatic button. Used for the single most important action on any screen (Start a free trial, Get started).

Fill: Cobalt Stamp #165dfb. Text: Pure White #ffffff, Figtree 14–16px weight 500. Border-radius: 8.8px. Padding: 10px 22px (or 12px 24px on larger variants). No shadow, no gradient. Text label sentence-case. Sits flat on the Paper Stone canvas — the accent color is the elevation.

### Charcoal Secondary Button
**Role:** Dark neutral button for account-level actions (Sign up in nav).

Fill: Charcoal Block #45403c. Text: Pure White #ffffff, Figtree 14px weight 500. Border-radius: 8.8px. Padding: 8px 16px. Used sparingly — the 'already a member' entry point, not a primary conversion.

### Ghost Outline Button
**Role:** Secondary action paired with the primary (Watch demo next to Start a free trial).

Fill: transparent. Border: 1px Ice Line #d1dee8. Text: Ink Black #111111, Figtree 14px weight 500. Border-radius: 8.8px. Padding: 10px 22px. The border is the entire affordance — no fill on hover state in the resting design.

### Login Text Button
**Role:** Low-emphasis nav entry, present in header right cluster.

No fill, no border. Text: Ink Black #111111, Figtree 14px weight 500. Padding: 8px 16px. Sits visually quiet next to the Sign up button.

### Use-Case Card
**Role:** Screenshot showcase card in the 'Works on any file' grid — demonstrates the product on different surface types.

Fill: Pure White #ffffff. Border: 1px Ice Line #d1dee8. Border-radius: 8.8px. No shadow. Contains a rounded inner image (8.8px radius). Caption below: Figtree 14–16px weight 400, Ink Black. No hover lift — the design stays flat.

### Testimonial Block
**Role:** Quote + attribution + avatar, placed under hero headline and in social proof sections.

No background, no border. Quote: Figtree 18–21px weight 400, Ink Black. Attribution: 14px Fog Gray for role/title, Ink Black for name. Avatar: 32px circle. Generous vertical spacing (20–30px between quote and attribution).

### Logo Trust Strip
**Role:** Row of monochrome partner/client logos.

Logos rendered in Ink Black #111111 or Fog Gray #78716b at consistent optical height (~24px). Even spacing across container, no borders or dividers between marks. The strip itself sits on the Paper Stone canvas with no card treatment.

### Problem Pill Label
**Role:** Small uppercase or sentence-case tag introducing a section (e.g., 'Problem' eyebrow).

Fill: #e6e3e2 or Paper Stone, border optional 1px Ice Line. Text: Fog Gray #78716b, Figtree 12–14px weight 500. Border-radius: 9999px (pill) or 8.8px. Padding: 4px 12px. Functions as a visual handshake before a headline.

### Feature Checklist Item
**Role:** Inline trust signals like "14-day free trial" and "No credit card required" near CTAs.

Tiny icon (16px) in Fog Gray followed by Figtree 14px weight 400 text in Fog Gray. No fill, no border. Spacing between items: 20–24px.

### Top Navigation Bar
**Role:** Sticky or static top bar with brand mark left, center links, right actions.

Fill: Paper Stone #f5f5f4. No border bottom in the data — separation comes from canvas color shift. Brand logomark: Cobalt Stamp dot at 120px radius (fully circular). Nav links: Figtree 14px weight 500, Ink Black. Right cluster: Login (text) + Sign up (Charcoal Block button, 8.8px radius).

### Section Headline
**Role:** Large section-opening text ('Works on any file…', 'Trusted by fast moving agencies…').

Centered or left-aligned. Figtree 35–45px weight 500, Ink Black. Tracking: -0.014em. Line-height: 1.25. Followed by an optional Figtree 18px weight 400 subhead in Graphite or Fog Gray with 20–24px gap above.

### Image Placeholder Block
**Role:** Empty/loading state for large showcase images and illustrations.

Fill: #e6e3e2. Border-radius: 8.8px. Contains a small centered icon (image or play glyph) in Fog Gray. Aspect ratio 16:9 or 4:3. No text label inside — the placeholder speaks through emptiness.

## Do's and Don'ts

### Do
- Use Cobalt Stamp #165dfb only for filled primary buttons, active links, and the brand logomark dot — never for headings, icons, or decorative washes
- Set border-radius to 8.8px for every card, button, and contained image; reserve 15px for larger decorative surfaces and 120px only for the brand mark
- Set body text to Figtree 16–18px weight 400 in Ink Black #111111; reserve Fog Gray #78716b exclusively for helper metadata and small icon hints
- Apply negative letter-spacing: -0.016em at 58px, -0.014em at 45px, scaling down to normal at 18px and below
- Separate sections using background color shifts between Paper Stone and Chalk rather than borders, dividers, or shadows
- Keep CTAs flat — no drop shadow, no gradient, no hover lift; the Cobalt Stamp fill is the entire elevation signal
- Default page canvas to Paper Stone #f5f5f4; use Pure White #ffffff only inside cards sitting on the canvas, never as the page background

### Don't
- Don't introduce additional accent colors — the system is 1% colorful by design; a second chromatic hue breaks the 'one stamp' identity
- Don't use pure #000000 — Ink Black is #111111, Graphite is #222222, Charcoal Block is #45403c; always retain the warm undertone
- Don't add box-shadows to cards or buttons — the design uses flat surfaces with hairline borders as its elevation language
- Don't round corners to 12px, 16px, or 9999px for cards or buttons — 8.8px is a deliberate, non-standard value that defines the system
- Don't use letter-spacing 0 or positive values on headlines — negative tracking at 35px and above is a signature of this system
- Don't use Cobalt Stamp for large text blocks, section backgrounds, or illustration fills — it loses urgency when used at scale
- Don't use Inter for display or body copy — Figtree is the only visible brand voice; Inter is a utility fallback

## Elevation

The system intentionally avoids box-shadows at every level. Elevation is communicated through three mechanisms only: (1) background color shift between Paper Stone, Chalk, and Pure White; (2) the Cobalt Stamp fill on primary buttons, which acts as a chromatic elevation cue; (3) hairline 1px Ice Line borders on cards and inputs. A shadow would introduce a depth language that conflicts with the flat, paper-like surface treatment.

## Surfaces

- **Paper Stone** (`#f5f5f4`) — Base page canvas — warm off-white, the default surface for all sections and the hero
- **Chalk** (`#e6e3e2`) — Secondary section bands and image placeholder fills — one step darker than canvas for subtle alternation
- **Pure White** (`#ffffff`) — Card surfaces sitting on the canvas — use cases, product screenshots, contained content blocks
- **Charcoal Block** (`#45403c`) — Dark interactive surface for secondary buttons — the only dark elevation in the system

## Imagery

Product screenshots and real-world surface mockups dominate the visual language — social media moodboards, Webflow sites, wireframes, Shopify storefronts, PDFs, and video thumbnails shown as if Pastel comments are overlaid on them. Images are always contained inside cards with 8.8px corner radius, never full-bleed. No lifestyle photography, no abstract gradient art, no 3D renders. The only non-photographic visual element is the brand mark itself: a small Cobalt Stamp dot paired with a Cobalt-and-Ink Black wordmark. Avatars in testimonials are small (32px) and circular — the smallest possible presence.

## Layout

Max-width ~1200px centered container with generous side padding. Hero is left-aligned text + testimonial stack, never centered over a full-bleed image. Sections alternate between Paper Stone and a slightly darker Chalk band for visual rhythm, separated by color shift rather than dividers. Content blocks use a 3–4 column card grid for use-case showcases and a 2-column layout for headline+testimonial pairings. Vertical rhythm is spacious: 50–80px between sections, 20–30px between elements within a block. Navigation is a simple top bar (brand left, center links, right actions), no sidebar, no mega-menu. The overall composition reads as a long, calm scroll with deliberate, unhurried pacing.

## Similar Brands

- **Linear** — Same single-accent chromatic discipline on a dark/light contrast system, with tight headline tracking and generous whitespace — though Linear runs dark mode while Pastel runs warm light
- **Pitch** — Same warm-light canvas with one vivid accent, flat cards, and hairline-border elevation — both use a 'one stamp' accent philosophy
- **Frame.io** — Same product-screenshot-as-hero pattern showing the tool overlaid on real creative work, with contained rounded images in a card grid
- **Crisp** — Same spacious light-mode SaaS layout with quiet monochrome body and a single blue accent reserved for CTAs and active states
- **Figma marketing site** — Same tight Figtree-adjacent geometric sans, generous section breathing room, and flat component treatment without shadows
