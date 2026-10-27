<?php
/**
 * wp-ja-kinetic — the source's per-page CSS overlays (`css/page-<Itemid>.css`) are keyed on T4's
 * own `body.item-<Itemid>` class, one per Joomla menu item. WordPress has no such class, so those
 * ported rules (kept in the ported CSS under the exact same `body.item-<Itemid> …` selectors) never
 * match unless something adds it. This file does: a `body_class` filter that emits `item-<Itemid>`
 * on the page a given menu item maps to, so the ported per-page rules apply in shipped code, not
 * only when a test forces the class by hand.
 *
 * The map is keyed on path/slug — the thing the seeder (step 7) will give a page or a term, not on
 * a stand-specific numeric post ID, which would break the moment content is seeded onto different
 * WordPress IDs. Source: `step2/spec/page-map.json` `pages[].path` cross-referenced with
 * `pages[].source.menuId`, one row read per entry.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

/**
 * The source has no distinct "page" content type — every one of these standalone Pages
 * (features/integrations/changelog/faq/pricing/about/team/kineticql/privacy/terms) is a plain
 * Joomla article (`com_content`, `view=article`) reached through its own menu item, same as a
 * blog post — `step2/spec/page-map.json` records this as `source.view: "article"` on each. They
 * render through `templates/page-article.html` (the same frame as `templates/single.html`, see
 * that file's own header comment) and so need a category term the way a Post does — a WordPress
 * Page carries neither `category` nor `post_tag` by default (verified: `wp_postmeta`/
 * `wp_term_relationships` carry nothing for these pages on a fresh stand). The step-7 seeding
 * contract for these ten pages (template assignment + which taxonomy terms to write) is recorded
 * in `posts.contract.json` → `contentPages`.
 */
function wp_ja_kinetic_register_page_taxonomies(): void {
	register_taxonomy_for_object_type( 'category', 'page' );
	register_taxonomy_for_object_type( 'post_tag', 'page' );
}
add_action( 'init', 'wp_ja_kinetic_register_page_taxonomies' );

/**
 * WP page path (as `get_page_uri()` returns it: parent/child slugs joined by `/`, no leading or
 * trailing slash — independent of the permalink structure, so this works whether the site runs
 * pretty permalinks or the stand's plain ones) → the source's menu item id. Front page, category
 * archives and search are matched separately below (a page path does not apply to any of them).
 */
const WP_JA_KINETIC_PAGE_ITEM_IDS = array(
	'product/features'       => 218,
	'product/integrations'   => 219,
	'product/changelog'      => 220,
	'product/faq'            => 222,
	'pricing'                => 223,
	'company/about'          => 225,
	'company/team'           => 226,
	'company/contact'        => 227,
	'pages/landing'          => 229,
	'pages/kineticql'        => 230,
	'pages/helixql'          => 230, // the address before the rename; redirected
	'pages/tags'             => 231,
	'pages/login'            => 233,
	'pages/register'         => 234,
	'pages/profile'          => 235,
	'pages/reset'            => 236,
	'pages/remind'           => 237,
	'product/all-categories' => 250,
	// The Article Archive is a Page since D-33 (template `page-archive`), not a WordPress date
	// archive, so `is_date()` below does not reach it; its Itemid is the date-archive one.
	'product/article-archive' => 251,
	'product/authors'        => 252,
	'privacy-policy'         => 269,
	'terms-of-service'       => 270,
);

/**
 * Category archive term slug → the source's menu item id, for the two content categories the page
 * map carries (`product/blog` → Itemid 221, `pages/engineering` → Itemid 253). Keyed on the term
 * slug rather than the map's page-shaped path, because a WP category archive is matched by
 * `is_category()` + the queried term, not by a page path — and the slug survives either permalink
 * structure.
 */
const WP_JA_KINETIC_CATEGORY_ITEM_IDS = array(
	'field-notes-from-the-on-call' => 221,
	'engineering'                   => 253,
);

/** The source's one search view (`/pages/search`, `com_finder`) is a single fixed menu item. */
const WP_JA_KINETIC_SEARCH_ITEM_ID = 232;

/** The source's one front-page view (`/`, `home-menu/home`) is a single fixed menu item. */
const WP_JA_KINETIC_FRONT_PAGE_ITEM_ID = 214;

/**
 * The source's one date-archive view (`/product/article-archive`, `com_content` view `archive`) —
 * a single fixed menu item, the same way search and the front page are: `is_date()` covers any
 * WordPress date archive, and the page map carries exactly one date-archive Itemid.
 */
const WP_JA_KINETIC_DATE_ARCHIVE_ITEM_ID = 251;

/**
 * The source's one BOUND single-author view (`/pages/author`, Itemid 254) — the page map pins it to
 * one specific Joomla contact (`source.id: 551`), so `is_author()` maps to it unconditionally
 * rather than per queried user: the map carries no second author to disambiguate against, and no
 * per-user Joomla-to-WordPress identity mapping exists to key one.
 *
 * `/product/authors` (Itemid 252, page map `source.id: null`) is `view: author` too, but with no
 * bound author — that reads as a Joomla "authors index/directory" rather than a single-author
 * archive, and WordPress has no native archive type for a directory of authors. It is a real Page
 * instead (`WP_JA_KINETIC_PAGE_ITEM_IDS['product/authors']` below), the same way
 * `/product/all-categories` — also an unbound listing, page map `view: page` — already is, backed
 * by the `authors-directory` dynamic block on the `page-authors` template.
 */
const WP_JA_KINETIC_AUTHOR_ITEM_ID = 254;

/**
 * The source's single-tag view (`com_tags`, `view=tag`) routes through one fixed menu item
 * regardless of which tag is requested (`/pages/tags` is Itemid 231 too — the all-tags INDEX
 * and the single-tag view share it, `templates/ja_kinetic/css/page-231.css` §6 scopes the
 * single-tag rules further under `.com-tags-tag`). `is_tag()` covers any WordPress tag
 * archive the same way `is_date()` covers any date archive above.
 */
const WP_JA_KINETIC_TAG_ITEM_ID = 231;

/**
 * The current request's source menu item id, or null off the map — an unmapped view (the single
 * post view, 404) gets no `item-<id>` class, same as the source's own template carries no
 * `css/page-<Itemid>.css` for those either.
 *
 * @return int|null
 */
function wp_ja_kinetic_current_item_id(): ?int {
	if ( is_front_page() ) {
		return WP_JA_KINETIC_FRONT_PAGE_ITEM_ID;
	}
	if ( is_search() ) {
		return WP_JA_KINETIC_SEARCH_ITEM_ID;
	}
	if ( is_date() ) {
		return WP_JA_KINETIC_DATE_ARCHIVE_ITEM_ID;
	}
	if ( is_author() ) {
		return WP_JA_KINETIC_AUTHOR_ITEM_ID;
	}
	if ( is_tag() ) {
		return WP_JA_KINETIC_TAG_ITEM_ID;
	}
	if ( is_category() ) {
		$term = get_queried_object();
		if ( ! ( $term instanceof WP_Term ) ) {
			return null;
		}
		if ( isset( WP_JA_KINETIC_CATEGORY_ITEM_IDS[ $term->slug ] ) ) {
			return WP_JA_KINETIC_CATEGORY_ITEM_IDS[ $term->slug ];
		}
		/*
		 * Every OTHER child category under "Field notes from the on-call" (incident-retros,
		 * product, tutorials, practice, culture) stays under that section's own item on the
		 * source too — this site has one blog, and Joomla resolves the "active" menu for a
		 * category with no menu of its own to the nearest ancestor's. "engineering" is the one
		 * child WITH its own dedicated menu item (253, matched above), so it never reaches this
		 * branch. Verified: C-37, audit-260922-2205-ja-kinetic-r3-chrome-report.md.
		 */
		$on_call = get_term_by( 'slug', 'field-notes-from-the-on-call', 'category' );
		if ( $on_call instanceof WP_Term && cat_is_ancestor_of( $on_call, $term ) ) {
			return WP_JA_KINETIC_CATEGORY_ITEM_IDS['field-notes-from-the-on-call'];
		}
		// Any other category (Legal, reached from the privacy and terms breadcrumbs, or one the
		// owner adds) is drawn in the blog's frame too, as a single post is below: with no item
		// class its topic row and featured card lost the blog sheet and fell apart.
		return WP_JA_KINETIC_CATEGORY_ITEM_IDS['field-notes-from-the-on-call'];
	}
	if ( is_singular( 'post' ) ) {
		/*
		 * Every single article resolves to the blog's own item the same way, regardless of its
		 * own category — this site has exactly one blog section, so Joomla's "active" menu for
		 * any article stays on Itemid 221. Verified: C-37 (the three measured singles carry three
		 * different WordPress-side categories and all three still need item-221).
		 */
		return WP_JA_KINETIC_CATEGORY_ITEM_IDS['field-notes-from-the-on-call'];
	}
	if ( is_page() ) {
		$post = get_queried_object();
		$path = $post instanceof WP_Post ? trim( get_page_uri( $post ), '/' ) : '';
		return WP_JA_KINETIC_PAGE_ITEM_IDS[ $path ] ?? null;
	}
	return null;
}

/**
 * Emit `item-<Itemid>` on `<body>` for a mapped view, format byte-for-byte the same as T4's own
 * class, so the ported `body.item-<Itemid> …` rules in the section stylesheet apply unchanged.
 *
 * @param string[] $classes Body classes.
 * @return string[]
 */
function wp_ja_kinetic_item_body_class( array $classes ): array {
	$item_id = wp_ja_kinetic_current_item_id();
	if ( null !== $item_id ) {
		$classes[] = "item-{$item_id}";
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_kinetic_item_body_class' );

/**
 * The source's byline can show a per-article `created_by_alias` INSTEAD of the real author's
 * name (`article/default.php`; measured live, single 76's byline reads "Tracy Agent" though the
 * real Joomla user differs). WordPress has no such field; this theme reads it from a post meta
 * key it defines, `wp_ja_kinetic_article_author_alias` — a post with none set falls through to
 * the WordPress user's own `display_name`, unchanged. Scoped to the CURRENT POST being rendered
 * (via `get_the_ID()`), not the user, so it applies correctly inside a loop (a listing row and
 * the single view of the same post both show the right name). Covers both API paths this theme's
 * blocks use: `get_the_author()` (`wp-ja-kinetic/author-initials`, filter `the_author`) and
 * `get_the_author_meta( 'display_name', … )` (core `post-author-name`, filter
 * `get_the_author_display_name`). Step 7 must write this key from the source's per-article
 * `created_by_alias` wherever the source has one — recorded in `posts.contract.json` → `authors`.
 *
 * @param string $value Author name as resolved so far.
 * @return string
 */
function wp_ja_kinetic_author_alias_override( string $value ): string {
	$post_id = get_the_ID();
	if ( ! $post_id ) {
		return $value;
	}
	$alias = trim( (string) get_post_meta( $post_id, 'wp_ja_kinetic_article_author_alias', true ) );
	return ( '' !== $alias ) ? $alias : $value;
}
add_filter( 'the_author', 'wp_ja_kinetic_author_alias_override' );
add_filter( 'get_the_author_display_name', 'wp_ja_kinetic_author_alias_override' );

/**
 * The byline name of ONE named post, independent of the global post. The two filters above read the
 * alias of whatever post is current in the loop; a block that renders a post it fetched itself (the
 * featured card of a category archive, a category card row) runs outside that loop, where the
 * "current" post is another one, so it asks for the name here: the post's own alias meta, else the
 * author's `display_name` read straight off the user row (never through the alias filters).
 *
 * @param int|WP_Post $post Post the byline belongs to.
 * @return string Empty when the post or its author does not exist.
 */
function wp_ja_kinetic_post_author_name( $post ): string {
	$post = get_post( $post );
	if ( ! $post instanceof WP_Post ) {
		return '';
	}
	$alias = trim( (string) get_post_meta( $post->ID, 'wp_ja_kinetic_article_author_alias', true ) );
	if ( '' !== $alias ) {
		return $alias;
	}
	$user = get_userdata( (int) $post->post_author );
	return $user instanceof WP_User ? (string) $user->display_name : '';
}

/**
 * An author archive's heading names the queried user. `get_the_archive_title()` reads it through
 * `get_the_author()`, where the first listed post is still current, so the alias above put that
 * post's byline (e.g. "Marco Vidal") over the whole archive of another user.
 *
 * @param string $title Archive title.
 * @return string
 */
function wp_ja_kinetic_author_archive_title( string $title ): string {
	$user = is_author() ? get_queried_object() : null;
	return $user instanceof WP_User ? esc_html( $user->display_name ) : $title;
}
add_filter( 'get_the_archive_title', 'wp_ja_kinetic_author_archive_title' );

/*
 * The source never "smart-quotes" its content — Joomla ships no curly-quote/typographic-dash
 * transform on this site (measured across every ACM section and every article: straight `'`/`"`
 * throughout). WordPress's `wptexturize` runs on `the_title`/`the_content`/`the_excerpt` by
 * default and turns those into curly quotes — verified live 2026-09-22: this default is the sole
 * cause of every apostrophe/quote-glyph row measured this audit round (e.g. L-02 here, and
 * SA-14/SA-15/SB-22 in the section audits — same root cause, one fix). Removing it from
 * `the_title`/`the_content`/`the_excerpt` is not enough: `get_the_block_template_html()`
 * (`wp-includes/block-template.php`) runs `wptexturize()` once more on the whole assembled page,
 * outside any per-field hook (measured 2026-09-23: single-post bodies still came out curly).
 * `run_wptexturize` is core's own switch for every `wptexturize()` call site.
 */
add_filter( 'run_wptexturize', '__return_false' );

/**
 * The `.tags` row (`wp:post-terms {"term":"post_tag"}` in `templates/single.html` /
 * `page-article.html`) reads terms through `get_the_terms()`, which — unlike
 * `blocks/related-posts/render.php`'s own explicit `wp_get_object_terms(…, ['orderby' =>
 * 'term_order'])` — always returns `post_tag` terms alphabetically; it never consults the
 * `sort` support `inc/extra.php`'s `wp_ja_kinetic_sort_post_tags()` opts the taxonomy into. The
 * source's order is ASSIGNMENT order (`tag_date ASC`; posts.contract.json → tags.assignmentOrder
 * documents the same rule for the related-posts eyebrow), not alphabetical — re-sort by the same
 * `term_order` column here so the visible tag list matches too (L-11).
 *
 * @param WP_Term[]|WP_Error $terms    Terms as resolved so far.
 * @param int                $post_id  Post ID.
 * @param string             $taxonomy Taxonomy name.
 * @return WP_Term[]|WP_Error
 */
function wp_ja_kinetic_order_tags_by_assignment( $terms, int $post_id, string $taxonomy ) {
	if ( 'post_tag' !== $taxonomy || ! is_array( $terms ) || count( $terms ) < 2 ) {
		return $terms;
	}
	$ordered = wp_get_object_terms( $post_id, 'post_tag', array( 'orderby' => 'term_order' ) );
	return is_wp_error( $ordered ) ? $terms : $ordered;
}
add_filter( 'get_the_terms', 'wp_ja_kinetic_order_tags_by_assignment', 10, 3 );

/**
 * The article masthead sub-title (`wp:post-excerpt {"className":"hx-article__sub"}` in
 * `templates/single.html` / `page-article.html`) is the source's stored `metadesc`, printed only
 * when set (`article/default.php`: `if (!empty($this->item->metadesc))`) — never derived from the
 * body. `core/post-excerpt` falls back to an auto-excerpt cut from `post_content` when
 * `post_excerpt` is empty (`get_the_excerpt()` → `wp_trim_excerpt()`), which printed the first
 * section's copy as a sub-title on every shell page (`/product/features`, `/faq`, …: no `metadesc`
 * on the source, so no `p.hx-article__sub`). Render nothing unless an excerpt is stored.
 *
 * @param string   $content  Rendered block.
 * @param array    $block    Parsed block.
 * @param WP_Block $instance Block instance (carries `postId` context).
 * @return string
 */
function wp_ja_kinetic_article_sub_stored_only( string $content, array $block, WP_Block $instance ): string {
	if ( ! str_contains( (string) ( $block['attrs']['className'] ?? '' ), 'hx-article__sub' ) ) {
		return $content;
	}
	wp_ja_kinetic_in_article_sub( false );
	$post_id = (int) ( $instance->context['postId'] ?? get_the_ID() );
	if ( $post_id && metadata_exists( 'post', $post_id, 'wp_ja_kinetic_metadesc' ) ) {
		$sub = trim( (string) get_post_meta( $post_id, 'wp_ja_kinetic_metadesc', true ) );
	} else {
		$sub = $post_id && has_excerpt( $post_id ) ? (string) get_post_field( 'post_excerpt', $post_id ) : '';
	}
	// Many articles use their opening paragraph as the description too; the sub-title then repeated
	// the first line of the text right under it (the source now skips it the same way,
	// `html/com_content/article/default.php` `$hxSub`).
	$flat   = static fn( string $html ): string => trim( (string) preg_replace( '/\s+/u', ' ', html_entity_decode( wp_strip_all_tags( $html ), ENT_QUOTES, 'UTF-8' ) ) );
	$needle = rtrim( $flat( $sub ), ' .…' );
	if ( '' === $needle || 0 === mb_strpos( $flat( (string) get_post_field( 'post_content', $post_id ) ), $needle ) ) {
		return '';
	}
	return $content;
}
add_filter( 'render_block_core/post-excerpt', 'wp_ja_kinetic_article_sub_stored_only', 10, 3 );

/**
 * A post's `post_excerpt` is its listing text — the source's `introtext`, which every blog,
 * category and author row prints (posts.contract.json → listingExcerpts) — while the article's own
 * sub-title is the source's `metadesc` (`article/default.php:147-148`). The two differ on most
 * articles, so a post carries the second in `wp_ja_kinetic_metadesc` (written by the run's
 * post-seed step) and the sub-title reads it from there while that one block renders. A page
 * without the key keeps its stored excerpt, which already is its `metadesc`.
 *
 * @param bool|null $set True while the sub-title renders, false after; null to read.
 * @return bool
 */
function wp_ja_kinetic_in_article_sub( ?bool $set = null ): bool {
	static $in = false;
	if ( null !== $set ) {
		$in = $set;
	}
	return $in;
}

/**
 * Marks the start of the article sub-title's render.
 *
 * @param string|null $pre   Short-circuit markup, passed through.
 * @param array       $block The parsed block.
 * @return string|null
 */
function wp_ja_kinetic_article_sub_begin( $pre, array $block ) {
	if ( 'core/post-excerpt' === ( $block['blockName'] ?? '' ) && str_contains( (string) ( $block['attrs']['className'] ?? '' ), 'hx-article__sub' ) ) {
		wp_ja_kinetic_in_article_sub( true );
	}
	return $pre;
}
add_filter( 'pre_render_block', 'wp_ja_kinetic_article_sub_begin', 10, 2 );

/**
 * The sub-title's text: the stored `metadesc` where the post carries one.
 *
 * @param string  $excerpt The excerpt as resolved so far.
 * @param WP_Post $post    The post.
 * @return string
 */
function wp_ja_kinetic_article_sub_metadesc( string $excerpt, $post ): string {
	if ( ! wp_ja_kinetic_in_article_sub() || ! $post instanceof WP_Post || ! metadata_exists( 'post', $post->ID, 'wp_ja_kinetic_metadesc' ) ) {
		return $excerpt;
	}
	return (string) get_post_meta( $post->ID, 'wp_ja_kinetic_metadesc', true );
}
add_filter( 'get_the_excerpt', 'wp_ja_kinetic_article_sub_metadesc', 5, 2 );
