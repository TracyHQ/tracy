# Passwords — Style Reference
> Secure Airlock Behind Glass. A system that moves from the protective dark of an airlock to the bright clarity of a control room.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The design feels like a high-security airlock transitioning into a well-lit control room. An immersive, deep-space dark hero (#1D1D21) establishes a serious, secure atmosphere, which gives way to crisp white (#FFFFFF) content sections focused on informational clarity. The signature brand blue (#145FE4) is used exclusively for calls-to-action and active states, acting like an indicator light confirming interaction. Typography is a key differentiator; the custom font `agileSans` at large sizes with tight negative letter-spacing creates dense, architectural headlines. Buttons are distinctly full-pill (9999px radius), contrasting with the generally sharp, un-rounded cards, creating a focused tension between interactive and container elements.

## Colors

| Name | Value | Role |
|------|-------|------|
| Brand Blue | `#145fe4` | Primary CTAs, active links, focus indicators — the single point of interactive confirmation. |
| Hero Fade | `linear-gradient(180deg, #1d1d21 25%, #145fe4 70%, #99beff 100%)` | Hero background — creates a deep, atmospheric transition from dark space to brand blue. |
| White | `#ffffff` | Main content backgrounds, card surfaces, text on dark backgrounds. |
| Onyx | `#000000` | Primary text on light backgrounds. |
| Deep Space | `#1d1d21` | Hero and footer backgrounds. |
| Void | `#242529` | Secondary dark surfaces. |
| Graphite | `#303136` | Secondary text on light backgrounds, navigation links. |
| Ash | `#d7d7db` | Borders on light backgrounds, disabled states. |
| Warning Tan | `#cbb88` | Top announcement banner background — a muted, temporary accent for site-wide notices. |

## Typography

### agileSans — The primary brand font, used for everything from display headlines to body copy. Its tight negative letter-spacing at large sizes creates a dense, architectural look. Lighter weights (300) are reserved for the largest headlines, creating authority through restraint, while mid-weights (400, 500) are used for body copy and UI elements.
- **Substitute:** Inter, Manrope
- **Weights:** 300, 350, 400, 500
- **Sizes:** 14px, 16px, 18px, 20px, 32px, 40px, 48px, 64px, 88px, 128px
- **Line height:** 1.10, 1.20, 1.25, 1.43, 1.50, 1.60
- **Letter spacing:** -0.0230em, -0.0200em

### ui-sans-serif — Used for minor body text, likely as a fallback or for specific cross-platform UI contexts where the custom font might not load.
- **Substitute:** System UI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.43 | — |
| heading-sm | — | — | 32px | 1.25 | -0.74px |
| heading | — | — | 48px | 1.2 | -1.1px |
| heading-lg | — | — | 64px | 1.1 | -1.47px |
| display | — | — | 88px | 1.1 | -2.02px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 24px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 16px
- **inputs:** 8px
- **buttons:** 9999px

## Components

### Primary CTA Button
**Role:** The main call-to-action.

A pill-shaped button. Background: Brand Blue (#145fe4). Text: White (#ffffff). Radius: 9999px. Padding: 10px 24px. Font: agileSans, weight 500.

### Secondary CTA Button
**Role:** A secondary call-to-action, typically used on dark backgrounds.

A pill-shaped outline button. Background: transparent. Border: 1px solid White (#ffffff). Text: White (#ffffff). Radius: 9999px. Padding: 10px 24px.

### Integration List Item
**Role:** Represents a linked third-party service in a list.

A clickable row with a White (#ffffff) background. Padding: 16px 24px. Radius: 8px. Border: 1px solid Ash (#d7d7db). Contains a logo, title text, and a chevron icon.

### Business/Personal Toggle
**Role:** Switches between two primary user segments.

A pill-shaped switch with a static background. An inner, smaller pill of Brand Blue (#145fe4) indicates the selected state ('Business' or 'Personal'). Radius: 9999px.

### Navigation Header
**Role:** Sticky header for primary site navigation.

White (#ffffff) background with a 1px bottom border in Ash (#d7d7db). Navigation links use Graphite (#303136) text. The primary 'Get started free' button is a filled Primary CTA Button.

### Interactive Text Link
**Role:** An in-text link to another page or section.

Text in Brand Blue (#145fe4), typically followed by a '→' character. No underline by default, likely added on hover.

### Announcement Banner
**Role:** A site-wide, non-critical notification at the top of the page.

A full-width bar with a Warning Tan (#cbb88e) background. Text is Onyx (#000000).

## Do's and Don'ts

### Do
- Use Brand Blue (#145fe4) exclusively for primary CTAs, links, and active state indicators.
- Apply tight negative letter-spacing (-1px to -2px) to all headlines (48px and larger).
- Employ 9999px radius for all buttons to create the signature pill shape.
- Contrast fully-rounded buttons with modestly rounded cards (16px) and list items (8px).
- Use the Deep Space (#1d1d21) to Brand Blue gradient solely for hero sections.
- Maintain a clear visual hierarchy with generous vertical spacing between sections (80px+).
- Use Agile Sans for all typography to maintain brand consistency.

### Don't
- Do not use Brand Blue for static headlines or body text.
- Avoid using rounded corners on main layout containers; reserve rounding for interactive elements and cards.
- Do not apply shadows to buttons or in-line elements.
- Avoid introducing new saturated colors; the palette is intentionally monochrome with a single blue accent.
- Do not use system fonts for headings; the custom font is a critical brand element.
- Avoid small padding on cards; use a minimum of 24px to ensure they feel spacious.
- Do not use outlines on primary filled buttons.

## Elevation

- **Feature Card:** `box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.05);`

## Imagery

The visual language is product-centric and informational. It primarily uses clean product UI screenshots, often contained within abstract shapes or simplified browser chrome. There is no lifestyle photography. Icons are monochrome and line-style. A grid of grayscale customer logos provides social proof. The overall approach is to use visuals to explain functionality and build trust, not to create abstract mood.

## Layout

Starts with a full-bleed, viewport-height hero section featuring a centered headline stack over a dark gradient background. The main content that follows is contained within a centered max-width layout (~1200px) on a white background. Sections alternate between centered headline blocks, 3-column feature card grids, and 2-column text-and-image blocks. The navigation header is sticky, starting transparent over the hero and transitioning to a solid white with a bottom border upon scrolling.

## Similar Brands

- **Linear** — Similar dark-mode aesthetic, precision typography, and use of a single, functional accent color.
- **Vercel** — Shared dark/light theme approach, geometric sans-serif typography, and developer-focused branding.
- **Stripe** — Emphasis on high-quality custom typography, structured grid layouts, and use of gradients in key brand moments.
- **Figma** — Use of a strong primary brand color for CTAs, clean UI presentation, and a balance between technical and approachable design.
