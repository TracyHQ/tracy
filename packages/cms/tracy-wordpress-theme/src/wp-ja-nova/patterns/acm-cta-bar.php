<?php
/**
 * Title: Contact bar
 * Slug: wp-ja-nova/section-cta-bar
 * Description: One line with a coloured phrase and a button, on a band (Joomla ACM cta style-2).
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: cta, contact, bar, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-cta-bar","metadata":{"name":"cta.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-cta-bar">
<!-- wp:group {"className":"jn-container jn-cta-bar__inner","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container jn-cta-bar__inner">
<!-- wp:heading {"level":4,"className":"jn-cta-bar__text","metadata":{"role":"content","name":"cta.cta-desc"}} -->
<h4 class="wp-block-heading jn-cta-bar__text"><?php esc_html_e( 'If you want to talk! We are here', 'wp-ja-nova' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:buttons {"className":"jn-actions"} -->
<div class="wp-block-buttons jn-actions">
<!-- wp:button {"className":"is-style-outline tracy-btn tracy-btn--ghost","metadata":{"role":"content","name":"cta.cta-title"}} -->
<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Contact us', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
