# Threads — Style Reference
> newspaper column on frosted glass

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Threads uses a text-first social-feed language: a near-monochrome canvas where black text on warm-white surfaces carries almost all communication, with a single deep Facebook-blue (#385898) used sparingly for links, verification ticks, and hover accents. The interface strips away decorative chrome — no gradients, no color fills, no rounded buttons beyond pure pills — to keep visual weight concentrated on the words people write. Surfaces are quietly layered: a paper-white page holds a softly elevated, large-radius feed column, and every interactive element is reduced to a line icon or a thin border. The result feels closer to a newspaper column rendered on a tablet than a typical social app — dense with text, generous with whitespace, and confident enough to let the content do the work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#000000` | Primary text, icon strokes, structural borders, and the filled Log in button — the load-bearing color that carries almost every interface element |
| Paper White | `#fafafa` | Page canvas and the topmost surface layer — warm off-white that softens the contrast of pure black text |
| Mist Gray | `#efefef` | Secondary surface beneath the elevated feed container — the shadow-tinted plane that gives the feed column its lifted feel |
| Cloud Gray | `#d5d5d5` | Post dividers and card outline borders — the thinnest structural separator between stacked feed items |
| Ash Gray | `#969696` | Secondary borders on buttons, muted metadata text, and placeholder strokes — the middle-tone neutral for inactive controls |
| Graphite | `#424242` | Body text borders, secondary icon fills, and medium-emphasis strokes — sits between Ink Black and Ash Gray for tertiary text and outlines |
| Meta Blue | `#385898` | Outlined link borders, hyperlink text, verified-badge fill, and icon accents — the single chromatic note in the system, used for interactive emphasis without ever filling a large surface |

## Typography

### system-ui — Entire interface — system-ui at 15px/400 for post body text, 15px/600 for usernames, 13px/400 for timestamps and metadata, 12px/400 for fine print. The choice of system-ui rather than a webfont keeps rendering native to each platform; the narrow size range (12–17px) and tight 1.33–1.4 line-height create the compact, information-dense rhythm of a social feed where many posts share a single screen
- **Substitute:** -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif
- **Weights:** 400, 600
- **Sizes:** 12px, 13px, 15px, 17px, 20px
- **Line height:** 1.33, 1.40, 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | — |
| body | — | — | 15px | 1.4 | — |
| heading | — | — | 20px | 1.5 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 640px
- **Card padding:** 16px
- **Element gap:** 12px

### Border Radius

- **badge:** 1000px
- **avatar:** 1000px
- **button:** 1000px
- **linkCard:** 8px
- **postCard:** 0px
- **feedColumn:** 18px

## Components

### Feed Container
**Role:** Central scrollable surface that holds all posts

Max-width 640px, centered on a #fafafa page. Rounded 18px corners. Background Paper White (#fafafa). Subtle elevation via box-shadow: 0 0 12px rgba(0,0,0,0.04) with a 48px spread halo in Paper White to create a soft lift off the #efefef plane beneath. The container is the only elevated element on the page

### Log In Button
**Role:** Primary authentication action in the top-right

Pill shape (border-radius 1000px), background Ink Black (#000000), text Paper White (#fafafa), system-ui 15px/600, padding 8px 16px. No border. Fills the role of a dark filled button on an otherwise borderless surface

### Post Card
**Role:** Individual feed entry

Flat, no card background — sits directly on Feed Container Paper White. Separated from neighbors by a 1px Cloud Gray (#d5d5d5) bottom border. Internal padding 16px. Three-zone vertical layout: header (avatar + username + timestamp + menu), body (text and/or media), engagement bar

### Circular Avatar
**Role:** User identity mark in post headers and sidebar

Border-radius 1000px (full circle). Default 40px diameter in feed posts, 24px in engagement sub-lists. No border. Image fill only

### Verified Badge
**Role:** Identity confirmation next to usernames

Small circular icon filled with Meta Blue (#385898), white checkmark inside. Sits inline after the username. The only place where the brand blue is used as a fill

### Post Engagement Bar
**Role:** Like, comment, repost, share actions beneath each post

Horizontal row of four line icons (heart, comment bubble, circular arrow, paper plane). Icons are Ash Gray (#969696) at rest, Ink Black on interaction. Counts in 13px/400 system-ui, Graphite (#424242). Touch targets ~40px. No button backgrounds or borders

### Link Preview Card
**Role:** Embedded article preview within a post

Full-width within post body, border 1px Cloud Gray (#d5d5d5), border-radius 8px, no shadow. Internal layout: optional image top (full-width, no radius override), then site name in 13px/400 Graphite, then headline in 15px/400 Ink Black. Padding 12px on the text zone

### Sidebar Icon Button
**Role:** Navigation targets in the left rail

Square 48px touch target with a centered 24px line icon. No background, no border. Icon color Ash Gray (#969696) at rest, Ink Black when active. The Threads wordmark logo sits at the top of the same rail, ~56px square

### Compose Button
**Role:** Quick post creation entry from sidebar

Larger square icon-button in the sidebar with a plus glyph. Ink Black icon, no fill. 48px target. Sits mid-rail between navigation icons

### Top Header Bar
**Role:** Page-level title and entry to authentication

Full-width, ~53px tall, background Paper White. Centered 'Home' label in 15px/600 Ink Black. Right-aligned Log In button. No visible bottom border — separation is implied by whitespace

### Post Overflow Menu Trigger
**Role:** Per-post action menu

Three-dot icon, Ash Gray (#969696), 20px square, top-right of every post header. No background until hover, then a very faint #efefef fill

### Inline Hashtag / Mention
**Role:** Interactive text within post body

Same system-ui 15px/400 as body text, color Meta Blue (#385898). No underline by default; underline appears on hover. Functions as a text link, not a button

## Do's and Don'ts

### Do
- Use Ink Black (#000000) for all primary text and structural icon strokes — let the weight of black carry the hierarchy
- Apply Meta Blue (#385898) exclusively to hyperlinks, verification badges, and icon accents — never as a filled surface or large block of color
- Set border-radius to 1000px on every avatar, button, and badge to keep the pill/circle vocabulary consistent
- Separate posts with a 1px Cloud Gray (#d5d5d5) bottom border, not with card backgrounds or spacing alone
- Wrap the feed in a single 640px-max-width container with 18px radius and the 12px 4%-opacity shadow halo
- Type body copy at 15px/400 system-ui with 1.4 line-height; reserve 600 weight for usernames and navigation labels
- Keep all interactive controls borderless — express state through color shifts (Ash Gray → Ink Black) rather than fills or borders

### Don't
- Don't introduce a second chromatic color — the system is monochrome plus one blue, and adding another breaks the newspaper discipline
- Don't use colored or gradient fills on buttons, cards, or surfaces — the only filled surface is the Ink Black Log in button
- Don't use shadows on individual post cards — the single elevation halo belongs to the feed container only
- Don't render text larger than 20px — the system operates in a 12–17px window and oversized type breaks the compact rhythm
- Don't use a webfont when system-ui renders natively — replacing it with a custom face shifts the personality away from neutral utility
- Don't put borders or backgrounds on sidebar icon buttons — they must read as a column of marks on a blank rail
- Don't round card corners above 8px for embedded link previews or media — large radii on those elements compete with the feed container's own 18px curve

## Elevation

- **Feed Container:** `0 0 12px rgba(0,0,0,0.04), 0 0 0 48px #fafafa`

## Surfaces

- **Page Canvas** (`#fafafa`) — Outermost background visible around the feed container and in the sidebar gutters
- **Backdrop Tint** (`#efefef`) — The slightly darker plane revealed by the feed container's spread shadow — exists only as shadow artifact, not a painted surface
- **Feed Column** (`#fafafa`) — The elevated rounded container that holds all posts; visually identical to the canvas but lifted by the 12px shadow halo and 18px radius
- **Post Surface** (`#fafafa`) — Inherited from the feed column — posts are flat, separated only by 1px dividers, never by card backgrounds

## Imagery

User-generated content dominates — photographs, screenshots, and video thumbnails appear inside link preview cards and inline media blocks at their natural aspect ratios. No brand illustration, no decorative graphics, no hero imagery. The product itself is the canvas for other people's images. All embedded media sits within 8px-radius containers with no overlay chrome beyond a small site-name attribution line.

## Layout

Three-column desktop layout: an ~80px left icon rail (Threads logo, nav icons, compose button, profile avatar), a centered 640px-max-width feed column with 18px radius and subtle elevation, and empty right gutter that breathes out to the viewport edge. The feed is a single vertical scroll — no grid, no masonry, no horizontal carousels. Posts stack linearly with 1px dividers. The top header is a fixed ~53px bar with a centered 'Home' label and right-aligned Log In. Section transitions are seamless: no banding, no alternating backgrounds, no section headers — the feed reads as one continuous document.

## Similar Brands

- **Twitter / X** — Same text-first feed structure with circular avatars, single-column post stack, and minimal chrome — Threads' layout grammar is directly descended from this lineage
- **Mastodon** — Near-monochrome interface with a single accent color, thin dividers between posts, and a three-dot overflow menu per post — the desktop feed column shape is nearly identical
- **Bluesky** — Rounded feed container, system-font typography, and an almost color-free palette with one blue used only for links and verification marks
- **Tumblr (dashboard)** — Dense vertical text stream with circular avatars, ghost engagement icons, and embedded link cards with site-name attribution — the same reading-first visual rhythm
