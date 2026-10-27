# Spellbook — Style Reference
> midnight courtroom lit by coral ink — a dark editorial surface where a warm orange pen mark is the only sound

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Spellbook operates as a midnight legal library: near-black canvas, editorial serif display type, and a single coral-orange action color that cuts through the darkness. The system refuses the typical SaaS blue/gradient playbook — instead it borrows from premium print: Arizona Mix at 67–77px with aggressively tight tracking turns headlines into magazine covers, while Soehne handles all UI at quiet, compact sizes. The visual hierarchy is built on contrast between white text on #121719 and the warmth of #f94d1 CTAs, not on shadows or elevation. Surfaces stay flat; depth comes from background shifts (canvas → #222729 → #2b3133 for inputs) and from typographic scale, not drop shadows. Components are sharp-edged (4px radius) except buttons and badges which go full pill (1600px/100px), creating a deliberate tension between editorial precision and soft, inviting action targets.

## Colors

| Name | Value | Role |
|------|-------|------|
| Courtroom Ink | `#121719` | Page canvas, primary background — near-black with a faint cool tint, not pure black; sets the midnight tone |
| Lectern Surface | `#222729` | Elevated card and panel surfaces sitting one step above the canvas; used for feature cards and link hovers |
| Document Drawer | `#2b3133` | Input field backgrounds, form controls — one level above card surfaces to read as recessed |
| Manuscript White | `#ffffff` | Primary headings, body text on dark surfaces, ghost-button borders, and inverted text on coral CTAs |
| Parchment | `#f1f3f4` | Light surface variant for cards on dark, light-mode button text, and subtle off-white highlights |
| Ashen Type | `#909394` | Medium-contrast borders, control outlines, and structural separators. |
| Smoke | `#acaeaf` | Tertiary text, disabled states, and lighter dividers — sits between Ashen Type and Manuscript White |
| Coral Verdict | `#f94d1e` | Primary action buttons (Book a Demo, Try Free) — the only warm hue on the page; signals decision points without aggression |
| Indigo Statute | `#7834b5` | Accent for select feature cards and section highlights — used sparingly to add editorial weight, never on actions |
| Cyan Margin | `#029cff` | Inline links, logo gradient, and decorative icon strokes — cool counterpoint to the warm coral primary |

## Typography

### Arizona Mix — Display headlines and section titles only. Weight 500 medium — not bold — lets the serifs do the work. Aggressive negative tracking (-0.04em at 77px shrinking to -0.02em at 28px) tightens the letterforms into an editorial, almost newspaper-headline feel. This is the signature choice: a custom serif in a SaaS context replaces the usual geometric sans and signals premium legal authority.
- **Substitute:** GT Sectra, Playfair Display, or DM Serif Display for system-level fallback
- **Weights:** 500
- **Sizes:** 28px, 51px, 67px, 77px
- **Line height:** 1.00–1.15
- **Letter spacing:** -0.0400em, -0.0300em, -0.0200em

### Soehne — All UI, body, button, badge, input, and subheading text. Neutral grotesque with even proportions; weight 400 for body, 500–600 for UI labels and buttons, 700 reserved for emphasis. Consistent -0.01em tracking across all sizes. The quiet counterpart to the loud display serif — Soehne is the workhorse, Arizona Mix is the voice.
- **Substitute:** Inter, Söhne (if licensed), or Untitled Sans for close match
- **Weights:** 400, 500, 600, 700
- **Sizes:** 13px, 14px, 16px, 18px, 20px, 22px, 24px
- **Line height:** 1.30–1.63
- **Letter spacing:** -0.0100em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.4 | -0.13px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 18px | 1.6 | -0.18px |
| heading-sm | — | — | 20px | 1.5 | -0.2px |
| heading | — | — | 24px | 1.3 | -0.24px |
| heading-lg | — | — | 28px | 1 | -0.56px |
| display | — | — | 51px | 1.1 | -1.53px |
| display-lg | — | — | 67px | 1 | -2.01px |
| display-xl | — | — | 77px | 1 | -3.08px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **cards:** 4px
- **badges:** 100px
- **inputs:** 4px
- **buttons:** 1600px

## Components

### Primary Coral CTA
**Role:** The only filled action button on the site — reserved for conversion events

Background #f94d1 (Coral Verdict), text #ffffff in Soehne 16px weight 500–600, horizontal padding 20px 24px, vertical padding 14px, border-radius 1600px (full pill). No border. The warmth of coral against the midnight canvas makes it the unmistakable action. Used for 'Book a Demo' in nav and hero, 'Try Spellbook Free' in form.

### Ghost Outline Button
**Role:** Secondary action that shares weight with the primary without competing for attention

Transparent background, 1px border in #ffffff at reduced opacity or solid white, text #ffffff in Soehne 16px weight 500, same 1600px pill radius and ~14px vertical padding as the primary. Pairs directly beside coral CTAs as a low-pressure alternative ('Try Free' next to 'Book a Demo').

### Inverted Light Button
**Role:** CTA variant for light-surface contexts (e.g. footer, light cards)

Background #f1f3f4 (Parchment), text #121719 (Courtroom Ink), 1600px pill radius, same padding scale as coral CTA. Provides the same action weight without the warm accent when on a light surface.

### Dark Card
**Role:** Feature and content containers on the dark canvas

Background #222729 (Lectern Surface), border-radius 4px, padding 24px. Hairline 1px border in #ffffff at ~10% opacity for edge definition. No shadow on most cards — depth comes from the background shift alone. One hero card uses a soft dual-shadow stack for elevation over an embedded document preview.

### Light Inversion Card
**Role:** High-contrast card that breaks the dark rhythm — used for testimonials or featured blocks

Background #f1f3f4 (Parchment), text #121719, 4px radius, 24px padding. Creates a visual pause in the dark page flow.

### Form Input
**Role:** Data entry fields in lead-capture and account forms

Background #2b3133 (Document Drawer), border 1px in #acaeaf or #909394 at low opacity, border-radius 4px, padding 14px 16px. Text in Soehne 16px #ffffff. Placeholder text in #909394. Label sits above in Soehne 14px weight 500 #ffffff.

### Pill Badge
**Role:** Category tags, feature flags, or status labels

Background varies (often #222729 or tinted brand), text in Soehne 13–14px weight 500, border-radius 100px (full pill), padding 6px 12px. Compact and quiet — badges annotate, never shout.

### Top Navigation Bar
**Role:** Persistent site header with brand, primary links, and CTA

Transparent or #121719 background, no shadow. Logo left (Spellbook wordmark + cyan-to-violet diamond icon), center nav links in Soehne 14px #ffffff with dropdown chevrons, right side has 'Login' text link and a coral 'Book a Demo' CTA in pill form. Sticky on scroll.

### Trust Logo Grid
**Role:** Social proof band — company logos of customers

3-row × 6-column grid of monochrome white logos on #121719 canvas, no card containers, logos rendered at uniform height (~24px). Spacing 48px between rows, even horizontal distribution. The '4,400+ in-house teams and law firms trust Spellbook' caption sits above in Soehne 16px #909394.

### Hero Section
**Role:** First-screen above-the-fold

Centered composition on #121719 canvas. Display headline in Arizona Mix 67–77px weight 500, #ffffff, letter-spacing -2.01 to -3.08px, line-height 1.0. Subhead in Soehne 18px #909394 below. Two-button stack: coral primary + ghost secondary, centered. Total vertical padding ~120px top and bottom.

### Feature Card with Document Preview
**Role:** Product capability showcase — contract review with AI suggestions

Dark card (#222729, 4px radius) containing a mock document screenshot with annotation overlays. A floating 'Review Contract' badge (white pill) and '26 suggestions...' counter badge appear as overlay UI. Demonstrates the product visually without requiring a live demo.

### Footer / Closing Form
**Role:** Lead capture and final CTA

Section heading 'Start your free trial' in Arizona Mix ~51px, subtext in Soehne 16px #909394, form with dark inputs (#2b3133), a single coral CTA 'Try Spellbook Free' below the form, and a legal disclaimer line at the bottom in Soehne 14px #909394. Thin #ffffff-at-low-opacity divider separates form from disclaimer text.

## Do's and Don'ts

### Do
- Use Arizona Mix exclusively for display and section headings at 28px+ — never for body, UI, or anything below 24px
- Default to 4px border-radius for all cards, inputs, and rectangular components; reserve 1600px/100px pill radius strictly for buttons and badges
- Use #f94d1 (Coral Verdict) as the single primary action color — never introduce a second warm accent
- Build depth through background shifts (#121719 → #222729 → #2b3133) rather than drop shadows; shadow should appear on at most one elevated card per page
- Apply -0.04em to -0.02em letter-spacing to all Arizona Mix type and -0.01em to all Soehne type — the tight tracking is part of the editorial voice
- Use Soehne 14–16px weight 400–500 for all UI text; jump to 600 only for button labels and nav links
- Keep page max-width at 1200px and section gaps at 96px — the system breathes with generous vertical rhythm

### Don't
- Do not use Arizona Mix below 24px — the serif's character breaks down at UI sizes and competes with Soehne
- Do not use filled buttons in any color other than #f94d1 on dark surfaces or #f1f3f4 on light surfaces
- Do not add visible drop shadows to standard cards — only the feature card with embedded document preview earns elevation
- Do not use blue (#029cff) or violet (#7834b5) as button fills — they are accent/link colors, not action colors
- Do not introduce gradients, glows, or glassmorphism — the surface language is flat and editorial
- Do not use pure #000000 as a page background — #121719 with its cool tint is the canvas; pure black is reserved for the logo mark and decorative fills only
- Do not use border-radius values between 5px and 99px — the system is binary: 4px sharp or 100px+ pill

## Elevation

- **Feature Card with Document Preview:** `rgba(0, 0, 0, 0.05) -20px 20px 30px -13px, rgba(0, 0, 0, 0.15) 5px 5px 35px 15px`

## Surfaces

- **Canvas** (`#121719`) — Page background — the midnight base everything sits on
- **Card Surface** (`#222729`) — Feature cards, nav dropdowns, hover states for links
- **Input Well** (`#2b3133`) — Form input fields — recessed feel for data entry
- **Light Inversion** (`#f1f3f4`) — Light cards on dark pages when a bright surface break is needed

## Imagery

Spellbook's visual language is predominantly text-and-UI with minimal photography or illustration. The only recurring visual motif is the embedded product screenshot — a mock contract document with AI-suggestion annotations (underlined blue phrases, floating 'Review Contract' and '26 suggestions...' pills) that demonstrates the product in-action. Trust is communicated through a monochrome white logo grid rather than lifestyle photography. The logo itself is the brand's sole decorative mark: a diamond/sparkle glyph rendered in a cyan-to-violet gradient, the only place a gradient appears in the system. No stock photography, no illustrations, no 3D renders — the editorial serif typography and the product preview are the visual content.

## Layout

Page layout follows a centered, max-width-1200px rhythm on a full-bleed #121719 canvas. The hero is a single centered column with a large display headline, subtext, and a two-button stack — no side-by-side image, no asymmetric split. Below the hero, sections alternate between centered text blocks and full-width card grids, separated by ~96px of vertical space. The feature section uses a single wide dark card with an embedded document preview. The trust band is a 3×6 monochrome logo grid with no card containers. The closing form is a centered single-column layout with stacked inputs and one CTA. Navigation is a top bar with a transparent or canvas-matched background — no sidebar, no mega-menu, no sticky decorative elements.

## Similar Brands

- **Harvey** — Same dark editorial legal-AI aesthetic with serif display headlines and a restrained accent palette against near-black canvas
- **Linear** — Similar flat-surface discipline on dark canvas, compact UI typography, and pill-shaped primary actions — though Linear uses gradient accents where Spellbook uses a single coral
- **Attio** — Shared dark-mode product UI craft with generous spacing, hairline borders, and editorial-grade typography choices
- **Ironclad** — Same legal-tech category with dark premium positioning, though Ironclad leans lighter and more product-photography driven
