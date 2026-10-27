<?php
/**
 * wp-ja-kinetic/post-readtime — see block.json. Formula shared with `related-posts` and
 * `field-notes-featured` via `wp_ja_kinetic_readtime()` (`inc/blog-dynamic.php`), matching the
 * source's own `kinetic_blog_readtime()` / `kinetic_au_readtime()` (~200 wpm, min 1).
 *
 * @package wp-ja-kinetic
 * @var array<string, mixed> $attributes Block attributes.
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_id = get_the_ID();
if ( ! $wp_ja_kinetic_id ) {
	return;
}
// get_post_field(), NOT get_the_content(): every seeded post carries a `<!--more-->` tag (the
// excerpt-teaser split), and get_the_content() outside a single-post view (global $more = 0
// there) returns ONLY the teaser before that tag plus a "read more" link — measured live
// 2026-09-22, every row showing "1 min" regardless of the article's real length. The raw stored
// field is the full post, matching the source's own `introtext . ' ' . fulltext` concatenation
// (`kinetic_blog_readtime()`/`kinetic_au_readtime()`).
$wp_ja_kinetic_min    = wp_ja_kinetic_readtime( (string) get_post_field( 'post_content', $wp_ja_kinetic_id ) );
$wp_ja_kinetic_suffix = isset( $attributes['suffix'] ) && is_string( $attributes['suffix'] ) ? $attributes['suffix'] : 'min';
$wp_ja_kinetic_class  = isset( $attributes['wrapperClassName'] ) && is_string( $attributes['wrapperClassName'] ) ? $attributes['wrapperClassName'] : 'hx-blogread';
$wp_ja_kinetic_date   = isset( $attributes['dateFormat'] ) && is_string( $attributes['dateFormat'] ) ? $attributes['dateFormat'] : '';
if ( '' !== $wp_ja_kinetic_date ) {
	// The author archive row's meta line is ONE `<div>` text run, date and read time joined by a
	// literal middle dot (`author_posts.php:44`: `<div class="hx-aupost__m">$date &middot; $readmin min</div>`).
	?>
<div class="<?php echo esc_attr( $wp_ja_kinetic_class ); ?>"><?php echo esc_html( get_the_date( $wp_ja_kinetic_date, $wp_ja_kinetic_id ) . ' · ' . $wp_ja_kinetic_min . ' ' . $wp_ja_kinetic_suffix ); ?></div>
	<?php
	return;
}
?>
<span class="<?php echo esc_attr( $wp_ja_kinetic_class ); ?>"><?php echo esc_html( $wp_ja_kinetic_min . ' ' . $wp_ja_kinetic_suffix ); ?></span>
