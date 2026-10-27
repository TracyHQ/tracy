// Fixture templates for the four role-scan gaps closed on 15/10/2026: the ground set on a parent
// element, a component that reads no corner, a WordPress theme.json, and a Tailwind 3 config. Kept as
// strings so no formatter moves their lines: the tests assert file:line.

const TOKENS = `@theme {
	--color-ink: #14171a;
	--color-paper: #f5f3ee;
	--color-fg: #14171a;
	--color-signal: #da5a2a;
	--color-primary: var(--color-signal);
	--color-link-hover: var(--color-signal);
	--color-forest: #14483a;
}
.a { color: var(--color-signal); }
.b { background: var(--color-signal); }
.c { background: var(--color-signal); }
.band-ink { background: var(--color-ink); }
`

/** Gap 1: light text whose ground is set on a parent element, a wrapper, or a stylesheet class. */
export const GROUND = {
  'package.json': JSON.stringify({
    name: 'ground-fixture',
    version: '1.0.0',
    devDependencies: { tailwindcss: '4.3.3' }
  }),
  'astro.config.mjs': 'export default {}\n',
  'tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }\n',
  'src/styles/tokens.css': TOKENS,
  'src/components/Band.astro': '<section class="bg-ink p-8"><slot /></section>\n',
  'src/components/Plain.astro': '---\nconst x = 1\n---\n<div class="p-4"><slot /></div>\n',
  'src/components/Mixed.astro': '{a ? <slot /> : <span class={x}><slot /></span>}\n',
  'src/views/Page.astro': `---
import Band from '@/components/Band.astro'
import Plain from '../components/Plain.astro'
import Mixed from '../components/Mixed.astro'
---
<footer class="bg-ink">
	<div class="grid">
		<span class="text-white">a</span>
	</div>
</footer>
<div class="bg-forest"><p class="text-white">b</p></div>
<div class:list={["p-2", on && "bg-ink"]}><p class="text-white">c</p></div>
<Band><Plain><p class="text-white">d</p></Plain></Band>
<Mixed><p class="text-white">e</p></Mixed>
<div class="band-ink"><p class="text-white">f</p></div>
<div class="bg-ink"><div class="bg-[linear-gradient(red,blue)]"><p class="text-white">g</p></div></div>
<div class="bg-ink"><p class="text-[#14171a]">h</p></div>
<button class="bg-signal px-3 text-white">i</button>
<div class="bg-ink md:bg-paper"><p class="text-white">j</p></div>
<div class="bg-ink"><p class="dark:text-white">k</p></div>
`,
  'src/components/Cards.tsx': `export function Cards({ items }) {
  return (
    <div className="bg-ink">
      {items.map((x) => {
        const inner = <span className="text-white">{x}</span>
        return <div key={x}>{inner}<b className="text-white">{x}</b></div>
      })}
    </div>
  )
}
`
}

/** Gap 2: button-like, field, chip and card components that declare no corner. */
export const MISSING = {
  'package.json': JSON.stringify({
    name: 'missing-fixture',
    version: '1.0.0',
    devDependencies: { tailwindcss: '4.3.3' }
  }),
  'astro.config.mjs': 'export default {}\n',
  'src/styles/global.css': `.btn-outline { border: 1px solid var(--color-ink); padding: 8px; }
.btn-solid { background: var(--color-ink); border-radius: var(--ds-btn-radius, 0); }
.chip { border: 1px solid var(--color-line); }
.chip.is-on { background: var(--color-ink); }
.card { background: var(--color-card); }
.card-body { background: var(--color-card); }
.search-input { border: 1px solid var(--color-line); }
.search-input:focus { border-color: var(--color-ink); }
.tag-list { background: var(--color-card); }
.field-input { border: 1px solid var(--color-line); }
.form .field-input { border-radius: 0; }
.btn-link { color: var(--color-ink); }
.check-row input[type="checkbox"] { border: 1px solid var(--color-line); }
.btn-apply { @apply rounded-md; background: var(--color-ink); }
.btn-flat { border: 0; background: transparent; }
`,
  'src/views/Form.astro': `<form>
	<input type="search" class="border border-line px-3" />
	<input type="checkbox" class="border border-line" />
	<input type="hidden" class="border" />
	<button class="rounded-md bg-ink px-3">a</button>
	<button class={cn('bg-ink px-3', className)}>b</button>
	<button class="chip">c</button>
	<button class="text-fg">d</button>
	<button type="submit" class="bg-ink px-3 text-white">e</button>
	<textarea class="w-full border border-line"></textarea>
</form>
`
}

/** Gap 3: a WordPress block theme's theme.json. */
export const THEME_JSON = {
  'style.css': '/*\nTheme Name: Fixture Block\nText Domain: fixture-block\nVersion: 2.0.1\n*/\n',
  'theme.json': `{
	"version": 3,
	"settings": {
		"color": {
			"palette": [
				{ "slug": "base", "name": "Base", "color": "#ffffff" },
				{ "slug": "contrast", "name": "Contrast", "color": "#111111" },
				{ "slug": "primary", "name": "Primary", "color": "#da5a2a" }
			]
		},
		"typography": {
			"fontFamilies": [
				{ "slug": "inter", "name": "Inter", "fontFamily": "\\"Inter\\", sans-serif" },
				{ "slug": "georgia", "name": "Georgia", "fontFamily": "Georgia, serif" }
			]
		},
		"custom": { "radius": { "button": "6px" } }
	},
	"styles": {
		"color": { "background": "var:preset|color|base", "text": "var:preset|color|contrast" },
		"typography": { "fontFamily": "var:preset|font-family|inter" },
		"elements": {
			"button": { "color": { "background": "var:preset|color|primary", "text": "#ffffff" }, "border": { "radius": "4px" } },
			"heading": { "typography": { "fontFamily": "var:preset|font-family|georgia" } },
			"link": { "color": { "text": "#da5a2a" } }
		},
		"blocks": {
			"core/button": { "color": { "background": "var:preset|color|primary" } },
			"core/search": { "border": { "radius": "2px", "color": "#dddddd" } }
		}
	}
}
`
}

/** Gap 4: a Tailwind 3 template whose theme lives in tailwind.config.js. */
export const TAILWIND3 = {
  'package.json': JSON.stringify({
    name: 'tw3-fixture',
    version: '0.3.0',
    devDependencies: { tailwindcss: '^3.4.1' }
  }),
  'tailwind.config.js': `const colors = require('tailwindcss/colors')
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.html'], // the files: {html}
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#da5a2a', dark: '#b8481f' },
        ink: '#14171a',
        paper: '#f5f3ee',
        slate: colors.slate,
        ...colors.extra,
      },
      borderRadius: { card: '12px' },
    },
  },
}
`,
  'src/index.html': `<section class="bg-paper">
<div class="bg-ink p-4"><p class="text-white">x</p></div>
<button class="bg-brand hover:bg-brand-dark rounded px-3 text-white">Go</button>
<div class="card rounded-card border">y</div>
<p class="bg-brand/50">z</p>
<p class="text-slate-500">w</p>
</section>
`
}
