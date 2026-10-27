/**
 * Plain CSS for the dock's first screen (mode B: inside dsh's page, no reset, `tv-` prefix),
 * injected once through a <style> tag. Colours read dsh's aliases with a fallback, so the block
 * follows the Tracy layer dsh-brand puts on <body> and the light/dark switch.
 */
/* One compact first-screen treatment for the site and the narrow creation column. */
const START_DOCK_RULES = `flex: 1 0 auto; justify-content: center; margin: 0; padding: 24px 0;`
const DOCKED_HERO_RULES = `flex: 1 0 auto; display: flex; flex-direction: column; align-self: stretch; width: 100%;
    gap: 0; padding-bottom: 8px; --dsh-composer-side-clearance: 8px;`
const START_COMPACT_WIDTH = 660
const START_COLUMN_GUTTER = 14
const START_WIDE_CARD_MARGIN = 14
const START_HERO_GAP = 8
/*
 * The start blocks whose cards sit in one centred row on a wide column (Akemi 23/10/2026): the
 * creation first screen and a site's first screen, so both stay identical. Remove a line to give
 * that screen back its stacked column.
 */
const START_ROW_BLOCKS = [
  'html[data-tracy-scope="onboarding"] [class*="composerHero"]:not(:has([data-tracy-help-conversation])) .tv-dock[data-tracy-start="1"]',
  '[class*="composerHero"]:not(:has([data-tracy-sent])) > [data-slot="conversation.input.dock"] > .tv-dock[data-tracy-start="site"]'
]
const startRowRule = (tail: string, body: string) =>
  `${START_ROW_BLOCKS.map((block) => `${block} ${tail}`).join(',\n  ')} { ${body} }`

/* The stack is as wide as its longest label, at least 200px and never wider than the column, and
   every card takes that width (24/10/2026: "Mit einem Template starten" was cut to "Mit einem
   Template s..." in a fixed 200px stack). Only a column too narrow for the label wraps it, onto a
   taller card, instead of cutting it. */
const COMPACT_START_RULES = `
  container: tv-start-site / inline-size;
  & .tv-start-title { font-size: 21px; line-height: 1.25; text-align: center; }
  & .tv-start-subtitle { margin: 6px 0 0; font-size: 13px; line-height: 1.4; text-align: center; }
  & .tv-start-cards { gap: 9px; width: fit-content; min-width: min(200px, 100%); max-width: 100%; margin-top: 22px; }
  & .tv-start-card { height: auto; min-height: 41px; gap: 10px; padding: 0 11px 0 8px; }
  & .tv-start-card-title { white-space: normal; overflow-wrap: anywhere; }
  & .tv-start-card-icon { width: 24px; height: 24px; }
  & .tv-start-card-icon svg { width: 13px; height: 13px; }
  & .tv-start-card-title { font-size: 13px; }
`

export const CSS = `
.tv-dock { display: flex; flex-direction: column; gap: 16px; width: 100%; }

/* The creation workspace's first screen: a title, one line, three round cards. Tracy tokens, NOT
   --dsw-alias-*: on the light theme dsh's label aliases carry a blue cast (#4a5560), which reads as
   a tint nobody chose. tokens.css already points at dsh where it should; its fallbacks stay neutral.
   The font is inherited: Tracy's own sans, never a serif. */
/* 16px side gutters keep the cards off the column edges when a narrow Conversation squeezes the
   block (measured 29/09: 0px from the left rail at 301px). The line under the title may run wider
   than the 360px column of cards, so it reads as one line on a desktop column. */
.tv-start { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 592px; padding: 0 16px; box-sizing: border-box; margin: 0 auto; }
.tv-start-heading { display: flex; align-items: center; justify-content: center; gap: 12px; max-width: 100%; }
/* The mark inline before the title's first word (Akemi 23/10/2026), sized in em so it follows the
   title, which follows the content font setting. Proportions measured on the owner's reference:
   the mark's visible height is 1.36 times the cap height, centred on the capitals, with an ink gap
   of about half a cap height. With the title font (cap height 0.705em) that is a 0.96em box, a
   0.3em gap, and a bottom 0.13em under the baseline. The brand colour is the SVG's own fill in both
   themes. The lead span keeps the mark with its word. */
.tv-start-title-lead { white-space: nowrap; }
.tv-start-title-mark { display: inline-block; width: 0.96em; height: 0.96em; margin-right: 0.3em; vertical-align: -0.13em; }
.tv-start-title { min-width: 0; font-size: 24px; font-weight: 600; line-height: 1.2; color: var(--foreground, #172026); overflow-wrap: anywhere; text-wrap: balance; }
.tv-start-subtitle { margin: 8px 0 0; max-width: 100%; font-size: 14px; line-height: 1.45; text-align: center; color: var(--muted-foreground, #6b7280); overflow-wrap: anywhere; }
.tv-start-cards { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 360px; margin-top: 24px; }

/* A card is a button shaped as a pill: a round coloured icon, one label (Akemi 01/10, option A).
   corner-shape: round because dsh gives every box a superellipse corner, which turns a pill and a
   disc into rounded squares (measured 01/10 on the local stack). Hover brightens the card by mixing a little of the text colour into its own fill, the way the
   sidebar rows do: one rule right in both themes, and the border never changes colour. Pressed is
   a hair smaller. Focus is one stroke, keyboard only. No shadow in either theme (DESIGN.md: no
   glow or shadow): the light theme's drop shadow made the two themes disagree (Akemi 01/10). */
.tv-start-card {
  display: flex; align-items: center; gap: 11px; min-width: 0; width: 100%;
  height: 44px; padding: 0 16px 0 6px; box-sizing: border-box; text-align: left;
  border: 1px solid var(--border, #e5e7eb); border-radius: 999px; corner-shape: round;
  background: var(--card, #ffffff);
  box-shadow: none;
  color: var(--foreground, #172026);
  font: inherit; cursor: pointer;
  transition: background-color .12s, transform .08s;
}
.tv-start-card:hover:not(:disabled) { background: color-mix(in oklab, var(--foreground, #172026) 6%, var(--card, #ffffff)); }
.tv-start-card:active:not(:disabled) { transform: scale(.985); }
.tv-start-card:focus { outline: none; }
.tv-start-card:focus-visible { outline: 1.5px solid var(--ring, #bf5b3d); outline-offset: 2px; }
.tv-start-card:disabled { cursor: default; opacity: .5; }
/* The icon's disc: white glyph on a muted brand-friendly tone, one tone per door. The dark theme
   lifts each tone a step so the disc still stands off a dark card; white on every tone keeps at
   least 3:1 (non-text contrast). dsh flags dark with [data-ds-dark-theme] on <body>. */
.tv-start-card-icon {
  flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; corner-shape: round;
  color: #ffffff; background: var(--tv-start-tone, #4f6f9a);
}
.tv-start-card-icon svg { width: 15px; height: 15px; }
.tv-start-card-icon[data-tone="create"] { --tv-start-tone: #4f6f9a; }
.tv-start-card-icon[data-tone="template"] { --tv-start-tone: #66733a; }
.tv-start-card-icon[data-tone="business"] { --tv-start-tone: #8a4a68; }
.tv-start-card-icon[data-tone="import"] { --tv-start-tone: #bf5b3d; }
[data-ds-dark-theme] .tv-start-card-icon[data-tone="create"] { --tv-start-tone: #6386b4; }
[data-ds-dark-theme] .tv-start-card-icon[data-tone="template"] { --tv-start-tone: #7f8d4a; }
[data-ds-dark-theme] .tv-start-card-icon[data-tone="business"] { --tv-start-tone: #a8607f; }
.tv-start-card-title { min-width: 0; font-size: 14px; font-weight: 500; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The site start cards' four tones (Case 2): Edit terracotta, Comments olive, Site changes blue,
   Team plum, each lifted a step in the dark theme like the creation cards. */
.tv-start-card-icon[data-tone="edit"] { --tv-start-tone: #bf5b3d; }
.tv-start-card-icon[data-tone="comments"] { --tv-start-tone: #66733a; }
.tv-start-card-icon[data-tone="changes"] { --tv-start-tone: #4f6f9a; }
.tv-start-card-icon[data-tone="team"] { --tv-start-tone: #8a4a68; }
/* Design system (Akemi U2 A, 12/10/2026): a muted ochre, lifted a step in the dark theme. */
.tv-start-card-icon[data-tone="design-system"] { --tv-start-tone: #9a6b2f; }
[data-ds-dark-theme] .tv-start-card-icon[data-tone="design-system"] { --tv-start-tone: #b3803e; }
[data-ds-dark-theme] .tv-start-card-icon[data-tone="comments"] { --tv-start-tone: #7f8d4a; }
[data-ds-dark-theme] .tv-start-card-icon[data-tone="changes"] { --tv-start-tone: #6386b4; }
[data-ds-dark-theme] .tv-start-card-icon[data-tone="team"] { --tv-start-tone: #a35d7f; }
/* A count at the card's end (Comments: open threads of the site, Lee 04/10/2026): the round grey pill the
   Comments tab carries, a little larger to sit in a 44px card. Drawn only above 0. The number answers
   "how much is left", so it is neutral; "is anything new" is the red dot (data-dot) below. */
.tv-start-card-count {
  position: relative; flex: none; margin-left: auto; box-sizing: border-box; min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 999px; corner-shape: round; background: var(--muted, #f4f4f5); color: var(--muted-foreground, #6b7280);
  font-size: 11px; font-weight: 600; line-height: 20px; text-align: center; font-variant-numeric: tabular-nums;
}
/* The unread dot (Lee 04/10/2026), one look on every Comments count that is a real element (this card,
   the page filter's pills): 7px of terracotta at the count's top-right corner, ringed in the surface
   colour so it stands off the pill. It is CSS, so the element itself carries "N unread" (title, name). */
.tv-start-card-count[data-dot]::after, .tv-cv-pill[data-dot]::after {
  content: ""; position: absolute; top: -2px; right: -2px; width: 7px; height: 7px; box-sizing: content-box;
  border: 2px solid var(--tv-dot-ring, var(--card, #ffffff)); border-radius: 999px; background: var(--primary, #bf5b3d);
}
/* The Team card's end: up to three overlapping faces (Face, inline style, ringed in the card's colour)
   and the number of members, or "only you", in the card's quiet text colour. Nothing while unread. */
.tv-start-card-faces { flex: none; margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.tv-start-card-people {
  font-size: 12px; font-weight: 500; line-height: 1; white-space: nowrap; font-variant-numeric: tabular-nums;
  color: var(--muted-foreground, #6b7280);
}
/* The Design system card's end: the worn system's name, cut with an ellipsis past 18 characters. */
.tv-start-card-ds-name { display: inline-block; max-width: 18ch; overflow: hidden; text-overflow: ellipsis; }
/* A site's start block has no mark beside the question (Case 2 mockup): the title stands alone. */
.tv-start-site .tv-start-title { text-align: center; }
/* The site start block beside the right panel (Akemi 14/10/2026, measured off Claude Design's
   narrowest chat): a 21px heading, the 13px host line 6px under it, 22px to the cards. Cards are
   200px wide pills, 41px tall, 9px apart, a 24px disc 9px in from the edge and a 13px label 43px in;
   still one per row, all the same width and centred. The block is a size container, so what a card shows
   follows the CHAT COLUMN, not the window: in the default 320px conversation a card is its disc and
   label only (the count, design system name and faces hide); once the person drags the
   conversation so the block's content box is 400px or wider (a conversation of about 440px) the
   stack grows to 280px and every card's end shows again, with room for the longest
   label and its end (Design system and a system name) without cutting either. The narrow creation
   workspace shares this treatment; its wide layout keeps the original larger cards. */
.tv-start-site { ${COMPACT_START_RULES} }
.tv-start-site .tv-start-card-count { display: none; min-width: 16px; height: 16px; padding: 0 4px; font-size: 10px; line-height: 16px; }
.tv-start-site .tv-start-card-faces { display: none; gap: 4px; }
.tv-start-site .tv-start-card-people { font-size: 11px; }
@container tv-start-site (min-width: 400px) {
  .tv-start-site .tv-start-cards { min-width: min(280px, 100%); }
  .tv-start-site .tv-start-card-count { display: block; }
  .tv-start-site .tv-start-card-faces { display: inline-flex; }
}
/* The host line links to the live site in a new tab (Akemi 14/10/2026). Quiet at rest: the line's own
   muted colour, no underline, the arrow at 60%. Hover and keyboard focus raise it to the text colour
   with an underline 3px under the host and the arrow at full strength; keyboard focus adds the ring.
   One line: a long host ends in an ellipsis and the arrow never wraps away from it. */
.tv-start-site-link {
  display: inline-flex; align-items: center; gap: 3px; max-width: 100%; vertical-align: top;
  color: inherit; text-decoration: none; border-radius: 4px; corner-shape: round; outline: none;
}
.tv-start-site-host { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tv-start-site-link svg { flex: none; width: 12px; height: 12px; opacity: .6; transition: opacity .12s; }
.tv-start-site-link:hover, .tv-start-site-link:focus-visible { color: var(--foreground, #172026); }
.tv-start-site-link:hover .tv-start-site-host, .tv-start-site-link:focus-visible .tv-start-site-host {
  text-decoration: underline; text-underline-offset: 3px;
}
.tv-start-site-link:hover svg, .tv-start-site-link:focus-visible svg { opacity: 1; }
.tv-start-site-link:focus-visible { outline: 1.5px solid var(--ring, #bf5b3d); outline-offset: 2px; }

/* The creation workspace has no site or platform to name. Its ordinary agent composer caused
   no-site tool errors in PR #81. Option B replaces it with Help; absent that plugin's marker,
   keep the native agent bar hidden so loading or disabling Help never exposes the unsafe route. */
html[data-tracy-scope="onboarding"][data-tracy-hide~="mode-platform-row"] [class*="composerHero"]:has([data-tracy-start]) > [class*="heroWorkspaceRow"] { display: none; }
/* !important on the slot wrappers: dsh's renderer writes display:contents INLINE on every
   [data-slot] anchor (ui-renderer scoped-slots ANCHOR_STYLE), and an inline value outranks any
   stylesheet rule without it. Measured 14/09: the rule matched, the bar stayed. */
html[data-tracy-scope="onboarding"]:not(:has(meta[name="tracy-widget-native"])) [class*="composerHero"] > [data-slot="conversation.composer.bar"]:not(:has([data-tracy-help-composer])) { display: none !important; }
/* dsh's own hero stack (its mark, its hidden headline): the mark is drawn beside the title
   instead while the first screen is up. First child of the hero, a hashed _root class. */
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-start]) > [class*="_root"]:first-child { display: none; }


/* Local Option B: the heading and start doors (one block), then the suggestion chips and the Help
   composer. Slot wrappers use display:contents, so each piece is an item of the hero flex stack. */
/* dsh centers the hero in its scroll body. Once a wizard narrows the column, the taller Help
   stack must start at the scroll origin so its heading remains reachable; center it while it fits. */
html[data-tracy-scope="onboarding"] [data-conversation-scroll]:has([class*="composerHero"] [data-tracy-start="1"]) { justify-content: safe center; }
/* Query the hero's actual column, including a narrow centre column in a wide window.
   dsh already gives the hero a definite width, so containment preserves its desktop geometry. */
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-start="1"]) { container: tracy-onboarding-hero / inline-size; }
/* The scroll body's parent also measures the column, so the narrow query can reach the flex
   ancestors of the hero. dsh reserves 14px between this box and the hero (the same in Case 2). */
html[data-tracy-scope="onboarding"] [class*="_body"]:has(> [data-conversation-scroll]),
[class*="_body"]:has(> [data-conversation-scroll]):has([data-tracy-start="site"]) { container: tracy-onboarding-column / inline-size; }
html[data-tracy-scope="onboarding"] .tv-start-heading {
  order: 0; padding: 0 var(--dsh-composer-side-clearance, 16px); box-sizing: border-box;
  min-width: 0; flex-wrap: wrap; text-align: center;
}
html[data-tracy-scope="onboarding"] .tv-start-title { font-size: calc(var(--dsh-content-font-size, 14px) + 10px); }
html[data-tracy-scope="onboarding"] .tv-start-subtitle { text-wrap: pretty; }
html[data-tracy-scope="onboarding"] .tv-start-subtitle { font-size: var(--dsh-content-font-size, 14px); }
html[data-tracy-scope="onboarding"] .tv-start-subtitle { order: 0; margin: 0 16px 16px; }
html[data-tracy-scope="onboarding"] [class*="composerHero"] .tv-help-dock { order: 1; margin: 0 0 12px; }
html[data-tracy-scope="onboarding"] [class*="composerHero"] .tv-onboarding-input { order: 2; margin: 0 auto; }
html[data-tracy-scope="onboarding"] [class*="composerHero"] .tv-start-cards {
  order: 3; flex-direction: row; flex-wrap: wrap; justify-content: center;
  box-sizing: border-box; min-width: 0; max-width: calc(100% - 2 * var(--dsh-composer-side-clearance, 16px));
  width: auto; margin: ${START_WIDE_CARD_MARGIN}px var(--dsh-composer-side-clearance, 16px) 0; gap: 8px;
}
html[data-tracy-scope="onboarding"] .tv-start-cards .tv-start-card {
  width: auto; max-width: 100%;
}
html[data-tracy-scope="onboarding"] .tv-start-cards .tv-start-card:focus-visible { outline: 1px solid var(--ring); }

/* The site's compact first screen at every width (Akemi 23/10/2026): title and line, no mark, the
   three cards in one column. The wide column query below only centres it, as on a site. */
html[data-tracy-scope="onboarding"] [class*="composerHero"] .tv-dock[data-tracy-start="1"] {
  display: flex; ${START_DOCK_RULES}
}
html[data-tracy-scope="onboarding"] [class*="composerHero"] .tv-start {
  display: flex; ${COMPACT_START_RULES}
}
html[data-tracy-scope="onboarding"] .tv-start-heading {
  justify-content: center; padding: 0; text-align: center;
}
html[data-tracy-scope="onboarding"] [class*="composerHero"] .tv-start-cards {
  order: 0; flex-direction: column; flex-wrap: nowrap; width: fit-content; margin-inline: 0;
}
html[data-tracy-scope="onboarding"] .tv-start-cards .tv-start-card { width: 100%; }
@container tv-start-site (min-width: 400px) {
  html[data-tracy-scope="onboarding"] [class*="composerHero"] .tv-start .tv-start-cards { min-width: min(280px, 100%); }
}

/* Reuse Case 2's full-height seat and hero, including its 8px bottom and side clearance.
   The outer column includes dsh's 14px gutter, so this is the hero's existing 660px breakpoint.
   Keep the footer in flow: scrolling can reveal every card and answer above the sticky footer. */
@container tracy-onboarding-column (max-width: ${START_COMPACT_WIDTH + START_COLUMN_GUTTER}px) {
  [data-conversation-scroll]:has([class*="composerHero"] [data-tracy-start="1"]) { justify-content: flex-start; }
  [data-conversation-scroll]:has([class*="composerHero"] [data-tracy-start="1"]) > [data-composer-seat] { flex: 1 0 auto; }
  [class*="composerHero"]:has([data-tracy-start="1"]) {
    ${DOCKED_HERO_RULES}
  }
  /* fitDock writes an inline cap for the centred wide hero. Here the column itself scrolls,
     so keep the whole answer in flow and let the sticky footer reserve its own room. */
  html[data-tracy-scope="onboarding"] [class*="composerHero"] .tv-help-dock {
    margin-top: 24px; max-height: none !important; overflow-y: visible;
  }
  html[data-tracy-scope="onboarding"] [class*="composerHero"] .tv-onboarding-input {
    flex: none; margin-top: auto; padding-top: 24px; position: sticky; bottom: 8px;
    background: var(--background);
  }
  /* The empty first screen centres above the composer, just like the site workspace.
     A short viewport, the narrowest columns and Help answers retain the sequential,
     scrollable sticky-footer layout. The column includes the hero's 14px outer gutter. */
  @media (min-height: 821px) {
    @container tracy-onboarding-column (width > 284px) {
      html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-start="1"]):not(:has(.tv-help-dock)) {
        display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(min-content, 1fr) auto;
      }
      html[data-tracy-scope="onboarding"] [class*="composerHero"]:not(:has(.tv-help-dock)) .tv-dock[data-tracy-start="1"] {
        grid-area: 1 / 1; min-width: 0; align-self: stretch;
      }
      html[data-tracy-scope="onboarding"] [class*="composerHero"]:not(:has(.tv-help-dock)) .tv-onboarding-input { display: contents; }
      html[data-tracy-scope="onboarding"] [class*="composerHero"]:not(:has(.tv-help-dock)) .tv-onboarding-composer {
        box-sizing: border-box; width: calc(100% - 2 * var(--dsh-composer-side-clearance, 16px));
        max-width: var(--dsh-composer-card-max-width, 712px); margin-inline: auto;
      }
      html[data-tracy-scope="onboarding"] [class*="composerHero"]:not(:has(.tv-help-dock)) .tv-onboarding-composer { grid-area: 2 / 1; }
    }
  }
}

/* A site's workspace before its first message (Case 2, Akemi 01/10/2026): in a narrow column the
   start block fills the column and the composer sits at its bottom, as it does once a conversation
   runs. The wide query below centres both together. All of it keys on the block's wrapper (data-tracy-start="site"), which
   index.tsx draws only while the start-cards switch is on, so switching it off gives back dsh's
   hero untouched. The hero's own pieces are replaced, not dropped: its question is the block's
   title, the workspace chip is the site chip at the top left (@tracy/dsh-my-sites), the role picker
   is the chip in the composer row (@tracy/dsh-mode-picker), and the platform is the site chip's logo.
   dsh's hashed classes are matched by their readable tail, its stable attributes by name. */
[data-conversation-scroll]:has([class*="composerHero"] [data-tracy-start="site"]) { justify-content: flex-start; }
[data-conversation-scroll]:has([class*="composerHero"] [data-tracy-start="site"]) > [data-composer-seat] { flex: 1 0 auto; }
[class*="composerHero"]:has([data-tracy-start="site"]) {
  ${DOCKED_HERO_RULES}
}
/* The card sits 8px from the column's sides and bottom, as Claude Design's narrowest chat does (Akemi
   14/10/2026). Until then the bottom padding was the in-session composer's foot (its stats row plus
   4px) so the card did not move on the first message; it now drops by that foot once the
   conversation runs. */
[class*="composerHero"]:has([data-tracy-start="site"]) > [class*="_root"]:first-child,
[class*="composerHero"]:has([data-tracy-start="site"]) > [class*="heroWorkspaceRow"] { display: none; }
[class*="composerHero"] > [data-slot="conversation.input.dock"] > .tv-dock[data-tracy-start="site"] {
  ${START_DOCK_RULES}
}
/* Something was sent with a / command (index.tsx, start-sent.mjs): the wrapper stays, empty, only to keep
   the composer at the bottom; what was sent and its answer sit right above the composer, as in a chat. */
[class*="composerHero"] > [data-slot="conversation.input.dock"] > .tv-dock[data-tracy-start="site"][data-tracy-sent] { padding: 0; }
/* The block belongs to the start screen only. A session can be active before its first message (the
   person opened the Comments view and came back to Chat): the docked composer then renders the same
   dock, and the cards must not ride above it. */
.tv-dock[data-tracy-start="site"] { display: none; }
[class*="composerHero"] > [data-slot="conversation.input.dock"] > .tv-dock[data-tracy-start="site"] { display: flex; }

/* The same column query as creation: on a wide column, centre the cards and composer together.
   Match creation's hero gap plus its card margin; the native composer keeps the shared width cap.
   A sent command retains the existing docked treatment even while the hero wrapper survives. */
@container tracy-onboarding-column (width > ${START_COMPACT_WIDTH + START_COLUMN_GUTTER}px) {
  /* Creation before its first question, the same stack as the site (Akemi 23/10/2026): heading,
     cards, then the composer, centred together in a full-height hero.
     A Help conversation keeps its own docked layout, so every rule leaves it alone. */
  html[data-tracy-scope="onboarding"] [data-conversation-scroll]:has([class*="composerHero"] [data-tracy-start="1"]):not(:has([data-tracy-help-conversation])) { justify-content: flex-start; }
  html[data-tracy-scope="onboarding"] [data-conversation-scroll]:has([class*="composerHero"] [data-tracy-start="1"]):not(:has([data-tracy-help-conversation])) > [data-composer-seat] { flex: 1 0 auto; }
  html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-start="1"]):not(:has([data-tracy-help-conversation])) {
    ${DOCKED_HERO_RULES}
    justify-content: safe center; gap: ${START_HERO_GAP + START_WIDE_CARD_MARGIN}px; padding-block: 24px;
  }
  html[data-tracy-scope="onboarding"] [class*="composerHero"] .tv-dock[data-tracy-start="1"] {
    flex: none; padding: 0;
  }
  /* The start cards in one centred row, each as wide as its words, the stacked gap between them.
     The block drops its 592px cap so four site cards fit; past the column they wrap, centred. */
  ${startRowRule('.tv-start', 'max-width: none;')}
  ${startRowRule('.tv-start-cards', 'flex-direction: row; flex-wrap: wrap; justify-content: center; max-width: none; width: auto;')}
  ${startRowRule('.tv-start-cards .tv-start-card', 'flex: none; width: auto;')}
  [class*="composerHero"]:has([data-tracy-start="site"]):not(:has([data-tracy-sent])) {
    justify-content: safe center; gap: ${START_HERO_GAP + START_WIDE_CARD_MARGIN}px; padding-block: 24px;
  }
  [class*="composerHero"]:not(:has([data-tracy-sent])) > [data-slot="conversation.input.dock"] > .tv-dock[data-tracy-start="site"] {
    flex: none; padding: 0;
  }
}

/* A Viewer's start screen (ADR 0028, ViewerBar.tsx): the question and its cards in the middle of the
   column, and one bar right above the chat box, as wide as it. The bar is a quiet card: an eye, what
   the seat may do, and an outline button that asks the site's Owners for edit access. Focus is the
   button's own 1px border changing colour, no halo. The dock slot has no side padding while dsh's
   composer root keeps --dsh-composer-side-clearance on each side of the card, so the bar takes the
   same clearance off its width: its edges land on the card's in the hero and once docked alike
   (measured 08/10/2026: without it the bar stood ~16px out on both sides). */
[class*="composerHero"] > [data-slot="conversation.input.dock"] > .tv-dock[data-tracy-start="site"][data-tracy-viewer] { padding-bottom: 12px; }
.tv-dock[data-tracy-viewer] > .tv-start { margin-block: auto; }
.tv-viewer-bar {
  container: tv-viewer-bar / inline-size;
  width: calc(100% - 2 * var(--dsh-composer-side-clearance, 16px)); max-width: var(--dsh-composer-card-max-width);
  margin: 0 auto; padding: 9px 10px 9px 14px; box-sizing: border-box;
  border: 1px solid var(--border, #e5e7eb); border-radius: 12px; background: var(--card, #ffffff);
}
.tv-viewer-bar-body { display: flex; align-items: center; gap: 10px; }
.tv-viewer-bar-icon { flex: none; width: 14px; height: 14px; color: var(--muted-foreground, #6b7280); }
.tv-viewer-bar-text { flex: 1; min-width: 0; }
/* Narrow column (measured 08/10/2026: at ~500px the sentence broke into four short lines beside the
   button): the sentence takes the whole row after the eye, and the button goes on its own line under
   it, starting where the text starts (the icon's 14px plus the 10px gap). The eye sits on the first
   line of the sentence instead of the middle of the block. */
@container tv-viewer-bar (max-width: 520px) {
  .tv-viewer-bar-body { flex-wrap: wrap; align-items: flex-start; row-gap: 8px; }
  .tv-viewer-bar-icon { margin-top: 2px; }
  .tv-viewer-bar-text { flex-basis: calc(100% - 24px); }
  .tv-viewer-bar-button { margin-left: 24px; }
}
.tv-viewer-bar-line, .tv-viewer-bar-error { margin: 0; font-size: 13px; line-height: 18px; color: var(--muted-foreground, #6b7280); overflow-wrap: anywhere; }
.tv-viewer-bar-error { margin-top: 2px; color: var(--destructive, #b42318); }
.tv-viewer-bar-button {
  flex: none; height: 30px; padding: 0 12px; box-sizing: border-box;
  border: 1px solid var(--input, #e3e7e9); border-radius: 8px; background: transparent;
  color: var(--foreground, #172026); font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer;
}
.tv-viewer-bar-button:hover:not(:disabled) { background: color-mix(in oklab, var(--foreground, #172026) 6%, transparent); }
.tv-viewer-bar-button:disabled { opacity: .6; cursor: default; }
.tv-viewer-bar-button:focus-visible { outline: none; border-color: var(--ring, #bf5b3d); }
/* The same bar through the session (index.tsx, its own dock occupant): right above the chat box once
   the conversation runs, a little space between it and the card. While the start block's own bar is
   on screen (a Viewer's start screen in the hero) this one steps aside, so one bar shows at a time. */
.tv-viewer-bar[data-viewer-bar-place="session"] { margin-bottom: 8px; }
/* The short line a Viewer made Editor reads for a few seconds (SeatBar.tsx, #1036): the same card in
   the same place, so the bar it replaces does not leave a jump; nothing to press. */
.tv-viewer-bar[data-viewer-bar-place="notice"] { margin-bottom: 8px; }
/* A seat taken back (J7.8): the same card, a link styled as the bar's button, the chat box under it dimmed. */
.tv-viewer-bar[data-viewer-bar-place="removed"] { margin-bottom: 8px; }
a.tv-viewer-bar-button { display: inline-flex; align-items: center; text-decoration: none; color: inherit; }
[data-slot="conversation.composer.bar"] [data-composer-card][inert] { opacity: .55; }
[class*="composerHero"]:has(> [data-slot="conversation.input.dock"] > .tv-dock[data-tracy-start="site"][data-tracy-viewer]) .tv-viewer-bar[data-viewer-bar-place="session"] { display: none; }

/* Two dropdowns customers never decide, hidden on every screen (Akemi 14/09): the access mode —
   the seat decides what the agent may touch, and a picker here only promises what the seat then
   refuses — and the model with its effort menu, which Tracy picks for the customer. The model
   picker sits in its own slot; the access mode is the first span of dsh's modes group
   (ui-conversation InputBar: the PermissionSelect root, before the plan-mode slot). */
/* Since 28/09 both are operator switches (/ops › User Interface, ids access-mode and model-picker;
   the mode row above is mode-platform-row), read from <html data-tracy-hide> (@tracy/core
   ui-switches). */
:root[data-tracy-hide~="access-mode"] [data-slot="conversation.composer.bar"] [class*="_modes"] > span { display: none; }
:root[data-tracy-hide~="model-picker"] [data-slot="conversation.input.model"] { display: none !important; }

/* dsh pieces an operator can hide (/ops › User Interface › DSH). Every hook is an attribute, never a
   hashed class: data-open-target is upstream's, data-view / data-session-menu / data-menu-item are
   the dsh fork's 0.1.7-rc.2-tracy.9 hooks (vendor/tracy/deepseek-harness/TRACY-FORK.md). The session
   menu is not portaled, so its items sit under the header utilities slot. */
:root[data-tracy-hide~="dsh-trajectory-tab"] [data-conversation-tabs] [data-view="trajectory"] { display: none; }
:root[data-tracy-hide~="dsh-open-in-app"] [data-slot="conversation.session.header.utilities"] [data-open-target="directory"] { display: none; }
:root[data-tracy-hide~="dsh-session-menu"] [data-slot="conversation.session.header.utilities"] [data-session-menu] { display: none; }
:root[data-tracy-hide~="dsh-session-menu-feedback"] [data-slot="conversation.session.header.utilities"] [data-menu-item="feedback"] { display: none; }
:root[data-tracy-hide~="dsh-session-menu-download"] [data-slot="conversation.session.header.utilities"] [data-menu-item="download"] { display: none; }


/* The line under the queue while a Tracy update holds a message (DeployHoldNotice.tsx). */
.tv-held {
  padding: 8px 12px; border: 1px solid var(--dsw-alias-border-l2, #e3e7e9); border-radius: 12px;
  color: var(--muted-foreground, #6b7280); font-size: 13px; line-height: 1.45;
}
.tv-held-error { color: var(--foreground, #172026); border-color: var(--dsw-alias-brand-primary, #bf5b3d); }
/* The card under a turn that changed the site (TurnUndoCard.tsx; approved 06/10/2026, plan-verified.html
   door d1): what changed on the left, View and Undo on the right; the confirmation, the spinner and the
   Undone note are drawn inside the same box, never in a dialog. Tracy tokens only, so one rule is right
   in both themes. The blocked title is the brand colour pulled a step toward the text colour: darker
   on light, lighter on dark, readable on both without a second rule or a hand-picked amber. */
.tv-undo {
  display: flex; flex-direction: column; gap: 4px; margin: 10px 0; padding: 10px 12px;
  border: 1px solid var(--border, #e5e7eb); border-radius: 10px;
  background: var(--card, transparent); color: var(--foreground, #172026);
  font-size: 13px; line-height: 1.45;
}
.tv-undo-done { border-style: dashed; background: transparent; }
.tv-undo-quiet { color: var(--muted-foreground, #6b7280); }
.tv-undo-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; min-width: 0; }
.tv-undo-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tv-undo-title { margin: 0; font-size: 13.5px; font-weight: 600; }
.tv-undo-line { margin: 0; font-size: 12.5px; overflow-wrap: anywhere; }
.tv-undo-muted { color: var(--muted-foreground, #6b7280); }
.tv-undo-cut { margin: 0 0 4px; font-size: 12.5px; color: var(--muted-foreground, #6b7280); }
.tv-undo-warn { color: color-mix(in oklab, var(--primary, #bf5b3d) 80%, var(--foreground, #172026)); }
.tv-undo-with-icon { display: inline-flex; align-items: center; gap: 6px; }
.tv-undo-with-icon svg { flex: none; width: 13px; height: 13px; }
.tv-undo-actions { display: flex; flex: none; align-items: center; gap: 6px; }
.tv-undo-foot { justify-content: flex-end; margin-top: 6px; }
.tv-undo-button {
  display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; box-sizing: border-box;
  border: 1px solid var(--border, #e5e7eb); border-radius: 7px;
  background: var(--card, transparent); color: var(--foreground, #172026);
  font: inherit; font-size: 12.5px; white-space: nowrap; cursor: pointer;
  transition: background-color .12s, border-color .12s;
}
.tv-undo-button:hover:not(:disabled) { background: color-mix(in oklab, var(--foreground, #172026) 6%, var(--card, #ffffff)); }
.tv-undo-button:focus { outline: none; }
.tv-undo-button:focus-visible { border-color: var(--ring, #bf5b3d); }
.tv-undo-button:disabled { cursor: default; opacity: .4; }
.tv-undo-ghost { border-color: transparent; background: transparent; color: var(--muted-foreground, #6b7280); }
.tv-undo-ghost:hover:not(:disabled) { color: var(--foreground, #172026); }
.tv-undo-primary { border-color: var(--primary, #bf5b3d); background: var(--primary, #bf5b3d); color: var(--primary-foreground, #ffffff); }
.tv-undo-primary:hover:not(:disabled) { background: color-mix(in oklab, var(--primary, #bf5b3d) 88%, var(--foreground, #172026)); }
.tv-undo-primary:focus-visible { border-color: var(--foreground, #172026); }
.tv-undo-link {
  padding: 0; border: 0; background: none; font: inherit; color: inherit;
  text-decoration: underline; text-underline-offset: 2px; cursor: pointer;
}
.tv-undo-link:hover { color: var(--foreground, #172026); }
.tv-undo-link:focus { outline: none; }
.tv-undo-link:focus-visible { color: var(--foreground, #172026); text-decoration-color: var(--ring, #bf5b3d); }
.tv-undo-spin {
  display: inline-block; flex: none; width: 12px; height: 12px; box-sizing: border-box; border-radius: 50%;
  border: 2px solid color-mix(in oklab, currentColor 25%, transparent); border-top-color: currentColor;
  animation: tv-undo-spin .8s linear infinite;
}
@keyframes tv-undo-spin { to { transform: rotate(360deg); } }
/* The report under a turn sent from comments (ADR 0025, CommentReportCard.tsx): the same calm bordered
   note — a group head, then one line per comment that opens its thread on the page. */
.tv-report {
  display: flex; flex-direction: column; gap: 6px; margin: 8px 0; padding: 10px 14px;
  border: 1px solid var(--dsw-alias-border-l2, #e3e7e9); border-radius: 12px;
  color: var(--foreground, #172026); font-size: 13px; line-height: 1.45;
}
.tv-report-head { margin: 0; font-weight: 600; }
.tv-report-hint { font-weight: 400; color: var(--muted-foreground, #6b7280); }
.tv-report-list { display: flex; flex-direction: column; gap: 2px; margin: 0 0 4px; padding: 0; list-style: none; }
.tv-report-line {
  display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 0; border: 0; background: none; font: inherit; text-align: left; color: var(--muted-foreground, #6b7280);
}
button.tv-report-line { cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
button.tv-report-line:hover { color: var(--dsw-alias-brand-primary, #bf5b3d); }
/* "Ask Tracy to edit all": a comment already sent and waiting says when it went (ADR 0025). */
.tv-cv-checklist-sent { flex: none; font-size: 11px; color: var(--muted-foreground, #6b7280); }

/* The chip of a chat turn sent from the Browser tab's Comment mode. dsh draws it itself wherever it
   projects user text — the durable row, steering, the echo before the durable message, the queue
   strip — through its fenced-block fold (index.tsx, registerCommentFold): a plain reference chip
   marked data-fold, on its own line under the person's sentence. These rules dress it: 16px line +
   2px padding + 1px border = 22px, one bubble line, so the echo and the durable row that replaces
   it are one drawing at one height (28/09, tasks/evidence/comment-row-identical/). vertical-align:
   top keeps the 22px box inside the bubble's 22px line instead of riding its baseline and growing
   the line. Element + attribute selectors outrank dsh's one-class chip. A comment about a whole page
   (a tracy-page block, plan "comment review" H4) is dressed the same way: bubble, page icon, path. */
span[data-fold="tracy-element"],
span[data-fold="tracy-page"] {
  display: inline-flex; align-items: center; gap: 4px; vertical-align: top;
  max-width: 100%; box-sizing: border-box; margin: 0; padding: 2px 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e3e7e9); border-radius: 6px;
  background: var(--dsw-specific-bubble, #f3f4f6);
  color: var(--foreground, #172026); font-size: 11px; line-height: 16px; font-weight: 500;
}
span[data-fold="tracy-element"] > span[aria-hidden],
span[data-fold="tracy-page"] > span[aria-hidden] {
  width: 11px; height: 11px; margin: 0; vertical-align: 0; color: var(--muted-foreground, #6b7280);
}
.tv-comment-chip-icon { width: 11px; height: 11px; flex: none; }
/* After a number the icon box grows (below), and dsh's own rule stretches an icon to its box
   (ui-primitives user-text.module.css .foldIcon > svg { width: 100% }): measured 29/09 in
   tasks/evidence/comment-review/t-render/, the page icon grew to 34px over the path. Pin it. */
span[data-fold] > span[aria-hidden] > svg.tv-comment-chip-icon { width: 11px; height: 11px; flex: none; }
/* A chip stays ONE 22px line whatever its words: an inline-block, so a quote too long for the column
   ends in an ellipsis instead of wrapping the chip onto a second line (a flex chip cannot ellipsize its
   bare text). Stage 6 (story ChatMessageFromPage): the icon box grows to hold the AUTHOR's bubble —
   the pin's shape small, round with its bottom-left corner square, the initial on the author's colour
   (inline style) — then the element's icon. No number: it is the request's, not the person's. */
span[data-fold="tracy-element"]:has(> span[aria-hidden] > .tv-comment-chip-author),
span[data-fold="tracy-page"]:has(> span[aria-hidden] > .tv-comment-chip-author) {
  display: inline-block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
span[data-fold="tracy-element"] > span[aria-hidden]:has(> .tv-comment-chip-author),
span[data-fold="tracy-page"] > span[aria-hidden]:has(> .tv-comment-chip-author) {
  display: inline-flex; align-items: center; gap: 4px; width: auto; height: 16px;
  margin: 0 4px 0 0; vertical-align: top;
}
.tv-comment-chip-author {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 16px; height: 16px; box-sizing: border-box; border-radius: 8px 8px 8px 0;
  color: #fff; font-size: 9px; line-height: 16px; font-weight: 600;
}

/* A chip with its thread under it (acceptance F6, story ThreadCardSendToChat; ChatThread.tsx): the
   fold's own box turns into a plain column — no border, no fill — and its glyph box dissolves
   (display: contents) so the chip face and the thread are its two rows. The face is dressed exactly
   like a plain chip above; the thread is a quiet block with a left rule, one line per person. */
span[data-fold="tracy-element"]:has(.tv-comment-thread) {
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px; width: 100%;
  padding: 0; border: 0; background: none; white-space: normal; font-weight: 400;
}
span[data-fold="tracy-element"]:has(.tv-comment-thread) > span[aria-hidden] { display: contents; }
.tv-comment-chip-face {
  display: inline-flex; align-items: center; gap: 4px; max-width: 100%; box-sizing: border-box; padding: 2px 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e3e7e9); border-radius: 6px; background: var(--dsw-specific-bubble, #f3f4f6);
  font-size: 11px; line-height: 16px; font-weight: 500; color: var(--foreground, #172026);
}
.tv-comment-chip-face svg.tv-comment-chip-icon { width: 11px; height: 11px; flex: none; color: var(--muted-foreground, #6b7280); }
.tv-comment-chip-words { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tv-comment-thread {
  display: flex; flex-direction: column; gap: 2px; align-self: stretch; box-sizing: border-box; min-width: 0;
  padding-left: 8px; border-left: 2px solid var(--dsw-alias-border-l2, #e3e7e9);
  font-size: 12px; line-height: 16px; color: var(--muted-foreground, #6b7280); overflow-wrap: anywhere;
}
.tv-comment-thread-title { font-weight: 500; }
.tv-comment-thread-who { font-weight: 500; color: var(--foreground, #172026); }
.tv-comment-thread-more {
  align-self: flex-start; padding: 0; border: 0; background: none; font: inherit; font-size: 12px;
  color: var(--muted-foreground, #6b7280); text-decoration: underline; text-underline-offset: 2px; cursor: pointer;
}
.tv-comment-thread-more:hover { color: var(--foreground, #172026); }

/* The Comments tab of the chat column (CommentsView.tsx), stage 6: people comments only. Sizes and
   colours from the stories (browser-comment.mock.stories.tsx, CommentsTabPeopleOnly · SendNChecklist ·
   PageCommentBox · CommentsTabPeopleOnlyEmpty): no status colours any more — an avatar and the chip's
   bubble carry the AUTHOR's colour (inline style: the server's face, comment-view.mjs authorOf), everything else is
   neutral. The column follows ui-chat's: the chat width, centred, the composer clearance at the sides. */
/* Round 5 (acceptance E10): the view fills dsh's view area (a flex column) whatever it holds, so the
   "Send all" list hanging from the Open head has the column's height below it — it was cut ~6 px short
   with ~450 px empty under the view, because the view (a scroll box: \`overflow-x: hidden\` makes it one)
   was only as tall as its two rows. */
.tv-cv {
  position: relative; display: flex; flex-direction: column; box-sizing: border-box; width: 100%; min-width: 0;
  flex: 1 0 auto;
  max-width: var(--dsh-chat-content-width, 100%); margin: 0 auto;
  /* Nothing in the view may widen the chat column: a column that scrolled sideways once stayed
     shifted when the Chat view came back (stand E2E H1, 300 px). */
  overflow-x: hidden;
  padding: 4px calc(var(--dsh-composer-side-clearance, 0px) + 12px) 0;
  color: var(--foreground, #172026); font-size: 13px; line-height: 1.4;
}
/* Acceptance F5: dsh's width handles sit absolute in the conversation body; clip takes the sideways
   scroll range away while the Comments view is in the body. */
[data-conversation-content]:has([data-tracy-comments]) { overflow-x: clip; }
/* While this view is on screen the body does not scroll: the view area takes the room the composer seat
   leaves, and inside the view only the LIST scrolls (redesign A, L1): the page filter and the toolbar
   stay put, and a page header sticks flush to the top of the list with nothing above it. */
[data-conversation-scroll]:has([data-tracy-comments]) { overflow-y: hidden; }
[data-conversation-scroll]:has([data-tracy-comments]) > [data-slot="conversation.session"] > [class*="viewArea"] {
  flex: 1 1 0; min-height: 0;
}
[data-conversation-scroll]:has([data-tracy-comments]) .tv-cv { flex: 1 1 0; min-height: 0; overflow-y: hidden; }
/* The hairline over the bottom row: an inset shadow, not a border, so it is a 1px band at the seat's top
   edge exactly as the left column's hairline is (a 1px box), and lines up with it at any page zoom; a
   border is rounded to a device pixel and moved the seat's edge by a fraction (measured at 90% zoom). */
[data-conversation-scroll]:has([data-tracy-comments]) > [data-composer-seat]:has(.tv-cv-footer) {
  box-shadow: inset 0 1px 0 var(--border, #e3e7e9);
}
.tv-cv-list {
  flex: 1 1 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  padding: 0 0 12px; display: flex; flex-direction: column;
}
.tv-cv-head-error {
  margin: 0 4px 8px; font-size: 12px; line-height: 16px; overflow-wrap: anywhere;
  color: var(--destructive, #dc2626);
}

/* The page filter (U10): two halves of one quiet control, the chosen one filled; each carries a grey pill
   of the open threads in its scope, none at 0, and the unread dot while this person has unread ones
   there (Lee 04/10/2026; the dot's rule sits with the start card's count). */
.tv-cv-filter {
  flex: none; display: flex; gap: 2px; margin: 8px 0 0; padding: 2px; border-radius: 8px;
  background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent); container: tv-cv-filter / inline-size;
}
.tv-cv-filter-short { display: none; }
@container tv-cv-filter (max-width: 250px) {
  .tv-cv-filter-long { display: none; }
  .tv-cv-filter-short { display: inline; }
}
.tv-cv-filter-side {
  flex: 1 1 0; min-width: 0; height: 24px; padding: 0 8px; border: 0; border-radius: 6px; background: none;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  color: var(--muted-foreground, #6b7280); font: inherit; font-size: 12px; cursor: pointer;
  overflow: hidden; white-space: nowrap;
}
.tv-cv-filter-long, .tv-cv-filter-short { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tv-cv-filter-side[aria-pressed="true"] {
  background: var(--background, #fff); color: var(--foreground, #172026); font-weight: 500;
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}
.tv-cv-pill {
  position: relative; display: inline-block; flex: none; min-width: 18px; height: 16px; padding: 0 5px; box-sizing: border-box;
  border-radius: 999px; font-size: 10px; font-weight: 600; line-height: 16px; text-align: center;
  font-variant-numeric: tabular-nums;
  background: color-mix(in oklab, var(--foreground, #172026) 8%, transparent); color: var(--muted-foreground, #6b7280);
}
/* The dot's ring takes the colour of the side it sits on: the chosen side is filled with the page. */
.tv-cv-filter-side[aria-pressed="true"] .tv-cv-pill { --tv-dot-ring: var(--background, #fff); }

/* The toolbar (redesign A): the status filter, then Delete all and Ask Tracy to edit all at the right;
   in a narrow tab the actions wrap whole onto a line under the filter, never past the tab's edge.
   Ten pixels under it, so a stuck page header never touches it. */
.tv-cv-bar {
  flex: none; position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0;
  padding: 10px 0 10px; font-size: 12px; container: tv-cv-head / inline-size;
}
.tv-cv-bar-actions { flex: none; display: flex; align-items: center; gap: 8px; margin-left: auto; }
/* The status filter (Akemi 02/10/2026): the page filter's control and classes, Open | Resolved with their
   counts, sized to its words at the left of the toolbar instead of across the tab. Not a size container,
   so its width follows its two sides. */
.tv-cv-filter.tv-cv-status-filter { container-type: normal; flex: 0 1 auto; min-width: 0; margin: 0; }
.tv-cv-status-filter .tv-cv-filter-side { flex: 0 1 auto; }
/* Its counts are totals, not a call to act: a plain muted number beside the words, no pill, so the only
   terracotta in the tab's head is the unread pill above (Akemi 02/10/2026). The chosen side's number is a
   step bolder, as its words are. */
.tv-cv-filter-num {
  flex: none; color: var(--muted-foreground, #6b7280); font-size: 12px; font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.tv-cv-filter-side[aria-pressed="true"] .tv-cv-filter-num { font-weight: 600; }
/* Delete all: idle it is quiet words and a trash icon; on hover a button shape, red words on light grey. */
.tv-cv-del {
  flex: none; display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; box-sizing: border-box;
  border: 0; border-radius: 6px; background: none; color: var(--muted-foreground, #6b7280);
  font: inherit; font-size: 12px; font-weight: 500; white-space: nowrap; cursor: pointer;
}
.tv-cv-del:hover:not(:disabled), .tv-cv-del:focus-visible {
  color: var(--destructive, #dc2626); background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent); outline: none;
}
.tv-cv-del[data-tracy-undo], .tv-cv-del[data-tracy-undo]:hover { color: var(--primary, #bf5b3d); }
.tv-cv-del:disabled { cursor: default; opacity: .5; }
/* Delete all's window: a thin terracotta bar under the toolbar drains until the clear goes. */
.tv-cv-bar-drain {
  position: absolute; left: 0; right: 0; bottom: 4px; height: 2px; border-radius: 2px; overflow: hidden;
  background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent);
}
.tv-cv-bar-drain > i, .tv-ci-drain > i {
  display: block; height: 100%; background: var(--primary, #bf5b3d); transform-origin: left;
  animation-name: tv-drain; animation-timing-function: linear; animation-fill-mode: forwards;
}
@keyframes tv-drain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) { .tv-cv-bar-drain > i, .tv-ci-drain > i { animation: none; } }
.tv-cv-send-short { display: none; }
/* The actions shorten only when even a line of their own cannot hold their words (about 215 px);
   wider than that they wrap under the status filter instead. */
@container tv-cv-head (max-width: 230px) {
  .tv-cv-send-long { display: none; }
  .tv-cv-send-short { display: inline; }
  .tv-cv-del:not([data-tracy-undo]) .tv-cv-swap { display: none; }
}
.tv-cv-swap { display: inline-grid; font-variant-numeric: tabular-nums; }
.tv-cv-swap > * { grid-area: 1 / 1; text-align: center; }
.tv-cv-sizer { visibility: hidden; }

/* A page group (L1): a rounded framed card, its header sticky at the top of the list while it scrolls
   (nothing shows above it: the list starts flush under the toolbar), its comments inside with hairlines
   between them. The card clips to its own rounded inside (overflow clip makes no scroll box, so the
   header still sticks to the list): the header is square and takes the card's top corners from the
   clip, so once stuck it has no rounded corner for a row scrolling under it to show through, and the
   card's side borders stay whole beside it (measured: test/e2e/comments-list-redesign.test.mjs). */
.tv-cv-card {
  flex: none; margin: 0 0 8px; border: 1px solid var(--border, #e3e7e9); border-radius: 12px; overflow: clip;
  background: color-mix(in oklab, var(--foreground, #172026) 2.5%, var(--background, #fff));
}
.tv-cv-card-head {
  position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 7px; width: 100%;
  box-sizing: border-box; min-width: 0; margin: 0; padding: 7px 10px; border: 0; border-radius: 0;
  background: color-mix(in oklab, var(--foreground, #172026) 6%, var(--background, #fff));
  color: var(--foreground, #172026); font: inherit; font-size: 12px; line-height: 16px; text-align: left;
}
.tv-cv-card[data-open] > .tv-cv-card-head { border-bottom: 1px solid var(--border, #e3e7e9); }
.tv-cv-card[data-current] > .tv-cv-card-head { background: color-mix(in oklab, var(--foreground, #172026) 9%, var(--background, #fff)); }
button.tv-cv-card-head { cursor: pointer; }
button.tv-cv-card-head:hover { background: color-mix(in oklab, var(--foreground, #172026) 9%, var(--background, #fff)); }
.tv-cv-card[data-current] > button.tv-cv-card-head:hover { background: color-mix(in oklab, var(--foreground, #172026) 12%, var(--background, #fff)); }
button.tv-cv-card-head:focus-visible { outline: 2px solid var(--primary, #bf5b3d); outline-offset: -2px; }
.tv-cv-chevron { flex: none; width: 12px; height: 12px; color: var(--muted-foreground, #6b7280); transition: transform .15s; }
.tv-cv-card-head[aria-expanded="true"] .tv-cv-chevron { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .tv-cv-chevron { transition: none; } }
.tv-cv-page-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.tv-cv-page-path {
  flex: 0 1000 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; color: var(--muted-foreground, #6b7280);
}
/* The page the preview shows: a small terracotta dot, then the word, muted. */
.tv-cv-here {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  font-size: 10px; line-height: 14px; white-space: nowrap; color: var(--muted-foreground, #6b7280);
}
.tv-cv-here::before { content: ""; width: 6px; height: 6px; border-radius: 999px; background: var(--primary, #bf5b3d); }
.tv-cv-page-count {
  flex: none; margin-left: auto; font-size: 11.5px; font-weight: 500; color: var(--muted-foreground, #6b7280);
  font-variant-numeric: tabular-nums;
}
.tv-cv-card-items { padding: 4px; }
.tv-cv-card-items > .tv-ci + .tv-ci, .tv-cv-card-items > * + .tv-ci { border-top: 1px solid var(--border, #e3e7e9); border-radius: 0; }
.tv-cv-none { margin: 0; padding: 12px; text-align: center; font-size: 12px; color: var(--muted-foreground, #6b7280); }

/* Loading: three grey bars per row where the rows will be. */
.tv-cv-skeleton { display: grid; gap: 8px; padding: 12px; border-radius: 10px; }
.tv-cv-skeleton > i {
  display: block; height: 9px; border-radius: 5px; background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent);
}

/* A comment (CommentItem.tsx): the number alone on the left, the body on the right. */
.tv-ci {
  position: relative; display: grid; grid-template-columns: 26px minmax(0, 1fr); column-gap: 8px;
  padding: 10px 10px 10px 12px; border-radius: 10px; cursor: pointer; outline: none;
}
.tv-ci:hover, .tv-ci[data-menu-open], .tv-ci.tv-ci-hover { background: color-mix(in oklab, var(--foreground, #172026) 4.5%, transparent); }
.tv-ci:focus-visible { box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground, #172026) 45%, transparent); }
/* Selected: its thread card is open on the page — a pale terracotta fill and bar on the left. */
.tv-ci[data-selected] {
  background: color-mix(in oklab, var(--primary, #bf5b3d) 6%, transparent);
  box-shadow: inset 3px 0 0 color-mix(in oklab, var(--primary, #bf5b3d) 35%, transparent);
}
.tv-cv-card-items > .tv-ci[data-selected] { border-radius: 8px; }
.tv-ci[data-resolved] { opacity: .62; }
.tv-ci[data-resolved] .tv-ci-text { text-decoration: line-through; text-decoration-color: color-mix(in oklab, var(--foreground, #172026) 35%, transparent); }
.tv-ci[data-frozen] { opacity: .45; pointer-events: none; cursor: default; }
.tv-ci-num {
  align-self: start; padding-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; color: var(--muted-foreground, #6b7280); white-space: nowrap;
}
.tv-ci-body { min-width: 0; display: grid; gap: 5px; justify-items: start; }
/* The name line keeps room for the corner on its right, so hover never moves anything. */
.tv-ci-head { display: flex; align-items: center; gap: 6px; min-width: 0; min-height: 20px; padding-right: 52px; justify-self: stretch; }
.tv-ci-handle {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; font-weight: 500;
  color: color-mix(in oklab, var(--foreground, #172026) 72%, transparent);
}
.tv-ci-age { flex: none; font-size: 11px; white-space: nowrap; color: var(--muted-foreground, #6b7280); }
.tv-ci-text {
  justify-self: stretch; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; white-space: pre-line;
  color: color-mix(in oklab, var(--foreground, #172026) 68%, transparent);
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden;
}
.tv-ci-text-deleted { font-style: italic; color: var(--muted-foreground, #6b7280); }
/* A mention in Tracy terracotta, the brand --primary (Akemi 02/10/2026), not dsh's link colour. On a
   dark ground terracotta reads at about 4:1, so the dark theme lifts it toward the foreground: still
   derived from --primary, and it follows whatever primary the person picked. */
.tv-ci-mention { color: var(--primary, #bf5b3d); font-weight: 500; }
[data-ds-dark-theme] .tv-ci-mention { color: color-mix(in oklab, var(--primary, #bf5b3d) 80%, var(--foreground, #ededef)); }
/* Unread: the handle bold, the words in full colour, the time terracotta, the number bold. */
.tv-ci[data-unread] .tv-ci-handle { font-weight: 700; color: var(--foreground, #172026); }
.tv-ci[data-unread] .tv-ci-text { font-weight: 500; color: var(--foreground, #172026); }
.tv-ci[data-unread] .tv-ci-age { color: var(--primary, #bf5b3d); font-weight: 600; }
.tv-ci[data-unread] .tv-ci-num { color: var(--foreground, #172026); font-weight: 600; }
/* The tag under the words: Note grey, Asked Tracy terracotta, Tracy working amber, Done by Tracy green. */
.tv-ci-tag {
  font-size: 10px; font-weight: 600; line-height: 16px; border-radius: 999px; padding: 0 7px; white-space: nowrap;
  background: color-mix(in oklab, var(--foreground, #172026) 6%, transparent); color: var(--muted-foreground, #6b7280);
}
.tv-ci-tag[data-tag="asked"] { background: color-mix(in oklab, var(--primary, #bf5b3d) 14%, transparent); color: var(--primary, #bf5b3d); }
.tv-ci-tag[data-tag="working"] {
  background: color-mix(in oklab, var(--dsw-alias-state-warn-primary, #f59e0b) 18%, transparent);
  color: color-mix(in oklab, var(--dsw-alias-state-warn-primary, #f59e0b) 70%, var(--foreground, #172026));
}
.tv-ci-tag[data-tag="done"] {
  background: color-mix(in oklab, var(--success, #22a06b) 16%, transparent);
  color: color-mix(in oklab, var(--success, #22a06b) 75%, var(--foreground, #172026));
}
/* The picture a comment is anchored on: the chat composer's chip, a 28 px thumbnail and the file name. */
.tv-ci-att {
  display: inline-flex; align-items: center; gap: 8px; max-width: 100%; height: 34px; padding: 3px 10px 3px 3px;
  box-sizing: border-box; border-radius: 9px; border: 1px solid var(--border, #e3e7e9);
  background: color-mix(in oklab, var(--foreground, #172026) 6%, transparent);
  color: var(--foreground, #172026); font: inherit; cursor: zoom-in;
}
.tv-ci-att:hover { background: color-mix(in oklab, var(--foreground, #172026) 9%, transparent); border-color: var(--muted-foreground, #6b7280); }
.tv-ci-att:focus-visible { outline: 2px solid var(--primary, #bf5b3d); outline-offset: 2px; }
.tv-ci-att-img { flex: none; display: block; width: 28px; height: 28px; border-radius: 6px; object-fit: cover; }
.tv-ci-att-name { min-width: 0; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.tv-ci-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 11px; color: var(--muted-foreground, #6b7280); }
.tv-ci-files { display: inline-flex; align-items: center; gap: 4px; }
.tv-ci-files-icon { width: 11px; height: 11px; flex: none; }
.tv-ci-replies { font-size: 11.5px; font-weight: 600; color: var(--primary, #bf5b3d); }
/* The fixed corner: the unread dot, and on hover Resolve and the menu in its place. It never moves. */
.tv-ci-corner { position: absolute; top: 8px; right: 8px; height: 20px; display: flex; align-items: center; }
.tv-ci-dot { position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 999px; background: var(--primary, #bf5b3d); }
.tv-ci-acts { display: flex; align-items: center; gap: 4px; visibility: hidden; }
.tv-ci:hover .tv-ci-acts, .tv-ci:focus-within .tv-ci-acts, .tv-ci[data-menu-open] .tv-ci-acts, .tv-ci.tv-ci-hover .tv-ci-acts { visibility: visible; }
.tv-ci:hover .tv-ci-dot, .tv-ci:focus-within .tv-ci-dot, .tv-ci[data-menu-open] .tv-ci-dot, .tv-ci.tv-ci-hover .tv-ci-dot { visibility: hidden; }
@media (hover: none) { .tv-ci-acts { visibility: visible; } .tv-ci-dot { visibility: hidden; } }
.tv-ci-act {
  display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px;
  background: none; color: var(--muted-foreground, #6b7280); cursor: pointer;
}
.tv-ci-act:hover, .tv-ci-act:focus-visible, .tv-ci-act[aria-expanded="true"] {
  background: color-mix(in oklab, var(--foreground, #172026) 8%, transparent); color: var(--foreground, #172026); outline: none;
}
.tv-ci-act-icon { width: 14px; height: 14px; }
.tv-ci-menu {
  position: fixed; z-index: 2147482000; display: flex; flex-direction: column; width: 184px; padding: 4px;
  box-sizing: border-box; border-radius: 10px; border: 1px solid var(--border, #e3e7e9);
  background: var(--popover, var(--background, #fff)); color: var(--popover-foreground, var(--foreground, #172026));
  box-shadow: 0 10px 28px rgb(0 0 0 / 18%); font-size: 12.5px; cursor: default;
}
.tv-ci-menu-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 9px; border: 0; border-radius: 6px; background: none;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.tv-ci-menu-item:hover, .tv-ci-menu-item:focus-visible { background: color-mix(in oklab, var(--foreground, #172026) 5%, transparent); outline: none; }
.tv-ci-menu-icon { flex: none; width: 14px; height: 14px; color: var(--muted-foreground, #6b7280); }
.tv-ci-menu-danger, .tv-ci-menu-danger .tv-ci-menu-icon { color: var(--destructive, #dc2626); }
.tv-ci-menu-sep { height: 1px; margin: 4px 2px; border: 0; background: var(--border, #e3e7e9); }
/* A comment whose Delete waits out its window: "Comment deleted", a terracotta Undo, a draining bar. */
.tv-ci-gone { cursor: default; padding-top: 8px; padding-bottom: 8px; }
.tv-ci-gone .tv-ci-head { padding-right: 0; }
.tv-ci-gone-words { font-style: italic; color: var(--muted-foreground, #6b7280); }
.tv-ci-undo {
  margin-left: auto; padding: 1px 8px; border: 0; border-radius: 6px; background: none;
  color: var(--primary, #bf5b3d); font: inherit; font-weight: 600; cursor: pointer;
}
.tv-ci-undo:hover, .tv-ci-undo:focus-visible { background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent); outline: none; }
.tv-ci-drain {
  justify-self: stretch; display: block; height: 2px; margin-top: 6px; border-radius: 2px; overflow: hidden;
  background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent);
}

/* A picture full screen (CommentLightbox.tsx), drawn into the page's body. */
.tv-lb {
  position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center;
  padding: 56px 24px 32px; box-sizing: border-box; background: rgb(0 0 0 / 82%);
}
.tv-lb-figure { margin: 0; display: grid; gap: 12px; justify-items: center; max-width: min(1100px, 100%); }
.tv-lb-img { max-width: 100%; max-height: calc(100vh - 160px); border-radius: 10px; box-shadow: 0 20px 60px rgb(0 0 0 / 50%); }
.tv-lb-caption { color: rgb(255 255 255 / 85%); font-size: 13px; line-height: 1.4; text-align: center; }
.tv-lb-close {
  position: fixed; top: 16px; right: 16px; display: grid; place-items: center; width: 36px; height: 36px;
  padding: 0; border: 0; border-radius: 999px; background: rgb(255 255 255 / 12%); color: #fff; cursor: pointer;
}
.tv-lb-close:hover, .tv-lb-close:focus-visible { background: rgb(255 255 255 / 24%); outline: none; }
.tv-lb-close-icon { width: 18px; height: 18px; }

/* Empty state E1 and the load failure: centred in the tab — a rounded tile, the title, one line, a button. */
.tv-cv-empty {
  flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; min-height: 240px; padding: 24px 16px; text-align: center; overflow-wrap: anywhere;
}
.tv-cv-empty-icon {
  display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 4px; border-radius: 12px;
  background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent); color: var(--muted-foreground, #6b7280);
}
.tv-cv-empty-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--foreground, #172026); }
.tv-cv-empty-line { max-width: 260px; margin: 0; font-size: 12.5px; line-height: 18px; color: var(--muted-foreground, #6b7280); }
.tv-cv-empty .tv-cv-start { margin-top: 6px; }
/* "Resolved. Undo" (U33) stands where the row stood for about five seconds. */
.tv-cv-resolved-undo { justify-content: flex-start; margin: 0; padding: 10px 12px; }
/* The checklist's rows: the face (Face, inline style) and the name (two people with one name keep the bracketed part whole). */
.tv-cv-name { flex: 0 1 auto; min-width: 1.5em; display: inline-flex; gap: 0.25em; overflow: hidden; font-size: 13px; font-weight: 600; white-space: nowrap; }
.tv-cv-name-main { flex: 0 1000 auto; min-width: 1.5em; overflow: hidden; text-overflow: ellipsis; }
.tv-cv-name-tag { flex: 0 1 auto; min-width: 5.5em; overflow: hidden; text-overflow: ellipsis; font-size: 11px; font-weight: 400; color: var(--muted-foreground, #6b7280); }
.tv-cv-small-icon { width: 12px; height: 12px; flex: none; }
.tv-cv-icon { width: 13px; height: 13px; flex: none; }
.tv-cv-link {
  height: 24px; padding: 0 6px; border: 0; border-radius: 6px; background: none;
  color: var(--muted-foreground, #6b7280); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.tv-cv-link:hover { background: var(--muted, #f3f4f6); color: var(--foreground, #172026); }
.tv-cv-outline, .tv-cv-primary, .tv-cv-ghost {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 28px; padding: 0 8px;
  box-sizing: border-box; border-radius: 6px; font: inherit; font-size: 12px; font-weight: 500;
  white-space: nowrap; cursor: pointer;
}
.tv-cv-small { height: 24px; }
.tv-cv-tall { height: 32px; padding: 0 12px; font-size: 13px; }
.tv-cv-outline { border: 1px solid var(--input, #e3e7e9); background: var(--background, #fff); color: var(--foreground, #172026); }
.tv-cv-outline:hover:not(:disabled) { border-color: var(--primary, #bf5b3d); }
.tv-cv-primary { border: 0; background: var(--primary, #bf5b3d); color: var(--primary-foreground, #fff); }
.tv-cv-ghost { border: 0; background: none; color: var(--muted-foreground, #6b7280); font-weight: 400; }
.tv-cv-ghost:hover:not(:disabled) { background: var(--muted, #f3f4f6); color: var(--foreground, #172026); }
.tv-cv-ghost:disabled { opacity: .5; cursor: default; }
/* A button with nothing to act on is neutral grey, never a faded terracotta. */
.tv-cv-outline:disabled, .tv-cv-primary:disabled {
  border-color: transparent; cursor: default;
  background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent);
  color: color-mix(in oklab, var(--muted-foreground, #6b7280) 75%, transparent);
}
.tv-cv-key { margin-left: 2px; font: inherit; font-size: 10px; font-weight: 400; opacity: .7; }
.tv-cv-check { flex: none; width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--primary, #bf5b3d); cursor: pointer; }

/* The "Ask Tracy to edit all (N)" checklist (story SendNChecklist): a card under the Open head, over the rows. */
.tv-cv-checklist {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 3;
  display: flex; flex-direction: column; gap: 4px; box-sizing: border-box; padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2, #e3e7e9); border-radius: 8px;
  background: var(--popover, var(--background, #fff)); color: var(--popover-foreground, var(--foreground, #172026));
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1);
}
.tv-cv-checklist-title { font-size: 14px; font-weight: 500; line-height: 20px; }
.tv-cv-checklist-hint { font-size: 12px; color: var(--muted-foreground, #6b7280); }
/* Round 5: many rows scroll inside the list, so its buttons always stand in view under them. */
.tv-cv-checklist-rows { display: flex; flex-direction: column; margin-top: 4px; max-height: min(45vh, 320px); overflow-y: auto; overscroll-behavior: contain; }
.tv-cv-checklist-row { display: flex; align-items: flex-start; gap: 8px; padding: 6px 4px; border-radius: 6px; cursor: pointer; }
.tv-cv-checklist-row[data-off] { opacity: .6; }
.tv-cv-checklist-body { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.tv-cv-checklist-who { display: flex; align-items: center; gap: 6px; min-width: 0; }
/* The name stays whole beside its avatar (story SendNChecklist: "Mai"); the quote after it gives way. */
.tv-cv-checklist-who .tv-cv-name { flex: none; font-size: 12px; }
.tv-cv-checklist-chip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--muted-foreground, #6b7280); }
.tv-cv-checklist-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.tv-cv-checklist-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px; }
.tv-cv-checklist-count { font-size: 11px; color: var(--muted-foreground, #6b7280); }
.tv-cv-checklist-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }

/* Layout B (Akemi 01/10/2026): the row under the list, in the composer's seat while the tab is on screen
   (the "Add a comment…" box it replaces is gone) — one muted line on how to comment, then Start
   commenting. The hairline above it is the seat's (above).
   That hairline sits on the same line as the one over the Settings gear in the left column (Akemi
   02/10/2026), so the foot of the window reads as one band. Both columns end at the window's bottom, so
   the seat is as tall as that column's foot, its hairline drawn inside it. tracy-sidebar builds the foot from three
   numbers, mirrored here and pinned by test comments-footer-rail.test.mjs: its footer's 8px padding
   (p-2 in rail.tsx), the Settings button's 44px height, and the 7px its hairline sits above it
   (styles.ts). Measured on dsh 02/10/2026 (narrow rail): hairline 59px above the window bottom.
   A fixed height, so the line holds at any width: in a narrow tab the hint wraps to two lines (40px)
   inside it, and past two it is cut with an ellipsis rather than growing the band. */
.tv-cv-footer {
  --tv-cv-rail-foot: calc(8px + 44px + 7px);
  display: flex; align-items: center; gap: 12px; box-sizing: border-box; min-width: 0;
  height: var(--tv-cv-rail-foot);
  width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px) - 24px);
  max-width: min(var(--dsh-chat-content-width, 100%), calc(100% - 24px)); margin: 0 auto;
  font-size: 13px; line-height: 20px; color: var(--muted-foreground, #6b7280); container: tv-cv-foot / inline-size;
}
/* A narrow column (340px and under) gives the icon's room to the words, so the hint still reads whole on
   two lines beside the button. */
@container tv-cv-foot (max-width: 340px) {
  .tv-cv-footer-line .tv-cv-small-icon { display: none; }
}
.tv-cv-footer-line { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; margin: 0; }
.tv-cv-footer .tv-cv-small-icon { width: 14px; height: 14px; }
.tv-cv-footer-words {
  min-width: 0; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  line-clamp: 2;
}
/* The button matches the line beside it: 13px words, 32px tall, centred in the 59px band. */
.tv-cv-footer .tv-cv-start { flex: none; height: 32px; padding: 0 12px; font-size: 13px; }
/* "Resolved. Undo" (U33): a quiet line in place of the row, Undo underlined. */
.tv-cv-notice {
  display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: 6px; margin: 12px 0 0;
  font-size: 12px; color: var(--muted-foreground, #6b7280);
}
.tv-cv-undo {
  padding: 0; border: 0; background: none; font: inherit; font-weight: 500; color: var(--foreground, #172026);
  text-decoration: underline; text-underline-offset: 2px; cursor: pointer;
}

/* The count on the Comments tab (watchCommentsBadge writes data-tracy-count on dsh's tab button, only
   above 0): every open thread of the site, a round grey pill (Lee 04/10/2026; the start card's look).
   ::before, moved after the label by flex order: dsh's tab draws its selection bar with ::after
   (ui-conversation ConversationRoot.module.css .tab). */
[data-conversation-tabs] [role="tab"][data-tracy-count] { display: inline-flex; align-items: center; }
/* dsh's tabs share the strip and may break inside their words ("Ch/at", "Comm/ents", "Traject/ory")
   once the Conversation column narrows below about 290px, and the count pill above widens the strip
   further (stand E2E M4). No tab label ever wraps or shrinks: the gap narrows with the header's width
   (Akemi 21/10/2026, option B), the labels lose 1px in the narrowest headers, and a strip that still
   does not fit (a long translation, the Voice tab) scrolls sideways instead of cutting a label. The
   header is the size container: its content box is the Conversation width less its 48px padding, so
   252px is a 300px column and 190px a 238px one. dsh's selection bar reaches 1px below the tab, and a
   scrolling strip would clip it, so the strip grows 1px downward and gives that pixel back. */
header:has([data-conversation-tabs]) { container: tracy-conversation-header / inline-size; }
[data-conversation-tabs] {
  gap: 20px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; padding-bottom: 1px; margin-bottom: -1px;
}
[data-conversation-tabs] > [role="tab"] { flex: none; white-space: nowrap; }
@container tracy-conversation-header (max-width: 251px) { [data-conversation-tabs] { gap: 12px; } }
@container tracy-conversation-header (max-width: 190px) {
  [data-conversation-tabs] { gap: 8px; padding-left: 0; }
  [data-conversation-tabs] > [role="tab"] { font-size: 12px; }
}
/* dsh's turn trigger row ("Background task updated", data-turn-trigger): its title never shrinks, so in
   a 300px Conversation column the time and the chevron ran past the row's border (dev 21/10/2026).
   The title takes the room that is left and wraps between words; a row too narrow for the time as
   well (a column narrower than about 280px) drops the time and keeps the words. */
[data-turn-trigger] { container-type: inline-size; }
[data-turn-trigger] > button > [class*="_title"] {
  flex: 1 1 auto; min-width: 0; white-space: normal; overflow-wrap: normal; word-break: normal;
}
@container (max-width: 210px) { [data-turn-trigger] > button > time { display: none; } }
[data-conversation-tabs] [role="tab"][data-tracy-count]::before {
  order: 1; content: attr(data-tracy-count); display: inline-block; margin-left: 6px; min-width: 16px; height: 16px; padding: 0 5px;
  box-sizing: border-box; border-radius: 999px; background: var(--muted, #f4f4f5); color: var(--muted-foreground, #6b7280);
  font-size: 10px; font-weight: 600; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums;
}
/* The unread dot on that pill (data-tracy-unread, while this person has unread open threads). Both of the
   tab's pseudo-elements are taken (the pill, dsh's selection bar), so the dot is a background of the tab
   itself: 7px of terracotta in its top-right corner, the padding beside the pill keeping it clear of
   the pill's rounded corner (a background paints under ::before). The tab carries title and aria-label. */
[data-conversation-tabs] [role="tab"][data-tracy-count][data-tracy-unread] {
  padding-right: 6px;
  background: radial-gradient(circle, var(--primary, #bf5b3d) 3px, transparent 3.5px) no-repeat right 0 top 0 / 7px 7px;
}

/* A Help question switches the creation hero to Case 2's dock at every column width.
   The transcript owns the remaining height; the composer reserves the same foot as a site chat.
   Slot anchors have inline display:contents, so hiding their occupants needs !important. */
html[data-tracy-scope="onboarding"] [data-conversation-scroll]:has([data-tracy-help-conversation]) {
  justify-content: flex-start; margin: 0 2px 0 0; scrollbar-gutter: stable;
}
html[data-tracy-scope="onboarding"] [data-conversation-scroll]:has([data-tracy-help-conversation]) > [data-composer-seat] {
  flex: 1 0 auto; min-height: 100%; width: 100%;
}
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) {
  ${DOCKED_HERO_RULES}
  flex: 1 0 auto; min-height: 0; max-width: none;
  padding-bottom: calc(var(--tc-composer-foot, 28px) + 4px);
}
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) > [class*="_root"]:first-child,
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) > [class*="heroWorkspaceRow"],
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) .tv-dock[data-tracy-start] {
  display: none !important;
}
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) .tv-help-dock {
  flex: 1 0 auto; min-height: 0; margin: 0 auto; max-height: none !important; overflow-y: visible;
  max-width: calc(var(--dsh-composer-card-max-width, 912px) + 32px); padding: 16px 32px;
}
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) .tv-onboarding-input {
  display: block; flex: none; margin: 0 auto; padding: 0; position: sticky; bottom: calc(var(--tc-composer-foot, 28px) + 4px);
}
html[data-tracy-scope="onboarding"] [data-tracy-help-conversation] .tv-onboarding-composer textarea {
  min-height: calc(var(--tc-composer-font, 14px) + 6px);
}
`
