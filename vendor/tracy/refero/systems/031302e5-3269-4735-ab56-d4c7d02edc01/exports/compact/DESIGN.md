# ProtoPie — Style Reference
> sunlit prototyping workshop with violet ink — a designer's clean white drafting table where one electric purple pencil marks every interactive idea.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ProtoPie uses a sunlit prototyping-workshop language: a white canvas, near-black ink, and one confident violet that functions as the only chromatic voice in the system. Display type is set in Gilroy at generous sizes (48–62px) with weight 700, giving headlines a friendly, designer-made feel rather than a corporate one. The interface stays predominantly monochrome; violet appears as functional accent on buttons, links, icons, and active states, never as decorative tint. Components feel like tools in a studio tray: 16px card radius, 12px button radius, pill-shaped tags, and a single near-imperceptible shadow that lifts without announcing itself. Backgrounds are white with whisper-soft radial gradient washes in pastel teal and lavender, creating depth that never competes with content.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Violet | `#8169ff` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Deep Iris | `#6d4ff0` | Pressed and hover state of Electric Violet — used for filled-element interaction feedback and slightly deeper icon strokes |
| Soft Lilac | `#c9bfff` | Light accent wash — decorative gradient stops, soft tag backgrounds, muted selected states, and atmospheric color bleeds at section edges |
| Ink Black | `#000000` | Primary text, hero headlines, high-contrast icons. The strongest typographic color, reserved for content the eye should land on first |
| Carbon | `#181818` | Navigation text, input borders, near-black UI surfaces, button labels. Softer than pure black so it reads as interface, not print |
| Graphite | `#555555` | Body text, supporting copy, secondary labels, paragraph running text under headlines |
| Silver | `#999999` | Muted text, placeholders, disabled labels, captions, subtitle hierarchy. The quietest text tier, used only for de-emphasized content |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on filled violet, elevated panel backgrounds |
| Aqua Wash | `radial-gradient(47.72% 108.66% at -12.1% 21.18%, rgba(129, 219, 219, 0.25) 24.27%, rgba(160, 232, 232, 0) 100%)` | Decorative gradient stop — pastel teal radial wash on hero left side, atmospheric background tint that never fills a UI element |
| Lilac Bleed | `radial-gradient(62.81% 136.54% at 103.92% 77.32%, rgba(227, 222, 255, 0.7) 0%, rgba(201, 191, 255, 0) 100%)` | Decorative gradient stop — pastel lavender radial wash on hero right side and section-edge color bleeds, creating depth at zero contrast cost |

## Typography

### Gilroy — Primary display and brand typeface — headlines, hero copy, nav, button labels. Custom geometric sans with a friendly, designer-made personality; weight 700 at 48–62px defines the brand voice. Weight 400 is used for body and nav.
- **Substitute:** Manrope, Plus Jakarta Sans, or Outfit
- **Weights:** 400, 700
- **Sizes:** 16px, 18px, 20px, 22px, 28px, 48px, 62px
- **Line height:** 1.29–1.60

### Inter — Secondary UI and body typeface — input text, form labels, small captions, inline metadata, and any context where Gilroy would feel too display-heavy. Reads as a neutral workhorse underneath the brand voice.
- **Substitute:** system-ui, IBM Plex Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 14px, 16px, 18px, 24px
- **Line height:** 1.30–1.67

### Palmer Lake Print — Decorative script accent — used once per page for hand-drawn section annotations (e.g. "TRY DEMO BELOW"). Carries a personal, hand-made quality that reinforces the prototyping-workshop atmosphere. Never used for functional UI.
- **Substitute:** Caveat, Kalam
- **Weights:** 400
- **Sizes:** 32px
- **Line height:** 0.80

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body-sm | — | — | 14px | 1.5 | 0px |
| body | — | — | 16px | 1.56 | 0px |
| subheading | — | — | 20px | 1.45 | 0px |
| heading-sm | — | — | 24px | 1.4 | 0px |
| heading | — | — | 28px | 1.33 | 0px |
| heading-lg | — | — | 48px | 1.29 | 0px |
| display | — | — | 62px | 1.16 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 16px
- **pills:** 9999px
- **inputs:** 8px
- **avatars:** 9999px
- **buttons:** 12px
- **small-chips:** 4px

## Components

### Primary Filled Button
**Role:** Primary interactive action — "Get Started for Free", "Get Started" in nav, single highest-priority action per screen.

Filled Electric Violet #8169ff background, white #ffffff text, 12px border radius, 16px vertical / 24px horizontal padding. Gilroy weight 700 at 16–18px. Hover transitions to Deep Iris #6d4ff0. No border. Single instance per viewport.

### Pill Tag / Chip
**Role:** Label badges for categories, filter pills, and small interactive chips.

9999px border radius (full pill), 6px vertical / 12px horizontal padding. Background is Soft Lilac #c9bfff at 20–30% opacity or transparent with violet text. Gilroy 400 at 12–14px in Electric Violet.

### Ghost Text Link
**Role:** Secondary inline action — "Talk to Sales", inline links inside body copy.

No background, no border. Text in Electric Violet #8169ff at 16–18px Gilroy 400, underline optional on hover only. Sits inline with surrounding text.

### Icon Search Button
**Role:** Utility trigger in the top-right of the navigation bar.

40×40px circular (9999px radius) ghost button. Dark Carbon #181818 magnifying-glass icon at 18px on transparent background. Hover adds 8% black fill.

### Top Navigation Bar
**Role:** Persistent site navigation.

White #ffffff background with no border and no shadow, sitting flush at the top. Height ~64px. Contains: violet "P" logo (left), 4–5 dropdown nav items in Carbon #181818 at 16px Gilroy 400, then search icon + violet text link + filled violet button (right). Generous horizontal padding 24–40px.

### Product Demo Panel
**Role:** Hero feature visual — embedded screenshot of the ProtoPie app interface.

White card, 16px border radius, 24px internal padding around the embedded UI screenshot, soft shadow `rgba(0,0,0,0.12) 0 3px 12px`. Sits centered below the hero headline with 32–48px top margin. Width approaches 100% of the 1200px container.

### Testimonial Card
**Role:** Social proof quote with attribution.

White card, 16px border radius, 24–32px padding, soft shadow. Top row: 40px circular avatar (9999px) + name in Ink Black 16px Gilroy 700 + title in Graphite #555555 14px. Quote body: 16–18px Gilroy 400 in Ink Black. Optional play button (see Play Button) anchored bottom-center.

### Play Button
**Role:** Video play trigger inside testimonial and demo cards.

48–56px circular (9999px) Carbon #181818 background, white triangle play icon centered. No border, no shadow on the button itself; sits over the card.

### Company Logo Badge
**Role:** Trust signal — partner/brand logo in a circular container.

80–96px circle (9999px radius), white #ffffff background, 1px Silver #999999 hairline border, logo centered at ~50% width. Used in the "trusted by" carousel and testimonial section.

### Trust Logo Cell
**Role:** Grayscale partner logos in the "trusted by world's top design teams" section.

No container, no border. Logo rendered in Graphite #555555 or Silver #999999 at uniform height (~28px), arranged in a 6×2 grid. Logos are intentionally desaturated to keep the violet accent as the only chromatic element on the page.

### Import Source Badge
**Role:** Small icon badges showing supported design-tool imports (Figma, Sketch, Adobe XD).

~32px square with 8px radius, logo centered, white background. No text. Arranged in a tight horizontal row with 12–16px gap.

### Annotation Caption
**Role:** Decorative hand-drawn label — e.g. "TRY DEMO BELOW", "HIGHLY SECURE", "REMOTE FRIENDLY".

Set in Palmer Lake Print at 32px, line-height 0.80, Electric Violet #8169ff color. Rotated -3° to -8° for hand-placed feel. One or two per page maximum; never functional.

## Do's and Don'ts

### Do
- Use Electric Violet #8169ff for every brand-voice surface: filled buttons, active links, key icons, active nav. The system has one chromatic color — do not introduce a second.
- Set display headlines in Gilroy 700 at 48–62px, line-height 1.16–1.29. The generous size and tight leading is the brand's visual signature.
- Use 16px radius for all cards and large surfaces, 12px for rectangular buttons, and 9999px (full pill) for tags, chips, and avatars. The radius vocabulary is the system's silhouette.
- Build spacing on a 4px base: 8 / 12 / 16 / 24 / 32 / 64 / 80. All values should be multiples of 4.
- Apply the single shadow `rgba(0,0,0,0.12) 0 3px 12px, rgba(0,0,0,0.3) 0 0 2px` for any elevated card. Heavier shadows break the flat, near-paper feel.
- Keep body copy in Inter 400 at 16px, Graphite #555555 for secondary text, Silver #999999 only for placeholders and disabled state.
- Layer the two radial gradients (Aqua Wash on hero left, Lilac Bleed on hero right) at 20–25% max opacity. They create atmosphere, not pattern.

### Don't
- Do not introduce a second accent color. The system is monochrome + one violet; any additional hue dilutes the brand voice.
- Do not use pure #000000 for UI surfaces or button labels — reserve it for headlines. Use Carbon #181818 for nav, inputs, and interactive UI.
- Do not use shadows heavier than the single 3px/12px stack. Deep drop shadows or colored glows are off-system.
- Do not apply border-radius smaller than 4px. The design depends on generous rounding; sharp corners read as a different system.
- Do not set body or UI copy in Gilroy display weights. Gilroy is for headlines and nav; use Inter for anything functional or dense.
- Do not apply letter-spacing adjustments to Gilroy. Tracking is normal; the font's geometric proportions do the work.
- Do not place violet on tinted or gradient backgrounds. Electric Violet only sits on white, near-white, or Solid Lilac to keep contrast correct.

## Elevation

- **Elevated Card:** `rgba(0, 0, 0, 0.12) 0px 3px 12px 0px, rgba(0, 0, 0, 0.3) 0px 0px 2px 0px`
- **Product Demo Panel:** `rgba(0, 0, 0, 0.12) 0px 3px 12px 0px, rgba(0, 0, 0, 0.3) 0px 0px 2px 0px`
- **Testimonial Card:** `rgba(0, 0, 0, 0.12) 0px 3px 12px 0px, rgba(0, 0, 0, 0.3) 0px 0px 2px 0px`

## Surfaces

- **Paper White** (`#ffffff`) — Page canvas — the base layer every other surface sits on.
- **Elevated White** (`#ffffff`) — Card and panel surfaces — same hex as canvas, differentiated by the soft shadow `rgba(0,0,0,0.12) 0 3px 12px`.
- **Lilac Tint** (`#c9bfff`) — Tinted accent surfaces — selected states, soft tag fills, decorative wash overlays at low opacity.
- **Electric Violet** (`#8169ff`) — Filled interactive surfaces — brand button fills, active nav, key icon backgrounds.

## Imagery

The site uses embedded product-UI screenshots as its primary visual — full-bleed captures of the ProtoPie authoring canvas, shown in white cards with the soft system shadow. These are not marketing illustrations but real interface crops, letting the product speak for itself. Supporting imagery is minimal: circular company logos in the trust section (desaturated to Graphite/Silver so they don't compete with violet), small square import-source badges, and circular user avatars. Decorative graphics are limited to the two whisper-soft radial gradient washes in the hero (pastel teal on the left, pastel lavender on the right) and a handful of hand-drawn script annotations in Palmer Lake Print, rotated slightly to feel hand-placed. No photography, no 3D renders, no full-bleed lifestyle imagery. The visual language is product-centric: the tool is the hero, decoration is sparse and functional.

## Layout

Marketing-site structure, max-width 1200px centered with 24–40px outer padding. Hero is a vertically stacked centered composition: small nav, then a 48–62px headline, a 16–20px subhead, a single filled violet button, a small hand-drawn annotation, and a large product demo card sitting below the fold. Below the hero: an import-source badge row, then a 6×2 trust-logo grid centered on the page. Mid-page sections shift to social proof: a horizontal carousel of circular company-logo badges, a featured testimonial card with embedded video, and decorative script annotations floating in the page margins. Sections are separated by generous 80px vertical gaps with no dividers — flow is continuous. Navigation is a single sticky white top bar with no shadow. The overall rhythm is: one tall vertical hero, then a series of centered max-width content bands, each feeling like a separate workshop demo panel rather than a dense marketing page.

## Similar Brands

- **Figma** — Shares the design-tool aesthetic with embedded product-UI screenshots as hero visuals, generous white canvas, and confident typographic headlines that feel maker-made rather than corporate.
- **Framer** — Same prototyping-tool context, similar use of a single saturated accent (Framer leans blue, ProtoPie violet) against a monochrome interface, and a hero built around a large centered headline above a product demo card.
- **Linear** — Shared minimal-marketing aesthetic: white canvas, near-black text, single accent color, generous letter-tightened display type, and ultra-rounded surfaces with near-imperceptible shadows.
- **Webflow** — Similar purple-toned brand accent and creator-tool voice, with marketing pages that alternate between clean type-led sections and embedded product screenshots in elevated white cards.
- **Origami Studio** — Same prototyping-tool category and card-heavy layout pattern, with each section presented as a self-contained white panel separated by generous vertical breathing room.
