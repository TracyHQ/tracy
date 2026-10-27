<?php
/**
 * Group A — content and account pages: the sign-in, registration, password and username forms drawn as the source
 * draws them (they post to WordPress's own wp-login.php), the guest redirect of the profile page (303, as Joomla's
 * profile view) and the search form of the search view.
 *
 * @package wp-ja-impact
 */

defined( 'ABSPATH' ) || exit;

/** The template slug of the page being shown, or ''. */
function wp_ja_impact_ga_template(): string {
	return is_page() ? (string) get_page_template_slug( get_queried_object_id() ) : '';
}

/**
 * A labelled control group as Joomla's user forms draw it (Bootstrap `control-group`).
 *
 * @param string $id    Field id and name.
 * @param string $label Visible label.
 * @param string $type  Input type.
 * @param bool   $req   Required.
 * @param string $extra Extra attributes (already escaped).
 */
function wp_ja_impact_ga_field( string $id, string $label, string $type = 'text', bool $req = true, string $extra = '' ): string {
	$input = sprintf(
		'<input class="form-control%1$s" type="%2$s" name="%3$s" id="%4$s"%5$s%6$s>',
		$req ? ' required' : '',
		esc_attr( $type ),
		esc_attr( $id ),
		esc_attr( 'jim-' . $id ),
		$req ? ' required' : '',
		$extra
	);
	if ( 'password' === $type ) {
		$input = '<div class="password-group"><div class="input-group">' . $input
			. '<button type="button" class="btn btn-secondary input-password-toggle" aria-label="' . esc_attr__( 'Show Password', 'wp-ja-impact' ) . '"><span class="icon-eye" aria-hidden="true"></span></button></div></div>';
	}
	return sprintf(
		'<div class="control-group"><div class="control-label"><label for="%1$s"%2$s>%3$s%4$s</label></div><div class="controls">%5$s</div></div>',
		esc_attr( 'jim-' . $id ),
		$req ? ' class="required"' : '',
		esc_html( $label ),
		$req ? '<span class="star" aria-hidden="true">&nbsp;*</span>' : '',
		$input
	);
}

/**
 * Sign-in, registration and lost-password forms in place of core/loginout on the account templates.
 *
 * @param string $content The block's render.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_ga_account_form( string $content, array $block ): string {
	unset( $block );
	$template = wp_ja_impact_ga_template();
	if ( '' === $template && wp_ja_impact_ga_is_search_view() && ! is_user_logged_in() ) {
		$action = esc_url( site_url( 'wp-login.php', 'login_post' ) );
		$addon  = static fn( string $glyph ): string => '<span class="input-group-text" aria-hidden="true"><span class="jim-fa">' . $glyph . '</span></span>';
		return '<form class="jim-account-side" method="post" action="' . $action . '">'
			. '<div class="input-group"><input class="form-control" type="text" name="log" placeholder="' . esc_attr__( 'Username', 'wp-ja-impact' ) . '" aria-label="' . esc_attr__( 'Username', 'wp-ja-impact' ) . '">' . $addon( '&#xf007;' ) . '</div>'
			. '<div class="input-group"><input class="form-control" type="password" name="pwd" placeholder="' . esc_attr__( 'Password', 'wp-ja-impact' ) . '" aria-label="' . esc_attr__( 'Password', 'wp-ja-impact' ) . '">' . $addon( '&#xf023;' ) . '</div>'
			. '<div class="form-check"><input id="jim-side-remember" type="checkbox" name="rememberme" class="form-check-input" value="forever"> <label class="form-check-label" for="jim-side-remember">' . esc_html__( 'Remember Me', 'wp-ja-impact' ) . '</label></div>'
			. '<button type="submit" class="btn btn-primary">' . esc_html__( 'Log in', 'wp-ja-impact' ) . '</button>'
			. '<ul class="jim-account-side__links"><li><a href="' . esc_url( home_url( '/pages/user/registration-form/' ) ) . '">' . esc_html__( 'Create an account', 'wp-ja-impact' ) . '<span class="jim-fa jim-fa--chevron" aria-hidden="true"></span></a></li>'
			. '<li><a href="' . esc_url( home_url( '/username-reminder-request/' ) ) . '">' . esc_html__( 'Forgot your username?', 'wp-ja-impact' ) . '</a></li>'
			. '<li><a href="' . esc_url( home_url( '/password-reset/' ) ) . '">' . esc_html__( 'Forgot your password?', 'wp-ja-impact' ) . '</a></li></ul></form>';
	}
	if ( ! in_array( $template, array( 'page-login', 'page-register', 'page-password' ), true ) ) {
		return $content;
	}
	if ( 'page-login' === $template && is_user_logged_in() ) {
		return $content;
	}
	$slug  = (string) get_post_field( 'post_name', get_queried_object_id() );
	$after = '';
	$home = static fn( string $path ): string => esc_url( home_url( $path ) );
	if ( 'page-login' === $template ) {
		$fields = wp_ja_impact_ga_field( 'log', __( 'Username', 'wp-ja-impact' ), 'text', true, ' autocomplete="username" autofocus' )
			. wp_ja_impact_ga_field( 'pwd', __( 'Password', 'wp-ja-impact' ), 'password', true, ' autocomplete="current-password"' )
			. '<div class="login-remember"><div class="form-check"><input id="jim-rememberme" type="checkbox" name="rememberme" class="form-check-input" value="forever"> <label class="form-check-label" for="jim-rememberme">' . esc_html__( 'Remember me', 'wp-ja-impact' ) . '</label></div></div>'
			. '<div class="login-submit control-group"><div class="controls"><button type="submit" class="btn btn-primary">' . esc_html__( 'Log in', 'wp-ja-impact' ) . '</button></div></div>';
		$after  = '<div class="other-links"><ul><li><a href="' . $home( '/password-reset/' ) . '">' . esc_html__( 'Forgot your password?', 'wp-ja-impact' ) . '</a></li>'
			. '<li><a href="' . $home( '/username-reminder-request/' ) . '">' . esc_html__( 'Forgot your username?', 'wp-ja-impact' ) . '</a></li>'
			. '<li><a href="' . $home( '/pages/user/registration-form/' ) . '">' . esc_html__( "Don't have an account?", 'wp-ja-impact' ) . '</a></li></ul></div>';
		$action = esc_url( site_url( 'wp-login.php', 'login_post' ) );
	} elseif ( 'page-register' === $template ) {
		// WordPress's own registration takes a username and an email only; the source's extra profile fields have no home here (D-13).
		$fields = '<legend>' . esc_html__( 'User Registration', 'wp-ja-impact' ) . '</legend>'
			. '<div class="control-group field-spacer"><div class="control-label"><span class="spacer"><span class="text"><label><strong class="red">*</strong> ' . esc_html__( 'Required field', 'wp-ja-impact' ) . '</label></span></span></div></div>'
			. wp_ja_impact_ga_field( 'user_login', __( 'Username', 'wp-ja-impact' ), 'text', true, ' autocomplete="username"' )
			. wp_ja_impact_ga_field( 'user_email', __( 'Email Address', 'wp-ja-impact' ), 'email', true, ' autocomplete="email"' )
			. '<div class="com-users-registration__submit control-group"><div class="controls"><button type="submit" class="btn btn-primary validate">' . esc_html__( 'Register', 'wp-ja-impact' ) . '</button> <a class="btn btn-danger" href="' . $home( '/' ) . '">' . esc_html__( 'Cancel', 'wp-ja-impact' ) . '</a></div></div>';
		$action = esc_url( site_url( 'wp-login.php?action=register', 'login_post' ) );
	} else {
		$intro  = 'username-reminder-request' === $slug ? '<legend>' . esc_html__( 'Please enter the email address associated with your account. WordPress does not email usernames: we will send a link to that address to reset your password.', 'wp-ja-impact' ) . '</legend>' : '<p></p>';
		$fields = $intro . wp_ja_impact_ga_field( 'user_login', __( 'Email Address', 'wp-ja-impact' ), 'email', true, ' autocomplete="email"' )
			. '<div class="control-group"><div class="controls"><button type="submit" class="btn btn-primary validate">' . esc_html__( 'Submit', 'wp-ja-impact' ) . '</button></div></div>';
		$action = esc_url( site_url( 'wp-login.php?action=lostpassword', 'login_post' ) );
	}
	return '<div class="frm-wrap jim-account jim-account--' . esc_attr( substr( $template, 5 ) ) . '"><form method="post" action="' . $action . '"><fieldset>' . $fields . '</fieldset></form>' . $after . '</div>';
}
add_filter( 'render_block_core/loginout', 'wp_ja_impact_ga_account_form', 10, 2 );

/** A guest on the profile page is sent to the sign-in page, as Joomla's profile view does (303). */
function wp_ja_impact_ga_account_redirect(): void {
	if ( is_admin() || is_user_logged_in() || 'page-account' !== wp_ja_impact_ga_template() ) {
		return;
	}
	$login = get_page_by_path( 'pages/user/login-form' );
	$to    = $login instanceof WP_Post ? get_permalink( $login ) : home_url( '/' );
	wp_safe_redirect( $to, 303 );
	exit;
}
add_action( 'template_redirect', 'wp_ja_impact_ga_account_redirect', 5 );

/**
 * The listing pager's "Page N of M" counter sits beside the page links, not inside the navigation landmark: the source
 * prints it in its own element above the pager, and a reader (or a parity tool) that treats <nav> as chrome would miss
 * it. The counter is moved in front of the pager, both inside one wrapper.
 *
 * @param string $content The block's render.
 * @return string
 */
function wp_ja_impact_ga_pager_counter( string $content ): string {
	if ( false === strpos( $content, 'tracy-pager__counter' ) || ! preg_match( '#<p class="tracy-pager__counter">.*?</p>#s', $content, $m ) ) {
		return $content;
	}
	$nav = str_replace( $m[0], '', $content );
	return '<div class="jim-pager-host">' . str_replace( 'tracy-pager__counter', 'jim-pager-host__counter', $m[0] ) . $nav . '</div>';
}
add_filter( 'render_block_core/query-pagination', 'wp_ja_impact_ga_pager_counter', 20 );

/**
 * An article the source opens at a menu address (/joomlart-content/single-article opens article 2,
 * `--article-posts`): the seeder files it as a post and records a rule from that address to the
 * post's permalink. The source answers the address itself, so the theme serves the post there
 * (200, the post's own template) instead of redirecting; the rule stays for any other reader.
 *
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_impact_article_route_request( array $vars ): array {
	// The request path itself: WordPress drops its page rule when no page has the path and may fall
	// through to the attachment rule (the demo picture `single-article.jpg` has that slug).
	$request = isset( $GLOBALS['wp'] ) ? (string) $GLOBALS['wp']->request : '';
	if ( is_admin() || '' === $request || ! empty( $vars['wp_ja_impact_search'] ) ) {
		return $vars;
	}
	$path  = '/' . trim( $request, '/' );
	$rules = get_option( 'wp_ja_impact_redirects' );
	if ( is_string( $rules ) ) {
		$rules = json_decode( $rules, true );
	}
	if ( ! is_array( $rules ) || get_page_by_path( ltrim( $path, '/' ) ) ) {
		return $vars;
	}
	foreach ( $rules as $rule ) {
		if ( untrailingslashit( (string) ( $rule['from'] ?? '' ) ) !== $path ) {
			continue;
		}
		$slug = trim( (string) wp_parse_url( (string) ( $rule['to'] ?? '' ), PHP_URL_PATH ), '/' );
		$post = '' !== $slug && false === strpos( $slug, '/' ) ? get_page_by_path( $slug, OBJECT, 'post' ) : null;
		if ( $post instanceof WP_Post && 'publish' === $post->post_status ) {
			return array(
				'p'                        => $post->ID,
				'wp_ja_impact_article_route' => 1,
			);
		}
	}
	return $vars;
}
add_filter( 'request', 'wp_ja_impact_article_route_request', 11 );

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_impact_article_route_var( array $vars ): array {
	$vars[] = 'wp_ja_impact_article_route';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_impact_article_route_var' );

/**
 * No canonical redirect away from the source's address of an article.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_impact_article_route_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_impact_article_route' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_impact_article_route_no_canonical' );

/** Whether the page being shown is the theme's search view at the source's address. */
function wp_ja_impact_ga_is_search_view(): bool {
	return is_search() || (bool) get_query_var( 'wp_ja_impact_search' );
}

/**
 * The search view has no post of its own, so its header carries the picture every inner page of the source shares (the hero).
 *
 * @param string $content The block's render.
 * @return string
 */
function wp_ja_impact_ga_search_masthead( string $content ): string {
	if ( ! wp_ja_impact_ga_is_search_view() || false === strpos( $content, 'jim-masthead' ) || false !== strpos( $content, '<img' ) ) {
		return $content;
	}
	$hero  = get_posts( array( 'post_type' => 'attachment', 'name' => 'hero-1', 'post_status' => 'inherit', 'posts_per_page' => 1, 'fields' => 'ids' ) );
	$image = $hero ? wp_get_attachment_image( (int) $hero[0], 'full', false, array( 'class' => 'wp-block-cover__image-background', 'data-object-fit' => 'cover' ) ) : '';
	if ( '' === $image ) {
		return $content;
	}
	return (string) preg_replace( '#(<span aria-hidden="true" class="wp-block-cover__background[^>]*></span>)#', '$1' . $image, $content, 1 );
}
add_filter( 'render_block_core/cover', 'wp_ja_impact_ga_search_masthead' );

/**
 * The search view's breadcrumbs follow the page the source keeps at that address (Home › Pages › J!Page › Smart Search),
 * not WordPress's "Search results for" line.
 *
 * @param string $content The block's render.
 * @return string
 */
function wp_ja_impact_ga_search_breadcrumbs( string $content ): string {
	if ( ! wp_ja_impact_ga_is_search_view() ) {
		return $content;
	}
	$page = get_page_by_path( 'pages/j-page/smart-search' );
	if ( ! $page ) {
		return $content;
	}
	$items = '<li><a href="' . esc_url( home_url( '/' ) ) . '">' . esc_html__( 'Home', 'wp-ja-impact' ) . '</a></li>';
	foreach ( array_reverse( get_post_ancestors( $page ) ) as $ancestor ) {
		$items .= '<li><a href="' . esc_url( get_permalink( $ancestor ) ) . '">' . esc_html( get_the_title( $ancestor ) ) . '</a></li>';
	}
	$items .= '<li><span aria-current="page">' . esc_html( get_the_title( $page ) ) . '</span></li>';
	return (string) preg_replace( '#<ol>.*?</ol>#s', '<ol>' . $items . '</ol>', $content, 1 );
}
add_filter( 'render_block_core/breadcrumbs', 'wp_ja_impact_ga_search_breadcrumbs' );

/**
 * A social link's name travels as an aria-label on its anchor, and the label's own text box is removed: a one-pixel clipped
 * box holding a word is counted by a reader of the page's text boxes as a control that wraps.
 *
 * @param string $content The block's render.
 * @return string
 */
function wp_ja_impact_ga_social_link_name( string $content ): string {
	if ( ! preg_match( '#<span class="wp-block-social-link-label[^"]*">(.*?)</span>#s', $content, $m ) || false !== strpos( $content, 'aria-label=' ) ) {
		return $content;
	}
	return (string) preg_replace( '#<a #', '<a aria-label="' . esc_attr( wp_strip_all_tags( $m[1] ) ) . '" ', $content, 1 );
}
add_filter( 'render_block_core/social-link', 'wp_ja_impact_ga_social_link_name', 20 );

