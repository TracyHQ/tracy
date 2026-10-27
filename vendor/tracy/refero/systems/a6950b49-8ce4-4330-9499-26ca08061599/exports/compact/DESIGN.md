# Humble — Style Reference
> architect's broadsheet with safety-orange punctuation — a flat warm-white page where one vivid orange mark carries the entire brand voice.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Humble is a near-monochrome editorial system anchored by a single safety-orange accent. The canvas is warm off-white, type is set in Bricolage Grotesque with aggressive negative tracking that pulls the display sizes into poster-like blocks, and orange appears as a sharp marker-pen punctuation — a period at the end of a headline, a thin underline on a phrase, a flooded band between sections. Surfaces are flat with no shadows; hierarchy comes from generous whitespace, oversized type, and the orange accent that acts like a highlighter on a printed page. Components stay light: pill nav, ghost outlines, softly rounded product mockups, and dark filled CTAs that read as ink stamps rather than web buttons.

## Colors

| Name | Value | Role |
|------|-------|------|
| Safety Orange | `#ff4000` | Brand accent — terminal periods after display headlines, thin underlines on key phrases, small icon accents, and full-bleed section bands. This is the only chromatic color in the system; it must be used sparingly, like a highlighter on a printed page |
| Ink Black | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Carbon | `#1c1c1c` | Heading text where pure black feels too harsh; gives display type a slightly softer, warmer read without losing the editorial weight |
| Graphite | `#6e6e6e` | Body secondary text, nav inactive items, caption labels. The workhorse muted neutral for supporting copy and metadata |
| Slate | `#828282` | Lighter secondary text and subdued headings — used when Graphite would compete with body copy |
| Fog | `#999999` | Disabled state text, tertiary metadata, placeholder labels |
| Paper | `#fafafa` | Page canvas and primary surface — the dominant background across all sections. Sits between pure white and cream to soften the high-contrast black typography |
| Cream | `#fdfef8` | Warmest surface tint for elevated cards and feature blocks — barely a degree warmer than Paper, but enough to read as a distinct layer |
| Ash | `#f1f1f1` | Mid-tone surface for cards that need more separation from the Paper canvas without introducing a border |
| Linen | `#ecebe8` | Warmest card surface variant — used for product mockup containers and illustration cards that need a tactile, paper-like feel |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Bricolage Grotesque — Primary display and heading font. Used for all headlines, section titles, and feature headings. The variable weight range (500–600) and aggressive negative tracking on large sizes create poster-like headline blocks that read as printed editorial type rather than web text. Tighter tracking at larger sizes is a signature choice — the letters almost touch, creating compact, confident word shapes.
- **Substitute:** Outfit, Space Grotesk, or any geometric grotesque with variable weight and open apertures
- **Weights:** 500, 600
- **Sizes:** 16, 18, 20, 24, 32, 42, 44, 50, 58px
- **Line height:** 1.10–1.50
- **Letter spacing:** -0.052em at 58px, -0.050em at 50px, -0.040em at 42px, -0.036em at 44px, -0.030em at 32px, -0.020em at 18–24px, -0.010em at 16px
- **OpenType features:** `"cv01", "cv05", "cv09", "cv11", "ss03"; "blwf", "cv03", "cv04", "cv09", "cv11", "ss01", "ss03", "ss04"`

### Geist — UI and navigation typeface. Used for nav links, button labels, form text, table-of-contents entries, and interface chrome. The tighter tracking at 24px and near-normal at 14px makes it a comfortable workhorse for dense UI contexts where Bricolage Grotesque would feel too editorial.
- **Substitute:** Inter, IBM Plex Sans, or system-ui
- **Weights:** 500, 600
- **Sizes:** 13, 14, 15, 16, 24px
- **Line height:** 1.30–1.40
- **Letter spacing:** -0.020em at 24px, -0.007em at 14px
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11", "ss01", "ss03", "ss04"; "cv01", "cv05", "cv09", "cv11", "ss03"`

### Geist Variable — Secondary body and utility text at lighter weight. Used for fine print, metadata, timestamps, and supporting body copy where Geist 500/600 would feel too heavy.
- **Substitute:** Inter, system-ui
- **Weights:** 400
- **Sizes:** 12, 14, 17px
- **Line height:** 1.00–1.40
- **Letter spacing:** normal
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11", "ss01", "ss03", "ss04"; "ss01", "ss02", "ss03", "ss04"`

### Inter — Fallback body and link text. Used in contexts where Inter's broader availability matches the design intent without requiring a custom font load.
- **Substitute:** System sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 14, 16, 18px
- **Line height:** 1.20–1.40
- **Letter spacing:** -0.040em, -0.020em, -0.010em
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 12px | 1.2 | 0px |
| caption | — | — | 14px | 1.4 | -0.1px |
| body-sm | — | — | 16px | 1.5 | -0.16px |
| body | — | — | 18px | 1.5 | -0.36px |
| subheading | — | — | 20px | 1.4 | -0.4px |
| heading | — | — | 32px | 1.2 | -0.96px |
| heading-lg | — | — | 44px | 1.2 | -1.58px |
| display | — | — | 58px | 1.1 | -3.02px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 32-40px
- **Element gap:** 10-16px

### Border Radius

- **cards:** 30-40px
- **pills:** 100px
- **buttons:** 100px
- **navElements:** 6px
- **sectionBands:** 70px
- **productMockups:** 40px

## Components

### Primary CTA Button
**Role:** Filled dark pill button for the most important action on a page

Background: #000000. Text: #fafafa, Geist 500, 14–16px. Border-radius: 100px (full pill). Padding: 12px 24px. No border, no shadow. The button reads as an ink stamp — solid, confident, and flat. Used for 'Book a Call' in nav and 'Start my 24h Build' in the hero.

### Secondary Ghost Button
**Role:** Outlined or text-only button for secondary actions

Background: transparent. Border: 1px solid #000000, 100px radius. Text: #000000, Geist 500, 14–16px. Padding: 11px 23px. Alternatively, a text-only variant with no border for tertiary actions like '60-Second Fit Test' in nav.

### Top Navigation Bar
**Role:** Sticky header with logo, page links, and primary CTA

Background: #fafafa (transparent over content). Layout: logo left, centered nav links (Geist 500, 14px, #000000), CTA right. Nav links separated by 16–24px gap. CTA is a black pill button. The nav sits on a transparent background — no border-bottom, no shadow. The 'Humble' wordmark pairs a small orange circle icon with the brand name in Bricolage Grotesque.

### Section Eyebrow Badge
**Role:** Small uppercase label above section headings

Text: Bricolage Grotesque 500, 14–16px, #ff4000, letter-spacing normal. No background or border — purely typographic. Used as a tag line like 'The Factory OS That Grows With You' or 'Production-Grade Operational Software'. The orange color is the only accent — the badge is text-only.

### Feature Section (Two-Column)
**Role:** Alternating text + product mockup section

Two-column grid with text on one side and a product mockup card on the other. Text column: eyebrow badge, heading (Bricolage Grotesque 32–42px, #000000 or #1c1c1c), body (Geist 16–18px, #6e6e6e). Product mockup column: rounded card with 30–40px radius, #fafafa or #fdfef8 background, 1px #000000 border, 32–40px internal padding. No shadow.

### Product Mockup Card
**Role:** Container for dashboard screenshots, product UI previews, and video thumbnails

Background: #fafafa or #fdfef8. Border: 1px solid #000000. Border-radius: 30–40px. Padding: 0 (image fills the card). The card has a thin dark outline that frames the product UI like a polaroid. Used extensively to showcase the actual product interface.

### Hero Section
**Role:** Above-the-fold section with headline, illustration, and CTA

Three-part layout: headline (Bricolage Grotesque 44–58px, #000000, ending with a #ff4000 period as punctuation) on the left, illustration on the right, a full-bleed orange band below, then a centered dark CTA pill button. The orange period after the headline is a signature element — it acts as a visual full-stop that also signals the brand accent.

### Orange Section Band
**Role:** Full-width color band used as a section divider or background highlight

Background: #ff4000. Height: variable, typically 80–160px. Content (if any) is centered: #fafafa or #000000 text. Used in the hero to create a strong horizontal color break between the headline area and the product preview below. This is one of the few places where the orange floods a large area — everywhere else it's a small mark.

### Inline Orange Accent
**Role:** Small typographic accent used to highlight key phrases within body copy

Rendered as #ff4000 text or a 2px #ff4000 underline beneath 2–4 words within a sentence. Used in the right-column support copy in the hero: 'Set it Free in a Week.' is underlined in orange, drawing the eye to the value proposition. This is the most restrained use of the brand color.

### Product Dashboard Preview
**Role:** Full-bleed product UI screenshot embedded in a mockup frame

A screenshot of the actual Humble product (Control Center, chat, workflow lists) placed inside a Product Mockup Card. The dashboard itself uses a light background (#fafafa), sidebar navigation, and small orange accent icons. The mockup card has 30–40px radius and a thin dark border.

### Video Play Button Overlay
**Role:** Centered play button on video thumbnails

Circular button, 64–80px diameter, #000000 background, white triangle icon centered. Positioned absolutely centered on the product mockup card. Solid, high-contrast, no shadow.

### Feature Grid Card
**Role:** Card for individual features in a multi-column grid

Background: #fafafa. Border: 1px solid #ecebe8 or #000000. Border-radius: 24–30px. Padding: 32px. Content: small icon (24px, #000000 or #ff4000), heading (Bricolage Grotesque 20–24px, #000000), body (Geist 16px, #6e6e6e). No shadow. Used in feature grids to present capabilities side by side.

### Navigation Pill / Tag
**Role:** Small rounded label for categorization or filtering

Background: #f1f1f1 or #ecebe8. Text: Geist 500, 12–14px, #000000. Border-radius: 100px. Padding: 6px 14px. Used for section tags, status labels, and filter pills within the product UI.

## Do's and Don'ts

### Do
- Use Safety Orange (#ff4000) only as a small accent — terminal periods after headlines, thin underlines on key phrases, small icon fills, and full-bleed section bands. Never use it for body copy or large text blocks.
- Set display headlines in Bricolage Grotesque 500–600 with aggressive negative tracking: -3px at 58px, -1.5px at 44px, -0.96px at 32px. The tight letter-spacing is a signature — do not loosen it.
- Use #000000 for all primary CTAs and filled buttons. The CTA is always a black pill (100px radius) on the warm-white canvas — never orange, never outlined as the primary action.
- Use 30–40px border-radius on all cards, images, and product mockups. The rounded softness is essential to the paper-like, friendly feel of the system.
- Maintain a flat design with zero drop shadows. If you need to separate layers, use surface color contrast (Paper → Cream → Linen) or add a 1px #000000 border.
- Keep the canvas at #fafafa (not pure white). The off-white warmth is what makes the black type and orange accent feel like printed editorial pages rather than screen UI.
- Use generous section gaps (64–80px) and card padding (32–40px). The design is spacious by default — do not pack elements tightly.

### Don't
- Do not use Safety Orange (#ff4000) for CTA buttons, links, or navigation active states. The primary action is always Ink Black (#000000).
- Do not add drop shadows, glows, or elevation effects. The system is intentionally flat — any shadow breaks the editorial paper-like quality.
- Do not use pure white (#ffffff) for backgrounds. The canvas must be #fafafa or warmer (#fdfef8, #ecebe8) to maintain the printed-page atmosphere.
- Do not use more than one chromatic color. The system is monochrome + one orange accent. Adding a blue, green, or any second hue breaks the entire visual identity.
- Do not set body text below 14px. The system prioritizes readability and editorial weight — small text should be reserved for metadata and micro-labels only.
- Do not use sharp corners (0–4px radius) on cards, images, or product mockups. The rounded softness (24–40px) is a defining trait of the system.
- Do not use decorative gradients. The only gradient in the system is the subtle warm-to-dark fade used in specific section transitions — do not introduce new gradient patterns.

## Elevation

Deliberately flat. No drop shadows are used anywhere in the system. Separation between layers comes from background color contrast (Paper → Cream → Linen) and from generous whitespace. The absence of shadows is a defining choice — the design reads as printed editorial pages rather than screen UI, and any added shadow would break that paper-like quality.

## Surfaces

- **Paper** (`#fafafa`) — Default page canvas — the dominant background
- **Cream** (`#fdfef8`) — Elevated card surface for feature blocks
- **Linen** (`#ecebe8`) — Warm product mockup and illustration container
- **Ash** (`#f1f1f1`) — Cool secondary card surface for additional contrast

## Imagery

Illustrations are hand-drawn in a loose, editorial style with visible brushwork and muted, naturalistic colors — a man in a white shirt with a tablet, rendered with watercolor-like washes in soft grays, blues, and skin tones. The illustrations sit on the warm-white canvas and feel like printed editorial artwork rather than digital graphics. Product mockups are the dominant visual element: full-bleed screenshots of the actual Humble dashboard (Control Center, chat interface, workflow cards) presented in rounded card frames with thin dark borders. No stock photography, no 3D renders. The visual language is paper-first — illustrations and product screenshots are treated as printed inserts on a broadsheet page.

## Layout

Max-width 1200px centered content with generous left/right padding. The hero is a split layout: oversized headline (Bricolage Grotesque 58px) on the left taking 50% width, hand-drawn illustration on the right, followed by a full-bleed orange band and a centered dark CTA button. Below the hero, product mockup cards span the full content width with 30–40px corner radius. Feature sections alternate in a two-column pattern: text (eyebrow badge, heading, body) on one side, product mockup card on the other, switching left/right between sections. Section gaps are 64–80px with no visible dividers — the rhythm comes from whitespace alone. Navigation is a minimal top bar: logo left, centered text links, black pill CTA right, no background fill or border. The overall page reads as a vertical scroll through a printed broadsheet — large display type, generous breathing room, and orange punctuation marks guiding the eye downward.

## Similar Brands

- **Linear** — Both use a single vivid accent color against a near-monochrome palette, with oversized display type and generous whitespace. Linear's purple-on-dark mirrors Humble's orange-on-warm-white in the same accent-as-punctuation approach.
- **Vercel** — Similar flat, shadow-free design with large geometric grotesques, minimal chrome, and a warm-white canvas. Both systems rely on typographic weight and whitespace rather than borders or elevation to create hierarchy.
- **Stripe** — Both use tight letter-spacing on large display type to create compact, confident headline blocks. The editorial broadsheet quality of Humble's pages mirrors Stripe's recent print-inspired design language.
- **Notion** — Both use rounded product mockup cards (30–40px radius) with thin borders, warm off-white backgrounds, and a restrained color palette where small accent touches carry the brand. The paper-like, friendly density is a shared trait.
- **Framer** — Both pair oversized display typography with a single accent color and use full-bleed color bands as section transitions. The poster-like treatment of headlines is a shared editorial instinct.
