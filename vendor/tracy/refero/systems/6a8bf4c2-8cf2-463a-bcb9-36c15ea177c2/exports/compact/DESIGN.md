# Hashnode — Style Reference
> Editorial newsroom on a gray runway — a clean monochrome feed where one electric blue accent carries all the energy.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Hashnode presents an editorial newsroom aesthetic: a near-monochrome canvas of warm-cool grays where the only chromatic element is a single electric blueprint blue that does all the talking. Typography is uniformly Suisse Intl, a humanist grotesque with tight negative tracking, giving headlines a confident, typeset-in-a-publication feel rather than a dashboard utilitarian one. Surfaces are flat with hairline borders instead of shadows — the interface trusts typography and whitespace to create hierarchy, not elevation. Components feel like cards laid out on a magazine spread: rounded but not pillowy, compact but breathable, with a two-column card grid that reads like a homepage feed. Color appears sparingly as functional punctuation — links, a single CTA fill, badges — never as decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Blueprint Blue | `#1d52de` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ink Black | `#16191c` | Primary body text, headings, icon strokes — the dominant ink |
| Carbon | `#1c2024` | Secondary heading text and high-emphasis icon fills where a subtle warmth is desired over pure ink |
| Slate | `#7b8187` | Muted metadata, helper text, placeholder text, secondary icons, timestamps, vote/comment counts |
| Fog | `#d1d4d9` | Hairline borders, card outlines, dividers, subtle separator strokes — the structural gray that defines every card edge |
| Paper | `#f4f5f7` | Subtle surface tint behind nested elements, hover states, and tag/chip backgrounds |
| Stone | `#e6e8eb` | Mid-surface layer for inset panels and elevated cards between Paper and Fog |
| Canvas | `#f9fafb` | Page background, primary card surface — the base on which everything sits |
| Mint | `#00bc7d` | Green supporting accent for decorative details and low-frequency emphasis |

## Typography

### suisseIntl — suisseIntl — detected in extracted data but not described by AI
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 30px
- **Line height:** 1, 1.33, 1.38, 1.43, 1.5, 1.56, 1.63
- **Letter spacing:** -0.025, 0.05, 0.1
- **OpenType features:** `"calt", "kern", "liga", "ss01"`

### Suisse Int'l — Sole text family for everything: body, headings, nav, buttons, links. Tight -0.025em tracking on larger sizes creates a confident editorial feel; the 0.05em and 0.10em tracking on smaller sizes mark small caps and category labels. Weight 500–600 is the workhorse range; 700 is reserved for the largest hero headline (30px). The 'ss01' stylistic set is active and shapes the typeface's distinctive flavor — a designer should never opt out of it.
- **Substitute:** Inter (close), General Sans, or DM Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 30px
- **Line height:** 1.00–1.63
- **Letter spacing:** -0.025em at 30px; normal at body sizes; 0.05em–0.10em for uppercase labels
- **OpenType features:** `"calt" on, "kern" on, "liga" on, "ss01" on`

### Font Awesome 7 Jelly / Pro — Icon system — Jelly for soft-filled illustrated icons, Pro for sharp utility icons. Icons align to text-baseline and inherit color from the surrounding text level (Ink for primary, Slate for secondary).
- **Substitute:** Lucide or Phosphor for similar outlined density
- **Weights:** 400, 900
- **Sizes:** 12px, 14px, 16px, 18px, 20px
- **Line height:** 1.00

### Suisse Mono — Tiny uppercase monospace for micro-labels and badge pills where monospaced character spacing signals 'system/metadata' — extremely rare, used as a typographic accent only
- **Substitute:** JetBrains Mono Bold or IBM Plex Mono SemiBold at 10px
- **Weights:** 600
- **Sizes:** 10px
- **Line height:** 1.43

### Font Awesome 7 Pro — Font Awesome 7 Pro — detected in extracted data but not described by AI
- **Weights:** 400, 900
- **Sizes:** 12px, 14px, 18px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 18px | 1.38 | 0px |
| heading-sm | — | — | 20px | 1.33 | 0px |
| heading | — | — | 30px | 1.2 | -0.75px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **tags:** 10px
- **cards:** 14px
- **inputs:** 10px
- **buttons:** 10px
- **heroPanel:** 18px

## Components

### Primary CTA Button
**Role:** The sole filled action in the system

Background #1d52de, white text, 10px radius, 8px 16px padding, Suisse Intl weight 600 at 14px. No border, no shadow. Hovers shift to a slightly darker blue (approx #1741b0). Used at most once per viewport — this button must feel like a deliberate action, not a default decoration.

### Ghost Navigation Button
**Role:** Sidebar nav item (Home, Blogs, Bookmarks, Forums, etc.)

Transparent background, #16191c text at 14px weight 500, 10px radius, 8px 12px padding. Active state gets #f4f5f7 background and #1d52de left border indicator (2–3px). Icons are 18px Font Awesome Pro, color matching text.

### Blog Post Card
**Role:** Feed item in the two-column post grid

Canvas (#f9fafb) background, 1px #d1d4d9 border, 14px radius, 16px padding. Internal layout: 48px square thumbnail on the left, right column with author name (12px Slate) + timestamp, then headline at 18px weight 600 #16191c, then small interaction chips below (upvote count, comment count) in #7b8187 12px. No shadow, no hover lift — only a subtle background tint on hover.

### Hero Panel
**Role:** Large welcome area at the top of the feed

Full-width inside main column, 18px radius, 1px #d1d4d9 border, Canvas background. Two-column inner layout: left text block (30px weight 700 headline with -0.75px tracking, 16px body in Slate, single blue CTA), right illustration area. No background gradient — the illustration is the color.

### Vote / Comment Chip
**Role:** Inline interaction count on post cards

No background, 12px Slate text with a small leading icon at 12px. 4px gap between icon and number. Optional hover: text shifts to #16191c.

### Category Tag / Badge
**Role:** Small inline label (e.g. 'NEW & POPULAR')

Transparent or Paper background, 10px radius, 6px 10px padding, 12px Suisse Intl weight 500. Text color matches the section's accent — #1d52de for active/featured labels, Slate for neutral labels. A tiny leading dot (4px) in the same color precedes the text.

### Author Avatar + Name Row
**Role:** Identity line above card headlines

32px circular avatar (or 4px fallback initial square with Fog border), 8px gap, then author name at 12px weight 500 #16191c followed by '·' separator and timestamp in Slate. Tightly horizontal — no wrapping.

### Search Input
**Role:** Command-K style search field in sidebar

Paper (#f4f5f7) background, 1px #d1d4d9 border, 10px radius, 8px 12px padding. 14px placeholder in Slate. No focus ring — focus swaps background to Canvas and border to a slightly darker Fog for a quiet state change.

### Sidebar Container
**Role:** Left persistent navigation rail

Full-height, 240–280px wide, Stone (#e6e8eb) or Canvas background with a 1px #d1d4d9 right border. Logo at top, primary nav, author profile section, then 'WHAT'S NEW' announcement block and footer links at bottom.

### Announcement Card
**Role:** 'What's New' callout in sidebar

Canvas background, 1px #d1d4d9 border, 14px radius, 16px padding. Title at 14px weight 600 #16191c, body at 12px Slate. The '×' close button is 16px Ink at top-right.

### Sign-In Button
**Role:** Auth action in sidebar

Filled #1d52de, white text, 10px radius, 8px padding, 14px weight 600 — same treatment as primary CTA but full-width within sidebar.

### Post Card Thumbnail
**Role:** Visual preview on feed cards

48–64px square or 4:3 rectangle, 8px or 10px radius, 1px #d1d4d9 border to prevent image bleed, object-fit cover.

## Do's and Don'ts

### Do
- Use #1d52de for exactly one primary CTA per viewport — never two filled blue buttons competing for attention.
- Set all card and button radii to 10px, hero panels to 18px, and feed cards to 14px — these three values are the entire radius vocabulary.
- Apply 'ss01', 'calt', 'kern', 'liga' font features on every Suisse Intl instance — disabling ss01 visibly changes the typeface's character.
- Use hairline 1px #d1d4d9 borders for separation; never reach for a drop shadow when a border does the job.
- Keep body text at 16px with 1.5 line-height and headings at 18/20/30px — do not invent intermediate sizes between the 20 and 30 steps.
- Limit Slate (#7b8187) to metadata, timestamps, and vote counts — never use it for body copy or headings.
- Match icon color to its adjacent text color (Ink for primary, Slate for secondary) — icons are never an independent color.

### Don't
- Do not introduce a second accent color — the entire system speaks with one blue voice.
- Do not add drop shadows to cards, buttons, or panels — the inset 1px border (oklab 0 0 0 / 0.1) is the only shadow permitted.
- Do not use white (#ffffff) as a surface — Canvas is #f9fafb, which gives the interface a paper-like warmth.
- Do not set body text below 14px or above 18px — the 16px body with 14px secondary is the readable core.
- Do not use weight 700 for body or subheadings — reserve 700 for the 30px display headline only.
- Do not use Pill (9999px) radius on anything — the system is rounded-rect, not pill-shaped.
- Do not place gradient fills on cards, buttons, or hero backgrounds — color is flat throughout.

## Elevation

The system deliberately avoids drop shadows in favor of 1px hairline borders in Fog (#d1d4d9) for all component separation. The only shadow permitted is an inset 1px stroke (oklab(0 0 0 / 0.1) 0 0 0 1px inset) for inputs that need a subtle pressed-in feel. This keeps every card, button, and panel reading as flat type on flat paper — the interface trusts typography and whitespace, not depth, to establish hierarchy.

## Surfaces

- **Canvas** (`#f9fafb`) — Page background, main feed surface
- **Paper** (`#f4f5f7`) — Subtle hover states, nested chip backgrounds
- **Stone** (`#e6e8eb`) — Inset panels, sidebar background tints
- **Fog** (`#d1d4d9`) — Border / hairline separator — not a fill

## Imagery

Imagery is editorial and restrained. The hero features a single flat illustration (hands at a typewriter on a mustard-and-mint palette) that carries all the visual warmth of the page — no photographs, no gradients, no decorative noise. Post card thumbnails are 4:3 or 1:1 crops of content imagery (screenshots, book covers, diagrams) with 8–10px radius and a 1px Fog border. No lifestyle photography, no team shots, no abstract gradient backgrounds. The visual rule: if the image is a post thumbnail, it must look like editorial content, not decoration.

## Layout

Persistent two-column shell: a 240–280px fixed left sidebar containing logo, primary nav, author profile, and announcement blocks, paired with a fluid main content column. The main column is a max-width 1200px centered feed that begins with a full-width hero panel (18px radius, two-column internal split: text left, illustration right), then a 'NEW & POPULAR' section header, then a two-column responsive grid of blog post cards. Section gaps are 48px; element gaps within cards are 8px. The sidebar uses a Stone (#e6e8eb) tint or Canvas with a 1px right border. Navigation is sidebar-based, not top-bar — a deliberate editorial choice that signals 'this is a reading environment, not a dashboard.'

## Similar Brands

- **Dev.to** — Same editorial-feed layout with a left sidebar and two-column card grid, though Dev.to leans more colorful in its accents
- **Medium** — Same calm reading-first aesthetic, similar hairline-border card treatment, and restrained use of a single brand color for CTAs
- **Substack** — Same monochrome newsroom palette with a single accent, same trust-in-typography-over-decoration philosophy
- **Vercel Dashboard** — Same flat-surface, hairline-border, single-accent approach — though Vercel pairs it with a darker theme
- **Linear** — Same commitment to one strong blue accent against an achromatic system, same tight type tracking and rounded-rect components
