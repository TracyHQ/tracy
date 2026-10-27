/**
 * Voice input's microphone and recording row (`VoiceInput.tsx`), in dsh's composer row between the
 * model chip and Send. Plain CSS, mode B: inside dsh's page, no reset, tv- prefix. Injected with
 * styles.ts.
 *
 * Sizes follow the chat box's own controls (`composer-styles.ts`): 28px like +, round like Send.
 * Done is a dark circle, not a terracotta one: Send stays beside it, and two terracotta circles side
 * by side would read as two Sends. Focus is one 1px stroke that changes colour, never a halo
 * (DESIGN.md §5). Every full-round shape pairs its radius with `corner-shape: round`: dsh's ui-theme
 * gives every box a superellipse corner, which turns a circle into a squircle (seen on the stand,
 * 15/10/2026: Cancel and Done beside a round Send).
 */
export const VOICE_CSS = `
.tv-voice { display: flex; align-items: center; min-width: 0; }
.tv-voice-row { flex: 1 1 auto; gap: 6px; min-height: 28px; }
/* The seat's row: the microphone, then the pieces drawn after it (Help's stop, #1379). It fills the
   seat while recording (dsh's .activityExpanded is a block), and is gone when nothing is drawn. */
.tv-voice-seat { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; }
.tv-voice-seat:empty { display: none; }
.tv-voice-mic, .tv-voice-round, .tv-voice-done {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 999px; corner-shape: round; cursor: pointer;
  background: transparent; color: var(--muted-foreground, #6b7280);
}
.tv-voice-mic svg, .tv-voice-round svg, .tv-voice-done svg { width: 16px; height: 16px; }
.tv-voice-mic:hover:not(:disabled), .tv-voice-round:hover:not(:disabled) {
  background: color-mix(in oklab, var(--foreground, #172026) 8%, transparent); color: var(--foreground, #172026);
}
.tv-voice-mic:disabled, .tv-voice-round:disabled { opacity: 0.5; cursor: default; }
.tv-voice-round { box-shadow: inset 0 0 0 1px var(--input, #e3e7e9); }
.tv-voice-done { background: var(--foreground, #172026); color: var(--background, #ffffff); }
.tv-voice-done:hover { background: color-mix(in oklab, var(--foreground, #172026) 85%, var(--background, #ffffff)); }
.tv-voice-mic:focus-visible, .tv-voice-round:focus-visible, .tv-voice-done:focus-visible {
  outline: 1px solid var(--ring, #bf5b3d); outline-offset: 1px;
}

/* The voice as it comes: newest bar on the right, as in Claude's recording row. */
.tv-voice-bars {
  display: flex; align-items: center; justify-content: flex-end; gap: 2px;
  flex: 1 1 auto; min-width: 48px; height: 22px; overflow: hidden;
}
.tv-voice-bars > span {
  flex: none; width: 2px; border-radius: 1px; background: var(--foreground, #172026); opacity: 0.75;
  transition: height 80ms linear;
}
.tv-voice-lang {
  flex: none; padding: 1px 6px; border-radius: 999px; corner-shape: round; font-size: 11px; line-height: 16px; font-weight: 600;
  letter-spacing: 0.02em; color: var(--muted-foreground, #6b7280);
  background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent);
}
.tv-voice-time {
  flex: none; min-width: 32px; text-align: right; font-size: 12px; line-height: 16px;
  font-variant-numeric: tabular-nums; color: var(--muted-foreground, #6b7280);
}
.tv-voice-note {
  display: inline-flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0;
  font-size: 12px; line-height: 16px; color: var(--muted-foreground, #6b7280);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* The microphone picked was not there (dictation listens on the default): said beside the bars, briefly. */
.tv-voice-mic-note { flex: 0 1 auto; max-width: 45%; }
.tv-voice-dot {
  flex: none; width: 6px; height: 6px; border-radius: 999px; corner-shape: round; background: var(--dsw-alias-brand-primary, #bf5b3d);
  animation: tv-voice-pulse 1s ease-in-out infinite;
}
@keyframes tv-voice-pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) {
  .tv-voice-dot { animation: none; }
  .tv-voice-bars > span { transition: none; }
}
`

/**
 * Chat or Voice (`VoiceMode.tsx`): the mode menu in the chat's header, the voice view with its orb,
 * and the footer in the chat box's place. Same rules as above: mode B, tv- prefix, 1px focus stroke,
 * round shapes with `corner-shape: round`. The orb is Tracy's own colour, lit from the top left; it
 * swells with the voice heard (the person's, or Tracy's) through `--tv-orb-level`, breathes while it
 * listens, turns while Tracy works and greys when the microphone is muted.
 */
export const VOICE_MODE_CSS = `
/* The voice view's tab is never drawn: the mode menu and the audio wave choose it. */
[data-conversation-tabs] [role="tab"][data-view="tracy-voice"] { display: none; }

.tv-vm { position: relative; display: inline-flex; align-items: center; }
.tv-vm-pill {
  box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px;
  border: 0; border-radius: 999px; corner-shape: round; cursor: pointer; font: inherit; font-size: 12px; line-height: 16px;
  background: transparent; color: var(--muted-foreground, #6b7280);
}
.tv-vm-pill svg { width: 16px; height: 16px; flex: none; }
.tv-vm-pill .tv-vm-chevron { width: 12px; height: 12px; opacity: 0.7; }
.tv-vm-pill:hover { background: color-mix(in oklab, var(--foreground, #172026) 8%, transparent); color: var(--foreground, #172026); }
.tv-vm[data-conversation-mode="voice"] .tv-vm-pill {
  background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent); color: var(--foreground, #172026);
}
.tv-vm-pill:focus-visible, .tv-vm-item:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 1px; }

.tv-vm-rec {
  flex: none; width: 8px; height: 8px; border-radius: 999px; corner-shape: round;
  background: var(--destructive, #dc2626); animation: tv-voice-pulse 1.4s ease-in-out infinite;
}
.tv-vm-rec[data-hearing] { animation-duration: 0.6s; }
.tv-vm-spin { animation: tv-vm-spin 1s linear infinite; }
@keyframes tv-vm-spin { to { transform: rotate(360deg); } }
.tv-vm-wave { display: inline-flex; align-items: center; gap: 2px; height: 16px; flex: none; }
.tv-vm-wave > span {
  width: 3px; height: 6px; border-radius: 2px; background: var(--dsw-alias-brand-primary, #bf5b3d);
  animation: tv-vm-wave 0.9s ease-in-out infinite;
}
.tv-vm-wave > span:nth-child(2) { animation-delay: 0.15s; }
.tv-vm-wave > span:nth-child(3) { animation-delay: 0.3s; }
@keyframes tv-vm-wave { 50% { height: 14px; } }

.tv-vm-menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 60; box-sizing: border-box;
  min-width: 248px; max-width: min(300px, calc(100vw - 32px)); padding: 6px;
  background: var(--popover, var(--background, #ffffff)); color: var(--popover-foreground, var(--foreground, #172026));
  border: 1px solid var(--border, #e3e7e9); border-radius: 12px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
}
.tv-vm-item {
  box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 10px;
  border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 13px; line-height: 18px;
  text-align: left; cursor: pointer;
}
.tv-vm-item svg { width: 16px; height: 16px; flex: none; color: var(--muted-foreground, #6b7280); }
.tv-vm-item:hover { background: color-mix(in oklab, var(--foreground, #172026) 7%, transparent); }
.tv-vm-mode { align-items: flex-start; padding: 8px 10px; }
.tv-vm-mode > svg:first-child { margin-top: 1px; color: var(--foreground, #172026); }
.tv-vm-mode-text { display: flex; flex-direction: column; gap: 1px; flex: 1 1 auto; min-width: 0; }
.tv-vm-mode-name { font-weight: 600; }
.tv-vm-mode-hint { font-size: 12px; line-height: 16px; color: var(--muted-foreground, #6b7280); }
.tv-vm-item .tv-vm-check { visibility: hidden; color: var(--foreground, #172026); }
.tv-vm-item[aria-checked="true"] .tv-vm-check { visibility: visible; }
.tv-vm-sep { height: 1px; margin: 6px 4px; background: var(--border, #e3e7e9); }
.tv-vm-label { padding: 4px 10px 2px; font-size: 12px; line-height: 16px; color: var(--muted-foreground, #6b7280); }
/* A microphone's name is the system's, often long ("MacBook Pro Microphone (Built-in)"): one line. */
.tv-vm-mic-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* The voice view: the orb in the middle, what is heard or said under it. */
.tv-vo {
  box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; min-height: 100%; height: 100%; padding: 32px 20px; text-align: center;
}
.tv-vo-orb {
  position: relative; display: block; flex: none; width: min(52vw, 200px); aspect-ratio: 1; padding: 0; border: 0;
  border-radius: 999px; corner-shape: round; background: transparent; cursor: default;
  animation: tv-vo-breathe 3.2s ease-in-out infinite;
}
.tv-vo-orb:not(:disabled) { cursor: pointer; }
.tv-vo-orb:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 4px; }
.tv-vo-core {
  --tv-orb-level: 0;
  position: absolute; inset: 0; overflow: hidden; border-radius: 999px; corner-shape: round;
  background:
    radial-gradient(circle at 30% 26%, color-mix(in oklab, var(--dsw-alias-brand-primary, #bf5b3d) 10%, #ffffff) 0%, transparent 46%),
    radial-gradient(circle at 70% 82%, color-mix(in oklab, var(--dsw-alias-brand-primary, #bf5b3d) 72%, #000000) 0%, transparent 58%),
    radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--dsw-alias-brand-primary, #bf5b3d) 62%, #ffffff) 0%, var(--dsw-alias-brand-primary, #bf5b3d) 78%);
  box-shadow: 0 18px 48px color-mix(in oklab, var(--dsw-alias-brand-primary, #bf5b3d) 30%, transparent);
  transform: scale(calc(1 + var(--tv-orb-level) * 0.22));
  transition: transform 80ms linear, filter 300ms ease, opacity 300ms ease;
}
/* Tracy works: light turns slowly across the orb. */
.tv-vo[data-voice-mode="working"] .tv-vo-core::after {
  content: ''; position: absolute; inset: -20%;
  background: conic-gradient(from 0deg, transparent 0deg, color-mix(in oklab, #ffffff 42%, transparent) 70deg, transparent 150deg);
  animation: tv-vm-spin 2.6s linear infinite;
}
.tv-vo[data-voice-mode="off"] .tv-vo-core, .tv-vo[data-voice-mode="paused"] .tv-vo-core { filter: grayscale(0.85); opacity: 0.55; }
.tv-vo[data-voice-mode="off"] .tv-vo-orb, .tv-vo[data-voice-mode="paused"] .tv-vo-orb { animation: none; }
@keyframes tv-vo-breathe { 50% { transform: scale(1.035); } }
.tv-vo-line {
  max-width: 520px; min-height: 22px; font-size: 16px; line-height: 24px; color: var(--muted-foreground, #6b7280);
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; overflow-wrap: anywhere;
}
.tv-vo-line[data-voice-words] { font-size: 18px; line-height: 26px; color: var(--foreground, #172026); }
.tv-vo-line[data-voice-saying] { color: var(--foreground, #172026); font-style: italic; }
.tv-vo-note { max-width: 520px; font-size: 13px; line-height: 18px; color: var(--destructive, #b42318); }
.tv-vo-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.tv-vo-button {
  box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px;
  border: 0; border-radius: 999px; corner-shape: round; cursor: pointer; font: inherit; font-size: 13px; line-height: 18px;
  background: transparent; color: var(--foreground, #172026); box-shadow: inset 0 0 0 1px var(--input, #e3e7e9);
}
.tv-vo-button svg { width: 14px; height: 14px; }
.tv-vo-button-primary { background: var(--foreground, #172026); color: var(--background, #ffffff); box-shadow: none; font-weight: 600; }
.tv-vo-button:focus-visible, .tv-vo-round:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 2px; }
.tv-vm-countdown {
  position: relative; flex: none; width: 28px; height: 3px; border-radius: 2px; overflow: hidden;
  background: color-mix(in oklab, var(--foreground, #172026) 12%, transparent);
}
.tv-vm-countdown::after {
  content: ''; position: absolute; inset: 0; background: var(--foreground, #172026); transform-origin: left center;
  animation: tv-vm-count linear forwards; animation-duration: inherit;
}
.tv-vo-countdown { width: 64px; }
@keyframes tv-vm-count { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* The footer in the chat box's place: mute, and back to Chat. */
.tv-vo-footer { box-sizing: border-box; display: flex; justify-content: center; align-items: center; gap: 16px; padding: 10px 16px 14px; }
.tv-vo-round {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 48px; height: 48px; padding: 0; border: 0; border-radius: 999px; corner-shape: round; cursor: pointer;
  background: color-mix(in oklab, var(--foreground, #172026) 9%, transparent); color: var(--foreground, #172026);
}
.tv-vo-round svg { width: 20px; height: 20px; }
.tv-vo-round[data-voice-mode-action="stop-work"] svg { width: 16px; height: 16px; fill: currentColor; }
.tv-vo-round:disabled { opacity: 0.5; cursor: default; }
.tv-vo-round-close { background: var(--foreground, #172026); color: var(--background, #ffffff); }
/* The note introducing Voice, over the chat box, its arrow on the audio wave. */
.tv-vm-tip-row { display: flex; justify-content: flex-end; padding: 0 2px 12px; }
.tv-vm-tip {
  position: relative; box-sizing: border-box; display: flex; align-items: flex-start; gap: 10px;
  max-width: min(320px, 100%); padding: 10px 8px 10px 12px; border-radius: 12px;
  background: var(--foreground, #172026); color: var(--background, #ffffff);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
}
.tv-vm-tip-go {
  display: flex; align-items: flex-start; gap: 10px; min-width: 0; flex: 1 1 auto; margin: 0; padding: 0;
  border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; border-radius: 6px;
}
.tv-vm-tip-go:hover .tv-vm-tip-title { text-decoration: underline; text-underline-offset: 2px; }
.tv-vm-tip-go:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 2px; }
.tv-vm-tip-icon { flex: none; width: 18px; height: 18px; margin-top: 1px; color: color-mix(in oklab, var(--dsw-alias-brand-primary, #bf5b3d) 70%, #ffffff); }
.tv-vm-tip-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tv-vm-tip-title { font-size: 13px; line-height: 18px; font-weight: 600; }
.tv-vm-tip-body { font-size: 12px; line-height: 16px; opacity: 0.8; }
.tv-vm-tip-close {
  box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; border: 0; border-radius: 999px; corner-shape: round; cursor: pointer;
  background: transparent; color: inherit; opacity: 0.7;
}
.tv-vm-tip-close:hover { opacity: 1; }
.tv-vm-tip-close:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 1px; }
.tv-vm-tip-close svg { width: 14px; height: 14px; }
.tv-vm-tip-arrow {
  position: absolute; bottom: -5px; width: 10px; height: 10px; margin-left: -5px; border-radius: 2px;
  background: var(--foreground, #172026); transform: rotate(45deg);
}
/* Under the header's Chat/Voice button, its arrow up on the button (the menu opens in the same place). */
.tv-vm-tip-pop {
  position: absolute; top: calc(100% + 10px); right: 0; z-index: 55; box-sizing: border-box;
  width: 280px; max-width: calc(100vw - 32px); text-align: left;
}
.tv-vm-tip-pop .tv-vm-tip { max-width: none; }
.tv-vm-tip-pop .tv-vm-tip-arrow { top: -5px; bottom: auto; }
@media (prefers-reduced-motion: reduce) {
  .tv-vm-rec, .tv-vm-spin, .tv-vm-wave > span, .tv-vo-orb, .tv-vo[data-voice-mode="working"] .tv-vo-core::after { animation: none; }
  .tv-vo-core { transition: none; }
}
`
