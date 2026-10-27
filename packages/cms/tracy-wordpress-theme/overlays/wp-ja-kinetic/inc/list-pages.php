<?php
/**
 * wp-ja-kinetic — the source's list views at the source's own addresses (D-33), and the page
 * templates the seeder does not choose. Both are keyed on page meta the run's post-seed step
 * writes (tasks/ja-kinetic-wp7/post-seed.mjs), since `scripts/seed.mjs` sets `_wp_page_template`
 * itself on every run and rewrites any other value:
 *
 * - `wp_ja_kinetic_page_template` — the template a page renders with, ahead of the seeder's own
 *   (`page-article` for the ten pages that are Joomla articles, `page-tags`, `page-categories`,
 *   `page-authors`, `page-archive`).
 * - `wp_ja_kinetic_list` — the Joomla list view a page stands for: `category:<slug>`,
 *   `author:<nicename>` or `search`. The request for that page is answered as the matching
 *   WordPress archive (or search), so the archive templates, blocks and `inc/blog-dynamic.php`
 *   hooks run unchanged while the address stays the source's (`/product/blog`, not `/category/…`).
 *   The seeder keeps holding the page (its path, its parent, its place in the menus).
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

/**
 * The per-page count of the source's paginated list views: `num_intro_articles` 6 on the blog
 * and engineering menu items (`inc/blog-dynamic.php` `wp_ja_kinetic_force_posts_per_page()`).
 * Its pager addresses a page by offset, `?start=6`, `?start=12` … (measured on the running
 * source's `/index.php/product/blog`), and a visitor's `start` is read back the same way.
 */
const WP_JA_KINETIC_LIST_PER_PAGE = 6;

/**
 * The template named by `wp_ja_kinetic_page_template` goes first in the page hierarchy — and only
 * there: `resolve_block_template()` ranks slugs with `array_flip()`, so a second copy further down
 * (`page-tags.php` is also `/pages/tags`'s own `page-{slug}`) would take its later rank and lose to the
 * seeder's template.
 *
 * @param string[] $templates Candidate template slugs, most specific first.
 * @return string[]
 */
function wp_ja_kinetic_page_template_hierarchy( array $templates ): array {
	$id   = get_queried_object_id();
	$slug = $id ? (string) get_post_meta( $id, 'wp_ja_kinetic_page_template', true ) : '';
	if ( '' === $slug ) {
		return $templates;
	}
	// A page whose text opens with its own masthead (features, pricing, about …) is a canvas page:
	// on the source the article view prints the text alone, without the article's title, byline
	// and CTA (`html/com_content/article/default.php` `$isCanvas`). The article frame around it
	// gave the page two h1 and a duplicate header, so it is drawn in the bare page-landing frame.
	if ( 'page-article' === $slug && str_contains( (string) get_post_field( 'post_content', $id ), 'acm-page-masthead' ) ) {
		$slug = 'page-landing';
	}
	// The hierarchy carries `page-tags.php`; the resolver strips the suffix before ranking.
	$others = array_filter( $templates, static fn( string $t ): bool => preg_replace( '/\.(php|html)$/', '', $t ) !== $slug );
	return array_merge( array( $slug ), array_values( $others ) );
}
add_filter( 'page_template_hierarchy', 'wp_ja_kinetic_page_template_hierarchy' );

/**
 * The list page answering the current request, or null: set by `wp_ja_kinetic_list_request()`.
 *
 * @param array|null $set The list to record (`array( 'page' => WP_Post, 'kind' => …, 'value' => … )`).
 * @return array|null
 */
function wp_ja_kinetic_current_list( ?array $set = null ): ?array {
	static $list = null;
	if ( null !== $set ) {
		$list = $set;
	}
	return $list;
}

/**
 * Answers a front-end request for a page carrying `wp_ja_kinetic_list` as the archive it stands
 * for. Runs on `request`, before the main query is built, so every conditional (`is_category()`,
 * `is_author()`, `is_search()`) and the queried object are the archive's. Only the main request
 * of such a page: never in the admin, never for a REST route, never for any other page.
 *
 * @param array $query_vars The request's query variables.
 * @return array
 */
function wp_ja_kinetic_list_request( array $query_vars ): array {
	if ( is_admin() || isset( $query_vars['rest_route'] ) || empty( $query_vars['pagename'] ) ) {
		return $query_vars;
	}
	$page = get_page_by_path( (string) $query_vars['pagename'], OBJECT, 'page' );
	if ( ! $page instanceof WP_Post ) {
		return $query_vars;
	}
	$list = (string) get_post_meta( $page->ID, 'wp_ja_kinetic_list', true );
	if ( '' === $list ) {
		return $query_vars;
	}
	list( $kind, $value ) = array_pad( explode( ':', $list, 2 ), 2, '' );
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- read-only list paging and search terms.
	$paged = isset( $query_vars['paged'] ) ? (int) $query_vars['paged'] : 0;
	if ( 'category' === $kind && isset( $_GET['start'] ) ) {
		$paged = intdiv( absint( wp_unslash( $_GET['start'] ) ), WP_JA_KINETIC_LIST_PER_PAGE ) + 1;
	}
	switch ( $kind ) {
		case 'category':
			$vars = array( 'category_name' => $value );
			break;
		case 'author':
			$vars = array( 'author_name' => $value );
			break;
		case 'search':
			// The source's own form sends `q` (com_finder); WordPress's sends `s`. Either lands here.
			$term = isset( $_GET['s'] ) ? wp_unslash( $_GET['s'] ) : ( isset( $_GET['q'] ) ? wp_unslash( $_GET['q'] ) : '' );
			$vars = array( 's' => sanitize_text_field( (string) $term ) );
			break;
		default:
			return $query_vars;
	}
	// phpcs:enable
	if ( $paged > 1 ) {
		$vars['paged'] = $paged;
	}
	wp_ja_kinetic_current_list(
		array(
			'page'  => $page,
			'kind'  => $kind,
			'value' => $value,
		)
	);
	return $vars;
}
add_filter( 'request', 'wp_ja_kinetic_list_request' );

/**
 * A list page is answered at its own address: WordPress's canonical redirect would otherwise send
 * `/product/blog/` on to the category's own link (`/category/…/`).
 *
 * @param string|false $redirect_url The address WordPress would redirect to.
 * @return string|false
 */
function wp_ja_kinetic_list_no_canonical( $redirect_url ) {
	return wp_ja_kinetic_current_list() ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_kinetic_list_no_canonical' );

/**
 * A menu link to a list page is a link to its address. The seeder keeps the search page a draft
 * (its rule for WordPress's own `/?s=`), and core's navigation link prints nothing for a link to an
 * unpublished page — yet the request hook above answers that address. So a seeded menu item
 * pointing at a list page is drawn by core as a link to the page's path (the source's footer
 * "Search", D-40). The menu's own items are rendered by the navigation block itself, not through
 * `render_block()`, so this runs on the link's rendered output.
 *
 * @param string   $content The rendered link (empty for an unpublished page).
 * @param array    $parsed  The parsed block.
 * @param WP_Block $block   The block instance.
 * @return string
 */
function wp_ja_kinetic_list_page_link( string $content, array $parsed, $block = null ): string {
	$attrs = $parsed['attrs'] ?? array();
	if ( '' !== $content || 'post-type' !== ( $attrs['kind'] ?? '' ) || empty( $attrs['id'] ) || ! function_exists( 'render_block_core_navigation_link' ) ) {
		return $content;
	}
	$id = (int) $attrs['id'];
	if ( 'publish' === get_post_status( $id ) || '' === (string) get_post_meta( $id, 'wp_ja_kinetic_list', true ) ) {
		return $content;
	}
	$attrs['kind'] = 'custom';
	$attrs['url']  = home_url( '/' . get_page_uri( $id ) . '/' );
	unset( $attrs['id'] );
	return (string) render_block_core_navigation_link( $attrs, '', $block );
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_kinetic_list_page_link', 10, 3 );

/**
 * The address of page `$page` of the list being viewed, as the source's pager writes it: the
 * page itself for page 1, `?start=<offset>` after it, `#` for the page being shown. Any other
 * paginated view keeps WordPress's own `get_pagenum_link()`.
 *
 * @param int $page    Target page number.
 * @param int $current The page being shown.
 * @return string
 */
function wp_ja_kinetic_pagenum_link( int $page, int $current ): string {
	$list = wp_ja_kinetic_current_list();
	if ( ! $list || 'category' !== $list['kind'] ) {
		return get_pagenum_link( $page );
	}
	if ( $page === $current ) {
		return '#';
	}
	$base = get_permalink( $list['page'] );
	return $page <= 1 ? $base : add_query_arg( 'start', ( $page - 1 ) * WP_JA_KINETIC_LIST_PER_PAGE, $base );
}

/**
 * The Article Archive list (templates/page-archive.html) reads the posts the seeder tags
 * `archived` — Joomla's state-2 articles. A missing tag is no posts, as on the source.
 *
 * @param array    $query The Query Loop's query variables.
 * @param WP_Block $block The post-template block, whose context carries the query attributes.
 * @return array
 */
function wp_ja_kinetic_archived_query( array $query, WP_Block $block ): array {
	if ( empty( $block->context['query']['wpJaKineticArchived'] ) ) {
		return $query;
	}
	$query['tag'] = 'archived';
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_kinetic_archived_query', 10, 2 );
