# Hugging Face — Style Reference
> Friendly ML workshop on white paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Hugging Face operates as a friendly, utilitarian machine-learning workshop: nearly all-white canvas, hairline gray dividers, and compact, data-dense rows that feel like reading a spreadsheet. The brand voice arrives through a single warm yellow emoji logo (🤗) and one dark navy panel per page that acts as a stage for that mascot — everything else stays in grayscale so the yellow never has to compete. Typography is one workhorse humanist sans (Source Sans Pro) carrying the full hierarchy from 10px metadata to 96px display, with IBM Plex Mono punching in only for model names and technical labels. Components are flat, low-elevation, and rounded at a tight 8px — the interface reads more like a research tool than a marketing site, letting the 2M+ models and datasets be the visual content.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Page background, card surfaces, input fields |
| Cloud Gray | `#f3f4f6` | Secondary surface, subtle card backgrounds, tag fills |
| Mist Border | `#e5e7eb` | Hairline dividers, card borders, input borders, the dominant structural line color |
| Fog Border | `#d1d5dc` | Slightly stronger dividers, placeholder text on inputs |
| Ink Black | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Midnight Panel | `#101828` | Dark hero panel background, dark navigation wells — the high-contrast stage for the mascot |
| Deep Night | `linear-gradient(to right bottom, #2c3344 0%, #0b0f19 100%)` | Deepest panel surface used in gradients and product UI previews; Hero panel and product preview gradient — subtle two-stop from slate to near-black |
| Slate Body | `#4a5565` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Steel Caption | `#6a7282` | Metadata, timestamps, helper text, nav links, muted icon fills |
| Ash Disabled | `#99a1af` | Tertiary text, inactive icons, disabled controls, the quietest neutral |
| Hugging Yellow | `#ffd210` | The 🤗 emoji logo mark — the only warm color in the system, appears as a small brand stamp |
| Link Blue | `#155dfc` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |

## Typography

### Source Sans Pro — The single workhorse family — handles every UI surface from 10px metadata to 96px display headlines. Weight 400 carries body and most UI; 600 takes section labels and button text; 700 is reserved for the largest headlines where the humanist letterforms need extra weight to hold the page.
- **Substitute:** Inter, IBM Plex Sans, system-ui
- **Weights:** 400, 600, 700
- **Sizes:** 10, 12, 13, 14, 15, 16, 18, 20, 24, 30, 48, 60, 96
- **Line height:** 1.20–1.56 body, 1.00–1.25 display

### IBM Plex Mono — Technical identifiers — model names like moonshatai/Kimi-K2.5, dataset slugs, parameter values, repo paths. The monospace grid signals 'this is a machine-readable handle' and gives the interface a workshop feel.
- **Substitute:** JetBrains Mono, IBM Plex Mono, ui-monospace
- **Weights:** 400
- **Sizes:** 15
- **Line height:** 1.60

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | — |
| body | — | — | 14px | 1.5 | — |
| body-md | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.4 | — |
| heading-sm | — | — | 20px | 1.37 | — |
| heading | — | — | 24px | 1.33 | — |
| heading-lg | — | — | 30px | 1.25 | — |
| display | — | — | 48px | 1.2 | — |
| display-lg | — | — | 60px | 1 | — |
| hero | — | — | 96px | 1 | — |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **nav:** 4px
- **tags:** 4px
- **cards:** 8px
- **inputs:** 8px
- **buttons:** 8px
- **pillButtons:** 25.6px
- **largeContainers:** 12px

## Components

### Midnight Hero Panel
**Role:** Primary hero block anchoring the top of the page

Dark gradient panel (#101828 → #0b0f19) with generous padding (~48px), the 🤗 emoji at ~60–80px, 48px weight 700 white headline, 16px Slate Body description, and a dark pill button. This is the one place the page gets loud — the rest of the site whispers.

### Dark CTA Button (Ink)
**Role:** Primary call-to-action on the dark hero

Solid Ink Black background (#000000), white text, 8px radius, ~10px 20px padding, 14px Source Sans Pro weight 600. Sits on the midnight panel so the contrast inverts — a black button on a near-black background reads as a recessed well.

### Ghost Secondary Button
**Role:** Companion action next to the primary CTA

Transparent background with white text and a thin white border at low opacity, same 8px radius and 14px weight 600. Labeled with a small 'or' divider between it and the primary.

### Sign Up Pill Button
**Role:** Account creation in the top nav

Black fill, white text, fully rounded ~25.6px radius (pill), 8px 16px padding, 14px weight 600. The pill shape distinguishes auth actions from inline controls.

### Top Navigation Bar
**Role:** Global header

White background, ~56px tall, left-aligned 🤗 logo + 'Hugging Face' wordmark in weight 700 16px, centered search input, right-aligned nav links in 14px Steel Caption with an active state in Link Blue (#155dfc). Sticky on scroll.

### Search Input
**Role:** Global model/dataset/user search

White fill, 1px Mist Border (#e5e7eb), 8px radius, ~10px 16px padding, 14px body placeholder in Steel Caption, left-aligned 🔍 icon. Wide — takes ~40% of header width.

### Trending Column Card
**Role:** One of three side-by-side cards in the 'Trending' row (Models, Spaces, Datasets)

White surface, 1px Mist Border, 8px radius, 16px padding, 18px weight 600 column header, then a vertical list of 5 entries. Each entry is a model name in IBM Plex Mono 15px weight 400 (Slate Body color), with a 12px Steel Caption metadata line below (relative time, download count, like count). No card shadow on the container — only the faintest hairline separates it from the canvas.

### Spaces Card (Gradient)
**Role:** Entry in the middle 'Spaces' column

Unlike the model/dataset cards, Spaces cards carry vivid color gradients (teal→green, red→pink, blue→indigo, purple→violet). 8px radius, 16px padding, white text, small 🔥 emoji + like count, and the space title in weight 600 14px white.

### Stat List Item
**Role:** Row inside a trending column

Two-line stack: model/dataset name in IBM Plex Mono 15px, metadata line in 12px Steel Caption showing relative time, download icon + count, and heart icon + count. 12px vertical gap between rows, no row dividers — whitespace does the separation.

### Browse Link Button
**Role:** Footer action under each trending column

Centered, 14px Link Blue, plain text with underline-on-hover, no background. Sits ~24px below the last list item.

### Logo Wordmark
**Role:** Brand mark in nav and footer

🤗 emoji at ~24px next to 'Hugging Face' in Source Sans Pro weight 700 16px Ink Black. The emoji is the brand — the wordmark is the caption.

### Dark Product Preview Card
**Role:** Screenshot-style product UI shown beside the hero copy

A ~560px wide floating panel with the same midnight gradient, 12px radius, faint shadow, containing a mock filter sidebar and model list. This is the only place shadows and larger radii appear — it acts as a 'window' into the product.

### Filter Sidebar
**Role:** Left column in the product preview

Dark surface with section headers in 12px uppercase Steel Caption, checkbox/filter rows in 14px white, tag chips with colored emoji prefixes (🐍 PyTorch, 🌊 TensorFlow, ⚡ JAX). Tag chips are 4px radius, 6px 10px padding, dark fill with white text.

## Do's and Don'ts

### Do
- Use Source Sans Pro weight 400 for all body and list text; reserve weight 700 for the largest headlines and weight 600 for button labels and section headers.
- Set cards and inputs to 8px radius and tags/small chips to 4px radius; only auth pills get the 25.6px full-round.
- Keep the page on #ffffff canvas with #e5e7eb hairline borders — let the single midnight hero panel be the only dark surface on the page.
- Use IBM Plex Mono 15px for any model name, dataset slug, repo path, or technical identifier — the monospace grid signals 'this is a handle, not prose'.
- Reference the 🤗 emoji as the brand mark; it is the only warm color allowed in the system and should stay small (16–80px).
- Apply 2px vertical padding for tight metadata rows and 8px row gaps inside lists to keep the data-dense spreadsheet feel.
- Use Link Blue (#155dfc) sparingly — active nav state, focused link, and a single accent per view. Never as a fill.

### Don't
- Don't introduce additional brand colors or gradient backgrounds on white sections — the gradient Spaces cards are the only exception, and only in the trending column.
- Don't stack shadows deeper than a single 1px-y layer; the design rejects heavy elevation.
- Don't use Source Sans Pro below 10px or above 96px; the scale is the scale.
- Don't round buttons to 8px and pills to 25.6px in the same row — the radius difference carries semantic meaning (control vs action).
- Don't apply the midnight gradient (#101828) to anything other than the hero panel and product preview — the rest of the page is white.
- Don't use the yellow logo color (#ffd21e) as a fill for buttons, backgrounds, or text — it lives only in the emoji.
- Don't use 0px or 6px letter-spacing on display sizes; Source Sans Pro's humanist forms need their default tracking at large sizes.

## Elevation

- **Card:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`
- **Button, Link:** `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Default page background, all content sits directly on white
- **Soft Surface** (`#f3f4f6`) — Subtle background tone for tags, code blocks, secondary card wells
- **Midnight Panel** (`#101828`) — Dark hero block and product preview surfaces — creates the dark/light yin-yang

## Imagery

Imagery is minimal and utilitarian. The 🤗 emoji is the primary visual asset — used at logo size (24px) and as a large brand stamp (60–80px) inside the dark hero. The only product 'imagery' is a screenshot-style dark UI panel showing filters and model lists, which functions as proof-of-product rather than lifestyle photography. No human photography, no abstract illustrations, no decorative graphics. The 2M+ models and datasets ARE the visual content — each row in the trending columns carries a tiny color emoji (🐍, 🌊, 🔥, etc.) that acts as the only chromatic punctuation.

## Layout

Centered max-width ~1200px container with generous horizontal padding. Hero is an asymmetric two-column split: dark midnight panel on the left (~55%) carrying the headline and CTAs, floating product preview card on the right (~45%) with a slight negative offset. Below the hero, a clean 3-column equal-width grid for Models/Spaces/Datasets, then a centered single-column 'The Home of Machine Learning' closer with a book emoji. Vertical rhythm is built from 64px section gaps and consistent 8px element gaps. Navigation is a single sticky top bar — no sidebar, no mega-menu, no footer in the main view.

## Similar Brands

- **GitHub** — Same utilitarian data-dense list pattern with monospace identifiers, hairline gray borders, and one dark accent (the GitHub dark mode) contrasting a white canvas
- **npm** — Identical ingredient-list aesthetic — white canvas, 8px-radius cards, package names in monospace, copy-paste install commands, zero decorative imagery
- **Replicate** — AI/ML platform using the same single-mascot hero strategy with a dark product panel floating beside white headline copy
- **Vercel** — Minimal black-on-white typography hierarchy with one dark inverted surface for the hero and the rest of the page left to typography and whitespace
- **Papers with Code** — Research-platform list density with the same compact 2px vertical padding rhythm and monochrome-with-one-accent color discipline
