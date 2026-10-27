# Airbnb — Style Reference
> Quiet white gallery wall with one coral-red bookmark

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Airbnb operates on a white-canvas, photograph-first vocabulary: nearly every screen is a quiet monochrome frame that lets full-bleem property imagery carry the experience, with a single saturated coral-red accent (Rausch) as the only chromatic punctuation for action. Typography is set in a custom geometric sans (Airbnb Cereal VF) at mostly small, confident sizes — 14px body, 16px UI, 22–28px section titles — with tight negative tracking and generous line-height that keeps dense listing cards readable. The interface is flat, borderless, and rounded: 12–14px radii on cards and controls, pill-shaped circular buttons, and soft layered shadows only for elevated overlays like the search bar. Everything else — cards, list items, links — relies on whitespace and hairlines rather than chrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Rausch | `#ff385c` | Red decorative accent for icons, marks, and small graphic details. Do not promote it to the primary CTA color |
| Rausch 600 | `#e00b41` | Pressed and dark-state variant of Rausch for hover/active surfaces of the brand accent |
| Hof | `#222222` | Primary text, body copy, headings, icon strokes, and inverse backgrounds — a near-black neutral that anchors the entire achromatic system |
| Foggy | `#6a6a6a` | Secondary text, muted labels, helper copy, disabled icon fills, and subdued metadata beneath card titles |
| Grey 500 | `#c1c1c1` | Disabled text, placeholder text in inputs, and muted icon strokes where state de-emphasis is required |
| Bebe | `#ebebeb` | Hairline borders, input underlines, dividers between list rows, and subtle separator lines |
| Deco | `#dddddd` | Card surface backgrounds for muted containers, skeleton placeholders, and disabled card states |
| Faint | `#f7f7f7` | Page canvas background, footer surface, and hover state for interactive surfaces — the soft off-white that sets the page apart from pure white cards |
| White | `#ffffff` | Elevated card surfaces, input fields, modals, and the primary surface against the off-white canvas |

## Typography

### Airbnb Cereal VF — Custom geometric sans designed for Airbnb. Body at 14px/400 carries most content; UI labels at 16px/500; section headings step up through 20px/600, 22px/500 with tight -0.02em tracking, and 28px/700 for page-level titles. Negative tracking tightens as size increases, a hallmark of geometric sans at display sizes. Activates the 'salt' alternate glyph feature.
- **Substitute:** Circular, Inter, or DM Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 11px, 12px, 13px, 14px, 16px, 20px, 21px, 22px, 28px
- **Line height:** 1.18–1.43
- **Letter spacing:** Display 22px: -0.0200em; body 20px: -0.0090em; all other sizes: normal
- **OpenType features:** `"salt" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.18 | 0px |
| ui | — | — | 16px | 1.25 | 0px |
| subheading | — | — | 20px | 1.2 | -0.18px |
| heading-sm | — | — | 22px | 1.18 | -0.44px |
| heading | — | — | 28px | 1.43 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 48px
- **Card padding:** 12px
- **Element gap:** 12px

### Border Radius

- **cards:** 12px
- **badges:** 9999px
- **inputs:** 8px
- **avatars:** 9999px
- **buttons:** 9999px
- **search-bar:** 9999px

## Components

### Search Bar (Floating Capsule)
**Role:** Primary global search input — the signature element of the homepage

Full-width rounded capsule (border-radius: 9999px), white surface (#ffffff), three segmented fields (Where, When, Who) separated by vertical dividers, 16px/500 labels with 14px/400 placeholder text in #6a6a6a. Surrounded by a layered shadow stack at 0/2/4/8px with decreasing opacity. Right-aligned circular submit button in Rausch (#ff385c), 48px diameter, white search icon, white-on-coral hover state. Container max-width approximately 880px, centered.

### Property Listing Card
**Role:** Repeating content card in horizontal scroll rows

Rounded container at 12–14px radius, no border, white or transparent background. Image area is the full card width at roughly 1:1 aspect with 12px radius, overflowing slightly with the heart wishlist icon in the top-right corner. Title below in 14px/500 #222222, truncated to one line. Metadata line (host type, dates) in 14px/400 #6a6a6a. Price line in 14px/400 #222222 with the price in 14px/600 #222222. No padding between image and text — they share a 12px gutter.

### Guest Favorite Badge
**Role:** Trust badge overlay on listing images

Small white pill (border-radius: 9999px), white #ffffff background, 12px/600 text in #222222, positioned in the top-left of listing card images. Padding approximately 6px 12px. Subtle shadow to separate from the photograph.

### Wishlist Heart Button
**Role:** Save/favorite toggle on listing cards

Circular transparent button (border-radius: 9999px), no background fill, positioned absolute top-right of card image. Heart icon stroke in white when inactive, fill in Rausch (#ff385c) when active. 48px touch target, icon centered at approximately 20px.

### Top Navigation Bar
**Role:** Primary site navigation

Fixed top bar on white background, 80px height. Left: Airbnb logo in Rausch (#ff385c). Center: tab navigation (All, Homes, Experiences, Services) with icon + label pairs in 16px/500, active tab underlined with a 2px black (#222222) bar, inactive tabs in #6a6a6a. Right: 'Become a host' link in 14px/500 #222222, language globe icon, and hamburger menu button (circular, 40px, #f7f7f7 background).

### Circular Nav Button
**Role:** Icon-only navigation control for category tabs

Perfectly round button (border-radius: 9999px), 40px diameter, #f7f7f7 background. Icon stroke in #222222 at 16px. Hover lifts to #ebebeb. Used for the hamburger menu and language selector in the top-right.

### Pill Navigation Tab
**Role:** Category selection tab in top nav

Pill-shaped tab with icon + label, active state shows a 2px black underline beneath the icon. Inactive text in #6a6a6a, active in #222222. 16px/500. No background fill — sits directly on white.

### Section Title with Arrow
**Role:** Row heading for horizontal scroll sections

Title in 22px/500 #222222 with tight -0.02em tracking, followed by a right-pointing arrow icon in #222222 at the same baseline. No underline, no decoration — the arrow implies navigability. Right-aligned carousel arrows in circular 40px buttons with #f7f7f7 background and #222222 chevron.

### Carousel Arrow Button
**Role:** Horizontal scroll navigation for listing rows

Circular 32px button, white #ffffff background with subtle shadow, positioned vertically centered on the row. Chevron icon stroke in #222222. Disabled state: #c1c1c1 chevron, reduced opacity.

### Ghost Outline Button
**Role:** Secondary action button

Transparent background, 1px solid #222222 border, #222222 text, border-radius: 8px, padding 0px 16px. 14px/500. No shadow. Hover: #f7f7f7 background fill.

### Filled Inverse Button
**Role:** Primary non-brand action button

Solid #222222 background, white #ffffff text, border-radius: 8px, padding 0px 16px. 14px/500. Used where Rausch would be too loud for the action hierarchy.

### Category Icon Button
**Role:** Grid icon for browse-by-category navigation

Square or rectangular button (border-radius: 8px) with icon centered above label. Icon in #222222 at 24px, label in 12px/400 #6a6a6a. Transparent background. No border.

### Footer Column Link
**Role:** Secondary site links in footer

14px/400 text in #6a6a6a, no underline, no padding. Hover: text color shifts to #222222. Arranged in multi-column grid with 12px row gap. Column headers in 14px/600 #222222.

### Social Icon Link
**Role:** Brand social links in footer

Circular icon-only button (border-radius: 9999px), 32px, transparent background, icon stroke or fill in #222222. Inline horizontal row in footer.

### Language/Currency Selector
**Role:** Locale controls in footer

Inline text + icon pair, 14px/500 #222222, globe icon to the left. No background, no border. Sits between the copyright text and social icons at the very bottom of the page.

## Do's and Don'ts

### Do
- Set body text at 14px/400 in Hof (#222222) with 1.43 line-height — this is the content backbone.
- Use Rausch (#ff385c) exclusively for the brand logo, search submit, active wishlist hearts, and one primary action per surface. No other reds.
- Give all listing card images a 12px border-radius and let them overflow into the card edge — no padding between image and text below.
- Use border-radius: 9999px for the search bar, pill buttons, wishlist hearts, and circular icon buttons. Use 12px for listing cards and 8px for ghost buttons.
- Set section headings at 22px/500 with -0.0200em letter-spacing — the tight tracking is a geometric-sans signature at that size.
- Place the page canvas at #f7f7f7 and cards at #ffffff so elevation reads through value contrast, not just shadow.
- Keep property imagery full-bleed within its card frame — no margins, no decorative borders around photographs.

### Don't
- Don't introduce additional accent colors beyond Rausch — the 0% colorfulness of the interface is deliberate; every additional hue dilutes the brand.
- Don't use shadows on listing cards. The visual system uses flat surfaces with whitespace, not elevation, to separate content.
- Don't set body text below 12px — the scale bottoms out at 11px for badges only.
- Don't round corners at inconsistent radii — the system has exactly two sizes for cards (12px and 14px) and full-pill (9999px) for interactive controls.
- Don't use borders on listing cards. Separation comes from the off-white canvas vs white card surface, not from lines.
- Don't apply Rausch to text or decorative elements — it is an action color, not a brand paint color for backgrounds or headings.
- Don't use bold (700) for body or metadata text — 700 is reserved for the 28px page titles and 21px card-titles emphasis; everything else is 400–600.

## Elevation

- **Search bar:** `0px 0px 0px 1px rgba(0,0,0,0.02), 0px 2px 6px 0px rgba(0,0,0,0.04), 0px 4px 8px 0px rgba(0,0,0,0.10)`
- **Elevated overlay (modal, popover):** `0 8px 28px rgba(0,0,0,0.28)`
- **Dropdown / menu:** `0 6px 20px rgba(0,0,0,0.2)`
- **Tooltip:** `0 2px 4px rgba(0,0,0,0.18)`

## Surfaces

- **Canvas** (`#f7f7f7`) — Page background — soft off-white that recedes behind all content
- **Card** (`#ffffff`) — Property listing cards, search inputs, navigation pills — the primary interactive surface
- **Muted Surface** (`#dddddd`) — Skeleton/placeholder card backgrounds and disabled card states
- **Inverse** (`#222222`) — Dark mode surfaces, inverse buttons, high-contrast overlays

## Imagery

Photography dominates the visual system — full-bleed property images are the primary content type. All photographs are warm, well-lit interior and exterior shots of real homes and hotels, treated with natural color grading (no heavy filters or duotones). Images are tightly cropped at 1:1 aspect ratio for listing cards, filling the card edge with no margin. Icons throughout the interface are outlined, monochrome (#222222 stroke, ~16–20px), used sparingly for navigation categories and UI controls. The logo is the only multicolor graphic element (Rausch). No illustrations, no 3D renders, no abstract graphics — the visual language is pure photography + minimal monochrome iconography on a soft white canvas.

## Layout

Full-bleed layout with no fixed max-width constraint — content stretches edge to edge within the viewport, with internal horizontal padding of approximately 40px on each side at desktop. The hero is the floating search capsule centered on a quiet white canvas with no hero image or headline — the search bar IS the hero. Below the search, the page flows into vertically stacked horizontal-scroll sections (4 rows visible: Popular homes, Great hotels, another city, Available next month), each at roughly 320px tall, separated by 48px vertical gaps. Each section uses a 7-up card grid with horizontal overflow and arrow navigation. The footer is a 3-column link grid on #f7f7f7 background, followed by a bottom bar with copyright, language/currency, and social icons. Navigation is a fixed top bar with centered tab navigation and right-aligned utility controls.

## Similar Brands

- **Booking.com** — Same white-canvas approach with property-image-led cards, but Booking uses blue accents instead of coral
- **Vrbo** — Same full-bleed photography card pattern in horizontal scroll rows, similar card radii and metadata hierarchy
- **Tripadvisor** — Same image-first listing grid layout with title + metadata + price beneath, similar typographic scale
- **Linear** — Same near-monochrome UI philosophy with one saturated accent color and geometric sans typography, though Linear is darker
