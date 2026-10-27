<?php
/**
 * wp-ja-kinetic/tags-cloud — the source's tags index (`com_tags`, `.com-tags__cloud`,
 * `.kinetic-tags-*`): every tag with at least one published post, as a pill carrying its name and
 * post count. Unlike categories/authors, WordPress's own "tag" taxonomy already carries exactly
 * the fields the source shows (name, slug, count) — no data gap here.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_tags = get_tags( array( 'hide_empty' => true ) );
if ( ! $wp_ja_kinetic_tags ) {
	return;
}
?>
<div class="com-tags tag-category kinetic-tags-page">
	<div class="com-tags__masthead kinetic-tags-masthead hx-grid-bg">
		<div class="hx-container kinetic-tags-mast-inner">
			<span class="hx-eyebrow kinetic-eyebrow kinetic-tags-eyebrow"><?php esc_html_e( 'TAGS', 'wp-ja-kinetic' ); ?></span>
			<h1 class="hx-h1 com-tags__title kinetic-tags-h1"><?php esc_html_e( 'Browse by tag', 'wp-ja-kinetic' ); ?></h1>
			<p class="hx-mast-sub com-tags__sub kinetic-tags-sub"><?php esc_html_e( 'Find posts by the topics that matter to your stack.', 'wp-ja-kinetic' ); ?></p>
		</div>
	</div>
	<div class="com-tags__cloud-wrap kinetic-tags-body">
		<div class="hx-container">
			<ul class="com-tags__cloud kinetic-tags-cloud-list">
				<?php foreach ( $wp_ja_kinetic_tags as $wp_ja_kinetic_tag ) : ?>
					<li class="com-tags__cloud-item">
						<a class="kinetic-tags-pill com-tags__pill" href="<?php echo esc_url( get_tag_link( $wp_ja_kinetic_tag ) ); ?>">
							<span class="com-tags__pill-label"><?php echo esc_html( $wp_ja_kinetic_tag->name ); ?></span>
							<span class="com-tags__pill-count"><?php echo esc_html( (string) $wp_ja_kinetic_tag->count ); ?></span>
						</a>
					</li>
				<?php endforeach; ?>
			</ul>
		</div>
	</div>
</div>
