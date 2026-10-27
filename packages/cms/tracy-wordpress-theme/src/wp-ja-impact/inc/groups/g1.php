<?php
/**
 * Page group g1 (hero, cta, features 1/5/6): server logic.
 *
 * The campaign card (ACM features style-6) draws each progress bar from a percentage the editor
 * types as text (`72%`). The bar's width is not text, so the group that holds the label and the
 * percentage gets the number as a CSS custom property on render and the stylesheet draws the bar
 * from it.
 *
 * @package wp-ja-impact
 */

defined( 'ABSPATH' ) || exit;

/**
 * Put the percentage a `jim-progress` group shows into its `--jim-progress` custom property.
 *
 * @param string               $content Rendered block markup.
 * @param array<string, mixed> $block   Parsed block.
 * @return string
 */
function wp_ja_impact_g1_progress( string $content, array $block ): string {
	$class = isset( $block['attrs']['className'] ) ? (string) $block['attrs']['className'] : '';
	if ( ! preg_match( '/(^|\s)jim-progress(\s|$)/', $class ) ) {
		return $content;
	}
	if ( ! preg_match( '/class="[^"]*jim-progress__pct[^"]*"[^>]*>\s*(\d+(?:\.\d+)?)\s*%/', $content, $found ) ) {
		return $content;
	}
	$percent   = max( 0, min( 100, (float) $found[1] ) );
	$processor = new WP_HTML_Tag_Processor( $content );
	if ( ! $processor->next_tag() ) {
		return $content;
	}
	$style = trim( (string) $processor->get_attribute( 'style' ) );
	$style = ( '' === $style ? '' : rtrim( $style, '; ' ) . '; ' ) . '--jim-progress: ' . $percent . '%;';
	$processor->set_attribute( 'style', $style );
	return $processor->get_updated_html();
}
add_filter( 'render_block_core/group', 'wp_ja_impact_g1_progress', 10, 2 );
