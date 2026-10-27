<?php
/**
 * The customer's brand in the theme's chrome: which logo a Site Logo block shows, the site name as
 * text where no logo fits, and the site name in a copyright line.
 *
 * WordPress core has ONE logo (option `site_logo`, an attachment id). A design whose header or
 * footer sits on a dark background in some mode needs a second one. Tracy's convention, shared by
 * every theme built from this one (plan T27/T28):
 *
 *   option `tracy_logo_dark`  attachment id of the logo drawn for a dark background
 *
 * A Site Logo block opts in through its class:
 *
 *   `tracy-logo-dark` or `<prefix>-logo--dark` (or `__logo--dark`) a dark-background spot: it shows `tracy_logo_dark`,
 *                                                and the site name as text when there is none — never
 *                                                the light logo, which would vanish on that ground (Q7)
 *   `tracy-logo-fallback` or `<prefix>-logo--light` (or `__logo--light`)  a light spot that shows the site name as text when
 *                                                `site_logo` is empty, where core would draw nothing
 *
 *   `tracy-logo-bare`  added to either: no text, the spot stays empty (a header that already prints the
 *                      Site Title beside its logo)
 *
 * A block with neither class is left exactly as core draws it. The text keeps the block's classes,
 * so a theme's light/dark swap (`.jn-logo--dark { display: none }` …) hides and shows it the same way.
 *
 * A paragraph or Custom HTML block whose text holds `{site.title}` or `{year}` gets the site name and the current year:
 * a copyright line that always names the site, whatever name the customer gave it.
 */

/** Block class tokens that mark a dark-background logo spot. */
const TRACY_LOGO_DARK_CLASS = '/(?:^|\s)(?:tracy-logo-dark|[a-z0-9_-]*[_-]logo--dark)(?:\s|$)/';
/** Block class tokens that ask for the site name as text when the light logo is empty. */
const TRACY_LOGO_FALLBACK_CLASS = '/(?:^|\s)(?:tracy-logo-fallback|[a-z0-9_-]*[_-]logo--light)(?:\s|$)/';
/** Block class token that keeps an empty spot empty: the name is printed beside it already. */
const TRACY_LOGO_BARE_CLASS = '/(?:^|\s)tracy-logo-bare(?:\s|$)/';

/** The attachment id an option holds, or 0 when it holds none that is an image. */
function tracy_logo_attachment( string $option ): int {
	$id = (int) get_option( $option, 0 );
	return $id > 0 && wp_attachment_is_image( $id ) ? $id : 0;
}

/** The site name as a link home, in the block's own wrapper and classes. */
function tracy_logo_text( array $attributes ): string {
	$classes = trim( 'wp-block-site-logo is-tracy-logo-text ' . (string) ( $attributes['className'] ?? '' ) );
	return sprintf(
		'<div class="%s"><a class="tracy-logo-text" href="%s" rel="home">%s</a></div>',
		esc_attr( $classes ),
		esc_url( home_url( '/' ) ),
		esc_html( get_bloginfo( 'name' ) )
	);
}

/** Whether a parsed block is a Site Logo block in a dark-background spot. */
function tracy_is_dark_logo_block( $block ): bool {
	return is_array( $block )
		&& 'core/site-logo' === ( $block['blockName'] ?? '' )
		&& preg_match( TRACY_LOGO_DARK_CLASS, (string) ( $block['attrs']['className'] ?? '' ) );
}

/** The dark logo's attachment, read where core reads `site_logo` (0 when there is none: core then draws nothing). */
function tracy_dark_logo_option(): int {
	return tracy_logo_attachment( 'tracy_logo_dark' );
}

/**
 * Before core draws a dark-spot Site Logo, `site_logo` reads as the dark logo: core's own renderer then
 * draws it with its own wrapper, size and link. The swap is taken off right after, in tracy_site_logo_block()
 * (a Site Logo block has no inner blocks, so nothing else is drawn in between).
 *
 * @param array $block The parsed block.
 */
function tracy_site_logo_data( $block ) {
	if ( tracy_is_dark_logo_block( $block ) ) {
		add_filter( 'pre_option_site_logo', 'tracy_dark_logo_option', 99 );
	}
	return $block;
}
add_filter( 'render_block_data', 'tracy_site_logo_data', 10, 1 );

/**
 * What a Site Logo block shows, after core drew it.
 *
 * @param string $content What core drew (empty when there was no logo to draw).
 * @param array  $block   The parsed block.
 */
function tracy_site_logo_block( $content, $block ): string {
	remove_filter( 'pre_option_site_logo', 'tracy_dark_logo_option', 99 );
	$attributes = isset( $block['attrs'] ) && is_array( $block['attrs'] ) ? $block['attrs'] : array();
	$classes    = (string) ( $attributes['className'] ?? '' );
	$fallback   = ( tracy_is_dark_logo_block( $block ) || preg_match( TRACY_LOGO_FALLBACK_CLASS, $classes ) ) && ! preg_match( TRACY_LOGO_BARE_CLASS, $classes );
	if ( $fallback && '' === trim( (string) $content ) ) {
		return tracy_logo_text( $attributes );
	}
	return (string) $content;
}
add_filter( 'render_block_core/site-logo', 'tracy_site_logo_block', 10, 2 );

/**
 * A paragraph's `{site.title}` and `{year}`, filled.
 *
 * @param string $content The paragraph as drawn.
 */
function tracy_fill_site_tokens( $content ): string {
	$content = (string) $content;
	if ( ! str_contains( $content, '{site.title}' ) && ! str_contains( $content, '{year}' ) ) {
		return $content;
	}
	return strtr(
		$content,
		array(
			'{site.title}' => esc_html( get_bloginfo( 'name' ) ),
			'{year}'      => esc_html( wp_date( 'Y' ) ),
		)
	);
}
add_filter( 'render_block_core/paragraph', 'tracy_fill_site_tokens', 10, 1 );
add_filter( 'render_block_core/html', 'tracy_fill_site_tokens', 10, 1 );

/**
 * The text logo's look: the chrome's own colour and font, a wordmark's weight. The selector outweighs a
 * theme's rule for links inside its logo box (`body.tracy .jim-logo a { line-height: 0 }`), which is
 * written for an image; a theme that wants another look for the name writes a stronger one.
 */
function tracy_logo_text_style(): void {
	echo '<style id="tracy-logo-text">html body .is-tracy-logo-text a.tracy-logo-text{display:inline-block;font-weight:700;font-size:1.375rem;line-height:1.2;color:inherit;text-decoration:none;white-space:nowrap}</style>' . "\n";
}
add_action( 'wp_head', 'tracy_logo_text_style', 20 );
