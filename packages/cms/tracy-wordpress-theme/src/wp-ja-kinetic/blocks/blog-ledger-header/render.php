<?php
/**
 * wp-ja-kinetic/blog-ledger-header — `category/blog.php:249-253`: "All articles" +
 * "// NN posts &middot; newest first", NN the CURRENT category archive's real live post count.
 * Source reads `$this->pagination->total` (the full category total, computed before the featured
 * post is lifted out). Registered on both `category-field-notes-from-the-on-call.html` and the
 * generic `category.html` (the 5 child categories), same as `blog-topics-items` above — the
 * source's header is per-category on every one of those pages, not fixed to the top blog category.
 *
 * NN counts posts AND pages in the category: the source has one article type, and an article
 * reached through its own menu item (`/pages/kineticql`, a Page here) is still a row of its
 * category's blog list — measured on the running source 2026-09-24: "// 61 posts", kineticql listed
 * on page 3, "Jun 22 2026", linking `/index.php/pages/kineticql`. The seeder makes that article a Page
 * only (the steps 4–5 probe had also seeded it as a separate Post, which this count once had to
 * exclude); the grid below lists the same two types (`wp_ja_kinetic_force_posts_per_page()`).
 *
 * Only rendered when the row list is non-empty, same as the source (`<?php if (!empty($rows))`).
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_term = wp_ja_kinetic_current_category_term();
if ( ! $wp_ja_kinetic_term ) {
	return;
}
$wp_ja_kinetic_count = ( new WP_Query(
	array(
		'post_type'      => array( 'post', 'page' ),
		'category__in'   => array( $wp_ja_kinetic_term->term_id ),
		'posts_per_page'  => 1,
		'no_found_rows'   => false,
		'fields'          => 'ids',
		'ignore_sticky_posts' => true,
	)
) )->found_posts;
if ( 0 === (int) $wp_ja_kinetic_count ) {
	return;
}
?>
<div class="hx-bloglist__head">
	<span class="hx-bloglist__title">All articles</span>
	<span class="hx-bloglist__count">// <?php echo esc_html( str_pad( (string) $wp_ja_kinetic_count, 2, '0', STR_PAD_LEFT ) ); ?> posts &middot; newest first</span>
</div>
