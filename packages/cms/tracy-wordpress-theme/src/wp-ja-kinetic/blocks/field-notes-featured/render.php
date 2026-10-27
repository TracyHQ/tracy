<?php
/**
 * wp-ja-kinetic/field-notes-featured — the source's "(01) Featured read" card
 * (`category/blog.php:177-221`): the newest post in the category archive CURRENTLY BEING
 * VIEWED, its own image, category, excerpt, author, date and read-time — real values, one live
 * query (cached with the query-exclusion filter in inc/blog-dynamic.php so the same post never
 * doubles into the grid below). Registered on both `category-field-notes-from-the-on-call.html`
 * and the generic `category.html` (the 5 child categories) — the source lifts a featured post on
 * every category.blog-layout page, not just the top blog.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_post = wp_ja_kinetic_category_featured_post();
if ( ! $wp_ja_kinetic_post ) {
	return;
}

// Eyebrow: the post's primary tag, falling back to its category only when it has no tags — the same
// rule as the row eyebrow in `blocks/post-topic-eyebrow/render.php` (`wp_ja_kinetic_post_topic()`).
$wp_ja_kinetic_cat = wp_ja_kinetic_post_topic( $wp_ja_kinetic_post->ID );
$wp_ja_kinetic_excerpt    = trim( wp_strip_all_tags( get_the_excerpt( $wp_ja_kinetic_post ) ) );
if ( '' !== $wp_ja_kinetic_excerpt ) {
	// Source: category/blog.php:186, `HTMLHelper::_('string.truncate', $fExcerpt, 180, true, false)`.
	$wp_ja_kinetic_excerpt = wp_ja_kinetic_joomla_truncate( $wp_ja_kinetic_excerpt, 180 );
}
$wp_ja_kinetic_author = wp_ja_kinetic_post_author_name( $wp_ja_kinetic_post );
$wp_ja_kinetic_date    = get_the_date( '', $wp_ja_kinetic_post );
$wp_ja_kinetic_read    = wp_ja_kinetic_readtime( $wp_ja_kinetic_post->post_content );
$wp_ja_kinetic_has_img = has_post_thumbnail( $wp_ja_kinetic_post );
?>
<section class="hx-section hx-feat-section">
	<div class="hx-container hx-pad">
		<div class="hx-feat-head">
			<span class="hx-feat-head__l"><span class="hx-feat-num">(01)</span> Featured read</span>
			<span class="hx-feat-head__r">Editor&#39;s pick</span>
		</div>
		<a class="hx-featcard" href="<?php echo esc_url( get_permalink( $wp_ja_kinetic_post ) ); ?>">
			<span class="hx-featcard__media<?php echo $wp_ja_kinetic_has_img ? '' : ' is-empty'; ?>"<?php echo $wp_ja_kinetic_has_img ? ' style="background-image:url(\'' . esc_url( get_the_post_thumbnail_url( $wp_ja_kinetic_post, 'large' ) ) . '\')"' : ''; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- esc_url'd above. ?>>
				<span class="hx-featcard__sigil" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
				</span>
			</span>
			<span class="hx-featcard__body">
				<?php if ( '' !== $wp_ja_kinetic_cat ) : ?>
					<span class="hx-featcard__cat"><?php echo esc_html( strtoupper( $wp_ja_kinetic_cat ) ); ?></span>
				<?php endif; ?>
				<span class="hx-featcard__title"><?php echo esc_html( get_the_title( $wp_ja_kinetic_post ) ); ?></span>
				<?php if ( '' !== $wp_ja_kinetic_excerpt ) : ?>
					<?php // wp_ja_kinetic_esc_html_no_texturize(): protects the truncation's trailing "..." from
					// wptexturize() → "…" (inc/blog-dynamic.php has the full mechanism note). ?>
					<span class="hx-featcard__excerpt"><?php echo wp_ja_kinetic_esc_html_no_texturize( $wp_ja_kinetic_excerpt ); ?></span>
				<?php endif; ?>
				<span class="hx-featcard__meta">
					<?php
					$wp_ja_kinetic_bits = array();
					if ( '' !== $wp_ja_kinetic_author ) {
						$wp_ja_kinetic_bits[] = esc_html( $wp_ja_kinetic_author );
					}
					$wp_ja_kinetic_bits[] = esc_html( $wp_ja_kinetic_date );
					$wp_ja_kinetic_bits[] = esc_html( $wp_ja_kinetic_read ) . ' min';
					echo implode( ' &middot; ', $wp_ja_kinetic_bits ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- esc_html'd per item above.
					?>
				</span>
			</span>
		</a>
	</div>
</section>
