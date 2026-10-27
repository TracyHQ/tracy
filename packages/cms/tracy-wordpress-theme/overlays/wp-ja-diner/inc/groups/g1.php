<?php
/**
 * Group g1: the four colour homes (/home/home-red, -pink, -green, -blue).
 *
 * The source draws them under its template styles #10-#13, whose sheets (css/themes/<colour>/) differ from the default
 * ones in the accent colour and a few rules. The port carries that as one body class per page, `jd-theme-<colour>`;
 * assets/css/groups/g1.css holds the rules under it.
 *
 * @package wp-ja-diner
 */

defined( 'ABSPATH' ) || exit;

/**
 * Adds `jd-theme-<colour>` to the body of a colour home.
 *
 * @param string[] $classes Body classes.
 * @return string[]
 */
function wp_ja_diner_g1_body_class( array $classes ): array {
	if ( ! is_page() ) {
		return $classes;
	}
	$page = get_queried_object();
	if ( ! $page instanceof WP_Post || ! $page->post_parent || 'home' !== get_post_field( 'post_name', $page->post_parent ) ) {
		return $classes;
	}
	if ( in_array( $page->post_name, array( 'home-red', 'home-pink', 'home-green', 'home-blue' ), true ) ) {
		$classes[] = 'jd-theme-' . substr( $page->post_name, 5 );
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_diner_g1_body_class' );
