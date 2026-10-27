<?php
/**
 * wp-ja-kinetic: the pricing comparison table (pattern section-pricing-matrix) draws a group's
 * divider row alone. The 1.0.9 demo content, ported from the Joomla module whose group-only rows
 * also rendered a feature row, carries an empty feature row (no label, three dashes) under every
 * group divider; this `render_block` filter drops such a row from the table's rendered markup, so
 * content already saved reads right without editing it. A row with a label or any cell stays.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

/**
 * Drop the feature rows of an `.hx-matrix` table that hold no label and only empty or dash cells.
 *
 * @param string $content Rendered block markup.
 * @param array  $block   Parsed block.
 * @return string
 */
function wp_ja_kinetic_pricing_matrix_empty_rows( string $content, array $block ): string {
	if ( 'core/table' !== ( $block['blockName'] ?? '' ) || false === strpos( $content, 'hx-matrix' ) ) {
		return $content;
	}
	$dash = '(?:<span class="hx-pm-dash"[^>]*>\s*(?:&mdash;|&#8212;|\x{2014})\s*</span>)?';
	$cell = '\s*<td[^>]*>\s*' . $dash . '\s*</td>';
	$out  = preg_replace(
		'~<tr>\s*<th scope="row" class="hx-pm-label">\s*</th>(?:' . $cell . '){3}\s*</tr>~u',
		'',
		$content
	);
	return is_string( $out ) ? $out : $content;
}
add_filter( 'render_block', 'wp_ja_kinetic_pricing_matrix_empty_rows', 10, 2 );
