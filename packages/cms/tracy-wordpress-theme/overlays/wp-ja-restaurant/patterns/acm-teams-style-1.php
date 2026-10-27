<?php
/**
 * Title: Teams (chefs)
 * Slug: wp-ja-restaurant/acm-teams-style-1
 * Description: A titled grid of team members, each with a portrait, a name, a position and a short text (Joomla ACM teams style-1 of JA Restaurant).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: teams, chefs, team, members, staff
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-section-module","metadata":{"name":"teams.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-module">
<!-- wp:group {"className":"t3-section-inner","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-inner">
<!-- wp:heading {"className":"t3-section-title","metadata":{"role":"content","name":"teams.module-title"}} -->
<h2 class="wp-block-heading t3-section-title"><?php esc_html_e( 'A title', 'wp-ja-restaurant' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"t3-section-description","metadata":{"role":"content","name":"teams.module-intro"}} -->
<p class="t3-section-description"><?php esc_html_e( 'A line under the title.', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"t3-section-ct","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-ct">
<!-- wp:group {"className":"acm-teams style-2","layout":{"type":"default"}} -->
<div class="wp-block-group acm-teams style-2">
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"team-items","layout":{"type":"default"}} -->
<div class="wp-block-group team-items">
<!-- wp:group {"className":"row","layout":{"type":"default"}} -->
<div class="wp-block-group row">
<!-- wp:group {"className":"col-sm-6 col-md-6","metadata":{"name":"teams.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group col-sm-6 col-md-6">
<!-- wp:group {"className":"item","layout":{"type":"default"}} -->
<div class="wp-block-group item">
<!-- wp:image {"sizeSlug":"full","className":"member-image","metadata":{"role":"content","name":"teams.member-image.1"}} -->
<figure class="wp-block-image size-full member-image"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"className":"jr-member-name","metadata":{"role":"content","name":"teams.member-name.1"}} -->
<h2 class="wp-block-heading jr-member-name"><?php esc_html_e( 'Member name', 'wp-ja-restaurant' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"member-title","metadata":{"role":"content","name":"teams.member-position.1"}} -->
<p class="member-title"><?php esc_html_e( 'Position', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"member-desc","metadata":{"role":"content","name":"teams.member-desc.1"}} -->
<p class="member-desc"><?php esc_html_e( 'A short text about the member.', 'wp-ja-restaurant' ); ?></p>
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
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
