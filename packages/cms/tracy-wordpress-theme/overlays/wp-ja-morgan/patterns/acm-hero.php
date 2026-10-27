<?php
/**
 * Title: Hero
 * Slug: wp-ja-morgan/acm-hero
 * Description: A full-width picture band with a large headline, a lead and one call to action (Joomla ACM `hero` style-1 of JA Morgan). The headline sits left or centred; the band is tall on a home page and short as a closing call to action.
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: hero, banner, header, call to action, acm
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm acm-hero style-1","metadata":{"name":"hero.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm acm-hero style-1">
<!-- wp:image {"sizeSlug":"full","className":"ft-bg","metadata":{"role":"content","name":"hero.ft-bg"}} -->
<figure class="wp-block-image size-full ft-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:image {"sizeSlug":"full","className":"ft-bg-xs","metadata":{"role":"content","name":"hero.ft-bg-xs"}} -->
<figure class="wp-block-image size-full ft-bg-xs"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:image {"sizeSlug":"full","className":"jm-section-bg","metadata":{"role":"content","name":"hero.section-bg"}} -->
<figure class="wp-block-image size-full jm-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"wrap-content","layout":{"type":"default"}} -->
<div class="wp-block-group wrap-content">
<!-- wp:paragraph {"className":"sub-heading","metadata":{"role":"content","name":"hero.sub-heading"}} -->
<p class="sub-heading"><?php esc_html_e( 'Established 2019.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"jm-module-title","metadata":{"role":"content","name":"hero.module-title"}} -->
<h1 class="wp-block-heading jm-module-title"><?php esc_html_e( 'A headline of one or two lines', 'wp-ja-morgan' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"lead","metadata":{"role":"content","name":"hero.description"}} -->
<p class="lead"><?php esc_html_e( 'A lead of two or three lines that says what the business does.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"btn-action"} -->
<div class="wp-block-buttons btn-action">
<!-- wp:button {"className":"btn jm-arrow","metadata":{"role":"content","name":"hero.button"}} -->
<div class="wp-block-button btn jm-arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Find Out More', 'wp-ja-morgan' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
