<?php
/**
 * wp-ja-kinetic/authors-directory — the source's authors index
 * (`html/com_content/author/list.php` + `list_items.php`, `.hx-authors`): every author with at
 * least one published post, avatar, name, job title and article count. Job title (source
 * `.hx-aucard__r`, e.g. "Staff SRE") reads the `wp_ja_kinetic_job_title` user meta key this theme
 * defines for it (`posts.contract.json` §authors — the seeder must write it from the source's
 * Joomla custom profile field, the same key `author-identity` reads); empty until seeded, in
 * which case the line is simply not rendered rather than guessed.
 *
 * Selection + order (measured live on the running source, `/product/authors`, 2026-09-22): the
 * source selects by Joomla USER-GROUP membership (`$authorsUrl` in `author.php` builds
 * `…&gid[0]=3`, the "Author" group), not by who has a published post — its rendered order
 * (Priya Raman, Arjun Mehta, Lena Park, Tomás Rivera) matches those four users' `id` column
 * ascending (551-554) exactly, i.e. Joomla-user-creation order; a user in a DIFFERENT group who
 * happens to have posts (measured: "Tracy Agent") does not appear, confirming it is a group
 * filter, not a post-count filter. WordPress's closest equivalent is its own core "Author" role,
 * ordered by `ID` ascending (WordPress user-creation order, the same relationship).
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_authors = get_users(
	array(
		'role'    => 'author',
		'orderby' => 'ID',
		'order'   => 'ASC',
	)
);
if ( ! $wp_ja_kinetic_authors ) {
	return;
}
?>
<div class="com-content-author hx-authors">
	<header class="hx-authors__head hx-grid-bg">
		<div class="hx-container hx-authors__head-inner">
			<span class="hx-au-pill"><span class="hx-au-pill__dot"></span><span class="hx-au-pill__t"><?php esc_html_e( 'Authors', 'wp-ja-kinetic' ); ?></span></span>
			<h1 class="hx-authors__title"><?php esc_html_e( 'Our writers', 'wp-ja-kinetic' ); ?></h1>
			<p class="hx-authors__sub"><?php esc_html_e( 'The engineers and operators behind the Kinetic blog.', 'wp-ja-kinetic' ); ?></p>
		</div>
	</header>
	<section class="hx-authors__body">
		<div class="hx-container">
			<div class="hx-authors__grid">
				<?php foreach ( $wp_ja_kinetic_authors as $wp_ja_kinetic_author ) : ?>
					<?php
					$wp_ja_kinetic_count = count_user_posts( $wp_ja_kinetic_author->ID, 'post', true );
					$wp_ja_kinetic_role  = trim( (string) get_the_author_meta( 'wp_ja_kinetic_job_title', $wp_ja_kinetic_author->ID ) );
					?>
					<a class="hx-aucard" href="<?php echo esc_url( get_author_posts_url( $wp_ja_kinetic_author->ID ) ); ?>" itemscope itemtype="https://schema.org/Person">
						<div class="hx-auav" aria-hidden="true"><?php echo get_avatar( $wp_ja_kinetic_author->ID, 72, '', $wp_ja_kinetic_author->display_name, array( 'class' => 'hx-auav__img' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- get_avatar() escapes its own markup. ?></div>
						<div class="hx-aucard__nm">
							<div class="hx-aucard__n" itemprop="name"><?php echo esc_html( $wp_ja_kinetic_author->display_name ); ?></div>
							<?php if ( '' !== $wp_ja_kinetic_role ) : ?>
								<div class="hx-aucard__r"><?php echo esc_html( $wp_ja_kinetic_role ); ?></div>
							<?php endif; ?>
						</div>
						<div class="hx-aucard__c"><?php echo esc_html( (string) $wp_ja_kinetic_count ); ?> <?php esc_html_e( 'articles', 'wp-ja-kinetic' ); ?></div>
					</a>
				<?php endforeach; ?>
			</div>
		</div>
	</section>
</div>
