<?php
/**
 * Title: Booking bar
 * Slug: wp-ja-restaurant/acm-opentable-style-1
 * Description: The orange bar under the home slideshow where the source puts its OpenTable booking form (Joomla ACM `opentable` style-1 of JA Restaurant). The form is OpenTable's script and needs a restaurant id; the bar is drawn with its description only (DECISIONS D-02).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: booking, reservation, opentable, acm
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-section-module","metadata":{"name":"opentable.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-module">
<!-- wp:group {"className":"t3-section-inner","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-inner">
<!-- wp:group {"className":"t3-section-ct","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-ct">
<!-- wp:group {"className":"acm-opentable style-1","layout":{"type":"default"}} -->
<div class="wp-block-group acm-opentable style-1">
<!-- wp:group {"className":"ot-inner","layout":{"type":"default"}} -->
<div class="wp-block-group ot-inner">
<!-- wp:paragraph {"className":"ot-desc","metadata":{"role":"content","name":"opentable.ot-desc"}} -->
<p class="ot-desc"><?php esc_html_e( 'Book a table', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"ot-form","layout":{"type":"default"}} -->
<div class="wp-block-group ot-form"></div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
