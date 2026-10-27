<?php
/**
 * wp-ja-impact — the identity tokens a page or part of this theme may carry, and where each is filled.
 *
 * The list is closed on purpose: one token, `{site.title}`, the site name WordPress keeps (`blogname`, the
 * content contract's `site.name` slot), printed in the footer's copyright line. `{year}` beside it is the
 * current year, not an identity fact. Any other `{…}` on a page is the author's and stays as written, so a
 * token this list does not name never reaches a visitor half-filled.
 *
 * The filling runs here, before the source theme's generic filler (`tracy_fill_site_tokens` in
 * inc/brand-logo.php) sees the block, so this file is the one list the theme answers for. The name is
 * escaped once, as text, the way `esc_html` escapes it.
 *
 * @package wp-ja-impact
 */

defined( 'ABSPATH' ) || exit;

/** Every identity token the theme renders. Adding one means adding its value in wp_ja_impact_identity_fill(). */
const WP_JA_IMPACT_IDENTITY_TOKENS = array(
	'site.title',
);

/**
 * A paragraph's or Custom HTML block's tokens, filled.
 *
 * @param string $content The block as drawn.
 * @return string
 */
function wp_ja_impact_identity_fill( $content ): string {
	$content = (string) $content;
	if ( ! str_contains( $content, '{' ) ) {
		return $content;
	}
	$values = array( '{year}' => esc_html( wp_date( 'Y' ) ) );
	foreach ( WP_JA_IMPACT_IDENTITY_TOKENS as $token ) {
		if ( 'site.title' === $token ) {
			$values[ '{' . $token . '}' ] = esc_html( get_bloginfo( 'name' ) );
		}
	}
	return strtr( $content, $values );
}
add_filter( 'render_block_core/paragraph', 'wp_ja_impact_identity_fill', 9, 1 );
add_filter( 'render_block_core/html', 'wp_ja_impact_identity_fill', 9, 1 );

/**
 * A Site Logo's alternative text is the site name, whichever picture it draws. Core uses a picture's own alternative text when
 * it has one and the site name only when it has none, so the three logo spots (header, drawer, footer, all on the navy bar,
 * option `tracy_logo_dark`) would keep the demo's text once the site was renamed. A logo is the site's name drawn, so its
 * text follows the name the customer gave, like `{site.title}`.
 *
 * @param array $attributes The logo image's attributes, as core passes them to wp_get_attachment_image().
 * @return array
 */
function wp_ja_impact_logo_alt( $attributes ): array {
	$attributes        = is_array( $attributes ) ? $attributes : array();
	$attributes['alt'] = get_bloginfo( 'name', 'display' );
	return $attributes;
}
add_filter( 'get_custom_logo_image_attributes', 'wp_ja_impact_logo_alt', 10, 1 );
