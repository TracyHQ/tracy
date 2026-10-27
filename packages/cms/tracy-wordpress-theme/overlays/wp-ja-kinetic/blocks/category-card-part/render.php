<?php
/**
 * wp-ja-kinetic/category-card-part — see block.json. Each branch prints exactly the element the
 * source's `category/thumbs_item.php` prints for that part, nothing around it.
 *
 * @package wp-ja-kinetic
 * @var array<string, mixed> $attributes Block attributes.
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_id = get_the_ID();
if ( ! $wp_ja_kinetic_id ) {
	return;
}
$wp_ja_kinetic_part = isset( $attributes['part'] ) && is_string( $attributes['part'] ) ? $attributes['part'] : 'meta';

if ( 'cover' === $wp_ja_kinetic_part ) {
	$wp_ja_kinetic_cover = (string) get_the_post_thumbnail_url( $wp_ja_kinetic_id, 'full' );
	if ( '' === $wp_ja_kinetic_cover ) {
		echo '<span class="hxcat-row__cover is-empty"></span>';
		return;
	}
	printf( '<span class="hxcat-row__cover" style="background-image:url(\'%s\')"></span>', esc_url( $wp_ja_kinetic_cover ) );
	return;
}

if ( 'eyebrow' === $wp_ja_kinetic_part ) {
	$wp_ja_kinetic_cats = get_the_category( $wp_ja_kinetic_id );
	if ( ! $wp_ja_kinetic_cats ) {
		return;
	}
	printf( '<span class="hxcat-tag">%s</span>', esc_html( mb_strtoupper( $wp_ja_kinetic_cats[0]->name ) ) );
	return;
}

// `meta`: the source drops the author and its separator together when there is no author.
$wp_ja_kinetic_author = wp_ja_kinetic_post_author_name( $wp_ja_kinetic_id );
$wp_ja_kinetic_date   = esc_html( get_the_date( '', $wp_ja_kinetic_id ) );
$wp_ja_kinetic_meta   = '' === $wp_ja_kinetic_author ? $wp_ja_kinetic_date : esc_html( $wp_ja_kinetic_author ) . ' &middot; ' . $wp_ja_kinetic_date;
?>
<span class="hxcat-row__meta"><?php echo $wp_ja_kinetic_meta; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- both parts esc_html'd above. ?></span>
