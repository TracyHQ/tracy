# 1X Tech — Style Reference
> 1X Tech — quiet domestic cinema. A pale editorial page opens into cinematic scenes of people and a humanoid robot, with interface chrome reduced to tiny spaced labels and soft monochrome pills.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

1X Tech frames robotics as an intimate household presence through full-bleed, filmic photography rather than technical diagrams. The interface alternates an almost-white editorial canvas with occasional charcoal scenes; centered 56px medium-weight statements sit above oversized rounded image windows. Typography is restrained and human, while compact uppercase navigation and pill controls supply the product-system precision around warm, lived-in imagery.

## Colors

| Name | Value | Role |
|------|-------|------|
| Gallery White | `#f7f7f7` | Page canvas, light section bands, footer background |
| Paper White | `#ffffff` | Overlay type, white order pills, light media and control surfaces |
| Charcoal Field | `#222222` | Dark hero and dark feature-section backgrounds |
| Graphite | `#474747` | Primary editorial text and dark filled order controls |
| Quiet Gray | `#8f8f8f` | Secondary labels, subdued links, inactive supporting UI |
| Steel Gray | `#808080` | Inactive local-navigation labels |
| Ink | `#0a0a0a` | Unfilled control text and highest-emphasis dark text |
| Control Mist | `#d6d6d6` | Muted pill-control fills and subdued control states |

## Typography

### ABCDiatype — Default reading, product descriptions, utility buttons, pricing detail, and small spaced navigation. Normal tracking carries body copy; 10px uppercase labels expand to 1.28px tracking.
- **Substitute:** Arial, Helvetica Neue, sans-serif
- **Weights:** 400
- **Sizes:** 10px, 12px, 14px, 16px, 20px, 24px
- **Line height:** 1.00, 1.30, 1.40, 1.50, 1.60
- **Letter spacing:** 0px for reading text; 0.88px at 11px and 1.28px at 10px for uppercase utility labels

### ABCDiatypeMedium — The 56px section headline is medium rather than bold, allowing the photography to carry the visual weight; 11px uppercase navigation uses the same family with measured spacing.
- **Substitute:** Arial, Helvetica Neue, sans-serif
- **Weights:** 500
- **Sizes:** 11px, 56px
- **Line height:** 1.20, 1.82
- **Letter spacing:** 0px at 56px; 0.88px at 11px uppercase

### ABCDiatypeBold — Use for compact product names, emphasized inline identifiers, and the 24px hero product title; reserve the 2.2px tracked 11px treatment for compact labels.
- **Substitute:** Arial Bold, Helvetica Neue Bold, sans-serif
- **Weights:** 700
- **Sizes:** 11px, 16px, 20px, 24px
- **Line height:** 1.30, 1.40
- **Letter spacing:** 0px at 16–24px; 2.2px at 11px uppercase

### ui-sans-serif — ui-sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| utility-label | ABCDiatype | 400 | 10px | 1 | 1.28px |
| global-nav | ABCDiatypeMedium | 500 | 11px | 1.82 | 0.88px |
| utility-button | ABCDiatype | 400 | 12px | 1.4 | 0px |
| supporting-detail | ABCDiatype | 400 | 14px | 1.4 | 0px |
| utility-text | ABCDiatype | 400 | 16px | 1.5 | 0px |
| order-button | ABCDiatype | 400 | 16px | 1.3 | 0px |
| product-identifier | ABCDiatypeBold | 700 | 16px | 1.3 | 0px |
| section-body | ABCDiatype | 400 | 20px | 1.3 | 0px |
| hero-product-title | ABCDiatypeBold | 700 | 24px | 1.3 | 0px |
| section-heading | ABCDiatypeMedium | 500 | 56px | 1.2 | 0px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 32px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **cards:** 0px
- **links:** 9999px
- **pills:** 9999px
- **images:** 80px
- **buttons:** 9999px

## Components

### Transparent Global Header
**Role:** Overlay navigation on cinematic hero imagery

Use white #ffffff ABCDiatypeMedium navigation at 11px/20px, weight 500, uppercase with 0.88px tracking. Keep the header visually unboxed over the image; use 32px horizontal guttering and a compact 40px navigation gap.

### Light Product Navigation
**Role:** Local navigation for the product story

Set the local bar on Gallery White #f7f7f7 with Graphite #474747 product identification and 10px–11px uppercase labels. Separate utility controls as 9999px pills with 6px 12px padding.

### Dark Order Pill
**Role:** High-emphasis order control on light surfaces

Fill with Graphite #474747, set text in Paper White #ffffff, use ABCDiatype 12px/16.8px or 20px/26px, and apply a 9999px radius with 6px vertical and 12px horizontal padding.

### White Hero Order Pill
**Role:** Order control placed over dark photographic imagery

Use a Paper White #ffffff fill with Graphite #474747 ABCDiatype at 16px/20.8px. Keep the control fully pill-shaped at 9999px radius and visually isolated from the centered hero copy.

### Muted Utility Pill
**Role:** FAQ and secondary local-navigation controls

Use Control Mist #d6d6d6 or a transparent surface, Graphite #474747 text, a 1px #e5e5e5 border where defined, and a 9999px radius. Apply 6px 12px padding for labeled controls.

### Bare Text Control
**Role:** Low-chrome navigation or disclosure control

Use a transparent background, Ink #0a0a0a or Graphite #474747 text, 0px radius, and no internal padding. Keep its visual emphasis typographic rather than container-based.

### Cinematic Hero Stage
**Role:** Opening product introduction

Use a full-bleed, edge-to-edge photograph with centered white overlay copy: ABCDiatypeBold 24px/31.2px for the product name, ABCDiatype 24px/31.2px for the descriptor, and ABCDiatype 14px/19.6px for deposit detail. Do not place this content inside a card.

### Editorial Section Introduction
**Role:** Centered lead-in above feature media

Set the section on Gallery White #f7f7f7 with a centered Graphite #474747 ABCDiatypeMedium heading at 56px/67.2px. Use ABCDiatype body copy beneath at 20px/26px and reserve a 16px text-to-text gap.

### Rounded Feature Media Window
**Role:** Contained photography and product-film content

Present warm documentary photography in a large image frame with an 80px radius and no visible border or shadow. Keep the image as the dominant object below the centered editorial introduction.

### Dark Story Section
**Role:** High-contrast chapter within the product narrative

Use Charcoal Field #222222 as the full section surface and Paper White #ffffff for the 56px/67.2px ABCDiatypeMedium heading. Keep supporting controls as white or dark monochrome pills rather than introducing a chromatic accent.

### Unframed Content Card
**Role:** Structural grouping inside the page flow

Use a transparent background, 0px radius, no shadow, and no internal padding. Distinguish groups through image scale, whitespace, and text alignment instead of bordered boxes.

### Pale Footer
**Role:** Closing navigation surface

Use Gallery White #f7f7f7 as the footer surface with Quiet Gray #8f8f8f for subdued link text and 32px horizontal gutters. Retain the small uppercase ABCDiatype label treatment where navigation is compact.

## Do's and Don'ts

### Do
- Use Gallery White #f7f7f7 as the dominant canvas and reserve Charcoal Field #222222 for complete cinematic chapters.
- Set editorial section headings in ABCDiatypeMedium at 56px/67.2px, weight 500, with 0px tracking.
- Use an 80px radius for large contained photography and product-film frames.
- Use 9999px radius for every labeled pill control, with 6px 12px padding on compact controls.
- Set global navigation in ABCDiatypeMedium at 11px/20px, uppercase, with 0.88px letter-spacing.
- Use Graphite #474747 for dark filled order controls and Paper White #ffffff text within them.
- Keep ordinary content groups unframed at 0px radius with no box shadow.

### Don't
- Do not introduce saturated accent colors; the interface palette remains achromatic from #ffffff through #222222.
- Do not set primary section headlines in bold; use ABCDiatypeMedium weight 500 at 56px/67.2px.
- Do not use small 8px or 16px image rounding; feature media uses 80px radius.
- Do not add drop shadows to content cards, media windows, or section containers.
- Do not turn every control into a dark fill; use transparent bare controls and Control Mist #d6d6d6 utility pills beside Graphite #474747 order pills.
- Do not use dense body leading below the measured 20px/26px or 24px/31.2px text treatments.
- Do not use title-case navigation labels where the measured navigation calls for 11px uppercase text with 0.88px tracking.

## Elevation

Avoid elevation entirely: cards are transparent, borderless, and shadowless. Depth comes from full-bleed photography, the 80px crop radius, and abrupt transitions between Gallery White #f7f7f7 and Charcoal Field #222222.

## Surfaces

- **Gallery White** (`#f7f7f7`) — Default page canvas, light sections, and footer
- **Paper White** (`#ffffff`) — Overlay text and bright pill surfaces
- **Control Mist** (`#d6d6d6`) — Subdued utility-control fill
- **Charcoal Field** (`#222222`) — Dark photographic and feature-section field

## Imagery

Photography is the primary visual language: staged but intimate domestic scenes show older adults and the humanoid robot sharing a home, while macro product photography reveals soft materials and engineered details. The opening image is full-bleed and used as a text-bearing cinematic stage; later photographs are contained in huge 80px rounded windows on a pale canvas. Images are warm and naturally lit indoors, with textured furnishings, skin tones, and tactile materials offsetting the monochrome interface. There are no prominent illustrative systems or decorative icon fields; visual space is image-dominant, with each editorial text block acting as a quiet caption for one large frame.

## Layout

The page is a long, full-bleed product narrative. It opens with a photographic hero that fills the viewport and carries centered overlay product copy, a small white order pill, and transparent global navigation across the top. Subsequent chapters return to a pale centered editorial composition: a slim local product bar, centered headline and supporting paragraph, then an oversized rounded 80px photographic window. The rhythm alternates these pale story sections with occasional full-width charcoal chapters, while content remains spacious and vertically sequenced rather than arranged as dense card grids. Navigation appears as a minimal top bar plus a local product-navigation bar, with compact pill utilities clustered at the right.

## Similar Brands

- **Apple** — Large centered medium-weight product statements, near-monochrome controls, and cinematic product photography used as the dominant page structure.
- **Figure AI** — Humanoid robotics presented through human-scale product storytelling rather than dashboard-like technical UI.
- **Tesla** — Full-bleed hero imagery, sparse overlaid navigation, and monochrome pill ordering controls.
- **Humane** — Editorial hardware storytelling that lets lifestyle photography and highly reduced interface chrome share the page.
