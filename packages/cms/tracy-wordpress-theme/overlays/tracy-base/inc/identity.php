<?php
/**
 * tracy-base — the identity tokens a page or part of this theme may carry, and where each is filled.
 *
 * The list is closed on purpose: one token, `{site.title}`, the site name WordPress keeps (`blogname`, the
 * content contract's `site.name` slot). The theme's own parts no longer print it (the footer's copyright line
 * went, as the Joomla source has none), but a database footer row kept from an earlier version still carries
 * it, so it is still filled. `{year}` beside it is the current year, not an identity fact. Any other `{…}` on a page is the author's and stays as written, so a
 * token this list does not name never reaches a visitor half-filled.
 *
 * The filling runs here, before the source theme's generic filler (`tracy_fill_site_tokens` in
 * inc/brand-logo.php) sees the block, so this file is the one list the theme answers for. The name is
 * escaped once, as text, the way `esc_html` escapes it.
 *
 * @package tracy-base
 */

defined( 'ABSPATH' ) || exit;

/** Every identity token the theme renders. Adding one means adding its value in tracy_base_identity_fill(). */
const TRACY_BASE_IDENTITY_TOKENS = array(
	'site.title',
);

/**
 * A paragraph's or Custom HTML block's tokens, filled.
 *
 * @param string $content The block as drawn.
 * @return string
 */
function tracy_base_identity_fill( $content ): string {
	$content = (string) $content;
	if ( ! str_contains( $content, '{' ) ) {
		return $content;
	}
	$values = array( '{year}' => esc_html( wp_date( 'Y' ) ) );
	foreach ( TRACY_BASE_IDENTITY_TOKENS as $token ) {
		if ( 'site.title' === $token ) {
			$values[ '{' . $token . '}' ] = esc_html( get_bloginfo( 'name' ) );
		}
	}
	return strtr( $content, $values );
}
add_filter( 'render_block_core/paragraph', 'tracy_base_identity_fill', 9, 1 );
add_filter( 'render_block_core/html', 'tracy_base_identity_fill', 9, 1 );
