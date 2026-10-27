<?php
/**
 * wp-ja-kinetic/current-term-name — see block.json. Plain escaped text, no wrapper element:
 * the source's own breadcrumb trail (`com_tags/tag/default.php:55`) concatenates the tag name
 * as bare text inside its `.hx-author__bc-trail` span, `<?php echo $this->escape($hxTagName); ?>`
 * — no classed element of its own.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_term = get_queried_object();
if ( ! ( $wp_ja_kinetic_term instanceof WP_Term ) ) {
	return;
}
echo esc_html( $wp_ja_kinetic_term->name );

