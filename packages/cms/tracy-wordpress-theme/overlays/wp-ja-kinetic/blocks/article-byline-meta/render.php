<?php
/**
 * wp-ja-kinetic/article-byline-meta — see block.json. Role is a PER-ARTICLE Joomla custom
 * field (`article/default.php:72-78`, `FieldsHelper::getFields(...)` reading a field named
 * `author_role`), NOT the per-USER job title `author-identity`/`authors-directory` read
 * (`posts.contract.json` §authors.jobTitle) — measured live: two articles by the same byline
 * name rendered different role text (one empty), which a per-user field could not produce.
 * Reads the post meta key this theme defines for it, `wp_ja_kinetic_article_author_role`;
 * falls back to nothing (not the user's job title) when unset, matching the source's own empty
 * state for an article whose custom field was never filled in. Date format and the "%d min
 * read" suffix are the source's own (`DATE_FORMAT_LC3` measured live as "d F Y";
 * `TPL_JA_KINETIC_BLOG_READMIN`).
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_id = get_the_ID();
if ( ! $wp_ja_kinetic_id ) {
	return;
}
$wp_ja_kinetic_role = trim( (string) get_post_meta( $wp_ja_kinetic_id, 'wp_ja_kinetic_article_author_role', true ) );
// Read time counts the article's own text only, as the source does (`kinetic_readtime()` on the
// article's introtext + fulltext): a content page's ACM sections are module output there — the
// shell article's text is just `{loadposition features-page,none}`, so those pages read "1 min" —
// while here they are the page's own top-level `ja-acm` blocks, so they are left out of the count.
$wp_ja_kinetic_text = serialize_blocks(
	array_filter(
		parse_blocks( get_the_content( null, false, $wp_ja_kinetic_id ) ),
		static fn( array $block ): bool => ! str_contains( ' ' . ( $block['attrs']['className'] ?? '' ) . ' ', ' ja-acm ' )
	)
);

$wp_ja_kinetic_bits = array();
if ( '' !== $wp_ja_kinetic_role ) {
	$wp_ja_kinetic_bits[] = esc_html( $wp_ja_kinetic_role );
}
// The byline's date is `post_date` (the source's `created`, which every list prints), unless the
// article carries `wp_ja_kinetic_byline_date`: an article whose own menu item leaves the global
// default prints its `publish_up` here instead (source article/default.php:188-192; written by the
// run's post-seed step — /pages/kineticql: "20 June 2026" here, "Jun 22 2026" on its blog row).
$wp_ja_kinetic_byline_date = (string) get_post_meta( $wp_ja_kinetic_id, 'wp_ja_kinetic_byline_date', true );
$wp_ja_kinetic_bits[]      = esc_html(
	'' !== $wp_ja_kinetic_byline_date
		? wp_date( 'd F Y', strtotime( $wp_ja_kinetic_byline_date ), new DateTimeZone( 'UTC' ) )
		: get_the_date( 'd F Y', $wp_ja_kinetic_id )
);
$wp_ja_kinetic_bits[] = esc_html(
	sprintf(
		/* translators: %d: reading time in minutes. */
		__( '%d min read', 'wp-ja-kinetic' ),
		wp_ja_kinetic_readtime( $wp_ja_kinetic_text )
	)
);
?>
<span class="hx-author__meta"><?php echo implode( ' &middot; ', $wp_ja_kinetic_bits ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- esc_html'd per item above. ?></span>
