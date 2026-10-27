# Obsidian — Style Reference
> Crystalline Knowledge Vault. A sharp, faceted digital space built for clarity and focus, with glowing violet veins of interaction.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The design feels like being inside a piece of precision software—a dark, focused digital workspace where thoughts crystallize. The foundation is a near-black, void-like background (#171717), creating a high-contrast canvas. A single, electric violet accent (#7c3aed, #a78bfa) is used strictly for interactive elements like CTAs and links, acting as functional beacons in the dark. Typography is exclusively the system's native UI font, reinforcing its identity as a functional tool rather than a stylized marketing site. Instead of drop shadows, surfaces use a subtle, 1px white inset highlight, giving them an internal luminescence as if lit from within.

## Colors

| Name | Value | Role |
|------|-------|------|
| White | `#ffffff` | Bright text on dark CTAs, inset glows for definition |
| Bright Gray | `#eeeeee` | Primary body text, headings |
| Medium Gray | `#bcbcbc` | Secondary text, navigation links |
| Muted Gray | `#a3a3a3` | Tertiary text, subtle metadata |
| Graphite | `#3f3f3f` | Borders, UI element dividers |
| Surface | `#1e1e1` | Card backgrounds, elevated UI panels |
| Abyss | `#171717` | Main page background |
| Amethyst | `#7c3aed` | Primary CTA buttons—a sharp, functional accent against the dark theme |
| Lavender | `#a78bfa` | Links, badge text, and active states—the secondary, brighter interaction color |
| Tag Background | `#8a5cf5` | Background for tag/badge elements, used at 15% opacity |
| Success Green | `#4ade80` | Success states or syntax highlighting within the app UI |
| Warning Yellow | `#facc15` | Warning states or syntax highlighting within the app UI |
| Error Red | `#f87171` | Error states or syntax highlighting within the app UI |

## Typography

### ui-sans-serif, system-ui — Used for all text. The choice of a system font is deliberate, making the website feel like a native application—a functional tool for thought.
- **Substitute:** "SF Pro Display", "Roboto", "Segoe UI", sans-serif
- **Weights:** 400, 500, 600, 700
- **Sizes:** 8px, 9px, 10px, 11px, 12px, 13px, 14px, 16px, 18px, 20px, 24px, 28px, 36px, 60px
- **Line height:** 1.25-1.5
- **Letter spacing:** Negative tracking (-0.02em) on larger sizes tightens headlines for a more compact, solid appearance.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.24px |
| body-sm | — | — | 14px | 1.5 | -0.28px |
| body | — | — | 16px | 1.5 | -0.32px |
| subheading | — | — | 18px | 1.4 | -0.36px |
| heading-sm | — | — | 24px | 1.33 | -0.48px |
| heading | — | — | 28px | 1.25 | -0.56px |
| heading-lg | — | — | 36px | 1.25 | -0.72px |
| display | — | — | 60px | 1.1 | -1.2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1120px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Primary CTA Button
**Role:** The main call-to-action button.

Solid Amethyst (#7c3aed) background with White (#ffffff) text. Padding is 16px 24px. Corner radius is 8px.

### Secondary Ghost Button
**Role:** A less prominent action, often for secondary choices like 'More platforms'.

Transparent background with Medium Gray (#bcbcbc) text. Padding is 8px. Corner radius is 8px. No border.

### Community Link Card
**Role:** Large, clickable cards used to link to community resources.

Surface (#1e1e1e) background with Bright Gray (#eeeeee) text. Padding is 24px. Corner radius is 12px. Features a 1px white inset glow `rgba(255, 255, 255, 0.05) 0px 0px 0px 1px inset`.

### Tag Badge
**Role:** Used inside the app UI to display tags on notes.

Pill-shaped (9999px radius). Background is Tag Background (#8a5cf5) at 15% opacity. Text is Lavender (#a78bfa). Padding is 2px 8px.

### App Showcase
**Role:** Displays the product UI directly on the page.

A detailed screenshot or rendered view of the Obsidian application, showing elements like the note editor, sidebar file browser, and distinctive graph view. Follows the site's dark theme.

### App Icon
**Role:** The primary brand mark and application icon.

A squircle-shaped icon (approx 20% border-radius) depicting a faceted purple and black gem. Has a subtle internal gloss and shadow to give it dimension.

### Navigation Link
**Role:** Text links in the main header navigation.

Medium Gray (#bcbcbc) text using the system UI font at 16px. No background or borders. Hover state is likely a color change to Bright Gray (#eeeeee).

## Do's and Don'ts

### Do
- Use the system UI font for all text to maintain the native-app feel.
- Reserve Amethyst (#7c3aed) and Lavender (#a78bfa) exclusively for interactive elements like buttons and links.
- Employ subtle 1px inset white glows for definition on dark cards and buttons.
- Maintain high contrast with light gray text (#eeeeee) on near-black backgrounds (#171717).
- Use pill-shaped radii (9999px) for tags and badges only; keep other elements sharp.
- Keep layouts centered and spacious, with generous vertical rhythm between sections.

### Don't
- Do not use traditional drop shadows for elevation; prefer the inset glow effect.
- Do not introduce other saturated colors into the primary UI; stick to the violet-on-dark palette.
- Do not use decorative or serif fonts; the brand identity is utilitarian.
- Do not use bright or light-themed backgrounds for primary content sections.
- Do not use large border radii on cards or buttons; stick to the 8-12px range.
- Do not use lifestyle photography; focus on the product UI as the primary visual.

## Elevation

Elevation is achieved through internal luminescence, not external shadows. Most interactive surfaces like cards and buttons feature a 1px inset white 'glow' (e.g., `rgba(255, 255, 255, 0.05) 0px 0px 0px 1px inset`). This creates definition and a subtle sense of depth without making elements feel like they are floating above the surface, reinforcing the in-app, digital tool aesthetic.

## Similar Brands

- **Raycast** — Shares the dark UI, native-app feel from using system fonts, and a focus on utility and speed.
- **Linear** — Similar dark, high-contrast aesthetic with a single sharp violet/purple accent and subtle internal glow effects.
- **VS Code** — Directly echoes the visual language of a code editor, appealing to a developer-adjacent audience with its dark theme and focus on plaintext.
- **Superhuman** — Another productivity tool with a premium, dark-mode-first interface that emphasizes speed and function over adornment.
