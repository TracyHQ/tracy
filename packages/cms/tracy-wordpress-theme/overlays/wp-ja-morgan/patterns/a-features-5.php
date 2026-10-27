<?php
/**
 * Title: Panel over a picture
 * Slug: wp-ja-morgan/a-features-5
 * Description: A full-width background picture with one white panel holding a small title, a heading, a lead paragraph and a button (Joomla ACM features-intro style-5 of JA Morgan).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: acm, panel
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm">
<!-- wp:group {"className":"acm-features style-5","layout":{"type":"default"}} -->
<div class="wp-block-group acm-features style-5">
<!-- wp:group {"className":"features-item","layout":{"type":"default"}} -->
<div class="wp-block-group features-item">
<!-- wp:image {"sizeSlug":"full","className":"jm-item-bg","metadata":{"role":"content","name":"features-intro.ft-bg"}} -->
<figure class="wp-block-image size-full jm-item-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"group-item","layout":{"type":"default"}} -->
<div class="wp-block-group group-item">
<!-- wp:group {"className":"wrap-content","layout":{"type":"default"}} -->
<div class="wp-block-group wrap-content">
<!-- wp:paragraph {"className":"sub-heading","metadata":{"role":"content","name":"features-intro.sub-heading"}} -->
<p class="sub-heading"><?php esc_html_e( 'Our missions.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"jm-module-title","metadata":{"role":"content","name":"features-intro.module-title"}} -->
<h2 class="wp-block-heading jm-module-title"><?php esc_html_e( 'A heading', 'wp-ja-morgan' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"lead","metadata":{"role":"content","name":"features-intro.description"}} -->
<p class="lead"><?php esc_html_e( 'A short paragraph.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"btn-action"} -->
<div class="wp-block-buttons btn-action">
<!-- wp:button {"className":"btn btn-primary jm-arrow","metadata":{"role":"content","name":"features-intro.button"}} -->
<div class="wp-block-button btn btn-primary jm-arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Book a consultation', 'wp-ja-morgan' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
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
</section>
<!-- /wp:group -->
