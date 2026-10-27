<?php
/**
 * wp-ja-morgan — what this target adds on top of the source theme: the JA Morgan stylesheet and its
 * web fonts, the dark mode switch, the header drawer, the motion the source runs (the Owl
 * carousels, as the motion library's carousel), the seeded redirects, no guessed or attachment
 * addresses, and the 404 page's own words. Loaded by the generic hook at the end of functions.php.
 *
 * Functions here carry the `wp_ja_morgan_` prefix; the shared `tracy_*` helpers of functions.php
 * are already defined when this file runs.
 *
 * @package wp-ja-morgan
 */

defined( 'ABSPATH' ) || exit;

// The identity tokens the pages, parts and patterns carry, and their filling.
require_once __DIR__ . '/identity.php';

/**
 * The motion the source runs, as the motion library's settings (the default of the `tracy_motion`
 * option; a site owner who saves `{"effects":[]}` turns it off). JA Morgan runs no scroll reveal
 * (no AOS or WOW on any rendered page); it runs Owl carousels that step when asked
 * (acm/slideshow, features-intro style-1, testimonials style-1 and style-2).
 */
function wp_ja_morgan_default_motion(): string {
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
add_filter( 'default_option_tracy_motion', 'wp_ja_morgan_default_motion' );

/** The assets; the design pages (fixture, artifact) render a design system's own stylesheet. */
function wp_ja_morgan_enqueue_assets(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	$version = wp_get_theme()->get( 'Version' );
	wp_enqueue_style( 'wp-ja-morgan', get_theme_file_uri( 'assets/css/wp-ja-morgan.css' ), array( 'tracy', 'tracy-layout', 'tracy-sections' ), $version );
	// Page-group sheets (assets/css/groups/*.css): one file per group of pages, loaded after the shared sheet.
	foreach ( (array) glob( get_theme_file_path( 'assets/css/groups/*.css' ) ) as $group_css ) {
		wp_enqueue_style( 'wp-ja-morgan-' . basename( $group_css, '.css' ), get_theme_file_uri( 'assets/css/groups/' . basename( $group_css ) ), array( 'wp-ja-morgan' ), $version );
	}
	// In the head, blocking, on purpose: it resolves the theme before the first paint, so a
	// visitor who chose dark never sees a light frame.
	wp_enqueue_script( 'wp-ja-morgan-dark', get_theme_file_uri( 'assets/js/wp-ja-morgan-dark.js' ), array(), $version, array( 'in_footer' => false ) );
	wp_enqueue_script( 'wp-ja-morgan', get_theme_file_uri( 'assets/js/wp-ja-morgan.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	wp_localize_script(
		'wp-ja-morgan',
		'wpJaMorgan',
		array(
			'openMenu'  => __( 'Open the menu', 'wp-ja-morgan' ),
			'closeMenu' => __( 'Close the menu', 'wp-ja-morgan' ),
			'dark'      => __( 'Switch to dark mode', 'wp-ja-morgan' ),
			'light'     => __( 'Switch to light mode', 'wp-ja-morgan' ),
			'quickContactFailed' => __( 'The message could not be sent. Please try again later.', 'wp-ja-morgan' ),
		)
	);
	wp_add_inline_script(
		'tracy-motion',
		'window.TracyMotion&&(window.TracyMotion.labels=' . wp_json_encode(
			array(
				'previous' => __( 'Previous slide', 'wp-ja-morgan' ),
				'next'     => __( 'Next slide', 'wp-ja-morgan' ),
				'slide'    => __( 'Go to slide', 'wp-ja-morgan' ),
			)
		) . ');',
		'before'
	);
}
add_action( 'wp_enqueue_scripts', 'wp_ja_morgan_enqueue_assets', 11 );

/**
 * `?theme=dark|light` decides by its FIRST value (assets/js/wp-ja-morgan-dark.js). WordPress's canonical
 * redirect rebuilds the query from a parsed copy in which a repeated key keeps its LAST value, so
 * `?theme=dark&theme=light` would be sent to `?theme=light` before any script runs. Cancelled only when normalising the repeated key changes the
 * first value; any other redirect (host, scheme, port, path, fragment, other parameters) is left alone.
 *
 * @param string|false $redirect_url  The address WordPress wants to send the visitor to.
 * @param string       $requested_url The address that was asked for.
 * @return string|false
 */
function wp_ja_morgan_keep_first_theme_value( $redirect_url, $requested_url ) {
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
add_filter( 'redirect_canonical', 'wp_ja_morgan_keep_first_theme_value', 20, 2 );

/** The body font, preloaded: every heading and paragraph is set in it. */
function wp_ja_morgan_preload_font(): void {
	printf(
		'<link rel="preload" href="%s" as="font" type="font/woff" crossorigin>' . "\n",
		esc_url( get_theme_file_uri( 'assets/fonts/pt-root-ui-regular.woff' ) )
	);
}
add_action( 'wp_head', 'wp_ja_morgan_preload_font', 2 );

/** The pattern category the overlay's patterns file under. */
function wp_ja_morgan_register(): void {
	register_block_pattern_category( 'wp-ja-morgan', array( 'label' => __( 'WP Morgan', 'wp-ja-morgan' ) ) );
	add_post_type_support( 'page', 'excerpt' );
}
add_action( 'init', 'wp_ja_morgan_register' );

/** The stylesheet in the editor too, so sections look the same there. */
function wp_ja_morgan_editor_styles(): void {
	add_editor_style( 'assets/css/wp-ja-morgan.css' );
}
add_action( 'after_setup_theme', 'wp_ja_morgan_editor_styles', 11 );

/**
 * The header is one bar, as the source's is: nav `top-left` and hero `split` restated after the
 * source theme's filter so a catalogue archetype never floats the header (gotcha #7, #12). A page
 * also carries `jm-route-<slug>` and `jm-parent-<slug>`, so the stylesheet can tell apart pages
 * that hold the same blocks.
 *
 * @param string[] $classes The body classes, with the source theme's already added.
 * @return string[]
 */
function wp_ja_morgan_body_class( array $classes ): array {
	$navs      = array_map( static fn( string $nav ): string => 'tracy-nav-' . $nav, TRACY_NAVS );
	$heros     = array_map( static fn( string $hero ): string => 'tracy-hero-' . $hero, TRACY_HEROS );
	$classes   = array_values( array_diff( $classes, $navs, $heros ) );
	$classes[] = 'tracy-nav-top-left';
	$classes[] = 'tracy-hero-split';
	if ( is_page() ) {
		$page      = get_queried_object_id();
		$classes[] = 'jm-route-' . sanitize_html_class( (string) get_post_field( 'post_name', $page ) );
		$parent    = (int) wp_get_post_parent_id( $page );
		if ( $parent ) {
			$classes[] = 'jm-parent-' . sanitize_html_class( (string) get_post_field( 'post_name', $parent ) );
		}
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_morgan_body_class', 11 );

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
function wp_ja_morgan_no_attachment_pages(): void {
	if ( is_admin() || ! is_attachment() ) {
		return;
	}
	global $wp_query, $post;
	$wp_query->set_404();
	$wp_query->set( 'wp_ja_morgan_attachment_404', 1 );
	$wp_query->posts      = array();
	$wp_query->post_count = 0;
	$wp_query->post       = null;
	$post                 = null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- the 404 has no post.
	status_header( 404 );
	nocache_headers();
}
add_action( 'template_redirect', 'wp_ja_morgan_no_attachment_pages', 1 );

/**
 * No canonical redirect for an attachment path turned into a 404 above.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_morgan_attachment_404_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_morgan_attachment_404' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_morgan_attachment_404_no_canonical' );

/**
 * Redirects the seeder recorded in the `wp_ja_morgan_redirects` option. Exact path match only,
 * query string carried over, and never for a request WordPress already resolved: a stale rule must
 * not shadow a page the owner later creates at that path.
 */
function wp_ja_morgan_redirects(): void {
	if ( is_admin() || ! is_404() || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$rules = get_option( 'wp_ja_morgan_redirects' );
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
add_action( 'template_redirect', 'wp_ja_morgan_redirects' );

/**
 * The 404 page's own words: the seeder keeps a draft `page-not-found` and records it in
 * `wp_ja_morgan_404_page`; the template's group named `404.body` renders that page's content.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_404_body( string $content, array $block ): string {
	if ( ! is_404() || '404.body' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	$page = get_post( (int) get_option( 'wp_ja_morgan_404_page' ) );
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
add_filter( 'render_block_core/group', 'wp_ja_morgan_404_body', 10, 2 );

/**
 * The search page at the source's address. The source's search (com_finder) lives at
 * /other-pages/smart-search and its header form posts there; the seeder keeps that route's page as a
 * draft (patterns.map.json `views.search.servedAtPath`) and this answers the path with the theme's
 * search view: `s` (WordPress's form) or `q` (the source's) is the term, and an empty term shows
 * the form and no results, as com_finder does.
 */
const WP_JA_MORGAN_SEARCH_PATHS = array( 'other-pages/smart-search', 'smart-search' );

/**
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_morgan_search_request( array $vars ): array {
	$path = (string) ( $vars['pagename'] ?? '' );
	if ( is_admin() || '' === $path || ! in_array( $path, WP_JA_MORGAN_SEARCH_PATHS, true ) ) {
		return $vars;
	}
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a read-only search term.
	$term = isset( $_GET['s'] ) ? wp_unslash( $_GET['s'] ) : ( isset( $_GET['q'] ) ? wp_unslash( $_GET['q'] ) : '' );
	// phpcs:enable
	$term = sanitize_text_field( (string) $term );
	$out  = array(
		's'                   => $term,
		'wp_ja_morgan_search' => 1,
	);
	if ( '' === $term ) {
		$out['post__in'] = array( 0 );
	}
	return $out;
}
add_filter( 'request', 'wp_ja_morgan_search_request' );

/**
 * A menu link to the search page. The seeder keeps that page as a draft (the theme answers its
 * address, above), and WordPress leaves a link to an unpublished page out of the menu; the link is
 * drawn here as the plain link it is (the block's own render is empty for it).
 *
 * @param string $content      The block's render.
 * @param array  $parsed_block The parsed block.
 * @return string
 */
function wp_ja_morgan_search_menu_link( string $content, array $parsed_block ): string {
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
		get_query_var( 'wp_ja_morgan_search' ) ? ' current-menu-item' : '',
		esc_url( home_url( '/' . WP_JA_MORGAN_SEARCH_PATHS[0] . '/' ) ),
		esc_html( (string) ( $block['attrs']['label'] ?? '' ) )
	);
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_morgan_search_menu_link', 10, 2 );

/**
 * The menu link to the page being shown is the current one, whatever kind the link is: the source
 * marks the active item of every menu by its address, and WordPress does it only for links to a
 * published post or term (a link to the article route or to the draft search page is not one).
 *
 * @param string $content The block's render.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_current_menu_link( string $content, array $block ): string {
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
add_filter( 'render_block_core/navigation-link', 'wp_ja_morgan_current_menu_link', 20, 2 );

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_morgan_query_var( array $vars ): array {
	$vars[] = 'wp_ja_morgan_search';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_morgan_query_var' );

/** The request above is a search, even with an empty term (WordPress calls that the home page). */
function wp_ja_morgan_search_flags( WP_Query $query ): void {
	if ( $query->is_main_query() && $query->get( 'wp_ja_morgan_search' ) ) {
		$query->is_search = true;
		$query->is_home   = false;
		$query->is_404    = false;
	}
}
add_action( 'parse_query', 'wp_ja_morgan_search_flags' );

/**
 * No canonical redirect for the search path: WordPress would send it to `/?s=`.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_morgan_search_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_morgan_search' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_morgan_search_no_canonical' );

/**
 * The header search posts to the source's address, so a search lands on the same page as there.
 *
 * @param string $content The rendered search block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_search_action( string $content, array $block ): string {
	// The core Search block marks its input `required`; the source's search inputs are not, and an empty search just lists everything.
	$content = (string) preg_replace( '/(<input\b[^>]*?)\s+required(?:="[^"]*")?(?=[\s\/>])/', '$1', $content );
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'head-search' ) ) {
		return $content;
	}
	return (string) preg_replace( '/(<form\b[^>]*\baction=")[^"]*(")/', '${1}' . esc_url( home_url( '/other-pages/smart-search/' ) ) . '${2}', $content, 1 );
}
add_filter( 'render_block_core/search', 'wp_ja_morgan_search_action', 10, 2 );

/**
 * The picture behind an article's title. The source paints the article's full-text image
 * (Joomla `image_fulltext`) behind the masthead; here that image is the first block of the post,
 * an image with the class `jm-fulltext-image` (editable like any block). The single template's
 * masthead group (`single.masthead`) takes it as its background, and the body does not repeat it.
 * Without one, the post's featured image stands in.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_article_masthead( string $content, array $block ): string {
	if ( 'single.masthead' !== ( $block['attrs']['metadata']['name'] ?? '' ) || ! is_singular() ) {
		return $content;
	}
	$post = get_post();
	$url  = '';
	if ( $post instanceof WP_Post ) {
		foreach ( parse_blocks( $post->post_content ) as $inner ) {
			if ( 'core/image' === $inner['blockName'] && false !== strpos( (string) ( $inner['attrs']['className'] ?? '' ), 'jm-fulltext-image' ) ) {
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
add_filter( 'render_block_core/group', 'wp_ja_morgan_article_masthead', 10, 2 );

/**
 * The full-text image is drawn by the masthead on the article's own page, so the body leaves it out
 * there; everywhere else (the editor, a feed) it stays an ordinary image.
 *
 * @param string $content The rendered image.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_fulltext_image( string $content, array $block ): string {
	if ( is_admin() || ! is_singular() || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jm-fulltext-image' ) ) {
		return $content;
	}
	return '';
}
add_filter( 'render_block_core/image', 'wp_ja_morgan_fulltext_image', 10, 2 );

/**
 * A hero background picture is drawn at the full-size file, as the source's CSS background is:
 * WordPress' srcset/sizes picked the 768 px size for a box that shows the picture 1400 px wide
 * (blurry at 768 px). The block render marks the image; the content-tag filter, which adds the
 * srcset afterwards, takes it out again (the whole template is filtered a second time, so the mark stays).
 *
 * @param string $content The rendered image.
 * @return string
 */
function wp_ja_morgan_hero_picture_mark( string $content ): string {
	if ( ! preg_match( '/<figure[^>]*class="[^"]*\bft-bg(-xs)?\b/', $content ) ) {
		return $content;
	}
	return (string) preg_replace( '/<img /', '<img data-jm-hero-picture="1" ', $content, 1 );
}
add_filter( 'render_block_core/image', 'wp_ja_morgan_hero_picture_mark', 10, 1 );

/**
 * @param string $image The image tag after WordPress added its srcset and sizes.
 * @return string
 */
function wp_ja_morgan_hero_picture_full( string $image ): string {
	if ( false === strpos( $image, 'data-jm-hero-picture' ) ) {
		return $image;
	}
	return (string) preg_replace( '/\s(srcset|sizes)="[^"]*"/', '', $image );
}
add_filter( 'wp_content_img_tag', 'wp_ja_morgan_hero_picture_full', 20, 1 );

/**
 * The masthead heading: the seeder keeps a page's source heading in `tracy_page_heading` when it
 * differs from the menu word; the title block named `page.title` prints it.
 *
 * @param string $content The rendered post title block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_page_heading( string $content, array $block ): string {
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
add_filter( 'render_block_core/post-title', 'wp_ja_morgan_page_heading', 10, 2 );

/**
 * An article the source opens at a menu address (/joomlart-content/single-article opens article 2,
 * `--article-posts`): the seeder files it as a post and records a rule from that address to the
 * post's permalink. The source answers the address itself, so the theme serves the post there
 * (200, the post's own template) instead of redirecting; the rule stays for any other reader.
 *
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_morgan_article_route_request( array $vars ): array {
	// The request path itself: WordPress drops its page rule when no page has the path and may fall
	// through to the attachment rule (the demo picture `single-article.jpg` has that slug).
	$request = isset( $GLOBALS['wp'] ) ? (string) $GLOBALS['wp']->request : '';
	if ( is_admin() || '' === $request || ! empty( $vars['wp_ja_morgan_search'] ) ) {
		return $vars;
	}
	$path  = '/' . trim( $request, '/' );
	$rules = get_option( 'wp_ja_morgan_redirects' );
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
				'wp_ja_morgan_article_route' => 1,
			);
		}
	}
	return $vars;
}
add_filter( 'request', 'wp_ja_morgan_article_route_request', 11 );

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_morgan_article_route_var( array $vars ): array {
	$vars[] = 'wp_ja_morgan_article_route';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_morgan_article_route_var' );

/**
 * No canonical redirect away from the source's address of an article.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_morgan_article_route_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_morgan_article_route' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_morgan_article_route_no_canonical' );

/**
 * The sidebar's "News & Update." list is the source's most-read articles: a query block that names
 * `jmOrder: "hits"` is sorted by the post meta `hits` (the source's read count, seeded), highest
 * first, then by date, among the blog's articles as the source module lists them.
 *
 * @param array    $query The WP_Query arguments the block built.
 * @param WP_Block $block The post template block.
 * @return array
 */
function wp_ja_morgan_query_vars( array $query, WP_Block $block ): array {
	$ctx = $block->context['query'] ?? array();
	if ( 'hits' === ( $ctx['jmOrder'] ?? '' ) ) {
		$query['meta_key'] = 'hits'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- two posts, a small table.
		$query['orderby']  = array(
			'meta_value_num' => 'DESC',
			'date'           => 'DESC',
		);
		// The source module lists the blog's articles only (mod_articles_popular, category Blog and its
		// children), and a sticky (featured) article is not put first.
		$query['ignore_sticky_posts'] = true;
		$blog                         = get_term_by( 'slug', 'blog', 'category' );
		if ( $blog instanceof WP_Term ) {
			$query['tax_query'] = array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- one category.
				array(
					'taxonomy'         => 'category',
					'field'            => 'term_id',
					'terms'            => array( $blog->term_id ),
					'include_children' => true,
				),
			);
		}
	}
	if ( 'latest' === ( $ctx['jmOrder'] ?? '' ) ) {
		// mod_articles_latest: the newest articles of one category, ties (one publish time) in article
		// order, a sticky article not put first.
		$query['orderby']             = array(
			'date' => 'DESC',
			'ID'   => 'ASC',
		);
		$query['ignore_sticky_posts'] = true;
		$term                         = get_term_by( 'slug', (string) ( $ctx['jmCategory'] ?? '' ), 'category' );
		if ( $term instanceof WP_Term ) {
			$query['tax_query'] = array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- one category.
				array(
					'taxonomy'         => 'category',
					'field'            => 'term_id',
					'terms'            => array( $term->term_id ),
					'include_children' => false,
				),
			);
		}
	}
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_morgan_query_vars', 10, 2 );

/**
 * The sidebar's "Categories." list is the source's mod_articles_categories: the sub-categories of
 * the blog category with their article counts, not every category of the site. A categories block
 * with the class `categories-module` lists the children of the category `blog`.
 *
 * @param string $content The rendered categories block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_categories_module( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'categories-module' ) ) {
		return $content;
	}
	$parent = get_term_by( 'slug', 'blog', 'category' );
	if ( ! $parent instanceof WP_Term ) {
		return $content;
	}
	// In the source's order (the categories were created in Joomla's tree order) and with the count
	// inside the link, as mod_articles_categories prints "Tax Planning (2)".
	$terms = get_terms(
		array(
			'taxonomy'   => 'category',
			'child_of'   => $parent->term_id,
			'orderby'    => 'term_id',
			'order'      => 'ASC',
			'hide_empty' => true,
		)
	);
	if ( ! is_array( $terms ) ) {
		return $content;
	}
	$count = ! empty( $block['attrs']['showPostCounts'] );
	$items = '';
	foreach ( $terms as $term ) {
		$label  = $term->name . ( $count ? ' (' . (int) $term->count . ')' : '' );
		$items .= '<li class="cat-item cat-item-' . (int) $term->term_id . '"><a href="' . esc_url( get_term_link( $term ) ) . '">' . esc_html( html_entity_decode( $label, ENT_QUOTES ) ) . '</a></li>';
	}
	return '<ul class="wp-block-categories-list categories-module wp-block-categories">' . $items . '</ul>';
}
add_filter( 'render_block_core/categories', 'wp_ja_morgan_categories_module', 10, 2 );

/**
 * The sidebar's "Tags." list is the source's mod_tags_popular: the tags most used first. A tag cloud
 * with the class `tagspopular` lists the used tags by count, highest first (then in creation order).
 *
 * @param string $content The rendered tag cloud block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_tags_popular( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'tagspopular' ) ) {
		return $content;
	}
	$terms = get_terms(
		array(
			'taxonomy'   => 'post_tag',
			'orderby'    => 'count',
			'order'      => 'DESC',
			'hide_empty' => true,
		)
	);
	if ( ! is_array( $terms ) || ! $terms ) {
		return $content;
	}
	usort( $terms, static fn( WP_Term $a, WP_Term $b ): int => $b->count <=> $a->count ?: $a->term_id <=> $b->term_id );
	$items = array_map( static fn( WP_Term $t ): string => '<li><a href="' . esc_url( get_term_link( $t ) ) . '" class="tag-cloud-link">' . esc_html( $t->name ) . '</a></li>', $terms );
	return '<ul class="wp-block-tag-cloud tagspopular">' . implode( '', $items ) . '</ul>';
}
add_filter( 'render_block_core/tag-cloud', 'wp_ja_morgan_tags_popular', 10, 2 );

// Page-group code (inc/groups/*.php): one file per group of pages, so groups never edit the same file.
foreach ( (array) glob( __DIR__ . '/groups/*.php' ) as $wp_ja_morgan_group_file ) {
	require_once $wp_ja_morgan_group_file;
}

/**
 * One `h1` per page. The visually hidden page title (`jm-page-title`) is the page's only `h1` unless
 * the page's own content carries one (the home pages' hero heading, as on the source): then the
 * hidden title is printed as a paragraph so the page keeps the single heading the content draws.
 *
 * @param string $content The rendered post title block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_single_h1( string $content, array $block ): string {
	if ( ! is_singular() || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jm-page-title' ) ) {
		return $content;
	}
	if ( false === strpos( (string) get_post_field( 'post_content', get_queried_object_id() ), '<h1' ) ) {
		return $content;
	}
	return (string) preg_replace( '/^(\s*)<h1\b([^>]*)>(.*)<\/h1>(\s*)$/s', '$1<p$2>$3</p>$4', $content );
}
add_filter( 'render_block_core/post-title', 'wp_ja_morgan_single_h1', 11, 2 );

/**
 * The back-to-top button every page carries (the source's `.back-to-top`: a 60 px square in the
 * corner, shown after 200 px of scrolling and only on screens of 992 px and wider).
 */
add_action(
	'wp_footer',
	static function () {
		echo '<div class="back-to-top"><button type="button" class="btn btn-primary" title="' . esc_attr__( 'Back to Top', 'wp-ja-morgan' ) . '" aria-label="' . esc_attr__( 'Back to Top', 'wp-ja-morgan' ) . '"><span aria-hidden="true"></span></button></div>';
	}
);

/**
 * The tint the navy line icons of the icon grids are drawn through (about-us, Home Styles 1, 2 and 4: item-1.png
 * to item-4.png, one colour on transparency). Without a design system the flood is the icons' own
 * navy, so they look as they are; under one it is the system's readable accent (accent-text), so the icons stop showing the
 * template's navy (ACCENT-LEAK). The Joomla twin does the same (ja-products 792ade433).
 */
add_action(
	'wp_footer',
	static function () {
		echo '<svg class="jm-icon-tint" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute"><filter id="jm-icon-tint" color-interpolation-filters="sRGB"><feFlood style="flood-color:var(--ds-c-accent-text, #1b3060)"/><feComposite in2="SourceGraphic" operator="in"/></filter></svg>';
	}
);

/**
 * Home Style 3 and 4 close with their own footers (the source's modules differ there: logo, info,
 * office, social on style 3; logo, office, conversation, copyright on style 4). The templates all
 * name the one `footer` part, so on those two pages the part is swapped when it is rendered.
 *
 * @param array $parsed_block The block about to render.
 * @return array
 */
add_filter(
	'render_block_data',
	static function ( array $parsed_block ): array {
		if ( 'core/template-part' !== ( $parsed_block['blockName'] ?? '' ) || 'footer' !== ( $parsed_block['attrs']['slug'] ?? '' ) || ! is_page() ) {
			return $parsed_block;
		}
		$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
		$path = trim( (string) wp_parse_url( get_permalink( get_queried_object_id() ), PHP_URL_PATH ), '/' );
		if ( in_array( $slug, array( 'home-style-3', 'home-style-4' ), true ) && 0 === strpos( $path, 'home/' ) ) {
			$parsed_block['attrs']['slug'] = 'home-style-3' === $slug ? 'footer-hs3' : 'footer-hs4';
		}
		return $parsed_block;
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
