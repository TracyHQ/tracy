<?php
/**
 * Title: Search page sidebar
 * Slug: wp-ja-impact/search-side
 * Description: The side column of the search page (templates/search.html): the sign-in form and the social links, each under its heading. The headings go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-impact
 * Inserter: no
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"className":"jim-side-card","layout":{"type":"default"}} -->
<div class="wp-block-group jim-side-card">
<!-- wp:heading {"level":3,"className":"jim-side__title"} -->
<h3 class="wp-block-heading jim-side__title"><?php echo esc_html__( 'Login Form', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:loginout {"displayLoginAsForm":true,"className":"jim-search-login"} /-->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-side-card","layout":{"type":"default"}} -->
<div class="wp-block-group jim-side-card">
<!-- wp:heading {"level":3,"className":"jim-side__title"} -->
<h3 class="wp-block-heading jim-side__title"><?php echo esc_html__( 'Follow us', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:social-links {"className":"jim-boxsocial"} -->
<ul class="wp-block-social-links jim-boxsocial"><!-- wp:social-link {"url":"#","service":"facebook","label":"Facebook"} /-->
<!-- wp:social-link {"url":"#","service":"twitter","label":"Twitter"} /-->
<!-- wp:social-link {"url":"#","service":"tiktok","label":"TikTok"} /-->
<!-- wp:social-link {"url":"#","service":"pinterest","label":"Pinterest"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
