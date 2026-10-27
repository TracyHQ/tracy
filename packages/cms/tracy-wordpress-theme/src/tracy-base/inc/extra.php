<?php
/**
 * tracy-base — what this target adds on top of the source theme: the chrome stylesheet, the dark
 * mode switch, the mega menu block and the `tracy-base` pattern category. Loaded by the generic
 * hook at the end of functions.php (the source theme has no inc/extra.php, so it is inert there).
 *
 * Functions here carry the `tracy_base_` prefix; the shared `tracy_*` helpers of functions.php
 * (tracy_page_kind() and friends) are already defined when this file runs.
 *
 * @package tracy-base
 */

defined( 'ABSPATH' ) || exit;

// The identity tokens this theme renders ({site.title}, kept for footer rows of earlier versions).
require_once __DIR__ . '/identity.php';

/**
 * The chrome assets. The design pages (fixture, artifact) render a design system's own markup
 * under its own stylesheet and dequeue the theme's; nothing here belongs on them either.
 */
function tracy_base_enqueue_assets(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	$version = wp_get_theme()->get( 'Version' );
	wp_enqueue_style( 'tracy-base', get_theme_file_uri( 'assets/css/tracy-base.css' ), array( 'tracy', 'tracy-layout' ), $version );
	// Extra section styles, when the pattern set ships them; the file is optional by design.
	if ( is_readable( get_theme_file_path( 'assets/css/sections-extra.css' ) ) ) {
		wp_enqueue_style( 'tracy-base-sections-extra', get_theme_file_uri( 'assets/css/sections-extra.css' ), array( 'tracy-sections' ), $version );
	}
	// Parity with the Joomla source, measured on it: printed last, so each value stands as measured.
	$parity_after = wp_style_is( 'tracy-base-sections-extra', 'enqueued' ) ? array( 'tracy-base', 'tracy-base-sections-extra' ) : array( 'tracy-base' );
	foreach ( array( 'chrome', 'home', 'pages', 'landing' ) as $part ) {
		wp_enqueue_style( 'tracy-base-parity-' . $part, get_theme_file_uri( 'assets/css/tracy-base-parity-' . $part . '.css' ), $parity_after, $version );
	}
	// In the head, blocking, on purpose: it resolves the theme before the first paint, so a
	// visitor who chose dark never sees a light frame. It is a few hundred bytes.
	wp_enqueue_script( 'tracy-base-dark', get_theme_file_uri( 'assets/js/tracy-base-dark.js' ), array(), $version, array( 'in_footer' => false ) );
	wp_enqueue_script( 'tracy-base-mega', get_theme_file_uri( 'assets/js/tracy-base-mega.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	wp_enqueue_script( 'tracy-base-sections', get_theme_file_uri( 'assets/js/tracy-base-sections.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	wp_enqueue_script( 'tracy-base-drawer', get_theme_file_uri( 'assets/js/tracy-base-drawer.js' ), array(), $version, array( 'strategy' => 'defer' ) );
}
add_action( 'wp_enqueue_scripts', 'tracy_base_enqueue_assets', 11 );

/**
 * `?theme=dark|light` decides by its FIRST value (assets/js/tracy-base-dark.js). WordPress's canonical
 * redirect rebuilds the query from a parsed copy in which a repeated key keeps its LAST value, so
 * `?theme=dark&theme=light` would be sent to `?theme=light` before any script runs. Cancelled only when normalising the repeated key changes the
 * first value; any other redirect (host, scheme, port, path, fragment, other parameters) is left alone.
 *
 * @param string|false $redirect_url  The address WordPress wants to send the visitor to.
 * @param string       $requested_url The address that was asked for.
 * @return string|false
 */
function tracy_base_keep_first_theme_value( $redirect_url, $requested_url ) {
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
add_filter( 'redirect_canonical', 'tracy_base_keep_first_theme_value', 20, 2 );

/** The mega menu block and the pattern category the overlay's patterns file under. */
function tracy_base_register(): void {
	// Guarded: register_block_type() given a path that does not exist treats it as a block NAME
	// and logs a notice on every request; a theme copied without its blocks/ directory (a
	// half-built zip, measured 13/09) would otherwise be noisy instead of merely lacking the block.
	if ( is_readable( get_theme_file_path( 'blocks/mega-menu/block.json' ) ) ) {
		register_block_type( get_theme_file_path( 'blocks/mega-menu' ) );
	}
	register_block_pattern_category( 'tracy-base', array( 'label' => __( 'Tracy Base', 'tracy-base' ) ) );
}
add_action( 'init', 'tracy_base_register' );

/**
 * The header is a bar, as the Joomla source's is — not the overlay the `apple` archetype
 * declares. inspirations.json records apple as nav `overlay` + hero `cover`, and layout.css then
 * floats the header over the home page and paints brand and links in the background colour, for
 * a cover image this site's home does not open with (its heroes are the split and centred
 * sections). The body classes are the only switch, so both are set here, after the source
 * theme's filter.
 *
 * @param string[] $classes The body classes, with the source theme's already added.
 * @return string[]
 */
function tracy_base_body_class( array $classes ): array {
	$navs      = array_map( static fn( string $nav ): string => 'tracy-nav-' . $nav, TRACY_NAVS );
	$heros     = array_map( static fn( string $hero ): string => 'tracy-hero-' . $hero, TRACY_HEROS );
	$classes   = array_values( array_diff( $classes, $navs, $heros ) );
	$classes[] = 'tracy-nav-top-left';
	// Same reason for the hero: apple's `cover` archetype paints hero copy in the background colour
	// for a photo the Tracy Base heroes do not have — measured 14/09 as white-on-white in light and
	// black-on-black in dark on the seeded home. The source's heroes are split and centred sections
	// that carry their own colour, so the body wears the neutral `split` class.
	$classes[] = 'tracy-hero-split';
	// A page whose body lists posts or pages (a category blog, a tag, the search results in the
	// source) wears the listing identity the source's category view carries; the visual contract
	// reads it as `identity.body` (7 pages measured without it, 25/09).
	if ( is_page() && has_block( 'core/query', get_queried_object_id() ) ) {
		$classes[] = 'tracy-page-listing';
	}
	return $classes;
}
add_filter( 'body_class', 'tracy_base_body_class', 11 );

/** The chrome stylesheet in the editor too, so the mega panel and footer columns look the same there. */
function tracy_base_editor_styles(): void {
	add_editor_style( 'assets/css/tracy-base.css' );
}
add_action( 'after_setup_theme', 'tracy_base_editor_styles', 11 );

/**
 * Redirects the seeder recorded in the `tracy_base_redirects` option — the Joomla routes this
 * port dropped (com_contact, newsfeeds, wrapper) and the three category routes whose slug the
 * port renamed. Exact path match only, query string carried over, and never for a request
 * WordPress already resolved: a stale rule must not shadow a page the owner later creates at
 * that path. The rules live in the database, not in the theme, so the site owner can edit them
 * with a single option and the theme ships no site-specific paths.
 */
function tracy_base_redirects(): void {
	if ( is_admin() || ! is_404() ) {
		return;
	}
	$rules = get_option( 'tracy_base_redirects' );
	if ( is_string( $rules ) ) {
		$rules = json_decode( $rules, true );
	}
	if ( ! is_array( $rules ) || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$uri  = wp_unslash( $_SERVER['REQUEST_URI'] );
	$path = untrailingslashit( (string) wp_parse_url( $uri, PHP_URL_PATH ) );
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
add_action( 'template_redirect', 'tracy_base_redirects' );

/**
 * The heading of the "Page with title" template. The seeder files a page under its menu word and
 * keeps the heading the source prints in `tracy_page_heading` ("Questions" for the FAQ page, whose
 * menu word is "FAQ"); the title block named `page.title` prints that heading when the page has
 * one, and the page title otherwise.
 *
 * @param string $content The rendered post title block.
 * @param array  $block   The parsed block.
 * @return string
 */
function tracy_base_page_heading( string $content, array $block ): string {
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
add_filter( 'render_block_core/post-title', 'tracy_base_page_heading', 10, 2 );
