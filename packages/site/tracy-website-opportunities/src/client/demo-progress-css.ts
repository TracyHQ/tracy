/**
 * The step chain progress card (#516): a bar, one sentence, minutes left and cost, and the steps folded under it.
 * Colors are Tracy tokens only (`tokens.css`), so light and dark both hold.
 */
export const PROGRESS_CSS = `
.tracy-wo-progress { display: flex; flex-direction: column; gap: 6px; }
.tracy-wo-progress-now { font-weight: 600; }
.tracy-wo-progress-bar { height: 6px; border-radius: 3px; background: var(--muted); overflow: hidden; }
.tracy-wo-progress-bar > span { display: block; height: 100%; border-radius: 3px; background: var(--primary); }
.tracy-wo-progress-steps { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.tracy-wo-progress-steps li { display: flex; align-items: center; gap: 8px; }
.tracy-wo-progress-steps li > b { flex: 1 1 auto; font-weight: 400; }
.tracy-wo-progress-steps li[data-state="upcoming"] > b { color: var(--muted-foreground); }
.tracy-wo-progress details > summary { cursor: pointer; color: var(--muted-foreground); }
`
