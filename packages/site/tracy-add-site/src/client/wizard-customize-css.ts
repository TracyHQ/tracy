/** The approved full-page Customize layout. All colours come from Tracy tokens in either theme. */
export const WIZARD_CUSTOMIZE_CSS = `
[data-ask-variant="wizard"] { container-type: inline-size; width: 100%; max-width: 760px; }
.tas-customize-groups { display: grid; gap: 26px; }
.tas-customize-heading { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
.tas-customize-heading h2 { margin: 0; font-size: 13px; line-height: 18px; font-weight: 600; letter-spacing: .01em; }
.tas-customize-heading > span, .tas-customize-pages-heading > span { font-size: 12px; line-height: 16px; color: var(--muted-foreground); }
.tas-customize-box { border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: grid; gap: 16px; }
.tas-customize-box[data-group-layout="LanguageTone"], .tas-customize-box[data-group-layout="Brand"] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.tas-customize-box[data-group-layout="Brand"] { gap: 12px; }
.tas-customize-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
[data-ask-variant="wizard"] .ask-card-p { padding: 0; gap: 6px; }
.tas-customize-label { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tas-customize-label[data-hint-inline="true"] { flex-direction: row; align-items: baseline; gap: 6px; height: 18px; }
.tas-customize-label[data-hint-inline="true"] label { flex-shrink: 0; white-space: nowrap; }
.tas-customize-label label { display: inline; font-size: 13px; font-weight: 500; line-height: 18px; color: var(--foreground); }
.tas-customize-label span { font-size: 12px; line-height: 16px; font-weight: 400; color: var(--muted-foreground); }
.tas-customize-label > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
[data-ask-variant="wizard"] input:not([type="file"]), [data-ask-variant="wizard"] .tas-lang-trigger { height: 36px; min-height: 36px; font-size: 13px; border-radius: 8px; }
[data-ask-variant="wizard"] input:not([type="file"]) { background: transparent; padding: 0 10px; }
.tas-customize-textarea { border: 1px solid var(--input); border-radius: 8px; overflow: hidden; }
.tas-customize-textarea:focus-within { border-color: var(--primary); }
.tas-customize-textarea textarea[data-ask-long] { display: block; border: 0; border-radius: 0; outline: none; box-shadow: none; min-height: 64px; height: 64px; field-sizing: fixed; background: transparent; color: var(--foreground); padding: 8px 10px; font: inherit; font-size: 13px; line-height: 18px; }
.tas-customize-textarea-foot { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-top: 1px solid var(--border); background: color-mix(in oklab, var(--foreground) 3.5%, var(--card)); flex-wrap: wrap; }
.tas-customize-textarea-foot .tas-customize-starter { height: 24px; min-height: 24px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); font-size: 12px; font-weight: 400; color: var(--muted-foreground); }
.tas-customize-textarea-foot .tas-customize-starter:hover { color: var(--foreground); }
.tas-customize-textarea-foot .tas-customize-rewrite { margin-left: auto; min-height: 24px; height: 24px; border: 1px solid transparent; border-radius: 6px; background: transparent; padding: 0; font-size: 12px; color: var(--primary); }
.tas-customize-textarea-foot .tas-customize-rewrite svg { width: 12px; height: 12px; }
.tas-customize-tone[data-slot="toggle-group"] { display: flex; border: 1px solid var(--input); border-radius: 8px; padding: 2px; gap: 2px; height: 36px; width: 100%; box-sizing: border-box; }
.tas-customize-tone [data-slot="toggle-group-item"] { flex: 1; height: 30px; border: 1px solid transparent; border-radius: 6px; background: transparent; font-size: 13px; font-weight: 400; color: var(--muted-foreground); }
.tas-customize-tone [data-pressed], .tas-customize-tone [aria-pressed="true"] { background: color-mix(in oklab, var(--primary) 12%, transparent); color: var(--foreground); font-weight: 500; }
.tas-customize-tone [data-slot="toggle-group-item"]:focus-visible { border-color: var(--primary); outline: none; box-shadow: none; }
.tas-customize-pages-heading { display: flex; flex: 1; align-items: baseline; justify-content: space-between; gap: 8px; }
.tas-customize-pages-heading button { height: auto; min-height: 0; padding: 0; border: 1px solid transparent; background: transparent; color: var(--primary); font-size: 12px; font-weight: 400; }
.tas-customize-pages { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 2px 12px; }
.tas-customize-page { display: flex; align-items: center; gap: 8px; height: 30px; font-size: 13px; line-height: 18px; cursor: pointer; border-radius: 6px; padding: 0 6px; margin: 0 -6px; min-width: 0; }
.tas-customize-page:hover { background: color-mix(in oklab, var(--foreground) 3.5%, var(--card)); }
.tas-customize-page[data-locked="1"] { color: var(--muted-foreground); cursor: default; }
.tas-customize-page [data-slot="checkbox"] { width: 14px; height: 14px; flex-shrink: 0; }
.tas-customize-brand { --tas-warn-hue: var(--primary); }
.tas-customize-upload { display: flex; align-items: center; gap: 12px; border: 1px dashed var(--input); border-radius: 10px; padding: 10px 12px; min-width: 0; }
.tas-customize-upload-preview { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 8px; background: color-mix(in oklab, var(--foreground) 3.5%, var(--card)); font-weight: 600; font-size: 12px; flex-shrink: 0; overflow: hidden; }
.tas-customize-upload-preview img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
.tas-customize-upload-copy { min-width: 0; display: flex; flex-direction: column; }
.tas-customize-upload-copy > span { font-size: 13px; font-weight: 500; line-height: 18px; }
.tas-customize-upload-copy small { font-size: 12px; line-height: 16px; color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tas-customize-upload .tas-customize-upload-button { margin-left: auto; flex-shrink: 0; height: 36px; padding: 0 12px; background: transparent; font-size: 13px; }
@container (max-width: 640px) {
  .tas-customize-box[data-group-layout="LanguageTone"], .tas-customize-box[data-group-layout="Brand"] { grid-template-columns: minmax(0, 1fr); }
  .tas-customize-heading { flex-wrap: wrap; row-gap: 2px; }
}
`
