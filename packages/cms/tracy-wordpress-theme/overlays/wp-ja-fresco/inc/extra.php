<?php
/**
 * wp-ja-fresco — what this target adds on top of the source theme: the JA Fresco stylesheet and its
 * web fonts, the colour-scheme wiring (one look, D-01), the header drawer and the Book Table dialog,
 * the motion the source runs (the Owl carousels, as the motion library's carousel), the seeded
 * redirects, the source's addresses of its articles, search and profile, the related posts, no
 * guessed or attachment addresses, and the 404 page's own words. Loaded by the generic hook at the end of functions.php.
 *
 * Functions here carry the `wp_ja_fresco_` prefix; the shared `tracy_*` helpers of functions.php
 * are already defined when this file runs.
 *
 * @package wp-ja-fresco
 */

defined( 'ABSPATH' ) || exit;

// The identity tokens the pages, parts and patterns carry, and their filling.
require_once __DIR__ . '/identity.php';

/**
 * The motion the source runs, as the motion library's settings (the default of the `tracy_motion`
 * option; a site owner who saves `{"effects":[]}` turns it off). JA Fresco runs no scroll reveal:
 * the home pages' pictures carry `data-aos`, but no page loads AOS or WOW, so nothing moves. It runs
 * Owl carousels that step when asked (the testimonials and the text slider).
 */
function wp_ja_fresco_default_motion(): string {
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
add_filter( 'default_option_tracy_motion', 'wp_ja_fresco_default_motion' );

/** The assets; the design pages (fixture, artifact) render a design system's own stylesheet. */
function wp_ja_fresco_enqueue_assets(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	$version = wp_get_theme()->get( 'Version' );
	wp_enqueue_style( 'wp-ja-fresco', get_theme_file_uri( 'assets/css/wp-ja-fresco.css' ), array( 'tracy', 'tracy-layout', 'tracy-sections' ), $version );
	// Page-group sheets (assets/css/groups/*.css): one file per group of pages, loaded after the shared sheet.
	foreach ( (array) glob( get_theme_file_path( 'assets/css/groups/*.css' ) ) as $group_css ) {
		wp_enqueue_style( 'wp-ja-fresco-' . basename( $group_css, '.css' ), get_theme_file_uri( 'assets/css/groups/' . basename( $group_css ) ), array( 'wp-ja-fresco' ), $version );
	}
	// In the head, blocking, on purpose: it resolves the theme before the first paint, so a
	// visitor who chose dark never sees a light frame.
	wp_enqueue_script( 'wp-ja-fresco-dark', get_theme_file_uri( 'assets/js/wp-ja-fresco-dark.js' ), array(), $version, array( 'in_footer' => false ) );
	wp_enqueue_script( 'wp-ja-fresco', get_theme_file_uri( 'assets/js/wp-ja-fresco.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	wp_localize_script(
		'wp-ja-fresco',
		'wpJaFresco',
		array(
			'openMenu'  => __( 'Open the menu', 'wp-ja-fresco' ),
			'closeMenu' => __( 'Close the menu', 'wp-ja-fresco' ),
			'dark'      => __( 'Switch to dark mode', 'wp-ja-fresco' ),
			'light'     => __( 'Switch to light mode', 'wp-ja-fresco' ),
			'closeDialog' => __( 'Close', 'wp-ja-fresco' ),
		)
	);
	wp_add_inline_script(
		'tracy-motion',
		'window.TracyMotion&&(window.TracyMotion.labels=' . wp_json_encode(
			array(
				'previous' => __( 'Previous slide', 'wp-ja-fresco' ),
				'next'     => __( 'Next slide', 'wp-ja-fresco' ),
				'slide'    => __( 'Go to slide', 'wp-ja-fresco' ),
			)
		) . ');',
		'before'
	);
}
add_action( 'wp_enqueue_scripts', 'wp_ja_fresco_enqueue_assets', 11 );

/**
 * `?theme=dark|light` decides by its FIRST value (assets/js/wp-ja-fresco-dark.js). WordPress's canonical
 * redirect rebuilds the query from a parsed copy in which a repeated key keeps its LAST value, so
 * `?theme=dark&theme=light` would be sent to `?theme=light` before any script runs. Cancelled only when normalising the repeated key changes the
 * first value; any other redirect (host, scheme, port, path, fragment, other parameters) is left alone.
 *
 * @param string|false $redirect_url  The address WordPress wants to send the visitor to.
 * @param string       $requested_url The address that was asked for.
 * @return string|false
 */
function wp_ja_fresco_keep_first_theme_value( $redirect_url, $requested_url ) {
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
add_filter( 'redirect_canonical', 'wp_ja_fresco_keep_first_theme_value', 20, 2 );

/** The body font, preloaded: every paragraph, link and button is set in it. */
function wp_ja_fresco_preload_font(): void {
	printf(
		'<link rel="preload" href="%s" as="font" type="font/woff2" crossorigin>' . "\n",
		esc_url( get_theme_file_uri( 'assets/fonts/roboto-latin.woff2' ) )
	);
}
add_action( 'wp_head', 'wp_ja_fresco_preload_font', 2 );

/** The pattern category the overlay's patterns file under. */
function wp_ja_fresco_register(): void {
	register_block_pattern_category( 'wp-ja-fresco', array( 'label' => __( 'WP Fresco', 'wp-ja-fresco' ) ) );
	add_post_type_support( 'page', 'excerpt' );
}
add_action( 'init', 'wp_ja_fresco_register' );

/** The stylesheet in the editor too, so sections look the same there. */
function wp_ja_fresco_editor_styles(): void {
	add_editor_style( 'assets/css/wp-ja-fresco.css' );
}
add_action( 'after_setup_theme', 'wp_ja_fresco_editor_styles', 11 );

/** Pages the source draws with its "home" layout; the front page is one too. */
const JF_HOME_LAYOUT_PAGES = array( 'home-2', 'home-3', 'about', 'gallery', 'chiefs', 'menu', 'offer' );

/**
 * The header is one bar, as the source's is: nav `top-left` and hero `split` restated after the
 * source theme's filter so a catalogue archetype never floats the header (gotcha #7, #12). A page
 * also carries `jf-route-<slug>` and `jf-parent-<slug>`, so the stylesheet can tell apart pages
 * that hold the same blocks. Pages the source draws with its "home" layout carry `jf-layout-home`.
 *
 * @param string[] $classes The body classes, with the source theme's already added.
 * @return string[]
 */
function wp_ja_fresco_body_class( array $classes ): array {
	$navs      = array_map( static fn( string $nav ): string => 'tracy-nav-' . $nav, TRACY_NAVS );
	$heros     = array_map( static fn( string $hero ): string => 'tracy-hero-' . $hero, TRACY_HEROS );
	$classes   = array_values( array_diff( $classes, $navs, $heros ) );
	$classes[] = 'tracy-nav-top-left';
	$classes[] = 'tracy-hero-split';
	if ( is_front_page() ) {
		$classes[] = 'jf-layout-home';
	}
	if ( is_page() ) {
		$page      = get_queried_object_id();
		$slug      = (string) get_post_field( 'post_name', $page );
		$classes[] = 'jf-route-' . sanitize_html_class( $slug );
		if ( in_array( $slug, JF_HOME_LAYOUT_PAGES, true ) && ! in_array( 'jf-layout-home', $classes, true ) ) {
			$classes[] = 'jf-layout-home';
		}
		$parent    = (int) wp_get_post_parent_id( $page );
		if ( $parent ) {
			$classes[] = 'jf-parent-' . sanitize_html_class( (string) get_post_field( 'post_name', $parent ) );
		}
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_fresco_body_class', 11 );

/**
 * No guessed redirects: on a 404 WordPress looks for a post whose slug starts like the path. The
 * source answers an unknown path with 404, and every route this site keeps is a real page or a
 * seeded redirect below.
 */
add_filter( 'do_redirect_guess_404_permalink', '__return_false' );

/**
 * No attachment pages. With /%postname%/ a path whose last segment equals an image's slug may resolve
 * to that attachment (a demo picture that shares its name with a page or a post). The source has no address for a picture, so such a path is a 404 like any unknown one.
 */
function wp_ja_fresco_no_attachment_pages(): void {
	if ( is_admin() || ! is_attachment() ) {
		return;
	}
	global $wp_query, $post;
	$wp_query->set_404();
	$wp_query->set( 'wp_ja_fresco_attachment_404', 1 );
	$wp_query->posts      = array();
	$wp_query->post_count = 0;
	$wp_query->post       = null;
	$post                 = null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- the 404 has no post.
	status_header( 404 );
	nocache_headers();
}
add_action( 'template_redirect', 'wp_ja_fresco_no_attachment_pages', 1 );

/**
 * No canonical redirect for an attachment path turned into a 404 above.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_fresco_attachment_404_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_fresco_attachment_404' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_fresco_attachment_404_no_canonical' );

/**
 * Redirects the seeder recorded in the `wp_ja_fresco_redirects` option. Exact path match only,
 * query string carried over, and never for a request WordPress already resolved: a stale rule must
 * not shadow a page the owner later creates at that path.
 */
function wp_ja_fresco_redirects(): void {
	if ( is_admin() || ! is_404() || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$rules = get_option( 'wp_ja_fresco_redirects' );
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
add_action( 'template_redirect', 'wp_ja_fresco_redirects' );

/**
 * The 404 page's own words: the seeder keeps a draft `page-not-found` and records it in
 * `wp_ja_fresco_404_page`; the template's group named `404.body` renders that page's content.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_fresco_404_body( string $content, array $block ): string {
	if ( ! is_404() || '404.body' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	$page = get_post( (int) get_option( 'wp_ja_fresco_404_page' ) );
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
add_filter( 'render_block_core/group', 'wp_ja_fresco_404_body', 10, 2 );

/**
 * The search page at the source's address. The source's search (com_finder) lives at
 * /pages/j-pages/smart-search; the seeder keeps that route's page as a
 * draft (patterns.map.json `views.search.servedAtPath`) and this answers the path with the theme's
 * search view: `s` (WordPress's form) or `q` (the source's) is the term, and an empty term shows
 * the form and no results, as com_finder does.
 */
const WP_JA_FRESCO_SEARCH_PATHS = array( 'pages/j-pages/smart-search' );

/**
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_fresco_search_request( array $vars ): array {
	$path = (string) ( $vars['pagename'] ?? '' );
	if ( is_admin() || '' === $path || ! in_array( $path, WP_JA_FRESCO_SEARCH_PATHS, true ) ) {
		return $vars;
	}
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a read-only search term.
	$term = isset( $_GET['s'] ) ? wp_unslash( $_GET['s'] ) : ( isset( $_GET['q'] ) ? wp_unslash( $_GET['q'] ) : '' );
	// phpcs:enable
	$term = sanitize_text_field( (string) $term );
	$out  = array(
		's'                   => $term,
		'wp_ja_fresco_search' => 1,
	);
	if ( '' === $term ) {
		$out['post__in'] = array( 0 );
	}
	return $out;
}
add_filter( 'request', 'wp_ja_fresco_search_request' );

/**
 * A menu link to the search page. The seeder keeps that page as a draft (the theme answers its
 * address, above), and WordPress leaves a link to an unpublished page out of the menu; the link is
 * drawn here as the plain link it is (the block's own render is empty for it).
 *
 * @param string $content      The block's render.
 * @param array  $parsed_block The parsed block.
 * @return string
 */
function wp_ja_fresco_search_menu_link( string $content, array $parsed_block ): string {
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
		get_query_var( 'wp_ja_fresco_search' ) ? ' current-menu-item' : '',
		esc_url( home_url( '/' . WP_JA_FRESCO_SEARCH_PATHS[0] . '/' ) ),
		esc_html( (string) ( $block['attrs']['label'] ?? '' ) )
	);
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_fresco_search_menu_link', 10, 2 );

/**
 * The menu link to the page being shown is the current one, whatever kind the link is: the source
 * marks the active item of every menu by its address, and WordPress does it only for links to a
 * published post or term (a link to the article route or to the draft search page is not one).
 *
 * @param string $content The block's render.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_fresco_current_menu_link( string $content, array $block ): string {
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
add_filter( 'render_block_core/navigation-link', 'wp_ja_fresco_current_menu_link', 20, 2 );

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_fresco_query_var( array $vars ): array {
	$vars[] = 'wp_ja_fresco_search';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_fresco_query_var' );

/** The request above is a search, even with an empty term (WordPress calls that the home page). */
function wp_ja_fresco_search_flags( WP_Query $query ): void {
	if ( $query->is_main_query() && $query->get( 'wp_ja_fresco_search' ) ) {
		$query->is_search = true;
		$query->is_home   = false;
		$query->is_404    = false;
	}
}
add_action( 'parse_query', 'wp_ja_fresco_search_flags' );

/**
 * No canonical redirect for the search path: WordPress would send it to `/?s=`.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_fresco_search_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_fresco_search' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_fresco_search_no_canonical' );

/**
 * The core Search block marks its input `required`; the source's search input is not, and an empty
 * search just shows the form.
 *
 * @param string $content The rendered search block.
 * @return string
 */
function wp_ja_fresco_search_action( string $content ): string {
	return (string) preg_replace( '/(<input\b[^>]*?)\s+required(?:="[^"]*")?(?=[\s\/>])/', '$1', $content );
}
add_filter( 'render_block_core/search', 'wp_ja_fresco_search_action', 10, 1 );

/**
 * The search view's masthead. The source draws the smart-search menu item's masthead (its title,
 * description and picture); here that is the draft page at the search path, so the masthead blocks
 * of `templates/search.html` read that page: its title and excerpt through the block context, its
 * featured image through the global post the Cover block reads.
 *
 * @return WP_Post|null
 */
function wp_ja_fresco_search_page(): ?WP_Post {
	$page = get_page_by_path( WP_JA_FRESCO_SEARCH_PATHS[0] );
	return $page instanceof WP_Post ? $page : null;
}

/**
 * @param array $context The block context.
 * @param array $parsed  The parsed block.
 * @return array
 */
function wp_ja_fresco_search_masthead_context( array $context, array $parsed ): array {
	$name = (string) ( $parsed['attrs']['metadata']['name'] ?? '' );
	if ( ! is_search() || ! in_array( $name, array( 'page.masthead', 'page.title', 'page.description' ), true ) ) {
		return $context;
	}
	$page = wp_ja_fresco_search_page();
	if ( $page ) {
		$context['postId']   = $page->ID;
		$context['postType'] = 'page';
	}
	return $context;
}
add_filter( 'render_block_context', 'wp_ja_fresco_search_masthead_context', 10, 2 );

/**
 * @param string|null $pre    A pre-rendered block, or null.
 * @param array       $parsed The parsed block.
 * @return string|null
 */
function wp_ja_fresco_search_masthead_post( $pre, array $parsed ) {
	if ( null !== $pre || ! is_search() || 'page.masthead' !== ( $parsed['attrs']['metadata']['name'] ?? '' ) ) {
		return $pre;
	}
	$page = wp_ja_fresco_search_page();
	if ( ! $page ) {
		return $pre;
	}
	global $post;
	$saved = $post;
	$post  = $page; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- restored below.
	remove_filter( 'pre_render_block', 'wp_ja_fresco_search_masthead_post', 10 );
	$html = render_block( $parsed );
	add_filter( 'pre_render_block', 'wp_ja_fresco_search_masthead_post', 10, 2 );
	$post = $saved; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
	return $html;
}
add_filter( 'pre_render_block', 'wp_ja_fresco_search_masthead_post', 10, 2 );

/**
 * The picture behind an article's title. The source paints the article's full-text image
 * (Joomla `image_fulltext`) behind the blend masthead; here that image is the first block of the post,
 * an image with the class `jf-fulltext-image` (editable like any block). The single template's
 * masthead group (`single.masthead`) takes it as its background, and the body does not repeat it.
 * Without one, the post's featured image stands in. The article-heading page masthead (`page.article-masthead`)
 * is drawn the same way.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_fresco_article_masthead( string $content, array $block ): string {
	if ( ! in_array( $block['attrs']['metadata']['name'] ?? '', array( 'single.masthead', 'page.article-masthead' ), true ) || ! is_singular() ) {
		return $content;
	}
	$post = get_post();
	$url  = '';
	if ( $post instanceof WP_Post ) {
		foreach ( parse_blocks( $post->post_content ) as $inner ) {
			if ( 'core/image' === $inner['blockName'] && false !== strpos( (string) ( $inner['attrs']['className'] ?? '' ), 'jf-fulltext-image' ) ) {
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
add_filter( 'render_block_core/group', 'wp_ja_fresco_article_masthead', 10, 2 );

/**
 * The full-text image is drawn by the masthead on the article's own page, so the body leaves it out
 * there; everywhere else (the editor, a feed) it stays an ordinary image.
 *
 * @param string $content The rendered image.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_fresco_fulltext_image( string $content, array $block ): string {
	if ( is_admin() || ! is_singular() || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jf-fulltext-image' ) ) {
		return $content;
	}
	return '';
}
add_filter( 'render_block_core/image', 'wp_ja_fresco_fulltext_image', 10, 2 );

/**
 * The masthead heading: the seeder keeps a page's source heading in `tracy_page_heading` when it
 * differs from the menu word; the title block named `page.title` prints it.
 *
 * @param string $content The rendered post title block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_fresco_page_heading( string $content, array $block ): string {
	// The article masthead's title (a link to the article) prints the article's own title.
	if ( 'page.title' !== ( $block['attrs']['metadata']['name'] ?? '' ) || ! is_page() || ! empty( $block['attrs']['isLink'] ) ) {
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
add_filter( 'render_block_core/post-title', 'wp_ja_fresco_page_heading', 10, 2 );

/**
 * An article the source opens at a menu address (/pages/j-content/blog-detail opens article 3,
 * `--article-posts`): the seeder files it as a post and records a rule from that address to the
 * post's permalink. The source answers the address itself, so the theme serves the post there
 * (200, the post's own template) instead of redirecting; the rule stays for any other reader.
 *
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_fresco_article_route_request( array $vars ): array {
	// The request path itself: WordPress drops its page rule when no page has the path and may fall
	// through to the attachment rule (a two-segment path matches it under /%postname%/).
	$request = isset( $GLOBALS['wp'] ) ? (string) $GLOBALS['wp']->request : '';
	if ( is_admin() || '' === $request || ! empty( $vars['wp_ja_fresco_search'] ) ) {
		return $vars;
	}
	$path  = '/' . trim( $request, '/' );
	$rules = get_option( 'wp_ja_fresco_redirects' );
	if ( is_string( $rules ) ) {
		$rules = json_decode( $rules, true );
	}
	if ( ! is_array( $rules ) || get_page_by_path( ltrim( $path, '/' ) ) ) {
		return $vars;
	}
	foreach ( $rules as $rule ) {
		if ( untrailingslashit( (string) ( $rule['from'] ?? '' ) ) !== $path ) {
			continue;
		}
		$slug = trim( (string) wp_parse_url( (string) ( $rule['to'] ?? '' ), PHP_URL_PATH ), '/' );
		$post = '' !== $slug && false === strpos( $slug, '/' ) ? get_page_by_path( $slug, OBJECT, 'post' ) : null;
		if ( $post instanceof WP_Post && 'publish' === $post->post_status ) {
			return array(
				'p'                        => $post->ID,
				'wp_ja_fresco_article_route' => 1,
			);
		}
	}
	return $vars;
}
add_filter( 'request', 'wp_ja_fresco_article_route_request', 11 );

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_fresco_article_route_var( array $vars ): array {
	$vars[] = 'wp_ja_fresco_article_route';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_fresco_article_route_var' );

/**
 * No canonical redirect away from the source's address of an article.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_fresco_article_route_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_fresco_article_route' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_fresco_article_route_no_canonical' );

/**
 * The "Related Posts" list under an article is the source's mod_related_items: the articles that
 * share the current one's keywords, the article itself left out. Here the keywords are the post's
 * tags (the source's meta keywords equal its tags on every article, D-04). A query block that names
 * `jfRelated: true` lists, on a single post, the other posts carrying any of its tags, newest first,
 * ties (one publish time) in article order, a sticky post not put first.
 *
 * @param array    $query The WP_Query arguments the block built.
 * @param WP_Block $block The post template block.
 * @return array
 */
function wp_ja_fresco_query_vars( array $query, WP_Block $block ): array {
	$ctx = $block->context['query'] ?? array();
	if ( empty( $ctx['jfRelated'] ) ) {
		return $query;
	}
	$post = is_singular( 'post' ) ? get_queried_object() : null;
	$tags = $post instanceof WP_Post ? wp_get_post_tags( $post->ID, array( 'fields' => 'ids' ) ) : array();
	if ( ! $tags ) {
		$query['post__in'] = array( 0 );
		return $query;
	}
	$query['tag__in']             = array_map( 'intval', $tags );
	$query['post__not_in']        = array( $post->ID );
	$query['ignore_sticky_posts'] = true;
	$query['orderby']             = array(
		'date' => 'DESC',
		'ID'   => 'ASC',
	);
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_fresco_query_vars', 10, 2 );

/**
 * A post at the source's address: the source opens an article of a category blog under the blog's
 * own path (/pages/j-content/category-blog/<alias>). A path whose parent is a published page listing
 * a category (a post query in its blocks names it) and whose last segment is a post of that
 * category is answered with the post, 200, at that address.
 *
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_fresco_listing_post_request( array $vars ): array {
	// The matched path, not `pagename`: with /%postname%/ a deeper path may be taken by the attachment
	// rule first, so `pagename` is not set for it.
	global $wp;
	$path = isset( $wp->request ) ? trim( (string) $wp->request, '/' ) : '';
	if ( is_admin() || '' === $path || isset( $vars['rest_route'] ) || false === strpos( $path, '/' ) ) {
		return $vars;
	}
	if ( get_page_by_path( $path ) instanceof WP_Post ) {
		return $vars;
	}
	$slug   = basename( $path );
	$parent = get_page_by_path( dirname( $path ) );
	if ( ! $parent instanceof WP_Post || 'publish' !== $parent->post_status ) {
		return $vars;
	}
	$categories = wp_ja_fresco_listing_categories( parse_blocks( $parent->post_content ) );
	if ( ! $categories ) {
		return $vars;
	}
	$posts = get_posts(
		array(
			'name'        => sanitize_title( $slug ),
			'post_type'   => 'post',
			'post_status' => 'publish',
			'numberposts' => 1,
			'fields'      => 'ids',
		)
	);
	// Membership is checked here, not with `category__in`: WP_Query drops the tax query of a query by
	// `name` (a singular query).
	if ( ! $posts || ! array_intersect( $categories, wp_get_post_categories( (int) $posts[0] ) ) ) {
		return $vars;
	}
	return array(
		'name'                      => sanitize_title( $slug ),
		'wp_ja_fresco_listing_post' => 1,
	);
}
add_filter( 'request', 'wp_ja_fresco_listing_post_request' );

/**
 * The categories a listing page shows: those named by the post queries in its blocks
 * (`taxQuery.category`, what the seeder writes and the editor sets). A page without such a query is
 * not a listing and names none.
 *
 * @param array $blocks Parsed blocks.
 * @return int[]
 */
function wp_ja_fresco_listing_categories( array $blocks ): array {
	$ids = array();
	foreach ( $blocks as $block ) {
		$query = $block['attrs']['query'] ?? null;
		if ( 'core/query' === ( $block['blockName'] ?? '' ) && is_array( $query ) && 'post' === ( $query['postType'] ?? 'post' ) ) {
			foreach ( (array) ( $query['taxQuery']['category'] ?? array() ) as $id ) {
				$ids[] = (int) $id;
			}
		}
		if ( ! empty( $block['innerBlocks'] ) ) {
			$ids = array_merge( $ids, wp_ja_fresco_listing_categories( $block['innerBlocks'] ) );
		}
	}
	return array_values( array_unique( array_filter( $ids ) ) );
}

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_fresco_listing_post_var( array $vars ): array {
	$vars[] = 'wp_ja_fresco_listing_post';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_fresco_listing_post_var' );

/**
 * No canonical redirect away from the source's address of a post.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_fresco_listing_post_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_fresco_listing_post' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_fresco_listing_post_no_canonical' );

/**
 * The profile page is a signed-in page: the source answers a guest there with 303 to its login form
 * (com_users profile, measured on /pages/users/profile).
 */
const WP_JA_FRESCO_ACCOUNT_PATHS = array( 'profile' );

/** A guest on an account page is sent to the login form page, as the source does. */
function wp_ja_fresco_account_redirect(): void {
	if ( is_user_logged_in() || ! is_page() ) {
		return;
	}
	$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	if ( ! in_array( $slug, WP_JA_FRESCO_ACCOUNT_PATHS, true ) ) {
		return;
	}
	$login = get_page_by_path( 'pages/users/login-form' );
	$to    = ( $login && 'publish' === $login->post_status ) ? get_permalink( $login ) : wp_login_url();
	wp_safe_redirect( $to, 303 );
	exit;
}
add_action( 'template_redirect', 'wp_ja_fresco_account_redirect', 5 );

// Page-group code (inc/groups/*.php): one file per group of pages, so groups never edit the same file.
foreach ( (array) glob( __DIR__ . '/groups/*.php' ) as $wp_ja_fresco_group_file ) {
	require_once $wp_ja_fresco_group_file;
}

/**
 * One `h1` per page. The visually hidden page title (`jf-page-title`) is the page's only `h1` unless
 * the page's own content carries one (the home pages' hero heading, as on the source): then the
 * hidden title is printed as a paragraph, and the masthead title (`page.title`) as an h2, so the page
 * keeps the single heading the content draws.
 *
 * @param string $content The rendered post title block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_fresco_single_h1( string $content, array $block ): string {
	$hidden = false !== strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jf-page-title' );
	if ( ! is_singular() || ( ! $hidden && 'page.title' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) ) {
		return $content;
	}
	if ( false === strpos( (string) get_post_field( 'post_content', get_queried_object_id() ), '<h1' ) ) {
		return $content;
	}
	// The masthead title steps down to the source's h2 (Typography's own content opens with an h1).
	$tag = $hidden ? 'p' : 'h2';
	return (string) preg_replace( '/^(\s*)<h1\b([^>]*)>(.*)<\/h1>(\s*)$/s', '$1<' . $tag . '$2>$3</' . $tag . '>$4', $content );
}
add_filter( 'render_block_core/post-title', 'wp_ja_fresco_single_h1', 11, 2 );

/**
 * The back-to-top button every page carries (the source's `#back-to-top`: a 50 px square in the
 * corner, fixed 2rem from the right and 1rem from the bottom).
 */
add_action(
	'wp_footer',
	static function () {
		echo '<div class="back-to-top"><button type="button" class="btn btn-primary" title="' . esc_attr__( 'Back to Top', 'wp-ja-fresco' ) . '" aria-label="' . esc_attr__( 'Back to Top', 'wp-ja-fresco' ) . '"><span aria-hidden="true"></span></button></div>';
	}
);

/**
 * A social link names itself with a visually hidden label next to its icon. Narrow-screen probes count that 1 px box as a second
 * line of the 30 px control, and the source's link carries its name as `title`. The label becomes the anchor's own `aria-label`
 * and `title`, and the span goes: same accessible name, one box.
 *
 * @param string $content The rendered social link.
 * @return string
 */
add_filter(
	'render_block_core/social-link',
	static function ( string $content ): string {
		if ( ! preg_match( '#<span class="wp-block-social-link-label[^"]*">(.*?)</span>#s', $content, $m ) ) {
			return $content;
		}
		$name = trim( wp_strip_all_tags( $m[1] ) );
		if ( '' === $name ) {
			return $content;
		}
		$content = str_replace( $m[0], '', $content );
		return preg_replace( '#<a ([^>]*class="wp-block-social-link-anchor")#', '<a aria-label="' . esc_attr( $name ) . '" title="' . esc_attr( $name ) . '" $1', $content, 1 ) ?? $content;
	}
);

/**
 * The sliding line of titles: the source writes an ampersand after every title as part of the
 * module layout, not the title. It is printed here as real text so an editor keeps typing the
 * title alone and readers (and assistive tech) get the same words the source shows.
 *
 * @param string $content The rendered heading.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_fresco_text_slider_amp( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'text-slider-title' ) ) {
		return $content;
	}
	return (string) preg_replace( '#</h3>\s*$#', ' <span class="text-slider-amp">&amp;</span></h3>', $content, 1 );
}
add_filter( 'render_block_core/heading', 'wp_ja_fresco_text_slider_amp', 10, 2 );

/*
 * The source prints its words as typed: straight quotes and apostrophes ("We'd", "Frank's"). WordPress's
 * texturizer would turn them into curly ones on every page, so it is switched off for this theme.
 */
add_filter( 'run_wptexturize', '__return_false' );
