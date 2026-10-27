<?php
/**
 * wp-ja-vega/mega-menu — the front-end markup. WordPress puts $attributes, $content (the inner
 * blocks, rendered) and $block in scope for a block's render file.
 *
 * The source's mega items are links that also open a panel ("Our Services" goes to /services and
 * opens its three columns on hover). So the label is a link when the block has a `url`, and the
 * panel has a caret button of its own — the one control a keyboard or a touch uses to open it
 * without leaving the page. The wrapper carries `has-child` and the panel
 * `wp-block-navigation__submenu-container`, the navigation block's names, on purpose: they are
 * the item → trigger → panel contract scripts/review/mega-hover.mjs drives with a real pointer,
 * and core scopes every rule of those names under `.wp-block-navigation`, so outside it they
 * style nothing. The open state is the `is-open` class assets/js/wp-ja-vega.js toggles.
 *
 * @package wp-ja-vega
 */

$wp_ja_vega_mega_label = isset( $attributes['label'] ) ? wp_kses( (string) $attributes['label'], array() ) : '';
$wp_ja_vega_mega_url   = isset( $attributes['url'] ) ? (string) $attributes['url'] : '';
$wp_ja_vega_mega_id    = wp_unique_id( 'jv-mega-' );
$wp_ja_vega_mega_here  = ( '' !== $wp_ja_vega_mega_url && 0 === strpos( trailingslashit( (string) wp_parse_url( home_url( add_query_arg( array() ) ), PHP_URL_PATH ) ), trailingslashit( (string) wp_parse_url( home_url( $wp_ja_vega_mega_url ), PHP_URL_PATH ) ) ) ) || ( '' !== $wp_ja_vega_mega_url && wp_ja_vega_is_project_of( $wp_ja_vega_mega_url ) );
?>
<div <?php echo get_block_wrapper_attributes( array( 'class' => 'jv-mega has-child' . ( $wp_ja_vega_mega_here ? ' is-current' : '' ), 'data-jv-mega' => '' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped by core. ?>>
	<?php if ( '' !== $wp_ja_vega_mega_url ) : ?>
		<a class="jv-mega__link" href="<?php echo esc_url( home_url( $wp_ja_vega_mega_url ) ); ?>"<?php echo $wp_ja_vega_mega_here ? ' aria-current="page"' : ''; ?>><?php echo $wp_ja_vega_mega_label; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- kses, no tags, above. ?></a>
	<?php endif; ?>
	<button type="button" class="jv-mega__trigger" aria-expanded="false" aria-controls="<?php echo esc_attr( $wp_ja_vega_mega_id ); ?>">
		<?php if ( '' === $wp_ja_vega_mega_url ) : ?>
			<span class="jv-mega__label"><?php echo $wp_ja_vega_mega_label; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- kses, no tags, above. ?></span>
		<?php else : ?>
			<span class="screen-reader-text">
				<?php
				/* translators: %s: the menu item's label, e.g. "Our Services". */
				echo esc_html( sprintf( __( 'Show the %s menu', 'wp-ja-vega' ), wp_strip_all_tags( $wp_ja_vega_mega_label ) ) );
				?>
			</span>
		<?php endif; ?>
		<span class="jv-mega__caret" aria-hidden="true"></span>
	</button>
	<div id="<?php echo esc_attr( $wp_ja_vega_mega_id ); ?>" class="jv-mega__panel wp-block-navigation__submenu-container">
		<div class="jv-mega__inner">
			<?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the rendered inner blocks. ?>
		</div>
	</div>
</div>
