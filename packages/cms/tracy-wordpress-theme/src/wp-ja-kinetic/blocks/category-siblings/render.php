<?php
/**
 * wp-ja-kinetic/category-siblings — the source's sidebar "Categories" card
 * (`category/thumbs.php:92-103,183-194`): the children of the CURRENT category's parent (real
 * siblings, real counts), current one marked `is-active`. Registered only for the
 * `category-engineering` dedicated template, so the queried category is always Engineering.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_current = get_queried_object();
if ( ! ( $wp_ja_kinetic_current instanceof WP_Term ) ) {
	return;
}
$wp_ja_kinetic_parent_id = (int) $wp_ja_kinetic_current->parent;
if ( 0 === $wp_ja_kinetic_parent_id ) {
	return;
}
// `orderby: id ASC` — closest native-WP equivalent to the source's admin-dragged category
// order; same reasoning as `blocks/categories-index/render.php`.
$wp_ja_kinetic_siblings = get_categories(
	array(
		'parent'     => $wp_ja_kinetic_parent_id,
		'hide_empty' => false,
		'orderby'    => 'id',
		'order'      => 'ASC',
	)
);
if ( ! $wp_ja_kinetic_siblings ) {
	return;
}
?>
<div class="hxcat-card hxcat-cats">
	<span class="hxcat-card__h">Categories</span>
	<?php foreach ( $wp_ja_kinetic_siblings as $wp_ja_kinetic_sibling ) : ?>
		<a class="hxcat-catrow<?php echo $wp_ja_kinetic_sibling->term_id === $wp_ja_kinetic_current->term_id ? ' is-active' : ''; ?>" href="<?php echo esc_url( get_category_link( $wp_ja_kinetic_sibling ) ); ?>">
			<span class="hxcat-catrow__n"><?php echo esc_html( $wp_ja_kinetic_sibling->name ); ?></span>
			<span class="hxcat-catrow__c"><?php echo esc_html( (string) $wp_ja_kinetic_sibling->count ); ?></span>
		</a>
	<?php endforeach; ?>
</div>
