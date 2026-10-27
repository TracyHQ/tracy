# Fabric — Style Reference
> editorial manuscript on a drafting table

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Fabric uses an editorial-document language: white canvas, near-monochrome surfaces, and a single editorial serif headline that gives the workspace a literary, almost manuscript-like gravity. The product lives in a tight grayscale world — black text, white surfaces, hairline borders, and almost no color — punctuated by a single vivid electric-violet glow that appears as soft shadows, focus halos, and accent washes rather than fills. Inter handles all UI and body text at compact, confident sizes, while GT Alpina Light whispers the brand promise in weight-300 serif at 80px. Components are paper-thin: cards with 16px radii, dark filled CTAs (#0a0a0a) with 8px radii, ghost links drawn in deep indigo with a 1px underline, and shadows so subtle they register as paper grain rather than elevation. The system feels like a writer's drafting table — calm, restrained, deeply considered, with one bright violet mark on the page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Violet | `#1100ff` | Brand accent — vivid glow halos behind product cards, focus ring washes, decorative shadow tint. Appears sparingly as a soft aura, never as a filled surface or text color |
| Ink Violet | `#19154e` | Link color and ghost-action border — underlined hyperlinks, outlined action borders, link text. The only chromatic text color in the system |
| Press Black | `#0a0a0a` | Primary action background, heading text, nav backgrounds. Used for filled CTA buttons and the heaviest typographic weight in the system |
| Carbon | `#000000` | Universal border color and high-emphasis text. The system draws most structural borders in pure black at hairline weights |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on dark fills, inverse text. The dominant background throughout |
| Newsprint | `#f3f3f3` | Subtle surface lift — secondary card backgrounds, hover fills, input resting states. One step off white for quiet differentiation |
| Graphite | `#666666` | Muted body text, helper text, secondary labels, nav inactive items. The workhorse gray for de-emphasized content |
| Slate | `#333333` | Secondary heading text, emphasized body copy, card titles. One step lighter than Press Black for sub-headlines |
| Pewter | `#404040` | Tertiary text, nav secondary items, metadata. Between Graphite and Slate in the gray scale |
| Ash | `#b3b3b3` | Medium-contrast borders, control outlines, and structural separators. Do not promote it to the primary CTA color |
| Smoke | `#737373` | Subtle borders, icon stroke at reduced weight, tertiary metadata text |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2
- **OpenType features:** `"ccmp", "cv05", "cv11", "kern", "salt"`

### GT Alpina Light — Display serif for hero headlines and section titles — the signature typographic choice. Weight 300 at 80px with -0.02em letter-spacing creates a literary, anti-SaaS gravity. No other productivity app uses a light serif at this scale; it positions Fabric as a thinking tool, not a dashboard.
- **Substitute:** Cormorant Garamond Light, Lora Light, Playfair Display
- **Weights:** 300, 400
- **Sizes:** 32px, 52px, 80px
- **Line height:** 1.08, 1.40
- **Letter spacing:** -0.02em at all display sizes

### Inter — Body, UI labels, nav items, button text, and subheadings. Weight 400 for body, 500 for emphasis, 600 for button labels and strong UI elements. Negative tracking (-0.01em to -0.02em) at larger sizes tightens the geometric forms for a compact, efficient feel.
- **Substitute:** system-ui, -apple-system, Segoe UI
- **Weights:** 400, 500, 600
- **Sizes:** 11px, 15px, 16px, 17px, 18px, 26px, 28px
- **Line height:** 1.20, 1.30, 1.40, 1.45, 1.50, 1.60, 2.00
- **Letter spacing:** -0.02em at 28px, -0.015em at 26px, -0.01em at 18px, +0.01em at 11px

### Manrope — Decorative heading weight — appears in badge labels and small-caps-style category tags. Used sparingly to add visual weight without serif gravitas.
- **Substitute:** Plus Jakarta Sans Bold, Space Grotesk Bold
- **Weights:** 700, 900
- **Sizes:** 18px
- **Line height:** 1.40

### system-ui — Micro-copy and icon-adjacent labels. System fallback ensures pixel-perfect rendering for tiny utility text.
- **Weights:** 400
- **Sizes:** 
- **Line height:** 1.20
- **OpenType features:** `"ccmp", "cv05", "cv11", "kern", "salt"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | 0.11px |
| body | — | — | 16px | 1.5 | -0.16px |
| body-lg | — | — | 18px | 1.4 | -0.18px |
| subheading | — | — | 28px | 1.3 | -0.56px |
| heading | — | — | 52px | 1.08 | -1.04px |
| display | — | — | 80px | 1.08 | -1.6px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 40px
- **Card padding:** 12px
- **Element gap:** 10px

### Border Radius

- **nav:** 8px
- **tags:** 40px
- **cards:** 16px
- **images:** 4px
- **buttons:** 8px
- **largeCards:** 24px

## Components

### Primary CTA Button
**Role:** Filled action button — the system's only filled interactive element

Background #0a0a0a, text #ffffff, 8px border-radius, Inter weight 600 at 15-16px. Padding 10px 12px. Subtle shadow: rgba(0,0,0,0.1) 0px 1px 1px, rgba(0,0,0,0.05) 0px 2px 4px. No hover state changes color — it deepens to #000000 or adds slight lift. Used for "Get Fabric free" and all conversion actions.

### Ghost Link Button
**Role:** Text link with optional outlined ghost border — secondary navigation

No background fill. Text and 1px border in #19154 (Ink Violet). 8px-16px border-radius depending on whether it's a text link or bordered action. Underlined by default. Used for "Log in" and inline navigation.

### Nav Bar
**Role:** Top-level site navigation

White background (#ffffff), hairline #000000 1px bottom border. Logo left (Fabric serif wordmark). Center nav items in Inter weight 500 at 15px, #0a0a0a. Right side: ghost text link + primary CTA button. Height ~56px, horizontal padding 24px.

### Hero Section
**Role:** Above-the-fold brand statement with editorial typography

White (#ffffff) background. Centered layout, max-width 800px for headline. Display serif (GT Alpina Light 300) at 80px, #0a0a0a, letter-spacing -1.6px. Supporting subtext in Inter weight 400 at 16-18px, #666666, centered. Rating row above headline: Inter 400 at 15px with 5 gold star icons (#fff500 fill).

### Product Preview Card
**Role:** Tilted screenshot card floating in the hero composition

Rounded image with 16px-24px border-radius, subtle shadow or electric-violet (#1100ff) glow halo behind. Slight rotation (-5° to +5°) for editorial scrapbook feel. Contains app UI screenshot with white background. Multiple cards overlap with z-index layering.

### Document Editor Surface
**Role:** Core product view — white document canvas with editing tools

White (#ffffff) document area, 16px border-radius. Toolbar at top with icon controls (search, magic wand, menu, close) in #0a0a0a. Body text in Inter weight 400 at 16px, #0a0a0a. Comment annotations in #19154 (Ink Violet) with author pills (colored circles + name labels in 11px Inter weight 500).

### AI Assistant Panel
**Role:** Right-sidebar AI companion — the differentiating product surface

White (#ffffff) panel, 16px border-radius, separated from document by 12px gap. Header with assistant name ("Fabric AI") and icon controls. Content blocks: action buttons (white bg, #0a0a0a border, 8px radius, Inter 500 14px), update notes in #f3f3f3 background with 12px radius, "Apply changes" in #f3f3f3 ghost button, "Reject changes" in #d4d4d4 ghost button. Note input at bottom with "+ Actions" trigger.

### Star Rating Display
**Role:** Social proof element in the hero

Score (4.7) in Inter weight 600 at 15px, #0a0a0a. Five star icons filled in #fff500 (gold). Count text ("2.4K+ app ratings") in Inter weight 400 at 15px, #666666. Horizontal row layout with 8px gap between elements.

### Link with Underline
**Role:** Inline text link in body content

Inter weight 500 at body size, color #19154, 1px bottom border in #19154e. No background, no padding. Hover state deepens color to #1100ff or adds slight underline weight.

### Tag/Badge (Pill)
**Role:** Category labels, feature tags, version markers

40px border-radius (full pill). Background #f3f3f3 or transparent. Text in Inter weight 500-600 at 11-15px, #0a0a0a. Padding 5px 12px. Optional 1px border in #000000 at hairline weight.

### Annotation Marker
**Role:** Inline comment indicator in the document editor

Small colored circle (8-12px diameter) in brand colors (violet, coral, etc.) positioned in the text margin. Adjacent pill label with author name in Inter weight 500 at 11px, white text on colored background, 40px border-radius.

### Meeting Recording Card
**Role:** Floating UI element showing recorded meeting metadata

White (#ffffff) background, 16px border-radius, subtle shadow. Contains meeting title in Inter 600 at 15px, #0a0a0a. Status badge (Recording) in #0a0a0a with red dot. Duration counter with waveform icon. Body text in Inter 400 at 13px, #666666.

### Landing Feature Card
**Role:** Content card in feature sections below the hero

White (#ffffff) background, 16px-24px border-radius, optional 1px #000000 border. Padding 12-24px. Content: serif heading (GT Alpina Light 32-52px), Inter body text, optional CTA link in #19154e.

## Do's and Don'ts

### Do
- Use #0a0a0a for all filled action buttons — it is the system's only filled surface and defines the CTA hierarchy.
- Set hero headlines in GT Alpina Light weight 300 at 52-80px with -0.02em letter-spacing — the serif is the brand signature.
- Draw all structural borders at 1px in #000000 — the system uses hairline black borders, not colored or thick rules.
- Apply 8px radius to buttons and nav elements, 16px to cards, 24px to large feature cards — this three-tier radius scale creates visual hierarchy.
- Use #19154 (Ink Violet) for all link text and outlined-action borders — never use #1100ff for text.
- Keep the palette 98% achromatic — let #1100ff appear only as soft glow halos, focus rings, and shadow tints behind product cards.
- Use Inter weight 400 for body, 500 for UI labels, 600 for button text and emphasized metadata — never go above 600 in UI.

### Don't
- Don't use #1100ff as a filled button background or body text — it is a glow/halo color only.
- Don't use sans-serif for the hero headline — the GT Alpina Light serif is the brand's signature and must not be substituted with Inter Bold.
- Don't apply heavy drop shadows — the system uses only rgba(0,0,0,0.1) 0px 1px 1px and rgba(0,0,0,0.05) 0px 2px 4px as a paper-grain effect.
- Don't introduce new chromatic colors — the 2% colorfulness is intentional; every new hue dilutes the editorial restraint.
- Don't use 40px border-radius on cards — it is reserved for pill tags and badge elements only.
- Don't set body text below 15px or above 18px — the UI type scale stays compact and confident.
- Don't use blue link colors (#0000ee or similar) — all links must be #19154 with a 1px border underline.

## Elevation

- **Primary CTA Button:** `rgba(0, 0, 0, 0.1) 0px 1px 1px 0px, rgba(0, 0, 0, 0.05) 0px 2px 4px 0px`
- **Nav Bar:** `rgba(0, 0, 0, 0.1) 0px 1px 1px 0px, rgba(0, 0, 0, 0.05) 0px 2px 4px 0px`
- **Product Preview Card:** `rgba(17, 0, 255, 0.15) 0px 0px 40px 0px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Primary background for all pages and sections
- **Card Surface** (`#ffffff`) — Elevated content cards, modals, and product preview containers
- **Subtle Wash** (`#f3f3f3`) — Secondary surface for update notes, hover states, and input resting backgrounds
- **Inverted Surface** (`#0a0a0a`) — Primary action buttons and dark UI panels

## Imagery

The site uses tilted product screenshot cards as decorative hero elements — real UI captures rotated -5° to +5°, overlapping with z-index layering to create a scrapbook editorial feel. Photography is absent; the product UI screenshots are the visual content. The AI assistant panel screenshot shows a document editor with a right-sidebar AI companion, comment annotations with colored author pills, and action buttons. Imagery is purely product-as-hero — no lifestyle photography, no abstract graphics, no illustrations. Icons are minimal and appear only as utility controls (search, magic wand, menu, waveform, star).

## Layout

Max-width 1200px centered container with 24px horizontal padding. The hero is a centered text stack (max-width ~800px for headline) with tilted product cards floating in the surrounding space. Navigation is a single top bar with left logo, center links, right CTA cluster. Below the hero, sections alternate between full-width white bands and content-max-width blocks at 40-80px vertical gaps. The product detail section (second screenshot) shows a max-width ~1000px white document editor with a right-sidebar AI panel, separated by 12px gap. Overall rhythm: spacious hero → tight product demo → spacious feature sections.

## Similar Brands

- **Notion** — Same white-canvas productivity aesthetic with minimal color and product-screenshot-as-hero composition, though Notion uses sans-serif and Fabric uses an editorial serif headline
- **Obsidian** — Similar near-monochrome interface with dark CTA buttons and a focus on writing/thinking tools, though Obsidian defaults to dark mode and uses heavier borders
- **Craft** — Same document-centric workspace with restrained palette and emphasis on editorial typography, though Craft uses more color in its UI states
- **Reflect** — Same minimalist productivity app aesthetic with near-black CTAs and monochrome surfaces, though Reflect uses a more traditional sans-serif throughout
- **Tana** — Similar knowledge-workspace category with white backgrounds and single-accent-color restraint, though Tana uses a warm orange accent where Fabric uses electric violet
