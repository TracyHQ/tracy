<?php
/**
 * Plugin Name: Tracy whitelist
 * Description: The tracy.ai whitelist form. Stores requests in WordPress and delivers
 *   confirmations through Tracy's private mail relay using its existing mail transport.
 * Version: 1.1.0
 *
 * Browser -> WordPress validation and persistence -> private relay -> existing Resend transport.
 * Configure TRACY_WL_RELAY_URL and TRACY_WL_RELAY_SECRET in wp-config.php. No Resend key
 * belongs in WordPress. Legacy mail settings remain visible for compatibility with the landing's UI.
 * An hourly cron retries queued confirmations; ambiguous deliveries require manual review.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const TRACY_WL_DB_VERSION   = '1';
const TRACY_WL_OPTION       = 'tracy_whitelist_settings';
const TRACY_WL_HOURLY_LIMIT = 5;   // stored requests per IP per hour
const TRACY_WL_HOURLY_TRIES = 30;  // attempts per IP per hour, mistakes included

function tracy_wl_table() {
	global $wpdb;
	return $wpdb->prefix . 'tracy_whitelist';
}

function tracy_wl_choices() {
	return array(
		'platforms' => array(
			'wordpress' => 'WordPress',
			'joomla'    => 'Joomla',
			'emdash'    => 'EmDash',
			'other'     => 'Other',
		),
		'role'      => array(
			'own-site'     => 'I manage my own site',
			'client-sites' => 'I build and manage sites for clients',
		),
		'sites'     => array(
			'0'     => 'None yet',
			'1'     => 'Just one',
			'2-10'  => '2 to 10',
			'11-50' => '11 to 50',
			'50+'   => '50+',
		),
	);
}

function tracy_wl_settings() {
	$s = get_option( TRACY_WL_OPTION, array() );
	return wp_parse_args(
		is_array( $s ) ? $s : array(),
		array(
			'resend_key' => '',
			'from'       => 'Tracy <noreply@tracy.ai>',
			'reply_to'   => '',
			'daily_cap'  => 80,
		)
	);
}

/* ---------- Table ---------- */

add_action( 'init', 'tracy_wl_install' );
function tracy_wl_install() {
	if ( get_option( 'tracy_whitelist_db' ) === TRACY_WL_DB_VERSION ) {
		return;
	}
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$table   = tracy_wl_table();
	$charset = $wpdb->get_charset_collate();
	dbDelta(
		"CREATE TABLE {$table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			email varchar(190) NOT NULL,
			name varchar(120) NOT NULL,
			website varchar(255) NOT NULL DEFAULT '',
			platforms varchar(64) NOT NULL,
			role varchar(32) NOT NULL,
			sites varchar(16) NOT NULL,
			utm_source varchar(100) NOT NULL DEFAULT '',
			utm_medium varchar(100) NOT NULL DEFAULT '',
			utm_campaign varchar(100) NOT NULL DEFAULT '',
			utm_content varchar(100) NOT NULL DEFAULT '',
			ip_hash char(64) NOT NULL DEFAULT '',
			submit_count int(10) unsigned NOT NULL DEFAULT 1,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			confirm_status varchar(16) NOT NULL DEFAULT 'queued',
			confirm_attempts tinyint(3) unsigned NOT NULL DEFAULT 0,
			confirm_sent_at datetime NULL,
			confirm_id varchar(100) NOT NULL DEFAULT '',
			confirm_error varchar(255) NOT NULL DEFAULT '',
			PRIMARY KEY  (id),
			UNIQUE KEY email (email),
			KEY confirm_status (confirm_status)
		) {$charset};"
	);
	update_option( 'tracy_whitelist_db', TRACY_WL_DB_VERSION, false );
}

/* ---------- Form endpoint ---------- */

add_action( 'rest_api_init', function () {
	register_rest_route(
		'tracy/v1',
		'/whitelist',
		array(
			'methods'             => 'POST',
			'callback'            => 'tracy_wl_submit',
			'permission_callback' => '__return_true',
		)
	);
} );

function tracy_wl_fail( $message, $status = 400 ) {
	return new WP_REST_Response( array( 'ok' => false, 'message' => $message ), $status );
}

function tracy_wl_log_bot( $email ) {
	$log   = get_option( 'tracy_whitelist_bot_log', array() );
	$log   = is_array( $log ) ? $log : array();
	$log[] = array( 't' => current_time( 'mysql', true ), 'email' => substr( sanitize_text_field( $email ), 0, 190 ) );
	update_option( 'tracy_whitelist_bot_log', array_slice( $log, -50 ), false );
}

function tracy_wl_client_ip() {
	foreach ( array( 'HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR' ) as $key ) {
		if ( ! empty( $_SERVER[ $key ] ) ) {
			$ip = trim( explode( ',', wp_unslash( $_SERVER[ $key ] ) )[0] );
			if ( filter_var( $ip, FILTER_VALIDATE_IP ) ) {
				return $ip;
			}
		}
	}
	return '';
}

function tracy_wl_normalize_website( $raw ) {
	$v = trim( (string) $raw );
	if ( '' === $v ) {
		return '';
	}
	if ( preg_match( '/\s/', $v ) ) {
		return null;
	}
	if ( ! preg_match( '#^https?://#i', $v ) ) {
		$v = 'https://' . $v;
	}
	$host = wp_parse_url( $v, PHP_URL_HOST );
	if ( ! $host || false === strpos( $host, '.' ) || strlen( $v ) > 255 ) {
		return null;
	}
	return esc_url_raw( $v, array( 'http', 'https' ) );
}

function tracy_wl_submit( WP_REST_Request $request ) {
	$p = $request->get_json_params();
	if ( ! is_array( $p ) ) {
		return tracy_wl_fail( 'Something went wrong. Please try again in a minute.' );
	}

	// Honeypot: a bot filled the hidden field. Answer like a success, store nothing, but keep a
	// short log so a person wrongly caught here can be found. The field used to be named
	// "company", which browser autofill fills in for real people; the old key is ignored now.
	if ( '' !== trim( (string) ( $p['hp'] ?? '' ) ) ) {
		tracy_wl_log_bot( (string) ( $p['email'] ?? '' ) );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	$ip_hash   = hash_hmac( 'sha256', tracy_wl_client_ip(), wp_salt( 'auth' ) );
	$try_key   = 'tracy_wl_try_' . substr( $ip_hash, 0, 32 );
	$store_key = 'tracy_wl_rl_' . substr( $ip_hash, 0, 32 );
	$tries     = (int) get_transient( $try_key );
	if ( $tries >= TRACY_WL_HOURLY_TRIES || (int) get_transient( $store_key ) >= TRACY_WL_HOURLY_LIMIT ) {
		return tracy_wl_fail( 'Too many requests from your connection. Please try again in an hour.', 429 );
	}
	set_transient( $try_key, $tries + 1, HOUR_IN_SECONDS );

	$choices = tracy_wl_choices();
	$email   = strtolower( trim( (string) ( $p['email'] ?? '' ) ) );
	$name    = trim( wp_strip_all_tags( (string) ( $p['name'] ?? '' ) ) );
	$website = tracy_wl_normalize_website( $p['website'] ?? '' );
	$plat    = is_array( $p['platforms'] ?? null ) ? array_values( array_unique( array_map( 'strval', $p['platforms'] ) ) ) : array();
	$role    = (string) ( $p['role'] ?? '' );
	$sites   = (string) ( $p['sites'] ?? '' );

	if ( ! is_email( $email ) || strlen( $email ) > 190 ) {
		return tracy_wl_fail( 'Enter your email address.' );
	}
	if ( '' === $name || mb_strlen( $name ) > 120 ) {
		return tracy_wl_fail( 'Enter your name.' );
	}
	if ( null === $website ) {
		return tracy_wl_fail( 'Enter a full web address, like https://example.com' );
	}
	if ( ! $plat || array_diff( $plat, array_keys( $choices['platforms'] ) ) ) {
		return tracy_wl_fail( 'Pick at least one platform.' );
	}
	if ( ! isset( $choices['role'][ $role ] ) ) {
		return tracy_wl_fail( 'Pick the option that sounds like you.' );
	}
	if ( ! isset( $choices['sites'][ $sites ] ) ) {
		return tracy_wl_fail( 'Pick how many sites you manage.' );
	}

	$utm = array();
	foreach ( array( 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content' ) as $k ) {
		$utm[ $k ] = substr( sanitize_text_field( (string) ( $p[ $k ] ?? '' ) ), 0, 100 );
	}

	set_transient( $store_key, (int) get_transient( $store_key ) + 1, HOUR_IN_SECONDS );

	global $wpdb;
	$table = tracy_wl_table();
	$now   = current_time( 'mysql', true );
	$row   = array(
		'name'      => $name,
		'website'   => $website,
		'platforms' => implode( ',', $plat ),
		'role'      => $role,
		'sites'     => $sites,
		'ip_hash'    => $ip_hash,
		'updated_at' => $now,
	) + $utm;

	$existing = $wpdb->get_row( $wpdb->prepare( "SELECT id FROM {$table} WHERE email = %s", $email ) );
	if ( $existing ) {
		if ( false === $wpdb->update( $table, $row, array( 'id' => $existing->id ) ) ) {
			return tracy_wl_fail( 'Something went wrong. Please try again in a minute.', 500 );
		}
		$wpdb->query( $wpdb->prepare( "UPDATE {$table} SET submit_count = submit_count + 1 WHERE id = %d", $existing->id ) );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	$inserted = $wpdb->insert(
		$table,
		$row + array(
			'email'          => $email,
			'created_at'     => $now,
			'confirm_status' => 'queued',
		)
	);
	if ( ! $inserted ) {
		// A second request for the same email can race past the SELECT; the unique key stops it.
		if ( $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE email = %s", $email ) ) ) {
			return new WP_REST_Response( array( 'ok' => true ), 200 );
		}
		return tracy_wl_fail( 'Something went wrong. Please try again in a minute.', 500 );
	}

	tracy_wl_send_confirmation( (int) $wpdb->insert_id );
	return new WP_REST_Response( array( 'ok' => true ), 200 );
}

/* ---------- Confirmation email ---------- */

function tracy_wl_sent_today() {
	global $wpdb;
	$table = tracy_wl_table();
	$start = gmdate( 'Y-m-d 00:00:00' );
	return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE confirm_status = 'sent' AND confirm_sent_at >= %s", $start ) );
}

function tracy_wl_send_confirmation( $id ) {
 global $wpdb;
 $table = tracy_wl_table();
 $r = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ) );
 if ( ! $r || 'sent' === $r->confirm_status ) { return; }
 if ( ! defined( 'TRACY_WL_RELAY_URL' ) || ! defined( 'TRACY_WL_RELAY_SECRET' ) || strlen( TRACY_WL_RELAY_SECRET ) < 32 || 'https' !== wp_parse_url( TRACY_WL_RELAY_URL, PHP_URL_SCHEME ) ) {
  $wpdb->update( $table, array( 'confirm_status' => 'queued', 'confirm_error' => 'Confirmation relay not configured' ), array( 'id' => $id ) );
  return;
 }
 $settings = tracy_wl_settings();
 if ( (int) $settings['daily_cap'] > 0 && tracy_wl_sent_today() >= (int) $settings['daily_cap'] ) { return; }
 $reply_to = is_email( $settings['reply_to'] ) ? $settings['reply_to'] : '';
 $platform_map = array( 'wordpress' => 'WordPress', 'joomla' => 'Joomla', 'emdash' => 'EmDash', 'other' => 'Other' );
 $platforms = array();
 foreach ( explode( ',', $r->platforms ) as $p ) { if ( isset( $platform_map[$p] ) ) { $platforms[] = $platform_map[$p]; } }
 $mail = tracy_wl_render_email( $r, '' !== $reply_to );
 $response = wp_remote_post( TRACY_WL_RELAY_URL, array(
  'timeout' => 15,
  'redirection' => 0,
  'headers' => array( 'Authorization' => 'Bearer ' . TRACY_WL_RELAY_SECRET, 'Content-Type' => 'application/json' ),
  'body' => wp_json_encode( array(
   'email' => $r->email, 'name' => $r->name, 'website' => $r->website, 'platforms' => $platforms,
   'role' => 'client-sites' === $r->role ? 'clients' : 'own',
   'site_count' => '0' === $r->sites ? 'none' : ( '1' === $r->sites ? 'one' : $r->sites ),
   'confirmation' => $mail, 'replyTo' => $reply_to,
  ) ),
 ) );
 $code = is_wp_error( $response ) ? 0 : wp_remote_retrieve_response_code( $response );
 $result = is_wp_error( $response ) ? array() : json_decode( wp_remote_retrieve_body( $response ), true );
 if ( 200 === $code && 'sent' === ( $result['status'] ?? '' ) && ! empty( $result['id'] ) ) {
  $wpdb->update( $table, array( 'confirm_status' => 'sent', 'confirm_id' => substr( (string) $result['id'], 0, 100 ), 'confirm_sent_at' => current_time( 'mysql', true ), 'confirm_error' => '' ), array( 'id' => $id ) );
 } else {
  $review = 409 === $code && 'review' === ( $result['status'] ?? '' );
  $wpdb->update( $table, array( 'confirm_status' => $review ? 'failed' : 'queued', 'confirm_error' => $review ? 'Provider acknowledgement requires manual review; do not resend' : 'Relay pending or unavailable' ), array( 'id' => $id, 'confirm_status' => $r->confirm_status ) );
 }
 $wpdb->query( $wpdb->prepare( "UPDATE {$table} SET confirm_attempts = LEAST(confirm_attempts + 1, 255) WHERE id = %d", $id ) );
}

function tracy_wl_labels( $csv, $map ) {
	$out = array();
	foreach ( array_filter( explode( ',', (string) $csv ), 'strlen' ) as $v ) {
		$out[] = $map[ $v ] ?? $v;
	}
	return implode( ', ', $out );
}

function tracy_wl_render_email( $r, $has_reply_to ) {
	$c         = tracy_wl_choices();
	$name      = $r->name;
	$email     = $r->email;
	$platforms = tracy_wl_labels( $r->platforms, $c['platforms'] );
	$sites     = $c['sites'][ $r->sites ] ?? $r->sites;
	$website   = $r->website ? preg_replace( '#^https?://#', '', rtrim( $r->website, '/' ) ) : '';
	$optout    = $has_reply_to ? "Didn't ask to join? Reply to this email and we'll take you off the list." : "Didn't ask to join? You can ignore this email.";
	$utm       = '?utm_source=whitelist-confirm&amp;utm_medium=email';

	$e = 'esc_html';
	$font = "Inter,Arial,Helvetica,sans-serif";
	$website_row = '' !== $website ? '<br>Main website: <strong>' . $e( $website ) . '</strong>' : '';

	$html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>You&#39;re on the Tracy whitelist</title>'
		. '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&amp;family=Inter:wght@400;600&amp;display=swap" rel="stylesheet">'
		. '<style>body{margin:0;padding:0;background:#faf7f4;-webkit-text-size-adjust:100%}a{color:#a3462a}@media (max-width:600px){.px{padding-left:24px!important;padding-right:24px!important}.h1{font-size:30px!important}}</style></head>'
		. '<body style="margin:0;padding:0;background:#faf7f4;">'
		. '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#faf7f4;">We&#39;ll email you with next steps.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>'
		. '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#faf7f4;"><tr><td align="center" style="padding:32px 12px;">'
		. '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">'
		. '<tr><td background="https://tracy.ai/assets/bg.jpg" bgcolor="#f3dccd" class="px" style="background:#f3dccd url(\'https://tracy.ai/assets/bg.jpg\') center/cover no-repeat;border-radius:16px 16px 0 0;padding:28px 40px 26px;">'
		. '<a href="https://tracy.ai/' . $utm . '" style="text-decoration:none;"><img src="https://tracy.ai/assets/logo.png" width="120" alt="Tracy" style="display:block;border:0;width:120px;height:auto;"></a></td></tr>'
		. '<tr><td bgcolor="#fffdfb" class="px" style="background:#fffdfb;border:1px solid rgba(0,0,0,0.08);border-top:0;border-radius:0 0 16px 16px;padding:36px 40px 34px;">'
		. '<p style="margin:0 0 14px;font-family:' . $font . ';font-size:13px;line-height:1;font-weight:600;color:#a3462a;letter-spacing:0.02em;"><span style="display:inline-block;background:rgba(187,89,60,0.12);border-radius:999px;padding:7px 12px;">&#9679;&nbsp; Whitelist</span></p>'
		. '<h1 class="h1" style="margin:0 0 18px;font-family:Fraunces,Georgia,\'Times New Roman\',serif;font-size:34px;line-height:1.15;font-weight:600;color:#1a1715;letter-spacing:-0.01em;">You&#39;re on the list</h1>'
		. '<p style="margin:0 0 16px;font-family:' . $font . ';font-size:16px;line-height:1.6;color:#2b2522;">Hi ' . $e( $name ) . ',</p>'
		. '<p style="margin:0 0 16px;font-family:' . $font . ';font-size:16px;line-height:1.6;color:#2b2522;">Thanks for joining the Tracy whitelist. We&#39;ll email you at <strong style="color:#1a1715;">' . $e( $email ) . '</strong> with next steps.</p>'
		. '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 26px;background:#faf7f4;border:1px solid rgba(0,0,0,0.08);border-radius:12px;">'
		. '<tr><td style="padding:16px 18px 6px;font-family:' . $font . ';font-size:12.5px;font-weight:600;color:#6b625d;letter-spacing:0.04em;text-transform:uppercase;">What you told us</td></tr>'
		. '<tr><td style="padding:4px 18px 16px;font-family:' . $font . ';font-size:15px;line-height:1.7;color:#2b2522;">Platforms: <strong>' . $e( $platforms ) . '</strong><br>Sites you manage: <strong>' . $e( $sites ) . '</strong>' . $website_row . '</td></tr></table>'
		. '<p style="margin:0 0 22px;font-family:' . $font . ';font-size:16px;line-height:1.6;color:#2b2522;">While you wait, see how Tracy works.</p>'
		. '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#bb593c" style="border-radius:8px;"><a href="https://tracy.ai/how-it-works/' . $utm . '" style="display:inline-block;padding:13px 22px;font-family:' . $font . ';font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">See how Tracy works</a></td></tr></table>'
		. '<p style="margin:28px 0 0;padding:14px 16px;background:rgba(187,89,60,0.08);border-radius:10px;font-family:' . $font . ';font-size:14px;line-height:1.55;color:#5c534e;"><strong style="color:#1a1715;">Already a JoomlArt member?</strong> Sign in at <a href="https://cowork.tracy.ai" style="color:#a3462a;">cowork.tracy.ai</a> with the email you use on joomlart.com.</p>'
		. '<p style="margin:28px 0 0;font-family:' . $font . ';font-size:16px;line-height:1.6;color:#2b2522;">The Tracy team</p>'
		. '</td></tr>'
		. '<tr><td class="px" style="padding:24px 40px 0;font-family:' . $font . ';font-size:12.5px;line-height:1.6;color:#8a817c;">'
		. '<p style="margin:0 0 6px;"><strong style="color:#5c534e;font-weight:600;">Tracy</strong> &middot; Claude Design, but for CMS. &middot; <a href="https://tracy.ai/' . $utm . '" style="color:#8a817c;">tracy.ai</a></p>'
		. '<p style="margin:0 0 6px;">You&#39;re receiving this because ' . $e( $email ) . ' joined the Tracy whitelist at tracy.ai. ' . $e( $optout ) . '</p>'
		. '<p style="margin:0;">Tracy is not affiliated with Anthropic. Claude is a trademark of Anthropic.</p>'
		. '</td></tr></table></td></tr></table></body></html>';

	$text = "Hi {$name},\n\n"
		. "Thanks for joining the Tracy whitelist. We'll email you at {$email} with next steps.\n\n"
		. "What you told us\n"
		. "Platforms: {$platforms}\n"
		. "Sites you manage: {$sites}\n"
		. ( '' !== $website ? "Main website: {$website}\n" : '' )
		. "\nWhile you wait, see how Tracy works: https://tracy.ai/how-it-works/\n\n"
		. "Already a JoomlArt member? Sign in at https://cowork.tracy.ai with the email you use on joomlart.com.\n\n"
		. "The Tracy team\n\n"
		. "Tracy. Claude Design, but for CMS. https://tracy.ai\n"
		. "You're receiving this because {$email} joined the Tracy whitelist at tracy.ai. {$optout}\n"
		. "Tracy is not affiliated with Anthropic. Claude is a trademark of Anthropic.\n";

	return array( 'html' => $html, 'text' => $text );
}

/* ---------- Hourly retry of queued confirmations ---------- */

add_action( 'init', function () {
	if ( ! wp_next_scheduled( 'tracy_wl_retry' ) ) {
		wp_schedule_event( time() + 300, 'hourly', 'tracy_wl_retry' );
	}
} );

add_action( 'tracy_wl_retry', 'tracy_wl_send_queued' );
function tracy_wl_send_queued( $limit = 50 ) {
	if ( ! defined( 'TRACY_WL_RELAY_URL' ) || ! defined( 'TRACY_WL_RELAY_SECRET' ) || strlen( TRACY_WL_RELAY_SECRET ) < 32 || 'https' !== wp_parse_url( TRACY_WL_RELAY_URL, PHP_URL_SCHEME ) ) {
		return 0;
	}
	global $wpdb;
	$table = tracy_wl_table();
	$ids   = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$table} WHERE confirm_status = 'queued' ORDER BY id ASC LIMIT %d", $limit ) );
	foreach ( $ids as $id ) {
		tracy_wl_send_confirmation( (int) $id );
	}
	return count( $ids );
}

/* ---------- Form markup and assets ---------- */

add_shortcode( 'tracy_whitelist_form', function () {
	return <<<'HTML'
<section class="wl-section wrap">
  <div class="wl-card panel" id="wl-card">
    <form class="wl-form" id="wl-form" novalidate data-endpoint="/wp-json/tracy/v1/whitelist">
      <label class="wl-field">
        <span class="wl-label">Email</span>
        <input class="wl-input" type="email" name="email" autocomplete="email" required>
      </label>
      <label class="wl-field">
        <span class="wl-label">Name</span>
        <input class="wl-input" type="text" name="name" autocomplete="name" maxlength="120" required>
      </label>
      <label class="wl-field">
        <span class="wl-label">Main website <span class="wl-hint">(optional)</span></span>
        <input class="wl-input" type="text" name="website" placeholder="example.com" autocomplete="url" maxlength="200">
      </label>
      <fieldset class="wl-field">
        <legend class="wl-label">Which platforms do you use? <span class="wl-hint">Pick all that apply</span></legend>
        <div class="wl-chips" data-name="platforms" data-multi="1">
          <button type="button" class="wl-chip" data-value="wordpress" aria-pressed="false">WordPress</button>
          <button type="button" class="wl-chip" data-value="joomla" aria-pressed="false">Joomla</button>
          <button type="button" class="wl-chip" data-value="emdash" aria-pressed="false">EmDash</button>
          <button type="button" class="wl-chip" data-value="other" aria-pressed="false">Other</button>
        </div>
      </fieldset>
      <fieldset class="wl-field">
        <legend class="wl-label">Which sounds like you?</legend>
        <div class="wl-chips" data-name="role">
          <button type="button" class="wl-chip" data-value="own-site" aria-pressed="false">I manage my own site</button>
          <button type="button" class="wl-chip" data-value="client-sites" aria-pressed="false">I build and manage sites for clients</button>
        </div>
      </fieldset>
      <fieldset class="wl-field">
        <legend class="wl-label">How many sites do you manage?</legend>
        <div class="wl-chips" data-name="sites">
          <button type="button" class="wl-chip" data-value="0" aria-pressed="false">None yet</button>
          <button type="button" class="wl-chip" data-value="1" aria-pressed="false">Just one</button>
          <button type="button" class="wl-chip" data-value="2-10" aria-pressed="false">2 to 10</button>
          <button type="button" class="wl-chip" data-value="11-50" aria-pressed="false">11 to 50</button>
          <button type="button" class="wl-chip" data-value="50+" aria-pressed="false">50+</button>
        </div>
      </fieldset>
      <div class="wl-trap" aria-hidden="true"><label>Leave this field empty <input type="text" name="tw_hp_confirm" value="" tabindex="-1" autocomplete="off" data-lpignore="true" data-1p-ignore></label></div>
      <p class="wl-error" id="wl-error" role="alert" hidden></p>
      <button class="btn btn-primary wl-submit" type="submit">Join the whitelist</button>
      <p class="wl-note"><strong>Already a JoomlArt member?</strong> Sign in at <a href="https://cowork.tracy.ai">cowork.tracy.ai</a> with the email you use on joomlart.com.</p>
    </form>
    <div class="wl-done" id="wl-done" hidden>
      <h2>You're on the list</h2>
      <p>We'll email you at <strong id="wl-done-email"></strong> with next steps.</p>
    </div>
  </div>
</section>
HTML;
} );

add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_page( 'whitelist' ) ) {
		return;
	}
	$base = content_url( 'mu-plugins/tracy-whitelist/' );
	wp_enqueue_style( 'tracy-whitelist', $base . 'whitelist.css', array(), '1.0.3' );
	wp_enqueue_script( 'tracy-whitelist', $base . 'whitelist.js', array(), '1.0.3', true );
} );

/* ---------- Page: noindex ---------- */

add_filter( 'wp_robots', function ( $robots ) {
	if ( is_page( 'whitelist' ) ) {
		$robots['noindex']  = true;
		$robots['nofollow'] = false;
		$robots['follow']   = true;
	}
	return $robots;
} );

/* ---------- Admin: Tools > Whitelist ---------- */

add_action( 'admin_menu', function () {
	add_management_page( 'Whitelist', 'Whitelist', 'manage_options', 'tracy-whitelist', 'tracy_wl_admin_page' );
} );

add_action( 'admin_post_tracy_wl_settings', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed' );
	}
	check_admin_referer( 'tracy_wl_settings' );
	$s       = tracy_wl_settings();
	$key     = trim( (string) wp_unslash( $_POST['resend_key'] ?? '' ) );
	$new_key = '' !== $key && $key !== $s['resend_key'];
	if ( '' !== $key ) {
		$s['resend_key'] = $key;
	}
	if ( ! empty( $_POST['clear_key'] ) ) {
		$s['resend_key'] = '';
	}
	$s['from']      = sanitize_text_field( wp_unslash( $_POST['from'] ?? $s['from'] ) );
	$reply          = sanitize_email( wp_unslash( $_POST['reply_to'] ?? '' ) );
	$s['reply_to']  = is_email( $reply ) ? $reply : '';
	$s['daily_cap'] = max( 0, (int) ( $_POST['daily_cap'] ?? $s['daily_cap'] ) );
	update_option( TRACY_WL_OPTION, $s, false );
	// A new key sends the waiting confirmations straight away; the hourly cron takes the rest.
	$sent = ( $new_key && '' !== $s['resend_key'] ) ? tracy_wl_send_queued( 20 ) : 0;
	wp_safe_redirect( admin_url( 'tools.php?page=tracy-whitelist&saved=1' . ( $sent ? '&sent=' . (int) $sent : '' ) ) );
	exit;
} );

add_action( 'admin_post_tracy_wl_send_queued', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed' );
	}
	check_admin_referer( 'tracy_wl_send_queued' );
	$n = tracy_wl_send_queued( 20 );
	wp_safe_redirect( admin_url( 'tools.php?page=tracy-whitelist&sent=' . (int) $n ) );
	exit;
} );

add_action( 'admin_post_tracy_wl_delete', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed' );
	}
	$id = (int) ( $_GET['id'] ?? 0 );
	check_admin_referer( 'tracy_wl_delete_' . $id );
	global $wpdb;
	$wpdb->delete( tracy_wl_table(), array( 'id' => $id ) );
	wp_safe_redirect( admin_url( 'tools.php?page=tracy-whitelist&deleted=1' ) );
	exit;
} );

add_action( 'admin_post_tracy_wl_csv', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed' );
	}
	check_admin_referer( 'tracy_wl_csv' );
	global $wpdb;
	$rows = $wpdb->get_results( 'SELECT email,name,website,platforms,role,sites,utm_source,utm_medium,utm_campaign,utm_content,submit_count,created_at,updated_at,confirm_status,confirm_sent_at FROM ' . tracy_wl_table() . ' ORDER BY id ASC', ARRAY_A );
	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename=tracy-whitelist-' . gmdate( 'Y-m-d' ) . '.csv' );
	$out = fopen( 'php://output', 'w' );
	fputcsv( $out, array( 'email', 'name', 'website', 'platforms', 'role', 'sites', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'submit_count', 'created_at_utc', 'updated_at_utc', 'confirm_status', 'confirm_sent_at_utc' ) );
	foreach ( $rows as $row ) {
		// Cells starting with = + - @ would run as formulas in a spreadsheet.
		$row = array_map( function ( $v ) {
			$v = (string) $v;
			return preg_match( '/^[=+\-@]/', $v ) ? "'" . $v : $v;
		}, $row );
		fputcsv( $out, $row );
	}
	fclose( $out );
	exit;
} );

function tracy_wl_admin_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	global $wpdb;
	$table  = tracy_wl_table();
	$s      = tracy_wl_settings();
	$total  = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	$counts = $wpdb->get_results( "SELECT confirm_status, COUNT(*) n FROM {$table} GROUP BY confirm_status", OBJECT_K );
	$rows   = $wpdb->get_results( "SELECT * FROM {$table} ORDER BY id DESC LIMIT 200" );
	$c      = tracy_wl_choices();
	$post   = esc_url( admin_url( 'admin-post.php' ) );

	echo '<div class="wrap"><h1>Whitelist</h1>';
	if ( isset( $_GET['saved'] ) ) {
		echo '<div class="notice notice-success"><p>Settings saved.</p></div>';
	}
	if ( isset( $_GET['sent'] ) ) {
		echo '<div class="notice notice-info"><p>Tried ' . (int) $_GET['sent'] . ' queued confirmations.</p></div>';
	}
	if ( isset( $_GET['deleted'] ) ) {
		echo '<div class="notice notice-success"><p>Row deleted.</p></div>';
	}

	echo '<p><strong>' . $total . '</strong> people. Confirmation email: ';
	$parts = array();
	foreach ( array( 'sent', 'queued', 'failed' ) as $st ) {
		$parts[] = esc_html( $st ) . ' ' . (int) ( $counts[ $st ]->n ?? 0 );
	}
	echo esc_html( implode( ', ', $parts ) ) . '. Sent today: ' . tracy_wl_sent_today() . '.</p>';

	echo '<p><a class="button button-primary" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=tracy_wl_csv' ), 'tracy_wl_csv' ) ) . '">Download CSV</a> ';
	echo '<a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=tracy_wl_send_queued' ), 'tracy_wl_send_queued' ) ) . '">Send queued confirmations now</a></p>';

	echo '<h2>Confirmation email (Resend)</h2><form method="post" action="' . $post . '">';
	wp_nonce_field( 'tracy_wl_settings' );
	echo '<input type="hidden" name="action" value="tracy_wl_settings"><table class="form-table" role="presentation">';
	echo '<tr><th>Resend API key</th><td><input type="password" name="resend_key" class="regular-text" autocomplete="off" placeholder="' . ( $s['resend_key'] ? 'Set (leave empty to keep)' : 'Not set' ) . '"> ';
	if ( $s['resend_key'] ) {
		echo '<label><input type="checkbox" name="clear_key" value="1"> Remove key</label>';
	}
	echo '<p class="description">A Sending access key limited to tracy.ai. Without a key, requests are stored and their confirmations wait in the queue. Saving a new key sends the waiting confirmations right away (20 at once, the rest every hour); after that each new request gets its email as soon as it is sent.</p></td></tr>';
	echo '<tr><th>From</th><td><input type="text" name="from" class="regular-text" value="' . esc_attr( $s['from'] ) . '"></td></tr>';
	echo '<tr><th>Reply-To</th><td><input type="email" name="reply_to" class="regular-text" value="' . esc_attr( $s['reply_to'] ) . '"><p class="description">Optional. When empty, the email says "You can ignore this email" instead of "Reply to this email".</p></td></tr>';
	echo '<tr><th>Daily cap</th><td><input type="number" min="0" name="daily_cap" value="' . (int) $s['daily_cap'] . '"><p class="description">Confirmations sent per UTC day; the rest wait for the hourly retry. 0 = no cap.</p></td></tr>';
	echo '</table>';
	submit_button( 'Save settings' );
	echo '</form>';

	$bots = get_option( 'tracy_whitelist_bot_log', array() );
	echo '<h2>Dropped as bots (last 50)</h2>';
	if ( empty( $bots ) ) {
		echo '<p>None.</p>';
	} else {
		echo '<p class="description">Requests that filled the hidden anti-bot field. Nothing was stored for them. A real person here can simply submit again.</p><table class="widefat striped" style="max-width:640px"><thead><tr><th>Time (UTC)</th><th>Email sent</th></tr></thead><tbody>';
		foreach ( array_reverse( $bots ) as $b ) {
			echo '<tr><td>' . esc_html( $b['t'] ?? '' ) . '</td><td>' . esc_html( $b['email'] ?? '' ) . '</td></tr>';
		}
		echo '</tbody></table>';
	}

	echo '<h2>Latest 200</h2><table class="widefat striped"><thead><tr><th>Email</th><th>Name</th><th>Website</th><th>Platforms</th><th>Role</th><th>Sites</th><th>Source</th><th>Joined (UTC)</th><th>Email</th><th></th></tr></thead><tbody>';
	foreach ( $rows as $r ) {
		$del = wp_nonce_url( admin_url( 'admin-post.php?action=tracy_wl_delete&id=' . (int) $r->id ), 'tracy_wl_delete_' . (int) $r->id );
		echo '<tr><td>' . esc_html( $r->email ) . '</td><td>' . esc_html( $r->name ) . '</td><td>' . esc_html( $r->website ) . '</td><td>'
			. esc_html( tracy_wl_labels( $r->platforms, $c['platforms'] ) ) . '</td><td>' . esc_html( $c['role'][ $r->role ] ?? $r->role ) . '</td><td>'
			. esc_html( $c['sites'][ $r->sites ] ?? $r->sites ) . '</td><td>' . esc_html( trim( $r->utm_source . ' ' . $r->utm_content ) ) . '</td><td>'
			. esc_html( $r->created_at ) . '</td><td title="' . esc_attr( $r->confirm_error ) . '">' . esc_html( $r->confirm_status ) . '</td><td><a href="' . esc_url( $del ) . '" onclick="return confirm(\'Delete this row?\')">Delete</a></td></tr>';
	}
	echo '</tbody></table></div>';
}
