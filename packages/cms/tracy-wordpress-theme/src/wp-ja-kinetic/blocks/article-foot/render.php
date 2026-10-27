<?php
/**
 * wp-ja-kinetic/article-foot — see block.json. Markup copied from the source's rendered article
 * (Joomla `plg_content_pagenavigation` + the `info_block` layout inside `article/default.php`),
 * both hidden there by `single-article.css` §12 and here by the same rule in
 * `wp-ja-kinetic-article.css`.
 *
 * Prev/next: the source's blog lists newest first, so "Previous article" is the newer
 * neighbour and "Next article" the older one, within the same category; either link is left
 * out at the end of the list, as the source does. Hits: WordPress keeps no view counter, so
 * `dd.hits` always prints in the source's shape and reads the source's count from the post meta
 * key `wp_ja_kinetic_hits` (seeded content), falling back to 0 when unset. The author picture is the
 * source's shared default portrait, which this theme does not ship (images are seeded
 * separately), so the hidden `<img>` points at core's blank placeholder.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_id = get_the_ID();
if ( ! $wp_ja_kinetic_id ) {
	return;
}
// The source's prev/next walks its blog order: newest first, and equal `created` timestamps in
// ascending id order (measured live on the five "Uncategorised" shell articles, all created
// 2026-06-15 09:00:00: Features, id 90, has only "Next article: Integrations", id 91). Core breaks
// an equal-date tie the other way (`p.ID >` for the newer neighbour, `wp-includes/link-template.php`
// `get_adjacent_post()`), so the id comparison and its sort are flipped for these two lookups only.
$wp_ja_kinetic_tie = static function ( string $sql ): string {
	return strtr(
		$sql,
		array(
			'p.ID >'    => 'p.ID <',
			'p.ID <'    => 'p.ID >',
			'p.ID ASC'  => 'p.ID DESC',
			'p.ID DESC' => 'p.ID ASC',
		)
	);
};
$wp_ja_kinetic_tie_hooks = array( 'get_next_post_where', 'get_previous_post_where', 'get_next_post_sort', 'get_previous_post_sort' );
foreach ( $wp_ja_kinetic_tie_hooks as $wp_ja_kinetic_hook ) {
	add_filter( $wp_ja_kinetic_hook, $wp_ja_kinetic_tie );
}
// A content page's neighbours are every article in its category, posts included: the source has
// one article type, so `/pages/kineticql` (category "Field notes from the on-call") walks the blog
// posts around it. Core limits the lookup to the current post type (`AND p.post_type = %s`,
// `get_adjacent_post()`), so for a page that clause is widened to posts + pages. The page's own blog
// twin — the same source article imported once as this page and once as a post, same title and date
// — is left out, as the source never lists an article as its own neighbour. Posts keep core's rule.
$wp_ja_kinetic_types = null;
if ( 'page' === get_post_type( $wp_ja_kinetic_id ) ) {
	$wp_ja_kinetic_types = static function ( string $where ) use ( $wp_ja_kinetic_id ): string {
		global $wpdb;
		return str_replace( "p.post_type = 'page'", "p.post_type IN ('post','page')", $where )
			. $wpdb->prepare( ' AND NOT ( p.post_title = %s AND p.post_date = %s )', get_post_field( 'post_title', $wp_ja_kinetic_id ), get_post_field( 'post_date', $wp_ja_kinetic_id ) );
	};
	add_filter( 'get_next_post_where', $wp_ja_kinetic_types );
	add_filter( 'get_previous_post_where', $wp_ja_kinetic_types );
}
$wp_ja_kinetic_newer = get_adjacent_post( true, '', false );
$wp_ja_kinetic_older = get_adjacent_post( true, '', true );
foreach ( $wp_ja_kinetic_tie_hooks as $wp_ja_kinetic_hook ) {
	remove_filter( $wp_ja_kinetic_hook, $wp_ja_kinetic_tie );
}
if ( $wp_ja_kinetic_types ) {
	remove_filter( 'get_next_post_where', $wp_ja_kinetic_types );
	remove_filter( 'get_previous_post_where', $wp_ja_kinetic_types );
}
$wp_ja_kinetic_name  = get_the_author();
$wp_ja_kinetic_aurl  = get_author_posts_url( (int) get_post_field( 'post_author', $wp_ja_kinetic_id ) );
$wp_ja_kinetic_cats  = get_the_category( $wp_ja_kinetic_id );
$wp_ja_kinetic_cat   = $wp_ja_kinetic_cats ? $wp_ja_kinetic_cats[0] : null;
$wp_ja_kinetic_iso   = get_the_date( 'c', $wp_ja_kinetic_id );
$wp_ja_kinetic_date  = get_the_date( 'd F Y', $wp_ja_kinetic_id );
$wp_ja_kinetic_hits  = (int) get_post_meta( $wp_ja_kinetic_id, 'wp_ja_kinetic_hits', true );

if ( $wp_ja_kinetic_newer || $wp_ja_kinetic_older ) :
	?>
<nav class="pagenavigation" aria-label="Page Navigation"><span class="pagination ms-0">
	<?php if ( $wp_ja_kinetic_newer ) : ?>
<a class="btn btn-sm btn-secondary previous" href="<?php echo esc_url( get_permalink( $wp_ja_kinetic_newer ) ); ?>" rel="prev"><span class="visually-hidden"><?php echo esc_html( 'Previous article: ' . get_the_title( $wp_ja_kinetic_newer ) ); ?></span><span class="icon-chevron-left" aria-hidden="true"></span> <span aria-hidden="true">Prev</span></a>
	<?php endif; ?>
	<?php if ( $wp_ja_kinetic_older ) : ?>
<a class="btn btn-sm btn-secondary next" href="<?php echo esc_url( get_permalink( $wp_ja_kinetic_older ) ); ?>" rel="next"><span class="visually-hidden"><?php echo esc_html( 'Next article: ' . get_the_title( $wp_ja_kinetic_older ) ); ?></span><span aria-hidden="true">Next</span> <span class="icon-chevron-right" aria-hidden="true"></span></a>
	<?php endif; ?>
</span></nav>
<?php endif; ?>
<?php
// The info block prints only when the article's `info_block_position` is 1 or 2
// (`article/default.php`, `$info == 1 || $info == 2`). Measured on the source: every blog article
// carries 1; the Uncategorised/Legal shell articles carry `{}` (the global default, 0) and print no
// footer, `/pages/kineticql` carries 1. Seeded as post meta `wp_ja_kinetic_info_block_position`
// (posts.contract.json → contentPages.infoBlock); unset falls back to the source's usual value per
// post type — 1 for a post, 0 for a page.
$wp_ja_kinetic_info = get_post_meta( $wp_ja_kinetic_id, 'wp_ja_kinetic_info_block_position', true );
if ( '' === $wp_ja_kinetic_info ) {
	$wp_ja_kinetic_info = 'page' === get_post_type( $wp_ja_kinetic_id ) ? 0 : 1;
}
if ( ! in_array( (int) $wp_ja_kinetic_info, array( 1, 2 ), true ) ) {
	return;
}
?>
<footer class="hx-article__foot"><dl class="article-info text-muted">
<dt class="article-info-term">Details</dt>
<dd class="createdby" itemprop="author" itemscope itemtype="https://schema.org/Person"><span class="author-img"><a href="<?php echo esc_url( $wp_ja_kinetic_aurl ); ?>" title="<?php echo esc_attr( $wp_ja_kinetic_name ); ?>"><img src="<?php echo esc_url( includes_url( 'images/blank.gif' ) ); ?>" alt="<?php echo esc_attr( $wp_ja_kinetic_name ); ?>"></a></span> By <a href="<?php echo esc_url( $wp_ja_kinetic_aurl ); ?>" itemprop="url"><span itemprop="name"><?php echo esc_html( $wp_ja_kinetic_name ); ?></span></a></dd>
<span style="display: none;" itemprop="publisher" itemtype="http://schema.org/Organization" itemscope><span itemprop="name"><?php echo esc_html( $wp_ja_kinetic_name ); ?></span></span>
<?php if ( $wp_ja_kinetic_cat ) : ?>
<dd class="category-name">Category: <a href="<?php echo esc_url( get_category_link( $wp_ja_kinetic_cat ) ); ?>" itemprop="genre"><?php echo esc_html( $wp_ja_kinetic_cat->name ); ?></a></dd>
<?php endif; ?>
<dd class="published"><span class="fa fa-calendar" aria-hidden="true"></span><time datetime="<?php echo esc_attr( $wp_ja_kinetic_iso ); ?>" itemprop="datePublished"><?php echo esc_html( $wp_ja_kinetic_date ); ?></time></dd>
<?php
// `dd.create` follows the menu item the source renders the article under: the blog item
// (`product/blog`, id 221) sets `show_create_date` 1, while a content page's own single-article item
// (`pages/kineticql`, id 230) sets nothing and inherits com_content's global 0 — measured on the
// source DB 2026-09-23. So posts print it, pages do not.
if ( 'page' !== get_post_type( $wp_ja_kinetic_id ) ) :
	?>
<dd class="create"><span class="fa fa-calendar" aria-hidden="true"></span><time datetime="<?php echo esc_attr( $wp_ja_kinetic_iso ); ?>" itemprop="dateCreated"><?php echo esc_html( $wp_ja_kinetic_date ); ?></time></dd>
<?php endif; ?>
<dd class="hits"><span class="fa fa-eye" aria-hidden="true"></span><meta itemprop="interactionCount" content="<?php echo esc_attr( 'UserPageVisits:' . $wp_ja_kinetic_hits ); ?>"><?php echo esc_html( 'Hits: ' . $wp_ja_kinetic_hits ); ?></dd>
</dl></footer>
