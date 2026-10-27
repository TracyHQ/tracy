# Chat for impact — Style Reference
> forest-green clinic with pastel rooms

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Turn.io runs on a warm, healthcare-optimistic visual system: a deep forest green acts as the dominant brand surface and hero canvas, while soft pastel washes (mint, lavender, peach, cream, sky) create section rhythm like colored rooms in a clinic. The single vivid coral CTA (#ff643b) is the only high-saturation action color and it sits on a near-monochrome field, so every 'Book a Call' reads as the obvious next step. Typography is DM Sans everywhere, pushed to enormous display sizes (69–116px) with tight negative tracking, which gives even the hero a conversational softness rather than corporate weight. Components stay flat and borderless — the system communicates through color blocks and 16–24px rounded cards, not shadows or chrome. Pastel feature cards and a lavender page canvas give the whole site a hand-drawn, almost editorial warmth, while the green hero and purple toolkit band inject the brand's two anchor colors at full saturation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canopy Green | `#0a3922` | Hero canvas, dark section backgrounds, primary heading color on light backgrounds — establishes the dominant brand surface |
| Coral Pulse | `#ff643b` | Primary action buttons, filled CTAs — the only warm high-saturation color in the system, creates urgency without aggression |
| Indigo Bloom | `#460095` | Toolkit section background overlay, secondary brand headings — anchors the purple-lavender pastel system |
| Leaf Bright | `#1dbf73` | Green outline accent for tags, dividers, and focused UI edges |
| Deep Teal | `#003642` | Blue outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Orchid Tint | `#f3b3fe` | Decorative pink accent for badges, tag chips, and pink-section heading underlines |
| Sky Signal | `#00b4dc` | Cyan accent for icons, chart lines, and notification-style data visualization inside cards |
| Aubergine | `#47264c` | Muted plum for body text on lavender backgrounds and plum-section headings — warm dark that pairs with #460095 |
| Ink Black | `#000000` | Primary body text, borders, icon strokes — used aggressively for 1px dividers and outline icon set |
| Paper White | `#ffffff` | Card surfaces, text on dark backgrounds, nav background, white phone-mockup surfaces |
| Ash | `#a6a6a6` | Mid-gray for secondary borders, placeholder text, disabled list items, icon strokes at reduced weight |
| Slate | `#7a7a7a` | Body meta text, subtle list dividers, caption-tier typography |
| Graphite | `#3d3d3d` | Strong secondary text, icon strokes at full opacity, dark borders on light pastel cards |
| Charcoal | `#333333` | Headlines on white/pastel surfaces, link text color when not using brand purple |
| Frost Gray | `#e0e0e0` | Hairline dividers, subtle card separators on white sections |
| Cloud Gray | `#f2f2f2` | Neutral card surface when no pastel is appropriate, footer background, table stripes |
| Lavender Mist | `#eee2ff` | Dominant page background canvas — the near-gray violet that sets the overall atmospheric tint of the site |
| Mint Wash | `#d2f2e3` | Green-tinted card and section background, pale green data viz fills |
| Sky Wash | `#ccf0f8` | Pale cyan card backgrounds, cooling counterpoint to the warm greens and corals |
| Sage Wash | `#e4f7ee` | Very pale green card surface, lighter than Mint Wash for secondary cards |
| Lilac Wash | `#fdf0ff` | Pale lavender card background, pink-adjacent pastel |
| Peach Wash | `#ffede8` | Soft section background, alternate surface, and quiet card fill. Do not promote it to the primary CTA color |
| Cream | `#faf7e8` | Warm cream card background, editorial yellow-tinted sections |
| Sand | `#f4ece9` | Warm beige background variant, rarely used neutral surface |

## Typography

### DM Sans — Single-family system — display headlines at 69–116px weight 500–600 with tight tracking create the editorial feel; body at 16–18px weight 400; UI at 14–16px weight 500–600. The same font handles 12px captions through 116px display, which is the signature: one voice, enormous dynamic range. The ss03 stylistic set is enabled site-wide.
- **Substitute:** Inter, Manrope, or any geometric humanist sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 14, 16, 18, 20, 24, 32, 48, 52, 69, 72, 80, 116
- **Line height:** 0.89, 1.00, 1.05, 1.10, 1.14, 1.17, 1.20, 1.30, 1.33, 1.38, 1.40
- **Letter spacing:** -0.028em at display sizes (≥52px), -0.019em at 32–48px, normal at body sizes
- **OpenType features:** `"ss03"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body-sm | — | — | 14px | 1.38 | — |
| body | — | — | 16px | 1.38 | — |
| body-lg | — | — | 18px | 1.4 | — |
| subheading | — | — | 20px | 1.33 | — |
| heading-sm | — | — | 24px | 1.3 | — |
| heading | — | — | 32px | 1.2 | -0.019px |
| heading-lg | — | — | 48px | 1.14 | -0.019px |
| display | — | — | 72px | 1.05 | -0.028px |
| display-xl | — | — | 116px | 0.89 | -0.028px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 24px
- **icons:** 8px
- **buttons:** 40px
- **cards-sm:** 16px

## Components

### Coral Filled Button
**Role:** Primary CTA — booking, conversion actions

Background #ff643b, white text at 16px DM Sans weight 600, padding 12px 24px, border-radius 40px (fully pill-shaped). No border, no shadow. Sits as the only warm focal point against the green hero or lavender canvas.

### Ghost Outline Button
**Role:** Secondary action paired beside the primary CTA

Transparent background, 1px solid #ffffff border on dark hero / 1px solid #000000 on light sections, text 16px DM Sans weight 500, padding 12px 24px, border-radius 40px. Always accompanies the coral filled button as the lower-emphasis twin.

### Outline Nav Button
**Role:** Right-side header CTA ('Book a Call' in nav)

White background, 1px solid #000000 border, 14px DM Sans weight 500, padding 8px 20px, border-radius 40px. Smaller than hero CTAs; lives in the white nav bar against the green page top.

### Pastel Feature Card
**Role:** 2-column feature highlight in the middle section

Tinted background cycling through #d2f2e3 (mint), #e4f7ee (sage), #ccf0f8 (sky), #faf7e8 (cream), #fdf0ff (lilac), #ffede8 (peach). Padding 32px, border-radius 24px, no border, no shadow. Headline 32px DM Sans weight 700 in #0a3922 or #003642, body 16px in #3d3d3d. Phone-mockup or chart graphic sits below text.

### White Product Card
**Role:** Active/selected feature card with embedded product UI

White #ffffff background, padding 24px, border-radius 16px, optional 1px #e0e0e0 hairline. Contains a phone mockup or inline product screenshot. The product-UI surface is always white to keep the pastel card system from competing with actual content.

### Checklist Feature Item
**Role:** Vertical feature list in the toolkit section (left column)

Each item: small filled brand-colored icon (24px) on the left, 20px DM Sans weight 500 label in #0a3922, 8px gap between icon and text, 16px vertical spacing between items. Active item has a lavender #eee2ff background block wrapping the entire row with 16px border-radius.

### WhatsApp Phone Mockup
**Role:** Hero product visualization on the right side of the hero

Realistic phone-frame device with a dark green #0a3922 status-bar header, white #ffffff chat background, incoming chat bubbles in white with 1px #e0e0e0 border, outgoing bubbles in #dcf8c6 mint-green (WhatsApp canonical), sent-name labels in Leaf Bright #1dbf73. Sits as a layered card overlapping a portrait photo of a healthcare worker.

### Sticky Bottom Notification
**Role:** Application deadline banner pinned to the bottom-right

Dark green #0a3922 background, white text, 16px DM Sans weight 500, padding 16px 20px, border-radius 16px. Contains inline countdown blocks (24d/5h/1m/45s) in monospaced numbers, yellow #faf7e8 or coral #ff643b filled 'Apply now' mini-button, and a close-X in the top-right corner.

### Logo Strip
**Role:** Partner logos band ('In partnership with')

Centered cluster of monochrome partner logos (Meta, WHO, OpenAI, etc.) rendered at #3d3d3d on the dark green hero. Logo height ~24px, 48px horizontal gap between logos. Label text 12px DM Sans weight 500 in #a6a6a6 sits above the strip.

### Pill Tag Chip
**Role:** Small label or category marker in body content

Background tint of current section's pastel (e.g. #d2f2e3 on mint cards), 12px DM Sans weight 600, padding 4px 12px, border-radius 9999px, text in the section's dark heading color.

### Top Navigation Bar
**Role:** Sticky site navigation

White #ffffff background, full-width, horizontal flex with logo left, nav links center (Product, Community, Resources, Pricing), EN selector + Log in + outlined 'Book a Call' right. 14px DM Sans weight 500, #0a3922 link color, 32px vertical padding, no shadow.

### Full-Bleed Dark Hero
**Role:** Above-the-fold hero section

Background #0a3922, full viewport width, 80px+ vertical padding. Left: headline at 69–80px DM Sans weight 500 white with 'WhatsApp' swapped to #1dbf73, body 18px in #d2f2e3, coral CTA + ghost button. Right: overlapping phone mockup + portrait photo composition with no visible card chrome.

## Do's and Don'ts

### Do
- Use DM Sans at every text size from 12px caption to 116px display — the single-family system is the signature; do not introduce a second typeface
- Apply -0.028em letter-spacing at display sizes (≥52px) and -0.019em at 32–48px; body and smaller text uses normal tracking
- Enable font-feature-settings: 'ss03' on every DM Sans instance
- Use the pastel card rotation (#d2f2e3, #e4f7ee, #ccf0f8, #faf7e8, #fdf0ff, #ffede8) for feature card backgrounds — never use raw white or gray for these cards
- Use #ff643b Coral Pulse exclusively for primary filled CTAs; pair every coral button with a ghost outline button beside it
- Set border-radius to 40px on all buttons, 24px on feature cards, 16px on product/notification cards, 9999px on tag chips
- Push headline sizes to 69–116px for hero and section openers; the large-display system is what makes the brand feel editorial rather than corporate

### Don't
- Do not use box-shadow for elevation — the system relies on color contrast and pastel surface changes; shadows break the flat editorial feel
- Do not introduce a second typeface for headings or body; DM Sans is the single voice
- Do not use #ff643b for anything other than primary action buttons — it is not a decorative accent
- Do not use #000000 as a fill on dark green or lavender backgrounds — it creates harsh dead spots; use white or a pastel instead
- Do not use sharp corners (border-radius 0–2px) on feature cards or buttons — the system is defined by soft 16–40px radii
- Do not use more than one vivid accent color per section; coral CTA and Leaf Bright or Indigo Bloom should not appear simultaneously in the same viewport
- Do not set body text below 14px or use gray-on-gray contrast — the system expects strong black #000000 or near-black #3d3d3d on light surfaces

## Elevation

The system deliberately avoids drop shadows as elevation. Depth is created entirely through surface color shifts: lavender canvas → white card → pastel card → dark green band. The only shadow token in the data is rgba(0,0,0,0.05) 0px 1px 1px 0px, used at very low frequency (3 occurrences) for subtle form-field separation. Do not introduce multi-layer shadow stacks or colored glows — they would break the flat editorial surface treatment that defines the brand.

## Surfaces

- **Page Canvas** (`#eee2ff`) — Dominant lavender-tinted page background that establishes atmospheric warmth
- **Card Surface** (`#ffffff`) — White surface for phone mockups, product cards, and overlaid content blocks
- **Pastel Card** (`#d2f2e3`) — Tinted feature cards cycling through mint, sky, sage, lilac, peach, cream for section variety
- **Dark Brand Surface** (`#0a3922`) — Hero and dark band — full-bleed forest green for high-contrast headline moments

## Imagery

Photography is warm, human, and documentary: close-up portraits of healthcare workers (often women in scrubs) with natural skin tones and real-world clinic or community settings, never staged stock poses. Portraits are used in full-bleed or large rounded card crops, frequently overlapping product mockups on the right side of the hero and toolkit sections. Product visualizations are realistic WhatsApp phone-frame mockups with canonical chat-bubble colors (white incoming, #dcf8c6 outgoing, Leaf Bright #1dbf73 sender names), placed as layered floating cards rather than flat screenshots. There are no abstract gradient backgrounds, no 3D renders, and no decorative illustrations — the visual language is photo + product-screenshot only. Iconography is a monochrome outlined/flat-filled icon set in #0a3922 or #000000 at 20–24px, used for feature list bullets and card decorations. The green hero and lavender toolkit band use brand color as the entire atmospheric base rather than imagery.

## Layout

Full-bleed page with a lavender #eee2ff canvas and alternating brand-color bands: dark green hero (80px+ vertical padding, split text-left / visual-right with overlapping phone mockup + portrait), then a white feature band (centered headline, 2-column pastel card grid with 24px gap), then a lavender toolkit band (split text-left feature list / image-right portrait with green color overlay), then alternating pastel and white sections following a generous 64px section gap. The page max-width is approximately 1280px centered, with horizontal padding of ~80px on desktop. Navigation is a single sticky white top bar. A persistent bottom-right notification card overlays all sections. The layout breathes — section gaps are large, cards have 24px+ internal padding, and the dark-to-pastel-to-dark alternation creates clear room-like transitions rather than continuous flow.

## Similar Brands

- **Ada Health** — Same warm pastel card grid over a near-white canvas, large humanist-sans headlines, and a single warm accent for CTAs
- **Headspace Health** — Shared use of full-bleed brand-colored hero bands followed by soft pastel feature cards, and a gentle rounded sans-serif at enormous display sizes
- **Sana Health** — Identical split hero composition (text left, phone-mockup + portrait right) and the same flat-borderless card system on tinted pastel surfaces
- **Babylon Health** — Healthcare-tech aesthetic with DM Sans/Inter-class headlines, pastel green and blue feature card rotation, and photo-of-clinicians imagery treatment
- **Calendly** — Single coral/orange filled CTA paired with a ghost outline secondary button, and a white nav bar with outlined pill CTA as the persistent right-side action
