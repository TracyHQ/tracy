<?php
/**
 * wp-ja-diner — the identity tokens a page, part or pattern of this theme may carry, and where each is filled.
 *
 * The list is closed on purpose. `{site.title}` is the site name WordPress keeps (`blogname`, the content contract's
 * `site.name` slot), printed by the header's text logo, the footers' logo text and their copyright lines. The business
 * contact words are theme text options (WP_JA_DINER_TEXT_OPTIONS) seeded with the demo words, so a content contract
 * can declare them as slots (`themeText` in the manifest): the footer line prints `{contact.mobile}`,
 * `{contact.landline}` and `{contact.email}`, and the Contact pattern reads the address and phone through
 * wp_ja_diner_text_option(). `{year}` beside them is the current year, not an identity fact. Any other `{…}` on a page is the author's and stays as
 * written, so a token this list does not name never reaches a visitor half-filled.
 *
 * The filling runs here, before the source theme's generic filler (`tracy_fill_site_tokens` in inc/brand-logo.php) sees
 * the block, so this file is the one list the theme answers for. The name is escaped once, as text, the way `esc_html`
 * escapes it.
 *
 * @package wp-ja-diner
 */

defined( 'ABSPATH' ) || exit;

/** Every identity token the theme renders. Adding one means adding its value in wp_ja_diner_identity_fill(). */
const WP_JA_DINER_IDENTITY_TOKENS = array(
	'site.title',
	'contact.address',
	'contact.phone',
	'contact.mobile',
	'contact.landline',
	'contact.email',
);

/**
 * The theme text options, held to the theme prefix. They carry no words here: the quickstart database seeds them with
 * the demo words, and a default left in a theme file would keep the coverage hole open. An unset option prints nothing.
 */
const WP_JA_DINER_TEXT_OPTIONS = array(
	'wp_ja_diner_contact_address',
	'wp_ja_diner_contact_phone',
	'wp_ja_diner_footer_mobile',
	'wp_ja_diner_footer_landline',
	'wp_ja_diner_footer_email',
);

/** The footer tokens and the text option each one prints. */
const WP_JA_DINER_TEXT_TOKENS = array(
	'contact.address'  => 'wp_ja_diner_contact_address',
	'contact.phone'    => 'wp_ja_diner_contact_phone',
	'contact.mobile'   => 'wp_ja_diner_footer_mobile',
	'contact.landline' => 'wp_ja_diner_footer_landline',
	'contact.email'    => 'wp_ja_diner_footer_email',
);

/**
 * A theme text option's words: what the site holds, else nothing. Not escaped; the caller escapes.
 *
 * @param string $option One of the WP_JA_DINER_TEXT_OPTIONS names.
 * @return string
 */
function wp_ja_diner_text_option( string $option ): string {
	$value = get_option( $option, '' );
	return is_string( $value ) ? $value : '';
}

/**
 * A paragraph's or Custom HTML block's tokens, filled.
 *
 * @param string $content The block as drawn.
 * @return string
 */
function wp_ja_diner_identity_fill( $content ): string {
	$content = (string) $content;
	if ( ! str_contains( $content, '{' ) ) {
		return $content;
	}
	$values = array( '{year}' => esc_html( wp_date( 'Y' ) ) );
	foreach ( WP_JA_DINER_IDENTITY_TOKENS as $token ) {
		if ( 'site.title' === $token ) {
			$values[ '{' . $token . '}' ] = esc_html( get_bloginfo( 'name' ) );
		} elseif ( isset( WP_JA_DINER_TEXT_TOKENS[ $token ] ) ) {
			$values[ '{' . $token . '}' ] = esc_html( wp_ja_diner_text_option( WP_JA_DINER_TEXT_TOKENS[ $token ] ) );
		}
	}
	return strtr( $content, $values );
}
add_filter( 'render_block_core/paragraph', 'wp_ja_diner_identity_fill', 9, 1 );
add_filter( 'render_block_core/html', 'wp_ja_diner_identity_fill', 9, 1 );
