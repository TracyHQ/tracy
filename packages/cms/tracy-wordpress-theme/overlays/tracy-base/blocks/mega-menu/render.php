<?php
/**
 * tracy-base/mega-menu — the front-end markup. WordPress puts $attributes, $content (the inner
 * blocks, rendered) and $block in scope for a block's render file.
 *
 * A trigger button and a panel, in one wrapper. The wrapper carries `has-child` and the panel
 * `wp-block-navigation__submenu-container` — the navigation block's names — on purpose: they are
 * the item → trigger → panel contract the skill's review script (scripts/review/mega-hover.mjs)
 * drives with a real pointer, and core scopes every rule of those names under
 * `.wp-block-navigation`, so outside it they style nothing. The open state is the `is-open` class
 * assets/js/tracy-base-mega.js toggles; assets/css/tracy-base.css paints it.
 *
 * @package tracy-base
 */

$tracy_base_mega_label = isset( $attributes['label'] ) ? wp_kses( (string) $attributes['label'], array() ) : '';
$tracy_base_mega_id    = wp_unique_id( 'tracy-mega-' );
?>
<div <?php echo get_block_wrapper_attributes( array( 'class' => 'tracy-mega has-child', 'data-tracy-mega' => '' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped by core. ?>>
	<button type="button" class="tracy-mega__trigger" aria-expanded="false" aria-controls="<?php echo esc_attr( $tracy_base_mega_id ); ?>">
		<span class="tracy-mega__label"><?php echo $tracy_base_mega_label; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- kses, no tags, above. ?></span>
		<span class="tracy-mega__caret" aria-hidden="true"></span>
	</button>
	<div id="<?php echo esc_attr( $tracy_base_mega_id ); ?>" class="tracy-mega__panel wp-block-navigation__submenu-container">
		<div class="tracy-mega__inner">
			<?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the rendered inner blocks. ?>
		</div>
	</div>
</div>
