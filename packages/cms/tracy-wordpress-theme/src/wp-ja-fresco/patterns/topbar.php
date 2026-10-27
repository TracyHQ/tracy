<?php
/**
 * Title: Top bar
 * Slug: wp-ja-fresco/topbar
 * Description: The thin bar above the header: the address on one side, the phone number on the other (the source's custom modules topbar-l and topbar-r, drawn by the header part).
 * Categories: wp-ja-fresco, tracy
 * Viewport Width: 1440
 * Inserter: no
 * Keywords: top bar, address, phone
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"className":"t4-topbar","metadata":{"name":"header.topbar"},"layout":{"type":"default"}} -->
<div class="wp-block-group t4-topbar">
<!-- wp:group {"className":"jf-container-fluid jf-topbar-row","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container-fluid jf-topbar-row">
<!-- wp:paragraph {"className":"topbar-l jf-icon jf-icon-pin","metadata":{"name":"topbar.left"}} -->
<p class="topbar-l jf-icon jf-icon-pin"><?php esc_html_e( '317 Pacific C Hwy Huntington, CA 92648', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"topbar-r jf-icon jf-icon-phone","metadata":{"name":"topbar.right"}} -->
<p class="topbar-r jf-icon jf-icon-phone"><?php esc_html_e( 'Call Us:', 'wp-ja-fresco' ); ?> <a href="tel:+000"><?php esc_html_e( '156-677-124-2887', 'wp-ja-fresco' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
