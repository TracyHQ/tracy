<?php
/**
 * Title: Social links
 * Slug: tracy-base/section-social-links
 * Description: A small heading over a row of social icons — the Joomla ACM block `social-links`. Uses the core Social Icons block, which ships the same five services; the source's `handle` text repeated beside every icon has no core equivalent and is carried once, as a line under the heading.
 * Categories: tracy-base, tracy
 * Block Types: core/social-links
 * Viewport Width: 600
 * Inserter: yes
 * Keywords: social, footer, icons, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"className":"acm-social-links"} -->
<div class="wp-block-group acm-social-links">
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"social-links.heading"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'Find us online', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-social-links__handle tracy-meta mb-3","metadata":{"role":"content","name":"social-links.handle"}} -->
<p class="acm-social-links__handle tracy-meta mb-3"><?php esc_html_e( '@tracybasedemo', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:social-links {"className":"is-style-logos-only acm-social-links__list"} -->
<ul class="wp-block-social-links is-style-logos-only acm-social-links__list"><!-- wp:social-link {"url":"https://www.instagram.com/","service":"instagram","metadata":{"role":"content","name":"social-links.item.1"}} /-->
<!-- wp:social-link {"url":"https://www.facebook.com/","service":"facebook","metadata":{"role":"content","name":"social-links.item.2"}} /-->
<!-- wp:social-link {"url":"https://www.linkedin.com/","service":"linkedin","metadata":{"role":"content","name":"social-links.item.3"}} /-->
<!-- wp:social-link {"url":"https://www.youtube.com/","service":"youtube","metadata":{"role":"content","name":"social-links.item.4"}} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
