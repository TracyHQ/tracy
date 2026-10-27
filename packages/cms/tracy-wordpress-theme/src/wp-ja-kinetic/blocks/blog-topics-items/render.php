<?php
/**
 * wp-ja-kinetic/blog-topics-items — "All posts" + the real children of the category ARCHIVE
 * CURRENTLY BEING VIEWED + the 6 most-used published tags, ALL merged into one `$topicChips` list
 * in the source (`category/blog.php:95-126`) — categories first, then tags, every item the SAME
 * `hx-blogtopics__chip` class, no separate tag-cloud block. Counts are never shown here (the
 * source's topics strip does not show them either — only the rail does).
 *
 * This block is registered on BOTH `category-field-notes-from-the-on-call.html` (the top blog)
 * and the generic `category.html` (the 5 child categories) — the source's own topicChips logic
 * is identical on every category.blog-layout page: "All posts" always links to and marks active
 * THIS category (not a fixed top category), and the "real children" bucket is THIS category's
 * own children (non-empty only for the top blog, which is why child-category pages render just
 * "All posts" + tags, no extra category chips — proven live 2026-09-22, `/product/blog/30-
 * incident-retros` renders exactly that).
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_term = wp_ja_kinetic_current_category_term();
if ( ! $wp_ja_kinetic_term ) {
	return;
}
// `orderby: id ASC` — the closest native-WP equivalent to the source's admin-dragged category
// order (no WP core mechanism carries an arbitrary admin order without a plugin); matches when
// the seeder creates categories in the source's own order, same reasoning as
// `blocks/categories-index/render.php`.
$wp_ja_kinetic_children = get_categories(
	array(
		'parent'     => $wp_ja_kinetic_term->term_id,
		'hide_empty' => false,
		'orderby'    => 'id',
		'order'      => 'ASC',
	)
);
// Source: `ORDER BY cnt DESC, t.title ASC`, `LIMIT 6`, tags with id > 1 (Joomla's ROOT tag).
$wp_ja_kinetic_tags = get_tags(
	array(
		'hide_empty' => true,
		'orderby'    => 'count',
		'order'      => 'DESC',
		'number'     => 6,
	)
);
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
<li><a class="hx-blogtopics__chip is-active" href="<?php echo esc_url( get_category_link( $wp_ja_kinetic_term ) ); ?>">All posts</a></li>
<?php foreach ( $wp_ja_kinetic_children as $wp_ja_kinetic_child ) : ?>
	<li><a class="hx-blogtopics__chip" href="<?php echo esc_url( get_category_link( $wp_ja_kinetic_child ) ); ?>"><?php echo esc_html( $wp_ja_kinetic_child->name ); ?></a></li>
<?php endforeach; ?>
<?php foreach ( $wp_ja_kinetic_tags as $wp_ja_kinetic_tag ) : ?>
	<li><a class="hx-blogtopics__chip" href="<?php echo esc_url( get_tag_link( $wp_ja_kinetic_tag ) ); ?>"><?php echo esc_html( $wp_ja_kinetic_tag->name ); ?></a></li>
<?php endforeach; ?>
