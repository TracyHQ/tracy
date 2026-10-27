<?php
/**
 * wp-ja-kinetic/author-identity — the source's sidebar identity card
 * (`author/author.php` + `author_info.php`, "aside" variant): real avatar, name, job title,
 * published-post count and bio. Bio is WordPress's own author-bio field
 * (`get_the_author_meta('description')`). Job title (source `.hx-auaside__role`, e.g. "Staff SRE")
 * has no WordPress core field — it comes from the `wp_ja_kinetic_job_title` user meta key this
 * theme defines for it (`posts.contract.json` §authors — the seeder must write it from the
 * source's Joomla custom profile field); empty until seeded, in which case the role/separator are
 * simply not rendered — not a block-capability gap, a genuinely absent-until-seeded data source.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_author = get_queried_object();
if ( ! ( $wp_ja_kinetic_author instanceof WP_User ) ) {
	return;
}
$wp_ja_kinetic_count = count_user_posts( $wp_ja_kinetic_author->ID, 'post', true );
// Raw user meta, NOT get_the_author_meta( 'description', … ): that call passes through the
// `get_the_author_description` filter (`inc/blog-dynamic.php`'s `wp_ja_kinetic_author_masthead_sub()`),
// which substitutes the tagline field ahead of bio for the MASTHEAD subtitle a few lines above this
// block in `templates/author.html`. This aside card is a separate element the source always fills
// with the real bio (`profile.aboutme`, `author_info.php`) regardless of whether a tagline is set —
// measured live 2026-09-22: with both fields present the source's card still shows the bio text, not
// the tagline.
$wp_ja_kinetic_bio  = trim( (string) get_user_meta( $wp_ja_kinetic_author->ID, 'description', true ) );
$wp_ja_kinetic_role = trim( (string) get_the_author_meta( 'wp_ja_kinetic_job_title', $wp_ja_kinetic_author->ID ) );
?>
<div class="hx-auaside" itemscope itemtype="https://schema.org/Person">
	<div class="hx-auav hx-auav--lg" aria-hidden="true">
		<?php echo get_avatar( $wp_ja_kinetic_author->ID, 88, '', $wp_ja_kinetic_author->display_name, array( 'class' => 'hx-auav__img' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- get_avatar() escapes its own markup. ?>
	</div>
	<div class="hx-auaside__nm">
		<div class="hx-auaside__n" itemprop="name"><?php echo esc_html( $wp_ja_kinetic_author->display_name ); ?></div>
		<div class="hx-auaside__meta">
			<?php if ( '' !== $wp_ja_kinetic_role ) : ?>
				<span class="hx-auaside__role"><?php echo esc_html( $wp_ja_kinetic_role ); ?></span> &middot;
			<?php endif; ?>
			<span class="hx-auaside__c"><?php echo esc_html( (string) $wp_ja_kinetic_count ); ?> articles</span>
		</div>
	</div>
	<?php if ( '' !== $wp_ja_kinetic_bio ) : ?>
		<p class="hx-auaside__bio" itemprop="description"><?php echo esc_html( $wp_ja_kinetic_bio ); ?></p>
	<?php endif; ?>
</div>
