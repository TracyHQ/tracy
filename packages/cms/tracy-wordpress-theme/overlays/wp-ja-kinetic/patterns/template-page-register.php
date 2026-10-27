<?php
/**
 * Title: Template body: page-register
 * Slug: wp-ja-kinetic/template-page-register
 * Description: The body of templates/page-register.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:wp-ja-kinetic/kinetic-auth-notice /-->
<!-- wp:group {"tagName":"main","className":"kinetic-auth hx-grid-bg com-users-registration registration","layout":{"type":"default"}} -->
<main class="wp-block-group kinetic-auth hx-grid-bg com-users-registration registration">
<!-- wp:group {"tagName":"section","className":"kinetic-auth-masthead","layout":{"type":"default"}} -->
<section class="wp-block-group kinetic-auth-masthead">
<!-- wp:html -->
<span class="kinetic-auth__eyebrow"><span class="kinetic-auth__eyebrow-dot"></span><?php echo esc_html__( 'GET STARTED', 'wp-ja-kinetic' ); ?></span>
<!-- /wp:html -->
<!-- wp:post-title {"level":1,"className":"kinetic-auth-masthead__title"} /-->
<!-- wp:paragraph {"className":"kinetic-auth-masthead__sub","metadata":{"name":"page.lede"}} -->
<p class="kinetic-auth-masthead__sub"></p>
<!-- /wp:paragraph -->
</section>
<!-- /wp:group -->
<!-- wp:group {"className":"kinetic-auth__split","layout":{"type":"default"}} -->
<div class="wp-block-group kinetic-auth__split">
<!-- wp:wp-ja-kinetic/kinetic-auth-register /-->
</div>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
