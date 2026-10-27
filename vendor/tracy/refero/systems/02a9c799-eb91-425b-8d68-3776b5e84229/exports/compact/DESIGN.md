# Jasper — Style Reference
> serif headlines over a pastel tile mosaic

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Jasper reads like an editorial print magazine that learned to ship software. The canvas is pure white, the type is a high-contrast serif (Feature) set tight and tall, and the only structural color is a near-black midnight navy that does duty as both ink and filled button surface. Around that disciplined spine, the design opens up a toy box: pastel card backgrounds in coral, mint, sky, butter, and lilac, each carrying flat geometric illustrations on faint grid textures. The rhythm is generous — breathing room between sections, small-caps eyebrow labels above each headline, and two-button CTAs that pair a quiet outline with a confident filled action. Everything else stays out of the way: no shadows, no gradients, no decorative chrome, just ink, paper, and the occasional pop of color as functional punctuation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Ink | `#00063d` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Signal Coral | `#fa4028` | Accent links, inline emphasis, illustrative highlights — vivid warm coral that cuts through the pastel system |
| Merlot | `#5a003c` | Decorative icon accent, tag text, secondary brand touch — deep wine magenta used sparingly for typographic and icon moments |
| Forest Floor | `#103a00` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Ember | `#fa7560` | Card backgrounds, warm tag fills, soft section washes — pastel coral sibling of Signal Coral |
| Coral Mist | `#ffe8e2` | Soft card surface, badge fill — near-white coral wash for warm category cards |
| Sky | `#0095ff` | Card accents, illustration strokes, icon highlights — vivid blue used as a cool counterpoint in the pastel palette |
| Sky Mist | `#ceebff` | Gray supporting accent for decorative details and low-frequency emphasis |
| Mint | `#45ff00` | Card accents and illustration strokes — vivid electric green used as playful punctuation |
| Mint Mist | `#e6ffd9` | Soft green card surface — pale mint wash for category cards |
| Butter | `#fff67d` | Yellow supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Buttercream | `#fffbb7` | Pale card surface, subtle section wash — cream yellow |
| Lilac | `#7c5ac4` | Decorative icon and illustration accent — vivid violet used in flat graphics |
| Lilac Mist | `#e7e3f7` | Pale lilac card surface — wash for cool category cards |
| Blush | `#ffb3de` | Decorative badge fill, soft pink wash — mid-saturation pink |
| Blush Veil | `#ffe6f3` | Pale pink card surface and badge background |
| Paper | `#ffffff` | Page canvas, card surfaces, button text on dark fills |
| Bone | `#f9f9f9` | Alternate card surface, subtle section background |
| Shell | `#fff7f5` | Warm-tinted card surface, badge fill with coral undertones |
| Graphite | `#5e5d5f` | Muted icon stroke, secondary text, illustration outline — neutral gray for graphic line work |
| Cream | `#fffdd9` | Warm section wash — pale cream surface for alternating bands |

## Typography

### Feature — Display and headline serif; used at 80px for hero statements, 54px for section openers, 38px for sub-sections, and 20–28px for editorial card titles. Custom high-contrast serif with extremely tight tracking (-0.030em at display) that gives headlines a magazine-cover confidence rather than a typical SaaS shout.
- **Substitute:** DM Serif Display, Playfair Display, or Tiempos Headline
- **Weights:** 450
- **Sizes:** 20px, 24px, 28px, 38px, 54px, 80px
- **Line height:** 1.00–1.10
- **Letter spacing:** -0.0300em, -0.0200em, -0.0100em

### ABC ROM — Primary body and UI sans; weight 450 for body copy and buttons, 500 for subheads, 700 for emphasis. Tight tracking (-0.010em) gives it a compact, typeset quality — it sits close to the serif without competing.
- **Substitute:** Inter, Söhne, or DM Sans
- **Weights:** 450, 500, 700
- **Sizes:** 14px, 16px, 18px, 28px
- **Line height:** 1.20–1.40
- **Letter spacing:** -0.0100em

### ABC ROM Mono — Code snippets, technical labels, and monospaced micro-copy. Same tracking as ABC ROM (-0.010em) so it aligns visually in mixed-type compositions.
- **Substitute:** JetBrains Mono or IBM Plex Mono
- **Weights:** 450
- **Sizes:** 14px, 16px
- **Line height:** 1.20
- **Letter spacing:** -0.0100em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1 | -0.14px |
| body-sm | — | — | 16px | 1.2 | -0.16px |
| body | — | — | 18px | 1.4 | -0.18px |
| subheading | — | — | 24px | 1.1 | -0.24px |
| heading-sm | — | — | 28px | 1.1 | -0.28px |
| heading | — | — | 38px | 1.1 | -0.76px |
| heading-lg | — | — | 54px | 1.05 | -1.08px |
| display | — | — | 80px | 1 | -2.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-100px
- **Card padding:** 24-32px
- **Element gap:** 8-12px

### Border Radius

- **all:** 4px
- **cards:** 4px
- **badges:** 4px
- **buttons:** 4px

## Components

### Primary CTA Button
**Role:** Main action button — "Get A Demo" and "Explore The Platform"

Filled Midnight Ink (#00063d) background, white text, ABC ROM 16px weight 500, letter-spacing -0.16px, padding 12px 24px, border-radius 4px. No shadow, no border. Sits as the dominant action in a two-button pair.

### Secondary Outline Button
**Role:** Companion action — "Start Free Trial"

White background, 1px Midnight Ink border, Midnight Ink text. Same typography and padding as the primary CTA. Pairs left of the filled button in hero and section CTAs.

### Navigation Bar
**Role:** Top-level site navigation

White background, height ~64px, border-bottom none. Left: Jasper wordmark in Signal Coral (#fa4028). Center: ABC ROM 14px weight 500 nav links in Midnight Ink. Right: "Log In" text link, "Free Trial" text link, then filled Midnight Ink "Get A Demo" button. Nav items spaced with ~33px horizontal gaps.

### Announcement Banner
**Role:** Inline promotion above the hero

Centered pill-style banner with a pale green (#e6ffd9) badge reading "New research!" in Forest Floor text, followed by Midnight Ink copy "The State of AI in Marketing 2026. Download now →" in ABC ROM 16px. Subtle, not loud.

### Eyebrow Label
**Role:** Section category label above headlines

ABC ROM 16px weight 500, Midnight Ink text, used in phrases like "The Jasper Platform". Sits centered or left-aligned above the serif heading with ~12-16px gap below. Functions as a quiet section signpost.

### Feature Category Card (Green)
**Role:** Pastel category card — Agents

Mint Mist (#e6ffd9) background, 4px radius, padding 32px. Contains a flat illustration in Mint (#45ff00) and Forest Floor strokes on a faint grid texture, a serif heading, body copy in Midnight Ink, and a right-arrow affordance. Card spans one column in a 3-column grid.

### Feature Category Card (Coral)
**Role:** Pastel category card — Content Pipelines

Coral Mist (#ffe8e2) background, 4px radius, padding 32px. Flat illustration in Signal Coral and Midnight Ink strokes on grid texture. Same structure as the green variant — only the wash and illustration palette shift.

### Feature Category Card (Blue)
**Role:** Pastel category card — Jasper IQ

Sky Mist (#ceebff) background, 4px radius, padding 32px. Flat illustration in Sky (#0095ff) and Midnight Ink strokes on grid texture.

### Logo Strip
**Role:** Social proof — "World-class marketing teams trust Jasper"

Centered ABC ROM 16px label in Midnight Ink, followed by a single row of 6 grayscale partner logos evenly spaced. Logos render in Graphite (#5e5d5f) or pure black, no color treatment, equal optical sizing.

### Hero Illustration Block
**Role:** Visual hero element with person and decorative grid

Composite illustration: photographic portrait of a person layered over a flat geometric tile grid in Signal Coral, Butter, and Coral Mist. Decorative stat callouts in white pills with Midnight Ink text ("+35% Pipeline") overlay the composition. Sits below the centered hero text block.

### Section Heading Block
**Role:** Centered section opener

Eyebrow label → Feature serif heading at 54px / line-height 1.05 / letter-spacing -1.08px in Midnight Ink → body paragraph in ABC ROM 18px weight 450 → optional filled CTA button below. Centered alignment, max-width ~700px for the text block.

### Split Content Section
**Role:** Text + visual two-column block

Left column: serif heading (38px) + body copy + optional CTA. Right column: illustration or UI mockup with thin 1px border in near-black, 4px radius. Generous gap (80px) between columns. Used for "Why modern marketing teams choose Jasper" pattern.

### Tag Badge
**Role:** Inline category or status tag

Small pill or rounded rectangle with 4px radius, padding 2px 8px. Background is a pastel wash (Coral Mist, Sky Mist, Mint Mist, Butter, Lilac Mist), text is the matching deep shade (Merlot, Forest Floor, Midnight Ink). ABC ROM 14px weight 500.

## Do's and Don'ts

### Do
- Set all headlines in Feature serif at 38–80px with line-height ≤ 1.10 and letter-spacing between -0.020em and -0.030em — the tight tracking is what makes the type feel editorial.
- Use Midnight Ink (#00063d) for all body text, headings, and filled CTAs — it is the only color that should carry structural weight.
- Pair every primary CTA with a secondary outline button of identical size; never use a single-button CTA in hero or section openers.
- Build category cards on pastel washes from the defined palette (Coral Mist, Sky Mist, Mint Mist, Buttercream, Lilac Mist, Blush Veil) with 4px radius and 24–32px padding — never use white or gray for these cards.
- Add a small-caps eyebrow label in ABC ROM 16px above every section heading, centered or left-aligned to match the heading.
- Keep all borders, badges, and buttons at 4px radius — do not introduce rounded pills or larger curves; the sharp 4px is part of the identity.
- Use the vivid accent colors (Signal Coral, Sky, Mint, Lilac) only inside illustrations and icon strokes on the pastel card surfaces, never as backgrounds for UI chrome.

### Don't
- Do not set body or UI text in the serif Feature font — reserve it exclusively for display and section headings.
- Do not use shadows, gradients, or glow effects on any element — the design is flat by conviction, not by omission.
- Do not introduce colors outside the defined palette for new components, even if they are common SaaS neutrals like slate or zinc.
- Do not set display headings with normal or positive letter-spacing — the negative tracking (-0.020em to -0.030em) is signature.
- Do not use the pastel card washes as page or section backgrounds at full width — they belong only on contained card surfaces.
- Do not render CTA buttons in Signal Coral, Sky, or any accent color — Midnight Ink is the only button fill.
- Do not add large border-radius values (8px, 12px, 9999px) to buttons, cards, or badges — the 4px sharp-corner system is deliberate.

## Surfaces

- **Paper** (`#ffffff`) — Primary page canvas and default card surface
- **Bone** (`#f9f9f9`) — Alternate card surface for subtle contrast
- **Shell** (`#fff7f5`) — Warm-tinted card surface for coral-category contexts
- **Cream** (`#fffdd9`) — Warm section wash for alternating bands

## Imagery

Imagery is a deliberate mix of flat editorial illustration and tightly cropped photography. The signature motif is geometric tile-grid patterns in pastel coral, butter, and mint that act as a backdrop layer behind photographic portraits — the person sits on top of an abstract color field, not in a real environment. Illustrations on the category cards are flat, outlined-and-filled geometric compositions (arrows, nodes, document shapes, atomic orbitals) drawn in a single vivid accent color plus Midnight Ink, set against the matching pastel wash with a faint grid texture. Photography is high-key, candid-style portraiture with no lifestyle staging. Icons throughout the UI are mono-stroke in Graphite (#5e5d5f) or Midnight Ink, simple geometric forms with consistent 1.5–2px stroke weight. The overall density is text-dominant; imagery appears in hero, category cards, and split sections, never as full-bleed background.

## Layout

Pages are max-width 1200px centered on a pure white canvas with generous vertical breathing room (80–100px between major sections). The hero is a centered text block — small announcement pill, then a large serif headline at 80px, then body copy, then a two-button CTA pair — followed by a full-width illustrated hero block with a portrait over a pastel tile grid. Below the hero, a single-row logo strip breaks the white space, then sections alternate between centered editorial openers (eyebrow + serif heading + paragraph + optional CTA) and split text-plus-illustration two-column blocks. A recurring pattern is a 3-column equal-width card grid for category features, each card on a different pastel wash. Navigation is a single top bar, non-sticky, with no mega-menu — just flat link lists and a right-aligned CTA. Sections flow seamlessly without dividers or color bands; the pastel card surfaces create the only visual separation between content blocks.

## Similar Brands

- **Linear** — Same disciplined near-black primary on pure white, tight sans-serif UI, and flat illustration accents — Linear shares Jasper's editorial confidence and restraint
- **Notion** — Pastel card surfaces with flat geometric illustrations and a clean serif/sans type pairing — Notion's category cards echo Jasper's Mint/Coral/Sky washes
- **Anthropic** — High-contrast serif display headlines (GT Super / Tiempos family) set tight over a white canvas with a near-black primary — same magazine-on-the-web atmosphere
- **Pitch** — Editorial typography choices, generous whitespace, and pastel accent washes on category cards — Pitch treats marketing pages the way Jasper does
- **Retool** — Confident serif headlines paired with a flat colorful illustration system and a single dark-ink brand color for all structural UI
