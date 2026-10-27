# Discord — Style Reference
> Game world behind a chat bubble — every section is a self-contained environment with its own lighting and cast of characters.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Deep cosmic blue fills every section like a starfield at 2am — not a background choice but a total environment. The hero plunges into a rich indigo-to-navy gradient populated with 3D characters, product screens, and floating mascots, making the UI feel like a game world rather than a marketing page. Blurple (#5865F2) — Discord's owned hue — appears only on primary CTAs, creating a controlled pop against the blue-black atmosphere. Typography does the heavy lifting: ABC Ginto Nord at weight 800 with tight -0.01em tracking slams headlines into all-caps blocks that feel like stamped metal, while body copy at 16px/1.5 stays conversational. The overall effect is a gaming-native space where every section is its own immersive stage, not a content column.

## Colors

| Name | Value | Role |
|------|-------|------|
| Blurple | `#5865f2` | Primary CTA buttons, brand icon, active states — the single chromatic anchor in a near-monochrome blue-black space, creating instant recognition as the only saturated element in the layout |
| Dark Blurple | `#3442d9` | Hover state for primary buttons, pressed states |
| Hover Blurple | `#8891f2` | Button hover tint, elevated blurple interactions |
| Spring Green | `#57f287` | Online status indicators, success states |
| Fuchsia | `#eb459` | Nitro gradient accents, special event highlights |
| Vivid Cerulean | `#00b0f4` | Voice/video channel indicators, info states |
| Ember Orange | `#fda220` | Quest indicators, achievement highlights |
| Ekko Red | `#de2761` | Destructive actions, critical alerts |
| Void | `#000000` | Text on light surfaces, icon fills, overlay backgrounds |
| Snow | `#ffffff` | Primary text on dark backgrounds, button text, nav links, card backgrounds |
| Not Quite Black | `#23272a` | Secondary button text and borders, dark UI surface color |
| Dark Charcoal | `#2c2f33` | App UI chrome surfaces, elevated dark panels |
| Graphite | `#333333` | Tertiary text on light surfaces, image overlays |
| Fog | `#babcd9` | Subdued headings and body text on dark backgrounds — a lavender-tinted neutral that stays on-brand while reducing contrast |
| Greyple | `#99aab5` | Disabled states, placeholder text, muted metadata |
| Dim Grey | `#50555f` | Input borders, dividers, secondary icon fills |
| Off White | `#f6f6f6` | Light section backgrounds, card surfaces in light contexts |

## Typography

### ABC Ginto Nord Discord — All display headlines and section headings. Weight 800 is the signature move — combined with all-caps styling and -0.01em tracking, headlines compress into dense rectangular blocks. No other font or weight creates this stamped-label effect. Used at 56–61px for hero, 48px for section leads, 36px for subsections.
- **Substitute:** Nunito Black, Poppins 800, or Rounded Mplus 1c 800
- **Weights:** 700, 800
- **Sizes:** 36px, 48px, 56px, 61px
- **Line height:** 0.86–1.20
- **Letter spacing:** -0.01em (approx -0.56px at 56px, -0.61px at 61px)

### ABC Ginto Discord — Navigation labels, body copy, button text, UI labels. Letter-spacing at 0.013–0.016em adds subtle openness at small sizes — compensating for the condensed feel of the Nord headline font above. Weight 500 for buttons and nav emphasis, 400 for body and metadata.
- **Substitute:** Inter, DM Sans, or Nunito 400/500
- **Weights:** 400, 500
- **Sizes:** 16px, 20px
- **Line height:** 1.20–1.50
- **Letter spacing:** 0.013–0.016em

### GG Sans — Discord's proprietary UI font used inside product UI mock-ups and app interface screenshots embedded in marketing sections. Appears at 16px/1.5 exclusively — mirrors the in-product typeface to keep screenshots authentic.
- **Substitute:** Inter 400
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.50

### ABC Ginto Normal — Long-form paragraph body text in feature sections, link lists in footer. Functionally identical metrics to ABC Ginto Discord but a separate optical variant for extended reading.
- **Substitute:** Inter 400
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 16px | 1.5 | — |
| body-lg | — | — | 20px | 1.38 | — |
| heading-sm | — | — | 36px | 1.2 | -0.36px |
| heading | — | — | 48px | 0.93 | -0.48px |
| heading-lg | — | — | 56px | 0.86 | -0.56px |
| display | — | — | 61px | 0.86 | -0.61px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 32-48px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 16px
- **pills:** 104px
- **buttons:** 12px
- **buttonsLarge:** 16px
- **featurePanels:** 24px

## Components

### Primary CTA Button (Blurple Filled)
**Role:** Main call-to-action, e.g. 'Open Discord in your browser'

backgroundColor #5865F2, color #FFFFFF, borderRadius 12px, padding 19.5px 24px. No border visible — the blurple fill is self-contained. Hover shifts to #3442D9. The 19.5px vertical padding makes this the tallest button variant on the page — physically dominant in the CTA pair.

### Secondary CTA Button (White Filled)
**Role:** Download prompt, paired with primary CTA

backgroundColor #FFFFFF, color #23272A, borderRadius 12px, padding 15px 24px. A clean white pill against the dark background — high contrast without blurple. Border is #23272A at 1px. The softer padding (vs primary) visually subordinates it as the secondary choice.

### Ghost Navigation Button (Transparent Outlined)
**Role:** Nav dropdown triggers and secondary navigation actions

backgroundColor transparent, color #FFFFFF, border 1px solid #FFFFFF, borderRadius 12px, padding 10px 16px. Used for nav menu items with dropdown arrows. The all-white outline on dark keeps it visible without competing with blurple.

### Log In Button (White Outlined)
**Role:** Top-right header authentication action

backgroundColor #FFFFFF, color #000000, border 1px solid #000000, borderRadius 16px, padding 10px 16px. Uses a larger 16px radius than other buttons — matches the pill-like header style. Appears on the light/frosted header strip, making the filled white surface legible against the nav background.

### Feature Showcase Card
**Role:** Full-bleed section content containers holding product screenshots and feature copy

Large rounded containers with 24px+ radius, set against the page's deep blue background. Each card uses its own gradient or solid background (purple-to-magenta for 'Group Chats', green for 'Watch Together') — section identity is expressed through the card background color, not the page background. Content splits 50/50: product screenshot left, text right. Cards span full viewport width on mobile, max ~1100px on desktop.

### 3D Character Float
**Role:** Decorative mascot and character illustrations scattered at section edges

Not interactive UI — these are 3D-rendered PNG/WebP assets positioned absolutely at section boundaries, overlapping card edges. Sizes range from ~100px to ~300px. They exit and enter sections unpredictably, creating the 'world' atmosphere. No background, no border, no radius — raw edge compositing into the page.

### Product Screen Mock-up
**Role:** Embedded Discord UI screenshots within feature cards

Screenshots of the actual Discord app rendered inside feature cards with 12-16px radius. They float slightly off-center with a subtle drop shadow. Mobile frames shown as phone outlines. Desktop frames shown as monitor bezels. The mock-ups use the real Discord dark UI (#2C2F33 surface, #23272A sidebar), grounding marketing claims in the actual product.

### Navigation Bar
**Role:** Global top navigation

Fixed header spanning full viewport width. Background is semi-transparent over the hero image — appears near-white/frosted. Contains Discord wordmark left, text nav links center (16px ABC Ginto, #FFFFFF or #000000 depending on scroll state), and 'Log In' button far right. Dropdown triggers use the ghost outlined button variant. No visible shadow — floats as a flat strip.

### Hero Section
**Role:** Full-viewport landing block

Full-bleed dark indigo background (#0E0F2D to near-black gradient implied). Headline in ABC Ginto Nord 800 at 56-61px, color #FFFFFF, all-caps, line-height 0.86, crammed into the left 50% of the viewport. Body copy at 16px ABC Ginto 400, color #FFFFFF, max-width ~380px. CTA pair (white + blurple buttons) sits below body. Right 50% holds the product mock-up composite with 3D characters overlapping both halves.

### Footer Navigation
**Role:** Site-wide footer link groups

Dark background (#23272A or #000000). Multi-column link grid with group headings in 16px ABC Ginto 500 + positive letter-spacing. Link text at 16px/1.5 weight 400, color #BABCD9 (Fog) on dark. Discord wordmark and social icons top-left. No dividers — columns separated by gap only.

## Do's and Don'ts

### Do
- Use ABC Ginto Nord 800 in all-caps for all section headlines; letter-spacing must be -0.01em to maintain the compressed rectangular silhouette.
- Keep #5865F2 (Blurple) exclusively on primary CTA buttons and interactive focus states — it is the only saturated color with a guaranteed role on every page.
- Set feature section cards with their own gradient or solid background color (purple-magenta, green, etc.) to differentiate sections, since the global page background never changes.
- Pair the blurple CTA button with a white filled secondary button using padding 15px 24px and radius 12px — never use blurple for both primary and secondary in the same CTA cluster.
- Position 3D characters and mascot assets at card edges, overlapping between sections — the overlap is what creates the immersive environment, not isolated placement.
- Apply 12px border-radius to standard buttons and 16px to the Log In/header button to maintain the subtle size hierarchy between interaction contexts.
- Use the Fog color (#BABCD9) for body text in dark sections where full white (#FFFFFF) would overpower headlines — reserve pure white for headlines and critical UI labels.

### Don't
- Never use a white or light-gray page background — the deep blue-black environment is non-negotiable for the brand atmosphere; even light-themed sections should be contained within cards.
- Never apply ABC Ginto Nord headlines at mixed-case — the all-caps + tight tracking combination is inseparable from the visual identity.
- Never place Blurple as a background color on large areas (sections, cards) — at scale it overwhelms the controlled accent role and collapses contrast with Blurple text.
- Never use gradient text on headlines — the weight and mass of the black-filled letterforms is the visual statement; gradients would undermine the stamped-metal quality.
- Never add drop shadows to feature cards — section identity comes from contrasting card backgrounds, not elevation shadow depth.
- Never reduce button border-radius below 12px — anything sharper breaks the rounded-corner system that softens the otherwise heavy typographic tone.
- Never use Greyple (#99AAB5) or Dim Grey (#50555F) as primary text colors — they are reserved for disabled, muted, and placeholder states only.

## Elevation

Discord marketing pages use no traditional box-shadow elevation. Depth is created entirely through color contrast between section backgrounds and floating card surfaces. 3D rendered characters establish z-depth through artistic perspective and overlap, not CSS shadows. The only elevation cue is scale — larger elements read as closer.

## Surfaces

- **Cosmic Page** (`#0e0f2d`) — Global page background — deep indigo-navy environment that all sections sit within
- **App Chrome** (`#23272a`) — Product UI sidebar and panel backgrounds shown in mock-ups
- **App Surface** (`#2c2f33`) — Main content area inside product screenshots
- **Feature Card** (`#5865f2`) — Feature section card backgrounds — each card uses its own themed gradient/solid (not always blurple), but this represents the brand-colored variant

## Imagery

Entirely 3D illustration and product screenshots — no photography. Characters are rendered in a cartoon-realistic 3D style with soft subsurface lighting, purple-blue-tinted shadows, and saturated clothing colors (orange, lavender, pink hoodie). They're posed mid-gesture and placed off-axis against the page, creating dynamism without a static layout grid. Product screenshots are composited into device frames (monitor bezel, phone outline) rendered in the same 3D style, making the 'product demo' feel like part of the illustration world rather than a flat screen-grab. Feature cards use full-bleed gradient backgrounds (purple-to-magenta, deep green) as the canvas for these screenshot composites — the gradient IS the scene lighting. Floating 3D props (a peach, a crystal, a robot mascot in lime green) appear at section boundaries as scene accessories. Zero photography — the visual world is entirely constructed, reinforcing that Discord is a space you build rather than a place that exists.

## Layout

Full-bleed at the page level with no explicit max-width container visible — the deep blue background extends edge-to-edge. Hero is a split composition: text block flush-left with 3D product composite filling the right half, both contained within viewport height. Feature sections below the hero use large-radius cards (~24px) that span 80-90% of the viewport width, each card being a self-contained stage. Within cards, layout is 50/50 split — product screenshot left, headline + body right (or reversed). No alternating light/dark band rhythm — all sections share the same dark background; differentiation comes from card background colors. Navigation is a fixed-top full-width bar with centered link groups. Footer uses a 4-5 column link grid. The page is extremely long (7300px+), with generous inter-section gaps of 80-120px giving each feature room to breathe.

## Similar Brands

- **Roblox** — Same all-caps heavy display type + 3D character mascots as primary visual storytelling, placed loosely against colored environments
- **Twitch** — Deep purple-dominant dark theme with a single vivid brand accent color reserved for CTAs, gaming-community audience
- **Epic Games Store** — Full-bleed dark environments, product screenshot composites inside illustrated frames, large-type section headers in white on near-black
- **Spotify (gaming campaigns)** — Saturated gradient card backgrounds as section differentiators within an otherwise monochromatic dark page structure
- **Supercell** — 3D cartoon characters with subsurface-lit rendering, posed dynamically at section edges, overlapping layout containers
