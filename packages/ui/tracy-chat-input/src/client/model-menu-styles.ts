/**
 * The model picker's menu (dsh ui-model-selection), compact and inside the chat column (Akemi
 * 14/10/2026, the 300px conversation). Plain CSS, mode B, injected with COMPOSER_CSS.
 *
 * dsh portals the menu to <body> and places it from the trigger's rect: right edges aligned, clamped
 * only to the viewport, sized to its content (240px to 420px). In a 300px column that card spilled
 * over the left rail and into the preview, and each pane had its own width (248px root, 390px list).
 *
 * Here the card is anchored to the chat box instead (CSS anchor positioning, as dsh's own
 * MenuSurface backing does): it opens upward 6px above the box, its right edge on the box's right
 * edge, one width for every pane, the box's width up to 280px. So at 300px it covers the box's width
 * exactly and at any wider column it is a 280px card over the picker's side. Browsers without anchor
 * positioning skip that block and keep dsh's placement.
 *
 * The rows follow Claude Design's compact menu: 30px rows, 13px names, 12px secondary text (the
 * group heading and the root pane's current values), 8px corners, a check on the selected row, long
 * names end in an ellipsis (the row's title holds the full name). Colours are Tracy tokens, never
 * dsh's label aliases (blue cast on the light theme).
 *
 * Hooks: the readable tails of dsh's CSS-module classes (_menu, _cell, _cellLabel, _option,
 * _modelOption, _modelName ...) and MenuGroup's data-menu-group-heading. _cellLabel and
 * _modelOption exist only in this menu; the effort pane is recognised by an option row holding a
 * _modelName, so other dsh menus portaled to <body> are untouched.
 */
const MODEL_MENU =
  'body > [class*="_menu"]:has([class*="_cellLabel"], [class*="_modelOption"], > button[class*="_option"] [class*="_modelName"])'

export const MODEL_MENU_CSS = `
@supports (anchor-name: --tc-model-card) {
  [data-slot="conversation.composer.bar"] [data-composer-card]:has([data-slot="conversation.input.model"]) {
    anchor-name: --tc-model-card;
  }
  /* !important only on top and left: dsh writes them inline from the trigger's rect. */
  ${MODEL_MENU} {
    position-anchor: --tc-model-card;
    top: auto !important; left: auto !important;
    right: anchor(right, 12px); bottom: anchor(top, 96px); margin-bottom: 6px;
    width: min(280px, anchor-size(width, 280px)); min-width: 0; max-width: calc(100vw - 24px);
    max-height: min(360px, calc(100vh - 160px));
  }
}
${MODEL_MENU} {
  box-sizing: border-box; padding: 4px; border-radius: 12px;
  color: var(--popover-foreground, var(--foreground, #172026));
}
${MODEL_MENU} button:is([class*="_cell"], [class*="_option"]) {
  width: 100%; min-width: 0; min-height: 30px; height: auto; padding: 0 8px; gap: 8px;
  border-radius: 8px; font-size: 13px; line-height: 18px; color: inherit;
}
${MODEL_MENU} [class*="_modelName"] { font-size: 13px; line-height: 18px; }
${MODEL_MENU} [class*="_cellValue"] { font-size: 12px; color: var(--muted-foreground, #6b7280); }
${MODEL_MENU} [class*="_cellChevron"] { width: 12px; height: 12px; color: var(--muted-foreground, #6b7280); }
${MODEL_MENU} [data-menu-group-heading] {
  padding: 6px 8px 2px; font-size: 12px; line-height: 16px; color: var(--muted-foreground, #6b7280);
}
${MODEL_MENU} [class*="_check"] { flex-basis: 14px; color: var(--foreground, #172026); }
/* Hover, keyboard and the highlighted list row: one overlay of the text colour, right on both themes. */
${MODEL_MENU} button:is([class*="_cell"]:hover, [class*="_optionActive"], :focus-visible, [class*="_option"]:not([class*="_modelOption"]):hover):not(:disabled) {
  background: color-mix(in oklab, var(--foreground, #172026) 8%, transparent);
}
`
