# Patch — Style Reference
> electric blueprint on drafting paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Patch uses a loud, electric-blue blueprint aesthetic: a vivid indigo canvas (#1f00ff) alternates with stark white cards, and every interface element either lives inside a crisp hairline border or against the full-bleed blue. Typography is aggressive and condensed — PP Right at weight 800 with sub-1.0 line heights makes headlines feel architectural rather than friendly, while Archivo keeps body text quiet and functional. A single warm orange (#ff622b) punctures the blue/white duopoly as the only fill color used for primary actions. Hand-drawn line illustrations (sketchy people, objects) sit centered inside white cards, reinforcing a 'marketing blueprint' mood. The overall feel is a confident, slightly retro-tech agency identity — medical marketing pitched as engineering, not healthcare.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Indigo | `#1f00ff` | Full-bleed hero canvas, section backgrounds, heading text on light surfaces, all primary borders and dividers — the single chromatic color that defines the entire system |
| Patch Orange | `#ff622b` | Filled CTA buttons and active nav markers — the only warm color, reserved exclusively for conversion moments |
| Pure White | `#ffffff` | Page canvas, hero reverse text, card surfaces, icon fills — the neutral that makes the indigo vibrate |
| Fog Gray | `#f2f2f2` | Secondary card surfaces, subtle elevation between cards and canvas |
| Bone | `#f8f8f8` | Tertiary card backgrounds, muted surface layer |
| Mist | `#ececec` | Input backgrounds, hairline borders on light sections, disabled states |
| Gridline | `#d3d3d3` | Major section dividers, muted heading accents, structural borders on the blue canvas |
| Ink | `#212121` | Primary body text, dark card backgrounds, button borders — near-black with a slight warmth |

## Typography

### PP Right — All display headings, hero text, section titles, and the bold '01' section markers. The tight sub-1.0 line height at 800-weight is the signature — headlines stack like concrete blocks, not flowing prose. Substitute: Bebas Neue for similar industrial condensed feel, or Anton for heavier display weight
- **Weights:** 400, 800
- **Sizes:** 12, 13, 14, 19, 21, 24, 29, 33, 38, 48, 62, 67, 90, 95, 133, 152, 200
- **Line height:** 0.79–1.20 for display, 1.57–2.00 for small
- **Letter spacing:** 0.02–0.05em across all sizes, consistent moderate tracking
- **OpenType features:** `"ss01" on (if available in substitute) for alternate character forms`

### Archivo — Body copy, navigation, buttons, footer text, captions, form inputs. Weight 300 for subtle secondary text, 400 for body, 600 for small uppercase labels and nav. The low x-height and geometric forms keep it quiet against PP Right's display dominance
- **Substitute:** Inter or DM Sans as drop-in alternatives
- **Weights:** 300, 400, 600
- **Sizes:** 10, 11, 13, 14, 17, 19, 23, 24, 29, 38
- **Line height:** 1.00–2.00
- **Letter spacing:** 0.0100em, 0.0200em, 0.0310em, 0.0500em, 0.1000em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 17px | 1.4 | — |
| subheading | — | — | 24px | 1.2 | — |
| heading-sm | — | — | 38px | 0.94 | — |
| heading | — | — | 62px | 0.9 | — |
| heading-lg | — | — | 90px | 0.86 | — |
| display | — | — | 133px | 0.85 | — |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24-38px
- **Element gap:** 11-24px

### Border Radius

- **cards:** 5px
- **inputs:** 5px
- **buttons:** 5px
- **navTabs:** 5px

## Components

### Full-Bleed Hero Section
**Role:** Opening viewport with maximum brand impact

Background #1f00ff covering full viewport. Headline in PP Right 800 at 90–133px, line-height 0.85, color #ffffff, uppercase. Optional faint gridline overlay using #d3d3d3 at 20% opacity. White sketch illustration centered below headline in a #ffffff card with 5px radius and 1px #1f00ff border.

### Filled Orange CTA Button
**Role:** Primary conversion action — only filled button in the system

Background #ff622b, text #ffffff in Archivo 600 uppercase at 13–14px, letter-spacing 0.03em. Padding 10px 24px. Radius 5px. No shadow. Hover deepens to #e54f1f. This is the ONLY filled chromatic button — every other interactive element is outlined or text.

### Ghost White CTA Button
**Role:** Secondary action on the indigo hero

Transparent background, 1px #ffffff border, text #ffffff in Archivo 600 uppercase at 13px. Padding 10px 24px. Radius 5px. Sits on the #1f00ff hero canvas.

### Tabbed Navigation Toggle
**Role:** Mode switcher in the header (Patch OG / Patch AI)

Container: 1px #ffffff border, 5px radius, transparent fill on #1f00ff canvas. Two equal-width tabs. Active tab: #ffffff background, #1f00ff text. Inactive tab: transparent, #ffffff text. PP Right or Archivo 600 at 13px uppercase.

### Numbered Section Header
**Role:** Section markers and in-content anchors

Two-digit number (01, 02, 03…) in PP Right 800 at ~29px, color #1f00ff on light sections, #ffffff on indigo sections. Often placed in a small bordered box (1px border, 5px radius) or as a standalone element with a 01–04 progression. Paired with a heading in the same or larger PP Right weight.

### White Illustration Card
**Role:** Showcase container for sketch-style artwork

Background #ffffff, 1px #1f00ff border, 5px radius, padding ~24–38px. Contains a centered black-line sketch illustration (no fill, 1–2px stroke). Sits on either the #1f00ff hero canvas or a #f2f2f2 surface.

### Pricing Tier Card
**Role:** Service plan comparison — Beginner, Intermediate, Advanced

Background #ffffff, 1px #d3d3d3 border, 5px radius. Tier name in PP Right 800 at 24–29px uppercase, color #1f00ff. Commitment text in Archivo 400 at 14px, color #212121. Contains a filled orange INQUIRE button. Three cards arranged in a 3-column grid on a #f2f2f2 surface.

### Promise Sidebar
**Role:** Sticky left-column note on scrolled content

1px #1f00ff border, 5px radius, padding 17px. Title in Archivo 600 uppercase at 13px, color #1f00ff. Body in Archivo 400 at 14px. Two small icon buttons (camera, smile) in the top-right corner of the card.

### Feature List Row
**Role:** Numbered capability list with hover state

Each row: 1px #d3d3d3 left/top border, padding 14–17px vertical. Small '01'–'04' marker in a bordered square. Heading in PP Right 800 uppercase, 24–38px. Inactive rows show heading in #d3d3d3 (muted). Active/hovered row: heading in #1f00ff, border in #1f00ff. Transition is instant — no animation.

### Square Corner Marker
**Role:** Decorative section corner indicator with number

Small square (~40–50px) with 1px #1f00ff border on light sections, #ffffff border on indigo sections. Contains a two-digit number in PP Right 800. Positioned absolutely in the top-right of sections as a structural anchor.

### Input Field
**Role:** Form input on light surfaces

Background #ffffff, 1px #ececec border, 5px radius. Padding 11px vertical, 14px horizontal. Text in Archivo 400 at 14px, color #212121. Placeholder in #d3d3d3. Focus ring: 1px #1f00ff.

### Social Proof Icon Cluster
**Role:** Footer/hero trust indicators

Small 32–40px square icons with 1px #1f00ff border, 5px radius, white background. Black glyph or letter inside. Arranged horizontally with 5–10px gap.

## Do's and Don'ts

### Do
- Use #1f00ff as the dominant chromatic — backgrounds, borders, headings, links. It should appear in nearly every section.
- Use PP Right 800 with line-height 0.85–0.94 for all display headings. Never set PP Right body copy at body sizes — it's a display face only.
- Use #ff622b exclusively for filled CTA buttons. No other element should use a filled chromatic background.
- Use 1px borders in #1f00ff (on light) or #ffffff (on indigo) to define all card and button edges. Shadows are absent — borders carry the structural weight.
- Use 5px border-radius consistently across buttons, cards, inputs, and tabs. Do not introduce larger or smaller radii.
- Pair every section with a two-digit square corner marker (01, 02, 03…) as a structural anchor.
- Use Archivo 400 for body, 300 for secondary muted text, 600 for uppercase labels and buttons.

### Don't
- Do not use filled blue (#1f00ff) buttons — the CTA is always orange. Blue is for canvas and borders only.
- Do not set PP Right body text below 21px — its tight tracking and heavy forms become illegible at small sizes.
- Do not add drop shadows. The system uses borders, not elevation, to define surfaces.
- Do not introduce colors outside the indigo/orange/white/grayscale palette. No greens, purples, or pastels.
- Do not use rounded corners beyond 5px. The slightly sharp radius is part of the blueprint/architectural feel.
- Do not use light or thin weights (100–200) for any text — the system lives at 300/400/600/800 only.
- Do not center body text. Headlines can center; body copy and feature descriptions are always left-aligned.

## Surfaces

- **Canvas** (`#ffffff`) — Default page background on light sections
- **Bone Card** (`#f8f8f8`) — Subtle card elevation on light sections
- **Fog Card** (`#f2f2f2`) — Secondary card surface, pricing tier containers
- **Indigo Field** (`#1f00ff`) — Full-bleed hero, alternating dark sections, blueprint canvas
- **Ink Plate** (`#212121`) — Dark-mode cards or inverted sections if introduced

## Imagery

Hand-drawn black-line sketch illustrations are the sole visual content — no photography, no 3D, no gradients. Illustrations are flat, single-weight line art (1–2px stroke), often depicting people in casual poses (walking, standing), objects (magnifying glass, net, baseball cap), or abstract symbols. They sit centered inside white cards with 1px indigo borders, always on either the full-bleed indigo hero or a light gray section. The sketch style is intentionally loose and human — it softens the aggressive blue typography and signals approachability. Icons throughout the site are small, square, bordered containers with simple black glyphs. No image-heavy sections, no lifestyle photography, no product screenshots.

## Layout

Full-bleed alternating sections: the hero is a 100vw indigo field, then sections alternate between #ffffff and #f2f2f2 light bands, with occasional return to full-bleed #1f00ff. Content is max-width ~1200px centered. The hero is a single full-screen statement with centered headline and illustration. Feature sections use a 2-column layout — a sticky left sidebar (the Promise card) and a right content column with numbered list rows. Pricing uses a 3-column card grid. A 2-column split (text-left, illustration-right or vice versa) appears in mid-page sections. Vertical rhythm is spacious with ~80px between major sections. Navigation is a simple top bar with logo left, tabbed toggle center, and orange CTA right. The gridline pattern on the indigo background creates a subtle drafting-paper texture without using actual grid images.

## Similar Brands

- **Linear** — Same aggressive condensed display type paired with a single vivid accent color and hairline-border component style
- **Vercel** — Full-bleed dark/light section alternation, tight line-height display headings, and a minimal palette with one strong accent
- **Frame.io** — Bold display typography with near-1.0 line heights, numbered section markers, and a blueprint-style structural grid
- **Cargo (agency site)** — Sketch illustration aesthetic, bordered white cards on saturated color fields, and a single warm CTA accent
