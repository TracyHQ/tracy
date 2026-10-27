<?php
/**
 * Title: Colour tiles
 * Slug: wp-ja-morgan/a-features-4
 * Description: A centred title over a grid of two-column tiles, each a coloured text panel beside a picture (Joomla ACM features-intro style-4 of JA Morgan).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: acm, tiles
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm">
<!-- wp:image {"sizeSlug":"full","className":"jm-section-bg","metadata":{"role":"content","name":"features-intro.section-bg"}} -->
<figure class="wp-block-image size-full jm-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"acm-features style-4 align-center","metadata":{"name":"features-intro.grid"},"layout":{"type":"default"}} -->
<div class="wp-block-group acm-features style-4 align-center">
<!-- wp:group {"className":"section-title","layout":{"type":"default"}} -->
<div class="wp-block-group section-title">
<!-- wp:paragraph {"className":"sub-heading","metadata":{"role":"content","name":"features-intro.sub-heading"}} -->
<p class="sub-heading"><?php esc_html_e( 'Our services.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"jm-module-title","metadata":{"role":"content","name":"features-intro.module-title"}} -->
<h3 class="wp-block-heading jm-module-title"><?php esc_html_e( 'A section title', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:heading {"level":3,"className":"jm-ft-desc","metadata":{"role":"content","name":"features-intro.ft-desc"}} -->
<h3 class="wp-block-heading jm-ft-desc"><?php esc_html_e( 'A short statement.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:image {"sizeSlug":"full","className":"jm-ft-sign","metadata":{"role":"content","name":"features-intro.ft-sign"}} -->
<figure class="wp-block-image size-full jm-ft-sign"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"row jm-tiles","metadata":{"name":"features-intro.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group row jm-tiles">
<!-- wp:group {"className":"col","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group col">
<!-- wp:group {"className":"features-item","layout":{"type":"default"}} -->
<div class="wp-block-group features-item">
<!-- wp:image {"sizeSlug":"full","className":"img-intro","metadata":{"role":"content","name":"features-intro.img-intro.1"}} -->
<figure class="wp-block-image size-full img-intro"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"content-wrap","layout":{"type":"default"}} -->
<div class="wp-block-group content-wrap">
<!-- wp:paragraph {"className":"font-icon hx-ico-ion-ios-crop","metadata":{"role":"content","name":"features-intro.icon.1"}} -->
<p class="font-icon hx-ico-ion-ios-crop"></p>
<!-- /wp:paragraph -->
<!-- wp:image {"sizeSlug":"full","className":"img-icon","metadata":{"role":"content","name":"features-intro.img-icon.1"}} -->
<figure class="wp-block-image size-full img-icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":4,"className":"jm-title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h4 class="wp-block-heading jm-title"><?php esc_html_e( 'A service', 'wp-ja-morgan' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jm-description","metadata":{"role":"content","name":"features-intro.description.1"}} -->
<p class="jm-description"><?php esc_html_e( 'A few lines about the service.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jm-tile-link","metadata":{"role":"content","name":"features-intro.action.1"}} -->
<p class="jm-tile-link"><a href="#"><?php esc_html_e( 'Find out more', 'wp-ja-morgan' ); ?></a></p>
<!-- /wp:paragraph -->
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
