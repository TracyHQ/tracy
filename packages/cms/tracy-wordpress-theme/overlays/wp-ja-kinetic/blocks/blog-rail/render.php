<?php
/**
 * wp-ja-kinetic/blog-rail — the source's sticky topics rail (`category/blog.php:227-245`):
 * "All posts" (recursive total count) + each real child category. Only registered for
 * the `field-notes-from-the-on-call` dedicated template, so "All posts" is always the active
 * link here — a child category routes through the generic `category.html`, not this template.
 *
 * "All posts" always prints its count: the source echoes `$this->category->getNumItems(true)`
 * (`category/blog.php:232`), the category plus every descendant, which is what a `cat` query
 * counts. Child rows print theirs only under `show_cat_num_articles` (`blog.php:238-240`),
 * which the source's blog menu item turns off, so no child count is printed.
 * `body.item-221 .hx-railcount{display:none}` (css/page-221.css) hides the remaining one.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_term = wp_ja_kinetic_field_notes_term();
if ( ! $wp_ja_kinetic_term ) {
	return;
}
// `orderby: id ASC` — closest native-WP equivalent to the source's admin-dragged category
// order; same reasoning as `blocks/categories-index/render.php`.
$wp_ja_kinetic_children = get_categories(
	array(
		'parent'     => $wp_ja_kinetic_term->term_id,
		'hide_empty' => false,
		'orderby'    => 'id',
		'order'      => 'ASC',
	)
);
$wp_ja_kinetic_total = new WP_Query(
	array(
		'cat'                    => $wp_ja_kinetic_term->term_id,
		'post_type'              => array( 'post', 'page' ), // the category's articles, as its blog list (inc/blog-dynamic.php)
		'posts_per_page'         => 1,
		'fields'                 => 'ids',
		'update_post_meta_cache' => false,
		'update_post_term_cache' => false,
	)
);
?>
<aside class="hx-blog-rail" aria-label="Topics">
	<span class="hx-rail-title">Topics</span>
	<a class="hx-railitem is-active" href="<?php echo esc_url( get_category_link( $wp_ja_kinetic_term ) ); ?>">
		<span>All posts</span>
		<span class="hx-railcount"><?php echo esc_html( (string) $wp_ja_kinetic_total->found_posts ); ?></span>
	</a>
	<?php foreach ( $wp_ja_kinetic_children as $wp_ja_kinetic_child ) : ?>
		<a class="hx-railitem" href="<?php echo esc_url( get_category_link( $wp_ja_kinetic_child ) ); ?>">
			<span><?php echo esc_html( $wp_ja_kinetic_child->name ); ?></span>
		</a>
	<?php endforeach; ?>
</aside>
