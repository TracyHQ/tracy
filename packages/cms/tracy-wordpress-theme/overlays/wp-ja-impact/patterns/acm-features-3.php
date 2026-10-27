<?php
/**
 * Title: Features icon cards
 * Slug: wp-ja-impact/acm-features-3
 * Description: A heading, then icon-image cards that step through a carousel (three to a view, one on a phone, a new one every four seconds), then a coloured call-to-action bar with a picture, a line and a button, over a section picture (Joomla ACM `features` style-3 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, cards, carousel, icons, call to action, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-features style-3","metadata":{"name":"features.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-features style-3">
<!-- wp:image {"sizeSlug":"full","className":"jim-bg","metadata":{"role":"content","name":"features.section-bg"}} -->
<figure class="wp-block-image size-full jim-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jim-container","layout":{"type":"default"}} -->
<div class="wp-block-group jim-container">
<!-- wp:group {"className":"section-title-wrap","metadata":{"name":"features.heading"},"layout":{"type":"default"}} -->
<div class="wp-block-group section-title-wrap">
<!-- wp:paragraph {"className":"sub-title","metadata":{"role":"content","name":"features.module-sub-title"}} -->
<p class="sub-title"><?php esc_html_e( 'A small label', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"section-title","metadata":{"role":"content","name":"features.module-title"}} -->
<h2 class="wp-block-heading section-title"><?php esc_html_e( 'A section headline', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"owl-theme column-3","metadata":{"name":"features.carousel"},"layout":{"type":"default"}} -->
<div class="wp-block-group owl-theme column-3">
<!-- wp:group {"className":"tracy-motion-carousel features-carousel","metadata":{"name":"features.view"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-carousel features-carousel">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"features.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"features-item item","metadata":{"name":"features.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-item item">
<!-- wp:group {"className":"item-inner","layout":{"type":"default"}} -->
<div class="wp-block-group item-inner">
<!-- wp:image {"sizeSlug":"full","className":"img-icon","metadata":{"role":"content","name":"features.img-icon.1"}} -->
<figure class="wp-block-image size-full img-icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wrap-content bg-default no-image","metadata":{"name":"features.card.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group wrap-content bg-default no-image">
<!-- wp:group {"className":"item-content","layout":{"type":"default"}} -->
<div class="wp-block-group item-content">
<!-- wp:heading {"level":4,"className":"item-title","metadata":{"role":"content","name":"features.title.1"}} -->
<h4 class="wp-block-heading item-title"><?php esc_html_e( 'A card title', 'wp-ja-impact' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"item-description","metadata":{"role":"content","name":"features.description.1"}} -->
<p class="item-description"><?php esc_html_e( 'A few lines that say what the card is about.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"layout":{"type":"flex"}} -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"btn jim-arrow btn-success","metadata":{"role":"content","name":"features.button.1"}} -->
<div class="wp-block-button btn jim-arrow btn-success"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Take action', 'wp-ja-impact' ); ?></a></div>
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
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"tracy-motion-nav-buttons","metadata":{"name":"features.nav"},"layout":{"type":"flex"}} -->
<div class="wp-block-buttons tracy-motion-nav-buttons">
<!-- wp:button {"className":"tracy-motion-prev"} -->
<div class="wp-block-button tracy-motion-prev"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Previous', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"tracy-motion-next"} -->
<div class="wp-block-button tracy-motion-next"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Next', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"feature-block","metadata":{"name":"features.block"},"layout":{"type":"default"}} -->
<div class="wp-block-group feature-block">
<!-- wp:group {"className":"block-inner bg-warning","metadata":{"name":"features.block-inner"},"layout":{"type":"default"}} -->
<div class="wp-block-group block-inner bg-warning">
<!-- wp:group {"className":"block-left","layout":{"type":"default"}} -->
<div class="wp-block-group block-left">
<!-- wp:image {"sizeSlug":"full","className":"block-img","metadata":{"role":"content","name":"features.block-img"}} -->
<figure class="wp-block-image size-full block-img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"item-description","metadata":{"role":"content","name":"features.block-description"}} -->
<h3 class="wp-block-heading item-description"><?php esc_html_e( 'A line that leads to the button', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"block-right","layout":{"type":"default"}} -->
<div class="wp-block-group block-right">
<!-- wp:buttons {"layout":{"type":"flex"}} -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"btn jim-arrow btn-action btn-white","metadata":{"role":"content","name":"features.btn-block"}} -->
<div class="wp-block-button btn jim-arrow btn-action btn-white"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Donate today', 'wp-ja-impact' ); ?></a></div>
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
</section>
<!-- /wp:group -->
