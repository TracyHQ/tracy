/**
 * Look of the shared sub-step node (`step-node.tsx`) wherever it is drawn outside the Progress band (the band keeps
 * its own rules in `progress-band-css.ts`, same sizes and tokens): ring, spinner, check and cross by `data-node`.
 */
export const STEP_NODE_CSS = `
.tracy-wo-stab-pill > .tracy-wo-band-sub-node { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 999px; border: 1.5px solid color-mix(in oklab, var(--muted-foreground) 45%, transparent); background: transparent; }
.tracy-wo-stab-pill > .tracy-wo-band-sub-node > svg { width: 10px; height: 10px; stroke-width: 3; color: var(--background); }
.tracy-wo-stab-pill > .tracy-wo-band-sub-node[data-node='running'] { width: 16px; height: 16px; border: 0; color: var(--primary); }
.tracy-wo-stab-pill > .tracy-wo-band-sub-node[data-node='running'] > svg { width: 14px; height: 14px; stroke-width: 2.5; color: var(--primary); }
.tracy-wo-stab-pill > .tracy-wo-band-sub-node[data-node='done'] { border-color: var(--success); background: var(--success); }
.tracy-wo-stab-pill > .tracy-wo-band-sub-node[data-node='failed'] { border-color: var(--destructive); background: var(--destructive); }
`
