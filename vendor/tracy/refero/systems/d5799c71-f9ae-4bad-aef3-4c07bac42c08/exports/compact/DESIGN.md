# 8returns — Style Reference
> Lime spark inside a midnight control room — a single electric accent that wakes up an otherwise monochrome workspace.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

8returns uses a split-canvas design language: a near-black deep navy hero that opens into a bright, workspace-grade white interior. The visual identity hinges on contrast — a single electric lime (#cfff69) is the only chromatic accent allowed to glow against the dark hero, while the white product surfaces stay neutral, spacious, and almost clinical. Cards float on a cool steel-mist canvas (#eef0f2) with 16px corners, and the only decorative color inside the white sections is a cobalt iris (#6289ff) used sparingly for tags, icons, and highlight chips. Typography is a single geometric sans (roobert) running a tight, slightly positive-tracked scale from 11px captions to 64px displays, with no serif, no mono, no script — one voice across every surface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lime Volt | `#cfff69` | Primary action — filled CTA buttons, active tab underline, highlight chips. The only vivid color permitted against the dark hero; its near-fluorescent chroma against #051923 creates urgency without warmth or aggression |
| Cobalt Iris | `#6289ff` | Violet outline accent for tags, dividers, and focused UI edges |
| Midnight Abyss | `#051923` | Primary text, hero background, dark section canvas, button text on lime fills. Near-black with a cool teal undertone — not pure black, the slight blue cast keeps it feeling engineered rather than flat |
| Abyssal Teal | `#004853` | Dark card surfaces and gradient endpoints — the bridge color between Midnight Abyss and the deep teal radial gradient. Used for elevated dark cards and inset panels |
| Steel Mist | `#eef0f2` | Light neutral action fill for buttons on dark surfaces. |
| Charcoal Edge | `#27272a` | Muted body text and secondary borders. Zinc-family dark gray for hierarchy below the primary text level |
| Zinc | `#a1a1aa` | Icon strokes, tertiary text, disabled states, and subtle dividers. The lightest chrome in the interface |
| Slate | `#525252` | Secondary body text, caption labels, metadata. Mid-gray for body content that must read but recede |
| Pure White | `#ffffff` | Card surfaces, button text, and form inputs — the brightest point in the surface stack. Cards on the Steel Mist canvas read as crisp white panels |

## Typography

### roobert — Sole typeface — geometric sans used for everything from 11px captions to 64px display headlines. The tight line-height at large sizes (1.07–1.16) makes headlines feel architectural and stacked; the loose line-height at body (1.5–1.63) keeps long-form readable. Slightly positive tracking is deliberate — it gives the geometric letterforms breathing room at small sizes without looking loose at display sizes.
- **Substitute:** Inter, General Sans, or Söhne
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 11px, 13px, 14px, 16px, 18px, 20px, 22px, 26px, 48px, 56px, 60px, 64px
- **Line height:** 1.07, 1.16, 1.23, 1.24, 1.25, 1.27, 1.38, 1.40, 1.43, 1.44, 1.45, 1.50, 1.54, 1.56, 1.63
- **Letter spacing:** 0.0050em to 0.0360em (slightly positive, strongest at smallest sizes)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.5 | 0.31px |
| body | — | — | 16px | 1.56 | 0.58px |
| body-lg | — | — | 18px | 1.5 | 0.58px |
| subheading | — | — | 20px | 1.45 | 0.1px |
| heading-sm | — | — | 26px | 1.27 | 0.1px |
| heading | — | — | 48px | 1.16 | 0.1px |
| heading-lg | — | — | 56px | 1.12 | 0.1px |
| display | — | — | 64px | 1.07 | 0.1px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **tags:** 6px
- **cards:** 16px
- **inputs:** 12px
- **buttons:** 32px
- **hero-image-frame:** 24px

## Components

### Primary CTA Button (Lime Pill)
**Role:** The signature action — a fluorescent lime filled button that commands attention against both dark and light backgrounds.

Fill #cfff69, text #051923, 32px border-radius (full pill), horizontal padding 24px, vertical padding 12px. Font: roobert 600, 14–16px. The lime fill carries the brand's energy; the Midnight Abyss text on lime gives 18:1 contrast. Use sparingly — one per viewport maximum.

### Ghost Outline Button (Header CTA)
**Role:** Secondary action in the navigation and within dark sections — low-emphasis pill that invites without demanding.

Transparent background, 1px border #ffffff (on dark) or #051923 (on light), text matching border color, 32px border-radius, 12px vertical / 20px horizontal padding. Used for 'Book a demo' in the header and 'Log in' — keeps the nav quiet so the lime primary can shout.

### Tab Navigation Item
**Role:** Horizontal product-tab nav sitting directly under the hero — the most important navigation surface after the header.

roobert 14px 500. Inactive: #051923 at ~60% opacity. Active: #051923 with a 2px lime (#cfff69) underline directly beneath the text. No background fill, no border, no padding-box — the underline is the only active indicator. Active label slightly bolder than inactive.

### Product Hero Frame
**Role:** Large screenshot/demo surface that sits below the hero headline — shows the product in context against a classical landscape painting.

24px border-radius, 1px border #1e3039, overflow hidden, large dramatic shadow rgba(0,0,0,0.25) 0px 25px 50px -12px. The interior shows a return portal mockup overlaid on a muted landscape painting — the contrast between the classical artwork and the modern product UI is the visual hook.

### Feature Card (White)
**Role:** Product preview tiles in the mid-page feature section.

Background #ffffff, 16px border-radius, 1px border #e0e0e0, padding 32px. Contains small product UI mockup (return status, table rows, rule editor). No shadow — relies on the border and the Steel Mist canvas behind it for separation.

### Testimonial Card
**Role:** Customer proof cards in the carousel section — each combines a brand logo, a full-bleed lifestyle photo, and a large statistic overlay.

Image fills entire card, 16px border-radius, no border. Overlaid bottom-left: large number in white (roobert 700, ~48–60px) with a short caption below in roobert 400, 14px white. Brand logo sits top-left in white. The photograph is the card — the chrome is minimal.

### Brand Logo Strip
**Role:** Trust bar — horizontal row of monochrome brand logos sitting on white.

Logos rendered in #051923 at ~50–60% opacity or flat gray, evenly spaced in a single row, ~120px wide each. No dividers, no animation, no caption — the logos speak for themselves.

### Section Pill Tabs
**Role:** Content-segment switchers in feature sections (e.g. 'Returns automation / Customer retention / Returns prevention').

roobert 14px 500. Active tab: background #051923, text #ffffff, 24px border-radius (pill), padding 8px 20px. Inactive tabs: no background, text #525252. The dark active pill against transparent inactive tabs creates a clear toggle without using color accents.

### Header Navigation
**Role:** Top-level site navigation with logo, primary links, and account actions.

Sits on the dark hero (#051923) with no background — transparent. Logo '8RETURNS' in roobert 700, 18px, white, letter-spacing slightly positive. Nav links (Platform, Pricing, Integrations, Resources, Company) in roobert 400, 14px, white, with dropdown chevrons. Right side: 'Log in' as plain white text, 'Book a demo' as ghost outline button.

### Dark Section Tab Bar
**Role:** Product sub-navigation that appears in a dark band below the hero, listing the 8returns product modules.

Full-width dark band (#051923), 16px vertical padding. Tabs inline: 'Custom Portal' (active, with lime underline), 'Exchange', 'Reasons', 'Shop Prompt', 'Shop Browser', 'Return Methods', 'Overview', 'Success'. Active state is the same 2px lime underline used elsewhere — consistent active indicator across the product nav.

### Product Return Item Card
**Role:** In-product UI card — the unit of the return portal interface (visible in the hero demo).

White surface inside the product frame, 12px border-radius, 1px border #eef0f2, padding 16px. Left: small product thumbnail (square, 48px, 8px radius). Middle: product name (roobert 500, 14px) + variant (roobert 400, 12px, #525252). Right: price (roobert 600, 14px). Status indicator (eligible / not eligible) sits above the item as a small label with a colored dot.

### Highlight Chip / Tag
**Role:** Small inline label for status, category, or feature highlight — uses the cobalt iris accent.

Background #6289ff at ~15% opacity or solid #6289ff with white text, 6px border-radius, padding 4px 10px, roobert 500 12px. Used for tags like 'country · equal · Germany' in the rule editor and similar inline metadata.

## Do's and Don'ts

### Do
- Use #cfff69 lime fill with #051923 text for the single most important action on any screen — never use lime for secondary buttons, tags, or decorative elements
- Set the hero and any dark section background to #051923, not #000000 — the cool teal undertone is the brand's signature darkness
- Use 32px border-radius for all buttons and pill-shaped controls to maintain the 'pill-button + monochrome' signature
- Use 16px border-radius for cards, 12px for inputs, 6px for tags — these three radii define the surface hierarchy and must not be swapped
- Keep the white product sections on the #eef0f2 Steel Mist canvas, never on pure #ffffff page backgrounds — the canvas is always the off-white
- Set headline line-height to 1.07–1.16 at 48px+ for the tight, architectural stacked look — never use body line-height on display sizes
- Use the Cobalt Iris #6289ff only for tags, icons, and small inline accents inside white sections — it is not a CTA color and must not appear as a button fill

### Don't
- Do not use multiple vivid accent colors together — the system is monochrome (navy/white/gray) plus exactly one lime accent and one cobalt iris, nothing else
- Do not place lime or cobalt on the white product canvas without the dark canvas behind it — accents work because of the contrast, not in isolation
- Do not use pure #000000 for text or backgrounds — #051923 is the brand's near-black and carries the cool teal undertone that defines the system
- Do not apply shadows to feature cards — the card system relies on 1px borders and the Steel Mist canvas for separation, shadows are reserved for the hero product frame and floating elements
- Do not mix radius values within a component type — buttons are always 32px (pill), cards always 16px, inputs always 12px, tags always 6px
- Do not use more than one font family — roobert is the only voice; no serif, no mono, no script anywhere in the system
- Do not set the page background to #ffffff — the canvas is always #eef0f2; pure white is reserved for card surfaces that need to lift off the canvas

## Elevation

- **Product Screenshot Frame:** `rgba(0, 0, 0, 0.25) 0px 25px 50px -12px`
- **Card:** `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.06) 0px 1px 2px 0px`
- **Subtle UI element:** `rgba(0, 0, 0, 0.07) 0px 1px 2px 0px`

## Surfaces

- **Page Canvas** (`#eef0f2`) — Cool off-white behind all white product sections
- **Card Surface** (`#ffffff`) — White panels — feature cards, testimonial cards, product previews
- **Dark Card** (`#004853`) — Elevated cards on dark hero or dark sections
- **Hero Canvas** (`#051923`) — Dark hero and dark section backgrounds
- **Accent Surface** (`#cfff69`) — CTA fills, active states, highlight chips — a functional surface, not decorative

## Imagery

Imagery follows a 'classical × modern' juxtaposition strategy. The hero product demo is deliberately placed over a muted landscape painting — a classical Romantic-style seascape with cloud-heavy sky — to create an editorial contrast with the modern return-portal UI floating on top. Below the hero, photography shifts to lifestyle/editorial: tight portraits and full-bleed brand shots of model-worn apparel (athletic, contemporary, activewear). Brand logos in the trust bar are rendered flat and monochrome, no color, no chrome. Product UI screenshots appear in contained white cards with soft borders, never as raw screenshots. The overall ratio is image-light: most of the page is typography and whitespace; imagery arrives as punctuation, not as wallpaper.

## Layout

The page is a vertically stacked single-column flow with a max-width of ~1200px centered in the frame, but the hero breaks full-bleed. The hero is a full-bleed dark band (#051923) with a centered text stack (headline + subtitle + lime CTA) followed by a product demo that extends nearly to the viewport edges, capped by a dark tab nav band that also runs full-bleed. From the brand-logo strip downward, the layout returns to centered max-width with generous vertical rhythm (80px section gaps). Content sections alternate between centered text stacks and 2-up or 3-up card grids. The testimonial section uses a horizontal carousel with left/right arrow controls. Navigation is a single transparent top bar overlaid on the hero — no sticky behavior, no sidebar. The overall density is comfortable: large headlines, generous padding inside cards, breathing room between sections.

## Similar Brands

- **Linear** — Same dark-near-black hero with a single vivid accent color, geometric sans typography at display sizes, and pill-shaped CTAs
- **Vercel** — Same split dark/light page model, monochrome surfaces with a single bright accent, and roobert-family geometric sans (Vercel uses Geist, a near-relative)
- **Resend** — Same lime-on-navy accent treatment, single geometric typeface, 16px card radii, and minimal shadow usage
- **Loops** — Same monochrome dark-canvas hero opening into a clean white product workspace, with one bright accent color reserved for CTAs only
