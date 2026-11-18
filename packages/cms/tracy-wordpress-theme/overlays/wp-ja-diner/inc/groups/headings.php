<?php
/**
 * Headings group: exactly one `h1` on every page.
 *
 * The source prints a masthead `h1` and often a second one in the page body (the article title, a team
 * section, a slide, a form heading), and prints none at all on its bare status and account pages. A page
 * with two `h1` or none breaks the outline a search engine and a screen reader read, so the finished page
 * is settled once, in one place, by these rules:
 *
 *  - Two or more `h1`: the article title keeps the `h1`; else the masthead title keeps it, unless it only
 *    prints the site name, then the first other heading keeps it. The masthead title that loses it becomes
 *    a paragraph with the same class and attributes, so it looks the same; any other heading becomes an
 *    `h2` that also takes the `h1` class, so it keeps the size the source gave it.
 *  - No `h1` on a singular page that draws a `main` element: the page title is printed first inside it as
 *    the `h1`, in the container the page content uses.
 *
 * @package wp-ja-diner
 */

/**
 * Settle the `h1` of a finished page.
 *
 * @param string $html      The whole page.
 * @param string $site_name The site name (a masthead that only prints it is no page title).
 * @param string $title     The page title (printed when the page has no `h1`), or '' to add none.
 * @return string
 */
function wp_ja_diner_one_h1( string $html, string $site_name, string $title = '' ): string {
	if ( ! preg_match_all( '#<h1\b([^>]*)>(.*?)</h1>#si', $html, $found, PREG_SET_ORDER | PREG_OFFSET_CAPTURE ) ) {
		if ( '' === $title || ! preg_match( '#<main\b[^>]*>#i', $html, $main, PREG_OFFSET_CAPTURE ) ) {
			return $html;
		}
		$at = $main[0][1] + strlen( $main[0][0] );
		return substr( $html, 0, $at ) . '<h1 class="jd-page-title h1 container">' . htmlspecialchars( $title, ENT_QUOTES ) . '</h1>' . substr( $html, $at );
	}
	if ( count( $found ) < 2 ) {
		return $html;
	}
	$kinds = array();
	foreach ( $found as $i => $m ) {
		$class = preg_match( '/class="([^"]*)"/', $m[1][0], $c ) ? $c[1] : '';
		$text  = trim( html_entity_decode( wp_ja_diner_strip_h1_tags( $m[2][0] ), ENT_QUOTES ) );
		if ( str_contains( $class, 'article-title' ) ) {
			$kinds[ $i ] = 'article';
		} elseif ( str_contains( $class, 'ja-masthead-title' ) ) {
			$kinds[ $i ] = wp_ja_diner_plain_name( $text ) === wp_ja_diner_plain_name( $site_name ) ? 'masthead-site' : 'masthead';
		} else {
			$kinds[ $i ] = 'other';
		}
	}
	$keeper = array_search( 'article', $kinds, true );
	if ( false === $keeper ) {
		$keeper = array_search( 'masthead', $kinds, true );
	}
	if ( false === $keeper ) {
		$keeper = array_search( 'other', $kinds, true );
	}
	if ( false === $keeper ) {
		$keeper = 0;
	}
	// Rewrite from the last to the first so earlier offsets stay valid.
	for ( $i = count( $found ) - 1; $i >= 0; $i-- ) {
		if ( $i === $keeper ) {
			continue;
		}
		$m     = $found[ $i ];
		$attrs = $m[1][0];
		if ( str_starts_with( $kinds[ $i ], 'masthead' ) ) {
			$tag = 'p';
		} else {
			$tag = 'h2';
			$attrs = preg_match( '/class="/', $attrs ) ? preg_replace( '/class="/', 'class="h1 ', $attrs, 1 ) : $attrs . ' class="h1"';
		}
		$html = substr_replace( $html, '<' . $tag . $attrs . '>' . $m[2][0] . '</' . $tag . '>', $m[0][1], strlen( $m[0][0] ) );
	}
	return $html;
}

/**
 * A name reduced to its letters and digits, lower case ("ja-diner" and "Ja Diner" are one name).
 *
 * @param string $name Any name.
 * @return string
 */
function wp_ja_diner_plain_name( string $name ): string {
	return preg_replace( '/[^a-z0-9]/', '', strtolower( $name ) ) ?? '';
}

/**
 * The text of a heading without its tags (kept local so the function runs in a bare harness).
 *
 * @param string $html Heading markup.
 * @return string
 */
function wp_ja_diner_strip_h1_tags( string $html ): string {
	return preg_replace( '#<[^>]*>#', '', $html ) ?? $html;
}

/**
 * Buffer the page so its `h1` can be settled once it is whole.
 */
function wp_ja_diner_one_h1_start(): void {
	if ( is_admin() || is_feed() || is_robots() || is_embed() || wp_doing_ajax() || wp_is_json_request() ) {
		return;
	}
	$title = is_singular() ? get_the_title( (int) get_queried_object_id() ) : '';
	ob_start(
		static fn( string $html ): string => str_contains( $html, '<html' )
			? wp_ja_diner_one_h1( $html, (string) get_bloginfo( 'name' ), (string) wp_strip_all_tags( $title ) )
			: $html
	);
}
add_action( 'template_redirect', 'wp_ja_diner_one_h1_start', 0 );
