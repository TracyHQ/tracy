<?php
/**
 * Title: Happy hour offer on a picture
 * Slug: wp-ja-fresco/acm-happyhours-1
 * Description: A section title, then the offer box over the picture: logo, title, a few lines, the days and hours with a discount badge, and a button; the box side is set per section (Joomla ACM `happyhours` style-1 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: offer, happy hour, discount, hours, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-happyhours style-1","metadata":{"name":"happyhours.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-happyhours style-1">
<!-- wp:group {"className":"jf-container section-title-wrap","metadata":{"name":"happyhours.head"},"layout":{"type":"default"}} -->
<div class="wp-block-group jf-container section-title-wrap">
<!-- wp:heading {"className":"main-title","metadata":{"role":"content","name":"happyhours.main-section"}} -->
<h2 class="wp-block-heading main-title"><?php esc_html_e( 'A section title', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jf-container","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container">
<!-- wp:group {"className":"hp-wrap","metadata":{"name":"happyhours.wrap"},"layout":{"type":"default"}} -->
<div class="wp-block-group hp-wrap">
<!-- wp:image {"sizeSlug":"full","className":"hp-bg","metadata":{"role":"content","name":"happyhours.hp-img"}} -->
<figure class="wp-block-image size-full hp-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hp-inner align-left","metadata":{"name":"happyhours.box"},"layout":{"type":"default"}} -->
<div class="wp-block-group hp-inner align-left">
<!-- wp:image {"sizeSlug":"full","className":"hp-logo","metadata":{"role":"content","name":"happyhours.logo-img"}} -->
<figure class="wp-block-image size-full hp-logo"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"className":"hp-title","metadata":{"role":"content","name":"happyhours.hp-title"}} -->
<h2 class="wp-block-heading hp-title"><?php esc_html_e( 'Happy hours', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hp-desc","metadata":{"role":"content","name":"happyhours.hp-desc"}} -->
<p class="hp-desc"><?php esc_html_e( 'Two or three lines about the offer.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hp-info","metadata":{"name":"happyhours.info"},"layout":{"type":"default"}} -->
<div class="wp-block-group hp-info">
<!-- wp:paragraph {"className":"hg-badge","metadata":{"role":"content","name":"happyhours.hp-badge"}} -->
<p class="hg-badge"><?php esc_html_e( '35% off', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hp-hours","metadata":{"role":"content","name":"happyhours.hp-info"}} -->
<p class="hp-hours"><?php esc_html_e( 'Days and hours', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"hp-link"} -->
<div class="wp-block-buttons hp-link">
<!-- wp:button {"className":"btn btn-outline-primary","metadata":{"role":"content","name":"happyhours.button"}} -->
<div class="wp-block-button btn btn-outline-primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Join now', 'wp-ja-fresco' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
