/**
 * Plain CSS for a Help row of the agent's transcript (mode B: inside dsh's page, no reset,
 * `tv-help` prefix), injected once through a <style> tag. Colours read Tracy's tokens with a neutral
 * fallback, so a row follows the primary colour a person picked (dsh-brand puts it on <body>) and
 * the light/dark switch, and reads as "not the agent": a framed, muted card under a small label.
 *
 * Focus is one 1px stroke that changes colour, never a halo (DESIGN.md §5).
 */
export const CSS = `
.tv-help { display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; max-width: 100%; margin: 8px 0; color: var(--foreground, #172026); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
/* The question looks like the person's own message: right-aligned bubble, the same shape and layer as dsh-brand's. */
.tv-help-me { align-self: flex-end; max-width: 85%; padding: 8px 12px; border-radius: 12px 12px 4px 12px; background: var(--dsw-alias-bg-layer-2, var(--muted, #f4f6f8)); white-space: pre-wrap; }
.tv-help-cmd { display: inline-block; padding: 0 6px; margin-right: 2px; border-radius: 6px; background: color-mix(in oklab, var(--primary, #bf5b3d) 14%, transparent); color: var(--primary, #bf5b3d); font-weight: 600; }
.tv-help-actions { display: flex; align-items: center; gap: 2px; }
/* dsh's action row under a finished answer (fork tracy.42) sits 16px under the answer's last line, as under an agent
   reply (measured 12/10/2026 on the real page: 16px there, 12px here with the row's gap alone). */
.tv-help > [data-answer-actions] { margin-top: 4px; }
/* The reset sits in :where() so it has no specificity: the gap rule below must beat it for a paragraph and a list too (it did not while the reset was a plain .tv-help-answer p, and every paragraph of an answer touched the next). */
.tv-help-answer :where(p, ul, ol) { margin: 0; }
/* One gap between any two blocks of an answer, a Copy box included: the paragraph after a box used to touch its border. */
.tv-help-answer > * + * { margin-top: 8px; }
.tv-help-answer ul, .tv-help-answer ol { padding-left: 20px; }
.tv-help-answer code { font-size: 13px; padding: 0 4px; border-radius: 4px; background: var(--card, #ffffff); }
.tv-help-answer a, .tv-help-discord { color: var(--primary, #bf5b3d); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
.tv-help-answer a:focus-visible, .tv-help-discord:focus-visible, .tv-help-link:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 1px; }
.tv-help-discord { display: inline-block; font-size: 13px; }
.tv-help-hint, .tv-help-note { font-size: 13px; color: var(--muted-foreground, #6b7280); }
.tv-help-error { font-size: 13px; color: var(--destructive, #b42318); }
.tv-help-link { padding: 0; border: 0; background: none; color: var(--primary, #bf5b3d); font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.tv-help-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex: none; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--muted-foreground, #6b7280); cursor: pointer; }
.tv-help-icon:hover { background: var(--card, #ffffff); color: var(--foreground, #172026); }
.tv-help-icon:focus-visible { outline: none; border-color: var(--ring, #bf5b3d); }
.tv-help-icon[aria-pressed="true"] { color: var(--primary, #bf5b3d); border-color: var(--border, #e5e7eb); }
/* Same column as the composer under it: never wider than the box, centred in whatever frame holds the dock. */
/* "Type /help to ask Tracy · " in front of the chat box's own hint, in the same font, size, weight and colour as the rest of it. The text is a custom property the plugin sets from its own
   dictionary (all eight languages) and removes when the operator switches Help off. */
:root { --tv-help-hint: none; }
[data-composer-placeholder]::before { content: var(--tv-help-hint); }
/* Both chat boxes, the start screen's and the running conversation's (not a Viewer's): one whole Tracy sentence
   instead of the prefix plus dsh's words (Akemi 14/10/2026: the two boxes are one component). dsh's text is sized to
   nothing and the sentence is the ::before, at the draft's own size. Written with every hook of @tracy/dsh-chat-input's
   rules plus the mark on <html>, so it wins over them without !important. A Viewer keeps the prefix and the site
   question chat-input draws after it. */
/* The sentence is set on html as an inline style (index.tsx, in the person's language), which wins over this
   empty default; the default keeps the variable declared for the frame before the script sets it. */
:root[data-tv-help-hero] { --tv-help-hero-hint: ""; }
:root[data-tv-help-hero]:not([data-tracy-seat-viewer]) [class*="composerHero"]:not(:has([data-tracy-viewer])) [data-slot="conversation.composer.bar"] [class*="_root"][class*="_hero"] > [data-composer-card] [data-input-scroll] [data-composer-placeholder],
:root[data-tv-help-hero]:not([data-tracy-seat-viewer]) [data-slot="conversation.composer.bar"] [class*="_root"]:not([class*="_hero"]) > [data-composer-card] [data-input-scroll] [data-composer-placeholder] {
  font-size: 0; line-height: 0;
}
:root[data-tv-help-hero]:not([data-tracy-seat-viewer]) [class*="composerHero"]:not(:has([data-tracy-viewer])) [data-slot="conversation.composer.bar"] [class*="_root"][class*="_hero"] > [data-composer-card] [data-input-scroll] [data-composer-placeholder]::before,
:root[data-tv-help-hero]:not([data-tracy-seat-viewer]) [data-slot="conversation.composer.bar"] [class*="_root"]:not([class*="_hero"]) > [data-composer-card] [data-input-scroll] [data-composer-placeholder]::before {
  content: var(--tv-help-hero-hint); font-size: var(--tc-composer-font, 14px); line-height: calc(var(--tc-composer-font, 14px) + 6px);
}
/* No height cap of its own: once anything is sent the start cards give way (@tracy/dsh-chat-input), so the
   strip has the column, and dock-fit.ts trims it only when the column would overflow.
   Its width is the chat box's own: dsh's hero is the card's cap plus a clearance on each side, and the card sits
   inside that clearance. The strip takes the same box and pads by the clearance plus the 16px a transcript row has
   from the card, so a Help row starts exactly where the same row does once the conversation runs. A fixed 832px
   was 59px right of the card at 1440 and 44px left of it at 1000 (measured 08/10/2026). The fallbacks are dsh's
   own values for a page that does not publish the variables. */
.tv-help-dock { flex: 0 0 auto; box-sizing: border-box; width: 100%; max-width: calc(var(--dsh-composer-card-max-width, 912px) + 2 * var(--dsh-composer-side-clearance, 16px)); margin: 0 auto; overflow-y: auto; padding: 0 calc(var(--dsh-composer-side-clearance, 16px) + 16px); }
.tv-help-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tv-help-chip { height: 28px; padding: 0 10px; border: 1px solid var(--border, #e5e7eb); border-radius: 14px; background: var(--card, #ffffff); color: var(--foreground, #172026); font: inherit; font-size: 13px; cursor: pointer; }
.tv-help-chip:hover { background: var(--muted, #f3f4f6); }
.tv-help-chip:focus-visible { outline: none; border-color: var(--ring, #bf5b3d); }
/* Text and Copy on one row: no empty line kept for the button. Lines stay as written and a long one scrolls
   sideways inside the text, while the button stays where it is. */
.tv-help-copy { display: flex; align-items: flex-start; gap: 8px; padding: 6px 6px 6px 10px; border: 1px solid var(--border, #e5e7eb); border-radius: 8px; background: var(--card, #ffffff); }
.tv-help-copy pre { flex: 1; min-width: 0; margin: 0; padding: 2px 0; overflow-x: auto; font: inherit; font-size: 13px; white-space: pre; overflow-wrap: normal; scrollbar-width: thin; }
.tv-help-copy-button { flex: none; display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border: 1px solid var(--border, #e5e7eb); border-radius: 6px; background: var(--card, #ffffff); color: var(--foreground, #172026); font: inherit; font-size: 12px; cursor: pointer; }
.tv-help-copy-button:hover { background: var(--muted, #f3f4f6); }
.tv-help-copy-button:focus-visible { outline: none; border-color: var(--ring, #bf5b3d); }
/* ONE orange button (David, 11/10/2026). While a Help answer is being written (HelpStop.tsx sits in dsh's seat
   just before the buttons), the stop square takes the orange primary's place: dsh's primary is hidden while it is
   disabled (an empty draft), and every stop dsh draws (its primary turned stop while the agent runs, and the
   independent stop beside Send, fork tracy.26) steps aside. The first press stops Help; once Help has stopped this
   button is gone and dsh's own stop, if the agent still runs, is back in the same place: the second press stops
   the agent. dsh's stops draw a square <rect> and Send an arrow <path>, which tells them apart in any interface
   language. With a draft, Send stays the orange primary and this stop is the one quiet outlined stop beside it.
   Colour of the filled state is tracy-brand's. Focus: one 1px stroke. */
.tv-help-stop { display: grid; place-items: center; flex: none; box-sizing: border-box; width: 32px; height: 32px; padding: 0; border: none; border-radius: 999px; background: var(--dsw-alias-brand-primary, #bf5b3d); color: var(--primary-foreground, #ffffff); cursor: pointer; }
.tv-help-stop:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 1px; }
[data-slot="conversation.composer.bar"] [class*="_trailing"]:has(.tv-help-stop) [class*="_primary"]:disabled { display: none; }
[data-slot="conversation.composer.bar"] [class*="_trailing"]:has(.tv-help-stop) [class*="_primary"]:has(> svg > rect) { display: none; }
[data-slot="conversation.composer.bar"] [class*="_trailing"]:has([class*="_primary"]:not(:disabled) > svg > path) .tv-help-stop { background: transparent; color: var(--foreground, #172026); box-shadow: inset 0 0 0 1px var(--input, #e3e7e9); }
/* A start action in an answer (tracy-action: links): text the person presses, drawn as the answer's links are,
   with an arrow that says it opens a step. A button, so it never navigates. */
.tv-help-action { display: inline; padding: 0; border: 0; background: none; color: var(--primary, #bf5b3d); font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.tv-help-action::after { content: " \\2192"; text-decoration: none; display: inline-block; margin-left: 2px; }
.tv-help-action:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 1px; }
/* The files a question carried, under its bubble on the right (chip look: @tracy/dsh-chat-input's .tv-chip). */
.tv-help-files { align-self: flex-end; justify-content: flex-end; max-width: 85%; }
.tv-help-files a.tv-chip-body { color: inherit; text-decoration: none; }
/* Why a file was refused, once, under the chat box. */
.tv-onboarding-notice { margin: 6px 4px 0; font-size: 13px; color: var(--destructive, #b42318); }
.tv-help-tip { flex-direction: row; align-items: center; gap: 8px; font-size: 13px; color: var(--muted-foreground, #6b7280); }
.tv-help-tip > span { flex: 1; min-width: 0; }

/* The no-site composer is a Help-only bar, using the native width axis and wrapping controls. */
html[data-tracy-scope="onboarding"] .tv-help { min-width: 0; font-size: var(--dsh-content-font-size, 14px); }
html[data-tracy-scope="onboarding"] .tv-help-actions,
html[data-tracy-scope="onboarding"] .tv-help [data-answer-actions] { flex-wrap: wrap; }
html[data-tracy-scope="onboarding"] .tv-help [data-answer-actions] button { min-width: 36px; min-height: 36px; }
html[data-tracy-scope="onboarding"] .tv-help-icon { width: 36px; height: 36px; }
html[data-tracy-scope="onboarding"] .tv-help-copy-button { min-height: 36px; }
html[data-tracy-scope="onboarding"] .tv-help-dock { min-width: 0; }

/* Match the site transcript's 14px/24px answer and 14px/22px bubble rhythm. */
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) .tv-help {
  margin: 0; gap: 16px; line-height: calc(var(--dsh-content-font-size, 14px) + 10px);
}
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) .tv-help-answer > * + * { margin-top: 16px; }
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) .tv-help > [data-answer-actions] { margin-top: -4px; }
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) .tv-help [data-answer-actions] button { min-width: 0; min-height: 0; }
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) .tv-help-me {
  max-width: 82%; line-height: calc(var(--dsh-content-font-size, 14px) + 8px);
}
html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) .tv-help-dock > [data-chat-flow-kind] + [data-chat-flow-kind] { margin-top: 16px; }

.tv-onboarding-input {
  box-sizing: border-box; min-width: 0;
  width: calc(100% - 2 * var(--dsh-composer-side-clearance, 16px));
  max-width: var(--dsh-composer-card-max-width, 712px);
  font-size: var(--dsh-content-font-size, 14px);
}
.tv-onboarding-composer {
  box-sizing: border-box; width: 100%;
  min-width: 0; margin: 0; color: var(--foreground);
}
/* Geometry, font and spacing come from chat-input's COMPOSER_CSS, shared with the site card.
   These are only the textarea/native-button base styles which dsh's CSS module normally supplies. */
.tv-onboarding-composer textarea {
  display: block; box-sizing: border-box; min-width: 0; width: 100%; resize: none;
  field-sizing: content; max-height: var(--dsh-composer-text-max-height, 220px);
  border: 0; outline: none; padding: 0; background: transparent; color: var(--foreground);
  font: inherit; overflow-y: auto;
}
.tv-onboarding-composer textarea::placeholder { color: var(--muted-foreground); opacity: 1; }
.tv-onboarding_trailing { display: flex; align-items: center; min-width: 0; }
.tv-onboarding_trailing[data-voice-active] { grid-column: 1 / -1; }
.tv-onboarding-composer .tv-onboarding_primary {
  flex: none; display: grid; place-items: center; padding: 0;
  border: 0; border-radius: 999px; corner-shape: round; cursor: pointer;
  background: var(--dsw-alias-brand-primary, #bf5b3d); color: var(--primary-foreground);
  transition: background-color 100ms ease;
}
.tv-onboarding-composer .tv-onboarding_primary:hover:not(:disabled),
.tv-onboarding-composer .tv-onboarding_primary:active:not(:disabled) { background: var(--dsw-alias-button-primary-hover, color-mix(in oklab, var(--dsw-alias-brand-primary, #bf5b3d) 88%, black)); }
.tv-onboarding-composer:has(.tv-help-stop) .tv-onboarding_primary:disabled { display: none; }
.tv-onboarding_primary:disabled { opacity: .4; cursor: default; }
.tv-onboarding-input button:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
/* Conversation mode: the three start doors as one row right above the composer, its left edge on
   the composer's (both fill the input box). The pills keep chat-input's coloured card style. The
   row never wraps: a narrow column scrolls it sideways, scrollbar hidden, with a soft fade on the
   right edge only while more cards wait there (StartRow.tsx sets data-more-end). 3px of padding
   keeps the focus stroke inside the scroll box; the negative margin keeps the edges where they were.
   The input box is painted so the transcript never shows through between the pills. */
html[data-tracy-scope="onboarding"] .tv-onboarding-input[data-tracy-help-conversation] { background: var(--background); }
.tv-onboarding-start {
  display: flex; flex-wrap: nowrap; gap: 8px; min-width: 0;
  overflow-x: auto; overflow-y: hidden; scrollbar-width: none; overscroll-behavior-x: contain;
  padding: 3px; margin: -3px -3px 9px;
}
.tv-onboarding-start::-webkit-scrollbar { display: none; }
/* Compact pills for this row only: the badge, glyph and label of the site's stacked cards, 36px
   tall (still a comfortable touch target); colours and radius stay chat-input's. */
.tv-onboarding-start > .tv-start-card { flex: none; width: auto; height: 36px; gap: 8px; padding: 0 12px 0 6px; }
.tv-onboarding-start > .tv-start-card .tv-start-card-icon { width: 24px; height: 24px; }
.tv-onboarding-start > .tv-start-card .tv-start-card-icon svg { width: 13px; height: 13px; }
.tv-onboarding-start > .tv-start-card .tv-start-card-title { font-size: 13px; font-weight: 500; }
.tv-onboarding-start .tv-start-card-short { display: none; }
.tv-onboarding-start[data-more-end] {
  mask-image: linear-gradient(to right, #000 calc(100% - 40px), transparent);
}
/* The hero container follows the available column rather than the window width. */
@container tracy-onboarding-hero (max-width: 660px) {
  .tv-onboarding-input { display: flex; flex-direction: column; gap: 12px; }
  .tv-onboarding-composer textarea { min-height: calc(2 * (var(--tc-composer-font, 14px) + 6px)); }
}
/* A column below 660px: the short names, so the three doors fit on one line without scrolling.
   The button keeps the full name as its accessible name and tooltip (StartRow.tsx). The scroll
   and fade above stay only as a fallback where it still overflows: the three short names and
   badges alone take about 229px, so a column narrower than about 307px (a 360px phone) scrolls.
   Measured 23/10/2026: tightest padding and gaps that keep the badge centred in the pill. */
@container tracy-onboarding-hero (max-width: 660px) {
  .tv-onboarding-start { gap: 6px; }
  .tv-onboarding-start > .tv-start-card { gap: 6px; padding: 0 10px 0 6px; }
  .tv-onboarding-start .tv-start-card-full { display: none; }
  .tv-onboarding-start .tv-start-card-short { display: inline; }
}
`
