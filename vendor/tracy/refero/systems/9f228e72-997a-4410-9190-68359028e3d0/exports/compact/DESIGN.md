# Craft Docs — Style Reference
> Digital Scrapbook Collage. The design feels like a thoughtful, tactile scrapbook where structured digital notes meet soft, organic textures.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The design aesthetic is gentle, creative, and tactile, evoking the feeling of a personal journal or artist's scrapbook. This is achieved through a warm, off-white canvas (#fff3e7), a palette of soft pastels (#9bd8a9, #fde99b), and organic, torn-paper collage elements. The primary visual signature is the typographic pairing: a sophisticated, tightly-tracked serif (`UntitledSerifFont`) for large, literary headlines, contrasted with a clean, functional sans-serif (`UntitledSansFont`) for all UI and body text. Rounded corners (14px, 24px) are prevalent, but are punctuated by pill-shaped buttons, creating a soft and approachable interface. Deep, multi-layered shadows provide a subtle, non-intrusive sense of depth, making elements feel floated rather than stacked.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas | `#fff3e7` | Main page background, creating a warm, paper-like base. |
| Ink | `#030302` | Primary text, headlines, and filled UI elements. |
| White | `#ffffff` | Card surfaces, contrast text on dark backgrounds. |
| Linen | `#f7f7f7` | Secondary light backgrounds, subtle dividers. |
| Cloud | `#efefef` | Subtle container backgrounds, hover states. |
| Ash | `#e1e1e1` | Borders and dividers. |
| Stone | `#bebbba` | Secondary body text, disabled states. |
| Graphite | `#41413f` | Sub-headings and secondary text with more emphasis. |
| Mint | `#9bd8a9` | Decorative background shapes, UI tags — a primary brand pastel. |
| Marigold | `#fde99b` | Decorative background shapes, UI highlights — a warm primary brand pastel. |
| Periwinkle | `#b8caf5` | Decorative background shapes, UI highlights — a cool primary brand pastel. |
| Sky | `linear-gradient(in oklab, rgb(158, 212, 239) 0px, rgb(209, 238, 249) 100%)` | Hero background textures and atmospheric elements. |
| Papaya | `#ff4500` | Accent frames on cards, callouts within illustrations. |
| Azure | `#0087ff` | Interactive icons and links within product mockups. |

## Typography

### UntitledSerifFont — Used exclusively for large, impactful headlines (H1/H2). Its literary feel provides a signature contrast to the functional sans-serif UI, making statements feel personal and crafted.
- **Substitute:** Lora, Merriweather
- **Weights:** 400
- **Sizes:** 24px, 28px, 30px, 32px, 36px, 46px, 54px, 56px, 66px
- **Line height:** 1.05-1.2
- **Letter spacing:** Tight negative tracking at large sizes (e.g., -2.64px at 66px), normal at smaller sizes.
- **OpenType features:** `"liga"`

### UntitledSansFont — The workhorse font for all UI elements, including buttons, navigation, body copy, and captions. Provides clarity and readability.
- **Substitute:** Inter, Figtree
- **Weights:** 400, 500, 700
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 24px
- **Line height:** 1.4-1.5
- **Letter spacing:** Slightly negative tracking at subheading sizes (e.g., -0.72px at 24px), slightly positive at small sizes.
- **OpenType features:** `"liga"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.12px |
| body-sm | — | — | 14px | 1.5 | 0.14px |
| body | — | — | 16px | 1.5 | -0.24px |
| subheading | — | — | 24px | 1.4 | -0.72px |
| heading-sm | — | — | 36px | 1.2 | -0.72px |
| heading | — | — | 46px | 1.1 | -1.38px |
| heading-lg | — | — | 56px | 1.05 | -2.24px |
| display | — | — | 66px | 1.1 | -2.64px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 96-120px
- **Card padding:** 24px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 16-24px
- **pills:** 9999px
- **inputs:** 14px
- **buttons:** 14px

## Components

### Primary Pill Button
**Role:** The main 'Try Craft Free' call-to-action in the sticky navigation header.

A pill-shaped button (9999px radius) with an Ink (#030302) background and White (#ffffff) text. Features a subtle lift shadow on hover.

### Navigation Link
**Role:** Standard links within the main header navigation.

Unstyled text link using UntitledSansFont at 16px. Text color is Ink (#030302). A subtle underline or background color change appears on hover.

### Testimonial Quote
**Role:** Displays user feedback and social proof.

A large quotation in UntitledSerifFont, often italicized, in Ink (#030302). Attributed to a user with a small circular avatar and name in UntitledSansFont.

### Collage Background Element
**Role:** Decorative, atmospheric elements that make up the scrapbook aesthetic.

Abstract shapes with torn-paper edges, often filled with a brand pastel like Mint (#9bd8a9) or a simple dot/grid pattern. Layered behind content with low-opacity shadows.

## Do's and Don'ts

### Do
- Use `UntitledSerifFont` for all major headlines (H1, H2) to establish the brand's literary, crafted feel.
- Apply tight negative letter-spacing (e.g., -2.24px at 56px) to serif headlines for a professional, refined look.
- Layer torn-paper textures and soft pastel color blocks (`Mint`, `Marigold`) to create the signature collage aesthetic.
- Use the complex, multi-layered shadow style on all key floating elements like cards.
- Set main page content on the warm `Canvas` (#fff3e7) background, not pure white.
- Combine generous corner radii (14px, 24px) with pill-shaped buttons for a friendly, approachable UI.
- Maintain generous vertical whitespace (96px+) between content sections.

### Don't
- Don't use the serif font for UI controls, body copy, or any text smaller than 24px.
- Don't use pure black text; always use the softer `Ink` (#030302).
- Don't use hard, single-source drop shadows. Stick to the soft, deep, multi-layered shadow style.
- Don't use sharp 0px corners on buttons or cards.
- Don't use a pure white (#ffffff) page background for long-form content.
- Don't clutter the layout; prioritize spaciousness and clear, centered compositions.
- Don't use vibrant accent colors for large background surfaces; reserve them for small highlights or illustrative frames.

## Elevation

- **Primary Card, Floating UI Element:** `rgba(0, 0, 0, 0.01) 0px 50px 40px 0px, rgba(0, 0, 0, 0.02) 0px 50px 40px 0px, rgba(0, 0, 0, 0.05) 0px 20px 40px 0px, rgba(0, 0, 0, 0.08) 0px 3px 10px 0px`
- **Hovered Button, Dropdown Menu:** `rgba(0, 0, 0, 0.1) 0px 12px 12px 2px, rgba(0, 0, 0, 0.06) 0px 2px 4px -1px`
- **Navigation Bar:** `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`

## Imagery

The visual language is a distinctive collage of clean UI screenshots and tactile, analog textures. Imagery includes torn paper edges, subtle grid patterns, and flat pastel color fields that frame or sit behind product mockups. This juxtaposition of digital precision and physical craft is central to the brand. Photography is used sparingly for user testimonials, appearing within small, rounded frames. The overall effect is approachable and creative, suggesting that the digital tool is a space for tangible, real-world ideas.

## Layout

The page begins with a full-bleed, textured hero section that immerses the user. Below this, the layout transitions to a centered, max-width container (approx. 1280px) on a warm Canvas background. Generous vertical spacing (~96-120px) separates content sections, creating a calm, unhurried rhythm. Content is typically arranged in centered stacks for major headlines or simple, balanced grids for features (e.g., a five-column grid of icons and labels). The design avoids complex, asymmetric layouts in favor of clear, centered compositions that feel stable and easy to parse.

## Similar Brands

- **Pitch** — Similar use of an elegant serif for headlines contrasted with a clean sans-serif for UI, creating a premium, polished feel.
- **Miro** — Shares a creative, collaborative spirit, using collage-like elements and a wide color palette to feel like a digital workspace.
- **Notion** — Direct competitor in the notes/docs space. While Notion is more minimalist and monochrome, both share a focus on clean typography and a highly functional core UI.
- **Dropbox Paper** — Also focuses on a clean, distraction-free writing experience with a simple, typography-forward interface.
