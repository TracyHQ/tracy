# ORYZO AI — Style Reference
> Darkroom product editorial. A lone object floating in warm darkness, cream typography the only decoration.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The ORYZO visual system treats a single product object like a museum artifact: full-bleed warm-dark canvas, cream typography floating in generous negative space, and zero UI chrome competing with the form. Every text element is uppercase at weight 500, with the sole exception of body copy at 29px/400 which is the system's only conversational voice. A single vivid orange appears only for credit lines and the studio link — never for buttons or CTAs — earning its rarity. The layout alternates between two modes: photographic hero (the product in context with tools and materials) and void-mode reveal (the product isolated on warm dark), connected by hairline dashed dividers and pill-shaped controls.

## Colors

| Name | Value | Role |
|------|-------|------|
| Warm Cream | `#ffedd7` | Light text on dark surfaces, inverse labels, and high-contrast captions. |
| Walnut Shadow | `#100904` | Page canvas and deepest background — warm near-black, not pure black. The void behind every product reveal |
| Bark Brown | `#382416` | Elevated surface and filled button background — the one chromatic step above the canvas, used for the single solid CTA |
| Cork Border | `#40372e` | Hairline dividers, dashed section separators, subtle container borders — warmer than the canvas by one step |
| Driftwood | `#6c5f51` | Mid-tone warm gray for secondary dividers and muted structural elements — the bridge between Bark and Cream |
| Ember Accent | `#dc5000` | Orange text accent for links, tags, and emphasized short phrases. |
| Pure Black | `#000000` | SVG icon fills and decorative vector elements only — never used as a background or text color |

## Typography

### halyard-display-variable — The only typeface. Weight 500 at 51px drives display headlines with extreme uppercase confidence; the same family at weight 400 / 29px becomes the system's sole mixed-case body voice. Letter-spacing stays normal — the geometric forms do the work without tightening. Substitute: 'Inter', 'Söhne', or 'Neue Haas Grotesk' for close structural match.
- **Substitute:** Inter or Söhne
- **Weights:** 400, 500
- **Sizes:** 8, 10, 12, 14, 15, 18, 24, 29, 41, 51px
- **Line height:** 0.90–1.26
- **Letter spacing:** normal across all sizes — no negative tracking even at display scale, the font's geometry handles visual weight without compression
- **OpenType features:** `"ss01" on`

### Arial — System fallback for micro-legal labels (8px uppercase credits like "* ADOBE ILLUSTRATOR"). Not a design choice — a necessity for system-rendered disclaimers.
- **Substitute:** system-ui
- **Weights:** 400, 500
- **Sizes:** 8px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| subheading | — | — | 18px | 1 | 0px |
| heading-sm | — | — | 24px | 1.09 | 0px |
| body | — | — | 29px | 1.26 | 0px |
| heading | — | — | 41px | 0.9 | 0px |
| display | — | — | 51px | 0.9 | 0px |

## Spacing & Layout

**Density:** comfortable

- **Card padding:** 24px
- **Element gap:** 18px

### Border Radius

- **cards:** 12px
- **inputs:** 0px
- **full-round:** 9999px
- **buttons-pill:** 36px
- **buttons-outlined:** 22.5px

## Components

### Pill Button (Filled)
**Role:** Primary solid CTA — used once on the page for the Lusion studio link

36px border-radius, Bark Brown (#382416) background, Warm Cream (#ffedd7) text, 14px 24px vertical/horizontal padding, weight 500, uppercase, 8–14px size. The only filled action surface in the system — its rarity is the signal.

### Outlined Ghost Button
**Role:** Secondary action or decorative button — cream border on transparent fill

22.5px border-radius, transparent background, 1px Warm Cream border, Warm Cream text, 7.5px vertical padding, 0px horizontal padding, weight 500, uppercase, 8–14px. Border does the work; no fill needed.

### Underline Text Link
**Role:** Inline links and navigation items — borderless, relying on underline

0px radius, transparent background, Warm Cream text, 0px padding, weight 500, uppercase, 12–14px. The default interaction — no container, just text with an underline indicator.

### Input Field (Underline Only)
**Role:** Minimal form input — bottom border only, no full outline

0px radius, transparent background, 1px Warm Cream bottom border, Warm Cream text, 1px 2px padding, 36px right padding for an inline action. The form mirrors the ghost-button restraint — no boxes, just a line.

### Fixed Top Navigation
**Role:** Persistent site navigation — minimal, 4 items, uppercase micro-type

Logo wordmark "ORYZO" left-aligned in Warm Cream at 12–14px weight 500 uppercase. Right-aligned nav items: INTRO (with dashed underline indicator for active), FEATURES, PRODUCT, CONTACT — all 12px weight 500 uppercase, Warm Cream. Transparent background over the hero photograph.

### Vertical Sidebar Label
**Role:** Edge branding — vertical text running down the right margin

Rotated 90° text "ORYZO 1-MODEL" in Warm Cream, 10–12px uppercase, sits flush right. Functions as a product serial number — a physical-product artifact translated to UI.

### Logo Wordmark
**Role:** Brand identifier — the only graphical mark

"ORYZO" in Halyard Display Variable weight 500 uppercase, up to 51px+ at display scale with 0.9 line-height. Used at two sizes: navigation lockup (12–14px) and hero lockup (51px+). No icon, no symbol — pure typographic identity.

### Hero Overlay Info Card
**Role:** Semi-transparent attribution card in the hero

12px border-radius, semi-transparent Warm Cream or dark fill with low opacity, contains uppercase heading "DESIGNED BY LUSION, THE AWARD-WINNING DESIGN STUDIO." plus a dashed divider and body text. Overlays the hero photograph bottom-left.

### Product Reveal Section
**Role:** Full-viewport void-mode section — centered 3D render with flanking text

100vh height, Walnut Shadow (#100904) background, centered 3D product render, left-aligned heading at 41px uppercase "ISN'T JUST A COASTER.", right-aligned body copy at 29px weight 400 mixed-case. The signature layout pattern — three columns, generous gutters.

### Section Divider (Dashed Hairline)
**Role:** Visual separator between content blocks

1px dashed line in Cork Border (#40372e) or Driftwood (#6c5f51). Used sparingly between text blocks, never as decoration — always carrying structural meaning.

### Video Thumbnail Card
**Role:** Embedded video preview with play indicator

Small rectangular card, 12px radius, positioned in the lower-right of the hero. Contains a miniature ORYZO wordmark and a play icon. Functions as a secondary entry point without competing with the primary CTA.

### Legal/Disclaimer Text
**Role:** System-rendered micro-copy in Arial 8px

Fallback font (Arial 8px weight 500 uppercase) for things like "* ADOBE ILLUSTRATOR" footnotes. Visually subordinate — intentionally uses a different typeface to signal "this is not design, this is compliance."

## Do's and Don'ts

### Do
- Set all UI text in #ffedd7 (Warm Cream) — never use pure #fff; the warm tint is the system's signature.
- Use #dc5000 (Ember) only for credit lines, the "Built by" label, and the Lusion studio link — a single accent earns its rarity through restraint.
- Set type in uppercase weight 500 across the entire interface; use weight 400 / mixed case only for the 29px body copy that explains the product.
- Use 36px border-radius for the one filled CTA and 22.5px for outlined ghost buttons; 12px for cards; 0px for inputs and inline links — these four values are the entire radius vocabulary.
- Set section gaps at 100vh — each section gets its own full viewport, never compress product reveals into bands.
- Use 1px dashed lines in #40372 for section dividers; avoid solid dividers and avoid any divider thicker than 2px.
- Center the 3D product render in every void-mode section with text flanking symmetrically left and right at 18px gutters.

### Don't
- Never use pure #fff for text or #000 for backgrounds — the warm cream and walnut shadow are the system; purity reads as wrong here.
- Never apply #dc5000 to buttons, CTAs, or interactive surfaces — the orange is editorial credit only.
- Never use lowercase or sentence-case for headings, nav, or labels; the only mixed-case text is the 29px body description.
- Never add drop shadows to cards, buttons, or sections — depth comes from the two-step surface stack (#100904 → #382416), not from blur.
- Never use border-radius below 12px on containers — the geometry is deliberately chunky, not sharp.
- Never use more than one filled button per section; restraint is the design language.
- Never center-align body copy — headings and body text are always left-aligned, even when flanking a centered image.

## Elevation

The system rejects shadow-based elevation entirely. Depth is achieved through a two-step surface stack: #100904 (canvas) → #382416 (elevated solid). There are no blur, no offset, no opacity-based shadows — only a 1–2 value luminance step. This keeps the interface flat and editorial, letting the 3D product renders provide all visual depth in void-mode sections.

## Surfaces

- **Walnut Shadow** (`#100904`) — Full-bleed page canvas and section background
- **Bark Brown** (`#382416`) — Filled button surface, the only elevated solid
- **Cork Border** (`#40372`) — Hairline borders, dashed dividers, card outlines
- **Warm Cream** (`#ffedd7`) — Foreground text, navigation, interactive borders

## Imagery

Photography is editorial, top-down, and in-context: the cork coaster sits on a green cutting mat surrounded by pencils, a craft knife, and a paperclip — tools of the craft visible in frame. The green cutting mat (#445231) is a hero-only element, not a UI token. 3D renders dominate the product reveal sections: the cork coaster is shown isolated against Walnut Shadow, lit from the upper right with a warm rim light, rotating from top-down to 3/4 angle between sections. No lifestyle photography, no people, no stock imagery — the object is the hero and the tools are its context. Images are full-bleed, sharp-edged (no rounded masks), and treated with high contrast and warm grading.

## Layout

Full-bleed throughout — no max-width container, every section spans 100vw. Hero: full-viewport top-down photograph with a massive ORYZO wordmark (51px+) in the upper-left, tagline above, fixed minimal nav upper-right, vertical sidebar label running down the right edge, semi-transparent info card lower-left, video thumbnail lower-right. Subsequent sections: full-viewport Walnut Shadow canvas with a centered 3D product render flanked by left-aligned heading and right-aligned body copy — a three-column grid (text / object / text) with generous 18px gutters. Section transitions are seamless dark-on-dark; the only breaks are hairline dashed dividers. Navigation is fixed, transparent, and 4 items max. No sidebar, no footer chrome, no cards-within-cards — every screen is a single statement.

## Similar Brands

- **Lusion (the studio credited in the design)** — Same warm-dark editorial canvas, single-product hero treatment, pill-button controls, and 3D product renders as the visual centerpiece
- **Active Theory** — Full-bleed dark mode with a single interactive 3D object commanding the viewport, minimal UI chrome, and oversized uppercase type
- **Resn** — Editorial product-showcase sites with top-down craft photography, warm grading, and typography that steps back to let the object speak
- **Tool of North America** — Studio portfolio sites that treat a single concept object with museum-presentation gravity — dark void, cream labels, generous negative space
- **Buck (studio)** — Work-reveal layouts that alternate between photographic context and isolated product renders against near-black backgrounds
