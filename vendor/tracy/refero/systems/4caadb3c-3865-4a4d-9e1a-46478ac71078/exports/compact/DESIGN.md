# Sketch — Style Reference
> serif poetry on pastel paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sketch's design language is a writer's studio reimagined as software: a quiet, nearly grayscale canvas where one warm serif headline and a single soft pink-to-lavender gradient do all the emotional work. The interface itself is restrained — Inter at modest sizes, thin dividers, pill-shaped controls — letting the product (the Sketch app) and the community's quotes breathe. The signature move is the dark pill CTA wrapped in a diffused magenta halo: a button that glows like a desk lamp at dusk, signaling action without shouting. Color is rationed; when it appears, it arrives as atmospheric wash (the hero gradient) or as a tiny punctuation (a violet badge, a teal tag), never as structural fill.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#212123` | Primary text, headings, icon strokes — near-black with a faint cool undertone, softer than pure #000 to reduce glare on long-form copy |
| Bone | `#fafafa` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Graphite | `#4a4a4a` | Body text, secondary copy, footer text — the mid-gray that creates the reading layer between headlines and captions |
| Carbon | `#000000` | Pure black reserved for the highest-contrast elements: nav links, button labels, icon fills where absolute clarity is required |
| Slate | `#5c5c5c` | Muted body text, secondary nav, caption-level copy |
| Mist | `#a7a7a7` | Placeholder text, disabled states, tertiary icons, hairline strokes where subtlety is the point |
| Ash | `#c4c4c4` | Subtle shadows under icons and buttons, ghost borders on inactive controls |
| Fog | `#e6e6e6` | Input field shadows, card hairline borders, the lightest visible structural line |
| Onyx | `#151515` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Steel | `#7f7f7f` | Tertiary text, metadata, timestamps in testimonials |
| Iris | `#555dff` | Accent badges, feature tags — a single violet used sparingly as categorical punctuation on a sea of grayscale |
| Lagoon | `#03cbbc` | Secondary accent badges — a cool teal that pairs with Iris as the site's only chromatic vocabulary for tags and labels |
| Cobalt | `#4389e6` | Blue supporting accent for decorative details and low-frequency emphasis |
| Dusk Wash | `linear-gradient(104deg, rgb(252, 122, 155) 0%, rgb(180, 126, 238) 100%)` | Hero atmospheric gradient — the warm pink that bleeds into lavender across the hero, setting the entire emotional register |
| Prism Drift | `linear-gradient(90deg, rgb(50, 173, 247) 20%, rgb(116, 75, 208) 40%, rgb(233, 127, 66) 50%, rgb(50, 173, 247) 75%)` | Decorative multi-stop gradient used in product showcase contexts — blue to purple to orange, cycling for visual energy |

## Typography

### Reckless — Display headings only — the editorial serif used for hero text and large section titles. Weight 500 (medium) with tightened tracking (-0.02em to -0.023em) gives it a literary confidence without feeling old-fashioned. The choice to use a serif at all is the signature: most SaaS toolkits default to geometric sans-serifs; Reckless signals that Sketch is a craft tool for people who think in type.
- **Substitute:** Playfair Display, Source Serif Pro, or Lora
- **Weights:** 500
- **Sizes:** 44px, 76px
- **Line height:** 1.00, 1.09
- **Letter spacing:** -0.023em at 76px, -0.02em at 44px
- **OpenType features:** `"calt", "liga"`

### InterVariable — All UI, body, navigation, buttons, inputs, and small headings. Inter's tall x-height and open counters keep body text readable at 14–16px; the 300 weight is used for lighter emphasis (captions, helper text), 400 for body, 500 for button labels and nav items, 600 for small section headings. The variable axis allows smooth weight transitions without loading separate files.
- **Substitute:** Inter (Google Fonts), or system-ui
- **Weights:** 300, 400, 500, 600
- **Sizes:** 11px, 12px, 14px, 15px, 16px, 17px, 20px, 22px, 24px
- **Line height:** 1.00, 1.09, 1.15, 1.17, 1.25, 1.33, 1.40, 1.41, 1.43, 1.50, 1.60, 1.65
- **Letter spacing:** normal
- **OpenType features:** `"calt", "liga"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.5 | — |
| body-lg | — | — | 15px | 1.6 | — |
| heading-sm | — | — | 20px | 1.4 | — |
| heading | — | — | 22px | 1.33 | — |
| heading-lg | — | — | 24px | 1.25 | — |
| display-sm | — | — | 44px | 1 | -0.88px |
| display | — | — | 76px | 1 | -1.75px |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 24px
- **cards:** 20px
- **icons:** 8px
- **badges:** 9999px
- **images:** 12px
- **inputs:** 3px
- **buttons:** 20px

## Components

### Glow Halo CTA
**Role:** Primary action button — the signature dark pill with diffused magenta border

Filled button with #151515 background, white text, 20px border-radius, ~12px 24px padding. Distinctive feature: a soft outer glow ring in warm pink/magenta (the button appears to sit inside a blurred halo, roughly 3–4px outside the border). Inter weight 500, 15px. Download arrow icon in white. Used for the hero 'Get started for free' and the persistent 'Get started' in the nav.

### Ghost Nav Button
**Role:** Secondary nav action

Transparent or Bone (#fafafa) fill, Obsidian (#212123) text, 20px radius, smaller padding (~8px 16px). Inter weight 500, 15px. Used for 'Sign In' in the navigation. No border.

### Diamond Logo Mark
**Role:** Brand identifier in nav

A diamond/triangular glyph in Obsidian (#212123) — the only brand mark present. Clean geometric shape, no gradient or fill treatment. Appears top-left, 24–28px tall.

### Announcement Banner
**Role:** In-page update notice

Rounded card with white/Bone fill, 20px radius, subtle border or soft shadow. Contains a bold title (Inter 600, 15px) and lighter description text (Inter 400, 14px, Graphite). Centered horizontally, max-width ~600px. Sits below the hero CTA area.

### Hero Headline Block
**Role:** Primary display text

Reckless serif at 76px, weight 500, Obsidian color, letter-spacing -1.75px, line-height 1.0. Left-aligned, max-width ~480px. Set against a soft pink-to-lavender gradient background. Pair: Inter body text at 16px in Graphite, max-width ~420px.

### Accent Badge
**Role:** Categorical tags and labels

Pill-shaped (9999px radius), ~6px 12px padding, Inter weight 500 at 11–12px, white text on chromatic fill. Three variants: Iris (#555dff), Lagoon (#03cbbc), Cobalt (#4389e6). Used for feature categorization, not as buttons.

### Product Showcase Card
**Role:** Large image/screenshot container

Full-bleed screenshot of the Sketch app interface, 20px corner radius, subtle drop shadow. No border. The image itself contains the product UI with a purple/pink gradient overlay. Centered, max-width ~900px, sits below announcement banner.

### Testimonial Quote Card
**Role:** Social proof display

Bone (#fafafa) or white fill, no visible border, generous internal padding (~32px). Large quotation mark glyph in Fog (#a7a7a7) or Light gray as decorative element. Quote text in Obsidian, Inter 400 at 16–17px. Faded/disabled testimonials use reduced opacity (~30%) and Mist (#a7f7f7) text to create a carousel preview effect.

### Navigation Bar
**Role:** Top-level site navigation

Transparent or Bone background, sticky position, 24px radius on any visible pill elements. Logo left, nav links center-left (Product dropdown, Explore dropdown, Pricing, Support), actions right (Sign In text link + Glow Halo CTA). Inter weight 500 at 15px for nav items. Dropdown items in Inter 400 at 14px.

### Dropdown Menu Panel
**Role:** Expanded navigation submenu

Bone background, 20px radius, soft shadow. Two-column layout with category headers (Inter 600, 14px) and link items (Inter 400, 14px). Generous padding (24px). Items separated by 8–12px vertical spacing.

### Secondary Nav Bar
**Role:** Section-level navigation

Appears on sub-pages with links (Design, Prototype, Collaborate, About Sketch) left-aligned and the Glow Halo CTA right-aligned. No background, just text links in Obsidian with the same pill CTA.

### Input Field
**Role:** Text input

Bone background, 3px or 16px border-radius, 1px Fog (#e6e6e6) border. Inter 400 at 14px placeholder text in Mist (#a7a7a7). Padding ~12px 16px. Minimal, no focus glow — the restraint is the point.

## Do's and Don'ts

### Do
- Use Reckless serif at 44–76px for display headlines only; never for body, UI, or navigation text.
- Set the primary CTA to a #151515 fill with the signature pink/magenta outer glow ring at 20px radius.
- Keep the page canvas at #fafafa (Bone) and reserve #212123 (Obsidian) for primary text and the darkest interactive states.
- Apply the pink-to-lavender gradient (Dusk Wash) as a full-bleed hero background; never as a small decorative element or button fill.
- Use the three accent colors (Iris, Lagoon, Cobalt) only inside 9999px-radius badges; never as background fills for cards, buttons, or large surfaces.
- Maintain 8px as the base spacing unit with 80px vertical rhythm between sections.
- Set body text at 14–16px Inter with 1.5–1.6 line-height; the reading layer is generous, not dense.

### Don't
- Don't use Reckless below 44px — the serif's character requires display-scale size to read correctly.
- Don't introduce additional saturated colors beyond Iris, Lagoon, and Cobalt; the system is 97% achromatic by design.
- Don't apply the Dusk Wash gradient to cards, buttons, or text backgrounds — it is atmospheric only.
- Don't use sharp corners (0–4px) on cards or buttons; the minimum structural radius is 8px for icons, 20px for containers.
- Don't add heavy drop shadows to cards; use hairline borders or the existing subtle shadow patterns, not theatrical elevation.
- Don't use weight 700 or above in Inter; the max weight in the system is 600.
- Don't place chromatic badges on chromatic backgrounds; badges need the Bone or Obsidian canvas behind them to read.

## Elevation

- **Glow Halo CTA:** `0 0 0 3px rgba(252, 122, 155, 0.35), 0 0 12px 2px rgba(252, 122, 155, 0.2)`
- **Icon container:** `0px 1px 3px 0px rgba(0, 0, 0, 0.2)`
- **Nav dropdown panel:** `0px 4px 16px 0px rgba(0, 0, 0, 0.08), 0px 1px 2px 0px rgba(0, 0, 0, 0.04)`

## Surfaces

- **Bone Canvas** (`#fafafa`) — Primary page background — the warm off-white that gives the site its paper-like, studio quality
- **Pure White Cards** (`#ffffff`) — Product screenshots, announcement cards, elevated surfaces that need to feel like paper laid on the canvas
- **Onyx Action** (`#151515`) — Primary CTA button fill — the darkest interactive surface, wrapped in the signature pink glow
- **Dusk Gradient** (`#fc7a9b`) — Atmospheric hero background — a soft pink-to-lavender wash that bleeds from the top-left, signaling warmth without saturation

## Imagery

The site is text-dominant with one large product screenshot as the primary visual asset. That screenshot shows the actual Sketch app interface — a dense tool panel on the left, canvas in the center, inspector on the right — overlaid with a purple/pink gradient wash that ties it to the hero's atmosphere. Decorative elements are minimal: large quotation mark glyphs in the testimonial section, a diamond logo mark, and a few small UI icons. No photography, no illustrations, no abstract 3D renders — the product IS the visual content. The hero gradient and the product screenshot gradient are the only chromatic visual treatments.

## Layout

Max-width ~1200px centered content with full-bleed hero sections. The hero uses a soft pink-to-lavender gradient that bleeds from the top-left corner, with headline + subtext + CTA left-aligned and max-width ~480px. Navigation is a clean top bar: logo left, links center-left, Sign In + CTA right. Below the hero: a centered announcement card, then a full-width product screenshot (no side margins, bleeds to ~900px max). The testimonial section uses a carousel pattern with the active quote at full opacity and adjacent quotes faded to ~30% opacity, creating a sense of depth. Section rhythm is 80px vertical gaps with seamless flow — no alternating dark bands, no visible dividers between sections. The overall density is spacious: one idea per screen, generous whitespace, the product screenshot does the heavy lifting.

## Similar Brands

- **Notion** — Same restrained grayscale canvas with a single serif/sans pairing and generous whitespace; both use pill-shaped buttons and soft shadows
- **Figma** — Same product-as-marketing approach where the app screenshot is the hero visual; both use minimal accent colors against near-white backgrounds
- **Linear** — Same opinionated typography pairing (serif display + geometric sans body) and dark pill CTAs as primary actions
- **Arc Browser** — Same atmospheric gradient hero treatment and editorial serif headlines that break the SaaS convention of geometric sans-serif display type
