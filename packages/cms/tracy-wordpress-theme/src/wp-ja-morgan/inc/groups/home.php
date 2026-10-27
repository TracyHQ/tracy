<?php
/**
 * Group A pages (home styles 2-4, about-us, services-page).
 *
 * The masthead of about-us and services-page prints the page excerpt as its description. The source
 * prints the masthead module's default description there (mod_jamasthead `default-description`), and the
 * pages carry no excerpt of their own, so WordPress would otherwise print the first words of the
 * sections. A hand-written excerpt still wins.
 *
 * @package wp-ja-morgan
 */

add_filter(
	'get_the_excerpt',
	static function ( $excerpt, $post ) {
		if ( ! $post || 'page' !== $post->post_type || '' !== trim( (string) $post->post_excerpt ) ) {
			return $excerpt;
		}
		if ( ! in_array( $post->post_name, array( 'about-us', 'services-page' ), true ) ) {
			return $excerpt;
		}
		return __( 'Quisque dolor fringilla semper, libero hendrerit allis, magna augue putate nibh ucibus enim eros acumin arcu', 'wp-ja-morgan' );
	},
	20,
	2
);

/**
 * The intro under a latest-article card: the source module prints the article's intro cut to 100
 * characters at a word boundary, then " ...". A post-excerpt block with the class `jm-latest-excerpt`
 * is printed that way.
 *
 * @param string $content The rendered post-excerpt block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_latest_excerpt( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jm-latest-excerpt' ) ) {
		return $content;
	}
	$text = trim( wp_strip_all_tags( get_the_excerpt() ) );
	if ( mb_strlen( $text ) > 100 ) {
		$text = mb_substr( $text, 0, 100 );
		$text = preg_replace( '/\s+\S*$/u', '', $text );
	}
	return preg_replace_callback(
		'/(<p[^>]*>).*?(<\/p>)/s',
		static function ( $m ) use ( $text ) {
			return $m[1] . esc_html( $text ) . ' ...' . $m[2];
		},
		$content,
		1
	);
}
add_filter( 'render_block_core/post-excerpt', 'wp_ja_morgan_latest_excerpt', 10, 2 );

/**
 * The picture half of a "features" section (class `features-image`) is shown at its own size and cropped by the frame, as the
 * source does. A responsive `srcset` would swap in a smaller file and so change that size; the full-size file is the only candidate.
 *
 * @param string $content The rendered image block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_features_image_size( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'features-image' ) ) {
		return $content;
	}
	return (string) preg_replace( '/\s(?:srcset|sizes)="[^"]*"/', '', $content );
}
add_filter( 'render_block_core/image', 'wp_ja_morgan_features_image_size', 10, 2 );
