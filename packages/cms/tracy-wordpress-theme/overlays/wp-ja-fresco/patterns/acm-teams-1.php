<?php
/**
 * Title: Team members with a button
 * Slug: wp-ja-fresco/acm-teams-1
 * Description: A section title and lead, cards of team members each with a photo, a name, a role, a few lines and social links, then a button to the whole team (Joomla ACM `teams` style-1 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: team, chefs, staff, people, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-teams style-1","metadata":{"name":"teams.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-teams style-1">
<!-- wp:group {"className":"jf-container section-title-wrap","metadata":{"name":"teams.head"},"layout":{"type":"default"}} -->
<div class="wp-block-group jf-container section-title-wrap">
<!-- wp:heading {"className":"main-title","metadata":{"role":"content","name":"teams.main-section"}} -->
<h2 class="wp-block-heading main-title"><?php esc_html_e( 'A section title', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"section-top-desc lead","metadata":{"role":"content","name":"teams.top-desc"}} -->
<p class="section-top-desc lead"><?php esc_html_e( 'A lead of one or two lines.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jf-container","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container">
<!-- wp:group {"className":"team-list acm-teams--cols-3","metadata":{"name":"teams.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group team-list acm-teams--cols-3">
<!-- wp:group {"className":"member-ele","metadata":{"name":"teams.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group member-ele">
<!-- wp:image {"sizeSlug":"full","className":"member-picture","metadata":{"role":"content","name":"teams.img.1"}} -->
<figure class="wp-block-image size-full member-picture"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"box-info","layout":{"type":"default"}} -->
<div class="wp-block-group box-info">
<!-- wp:heading {"className":"member-name","metadata":{"role":"content","name":"teams.name-member.1"}} -->
<h2 class="wp-block-heading member-name"><?php esc_html_e( 'A name', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"member-office","metadata":{"role":"content","name":"teams.name-office.1"}} -->
<p class="member-office"><?php esc_html_e( 'Role', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"member-desc","metadata":{"role":"content","name":"teams.description.1"}} -->
<p class="member-desc"><?php esc_html_e( 'Two or three lines about them.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:social-links {"className":"member-social is-style-logos-only","metadata":{"role":"content","name":"teams.link-social.1"}} -->
<ul class="wp-block-social-links member-social is-style-logos-only"><!-- wp:social-link {"url":"#","service":"facebook"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"acm-action"} -->
<div class="wp-block-buttons acm-action">
<!-- wp:button {"className":"btn btn-outline-primary","metadata":{"role":"content","name":"teams.button"}} -->
<div class="wp-block-button btn btn-outline-primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'View all', 'wp-ja-fresco' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
