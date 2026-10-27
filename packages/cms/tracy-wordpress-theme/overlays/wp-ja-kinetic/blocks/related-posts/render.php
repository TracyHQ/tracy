<?php
/**
 * wp-ja-kinetic/related-posts — the source's related-posts band
 * (`article/default_related.php`): the 3 newest PUBLISHED posts in the current post's own
 * category, current post excluded, newest first — same selection rule, ported as a `WP_Query`
 * (`category__in` the primary category, `post__not_in` the current post, `post_status =>
 * 'publish'`, `orderby => 'date', order => 'DESC'`, `posts_per_page => 3`). Each card: eyebrow
 *
 * The source has no separate "page" content type — a standalone article (features, pricing,
 * privacy…) and a blog post are both plain `com_content` articles, related purely by category,
 * with no content-type filter. Measured live 2026-09-22: `/product/features`'s related band
 * lists other standalone articles (Integrations, Changelog, FAQ — all "Uncategorised"), while
 * `/pages/kineticql`'s lists blog POSTS (its category, "Field notes from the on-call", holds no
 * other Page) and `/privacy-policy`'s lists only `/terms-of-service` (category "Legal", 1 other
 * member) — the same query, on the same category, picking up whichever WordPress post type
 * actually carries that term. `post_type` below is `array('post','page')` for that reason;
 * `WP_Query`'s own default (`post_type => 'post'`) would silently drop every Page.
 * (first real tag by ASSIGNMENT order, uppercased — falls back to the category name, same
 * fallback the source uses) · linked title · date + read-time.
 *
 * The eyebrow's tag pick matches the source's own rule (`tag_date ASC` — first tag assigned to
 * the article, not alphabetical): `wp_get_object_terms(..., 'orderby' => 'term_order')` reads
 * WordPress's own assignment-order column instead of `get_the_tags()`'s default (name order).
 * The seeder-side half of this contract — tags must be assigned in the source's order, not
 * alphabetised — is recorded in `posts.contract.json` (sibling to this overlay's
 * `patterns.map.json`, which only covers ACM sections, not posts).
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_current_id = get_the_ID();
if ( ! $wp_ja_kinetic_current_id ) {
	return;
}
$wp_ja_kinetic_cats = get_the_category( $wp_ja_kinetic_current_id );
if ( ! $wp_ja_kinetic_cats ) {
	return;
}
$wp_ja_kinetic_cat = $wp_ja_kinetic_cats[0];

$wp_ja_kinetic_query = new WP_Query(
	array(
		'post_type'           => array( 'post', 'page' ),
		'category__in'        => array( $wp_ja_kinetic_cat->term_id ),
		'post__not_in'        => array( $wp_ja_kinetic_current_id ),
		'post_status'         => 'publish',
		'posts_per_page'      => 3,
		/*
		 * A secondary `ID` ASC tie-break: two of the source's own related items can share the
		 * exact same `created` timestamp to the second (content.json — both "2026-07-08
		 * 09:00:00"), and the source still renders them in a fixed, repeatable order (measured
		 * live 2026-09-22: the lower Joomla article id first). A bare `orderby => 'date'` has no
		 * such tie-break — MySQL does not guarantee row order among ties. The Joomla id itself is
		 * the tie-break where the post carries it (`wp_ja_kinetic_source_article_id`, written by
		 * the run's post-seed step): WordPress ids follow seeding order, which is not the source's
		 * for pages (measured 2026-09-24: /product/features related Pricing first — Joomla 94, but
		 * the lowest WordPress id — where the source shows Integrations 91, Changelog 92, FAQ 93).
		 * `ID` ASC stays last, for a post without the key.
		 */
		'meta_query'          => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- three cards, one join.
			'relation'  => 'OR',
			'source_id' => array(
				'key'     => 'wp_ja_kinetic_source_article_id',
				'type'    => 'NUMERIC',
				'compare' => 'EXISTS',
			),
			array(
				'key'     => 'wp_ja_kinetic_source_article_id',
				'compare' => 'NOT EXISTS',
			),
		),
		'orderby'             => array(
			'date'      => 'DESC',
			'source_id' => 'ASC',
			'ID'        => 'ASC',
		),
		'no_found_rows'       => true,
		'ignore_sticky_posts' => true,
	)
);
if ( ! $wp_ja_kinetic_query->have_posts() ) {
	return;
}
?>
<section class="hx-section hx-related">
	<div class="hx-container hx-pad hx-related__inner">
		<h2 class="hx-related__title">Related posts</h2>
		<div class="hx-related__grid">
			<?php
			while ( $wp_ja_kinetic_query->have_posts() ) :
				$wp_ja_kinetic_query->the_post();
				// `term_order`, not name — matches the source's `tag_date ASC` (first tag
				// ASSIGNED, not first alphabetically). See the file docblock + posts.contract.json.
				$wp_ja_kinetic_tags    = wp_get_object_terms(
					get_the_ID(),
					'post_tag',
					array( 'orderby' => 'term_order' )
				);
				$wp_ja_kinetic_eyebrow = ( $wp_ja_kinetic_tags && ! is_wp_error( $wp_ja_kinetic_tags ) && isset( $wp_ja_kinetic_tags[0] ) )
					? $wp_ja_kinetic_tags[0]->name
					: $wp_ja_kinetic_cat->name;
				/*
				 * NOT `get_the_content()`: inside a secondary `WP_Query` loop (this one),
				 * `WP_Query::generate_postdata()` only sets the `$more` global to 1 — full
				 * content past a `<!--more-->` split — when `get_queried_object_id() ===
				 * $post->ID && ( $this->is_page() || $this->is_single() )`, and neither flag is
				 * ever true on a manually-built `WP_Query` like this one. So `get_the_content()`
				 * here always returns the TEASER only (the text before the first `<!--more-->`),
				 * undercounting every related post's word count (L-13 — measured live 2026-09-22:
				 * a 326-word post's teaser is ~30 words, reading "1 min" instead of "2 min").
				 * The raw field has no such split-point concept — reading time is a whole-post
				 * estimate on the source too (`article/default.php`'s `kinetic_readtime()` runs
				 * on the full article body, not a teaser). Top-level `ja-acm` section blocks are
				 * left out, same as `blocks/article-byline-meta`: on the source they are module
				 * output, not article text, so a content page (features, FAQ…) reads "1 min".
				 */
				$wp_ja_kinetic_rmin    = wp_ja_kinetic_readtime(
					serialize_blocks(
						array_filter(
							parse_blocks( get_post_field( 'post_content', get_the_ID() ) ),
							static fn( array $block ): bool => ! str_contains( ' ' . ( $block['attrs']['className'] ?? '' ) . ' ', ' ja-acm ' )
						)
					)
				);
				?>
				<a class="hx-related__card" href="<?php the_permalink(); ?>">
					<span class="hx-related__tag"><?php echo esc_html( mb_strtoupper( $wp_ja_kinetic_eyebrow ) ); ?></span>
					<span class="hx-related__ti"><?php the_title(); ?></span>
					<span class="hx-related__m"><?php echo esc_html( get_the_date( 'd F Y' ) . ' · ' . $wp_ja_kinetic_rmin . ' min read' ); ?></span>
				</a>
			<?php endwhile; ?>
		</div>
	</div>
</section>
<?php
wp_reset_postdata();
