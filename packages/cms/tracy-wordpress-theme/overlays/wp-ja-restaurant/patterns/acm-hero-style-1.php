<?php
/**
 * Title: Hero
 * Slug: wp-ja-restaurant/acm-hero-style-1
 * Description: A centred welcome block: an uppercase headline over a coloured bar, an intro text and a chef picture, on a corner background (Joomla ACM hero style-1 of JA Restaurant).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: hero, welcome, intro, chef, acm
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-section-module","metadata":{"name":"hero.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-module">
<!-- wp:image {"sizeSlug":"full","className":"jr-section-bg","metadata":{"role":"content","name":"hero.section-bg"}} -->
<figure class="wp-block-image size-full jr-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"t3-section-inner","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-inner">
<!-- wp:group {"className":"t3-section-ct","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-ct">
<!-- wp:group {"className":"acm-hero style-light position-center","layout":{"type":"default"}} -->
<div class="wp-block-group acm-hero style-light position-center">
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"hero-content","layout":{"type":"default"}} -->
<div class="wp-block-group hero-content">
<!-- wp:group {"className":"hero-heading h1","layout":{"type":"default"}} -->
<div class="wp-block-group hero-heading h1">
<!-- wp:heading {"level":1,"className":"hero-heading-title","metadata":{"role":"content","name":"hero.hero-heading"}} -->
<h1 class="wp-block-heading hero-heading-title"><?php esc_html_e( 'Welcome to our restaurant', 'wp-ja-restaurant' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hero-heading-accent","metadata":{"role":"content","name":"hero.hero-heading-accent"}} -->
<p class="hero-heading-accent"><?php esc_html_e( 'Bar & Restaurant', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hero-intro","layout":{"type":"default"}} -->
<div class="wp-block-group hero-intro">
<!-- wp:paragraph {"className":"hero-intro-lead","metadata":{"role":"content","name":"hero.hero-intro"}} -->
<p class="hero-intro-lead"><?php esc_html_e( 'A short welcome of three or four lines about the restaurant, ending with its address: ', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hero-address","metadata":{"role":"content","name":"hero.hero-address"}} -->
<p class="hero-address"><a href="#" target="_blank" rel="noopener"><?php esc_html_e( 'Street and district', 'wp-ja-restaurant' ); ?></a></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hero-intro-tail","metadata":{"role":"content","name":"hero.hero-intro-tail"}} -->
<p class="hero-intro-tail"><?php esc_html_e( '. The rest of the welcome.', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:image {"sizeSlug":"full","className":"hero-img","metadata":{"role":"content","name":"hero.hero-img"}} -->
<figure class="wp-block-image size-full hero-img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
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
