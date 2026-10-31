# Role scan: tracy-saas 1.4.15 (emdash)

84 files scanned. Auto-convert: 44 · Flag for agent: 36 · Role not read: 0 · Keep: 22 · Unresolved: 103
Role variables read: 13.
Required roles never read (VARS-1 fails): --ds-c-ink, --ds-c-on-ink, --ds-c-heading, --ds-c-border-soft, --ds-c-focus-ring, --ds-c-disabled-bg, --ds-c-disabled-fg, --ds-c-success, --ds-c-success-bg, --ds-c-success-text, --ds-c-warn, --ds-c-warn-bg, --ds-c-warn-text, --ds-c-danger, --ds-c-danger-bg, --ds-c-danger-text, --ds-c-info, --ds-c-info-bg, --ds-c-info-text, --ds-input-radius, --ds-pill-radius, --ds-font-display, --ds-font-body: read each where its role paints.

## Auto-convert (role is clear)
- src/components/blog/Chips.astro:46 `100px` → `var(--ds-pill-radius, 100px)`
- src/components/blog/Masthead.astro:169 `100px` → `var(--ds-pill-radius, 100px)`
- src/components/blog/Pagination.astro:76 `8px` → `var(--ds-card-radius, 8px)`
- src/components/blog/PostCard.astro:44 `14px` → `var(--ds-card-radius, 14px)`
- src/components/sections/Accordion.astro:210 `12px` → `var(--ds-card-radius, 12px)`
- src/components/sections/Bento.astro:190 `11px` → `var(--ds-card-radius, 11px)`
- src/components/sections/Bento.astro:238 `10px` → `var(--ds-card-radius, 10px)`
- src/components/sections/Bento.astro:249 `10px` → `var(--ds-card-radius, 10px)`
- src/components/sections/Clients.astro:348 `12px` → `var(--ds-card-radius, 12px)`
- src/components/sections/ContactBlock.astro:217 `9px` → `var(--ds-input-radius, 9px)`
- src/components/sections/ContactBlock.astro:254 `5px` → `var(--ds-input-radius, 5px)`
- src/components/sections/ContactBlock.astro:284 `9px` → `var(--ds-btn-radius, 9px)`
- src/components/sections/Cta.astro:171 `20px` → `var(--ds-card-radius, 20px)`
- src/components/sections/FaqSupport.astro:98 `10px` → `var(--ds-btn-radius, 10px)`
- src/components/sections/FeaturesIntro.astro:85 `14px` → `var(--ds-card-radius, 14px)`
- src/components/sections/FeaturesLedger.astro:274 `11px` → `var(--ds-card-radius, 11px)`
- src/components/sections/FeaturesLedger.astro:473 `10px` → `var(--ds-card-radius, 10px)`
- src/components/sections/IncidentTimeline.astro:330 `999px` → `var(--ds-pill-radius, 999px)`
- src/components/sections/KineticqlSplit.astro:141 `12px` → `var(--ds-card-radius, 12px)`
- src/components/sections/Pricing.astro:171 `100px` → `var(--ds-pill-radius, 100px)`
- src/components/sections/Teams.astro:155 `14px` → `var(--ds-card-radius, 14px)`
- src/components/site/Footer.astro:257 `9px` → `var(--ds-input-radius, 9px)`
- src/components/site/Footer.astro:274 `9px` → `var(--ds-btn-radius, 9px)`
- src/components/site/Header.astro:202 `14px` → `var(--ds-card-radius, 14px)`
- src/components/site/Header.astro:269 `9px` → `var(--ds-btn-radius, 9px)`
- src/styles/global.css:209 `12px` → `var(--ds-card-radius, 12px)`
- src/styles/global.css:224 `999px` → `var(--ds-pill-radius, 999px)`
- src/styles/tokens.css:15 `var(--font-space-grotesk), system-ui, sans-serif` → `var(--ds-font-display, var(--font-space-grotesk), system-ui, sans-serif)`
- src/styles/tokens.css:16 `var(--font-ibm-plex-sans), system-ui, sans-serif` → `var(--ds-font-body, var(--font-ibm-plex-sans), system-ui, sans-serif)`
- src/styles/tokens.css:43 `8px` → `var(--ds-btn-radius, 8px)`
- src/styles/tokens.css:45 `16px` → `var(--ds-card-radius, 16px)`
- src/styles/tokens.css:76 `#0f1311` → `var(--ds-c-ink, #0f1311)`
- src/styles/tokens.css:78 `#9aa6a1` → `var(--ds-c-on-ink, #9aa6a1)`
- src/styles/tokens.css:119 `#12141e` → `var(--ds-c-ink, #12141e)`
- src/styles/tokens.css:121 `#9aa1b3` → `var(--ds-c-on-ink, #9aa1b3)`
- src/styles/tokens.css:160 `#0f1626` → `var(--ds-c-ink, #0f1626)`
- src/styles/tokens.css:162 `#93a0b8` → `var(--ds-c-on-ink, #93a0b8)`
- src/views/Authors.astro:83 `14px` → `var(--ds-card-radius, 14px)`
- src/views/Blog.astro:587 `14px` → `var(--ds-card-radius, 14px)`
- src/views/Blog.astro:604 `8px` → `var(--ds-card-radius, 8px)`
- src/views/NotFound.astro:78 `9px` → `var(--ds-btn-radius, 9px)`
- src/views/Search.astro:90 `12px` → `var(--ds-input-radius, 12px)`
- src/views/Terms.astro:99 `14px` → `var(--ds-card-radius, 14px)`
- src/views/Terms.astro:117 `11px` → `var(--ds-card-radius, 11px)`

## Flag for agent (role unclear: settle by hand)
- src/components/blog/AuthorProfile.astro:63 .profile: `16px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/blog/CodeBlock.astro:30 pre: `#fff`. translucent colour (alpha 0.5): a tint of which role?. Candidates: --ds-c-fg, --ds-c-muted, --ds-c-on-ink
- src/components/blog/Prose.astro:151 .prose :global(:not(pre) > code): `4px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/sections/Clients.astro:282 .tick-item.is-bright: `white`. translucent colour (alpha 0.5): a tint of which role?. Candidates: --ds-c-fg, --ds-c-muted, --ds-c-on-ink
- src/components/sections/Clients.astro:361 .integ-mark: `10px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/sections/ContactBlock.astro:125 .cb-method: `14px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/sections/ContactBlock.astro:134 .cb-method-icon: `11px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/sections/ContactBlock.astro:310 .cb-form :global(.ec-form-status): `9px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/sections/FeaturesIntro.astro:93 .fi-icon: `10px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/sections/FeaturesLedger.astro:351 .fl--band .fl-metrics: `0`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/sections/FeaturesLedger.astro:373 .fl-stat: `12px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/sections/Hero.astro:157 .hero-visual img: `12px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/sections/PricingMatrix.astro:158 .scroll: `12px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/sections/Teams.astro:218 .social-link: `8px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/site/Footer.astro:188 .k-footer-social a: `8px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/site/Header.astro:164 .k-header :global(.k-nav-link): `8px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/site/Header.astro:242 .k-header :global(.k-mega-link): `6px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/site/Header.astro:379 .k-header :global(.k-drawer-row): `10px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/components/site/ThemeToggle.astro:54 .k-theme-toggle: `9px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/styles/tokens.css:44 token --radius-ghost: `9px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/styles/tokens.css:69 token --k-grid: `rgba(16, 20, 15, 0.04)`. translucent colour (alpha 0.04): a tint of which role?. Candidates: --ds-c-border-soft, --ds-c-surface, --ds-c-fg
- src/styles/tokens.css:77 token --k-panel-border: `#232a27`. template variable --k-panel-border: border of the dark panel --k-panel: no role names it on an ink ground. Candidates: --ds-c-on-ink, --ds-c-accent, --ds-c-border
- src/styles/tokens.css:79 token --k-panel-accent: `#a3e635`. template variable --k-panel-accent: accent of the dark panel --k-panel: no role names it on an ink ground. Candidates: --ds-c-on-ink, --ds-c-accent, --ds-c-border
- src/styles/tokens.css:95 token --k-grid: `rgba(255, 255, 255, 0.035)`. translucent colour (alpha 0.04): a tint of which role?. Candidates: --ds-c-border-soft, --ds-c-surface, --ds-c-fg
- src/styles/tokens.css:115 token --k-grid: `rgba(79, 70, 229, 0.05)`. translucent colour (alpha 0.05): a tint of which role?. Candidates: --ds-c-accent, --ds-c-surface
- src/styles/tokens.css:120 token --k-panel-border: `#242838`. template variable --k-panel-border: border of the dark panel --k-panel: no role names it on an ink ground. Candidates: --ds-c-on-ink, --ds-c-accent, --ds-c-border
- src/styles/tokens.css:122 token --k-panel-accent: `#7c7ef5`. template variable --k-panel-accent: accent of the dark panel --k-panel: no role names it on an ink ground. Candidates: --ds-c-on-ink, --ds-c-accent, --ds-c-border
- src/styles/tokens.css:136 token --k-grid: `rgba(99, 102, 241, 0.08)`. translucent colour (alpha 0.08): a tint of which role?. Candidates: --ds-c-accent, --ds-c-surface
- src/styles/tokens.css:156 token --k-grid: `rgba(8, 145, 178, 0.06)`. translucent colour (alpha 0.06): a tint of which role?. Candidates: --ds-c-accent, --ds-c-surface
- src/styles/tokens.css:161 token --k-panel-border: `#1e2a41`. template variable --k-panel-border: border of the dark panel --k-panel: no role names it on an ink ground. Candidates: --ds-c-on-ink, --ds-c-accent, --ds-c-border
- src/styles/tokens.css:163 token --k-panel-accent: `#22d3ee`. template variable --k-panel-accent: accent of the dark panel --k-panel: no role names it on an ink ground. Candidates: --ds-c-on-ink, --ds-c-accent, --ds-c-border
- src/styles/tokens.css:177 token --k-grid: `rgba(34, 211, 238, 0.06)`. translucent colour (alpha 0.06): a tint of which role?. Candidates: --ds-c-accent, --ds-c-surface
- src/views/Archive.astro:114 .rail: `14px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/views/Article.astro:197 .cover: `14px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/views/Article.astro:236 .rel: `14px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius
- src/views/Blog.astro:458 .rail a: `8px`. corner of an unnamed component. Candidates: --ds-card-radius, --ds-btn-radius, --ds-input-radius, --ds-pill-radius

## Keep (not a design role)
- circle or pill geometry, not a corner role: 11 (src/components/blog/Avatar.astro:31, src/components/blog/Masthead.astro:185, src/components/sections/Clients.astro:245, src/components/sections/IncidentTimeline.astro:179, src/components/sections/IncidentTimeline.astro:256, src/components/sections/PageMasthead.astro:106, ...)
- mask: only its alpha paints: 4 (src/components/sections/Clients.astro:254, src/components/sections/Clients.astro:254, src/components/sections/Clients.astro:255, src/components/sections/Clients.astro:255)
- monospace stack: the code face, not a body or display role: 1 (src/styles/tokens.css:17)
- shadow or overlay tint: depth, not a role: 6 (src/styles/tokens.css:70, src/styles/tokens.css:96, src/styles/tokens.css:116, src/styles/tokens.css:137, src/styles/tokens.css:157, src/styles/tokens.css:178)
