# Clerk — Style Reference
> Developer dashboard behind frosted violet glass — surfaces feel like a live IDE preview: dark product cards floating inside a light documentation shell, with one electric violet pulse marking the path forward.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Clerk uses a split-personality canvas: the marketing shell is near-white (#f7f7f8) with barely-there borders and generous whitespace, while product demo surfaces drop into near-black (#212126) dark cards that showcase UI components in context. The single brand color — a mid-range violet (#6c47ff) — appears with surgical restraint: only on primary CTAs and the occasional heading accent, making every appearance feel deliberate. Typography defaults to Geist, a custom numeric-optimized face at tight negative tracking (-0.035em), giving headlines a technical density that signals developer-first thinking without heavy weight. The gradient system layers violet with stray yellow (#fff963) and cyan (#5de3ff) halos at low opacity, creating an atmospheric shimmer behind hero content rather than decorative noise.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#131316` | Primary text, headings, and high-contrast body copy across light surfaces |
| Fog White | `#f7f7f8` | Page canvas and light section backgrounds |
| Pure White | `#ffffff` | Card surfaces, modal backgrounds, form inputs on light sections |
| Graphite | `#5e5f6e` | Secondary body text, muted labels, icon fills on light surfaces |
| Ash | `#747686` | Tertiary text, nav punctuation, disabled state text |
| Hairline | `#d9d9de` | Borders, dividers, input outlines, table rules |
| Mist | `#eeeef0` | Subtle section dividers, link icon backgrounds, hover wash backgrounds |
| Stone | `#9394a1` | Placeholder text, code comments, muted helper copy |
| Obsidian Card | `#212126` | Dark product demo card backgrounds in mixed-mode sections |
| Dark Surface | `#2f3037` | Elevated dark panel backgrounds, code block surfaces |
| Slate Mid | `#696a78` | Mid-tone icon fills and body copy inside dark card contexts |
| Electric Violet | `radial-gradient(189.26% 126.1% at 49.27% 0%, rgba(108, 71, 255, 0) 10%, rgba(255, 249, 99, 0.15) 34%, rgba(98, 72, 246, 0.24) 67.53%, rgba(98, 72, 246, 0) 95.38%)` | Primary CTA button fill, active heading accents — the single chromatic action color; its mid-spectrum violet reads developer-brand without borrowing blue from infrastructure tools; Atmospheric hero background gradient blending violet and yellow; Brand gradient for decorative text highlights and horizontal accent rules |
| Violet Soft | `#615cf6` | Decorative list and tag backgrounds, subtle brand surface tints |
| Cyan Spark | `#5de3ff` | Heading accent text inside dark sections, code string highlights, decorative icon glow |

## Typography

### soehneMono — soehneMono — detected in extracted data but not described by AI
- **Weights:** 400, 500, 600
- **Sizes:** 10px, 11px, 12px
- **Line height:** 1.33, 1.4, 1.45, 1.64, 1.82, 2
- **Letter spacing:** 0.1

### Geist — Primary typeface for all marketing copy, UI labels, headings, and CTAs. The custom numeric tables (geistNumbers variant) keep digit spacing consistent inside product demos. Negative tracking at -0.035em at large sizes and -0.015em at mid sizes compresses display headlines into a dense technical block — a deliberate contrast to softer marketing type.
- **Substitute:** Inter, DM Sans
- **Weights:** 400, 450, 500, 600, 700
- **Sizes:** 10px, 11px, 12px, 13px, 15px, 16px, 18px, 20px, 32px, 64px
- **Line height:** 1.0–1.85 depending on size; tighter (1.0–1.25) at display sizes, looser (1.4–1.6) at body sizes
- **Letter spacing:** -0.035em at display/headline sizes, -0.015em at subheading sizes
- **OpenType features:** `"tnum" for numeric variant`

### ui-sans-serif — System fallback font used in browser-rendered components, OS UI widgets, and the Clerk-embedded auth modal. Its presence signals authentic native-UI feel in interactive demos.
- **Substitute:** system-ui, -apple-system
- **Weights:** 400, 500, 700
- **Sizes:** 10px, 11px, 12px, 13px, 16px, 17px
- **Line height:** 1.27–1.82
- **Letter spacing:** -0.01em to +0.01em

### Inter — UI micro-labels, product card annotations, and icon captions within embedded component previews.
- **Substitute:** Inter (same, freely available via Google Fonts)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 8px, 10px, 11px, 12px, 16px, 18px, 22px
- **Line height:** 1.22–1.82
- **Letter spacing:** normal

### Söhne Mono — Code snippets, JSX component labels (<SignUp />, <UserButton />), and terminal output. The +0.10em positive tracking at mono sizes makes angle-bracket syntax air out instead of colliding — a purposeful readability choice at 10-12px.
- **Substitute:** JetBrains Mono, Fira Code
- **Weights:** 400, 500, 600
- **Sizes:** 10px, 11px, 12px
- **Line height:** 1.33–2.00
- **Letter spacing:** +0.10em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.4 | 0px |
| heading-sm | — | — | 18px | 1.4 | -0.27px |
| heading | — | — | 20px | 1.25 | -0.3px |
| heading-lg | — | — | 32px | 1.13 | -1.12px |
| display | — | — | 64px | 1 | -2.24px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 16px
- **badges:** 9999px
- **inputs:** 6px
- **modals:** 16px
- **buttons:** 6px
- **cardSmall:** 8px
- **codeBlocks:** 12px

## Components

### Primary Violet Button
**Role:** Main CTA — 'Start building for free', 'Start building'

Background #6c47ff, white text (#ffffff), 6px border-radius, 0px vertical padding with 12px horizontal padding. Box-shadow uses violet glow. Geist font weight 500, 15-16px size. Transitions background-color and box-shadow at 0.15s ease.

### White Outlined Button
**Role:** Secondary action, navigation-adjacent controls

Background #ffffff, text #131316, 1px solid #d9d9de border, 6px radius, 0px vertical / 10px horizontal padding. Subtle shadow: rgb(217,217,222) 0px 0px 0px 0.5px. Geist weight 500.

### Ghost Navigation Button
**Role:** Top-level nav items and inline text-links with icons

Background transparent, text #131316, no border, 0px radius. Right padding 8px. On hover, border-color transitions to #d9d9de. Used for Products, Docs, Changelog, Company nav items.

### Pill Tag / Badge
**Role:** Category labels, section eyebrow labels (e.g. 'Clerk Components', 'User Authentication')

9999px border-radius, background transparent or #eeeef0, text #6c47ff at 11-12px Geist weight 500. 4px vertical / 10px horizontal padding. The violet text on near-white background signals section taxonomy without using a filled badge.

### Light Marketing Card
**Role:** Feature cards and pricing sections on white/fog surfaces

Background #ffffff, 16px radius, shadow stack: rgba(0,0,0,0.05) 0px 1px 1px, rgba(34,42,53,0.04) 0px 4px 6px, rgba(47,48,55,0.05) 0px 24px 68px. Padding 16px 20px. 1px hairline border at #d9d9de at 0.5px weight.

### Dark Obsidian Card
**Role:** Product demo feature cards in dark sections (auth UIs, session management)

Background #212126, 16px radius, inset white shimmer: rgba(255,255,255,0.024) 0px 1px 0px inset + rgba(255,255,255,0.024) 0px 0px 0px 1px inset. No explicit padding (content-driven). Text #ffffff and #9394a1 for body. Creates glass-like border without actual border.

### Auth Component Card
**Role:** Embedded Clerk sign-in / sign-up modal preview

Background #ffffff, 8px radius (inner form elements), outer wrapper uses 16px radius. Deep shadow: rgba(47,48,55,0.2) 0px 15px 35px -5px. Inner inputs: #f7f7f8 background, 6px radius, 1px #d9d9de border. Primary action inside uses Electric Violet (#6c47ff) full-width button.

### Code Component Label
**Role:** JSX component name pills in documentation sidebar

Söhne Mono weight 500, 10-12px, +0.10em letter-spacing, text #131316 or #6c47ff, background transparent. Formatted as '<ComponentName />' with angle brackets in violet accent color.

### Form Input (Light)
**Role:** Email, password fields in auth card demos

Background #f7f7f8, 6px radius, 1px solid #d9d9de border, padding 8px 12px. Placeholder text #9394a1 (Stone). Focus ring uses violet: rgba(108,71,255,0.2) box-shadow ring. Label text #131316 Geist weight 500 12px.

### OAuth Social Button
**Role:** 'Continue with Google', 'Continue with GitHub' inside auth modal

Background #ffffff, 1px solid #d9d9de, 6px radius, full-width, 10px 12px padding, text #131316 Geist weight 500 14px, leading OAuth provider icon left-aligned. Shadow: rgba(0,0,0,0.06) 0px 0px 0px 1px.

### Accordion Feature Row
**Role:** Collapsible feature list in the component explorer sidebar (User Authentication, B2B Authentication, Billing)

Background transparent, text #747686 when collapsed, #131316 when expanded, 9999px radius on expand indicator dot. Dashed 1px #eeeef0 separator. Expanded state shows sub-item code labels indented 16px.

### Announcement Banner
**Role:** Top-of-page news strip ('Clerk raises $50m Series C')

Full-width, background #131316, text #ffffff Geist weight 500 13px, centered. Inline 'Learn more →' link in #d9d9de. 8px 0px vertical padding.

## Do's and Don'ts

### Do
- Use #6c47ff exclusively for filled primary CTAs and heading accent text — never for decorative backgrounds larger than a tag-sized element.
- Apply Geist at -0.035em letter-spacing for any headline 32px and above; fall to -0.015em for 18-24px subheadings.
- Use 16px radius for large cards and modals, 6px for buttons and inputs, and 9999px strictly for pill badges and tags.
- On dark product sections (#212126 canvas), use the inset white shimmer shadow (rgba(255,255,255,0.024)) as the sole border treatment — no explicit border-color.
- Apply the hero radial gradient (violet → yellow → cyan → transparent) only as a background wash behind full-width sections, keeping opacity below 0.25.
- Format all code component references in Söhne Mono with +0.10em tracking and angle-bracket syntax in violet (#6c47ff).
- Keep all page content within a 1200px max-width container; section vertical gaps should be 64-80px.

### Don't
- Do not use Electric Violet (#6c47ff) as a background fill for anything larger than a button or badge — its power comes from scarcity.
- Do not use pure #000000 for body text — always use #131316 (Void Black) or #5e5f6 (Graphite) for reading comfort on white surfaces.
- Do not flatten the dual-surface system into a single light or dark theme — light marketing sections and dark product preview cards must coexist on the same page.
- Do not apply the deep card shadow (rgba(47,48,55,0.2) 0px 15px 35px -5px) to dark obsidian cards — they use only the inset shimmer and have no drop shadow.
- Do not set border-radius to anything other than 6px, 8px, 12px, 16px, or 9999px — the design has no 4px or 24px radii.
- Do not use Söhne Mono outside of code snippets, component labels, and terminal strings — body copy is always Geist.
- Do not add decorative color fills behind section headings on light backgrounds — the hero gradient is the only zone where color washes apply.

## Elevation

- **Light Card (standard):** `rgb(217, 217, 222) 0px 0px 0px 0.5px, rgba(0, 0, 0, 0.06) 0px 1px 2px 0px, rgba(0, 0, 0, 0.08) 0px 0px 2px 0px`
- **Light Card (deep):** `rgba(0, 0, 0, 0.06) 0px 0px 0px 1px, rgba(0, 0, 0, 0.08) 0px 5px 15px 0px, rgba(47, 48, 55, 0.2) 0px 15px 35px -5px, rgba(34, 42, 53, 0.04) 0px 4px 6px 0px`
- **Auth Modal Card:** `rgba(0, 0, 0, 0.05) 0px 1px 1px 0px, rgba(34, 42, 53, 0.04) 0px 4px 6px 0px, rgba(47, 48, 55, 0.05) 0px 24px 68px 0px, rgba(0, 0, 0, 0.04) 0px 2px 3px 0px`
- **Dark Card (obsidian):** `rgba(255, 255, 255, 0.024) 0px 1px 0px 0px inset, rgba(255, 255, 255, 0.024) 0px 0px 0px 1px inset`
- **Product Demo Screenshot:** `rgba(19, 19, 22, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.08) 0px 5px 15px 0px, rgba(25, 28, 33, 0.2) 0px 15px 35px -5px`

## Surfaces

- **Page Canvas** (`#f7f7f8`) — Base page background for light marketing sections
- **Card Surface** (`#ffffff`) — Default card and form surface on light backgrounds
- **Recessed Surface** (`#f7f7f8`) — Input backgrounds, table row fills, and secondary card insets
- **Dark Canvas** (`#212126`) — Product demo sections and dark-mode showcase panels
- **Elevated Dark** (`#2f3037`) — Elevated panels and code blocks within dark sections

## Imagery

The site relies almost entirely on live UI product screenshots and recreated Clerk component demos rather than photography or illustration. Auth modals (sign-in card, account chooser) are shown as floating white cards with deep shadows, photographed at slight perspective or presented flat. Dark feature sections use stylized product mockups of phones, browser windows, and session management tables rendered at pixel-density on #212126 surfaces. Icons are monochromatic outlined glyphs at ~16-20px with 1.5px apparent stroke weight, shifting between #131316 on light and #9394a1 on dark surfaces. There is no lifestyle photography and no abstract illustration — the visual evidence IS the product. Image density is medium: each feature section uses one contained product mockup surrounded by text, never full-bleed. Mockup edges are sharp with soft drop shadows, not rounded or masked.

## Layout

Max-width 1200px centered container, full-bleed colored bands at the section level. Hero is full-viewport-height centered stack: announcement strip at top → sticky nav → display headline with gradient background halo → two inline CTAs → logo strip. Below the hero, sections alternate between full-width light (#f7f7f8) and full-width dark (#1a1a1f) bands with consistent 80px top/bottom vertical padding. Feature sections use a 2-column text-left / interactive-demo-right layout. The component explorer section uses a 2-column layout: accordion list on the left, live auth modal preview on the right. Dark authentication feature grid uses a 3-column card grid at desktop with bento-style spanning cards (one wide center, two flanking). Navigation is a fixed top bar with logo left, text nav center, sign-in + CTA right. No sidebar navigation at the marketing level.

## Similar Brands

- **Auth0** — Same developer-identity category with violet/purple brand accent on light documentation shell
- **Vercel** — Identical dual-surface strategy: white marketing sections with embedded dark product preview cards showing live UI
- **Stripe** — Same approach of using live-component screenshots as hero visuals with deep layered drop shadows on floating white cards
- **Linear** — Dark product showcase sections with inset-shimmer glass-border cards and tight negative-tracked Geist-style display headlines
- **Resend** — Monochrome palette punctuated by a single vivid accent color, Söhne Mono code labels, and mixed light/dark section banding
