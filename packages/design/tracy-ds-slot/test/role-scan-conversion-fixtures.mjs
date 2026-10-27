// Fixture templates for the role-scan defects met while converting Tracy Business Joomla (JOOMLA) and
// the two WordPress themes (WORDPRESS) to the role variables, 15/10/2026. Kept as strings so no
// formatter moves their lines: the tests assert file:line.

export const JOOMLA = {
  'templateDetails.xml':
    '<?xml version="1.0"?><extension type="template"><name>fixture_joomla</name><version>1.0.0</version></extension>\n',
  'css/site.css': `:root {
	--tb-paper: #f5f3ee;
	--tb-ink: #14171a;
	--tb-ink-meta: #8a8780;
	--elev-raised: 0 2px 8px rgba(20, 23, 26, 0.12);
}
body { background: var(--tb-paper); color: var(--tb-ink); }
.lead { color: var(--tb-ink); border-bottom: 1px solid var(--tb-ink); }
.band-ink { background: #14171a; color: #f5f3ee; }
.band-ink .stamp { color: var(--tb-ink-meta); }
.band-ink .rule { border-top: 1px solid #2a2e32; }
.page-info { color: #6b6a64; }
.error-code { color: #14171a; }
.btn-dark { background: #14171a; border: 1px solid #14171a; }
.card-foot { border-radius: 0 0 5px 5px; }
@font-face { font-family: "Newsreader"; src: url(../fonts/newsreader.woff2); }
.search-input { border: 1px solid #dcd7cc; }
input[type="search"] { border-radius: 4px; }
`,
  'tpl/theme.tpl.css': 'body { font-family: __body_font_family; color: #222222; }\n',
  'css/theme.css': 'body { color: #222222; }\n',
  'css/template.css':
    ':root { --t4-primary: #0d6efd; --t4-body-bg: #ffffff; }\n.navbar { background: #f8f9fa; }\n.btn { color: var(--t4-primary); background: var(--t4-body-bg); }\n/*# sourceMappingURL=template.css.map */\n',
  'css/tokens.css': ':root { --t4-body-bg: var(--tb-page); --tb-page: var(--ds-c-bg, #ffffff); }\n',
  'css/template.css.map': JSON.stringify({
    version: 3,
    sources: ['../../../media/templates/site/t4/scss/_navbar.scss'],
    mappings: 'AAAA,QAAQ,kBAAkB'
  }),
  'html/index.html': '<!DOCTYPE html><title></title>\n'
}

const THEME_JSON = `{
	"version": 3,
	"settings": {
		"color": {
			"palette": [
				{ "slug": "paper", "color": "#f5f3ee" },
				{ "slug": "border", "color": "#dcd7cc" }
			]
		}
	},
	"styles": {
		"css": ".a { color: #111111; }\\n.b { font-family: \\"Inter\\", sans-serif; color: #222222; }\\nhtml[data-theme=\\"dark\\"] { --wp--preset--color--paper: #101214; }\\n.c { color: #333333 /* ds-keep: a sample swatch */; } .d { color: #444444; }"
	}
}
`

export const WORDPRESS = {
  'style.css': '/*\nTheme Name: Fixture WP\nText Domain: fixture-wp\nVersion: 1.0.0\n*/\n',
  'functions.php': '<?php\n',
  'theme.json': THEME_JSON,
  'assets/site.css': `:root {
	--brand-paper: #f5f3ee;
	--brand-prose: #242830;
	--brand-header: #ffffff;
	--legacy-tint: #abcdef;
}
body { background: var(--brand-paper); color: var(--brand-prose); }
html[data-theme="dark"] body { background: #101214; }
.site-header { background: var(--brand-header); }
input:not([type=submit]) { border-radius: 4px; }
.box { border: 1px solid var(--wp--preset--color--border, #dcd7cc); }
@layer properties {
	*, ::before { --tw-ring-offset-color: #fff; }
}
.title { color: light-dark(#14171a, #eceae4); }
.rule { border-color: rgba(0, 0, 0, 0.12); }
`
}
