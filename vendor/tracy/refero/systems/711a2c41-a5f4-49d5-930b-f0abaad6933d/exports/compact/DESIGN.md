# Bolt — Style Reference
> Electric lavender at dawn. A hushed lilac canvas wakes up to a single jolt of vivid blue — the rest of the world stays cool gray, letting the brand mark and its lightning typography do the talking.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bolt's design language pairs a quiet lavender-tinted canvas with an electric blue accent, creating a fintech super-app that feels calm yet charged. A custom display face (agrandir-bolt) carries the brand voice with bold geometric character forms — note the lightning-bolt cutouts in the B — while Inter handles all functional UI text at tight tracking. Sections alternate between airy light surfaces and deep midnight-navy blocks, with the brand blue reserved exclusively for action surfaces, active states, and key word emphasis within headlines. Components are minimal: pill-shaped buttons, hairline borders, no shadows, and generous whitespace that lets photography and oversized brand typography breathe.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lilac Mist | `#f8f6fe` | Page canvas and hero backgrounds — a barely-there lavender tint keeps the light theme from feeling sterile and gives Bolt its signature pastel warmth |
| Midnight Ink | `#04091a` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Deep Navy | `#111426` | Dark section backgrounds (centered statement block, footer) and dark badge fills — slightly lighter than Midnight Ink to create a two-tone dark system |
| Slate | `#454a66` | Secondary text and icon strokes — cool mid-gray for descriptions, helper text, and inactive iconography |
| Fog | `#8e92af` | Gray accent for outlined action borders, linked labels, and lightweight interactive emphasis. |
| Periwinkle | `#d3d7ed` | Hairline borders, subtle dividers, and soft surface tints on the light canvas — barely visible structural lines |
| Pure White | `#ffffff` | Card surfaces, input fields, and inverse text on dark backgrounds |
| Bolt Blue | `#006cff` | Primary action fill, active nav state, brand word emphasis inside headlines, and the lightning-bolt icon mark — a saturated electric blue that carries the entire brand identity |
| Steel Border | `#262a42` | Input and form field borders — a darker neutral that defines interactive containers without competing with the brand blue |

## Typography

### agrandir-bolt — Brand display face — used for the BOLT wordmark, hero headlines, and footer masthead. A custom geometric sans with lightning-bolt cutouts in the B character; this is the brand's voice at all display scales. At 70px hero size it commands attention without feeling heavy; at 10px nav size it acts as a compact brand mark. Letter-spacing stays uniformly -0.020em regardless of size, keeping the geometric forms optically tight.
- **Substitute:** Sora or General Sans Bold
- **Weights:** 700
- **Sizes:** 10px, 32px, 64px, 70px
- **Line height:** 1.00-1.30
- **Letter spacing:** -0.020em (all sizes)

### Inter — Functional UI typeface — all body text, nav links, button labels, form fields, footer links, and secondary headings. Inter's geometric neutrality lets agrandir-bolt own the brand voice. Weight 500 is the default for nav and buttons; 400 for body copy; 600-700 for emphasis. The negative letter-spacing tightens at larger sizes, keeping even 20px subheadings feeling compact and intentional rather than airy.
- **Substitute:** Inter (already available on Google Fonts)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 9px, 11px, 12px, 13px, 14px, 15px, 16px, 18px, 20px
- **Line height:** 1.20-1.89
- **Letter spacing:** -0.029em (larger), -0.020em (mid), -0.010em (body)

### Google Sans — Micro-label and small-caps utility text — appears sparingly for tracking labels and metadata
- **Substitute:** Inter Medium
- **Weights:** 500
- **Sizes:** 11px
- **Line height:** 1.89
- **Letter spacing:** -0.029em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.89 | -0.029px |
| body | — | — | 14px | 1.5 | -0.01px |
| subheading | — | — | 18px | 1.3 | -0.02px |
| heading-sm | — | — | 20px | 1.3 | -0.02px |
| heading | — | — | 32px | 1.1 | -0.02px |
| heading-lg | — | — | 64px | 1 | -0.02px |
| display | — | — | 70px | 1 | -0.02px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 24px
- **Element gap:** 8-12px

### Border Radius

- **cards:** 5px
- **badges:** 5px
- **images:** 12px
- **inputs:** 5px
- **buttons:** 9999px

## Components

### Primary Pill Button
**Role:** Main call-to-action (Download, Get Started)

Dark pill button with Midnight Ink (#04091a) background, white text in Inter 500 at 14px, horizontal padding 20-24px, vertical padding 10-12px, fully rounded (9999px radius). No shadow. Hovers maintain the dark fill — this is a quiet, confident CTA, not a loud one.

### Ghost Text Link
**Role:** Secondary action (Shopper login)

Plain text in Midnight Ink (#04091a), Inter 500 at 14px, no background, no border. Sits beside pill buttons in the nav as a low-emphasis alternative. The visual hierarchy: pill = commit, text link = explore.

### Top Navigation Bar
**Role:** Primary site navigation

Light Lilac Mist (#f8f6fe) background with a 1px Periwinkle (#d3d7ed) or Fog (#8e92af) hairline bottom border. Left: BOLT wordmark in agrandir-bolt 700 at 32px. Center: nav links (Pay, Rewards, Shop) in Inter 500 at 14px in Midnight Ink. Right: Shopper login text link + Download pill button. Above the main nav: a secondary utility bar with 'For Users / For Businesses' toggles in a very light tint.

### Hero Section
**Role:** Above-the-fold brand statement

Full-width Lilac Mist background. Two-column layout: left column holds the headline and CTA badges, right column holds the product photography. No border or background card — the hero breathes directly on the canvas. The headline uses agrandir-bolt 700 at 64-70px in Midnight Ink, with the key brand word highlighted in Bolt Blue (#006cff). Subhead in Inter 400 at 18px in Slate (#454a66). Section padding: 80-120px vertical.

### App Store Download Badge
**Role:** Mobile app download CTA

Dark pill-shaped badge with Midnight Ink background, white text and icon. Contains two lines: 'Download on the' (11px) and 'App Store' (14px bold) in Inter. Rounded pill (9999px). Appears in pairs (App Store + Google Play) below the hero subhead.

### Dark Statement Section
**Role:** Section-level brand messaging on dark background

Full-width Deep Navy (#111426) background, centered content with 120px vertical padding. Headline in agrandir-bolt 700 at 32-64px in Pure White. Body text in Inter 400 at 14-16px in Fog (#8e92af). Generous whitespace — no cards or dividers, just text floating on dark. Used to create dramatic rhythm breaks between light content sections.

### Feature Card Grid
**Role:** Product feature showcase (Crypto, Transfer, Pay, Track)

Four-column grid on Lilac Mist background. Each card is a Pure White (#ffffff) surface with 5px radius, 24px padding, 1px Periwinkle border. Icon at top in Bolt Blue (#006cff), feature name in Inter 600 at 16-18px in Midnight Ink. No shadow — cards sit flat on the canvas, separated only by hairline borders.

### Footer
**Role:** Site footer with mega-wordmark

Deep Navy (#111426) background, full-width. Top half: four-column link grid (Company, Resources, Support, Custom Solutions) in Inter 400 at 14px in Fog, with section headers in Inter 600 in Pure White. 'Careers' link includes a small Bolt Blue 'WE'RE HIRING' badge. Bottom half: massive BOLT wordmark in agrandir-bolt 700 at 300-400px+ in Light Gray/White, stretching nearly full viewport width — a brand stamp, not just a logo.

### Info Badge
**Role:** Inline status or label (e.g. We're Hiring)

Bolt Blue (#006cff) background, Pure White text in Inter 600 at 10-11px, 5px radius, 4-6px vertical and 8-10px horizontal padding. Sits inline next to a link, drawing the eye without breaking the line.

### Nav Link Item
**Role:** Navigation menu items (Pay, Rewards, Shop)

Inter 500 at 14px in Midnight Ink, 10-12px horizontal padding. Active or hover state shifts to Bolt Blue (#006cff) or maintains dark with a subtle underline. No background fill on default state — links float on the Lilac canvas.

### Input Field
**Role:** Form inputs (email, search)

Pure White (#ffffff) background, Steel Border (#262a42) 1px border, 5px radius, 12px horizontal padding, Inter 400 at 14px placeholder text in Fog. Focus state shifts border to Bolt Blue.

### Lightning Bolt Icon
**Role:** Brand identity mark, decorative accents

Single-color Bolt Blue (#006cff) lightning bolt shape, used as the favicon, nav accent next to 'Soundtrack' link, and decorative motif. Geometric and angular — a literal lightning bolt, not stylized.

## Do's and Don'ts

### Do
- Use agrandir-bolt 700 at 64-70px for hero headlines and brand statements; use Inter 400-500 at 14-16px for all body and UI text
- Set the primary action fill to Bolt Blue (#006cff) for filled buttons; use Midnight Ink (#04091a) for the Download-style dark pill button
- Apply 9999px border-radius to all buttons and tags; use 5px for cards, inputs, and badges; 12px for images
- Use Lilac Mist (#f8f6fe) as the page canvas; reserve Deep Navy (#111426) for full-width dark statement sections and the footer
- Apply negative letter-spacing of -0.020em to all agrandir-bolt text and -0.010em to Inter body text to keep type optically tight
- Highlight a single keyword in hero headlines using Bolt Blue while keeping the rest in Midnight Ink — e.g. 'One SuperApp to rule them all'
- Alternate between Lilac Mist light sections and Deep Navy dark sections to create dramatic rhythm; never mix both backgrounds within a single section

### Don't
- Don't use Bolt Blue for decorative non-action elements — it should signal action, active state, or brand emphasis only
- Don't add drop shadows to cards or buttons — Bolt uses hairline borders and flat surfaces, never elevation
- Don't use a third typeface — agrandir-bolt owns display, Inter owns everything else; Google Sans is only for tracking labels
- Don't use warm-toned neutrals or pure #000000 for text — Midnight Ink (#04091a) carries a cool blue undertone that ties to the brand
- Don't break the pill button pattern with squared corners or slight rounding — buttons are either fully pill (9999px) or fully square, never in between
- Don't use Periwinkle (#d3d7ed) as a text color — it's a border/divider only; use Slate (#454a66) or Fog (#8e92af) for muted text instead
- Don't place content directly on Pure White (#ffffff) page backgrounds — always use Lilac Mist (#f8f6fe) as the canvas so white cards and inputs have a surface to sit on

## Elevation

Bolt deliberately avoids drop shadows. All depth is created through surface color contrast (Lilac Mist canvas vs Pure White cards vs Deep Navy dark sections) and hairline borders in Periwinkle (#d3d7ed). This keeps the interface feeling flat, modern, and immediate — no element is ever 'floating,' everything is placed on a surface.

## Surfaces

- **Lilac Canvas** (`#f8f6fe`) — Primary page background and hero wash
- **Pure Card** (`#ffffff`) — Elevated cards, input fields, and content blocks
- **Periwinkle Tint** (`#d3d7ed`) — Subtle hover states and decorative washes
- **Deep Navy Block** (`#111426`) — Dark content sections and footer
- **Midnight Surface** (`#04091a`) — Highest-elevation dark surface, pill buttons

## Imagery

Photography is product-centric and tightly cropped: the hero shows a hand holding a blue-cased phone displaying the Bolt app, shot at close range with the product as the sole subject. Hands have bold styling (silver nail polish, metallic bangles, purple sleeve) adding personality without lifestyle context. No full-bleed environmental photography — images are always contained within rounded frames (12px radius) or float on the Lilac canvas. The visual identity leans on the custom typography (agrandir-bolt's lightning-bolt B) and the electric blue color as the primary graphic elements rather than illustration or icon systems.

## Layout

The page uses a max-width 1200px centered content column with generous outer padding. The hero is a two-column split: left holds text/CTA, right holds the product photo. Below the hero, sections alternate between light (Lilac Mist) and dark (Deep Navy) full-bleed bands, each centered with 80-120px vertical padding. Feature sections use a four-column card grid. The footer is a full-width dark band with a four-column link grid above a massive BOLT wordmark that stretches nearly edge-to-edge. Navigation is a single sticky top bar with utility links above and primary nav below.

## Similar Brands

- **Cash App** — Same bold single-word brand lockup in a custom display face, light canvas with one vivid accent color, and dark statement sections for rhythm
- **Revolut** — Same fintech super-app positioning with a quiet neutral palette and a single saturated accent for action surfaces
- **Robinhood** — Same flat-surface, no-shadow philosophy and pill-shaped button language, with a light pastel canvas
- **Stripe** — Same lavender-tinted off-white canvas and tight Inter-based UI typography with a single blue action accent
- **Mercury** — Same custom display wordmark treatment and clean light/dark section alternation for fintech brand presence
