<?php
/**
 * Group g1 (landing pages): the four colour-theme pages.
 *
 * The source serves /explore/themes/{blue,green,pink,purple}-color with the template's css/themes/<colour>/ sheets in
 * place of css/. Here the page gets a body class naming its colour, and assets/css/groups/g1.css carries the difference
 * between the two sheet sets under that class.
 *
 * @package wp-ja-restaurant
 */

/**
 * Add `jr-theme-<colour>` to the body of a colour-theme page.
 *
 * @param string[] $classes Body classes.
 * @return string[]
 */
function wp_ja_restaurant_g1_body_class( array $classes ): array {
	if ( ! is_page() ) {
		return $classes;
	}
	$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	if ( 1 === preg_match( '/^(blue|green|pink|purple)-color$/', $slug, $m ) ) {
		$classes[] = 'jr-theme-' . $m[1];
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_restaurant_g1_body_class' );

/**
 * Give a menu dish badge the source's `badge-<value>` class.
 *
 * The source prints `<span class="badge badge-sale">Sale</span>`; the seeder fills the paragraph text only (a class
 * field is not supported), so the class is added from the text when the block renders.
 *
 * @param string               $html  Rendered block HTML.
 * @param array<string, mixed> $block Parsed block.
 * @return string
 */
function wp_ja_restaurant_g1_badge_class( string $html, array $block ): string {
	if ( 'core/paragraph' !== ( $block['blockName'] ?? '' ) || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'badge' ) ) {
		return $html;
	}
	$slug = sanitize_title( wp_strip_all_tags( $html ) );
	if ( '' === $slug ) {
		return $html;
	}
	return (string) preg_replace( '/^(\s*<p class="[^"]*\bbadge\b)/', '$1 badge-' . $slug, $html, 1 );
}
add_filter( 'render_block_core/paragraph', 'wp_ja_restaurant_g1_badge_class', 10, 2 );
