<?php
/**
 * wp-ja-impact — what this target adds on top of the source theme: the JA Impact stylesheet and its
 * web fonts, the dark mode switch, the header drawer, the motion the source runs (the Owl
 * carousels, as the motion library's carousel), the seeded redirects, no guessed or attachment
 * addresses, the search page at the source's address and the 404 page's own words. Loaded by the generic hook at the end of functions.php.
 *
 * Functions here carry the `wp_ja_impact_` prefix; the shared `tracy_*` helpers of functions.php
 * are already defined when this file runs.
 *
 * @package wp-ja-impact
 */

defined( 'ABSPATH' ) || exit;

/**
 * The motion the source runs, as the motion library's settings (the default of the `tracy_motion`
 * option; a site owner who saves `{"effects":[]}` turns it off). The motion library the source runs
 * is Owl Carousel (the hero, the features style-3 cards), which steps when asked.
 */
function wp_ja_impact_default_motion(): string {
	return (string) wp_json_encode(
		array(
			'effects' => array(
				array(
					'id' => 'carousel-step',
					'v'  => 2,
				),
			),
		)
	);
}
add_filter( 'default_option_tracy_motion', 'wp_ja_impact_default_motion' );

/** The assets; the design pages (fixture, artifact) render a design system's own stylesheet. */
function wp_ja_impact_enqueue_assets(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	$version = wp_get_theme()->get( 'Version' );
	wp_enqueue_style( 'wp-ja-impact', get_theme_file_uri( 'assets/css/wp-ja-impact.css' ), array( 'tracy', 'tracy-layout', 'tracy-sections' ), $version );
	// Page-group sheets (assets/css/groups/*.css): one file per group of pages, loaded after the shared sheet.
	foreach ( (array) glob( get_theme_file_path( 'assets/css/groups/*.css' ) ) as $group_css ) {
		wp_enqueue_style( 'wp-ja-impact-' . basename( $group_css, '.css' ), get_theme_file_uri( 'assets/css/groups/' . basename( $group_css ) ), array( 'wp-ja-impact' ), $version );
	}
	// In the head, blocking, on purpose: it resolves the theme before the first paint, so a
	// visitor who chose dark never sees a light frame.
	wp_enqueue_script( 'wp-ja-impact-dark', get_theme_file_uri( 'assets/js/wp-ja-impact-dark.js' ), array(), $version, array( 'in_footer' => false ) );
	wp_enqueue_script( 'wp-ja-impact', get_theme_file_uri( 'assets/js/wp-ja-impact.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	// Page-group scripts (assets/js/groups/*.js): one file per group of pages, after the shared script.
	foreach ( (array) glob( get_theme_file_path( 'assets/js/groups/*.js' ) ) as $group_js ) {
		wp_enqueue_script( 'wp-ja-impact-' . basename( $group_js, '.js' ), get_theme_file_uri( 'assets/js/groups/' . basename( $group_js ) ), array( 'wp-ja-impact' ), $version, array( 'strategy' => 'defer' ) );
	}
	wp_localize_script(
		'wp-ja-impact',
		'wpJaImpact',
		array(
			'openMenu'  => __( 'Open the menu', 'wp-ja-impact' ),
			'closeMenu' => __( 'Close the menu', 'wp-ja-impact' ),
			'dark'      => __( 'Switch to dark mode', 'wp-ja-impact' ),
			'light'     => __( 'Switch to light mode', 'wp-ja-impact' ),
		)
	);
	wp_add_inline_script(
		'tracy-motion',
		'window.TracyMotion&&(window.TracyMotion.labels=' . wp_json_encode(
			array(
				'previous' => __( 'Previous slide', 'wp-ja-impact' ),
				'next'     => __( 'Next slide', 'wp-ja-impact' ),
				'slide'    => __( 'Go to slide', 'wp-ja-impact' ),
			)
		) . ');',
		'before'
	);
}
add_action( 'wp_enqueue_scripts', 'wp_ja_impact_enqueue_assets', 11 );

/** The body font, preloaded: every heading and paragraph is set in it. */
function wp_ja_impact_preload_font(): void {
	printf(
		'<link rel="preload" href="%s" as="font" type="font/woff2" crossorigin>' . "\n",
		esc_url( get_theme_file_uri( 'assets/fonts/readex-pro-latin.woff2' ) )
	);
}
add_action( 'wp_head', 'wp_ja_impact_preload_font', 2 );

/** The pattern category the overlay's patterns file under. */
function wp_ja_impact_register(): void {
	register_block_pattern_category( 'wp-ja-impact', array( 'label' => __( 'WP Impact', 'wp-ja-impact' ) ) );
	add_post_type_support( 'page', 'excerpt' );
}
add_action( 'init', 'wp_ja_impact_register' );

/** The stylesheet in the editor too, so sections look the same there. */
function wp_ja_impact_editor_styles(): void {
	add_editor_style( 'assets/css/wp-ja-impact.css' );
}
add_action( 'after_setup_theme', 'wp_ja_impact_editor_styles', 11 );

/**
 * The header is one bar, as the source's is: nav `top-left` and hero `split` restated after the
 * source theme's filter so a catalogue archetype never floats the header (gotcha #7, #12). A page
 * also carries `jim-route-<slug>` and `jim-parent-<slug>`, so the stylesheet can tell apart pages
 * that hold the same blocks.
 *
 * @param string[] $classes The body classes, with the source theme's already added.
 * @return string[]
 */
function wp_ja_impact_body_class( array $classes ): array {
	$navs      = array_map( static fn( string $nav ): string => 'tracy-nav-' . $nav, TRACY_NAVS );
	$heros     = array_map( static fn( string $hero ): string => 'tracy-hero-' . $hero, TRACY_HEROS );
	$classes   = array_values( array_diff( $classes, $navs, $heros ) );
	$classes[] = 'tracy-nav-top-left';
	$classes[] = 'tracy-hero-split';
	if ( is_page() ) {
		$page      = get_queried_object_id();
		$classes[] = 'jim-route-' . sanitize_html_class( (string) get_post_field( 'post_name', $page ) );
		$parent    = (int) wp_get_post_parent_id( $page );
		if ( $parent ) {
			$classes[] = 'jim-parent-' . sanitize_html_class( (string) get_post_field( 'post_name', $parent ) );
		}
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_impact_body_class', 11 );

/**
 * No guessed redirects: on a 404 WordPress looks for a post whose slug starts like the path. The
 * source answers an unknown path with 404, and every route this site keeps is a real page or a
 * seeded redirect below.
 */
add_filter( 'do_redirect_guess_404_permalink', '__return_false' );

/**
 * No attachment pages. With /%postname%/ a top-level path equal to an image's slug resolves to that
 * attachment (the demo pictures `about-us.jpg` and `services-page.jpg` share their names with two
 * pages). The source has no address for a picture, so such a path is a 404 like any unknown one.
 */
function wp_ja_impact_no_attachment_pages(): void {
	if ( is_admin() || ! is_attachment() ) {
		return;
	}
	global $wp_query, $post;
	$wp_query->set_404();
	$wp_query->set( 'wp_ja_impact_attachment_404', 1 );
	$wp_query->posts      = array();
	$wp_query->post_count = 0;
	$wp_query->post       = null;
	$post                 = null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- the 404 has no post.
	status_header( 404 );
	nocache_headers();
}
add_action( 'template_redirect', 'wp_ja_impact_no_attachment_pages', 1 );

/**
 * No canonical redirect for an attachment path turned into a 404 above.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_impact_attachment_404_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_impact_attachment_404' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_impact_attachment_404_no_canonical' );

/**
 * Redirects the seeder recorded in the `wp_ja_impact_redirects` option. Exact path match only,
 * query string carried over, and never for a request WordPress already resolved: a stale rule must
 * not shadow a page the owner later creates at that path.
 */
function wp_ja_impact_redirects(): void {
	if ( is_admin() || ! is_404() || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$rules = get_option( 'wp_ja_impact_redirects' );
	if ( is_string( $rules ) ) {
		$rules = json_decode( $rules, true );
	}
	if ( ! is_array( $rules ) ) {
		return;
	}
	$uri   = wp_unslash( $_SERVER['REQUEST_URI'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- compared, not printed.
	$path  = untrailingslashit( (string) wp_parse_url( $uri, PHP_URL_PATH ) );
	$query = (string) wp_parse_url( $uri, PHP_URL_QUERY );
	foreach ( $rules as $rule ) {
		$from = isset( $rule['from'] ) ? untrailingslashit( (string) $rule['from'] ) : '';
		if ( '' === $from || $from !== $path || empty( $rule['to'] ) ) {
			continue;
		}
		$to = home_url( trailingslashit( (string) $rule['to'] ) );
		if ( '' !== $query ) {
			$to .= '?' . $query;
		}
		wp_safe_redirect( $to, (int) ( $rule['status'] ?? 301 ) );
		exit;
	}
}
add_action( 'template_redirect', 'wp_ja_impact_redirects' );

/**
 * The 404 page's own words: the seeder keeps a draft `page-not-found` and records it in
 * `wp_ja_impact_404_page`; the template's group named `404.body` renders that page's content.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_404_body( string $content, array $block ): string {
	if ( ! is_404() || '404.body' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	$page = get_post( (int) get_option( 'wp_ja_impact_404_page' ) );
	if ( ! $page instanceof WP_Post || '' === trim( $page->post_content ) ) {
		return $content;
	}
	$inner = (string) apply_filters( 'the_content', $page->post_content );
	return (string) preg_replace_callback(
		'/^(\s*<div\b[^>]*>)(.*)(<\/div>\s*)$/s',
		static fn( array $m ): string => $m[1] . $inner . $m[3],
		$content
	);
}
add_filter( 'render_block_core/group', 'wp_ja_impact_404_body', 10, 2 );

/**
 * The search page at the source's address. The source's search (com_finder) lives at
 * /pages/j-page/smart-search and its header form posts there; the seeder keeps that route's page as a
 * draft (patterns.map.json `views.search.servedAtPath`) and this answers the path with the theme's
 * search view: `s` (WordPress's form) or `q` (the source's) is the term, and an empty term shows
 * the form and no results, as com_finder does.
 */
const WP_JA_IMPACT_SEARCH_PATHS = array( 'pages/j-page/smart-search', 'smart-search' );

/**
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_impact_search_request( array $vars ): array {
	$path = (string) ( $vars['pagename'] ?? '' );
	if ( is_admin() || '' === $path || ! in_array( $path, WP_JA_IMPACT_SEARCH_PATHS, true ) ) {
		return $vars;
	}
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a read-only search term.
	$term = isset( $_GET['s'] ) ? wp_unslash( $_GET['s'] ) : ( isset( $_GET['q'] ) ? wp_unslash( $_GET['q'] ) : '' );
	// phpcs:enable
	$term = sanitize_text_field( (string) $term );
	$out  = array(
		's'                   => $term,
		'wp_ja_impact_search' => 1,
	);
	if ( '' === $term ) {
		$out['post__in'] = array( 0 );
	}
	return $out;
}
add_filter( 'request', 'wp_ja_impact_search_request' );

/**
 * A menu link to the search page. The seeder keeps that page as a draft (the theme answers its
 * address, above), and WordPress leaves a link to an unpublished page out of the menu; the link is
 * drawn here as the plain link it is (the block's own render is empty for it).
 *
 * @param string $content      The block's render.
 * @param array  $parsed_block The parsed block.
 * @return string
 */
function wp_ja_impact_search_menu_link( string $content, array $parsed_block ): string {
	$block = $parsed_block;
	if ( '' !== $content || 'post-type' !== ( $block['attrs']['kind'] ?? '' ) ) {
		return $content;
	}
	$page = get_post( (int) ( $block['attrs']['id'] ?? 0 ) );
	if ( ! $page instanceof WP_Post || 'draft' !== $page->post_status || 'smart-search' !== $page->post_name ) {
		return $content;
	}
	return sprintf(
		'<li class="wp-block-navigation-item wp-block-navigation-link%s"><a class="wp-block-navigation-item__content" href="%s"><span class="wp-block-navigation-item__label">%s</span></a></li>',
		wp_ja_impact_ga_is_search_view() ? ' current-menu-item' : '',
		esc_url( home_url( '/' . WP_JA_IMPACT_SEARCH_PATHS[0] . '/' ) ),
		esc_html( (string) ( $block['attrs']['label'] ?? '' ) )
	);
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_impact_search_menu_link', 10, 2 );

/**
 * The menu link to the page being shown is the current one, whatever kind the link is: the source
 * marks the active item of every menu by its address, and WordPress does it only for links to a
 * published post or term (a link to the article route or to the draft search page is not one).
 *
 * @param string $content The block's render.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_current_menu_link( string $content, array $block ): string {
	$url = (string) ( $block['attrs']['url'] ?? '' );
	if ( '' === $content || '' === $url || str_contains( $content, 'current-menu-item' ) ) {
		return $content;
	}
	$path = static fn( string $u ): string => trim( (string) wp_parse_url( $u, PHP_URL_PATH ), '/' );
	// phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- read only, compared, never output.
	$request = trim( (string) wp_parse_url( (string) ( $_SERVER['REQUEST_URI'] ?? '' ), PHP_URL_PATH ), '/' );
	if ( '' === $path( $url ) || $path( $url ) !== $request ) {
		return $content;
	}
	$content = (string) preg_replace( '/^(<li class="[^"]*)"/', '$1 current-menu-item"', $content, 1 );
	return (string) preg_replace( '/<a /', '<a aria-current="page" ', $content, 1 );
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_impact_current_menu_link', 20, 2 );

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_impact_query_var( array $vars ): array {
	$vars[] = 'wp_ja_impact_search';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_impact_query_var' );

/** The request above is a search, even with an empty term (WordPress calls that the home page). */
function wp_ja_impact_search_flags( WP_Query $query ): void {
	if ( $query->is_main_query() && $query->get( 'wp_ja_impact_search' ) ) {
		$query->is_search = true;
		$query->is_home   = false;
		$query->is_404    = false;
	}
}
add_action( 'parse_query', 'wp_ja_impact_search_flags' );

/**
 * No canonical redirect for the search path: WordPress would send it to `/?s=`.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_impact_search_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_impact_search' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_impact_search_no_canonical' );

/**
 * The header search posts to the source's address, so a search lands on the same page as there.
 *
 * @param string $content The rendered search block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_search_action( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'head-search' ) ) {
		return $content;
	}
	return (string) preg_replace( '/(<form\b[^>]*\baction=")[^"]*(")/', '${1}' . esc_url( home_url( '/pages/j-page/smart-search/' ) ) . '${2}', $content, 1 );
}
add_filter( 'render_block_core/search', 'wp_ja_impact_search_action', 10, 2 );

/**
 * The picture behind an article's title. The source paints the article's full-text image
 * (Joomla `image_fulltext`) behind the masthead; here that image is the first block of the post,
 * an image with the class `jim-fulltext-image` (editable like any block). The single template's
 * masthead group (`single.masthead`) takes it as its background, and the body does not repeat it.
 * Without one, the post's featured image stands in.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_article_masthead( string $content, array $block ): string {
	if ( 'single.masthead' !== ( $block['attrs']['metadata']['name'] ?? '' ) || ! is_singular() ) {
		return $content;
	}
	$post = get_post();
	$url  = '';
	if ( $post instanceof WP_Post ) {
		foreach ( parse_blocks( $post->post_content ) as $inner ) {
			if ( 'core/image' === $inner['blockName'] && false !== strpos( (string) ( $inner['attrs']['className'] ?? '' ), 'jim-fulltext-image' ) ) {
				$id  = (int) ( $inner['attrs']['id'] ?? 0 );
				$url = $id ? (string) wp_get_attachment_image_url( $id, 'full' ) : '';
				if ( '' === $url && preg_match( '/<img[^>]+src="([^"]+)"/', (string) $inner['innerHTML'], $m ) ) {
					$url = $m[1];
				}
				break;
			}
		}
		if ( '' === $url ) {
			$url = (string) get_the_post_thumbnail_url( $post, 'full' );
		}
	}
	if ( '' === $url ) {
		return $content;
	}
	return (string) preg_replace( '/^(\s*<div\b)/', '$1 style="background-image:url(' . esc_url( $url ) . ')"', $content, 1 );
}
add_filter( 'render_block_core/group', 'wp_ja_impact_article_masthead', 10, 2 );

/**
 * The full-text image is drawn by the masthead on the article's own page, so the body leaves it out
 * there; everywhere else (the editor, a feed) it stays an ordinary image.
 *
 * @param string $content The rendered image.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_fulltext_image( string $content, array $block ): string {
	if ( is_admin() || ! is_singular() || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jim-fulltext-image' ) ) {
		return $content;
	}
	return '';
}
add_filter( 'render_block_core/image', 'wp_ja_impact_fulltext_image', 10, 2 );

/**
 * The masthead heading: the seeder keeps a page's source heading in `tracy_page_heading` when it
 * differs from the menu word; the title block named `page.title` prints it.
 *
 * @param string $content The rendered post title block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_page_heading( string $content, array $block ): string {
	if ( 'page.title' !== ( $block['attrs']['metadata']['name'] ?? '' ) || ! is_page() ) {
		return $content;
	}
	$heading = trim( (string) get_post_meta( get_queried_object_id(), 'tracy_page_heading', true ) );
	if ( '' === $heading ) {
		return $content;
	}
	$safe = esc_html( $heading );
	return (string) preg_replace_callback(
		'/^(\s*<h1\b[^>]*>).*(<\/h1>\s*)$/s',
		static fn( array $m ): string => $m[1] . $safe . $m[2],
		$content
	);
}
add_filter( 'render_block_core/post-title', 'wp_ja_impact_page_heading', 10, 2 );

// The identity tokens the pages and parts carry, and their filling.
require_once __DIR__ . '/identity.php';

// Page-group code (inc/groups/*.php): one file per group of pages, so groups never edit the same file.
foreach ( (array) glob( __DIR__ . '/groups/*.php' ) as $wp_ja_impact_group_file ) {
	require_once $wp_ja_impact_group_file;
}

/**
 * One `h1` per page. The visually hidden page title (`jim-page-title`) is the page's only `h1` unless
 * the page's own content carries one (the home pages' hero heading, as on the source): then the
 * hidden title is printed as a paragraph so the page keeps the single heading the content draws.
 *
 * @param string $content The rendered post title block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_single_h1( string $content, array $block ): string {
	if ( ! is_singular() || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jim-page-title' ) ) {
		return $content;
	}
	if ( false === strpos( (string) get_post_field( 'post_content', get_queried_object_id() ), '<h1' ) ) {
		return $content;
	}
	return (string) preg_replace( '/^(\s*)<h1\b([^>]*)>(.*)<\/h1>(\s*)$/s', '$1<p$2>$3</p>$4', $content );
}
add_filter( 'render_block_core/post-title', 'wp_ja_impact_single_h1', 11, 2 );

/**
 * Text is printed as the source prints it: no texturize. The source (Joomla) shows a straight apostrophe
 * ("Nature's Hidden Gems"); WordPress would curl it (the block template output runs wptexturize over the whole
 * page, so `the_title` alone is not enough), and a curled label is a different label to the checks that pair a
 * control with the source's (D-25).
 */
add_filter( 'run_wptexturize', '__return_false' );

/**
 * `?theme=dark|light` decides by its FIRST value (assets/js/wp-ja-impact-dark.js). WordPress's canonical
 * redirect rebuilds the query from a parsed copy in which a repeated key keeps its LAST value, so
 * `?theme=dark&theme=light` would be sent to `?theme=light` before any script runs. Cancelled only when normalising the repeated key changes the
 * first value; any other redirect (host, scheme, port, path, fragment, other parameters) is left alone.
 *
 * @param string|false $redirect_url  The address WordPress wants to send the visitor to.
 * @param string       $requested_url The address that was asked for.
 * @return string|false
 */
function wp_ja_impact_keep_first_theme_value( $redirect_url, $requested_url ) {
	if ( ! is_string( $redirect_url ) || ! is_string( $requested_url ) ) {
		return $redirect_url;
	}
	$asked  = wp_parse_url( $requested_url );
	$wanted = wp_parse_url( $redirect_url );
	if ( ! is_array( $asked ) || ! is_array( $wanted ) ) {
		return $redirect_url;
	}
	$asked_query  = isset( $asked['query'] ) ? (string) $asked['query'] : '';
	$wanted_query = isset( $wanted['query'] ) ? (string) $wanted['query'] : '';
	unset( $asked['query'], $wanted['query'] );
	// Scheme, host, port, path or fragment differ: that redirect is not about `theme`.
	if ( $asked !== $wanted ) {
		return $redirect_url;
	}
	// Split like URLSearchParams: pairs in order, cut at the first "=", key and value decoded.
	$split = static function ( $query ) {
		$theme = array();
		$other = array();
		foreach ( explode( '&', $query ) as $pair ) {
			if ( '' === $pair ) {
				continue;
			}
			$parts = explode( '=', $pair, 2 );
			if ( 'theme' === urldecode( $parts[0] ) ) {
				$theme[] = urldecode( isset( $parts[1] ) ? $parts[1] : '' );
			} else {
				$other[] = $pair;
			}
		}
		return array( $theme, $other );
	};
	list( $asked_theme, $asked_other )   = $split( $asked_query );
	list( $wanted_theme, $wanted_other ) = $split( $wanted_query );
	if ( count( $asked_theme ) < 2 || $asked_other !== $wanted_other ) {
		return $redirect_url;
	}
	$override = static function ( $values ) {
		return ( isset( $values[0] ) && in_array( $values[0], array( 'dark', 'light' ), true ) ) ? $values[0] : '';
	};
	if ( $override( $asked_theme ) === $override( $wanted_theme ) ) {
		return $redirect_url;
	}
	return false;
}
add_filter( 'redirect_canonical', 'wp_ja_impact_keep_first_theme_value', 20, 2 );

/**
 * The section a single post belongs to, by its category: the menu's Donations, Events and Blog items stay current on an
 * article inside them, as the source's menu does. A category counts for the nearest of itself or its ancestors that is
 * one of the three; a post that lands in more than one section (or in none) marks nothing rather than guess.
 *
 * @return string The slug of the top-level page of the section ('donations', 'events', 'category-blog'), or ''.
 */
function wp_ja_impact_single_section(): string {
	// An article opened at a menu address (Pages › Blog Detail) is that menu item, not a member of the Blog section: the source's menu marks the item only.
	if ( ! is_singular( 'post' ) || get_query_var( 'wp_ja_impact_article_route' ) ) {
		return '';
	}
	$sections = array(
		'donations' => 'donations',
		'events'    => 'events',
		'blog'      => 'category-blog',
	);
	$found    = array();
	foreach ( get_the_category( (int) get_queried_object_id() ) as $term ) {
		$chain = array_merge( array( (int) $term->term_id ), array_map( 'intval', get_ancestors( (int) $term->term_id, 'category' ) ) );
		foreach ( $chain as $term_id ) {
			$candidate = get_term( $term_id, 'category' );
			if ( $candidate instanceof WP_Term && isset( $sections[ $candidate->slug ] ) ) {
				$found[ $sections[ $candidate->slug ] ] = true;
				break;
			}
		}
	}
	return 1 === count( $found ) ? (string) array_key_first( $found ) : '';
}

/**
 * The menu link to the section of the single post being shown is the current one (a top-level page whose slug names the
 * section; the same page reached through the Pages menu's nested items is not).
 *
 * @param string $content The block's render.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_section_menu_link( string $content, array $block ): string {
	if ( '' === $content || str_contains( $content, 'current-menu-item' ) || 'post-type' !== ( $block['attrs']['kind'] ?? '' ) || 'page' !== ( $block['attrs']['type'] ?? '' ) ) {
		return $content;
	}
	// A menu item that points at this very post is the highlight (the source marks that item and its parents only): the section is no longer marked beside it.
	if ( wp_ja_impact_navigation_points_at_post( null ) ) {
		return $content;
	}
	$section = wp_ja_impact_single_section();
	if ( '' === $section ) {
		return $content;
	}
	$page = get_post( (int) ( $block['attrs']['id'] ?? 0 ) );
	if ( ! $page instanceof WP_Post || 0 !== (int) $page->post_parent || $section !== $page->post_name ) {
		return $content;
	}
	return (string) preg_replace( '/^(<li class="[^"]*)"/', '$1 current-menu-item"', $content, 1 );
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_impact_section_menu_link', 20, 2 );

/**
 * Whether a block list holds a link to the given post, at any depth.
 *
 * @param array $blocks  Parsed blocks.
 * @param int   $post_id The post ID.
 * @return bool
 */
function wp_ja_impact_blocks_link_to_post( array $blocks, int $post_id ): bool {
	foreach ( $blocks as $inner ) {
		$attrs = (array) ( $inner['attrs'] ?? array() );
		if ( 'post-type' === ( $attrs['kind'] ?? '' ) && 'post' === ( $attrs['type'] ?? '' ) && (int) ( $attrs['id'] ?? 0 ) === $post_id ) {
			return true;
		}
		if ( ! empty( $inner['innerBlocks'] ) && wp_ja_impact_blocks_link_to_post( (array) $inner['innerBlocks'], $post_id ) ) {
			return true;
		}
	}
	return false;
}

/**
 * Whether the navigation being rendered has an item that points at the post shown. The answer is taken from the
 * navigation's own block tree before its items render, so it does not depend on which sibling renders first.
 *
 * @param array|null $navigation The parsed navigation block to inspect, or null to read the answer of the one rendering now.
 * @return bool
 */
function wp_ja_impact_navigation_points_at_post( ?array $navigation ): bool {
	static $answer = false;
	if ( null === $navigation ) {
		return $answer;
	}
	$answer = false;
	if ( ! is_singular( 'post' ) ) {
		return false;
	}
	$post_id = (int) get_queried_object_id();
	$blocks  = (array) ( $navigation['innerBlocks'] ?? array() );
	$ref     = (int) ( $navigation['attrs']['ref'] ?? 0 );
	if ( $ref ) {
		$menu = get_post( $ref );
		if ( $menu instanceof WP_Post && 'wp_navigation' === $menu->post_type ) {
			$blocks = parse_blocks( $menu->post_content );
		}
	}
	$answer = $post_id > 0 && wp_ja_impact_blocks_link_to_post( $blocks, $post_id );
	return $answer;
}

/**
 * Reads each navigation's items before they render (see wp_ja_impact_navigation_points_at_post()).
 *
 * @param array $parsed_block The block about to render.
 * @return array
 */
function wp_ja_impact_navigation_read_items( array $parsed_block ): array {
	if ( 'core/navigation' === ( $parsed_block['blockName'] ?? '' ) ) {
		wp_ja_impact_navigation_points_at_post( $parsed_block );
	}
	return $parsed_block;
}
add_filter( 'render_block_data', 'wp_ja_impact_navigation_read_items' );

/**
 * The back-to-top button the source draws on every page (`#back-to-top`, a Font Awesome chevron in a 50 px square at the
 * bottom right). The script (assets/js/wp-ja-impact.js) shows it once the visitor has scrolled past the header, and scrolls to the top.
 */
function wp_ja_impact_back_to_top(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	printf(
		'<a href="#" id="back-to-top" class="jim-back-to-top" aria-label="%s"><span class="jim-back-to-top__mark" aria-hidden="true"></span></a>',
		esc_attr__( 'Back to top', 'wp-ja-impact' )
	);
}
add_action( 'wp_footer', 'wp_ja_impact_back_to_top', 5 );

/**
 * The SVG filter that repaints the round navy disc of the feature icons (acm-features style 3) with a worn design system's
 * accent, as the Joomla twin does: the colour matrix keeps only the deep navy pixels (blue well above red and green), the
 * flood (`.jim-disc-tint-flood`, assets/css/groups/g2.css) paints them. Only a worn system applies the filter to the icons.
 */
function wp_ja_impact_disc_tint(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	echo '<svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><filter id="jim-disc-tint" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -6 -12 12 0 -1.3" result="blue"/><feComposite in="blue" in2="SourceAlpha" operator="in" result="disc"/><feFlood class="jim-disc-tint-flood" result="flood"/><feComposite in="flood" in2="disc" operator="in" result="tint"/><feComposite in="SourceGraphic" in2="tint" operator="out" result="own"/><feMerge><feMergeNode in="own"/><feMergeNode in="tint"/></feMerge></filter></svg>';
}
add_action( 'wp_footer', 'wp_ja_impact_disc_tint', 6 );

/**
 * A search box is not `required` in the source (an empty search is sent and answered with "no results"), so the core
 * Search block's `required` attribute is dropped for every search form of the site.
 *
 * @param string $content The rendered search block.
 * @return string
 */
function wp_ja_impact_search_not_required( string $content ): string {
	return (string) preg_replace( '/(<input\b[^>]*?)\s+required(?:=("|\')[^"\']*\2)?(?=[\s>\/])/', '$1', $content );
}
add_filter( 'render_block_core/search', 'wp_ja_impact_search_not_required', 20 );

/**
 * The newsletter box of the source asks for a Name (optional) and an Email. The seeder makes the "Newsletter" Contact Form 7
 * form from one email field (D-07); while the form still carries exactly that seeded template, the Name field is put in front
 * of it. A form the site owner has edited is left alone.
 *
 * @param array $properties The form's properties.
 * @param mixed $form       The Contact Form 7 form.
 * @return array
 */
function wp_ja_impact_newsletter_name_field( array $properties, $form ): array {
	if ( ! is_object( $form ) || ! method_exists( $form, 'title' ) || 'Newsletter' !== $form->title() ) {
		return $properties;
	}
	$template = (string) ( $properties['form'] ?? '' );
	if ( false !== strpos( $template, '[text ' ) || 1 !== preg_match( '/^\s*<label class="wtb-form__field">\s*\[email\* email-1 placeholder "Email"\]\s*<\/label>/', $template ) ) {
		return $properties;
	}
	$properties['form'] = '<label class="wtb-form__field">[text your-name placeholder "Name"]</label>' . "\n\n" . ltrim( $template );
	return $properties;
}
add_filter( 'wpcf7_contact_form_properties', 'wp_ja_impact_newsletter_name_field', 10, 2 );

/**
 * The source's contact form puts "Privacy Note *" as a label on its own line above the consent box. The seeded Contact Form 7
 * template runs it into the consent sentence; while the template still carries exactly that sentence, the label is lifted out
 * in front of the box. A form the site owner has edited is left alone.
 *
 * @param array $properties The form's properties.
 * @return array
 */
function wp_ja_impact_contact_consent_label( array $properties ): array {
	$template = (string) ( $properties['form'] ?? '' );
	$lifted   = preg_replace(
		'/\[acceptance (\S+)\]\s*Privacy Note \*\s*/',
		'<span class="jim-consent__label">Privacy Note<span class="jim-consent__star" aria-hidden="true"> *</span></span>[acceptance $1] ',
		$template,
		1
	);
	if ( is_string( $lifted ) && $lifted !== $template ) {
		$properties['form'] = $lifted;
	}
	return $properties;
}
add_filter( 'wpcf7_contact_form_properties', 'wp_ja_impact_contact_consent_label', 11 );
