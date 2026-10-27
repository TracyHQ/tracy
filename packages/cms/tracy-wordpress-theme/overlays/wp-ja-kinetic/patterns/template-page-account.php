<?php
/**
 * Title: Template body: page-account
 * Slug: wp-ja-kinetic/template-page-account
 * Description: The body of templates/page-account.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"main","className":"kinetic-auth hx-grid-bg com-users-profile profile","layout":{"type":"default"}} -->
<main class="wp-block-group kinetic-auth hx-grid-bg com-users-profile profile">
<!-- wp:group {"tagName":"section","className":"kinetic-auth-masthead","layout":{"type":"default"}} -->
<section class="wp-block-group kinetic-auth-masthead">
<!-- wp:html -->
<span class="kinetic-auth__eyebrow"><span class="kinetic-auth__eyebrow-dot"></span><?php echo esc_html__( 'ACCOUNT', 'wp-ja-kinetic' ); ?></span>
<!-- /wp:html -->
<!-- wp:heading {"level":1,"className":"kinetic-auth-masthead__title"} -->
<h1 class="wp-block-heading kinetic-auth-masthead__title"><?php echo esc_html__( 'Your profile', 'wp-ja-kinetic' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"kinetic-auth-masthead__sub"} -->
<p class="kinetic-auth-masthead__sub"><?php /* translators: %s: the site's name. */ echo esc_html( sprintf( __( 'Manage your %s account, active sessions and preferences.', 'wp-ja-kinetic' ), get_bloginfo( 'name' ) ) ); ?></p>
<!-- /wp:paragraph -->
</section>
<!-- /wp:group -->
<!-- wp:wp-ja-kinetic/kinetic-auth-account /-->
</main>
<!-- /wp:group -->
