# Obviously — Style Reference
> Whimsical claymation on white paper. Zams stages friendly geometric play-doh creatures on a clean, almost clinical white backdrop, letting one vivid violet do all the chromatic work and a warm serif handle the typographic warmth.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Zams runs a dual-language visual system: a rigorously minimal, serif-headed enterprise aesthetic married to a cast of chubby, candy-colored claymation characters that embody the AI workers themselves. The white canvas is intentional stage-craft — it lets the violet CTA (#7451f2), the subtle dotted-grid patterns, and the pastel mascots carry all the visual personality while the surrounding chrome (tabs, integration logos, compliance badges) stays quietly functional. Headlines use a warm serif (Lustria) with tight negative tracking, body and UI run on DM Sans, and labels like "COMING SOON", "EVAN", and "YOUR NEXT HIRE" shift into Martian Mono to give sections a technical, almost build-log voice. Components are square-jawed: 4px corners, hairline borders, one subtle button shadow, and no decorative gradients. The overall tone is enterprise-credible but never sterile — the mascots break the tension, and the monospace meta-labels signal "this product is engineered, not assembled."

## Colors

| Name | Value | Role |
|------|-------|------|
| Iris Violet | `#7451f2` | Primary filled CTA buttons, active tab indicator, the single chromatic accent across the whole system. One vivid purple against a near-achromatic canvas creates brand presence without color noise |
| Deep Iris | `#5952a1` | Outlined/ghost action border, secondary violet for secondary buttons and stroke accents. Darker tone of the primary — keeps the brand family intact when a softer surface is needed |
| Cobalt Info | `#0072c6` | Blue state accent for badges, validation surfaces, and short status labels. Do not promote it to the primary CTA color |
| Powder Blue | `#d6e5ff` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. |
| Graphite Ink | `#272727` | Primary text color, heading strokes, icon fills, footer text — the dominant near-black that gives the white canvas its voice |
| Slate | `#5d5d5d` | Body text and the workhorse border tone — paragraphs, helper copy, and the hairline rules that separate sections |
| Ash | `#4f4f4f` | Secondary text, nav metadata, slightly darker than Slate for emphasis without going to black |
| Mauve Dust | `#a69ea7` | Muted dividers, disabled-ish rules, tertiary borders — the quietest border tone that still reads on white |
| Fog | `#858585` | Placeholder text, low-emphasis captions, the most recessive neutral for de-emphasized meta |
| Charcoal Hairline | `#333333` | Link text and image borders where a slightly softer black than #272727 is needed |
| Mist | `#e0e0e0` | Light borders, button outline borders, table dividers, card edges — the bright hairline tone |
| Soft Snow | `#f6f6f6` | Subtle surface elevation for cards and section bands sitting on the white canvas — just enough contrast to define a panel without darkening the page |
| Paper White | `#ffffff` | Page canvas, button text on violet fill, card surfaces, footer background — the dominant background color |
| Pure Black | `#000000` | Maximum-contrast text, decorative SVG fills, and the deepest borders where full opacity is required |

## Typography

### Lustria — Display and headline serif — the only serif in the system. Used for hero headlines, section titles, and feature headings at 32–52px. The aggressive negative tracking (-0.05em at 52px) tightens the wide Lustria letterforms so they feel contemporary rather than editorial. Signature choice: a warm rounded serif against a minimalist white layout gives the enterprise product a humanist, almost editorial voice.
- **Substitute:** DM Serif Display, Playfair Display, or Lora as a free Google alternative that mimics the rounded warmth.
- **Weights:** 400
- **Sizes:** 20px, 32px, 36px, 42px, 52px
- **Line height:** 1.10–1.20
- **Letter spacing:** -0.0190em to -0.0500em

### DM Sans — Body and UI workhorse — paragraphs, buttons, nav links, captions, helper text, icons-aligned labels. The geometric humanist sans handles the entire functional layer from 9px micro-tags up to 16px body. Light positive tracking at small sizes (0.02em) keeps tiny badge text legible; slight negative tracking at 16px gives body copy a tighter feel.
- **Substitute:** Inter, Manrope, or Plus Jakarta Sans as near-equivalent free alternatives.
- **Weights:** 400, 500, 600, 700
- **Sizes:** 9px, 12px, 14px, 15px, 16px
- **Line height:** 1.20–1.60
- **Letter spacing:** -0.0200em to 0.0200em

### Martian Mono — Meta-label and build-log voice — section eyebrows ("YOUR NEXT HIRE", "TRUSTED BY", "INTEGRATIONS", "SECURITY"), persona names ("EVAN"), status pills ("COMING SOON"), and uppercase micro-tags. Positive tracking (~0.02em) reinforces the all-caps treatment. Switching from DM Sans to Martian Mono for these labels is the system's signature typographic move: it gives the page a 'developer changelog' voice layered on top of the friendly claymation aesthetic.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono as free monospace alternatives with similar geometric character.
- **Weights:** 400, 500
- **Sizes:** 11px, 16px
- **Line height:** 1.20–1.27
- **Letter spacing:** 0.0130em to 0.0220em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| mono-sm | — | — | 11px | 1.2 | 0.22px |
| caption | — | — | 14px | 1.4 | — |
| body | — | — | 16px | 1.6 | 0.32px |
| subheading | — | — | 20px | 1.2 | — |
| heading-sm | — | — | 32px | 1.2 | — |
| heading | — | — | 36px | 1.2 | -0.68px |
| heading-lg | — | — | 42px | 1.1 | -2.02px |
| display | — | — | 52px | 1.1 | -2.6px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16-24px
- **Element gap:** 8-16px

### Border Radius

- **nav:** 4px
- **cards:** 4px
- **badges:** 100px
- **buttons:** 4px

## Components

### Primary CTA Button
**Role:** Filled violet button for the page's main action ("GET EARLY ACCESS", "REQUEST CUSTOM WORKER").

Background: #7451f2. Text: #ffffff in DM Sans 12–14px weight 600, letter-spacing 0.24px. Padding: 10–12px vertical, 16–20px horizontal. Border-radius: 4px. Box-shadow: rgba(0,0,0,0.2) 0px 2px 4px 0px. Uppercase optional. The single shadow in the system — gives the button just enough lift to feel pressable without breaking the flat aesthetic.

### Outlined Secondary Button
**Role:** Lower-emphasis action sitting beside a primary CTA ("EXPLORE AI WORKERS", "VISIT TRUST CENTER").

Background: transparent or #ffffff. Text: #272727 in DM Sans 12–14px weight 500. Border: 1px solid #5d5d5d or #5952a1 for the violet-stroked variant. Border-radius: 4px. Padding: matches primary. No shadow.

### Ghost Nav Link
**Role:** Top navigation items ("INTEGRATIONS", "PRICING", "BLOG", "LOG IN").

Text: #272727 in DM Sans 12px weight 500, letter-spacing 0.24px, uppercase. No underline by default; subtle color shift to #7451f2 on hover. Padding: 8px horizontal.

### Top Navigation Bar
**Role:** Sticky-style top header across all pages.

Background: #ffffff. Height ~64px. Logo "zams" with starburst icon at left, nav links centered or left-of-center, ghost "LOG IN" + filled "GET EARLY ACCESS" violet button at right. Bottom hairline border: 1px #e0e0e0.

### Hero Section
**Role:** First-screen composition for the landing page.

Two-column split on desktop. Left: serif headline (Lustria 52px weight 400, -2.6px tracking) in #272727, DM Sans sub-text (16px, line-height 1.6) in #5d5d5d, primary + outlined button stack. Right: product preview (chat UI mock) with the 5 mascot characters arrayed in a row in front. Generous vertical padding (80–96px).

### Trust Logo Strip
**Role:** Social-proof band immediately below the hero ("TRUSTED BY").

Centered Martian Mono 11px uppercase eyebrow "TRUSTED BY" in #858585 with letter-spacing 0.22px. Row of monochrome or full-color partner logos (lasagna, HUSK, PERFORM, Google Cloud, espresso, Golden Proportions Marketing) on a Paper White background. Logos visually balanced, not grid-locked.

### Persona Tab Navigation
**Role:** Tab switcher to showcase the five AI workers (Evan, Atlas, Nico, Nova, Iris).

Five equal-width tab cells in a horizontal row separated by 1px #e0e0e0 vertical dividers. Active tab has a small rounded badge above it in DM Sans. Each tab: persona name in DM Sans 15–16px weight 500 #272727 + role label ("Meeting Prep", "CRM Manager") in DM Sans 12px #858585. Tab background: #ffffff, active-state background: #f6f6f6. "COMING SOON" pill in Martian Mono 11px sits above the inactive tabs.

### Feature Section (Text + Illustration)
**Role:** Long-form description of a single AI worker's capability.

Two-column layout: left column is Lustria 42px headline in #272727, DM Sans 16px body in #5d5d5d, primary CTA button. Right column: the single mascot character in isolation plus a row of "CONNECTS WITH" integration logos. Background: #ffffff. Spacing: 64–80px vertical gap.

### AI Worker Mascot Illustration
**Role:** 3D-rendered character representing each AI worker — a signature brand asset.

Geometric claymation form (pyramid, sphere, cylinder, pentagon, teardrop) in saturated pastel colors (green, blue, teal, yellow, pink/magenta) with a soft matte/play-doh surface texture, two googly eyes, and a small smile. Centered or bottom-right of feature sections. Each mascot is a unique shape–color pair, giving the persona a distinct silhouette.

### COMING SOON Pill Badge
**Role:** Status indicator on tabs for unreleased personas.

Background: #ffffff. Border: 1px solid #e0e0e0. Border-radius: 100px (full pill). Text: Martian Mono 11px uppercase in #5d5d5d, letter-spacing 0.22px. Padding: 2px 6–8px.

### Section Eyebrow Label
**Role:** Monospace meta-label that sits above every section title.

Always Martian Mono 11px uppercase, letter-spacing 0.22px, color #858585 or #5d5d5d, centered or left-aligned. Examples in the system: "YOUR NEXT HIRE", "TRUSTED BY", "INTEGRATIONS", "SECURITY", "CUSTOM AI WORKERS". Acts as a build-log section header that contrasts with the warm serif headlines below.

### Integrations Grid
**Role:** Large bento-style grid of partner logos for the "Connect Anything" section.

Multi-column asymmetric grid on a Paper White background with a subtle dotted/grid texture pattern. Each cell: 1px #e0e0e0 border, 4px radius, 16–24px padding, centers a full-color partner logo. Center cell holds the serif "Connect Anything" headline and an outlined "EXPLORE INTEGRATIONS" button.

### Security & Trust Card
**Role:** Two-column section reinforcing enterprise compliance.

Left: Martian Mono "SECURITY" eyebrow + Lustria 36–42px headline ("No training on your data") + DM Sans body copy + outlined "VISIT TRUST CENTER" button. Right: four circular compliance seals (AICPA SOC, GDPR, HIPAA, CCPA) in their brand-correct colors, arrayed in a single row. Background: #ffffff or #f6f6f6.

### Custom Workers Banner
**Role:** Inline promotional card mid-page ("Custom AI Workers").

Background: #f6f6f6. Border-radius: 4px. Padding: 16–24px. Left: small circular mascot icon + DM Sans 16px weight 600 headline + DM Sans 14px weight 400 body. Right: primary violet filled "REQUEST CUSTOM WORKER" button. Hairline #e0e0e0 border separates it from surrounding white.

### Dotted Grid Background Pattern
**Role:** Subtle texture used in the integrations and feature sections.

Repeating CSS dot pattern on a Paper White or Soft Snow background — small #e0e0e0 dots at regular 16–24px intervals. Adds tactile texture without competing with content. The most distinctive non-color surface element in the system.

## Do's and Don'ts

### Do
- Use #7451f2 Iris Violet as the only chromatic accent — every filled CTA, every active state, every violet stroke in the system.
- Set every section title in Lustria 32–52px with negative tracking between -0.02em and -0.05em; never substitute a sans-serif for headlines.
- Prefix every section with a Martian Mono 11px uppercase eyebrow in #858585 (TRUSTED BY, INTEGRATIONS, SECURITY, YOUR NEXT HIRE).
- Hold all corner radii to 4px for cards/buttons and 100px for pill badges — no other values.
- Use the dotted-grid background pattern in feature and integrations sections; leave the hero on a clean Paper White.
- Pair primary CTA with one outlined secondary button on a 16–24px horizontal gap — never stack two filled violets.
- Keep body copy at 16px DM Sans with line-height 1.6 in #5d5d5d Slate, never #272727 Graphite Ink (reserved for headings).

### Don't
- Don't introduce a second chromatic accent — the system is monochrome + one violet, not multi-color.
- Don't use Martian Mono for body copy or long-form text — reserve it for uppercase labels under 16px.
- Don't add shadows to cards, nav, or images — the single rgba(0,0,0,0.2) 0px 2px 4px 0px shadow belongs to the primary CTA button only.
- Don't use #5952a1 as a filled button background — it is an outlined-action border color, not a fill.
- Don't render headings in DM Sans or body copy in Lustria — the font-to-role mapping is strict.
- Don't use gradients, glassmorphism, or colored glows on any surface — surfaces are flat or near-flat.
- Don't use more than two typefaces per screen — the system is Lustria (serif display) + DM Sans (UI) + Martian Mono (labels).

## Elevation

- **Primary CTA button:** `rgba(0, 0, 0, 0.2) 0px 2px 4px 0px`

## Surfaces

- **Paper White** (`#ffffff`) — Base canvas for the entire page — the stage on which everything sits.
- **Soft Snow** (`#f6f6f6`) — First elevation step for cards, banner panels, and alternating section bands.
- **Powder Blue** (`#d6e5ff`) — Info-state surface — tinted background for status badges and highlight wash.
- **Iris Violet** (`#7451f2`) — Brand surface — filled CTA, the highest-attention UI layer.

## Imagery

The hero of the visual language is a set of 3D-rendered claymation character mascots — chubby geometric forms (pyramid, sphere, cylinder, pentagon, teardrop) in saturated pastels (green, blue, teal, yellow, magenta) with a matte play-doh surface, two googly eyes, and a small smile. Each mascot is a unique shape–color pair, giving the AI worker personas a distinct silhouette. They appear in the hero as a group, and individually in each feature section. Product screenshots are clean, light-themed chat UI mocks that look like native macOS windows. The remaining visual space is dominated by full-color partner logos (Notion, HubSpot, Salesforce, Slack, Gong, etc.) presented at native brand colors. There is no lifestyle photography. The icon language (in nav, compliance, eyebrows) is monochrome line icons in #272727 or monospace text in Martian Mono. The overall image-to-text ratio is roughly 30/70 in favor of text — imagery punctuates rather than dominates.

## Layout

Full-bleed sections, content centered at ~1200px max-width. The hero is a 50/50 split: serif headline + body + button stack on the left, product preview with the mascot group on the right. Below the hero, the page settles into a rhythm of centered single-column sections (headline, eyebrow, subhead, body) with the eyebrow always in Martian Mono uppercase. Feature sections are text-left / illustration-right 2-column splits that alternate. The Integrations section is an asymmetric bento grid with the CTA centered. Navigation is a single minimal top bar — logo left, three nav links and two utility buttons right — no sidebar, no mega-menu. Spacing is generous: 64–96px between sections, 16–24px inside cards. Backgrounds alternate Paper White and Soft Snow to create section rhythm without relying on heavy dividers.

## Similar Brands

- **Clay** — Same claymation/play-doh 3D character aesthetic with saturated pastel geometric forms — both sites stage friendly mascot illustrations on a clean minimal background.
- **Mem** — Same warm serif (Lustria-family) headlines paired with playful 3D mascot illustration on a paper-white canvas — the typographic and color discipline is nearly identical.
- **Linear** — Same max-width-contained centered layout, hairline borders, near-achromatic chrome, and a single vivid accent color for primary actions.
- **Notion** — Same Paper White canvas, Soft Snow (#f6f6f6) section bands, 4px component corners, and a quiet functional UI that lets content and illustration do the personality work.
- **Intercom** — Same enterprise-SaaS credibility softened by friendly illustration and a single bold accent color — both feel 'engineered but human'.
