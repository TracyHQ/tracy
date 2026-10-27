# Coinbase Spain — Style Reference
> Digital Trust, Blueprinted. A system built on the clarity of an architectural plan, energized by a single, electric blue neuron.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The design system establishes a feeling of digital-native trust, grounded in a high-contrast, minimalist palette. A precise foundation of pure white (#ffffff) and near-black (#0a0b0d) creates an environment of clarity and focus. The system's entire personality is injected through a single, electric `Coinbase Blue` (#0052ff), which is reserved exclusively for primary actions and brand marks, acting as a confident guide. A suite of custom fonts (Coinbase Display, Sans, Text) provides a unique and cohesive typographic voice across all scales. Depth is achieved not with shadows but with bold, full-width color blocks, alternating between bright white and deep midnight sections, creating a clean, architectural rhythm.

## Colors

| Name | Value | Role |
|------|-------|------|
| Coinbase Blue | `#0052ff` | Primary CTAs, logos, active states — the core brand identifier. |
| Interactive Blue | `#578bfa` | Secondary links and interactive elements. |
| Pure White | `#ffffff` | Primary page background, text on dark surfaces. |
| Midnight | `#0a0b0d` | Dark section backgrounds, primary text. |
| Slate | `#5b616` | Body text, secondary headings, footer links. |
| Ash | `#8a919` | Helper text, disabled states, subtle UI text. |
| Frost | `#f7f8f9` | Subtle light backgrounds, like the footer area. |
| Cloud | `#eef0f3` | Light background dividers or button hover states. |
| Pewter | `#dedfe2` | Borders between light sections. |
| Charcoal | `#141519` | Alternative dark section background surface. |
| Positive Green | `#27ad75` | Price increases, success messages. |
| Negative Red | `#f0616d` | Price decreases, error messages. |

## Typography

### CoinbaseDisplay — Used exclusively for large, impactful headlines (H1/H2). Its clean, slightly wide geometry gives headlines a declarative, confident presence.
- **Substitute:** Manrope
- **Weights:** 400
- **Sizes:** 44px, 52px, 64px, 80px
- **Line height:** 1.0-1.09

### CoinbaseSans — The primary workhorse font for subheadings, buttons, and some body copy. The 600 weight is used for emphasis and smaller headings.
- **Substitute:** Inter
- **Weights:** 400, 600
- **Sizes:** 13px, 16px, 18px, 20px, 28px, 36px, 64px
- **Line height:** 1.11-1.50

### CoinbaseText — Optimized for readability in dense UI and long-form text blocks. Its generous line-height makes paragraphs breathable.
- **Substitute:** Inter
- **Weights:** 400, 700
- **Sizes:** 13px, 16px, 18px
- **Line height:** 1.50-1.56

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.54 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.56 | — |
| heading-sm | — | — | 28px | 1.25 | — |
| heading | — | — | 44px | 1.09 | — |
| heading-lg | — | — | 64px | 1 | — |
| display | — | — | 80px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Card padding:** 24px

### Border Radius

- **tags:** 100000px
- **cards:** 24px
- **inputs:** 8px
- **buttons:** 56px

## Components

### Primary CTA Button
**Role:** The main call-to-action on any page.

Background: `Coinbase Blue` (#0052ff). Text: `Pure White` (#ffffff). Padding: 16px 32px. Radius: a distinctive elongated pill shape at 56px.

### Secondary Pill Button
**Role:** Secondary action, often on a dark background.

Background: `Pure White` (#ffffff). Text: `Midnight` (#0a0b0d). Padding: 12px 24px. Radius: a perfect pill shape at 100000px.

### Ghost Link
**Role:** Inline, text-style interactive elements.

Background: transparent. Text: `Interactive Blue` (#578bfa). No padding or border. Used for tertiary actions like 'Learn more'.

### Header Nav Link
**Role:** Top-level navigation items.

Background: transparent. Text: `Midnight` (#0a0b0d). No padding. Font: CoinbaseSans 16px.

### Filter Tag
**Role:** Toggleable filter in data views.

Background: typically transparent with a subtle border, or a light fill on hover/active. Text: `Slate` (#5b616e). Padding: 12px 24px. Radius: 100000px.

### Footer Link
**Role:** Tertiary navigation links in the page footer.

Background: transparent. Text: `Slate` (#5b616e). Font: CoinbaseText 16px. No underline until hover.

### Large Headline
**Role:** The primary heading for a page or hero section.

Font: CoinbaseDisplay, 64px. Color: `Midnight` (#0a0b0d).

## Do's and Don'ts

### Do
- Use `Coinbase Blue` (#0052ff) exclusively for primary CTAs and the brand logo.
- Define primary buttons with the signature 56px border-radius.
- Construct all major page headlines using the `CoinbaseDisplay` font.
- Create visual hierarchy by alternating full-width #ffffff and #0a0b0d sections.
- Reserve `Slate` (#5b616e) for all secondary body copy and footer links.
- Set body text at 16px with `CoinbaseSans` or `CoinbaseText` for optimal readability.
- Apply a 24px radius to all larger content cards.

### Don't
- Don't use shadows on any element; rely on color blocking for depth.
- Don't use `Coinbase Blue` (#0052ff) for text or non-interactive elements.
- Don't use multiple saturated colors in one section; stick to the neutral palette with one blue accent.
- Don't use sharp corners for buttons or tags; they must be rounded (56px or 100000px).
- Don't use system fonts; the custom Coinbase font suite is essential to the brand identity.
- Don't create visual dividers with lines; use negative space and background color changes.
- Don't make footer links any color other than `Slate` (#5b616e).

## Elevation

The design intentionally avoids shadows. Depth and hierarchy are created through color blocking, contrasting light backgrounds (#ffffff) with distinct dark sections (#0a0b0d).

## Imagery

Visuals are dominated by abstract vector illustrations and clean product UI screenshots. Illustrations use a flat-color, geometric style featuring brand colors, making complex financial concepts feel approachable and modern. They are always contained within layout blocks, reinforcing the structured, grid-based feel of the page. Photography is absent, placing the focus squarely on the product's interface and stylized brand graphics.

## Layout

The layout is a centered, max-width container (approx. 1200px) providing a stable reading experience. A key pattern is the rhythmic alternation between a white-background hero (split-column text/visual) and a full-bleed dark feature section. This creates dramatic contrast and pacing. Content is organized in simple, clear structures like 2-column feature blocks and multi-column card grids. Generous vertical spacing (64px+) between sections ensures each message has room to breathe.

## Similar Brands

- **Stripe** — Shared aesthetic of high-contrast typography, a single strong brand color, and a clean, developer-friendly feel.
- **Robinhood** — Similar goal of simplifying finance with a clean, mobile-first design and a dominant, optimistic brand color.
- **Intercom** — Uses a similar strategy of a strong blue brand color, custom illustrations, and ample white space.
- **Wealthsimple** — Also combines a trustworthy-but-not-stodgy feel with clean typography and approachable graphics.
