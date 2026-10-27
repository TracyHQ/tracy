# Whimsical — Style Reference
> Deep plum ink on lavender mist — a creative studio notebook that thinks it's a technical whiteboard.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Whimsical operates as a dark-plum-on-cream workspace: a near-black purple (#250835) does the heavy structural work — nav borders, body text, primary buttons — while Agrandir display headlines at 48-96px float above the surface with generous negative tracking. The palette is deliberately narrow: two purples, one warm-gray-purple for muted copy, and vivid violet/blue accents that read as functional punctuation on links and icons rather than decorative noise. Sections break the monochrome discipline with full-bleed gradient washes (blue→violet→pink, purple→pink) that preview the product canvas. Cards live at 8-16px radius with plum-tinted shadows at very low opacity, and the white canvas carries a barely-there lavender undertone (#ebe6ee, #f5f4f5) rather than pure neutral gray — everything sits in the same purple family.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Plum | `#250835` | Primary action fill, nav borders, headline text, card borders — the structural workhorse. High-contrast against white (18:1) lets it function as both color and text simultaneously |
| Dark Mauve | `#473054` | Secondary text and outlined action borders, muted plum that steps back from Deep Plum without leaving the family |
| Vivid Violet | `#ab2fed` | Accent link color, icon stroke — the brightest chromatic in the UI, used sparingly to mark interactive text and product iconography |
| Vivid Blue | `#0283ec` | Secondary accent on icons and flowchart elements — pairs with Vivid Violet to give the product canvas its dual-accent personality |
| Electric Indigo | `#4b38ee` | Tertiary accent on icons, occasionally used in flowchart node color alongside Vivid Blue |
| Warm Gray Purple | `#6a5b72` | Muted body text, list dividers, secondary borders — stays in the plum family at lower chroma to avoid breaking the monochrome discipline |
| Lavender Mist | `#ebe6ee` | Default border and divider color, low-contrast page texture — the neutral that replaces what most sites would do in #e5e5e5 |
| Soft White | `#f5f4f5` | Card surface slightly off-white to lift cards off the canvas without going full gray |
| Plum Shadow | `#cdc7d1` | Box-shadow base tone — shadows are plum-tinted (rgba(37,8,53,…)) so elevation reads as on-brand even at low opacity |
| Lavender Wash | `#decaff` | Decorative card and heading highlight wash — the lightest purple tint, used as background accent on badges and inline highlights |
| Blush Bloom | `#e9bded` | Hero gradient warm stop, decorative card surface — the pinker end of the lavender family used in gradient transitions and product showcase backgrounds |
| Sky Mist | `#bbcfe4` | Cool decorative surface — the blue-tinted neutral used in card backgrounds and gradient cool stops to balance the purple warmth |
| Plum to Pink Wash | `linear-gradient(142deg, rgb(186, 89, 255) 0%, rgb(186, 89, 255) 30%, rgb(255, 89, 241) 100%)` | Decorative gradient wash — purple-to-pink spectrum used in hero backgrounds and marketing sections |
| Aurora Gradient | `linear-gradient(97deg, rgb(60, 161, 255) 5.54%, rgb(200, 82, 255) 49.85%, rgb(255, 96, 240) 94.14%)` | Full-bleed section gradient — blue→violet→pink sweep used on logo band and feature section dividers |

## Typography

### Agrandir — Display headlines only. Used at 48-96px for hero and section titles, 24px for large card titles. The 700 weight at huge sizes is confident but not heavy — character widths are wide and the negative tracking (-0.01em) tightens the silhouette. Single weight means hierarchy comes from size alone, not weight contrast. Substitute: Recoleta, Gilroy Bold, or Manrope 800 if Agrandir is unavailable.
- **Substitute:** Recoleta, Gilroy Bold
- **Weights:** 700
- **Sizes:** 24px, 48px, 64px, 96px
- **Line height:** 1.00–1.10
- **Letter spacing:** -0.01em at display sizes

### Manrope — UI body font — handles everything below display: nav, buttons (400-600), body copy (400 at 14-16px), small labels (9-13px), and the occasional subheading (32px). Wide weight range allows three-tier hierarchy within UI text. Letter-spacing opens up to 0.15em on small labels (badges, 'NEW' tags) for an all-caps tracked feel. Substitute: Inter, DM Sans.
- **Substitute:** Inter, DM Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 9px, 10px, 12px, 13px, 14px, 16px, 32px
- **Line height:** 1.20, 1.40, 2.67
- **Letter spacing:** 0.009em to 0.15em depending on size; 0.15em on small uppercase labels

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| label | — | — | 10px | 1.2 | 1.5px |
| caption | — | — | 12px | 1.2 | 0.24px |
| body-sm | — | — | 14px | 1.4 | 0px |
| body | — | — | 16px | 1.4 | 0px |
| subheading | — | — | 24px | 1.2 | -0.24px |
| heading-sm | — | — | 32px | 1.2 | -0.32px |
| heading | — | — | 48px | 1.1 | -0.48px |
| heading-lg | — | — | 64px | 1.05 | -0.64px |
| display | — | — | 96px | 1 | -0.96px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 16px

### Border Radius

- **nav:** 12px
- **cards:** 16px
- **links:** 12px
- **badges:** 9999px
- **images:** 8px
- **buttons:** 12px
- **featureCards:** 40-120px

## Components

### Top Navigation Bar
**Role:** Sticky site navigation

White surface with a 1px Lavender Mist (#ebe6ee) bottom border running the full width. Inner content is centered at max-width 1200px with 18px horizontal padding. Logo on left (32px), nav links centered (Manrope 500 14px, #250835), and 'Contact sales' + 'Log in' text links + 'Sign up' filled Deep Plum button on right. No drop shadow — the border line is the only separator.

### Announcement Banner
**Role:** Promote new features

Sits directly under the nav as a full-width band with rounded ends (9999px) and Lavender Mist border. White background. Contains a 'NEW' badge (Deep Plum fill, white text, 9999px radius, 9-10px Manrope 600 0.15em tracked) + body text in Manrope 500 14px #250835 + a star/sparkle icon. Tight 11px vertical padding.

### Primary Button (Filled)
**Role:** Main call-to-action

Deep Plum (#250835) background, white text, Manrope 600 14-16px. 12px border radius. Padding 8-10px vertical, 18px horizontal. Inset highlight via soft inner shadow or 1px lighter top edge. Often paired with a circular play/arrow icon button directly attached (Deep Plum circle with white arrow).

### Ghost / Outlined Button
**Role:** Secondary action

Transparent fill, 1px Dark Mauve (#473054) border, Dark Mauve text. Same 12px radius and 8-10px vertical / 18px horizontal padding as Primary. Manrope 500 14px.

### Pill Link with Arrow
**Role:** Inline navigation link

No background, text in Vivid Violet (#ab2fed) or Deep Plum, Manrope 500 14px, followed by a → chevron. Sits as the primary action inside feature cards. The arrow is the affordance — the link itself has no decoration.

### Hero Gradient Banner
**Role:** Hero section background

Full-bleed Plum-to-Pink gradient (#ba59ff → #ff59f1) as the hero canvas. Centered Agrandir 700 headline at 64-96px in white, Manrope 400 16-18px subhead in white, and a Deep Plum primary button below. A subtle grainy/textured overlay (sparse noise) runs across the gradient to give it a printed-paper feel.

### Product Preview Card
**Role:** Hero visual / product showcase

White surface, 16px border radius, sits overlapping the bottom of the hero. Contains the app UI screenshot with browser chrome (traffic-light dots, tab bar) at 8px top-radius. No drop shadow — contrast against the gradient does the lifting.

### Logo Cloud Band
**Role:** Social proof / customer logos

Full-bleed Aurora Gradient (#3ca1ff → violet → pink) section. White customer logos (Voyage, Mercado Libre, New Relic, Octopus Deploy, One Medical, Pendo) arranged in a single row, evenly spaced, ~40px height. No text labels — logos only.

### Feature Card
**Role:** Product feature showcase

White card, 16-40px border radius (larger cards push to 40-120px for visual variety). Internal padding 40px. Top half is a soft-tinted preview surface (Lavender Wash #decaff, Blush Bloom #e9bded, or Sky Mist #bbcfe4) at 8px radius with a miniature wireframe illustration. Below: Agrandir 700 24px title in Deep Plum, Manrope 400 14-16px description in Warm Gray Purple, and a Vivid Violet pill link with arrow. Soft drop shadow at rgba(37,8,53,0.06) 0 16px 32px -4px.

### Floating Pill Navigation
**Role:** In-app secondary nav (seen in product preview)

White pill (9999px radius) with Lavender Mist border, 1px. Contains Manrope 500 12-14px text in Deep Plum with small icons. Sits as an overlay element inside the product canvas.

### Icon Node (Product Canvas)
**Role:** Flowchart / diagram element

Small (16-24px) icons in Vivid Violet, Vivid Blue, or Electric Indigo. Filled style, 1-2px stroke weight. Used inside the product canvas to mark node types and toolbar actions.

### Share Button (In-App)
**Role:** Primary in-app action

Vivid Violet (#ab2fed) filled button, white text, Manrope 600 12-14px, 8-12px radius, small share icon prefix. The only chromatic filled button in the product UI — the violet is reserved for 'Share / publish / export' actions.

## Do's and Don'ts

### Do
- Use Deep Plum (#250835) for all primary buttons, nav borders, and headline text — it carries both the brand and the primary action role simultaneously.
- Set display headlines in Agrandir 700 at 48-96px with -0.01em letter-spacing. Do not use Agrandir below 24px.
- Use 12px radius on all buttons, nav pills, and inline links — this is the signature small radius that keeps the UI tight.
- Reserve Vivid Violet (#ab2fed) for inline links, share buttons, and product icons. Never use it for large backgrounds or hero fills.
- Use the Plum-to-Pink or Aurora gradient as full-bleed section backgrounds only — never as small accents or button fills.
- Apply shadows as rgba(37,8,53, x) — plum-tinted, never neutral gray. Keep opacity ≤0.2.
- Use Lavender Mist (#ebe6ee) for all default 1px borders and dividers — do not introduce #e5e5e5 or other neutral grays.

### Don't
- Do not use a sans-serif display font for headlines — Agrandir's wide, geometric character set is the signature; substituting a generic bold sans loses the brand.
- Do not fill hero or section backgrounds with flat solid colors — the gradient wash is what makes sections feel on-brand.
- Do not use vivid Violet as a background for body text or long-form copy — reserve it for short interactive elements.
- Do not introduce new border radii — the system lives at 8px (images), 12px (buttons/nav), 16px (cards), and 9999px (pills/badges).
- Do not use cool blue or neutral gray shadows — shadows must be plum-tinted (rgba(37,8,53,…)) to stay on-brand.
- Do not use pure black (#000000) for text or backgrounds — Deep Plum (#250835) is the darkest the system goes.
- Do not use Vivid Blue (#0283ec) for UI chrome outside the product canvas — it lives inside diagrams and icons, not on marketing pages.

## Elevation

- **Primary Button:** `rgba(37, 8, 53, 0.06) 0px 16px 32px -4px`
- **Ghost Link / Inline Action:** `rgba(37, 8, 53, 0.2) 0px 12px 16px -4px`

## Surfaces

- **Canvas** (`#ffffff`) — Page background, dominant canvas color across all sections
- **Soft Surface** (`#f5f4f5`) — Card surface slightly lifted from canvas
- **Lavender Border** (`#ebe6ee`) — Hairline borders, dividers, and low-contrast page texture
- **Highlight Wash** (`#decaff`) — Decorative card and heading highlight backgrounds
- **Gradient Field** (`#e9bded`) — Full-bleed gradient section backgrounds (plum-to-pink, aurora)

## Imagery

Product screenshots are the primary visual content — real UI captures of flowcharts, mind maps, and dashboards sit inside rounded-corner browser-chrome frames. Illustrations are minimal and wireframe-like: flat geometric shapes (rectangles, diamonds, cylinders for databases) in Vivid Violet, Vivid Blue, and Electric Indigo on white or light-tinted card surfaces. No photography, no 3D renders, no lifestyle imagery. Icons inside the product are filled, 1-2px stroke, multi-color (violet/blue/indigo palette). The hero uses a grainy noise texture overlay on the gradient to give it a printed-paper feel. Imagery density is moderate — each section gets one product preview or one feature card preview, never a wall of images.

## Layout

Max-width 1200px centered content with full-bleed gradient sections. Hero is a full-bleed gradient band (Plum-to-Pink) with centered Agrandir headline and a product preview card overlapping the bottom edge. Sections alternate: gradient hero → white canvas with centered display headline and subhead → 3-column feature card grid → full-bleed Aurora gradient logo band → another white section with text+image rows. Navigation is a sticky top bar with a centered nav cluster and right-aligned auth buttons. An announcement banner sits flush below the nav. Card grids use 3 columns at desktop, 1 column at mobile. Vertical rhythm is generous — ~80px between sections, ~40px internal card padding.

## Similar Brands

- **Pitch** — Same approach: light canvas, single deep brand color for primary actions, one vivid accent for interactive elements, and large custom display headlines floating over generous whitespace.
- **Linear** — Similar monochrome discipline with a single dominant brand color doing structural work, though Linear goes dark-mode where Whimsical stays light.
- **Figma** — Shared product-canvas aesthetic with multi-color accent palette (violet/blue/pink) for diagram elements and a light, airy marketing site.
- **Notion** — Light surface with dark text, minimal color in chrome, and feature card grids with soft shadows and rounded corners.
