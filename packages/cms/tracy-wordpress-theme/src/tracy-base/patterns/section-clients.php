<?php
/**
 * Title: Clients
 * Slug: tracy-base/section-clients
 * Description: An eyebrow over a row of six client marks — the Joomla ACM block `clients`. Each mark is an image whose alt is the client name; the source's light-image / dark-wordmark pair is one image here, and its optional link is not carried (empty on the source instance).
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: clients, logos, marks, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section acm-clients py-8 px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section acm-clients py-8 px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-section__inner max-w-page mx-auto"} -->
<div class="wp-block-group tracy-section__inner max-w-page mx-auto">
<!-- wp:paragraph {"className":"tracy-eyebrow text-center","metadata":{"role":"content","name":"clients.eyebrow"}} -->
<p class="tracy-eyebrow text-center"><?php esc_html_e( 'Example client identities', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"acm-clients__marks flex flex-wrap items-center justify-center gap-8"} -->
<div class="wp-block-group acm-clients__marks flex flex-wrap items-center justify-center gap-8">
<!-- wp:image {"sizeSlug":"medium","className":"acm-clients__mark m-0","metadata":{"role":"content","name":"clients.mark-image.1"}} -->
<figure class="wp-block-image size-medium acm-clients__mark m-0"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Northwind', 'tracy-base' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:image {"sizeSlug":"medium","className":"acm-clients__mark m-0","metadata":{"role":"content","name":"clients.mark-image.2"}} -->
<figure class="wp-block-image size-medium acm-clients__mark m-0"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Halcyon', 'tracy-base' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:image {"sizeSlug":"medium","className":"acm-clients__mark m-0","metadata":{"role":"content","name":"clients.mark-image.3"}} -->
<figure class="wp-block-image size-medium acm-clients__mark m-0"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Meridian', 'tracy-base' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:image {"sizeSlug":"medium","className":"acm-clients__mark m-0","metadata":{"role":"content","name":"clients.mark-image.4"}} -->
<figure class="wp-block-image size-medium acm-clients__mark m-0"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Lumen', 'tracy-base' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:image {"sizeSlug":"medium","className":"acm-clients__mark m-0","metadata":{"role":"content","name":"clients.mark-image.5"}} -->
<figure class="wp-block-image size-medium acm-clients__mark m-0"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Atlas Works', 'tracy-base' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:image {"sizeSlug":"medium","className":"acm-clients__mark m-0","metadata":{"role":"content","name":"clients.mark-image.6"}} -->
<figure class="wp-block-image size-medium acm-clients__mark m-0"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Fieldstone', 'tracy-base' ); ?>"/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
