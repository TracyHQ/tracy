// Fixture templates for the role scan tests, written to a temporary folder per test. Kept as strings
// (not files) so no formatter moves their lines: the tests assert file:line. The EmDash one copies the
// real hard-coded patterns of Tracy Business (step-1 audit, 15/10/2026), cut down.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export const EMDASH = {
  'package.json': JSON.stringify({
    name: '@tracy/emdash-theme-fixture',
    version: '1.0.0',
    devDependencies: { tailwindcss: '4.3.3' }
  }),
  'astro.config.mjs': 'export default {}\n',
  'src/styles/tokens.css': `@theme {
	--font-sans: var(--font-archivo), system-ui, sans-serif;
	--font-serif: var(--font-newsreader), Georgia, serif;
	--radius: 0px;
	--color-white: #ffffff;
	--color-paper: #f5f3ee;
	--color-paper-2: #edeae2;
	--color-card: #ffffff;
	--color-ink: #14171a;
	--color-signal: #da5a2a;
	--color-signal-tint: rgba(218, 90, 42, 0.1);
	--color-line: #dcd7cc;
	--color-line-soft: #e4dfd6;
	--color-fg: #14171a;
	--color-fg-muted: #5a5952;
	--color-on-ink: #f5f3ee;
	--color-on-forest-muted: #bfd4cb;
	--color-success: #2e7d32;
	--color-success-bg: #e9f2e9;
	--color-error-fg: #7a2016;
	--color-primary: var(--color-signal);
	--color-primary-foreground: #ffffff;
	--shadow-menu: 0 14px 30px rgba(20, 23, 26, 0.22);
}
html[data-theme="dark"] {
	--color-paper: #15181a;
	--color-fg: #eceae4;
	--color-link: #7fbfa6;
}
`,
  'src/styles/global.css': `.btn-primary {
	background: var(--color-signal);
	color: var(--ds-c-accent-on, #fff);
}
.btn-primary:hover { background: var(--color-signal); }
.chip-active {
	background: var(--color-ink);
	color: #fff;
}
.chip-active:hover {
	color: #fff;
}
::selection { background: var(--color-signal); color: #fff; }
html[data-theme="dark"] .link-underline { border-bottom-color: #7fbfa6; }
.photo-frame.contain img { background: #fff; }
.table-scroll { background-image: linear-gradient(to left, rgba(20, 23, 26, 0.2), transparent); }
.hero-badge { background: #7b2cbf; }
.ec-form-submit { background: var(--color-signal); color: #fff; border-radius: 0; }
.ec-form input { border-radius: 0; }
`,
  'src/components/CtaBox.astro': `---
const t = 'x'
---
<div class="bg-forest p-6">
	<h2 class="text-[#F5F3EE]">{t}</h2>
	<span class="bg-ink text-white">{t}</span>
	<p class="text-white">{t}</p>
</div>
<style>
	.cta-mask { mask-image: linear-gradient(to right, #000 0, transparent 100%); }
</style>
`,
  'src/components/ResourcesMenu.tsx': `export function ResourcesMenu() {
  return (
    <div className="rounded-none border bg-card p-2">
      <span className="text-[#C9C6BE]">x</span>
    </div>
  )
}
`,
  'src/components/LanguageMenu.tsx': `export const Flag = () => (
  <svg viewBox="0 0 3 2"><rect fill="#c8102e" width="3" height="2" /></svg>
)
`,
  'src/components/ui/button.tsx': `const base = 'inline-flex items-center rounded-md text-sm'
export const Button = () => <button className={base}>x</button>
`
}

export const JOOMLA = {
  'templateDetails.xml':
    '<extension type="template"><name>ja_fixture</name><version>2.1.0</version></extension>\n',
  'css/template.css': `body{background:#fff;color:#333}a{color:#e74c3c}a:hover{color:#c0392b}
.btn-primary{background-color:#e74c3c;color:#fff;border-radius:4px}.btn-primary:hover{background-color:#c0392b}
.well{background:#f5f5f5;border:1px solid #e3e3e3}.text-muted{color:#777}
.alert-success{background:#dff0d8;color:#3c763d}.label{background:#e74c3c;border-radius:9999px}
.logo{color:#e74c3c}.social-facebook{background:#3b5998}.promo-ribbon{background:#8e44ad}
.hero{background:#1a1a2e;color:#fff}.icon{background:url("data:image/svg+xml,%3Csvg fill='%23fff'/%3E")}
`,
  'less/variables.less': `@link-color: #e74c3c;
@border-radius-base: 4px;
// a comment with #ffffff that paints nothing
`
}

/** Write a fixture into a fresh temporary folder; returns its path. */
export function writeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'role-scan-'))
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return root
}
