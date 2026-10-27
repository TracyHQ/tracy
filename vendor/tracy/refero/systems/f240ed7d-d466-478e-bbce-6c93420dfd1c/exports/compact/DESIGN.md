# Slab — Style Reference
> midnight-wine reading room

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Slab reads like a curated library wrapped in a midnight-wine storefront: a deep plum hero cradles white serif headlines, then opens into bright, spacious editorial layouts where serif display type meets a quiet Whitney sans-serif system. Color is rationed — nearly all of the interface is grayscale — but the single coral-red action and the wine hero create a two-temperature palette: warm authority at the edges, cool utility in the middle. The aesthetic borrows from print publishing: Sentinel's 300-weight serif whispers rather than shouts, generous whitespace around each section feels like a magazine spread, and the 6px corner radius on inputs/buttons is restrained enough to feel editorial rather than soft. Decorative circles, organic blobs, and illustrated document cards float alongside flat UI — the visual language is human and craft-forward, not corporate.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Wine | `linear-gradient(90deg, #42022, rgba(66, 2, 46, 0))` | Hero band background, section dividers, deep surface moments — the deepest brand tone, used as atmosphere not as UI fill |
| Coral Ember | `#ff4143` | Red supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Slate Ink | `#455360` | Primary text, icons, heading strokes, input borders, default UI chrome — the dominant near-gray that gives the system its printed-paper authority |
| Fog Gray | `#939598` | Secondary text, helper copy, muted badges, logo tints — recedes behind Slate Ink to build typographic depth |
| Paper White | `#ffffff` | Canvas background, card surfaces, text on dark bands — the bright neutral that holds the content sections open |
| Mist | `#e0e0e0` | Hairline dividers, decorative stroke accents, soft borders — the quietest neutral, separates without competing |
| Graphite | `#11110f` | Highest-emphasis text on light surfaces, deep icon fills — slightly warmer than pure black, reads as ink rather than absence |
| Google Signal Blue | `#4285f4` | Third-party sign-in button (Google OAuth) — utility color for federated auth, not a brand accent |

## Typography

### Sentinel — Display and editorial headlines. The 300-weight sentinel at 53px with -5px tracking is a signature anti-convention choice — most SaaS sites push 600-700 weight sans-serifs at this size; Sentinel whispers and the negative tracking tightens the forms so the whisper still commands. Its serif construction gives the brand a print-publication voice, distancing it from generic dashboard UI.
- **Substitute:** Charter, Source Serif Pro, or Lora as freely available serif substitutes
- **Weights:** 300, 400
- **Sizes:** 16px, 42px, 53px
- **Line height:** 1.14, 1.24
- **Letter spacing:** -0.019em at 42px, -0.094em at 53px

### Whitney — All UI, body copy, buttons, inputs, icons-as-type, navigation, and feature subheadings. Whitney carries a slightly geometric humanist character that softens the serif display — it reads as warm utilitarian rather than tech-bro geometric. The 0.167em tracked small-caps treatment for 12px badges creates a distinct editorial eyebrow style above section heads.
- **Substitute:** Inter, IBM Plex Sans, or Untitled Sans as Whitney substitutes
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 16px, 18px, 20px, 24px
- **Line height:** 1.15, 1.20, 1.33, 1.50, 1.60, 1.67, 1.75
- **Letter spacing:** 0.167em for 12px small-caps/badges, tracking 0 otherwise

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 2px |
| body-sm | — | — | 16px | 1.6 | — |
| body | — | — | 18px | 1.67 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading-sm | — | — | 24px | 1.33 | — |
| heading | — | — | 42px | 1.14 | -0.8px |
| display | — | — | 53px | 1.24 | -5px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 24-40px
- **Element gap:** 16px

### Border Radius

- **cards:** 6px
- **badges:** 6px
- **inputs:** 6px
- **buttons:** 6px

## Components

### Wine Hero Band
**Role:** Page-opening atmospheric section

Full-bleed #42022 background. Left column carries a 53px Sentinel 300-weight headline in #ffffff with -5px letter-spacing, a single-sentence Whitney 400 subhead at 18px, then a Google OAuth button stacked above an email input + Coral Ember CTA. Right column holds a large product mockup (document editor card) with soft purple/coral decorative circles bleeding off the edges. The wine-to-transparent horizontal gradient sits behind the mockup area.

### Coral Ember Primary Button
**Role:** Primary action

6px border-radius, #ff4143 fill, #ffffff text at 16px Whitney 500, horizontal padding 24px, vertical padding 12px. Sits inline beside a neutral input field. The coral is the only chromatic button in the system — reserving it for the single most important action per surface.

### Ghost Outlined Button
**Role:** Secondary navigation action (e.g., Log In)

No background, #ffffff text at 16px Whitney 400, 1px white border on dark surfaces, arrow glyph (→) in Slate Ink or white depending on surface.

### Google OAuth Button
**Role:** Federated sign-in

6px border-radius, #4285f4 fill, #ffffff text, full-width within its column, white Google 'G' mark on the left, 16px Whitney 500. Treated as utility chrome, not a brand element.

### Email Input Field
**Role:** Inline email capture beside CTA

6px border-radius, #ffffff background, 1px Slate Ink border, 16px Whitney 400 placeholder ('Work Email'), 16px 24px padding. Sits directly left of Coral Ember button with zero gap, creating a unified input+button control.

### Editorial Feature Card
**Role:** Alternating two-column feature section (Create / Organize)

White canvas, no border, no shadow. Each feature is a 2-column row: one side is a 300-weight Sentinel headline at 42px with a small icon+label eyebrow (Whitney 500, 12px tracked small-caps) in Slate Ink, the other side is a product mockup card with its own decorative pastel circle behind it. 80px vertical padding between rows.

### Document Mockup Card
**Role:** Product illustration inside hero and feature sections

White card surface with subtle window chrome (three colored dots in coral/yellow/green or just gray), body content rendered as horizontal gray bars representing text lines, with selective colored highlight bars (coral, yellow, teal) to suggest annotations or user presence cursors. The card is a flat, borderless rectangle — depth comes from the colored highlight bars, not shadows.

### Decorative Pastel Circle
**Role:** Atmospheric backdrop element

Large soft circles in muted coral (#f0a0a0 range), pale lavender, and warm yellow sit behind mockup cards. Partially clipped by the page edge or by adjacent content. They are the system's substitute for gradients or drop shadows — adding warmth and craft without competing with text.

### Eyebrow Label
**Role:** Small section identifier above headlines

12px Whitney 500, 0.167em letter-spacing (tracked small-caps), Slate Ink color, paired with a small 20px icon (person, list, grid) in Slate Ink. Reads as an editorial section marker, not a UI tag.

### Customer Logo Strip
**Role:** Social proof at hero bottom

Single row of monochrome white logos on the wine hero band, evenly spaced, no dividers. Logos are rendered at a uniform height with generous horizontal padding. Sits at the bottom edge of the hero, separated from the CTA stack by ~64px.

### Top Navigation Bar
**Role:** Primary site navigation

Transparent over the wine hero, no border. Left: Slab wordmark in coral lowercase. Center: nav links (Product, Resources, Library, Pricing) in white Whitney 400 16px. Right: 'Log In' ghost text button with arrow. Sticky behavior keeps the bar over dark surfaces.

## Do's and Don'ts

### Do
- Use Sentinel 300 weight at 42-53px with -0.8 to -5px letter-spacing for all editorial headlines — never substitute a sans-serif at display size
- Reserve #ff4143 (Coral Ember) for exactly one primary action per surface; let everything else be neutral
- Use 6px border-radius on all inputs, buttons, badges, and cards — never exceed this value
- Pair each feature section with a decorative pastel circle bleeding off the edge of its mockup card
- Set body copy at 18px Whitney 400 with 1.67 line-height — never drop below 16px for running text
- Use the 0.167em tracked small-caps treatment at 12px Whitney 500 for all section eyebrows above headlines
- Keep the wine hero as the only dark band per page — subsequent sections must return to white canvas

### Don't
- Don't use Sentinel for body copy, navigation, or UI chrome — it is display-only
- Don't apply drop shadows to cards, inputs, or buttons — the system is intentionally flat
- Don't introduce new chromatic accent colors beyond Coral Ember and Google Signal Blue
- Don't use pure #000000 for text on light surfaces — use Graphite #11110f or Slate Ink #455360
- Don't exceed 1200px page max-width or break the two-column editorial row pattern
- Don't use solid color fills for icons — keep them 1.5-2px monoline strokes in Slate Ink
- Don't add more than one decorative pastel circle per mockup — restraint is the point

## Elevation

- **Document mockup cards:** `none — flat white surfaces, depth implied by colored annotation bars`
- **Email input field:** `none — 1px Slate Ink border only`
- **Feature sections:** `none — whitespace and alternating row direction do the separation work`

## Surfaces

- **Wine Hero Band** (`#42022`) — Top hero, dark editorial moments — establishes the midnight-wine atmosphere
- **Paper White** (`#ffffff`) — Page canvas, content sections — the bright default surface
- **Elevated Card** (`#ffffff`) — Feature cards, illustration frames — visually identical to canvas, separated by spatial rhythm and thin Mist borders rather than elevation

## Imagery

The visual language is illustration-first, photography-free. Product is shown through flat document mockup cards (white surfaces with gray content bars and selective colored annotation highlights) rather than screenshots. Decorative pastel circles in coral, lavender, and yellow provide warmth behind these mockups. Icons are line-style monoline in Slate Ink, 1.5-2px stroke. The two screenshots together show: a wine hero with one large product card and Google sign-in chrome, followed by alternating editorial feature rows each with a mockup card and an icon+serif headline. Imagery occupies roughly 40% of visual space, always contained, never full-bleed or photographic.

## Layout

Hero is full-bleed #42022 with a centered max-width ~1200px two-column layout (text left, product mockup right). Content sections below switch to a white #ffffff canvas with the same 1200px max-width. The pattern is alternating two-column rows: each row pairs a 42px Sentinel headline + eyebrow + body copy on one side with a document mockup card on the other, switching sides between rows. Vertical rhythm between rows is generous (64-80px). Navigation is a single transparent top bar over the dark hero. There are no card grids, no pricing tables, no multi-column feature matrices in the visible viewport — the system prefers long editorial scrolls over dashboard-density layouts.

## Similar Brands

- **Notion** — Same restrained near-grayscale palette, minimal chromatic accent, and editorial whitespace-driven layout on long-form marketing pages
- **Coda** — Same document-workspace product framing with illustrated product mockup cards floating on white canvas, sans-serif body system
- **Dropbox Paper** — Same craft-editorial visual language with playful decorative shapes bleeding behind flat product illustrations
- **Pitch** — Same confidence with serif display headlines over a dark brand-colored hero band transitioning to bright white content sections
- **Read.cv** — Same magazine-spread layout rhythm and serif-headline-over-sans-body typographic pairing in a productivity context
