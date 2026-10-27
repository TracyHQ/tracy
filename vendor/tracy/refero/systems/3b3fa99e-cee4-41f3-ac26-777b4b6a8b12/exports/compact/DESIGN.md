# Krisp — Style Reference
> Warm cream paper, inked in indigo, lit by a violet spark — a confident editorial-tech feel.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Krisp uses a warm-cream-and-violet language built on a single geometric humanist sans (Plus Jakarta Sans). The canvas is a soft warm beige rather than sterile white, giving the entire surface a paper-like, approachable quality. Deep indigo violet (#131032) doubles as both the primary text color and a dramatic dark section background — the same hue reading as authoritative copy on light surfaces and as immersive night-mode on dark. Vivid violet (#614efa) is the lone saturated accent, used sparingly on filled buttons and link emphasis, while a violet-to-cyan gradient sweeps through hero display text to make 'Voice AI' feel like it is lit from within. The system stays calm: soft cards, pill-shaped tabs, thin hairlines, no heavy shadows, and color restricted to small functional moments rather than broad washes.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Iris | `#131032` | Primary text, headings, and dark section backgrounds — the deepest near-black with a violet undertone carries the same identity across both light copy and immersive dark bands |
| Iris Spark | `#614efa` | Filled buttons, link emphasis, active states, gradient stops — the only vivid saturated color in the palette, used as a small functional spark against the cream canvas |
| Violet Mist | `#dfdcfe` | Soft accent washes, tag backgrounds, decorative highlights — a near-white violet tint that echoes Iris Spark at very low intensity |
| Cyan Glow | `#98c8ff` | Supporting palette color for small decorative accents when the core palette needs contrast. |
| Mint Whisper | `#eafdfa` | Pill badge and announcement tag backgrounds — a barely-there cool tint to differentiate informational chips from the warm cream canvas |
| Iris Halo | `#8374fb` | Soft highlight overlays and secondary gradient midtones — a lighter violet used in multi-stop gradients |
| Fog | `#918f9f` | Muted body copy, helper text, secondary labels — the primary low-emphasis text color against cream and white surfaces |
| Shadow | `#5b5971` | Stronger secondary text, metadata — deeper than Fog for labels that need more presence without reaching Midnight Iris |
| Ash | `#a1a1aa` | Disabled text, placeholder content, very low-emphasis UI elements |
| Slate | `#1a1a22` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Charcoal | `#24232d` | Secondary dark text, very dark UI elements |
| Hairline | `#e7e7ea` | Borders, dividers, card outlines — a cool light gray that separates surfaces on the warm cream canvas |
| Silver | `#cccccc` | Shadows, very subtle borders, disabled surface tones |
| Snow | `#ffffff` | Card surfaces, button text, dark-section text — pure white for maximum contrast on dark backgrounds |
| Cloud | `#f7f7f8` | Secondary surface, footer background — a cool off-white that sits one step below Snow |
| Warm Paper | `#f2ece2` | Dominant page canvas — a warm beige that replaces the typical cold white SaaS background, giving the entire site a tactile, editorial feel |

## Typography

### Plus Jakarta Sans — Single-family geometric humanist sans used for every text role from 10px badges to 58px display headlines
- **Substitute:** Inter, DM Sans, General Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10, 14, 16, 18, 20, 22, 26, 36, 42, 48, 58
- **Line height:** 1.14–1.78 depending on size

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.6 | — |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.63 | — |
| body-lg | — | — | 18px | 1.62 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading | — | — | 26px | 1.45 | — |
| heading-lg | — | — | 36px | 1.33 | — |
| display-sm | — | — | 42px | 1.2 | — |
| display | — | — | 48px | 1.17 | — |
| display-lg | — | — | 58px | 1.14 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 16px
- **icons:** 4px
- **pills:** 9999px
- **badges:** 12px
- **buttons:** 8px
- **largeCards:** 20-24px

## Components

### Filled Violet Button
**Role:** Primary action button — solid Iris Spark fill with white text

Background: #614efa (Iris Spark). Text: #ffffff, Plus Jakarta Sans weight 600, 16px. Border radius: 8px. Padding: 12px 20px. Optional caret/chevron icon after label in white. No shadow on default state. On hover, darken background slightly. This is the signature action style — small, confident, rounded-but-not-pill.

### Dark Outline Button
**Role:** Secondary action button — used for 'Book a demo' and similar

Background: #1a1a22 (Slate). Text: #ffffff, Plus Jakarta Sans weight 600, 16px. Border radius: 8px. Padding: 12px 20px. No border. This near-black filled button provides the neutral counterweight to the violet primary action, preventing the palette from becoming monochromatic.

### Text Link Button
**Role:** Inline action with chevron — used in nav for 'Get Krisp' with dropdown indicator

Background: transparent. Text: #131032 (Midnight Iris), Plus Jakarta Sans weight 600, 16px. Small downward chevron in #131032 adjacent to text. No underline. Hover: shift to #614efa.

### Pill Tab Selector
**Role:** Segmented control for switching between meeting states (During / After / Before Meeting)

Container: rounded 9999px, background transparent or very light fill. Active tab: #ffffff (Snow) background with #131032 (Midnight Iris) text, weight 500-600. Inactive tab: transparent background with #918f9f (Fog) text. Transition between tabs is a simple white pill slide. Border-radius: 9999px makes these feel like physical toggles.

### Announcement Pill Badge
**Role:** Eyebrow tag above hero headline — 'Introducing Accent Conversion' style

Background: #eafdfa (Mint Whisper). Text: #131032 (Midnight Iris), Plus Jakarta Sans weight 500, 14px. Border radius: 9999px (pill). Padding: 6px 14px. Inline display above headlines as a contextual label.

### Gradient Display Headline
**Role:** Signature hero text treatment — 'Voice AI' portion of the headline

Text: Plus Jakarta Sans weight 700, 48-58px. Background: linear-gradient(90deg, #614efa 0%, #98c8ff 100%) applied via background-clip: text with transparent fill. Sits alongside plain Midnight Iris text in the same headline to create contrast between 'lit' and 'static' words.

### Feature Card
**Role:** Content card for feature grids — 'Multilingual meeting support', '1-click sharing'

Background: #ffffff (Snow) or #f7f7f8 (Cloud) sitting on Warm Paper canvas. Border: 1px solid #e7e7ea (Hairline) — very subtle. Border radius: 16px. Padding: 32px 28px. Icon: small outlined violet icon at top, 24px size, color #614efa. Title: Plus Jakarta Sans weight 600, 20-22px, #131032. Body: weight 400, 16px, #918f9f. No drop shadow — surface shift provides separation.

### Dark Feature Section Card
**Role:** Feature card variant on dark Midnight Iris background

Background: slightly lighter than the section canvas (transparent or a subtle lift). Border: 1px solid rgba(255,255,255,0.1) or #24232d. Border radius: 16px. Padding: 32px 28px. Icon: small dot or icon in #614efa or coral accent. Title: white #ffffff, weight 600, 20-22px. Body: rgba(255,255,255,0.7) or #918f9f, weight 400, 16px. A thin coral-red accent bar or dot appears to the left of the title — a small warm punctuation against the cool dark canvas.

### Customer Logo Strip
**Role:** Social proof band showing client logos (Medium, Okta, Skechers, Autodesk, Sony, Cisco, ServiceTitan, GitHub)

Layout: single horizontal row, evenly distributed, 8 logos visible. Logos: rendered in a single muted gray tone (filter: grayscale + opacity 0.6-0.8, color #918f9f) — not full color. No labels or captions. Sits on Warm Paper canvas with generous vertical padding (48-64px above and below).

### Top Navigation Bar
**Role:** Site header with logo, menu, and actions

Background: #ffffff (Snow) or transparent over Warm Paper. Left: wordmark 'krisp' in #131032, Plus Jakarta Sans weight 700, 22px. Center-left: nav links in #131032 weight 500, 16px, with small chevron-down icons on items with submenus. Right: 'Sign in' as plain text link, 'Book a demo' as Dark Outline Button, 'Get Krisp' as Filled Violet Button with chevron. Sticky on scroll. Height: 64-72px. Border-bottom: none or 1px #e7e7ea.

### Webby Award Sticker
**Role:** Floating badge in bottom-right corner — '20th Annual Webby Awards, Vote for Krisp'

Background: #ffffff (Snow). Border: 1px solid #e7e7ea. Border radius: 12px. Padding: 8px 12px. Text: #131032 weight 500, 10-12px, two lines. Small Webby logo icon to the left. Fixed position, bottom-right. Subtle shadow on hover.

### Icon
**Role:** UI iconography for features and navigation

Style: outlined, 1.5-2px stroke weight, 20-24px size. Color: #614efa (Iris Spark) on light cards, #ffffff on dark cards, #131032 in nav. Geometric and minimal — people, share, microphone, globe motifs. Stroke caps: round.

## Do's and Don'ts

### Do
- Use #f2ece2 (Warm Paper) as the default page canvas — never substitute pure white at the root level
- Apply the Iris Spark to Cyan Glow gradient only on display-size headlines (42px+); never on body or heading text
- Use 8px border-radius for all buttons and small interactive elements; 16px for cards; 9999px for pills and tabs
- Double-duty #131032 (Midnight Iris) as both text color on light surfaces and background color on dark sections — the hue reads as the same brand identity in both contexts
- Separate action button styles by fill: Iris Spark (#614efa) for one type, Slate (#1a1a22) for the other — never use two violet buttons side by side
- Use Hairline (#e7e7ea) at 1px for card borders and dividers; achieve elevation through surface color shifts rather than shadows
- Keep #918f9f (Fog) as the only muted body text color; never use Ash (#a1a1aa) for primary copy

### Don't
- Don't introduce new saturated colors — Iris Spark is the only vivid hue, and it should appear at most 1-2 times per viewport
- Don't apply drop shadows to cards or panels — surface shifts on the Warm Paper canvas are the elevation system
- Don't use pure #000000 for text — Midnight Iris (#131032) carries the brand undertone
- Don't place white cards on white backgrounds; always layer Snow (#ffffff) on Warm Paper (#f2ece2) or Cloud (#f7f7f8) for separation
- Don't use gradients on body, heading, or subheading text — the gradient treatment is reserved for display headlines only
- Don't use border-radius larger than 8px on buttons — the 8px radius is the button signature, not pills
- Don't show customer logos in full color — they must be muted to grayscale/gray to maintain the quiet editorial feel

## Elevation

Krisp intentionally avoids heavy shadows. Elevation is achieved through surface color shifts (Warm Paper → Snow for cards, Warm Paper → Midnight Iris for dark sections) rather than drop shadows. The only shadow usage is extremely subtle (Silver #cccccc with low opacity) for button press states and card hover lift. This keeps the design feeling flat, modern, and editorial rather than skeuomorphic.

## Surfaces

- **Warm Paper** (`#f2ece2`) — Dominant page canvas — warm beige base for all light sections
- **Cloud** (`#f7f7f8`) — Cool off-white secondary surface, often used for footer and large quiet bands
- **Snow** (`#ffffff`) — Card surfaces and elevated panels — pure white on top of Warm Paper for definition
- **Mint Whisper** (`#eafdfa`) — Accent chip and pill surfaces — a barely-there cool tint for informational tags
- **Midnight Iris** (`#131032`) — Dark immersive section background — inverts the color hierarchy with white text and violet accents

## Imagery

Krisp's visual language is overwhelmingly UI-driven with no photography, no illustrations, and no product screenshots in the visible sections. The imagery vocabulary is purely typographic and geometric: gradient-filled display text, thin outlined icons (people, microphone, globe, share, chat) in Iris Spark violet, and abstract conic-gradient decorative elements in the background of dark sections. Customer logos in the social proof band are rendered in muted gray rather than full brand color, keeping the visual hierarchy focused on the copy and violet accents. The result is an editorial, almost magazine-like aesthetic where type and color do the storytelling that photography would normally carry.

## Similar Brands

- **Linear** — Same single-family geometric sans, dark-section/light-section alternation, and minimal shadow approach — though Linear leans cool-gray where Krisp leans warm-cream
- **Notion** — Similar restrained accent-color philosophy, pill-shaped UI elements, and clean editorial typography at display sizes
- **Framer** — Same warm-canvas-plus-bold-gradient-headline hero pattern and violet/indigo accent color family
- **Descript** — Same AI-tool category, similar comfortable density, and gradient-text display treatment on hero headlines
- **Loom** — Similar light-canvas SaaS with single vivid accent color, soft hairline cards, and pill-tab navigation patterns
