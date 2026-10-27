/** Review geometry from the approved mock; surface colours follow Tracy tokens. */
export const WIZARD_REVIEW_CSS = `
.tas-wizard-summary { container-type: inline-size; }
.tas-wizard-summary .tas-wizard-review-hero { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 20px; align-items: center; border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
.tas-wizard-summary .tas-wizard-review-hero[data-thumbnail="0"] { grid-template-columns: minmax(0, 1fr); }
.tas-wizard-review-thumb { aspect-ratio: 16 / 10; border-radius: 8px; overflow: hidden; background: var(--muted); }
.tas-wizard-review-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.tas-wizard-review-identity { min-width: 0; }
.tas-wizard-review-url { font-size: 18px; line-height: 24px; font-weight: 600; word-break: break-all; }
.tas-wizard-review-live { margin-top: 4px; font-size: 13px; line-height: 20px; color: var(--muted-foreground); }
.tas-wizard-review-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.tas-wizard-review-chip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; height: 26px; padding-inline: 10px; border-radius: 999px; background: color-mix(in oklab, var(--foreground) 3.5%, var(--card)); font-size: 12px; }
[data-ds-dark-theme] .tas-wizard-review-chip, .dark .tas-wizard-review-chip, [data-theme="dark"] .tas-wizard-review-chip { background: color-mix(in oklab, var(--foreground) 5%, var(--card)); }
.tas-wizard-review-chip i { display: inline-block; flex: none; width: 10px; height: 10px; border-radius: 50%; }
.tas-wizard-summary .tas-wizard-review { margin: 18px 0 0; padding: 0; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.tas-wizard-summary .tas-wizard-review-row { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 11px 14px; border-top: 1px solid var(--border); border-bottom: 0; }
.tas-wizard-summary .tas-wizard-review-row:first-child { border-top: 0; }
.tas-wizard-summary .tas-wizard-review-row dt { font-size: 12px; line-height: 18px; color: var(--muted-foreground); }
.tas-wizard-summary .tas-wizard-review-row dd { margin: 0; font-size: 13px; line-height: 20px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tas-wizard-review-secondary { color: var(--muted-foreground); }
.tas-wizard-summary .tas-wizard-review-change { flex: none; height: auto; min-height: 24px; border: 1px solid transparent; border-radius: 6px; background: transparent; padding: 3px 5px; color: var(--primary); font-size: 12px; line-height: 16px; text-decoration: none; }
.tas-wizard-summary .tas-wizard-review-change:hover { background: color-mix(in oklab, var(--primary) 12%, transparent); }
.tas-wizard-summary .tas-wizard-review-change:focus-visible { border-color: var(--ring); outline: none; box-shadow: none; }
@container (max-width: 719px) {
  .tas-wizard-summary .tas-wizard-review-hero { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 519px) {
  .tas-wizard-summary .tas-wizard-review-row { grid-template-columns: minmax(0, 1fr) auto; }
  .tas-wizard-summary .tas-wizard-review-row dt { grid-column: 1 / -1; }
}
`
