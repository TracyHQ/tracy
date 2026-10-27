<?php
/**
 * Title: Template body: page-password
 * Slug: wp-ja-kinetic/template-page-password
 * Description: The body of templates/page-password.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:wp-ja-kinetic/kinetic-auth-notice /-->
<!-- wp:group {"tagName":"main","className":"kinetic-auth kinetic-auth--single hx-grid-bg com-users-reset com-users-remind reset remind","layout":{"type":"default"}} -->
<main class="wp-block-group kinetic-auth kinetic-auth--single hx-grid-bg com-users-reset com-users-remind reset remind">
<!-- wp:group {"tagName":"section","className":"kinetic-auth-masthead","layout":{"type":"default"}} -->
<section class="wp-block-group kinetic-auth-masthead">
<!-- wp:html -->
<span class="kinetic-auth__eyebrow"><span class="kinetic-auth__eyebrow-dot"></span><?php echo esc_html__( 'ACCOUNT', 'wp-ja-kinetic' ); ?></span>
<!-- /wp:html -->
<!-- wp:post-title {"level":1,"className":"kinetic-auth-masthead__title"} /-->
<!-- wp:paragraph {"className":"kinetic-auth-masthead__sub kinetic-auth-masthead__sub--reset","metadata":{"name":"page.lede"}} -->
<p class="kinetic-auth-masthead__sub kinetic-auth-masthead__sub--reset"></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"kinetic-auth-masthead__sub kinetic-auth-masthead__sub--remind","metadata":{"name":"page.lede"}} -->
<p class="kinetic-auth-masthead__sub kinetic-auth-masthead__sub--remind"></p>
<!-- /wp:paragraph -->
</section>
<!-- /wp:group -->
<!-- wp:wp-ja-kinetic/kinetic-auth-password /-->
</main>
<!-- /wp:group -->
