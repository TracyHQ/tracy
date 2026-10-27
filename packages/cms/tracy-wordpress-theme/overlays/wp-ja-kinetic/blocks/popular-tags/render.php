<?php
/**
 * wp-ja-kinetic/popular-tags — see block.json. Renders the same markup shape core's
 * `wp:tag-cloud` block does (`div.wp-block-tag-cloud > a.tag-cloud-link`), so every existing
 * `.hxcat-cloud a` / `.hx-tagcloud a` / `.hx-blogtopics__tags a` style rule ported from the
 * source for that block keeps matching without its own edit.
 *
 * @package wp-ja-kinetic
 * @var array<string, mixed> $attributes Block attributes.
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_count      = isset( $attributes['numberOfTags'] ) ? max( 1, (int) $attributes['numberOfTags'] ) : 10;
$wp_ja_kinetic_class      = isset( $attributes['className'] ) && is_string( $attributes['className'] ) ? $attributes['className'] : '';
$wp_ja_kinetic_link_class = isset( $attributes['linkClassName'] ) && is_string( $attributes['linkClassName'] ) ? $attributes['linkClassName'] : 'tag-cloud-link';
$wp_ja_kinetic_tags   = get_tags(
	array(
		'hide_empty' => true,
		'orderby'    => 'count',
		'order'      => 'DESC',
		'number'     => $wp_ja_kinetic_count,
	)
);
if ( ! $wp_ja_kinetic_tags ) {
	return;
}
// `get_tags()` breaks ties (equal count) in DB-returned order, not name; the source's own
// query is explicit (`ORDER BY cnt DESC, title ASC`) — re-sort ties alphabetically to match.
usort(
	$wp_ja_kinetic_tags,
	static function ( $wp_ja_kinetic_a, $wp_ja_kinetic_b ) {
		if ( $wp_ja_kinetic_a->count === $wp_ja_kinetic_b->count ) {
			return strcasecmp( $wp_ja_kinetic_a->name, $wp_ja_kinetic_b->name );
		}
		return $wp_ja_kinetic_b->count <=> $wp_ja_kinetic_a->count;
	}
);
?>
<div class="wp-block-tag-cloud <?php echo esc_attr( $wp_ja_kinetic_class ); ?>">
	<?php foreach ( $wp_ja_kinetic_tags as $wp_ja_kinetic_tag ) : ?>
		<a class="<?php echo esc_attr( $wp_ja_kinetic_link_class ); ?>" href="<?php echo esc_url( get_tag_link( $wp_ja_kinetic_tag ) ); ?>"><?php echo esc_html( $wp_ja_kinetic_tag->name ); ?></a>
	<?php endforeach; ?>
</div>
