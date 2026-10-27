# Whop — Style Reference
> Bold sticker on cream paper — a minimal light canvas with a single orange button that casts a hard burnt-orange shadow.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Whop uses a high-contrast light canvas with a single saturated orange as the entire chromatic vocabulary. The system is typographically polarized: a custom geometric display face (acidGrotesk) at near-mega sizes for hero and section headlines, and Inter for all functional UI at 14-20px. Surfaces stay flat — no gradients, minimal shadows — with one signature move: the primary orange button carries a hard 3px offset shadow in a deeper burnt-orange rather than a soft drop shadow, giving the interface a slightly retro, almost sticker-like weight. Card corners are pillowy at 24px while buttons stay compact at 8px, creating a clear hierarchy of softness between content containers and interactive elements. The overall rhythm is spacious and confident: large display headlines, generous 64-80px section gaps, and white phone mockups floating on a near-white canvas.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ember Orange | `#fa4616` | Orange wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Ember Shadow | `#b62600` | Hard 3px offset shadow beneath Ember Orange buttons — a deeper burnt orange instead of a soft drop shadow |
| Carbon | `#202020` | Primary text, heading strokes, heavy borders, icon fills |
| Snow | `#ffffff` | Card surfaces, button text on dark fills, the elevated layer above the page canvas |
| Mist | `#f9f9f9` | Page canvas — the near-white background that all sections sit on |
| Silver | `#e1e4e8` | Hairline dividers, card borders, subtle structural separators |
| Slate | `#646464` | Muted body text, secondary links, inactive nav items, mid-weight borders |
| Ash | `#838383` | Tertiary text, placeholder text, disabled labels |
| Pearl | `#bbbbbb` | Light borders, icon outlines, low-emphasis strokes |
| Obsidian | `#0a0a0a` | Dark surface variant for inverted cards or code-editor panels |

## Typography

### acidGrotesk — Display and section headlines — used at near-mega sizes (128px) for hero, 56px for section titles. Line-height locked to 1.00, tracking at -0.03em creates a compressed, poster-like quality. This is a custom geometric face; no system font replicates its personality.
- **Substitute:** Inter Tight at weight 800, or Space Grotesk Bold
- **Weights:** 700
- **Sizes:** 56px, 128px
- **Line height:** 1.00
- **Letter spacing:** -0.0300em (constant across all sizes)

### Inter — All functional UI: body copy, links, buttons, nav, footer, card text, labels. Weight 400 for body, 500 for buttons and emphasized text, 600-700 for subheadings and strong labels. Tracking tightens as size increases (-0.016em at 20px down to -0.006em at 13px).
- **Substitute:** Inter (native) or system-ui, -apple-system, sans-serif
- **Weights:** 400, 500, 600, 700
- **Sizes:** 13px, 14px, 16px, 20px
- **Line height:** 1.40–1.50
- **Letter spacing:** -0.0160em, -0.0140em, -0.0130em, -0.0110em, -0.0090em, -0.0060em

### Geist Mono — Code snippets, terminal prompts, technical metadata, version labels. Generous line-height (1.70) for multi-line code blocks. Normal letter-spacing — mono fonts don't need optical tightening.
- **Substitute:** JetBrains Mono, IBM Plex Mono, ui-monospace
- **Weights:** 500, 600
- **Sizes:** 12px, 13px, 14px, 16px
- **Line height:** 1.50–1.70

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 20px | 1.4 | -0.32px |
| heading | — | — | 56px | 1 | -1.68px |
| display | — | — | 128px | 1 | -3.84px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 24px
- **Element gap:** 24px

### Border Radius

- **cards:** 24px
- **buttons:** 8px
- **smallElements:** 4px
- **largeContainers:** 16px

## Components

### Primary CTA Button
**Role:** The singular high-emphasis action — the only chromatic button in the system

Background #fa4616, white text in Inter weight 500 at 16px, padding 12px 24px, border-radius 8px, no border. Carries a unique hard offset shadow: rgb(182,38,0) 0px 3px 0px 0px — the burnt-orange offset makes the button feel like a physical sticker pressed onto the page.

### Ghost/Secondary Button
**Role:** Low-emphasis action paired with the primary CTA

Transparent background, border 1px solid #e1e4e8, text #202020 in Inter 500 at 16px, padding 12px 24px, border-radius 8px. No shadow. Sits beside the orange button in the hero.

### Top Navigation Bar
**Role:** Persistent site header

White background (#ffffff), full-width with inner max-width container. Left: Whop logo (mark + wordmark). Right: text links 'For enterprise', 'API', 'Sign in' in Inter 14px weight 500, color #646464. No border, no shadow — floats on the canvas.

### Display Headline
**Role:** Hero and section-level titles

acidGrotesk weight 700, 56px for section headings, up to 128px for hero, line-height 1.00, letter-spacing -0.03em, color #202020. No color, no decoration — the type does all the work.

### Phone Mockup Card
**Role:** Product showcase tile in horizontal scroll galleries

White surface (#ffffff), border-radius 24px, 24px padding, contains a full phone screenshot. No border or shadow — the card is defined purely by its soft radius against the #f9f9f9 canvas. Arranged in a horizontal row with 24px gaps, overflow scrolls.

### Tab Navigation (Pill Group)
**Role:** Switches between embed component examples (Checkout, Wallet, Chat)

Contained pill group with rounded container. Active tab: white background with subtle shadow or border, Inter 14px weight 600, #202020 text. Inactive tabs: transparent, #646464 text, no border. Container radius 8px, individual tabs have no radius — they fill the container.

### Code Editor Panel
**Role:** Shows code snippets for embed components

Dark surface (#0a0a0a or near-black), border-radius 12-16px, contains monospace text in Geist Mono 13-14px. Terminal prompt prefix, syntax-colored tokens (blue, red, orange, violet) against the dark ground. The only place a dark surface appears.

### Footer
**Role:** Minimal site footer

White or canvas background, single row of text links: 'How it works', 'Mission', 'Press', 'Brand', 'Legal', 'Status' in Inter 13px weight 400, #646464 color. Social icons (YouTube, X, Instagram) right-aligned as outlined icons in #646464.

### Category Label (Showcase Section)
**Role:** Labels above each phone mockup (Agency, Game, Service business, etc.)

Inter 14px weight 500, #202020, centered above each phone card. Acts as a subheading for the showcase tiles.

### Hero Section
**Role:** Full-viewport above-the-fold area

Full-width #f9f9f9 background, centered content stack: display headline at 56-128px, then a row of two buttons (orange CTA + ghost) with 16px gap, vertically centered in the viewport. 64px gap between headline and button row.

## Do's and Don'ts

### Do
- Use Ember Orange (#fa4616) exclusively for the single primary action on any screen — never for decorative elements, tags, or secondary buttons
- Apply the hard burnt-orange offset shadow (rgb(182,38,0) 0px 3px 0px 0px) only to primary CTA buttons
- Set display headlines in acidGrotesk at 56px or 128px with line-height 1.00 and letter-spacing -0.03em — never use Inter for display sizes
- Use 24px border-radius for all card-like containers and 8px for all buttons — this size ratio is non-negotiable
- Keep the page canvas #f9f9f9 and card surfaces #ffffff — never invert this hierarchy
- Use 64-80px vertical gaps between major sections to maintain the spacious rhythm
- Use Geist Mono exclusively for code, terminal prompts, and technical metadata — never for UI labels or body text

### Don't
- Don't use Ember Orange for any element that isn't the primary action button on that screen
- Don't apply soft drop shadows, blur, or opacity-based shadows to any element — the system is flat
- Don't use display sizes (56px+) in Inter — Inter is for 13-20px functional UI only
- Don't add gradients — the system is entirely flat color
- Don't use neutral grays for decorative accents or illustrations — the palette is near-black to near-white with one orange
- Don't set border-radius values outside the four tokens: 4px, 8px, 12px, 16px, 24px
- Don't place multiple orange buttons on the same screen — one primary action per view

## Elevation

- **Primary CTA Button:** `rgb(182, 38, 0) 0px 3px 0px 0px`

## Surfaces

- **Canvas** (`#f9f9f9`) — Page background — every section sits on this near-white
- **Card** (`#ffffff`) — Elevated content containers, phone mockups, code panels
- **Dark Surface** (`#0a0a0a`) — Inverted code-editor and dark-mode product surfaces
- **Accent Surface** (`#fa4616`) — Primary CTA button fill — the only chromatic surface

## Imagery

Imagery is entirely product-driven: phone mockups showing real product screens (social feeds, game UIs, service booking apps) with no lifestyle photography or decorative illustration. Phone mockups are presented as white-bezel devices at slight angles or straight-on, floating on the #f9f9f9 canvas with no shadows. Social icons in the footer are simple outlined glyphs in #646464. The visual language is screenshots-as-hero — the product interface is the brand imagery.

## Layout

Full-bleed sections on #f9f9f9 canvas with max-width 1200px centered content containers. Hero is a centered headline + dual-button stack, vertically centered in the viewport with generous whitespace. Subsequent sections alternate between centered text blocks and product showcase rows — a horizontal scroll of 24px-radius phone mockup cards with category labels above. The embed components section uses a tabbed switcher (pill group) with a split layout: code editor on one side, phone mockup on the other. Navigation is a single white top bar with logo left and three text links right. Footer is a single minimal row of links + social icons. Section gaps of 64-80px create a calm, confident vertical rhythm.

## Similar Brands

- **Linear** — Same approach of one chromatic accent on a light canvas with generous spacing and tight geometric type for headlines
- **Stripe** — Similar clean light-mode product showcase with phone mockups floating on near-white backgrounds, centered hero headlines
- **Vercel** — Shared minimal light aesthetic with a single bold accent color and oversized display headlines, comfortable density
- **Cal.com** — Similar flat light surfaces with pillowy card radii and a single saturated brand color as the only chromatic element
