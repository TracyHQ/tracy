<?php
/**
 * Title: Call to action over a picture
 * Slug: wp-ja-impact/acm-cta-2
 * Description: A rounded block with a headline, a lead and a button over a darkened cover picture, or a flat colour when it has no picture (ACM cta style-2 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: cta, call to action, banner, sidebar, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-cta style-2","metadata":{"name":"cta.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-cta style-2">
<!-- wp:group {"className":"cta-inner bg-default","metadata":{"name":"cta.surface"},"layout":{"type":"default"}} -->
<div class="wp-block-group cta-inner bg-default">
<!-- wp:image {"sizeSlug":"full","className":"cta-media","metadata":{"role":"content","name":"cta.cta-media"}} -->
<figure class="wp-block-image size-full cta-media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"cta-content","layout":{"type":"default"}} -->
<div class="wp-block-group cta-content">
<!-- wp:heading {"level":3,"className":"cta-title","metadata":{"role":"content","name":"cta.cta-title"}} -->
<h3 class="wp-block-heading cta-title"><?php esc_html_e( 'Join together for charity', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"cta-desc","metadata":{"role":"content","name":"cta.cta-desc"}} -->
<p class="cta-desc"><?php esc_html_e( 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"cta-action"} -->
<div class="wp-block-buttons cta-action">
<!-- wp:button {"className":"jim-btn jim-btn--arrow","metadata":{"role":"content","name":"cta.cta-link"}} -->
<div class="wp-block-button jim-btn jim-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Get a quote', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
