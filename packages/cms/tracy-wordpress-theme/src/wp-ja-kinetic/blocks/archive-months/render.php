<?php
/**
 * wp-ja-kinetic/archive-months — the source's "BY MONTH" rail (`archive/default.php:120-145`):
 * real year/month post counts (`wp_get_archives()`'s own query, same data WordPress's native
 * `/YYYY/MM/` archives are built from) and the currently-viewed month marked active.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

global $wpdb;
// `archivedOnly` (templates/page-archive.html): the source's Article Archive counts Joomla's
// ARCHIVED articles only — the ones the seeder tags `archived` — and links "All posts" to itself.
$wp_ja_kinetic_archived_only = ! empty( $attributes['archivedOnly'] );
if ( $wp_ja_kinetic_archived_only ) {
	$wp_ja_kinetic_rows = $wpdb->get_results(
		"SELECT YEAR(p.post_date) AS y, MONTH(p.post_date) AS m, COUNT(p.ID) AS c
		 FROM {$wpdb->posts} p
		 JOIN {$wpdb->term_relationships} tr ON tr.object_id = p.ID
		 JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id AND tt.taxonomy = 'post_tag'
		 JOIN {$wpdb->terms} t ON t.term_id = tt.term_id AND t.slug = 'archived'
		 WHERE p.post_type = 'post' AND p.post_status = 'publish'
		 GROUP BY YEAR(p.post_date), MONTH(p.post_date)
		 ORDER BY p.post_date DESC"
	);
} else {
	$wp_ja_kinetic_rows = $wpdb->get_results(
		"SELECT YEAR(post_date) AS y, MONTH(post_date) AS m, COUNT(ID) AS c
		 FROM {$wpdb->posts}
		 WHERE post_type = 'post' AND post_status = 'publish'
		 GROUP BY YEAR(post_date), MONTH(post_date)
		 ORDER BY post_date DESC"
	);
}
$wp_ja_kinetic_all_href = $wp_ja_kinetic_archived_only ? get_permalink() : ( get_post_type_archive_link( 'post' ) ?: home_url( '/' ) );
// `year`/`monthnum` are only populated as separate query vars on a pretty-permalink /YYYY/MM/
// URL; the `m=YYYYMM` shorthand (this stand's plain permalinks, and the query string WordPress
// itself accepts sitewide) leaves them unset and carries the combined value in `m` instead —
// measured directly on this theme's own `?m=202607` request. Parsed from `m` when present so
// both URL shapes mark the same month active.
$wp_ja_kinetic_m_var = (string) get_query_var( 'm' );
if ( '' !== $wp_ja_kinetic_m_var && strlen( $wp_ja_kinetic_m_var ) >= 6 ) {
	$wp_ja_kinetic_cur_year  = (int) substr( $wp_ja_kinetic_m_var, 0, 4 );
	$wp_ja_kinetic_cur_month = (int) substr( $wp_ja_kinetic_m_var, 4, 2 );
} else {
	$wp_ja_kinetic_cur_year  = (int) get_query_var( 'year' );
	$wp_ja_kinetic_cur_month = (int) get_query_var( 'monthnum' );
}
?>
<aside class="hx-arch-rail hx-arch-months" aria-label="By month">
	<span class="hx-arch-rail__h">By month</span>
	<a class="hx-monthrow<?php echo ( ! $wp_ja_kinetic_cur_year && ! $wp_ja_kinetic_cur_month ) ? ' is-active' : ''; ?>" href="<?php echo esc_url( $wp_ja_kinetic_all_href ); ?>">
		<span class="hx-monthrow__m">All posts</span>
	</a>
	<?php foreach ( $wp_ja_kinetic_rows as $wp_ja_kinetic_row ) :
		$wp_ja_kinetic_y = (int) $wp_ja_kinetic_row->y;
		$wp_ja_kinetic_m = (int) $wp_ja_kinetic_row->m;
		if ( ! $wp_ja_kinetic_y || ! $wp_ja_kinetic_m ) {
			continue;
		}
		$wp_ja_kinetic_active = ( $wp_ja_kinetic_y === $wp_ja_kinetic_cur_year && $wp_ja_kinetic_m === $wp_ja_kinetic_cur_month );
		?>
		<a class="hx-monthrow<?php echo $wp_ja_kinetic_active ? ' is-active' : ''; ?>" href="<?php echo esc_url( get_month_link( $wp_ja_kinetic_y, $wp_ja_kinetic_m ) ); ?>">
			<span class="hx-monthrow__m"><?php echo esc_html( wp_date( 'F Y', gmmktime( 0, 0, 0, $wp_ja_kinetic_m, 1, $wp_ja_kinetic_y ), new DateTimeZone( 'UTC' ) ) ); ?></span>
			<span class="hx-monthrow__c"><?php echo esc_html( (string) $wp_ja_kinetic_row->c ); ?></span>
		</a>
	<?php endforeach; ?>
</aside>
