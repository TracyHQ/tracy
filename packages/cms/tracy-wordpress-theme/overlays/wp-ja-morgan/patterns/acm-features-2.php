<?php
/**
 * Title: Feature boxes
 * Slug: wp-ja-morgan/acm-features-2
 * Description: A centred section title over a grid of boxes, each with an icon or a small picture, a title and a short text, and an optional button below (Joomla ACM `features-intro` style-2 of JA Morgan).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, services, icons, boxes, acm
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm">
<!-- wp:image {"sizeSlug":"full","className":"jm-section-bg","metadata":{"role":"content","name":"features-intro.section-bg"}} -->
<figure class="wp-block-image size-full jm-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"acm-features style-2","metadata":{"name":"features-intro.grid"},"layout":{"type":"default"}} -->
<div class="wp-block-group acm-features style-2">
<!-- wp:group {"className":"section-title","layout":{"type":"default"}} -->
<div class="wp-block-group section-title">
<!-- wp:paragraph {"className":"sub-heading","metadata":{"role":"content","name":"features-intro.sub-heading"}} -->
<p class="sub-heading"><?php esc_html_e( 'Introducing.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"jm-module-title","metadata":{"role":"content","name":"features-intro.module-title"}} -->
<h3 class="wp-block-heading jm-module-title"><?php esc_html_e( 'A section title', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"row jm-cards","metadata":{"name":"features-intro.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group row jm-cards">
<!-- wp:group {"className":"features-item","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-item">
<!-- wp:paragraph {"className":"font-icon hx-ico-ion-ios-crop","metadata":{"role":"content","name":"features-intro.icon.1"}} -->
<p class="font-icon hx-ico-ion-ios-crop"></p>
<!-- /wp:paragraph -->
<!-- wp:image {"sizeSlug":"full","className":"img-icon","metadata":{"role":"content","name":"features-intro.img-icon.1"}} -->
<figure class="wp-block-image size-full img-icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":4,"className":"jm-title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h4 class="wp-block-heading jm-title"><?php esc_html_e( 'A feature', 'wp-ja-morgan' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jm-description","metadata":{"role":"content","name":"features-intro.description.1"}} -->
<p class="jm-description"><?php esc_html_e( 'Two short lines about the feature.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"link-action"} -->
<div class="wp-block-buttons link-action">
<!-- wp:button {"className":"btn btn-primary jm-arrow","metadata":{"role":"content","name":"features-intro.more"}} -->
<div class="wp-block-button btn btn-primary jm-arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'View more', 'wp-ja-morgan' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
