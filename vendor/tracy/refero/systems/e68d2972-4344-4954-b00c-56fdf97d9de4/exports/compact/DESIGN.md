# Applied Labs — Style Reference
> Sunlit cream paper with cobalt punctuation and floating conversation cards

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Applied Labs reads like a warm, sunlit editorial spread: cream paper backgrounds, near-black ink type, and a single vivid cobalt blue used as quiet punctuation rather than a shout. The visual signature is the contrast between photographic warmth (real people in real light, not illustrations or 3D renders) and restrained, typographically-driven UI chrome. Conversation fragments — translucent chat bubbles, message exchanges, agent replies — float as a design motif across hero and feature sections, making the product's nature legible without explaining it. Dark filled buttons (espresso-black) are the only hard shapes against the otherwise soft, hairline-divided surface stack; the entire system feels like reading a thoughtful magazine rather than scrolling a product page.

## Colors

| Name | Value | Role |
|------|-------|------|
| White | `#ffffff` | Page canvas, base card surface, nav background |
| Cream | `#f7f7f4` | Warm off-white section background, soft card fill — the secondary surface layer that gives the page its paper-like warmth |
| Fog | `#f5f5f5` | Elevated card surfaces and subtle section bands |
| Ash | `#e4e4e7` | Hairline borders, dividers, input underlines — the structural skeleton of the layout |
| Stone | `#8c8c8c` | Tertiary text, placeholder copy, disabled states |
| Steel | `#737373` | Secondary body text, helper copy, muted descriptions |
| Graphite | `#666666` | Secondary body text on cream surfaces |
| Charcoal | `#4d4d4d` | Secondary body text, navigation labels, and subdued headings. Do not promote it to the primary CTA color |
| Warm Gray | `#7d7c78` | SVG icon fills, subtle warm-toned decorative elements |
| Espresso | `#26251e` | Primary text on cream surfaces, dark card accents, outlined action borders — the warm alternative to pure black |
| Midnight | `#09090b` | Primary body and heading text on white, the dominant ink color |
| Pure Black | `#000000` | Primary headings, body text, and icon fills on light surfaces. Do not promote it to the primary CTA color |
| Deep Ink | `#111111` | Footer and nav text, dark surface accents |
| Slate Blue | `#5c7aa1` | Muted blue-gray for section backgrounds, subdued text accents, and image overlay washes — adds cool depth without competing with the cobalt accent |
| Warm Sand | `#b39987` | Warm tan card surfaces, trust/social-proof section backgrounds — a near-gray with just enough warmth to echo the photography |
| Cobalt Spark | `#0051ff` | Violet text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Emerald | `#00cb39` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |

## Typography

### Geist — Sole typeface — used for everything from display headlines down to 10px micro-copy. Geist's geometric neutrality and tall x-height make it read as editorial without being cold.
- **Substitute:** Inter
- **Weights:** 300, 400, 500
- **Sizes:** 10, 11, 12, 13, 14, 15, 16, 24, 36, 48
- **Line height:** 1.00, 1.08, 1.17, 1.20, 1.25, 1.35, 1.43, 1.45, 1.50, 1.55
- **Letter spacing:** Tight tracking on display (-0.96px at 48px, -0.72px at 36px, -0.29px at 24px); near-zero on body (0.08px at 16px); slightly open on micro-copy (0.14px at 14px, 0.12px at 12px)
- **OpenType features:** `"ss01" on, "cv11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.45 | 0.11px |
| body-lg | — | — | 15px | 1.5 | 0.15px |
| subheading | — | — | 24px | 1.35 | -0.29px |
| heading | — | — | 36px | 1.17 | -0.72px |
| display | — | — | 48px | 1.08 | -0.96px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 12-16px
- **Element gap:** 12px

### Border Radius

- **tags:** 9999px
- **cards:** 8px
- **pills:** 9999px
- **inputs:** 4px
- **buttons:** 8px
- **largeCards:** 24px

## Components

### Sticky Navigation Bar
**Role:** Top-level site navigation, persistent across scroll

White background with #e4e4e7 bottom border, 64-72px height. Logo (sparkle icon + wordmark) left-aligned, nav links (Product, Industries, Pricing, Assurance, Company) in 14px Geist 500 Midnight, spaced 24-32px apart. Right side: 'Log In' ghost text link and 'Get Demo' pill button. Padding: 0 24px horizontal.

### Primary CTA Button (Dark Filled)
**Role:** Main action — Get Demo, Book demo, Submit

Filled #000000 or #26251, white text, 8px border-radius, 14px 24px padding. Text in Geist 500 at 14px with 0.14px letter-spacing. On hover: slight elevation via rgba(38,37,30,0.14) 0px 18px 36px shadow. No border.

### Pill CTA Button
**Role:** Compact action in nav or tight spaces

Filled dark (#000000), white text, 9999px border-radius (full pill), 8px 16px padding. 14px Geist 500.

### Ghost Text Link
**Role:** Secondary navigation, inline links

No background or border. Midnight (#09090b) text at 14px Geist 400. On hover: Cobalt Spark (#0051ff).

### Cobalt Inline Link
**Role:** Highlighted link within body text — the system's only colored link

Cobalt Spark (#0051ff), Geist 400, no underline by default; underline on hover. Used to mark the single most important action within a paragraph.

### Hero Section with Photo + Chat Overlay
**Role:** Above-the-fold brand impression

Full-bleed warm-toned photography (person with phone, golden-hour lighting) with a series of translucent chat message bubbles overlaid on the right third. Headline at 48px Geist 300 Midnight with -0.96px tracking, left-aligned. Subhead in 18px Geist 400 Steel. CTA button below. Photo has no border-radius; chat bubbles use 12-16px radius with semi-transparent cream backgrounds.

### Chat Message Bubble (User)
**Role:** Visualization of customer message in product context

Semi-transparent cream/white background (rgba(255,255,255,0.85)), 12px border-radius, 12px 16px padding, 14px Geist 400 Midnight text. Small avatar dot or icon prefix.

### Chat Message Bubble (Agent)
**Role:** Visualization of AI agent reply in product context

Semi-transparent dark or cobalt-tinted background with white text, 12px border-radius, 12px 16px padding. Slightly larger than user bubbles to indicate response depth. Includes agent name prefix in small caption text.

### Trust Logo Strip
**Role:** Social proof — brands that use the product

Warm Sand (#b39987) or Cream (#f7f7f4) background band, full-width. Centered 'Trusted by millions of customers' caption at 12-13px Steel. Row of 6-8 monochrome brand logos in a single horizontal line, each in a subtle bordered cell or spaced 40-60px apart. Logos rendered in Midnight or Charcoal.

### Section Heading Block
**Role:** Section introduction — text-only or text + subhead

Generous vertical space (80-120px top padding). Headline at 36px Geist 300 Midnight, -0.72px tracking. Optional subhead at 18px Geist 400 Steel. No decorative elements — the type does the work.

### Feature Card
**Role:** Product capability or benefit block

White or Cream background, 8px border-radius, 1px #e4e4e7 border, 16px padding. Optional 24px radius for larger hero-feature cards. No drop shadow by default. Content: icon (24px, Midnight or Cobalt), heading at 16-18px Geist 500, body at 14px Geist 400 Steel.

### Form Section
**Role:** Lead capture with visual context

Two-column layout: left = form on white/cream, right = full-bleed photograph. Form has generous vertical rhythm. Headline at 36px Geist 300, body at 16px Steel, then 3-4 stacked inputs with 24-32px vertical gap.

### Text Input (Underline Style)
**Role:** Form field for name, email, etc.

Borderless top/sides, 1px #e4e4e7 bottom border only. 12px vertical padding. 14px Geist 400 Midnight text. Placeholder in Stone (#8c8c8c). On focus: bottom border transitions to Midnight. No background fill.

### Select Dropdown
**Role:** Ticket volume or option selection

Same underline treatment as text input. Right-aligned chevron icon in Charcoal. Geist 400 14px.

### Submit Button (Form)
**Role:** Form submission action

Full-width within form column. Filled Midnight (#09090b) or Espresso (#26251e), white text, 8px radius, 14px 24px padding, Geist 500 14px.

### Footer
**Role:** Site-wide footer with links and legal

White or Cream background, top border in #e4e4e7. Logo left, link columns center, legal/social right. Text in 12-13px Geist 400 Steel. Generous padding (40-60px vertical).

## Do's and Don'ts

### Do
- Use #f7f7f4 cream for section backgrounds that need warmth; reserve #ffffff for the page canvas and elevated cards
- Apply 8px border-radius consistently to cards, buttons, and inputs — this is the system's signature softness, not pill-rounded, not sharp
- Set headline letter-spacing to -0.02em at 48px and -0.012em at 24px; use positive tracking (0.005-0.010em) only on 12-14px body and micro-copy
- Use Cobalt Spark (#0051ff) for at most one inline link or accent per section — it marks the singular important action, not decoration
- Fill primary action buttons with #000000 or #26251e; let white text carry the contrast
- Use #e4e4e7 for all structural borders, dividers, and input underlines at 1px
- Layer chat-message visuals over warm photography to communicate the product's conversational nature without explaining it

### Don't
- Do not fill buttons with Cobalt Spark (#0051ff) — that color is reserved for inline text accents and links, never for filled button backgrounds
- Do not use shadows on cards unless they represent a floating overlay or modal; the system relies on borders and surface color shifts, not elevation
- Do not use illustrations, 3D renders, or icon-heavy compositions as primary visuals — real warm-toned photography carries the brand
- Do not use a second typeface; Geist handles everything from 10px caption to 48px display
- Do not use the warm tan (#b39987) or slate blue (#5c7aa1) for more than 10-15% of the visible surface — they are accent surfaces, not the canvas
- Do not set headline weight above 500; weight 300 is the signature, weight 500 is for emphasis, never 600-700
- Do not use border-radius above 24px on standard cards; the 8px default is the system's defining softness

## Elevation

- **Floating Chat Bubble Overlay:** `rgba(38, 37, 30, 0.14) 0px 18px 36px 0px`
- **Elevated Card / Modal:** `rgba(0, 0, 0, 0.03) -65px 67px 56px 0px, rgba(0, 0, 0, 0.05) -29px 30px 41px 0px, rgba(0, 0, 0, 0.05) -7px 7px 23px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Page background, base layer
- **Cream** (`#f7f7f4`) — Warm section backgrounds, alternating bands
- **Fog** (`#f5f5f5`) — Elevated card surfaces, subtle differentiation
- **Warm Sand** (`#b39987`) — Social-proof and trust band backgrounds
- **Slate Blue** (`#5c7aa1`) — Cool accent section, image overlay wash

## Imagery

Real photography only — warm-toned, golden-hour or natural-light portraits of people using devices in everyday contexts. No illustrations, no 3D renders, no abstract graphics. Images are full-bleed or generously sized; never small thumbnails. Chat message bubbles and agent reply cards are composited directly onto the photography as translucent overlays, making the product's conversational nature visible. Brand logos in the trust strip are rendered monochrome (Midnight or Charcoal) at consistent optical size, spaced evenly. Icons are minimal — 1-1.5px stroke weight, outlined style, in Midnight or Cobalt.

## Layout

Max-width 1200px centered content column with sections that break to full-bleed for photography. Navigation is a sticky top bar (64-72px). The hero is a two-zone composition: left-aligned headline + subhead + CTA on white, with a large warm-toned photograph occupying the right half, overlaid with floating chat message bubbles that extend beyond the photo's right edge. Below the fold, sections alternate between white and cream backgrounds with 80-120px vertical gaps. The trust logo strip is a full-width band. Feature sections use a two-column text+visual or single-column centered heading followed by card grids. The form section uses a 50/50 split: form on the left, full-bleed photograph on the right. Footer is a single row with white background. Overall density is spacious and editorial — generous whitespace, large headlines, and breathing room between components rather than compact information stacking.

## Similar Brands

- **Linear** — Same Geist typeface, same restrained use of a single chromatic accent against a near-monochrome interface, same tight tracking on large display sizes
- **Vercel** — Geist as primary typeface, monochrome-first palette with one vivid blue accent, editorial spacing rhythm with generous section gaps
- **Notion** — Warm off-white surfaces, hairline borders instead of shadows, real photography of people, and a calm conversational product aesthetic
- **Stripe** — Clean editorial type hierarchy, restrained color palette, and the practice of using one vivid color as punctuation rather than as a dominant fill
- **Arc Browser** — Warm cream and white surfaces with a single saturated accent, soft 8px corners, and an editorial product-narrative feel
