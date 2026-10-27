# Workable — Style Reference
> warm newsroom with teal ink

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Workable uses a warm, editorial HR-platform language: off-white canvas with deep-ink typography and a single confident teal-green that doubles as the primary action and brand voice. Soft pastel cards (lavender, peach, butter, sky) create section-level color rhythm instead of flat gray alternation, giving every band a quiet identity without competing with copy. Typography is heavy at display sizes (700 weight, tight 1.14 line-height) and relaxes to a comfortable 400/1.56 for body — a clear editorial hierarchy that reads as confident rather than decorative. The teal CTA is the only saturated action color on the page; everything else is surface, illustration, or chrome, so buttons always feel switched on against the warm neutral field.

## Colors

| Name | Value | Role |
|------|-------|------|
| Workable Ink | `#0f161e` | Headlines, body copy, icon fills, dark UI surfaces — near-black with a blue-ink undertone, softer than pure black |
| Page Canvas | `#fbfaf8` | Default page background and warm card surface — slightly cream-tinted off-white that gives the whole site a paper-like warmth |
| Pure White | `#ffffff` | Elevated card surfaces on warm canvas, nav background — true white used sparingly for crisp product panels against the cream page |
| Body Graphite | `#3d3e45` | Body paragraph text, secondary link color — softened dark gray for readable prose without the weight of ink-black |
| Muted Slate | `#6f7073` | Eyebrow labels, helper text, metadata — medium gray for de-emphasized copy like section kickers and timestamps |
| Hairline Gray | `#efefef` | Disabled button background, subtle dividers — the lightest neutral surface |
| Forest Teal | `#004038` | Teal text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Midnight Violet | `#1d0953` | Secondary action (Check it out pill), stat callout headings — deep indigo-violet used sparingly for the announcement bar and number highlights |
| Lavender Wash | `#e5d3f7` | Soft feature card background — pastel lavender for the most prominent colored card surface, gives sections a calm purple identity |
| Peach Cream | `#fef1e1` | Section background wash, hero-adjacent panels — warm peach-cream used as a large surface band, the dominant chromatic neutral |
| Butter Yellow | `#fde8ce` | Card background for warm-themed feature panels — muted butter for secondary colored cards |
| Periwinkle | `#c6c4f4` | Violet wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |
| Sky Tint | `#bee9f4` | Cool-tone card background — pale sky blue for variety in the pastel card rotation |
| Agent Spectrum | `linear-gradient(90deg, rgb(0,245,220), rgb(213,255,77) 48.5%, rgb(192,135,255))` | Gradient brand accent for the AI agent visual identity — the mint→lime→violet spectrum used in product illustration and the Workable 'w' logo glow |

## Typography

### Proxima Nova — Single sans family carries all UI — bold 700 at 56–72px with tight 1.14 line-height creates editorial display weight, while 400 at 18–20px with 1.56–1.67 line-height keeps body comfortable. The Minor Third scale (1.2 ratio, 16px base) produces a restrained 8-step hierarchy.
- **Substitute:** Source Sans 3 or Nunito Sans (both share Proxima Nova's humanist warmth with similar x-height and weight contrast)
- **Weights:** 400, 700
- **Sizes:** 12, 16, 18, 20, 24, 32, 56, 72
- **Line height:** 1.0–1.67

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.67 | — |
| body-sm | — | — | 16px | 1.38 | — |
| body | — | — | 18px | 1.56 | — |
| subheading | — | — | 20px | 1.2 | — |
| heading-sm | — | — | 24px | 1.5 | — |
| heading | — | — | 32px | 1.13 | — |
| heading-lg | — | — | 56px | 1.14 | — |
| display | — | — | 72px | 1.22 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 32px
- **Element gap:** 8px

### Border Radius

- **cards:** 16px
- **pills:** 16px
- **images:** 16px
- **buttons:** 8px

## Components

### Primary Teal CTA (Filled)
**Role:** Main conversion button — Request a demo

Fill #004038 Forest Teal, white text, 8px radius, 16px vertical / 16px horizontal padding, Proxima Nova 700 at 16px. White text on deep teal creates the strongest contrast pair on the page (AAA). This is the dominant action — always filled, never outlined.

### Ghost Outline Button
**Role:** Secondary action — Start a free trial, Log in

Transparent fill, #004038 teal text, 1px #004038 border, 8px radius, 16px×16px padding. Outlined variant of the primary action for lower-emphasis CTAs in the nav bar and hero.

### Underline Link Button
**Role:** Tertiary action — Start a free trial (text link variant)

No fill, no border, 0px radius, 32px left padding for arrow icon. #0f161 ink text with right-arrow glyph. Used for inline hero CTAs that don't need button chrome.

### Midnight Pill (Announcement)
**Role:** Top-bar release announcement — Check it out

Fill #1d0953 Midnight Violet, white text, 8px radius, 16px×16px padding. Used exclusively in the lavender announcement bar. The only violet action — pairs with lavender pill background.

### White Product Card
**Role:** Feature showcase card on white canvas

Fill #ffffff, 16px radius, 32px padding all sides, no shadow, 1px hairline border optional. The default card surface — pure white against the warm #fbfaf8 page canvas provides the cleanest product preview panels.

### Lavender Feature Card
**Role:** Pastel card for AI/agent feature blocks

Fill #e5d3f7, 16px radius, 32px padding, no shadow. The signature pastel card — paired with midnight-violet headings for the AI agent sections.

### Peach Feature Card
**Role:** Warm-tone card for evaluation/HR feature blocks

Fill #fef1e1, 16px radius, 32px padding, no shadow. Used for warm-themed feature groupings like evaluation tools.

### Butter Feature Card
**Role:** Secondary warm card

Fill #fde8ce, 16px radius, 32px padding, no shadow. Lighter variant of peach for variety in card rotations.

### Top Navigation Bar
**Role:** Sticky header with brand wordmark and primary actions

Transparent or white background, Workable 'w' wordmark in #004038, nav links in #004038, right-aligned Log in (text), Start a free trial (ghost outline), Request a demo (filled teal). Sticky on scroll.

### Announcement Banner
**Role:** Lavender pill above nav for product news

Full-width #e5d3f7 lavender band, centered content with brand icon, announcement text, and a #1d0953 filled 'Check it out' pill button, dismiss '×' on the right.

### Section Eyebrow Label
**Role:** Kicker text above section headings

All-caps Proxima Nova 400 at 12–16px in #6f7073 Muted Slate, 8px margin-bottom before heading. Examples: 'MEET THE WORKABLE AGENT', 'A TALENT MANAGEMENT PLATFORM FOR AN AGENTIC WORLD'.

### Hero Product Visual
**Role:** Right-side product screenshot with gradient framing

Product UI screenshot with rounded 16px corners, framed by the teal→lime→violet gradient glow on the Workable app icon. The icon is a 16px-radius squircle with the spectrum gradient.

### Client Logo Strip
**Role:** Social proof band — trusted companies

Horizontal marquee of monochrome gray (#6f7073 or faded) client logos on warm cream background, logos-carousel animation scrolls continuously. Logos are low-prominence — never compete with the wordmark.

### Play Button (Video CTA)
**Role:** Watch demo trigger

Ghost outline button with #004038 border, 8px radius, circular play icon in dark teal inside. Used for 'See Workable Agent in action' — combines outline chrome with a filled icon.

## Do's and Don'ts

### Do
- Use #004038 Forest Teal as the only filled CTA color — buttons are either teal-filled (primary) or teal-outlined (ghost), never a third color
- Set card border-radius to 16px and button border-radius to 8px consistently — the 8px difference is intentional, cards feel soft, buttons feel crisp
- Apply the warm #fbfaf8 canvas to all section backgrounds and let #ffffff cards float on top — the cream-to-white surface contrast creates depth without shadows
- Use display weight 700 at 56–72px with tight 1.14–1.22 line-height for headlines — heavy weight + tight leading is the editorial signature
- Set body copy at 18px with 1.56 line-height in #3d3e45 Body Graphite — never use #0f161 ink for long-form paragraphs, the contrast is too aggressive
- Rotate pastel cards through #e5d3f7, #fef1e1, #fde8ce, #c6c4f4, #bee9f4 within a grid — the pastel rotation signals feature grouping without needing borders
- Use 12px all-caps #6f7073 Muted Slate for section eyebrow labels with 8px margin to the heading below

### Don't
- Don't add drop shadows to cards or buttons — the system is intentionally flat, depth comes from surface color contrast only
- Don't use #1d0953 Midnight Violet as a general CTA — it's reserved for the announcement bar pill and number callouts, not buttons
- Don't apply the teal→lime→violet gradient to buttons, backgrounds, or text — it's only for the Workable 'w' app icon and AI-agent visuals
- Don't use #0f161 ink for body paragraphs — reserve it for headlines, icons, and UI chrome; use #3d3e45 for readable prose
- Don't introduce additional saturated accent colors — the system is built on teal + pastel rotation; adding a new hue breaks the restrained palette
- Don't use sharp 0px or 4px radius on cards — the 16px softness is a signature, all elevated surfaces should feel rounded
- Don't set body line-height below 1.5 — the generous 1.56 line-height at 18px is what makes the dense type feel airy

## Elevation

Workable deliberately avoids shadows — every card is flat with a 16px radius and no drop shadow. Depth comes from surface color contrast (white card on cream canvas, pastel cards on cream) rather than elevation. This keeps the design feeling light and editorial rather than heavy or product-app-like.

## Surfaces

- **Page Canvas** (`#fbfaf8`) — Warm off-white default background for all sections — gives the entire site its paper-like warmth
- **White Card** (`#ffffff`) — Elevated product surfaces and feature cards — true white for crispest contrast against the cream canvas
- **Lavender Surface** (`#e5d3f7`) — AI/agent-themed section backgrounds and announcement bar
- **Peach Surface** (`#fef1e1`) — Warm HR/evaluation-themed section backgrounds
- **Butter Surface** (`#fde8ce`) — Secondary warm card surface for visual variety

## Imagery

Imagery is dominated by product UI screenshots framed as floating panels — the ATS interface, candidate profile cards, mobile screens — with 16px rounded corners. The Workable 'w' app icon appears as a glowing squircle filled with the teal→lime→violet gradient. Photography is minimal: only human avatars in product screenshots (small circular crops). Illustrations are absent — the gradient on the app icon is the brand's only graphical flourish. Client logos appear as monochrome gray marks in a scrolling marquee for social proof. Overall image density is low: product UI shots carry the visual weight, text and whitespace dominate the layout.

## Layout

Full-bleed page with centered max-width ~1200px content container. Hero is asymmetric: text-left / product-visual-right split, with headline at 56px on the left and a rounded product UI screenshot on the right. Section rhythm alternates between cream canvas (#fbfaf8) and white panels, with occasional pastel (lavender, peach) section bands that signal a new content area. Centered stacked layouts for section headlines with single-column body copy below. Feature grids are 2-column or 3-column card rows with 32px gaps. Logo strip is a full-width marquee band separating sections. Navigation is a sticky top bar with brand wordmark left, links center, and dual CTAs right (ghost outline + filled teal). The announcement banner sits above the nav as a separate lavender band.

## Similar Brands

- **Greenhouse** — Same warm-cream page canvas, bold sans-serif headlines at 56px+, flat pastel feature cards with 16px radius, and a single chromatic CTA color that acts as the only saturated element on an otherwise achromatic page
- **Lever** — Similar editorial layout — large confident display headlines, asymmetric hero splits, product UI screenshots as right-side visuals, and a restrained pastel card palette for feature sections
- **Ashby** — Same shadowless flat aesthetic with heavy-weight display type (700 at 56px), warm off-white canvas, and feature cards distinguished by soft pastel fills rather than borders or elevation
- **Notion** — Same approach of single-brand-color saturation against warm neutrals, 16px card radius, and the avoidance of drop shadows in favor of surface color contrast for depth
