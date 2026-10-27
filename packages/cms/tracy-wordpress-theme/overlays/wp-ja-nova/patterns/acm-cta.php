<?php
/**
 * Title: Call to action
 * Slug: wp-ja-nova/section-cta
 * Description: A large centred heading with up to two coloured words, a paragraph and a button, on a tinted band (Joomla ACM cta style-1).
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: cta, call to action, banner, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-cta","metadata":{"name":"cta.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-cta">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:heading {"className":"jn-cta__title","metadata":{"role":"content","name":"cta.cta-title"}} -->
<h2 class="wp-block-heading jn-cta__title"><?php esc_html_e( 'Share the voice behind your greatest works', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-cta__desc","metadata":{"role":"content","name":"cta.cta-desc"}} -->
<p class="jn-cta__desc"><?php esc_html_e( 'A paragraph that invites the reader to act.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"jn-actions jn-actions--center"} -->
<div class="wp-block-buttons jn-actions jn-actions--center">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"cta.item.1"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Get started now', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
