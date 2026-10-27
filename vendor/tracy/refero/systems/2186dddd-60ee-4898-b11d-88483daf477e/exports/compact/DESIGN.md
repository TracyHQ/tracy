# Juicebox.ai — Style Reference
> Talent command center on cream paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Juicebox operates in a talent-recruiting command center dialect: near-white canvas surfaces, a single saturated royal-purple that floods heroes and product frames, and tight, oversized serifless headlines that feel like executive memos rather than SaaS marketing. The interface is deliberately quiet — hairline borders, 2px radii, mono-spaced technical labels — so that the purple moments (hero washes, active tabs, product frames) feel like voltage jumps against an otherwise grayscale instrument panel. Body copy is set in a grotesque at 14–18px with slightly tightened tracking; display copy uses a neo-grotesque display face with aggressive negative letter-spacing at 40–72px that compresses headlines into confident, compact blocks. Components are compact, rectangular, and unornamented: no rounded pills, no drop shadows, no gradients on controls. Elevation is implied by surface lightness and a single inset shadow reserved for active/pressed states.

## Colors

| Name | Value | Role |
|------|-------|------|
| Royal Plum | `#6a2f8d` | Primary brand color — hero washes, product frames, active nav indicator, link accents, and decorative section bands. Carries 100% of the chromatic brand weight; the system is monochrome until this color appears |
| Plum Mist | `#eee8fd` | Tinted lilac surface used for soft product/section backgrounds and as the lightest stop in purple gradient washes. Pairs with Royal Plum to create a two-stop purple atmosphere without needing darker midtones |
| Lilac Outline | `#da9efd` | Decorative stroke accent — used sparingly on illustration outlines, diagram borders, and ornamental SVG marks that sit over plum surfaces |
| Forest Mark | `#2f8d6e` | Green outline accent for tags, dividers, and focused UI edges |
| Obsidian | `#1d161d` | Primary text and heading color. Slightly warm-tinted near-black that reads softer than pure #000 on cream backgrounds; the canonical ink for all reading content |
| Graphite | `#2a232a` | Primary action button background (dark filled CTA) and deep border color. The non-chromatic counterpart to Royal Plum — same near-black temperature, used wherever a button needs to feel grounded and serious |
| Smoke | `#574e57` | Secondary text, input borders, form labels, and muted UI chrome. The mid-neutral that carries the majority of metadata and helper copy |
| Warm Gray | `#786c78` | Muted body text, tag labels, and tertiary borders. Reads as a soft taupe on cream — used for de-emphasized prose and quiet UI labels |
| Mist Gray | `#a89ea8` | Disabled text, placeholder copy, and the lightest readable neutral. Used where content must recede but remain legible |
| Hairline | `#d9d9d9` | Default border color for cards, dividers, input fields, and table rows. The single hairline that draws almost every structural line on the site |
| Parchment | `#f8f6f8` | Page background canvas — a warm near-white with a barely-perceptible violet cast that ties the neutral surface to the Royal Plum accent without competing with it |
| Paper | `#ffffff` | Card and elevated surface background. Sits one step brighter than Parchment to create a subtle two-tier surface stack without using shadows |
| Carbon | `#000000` | Pure black reserved for SVG strokes, icon fills, and the deepest image borders. Not used for text or buttons — those live in the warmer Obsidian/Graphite family |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Roobert — Display and heading face — used exclusively for h1/h2 and section titles. Carries aggressive negative tracking (-0.04em at 64–72px) that tightens large headlines into compact, confident blocks. Its single weight (400) and neo-grotesque proportions give the system an editorial, not-marketing posture.
- **Substitute:** Inter Tight, General Sans, or Manrope at weight 400
- **Weights:** 400
- **Sizes:** 28px, 40px, 48px, 64px, 72px
- **Line height:** 1.00–1.25
- **Letter spacing:** -0.0400em, -0.0300em, -0.0200em

### Haas Grot Text Web (55 Roman + 65 Medium) — Body and UI text face — paragraph copy, button labels, nav items, captions, form fields. The 55 Roman at weight 400 handles body; 65 Medium at 500 covers labels and meta; 700 Bold appears in inline emphasis. Slightly negative tracking (-0.01em to -0.02em) keeps dense UI text feeling engineered rather than soft.
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 400, 500, 700
- **Sizes:** 10px, 12px, 14px, 16px, 18px, 20px
- **Line height:** 1.20–1.56
- **Letter spacing:** -0.0200em, -0.0100em

### DM Mono — Technical/label face — section index tags ([01] FEATURES), tab labels (SEARCH (PEOPLEGPT), INSIGHTS, ENGAGEMENT), and uppercase chip labels. Wide positive tracking (up to 0.077em) makes it read as a monospaced code label, not body copy. Used to mark engineering provenance on interface elements.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono
- **Weights:** 500
- **Sizes:** 13px, 14px, 15px
- **Line height:** 1.00–1.14
- **Letter spacing:** 0.0200em, 0.0770em

### Haas Grot Text Web 65 Medium — Haas Grot Text Web 65 Medium — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 16px
- **Line height:** 1.2

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.2

### Neue Haas Grotesk Text — Neue Haas Grotesk Text — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.43

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 0.1px |
| label-mono | — | — | 12px | 1.2 | 0.77px |
| body-sm | — | — | 14px | 1.43 | -0.14px |
| body | — | — | 16px | 1.5 | -0.16px |
| body-lg | — | — | 18px | 1.56 | -0.18px |
| heading-sm | — | — | 28px | 1.25 | -0.84px |
| heading | — | — | 40px | 1.15 | -1.2px |
| heading-lg | — | — | 48px | 1.13 | -1.44px |
| display | — | — | 64px | 1 | -2.56px |
| display-lg | — | — | 72px | 1 | -2.88px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **tags:** 2px
- **cards:** 2px
- **images:** 2px
- **inputs:** 2px
- **buttons:** 2px

## Components

### Filled Dark CTA
**Role:** Primary action button — 'TRY FOR FREE', primary form submit

Background #2a232a (Graphite), text #ffffff, 2px radius, 13px vertical / 14px horizontal padding, Haas Grot 65 Medium 16px, uppercase or sentence case, no shadow. Sits on either white or Parchment canvas.

### Outlined Ghost Button
**Role:** Secondary action button — 'BOOK A DEMO', nav actions

Transparent background, 1px solid #1d161d (Obsidian) border, #1d161d text, 2px radius, 13px / 14px padding, Haas Grot 65 Medium 16px. Matches the filled CTA's footprint so they align side-by-side at identical dimensions.

### Compact Pill Button
**Role:** Announcement/eyebrow link — 'NEW  TRY JUICEBOX AGENTS →'

Light purple #eee8fd background, Royal Plum #6a2f8d text, 2px radius, 6px vertical / 12px horizontal padding, DM Mono 12–13px with wide 0.077em tracking, uppercase. Includes trailing arrow icon. Sits centered above the hero headline.

### Feature Tab Bar
**Role:** Section navigation under 'How it works'

Horizontal row of uppercase DM Mono labels: SEARCH (PEOPLEGPT), INSIGHTS, ENGAGEMENT, each prefixed by a small icon, separated by 1px Smoke #574e57 dividers. Active tab gets a bottom border in Royal Plum and a subtle weight increase. Sits directly under a single-hairline divider spanning the section.

### Search Bar
**Role:** Hero-aligned talent search input

White background, 1px #d9d9d9 border, 2px radius, left padding for magnifying-glass icon and 'Mar |' placeholder text in Mist Gray. Submit button on the right is a solid #6a2f8d Royal Plum square with white arrow icon, flush with the input height — the only purple UI control in the system.

### Customer Logo Strip
**Role:** Social proof band — flexport, ramp, Verkada, samsara, Quora, CURSOR, Anyscale

Horizontal row on a Parchment #f8f6f8 band, logos rendered in Smoke #574e57 monochrome at 18–24px height, even 48px horizontal spacing, vertically centered, no logos in color. Logos are display-only — no borders, no cards behind them.

### Section Index Tag
**Role:** Eyebrow label above section headlines — '[01] FEATURES'

DM Mono 12px, weight 500, color Smoke #574e57, uppercase, 0.077em letter-spacing. Sits 24px above the heading it labels. The bracket notation [01] gives the whole system a 'chapter' or 'manual' feel.

### Purple Product Frame
**Role:** Product screenshot container on purple hero sections

Royal Plum #6a2f8d background, no border, 0px radius (sits edge-to-edge or with the hero wash bleeding behind it). The product UI screenshot inside is rendered at full color and float on the plum field. A 'noise' dot pattern overlays the plum background to add grain.

### Product Card List
**Role:** Talent results table inside the product frame

White card on a light purple #eee8fd field, 2px radius, 1px Hairline #d9d9d9 border, 12–14px row padding. Each row contains: avatar circle (24px), name (Haas Grot 14px bold Obsidian), title + company (Haas Grot 14px Smoke), match percentage (Haas Grot 14px bold right-aligned), and small action icons (mail, X, thumbs-up/down) on the far right.

### Two-Column Feature Block
**Role:** Standard feature section layout — product left, copy right

Grid of 2 equal columns, 80px section gap, left column contains the Purple Product Frame (full-bleed within its column), right column contains a 20px subheading chip (Royal Plum on Plum Mist), a heading-lg 48px Roobert headline in Obsidian, 18px body copy in Smoke, and a row with Filled Dark CTA + Outlined Ghost Button.

### Top Announcement Banner
**Role:** Site-wide top bar with funding/product news

Royal Plum #6a2f8d background, white centered text in Haas Grot 14px, 1px padding, sits above the main nav. Tight horizontal padding; the content is a single line with a '→ Watch Announcement' link appended. One of the few fully-purple UI strips.

### Top Navigation
**Role:** Primary site navigation

White background, 1px bottom Hairline #d9d9d9 border, height ~64px. Left: Juicebox wordmark (Obsidian). Center: nav items (FEATURES, PRICING, RESOURCES, CUSTOMERS) in Haas Grot 14px Smoke, each with a 6px dropdown caret. Right: SIGN IN text link, BOOK A DEMO Outlined Ghost Button, TRY FOR FREE Filled Dark CTA. Logo, nav, and actions share one horizontal row with 24–40px gaps.

## Do's and Don'ts

### Do
- Use #6a2f8d Royal Plum exclusively as a brand accent — hero washes, active states, product frames, the submit button on the search bar, and the announcement banner. Never use it for body text or for more than one element on a single screen.
- Set all display headlines (40–72px) in Roobert 400 with letter-spacing between -0.03em and -0.04em. The aggressive negative tracking is the signature — do not relax it.
- Use DM Mono with 0.077em tracking for every section eyebrow label, tab label, and technical tag. The mono face signals 'this is metadata, not prose'.
- Default to 2px border-radius on every interactive element — buttons, inputs, cards, tags, and product frames. Square edges are part of the system's engineering posture.
- Build the page surface stack in three tiers only: Parchment #f8f6f8 (page) → Paper #ffffff (cards) → Plum Mist #eee8fd (accented sections). Use surface lightness, not shadows, to imply elevation.
- Pair Filled Dark CTA (#2a232a) and Outlined Ghost Button (1px #1d161d border) at identical dimensions and padding so they read as a matched set side-by-side in every feature section.
- Set body copy at 14–18px in Haas Grot 400 with line-height 1.43–1.56 and tracking -0.01em. Never go below 14px or above 1.56 line-height for paragraph text.

### Don't
- Don't use #000000 for text — use #1d161d Obsidian. Pure black fights the warm Parchment canvas and breaks the system's subtle violet undertone.
- Don't round corners above 2px. The system is intentionally rectangular; pills, 8px, or 12px radii immediately read as a different product.
- Don't introduce drop shadows on cards or sections. Elevation comes from the two-tier Parchment-to-Paper surface, not from box-shadow. The single inset shadow rgba(0,0,0,0.5) 0 0 12px inset is reserved for active/pressed button states only.
- Don't use Royal Plum #6a2f8d as a text color on white backgrounds. It fails contrast for body copy; reserve it for headings on Plum Mist, for buttons, and for decorative elements.
- Don't combine Roobert with a different display face, and don't set headlines at weight 700. The single 400 weight is the whole signature — bolding a headline breaks the editorial tone.
- Don't add new saturated colors. The palette is intentionally near-monochrome with one brand purple, one green emphasis, and one lilac outline. Introducing teal, red, or amber immediately dilutes the system.
- Don't use color for body text emphasis. Use Obsidian #1d161d bold for inline emphasis and the green #2f8d6 only for individual highlighted words, never for full sentences.

## Elevation

The system avoids drop shadows entirely. Elevation is communicated through a four-tier surface lightness stack (Parchment → Paper → Plum Mist → Royal Plum) and a 1px Hairline #d9d9d9 border that draws every structural line. The only shadow in the codebase is an inset rgba(0,0,0,0.5) 0 0 12px reserved for active/pressed button states — never used on cards, never used for floating panels. This keeps the interface feeling like a printed document on cream paper rather than a layered glass UI.

## Surfaces

- **Parchment** (`#f8f6f8`) — Base page canvas — the warmest neutral in the stack, carries a faint violet cast that connects to the brand purple
- **Paper** (`#ffffff`) — Card and elevated surface — sits one step brighter than the canvas, creates the primary surface distinction
- **Plum Mist** (`#eee8fd`) — Tinted lilac accent surface for feature blocks and product frame interiors; the lightest stop in the purple gradient family
- **Royal Plum** (`#6a2f8d`) — Full-bleed brand surface for hero washes, announcement banner, and product frame backgrounds

## Imagery

Imagery is minimal and product-led. The site uses no lifestyle photography, no stock imagery, and no decorative illustrations outside of SVG icons. The dominant visual element is product UI screenshots — talent search results, candidate cards, profile detail panels — placed inside Royal Plum #6a2f8d frames that bleed off the screen edge. These product frames are the 'hero image' equivalent: they prove the product works by showing it working. A subtle dot/grain texture overlays the purple hero backgrounds to add tactile depth without competing with the product UI. Customer logos appear as monochrome Smoke #574e57 marks on a Parchment band — social proof, not decoration. Icons throughout are 1px-stroke line icons in Obsidian, consistent stroke weight, no filled variants. The overall density is text-dominant with the product screenshot as the single visual punctuation per section.

## Layout

The page is a max-width 1200px centered column on a Parchment canvas, but hero sections break out to full-bleed Royal Plum washes that extend edge-to-edge. Each section follows a two-column pattern: product screenshot on the left (or full-bleed background), descriptive copy on the right with eyebrow chip → heading → body → paired CTA buttons. Section gaps are 80px, generous enough to let each feature breathe. The hero is a centered single-column composition: announcement chip → 72px display headline → 18px body paragraph → paired CTAs → then a search bar floats over the purple field. The customer logo strip is a single horizontal row on a Parchment band, evenly spaced, no cards. The 'How it works' section uses a section index tag in mono, then a tab bar with three uppercase mono labels, then a full-width two-column feature block. Navigation is a single top bar — logo left, nav center, sign-in and CTAs right — with a thin announcement strip above it in Royal Plum. No sidebar, no mega-menu visible, no sticky behavior beyond the announcement.

## Similar Brands

- **Linear** — Same compact 2px radii, dark filled CTA paired with outlined ghost, oversized neo-grotesque display headlines with aggressive negative tracking, and a single saturated brand color against an otherwise monochrome interface
- **Retool** — Same engineering-instrument aesthetic — mono labels with wide tracking, hairline dividers, product screenshots in colored frames, rectangular components, and minimal use of shadows
- **Mercury** — Similar premium-light SaaS palette with warm near-white canvas, a single saturated accent (Mercury uses deep blue where Juicebox uses Royal Plum), oversized display headlines, and compact dense UI
- **Vercel** — Same monospaced label system, same hero wash pattern (Vercel uses black where Juicebox uses purple), same paired-CTA pattern at identical dimensions, and the same preference for surface lightness over drop shadows
- **Pitch** — Same editorial-not-marketing tone for display headlines, same eyebrow-plus-headline-plus-body-plus-paired-CTA section pattern, and the same intentional compactness with 2px corners
