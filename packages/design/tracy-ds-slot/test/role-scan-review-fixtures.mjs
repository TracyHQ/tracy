// Fixture template for the six role-scan defects found in the design-system review of 15/10/2026
// (Tracy Base, Business and SaaS EmDash). Kept as strings so no formatter moves their lines: the
// tests assert file:line.

export const REVIEW = {
  'package.json': JSON.stringify({
    name: 'review-fixture',
    version: '1.0.0',
    devDependencies: { tailwindcss: '4.3.3' }
  }),
  'astro.config.mjs': 'export default {}\n',
  'src/styles/tokens.css': `:root {
	--color-paper: #ffffff;
	--color-fg: #14171a;
	--color-line: #d9d9d9;
	--k-panel: #0f1311;
	--k-panel-text: #9aa6a1;
	--k-panel-accent: #a3e635;
}
html, body { background: var(--color-paper); color: var(--color-fg); }
.term { background: var(--k-panel); color: var(--k-panel-text); }
.term b { color: var(--k-panel-accent); }
`,
  // defect 1: a call-to-action BAND or card is a card, not a button
  'src/components/sections/CtaBand.astro': `<section class="wrap">
	<div class="relative overflow-hidden rounded-[28px] bg-surface px-8">
		<a href="#" class="btn rounded-[8px] bg-ink px-4">Go</a>
	</div>
</section>
`,
  'src/components/sections/InlineCta.astro':
    '<div class="rounded-[20px] border border-line p-6"><slot /></div>\n',
  'src/components/sections/Cta.astro': `<div class="cta cta--card"><div class="cta-inner"><a class="cta-button">Go</a></div></div>
<style>
	.cta--card .cta-inner { padding: 60px; border-radius: 20px; background: var(--color-paper); }
	.cta-button { border-radius: 6px; background: var(--color-fg); }
</style>
`,
  // defect 2: an input whose attributes run over several lines is a field, whatever the file is called
  'src/components/islands/MegaMenu.tsx': `export function MegaMenu() {
  return (
    <form>
      <input
        type="search"
        name="q"
        className="h-10 rounded-[10px] border border-line px-3"
      />
      <span className="block rounded-[10px]" />
    </form>
  )
}
`,
  // defect 3: another class on the same element sets the corner; defect 4: a ds-keep before the selector
  'src/components/Teams.astro': `<img class="avatar" src="a.png" />
<span class="avatar chip">AB</span>
<style>
	.avatar { display: block; border-radius: 50%; }
	.chip { display: flex; background: var(--color-line); }
	/* ds-keep: a square tag by design */
	.tag {
		background: var(--color-line);
	}
	.badge { background: var(--color-line); }
</style>
`,
  // defect 5: a full-bleed scrim button; defect 6b: a highlight mark inside search results
  'src/views/Search.astro': `<div class="fixed inset-0">
	<button type="button" class="absolute inset-0 bg-fg/40" aria-label="Close"></button>
	<button type="button" class="bg-ink px-3">Search</button>
	<p class="[&_mark]:rounded-[3px] [&_mark]:bg-surface">x</p>
</div>
<style>
	.btn-scrim { position: absolute; inset: 0; background: var(--color-fg); }
	mark { border-radius: 2px; }
</style>
`
}
