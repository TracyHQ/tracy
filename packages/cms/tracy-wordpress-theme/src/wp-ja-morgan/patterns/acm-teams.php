<?php
/**
 * Title: Team or page cards
 * Slug: wp-ja-morgan/acm-teams
 * Description: A centred section title over a grid of picture cards, each with a name, a role and an optional arrow link, and an optional wide call-to-action bar below (Joomla ACM `teams` style-1 of JA Morgan).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: team, people, cards, grid, acm
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm","metadata":{"name":"teams.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm">
<!-- wp:image {"sizeSlug":"full","className":"jm-section-bg","metadata":{"role":"content","name":"teams.section-bg"}} -->
<figure class="wp-block-image size-full jm-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"acm-teams style-1 align-center","metadata":{"name":"teams.grid"},"layout":{"type":"default"}} -->
<div class="wp-block-group acm-teams style-1 align-center">
<!-- wp:group {"className":"section-title","layout":{"type":"default"}} -->
<div class="wp-block-group section-title">
<!-- wp:paragraph {"className":"sub-heading","metadata":{"role":"content","name":"teams.sub-heading"}} -->
<p class="sub-heading"><?php esc_html_e( 'Our Team.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"jm-module-title","metadata":{"role":"content","name":"teams.module-title"}} -->
<h3 class="wp-block-heading jm-module-title"><?php esc_html_e( 'Meet Our Professionals.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"row jm-cards","metadata":{"name":"teams.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group row jm-cards">
<!-- wp:group {"className":"teams-item","metadata":{"name":"teams.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group teams-item">
<!-- wp:image {"sizeSlug":"full","className":"avatar","metadata":{"role":"content","name":"teams.avatar.1"}} -->
<figure class="wp-block-image size-full avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"member-info","layout":{"type":"default"}} -->
<div class="wp-block-group member-info">
<!-- wp:heading {"level":4,"className":"jm-title","metadata":{"role":"content","name":"teams.title.1"}} -->
<h4 class="wp-block-heading jm-title"><?php esc_html_e( 'A name', 'wp-ja-morgan' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"position","metadata":{"role":"content","name":"teams.position.1"}} -->
<p class="position"><?php esc_html_e( 'A role', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"action-link-icon","metadata":{"role":"content","name":"teams.action.1"}} -->
<p class="action-link-icon"><a href="#">Read more</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"teams-action"} -->
<div class="wp-block-buttons teams-action">
<!-- wp:button {"className":"btn btn-lg jm-arrow","metadata":{"role":"content","name":"teams.more"}} -->
<div class="wp-block-button btn btn-lg jm-arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Join our team', 'wp-ja-morgan' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
