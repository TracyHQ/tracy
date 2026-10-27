<?php
/**
 * wp-ja-kinetic — D-11 requires the same element tree as the Joomla source, tag names included.
 * Several run-3 fixers found individual instances of "source uses a different tag than the one
 * Gutenberg's own block (core/paragraph → `<p>`, core/group → `<div>`, core/image → `<figure>`,
 * core/term-description → `<div>`, core/button → `<div><a>…</a></div>`) renders, and reported each
 * as a WordPress limit. It is not one: WordPress's own `WP_HTML_Tag_Processor` has no tag-rename
 * method (confirmed against the class on the stand, `wp-includes/html-api/class-wp-html-tag-
 * processor.php` — no `set_tag`/rename method exists among its public methods), so this file
 * rewrites the rendered tag on `render_block`, keyed off a single class → tag map built from the
 * run-3 audits' own `tagDiff` output (`compare.mjs`'s `sig` — an element's own non-framework class
 * list, sorted and dot-joined — is reused verbatim as the map key below, computed here off the
 * block's own `className` attribute rather than the rendered markup, since the two are the same set
 * for every block in this map).
 *
 * Every rewrite here is guarded: it checks the shape it expects (a single well-formed root element,
 * or — for the unwrap helpers — a specific parent/child pair) before touching anything, and returns
 * the original content unchanged when that shape is not present. None of it uses an unbounded regex
 * over arbitrary HTML; each pattern is anchored to the start/end of the block's own render_block
 * output, which core guarantees is one root element per top-level block.
 *
 * Priority 20 (the theme's other `render_block` filters in inc/extra.php run at the default 10):
 * this file only ever renames the outer tag or unwraps a wrapper, never touches attributes, so it is
 * safe to run last, after any filter that still expects to match the block's original tag/class (e.g.
 * `wp_ja_kinetic_decorative_aria_hidden`'s `acm-tick-group` div match, `wp_ja_kinetic_auth_main_state_classes`'s
 * class swap on the `main` wrapper).
 *
 * Loaded by inc/extra.php, the same way as inc/item-ids.php and inc/blog-dynamic.php.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

/**
 * The IGNRE prefix list from parity-tools/compare.mjs, reproduced so the signature computed here
 * matches exactly what the audits measured. Framework/layout classes WordPress adds on top of a
 * block's own `className` never affect this set (a block's `className` attribute never carries them
 * in the first place), but the list is kept identical to the measurement tool on purpose — this map
 * is only ever correct if its keys are computed the same way the audits computed theirs.
 */
const WP_JA_KINETIC_TAG_PARITY_IGNORE_PREFIX = '/^(wp-block-|wp-elements-|is-layout-|is-content-justification|wp-container-|has-|is-style-|wp-image-|aligncenter|alignwide|alignfull|is-nowrap|is-vertical|is-horizontal|is-not-stacked|are-vertically|wp-embed|block-editor)/';

/**
 * class signature (audits' `sig`) → source tag. A plain root-tag rename: the element carrying this
 * exact class set becomes this tag, everything else (attributes, children) is left untouched.
 */
const WP_JA_KINETIC_TAG_PARITY_RENAME = array(
	'acm-accordion.ja-acm.style-1' => 'div',
	'acm-bento-eyebrow' => 'div',
	'acm-bento-media' => 'div',
	'acm-bento-stat-eyebrow' => 'div',
	'acm-bento-stat-unit' => 'span',
	'acm-bento-stat-val' => 'span',
	'acm-clients-caption' => 'span',
	'acm-clients-card-arrow' => 'span',
	'acm-clients-card-desc' => 'div',
	'acm-clients-card-name' => 'div',
	'acm-clients-group-title' => 'div',
	'acm-clients-logo.is-text' => 'span',
	'acm-clients-mark' => 'span',
	'acm-features-intro.ja-acm.style-1' => 'div',
	'acm-features-ledger.ja-acm.layout-ledger.style-1' => 'div',
	'acm-features-ledger.ja-acm.layout-metrics.style-1' => 'div',
	'acm-features-ledger.ja-acm.layout-stats.style-1' => 'div',
	'acm-incident-timeline.ja-acm.style-1' => 'div',
	'acm-pricing-matrix.ja-acm.style-1' => 'div',
	'acm-pricing.ja-acm.style-1' => 'div',
	'acm-prose-quote.ja-acm.style-1' => 'div',
	'acm-split-eyebrow' => 'div',
	'acm-teams.ja-acm.style-1' => 'div',
	'acm-testimonials.ja-acm.style-1' => 'div',
	'acm-tick-group' => 'span',
	'acm-tick-item.is-bright' => 'span',
	'acm-tick-item.is-dim' => 'span',
	'acm-tick-live' => 'span',
	'acm-tick-sep' => 'span',
	'com-finder.finder.kinetic-finder' => 'div',
	'com-tags.com-tags-tag.tag-category' => 'div',
	'com-tags__row-author' => 'span',
	'com-tags__row-chevron' => 'span',
	'com-tags__row-date' => 'span',
	'com-tags__row-dot' => 'span',
	'com-tags__row-main' => 'span',
	'com-tags__row-meta' => 'span',
	'com-tags__row-title.hx-blogtitle' => 'span',
	// page-password.html's block authors ALL FOUR of reset+remind's classes on one group
	// (inc/extra.php's `wp_ja_kinetic_auth_main_state_classes` trims $content, not $block, down to
	// the state-specific pair afterwards) — one signature covers reset (plain/confirm/complete/
	// invalid) and remind alike, run-3 AU-295.
	'com-users-remind.com-users-reset.hx-grid-bg.kinetic-auth.kinetic-auth--single.remind.reset' => 'div',
	'com-users-login.hx-grid-bg.kinetic-auth.login' => 'div',
	'com-users-profile.hx-grid-bg.kinetic-auth.profile' => 'div',
	'com-users-registration.hx-grid-bg.kinetic-auth.registration' => 'div',
	'hx-arch-rail__h' => 'span',
	'hx-archmast__pill' => 'span',
	'hx-au-pill' => 'span',
	'hx-aupost__e' => 'p',
	'hx-author__name' => 'span',
	'hx-author__sub' => 'p',
	'hx-bc-current' => 'span',
	'hx-blog-pagination.pagination-wrap' => 'nav',
	'hx-blogauthor' => 'span',
	'hx-blogdate' => 'time',
	'hx-blogdate__d' => 'span',
	'hx-blogdate__m' => 'span',
	'hx-blogdatetxt' => 'span',
	'hx-blogexcerpt' => 'p',
	'hx-blogtopics__lbl' => 'span',
	'hx-card.hx-testi-hero' => 'figure',
	'hx-card.hx-testi-small' => 'figure',
	'hx-eyebrow.kinetic-eyebrow.kinetic-tags-eyebrow' => 'span',
	'hx-feat-stat' => 'span',
	'hx-fl-ruled-count' => 'span',
	'hx-fl-ruled-idx' => 'span',
	'hx-fl-ruled-l' => 'span',
	'hx-fl-ruled-title' => 'span',
	'hx-inc-badge-l' => 'span',
	'hx-inc-phase' => 'div',
	'hx-inc-time' => 'span',
	'hx-metric-desc' => 'span',
	'hx-metric-label' => 'span',
	'hx-metric-value' => 'span',
	'hx-metrics-badge' => 'span',
	'hx-metrics-cardlabel' => 'span',
	'hx-metrics-dot' => 'span',
	'hx-pi-desc' => 'div',
	'hx-pi-title' => 'div',
	'hx-plan-amount' => 'span',
	'hx-plan-badge' => 'span',
	'hx-plan-name' => 'div',
	'hx-plan-period' => 'span',
	'hx-prose-meta' => 'span',
	'hx-prose-num' => 'span',
	'hx-sec-idx' => 'span',
	'hx-sec-meta' => 'span',
	'hx-spec-cardhead-l' => 'span',
	'hx-spec-cardhead-r' => 'span',
	'hx-spec-num' => 'span',
	'hx-stat-lab' => 'div',
	'hx-stat-val' => 'div',
	'hx-team-chip' => 'span',
	'hx-team-social' => 'div',
	'hx-testi-id' => 'span',
	'hx-testi-meta' => 'em',
	'hx-testi-name' => 'b',
	'hx-testi-q' => 'blockquote',
	'hxcat-card__h' => 'span',
	'hxcat-pill' => 'span',
	'hxcat-row__body' => 'span',
	'hxcat-row__cover' => 'span',
	'hxcat-row__excerpt' => 'span',
	'hxcat-row__meta' => 'span',
	'hxcat-row__title' => 'span',
	'kinetic-auth__eyebrow' => 'span',
	'kinetic-eyebrow' => 'span',

// count: 100
);

/**
 * `core/button` renders `<div class="wp-block-button {classes}"><a class="wp-block-button__link
 * wp-element-button" href="…">label</a></div>`; every source button/chip/pill is a single `<a>`, no
 * wrapping div at all (verified live: `curl` of the source hero/CTA rows). Unwrap the div, carry its
 * own classes onto the inner `<a>`, drop the WP framework classes and the wrapper.
 */
const WP_JA_KINETIC_TAG_PARITY_BUTTON = array(
	'hx-btn.hx-btn--ghost'                    => 'hx-btn hx-btn--ghost',
	'hx-btn.hx-btn--ghost.hx-plan-cta'        => 'hx-btn hx-btn--ghost hx-plan-cta',
	'hx-btn.hx-btn--primary'                  => 'hx-btn hx-btn--primary',
	'hx-btn.hx-btn--primary.hx-plan-cta'      => 'hx-btn hx-btn--primary hx-plan-cta',
	'hx-cta-btn.hx-cta-btn-ghost'             => 'hx-cta-btn hx-cta-btn-ghost',
	'hx-cta-btn.hx-cta-btn-primary'           => 'hx-cta-btn hx-cta-btn-primary',
	'hx-cta-chip'                             => 'hx-cta-chip',
	'hx-pi-btn'                               => 'hx-pi-btn',
	'hx-sup-btn'                              => 'hx-sup-btn',
	'acm-split-cta'                           => 'acm-split-cta',
);

/**
 * `core/image` renders `<figure class="wp-block-image {classes}"><img …></figure>`; the source
 * avatar is a bare `<img class="{classes}">`, no figure. Unwrap: drop the figure, carry its classes
 * onto the `<img>`.
 */
const WP_JA_KINETIC_TAG_PARITY_FIGURE_IMG = array(
	'hx-team-avatar'  => 'hx-team-avatar',
	'hx-testi-avatar' => 'hx-testi-avatar',
);

/**
 * The same figure → bare `<img>` unwrap, keyed by pattern `metadata.name` instead of class
 * signature: the hero's and the KineticQL split's panel images (`acm/hero/tmpl/style-1.php`,
 * `acm/kineticql-split/tmpl/style-1.php`) are both a bare `<img class="hx-panelimg is-{dir}">`
 * on the source; the name keeps the unwrap off any other image that reuses those classes.
 */
const WP_JA_KINETIC_TAG_PARITY_FIGURE_IMG_BY_NAME = array(
	'hero.image_terminal',
	'hero.image_blueprint',
	'hero.image_signal',
	'kineticql-split.image_terminal',
	'kineticql-split.image_blueprint',
	'kineticql-split.image_signal',
);

/**
 * The source's KineticQL checklist item is `<li class="acm-split-check"><svg class="hx-check">…</svg>
 * <span>{text}</span></li>` (`acm/kineticql-split/tmpl/style-1.php`, SVG copied from it). `core/list-item`
 * supports no custom class and holds one editable text run, so the pattern keeps a plain `<li>` (the
 * editor keeps a plain editable item, and a seeder that rewrites the text cannot drop the icon) and the
 * class, icon and span are added here, keyed by pattern `metadata.name` (item index stripped).
 */
const WP_JA_KINETIC_TAG_PARITY_CHECK_ITEM_BY_NAME = array( 'kineticql-split.bullet-text' => 'acm-split-check' );
const WP_JA_KINETIC_TAG_PARITY_CHECK_SVG          = '<svg class="hx-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

/**
 * `core/table` renders `<figure class="wp-block-table {classes}"><table>…</table></figure>`, and the
 * figure is the only element whose class the block can author. The source pricing matrix is
 * `<div class="hx-matrix-wrap"><table class="hx-matrix">` (acm/pricing-matrix/tmpl). Split: the
 * figure becomes that div (dropping `wp-block-table`, whose core rules — the 3px `thead` rule
 * among them — the source never has), and the table class moves onto the `<table>`.
 * Signature → array( wrapper classes, table classes ).
 */
const WP_JA_KINETIC_TAG_PARITY_TABLE_SPLIT = array(
	'hx-matrix.hx-matrix-wrap' => array( 'hx-matrix-wrap', 'hx-matrix' ),
);

/**
 * The whole card is a single `<a href="…">` on the source (verified live on all four: blog row,
 * engineering category card, author post row, tag row) — no nested link for the title, which is
 * plain text inside the anchor. WordPress builds the row as a `core/group` `<div>` with the
 * `core/post-title` block's own `isLink:true` anchor nested inside for the title. Rewrite the outer
 * wrapper to `<a>` using that inner anchor's href, and drop the inner anchor (unwrapped to its text)
 * — matching the source tree exactly instead of nesting an `<a>` inside an `<a>`.
 */
const WP_JA_KINETIC_TAG_PARITY_ROW_LINK = array(
	'hx-blogrow'                => 'hx-blogrow',
	'hxcat-row'                 => 'hxcat-row',
	'hx-aupost'                 => 'hx-aupost',
	'com-tags__row.hx-tagcard'  => 'hx-tagcard com-tags__row',
);

/**
 * `core/term-description` always renders `<div class="wp-block-term-description {classes}">` and
 * runs the description through `wpautop()`, which wraps it in its own `<p>` — a second level the
 * source does not have. Checked live: the blog (`hx-blogmast__desc`) and engineering-category
 * (`hxcat-sub`) description elements already match WordPress's div>p shape on the source too (both
 * wrap the description in a `<p>` there as well), so only the tag term view actually needs a fix —
 * its source element (`div.hx-mast-sub.com-tags__sub.kinetic-tags-sub`) holds the description text
 * directly, no inner `<p>`. Keep the outer tag, unwrap only the auto `<p>`. The key is the sorted
 * signature `wp_ja_kinetic_tag_parity_signature()` computes, not the authored class order.
 */
const WP_JA_KINETIC_TAG_PARITY_TERM_DESC_COLLAPSE_SIG = 'com-tags__sub.hx-mast-sub.kinetic-tags-sub';

/**
 * The tag archive's breadcrumb (`templates/tag.html`). The source (`com_tags/tag/default.php:38-41`)
 * puts `a.hx-author__bc-home` and `span.hx-author__bc-trail` directly in the `nav`, with the tag
 * name as the last text INSIDE the trail span ("/ Tags / latency"). WordPress renders the static
 * part as a class-less paragraph (`<p>…</span></p>`) followed by `wp-ja-kinetic/current-term-name`'s
 * bare text, so the name lands outside the span as its own flex item. Drop the `<p>` and close the
 * span after the name.
 */
const WP_JA_KINETIC_TAG_PARITY_TAG_BREADCRUMB_SIG = 'hx-author__bc.kinetic-tags-bc';

/**
 * The article masthead's sub-title (`templates/single.html`, `page-article.html`) is a
 * `core/post-excerpt`, which renders `<div class="…"><p class="wp-block-post-excerpt__excerpt">
 * text</p></div>`; the rename map turns the div into the source's `<p class="hx-article__sub">`,
 * and a `<p>` inside a `<p>` is split by the HTML parser into an empty `p.hx-article__sub`, a
 * sibling excerpt `<p>` and a stray empty `<p>` (measured, run-3 L-08). The source holds the text
 * directly in `p.hx-article__sub`, so the inner `<p>` is collapsed as well.
 */
const WP_JA_KINETIC_TAG_PARITY_EXCERPT_COLLAPSE_SIG = 'hx-article__sub';

/**
 * The article breadcrumb's category crumb and the masthead eyebrow are a single `<a class="…">` on
 * the source (`article/default.php:80-90`, verified live): the article's own category, no wrapper.
 * `core/post-terms` renders `<div class="taxonomy-category {classes} wp-block-post-terms"><a href
 * rel="tag">name</a></div>`; keep the first term's anchor only (a Joomla article has exactly one
 * category) and carry the block's classes onto it.
 */
const WP_JA_KINETIC_TAG_PARITY_TERM_LINK = array(
	'hx-bc-cat'                  => 'hx-bc-cat',
	'hx-article__cat.hx-eyebrow' => 'hx-eyebrow hx-article__cat',
);

/**
 * The tag archive row's category eyebrow is plain text in a `<span>` on the source
 * (`com_tags/tag/default_items.php`: `<span class="com-tags__row-eyebrow">name</span>`) — the row
 * itself is the link, so a nested term `<a>` would make the browser split the row card. Same first-term
 * rewrite as above, printed as a text-only span.
 */
const WP_JA_KINETIC_TAG_PARITY_TERM_TEXT = array(
	'com-tags__row-eyebrow' => 'com-tags__row-eyebrow',
);

/**
 * The tag archive row's date: `core/post-date` wraps the text in `<time datetime>`; the source's
 * `span.com-tags__row-date` holds the formatted date directly (`com_tags/tag/default_items.php`).
 */
const WP_JA_KINETIC_TAG_PARITY_ROW_DATE_SIG = 'com-tags__row-date';

/**
 * The breadcrumb's static "Home /" and lone "/" pieces (`templates/single.html`) are class-less
 * `core/paragraph` blocks named by `metadata.name`; the source has the `<a>`/`<span>` directly in the
 * `nav`, so only the paragraph's `<p>` goes.
 */
const WP_JA_KINETIC_TAG_PARITY_BREADCRUMB_LEAF = array( 'article-breadcrumb.home', 'article-breadcrumb.sep' );

/**
 * Term meta carrying a tag's source (Joomla) tag id — the source's tag list prints it as the
 * `tag-{id}` class on every `<li>` (`layouts/joomla/content/tags.php`). WordPress cannot choose a
 * term's id, so the seeder writes the source id here (posts.contract.json → tags); a tag without
 * it falls back to its own term id.
 */
const WP_JA_KINETIC_SOURCE_TAG_ID_META = 'wp_ja_kinetic_source_tag_id';

/**
 * Single class, several different source tags, and the class alone cannot tell them apart — every
 * one of hero/features-intro/features-ledger(both layouts)/incident-timeline/teams/testimonials/
 * pricing-matrix/page-masthead/accordion (`patterns/section-*.php`) authors the identical
 * `wp:paragraph {"className":"hx-eyebrow", …}` block, and the blog/category listing masthead
 * ("Blog", `templates/index.html`/`category.html`) authors the same className with no metadata at
 * all. The run-3 audits' own measured mismatch list names only hero and incident-timeline's eyebrow
 * as a `<div>` on the source; testimonials and the features-ledger stats layout were re-measured
 * live after this fix and confirmed already `<p>`, matching the source — the other four patterns
 * (features-intro, teams, pricing-matrix, page-masthead, accordion, and the features-ledger metrics
 * layout) were not individually re-measured, but none of them appears in that mismatch list either,
 * so the same "already `<p>`, leave it" answer is expected to hold; re-check if one of them turns up
 * a masthead/eyebrow row in a future audit. Keyed on the pattern's own
 * `metadata.name` — the one signal that is actually unique per pattern instance the class itself is
 * not (features-ledger's two layouts share the same `metadata.name`, "features-ledger.eyebrow", but
 * since both need the same answer — leave it alone — that collision does not matter here).
 *
 * @param array $block Parsed block, incl. `attrs.metadata.name`.
 * @return string|null Desired tag, or null to leave the block's rendered tag untouched.
 */
function wp_ja_kinetic_tag_parity_eyebrow_tag( array $block ): ?string {
	$name = (string) ( $block['attrs']['metadata']['name'] ?? '' );
	if ( in_array( $name, array( 'hero.eyebrow', 'incident-timeline.eyebrow' ), true ) ) {
		return 'div';
	}
	if ( '' === $name && ( is_home() || is_category() ) ) {
		return 'span';
	}
	return null;
}

/**
 * Reproduces compare.mjs's `sig`: the block's own non-framework classes, sorted and dot-joined.
 * Computed off `$block['attrs']['className']` (the literal authored value) rather than the rendered
 * markup — identical to what the audits measured for every block in this map, since none of them
 * puts a framework-prefixed token in its own `className`.
 */
function wp_ja_kinetic_tag_parity_signature( string $class_name ): string {
	$tokens = array_filter( preg_split( '/\s+/', trim( $class_name ) ) );
	$significant = array();
	foreach ( $tokens as $token ) {
		if ( ! preg_match( WP_JA_KINETIC_TAG_PARITY_IGNORE_PREFIX, $token ) ) {
			$significant[] = $token;
		}
	}
	sort( $significant );
	return implode( '.', $significant );
}

/**
 * Renames the block's own root element, checking first that the trimmed content both opens with
 * `<$current_tag` and closes with `</$current_tag>` — i.e. is genuinely one balanced element, not a
 * fragment this rewrite could corrupt. Never touches anything between the two tokens. A no-op when
 * the tag already matches (already fixed by another pass, or by another fixer's own change).
 */
function wp_ja_kinetic_tag_parity_rename_root( string $content, string $desired_tag ): string {
	$trimmed = trim( $content );
	if ( '' === $trimmed || ! preg_match( '/^<([a-zA-Z][a-zA-Z0-9-]*)\b/', $trimmed, $open ) ) {
		return $content;
	}
	$current_tag = strtolower( $open[1] );
	if ( $current_tag === $desired_tag ) {
		return $content;
	}
	if ( ! preg_match( '#</' . preg_quote( $current_tag, '#' ) . '>\s*$#i', $trimmed ) ) {
		return $content; // Not a single balanced element of $current_tag — never guess.
	}
	$updated = preg_replace( '/^<' . preg_quote( $current_tag, '/' ) . '\b/i', '<' . $desired_tag, $trimmed, 1 );
	return (string) preg_replace( '#</' . preg_quote( $current_tag, '#' ) . '>\s*$#i', '</' . $desired_tag . '>', $updated, 1 );
}

/**
 * `<div class="wp-block-button …"><a …>label</a></div>` → `<a class="{$classes}" href="…">label</a>`.
 * Returns the content unchanged if the shape is not exactly one anchor inside one div (nothing else
 * inside, no missing href) — never guesses at a different button shape.
 */
function wp_ja_kinetic_tag_parity_unwrap_button( string $content, string $classes ): string {
	$trimmed = trim( $content );
	if ( ! preg_match( '/^<div\b[^>]*>(.*)<\/div>\s*$/is', $trimmed, $outer ) ) {
		return $content;
	}
	$inner = trim( $outer[1] );
	if ( ! preg_match( '/^<a\b([^>]*)>(.*)<\/a>$/is', $inner, $anchor ) ) {
		return $content;
	}
	if ( ! preg_match( '/\shref="([^"]*)"/i', $anchor[1], $href ) ) {
		return $content;
	}
	$extra = '';
	if ( preg_match( '/\starget="([^"]*)"/i', $anchor[1], $m ) ) {
		$extra .= ' target="' . esc_attr( $m[1] ) . '"';
	}
	if ( preg_match( '/\srel="([^"]*)"/i', $anchor[1], $m ) ) {
		$extra .= ' rel="' . esc_attr( $m[1] ) . '"';
	}
	return '<a class="' . esc_attr( $classes ) . '" href="' . esc_url( $href[1] ) . '"' . $extra . '>' . $anchor[2] . '</a>';
}

/**
 * `<figure class="wp-block-image …"><img …></figure>` → `<img class="{original img classes} +
 * {$classes}">`. Returns the content unchanged when the figure holds anything besides one `<img>`
 * (e.g. a caption) — that shape is not one this theme's avatar patterns use, and is left alone.
 */
function wp_ja_kinetic_tag_parity_unwrap_figure_img( string $content, string $classes ): string {
	$trimmed = trim( $content );
	if ( ! preg_match( '/^<figure\b[^>]*>\s*(<img\b[^>]*>)\s*<\/figure>\s*$/is', $trimmed, $m ) ) {
		return $content;
	}
	$img = $m[1];
	if ( preg_match( '/\sclass="([^"]*)"/i', $img, $cm ) ) {
		$existing = array_filter( preg_split( '/\s+/', $cm[1] ) );
		$existing = array_filter( $existing, static function ( $c ) {
			return ! preg_match( '/^wp-image-/', $c );
		} );
		$merged = array_unique( array_merge( $existing, explode( ' ', $classes ) ) );
		return (string) preg_replace( '/\sclass="[^"]*"/i', ' class="' . esc_attr( implode( ' ', $merged ) ) . '"', $img, 1 );
	}
	return (string) preg_replace( '/^<img\b/i', '<img class="' . esc_attr( $classes ) . '"', $img, 1 );
}

/**
 * `<figure class="wp-block-table …"><table …>…</table></figure>` → `<div class="{$wrap_classes}">
 * <table class="{$table_classes} {its own classes}" …>…</table></div>`. Returns the content
 * unchanged when the figure holds anything besides one table (e.g. a `figcaption`).
 */
function wp_ja_kinetic_tag_parity_split_table( string $content, string $wrap_classes, string $table_classes ): string {
	$trimmed = trim( $content );
	if ( ! preg_match( '/^<figure\b[^>]*>\s*<table\b([^>]*)>(.*)<\/table>\s*<\/figure>$/is', $trimmed, $m ) ) {
		return $content;
	}
	$attrs = $m[1];
	if ( preg_match( '/\sclass="([^"]*)"/i', $attrs, $cm ) ) {
		$attrs = (string) preg_replace( '/\sclass="[^"]*"/i', ' class="' . esc_attr( trim( $table_classes . ' ' . $cm[1] ) ) . '"', $attrs, 1 );
	} else {
		$attrs = ' class="' . esc_attr( $table_classes ) . '"' . $attrs;
	}
	return '<div class="' . esc_attr( $wrap_classes ) . '"><table' . $attrs . '>' . $m[2] . '</table></div>';
}

/**
 * The source row is a single `<a href>` with the title as plain text; WordPress renders the row as a
 * `<div>` with the title's own `core/post-title` anchor nested inside — and, where the row also
 * carries a `core/post-terms` eyebrow, a SECOND anchor before it (that wrapper is a separate,
 * differently-owned issue, `div.taxonomy-category` — see the run-3 audits' L-05/L-06 — and is left
 * exactly as it renders). The title link is always the LAST anchor in every row this map covers
 * (eyebrow, if any, is authored before the title in every one of the four patterns); the href comes
 * from that last anchor, and only that one is unwrapped. Requires at least one `<a href>` in the row
 * — zero is a shape this row pattern does not use, and is left alone rather than guessed at.
 */
function wp_ja_kinetic_tag_parity_row_to_link( string $content, string $classes ): string {
	$trimmed = trim( $content );
	if ( ! preg_match( '/^<div\b[^>]*>(.*)<\/div>\s*$/is', $trimmed, $outer ) ) {
		return $content;
	}
	$inner = $outer[1];
	if ( ! preg_match_all( '/<a\b[^>]*\shref="[^"]*"[^>]*>.*?<\/a>/is', $inner, $anchors, PREG_OFFSET_CAPTURE ) || 0 === count( $anchors[0] ) ) {
		return $content;
	}
	list( $full_match, $offset ) = end( $anchors[0] );
	if ( ! preg_match( '/\shref="([^"]*)"/i', $full_match, $href )
		|| ! preg_match( '/^<a\b[^>]*>(.*)<\/a>$/is', $full_match, $label )
	) {
		return $content;
	}
	$new_inner = substr( $inner, 0, $offset ) . $label[1] . substr( $inner, $offset + strlen( $full_match ) );
	return '<a class="' . esc_attr( $classes ) . '" href="' . esc_url( $href[1] ) . '">' . $new_inner . '</a>';
}

/**
 * `<div class="…">​<p>text</p></div>` → `<div class="…">text</div>` — drops only the `wpautop()`-added
 * inner `<p>`, keeps the outer tag as-is (the tag term view's source element is itself a `<div>`).
 */
function wp_ja_kinetic_tag_parity_collapse_inner_p( string $content, string $inner_tag = 'p' ): string {
	$trimmed = trim( $content );
	$inner   = preg_quote( $inner_tag, '/' );
	if ( ! preg_match( '/^(<(div|p)\b[^>]*>)\s*<' . $inner . '\b[^>]*>(.*)<\/' . $inner . '>\s*(<\/\2>)\s*$/is', $trimmed, $m ) ) {
		return $content;
	}
	return $m[1] . trim( $m[3] ) . $m[4];
}

/**
 * `<nav …><p><a …>Home</a><span class="hx-author__bc-trail">/ <a …>Tags</a> / </span></p> name</nav>`
 * → `<nav …><a …>Home</a><span class="hx-author__bc-trail">/ <a …>Tags</a> / name</span></nav>`.
 * Unchanged unless the nav holds exactly that paragraph (ending in `</span>`) plus plain text.
 */
function wp_ja_kinetic_tag_parity_tag_breadcrumb( string $content ): string {
	$trimmed = trim( $content );
	if ( ! preg_match( '#^(<nav\b[^>]*>)\s*<p\b[^>]*>(.*)</span>\s*</p>\s*([^<]*?)\s*</nav>$#s', $trimmed, $m ) ) {
		return $content;
	}
	return $m[1] . $m[2] . $m[3] . '</span></nav>';
}

/**
 * `<div class="taxonomy-category …"><a href="…" rel="tag">name</a>…</div>` → `<a class="{$classes}"
 * href="…">name</a>`, first term only. Unchanged when no anchor is present.
 */
function wp_ja_kinetic_tag_parity_term_link( string $content, string $classes, bool $as_text = false ): string {
	if ( ! preg_match( '/<a\b[^>]*\shref="([^"]*)"[^>]*>(.*?)<\/a>/is', $content, $m ) ) {
		return $content;
	}
	if ( $as_text ) {
		return '<span class="' . esc_attr( $classes ) . '">' . $m[2] . '</span>';
	}
	return '<a class="' . esc_attr( $classes ) . '" href="' . esc_url( $m[1] ) . '">' . $m[2] . '</a>';
}

/**
 * The source's article tag list (`layouts/joomla/content/tags.php`): `<ul class="tags list-inline">`
 * of `<li class="list-inline-item tag-{id} tag-list{index}" itemprop="keywords">` each holding one
 * `<a class="badge badge-info">`, no separator. Rebuilt from the post's terms, which
 * `get_the_terms()` returns in assignment order (inc/item-ids.php), the source's `tag_date ASC`.
 *
 * @param string        $content  Rendered `core/post-terms` markup.
 * @param WP_Block|null $instance Block instance (for the `postId` context).
 */
function wp_ja_kinetic_tag_parity_tag_list( string $content, $instance ): string {
	$post_id = (int) ( $instance instanceof WP_Block && isset( $instance->context['postId'] ) ? $instance->context['postId'] : get_the_ID() );
	$terms   = get_the_terms( $post_id, 'post_tag' );
	if ( ! is_array( $terms ) || array() === $terms ) {
		return $content;
	}
	$items = '';
	foreach ( array_values( $terms ) as $index => $term ) {
		$link = get_term_link( $term );
		if ( is_wp_error( $link ) ) {
			continue;
		}
		$source_id = (int) get_term_meta( $term->term_id, WP_JA_KINETIC_SOURCE_TAG_ID_META, true );
		$items    .= sprintf(
			"<li class=\"list-inline-item tag-%d tag-list%d\" itemprop=\"keywords\">\n<a href=\"%s\" class=\"badge badge-info\">\n%s\n</a>\n</li>\n",
			$source_id > 0 ? $source_id : $term->term_id,
			$index,
			esc_url( $link ),
			esc_html( $term->name )
		);
	}
	return "<ul class=\"tags list-inline\">\n" . $items . '</ul>';
}

/**
 * The one `render_block` entry point for every map above. Gated the same way as the chrome assets
 * (`wp_ja_kinetic_enqueue_assets`): the design surfaces (fixture/artifact) render a design system's
 * own markup, not this theme's, and parity with the Joomla source is a front-end-only concern there.
 *
 * @param string        $content  Block HTML.
 * @param array         $block    Parsed block, incl. `attrs.className`.
 * @param WP_Block|null $instance Block instance.
 * @return string
 */
function wp_ja_kinetic_tag_parity_render_block( string $content, array $block, $instance = null ): string {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return $content;
	}
	$block_name = (string) ( $block['blockName'] ?? '' );
	if ( 'core/paragraph' === $block_name
		&& in_array( (string) ( $block['attrs']['metadata']['name'] ?? '' ), WP_JA_KINETIC_TAG_PARITY_BREADCRUMB_LEAF, true )
		&& 1 === preg_match( '/^\s*<p\b[^>]*>(.*)<\/p>\s*$/s', $content, $leaf )
	) {
		return trim( $leaf[1] );
	}
	$check_class = WP_JA_KINETIC_TAG_PARITY_CHECK_ITEM_BY_NAME[ preg_replace( '/\.\d+$/', '', (string) ( $block['attrs']['metadata']['name'] ?? '' ) ) ] ?? '';
	if ( 'core/list-item' === $block_name && '' !== $check_class
		&& 1 === preg_match( '/^\s*<li\b([^>]*)>(.*)<\/li>\s*$/s', $content, $item )
		&& ! str_contains( $item[2], '<svg' )
	) {
		$attrs = preg_match( '/\sclass="/', $item[1] )
			? (string) preg_replace( '/\sclass="/', ' class="' . $check_class . ' ', $item[1], 1 )
			: ' class="' . $check_class . '"' . $item[1];
		return '<li' . $attrs . '>' . WP_JA_KINETIC_TAG_PARITY_CHECK_SVG . '<span>' . trim( $item[2] ) . '</span></li>';
	}
	$class_name = (string) ( $block['attrs']['className'] ?? '' );
	if ( '' === trim( $class_name ) ) {
		return $content;
	}
	$sig = wp_ja_kinetic_tag_parity_signature( $class_name );

	if ( 'hx-eyebrow' === $sig ) {
		$desired = wp_ja_kinetic_tag_parity_eyebrow_tag( $block );
		return null === $desired ? $content : wp_ja_kinetic_tag_parity_rename_root( $content, $desired );
	}
	if ( isset( WP_JA_KINETIC_TAG_PARITY_BUTTON[ $sig ] ) ) {
		return wp_ja_kinetic_tag_parity_unwrap_button( $content, WP_JA_KINETIC_TAG_PARITY_BUTTON[ $sig ] );
	}
	if ( isset( WP_JA_KINETIC_TAG_PARITY_FIGURE_IMG[ $sig ] ) ) {
		return wp_ja_kinetic_tag_parity_unwrap_figure_img( $content, WP_JA_KINETIC_TAG_PARITY_FIGURE_IMG[ $sig ] );
	}
	if ( 'core/image' === $block_name
		&& in_array( (string) ( $block['attrs']['metadata']['name'] ?? '' ), WP_JA_KINETIC_TAG_PARITY_FIGURE_IMG_BY_NAME, true )
	) {
		return wp_ja_kinetic_tag_parity_unwrap_figure_img( $content, trim( $class_name ) );
	}
	if ( 'core/table' === $block_name && isset( WP_JA_KINETIC_TAG_PARITY_TABLE_SPLIT[ $sig ] ) ) {
		list( $wrap_classes, $table_classes ) = WP_JA_KINETIC_TAG_PARITY_TABLE_SPLIT[ $sig ];
		return wp_ja_kinetic_tag_parity_split_table( $content, $wrap_classes, $table_classes );
	}
	if ( isset( WP_JA_KINETIC_TAG_PARITY_ROW_LINK[ $sig ] ) ) {
		return wp_ja_kinetic_tag_parity_row_to_link( $content, WP_JA_KINETIC_TAG_PARITY_ROW_LINK[ $sig ] );
	}
	if ( WP_JA_KINETIC_TAG_PARITY_TERM_DESC_COLLAPSE_SIG === $sig ) {
		return wp_ja_kinetic_tag_parity_collapse_inner_p( $content );
	}
	if ( WP_JA_KINETIC_TAG_PARITY_TAG_BREADCRUMB_SIG === $sig ) {
		return wp_ja_kinetic_tag_parity_tag_breadcrumb( $content );
	}
	if ( 'core/post-terms' === $block_name ) {
		if ( isset( WP_JA_KINETIC_TAG_PARITY_TERM_LINK[ $sig ] ) ) {
			return wp_ja_kinetic_tag_parity_term_link( $content, WP_JA_KINETIC_TAG_PARITY_TERM_LINK[ $sig ] );
		}
		if ( isset( WP_JA_KINETIC_TAG_PARITY_TERM_TEXT[ $sig ] ) ) {
			return wp_ja_kinetic_tag_parity_term_link( $content, WP_JA_KINETIC_TAG_PARITY_TERM_TEXT[ $sig ], true );
		}
		if ( 'tags' === $sig && 'post_tag' === ( $block['attrs']['term'] ?? '' ) ) {
			return wp_ja_kinetic_tag_parity_tag_list( $content, $instance );
		}
	}
	if ( WP_JA_KINETIC_TAG_PARITY_ROW_DATE_SIG === $sig ) {
		return wp_ja_kinetic_tag_parity_rename_root( wp_ja_kinetic_tag_parity_collapse_inner_p( $content, 'time' ), 'span' );
	}
	if ( WP_JA_KINETIC_TAG_PARITY_EXCERPT_COLLAPSE_SIG === $sig ) {
		return wp_ja_kinetic_tag_parity_collapse_inner_p( wp_ja_kinetic_tag_parity_rename_root( $content, 'p' ) );
	}
	if ( isset( WP_JA_KINETIC_TAG_PARITY_RENAME[ $sig ] ) ) {
		return wp_ja_kinetic_tag_parity_rename_root( $content, WP_JA_KINETIC_TAG_PARITY_RENAME[ $sig ] );
	}
	return $content;
}
add_filter( 'render_block', 'wp_ja_kinetic_tag_parity_render_block', 20, 3 );
