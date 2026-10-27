# Airtable — Style Reference
> warm workshop with color-coded chapters

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Airtable presents as a warm, editorial workspace rather than a cold SaaS dashboard. The canvas is a soft cream parchment (#faf5e8) — never stark white — which gives the whole site a paper-like, almost printed feel. Typography is bold and unapologetic: a custom display face at near-900 weight for hero headlines pairs with a workhorse sans for body and UI. Buttons are pure black, not the expected brand-blue, giving the page an architectural, almost print-publication confidence. The signature move is color-coded feature cards — each use case gets its own saturated hue (terracotta, deep blue, forest green, peach, pink) functioning as chapter dividers in a visual catalog. The overall effect is a creative studio notebook: warm, organized, opinionated, and human.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment Cream | `#faf5e8` | Page canvas — the warm off-white that defines the entire site's atmosphere, replacing standard pure-white backgrounds |
| Pure White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Frost White | `#f8fafc` | Alternate light surface for nested elements, subtle nav backgrounds |
| Onyx | `#181d26` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Charcoal | `#333840` | Body text, secondary text levels, border accents — the workhorse dark neutral |
| Graphite | `#525965` | Muted text, sub-labels, less prominent body copy |
| Steel | `#9297a0` | Placeholder text, disabled states, low-emphasis labels |
| Silver Border | `#e0e2e6` | Hairline dividers, card borders, subtle structural separators |
| Midnight Indigo | `#040e20` | Deepest heading text, near-black with cool bias for maximum editorial weight |
| Cobalt Blue | `#1b61c9` | Blue supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Sapphire | `#254fad` | Violet supporting accent for decorative details and low-frequency emphasis. |
| Terracotta | `#aa2d00` | Orange supporting accent for decorative details and low-frequency emphasis. |
| Burnt Sienna | `#912e1f` | Dark terracotta variant for card backgrounds and text on warm sections |
| Peach Glow | `#fcab79` | Soft warm wash for highlight panels, accent backgrounds |
| Forest Ink | `#0a2e0e` | Green supporting accent for decorative details and low-frequency emphasis. |
| Moss | `#214224` | Secondary green text and border accents on green-themed sections |
| Petal Pink | `#fa91e0` | Playful accent for tags, category chips, illustration color |
| Marigold | `#fcb42a` | Warm accent for badges, tag chips, category highlights |
| Pale Sky | `#c7e5f2` | Light supporting surface for subtle backgrounds and section separation |

## Typography

### Haas Groot Disp — Display headlines — the custom serif/slab face used for hero statements and large section titles, driven by 900 weight for editorial weight
- **Substitute:** GT Sectra Display, Tiempos Headline, or Roboto Slab 900
- **Weights:** 400, 900
- **Sizes:** 20px, 48px
- **Line height:** 1.50
- **Letter spacing:** normal

### Haas — Body, nav, buttons, subheadings, UI labels — the workhorse sans-serif at 400 for body, 500 for emphasis, 600 for buttons and labels; slight positive tracking opens up at larger sizes
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 400, 500, 600
- **Sizes:** 14px, 16px, 18px, 20px, 24px, 32px, 40px
- **Line height:** 1.15, 1.20, 1.25, 1.30, 1.35, 1.50
- **Letter spacing:** 0.0050em at 14px, 0.0060em at 16px, 0.0070em at 18px, 0.0100em at 20px, 0.0110em at 24px, 0.0200em at 32px+

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.35 | 0.07px |
| body-sm | — | — | 16px | 1.3 | 0.096px |
| body | — | — | 18px | 1.35 | 0.126px |
| subheading | — | — | 20px | 1.3 | 0.2px |
| heading-sm | — | — | 24px | 1.25 | 0.264px |
| heading | — | — | 32px | 1.2 | 0.64px |
| heading-lg | — | — | 40px | 1.15 | 0.8px |
| display | — | — | 48px | 1.5 | 0px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 32px
- **cards:** 16px
- **buttons:** 12px
- **featureCards:** 24px

## Components

### Primary CTA Button
**Role:** Main conversion action

Filled #181d26 (Onyx) background, white text, Haas 600 at 16px, 12px border-radius, 16px vertical and 24px horizontal padding. Sits on cream canvas with a subtle multi-layer blue-tinted shadow giving it dimensional weight.

### Secondary Ghost Button
**Role:** Secondary action or alternative CTA

White #ffffff background, 1px #181d26 border, black text, Haas 600 at 16px, 12px border-radius, identical padding to primary. Used for 'Book demo' actions paired with primary CTAs.

### Top Navigation Bar
**Role:** Primary site navigation

White #ffffff background with subtle blue-tinted drop shadow (rgba(15,48,106,0.05) 0px 0px 20px). Logo left (Airtable mark), centered nav links in Haas 400 at 16px with chevron dropdowns, right-aligned 'Book Demo' ghost button and 'Sign up for free' primary button plus 'Log in' text link.

### Hero Section
**Role:** First-screen value proposition

Centered on parchment cream canvas, 48px Haas Groot Disp 900 headline in #040e20, 18px Haas 400 subtext in #333840, dual CTAs (primary + ghost) centered below, followed by a dark #181d26 product screenshot container with 16px radius showing the app interface.

### Logo Trust Bar
**Role:** Social proof and credibility

Single row of customer logos in muted monochrome on parchment background, preceded by a small caption 'Trusted by 500,000 leading teams' in Haas 400.

### Tabbed Feature Section
**Role:** Product capability deep-dive

Two-column layout: left side has numbered tab list (01–04) in Haas 500, active tab in #181d26 weight 600, inactive tabs in muted #9297a0. Right side has a large saturated color block (e.g. #aa2d00 Terracotta) with white inner card containing heading, body text, and ghost 'Learn more' button.

### Color-Coded Feature Card
**Role:** Use case showcase

Large card with 24px radius, saturated background color (Terracotta, Sapphire, Forest, Pale Sky), inner white panel showing app screenshot or data. Each use case gets its own color identity — terracotta for campaigns, sapphire for opportunities, forest for localization, pale sky for attendee lists.

### Product Screenshot Frame
**Role:** Dark app preview container

#181d26 background container with 16px radius, holds full app UI screenshots with their native dark theme, creating contrast against the warm cream page.

### Prompt Input Bar
**Role:** AI prompt interaction

White rounded pill input on dark product surface, contains prompt text in Haas 400, trailing circular dark submit button with arrow icon.

### Category Chip / Tag
**Role:** Label or filter indicator

Pill-shaped, 32px border-radius, small text in Haas 500, vivid color background (Marigold, Petal Pink) with contrasting text — used for status, category, and filter labels.

### Announcement Banner
**Role:** Top-of-page promotional strip

Full-width thin bar at page top, light background, centered text in Haas 400 with inline link in Cobalt Blue (#1b61c9) and a dismiss close button on the right.

## Do's and Don'ts

### Do
- Use Parchment Cream (#faf5e8) as the base canvas — never pure #ffffff for full-page backgrounds
- Pair every primary filled CTA with a ghost outlined button as the secondary action
- Use 12px border-radius for all buttons and 24px for large feature cards to create the rounded-but-architectural feel
- Give each major use case section its own saturated color identity (terracotta, sapphire, forest, peach, pink)
- Use Haas Groot Disp 900 for hero and section headlines, reserving it for sizes 40px+
- Apply the 8px base unit consistently: 8, 16, 24, 32, 40, 64 for padding, gaps, and section rhythm
- Anchor interactive elements with Onyx (#181d26) rather than a brand-colored fill

### Don't
- Don't use pure #ffffff as a page background — always use Parchment Cream (#faf5e8) for the canvas
- Don't use a brand-blue or chromatic color for CTA buttons — Onyx black is the convention
- Don't apply letter-spacing to display headlines in Haas Groot Disp — the custom face is designed for tight tracking
- Don't use sharp corners (0px radius) on any interactive or card element — minimum 12px
- Don't mix more than 2 text weights in a single body paragraph — stay at 400 or 500
- Don't place white cards directly on the cream canvas with zero padding — always 16-24px internal padding
- Don't use the saturated feature card colors for text body or small UI elements — they're meant for section-scale surfaces only

## Elevation

- **Primary CTA Button:** `rgba(0, 0, 0, 0.32) 0px 0px 1px 0px, rgba(0, 0, 0, 0.08) 0px 0px 2px 0px, rgba(45, 127, 249, 0.28) 0px 1px 3px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 0.5px inset`
- **Top Navigation:** `rgba(15, 48, 106, 0.05) 0px 0px 20px 0px`

## Surfaces

- **Parchment Canvas** (`#faf5e8`) — Page-wide warm background that sets the editorial tone
- **White Card** (`#ffffff`) — Primary card surface sitting on parchment
- **Frost White** (`#f8fafc`) — Subtle alternate surface for nested elements
- **Pale Sky** (`#c7e5f2`) — Tinted surface for soft section differentiation
- **Onyx Frame** (`#181d26`) — Dark product screenshot containers and dark CTA fills

## Imagery

Product screenshots dominate as the primary visual content — full dark-mode app UI frames embedded in the light cream page create strong contrast. The screenshots show data tables, kanban boards, calendar views, and AI prompt inputs at full fidelity. Supporting imagery includes small inline product crops (sneaker photos, portrait images) within feature cards. No lifestyle photography, no abstract illustrations. Logo bar uses muted monochrome customer logos. The visual language is product-showcase: the app interface IS the hero, framed by warm editorial typography.

## Layout

Centered, max-width 1200px content column on a warm cream canvas. Hero is centered text stack over a dark product screenshot that breaks below the content edge. Sections flow vertically with consistent 64px gaps, alternating between text-forward editorial sections and visual-heavy product demo sections. Feature areas use a 2-column pattern: left side has a vertical numbered tab list (01–04), right side has a large saturated color block. The bottom section uses a 2-column grid of color-coded use-case cards, each filling roughly half the width. Navigation is a clean top bar with logo left, centered links, and CTAs right. Dense information architecture is avoided — sections breathe with generous whitespace, and each block serves a single purpose.

## Similar Brands

- **Notion** — Same warm neutral canvas approach, same generous whitespace, same centered hero-with-screenshot pattern, though Notion leans more monochromatic
- **Linear** — Similar clean editorial typography and confident use of near-black for primary actions, but Linear is dark-mode-first and more geometric
- **Webflow** — Shared pattern of color-coded feature/use-case sections with saturated accent blocks, though Webflow uses purple as a stronger single brand anchor
- **Figma** — Similar product-screenshot-as-hero visual strategy and a multi-hue accent system rather than a single brand color
