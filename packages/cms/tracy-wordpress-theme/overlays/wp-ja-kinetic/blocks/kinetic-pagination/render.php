<?php
/**
 * wp-ja-kinetic/kinetic-pagination — see block.json. The two helpers this render needs
 * (`wp_ja_kinetic_pagination_icon()`, `wp_ja_kinetic_pagination_targets()`) live in
 * inc/blog-dynamic.php: a `render.php` is `require`d fresh by core every time a block
 * instance renders, so a top-level `function` declared in here would fatal
 * ("cannot redeclare") the moment this block is used twice on one page (a paginated
 * grid plus, say, a themed reference elsewhere) — the shared file is loaded once.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

global $wp_query;
$wp_ja_kinetic_max = isset( $wp_query->max_num_pages ) ? (int) $wp_query->max_num_pages : 1;
if ( $wp_ja_kinetic_max < 2 ) {
	return;
}
$wp_ja_kinetic_current = max( 1, (int) get_query_var( 'paged' ) );
// Labels as Joomla core's pager writes them (`layouts/joomla/pagination/link.php`, measured on the
// source's /index.php/product/blog): "Go to first page", "Go to previous page", "Go to page N",
// "Page N" on the current one, "Go to next page", "Go to last page".

$wp_ja_kinetic_counter_class = isset( $attributes['counterClassName'] ) && is_string( $attributes['counterClassName'] ) ? $attributes['counterClassName'] : 'counter hx-muted';
$wp_ja_kinetic_counter_first = ! empty( $attributes['counterFirst'] );
?>
<?php if ( $wp_ja_kinetic_counter_first ) : ?>
	<?php echo wp_ja_kinetic_pagination_counter( $wp_ja_kinetic_counter_class, $wp_ja_kinetic_current, $wp_ja_kinetic_max ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped inside the helper. ?>
<?php endif; ?>
<nav role="navigation" aria-label="Pagination">
	<ul class="pagination">
		<?php
		echo wp_ja_kinetic_pagination_icon( 1 === $wp_ja_kinetic_current ? false : 1, 'first', 'Go to first page' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped inside the helper.
		echo wp_ja_kinetic_pagination_icon( 1 === $wp_ja_kinetic_current ? false : $wp_ja_kinetic_current - 1, 'prev', 'Go to previous page' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped inside the helper.
		foreach ( wp_ja_kinetic_pagination_targets( $wp_ja_kinetic_current, $wp_ja_kinetic_max ) as $wp_ja_kinetic_p ) :
			$wp_ja_kinetic_is_current = ( $wp_ja_kinetic_p === $wp_ja_kinetic_current );
			?>
			<li class="<?php echo $wp_ja_kinetic_is_current ? 'active page-item' : 'page-item'; ?>">
				<a
					<?php echo $wp_ja_kinetic_is_current ? 'aria-current="true"' : ''; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed literal. ?>
					aria-label="<?php echo esc_attr( $wp_ja_kinetic_is_current ? sprintf( /* translators: %d: page number. */ __( 'Page %d', 'wp-ja-kinetic' ), $wp_ja_kinetic_p ) : sprintf( /* translators: %d: page number. */ __( 'Go to page %d', 'wp-ja-kinetic' ), $wp_ja_kinetic_p ) ); ?>"
					href="<?php echo esc_url( wp_ja_kinetic_pagenum_link( $wp_ja_kinetic_p, $wp_ja_kinetic_current ) ); ?>"
					class="page-link"
				><?php echo esc_html( (string) $wp_ja_kinetic_p ); ?></a>
			</li>
			<?php
		endforeach;
		echo wp_ja_kinetic_pagination_icon( $wp_ja_kinetic_current === $wp_ja_kinetic_max ? false : $wp_ja_kinetic_current + 1, 'next', 'Go to next page' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped inside the helper.
		echo wp_ja_kinetic_pagination_icon( $wp_ja_kinetic_current === $wp_ja_kinetic_max ? false : $wp_ja_kinetic_max, 'last', 'Go to last page' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped inside the helper.
		?>
	</ul>
</nav>
<?php if ( ! $wp_ja_kinetic_counter_first ) : ?>
	<?php echo wp_ja_kinetic_pagination_counter( $wp_ja_kinetic_counter_class, $wp_ja_kinetic_current, $wp_ja_kinetic_max ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped inside the helper. ?>
<?php endif; ?>
