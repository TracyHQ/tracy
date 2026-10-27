<?php
/**
 * Title: Projects
 * Slug: wp-tracy-business/section-projects
 * Description: Heading and a link-style button on one row, then bordered project cards: image, orange sector · year meta, title, text and a case-study link. Every card image is 16:10 — the source draws the first card taller, which left the other two ~300px of empty card under their link (visual-qa 15/09). Every spec section of type `projects`. The source page also had filter chips; core blocks have no filter, the chips are not carried.
 * Categories: wp-tracy-business, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: projects, portfolio, cards, case study
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"tagName":"section","className":"wtb-section wtb-projects"} -->
<section class="wp-block-group wtb-section wtb-projects">
<!-- wp:group {"className":"wtb-inner"} -->
<div class="wp-block-group wtb-inner">
<!-- wp:group {"className":"wtb-head wtb-head--row"} -->
<div class="wp-block-group wtb-head wtb-head--row">
<!-- wp:paragraph {"className":"wtb-eyebrow","metadata":{"role":"content","name":"projects.eyebrow"}} -->
<p class="wtb-eyebrow"><?php esc_html_e( 'Portfolio', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"wtb-heading","metadata":{"role":"content","name":"projects.heading"}} -->
<h2 class="wp-block-heading wtb-heading"><?php esc_html_e( 'Selected projects', 'wp-tracy-business' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-intro","metadata":{"role":"content","name":"projects.intro"}} -->
<p class="wtb-intro"><?php esc_html_e( 'Facilities delivered turnkey across Central and Volga Russia.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"wtb-actions"} -->
<div class="wp-block-buttons wtb-actions">
<!-- wp:button {"className":"is-style-link","metadata":{"role":"content","name":"projects.cta.1"}} -->
<div class="wp-block-button is-style-link"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'All projects →', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-projects__grid"} -->
<div class="wp-block-group wtb-projects__grid">
<!-- wp:group {"className":"wtb-card wtb-projects__item","metadata":{"name":"projects.item.1"}} -->
<div class="wp-block-group wtb-card wtb-projects__item">
<!-- wp:image {"className":"wtb-card__media","sizeSlug":"large","metadata":{"role":"content","name":"projects.item.1.img"}} -->
<figure class="wp-block-image size-large wtb-card__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Project photo', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wtb-card__body"} -->
<div class="wp-block-group wtb-card__body">
<!-- wp:paragraph {"className":"wtb-card__meta","metadata":{"role":"content","name":"projects.item.1.meta"}} -->
<p class="wtb-card__meta"><?php esc_html_e( 'Factory · 2025', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"wtb-card__title","metadata":{"role":"content","name":"projects.item.1.title"}} -->
<h3 class="wp-block-heading wtb-card__title"><?php esc_html_e( 'Elektra appliance plant, Lipetsk SEZ', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-card__text","metadata":{"role":"content","name":"projects.item.1.text"}} -->
<p class="wtb-card__text"><?php esc_html_e( 'Main contractor for 62,000 m² of ISO 8 cleanroom factory space, handed over 24 days ahead of schedule.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-card__link","metadata":{"role":"content","name":"projects.item.1.href"}} -->
<p class="wtb-card__link"><a href="#"><?php esc_html_e( 'Read the case study →', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-card wtb-projects__item","metadata":{"name":"projects.item.2"}} -->
<div class="wp-block-group wtb-card wtb-projects__item">
<!-- wp:image {"className":"wtb-card__media","sizeSlug":"large","metadata":{"role":"content","name":"projects.item.2.img"}} -->
<figure class="wp-block-image size-large wtb-card__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Project photo', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wtb-card__body"} -->
<div class="wp-block-group wtb-card__body">
<!-- wp:paragraph {"className":"wtb-card__meta","metadata":{"role":"content","name":"projects.item.2.meta"}} -->
<p class="wtb-card__meta"><?php esc_html_e( 'Infrastructure · 2024', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"wtb-card__title","metadata":{"role":"content","name":"projects.item.2.title"}} -->
<h3 class="wp-block-heading wtb-card__title"><?php esc_html_e( 'Vorsino Industrial Park, phase 3', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-card__text","metadata":{"role":"content","name":"projects.item.2.text"}} -->
<p class="wtb-card__text"><?php esc_html_e( '48 ha of earthworks, 6.2 km of internal roads and a 4,000 m³/day treatment plant.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-card__link","metadata":{"role":"content","name":"projects.item.2.href"}} -->
<p class="wtb-card__link"><a href="#"><?php esc_html_e( 'Read the case study →', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-card wtb-projects__item","metadata":{"name":"projects.item.3"}} -->
<div class="wp-block-group wtb-card wtb-projects__item">
<!-- wp:image {"className":"wtb-card__media","sizeSlug":"large","metadata":{"role":"content","name":"projects.item.3.img"}} -->
<figure class="wp-block-image size-large wtb-card__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Project photo', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wtb-card__body"} -->
<div class="wp-block-group wtb-card__body">
<!-- wp:paragraph {"className":"wtb-card__meta","metadata":{"role":"content","name":"projects.item.3.meta"}} -->
<p class="wtb-card__meta"><?php esc_html_e( 'M&E · 2024', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"wtb-card__title","metadata":{"role":"content","name":"projects.item.3.title"}} -->
<h3 class="wp-block-heading wtb-card__title"><?php esc_html_e( '110 kV Obninsk-2 substation', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-card__text","metadata":{"role":"content","name":"projects.item.3.text"}} -->
<p class="wtb-card__text"><?php esc_html_e( 'Installation, testing and energisation completed in nine months.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-card__link","metadata":{"role":"content","name":"projects.item.3.href"}} -->
<p class="wtb-card__link"><a href="#"><?php esc_html_e( 'Read the case study →', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
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
