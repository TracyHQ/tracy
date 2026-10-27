<?php
/**
 * Title: Call to action with picture
 * Slug: wp-ja-impact/acm-cta-1
 * Description: A soft card with a title, a lead, a highlighted figure and a button, and a person cut-out standing on its bottom edge (ACM cta style-1 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: cta, helpline, call to action, card, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-cta style-1","metadata":{"name":"cta.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-cta style-1">
<!-- wp:group {"className":"cta-inner","layout":{"type":"default"}} -->
<div class="wp-block-group cta-inner">
<!-- wp:group {"className":"cta-row align-right","metadata":{"name":"cta.row"},"layout":{"type":"default"}} -->
<div class="wp-block-group cta-row align-right">
<!-- wp:group {"className":"cta-content","layout":{"type":"default"}} -->
<div class="wp-block-group cta-content">
<!-- wp:heading {"level":4,"className":"cta-title","metadata":{"role":"content","name":"cta.module-title"}} -->
<h4 class="wp-block-heading cta-title"><?php esc_html_e( 'Helpline is open 24/7', 'wp-ja-impact' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"cta-desc","metadata":{"role":"content","name":"cta.cta-desc"}} -->
<p class="cta-desc"><?php esc_html_e( 'Don’t worry, we can help you. Feel free to contact with our team!', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"cta-highlight","metadata":{"role":"content","name":"cta.cta-highlight"}} -->
<h2 class="wp-block-heading cta-highlight"><?php esc_html_e( '1 800 000 00 00', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:buttons {"className":"cta-action"} -->
<div class="wp-block-buttons cta-action">
<!-- wp:button {"className":"jim-btn jim-btn--arrow","metadata":{"role":"content","name":"cta.cta-link"}} -->
<div class="wp-block-button jim-btn jim-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Get a quote', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:image {"sizeSlug":"full","className":"cta-media","metadata":{"role":"content","name":"cta.cta-media"}} -->
<figure class="wp-block-image size-full cta-media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
